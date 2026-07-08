import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import FilterChips from "@/components/FilterChips";
import StatisticsHeader from "@/components/StatisticsHeader";

const LOT_TYPE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  appartement: "home",
  bureau: "briefcase",
  commerce: "shopping-bag",
  parking: "truck",
  cave: "archive",
  local: "box",
};

const LOT_TYPE_COLORS: Record<string, string> = {
  appartement: "#7c3aed",
  bureau: "#3b82f6",
  commerce: "#f59e0b",
  parking: "#6b7280",
  cave: "#92400e",
  local: "#10b981",
};

const STATUS_COLORS: Record<string, string> = {
  occupied: "#10b981",
  vacant: "#f59e0b",
  for_sale: "#3b82f6",
  for_rent: "#8b5cf6",
};

const STATUS_LABELS: Record<string, string> = {
  occupied: "Occupé",
  vacant: "Vacant",
  for_sale: "À vendre",
  for_rent: "À louer",
};

type Lot = {
  id: string;
  number: string;
  type: string;
  floor: number;
  surfaceM2?: number;
  tantiemes: number;
  buildingId: string;
  status: string;
  owner?: { id: string; name: string; email: string; phone: string } | null;
  tenant?: any;
  chargeStats?: { pending: number; overdue: number; pendingAmount: number };
};

