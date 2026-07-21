import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  paid:    { label: "Payé",       color: "#10b981", bg: "#10b98118" },
  pending: { label: "En attente", color: "#f59e0b", bg: "#f59e0b18" },
  draft:   { label: "Brouillon",  color: "#6b7280", bg: "#6b728018" },
};

type SalaryRecord = {
  id: string;
  role: string;
  amount: string | number;
  month: string;
  status: string;
  paidDate?: string | null;
  syndicateId?: string | null;
  createdAt: string;
};

function formatMoney(v: string | number): string {
  return `${parseFloat(String(v ?? 0)).toLocaleString("fr-MA", { minimumFractionDigits: 2 })} MAD`;
}

// Fiches de paie (payroll) is an admin-only financial module.
// Members and tenants must not access it — they have no payroll relationship with the syndicate.
export default function FichesPaieScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <FichesPaieScreenInner />
    </RoleGuard>
  );
}

function FichesPaieScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "super_admin";
  const { showToast } = useToast();

  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ role: "", amount: "", month: new Date().toISOString().slice(0, 7) });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest("/finance/salaries?limit=200", "GET", undefined, token);
      const rows: SalaryRecord[] = data.data ?? data.rows ?? [];
      setRecords(rows);
      if (rows.length > 0 && !selectedMonth) {
        // Default to most recent month
        const months = Array.from(new Set(rows.map((r) => r.month))).sort().reverse();
        setSelectedMonth(months[0] ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleAdd = async () => {
    if (!form.role.trim()) { showToast({ type: "error", title: "Erreur", message: "Le poste est obligatoire" }); return; }
    if (!form.amount) { showToast({ type: "error", title: "Erreur", message: "Le montant est obligatoire" }); return; }
    if (!form.month) { showToast({ type: "error", title: "Erreur", message: "Le mois est obligatoire" }); return; }
    try {
      setSubmitting(true);
      await apiRequest("/finance/salaries", "POST", {
        role: form.role,
        amount: parseFloat(form.amount),
        month: form.month,
        status: "pending",
      }, token);
      setShowAdd(false);
      setForm({ role: "", amount: "", month: new Date().toISOString().slice(0, 7) });
      load(true);
      showToast({ type: "success", message: "Fiche de paie ajoutée." });
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible d'ajouter la fiche de paie" });
    } finally { setSubmitting(false); }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await apiRequest(`/finance/salaries/${id}`, "PUT", {
        status: "paid",
        paidDate: new Date().toISOString().split("T")[0],
      }, token);
      load(true);
      showToast({ type: "success", message: "Fiche de paie marquée comme payée." });
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible de mettre à jour" });
    }
  };

  // Unique months sorted desc
  const months = Array.from(new Set(records.map((r) => r.month))).sort().reverse();
  const monthRecords = selectedMonth ? records.filter((r) => r.month === selectedMonth) : records;
  const totalNet = monthRecords.reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
  const paidCount = monthRecords.filter((r) => r.status === "paid").length;
  const pendingCount = monthRecords.filter((r) => r.status === "pending").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: "#2563EB" }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Fiches de Paie</Text>
          <Text style={styles.headerSub}>{records.length} enregistrement{records.length !== 1 ? "s" : ""}</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: "#fff", borderBottomColor: "#e2e8f0" }]}>
        {[
          { label: "Total mois", value: formatMoney(totalNet), color: "#2563EB" },
          { label: "Payés", value: paidCount.toString(), color: "#10b981" },
          { label: "En attente", value: pendingCount.toString(), color: "#f59e0b" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.statCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: "#e2e8f0" }]}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLab, { color: "#64748b" }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Month selector */}
      {months.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.monthsScroll, { borderBottomColor: "#e2e8f0" }]}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 10 }}
        >
          {months.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.monthChip, { backgroundColor: selectedMonth === m ? "#2563EB" : colors.secondary, borderColor: selectedMonth === m ? "#2563EB" : colors.border }]}
              onPress={() => setSelectedMonth(m)}
            >
              <Text style={[styles.monthChipText, { color: selectedMonth === m ? "#fff" : colors.foreground }]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#2563EB" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
          showsVerticalScrollIndicator={false}
        >
          {monthRecords.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: "#2563EB15" }]}>
                <Feather name="file-text" size={32} color="#2563EB" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune fiche de paie</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {selectedMonth ? `Aucun enregistrement pour ${selectedMonth}.` : "Aucune fiche enregistrée."}
              </Text>
            </View>
          ) : monthRecords.map((rec) => {
            const sc = STATUS_CFG[rec.status] ?? STATUS_CFG.pending;
            return (
              <View key={rec.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardTop}>
                  <View style={[styles.avatarCircle, { backgroundColor: "#2563EB18" }]}>
                    <Feather name="user" size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardRole, { color: colors.foreground }]}>{rec.role}</Text>
                    <Text style={[styles.cardMonth, { color: colors.mutedForeground }]}>{rec.month}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 5 }}>
                    <Text style={[styles.cardAmount, { color: colors.foreground }]}>{formatMoney(rec.amount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                  </View>
                </View>

                {rec.paidDate ? (
                  <View style={[styles.paidRow, { borderTopColor: colors.border }]}>
                    <Feather name="check-circle" size={12} color="#10b981" />
                    <Text style={[styles.paidDate, { color: "#10b981" }]}>Payé le {rec.paidDate}</Text>
                  </View>
                ) : isAdmin && rec.status === "pending" ? (
                  <View style={[styles.paidRow, { borderTopColor: colors.border }]}>
                    <TouchableOpacity
                      style={[styles.payBtn, { backgroundColor: "#10b98118", borderColor: "#10b981" }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        Alert.alert("Confirmer", `Marquer ${rec.role} comme payé pour ${rec.month} ?`, [
                          { text: "Annuler", style: "cancel" },
                          { text: "Confirmer", onPress: () => handleMarkPaid(rec.id) },
                        ]);
                      }}
                    >
                      <Feather name="check" size={14} color="#10b981" />
                      <Text style={[styles.payBtnText, { color: "#10b981" }]}>Marquer payé</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouvelle Fiche de Paie</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {[
              { label: "Poste / Rôle *", key: "role" as const, placeholder: "Ex: Gardien, Comptable, Syndic..." },
              { label: "Montant (MAD) *", key: "amount" as const, placeholder: "Ex: 5000", numeric: true },
              { label: "Mois (YYYY-MM) *", key: "month" as const, placeholder: "Ex: 2026-07" },
            ].map((f) => (
              <View key={f.key}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={form[f.key]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  keyboardType={f.numeric ? "numeric" : "default"}
                />
              </View>
            ))}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#2563EB", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleAdd} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Enregistrer</Text>}
            </TouchableOpacity>
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
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  monthsScroll: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 52 },
  monthChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  monthChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 10 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarCircle: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardRole: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardMonth: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  paidRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  paidDate: { fontSize: 12, fontFamily: "Inter_500Medium" },
  payBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  payBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  submitBtn: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 16 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
