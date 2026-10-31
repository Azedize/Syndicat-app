import { Feather } from "@/components/ui/Feather";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState } from "@/components/DataState";
import ExpenseDetailSheet from "@/components/ExpenseDetailSheet";
import ScreenHeader from "@/components/ScreenHeader";
import { BalanceMeter, Card, ListItem, SectionHeader, StatusBadge } from "@/components/ui";
import { RADIUS, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { apiRequest } from "@/lib/api";

type Finances = {
  year: number;
  budgets: { id: string; year: number; status: string; buildingName: string | null; totalAmount: string | null }[];
  accounts: { label: string; kind: string; balance: string }[];
  collection: { called: string; collected: string; rate: number | null };
  expenses: { id: string; date: string; label: string; category: string; amount: string; supplierName: string | null; buildingName: string | null; status: string; hasProof: boolean }[];
  salariesTotal: string;
};
type Execution = {
  lines: { id: string; category: string; label: string; planned: string; actual: string; committed: string; usedPercent: number | null }[];
  outsideBudget: { actual: string; committed: string };
  expenses: { planned: string; actual: string; committed: string };
};

/**
 * The condominium's finances, as every co-owner may see them: the budget
 * adopted in general meeting and its execution, the balance of the accounts,
 * this year's collection and the expenses with their supporting documents.
 * Read-only and impersonal (GET /transparency/finances): no neighbour's
 * payment status is shown.
 */
export default function FinancesResidenceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const fmt = useFormat();
  const [openBudget, setOpenBudget] = useState<string | null>(null);
  const [openExpense, setOpenExpense] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["transparency-finances"],
    queryFn: async () => (await apiRequest<{ data: Finances }>("/transparency/finances")).data,
  });
  const exec = useQuery({
    queryKey: ["budget-execution", openBudget],
    enabled: !!openBudget,
    queryFn: async () => (await apiRequest<{ data: Execution }>(`/budgets/${openBudget}/execution`)).data,
  });

  const d = q.data;
  const called = Number(d?.collection.called ?? 0);
  const collected = Number(d?.collection.collected ?? 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader title={t("finResTitle")} subtitle={d ? t("finResSubtitle").replace("{year}", String(d.year)) : undefined} />
      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.tint} />
      ) : q.isError || !d ? (
        <ErrorState title={t("uiLoadErrorTitle")} description={t("uiLoadErrorHint")} retryLabel={t("retry")} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: SPACING.LG, gap: SPACING.XL, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { void q.refetch(); }} tintColor={colors.tint} />}
        >
          <View style={[styles.note, { backgroundColor: colors.infoSoft }]}>
            <Feather name="eye" size={16} color={colors.info} />
            <Text style={[TYPE.secondary, { color: colors.infoText, flex: 1 }]}>{t("finResPrivacyNote")}</Text>
          </View>

          {/* Collection of the year */}
          <View style={styles.section}>
            <SectionHeader eyebrow={String(d.year)} title={t("finResCollection")} />
            <Card padding="lg" elevation="raised">
              {called > 0 ? (
                <BalanceMeter
                  paid={collected}
                  total={called}
                  paidLabel={t("finResCollected")}
                  remainingLabel={t("finResOutstanding")}
                  paidText={fmt.money(collected)}
                  remainingText={fmt.money(Math.max(0, called - collected))}
                />
              ) : (
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("finResNoCalls")}</Text>
              )}
              {d.collection.rate !== null ? (
                <Text style={[TYPE.caption, { color: colors.textMuted, marginTop: SPACING.SM }]}>
                  {t("finResRate").replace("{rate}", fmt.number(d.collection.rate, 1))}
                </Text>
              ) : null}
            </Card>
          </View>

          {/* Accounts */}
          <View style={styles.section}>
            <SectionHeader title={t("finResAccounts")} />
            <Card padding="none">
              {d.accounts.length === 0 ? (
                <ListItem icon="briefcase" iconTone="neutral" title={t("finResNoAccount")} />
              ) : (
                d.accounts.map((a, i) => (
                  <ListItem
                    key={`${a.label}-${i}`}
                    icon={a.kind === "cash" ? "archive" : "briefcase"}
                    iconTone="primary"
                    title={a.label}
                    subtitle={a.kind === "cash" ? t("finResCash") : t("finResBank")}
                    trailing={<Text style={[TYPE.amount, { color: Number(a.balance) < 0 ? colors.dangerText : colors.foreground }]}>{fmt.money(a.balance)}</Text>}
                    divider={i < d.accounts.length - 1}
                  />
                ))
              )}
            </Card>
          </View>

          {/* Budgets adopted in general meeting */}
          <View style={styles.section}>
            <SectionHeader title={t("finResBudgets")} />
            {d.budgets.length === 0 ? (
              <Card padding="lg">
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("finResNoBudget")}</Text>
              </Card>
            ) : (
              d.budgets.map((b) => {
                const open = openBudget === b.id;
                return (
                  <Card key={b.id} padding="none">
                    <Pressable onPress={() => setOpenBudget(open ? null : b.id)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.budgetHead}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>
                          {t("finResBudgetOf").replace("{year}", String(b.year))}
                        </Text>
                        <Text style={[TYPE.caption, { color: colors.textMuted }]}>{b.buildingName ?? "—"} · {fmt.money(b.totalAmount)}</Text>
                      </View>
                      <StatusBadge label={b.status === "closed" ? t("finResClosed") : t("finResAdopted")} tone={b.status === "closed" ? "neutral" : "success"} />
                      <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                    </Pressable>
                    {open ? (
                      <View style={[styles.lines, { borderTopColor: colors.border }]}>
                        {exec.isLoading ? (
                          <ActivityIndicator color={colors.tint} />
                        ) : exec.isError || !exec.data ? (
                          <Text style={[TYPE.secondary, { color: colors.dangerText }]}>{t("uiLoadErrorTitle")}</Text>
                        ) : (
                          <>
                            {exec.data.lines.map((l) => {
                              const planned = Number(l.planned);
                              const used = Number(l.actual) + Number(l.committed);
                              const pct = planned > 0 ? Math.min(1, used / planned) : 0;
                              const over = planned > 0 && used > planned;
                              return (
                                <View key={l.id} style={styles.line}>
                                  <View style={styles.lineTop}>
                                    <Text style={[TYPE.bodyStrong, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>{l.label}</Text>
                                    <Text style={[TYPE.caption, { color: over ? colors.dangerText : colors.textMuted }]}>
                                      {fmt.money(used, { decimals: 0 })} / {fmt.money(planned, { decimals: 0 })}
                                    </Text>
                                  </View>
                                  <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
                                    <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: over ? colors.danger : colors.primary }]} />
                                  </View>
                                </View>
                              );
                            })}
                            {Number(exec.data.outsideBudget.actual) > 0 ? (
                              <Text style={[TYPE.caption, { color: colors.warningText }]}>
                                {t("finResOutside").replace("{amount}", fmt.money(exec.data.outsideBudget.actual))}
                              </Text>
                            ) : null}
                          </>
                        )}
                      </View>
                    ) : null}
                  </Card>
                );
              })
            )}
          </View>

          {/* Expenses */}
          <View style={styles.section}>
            <SectionHeader title={t("finResExpenses")} actionLabel={t("finResJustifications")} onAction={() => router.push("/transparency" as any)} />
            <Card padding="none">
              {d.expenses.length === 0 ? (
                <ListItem icon="file-text" iconTone="neutral" title={t("finResNoExpense")} />
              ) : (
                d.expenses.map((e, i) => (
                  <ListItem
                    key={e.id}
                    icon={e.hasProof ? "paperclip" : "file"}
                    iconTone={e.status === "paid" ? "success" : "warning"}
                    title={e.label}
                    subtitle={[fmt.date(e.date), e.supplierName, e.buildingName].filter(Boolean).join(" · ")}
                    trailing={
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Text style={[TYPE.amount, { color: colors.foreground }]}>{fmt.money(e.amount)}</Text>
                        <Text style={[TYPE.caption, { color: e.status === "paid" ? colors.successText : colors.warningText }]}>
                          {e.status === "paid" ? t("finResPaid") : t("finResCommitted")}
                        </Text>
                      </View>
                    }
                    divider={i < d.expenses.length - 1}
                    onPress={() => setOpenExpense(e.id)}
                    chevron
                    accessibilityHint={t("expOpenHint")}
                  />
                ))
              )}
            </Card>
            {Number(d.salariesTotal) > 0 ? (
              <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("finResSalaries").replace("{amount}", fmt.money(d.salariesTotal))}</Text>
            ) : null}
          </View>
        </ScrollView>
      )}
      <ExpenseDetailSheet id={openExpense} onClose={() => setOpenExpense(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: { gap: SPACING.MD },
  note: { flexDirection: "row", gap: 10, padding: 12, borderRadius: RADIUS.MD, alignItems: "flex-start" },
  budgetHead: { flexDirection: "row", alignItems: "center", gap: SPACING.MD, padding: SPACING.LG, minHeight: 64 },
  lines: { borderTopWidth: StyleSheet.hairlineWidth, padding: SPACING.LG, gap: SPACING.LG },
  line: { gap: 6 },
  lineTop: { flexDirection: "row", alignItems: "center", gap: SPACING.SM },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
});
