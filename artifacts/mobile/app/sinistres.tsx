import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import FilterChips from "@/components/FilterChips";
import StatisticsHeader from "@/components/StatisticsHeader";

const TYPE_CONFIG: Record<string, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  degat_eau:        { label: "Dégât des eaux",     icon: "droplet",       color: "#3b82f6" },
  incendie:         { label: "Incendie",            icon: "alert-octagon", color: "#ef4444" },
  vol:              { label: "Vol / Cambriolage",   icon: "unlock",        color: "#f97316" },
  ascenseur:        { label: "Panne ascenseur",     icon: "chevrons-up",   color: "#2563EB" },
  dommage_commun:   { label: "Dommage commun",      icon: "tool",          color: "#f59e0b" },
  autre:            { label: "Autre",               icon: "alert-triangle",color: "#6b7280" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  declared:    { label: "Déclaré",          color: "#f59e0b" },
  in_progress: { label: "En cours",         color: "#3b82f6" },
  expert:      { label: "Expertise",        color: "#2563EB" },
  repair:      { label: "Réparation",       color: "#f97316" },
  closed:      { label: "Clôturé",          color: "#10b981" },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  low:      { label: "Faible",   color: "#10b981", icon: "arrow-down-circle" },
  medium:   { label: "Moyen",    color: "#f59e0b", icon: "minus-circle" },
  high:     { label: "Élevé",    color: "#f97316", icon: "arrow-up-circle" },
  critical: { label: "Critique", color: "#ef4444", icon: "alert-octagon" },
};

type Sinistre = {
  id: string;
  type: string;
  description: string;
  date: string;
  status: string;
  urgency?: string | null;
  buildingId: string;
  lotId?: string;
  estimatedAmount?: number;
  indemnisedAmount?: number;
  claimNumber?: string;
  reportedByName?: string;
  lot?: { number: string; floor: number } | null;
};

