import { Feather } from "@expo/vector-icons";
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
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest } from "@/lib/api";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";

type Lot = {
  id: string;
  number: string;
  floor?: number;
  surface?: number;
  type?: string;
  tantiemes?: number;
  ownerId?: string;
  ownerName?: string;
  buildingId?: string;
  buildingName?: string;
  buildingAddress?: string;
  status?: string;
  parkingSpaces?: number;
  storageUnit?: boolean;
  notes?: string;
};

type Appel = {
  id: string;
  period: string;
  type: string;
  amount: number;
  dueDate?: string;
  status: string;
  paidDate?: string;
  receiptNumber?: string;
};

const TYPE_LABELS: Record<string, string> = {
  appartement: "lotTypeApartment",
  commerce: "lotTypeCommerce",
  parking: "lotTypeParking",
  bureau: "lotTypeOffice",
  storage: "lotTypeStorage",
};

const CHARGE_TYPE_LABELS: Record<string, string> = {
  charges_courantes: "typeChargesCourantes",
  fonds_reserve: "typeFondsReserve",
  appel_special: "typeAppelSpecial",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  paid: "#10b981",
  overdue: "#ef4444",
  partial: "#f97316",
};

// Mon Lot — personal apartment details for co-owners and governance members (who are also co-owners).
// Super Admin and tenants do not have a lot — they are blocked.
export default function MonLotScreen() {
  return (
    <RoleGuard allow={["member", "president", "treasurer", "secretary", "committee_member", "syndicate_admin"]}>
      <MonLotScreenInner />
    </RoleGuard>
  );
}

function MonLotScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const [lot, setLot] = useState<Lot | null>(null);
  const [appels, setAppels] = useState<Appel[]>([]);
  const [loading, setLoading] = useState(true);
  const [lotLoadError, setLotLoadError] = useState(false);
  const [chargesLoadError, setChargesLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"info" | "charges" | "documents">("info");

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setLotLoadError(false);
        setChargesLoadError(false);
      }
      const [lotData, appelsData] = await Promise.allSettled([
        apiRequest("/lots/my-lot", "GET", undefined, token),
        apiRequest("/appels-de-fonds", "GET", undefined, token),
      ]);

      if (lotData.status === "fulfilled") {
        const raw: Record<string, unknown> = lotData.value?.data ?? lotData.value ?? null;
        if (raw) {
          setLot({
            ...raw,
            surface: (raw.surface ?? raw.surfaceM2) as number | undefined,
          } as Lot);
        }
      } else {
        setLotLoadError(true);
      }
      if (appelsData.status === "fulfilled") {
        setAppels(appelsData.value?.data ?? []);
      } else {
        setChargesLoadError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const totalCharges = appels.reduce((s, a) => s + a.amount, 0);
  const paidCharges = appels.filter((a) => a.status === "paid").reduce((s, a) => s + a.amount, 0);
  const pendingCharges = appels.filter((a) => a.status === "pending" || a.status === "overdue").reduce((s, a) => s + a.amount, 0);
  const paymentRate = totalCharges > 0 ? Math.round((paidCharges / totalCharges) * 100) : 0;

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <LoadingState
          title={t("monLotLoadingTitle")}
          description={t("monLotLoadingDescription")}
          accentColor={colors.primary}
        />
      </View>
    );
  }

  if (lotLoadError) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ErrorState
          title={t("monLotUnavailableTitle")}
          description={t("monLotUnavailableDescription")}
          retryLabel={t("retry")}
          onRetry={() => void load()}
          accentColor={colors.primary}
        />
      </View>
    );
  }

  if (!lot) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { backgroundColor: colors.primary, paddingTop: topPad + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{t("monAppartement")}</Text>
        </View>
        <ScrollView
          contentContainerStyle={s.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <View style={[s.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.emptyIcon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="home" size={32} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t("monLotNoUnitTitle")}</Text>
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              {t("monLotNoUnitDescription")}
            </Text>
            <TouchableOpacity
              style={[s.contactBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/support" as any)}
            >
              <Feather name="headphones" size={16} color="#fff" />
              <Text style={s.contactBtnText}>{t("contactSupport")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.primary, paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t("lotLabel")} {lot.number}</Text>
          <Text style={s.headerSub}>{lot.buildingName ?? t("monAppartement")}</Text>
        </View>
        <TouchableOpacity
          style={s.supportIconBtn}
          onPress={() => router.push("/support" as any)}
          accessibilityLabel={t("contactSupport")}
        >
          <Feather name="headphones" size={18} color="#fff" />
        </TouchableOpacity>
        <View style={[s.lotTypeBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
          <Text style={s.lotTypeBadgeText}>{t(TYPE_LABELS[lot.type ?? ""] ?? "lotTypeHousing")}</Text>
        </View>
      </View>

      {/* Quick stats */}
      <View style={[s.statsStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {[
          { label: "surface", value: lot.surface ? `${lot.surface} m²` : t("na"), icon: "maximize-2" as const, color: colors.primary },
          { label: "floor", value: lot.floor !== undefined ? `${lot.floor}` : t("na"), icon: "layers" as const, color: "#3b82f6" },
          { label: "tantiemes", value: lot.tantiemes ? `${lot.tantiemes}/1000` : t("na"), icon: "percent" as const, color: "#f59e0b" },
          { label: "balanceDue", value: pendingCharges > 0 ? `${pendingCharges.toLocaleString("fr-MA")} MAD` : "0 MAD", icon: "credit-card" as const, color: pendingCharges > 0 ? "#ef4444" : "#10b981" },
        ].map((st, i, arr) => (
          <View key={st.label} style={[s.statCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Feather name={st.icon} size={14} color={st.color} />
            <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
            <Text style={[s.statLab, { color: colors.mutedForeground }]}>{t(st.label)}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["info", "charges", "documents"] as const).map((tabKey) => {
          const labels = { info: "information", charges: "charges", documents: "documents" };
          const icons: Record<string, keyof typeof Feather.glyphMap> = { info: "home", charges: "credit-card", documents: "folder" };
          return (
            <TouchableOpacity
              key={tabKey}
              style={[s.tabBtn, tab === tabKey && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(tabKey)}
            >
              <Feather name={icons[tabKey]} size={14} color={tab === tabKey ? colors.primary : colors.mutedForeground} />
              <Text style={[s.tabLabel, { color: tab === tabKey ? colors.primary : colors.mutedForeground }]}>{t(labels[tabKey])}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
        showsVerticalScrollIndicator={false}
      >
        {tab === "info" && (
          <>
            <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("lotDetail")}</Text>
              {[
                { label: "lotNumber", value: lot.number },
                { label: "lotType", value: t(TYPE_LABELS[lot.type ?? ""] ?? "lotTypeHousing") },
                { label: "floor", value: lot.floor !== undefined ? `${t("floor")} ${lot.floor}` : t("na") },
                { label: "surface", value: lot.surface ? `${lot.surface} m²` : t("na") },
                { label: "tantiemes", value: lot.tantiemes ? `${lot.tantiemes} / 1000` : t("na") },
                { label: "parkingSpaces", value: lot.parkingSpaces ? `${lot.parkingSpaces}` : "0" },
                { label: "storage", value: lot.storageUnit ? t("yes") : t("no") },
                { label: "status", value: lot.status === "occupied" ? t("lotStatusOccupied") : lot.status === "vacant" ? t("lotStatusVacant") : lot.status ?? t("na") },
              ].map((row, i) => (
                <View key={row.label}>
                  {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                  <View style={s.infoRow}>
                    <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                    <Text style={[s.infoValue, { color: colors.foreground }]}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("building")}</Text>
              {[
                { label: "residence", value: lot.buildingName ?? t("na") },
                { label: "address", value: lot.buildingAddress ?? t("na") },
              ].map((row, i) => (
                <View key={row.label}>
                  {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                  <View style={s.infoRow}>
                    <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                    <Text style={[s.infoValue, { color: colors.foreground }]}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            {lot.notes ? (
              <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.cardTitle, { color: colors.foreground }]}>{t("notes")}</Text>
                <Text style={[s.notes, { color: colors.mutedForeground }]}>{lot.notes}</Text>
              </View>
            ) : null}

            <View style={s.quickActions}>
              {[
                { label: "reportIncident", icon: "alert-triangle" as const, color: "#ef4444", route: "/sinistres" },
                { label: "requestIntervention", icon: "tool" as const, color: "#f59e0b", route: "/travaux" },
                { label: "contactSupport", icon: "headphones" as const, color: "#ef4444", route: "/support" },
                { label: "contactSyndic", icon: "message-circle" as const, color: "#3b82f6", route: "/chat" },
                { label: "myDocuments", icon: "folder" as const, color: "#6366f1", route: "/documents" },
              ].map((action) => (
                <TouchableOpacity
                  key={action.label}
                  style={[s.quickActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push(action.route as any)}
                  activeOpacity={0.8}
                >
                  <View style={[s.quickActionIcon, { backgroundColor: action.color + "18" }]}>
                    <Feather name={action.icon} size={18} color={action.color} />
                  </View>
                  <Text style={[s.quickActionLabel, { color: colors.foreground }]}>{t(action.label)}</Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {tab === "charges" && (
          <>
            <View style={[s.chargesSummary, { backgroundColor: "#2563EB12", borderColor: "#2563EB30" }]}>
              <View style={s.chargesSummaryRow}>
                <View style={s.chargesSumCell}>
                  <Text style={[s.chargesSumVal, { color: colors.foreground }]}>{totalCharges.toLocaleString("fr-MA")}</Text>
                   <Text style={[s.chargesSumLab, { color: colors.mutedForeground }]}>{t("totalAppele")} (MAD)</Text>
                </View>
                <View style={[s.chargeSumDivider, { backgroundColor: "#2563EB30" }]} />
                <View style={s.chargesSumCell}>
                  <Text style={[s.chargesSumVal, { color: "#10b981" }]}>{paidCharges.toLocaleString("fr-MA")}</Text>
                   <Text style={[s.chargesSumLab, { color: colors.mutedForeground }]}>{t("recovered")} (MAD)</Text>
                </View>
                <View style={[s.chargeSumDivider, { backgroundColor: "#2563EB30" }]} />
                <View style={s.chargesSumCell}>
                  <Text style={[s.chargesSumVal, { color: pendingCharges > 0 ? "#ef4444" : "#10b981" }]}>
                    {pendingCharges.toLocaleString("fr-MA")}
                  </Text>
                   <Text style={[s.chargesSumLab, { color: colors.mutedForeground }]}>{t("balanceDue")} (MAD)</Text>
                </View>
              </View>
              <View style={[s.progressBg, { backgroundColor: "#2563EB20" }]}>
                <View style={[s.progressFill, { width: `${paymentRate}%` as any, backgroundColor: paymentRate > 80 ? "#10b981" : paymentRate > 50 ? "#f59e0b" : "#ef4444" }]} />
              </View>
               <Text style={[s.progressLabel, { color: "#2563EB" }]}>{t("paymentRate")}: {paymentRate}%</Text>
            </View>

            {chargesLoadError ? (
              <ErrorState
                title={t("monLotChargesUnavailableTitle")}
                description={t("monLotChargesUnavailableDescription")}
                retryLabel={t("retry")}
                onRetry={() => void load()}
                accentColor="#2563EB"
              />
            ) : appels.length === 0 ? (
              <View style={s.emptyBox2}>
                <Feather name="credit-card" size={32} color={colors.mutedForeground} />
                <Text style={[s.emptyText2, { color: colors.mutedForeground }]}>{t("noChargesFound")}</Text>
              </View>
            ) : (
              appels.map((appel) => {
                const statusColor = STATUS_COLORS[appel.status] ?? "#6b7280";
                return (
                  <View key={appel.id} style={[s.chargeCard, { backgroundColor: colors.card, borderColor: appel.status === "overdue" ? "#ef444430" : colors.border, borderLeftWidth: appel.status === "overdue" ? 4 : 1, borderLeftColor: appel.status === "overdue" ? "#ef4444" : colors.border }]}>
                    <View style={s.chargeCardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.chargePeriod, { color: colors.foreground }]}>{appel.period}</Text>
                        <Text style={[s.chargeType, { color: colors.mutedForeground }]}>{t(CHARGE_TYPE_LABELS[appel.type] ?? "chargeType")}</Text>
                        {appel.dueDate ? <Text style={[s.chargeDue, { color: colors.mutedForeground }]}>{t("dueDate")}: {appel.dueDate}</Text> : null}
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={[s.chargeAmount, { color: colors.foreground }]}>{appel.amount.toLocaleString("fr-MA")} MAD</Text>
                        <View style={[s.chargeBadge, { backgroundColor: statusColor + "18" }]}>
                          <Text style={[s.chargeBadgeText, { color: statusColor }]}>
                            {appel.status === "paid" ? t("statusPaid") : appel.status === "pending" ? t("statusPending") : appel.status === "overdue" ? t("statusLate") : appel.status === "partial" ? t("statusPartial") : appel.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {appel.status === "paid" && appel.receiptNumber ? (
                      <View style={[s.receiptRow, { borderTopColor: colors.border }]}>
                        <Feather name="check-circle" size={11} color="#10b981" />
                        <Text style={[s.receiptText, { color: "#10b981" }]}>{t("paymentReceiptLabel")} {appel.receiptNumber} — {appel.paidDate}</Text>
                      </View>
                    ) : null}
                    {(appel.status === "pending" || appel.status === "overdue") ? (
                      <TouchableOpacity
                        style={[s.payBtn, { backgroundColor: "#2563EB" }]}
                        onPress={() => router.push("/charges" as any)}
                      >
                        <Feather name="credit-card" size={14} color="#fff" />
                        <Text style={s.payBtnText}>{t("payCharge")}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        )}

        {tab === "documents" && (
          <View style={[s.emptyBox2, { paddingVertical: 40 }]}>
            <Feather name="folder" size={36} color={colors.mutedForeground} />
            <Text style={[s.emptyText2, { color: colors.mutedForeground }]}>{t("monLotDocumentsDescription")}</Text>
            <TouchableOpacity style={[s.contactBtn, { backgroundColor: "#2563EB", marginTop: 8 }]} onPress={() => router.push("/documents" as any)}>
              <Feather name="folder" size={16} color="#fff" />
              <Text style={s.contactBtnText}>{t("viewDocuments")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  supportIconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  lotTypeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  lotTypeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  statsStrip: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 2 },
  statVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 9, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12 },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyContainer: { padding: 24, flex: 1, justifyContent: "center" },
  emptyBox: { borderRadius: 20, borderWidth: 1, padding: 28, alignItems: "center", gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  contactBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", paddingHorizontal: 16, gap: 0 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", paddingTop: 14, paddingBottom: 4 },
  sep: { height: StyleSheet.hairlineWidth },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 11 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1 },
  notes: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, paddingBottom: 14 },
  quickActions: { gap: 8 },
  quickActionBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  quickActionIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  chargesSummary: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  chargesSummaryRow: { flexDirection: "row" },
  chargesSumCell: { flex: 1, alignItems: "center" },
  chargesSumVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  chargesSumLab: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
  chargeSumDivider: { width: 1, marginHorizontal: 4 },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  chargeCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  chargeCardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  chargePeriod: { fontSize: 15, fontFamily: "Inter_700Bold" },
  chargeType: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  chargeDue: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  chargeAmount: { fontSize: 17, fontFamily: "Inter_700Bold" },
  chargeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chargeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  receiptText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 10 },
  payBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyBox2: { alignItems: "center", gap: 10, paddingVertical: 30 },
  emptyText2: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
