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
import StatisticsHeader from "@/components/StatisticsHeader";

const PRIORITY_CONFIG: Record<string, { color: string; label: string; icon: keyof typeof Feather.glyphMap }> = {
  urgent:  { color: "#ef4444", label: "URGENT",    icon: "alert-circle" },
  high:    { color: "#f97316", label: "Élevée",    icon: "alert-triangle" },
  normal:  { color: "#3b82f6", label: "Normale",   icon: "info" },
  low:     { color: "#6b7280", label: "Faible",    icon: "minus-circle" },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  reported:    { color: "#f59e0b", label: "Signalé" },
  assigned:    { color: "#3b82f6", label: "Assigné" },
  in_progress: { color: "#7c3aed", label: "En cours" },
  completed:   { color: "#10b981", label: "Terminé" },
  cancelled:   { color: "#6b7280", label: "Annulé" },
};

const TYPE_LABELS: Record<string, string> = {
  entretien:     "Entretien courant",
  reparation:    "Réparation",
  amelioration:  "Amélioration",
  gros_travaux:  "Gros travaux",
  urgence:       "Urgence",
};

type Travail = {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  buildingId: string;
  reportedByName?: string;
  estimatedAmount?: number;
  actualAmount?: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  prestataire?: { id: string; name: string; phone: string; type: string } | null;
  lot?: { id: string; number: string; floor: number; type: string } | null;
};

export default function TravauxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();

  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);

  // New travail form
  const [form, setForm] = useState({ title: "", description: "", type: "entretien", priority: "normal", buildingId: "" });
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";
  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const data = await apiRequest(`/travaux${qs}`, "GET", undefined, token);
      setTravaux(data.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Alert.alert("Erreur", "Le titre est obligatoire");
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest("/travaux", "POST", form, token);
      setShowModal(false);
      setForm({ title: "", description: "", type: "entretien", priority: "normal", buildingId: "" });
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de créer le bon de travaux");
    } finally { setSubmitting(false); }
  };

  const stats = {
    total: travaux.length,
    urgent: travaux.filter((t) => t.priority === "urgent" || t.priority === "high").length,
    inProgress: travaux.filter((t) => t.status === "in_progress" || t.status === "assigned").length,
    done: travaux.filter((t) => t.status === "completed").length,
  };

  const FILTERS = [
    { key: "all", label: "Tous" },
    { key: "reported", label: "Signalés" },
    { key: "in_progress", label: "En cours" },
    { key: "completed", label: "Terminés" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title="Travaux & Interventions"
        subtitle={`${travaux.length} bon${travaux.length !== 1 ? "s" : ""} de travaux`}
        color="#f59e0b"
        stats={[
          { label: "Total",       value: stats.total,      color: "#f59e0b" },
          { label: "Prioritaires",value: stats.urgent,     color: "#ef4444" },
          { label: "En cours",    value: stats.inProgress, color: "#7c3aed" },
          { label: "Terminés",    value: stats.done,       color: "#10b981" },
        ]}
        action={{ icon: "plus", onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowModal(true); } }}
      />

      <FilterChips
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        accentColor="#f59e0b"
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#f59e0b" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
          showsVerticalScrollIndicator={false}
        >
          {travaux.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="tool" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun bon de travaux</Text>
            </View>
          ) : (
            travaux.map((t) => {
              const pri = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.normal;
              const sta = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.reported;

              return (
                <View key={t.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: pri.color, borderLeftWidth: 4 }]}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{t.title}</Text>
                      <Text style={[styles.cardType, { color: colors.mutedForeground }]}>{TYPE_LABELS[t.type] ?? t.type}</Text>
                    </View>
                    <View style={styles.badges}>
                      <View style={[styles.badge, { backgroundColor: pri.color + "18" }]}>
                        <Feather name={pri.icon} size={10} color={pri.color} />
                        <Text style={[styles.badgeText, { color: pri.color }]}>{pri.label}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: sta.color + "18" }]}>
                        <Text style={[styles.badgeText, { color: sta.color }]}>{sta.label}</Text>
                      </View>
                    </View>
                  </View>

                  {t.description ? (
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{t.description}</Text>
                  ) : null}

                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    {t.prestataire ? (
                      <View style={styles.footerItem}>
                        <Feather name="briefcase" size={12} color={colors.primary} />
                        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{t.prestataire.name}</Text>
                      </View>
                    ) : (
                      <View style={styles.footerItem}>
                        <Feather name="user-x" size={12} color="#f59e0b" />
                        <Text style={[styles.footerText, { color: "#f59e0b" }]}>Non assigné</Text>
                      </View>
                    )}
                    {t.estimatedAmount ? (
                      <Text style={[styles.footerAmount, { color: colors.mutedForeground }]}>~{t.estimatedAmount.toLocaleString("fr-MA")} MAD</Text>
                    ) : null}
                    {t.lot ? (
                      <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Lot {t.lot.number}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* New travail modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouveau Bon de Travaux</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Titre *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ex: Fuite toiture terrasse"
              placeholderTextColor={colors.mutedForeground}
              value={form.title}
              onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Décrivez le problème en détail..."
              placeholderTextColor={colors.mutedForeground}
              value={form.description}
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Type de travaux</Text>
            <View style={styles.optionRow}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <TouchableOpacity key={k}
                  style={[styles.optionChip, { backgroundColor: form.type === k ? "#f59e0b" : colors.secondary, borderColor: form.type === k ? "#f59e0b" : colors.border }]}
                  onPress={() => setForm((p) => ({ ...p, type: k }))}>
                  <Text style={[styles.optionText, { color: form.type === k ? "#fff" : colors.foreground }]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Priorité</Text>
            <View style={styles.optionRow}>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                <TouchableOpacity key={k}
                  style={[styles.optionChip, { backgroundColor: form.priority === k ? v.color : colors.secondary, borderColor: form.priority === k ? v.color : colors.border }]}
                  onPress={() => setForm((p) => ({ ...p, priority: k }))}>
                  <Text style={[styles.optionText, { color: form.priority === k ? "#fff" : colors.foreground }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#f59e0b", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Créer le bon de travaux</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 10 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden", padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardType: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badges: { gap: 4, alignItems: "flex-end" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  footerAmount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { height: 100, textAlignVertical: "top" },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  optionText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  submitBtn: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 16 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
