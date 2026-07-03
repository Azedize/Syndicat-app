import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
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

const BUILDING_TYPE_LABELS: Record<string, string> = {
  residential: "Résidentiel",
  commercial: "Commercial",
  office: "Bureaux",
  mixed: "Mixte",
};

const BUILDING_TYPE_COLORS: Record<string, string> = {
  residential: "#7c3aed",
  commercial: "#f59e0b",
  office: "#3b82f6",
  mixed: "#10b981",
};

type Building = {
  id: string;
  name: string;
  address: string;
  city: string;
  type: string;
  totalFloors: number;
  totalLots: number;
  constructionYear?: number;
  status: string;
  lotCount: number;
  openTravaux: number;
  pendingCharges: number;
};

export default function BuildingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest("/buildings", "GET", undefined, token);
      setBuildings(data.data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const typeColor = (type: string) => BUILDING_TYPE_COLORS[type] ?? "#6b7280";
  const typeLabel = (type: string) => BUILDING_TYPE_LABELS[type] ?? type;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: topPad + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Immeubles & Résidences</Text>
          <Text style={styles.headerSub}>{buildings.length} immeuble{buildings.length !== 1 ? "s" : ""} géré{buildings.length !== 1 ? "s" : ""}</Text>
        </View>
        {(user?.role === "super_admin" || user?.role === "syndicate_admin") && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/syndicate-setup" as any); }}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Chargement des immeubles…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => load()}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {buildings.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="home" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun immeuble</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Commencez par enregistrer votre premier immeuble pour gérer vos copropriétaires, charges et travaux.
              </Text>
            </View>
          ) : (
            buildings.map((building) => (
              <TouchableOpacity
                key={building.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/lots", params: { buildingId: building.id, buildingName: building.name } } as any); }}
                activeOpacity={0.8}
              >
                {/* Card header */}
                <View style={styles.cardHeader}>
                  <View style={[styles.buildingIcon, { backgroundColor: typeColor(building.type) + "18" }]}>
                    <Feather name="home" size={22} color={typeColor(building.type)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>{building.name}</Text>
                    <Text style={[styles.cardAddress, { color: colors.mutedForeground }]} numberOfLines={1}>{building.address}, {building.city}</Text>
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: typeColor(building.type) + "18" }]}>
                    <Text style={[styles.typeBadgeText, { color: typeColor(building.type) }]}>{typeLabel(building.type)}</Text>
                  </View>
                </View>

                {/* Info row */}
                <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                  {[
                    { icon: "layers" as const, label: `${building.totalFloors} étages`, color: "#6366f1" },
                    { icon: "grid" as const, label: `${building.lotCount || building.totalLots} lots`, color: "#3b82f6" },
                    { icon: "tool" as const, label: `${building.openTravaux} travaux`, color: building.openTravaux > 0 ? "#f59e0b" : "#10b981" },
                    { icon: "credit-card" as const, label: `${building.pendingCharges} impayés`, color: building.pendingCharges > 0 ? "#ef4444" : "#10b981" },
                  ].map((info, i) => (
                    <View key={info.label} style={styles.infoCell}>
                      <Feather name={info.icon} size={13} color={info.color} />
                      <Text style={[styles.infoCellText, { color: colors.mutedForeground }]}>{info.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Status + year */}
                <View style={styles.cardFooter}>
                  <View style={[styles.statusDot, { backgroundColor: building.status === "active" ? "#10b981" : "#ef4444" }]} />
                  <Text style={[styles.cardFooterText, { color: colors.mutedForeground }]}>
                    {building.status === "active" ? "Actif" : "Inactif"}
                    {building.constructionYear ? ` — Construit en ${building.constructionYear}` : ""}
                  </Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, paddingBottom: 12 },
  buildingIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardAddress: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  typeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  infoRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  infoCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 4 },
  infoCellText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  cardFooterText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  retryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