export default function SinistresScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const { showToast } = useToast();

  const [sinistres, setSinistres] = useState<Sinistre[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "super_admin";
  const [form, setForm] = useState({ type: "degat_eau", urgency: "medium", description: "", date: new Date().toISOString().split("T")[0], buildingId: "", estimatedAmount: "" });
  const [submitting, setSubmitting] = useState(false);

  const [filterType, setFilterType] = useState<string>("all");

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest("/sinistres", "GET", undefined, token);
      setSinistres(data.data ?? []);
    } catch (e: any) { if (!silent) showToast({ type: "error", title: "Erreur de chargement", message: e?.message ?? "Impossible de charger les sinistres." }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleSubmit = async () => {
    if (!form.description.trim()) { showToast({ type: "warning", title: "Champ requis", message: "La description est obligatoire." }); return; }
    try {
      setSubmitting(true);
      await apiRequest("/sinistres", "POST", {
        type: form.type,
        urgency: form.urgency,
        description: form.description,
        date: form.date,
        buildingId: form.buildingId,
        estimatedAmount: form.estimatedAmount ? parseFloat(form.estimatedAmount) : undefined,
      }, token);
      setShowModal(false);
      setForm({ type: "degat_eau", urgency: "medium", description: "", date: new Date().toISOString().split("T")[0], buildingId: "", estimatedAmount: "" });
      showToast({ type: "success", title: "Sinistre déclaré", message: "Votre déclaration a été enregistrée." });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e?.message ?? "Impossible de déclarer le sinistre." });
    } finally { setSubmitting(false); }
  };

  const open = sinistres.filter((s) => s.status !== "closed").length;
  const closed = sinistres.filter((s) => s.status === "closed").length;
  const totalEstimated = sinistres.reduce((s, si) => s + (Number(si.estimatedAmount) || 0), 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: "#ef4444", paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Sinistres & Incidents</Text>
          <Text style={styles.headerSub}>{sinistres.length} sinistre{sinistres.length !== 1 ? "s" : ""} déclaré{sinistres.length !== 1 ? "s" : ""}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowModal(true); }}>
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Total", value: sinistres.length, color: "#ef4444" },
          { label: "En cours", value: open, color: "#f97316" },
          { label: "Clôturés", value: closed, color: "#10b981" },
          { label: "Estimé", value: totalEstimated > 0 ? `${(totalEstimated / 1000).toFixed(0)}k` : "0", color: "#2563EB" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.statCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLab, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#ef4444" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ef4444" />}
          showsVerticalScrollIndicator={false}
        >
          {sinistres.length === 0 ? (
            <EmptyState
              icon="shield"
              title="Aucun sinistre"
              description="Aucun incident déclaré. Votre immeuble est bien protégé."
              actionLabel="Déclarer un sinistre"
              onAction={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowModal(true); }}
              accentColor="#10b981"
            />
          ) : (
            sinistres.map((s) => {
              const tc = TYPE_CONFIG[s.type] ?? TYPE_CONFIG.autre;
              const sc = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.declared;

              return (
                <View key={s.id} style={[styles.card, { backgroundColor: colors.card, borderColor: s.status === "closed" ? colors.border : tc.color + "40" }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeIcon, { backgroundColor: tc.color + "18" }]}>
                      <Feather name={tc.icon} size={22} color={tc.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardType, { color: tc.color }]}>{tc.label}</Text>
                      <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                        {s.date}{s.lot ? ` — Lot ${s.lot.number}` : ""}{s.reportedByName ? ` — ${s.reportedByName}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <View style={[styles.statusBadge, { backgroundColor: sc.color + "18" }]}>
                        <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                      {s.urgency ? (() => {
                        const uc = URGENCY_CONFIG[s.urgency] ?? URGENCY_CONFIG.medium;
                        return (
                          <View style={[styles.statusBadge, { backgroundColor: uc.color + "18" }]}>
                            <Text style={[styles.statusText, { color: uc.color }]}>{uc.label}</Text>
                          </View>
                        );
                      })() : null}
                    </View>
                  </View>

                  <Text style={[styles.cardDesc, { color: colors.foreground }]} numberOfLines={3}>{s.description}</Text>

                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    {s.claimNumber ? (
                      <View style={styles.footerItem}>
                        <Feather name="hash" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Dossier: {s.claimNumber}</Text>
                      </View>
                    ) : null}
                    {s.estimatedAmount ? (
                      <Text style={[styles.footerAmt, { color: colors.mutedForeground }]}>
                        ~{(Number(s.estimatedAmount) || 0).toLocaleString("fr-MA")} MAD
                        {s.indemnisedAmount ? ` / Indemnisé: ${(Number(s.indemnisedAmount) || 0).toLocaleString("fr-MA")} MAD` : ""}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Déclarer un Sinistre</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Type de sinistre</Text>
            <View style={styles.typeGrid}>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                <TouchableOpacity key={k}
                  style={[styles.typeBtn, { backgroundColor: form.type === k ? v.color : colors.secondary, borderColor: form.type === k ? v.color : colors.border }]}
                  onPress={() => setForm((p) => ({ ...p, type: k }))}>
                  <Feather name={v.icon} size={16} color={form.type === k ? "#fff" : v.color} />
                  <Text style={[styles.typeBtnText, { color: form.type === k ? "#fff" : colors.foreground }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Niveau d'urgence</Text>
            <View style={styles.typeGrid}>
              {Object.entries(URGENCY_CONFIG).map(([k, v]) => (
                <TouchableOpacity key={k}
                  style={[styles.typeBtn, { backgroundColor: form.urgency === k ? v.color : colors.secondary, borderColor: form.urgency === k ? v.color : colors.border }]}
                  onPress={() => setForm((p) => ({ ...p, urgency: k }))}>
                  <Feather name={v.icon} size={14} color={form.urgency === k ? "#fff" : v.color} />
                  <Text style={[styles.typeBtnText, { color: form.urgency === k ? "#fff" : colors.foreground }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description *</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Décrivez le sinistre en détail..."
              placeholderTextColor={colors.mutedForeground}
              value={form.description}
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              multiline numberOfLines={4} textAlignVertical="top"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date du sinistre</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              value={form.date}
              onChangeText={(v) => setForm((p) => ({ ...p, date: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Estimation des dommages (MAD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ex: 15000"
              placeholderTextColor={colors.mutedForeground}
              value={form.estimatedAmount}
              onChangeText={(v) => setForm((p) => ({ ...p, estimatedAmount: v }))}
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#ef4444", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Déclarer le sinistre</Text>}
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
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden", padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  typeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardType: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  footerAmt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  typeBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { height: 100, textAlignVertical: "top" },
  submitBtn: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 16 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
