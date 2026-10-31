import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { useFormat } from "@/hooks/useFormat";
import { useCallStatus } from "@/hooks/useCallStatus";
import { apiRequest } from "@/lib/api";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import EmptyState from "@/components/EmptyState";
import { ErrorState, LoadingState } from "@/components/DataState";
import { BalanceMeter, Button, Card, ListItem, SectionHeader, StatusBadge, ZelligePattern, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";

type Lot = {
  id: string;
  number: string;
  floor?: number | null;
  surface?: number | null;
  type?: string;
  tantiemes?: number | null;
  buildingName?: string;
  buildingAddress?: string;
  status?: string;
  parkingSpaces?: number;
  storageUnit?: boolean;
  notes?: string;
  lotIds?: string[];
};

/** A call for funds as returned by GET /appels-de-fonds (amounts are decimal strings). */
type Appel = {
  id: string;
  period: string;
  type: string;
  amount: string | number;
  amountPaid?: string | number;
  remaining?: string | number;
  dueDate?: string;
  status: string;
  paidDate?: string;
  receiptNumber?: string;
  lotNumber?: string | null;
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

type FeatherName = keyof typeof Feather.glyphMap;
type Tab = "info" | "charges" | "documents";

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
  const { token, user } = useAuth();
  const { t, isRTL } = useLanguage();
  const { money, date } = useFormat();
  const callStatus = useCallStatus();
  const { isWide } = useBreakpoints();

  const [lot, setLot] = useState<Lot | null>(null);
  const [appels, setAppels] = useState<Appel[]>([]);
  const [loading, setLoading] = useState(true);
  const [lotLoadError, setLotLoadError] = useState(false);
  const [chargesLoadError, setChargesLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("info");

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setLotLoadError(false);
          setChargesLoadError(false);
        }
        let loaded: Lot | null = null;
        try {
          const res = await apiRequest("/lots/my-lot", "GET", undefined, token);
          const raw: Record<string, unknown> | null = res?.data ?? res ?? null;
          loaded = raw ? ({ ...raw, surface: (raw.surface ?? raw.surfaceM2) as number | undefined } as Lot) : null;
          setLot(loaded);
          setLotLoadError(false);
        } catch (e: any) {
          // 404 = no lot linked to this account (empty state), anything else is an error.
          if (e?.httpStatus === 404) setLot(null);
          else setLotLoadError(true);
        }

        try {
          if (user?.role === "member") {
            // The server scopes the list to the calls issued to this co-owner.
            const res = await apiRequest("/appels-de-fonds", "GET", undefined, token);
            setAppels(res?.data ?? []);
          } else if (loaded?.lotIds?.length) {
            // Team roles see the whole syndicate on /appels-de-fonds: keep only this person's lots.
            const parts = await Promise.all(
              loaded.lotIds.map((id) => apiRequest(`/appels-de-fonds?lotId=${encodeURIComponent(id)}`, "GET", undefined, token)),
            );
            setAppels(parts.flatMap((p) => p?.data ?? []));
          } else {
            setAppels([]);
          }
          setChargesLoadError(false);
        } catch {
          setChargesLoadError(true);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, user?.role],
  );

  useEffect(() => {
    load();
  }, [load]);
  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  // Totals from the server's own figures (validated payments only); cancelled calls are not owed.
  const live = appels.filter((a) => a.status !== "cancelled");
  const totalCharges = live.reduce((s, a) => s + Number(a.amount), 0);
  const paidCharges = live.reduce((s, a) => s + Number(a.amountPaid ?? 0), 0);
  const dueCharges = live.reduce((s, a) => s + Number(a.remaining ?? Number(a.amount) - Number(a.amountPaid ?? 0)), 0);
  const hasOverdue = live.some((a) => a.status === "overdue");

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <LoadingState title={t("monLotLoadingTitle")} description={t("monLotLoadingDescription")} accentColor={colors.primary} />
      </View>
    );
  }

  if (lotLoadError) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("monAppartement")} />
        <ErrorState title={t("monLotUnavailableTitle")} description={t("monLotUnavailableDescription")} retryLabel={t("retry")} onRetry={() => void load()} accentColor={colors.primary} />
      </View>
    );
  }

  if (!lot) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("monAppartement")} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          <EmptyState icon="home" title={t("monLotNoUnitTitle")} description={t("monLotNoUnitDescription")} actionLabel={t("contactSupport")} onAction={() => router.push("/support" as any)} />
        </ScrollView>
      </View>
    );
  }

  const typeLabel = t(TYPE_LABELS[lot.type ?? ""] ?? "lotTypeHousing");
  const statusLabel = lot.status === "occupied" ? t("lotStatusOccupied") : lot.status === "vacant" ? t("lotStatusVacant") : lot.status;
  const has = (v: unknown) => v !== undefined && v !== null && v !== "";

  const FACTS: { icon: FeatherName; label: string; value: string }[] = [
    ...(has(lot.surface) ? [{ icon: "maximize-2" as FeatherName, label: t("surface"), value: `${lot.surface} m²` }] : []),
    ...(has(lot.floor) ? [{ icon: "layers" as FeatherName, label: t("floor"), value: String(lot.floor) }] : []),
    // Shown as stored: the building's total of shares is not part of this response.
    ...(has(lot.tantiemes) ? [{ icon: "percent" as FeatherName, label: t("tantiemes"), value: String(lot.tantiemes) }] : []),
  ];

  const ACTIONS: { label: string; icon: FeatherName; tone: StatusTone; route: string }[] = [
    { label: t("reportIncident"), icon: "alert-triangle", tone: "danger", route: "/sinistres" },
    { label: t("requestIntervention"), icon: "tool", tone: "warning", route: "/travaux" },
    { label: t("contactSyndic"), icon: "message-circle", tone: "info", route: "/chat" },
    { label: t("contactSupport"), icon: "headphones", tone: "neutral", route: "/support" },
  ];

  const TABS: { key: Tab; label: string; icon: FeatherName }[] = [
    { key: "info", label: t("information"), icon: "home" },
    { key: "charges", label: t("charges"), icon: "credit-card" },
    { key: "documents", label: t("documents"), icon: "folder" },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader title={`${t("lotLabel")} ${lot.number}`} subtitle={lot.buildingName ?? t("monAppartement")} />

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero: the lot at a glance */}
        <View style={[s.hero, { backgroundColor: colors.navy }]}>
          <ZelligePattern opacity={0.06} />
          <View style={s.heroTop}>
            <View style={[s.heroIcon, { backgroundColor: "rgba(255,255,255,0.1)" }]}>
              <Feather name="home" size={22} color={colors.gold} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[TYPE.caption, { color: "rgba(255,255,255,0.7)", textAlign: "auto" }]}>{typeLabel}</Text>
              <Text style={[TYPE.title, { color: "#fff", textAlign: "auto" }]} numberOfLines={1}>
                {t("lotLabel")} {lot.number}
              </Text>
            </View>
            {statusLabel ? <StatusBadge label={statusLabel} tone={lot.status === "occupied" ? "success" : "neutral"} icon={null} /> : null}
          </View>
          {lot.buildingAddress ? (
            <View style={s.heroAddr}>
              <Feather name="map-pin" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={[TYPE.secondary, { color: "rgba(255,255,255,0.8)", flex: 1, textAlign: "auto" }]} numberOfLines={2}>
                {lot.buildingAddress}
              </Text>
            </View>
          ) : null}
          {FACTS.length ? (
            <View style={[s.facts, { borderTopColor: "rgba(255,255,255,0.14)" }]}>
              {FACTS.map((f) => (
                <View key={f.label} style={s.fact}>
                  <Text style={[TYPE.subtitle, { color: "#fff" }]}>{f.value}</Text>
                  <Text style={[TYPE.caption, { color: "rgba(255,255,255,0.65)" }]}>{f.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* Tabs */}
        <View style={[s.segment, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="tablist">
          {TABS.map((tb) => {
            const active = tab === tb.key;
            return (
              <Pressable
                key={tb.key}
                onPress={() => setTab(tb.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[s.segBtn, active && { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name={tb.icon} size={14} color={active ? colors.primary : colors.textMuted} />
                <Text style={[TYPE.label, { color: active ? colors.foreground : colors.textMuted }]} numberOfLines={1}>
                  {tb.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "info" && (
          <>
            <View style={s.group}>
              <SectionHeader title={t("lotDetail")} />
              <Card padding="none">
                <ListItem icon="hash" title={lot.number} subtitle={t("lotNumber")} divider />
                <ListItem icon="tag" title={typeLabel} subtitle={t("lotType")} divider />
                <ListItem icon="truck" title={String(lot.parkingSpaces ?? 0)} subtitle={t("parkingSpaces")} divider />
                <ListItem icon="archive" title={lot.storageUnit ? t("yes") : t("no")} subtitle={t("storage")} divider={!!lot.buildingName} />
                {lot.buildingName ? <ListItem icon="map" title={lot.buildingName} subtitle={t("residence")} /> : null}
              </Card>
            </View>

            {lot.notes ? (
              <View style={s.group}>
                <SectionHeader title={t("uiNotes")} />
                <Card padding="md">
                  <Text style={[TYPE.body, { color: colors.textSecondary, textAlign: "auto" }]}>{lot.notes}</Text>
                </Card>
              </View>
            ) : null}

            <View style={s.group}>
              <SectionHeader title={t("profileQuickActions")} />
              <View style={s.grid}>
                {ACTIONS.map((a) => {
                  const tc = toneColors(colors, a.tone);
                  return (
                    <Pressable
                      key={a.route}
                      onPress={() => router.push(a.route as any)}
                      accessibilityRole="button"
                      style={({ pressed }) => [s.tile, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <View style={[s.tileIcon, { backgroundColor: tc.bg }]}>
                        <Feather name={a.icon} size={18} color={tc.fg} />
                      </View>
                      <Text style={[TYPE.label, { color: colors.foreground, flex: 1, textAlign: "auto" }]} numberOfLines={2}>
                        {a.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {tab === "charges" && (
          <>
            {chargesLoadError ? (
              <ErrorState title={t("monLotChargesUnavailableTitle")} description={t("monLotChargesUnavailableDescription")} retryLabel={t("retry")} onRetry={() => void load()} accentColor={colors.primary} />
            ) : live.length === 0 ? (
              <EmptyState icon="credit-card" title={t("noChargesFound")} />
            ) : (
              <>
                <Card padding="lg" style={{ gap: 14 }}>
                  <View style={s.sumRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("balanceDue")}</Text>
                      <Text style={[TYPE.display, { color: dueCharges > 0 ? (hasOverdue ? colors.danger : colors.foreground) : colors.success }]}>{money(dueCharges)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("totalAppele")}</Text>
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{money(totalCharges)}</Text>
                    </View>
                  </View>
                  <BalanceMeter
                    paid={paidCharges}
                    total={totalCharges}
                    paidLabel={t("recovered")}
                    remainingLabel={t("balanceDue")}
                    paidText={money(paidCharges)}
                    remainingText={money(dueCharges)}
                    overdue={hasOverdue}
                  />
                  {dueCharges > 0 ? <Button label={t("payCharge")} icon="credit-card" fullWidth onPress={() => router.push("/charges" as any)} /> : null}
                </Card>

                <Card padding="none">
                  {appels.map((appel, i) => {
                    const st = callStatus(appel.status);
                    const remaining = Number(appel.remaining ?? 0);
                    const meta = [
                      t(CHARGE_TYPE_LABELS[appel.type] ?? "chargeType"),
                      appel.lotNumber && appel.lotNumber !== lot.number ? `${t("lotLabel")} ${appel.lotNumber}` : null,
                      appel.dueDate ? `${t("dueDate")} ${date(appel.dueDate)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <View key={appel.id} style={i < appels.length - 1 ? [s.callRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }] : s.callRow}>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                          <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "auto" }]}>{appel.period}</Text>
                          <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]} numberOfLines={2}>
                            {meta}
                          </Text>
                          {appel.receiptNumber && (appel.status === "paid" || appel.status === "partially_paid") ? (
                            <Text style={[TYPE.caption, { color: colors.successText, textAlign: "auto" }]}>
                              {t("paymentReceiptLabel")} {appel.receiptNumber}
                              {appel.paidDate ? ` — ${date(appel.paidDate)}` : ""}
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 6 }}>
                          <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{money(appel.amount)}</Text>
                          {appel.status === "partially_paid" && remaining > 0 ? (
                            <Text style={[TYPE.caption, { color: colors.textMuted }]}>
                              {t("balanceDue")} {money(remaining)}
                            </Text>
                          ) : null}
                          <StatusBadge label={st.label} tone={st.tone} icon={st.icon} />
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </>
            )}
          </>
        )}

        {tab === "documents" && (
          <Card padding="lg" style={{ alignItems: "center", gap: 12 }}>
            <View style={[s.docIcon, { backgroundColor: colors.primarySoft }]}>
              <Feather name="folder" size={26} color={colors.primary} />
            </View>
            <Text style={[TYPE.body, { color: colors.textSecondary, textAlign: "center" }]}>{t("monLotDocumentsDescription")}</Text>
            <Button label={t("viewDocuments")} icon="folder" onPress={() => router.push("/bibliotheque" as any)} />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  hero: { borderRadius: RADIUS.LG, padding: 18, gap: 12, overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroAddr: { flexDirection: "row", alignItems: "center", gap: 6 },
  facts: { flexDirection: "row", borderTopWidth: 1, paddingTop: 12 },
  fact: { flex: 1, alignItems: "center", gap: 2 },
  segment: { flexDirection: "row", borderRadius: RADIUS.MD, padding: 4, gap: 4 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, borderRadius: RADIUS.SM, borderWidth: 1, borderColor: "transparent" },
  group: { gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexBasis: "47%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: RADIUS.LG, padding: 12, minHeight: 64 },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sumRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  callRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  docIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
