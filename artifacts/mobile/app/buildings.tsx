import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import StatCard from "@/components/StatCard";

type SortKey = "name" | "lots" | "unpaid" | "city";

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
  syndicateId?: string;
  lotCount: number;
  openTravaux: number;
  pendingCharges: number;
};

type BuildingStats = {
  syndicateId: string;
  syndicateName: string;
  buildings: number;
  totalLots: number;
  occupiedLots: number;
  vacantLots: number;
  owners: number;
  tenants: number;
  employees: number;
  incidents: number;
  documents: number;
  meetings: number;
  unpaidCharges: number;
  paidCharges: number;
  totalCharges: number;
  collectionRate: number;
  financialBalance: number;
};

function typeColor(type: string) {
  return BUILDING_TYPE_COLORS[type] ?? "#6b7280";
}

function aggregateStats(stats: BuildingStats[]) {
  return stats.reduce(
    (acc, s) => ({
      buildings:        acc.buildings        + s.buildings,
      totalLots:        acc.totalLots        + s.totalLots,
      occupiedLots:     acc.occupiedLots     + s.occupiedLots,
      vacantLots:       acc.vacantLots       + s.vacantLots,
      owners:           acc.owners           + s.owners,
      tenants:          acc.tenants          + s.tenants,
      incidents:        acc.incidents        + s.incidents,
      documents:        acc.documents        + s.documents,
      meetings:         acc.meetings         + s.meetings,
      unpaidCharges:    acc.unpaidCharges    + s.unpaidCharges,
      totalCharges:     acc.totalCharges     + s.totalCharges,
      paidCharges:      acc.paidCharges      + s.paidCharges,
      financialBalance: acc.financialBalance + s.financialBalance,
    }),
    {
      buildings: 0, totalLots: 0, occupiedLots: 0, vacantLots: 0,
      owners: 0, tenants: 0, incidents: 0, documents: 0, meetings: 0,
      unpaidCharges: 0, totalCharges: 0, paidCharges: 0, financialBalance: 0,
    }
  );
}

