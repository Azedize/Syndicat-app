import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import * as statisticsApi from "@/services/api";

type Period = "month" | "quarter" | "year";

interface ReportData {
  revenueChart: { label: string; value: number }[];
  membersChart: { label: string; value: number }[];
  kpi: { revenues: number; expenses: number; memberGrowth: number; cotisationRate: number };
}

function BarChart({ data, maxVal, color }: { data: { label: string; value: number }[]; maxVal: number; color: string }) {
  const colors = useColors();
  return (
    <View style={barStyles.chart}>
      {data.map((d, i) => (
        <View key={i} style={barStyles.bar}>
          <Text style={[barStyles.barVal, { color: colors.foreground }]}>
            {d.value > 999 ? `${(d.value / 1000).toFixed(1)}k` : `${d.value}`}
          </Text>
          <View style={barStyles.barWrap}>
            <View
              style={[barStyles.barFill, {
                height: maxVal > 0 ? `${Math.max(Math.round((d.value / maxVal) * 100), d.value > 0 ? 4 : 0)}%` as any : "0%",
                backgroundColor: color,
                borderTopLeftRadius: 5,
                borderTopRightRadius: 5,
                opacity: d.value === 0 ? 0.25 : 1,
              }]}
            />
          </View>
          <Text style={[barStyles.barLabel, { color: colors.mutedForeground }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

const barStyles = StyleSheet.create({
  chart: { flexDirection: "row", alignItems: "flex-end", height: 140, gap: 4, paddingTop: 8 },
  bar: { flex: 1, alignItems: "center", gap: 3 },
  barWrap: { flex: 1, width: "100%", justifyContent: "flex-end" },
  barFill: { width: "100%", minHeight: 3 },
  barLabel: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  barVal: { fontSize: 8, fontFamily: "Inter_700Bold" },
});

function periodLabel(period: Period): string {
  const now = new Date();
  const FR_MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  if (period === "month") return `${FR_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `T${q} ${now.getFullYear()}`;
  }
  return `${now.getFullYear()}`;
}

const EMPTY_REPORT: ReportData = {
  revenueChart: [],
  membersChart: [],
  kpi: { revenues: 0, expenses: 0, memberGrowth: 0, cotisationRate: 0 },
};

// Financial reports — administrators only.
export default function ReportsScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <ReportsScreenInner />
    </RoleGuard>
  );
}

function ReportsScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { cotisations } = useData();
  const [period, setPeriod] = useState<Period>("month");
  const [reportData, setReportData] = useState<ReportData>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const fetchReports = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await statisticsApi.statistics.reports(p);
      setReportData(res.data);
    } catch (err: any) {
      setError(err?.message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(period); }, [period, fetchReports]);

  const pd = reportData;
  const maxRevenue = Math.max(...pd.revenueChart.map((d) => d.value), 1);
  const maxMembers = Math.max(...pd.membersChart.map((d) => d.value), 1);

  const paidCount = cotisations.filter((c) => c.status === "paid").length;
  const pendingCount = cotisations.filter((c) => c.status === "pending").length;
  const overdueCount = cotisations.filter((c) => c.status === "overdue").length;
  const totalCot = cotisations.length;

  const label = periodLabel(period);

  const handleExport = (reportLabel: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const kpi = pd.kpi;
    const summary =
      `${reportLabel}\n` +
      `Période : ${label}\n` +
      `Revenus : ${kpi.revenues.toLocaleString()} MAD\n` +
      `Dépenses : ${kpi.expenses.toLocaleString()} MAD\n` +
      `Excédent : ${(kpi.revenues - kpi.expenses).toLocaleString()} MAD\n` +
      `Croissance membres : +${kpi.memberGrowth}\n` +
      `Taux cotisations : ${kpi.cotisationRate}%\n` +
      `Exporté le ${new Date().toLocaleDateString("fr-MA")}\n` +
      `SYNDYCAT GLOBAL CPS`;
    Share.share({ title: reportLabel, message: summary });
  };

  const REPORTS = [
    { label: `Rapport financier — ${label}`, icon: "file-text" as const },
    { label: "Liste des membres actifs", icon: "users" as const },
    { label: "Rapport de cotisations", icon: "credit-card" as const },
    { label: "Bilan des activités syndicales", icon: "activity" as const },
    { label: "Rapport d'élections", icon: "check-square" as const },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Rapports & Analytics</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{label}</Text>
        </View>
        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.primary + "15" }]}
          onPress={() => handleExport(`Rapport général — ${label}`)}
        >
          <Feather name="download" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Period selector */}
      <View style={[styles.periodRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          { key: "month", label: "Ce mois", icon: "calendar" as const },
          { key: "quarter", label: "Trimestre", icon: "bar-chart-2" as const },
          { key: "year", label: "Année", icon: "trending-up" as const },
        ] as { key: Period; label: string; icon: keyof typeof Feather.glyphMap }[]).map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, { backgroundColor: period === p.key ? colors.primary : "transparent" }]}
            onPress={() => { setPeriod(p.key); Haptics.selectionAsync(); }}
          >
            <Feather name={p.icon} size={13} color={period === p.key ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.periodLabel, { color: period === p.key ? "#fff" : colors.mutedForeground }]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Chargement des données...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
          <Feather name="alert-circle" size={36} color={colors.destructive} />
          <Text style={{ color: colors.destructive, fontSize: 14, textAlign: "center" }}>{error}</Text>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}
            onPress={() => fetchReports(period)}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* KPI Cards */}
          <View style={styles.kpiGrid}>
            {[
              {
                label: "Revenus",
                value: pd.kpi.revenues > 999 ? `${(pd.kpi.revenues / 1000).toFixed(0)}k MAD` : `${pd.kpi.revenues} MAD`,
                icon: "trending-up" as const,
                color: colors.success,
                change: pd.kpi.revenues > 0 ? `${(pd.kpi.revenues / 1000).toFixed(0)}k` : "—",
                up: true,
              },
              {
                label: "Dépenses",
                value: pd.kpi.expenses > 999 ? `${(pd.kpi.expenses / 1000).toFixed(0)}k MAD` : `${pd.kpi.expenses} MAD`,
                icon: "trending-down" as const,
                color: colors.destructive,
                change: pd.kpi.expenses > 0 ? `${(pd.kpi.expenses / 1000).toFixed(0)}k` : "—",
                up: false,
              },
              {
                label: "Croissance",
                value: `+${pd.kpi.memberGrowth} membres`,
                icon: "users" as const,
                color: colors.primary,
                change: pd.kpi.memberGrowth > 0 ? `+${pd.kpi.memberGrowth}` : "—",
                up: pd.kpi.memberGrowth > 0,
              },
              {
                label: "Taux cotis.",
                value: `${pd.kpi.cotisationRate}%`,
                icon: "credit-card" as const,
                color: "#f59e0b",
                change: pd.kpi.cotisationRate >= 85 ? "Bon" : pd.kpi.cotisationRate > 0 ? "Faible" : "—",
                up: pd.kpi.cotisationRate >= 85,
              },
            ].map((kpi) => (
              <View key={kpi.label} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.kpiIcon, { backgroundColor: kpi.color + "15" }]}>
                  <Feather name={kpi.icon} size={18} color={kpi.color} />
                </View>
                <Text style={[styles.kpiValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>{kpi.value}</Text>
                <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{kpi.label}</Text>
                <View style={[styles.changeBadge, { backgroundColor: kpi.color + "15" }]}>
                  <Feather name={kpi.up ? "arrow-up-right" : "arrow-down-right"} size={10} color={kpi.color} />
                  <Text style={[styles.changeText, { color: kpi.color }]}>{kpi.change}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Revenue chart */}
          {pd.revenueChart.length > 0 && (
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.chartHeader}>
                <View style={{ gap: 2 }}>
                  <Text style={[styles.chartTitle, { color: colors.foreground }]}>Évolution des revenus</Text>
                  <Text style={[styles.chartSub, { color: colors.mutedForeground }]}>{label}</Text>
                </View>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.chartUnit, { color: colors.mutedForeground }]}>MAD</Text>
              </View>
              <BarChart data={pd.revenueChart} maxVal={maxRevenue} color={colors.primary} />
            </View>
          )}

          {/* Member growth chart */}
          {pd.membersChart.length > 0 && (
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.chartHeader}>
                <View style={{ gap: 2 }}>
                  <Text style={[styles.chartTitle, { color: colors.foreground }]}>Nouveaux membres</Text>
                  <Text style={[styles.chartSub, { color: colors.mutedForeground }]}>{label}</Text>
                </View>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.chartUnit, { color: colors.mutedForeground }]}>Membres</Text>
              </View>
              <BarChart data={pd.membersChart} maxVal={maxMembers} color={colors.success} />
            </View>
          )}

          {/* Cotisations breakdown — from real DataContext */}
          <View style={[styles.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.chartHeader}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>Recouvrement des cotisations</Text>
              <Text style={[styles.chartUnit, { color: colors.mutedForeground }]}>{totalCot} total</Text>
            </View>
            {[
              { label: "Payées", count: paidCount, color: colors.success },
              { label: "En attente", count: pendingCount, color: "#f59e0b" },
              { label: "En retard", count: overdueCount, color: colors.destructive },
            ].map((row) => {
              const pct = totalCot > 0 ? Math.round((row.count / totalCot) * 100) : 0;
              return (
                <View key={row.label} style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.foreground }]}>{row.label}</Text>
                  <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
                    <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: row.color }]} />
                  </View>
                  <Text style={[styles.breakdownPct, { color: row.color }]}>{pct}%</Text>
                  <View style={[styles.countBadge, { backgroundColor: row.color + "15" }]}>
                    <Text style={[styles.breakdownCount, { color: row.color }]}>{row.count}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Financial balance */}
          <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.chartTitle, { color: colors.foreground }]}>Solde financier</Text>
            <View style={styles.balanceRow}>
              <View style={[styles.balanceItem, { backgroundColor: colors.success + "10", borderColor: colors.success + "25" }]}>
                <Feather name="arrow-up-circle" size={22} color={colors.success} />
                <Text style={[styles.balanceVal, { color: colors.success }]}>
                  +{pd.kpi.revenues > 999 ? `${(pd.kpi.revenues / 1000).toFixed(0)}k` : pd.kpi.revenues}
                </Text>
                <Text style={[styles.balanceLab, { color: colors.mutedForeground }]}>Revenus</Text>
              </View>
              <View style={[styles.balanceMid, { backgroundColor: colors.border }]} />
              <View style={[styles.balanceItem, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "25" }]}>
                <Feather name="arrow-down-circle" size={22} color={colors.destructive} />
                <Text style={[styles.balanceVal, { color: colors.destructive }]}>
                  -{pd.kpi.expenses > 999 ? `${(pd.kpi.expenses / 1000).toFixed(0)}k` : pd.kpi.expenses}
                </Text>
                <Text style={[styles.balanceLab, { color: colors.mutedForeground }]}>Dépenses</Text>
              </View>
              <View style={[styles.balanceMid, { backgroundColor: colors.border }]} />
              <View style={[styles.balanceItem, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "25" }]}>
                <Feather name="trending-up" size={22} color={colors.primary} />
                <Text style={[styles.balanceVal, { color: colors.primary }]}>
                  {pd.kpi.revenues - pd.kpi.expenses >= 0 ? "+" : ""}
                  {Math.abs(pd.kpi.revenues - pd.kpi.expenses) > 999
                    ? `${((pd.kpi.revenues - pd.kpi.expenses) / 1000).toFixed(0)}k`
                    : pd.kpi.revenues - pd.kpi.expenses}
                </Text>
                <Text style={[styles.balanceLab, { color: colors.mutedForeground }]}>Excédent</Text>
              </View>
            </View>
          </View>

          {/* Export reports */}
          <View style={[styles.reportsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.reportsTitle, { color: colors.foreground }]}>Exporter des rapports</Text>
            {REPORTS.map((r, i) => (
              <View key={r.label}>
                {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                <TouchableOpacity
                  style={styles.reportRow}
                  activeOpacity={0.7}
                  onPress={() => handleExport(r.label)}
                >
                  <View style={[styles.reportIcon, { backgroundColor: colors.primary + "15" }]}>
                    <Feather name={r.icon} size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.reportLabel, { color: colors.foreground }]}>{r.label}</Text>
                  <View style={[styles.dlBtn, { backgroundColor: colors.muted }]}>
                    <Feather name="download" size={13} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  exportBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  periodRow: { flexDirection: "row", padding: 10, gap: 8, borderBottomWidth: 1, paddingHorizontal: 16 },
  periodBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10 },
  periodLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { flex: 1, minWidth: "45%", borderRadius: 16, borderWidth: 1, padding: 14, gap: 5 },
  kpiIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  changeBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  changeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  chartHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  chartTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  chartSub: { fontSize: 10, fontFamily: "Inter_400Regular" },
  chartUnit: { fontSize: 11, fontFamily: "Inter_400Regular" },
  legendDot: { width: 10, height: 10, borderRadius: 5, alignSelf: "center" },
  breakdownCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  breakdownLabel: { width: 78, fontSize: 12, fontFamily: "Inter_400Regular" },
  progressBg: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  breakdownPct: { width: 36, fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "right" },
  countBadge: { width: 28, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  breakdownCount: { fontSize: 11, fontFamily: "Inter_700Bold" },
  balanceCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  balanceRow: { flexDirection: "row", alignItems: "center" },
  balanceItem: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  balanceMid: { width: 1, height: 60, marginHorizontal: 8 },
  balanceVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  balanceLab: { fontSize: 10, fontFamily: "Inter_400Regular" },
  reportsCard: { borderRadius: 16, borderWidth: 1, padding: 4 },
  reportsTitle: { fontSize: 14, fontFamily: "Inter_700Bold", padding: 14, paddingBottom: 8 },
  reportRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  reportIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  reportLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  dlBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sep: { height: 1, marginHorizontal: 14 },
});
