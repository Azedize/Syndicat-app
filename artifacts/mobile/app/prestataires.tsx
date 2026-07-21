import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { pickAndUploadInvoice } from "@/lib/upload";
import { prestataires as prestatairesApi } from "@/services/api";
import EmptyState from "@/components/EmptyState";
import FilterChips from "@/components/FilterChips";
import ScreenHeader from "@/components/ScreenHeader";
import StatsStrip from "@/components/StatsStrip";
import RoleGuard from "@/components/RoleGuard";

const TYPE_CONFIG: Record<string, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  ascenseur:     { label: "Ascenseur",     icon: "chevrons-up",  color: "#3b82f6" },
  nettoyage:     { label: "Nettoyage",     icon: "wind",         color: "#06b6d4" },
  gardiennage:   { label: "Gardiennage",   icon: "shield",       color: "#2563EB" },
  plomberie:     { label: "Plomberie",     icon: "droplet",      color: "#0ea5e9" },
  electricite:   { label: "Électricité",   icon: "zap",          color: "#f59e0b" },
  jardinage:     { label: "Jardinage",     icon: "feather",      color: "#10b981" },
  peinture:      { label: "Peinture",      icon: "edit-3",       color: "#ec4899" },
  autre:         { label: "Autre",         icon: "tool",         color: "#6b7280" },
};

type Prestataire = {
  id: string;
  name: string;
  type: string;
  contactName?: string;
  phone?: string;
  email?: string;
  status: string;
  rating?: number;
  activeContracts: number;
  openWorkOrders: number;
  expiringContracts: number;
  contracts: any[];
};

export default function PrestatairesScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <PrestatairesScreenInner />
    </RoleGuard>
  );
}

function PrestatairesScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";
  const { isWide } = useBreakpoints();

  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "autre", contactName: "", phone: "", email: "", notes: "",
  });
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentName, setDocumentName] = useState("");

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const resetForm = () => {
    setForm({ name: "", type: "autre", contactName: "", phone: "", email: "", notes: "" });
    setDocumentUrl("");
    setDocumentName("");
  };

  const handlePickJustification = async () => {
    try {
      setUploading(true);
      const result = await pickAndUploadInvoice();
      if (result) setDocumentUrl(result.objectPath);
      setDocumentName(result ? "Justificatif joint (image/PDF)" : documentName);
    } catch {
      showToast({ type: "error", title: "Erreur d'upload", message: "Impossible de téléverser le document." });
    } finally { setUploading(false); }
  };

  const handleCreatePrestataire = async () => {
    if (!form.name.trim() || !form.type.trim()) {
      showToast({ type: "warning", title: "Champs requis", message: "Le nom et le type du prestataire sont obligatoires." });
      return;
    }
    if (!documentUrl) {
      Alert.alert(
        "Justificatif obligatoire",
        "Vous devez joindre une image ou un PDF justifiant le besoin de ce prestataire."
      );
      return;
    }
    try {
      setSubmitting(true);
      await prestatairesApi.create({
        name: form.name.trim(),
        type: form.type.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
        documentUrl,
      });
      setShowAdd(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: "Prestataire ajouté", message: `${form.name} a été enregistré avec succès.` });
      load();
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e?.message ?? "Impossible de créer le prestataire." });
    } finally { setSubmitting(false); }
  };

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const qs = filterType !== "all" ? `?type=${filterType}` : "";
      const data = await apiRequest(`/prestataires${qs}`, "GET", undefined, token);
      setPrestataires(data.data ?? []);
    } catch (e: any) { if (!silent) showToast({ type: "error", title: "Erreur de chargement", message: e?.message ?? "Impossible de charger les prestataires." }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, filterType]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const totalMonthly = prestataires.reduce((s, p) => {
    const mc = p.contracts.reduce((cs: number, c: any) => cs + (c.monthlyAmount ?? 0), 0);
    return s + mc;
  }, 0);

  const FILTERS = [
    { key: "all", label: "Tous" },
    ...Object.entries(TYPE_CONFIG).map(([k, v]) => ({ key: k, label: v.label })),
  ];

  const renderStars = (rating?: number) => {
    if (!rating) return null;
    return (
      <View style={{ flexDirection: "row", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Feather key={i} name="star" size={10} color={i <= rating ? "#f59e0b" : colors.border} />
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: "#3b82f6", paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Prestataires</Text>
          <Text style={styles.headerSub}>{prestataires.length} prestataire{prestataires.length !== 1 ? "s" : ""} • {totalMonthly.toLocaleString("fr-MA")} MAD/mois</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}
            style={styles.addBtn}
          >
            <Feather name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Summary cards */}
      <View style={[styles.summaryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Prestataires", value: prestataires.length, color: "#3b82f6" },
          { label: "Contrats actifs", value: prestataires.reduce((s, p) => s + p.activeContracts, 0), color: "#10b981" },
          { label: "Expirent bientôt", value: prestataires.reduce((s, p) => s + p.expiringContracts, 0), color: "#f59e0b" },
          { label: "Travaux ouverts", value: prestataires.reduce((s, p) => s + p.openWorkOrders, 0), color: "#2563EB" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.sumCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={[styles.sumVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.sumLab, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <FilterChips
        options={FILTERS}
        value={filterType}
        onChange={(key) => setFilterType(key)}
        accentColor="#3b82f6"
        mode="scroll"
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#3b82f6" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
          showsVerticalScrollIndicator={false}
        >
          {prestataires.length === 0 ? (
            <EmptyState
              icon="briefcase"
              title="Aucun prestataire"
              description="Aucun prestataire enregistré. Ajoutez votre premier prestataire de services."
              actionLabel="Ajouter un prestataire"
              onAction={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}
              accentColor="#3b82f6"
            />
          ) : (
            prestataires.map((p) => {
              const tc = TYPE_CONFIG[p.type] ?? TYPE_CONFIG.autre;
              const hasExpiring = p.expiringContracts > 0;

              return (
                <TouchableOpacity key={p.id} activeOpacity={0.8} onPress={() => router.push(`/prestataire-detail?id=${p.id}` as any)}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: hasExpiring ? "#f59e0b40" : colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeIcon, { backgroundColor: tc.color + "18" }]}>
                      <Feather name={tc.icon} size={22} color={tc.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardName, { color: colors.foreground }]}>{p.name}</Text>
                      <Text style={[styles.cardType, { color: tc.color }]}>{tc.label}</Text>
                      {renderStars(p.rating)}
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: p.status === "active" ? "#10b981" : "#ef4444" }]} />
                  </View>

                  {/* Contact */}
                  {(p.phone || p.email || p.contactName) ? (
                    <View style={[styles.contactRow, { borderTopColor: colors.border }]}>
                      {p.contactName ? (
                        <Text style={[styles.contactText, { color: colors.mutedForeground }]}>
                          <Text style={{ color: colors.foreground }}>{p.contactName}</Text>
                        </Text>
                      ) : null}
                      {p.phone ? (
                        <TouchableOpacity
                          style={styles.contactAction}
                          onPress={() => Linking.openURL(`tel:${p.phone}`)}
                        >
                          <Feather name="phone" size={13} color="#3b82f6" />
                          <Text style={[styles.contactActionText, { color: "#3b82f6" }]}>{p.phone}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Contracts & Work */}
                  <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                    <View style={styles.statItem}>
                      <Feather name="file-text" size={13} color="#10b981" />
                      <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                        {p.activeContracts} contrat{p.activeContracts !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Feather name="tool" size={13} color="#2563EB" />
                      <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                        {p.openWorkOrders} travaux en cours
                      </Text>
                    </View>
                    {hasExpiring ? (
                      <View style={styles.statItem}>
                        <Feather name="alert-triangle" size={13} color="#f59e0b" />
                        <Text style={[styles.statText, { color: "#f59e0b" }]}>Contrat expirant</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Contract amounts */}
                  {p.contracts.length > 0 ? (
                    <View style={[styles.contractRow, { borderTopColor: colors.border }]}>
                      {p.contracts.slice(0, 1).map((c: any) => (
                        <View key={c.id} style={styles.contractItem}>
                          <Text style={[styles.contractTitle, { color: colors.mutedForeground }]} numberOfLines={1}>{c.title}</Text>
                          {c.monthlyAmount ? (
                            <Text style={[styles.contractAmt, { color: colors.foreground }]}>
                              {c.monthlyAmount.toLocaleString("fr-MA")} MAD/mois
                            </Text>
                          ) : null}
                          {c.endDate ? (
                            <Text style={[styles.contractDate, { color: hasExpiring ? "#f59e0b" : colors.mutedForeground }]}>
                              Fin: {c.endDate}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add prestataire modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouveau prestataire</Text>
            <TouchableOpacity onPress={() => { setShowAdd(false); resetForm(); }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Nom *</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="Ex: Ascenseurs Atlas"
              placeholderTextColor={colors.mutedForeground}
              value={form.name}
              onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Type *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setForm((p) => ({ ...p, type: k }))}
                  style={[
                    styles.typeChip,
                    { borderColor: form.type === k ? v.color : colors.border, backgroundColor: form.type === k ? v.color + "18" : colors.card },
                  ]}
                >
                  <Feather name={v.icon} size={13} color={form.type === k ? v.color : colors.mutedForeground} />
                  <Text style={[styles.typeChipText, { color: form.type === k ? v.color : colors.mutedForeground }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Contact</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="Nom du contact"
              placeholderTextColor={colors.mutedForeground}
              value={form.contactName}
              onChangeText={(v) => setForm((p) => ({ ...p, contactName: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Téléphone</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="+212 6XX XXX XXX"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              value={form.phone}
              onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="contact@exemple.ma"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              value={form.email}
              onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Note / besoin</Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="Décrivez le besoin justifiant ce prestataire"
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={form.notes}
              onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Justificatif (image ou PDF) *</Text>
            <TouchableOpacity
              style={[
                styles.uploadBtn,
                { borderColor: documentUrl ? "#10b981" : colors.border, backgroundColor: documentUrl ? "#10b98110" : colors.card },
              ]}
              onPress={handlePickJustification}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#3b82f6" size="small" />
              ) : (
                <Feather name={documentUrl ? "check-circle" : "upload"} size={18} color={documentUrl ? "#10b981" : "#3b82f6"} />
              )}
              <Text style={[styles.uploadBtnText, { color: documentUrl ? "#10b981" : colors.foreground }]}>
                {documentName || "Joindre une image ou un PDF justifiant le besoin"}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              Obligatoire : une photo, un devis ou un document PDF expliquant pourquoi ce prestataire est nécessaire.
            </Text>

            <TouchableOpacity
              style={[styles.submitBtn, { opacity: submitting ? 0.6 : 1 }]}
              onPress={handleCreatePrestataire}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>Créer le prestataire</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  summaryRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  sumCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  sumVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sumLab: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
  chip: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  typeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardType: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  contactText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  contactAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  contactActionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  statItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  contractRow: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  contractItem: { gap: 2 },
  contractTitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  contractAmt: { fontSize: 14, fontFamily: "Inter_700Bold" },
  contractDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },

  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 4 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  inputMulti: { minHeight: 80, textAlignVertical: "top" },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 16 },
  uploadBtnText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  helperText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 15 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3b82f6", borderRadius: 14, paddingVertical: 15, marginTop: 24 },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
