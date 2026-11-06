import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Modal from "@/components/ui/AppModal";
import { apiRequest } from "@/lib/api";
import { ticketedUrl } from "@/services/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import ScreenHeader from "@/components/ScreenHeader";
import FilterChips from "@/components/FilterChips";
import { IconButton } from "@/components/ui";
import { ErrorState, LoadingState } from "@/components/DataState";

type TabType = "vue_ensemble" | "recettes" | "depenses" | "comparatif";

interface LigneBudget {
  id: string;
  categorie: string;
  libelle: string;
  prevu: number;
  realise: number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

// Income categories used to split budget lines from the API

/** The exercise in progress, approved first; a future draft must not hide it. */
function defaultBudget<T extends { year: number; status: string }>(list: T[]): T {
  const year = new Date().getFullYear();
  const current = list.filter((b) => Number(b.year) <= year);
  const pool = current.length ? current : list;
  const latest = Math.max(...pool.map((b) => Number(b.year)));
  const sameYear = pool.filter((b) => Number(b.year) === latest);
  return sameYear.find((b) => b.status !== "draft") ?? sameYear[0];
}

const fmt = (n: number) => new Intl.NumberFormat("fr-MA", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " MAD";
const pct = (realise: number, prevu: number) => prevu > 0 ? Math.min(100, Math.round((realise / prevu) * 100)) : 0;

// Le budget prévisionnel est accessible aux administrateurs et au trésorier (gestion)
// ainsi qu'au président (consultation). La secrétaire et le membre du bureau n'ont
// pas accès aux données financières.
export default function BudgetPrevisionnelScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "treasurer", "president"]}>
      <BudgetPrevisionnelScreenInner />
    </RoleGuard>
  );
}

function BudgetPrevisionnelScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const { t } = useLanguage();
  const { token } = useAuth();
  const { showToast } = useToast();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [tab, setTab] = useState<TabType>("vue_ensemble");
  const [selected, setSelected] = useState<LigneBudget | null>(null);
  const [recettes, setRecettes] = useState<LigneBudget[]>([]);
  const [depenses, setDepenses] = useState<LigneBudget[]>([]);
  const [annee, setAnnee] = useState("2026");
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<{ id: string; year: number; buildingName: string | null; status: string }[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadBudget = async () => {
      try {
        setLoading(true);
        setLoadError(false);
        const { data } = await apiRequest<{ data: any[] }>("/budgets");
        if (cancelled) return;
        if (!data || data.length === 0) return;
        setBudgets(data);
        const budget = data.find((b) => b.id === chosenId) ?? defaultBudget(data);
        setBudgetId(budget.id ?? null);
        if (budget.year) setAnnee(String(budget.year));
        // Planned vs actual comes from the server: paid expenses per budget
        // line, and calls for funds collected for the revenue side.
        const exec = await apiRequest<{ data: any }>(`/budgets/${budget.id}/execution`);
        if (cancelled) return;
        const ex = exec.data;
        setRecettes([
          {
            id: "appels",
            categorie: "appels_de_fonds",
            libelle: t("budgetRevenueCalls"),
            prevu: Number(ex.revenue.planned) || 0,
            realise: Number(ex.revenue.collected) || 0,
            icon: "trending-up" as any,
            color: colors.info,
          },
        ]);
        const expenseLines: LigneBudget[] = (ex.lines || []).map((l: any) => ({
          id: l.id,
          categorie: l.category || "Divers",
          libelle: l.label || "",
          prevu: Number(l.planned) || 0,
          realise: Number(l.actual) || 0,
          icon: "file-text" as any,
          color: colors.tint,
        }));
        if (Number(ex.outsideBudget?.actual) > 0) {
          expenseLines.push({
            id: "hors-budget",
            categorie: "hors_budget",
            libelle: t("budgetOutsideLines"),
            prevu: 0,
            realise: Number(ex.outsideBudget.actual) || 0,
            icon: "alert-triangle" as any,
            color: colors.danger,
          });
        }
        setDepenses(expenseLines);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadBudget();
    return () => { cancelled = true; };
  }, [reloadKey, chosenId]);

  // Local aliases so existing JSX references still resolve
  const RECETTES = recettes;
  const DEPENSES = depenses;
  const ANNEE = annee;

  const totalRecettesPrevu = RECETTES.reduce((s, r) => s + r.prevu, 0);
  const totalRecettesRealise = RECETTES.reduce((s, r) => s + r.realise, 0);
  const totalDepensesPrevu = DEPENSES.reduce((s, r) => s + r.prevu, 0);
  const totalDepensesRealise = DEPENSES.reduce((s, r) => s + r.realise, 0);
  const soldePrevu = totalRecettesPrevu - totalDepensesPrevu;
  const soldeRealise = totalRecettesRealise - totalDepensesRealise;

  const categories = (list: LigneBudget[]) => [...new Set(list.map((l) => l.categorie))];

  const BarChart = ({ prevu, realise, color }: { prevu: number; realise: number; color: string }) => {
    const p = pct(realise, prevu);
    return (
      <View style={styles.barWrap}>
        <View style={[styles.barBg, { backgroundColor: colors.border }]}>
          <View style={[styles.barFill, { width: `${p}%` as any, backgroundColor: p >= 90 ? colors.success : p >= 60 ? color : colors.warning }]} />
        </View>
        <Text style={[styles.barPct, { color: colors.mutedForeground }]}>{p}%</Text>
      </View>
    );
  };

  const renderLigne = (ligne: LigneBudget) => (
    <TouchableOpacity
      key={ligne.id}
      style={[styles.ligneCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => { setSelected(ligne); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      activeOpacity={0.75}
    >
      <View style={[styles.ligneIcon, { backgroundColor: ligne.color + "18" }]}>
        <Feather name={ligne.icon} size={16} color={ligne.color} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[styles.ligneLibelle, { color: colors.foreground }]}>{ligne.libelle}</Text>
        <View style={styles.ligneAmounts}>
          <Text style={[styles.ligneRealise, { color: colors.foreground }]}>{fmt(ligne.realise)}</Text>
          <Text style={[styles.ligneSep, { color: colors.mutedForeground }]}>/</Text>
          <Text style={[styles.lignePrevu, { color: colors.mutedForeground }]}>{fmt(ligne.prevu)}</Text>
        </View>
        <BarChart prevu={ligne.prevu} realise={ligne.realise} color={ligne.color} />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LoadingState
          title={t("budgetLoadingTitle")}
          description={t("budgetLoadingDescription")}
          accentColor={colors.primary}
        />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ErrorState
          title={t("budgetLoadErrorTitle")}
          description={t("budgetLoadErrorDescription")}
          retryLabel={t("retry")}
          onRetry={() => setReloadKey((k) => k + 1)}
          accentColor={colors.primary}
        />
      </View>
    );
  }

  if (!budgetId && recettes.length === 0 && depenses.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.emptyState, { backgroundColor: colors.background }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "15" }]}>
            <Feather name="pie-chart" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noBudget")}</Text>
          <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>
            {t("budgetEmptyDescription")}
          </Text>
          <TouchableOpacity
            style={[styles.emptyBackBtn, { borderColor: colors.border }]}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={[styles.emptyBackBtnText, { color: colors.tint }]}>{t("back")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t("budgetTitle")}
        subtitle={`${t("budgetExercise")} ${ANNEE}`}
        rightContent={
          <IconButton
            icon={downloading ? "loader" : "download"}
            variant="onDark"
            accessibilityLabel="PDF"
            disabled={downloading || !budgetId}
            onPress={async () => {
              if (!budgetId) return;
              try {
                setDownloading(true);
                await Linking.openURL(await ticketedUrl(`/pdf/budget/${budgetId}`));
              } catch {
                showToast({ type: "error", title: t("budgetPdfError") });
              } finally {
                setDownloading(false);
              }
            }}
          />
        }
      />
      {budgets.length > 1 ? (
        <FilterChips
          options={budgets.map((b) => ({ key: b.id, label: `${b.year}${b.buildingName ? ` · ${b.buildingName.split(" — ").pop()}` : ""}` }))}
          value={budgetId ?? ""}
          onChange={setChosenId}
        />
      ) : null}

      {/* KPI strip */}
      <View style={[styles.kpiStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{t("allocated")}</Text>
          <Text style={[styles.kpiVal, { color: colors.success }]}>{fmt(totalRecettesRealise)}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>/ {fmt(totalRecettesPrevu)}</Text>
        </View>
        <View style={[styles.kpiDiv, { backgroundColor: colors.border }]} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{t("spent")}</Text>
          <Text style={[styles.kpiVal, { color: colors.danger }]}>{fmt(totalDepensesRealise)}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>/ {fmt(totalDepensesPrevu)}</Text>
        </View>
        <View style={[styles.kpiDiv, { backgroundColor: colors.border }]} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{t("remaining")}</Text>
          <Text style={[styles.kpiVal, { color: soldeRealise >= 0 ? colors.success : colors.danger }]}>{fmt(soldeRealise)}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>{fmt(soldePrevu)}</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow} style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {([
          { key: "vue_ensemble" as const, label: t("totalBudget"), icon: "pie-chart" as const },
          { key: "recettes" as const, label: t("allocated"), icon: "trending-up" as const },
          { key: "depenses" as const, label: t("spent"), icon: "trending-down" as const },
          { key: "comparatif" as const, label: t("remaining"), icon: "bar-chart-2" as const },
        ]).map((tabItem) => {
          const active = tab === tabItem.key;
          return (
            <TouchableOpacity
              key={tabItem.key}
              style={[styles.tabBtn, active ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
              onPress={() => { setTab(tabItem.key); Haptics.selectionAsync(); }}
            >
              <Feather name={tabItem.icon} size={14} color={active ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.mutedForeground }]}>{tabItem.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>

        {tab === "vue_ensemble" && (
          <>
            {/* Execution global */}
            <View style={[styles.execCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.execTitle, { color: colors.foreground }]}>{t("totalBudget")}</Text>
              <View style={styles.execBars}>
                <View style={styles.execBarRow}>
                  <View style={[styles.execLabel2, {}]}>
                    <View style={[styles.dot, { backgroundColor: colors.success }]} />
                    <Text style={[styles.execText, { color: colors.foreground }]}>{t("allocated")}</Text>
                  </View>
                  <View style={[styles.execBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.execBarFill, { width: `${pct(totalRecettesRealise, totalRecettesPrevu)}%` as any, backgroundColor: colors.success }]} />
                  </View>
                  <Text style={[styles.execPct, { color: colors.success }]}>{pct(totalRecettesRealise, totalRecettesPrevu)}%</Text>
                </View>
                <View style={styles.execBarRow}>
                  <View style={styles.execLabel2}>
                    <View style={[styles.dot, { backgroundColor: colors.danger }]} />
                    <Text style={[styles.execText, { color: colors.foreground }]}>{t("spent")}</Text>
                  </View>
                  <View style={[styles.execBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.execBarFill, { width: `${pct(totalDepensesRealise, totalDepensesPrevu)}%` as any, backgroundColor: colors.danger }]} />
                  </View>
                  <Text style={[styles.execPct, { color: colors.danger }]}>{pct(totalDepensesRealise, totalDepensesPrevu)}%</Text>
                </View>
              </View>
             <Text style={[styles.execNote, { color: colors.mutedForeground }]}>{t("budgetExecutionNote").replace("{year}", ANNEE)} {ANNEE}</Text>
            </View>

            {/* Category summary */}
            {[
              { titre: t("allocated"), items: RECETTES.slice(0, 3), color: colors.success },
              { titre: t("spent"), items: DEPENSES.slice(0, 4), color: colors.danger },
            ].map((section) => (
              <View key={section.titre} style={[styles.summarySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.summarySectionTitle, { color: colors.foreground }]}>{section.titre}</Text>
                {section.items.map((ligne) => (
                  <View key={ligne.id} style={styles.summaryRow}>
                    <View style={[styles.summaryDot, { backgroundColor: ligne.color }]} />
                    <Text style={[styles.summaryLibelle, { color: colors.foreground }]} numberOfLines={1}>{ligne.libelle}</Text>
                    <Text style={[styles.summaryVal, { color: section.color }]}>{fmt(ligne.realise)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {tab === "recettes" && (
          <>
            <View style={[styles.totalBanner, { backgroundColor: colors.success + "10", borderColor: colors.success + "30" }]}>
              <Feather name="trending-up" size={16} color={colors.success} />
              <Text style={[styles.totalBannerText, { color: colors.success }]}>{t("allocated")} : {fmt(totalRecettesRealise)} / {fmt(totalRecettesPrevu)} ({pct(totalRecettesRealise, totalRecettesPrevu)}%)</Text>
            </View>
            {categories(RECETTES).map((cat) => (
              <View key={cat} style={{ gap: 8 }}>
                <Text style={[styles.catTitle, { color: colors.mutedForeground }]}>{cat.toUpperCase()}</Text>
                {RECETTES.filter((r) => r.categorie === cat).map(renderLigne)}
              </View>
            ))}
          </>
        )}

        {tab === "depenses" && (
          <>
            <View style={[styles.totalBanner, { backgroundColor: colors.danger + "10", borderColor: colors.danger + "30" }]}>
              <Feather name="trending-down" size={16} color={colors.danger} />
              <Text style={[styles.totalBannerText, { color: colors.danger }]}>{t("spent")} : {fmt(totalDepensesRealise)} / {fmt(totalDepensesPrevu)} ({pct(totalDepensesRealise, totalDepensesPrevu)}%)</Text>
            </View>
            {categories(DEPENSES).map((cat) => (
              <View key={cat} style={{ gap: 8 }}>
                <Text style={[styles.catTitle, { color: colors.mutedForeground }]}>{cat.toUpperCase()}</Text>
                {DEPENSES.filter((d) => d.categorie === cat).map(renderLigne)}
              </View>
            ))}
          </>
        )}

        {tab === "comparatif" && (
          <>
            {[
              { label: t("allocated"), prevu: totalRecettesPrevu, realise: totalRecettesRealise, color: colors.success },
              { label: t("spent"), prevu: totalDepensesPrevu, realise: totalDepensesRealise, color: colors.danger },
              { label: t("remaining"), prevu: soldePrevu, realise: soldeRealise, color: soldeRealise >= 0 ? colors.success : colors.danger },
            ].map((row) => (
              <View key={row.label} style={[styles.comparatifCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.comparatifLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                <View style={styles.comparatifBars}>
                  <View style={styles.comparatifBarRow}>
                    <Text style={[styles.comparatifBarLabel, { color: colors.mutedForeground }]}>{t("totalBudget")}</Text>
                    <View style={[styles.comparatifBarBg, { backgroundColor: colors.border }]}>
                      <View style={[styles.comparatifBarFill, { width: "100%", backgroundColor: colors.border }]} />
                    </View>
                    <Text style={[styles.comparatifBarVal, { color: colors.foreground }]}>{fmt(row.prevu)}</Text>
                  </View>
                  <View style={styles.comparatifBarRow}>
                    <Text style={[styles.comparatifBarLabel, { color: colors.mutedForeground }]}>{t("spent")}</Text>
                    <View style={[styles.comparatifBarBg, { backgroundColor: colors.border }]}>
                      <View style={[styles.comparatifBarFill, { width: `${Math.min(100, Math.abs(pct(row.realise, row.prevu)))}%` as any, backgroundColor: row.color }]} />
                    </View>
                    <Text style={[styles.comparatifBarVal, { color: row.color }]}>{fmt(row.realise)}</Text>
                  </View>
                </View>
                <Text style={[styles.comparatifEcart, { color: row.realise >= row.prevu ? colors.success : colors.warning }]}>
                  {fmt(Math.abs(row.realise - row.prevu))} ({row.realise < row.prevu ? "-" : "+"}{Math.abs(pct(row.realise, row.prevu) - 100)}%)
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Ligne detail modal */}
      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalSheetHeader}>
              <View style={[styles.modalIcon, { backgroundColor: (selected?.color ?? "#000") + "18" }]}>
                <Feather name={selected?.icon ?? "file-text"} size={20} color={selected?.color ?? "#000"} />
              </View>
              <Text style={[styles.modalSheetTitle, { color: colors.foreground }]}>{selected?.libelle}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={[styles.modalSep, { backgroundColor: colors.border }]} />
            {[
              { label: t("categoryLabel"), value: selected?.categorie },
              { label: t("totalBudget"), value: fmt(selected?.prevu ?? 0) },
              { label: t("spent"), value: fmt(selected?.realise ?? 0) },
              { label: t("remaining"), value: `${pct(selected?.realise ?? 0, selected?.prevu ?? 1)}%` },
              { label: t("noBudget"), value: fmt(Math.max(0, (selected?.prevu ?? 0) - (selected?.realise ?? 0))) },
            ].map((row, i) => (
              <View key={i} style={styles.modalRow}>
                <Text style={[styles.modalRowLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                <Text style={[styles.modalRowVal, { color: colors.foreground }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Fraunces_600SemiBold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  exportBtn: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  kpiStrip: { flexDirection: "row", borderBottomWidth: 1 },
  kpiItem: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 2 },
  kpiLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  kpiVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  kpiSub: { fontSize: 9, fontFamily: "Inter_400Regular" },
  kpiDiv: { width: 1, marginVertical: 8 },
  tabsRow: { paddingHorizontal: 8, gap: 0 },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 12 },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  execCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  execTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  execBars: { gap: 12 },
  execBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  execLabel2: { flexDirection: "row", alignItems: "center", gap: 6, width: 80 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  execText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  execBar: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  execBarFill: { height: 10, borderRadius: 5 },
  execPct: { fontSize: 12, fontFamily: "Inter_700Bold", width: 40, textAlign: "right" },
  execNote: { fontSize: 11, fontFamily: "Inter_400Regular" },
  summarySection: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  summarySectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 2 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryLibelle: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  summaryVal: { fontSize: 12, fontFamily: "Inter_700Bold" },
  totalBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  totalBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  catTitle: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginStart: 2 },
  ligneCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  ligneIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 2 },
  ligneLibelle: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  ligneAmounts: { flexDirection: "row", alignItems: "center", gap: 4 },
  ligneRealise: { fontSize: 13, fontFamily: "Inter_700Bold" },
  ligneSep: { fontSize: 12 },
  lignePrevu: { fontSize: 12, fontFamily: "Inter_400Regular" },
  barWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  barBg: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  barPct: { fontSize: 10, fontFamily: "Inter_600SemiBold", width: 32, textAlign: "right" },
  comparatifCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  comparatifLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  comparatifBars: { gap: 8 },
  comparatifBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  comparatifBarLabel: { fontSize: 11, fontFamily: "Inter_400Regular", width: 52 },
  comparatifBarBg: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  comparatifBarFill: { height: 10, borderRadius: 5 },
  comparatifBarVal: { fontSize: 11, fontFamily: "Inter_700Bold", width: 100, textAlign: "right" },
  comparatifEcart: { fontSize: 12, fontFamily: "Inter_500Medium" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalSheet: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  modalSheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalSheetTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalSep: { height: 1 },
  modalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalRowLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalRowVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyDescription: { maxWidth: 320, fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBackBtn: { marginTop: 4, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  emptyBackBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
