import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import FilterChips from "@/components/FilterChips";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import StatsStrip from "@/components/StatsStrip";

// Charges & appels de fonds are a copropriétaire (owner) financial matter — tenants
// are not co-owners and must not reach this screen even via deep link.
export default function ChargesScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "member"]}>
      <ChargesScreenInner />
    </RoleGuard>
  );
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: keyof typeof Feather.glyphMap }> = {
  pending:            { color: "#f59e0b", label: "À payer",            icon: "clock" },
  pending_validation: { color: "#3b82f6", label: "En validation",      icon: "loader" },
  paid:               { color: "#10b981", label: "Payé",               icon: "check-circle" },
  overdue:            { color: "#ef4444", label: "En retard",          icon: "alert-circle" },
  rejected:           { color: "#ef4444", label: "Rejeté",             icon: "x-circle" },
  partial:            { color: "#f97316", label: "Partiel",            icon: "minus-circle" },
};

const TYPE_LABELS: Record<string, string> = {
  charges_courantes: "Charges courantes",
  fonds_reserve:     "Fonds de réserve",
  appel_special:     "Appel spécial",
};

const PAYMENT_METHODS = [
  { key: "virement", label: "Virement bancaire", icon: "send" as const },
  { key: "cheque",   label: "Chèque",            icon: "file-text" as const },
  { key: "especes",  label: "Espèces",            icon: "dollar-sign" as const },
  { key: "online",   label: "Paiement en ligne",  icon: "credit-card" as const },
];

type Appel = {
  id: string;
  lotId: string;
  ownerId?: string;
  period: string;
  type: string;
  amount: number;
  dueDate?: string;
  status: string;
  paidDate?: string;
  paymentMethod?: string;
  receiptNumber?: string;
  rejectionReason?: string;
  proofUrl?: string;
  buildingId: string;
};

function ChargesScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();

  const [appels, setAppels] = useState<Appel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [payModal, setPayModal] = useState<Appel | null>(null);
  const [payMethod, setPayMethod] = useState("virement");
  const [payNote, setPayNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [payProofUri, setPayProofUri] = useState("");
  const [rejectModal, setRejectModal] = useState<Appel | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";
  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const data = await apiRequest(`/appels-de-fonds${qs}`, "GET", undefined, token);
      setAppels((data.data ?? []).map((a: any) => ({ ...a, amount: Number(a.amount) || 0 })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const [uploadingProof, setUploadingProof] = useState(false);

  /**
   * Upload a local image URI to the API server via multipart POST.
   * Uses the /storage/uploads endpoint which works in dev (local filesystem)
   * and prod (GCS). Never stores a local file:// URI in the database.
   */
  const uploadProofImage = async (uri: string): Promise<string | undefined> => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const baseUrl = domain
      ? `https://${domain}/api`
      : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`;
    try {
      const fileRes = await fetch(uri);
      if (!fileRes.ok) return undefined;
      const blob = await fileRes.blob();
      const tail = uri.split("?")[0].split(".").pop()?.toLowerCase();
      const ext = tail === "png" ? "png" : "jpg";
      const ct = ext === "png" ? "image/png" : "image/jpeg";
      const form = new FormData();
      form.append("file", blob, `proof-${Date.now()}.${ext}`);
      const uploadRes = await fetch(`${baseUrl}/storage/uploads`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!uploadRes.ok) return undefined;
      const { objectPath } = await uploadRes.json();
      return objectPath as string;
    } catch { return undefined; }
  };

  const pickProofImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (!cam.granted) return;
        const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
        if (!result.canceled && result.assets[0]) {
          setPayProofUri(result.assets[0].uri);
          Haptics.selectionAsync();
        }
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setPayProofUri(result.assets[0].uri);
        Haptics.selectionAsync();
      }
    } catch { /* silently ignore */ }
  };

  const downloadReceipt = async (appel: Appel) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain
        ? `https://${domain}/api`
        : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`;
      const receiptUrl = `${baseUrl}/appels-de-fonds/${appel.id}/receipt?token=${token}`;
      const { Linking } = await import("react-native");
      await Linking.openURL(receiptUrl);
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible d'ouvrir le reçu" });
    }
  };

  const handlePay = async () => {
    if (!payModal) return;
    try {
      setSubmitting(true);
      let proofUrl: string | undefined;
      if (payProofUri) {
        setUploadingProof(true);
        proofUrl = await uploadProofImage(payProofUri);
        setUploadingProof(false);
        if (!proofUrl) {
          showToast({ type: "error", title: "Erreur d'upload", message: "Le téléchargement du justificatif a échoué. Vérifiez votre connexion et réessayez." });
          setSubmitting(false);
          return;
        }
      }
      await apiRequest(`/appels-de-fonds/${payModal.id}/pay`, "PUT", {
        paymentMethod: payMethod,
        notes: payNote || undefined,
        proofUrl: proofUrl || undefined,
      }, token);
      setPayModal(null);
      setPayNote("");
      setPayProofUri("");
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de soumettre le paiement");
    } finally { setSubmitting(false); }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiRequest(`/appels-de-fonds/${id}/validate`, "PUT", { approve: true }, token);
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de valider");
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) {
      Alert.alert("Erreur", "Le motif de rejet est obligatoire"); return;
    }
    try {
      setSubmitting(true);
      await apiRequest(`/appels-de-fonds/${rejectModal.id}/validate`, "PUT", {
        approve: false,
        rejectionReason: rejectReason,
      }, token);
      setRejectModal(null);
      setRejectReason("");
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de rejeter");
    } finally { setSubmitting(false); }
  };

  const total = appels.reduce((s, a) => s + a.amount, 0);
  const collected = appels.filter((a) => a.status === "paid").reduce((s, a) => s + a.amount, 0);
  const pending = appels.filter((a) => a.status === "pending").reduce((s, a) => s + a.amount, 0);
  const overdue = appels.filter((a) => a.status === "overdue").reduce((s, a) => s + a.amount, 0);
  const rate = total > 0 ? Math.round((collected / total) * 100) : 0;

  const FILTERS = [
    { key: "all",               label: "Tous" },
    { key: "pending",           label: "À payer" },
    { key: "pending_validation",label: "En validation" },
    { key: "overdue",           label: "En retard" },
    { key: "paid",              label: "Payés" },
    { key: "rejected",          label: "Rejetés" },
  ];

  const filtered = filter === "all" ? appels : appels.filter((a) => a.status === filter);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Charges & Appels de Fonds"
        subtitle={`Taux de recouvrement: ${rate}%`}
        color="#10b981"
      />

      {/* Finance summary: amounts + progress bar */}
      <View style={[styles.summary, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <StatsStrip
          stats={[
            { label: "Total appelé", value: `${(total / 1000).toFixed(1)}k`,     color: colors.foreground },
            { label: "Recouvré",     value: `${(collected / 1000).toFixed(1)}k`, color: "#10b981" },
            { label: "En attente",   value: `${(pending / 1000).toFixed(1)}k`,   color: "#f59e0b" },
            { label: "En retard",    value: `${(overdue / 1000).toFixed(1)}k`,   color: "#ef4444" },
          ]}
        />
        <View style={[styles.progressBg, { backgroundColor: colors.secondary }]}>
          <View style={[styles.progressFill, { width: `${rate}%` as any, backgroundColor: rate > 80 ? "#10b981" : rate > 50 ? "#f59e0b" : "#ef4444" }]} />
        </View>
      </View>

      {/* Payment history shortcut — visible to members only */}
      {!isAdmin && (
        <TouchableOpacity
          style={[styles.historyBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/paiements" as any); }}
          activeOpacity={0.75}
        >
          <Feather name="clock" size={14} color="#10b981" />
          <Text style={[styles.historyBannerText, { color: colors.foreground }]}>Historique de mes paiements</Text>
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}

      <FilterChips
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        accentColor="#10b981"
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10b981" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="credit-card" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun appel de fonds</Text>
            </View>
          ) : (
            filtered.map((appel) => {
              const sc = STATUS_CONFIG[appel.status] ?? STATUS_CONFIG.pending;
              const isOverdue = appel.status === "overdue";

              return (
                <View key={appel.id} style={[styles.card, { backgroundColor: colors.card, borderColor: isOverdue ? "#ef444430" : colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.amtCircle, { backgroundColor: sc.color + "18" }]}>
                      <Feather name={sc.icon} size={20} color={sc.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardPeriod, { color: colors.foreground }]}>
                        {appel.period} — {TYPE_LABELS[appel.type] ?? appel.type}
                      </Text>
                      <Text style={[styles.cardLot, { color: colors.mutedForeground }]}>
                        Lot {appel.lotId.slice(-6)} {appel.dueDate ? `• Échéance: ${appel.dueDate}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.cardAmount, { color: isOverdue ? "#ef4444" : colors.foreground }]}>
                        {appel.amount.toLocaleString("fr-MA")} MAD
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: sc.color + "18" }]}>
                        <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                    </View>
                  </View>

                  {appel.status === "paid" && appel.receiptNumber ? (
                    <TouchableOpacity
                      style={[styles.receiptRow, { borderTopColor: colors.border }]}
                      onPress={() => downloadReceipt(appel)}
                    >
                      <Feather name="check-circle" size={12} color="#10b981" />
                      <Text style={[styles.receiptText, { color: "#10b981", flex: 1 }]}>
                        Reçu {appel.receiptNumber} — {appel.paidDate} via {appel.paymentMethod}
                      </Text>
                      <Feather name="download" size={12} color="#10b981" />
                    </TouchableOpacity>
                  ) : null}

                  {appel.status === "rejected" && appel.rejectionReason ? (
                    <View style={[styles.rejectRow, { borderTopColor: colors.border, backgroundColor: "#ef444410" }]}>
                      <Feather name="alert-circle" size={12} color="#ef4444" />
                      <Text style={[styles.receiptText, { color: "#ef4444", flex: 1 }]}>
                        Rejeté: {appel.rejectionReason}
                      </Text>
                    </View>
                  ) : null}

                  {appel.status === "pending_validation" && appel.paymentMethod ? (
                    <View style={[styles.receiptRow, { borderTopColor: colors.border }]}>
                      <Feather name="loader" size={12} color="#3b82f6" />
                      <Text style={[styles.receiptText, { color: "#3b82f6" }]}>
                        En attente — {appel.paymentMethod}{appel.proofUrl ? " • Justificatif joint" : ""}
                      </Text>
                    </View>
                  ) : null}

                  {/* Member actions */}
                  {(appel.status === "pending" || appel.status === "overdue" || appel.status === "rejected") && !isAdmin ? (
                    <TouchableOpacity
                      style={[styles.payBtn, { backgroundColor: appel.status === "rejected" ? "#f97316" : "#10b981" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPayModal(appel); }}
                    >
                      <Feather name="credit-card" size={14} color="#fff" />
                      <Text style={styles.payBtnText}>
                        {appel.status === "rejected" ? "Soumettre à nouveau" : "Soumettre un paiement"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* Admin actions — only show when payment submitted and awaiting review */}
                  {isAdmin && appel.status === "pending_validation" ? (
                    <View style={[styles.adminActions, { borderTopColor: colors.border }]}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#10b98115" }]}
                        onPress={() => handleApprove(appel.id)}>
                        <Feather name="check" size={14} color="#10b981" />
                        <Text style={[styles.actionBtnText, { color: "#10b981" }]}>Valider</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef444415" }]}
                        onPress={() => { setRejectModal(appel); setRejectReason(""); }}>
                        <Feather name="x" size={14} color="#ef4444" />
                        <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>Rejeter</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Rejection reason modal (admin) */}
      <Modal visible={!!rejectModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setRejectModal(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Motif de rejet</Text>
            <TouchableOpacity onPress={() => setRejectModal(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={[styles.modalBody, { gap: 16 }]}>
            {rejectModal ? (
              <View style={[styles.payAmtBox, { backgroundColor: "#ef444410", borderColor: "#ef444430" }]}>
                <Text style={[styles.payAmtLabel, { color: "#ef4444" }]}>Paiement à rejeter</Text>
                <Text style={[styles.payAmtVal, { color: "#ef4444" }]}>{rejectModal.amount.toLocaleString("fr-MA")} MAD</Text>
                <Text style={[styles.payAmtPeriod, { color: colors.mutedForeground }]}>{rejectModal.period}</Text>
              </View>
            ) : null}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Motif du rejet *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, minHeight: 80, textAlignVertical: "top" }]}
              placeholder="Ex: Justificatif illisible, montant incorrect..."
              placeholderTextColor={colors.mutedForeground}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#ef4444", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleReject}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> :
                <><Feather name="x-circle" size={16} color="#fff" /><Text style={styles.submitText}>Rejeter le paiement</Text></>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Payment modal */}
      <Modal visible={!!payModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPayModal(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Soumettre un paiement</Text>
            <TouchableOpacity onPress={() => setPayModal(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={[styles.modalBody, { gap: 16 }]}>
            {payModal ? (
              <View style={[styles.payAmtBox, { backgroundColor: "#10b98110", borderColor: "#10b98130" }]}>
                <Text style={[styles.payAmtLabel, { color: "#10b981" }]}>Montant à payer</Text>
                <Text style={[styles.payAmtVal, { color: "#10b981" }]}>{payModal.amount.toLocaleString("fr-MA")} MAD</Text>
                <Text style={[styles.payAmtPeriod, { color: colors.mutedForeground }]}>{payModal.period} • {TYPE_LABELS[payModal.type]}</Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Mode de paiement</Text>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity key={m.key}
                style={[styles.methodBtn, { backgroundColor: colors.card, borderColor: payMethod === m.key ? "#10b981" : colors.border, borderWidth: payMethod === m.key ? 2 : 1 }]}
                onPress={() => setPayMethod(m.key)}>
                <Feather name={m.icon} size={18} color={payMethod === m.key ? "#10b981" : colors.mutedForeground} />
                <Text style={[styles.methodText, { color: colors.foreground }]}>{m.label}</Text>
                {payMethod === m.key ? <Feather name="check-circle" size={16} color="#10b981" style={{ marginLeft: "auto" }} /> : null}
              </TouchableOpacity>
            ))}

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Référence / Note</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Référence virement, numéro chèque..."
              placeholderTextColor={colors.mutedForeground}
              value={payNote}
              onChangeText={setPayNote}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Justificatif de paiement (optionnel)</Text>
            {payProofUri ? (
              <View style={{ gap: 8 }}>
                <Image source={{ uri: payProofUri }} style={{ width: "100%", height: 160, borderRadius: 12, resizeMode: "cover" }} />
                {uploadingProof && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator size="small" color="#3b82f6" />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#3b82f6" }}>Téléchargement en cours...</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.input, { backgroundColor: "#ef444410", borderColor: "#ef444430", alignItems: "center", paddingVertical: 10 }]}
                  onPress={() => setPayProofUri("")}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "#ef4444" }}>Supprimer le justificatif</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.methodBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderStyle: "dashed" }]}
                onPress={pickProofImage}
                activeOpacity={0.8}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#3b82f615", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="camera" size={18} color="#3b82f6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>Joindre un justificatif</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>Reçu, virement, chèque...</Text>
                </View>
                <Feather name="upload" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#10b981", opacity: (submitting || uploadingProof) ? 0.7 : 1 }]}
              onPress={handlePay}
              disabled={submitting || uploadingProof}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> :
                <><Feather name="send" size={16} color="#fff" /><Text style={styles.submitText}>Soumettre le paiement</Text></>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  summary: { borderBottomWidth: StyleSheet.hairlineWidth },
  progressBg: { height: 4, marginHorizontal: 16, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  list: { padding: 16, gap: 10 },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden", padding: 14, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  amtCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardPeriod: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardLot: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  receiptText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rejectRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingTop: 8, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 8 },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 12 },
  payBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  adminActions: { flexDirection: "row", gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, borderRadius: 10 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  historyBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  historyBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, paddingBottom: 40 },
  payAmtBox: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 4 },
  payAmtLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  payAmtVal: { fontSize: 28, fontFamily: "Inter_700Bold" },
  payAmtPeriod: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  methodBtn: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12 },
  methodText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 16, marginTop: 8 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
