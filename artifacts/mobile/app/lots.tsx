import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import FilterChips from "@/components/FilterChips";
import StatisticsHeader from "@/components/StatisticsHeader";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";

const LOT_TYPE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  appartement: "home",
  bureau: "briefcase",
  commerce: "shopping-bag",
  parking: "truck",
  cave: "archive",
  local: "box",
};

const LOT_TYPE_COLORS: Record<string, string> = {
  appartement: "#2563EB",
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
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <LotsScreenInner />
    </RoleGuard>
  );
}

function LotsScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { lang, t } = useLanguage();
  const { isWide } = useBreakpoints();
  const params = useLocalSearchParams<{
    buildingId?: string;
    buildingName?: string;
  }>();

  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setLoadError(false);
        }
        const qs = params.buildingId ? `?buildingId=${params.buildingId}` : "";
        const data = await apiRequest(`/lots${qs}`, "GET", undefined, token);
        setLots(data.data ?? []);
      } catch {
        if (!silent) setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, params.buildingId],
  );

  useEffect(() => {
    load();
  }, [load]);
  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const filtered =
    filter === "all"
      ? lots
      : lots.filter((l) => l.type === filter || l.status === filter);

  const stats = {
    total: lots.length,
    occupied: lots.filter((l) => l.status === "occupied").length,
    vacant: lots.filter((l) => l.status === "vacant").length,
    overdue: lots.filter((l) => (l.chargeStats?.overdue ?? 0) > 0).length,
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      occupied: t("lotStatusOccupied"),
      vacant: t("lotStatusVacant"),
      for_sale: t("lotStatusForSale"),
      for_rent: t("lotStatusForRent"),
    };
    return map[status] ?? status;
  };

  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "es"
        ? "es-ES"
        : lang === "en"
          ? "en-GB"
          : "fr-FR";
  const formatMad = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "MAD",
      maximumFractionDigits: 2,
    }).format(value);
  const getLotTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      appartement: t("lotTypeApartment"),
      bureau: t("lotTypeOffice"),
      commerce: t("lotTypeCommerce"),
      parking: t("lotTypeParking"),
      cave: t("lotTypeStorage"),
      local: t("lotTypeHousing"),
    };
    return map[type] ?? type;
  };

  const FILTERS = [
    { key: "all", label: t("all") },
    { key: "appartement", label: t("filterApts") },
    { key: "bureau", label: t("filterOffices") },
    { key: "commerce", label: t("filterCommerce") },
    { key: "parking", label: t("filterParkings") },
    { key: "vacant", label: t("filterVacant") },
  ];

  // Skeleton loading card
  const SkeletonCard = () => (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardMain}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.secondary,
          }}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View
              style={{
                height: 15,
                width: "40%",
                backgroundColor: colors.secondary,
                borderRadius: 7,
              }}
            />
            <View
              style={{
                height: 18,
                width: 60,
                backgroundColor: colors.secondary,
                borderRadius: 9,
              }}
            />
          </View>
          <View
            style={{
              height: 11,
              width: "60%",
              backgroundColor: colors.secondary,
              borderRadius: 6,
            }}
          />
        </View>
      </View>
      <View style={[styles.personRow, { borderTopColor: colors.border }]}>
        <View
          style={{
            height: 12,
            width: "55%",
            backgroundColor: colors.secondary,
            borderRadius: 6,
          }}
        />
      </View>
      <View style={[styles.chargeRow, { borderTopColor: colors.border }]}>
        <View
          style={{
            height: 12,
            width: "30%",
            backgroundColor: colors.secondary,
            borderRadius: 6,
          }}
        />
        <View
          style={{
            height: 22,
            width: 70,
            backgroundColor: colors.secondary,
            borderRadius: 10,
          }}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title={t("lotsTitle")}
        subtitle={params.buildingName ?? t("allBuildings")}
        color={colors.primary}
        stats={[
          { label: t("total"), value: stats.total, color: colors.primary },
          { label: t("lotsOccupied"), value: stats.occupied, color: "#10b981" },
          { label: t("lotsVacant"), value: stats.vacant, color: "#f59e0b" },
          { label: t("lotsOverdue"), value: stats.overdue, color: "#ef4444" },
        ]}
      />

      <FilterChips
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        accentColor={colors.primary}
      />

      {loading ? (
        <LoadingState
          title={t("lotsLoadingTitle")}
          description={t("lotsLoadingDescription")}
          accentColor={colors.primary}
        />
      ) : loadError ? (
        <ErrorState
          title={t("lotsUnavailableTitle")}
          description={t("lotsUnavailableDescription")}
          retryLabel={t("retry")}
          onRetry={() => void load()}
          accentColor={colors.primary}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: isWide ? 32 : insets.bottom + 100 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="grid" size={36} color={colors.mutedForeground} />
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                {t("noLotsFound")}
              </Text>
              <Text
                style={[styles.emptyHint, { color: colors.mutedForeground }]}
              >
                {t("noLots")}
              </Text>
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
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: hasOverdue ? "#ef444440" : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedLot(lot);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardMain}>
                    <View
                      style={[styles.lotIcon, { backgroundColor: tc + "18" }]}
                    >
                      <Feather name={ti} size={20} color={tc} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardRow}>
                        <Text
                          style={[
                            styles.lotNumber,
                            { color: colors.foreground },
                          ]}
                        >
                          {t("lotLabel")} {lot.number}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: sc + "18" },
                          ]}
                        >
                          <Text style={[styles.statusText, { color: sc }]}>
                            {getStatusLabel(lot.status)}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.lotType,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {getLotTypeLabel(lot.type)} — {t("floor")} {lot.floor}
                        {lot.surfaceM2 ? ` — ${lot.surfaceM2} m²` : ""}
                      </Text>
                    </View>
                  </View>

                  {/* Owner / Tenant */}
                  <View
                    style={[
                      styles.personRow,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    {lot.owner ? (
                      <View style={styles.personCell}>
                        <Feather name="user" size={13} color={colors.primary} />
                        <Text
                          style={[
                            styles.personLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {t("ownerLabel")}:{" "}
                          <Text
                            style={{
                              color: colors.foreground,
                              fontFamily: "Inter_500Medium",
                            }}
                          >
                            {lot.owner.name}
                          </Text>
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.personCell}>
                        <Feather name="user-x" size={13} color="#f59e0b" />
                        <Text
                          style={[styles.personLabel, { color: "#f59e0b" }]}
                        >
                          {t("noOwnerRegistered")}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Charge status */}
                  <View
                    style={[
                      styles.chargeRow,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <View style={styles.chargeInfo}>
                      <Feather
                        name="percent"
                        size={12}
                        color={colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.chargeText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {lot.tantiemes} ‰ ({t("tantiemes").toLowerCase()})
                      </Text>
                    </View>
                    {pendingAmt > 0 ? (
                      <View
                        style={[
                          styles.amtBadge,
                          {
                            backgroundColor: hasOverdue
                              ? "#ef444418"
                              : "#f59e0b18",
                          },
                        ]}
                      >
                        <Feather
                          name="alert-circle"
                          size={11}
                          color={hasOverdue ? "#ef4444" : "#f59e0b"}
                        />
                        <Text
                          style={[
                            styles.amtText,
                            { color: hasOverdue ? "#ef4444" : "#f59e0b" },
                          ]}
                        >
                          {formatMad(pendingAmt)} {t("amountDue").toLowerCase()}
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.amtBadge,
                          { backgroundColor: "#10b98118" },
                        ]}
                      >
                        <Feather
                          name="check-circle"
                          size={11}
                          color="#10b981"
                        />
                        <Text style={[styles.amtText, { color: "#10b981" }]}>
                          {t("upToDate")}
                        </Text>
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
      <Modal
        visible={!!selectedLot}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedLot(null)}
      >
        {selectedLot ? (
          <View
            style={[styles.modalRoot, { backgroundColor: colors.background }]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {t("lotLabel")} {selectedLot.number}
              </Text>
              <TouchableOpacity onPress={() => setSelectedLot(null)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={{
                padding: 20,
                gap: 14,
                paddingBottom: 40,
              }}
              showsVerticalScrollIndicator={false}
            >
              {/* Type + Status hero */}
              <View
                style={[
                  styles.modalHero,
                  {
                    backgroundColor:
                      (LOT_TYPE_COLORS[selectedLot.type] ?? "#2563EB") + "15",
                    borderColor:
                      (LOT_TYPE_COLORS[selectedLot.type] ?? "#2563EB") + "40",
                  },
                ]}
              >
                <View
                  style={[
                    styles.modalHeroIcon,
                    {
                      backgroundColor:
                        (LOT_TYPE_COLORS[selectedLot.type] ?? "#2563EB") + "25",
                    },
                  ]}
                >
                  <Feather
                    name={LOT_TYPE_ICONS[selectedLot.type] ?? "home"}
                    size={28}
                    color={LOT_TYPE_COLORS[selectedLot.type] ?? "#2563EB"}
                  />
                </View>
                <Text
                  style={[styles.modalHeroTitle, { color: colors.foreground }]}
                >
                  {getLotTypeLabel(selectedLot.type)} — {t("lotLabel")}{" "}
                  {selectedLot.number}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        (STATUS_COLORS[selectedLot.status] ?? "#6b7280") + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: STATUS_COLORS[selectedLot.status] ?? "#6b7280" },
                    ]}
                  >
                    {getStatusLabel(selectedLot.status)}
                  </Text>
                </View>
              </View>

              {/* Lot details */}
              <View
                style={[
                  styles.detailCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                {[
                  {
                    icon: "layers" as const,
                    label: t("floor"),
                    value: selectedLot.floor.toString(),
                  },
                  {
                    icon: "maximize" as const,
                    label: t("surface"),
                    value: selectedLot.surfaceM2
                      ? `${selectedLot.surfaceM2} m²`
                      : "—",
                  },
                  {
                    icon: "percent" as const,
                    label: t("tantiemes"),
                    value: `${selectedLot.tantiemes} ‰`,
                  },
                ].map((row, i) => (
                  <View key={row.label}>
                    {i > 0 ? (
                      <View
                        style={[
                          styles.sep2,
                          { backgroundColor: colors.border },
                        ]}
                      />
                    ) : null}
                    <View style={styles.detailRow}>
                      <View style={styles.detailLabelRow}>
                        <Feather
                          name={row.icon}
                          size={14}
                          color={colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.detailLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {row.label}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.detailValue,
                          { color: colors.foreground },
                        ]}
                      >
                        {row.value}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Owner */}
              <View
                style={[
                  styles.detailCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  {t("ownerLabel")}
                </Text>
                {selectedLot.owner ? (
                  <>
                    <View
                      style={[styles.sep2, { backgroundColor: colors.border }]}
                    />
                    {[
                      { label: t("name"), value: selectedLot.owner.name },
                      { label: t("email"), value: selectedLot.owner.email },
                      { label: t("phone"), value: selectedLot.owner.phone },
                    ].map((row, i) => (
                      <View key={row.label}>
                        {i > 0 ? (
                          <View
                            style={[
                              styles.sep2,
                              { backgroundColor: colors.border },
                            ]}
                          />
                        ) : null}
                        <View style={styles.detailRow}>
                          <Text
                            style={[
                              styles.detailLabel,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {row.label}
                          </Text>
                          <Text
                            style={[
                              styles.detailValue,
                              { color: colors.foreground },
                            ]}
                          >
                            {row.value || "—"}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    <View
                      style={[styles.sep2, { backgroundColor: colors.border }]}
                    />
                    <Text
                      style={[
                        styles.detailLabel,
                        { color: "#f59e0b", paddingVertical: 8 },
                      ]}
                    >
                      {t("noOwnerLabel")}
                    </Text>
                  </>
                )}
              </View>

              {/* Charges */}
              {selectedLot.chargeStats &&
              (selectedLot.chargeStats.pending > 0 ||
                selectedLot.chargeStats.overdue > 0) ? (
                <View
                  style={[
                    styles.detailCard,
                    { backgroundColor: colors.card, borderColor: "#ef444440" },
                  ]}
                >
                  <Text
                    style={[styles.sectionTitle, { color: colors.foreground }]}
                  >
                    {t("financialSituation")}
                  </Text>
                  <View
                    style={[styles.sep2, { backgroundColor: colors.border }]}
                  />
                  {[
                    {
                      label: t("pendingCalls"),
                      value: selectedLot.chargeStats.pending.toString(),
                      color: "#f59e0b",
                    },
                    {
                      label: t("overdueCalls"),
                      value: selectedLot.chargeStats.overdue.toString(),
                      color: "#ef4444",
                    },
                    {
                      label: t("amountDue"),
                      value: formatMad(selectedLot.chargeStats.pendingAmount),
                      color: "#ef4444",
                    },
                  ].map((row, i) => (
                    <View key={row.label}>
                      {i > 0 ? (
                        <View
                          style={[
                            styles.sep2,
                            { backgroundColor: colors.border },
                          ]}
                        />
                      ) : null}
                      <View style={styles.detailRow}>
                        <Text
                          style={[
                            styles.detailLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {row.label}
                        </Text>
                        <Text
                          style={[styles.detailValue, { color: row.color }]}
                        >
                          {row.value}
                        </Text>
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
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalHero: {
    alignItems: "center",
    gap: 10,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  modalHeroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeroTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  detailCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  detailLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sep2: { height: StyleSheet.hairlineWidth },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    paddingTop: 10,
    paddingBottom: 2,
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  lotIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lotNumber: { fontSize: 15, fontFamily: "Inter_700Bold" },
  lotType: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  personCell: { flexDirection: "row", alignItems: "center", gap: 6 },
  personLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  chargeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chargeInfo: { flexDirection: "row", alignItems: "center", gap: 5 },
  chargeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  amtBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  amtText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
