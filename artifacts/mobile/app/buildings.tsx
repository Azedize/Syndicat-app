import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import StatCard from "@/components/StatCard";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";
import EmptyState from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { Card, Chip, IconButton, SearchField, SectionHeader, StatusBadge, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";

type SortKey = "name" | "lots" | "unpaid" | "city";

const BUILDING_TYPE_TONES: Record<string, StatusTone> = {
  residential: "primary",
  commercial: "warning",
  office: "info",
  mixed: "success",
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

function typeTone(type: string): StatusTone {
  return BUILDING_TYPE_TONES[type] ?? "neutral";
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
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <BuildingsScreenInner />
    </RoleGuard>
  );
}

function BuildingsScreenInner() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, isRTL } = useLanguage();
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


  const BUILDING_TYPE_LABELS: Record<string, string> = {
    residential: t("residential"),
    commercial:  t("commercial"),
    office:      t("offices"),
    mixed:       t("mixed"),
  };

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "name",   label: t("buildingName") },
    { key: "city",   label: t("city") },
    { key: "lots",   label: t("units") },
    { key: "unpaid", label: t("unpaidCharges") },
  ];

  const FILTER_TYPES = [
    { key: "all",         label: t("all") },
    { key: "residential", label: t("residential") },
    { key: "commercial",  label: t("commercial") },
    { key: "office",      label: t("offices") },
    { key: "mixed",       label: t("mixed") },
  ];

  const FILTER_STATUS = [
    { key: "all",      label: t("all") },
    { key: "active",   label: t("statusActive") },
    { key: "inactive", label: t("statusInactive") },
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
    } catch {
      setError(t("buildingsLoadErrorDescription"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, isSuperAdmin, t]);

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
    Haptics.selectionAsync().catch(() => {});
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const canCreate = isSuperAdmin || user?.role === "syndicate_admin";
  const filtersActive = filterType !== "all" || filterStatus !== "all";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t("buildingsResidences")}
        subtitle={`${buildings.length} ${t("managedBuildings")}`}
        action={canCreate ? { icon: "plus", label: t("uiAdd"), onPress: () => router.push("/syndicate-setup" as any) } : undefined}
      />

      {loading ? (
        <View style={styles.center}>
          <LoadingState title={t("buildingsLoadingTitle")} description={t("buildingsLoadingDescription")} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <ErrorState title={t("buildingsLoadErrorTitle")} description={error} retryLabel={t("retry")} onRetry={() => { void load(); }} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 32 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Overview (super_admin only) */}
          {isSuperAdmin && bldgStats.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title={t("buildingsOverview")} />
              <View style={styles.statsGrid}>
                <StatCard label={t("buildingsTitle")} value={globalStats.buildings} icon="home" />
                <StatCard label={t("units")} value={globalStats.totalLots} icon="grid" tone="info" />
              </View>
              <View style={styles.statsGrid}>
                <StatCard label={t("occupied")} value={globalStats.occupiedLots} icon="check-circle" tone="success" subtitle={`${globalStats.vacantLots} ${t("vacant")}`} />
                <StatCard label={t("owners")} value={globalStats.owners} icon="user" tone="info" subtitle={`${globalStats.tenants} ${t("tenants")}`} />
              </View>
              <View style={styles.statsGrid}>
                <StatCard label={t("buildingIncidents")} value={globalStats.incidents} icon="alert-triangle" tone="warning" />
                <StatCard
                  label={t("collectionRate")}
                  value={`${collectionRate}%`}
                  icon="percent"
                  tone={collectionRate >= 80 ? "success" : collectionRate >= 60 ? "warning" : "danger"}
                  subtitle={`${globalStats.unpaidCharges} ${t("unpaidCharges")}`}
                />
              </View>
              <View style={styles.statsGrid}>
                <StatCard label={t("documents")} value={globalStats.documents} icon="file-text" />
                <StatCard label={t("meetings")} value={globalStats.meetings} icon="calendar" tone="info" />
              </View>
            </View>
          )}

          {/* Search + filters */}
          <View style={styles.searchRow}>
            <SearchField value={search} onChangeText={setSearch} placeholder={t("searchBuildings")} style={{ flex: 1 }} />
            <IconButton
              icon="sliders"
              accessibilityLabel={t("sortBy")}
              onPress={() => setShowFilters((v) => !v)}
              badge={filtersActive ? (filterType !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0) : undefined}
              style={showFilters ? { backgroundColor: colors.primarySoft, borderColor: colors.primary } : undefined}
            />
          </View>

          {showFilters && (
            <Card padding="md" style={{ gap: 10 }}>
              <Text style={[TYPE.overline, { color: colors.textMuted }]}>{t("buildingType").toLocaleUpperCase()}</Text>
              <View style={styles.chipRow}>
                {FILTER_TYPES.map((f) => (
                  <Chip key={f.key} label={f.label} selected={filterType === f.key} onPress={() => setFilterType(f.key)} />
                ))}
              </View>
              <Text style={[TYPE.overline, { color: colors.textMuted, marginTop: 6 }]}>{t("status").toLocaleUpperCase()}</Text>
              <View style={styles.chipRow}>
                {FILTER_STATUS.map((f) => (
                  <Chip key={f.key} label={f.label} selected={filterStatus === f.key} onPress={() => setFilterStatus(f.key)} />
                ))}
              </View>
              <Text style={[TYPE.overline, { color: colors.textMuted, marginTop: 6 }]}>{t("sortBy").toLocaleUpperCase()}</Text>
              <View style={styles.chipRow}>
                {SORT_OPTIONS.map((s) => (
                  <Chip
                    key={s.key}
                    label={s.label}
                    selected={sortKey === s.key}
                    icon={sortKey === s.key ? (sortAsc ? "arrow-up" : "arrow-down") : undefined}
                    onPress={() => toggleSort(s.key)}
                  />
                ))}
              </View>
            </Card>
          )}

          {(search || filtersActive) && buildings.length > 0 && (
            <Text style={[TYPE.caption, { color: colors.textMuted, paddingHorizontal: 4 }]}>
              {displayed.length} {t("results")}
            </Text>
          )}

          {buildings.length === 0 ? (
            <EmptyState
              icon="home"
              title={t("noBuildings")}
              description={t("buildingsEmptyDescription")}
              actionLabel={canCreate ? t("uiAdd") : undefined}
              onAction={canCreate ? () => router.push("/syndicate-setup" as any) : undefined}
            />
          ) : displayed.length === 0 ? (
            <EmptyState
              icon="search"
              title={t("noResults")}
              description={t("noBuildingMatches")}
              actionLabel={t("resetFilters")}
              onAction={() => { setSearch(""); setFilterType("all"); setFilterStatus("all"); }}
            />
          ) : (
            displayed.map((building) => {
              const tone = typeTone(building.type);
              const tc = toneColors(colors, tone);
              const lots = building.lotCount || building.totalLots;
              return (
                <Card
                  key={building.id}
                  padding="none"
                  accessibilityLabel={`${building.name}, ${building.address}, ${building.city}`}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    router.push({ pathname: "/lots", params: { buildingId: building.id, buildingName: building.name } } as any);
                  }}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.buildingIcon, { backgroundColor: tc.bg }]}>
                      <Feather name="home" size={20} color={tc.fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[TYPE.subtitle, { color: colors.foreground }]} numberOfLines={1}>
                        {building.name}
                      </Text>
                      <Text style={[TYPE.secondary, { color: colors.textMuted }]} numberOfLines={1}>
                        {building.address}, {building.city}
                      </Text>
                    </View>
                    <StatusBadge label={BUILDING_TYPE_LABELS[building.type] ?? building.type} tone={tone} icon={null} />
                  </View>

                  <View style={[styles.metrics, { borderTopColor: colors.border, backgroundColor: colors.surfaceMuted + "80" }]}>
                    <Metric icon="layers" value={building.totalFloors} label={t("floors")} />
                    <Metric icon="grid" value={lots} label={t("units")} />
                    <Metric icon="tool" value={building.openTravaux} label={t("travaux")} tone={building.openTravaux > 0 ? "warning" : undefined} />
                    <Metric icon="credit-card" value={building.pendingCharges} label={t("unpaidCharges")} tone={building.pendingCharges > 0 ? "danger" : undefined} />
                  </View>

                  <View style={styles.cardFooter}>
                    <StatusBadge label={building.status === "active" ? t("statusActive") : t("statusInactive")} tone={building.status === "active" ? "success" : "neutral"} />
                    {building.constructionYear ? (
                      <Text style={[TYPE.caption, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                        {t("builtIn")} {building.constructionYear}
                      </Text>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textMuted} />
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** One figure of a building card: value + label, toned only when it needs attention. */
function Metric({ icon, value, label, tone }: { icon: keyof typeof Feather.glyphMap; value: number; label: string; tone?: StatusTone }) {
  const colors = useColors();
  const tc = tone ? toneColors(colors, tone) : null;
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${value} ${label}`}>
      <View style={styles.metricTop}>
        <Feather name={icon} size={13} color={tc?.fg ?? colors.textMuted} />
        <Text style={[TYPE.bodyStrong, { color: tc?.text ?? colors.foreground, fontVariant: ["tabular-nums"] }]}>{value}</Text>
      </View>
      <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "center" }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  list:        { padding: 16, gap: 12 },
  section:     { gap: 12, marginBottom: 4 },
  statsGrid:   { flexDirection: "row", gap: 12 },
  searchRow:   { flexDirection: "row", alignItems: "center", gap: 10 },
  chipRow:     { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cardHeader:  { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  buildingIcon:{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  metrics:     { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 8 },
  metric:      { flex: 1, alignItems: "center", gap: 2, minWidth: 0 },
  metricTop:   { flexDirection: "row", alignItems: "center", gap: 5 },
  cardFooter:  { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
});