export default function LotsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { isWide } = useBreakpoints();
  const params = useLocalSearchParams<{ buildingId?: string; buildingName?: string }>();

  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const qs = params.buildingId ? `?buildingId=${params.buildingId}` : "";
      const data = await apiRequest(`/lots${qs}`, "GET", undefined, token);
      setLots(data.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, params.buildingId]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const filtered = filter === "all" ? lots : lots.filter((l) => l.type === filter || l.status === filter);

  const stats = {
    total: lots.length,
    occupied: lots.filter((l) => l.status === "occupied").length,
    vacant: lots.filter((l) => l.status === "vacant").length,
    overdue: lots.filter((l) => (l.chargeStats?.overdue ?? 0) > 0).length,
  };

  const FILTERS = [
    { key: "all", label: "Tous" },
    { key: "appartement", label: "Appts" },
    { key: "bureau", label: "Bureaux" },
    { key: "commerce", label: "Commerces" },
    { key: "parking", label: "Parkings" },
    { key: "vacant", label: "Vacants" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title="Lots & Unités"
        subtitle={params.buildingName ?? "Tous les immeubles"}
        color={colors.primary}
        stats={[
          { label: "Total",   value: stats.total,    color: colors.primary },
          { label: "Occupés", value: stats.occupied, color: "#10b981" },
          { label: "Vacants", value: stats.vacant,   color: "#f59e0b" },
          { label: "Impayés", value: stats.overdue,  color: "#ef4444" },
        ]}
      />

      <FilterChips
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        accentColor={colors.primary}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="grid" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun lot trouvé</Text>
            </View>
          ) : (
            filtered.map((lot) => {
              const tc = LOT_TYPE_COLORS[lot.type] ?? "#6b7280";
              const ti = LOT_TYPE_ICONS[lot.type] ?? "home";
              const sc = STATUS_COLORS[lot.status] ?? "#6b7280";
              const hasOverdue = (lot.chargeStats?.overdue ?? 0) > 0;
              const pendingAmt = lot.chargeStats?.pendingAmount ?? 0;

              return (
                <TouchableOpacity
                  key={lot.id}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: hasOverdue ? "#ef444440" : colors.border }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedLot(lot); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardMain}>
                    <View style={[styles.lotIcon, { backgroundColor: tc + "18" }]}>
                      <Feather name={ti} size={20} color={tc} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardRow}>
                        <Text style={[styles.lotNumber, { color: colors.foreground }]}>Lot {lot.number}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: sc + "18" }]}>
                          <Text style={[styles.statusText, { color: sc }]}>{STATUS_LABELS[lot.status] ?? lot.status}</Text>
                        </View>
                      </View>
                      <Text style={[styles.lotType, { color: colors.mutedForeground }]}>
                        {lot.type.charAt(0).toUpperCase() + lot.type.slice(1)} — Étage {lot.floor}
                        {lot.surfaceM2 ? ` — ${lot.surfaceM2} m²` : ""}
                      </Text>
                    </View>
                  </View>

                  {/* Owner / Tenant */}
                  <View style={[styles.personRow, { borderTopColor: colors.border }]}>
                    {lot.owner ? (
                      <View style={styles.personCell}>
                        <Feather name="user" size={13} color={colors.primary} />
                        <Text style={[styles.personLabel, { color: colors.mutedForeground }]}>
                          Propriétaire: <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}>{lot.owner.name}</Text>
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.personCell}>
                        <Feather name="user-x" size={13} color="#f59e0b" />
                        <Text style={[styles.personLabel, { color: "#f59e0b" }]}>Propriétaire non renseigné</Text>
                      </View>
                    )}
                  </View>

                  {/* Charge status */}
                  <View style={[styles.chargeRow, { borderTopColor: colors.border }]}>
                    <View style={styles.chargeInfo}>
                      <Feather name="percent" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.chargeText, { color: colors.mutedForeground }]}>{lot.tantiemes} ‰ (tantiémes)</Text>
                    </View>
                    {pendingAmt > 0 ? (
                      <View style={[styles.amtBadge, { backgroundColor: hasOverdue ? "#ef444418" : "#f59e0b18" }]}>
                        <Feather name="alert-circle" size={11} color={hasOverdue ? "#ef4444" : "#f59e0b"} />
                        <Text style={[styles.amtText, { color: hasOverdue ? "#ef4444" : "#f59e0b" }]}>
                          {pendingAmt.toLocaleString("fr-MA")} MAD dûs
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.amtBadge, { backgroundColor: "#10b98118" }]}>
                        <Feather name="check-circle" size={11} color="#10b981" />
                        <Text style={[styles.amtText, { color: "#10b981" }]}>À jour</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Lot detail modal */}
      <Modal visible={!!selectedLot} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedLot(null)}>
        {selectedLot ? (
          <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Lot {selectedLot.number}</Text>
              <TouchableOpacity onPress={() => setSelectedLot(null)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* Type + Status hero */}
              <View style={[styles.modalHero, { backgroundColor: (LOT_TYPE_COLORS[selectedLot.type] ?? "#7c3aed") + "15", borderColor: (LOT_TYPE_COLORS[selectedLot.type] ?? "#7c3aed") + "40" }]}>
                <View style={[styles.modalHeroIcon, { backgroundColor: (LOT_TYPE_COLORS[selectedLot.type] ?? "#7c3aed") + "25" }]}>
                  <Feather name={LOT_TYPE_ICONS[selectedLot.type] ?? "home"} size={28} color={LOT_TYPE_COLORS[selectedLot.type] ?? "#7c3aed"} />
                </View>
                <Text style={[styles.modalHeroTitle, { color: colors.foreground }]}>
                  {selectedLot.type.charAt(0).toUpperCase() + selectedLot.type.slice(1)} — Lot {selectedLot.number}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[selectedLot.status] ?? "#6b7280") + "20" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[selectedLot.status] ?? "#6b7280" }]}>
                    {STATUS_LABELS[selectedLot.status] ?? selectedLot.status}
                  </Text>
                </View>
              </View>

              {/* Lot details */}
              <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { icon: "layers" as const, label: "Étage", value: selectedLot.floor.toString() },
                  { icon: "maximize" as const, label: "Surface", value: selectedLot.surfaceM2 ? `${selectedLot.surfaceM2} m²` : "—" },
                  { icon: "percent" as const, label: "Tantièmes", value: `${selectedLot.tantiemes} ‰` },
                ].map((row, i) => (
                  <View key={row.label}>
                    {i > 0 ? <View style={[styles.sep2, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.detailRow}>
                      <View style={styles.detailLabelRow}>
                        <Feather name={row.icon} size={14} color={colors.mutedForeground} />
                        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      </View>
                      <Text style={[styles.detailValue, { color: colors.foreground }]}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Owner */}
              <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Propriétaire</Text>
                {selectedLot.owner ? (
                  <>
                    <View style={[styles.sep2, { backgroundColor: colors.border }]} />
                    {[
                      { label: "Nom", value: selectedLot.owner.name },
                      { label: "Email", value: selectedLot.owner.email },
                      { label: "Téléphone", value: selectedLot.owner.phone },
                    ].map((row, i) => (
                      <View key={row.label}>
                        {i > 0 ? <View style={[styles.sep2, { backgroundColor: colors.border }]} /> : null}
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                          <Text style={[styles.detailValue, { color: colors.foreground }]}>{row.value || "—"}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    <View style={[styles.sep2, { backgroundColor: colors.border }]} />
                    <Text style={[styles.detailLabel, { color: "#f59e0b", paddingVertical: 8 }]}>Aucun propriétaire renseigné</Text>
                  </>
                )}
              </View>

              {/* Charges */}
              {selectedLot.chargeStats && (selectedLot.chargeStats.pending > 0 || selectedLot.chargeStats.overdue > 0) ? (
                <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: "#ef444440" }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Situation financière</Text>
                  <View style={[styles.sep2, { backgroundColor: colors.border }]} />
                  {[
                    { label: "Appels en attente", value: selectedLot.chargeStats.pending.toString(), color: "#f59e0b" },
                    { label: "Appels en retard", value: selectedLot.chargeStats.overdue.toString(), color: "#ef4444" },
                    { label: "Montant dû", value: `${selectedLot.chargeStats.pendingAmount.toLocaleString("fr-MA")} MAD`, color: "#ef4444" },
                  ].map((row, i) => (
                    <View key={row.label}>
                      {i > 0 ? <View style={[styles.sep2, { backgroundColor: colors.border }]} /> : null}
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                        <Text style={[styles.detailValue, { color: row.color }]}>{row.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 10 },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalHero: { alignItems: "center", gap: 10, padding: 20, borderRadius: 18, borderWidth: 1 },
  modalHeroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  modalHeroTitle: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  detailCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4, gap: 0 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  detailLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sep2: { height: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", paddingTop: 10, paddingBottom: 2 },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  lotIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lotNumber: { fontSize: 15, fontFamily: "Inter_700Bold" },
  lotType: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  personRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  personCell: { flexDirection: "row", alignItems: "center", gap: 6 },
  personLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  chargeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  chargeInfo: { flexDirection: "row", alignItems: "center", gap: 5 },
  chargeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  amtBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  amtText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
