import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BalanceLine, Button, Card, ListItem, PageHeader, SectionHeader, Skeleton, type StatusTone } from "@/components/ui";
import { SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { apiRequest } from "@/lib/api";

type Money = { currency: string; amount: string };
type TreasurySummary = {
  accountsConfigured: boolean;
  pendingPayments: { count: number; total: string };
  expenses: { toApprove: number; toPay: number; toPayTotal: string };
  statementLinesToReview: number;
  overview: {
    period: { from: string; to: string };
    currency: string;
    cashBalance: Money[];
    receivables: { amount: string; currency: string; calls: number };
    overdueReceivables: { amount: string; currency: string };
    collectionRate: number | null;
  };
};

// Roles allowed by the API on /treasury/summary (finance tab roles minus super admin).
const SUMMARY_ROLES = new Set(["syndicate_admin", "treasurer", "president"]);

export default function FinanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const { money, date } = useFormat();

  // Treasurer: primary finance operator; president: full financial visibility.
  const isAdmin =
    user?.role === "super_admin" ||
    user?.role === "syndicate_admin" ||
    user?.role === "treasurer" ||
    user?.role === "president";
  const canSeeSummary = !!user?.syndicateId && SUMMARY_ROLES.has(user?.role ?? "");

  // Same figures as the treasury and the reports (server definitions).
  const summary = useQuery({
    queryKey: ["treasury-summary"],
    enabled: canSeeSummary,
    staleTime: 30_000,
    queryFn: async () => (await apiRequest<{ data: TreasurySummary }>("/treasury/summary")).data,
  });

  const ADMIN_ITEMS: { label: string; sub: string; icon: keyof typeof Feather.glyphMap; route: string; tone: StatusTone }[] = [
    { label: t("financeBoardTitle"), sub: t("financeBoardSub"), icon: "bar-chart-2", route: "/tableau-bord-financier", tone: "primary" },
    { label: t("chargesAppels"), sub: t("chargesAppelsSub"), icon: "credit-card", route: "/charges", tone: "success" },
    { label: t("budgetPrevisionnel"), sub: t("budgetPrevSub"), icon: "pie-chart", route: "/budget-previsionnel", tone: "info" },
    { label: t("travauxChantiersLabel"), sub: t("travauxChantiersSub"), icon: "tool", route: "/travaux", tone: "warning" },
    { label: t("prestatairesContrats"), sub: t("prestatairesContratsSub"), icon: "briefcase", route: "/prestataires", tone: "primary" },
    { label: t("documentsFinanciers"), sub: t("documentsFinanciersSub"), icon: "folder", route: "/documents", tone: "neutral" },
  ];
  const MEMBER_ITEMS: typeof ADMIN_ITEMS = [
    { label: t("mesChargesLabel"), sub: t("mesChargesSub"), icon: "credit-card", route: "/charges", tone: "success" },
    { label: t("monAppartement"), sub: t("monAppartementSub"), icon: "home", route: "/mon-lot", tone: "primary" },
    { label: t("documents"), sub: t("documentsMemberSub"), icon: "folder", route: "/documents", tone: "neutral" },
    { label: t("travauxEnCours"), sub: t("travauxEnCoursSub"), icon: "tool", route: "/travaux", tone: "warning" },
  ];
  const items = isAdmin ? ADMIN_ITEMS : MEMBER_ITEMS;

  const s = summary.data;
  const ov = s?.overview;
  const cash = ov?.cashBalance.find((m) => m.currency === ov.currency) ?? ov?.cashBalance[0];
  const n = (key: string, v: number) => t(key).replace("{n}", String(v));
  const todo = s
    ? [
        s.pendingPayments.count > 0 && { key: "pay", icon: "check-square" as const, tone: "info" as StatusTone, title: n("uiPaymentsToValidate", s.pendingPayments.count), subtitle: money(s.pendingPayments.total), route: "/charges" },
        s.expenses.toApprove > 0 && { key: "exp", icon: "file-text" as const, tone: "warning" as StatusTone, title: n("uiExpensesToApprove", s.expenses.toApprove), route: "/tresorerie" },
        s.expenses.toPay > 0 && { key: "topay", icon: "send" as const, tone: "warning" as StatusTone, title: n("uiExpensesToPay", s.expenses.toPay), subtitle: money(s.expenses.toPayTotal), route: "/tresorerie" },
        s.statementLinesToReview > 0 && { key: "lines", icon: "git-pull-request" as const, tone: "neutral" as StatusTone, title: n("uiLinesToReview", s.statementLinesToReview), route: "/tresorerie" },
      ].filter(Boolean) as { key: string; icon: keyof typeof Feather.glyphMap; tone: StatusTone; title: string; subtitle?: string; route: string }[]
    : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <PageHeader title={t("finance")} subtitle={isAdmin ? t("financeAdminSub") : t("financeMemberSub")} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: isWide ? 32 : insets.bottom + 104 }]}
        refreshControl={
          canSeeSummary ? (
            <RefreshControl refreshing={summary.isRefetching} onRefresh={() => { void summary.refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />
          ) : undefined
        }
      >
        {canSeeSummary ? (
          <View style={styles.section}>
            {summary.isLoading ? (
              <Card padding="lg" elevation="raised" style={{ gap: 12 }}>
                <Skeleton width="40%" height={12} />
                <Skeleton width="65%" height={32} />
                <Skeleton height={8} />
                <View style={styles.row}>
                  <Skeleton height={40} style={{ flex: 1 }} />
                  <Skeleton height={40} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : summary.isError || !s || !ov ? (
              <Card padding="md" style={[styles.errorCard, { backgroundColor: colors.dangerSoft, borderColor: colors.danger + "40" }]}>
                <Feather name="wifi-off" size={18} color={colors.danger} />
                <Text style={[TYPE.bodyStrong, { color: colors.dangerText, flex: 1 }]}>{t("uiLoadError")}</Text>
                <Button label={t("uiRetry")} size="sm" variant="secondary" onPress={() => summary.refetch()} />
              </Card>
            ) : (
              <Card padding="lg" elevation="raised" onPress={() => router.push("/tresorerie" as any)} accessibilityLabel={`${t("uiCashBalance")}: ${cash ? money(cash.amount, { currency: cash.currency }) : "—"}`}>
                <Text style={[TYPE.overline, { color: colors.textMuted }]}>{t("uiCashBalance").toLocaleUpperCase()}</Text>
                <Text style={[TYPE.display, { color: colors.foreground, fontVariant: ["tabular-nums"], marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {cash ? money(cash.amount, { currency: cash.currency }) : "—"}
                </Text>
                <Text style={[TYPE.caption, { color: colors.textMuted }]}>
                  {t("uiPeriodRange").replace("{from}", date(ov.period.from)).replace("{to}", date(ov.period.to))}
                </Text>
                {!s.accountsConfigured ? (
                  <View style={[styles.note, { backgroundColor: colors.warningSoft }]}>
                    <Feather name="alert-triangle" size={14} color={colors.warning} />
                    <Text style={[TYPE.caption, { color: colors.warningText, flex: 1 }]}>{t("uiNoAccounts")}</Text>
                  </View>
                ) : null}
                <BalanceLine style={{ marginVertical: SPACING.MD }} />
                <View style={styles.row}>
                  <Figure label={t("uiReceivables")} value={money(ov.receivables.amount, { currency: ov.receivables.currency })} sub={n("uiCalls", ov.receivables.calls)} />
                  <Figure
                    label={t("uiOverdueShare")}
                    value={money(ov.overdueReceivables.amount, { currency: ov.overdueReceivables.currency })}
                    tone={Number(ov.overdueReceivables.amount) > 0 ? "danger" : undefined}
                  />
                  {ov.collectionRate != null ? <Figure label={t("collectionRate")} value={`${ov.collectionRate} %`} /> : null}
                </View>
                <Text style={[TYPE.caption, { color: colors.textMuted, marginTop: SPACING.MD }]}>{t("uiNotDuePending")}</Text>
              </Card>
            )}

            {todo.length > 0 ? (
              <>
                <SectionHeader title={t("uiToProcess")} />
                <Card padding="none">
                  {todo.map((x, i) => (
                    <ListItem key={x.key} icon={x.icon} iconTone={x.tone} title={x.title} subtitle={x.subtitle} onPress={() => router.push(x.route as any)} chevron divider={i < todo.length - 1} />
                  ))}
                </Card>
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title={t("financeModules")} />
          <Card padding="none">
            {items.map((item, i) => (
              <ListItem
                key={item.route}
                icon={item.icon}
                iconTone={item.tone}
                title={item.label}
                subtitle={item.sub}
                onPress={() => router.push(item.route as any)}
                chevron
                divider={i < items.length - 1}
              />
            ))}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

/** One figure of the summary card: label, amount (tabular), optional note. */
function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: StatusTone }) {
  const colors = useColors();
  return (
    <View style={styles.figure} accessible accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ""}`}>
      <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[TYPE.amount, { color: tone === "danger" ? colors.dangerText : colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {sub ? (
        <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: SPACING.XL },
  section: { gap: SPACING.MD },
  // Amounts are never cut: on a narrow phone the figures wrap to a second row
  // (font shrinking is not available on the web and partial on Android).
  row: { flexDirection: "row", flexWrap: "wrap", rowGap: SPACING.MD, columnGap: SPACING.MD },
  figure: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 2 },
  note: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, marginTop: SPACING.SM },
  errorCard: { flexDirection: "row", alignItems: "center", gap: 10 },
});
