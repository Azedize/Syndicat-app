import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { apiRequest } from "@/lib/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

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
const INCOME_CATEGORIES = new Set(["Cotisations", "Subventions", "Marketplace", "Revenus", "Recettes", "cotisation", "subvention", "revenu"]);

const fmt = (n: number) => new Intl.NumberFormat("fr-MA", { style: "decimal", maximumFractionDigits: 0 }).format(n) + " MAD";
const pct = (realise: number, prevu: number) => Math.min(100, Math.round((realise / prevu) * 100));

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
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    apiRequest<{ data: any[] }>("/budgets")
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const budget = data[0];
        setBudgetId(budget.id ?? null);
        if (budget.year) setAnnee(String(budget.year));
        const lines: LigneBudget[] = (budget.lines || []).map((l: any, i: number) => ({
          id: l.id || `line-${i}`,
          categorie: l.category || "Divers",
          libelle: l.label || "",
          prevu: parseFloat(l.amountAnnual || "0"),
          // Use realised/spent amount from API response; fall back through several field names
          realise: parseFloat(l.realise ?? l.amountRealise ?? l.amountSpent ?? l.spent ?? "0"),
          icon: "file-text" as any,
          color: INCOME_CATEGORIES.has(l.category || "") ? "#3b82f6" : "#2563EB",
        }));
        const r = lines.filter((l) => INCOME_CATEGORIES.has(l.categorie));
        const d = lines.filter((l) => !INCOME_CATEGORIES.has(l.categorie));
        setRecettes(r.length > 0 ? r : lines.slice(0, Math.ceil(lines.length / 2)));
        setDepenses(d.length > 0 ? d : lines.slice(Math.ceil(lines.length / 2)));
      })
      .catch((e) => console.error("Failed to load budget", e));
  }, []);

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
          <View style={[styles.barFill, { width: `${p}%` as any, backgroundColor: p >= 90 ? "#10b981" : p >= 60 ? color : "#f59e0b" }]} />
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("budgetTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Exercice {ANNEE} — Exécution au 31/05/2026</Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.primary }]}
          disabled={downloading || !budgetId}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (!budgetId) return;
            try {
              setDownloading(true);
              const domain = process.env.EXPO_PUBLIC_DOMAIN;
              const base = domain
                ? `https://${domain}`
                : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}`;
              const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
              const url = `${base}/api/pdf/budget/${budgetId}${tokenParam}`;
              await Linking.openURL(url);
            } catch {
              showToast({ type: "error", title: t("error"), message: "Impossible de générer le PDF du budget. Vérifiez votre connexion." });
            } finally {
              setDownloading(false);
            }
          }}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="download" size={15} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* KPI strip */}
      <View style={[styles.kpiStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{t("allocated")}</Text>
          <Text style={[styles.kpiVal, { color: "#10b981" }]}>{fmt(totalRecettesRealise)}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>/ {fmt(totalRecettesPrevu)}</Text>
        </View>
        <View style={[styles.kpiDiv, { backgroundColor: colors.border }]} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{t("spent")}</Text>
          <Text style={[styles.kpiVal, { color: "#ef4444" }]}>{fmt(totalDepensesRealise)}</Text>
          <Text style={[styles.kpiSub, { color: colors.mutedForeground }]}>/ {fmt(totalDepensesPrevu)}</Text>
        </View>
        <View style={[styles.kpiDiv, { backgroundColor: colors.border }]} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{t("remaining")}</Text>
          <Text style={[styles.kpiVal, { color: soldeRealise >= 0 ? "#10b981" : "#ef4444" }]}>{fmt(soldeRealise)}</Text>
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
                    <View style={[styles.dot, { backgroundColor: "#10b981" }]} />
                    <Text style={[styles.execText, { color: colors.foreground }]}>{t("allocated")}</Text>
                  </View>
                  <View style={[styles.execBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.execBarFill, { width: `${pct(totalRecettesRealise, totalRecettesPrevu)}%` as any, backgroundColor: "#10b981" }]} />
                  </View>
                  <Text style={[styles.execPct, { color: "#10b981" }]}>{pct(totalRecettesRealise, totalRecettesPrevu)}%</Text>
                </View>
                <View style={styles.execBarRow}>
                  <View style={styles.execLabel2}>
                    <View style={[styles.dot, { backgroundColor: "#ef4444" }]} />
                    <Text style={[styles.execText, { color: colors.foreground }]}>{t("spent")}</Text>
                  </View>
                  <View style={[styles.execBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.execBarFill, { width: `${pct(totalDepensesRealise, totalDepensesPrevu)}%` as any, backgroundColor: "#ef4444" }]} />
                  </View>
                  <Text style={[styles.execPct, { color: "#ef4444" }]}>{pct(totalDepensesRealise, totalDepensesPrevu)}%</Text>
                </View>
              </View>
              <Text style={[styles.execNote, { color: colors.mutedForeground }]}>Exécution sur 5 mois (janv–mai {ANNEE})</Text>
            </View>

            {/* Category summary */}
            {[
              { titre: t("allocated"), items: RECETTES.slice(0, 3), color: "#10b981" },
              { titre: t("spent"), items: DEPENSES.slice(0, 4), color: "#ef4444" },
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
            <View style={[styles.totalBanner, { backgroundColor: "#10b98110", borderColor: "#10b98130" }]}>
              <Feather name="trending-up" size={16} color="#10b981" />
              <Text style={[styles.totalBannerText, { color: "#10b981" }]}>{t("allocated")} : {fmt(totalRecettesRealise)} / {fmt(totalRecettesPrevu)} ({pct(totalRecettesRealise, totalRecettesPrevu)}%)</Text>
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
            <View style={[styles.totalBanner, { backgroundColor: "#ef444410", borderColor: "#ef444430" }]}>
              <Feather name="trending-down" size={16} color="#ef4444" />
              <Text style={[styles.totalBannerText, { color: "#ef4444" }]}>{t("spent")} : {fmt(totalDepensesRealise)} / {fmt(totalDepensesPrevu)} ({pct(totalDepensesRealise, totalDepensesPrevu)}%)</Text>
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
              { label: t("allocated"), prevu: totalRecettesPrevu, realise: totalRecettesRealise, color: "#10b981" },
              { label: t("spent"), prevu: totalDepensesPrevu, realise: totalDepensesRealise, color: "#ef4444" },
              { label: t("remaining"), prevu: soldePrevu, realise: soldeRealise, color: soldeRealise >= 0 ? "#10b981" : "#ef4444" },
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
                <Text style={[styles.comparatifEcart, { color: row.realise >= row.prevu ? "#10b981" : "#f59e0b" }]}>
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
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
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
});
