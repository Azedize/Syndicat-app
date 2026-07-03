import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import FilterChips from "@/components/FilterChips";
import ScreenHeader from "@/components/ScreenHeader";
import StatsStrip from "@/components/StatsStrip";

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: keyof typeof Feather.glyphMap }> = {
  pending: { color: "#f59e0b", label: "En attente", icon: "clock" },
  paid:    { color: "#10b981", label: "Payé",       icon: "check-circle" },
  overdue: { color: "#ef4444", label: "En retard",  icon: "alert-circle" },
  partial: { color: "#f97316", label: "Partiel",    icon: "minus-circle" },
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
  buildingId: string;
};

export default function ChargesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();

  const [appels, setAppels] = useState<Appel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [payModal, setPayModal] = useState<Appel | null>(null);
  const [payMethod, setPayMethod] = useState("virement");
  const [payNote, setPayNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";
  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const data = await apiRequest(`/appels-de-fonds${qs}`, "GET", undefined, token);
      setAppels(data.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const handlePay = async () => {
    if (!payModal) return;
    try {
      setSubmitting(true);
      await apiRequest(`/appels-de-fonds/${payModal.id}/pay`, "PUT", {
        paymentMethod: payMethod,
        notes: payNote,
      }, token);
      setPayModal(null);
      setPayNote("");
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de soumettre le paiement");
    } finally { setSubmitting(false); }
  };

  const handleValidate = async (id: string, approve: boolean) => {
    try {
      await apiRequest(`/appels-de-fonds/${id}/validate`, "PUT", { approve }, token);
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de valider");
    }
  };

  const total = appels.reduce((s, a) => s + a.amount, 0);
  const collected = appels.filter((a) => a.status === "paid").reduce((s, a) => s + a.amount, 0);
  const pending = appels.filter((a) => a.status === "pending").reduce((s, a) => s + a.amount, 0);
  const overdue = appels.filter((a) => a.status === "overdue").reduce((s, a) => s + a.amount, 0);
  const rate = total > 0 ? Math.round((collected / total) * 100) : 0;

  const FILTERS = [
    { key: "all", label: "Tous" },
    { key: "pending", label: "En attente" },
    { key: "overdue", label: "En retard" },
    { key: "paid", label: "Payés" },
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
                    <View style={[styles.receiptRow, { borderTopColor: colors.border }]}>
                      <Feather name="check-circle" size={12} color="#10b981" />
                      <Text style={[styles.receiptText, { color: "#10b981" }]}>
                        Reçu {appel.receiptNumber} — {appel.paidDate} via {appel.paymentMethod}
                      </Text>
                    </View>
                  ) : null}

                  {/* Actions */}
                  {(appel.status === "pending" || appel.status === "overdue") && !isAdmin ? (
                    <TouchableOpacity
                      style={[styles.payBtn, { backgroundColor: "#10b981" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPayModal(appel); }}
                    >
                      <Feather name="credit-card" size={14} color="#fff" />
                      <Text style={styles.payBtnText}>Soumettre un paiement</Text>
                    </TouchableOpacity>
                  ) : null}

                  {isAdmin && appel.status === "pending" ? (
                    <View style={[styles.adminActions, { borderTopColor: colors.border }]}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#10b98115" }]}
                        onPress={() => handleValidate(appel.id, true)}>
                        <Feather name="check" size={14} color="#10b981" />
                        <Text style={[styles.actionBtnText, { color: "#10b981" }]}>Valider</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef444415" }]}
                        onPress={() => handleValidate(appel.id, false)}>
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

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#10b981", opacity: submitting ? 0.7 : 1 }]}
              onPress={handlePay}
              disabled={submitting}
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
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 12 },
  payBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  adminActions: { flexDirection: "row", gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10, borderRadius: 10 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
