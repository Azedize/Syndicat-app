import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import FilterChips from "@/components/FilterChips";
import ScreenHeader from "@/components/ScreenHeader";
import StatsStrip from "@/components/StatsStrip";

const TYPE_CONFIG: Record<string, { label: string; icon: keyof typeof Feather.glyphMap; color: string }> = {
  ascenseur:     { label: "Ascenseur",     icon: "chevrons-up",  color: "#3b82f6" },
  nettoyage:     { label: "Nettoyage",     icon: "wind",         color: "#06b6d4" },
  gardiennage:   { label: "Gardiennage",   icon: "shield",       color: "#7c3aed" },
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
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { isWide } = useBreakpoints();

  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const qs = filterType !== "all" ? `?type=${filterType}` : "";
      const data = await apiRequest(`/prestataires${qs}`, "GET", undefined, token);
      setPrestataires(data.data ?? []);
    } catch (e) { console.error(e); }
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
      </View>

      {/* Summary cards */}
      <View style={[styles.summaryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Prestataires", value: prestataires.length, color: "#3b82f6" },
          { label: "Contrats actifs", value: prestataires.reduce((s, p) => s + p.activeContracts, 0), color: "#10b981" },
          { label: "Expirent bientôt", value: prestataires.reduce((s, p) => s + p.expiringContracts, 0), color: "#f59e0b" },
          { label: "Travaux ouverts", value: prestataires.reduce((s, p) => s + p.openWorkOrders, 0), color: "#7c3aed" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.sumCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={[styles.sumVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.sumLab, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter by type */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 50, backgroundColor: colors.card }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key}
            style={[styles.chip, { backgroundColor: filterType === f.key ? "#3b82f6" : colors.secondary, borderColor: filterType === f.key ? "#3b82f6" : colors.border }]}
            onPress={() => { Haptics.selectionAsync(); setFilterType(f.key); }}>
            <Text style={[styles.chipText, { color: filterType === f.key ? "#fff" : colors.foreground }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#3b82f6" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
          showsVerticalScrollIndicator={false}
        >
          {prestataires.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="briefcase" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun prestataire</Text>
            </View>
          ) : (
            prestataires.map((p) => {
              const tc = TYPE_CONFIG[p.type] ?? TYPE_CONFIG.autre;
              const hasExpiring = p.expiringContracts > 0;

              return (
                <View key={p.id} style={[styles.card, { backgroundColor: colors.card, borderColor: hasExpiring ? "#f59e0b40" : colors.border }]}>
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
                      <Feather name="tool" size={13} color="#7c3aed" />
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
                </View>
              );
            })
          )}
        </ScrollView>
      )}
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
});