export default function BuildingsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();

  const isSuperAdmin = user?.role === "super_admin";

  const [buildings,  setBuildings]  = useState<Building[]>([]);
  const [bldgStats,  setBldgStats]  = useState<BuildingStats[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const [search,       setSearch]       = useState("");
  const [filterType,   setFilterType]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortKey,      setSortKey]      = useState<SortKey>("name");
  const [sortAsc,      setSortAsc]      = useState(true);
  const [showFilters,  setShowFilters]  = useState(false);

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const BUILDING_TYPE_LABELS: Record<string, string> = {
    residential: t("residential"),
    commercial:  t("commercial"),
    office:      t("offices"),
    mixed:       t("mixed"),
  };

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "name",   label: "Nom" },
    { key: "city",   label: "Ville" },
    { key: "lots",   label: t("units") },
    { key: "unpaid", label: "Impayés" },
  ];

  const FILTER_TYPES = [
    { key: "all",         label: "Tous" },
    { key: "residential", label: t("residential") },
    { key: "commercial",  label: t("commercial") },
    { key: "office",      label: t("offices") },
    { key: "mixed",       label: t("mixed") },
  ];

  const FILTER_STATUS = [
    { key: "all",      label: "Tous" },
    { key: "active",   label: "Actifs" },
    { key: "inactive", label: "Inactifs" },
  ];

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const promises: [Promise<{ data: Building[] }>, Promise<{ data: BuildingStats[] }> | null] = [
        apiRequest("/buildings", "GET", undefined, token),
        isSuperAdmin
          ? apiRequest("/statistics/buildings", "GET", undefined, token)
          : null,
      ];
      const [bData, sData] = await Promise.all(promises);
      setBuildings(bData.data ?? []);
      if (sData) setBldgStats(sData.data ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const globalStats = useMemo(() => aggregateStats(bldgStats), [bldgStats]);
  const collectionRate = globalStats.totalCharges > 0
    ? Math.round((globalStats.paidCharges / globalStats.totalCharges) * 100)
    : 0;

  const displayed = useMemo(() => {
    let list = buildings.slice();
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.city.toLowerCase().includes(q) ||
          b.address.toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") {
      list = list.filter((b) => b.type === filterType);
    }
    if (filterStatus !== "all") {
      list = list.filter((b) => b.status === filterStatus);
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name")   cmp = a.name.localeCompare(b.name);
      if (sortKey === "city")   cmp = a.city.localeCompare(b.city);
      if (sortKey === "lots")   cmp = (b.lotCount || b.totalLots) - (a.lotCount || a.totalLots);
      if (sortKey === "unpaid") cmp = b.pendingCharges - a.pendingCharges;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [buildings, search, filterType, filterStatus, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    Haptics.selectionAsync();
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("buildingsResidences")}</Text>
          <Text style={styles.headerSub}>
            {buildings.length} immeuble{buildings.length !== 1 ? "s" : ""} géré{buildings.length !== 1 ? "s" : ""}
          </Text>
        </View>
        {(isSuperAdmin || user?.role === "syndicate_admin") && (
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
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Chargement des immeubles…
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => load()}
          >
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >

          {/* Stats strip (super_admin only) */}
          {isSuperAdmin && bldgStats.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                VUE D'ENSEMBLE
              </Text>
              <View style={styles.statsGrid}>
                <StatCard
                  label={t("buildingsTitle")}
                  value={globalStats.buildings}
                  icon="home"
                  iconColor={colors.primary}
                />
                <StatCard
                  label={t("units")}
                  value={globalStats.totalLots}
                  icon="grid"
                  iconColor="#3b82f6"
                />
              </View>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Occupés"
                  value={globalStats.occupiedLots}
                  icon="check-circle"
                  iconColor="#10b981"
                  subtitle={`${globalStats.vacantLots} vacant${globalStats.vacantLots !== 1 ? "s" : ""}`}
                />
                <StatCard
                  label="Propriétaires"
                  value={globalStats.owners}
                  icon="user"
                  iconColor="#8b5cf6"
                  subtitle={`${globalStats.tenants} locataire${globalStats.tenants !== 1 ? "s" : ""}`}
                />
              </View>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Incidents"
                  value={globalStats.incidents}
                  icon="alert-triangle"
                  iconColor="#f59e0b"
                />
                <StatCard
                  label="Taux recouvrement"
                  value={`${collectionRate}%`}
                  icon="percent"
                  iconColor={collectionRate >= 80 ? "#10b981" : collectionRate >= 60 ? "#f59e0b" : "#ef4444"}
                  subtitle={`${globalStats.unpaidCharges} impayé${globalStats.unpaidCharges !== 1 ? "s" : ""}`}
                />
              </View>
              <View style={styles.statsGrid}>
                <StatCard
                  label="Documents"
                  value={globalStats.documents}
                  icon="file-text"
                  iconColor="#6366f1"
                />
                <StatCard
                  label="Réunions AG"
                  value={globalStats.meetings}
                  icon="calendar"
                  iconColor="#0ea5e9"
                />
              </View>
            </>
          )}

          {/* Search bar */}
          <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Rechercher par nom ou ville…"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); setShowFilters((v) => !v); }}
              style={[styles.filterToggle, { backgroundColor: showFilters ? colors.primary + "20" : "transparent" }]}
            >
              <Feather name="sliders" size={16} color={showFilters ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Filter panel */}
          {showFilters && (
            <View style={[styles.filterPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>{t("buildingType").toUpperCase()}</Text>
              <View style={styles.chipRow}>
                {FILTER_TYPES.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: filterType === f.key ? colors.primary : colors.background,
                        borderColor: filterType === f.key ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => { Haptics.selectionAsync(); setFilterType(f.key); }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: filterType === f.key ? "#fff" : colors.mutedForeground },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginTop: 10 }]}>STATUT</Text>
              <View style={styles.chipRow}>
                {FILTER_STATUS.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: filterStatus === f.key ? colors.primary : colors.background,
                        borderColor: filterStatus === f.key ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => { Haptics.selectionAsync(); setFilterStatus(f.key); }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: filterStatus === f.key ? "#fff" : colors.mutedForeground },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.filterLabel, { color: colors.mutedForeground, marginTop: 10 }]}>TRIER PAR</Text>
              <View style={styles.chipRow}>
                {SORT_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: sortKey === s.key ? colors.primary : colors.background,
                        borderColor: sortKey === s.key ? colors.primary : colors.border,
                        flexDirection: "row",
                        gap: 4,
                      },
                    ]}
                    onPress={() => toggleSort(s.key)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: sortKey === s.key ? "#fff" : colors.mutedForeground },
                      ]}
                    >
                      {s.label}
                    </Text>
                    {sortKey === s.key && (
                      <Feather
                        name={sortAsc ? "arrow-up" : "arrow-down"}
                        size={11}
                        color="#fff"
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Results count */}
          {(search || filterType !== "all" || filterStatus !== "all") && buildings.length > 0 && (
            <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
              {displayed.length} résultat{displayed.length !== 1 ? "s" : ""}
              {search ? ` pour "${search}"` : ""}
            </Text>
          )}

          {/* Empty state */}
          {buildings.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="home" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noBuildings")}</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Commencez par enregistrer votre premier immeuble pour gérer vos copropriétaires, charges et travaux.
              </Text>
            </View>
          ) : displayed.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="search" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun résultat</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Aucun immeuble ne correspond à vos critères de recherche.
              </Text>
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                onPress={() => { setSearch(""); setFilterType("all"); setFilterStatus("all"); }}
              >
                <Text style={styles.retryBtnText}>Réinitialiser les filtres</Text>
              </TouchableOpacity>
            </View>
          ) : (
            displayed.map((building) => (
              <TouchableOpacity
                key={building.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: "/lots",
                    params: { buildingId: building.id, buildingName: building.name },
                  } as any);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.buildingIcon, { backgroundColor: typeColor(building.type) + "18" }]}>
                    <Feather name="home" size={22} color={typeColor(building.type)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
                      {building.name}
                    </Text>
                    <Text style={[styles.cardAddress, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {building.address}, {building.city}
                    </Text>
                  </View>
                  <View style={[styles.typeBadge, { backgroundColor: typeColor(building.type) + "18" }]}>
                    <Text style={[styles.typeBadgeText, { color: typeColor(building.type) }]}>
                      {BUILDING_TYPE_LABELS[building.type] ?? building.type}
                    </Text>
                  </View>
                </View>

                <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                  {[
                    { icon: "layers" as const,      label: `${building.totalFloors} ${t("floors")}`,                  color: "#6366f1" },
                    { icon: "grid" as const,         label: `${building.lotCount || building.totalLots} ${t("units")}`, color: "#3b82f6" },
                    { icon: "tool" as const,         label: `${building.openTravaux} travaux`,                          color: building.openTravaux > 0 ? "#f59e0b" : "#10b981" },
                    { icon: "credit-card" as const,  label: `${building.pendingCharges} impayés`,                       color: building.pendingCharges > 0 ? "#ef4444" : "#10b981" },
                  ].map((info) => (
                    <View key={info.label} style={styles.infoCell}>
                      <Feather name={info.icon} size={13} color={info.color} />
                      <Text style={[styles.infoCellText, { color: colors.mutedForeground }]}>{info.label}</Text>
                    </View>
                  ))}
                </View>

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
  root:           { flex: 1 },
  header:         { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn:        { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:    { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub:      { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  addBtn:         { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  list:           { padding: 16, gap: 12 },
  sectionLabel:   { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, paddingHorizontal: 4 },
  statsGrid:      { flexDirection: "row", gap: 12 },
  searchRow:      { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:    { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  filterToggle:   { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  filterPanel:    { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  filterLabel:    { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  chipRow:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  chipText:       { fontSize: 12, fontFamily: "Inter_500Medium" },
  resultCount:    { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 4 },
  card:           { borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  cardHeader:     { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, paddingBottom: 12 },
  buildingIcon:   { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardName:       { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardAddress:    { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  typeBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  typeBadgeText:  { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  infoRow:        { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10 },
  infoCell:       { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 4 },
  infoCellText:   { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardFooter:     { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  statusDot:      { width: 7, height: 7, borderRadius: 4 },
  cardFooterText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  center:         { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText:    { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorText:      { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  retryBtn:       { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  retryBtnText:   { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  empty:          { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon:      { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle:     { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText:      { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
