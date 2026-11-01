import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState } from "@/components/DataState";
import { Card, ListItem, SheetHeader } from "@/components/ui";
import { Feather } from "@/components/ui/Feather";
import { RADIUS, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { apiRequest } from "@/lib/api";
import { ticketedUrl } from "@/services/api";

type ExpenseDetail = {
  id: string;
  reference: string;
  label: string;
  category: string;
  amount: string;
  currency: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  supplierName: string | null;
  supplierType: string | null;
  buildingName: string | null;
  budget: { year: number; lineLabel: string; lineCategory: string; linePlanned: string } | null;
  status: "approved" | "paid";
  history: { step: "recorded" | "approved" | "paid"; at: string; method?: string | null }[];
  hasProof: boolean;
  proofKind: "pdf" | "image" | "file" | null;
};

const STEP_ICON = { recorded: "edit-3", approved: "check-circle", paid: "credit-card" } as const;

/**
 * One expense of the condominium as a co-owner sees it: what, from whom, how
 * much, against which budget line, when it was approved and paid, and the
 * invoice. Read only — approving an expense is the syndic's job, and voting
 * on it belongs to the general assembly (not here).
 */
export default function ExpenseDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const fmt = useFormat();
  const q = useQuery({
    queryKey: ["transparency-expense", id],
    enabled: !!id,
    queryFn: async () => (await apiRequest<{ data: ExpenseDetail }>(`/transparency/expenses/${id}`)).data,
  });
  const e = q.data;

  const openProof = async () => {
    if (!e) return;
    const url = await ticketedUrl(`/transparency/expenses/${e.id}/proof`);
    if (e.proofKind === "pdf") router.push({ pathname: "/pdf-viewer", params: { url, title: `${e.reference} — ${e.label}` } } as any);
    else Linking.openURL(url);
  };

  return (
    <Modal visible={!!id} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        <SheetHeader title={e?.label ?? t("expDetailTitle")} subtitle={e?.reference} onClose={onClose} />
        {q.isLoading ? (
          <ActivityIndicator color={colors.tint} style={{ marginTop: 40 }} />
        ) : q.isError || !e ? (
          <ErrorState title={t("uiLoadErrorTitle")} description={t("uiLoadErrorHint")} retryLabel={t("retry")} onRetry={() => q.refetch()} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: SPACING.LG, gap: SPACING.LG }}>
            <View style={{ gap: 4 }}>
              <Text style={[TYPE.display, { color: colors.foreground }]}>{fmt.money(e.amount)}</Text>
              <Text style={[TYPE.secondary, { color: e.status === "paid" ? colors.successText : colors.warningText }]}>
                {e.status === "paid" ? t("finResPaid") : t("finResCommitted")}
              </Text>
            </View>

            <Card padding="none">
              <ListItem icon="tag" iconTone="neutral" title={t("expCategory")} meta={e.category} />
              <ListItem icon="briefcase" iconTone="neutral" title={t("expSupplier")} meta={e.supplierName ?? "—"} divider />
              {e.invoiceNumber || e.invoiceDate ? (
                <ListItem
                  icon="file-text"
                  iconTone="neutral"
                  title={t("expInvoice")}
                  meta={[e.invoiceNumber, e.invoiceDate ? fmt.date(e.invoiceDate) : null].filter(Boolean).join(" · ")}
                  divider
                />
              ) : null}
              {e.buildingName ? <ListItem icon="home" iconTone="neutral" title={t("expBuilding")} meta={e.buildingName} divider /> : null}
              <ListItem
                icon="pie-chart"
                iconTone={e.budget ? "primary" : "warning"}
                title={t("expBudget")}
                subtitle={e.budget ? `${e.budget.lineLabel} · ${t("expBudgetYear").replace("{year}", String(e.budget.year))}` : t("expOutsideBudget")}
                meta={e.budget ? t("expPlanned").replace("{amount}", fmt.money(e.budget.linePlanned)) : undefined}
                divider
              />
            </Card>

            <View style={{ gap: SPACING.SM }}>
              <Text style={[TYPE.label, { color: colors.textMuted }]}>{t("expHistory")}</Text>
              <Card padding="md" style={{ gap: SPACING.MD }}>
                {e.history.map((h) => (
                  <View key={h.step} style={styles.step}>
                    <View style={[styles.stepIcon, { backgroundColor: colors.primarySoft }]}>
                      <Feather name={STEP_ICON[h.step]} size={14} color={colors.tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{t(`expStep_${h.step}`)}</Text>
                      <Text style={[TYPE.caption, { color: colors.textMuted }]}>
                        {fmt.date(h.at)}
                        {h.method ? ` · ${t(`expMethod_${h.method}`) !== `expMethod_${h.method}` ? t(`expMethod_${h.method}`) : h.method}` : ""}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            </View>

            {e.hasProof ? (
              <Pressable onPress={openProof} accessibilityRole="button" style={[styles.proofBtn, { backgroundColor: colors.primary }]}>
                <Feather name="paperclip" size={16} color="#FFFFFF" />
                <Text style={styles.proofText}>{t("expOpenInvoice")}</Text>
              </Pressable>
            ) : (
              <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("expNoInvoice")}</Text>
            )}

            <Text style={[TYPE.caption, { color: colors.textMuted }]}>{t("expReadOnlyNote")}</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  step: { flexDirection: "row", alignItems: "center", gap: SPACING.MD },
  stepIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  proofBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: RADIUS.LG },
  proofText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
