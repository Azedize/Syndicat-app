import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import FilterTabs from "@/components/FilterTabs";
import { statistics, type PlatformStats } from "@/services/api";

type Tab = "global" | "syndicats" | "finance" | "marketplace";

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(Math.round((value / max) * 100), value > 0 ? 2 : 0) : 0;
  return (
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "#e5e7eb", overflow: "hidden" }}>
      <View style={{ width: `${pct}%` as any, height: "100%", backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const colors = useColors();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 120, gap: 6, paddingTop: 8 }}>
      {data.map((d, i) => {
        const pct = Math.max(Math.round((d.value / max) * 100), d.value > 0 ? 4 : 0);
        return (
          <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 8, fontFamily: "Inter_700Bold", color: colors.mutedForeground }}>
              {d.value > 999 ? `${(d.value / 1000).toFixed(0)}k` : `${d.value}`}
            </Text>
            <View style={{ flex: 1, width: "100%", justifyContent: "flex-end" }}>
              <View style={{ width: "100%", height: `${pct}%` as any, backgroundColor: color, borderTopLeftRadius: 5, borderTopRightRadius: 5, opacity: d.value === 0 ? 0.2 : 1 }} />
            </View>
            <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function KpiCard({ label, value, sub, icon, color, trend }: { label: string; value: string; sub?: string; icon: keyof typeof Feather.glyphMap; color: string; trend?: string }) {
  const colors = useColors();
  return (
    <View style={[kpiStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[kpiStyles.iconWrap, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={[kpiStyles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[kpiStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      {trend && (
        <View style={[kpiStyles.trendBadge, { backgroundColor: trend.startsWith("+") ? "#10b98118" : "#ef444418" }]}>
          <Feather name={trend.startsWith("+") ? "trending-up" : "trending-down"} size={10} color={trend.startsWith("+") ? "#10b981" : "#ef4444"} />
          <Text style={[kpiStyles.trendText, { color: trend.startsWith("+") ? "#10b981" : "#ef4444" }]}>{trend}</Text>
        </View>
      )}
      {sub && <Text style={[kpiStyles.sub, { color: colors.mutedForeground }]}>{sub}</Text>}
    </View>
  );
}

const kpiStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14, gap: 6, minWidth: 140 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  value: { fontSize: 20, fontFamily: "Inter_700Bold" },
  label: { fontSize: 11, fontFamily: "Inter_500Medium", lineHeight: 16 },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, alignSelf: "flex-start" },
  trendText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 10, fontFamily: "Inter_400Regular" },
});

function sliceForPeriod(data: { label: string; value: number }[], period: "month" | "quarter" | "year") {
  if (period === "month") return data.slice(-4);
  if (period === "quarter") return data.slice(-3);
  return data;
}

export default function StatistiquesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { members, syndicates, transactions, products, orders, syndicateSubscriptions, cotisations, supportTickets } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const role = user?.role ?? "member";

  const [tab, setTab] = useState<Tab>("global");
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (role === "super_admin") {
      setLoadingStats(true);
      statistics.platform()
        .then((res) => setPlatformStats(res.data))
        .catch(() => {})
        .finally(() => setLoadingStats(false));
    }
  }, [role]);

  const activeMembers = members.filter((m) => m.status === "active").length;
  const totalRevenue = transactions.filter((t) => t.status === "paid" && (t.type === "cotisation" || t.type === "recette")).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.status === "paid" && (t.type === "depense" || t.type === "salaire")).reduce((s, t) => s + Math.abs(t.amount), 0);
  const subRevenue = syndicateSubscriptions.filter((s) => s.status === "active").reduce((s, sub) => s + sub.amount, 0);
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter((o) => o.status === "delivered").length;
  const openTickets = supportTickets.filter((t) => t.status === "open").length;

  const cotisationPaidRate = cotisations.length > 0
    ? Math.round((cotisations.filter((c) => c.status === "paid").length / cotisations.length) * 100)
    : 0;

  const revenueChartData = platformStats?.charts.revenue ?? [];
  const membersChartData = platformStats?.charts.members ?? [];
  const expensesChartData = platformStats?.charts.expenses ?? [];

  const platformRevenue = platformStats?.totalRevenue ?? totalRevenue;
  const platformExpenses = platformStats?.totalExpenses ?? totalExpenses;
  const platformMembers = platformStats?.totalMembers ?? (members.length + syndicates.reduce((s, sy) => s + sy.members, 0));
  const platformActiveSyndicates = platformStats?.activeSyndicates ?? syndicates.filter((s) => s.status === "active").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Statistiques</Text>
        <TouchableOpacity
          style={[styles.exportBtn, { borderColor: colors.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("Export", "Rapport exporté en PDF."); }}
        >
          <Feather name="download" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FilterTabs
        options={[
          { key: "global",      label: "Vue globale" },
          { key: "syndicats",   label: "Syndicats" },
          { key: "finance",     label: "Finance" },
          { key: "marketplace", label: "Marketplace" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        accentColor={colors.primary}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: isWide ? 32 : insets.bottom + 100 }}>

        <View style={[styles.periodRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {([["month", "Mois"], ["quarter", "Trimestre"], ["year", "Année"]] as ["month" | "quarter" | "year", string][]).map(([p, l]) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, { backgroundColor: period === p ? colors.primary : "transparent" }]}
              onPress={() => { Haptics.selectionAsync(); setPeriod(p); }}
            >
              <Text style={[styles.periodBtnText, { color: period === p ? "#fff" : colors.mutedForeground }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "global" && (
          <>
            <View style={styles.kpiGrid}>
              <KpiCard label="Total membres" value={platformMembers.toLocaleString()} icon="users" color={colors.primary} />
              <KpiCard label="Syndicats actifs" value={`${platformActiveSyndicates}`} icon="briefcase" color="#10b981" />
            </View>
            <View style={styles.kpiGrid}>
              <KpiCard label="Revenus totaux (MAD)" value={`${platformRevenue.toLocaleString()}`} icon="trending-up" color="#f59e0b" />
              <KpiCard label="Abonnements SaaS" value={`${subRevenue.toLocaleString()} MAD`} icon="star" color="#8b5cf6" sub="/an" />
            </View>

            <View style={[styles.quickStats, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: "Taux cotisations", value: `${cotisationPaidRate}%`, color: "#10b981" },
                { label: "Commandes livrées", value: `${deliveredOrders}/${totalOrders}`, color: "#3b82f6" },
                { label: "Produits marketplace", value: `${products.length}`, color: "#f97316" },
                { label: "Tickets ouverts", value: `${openTickets}`, color: "#ef4444" },
              ].map((s, i, arr) => (
                <View key={s.label} style={[styles.qsCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                  <Text style={[styles.qsVal, { color: s.color }]}>{s.value}</Text>
                  <Text style={[styles.qsLab, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: colors.foreground }]}>Revenus (MAD)</Text>
                {loadingStats
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[styles.chartSub, { color: colors.mutedForeground }]}>{revenueChartData.length === 0 ? "Aucune donnée" : period === "month" ? "Derniers mois" : period === "quarter" ? "Par trimestre" : "Annuel"}</Text>
                }
              </View>
              {revenueChartData.length > 0
                ? <BarChart data={sliceForPeriod(revenueChartData, period)} color={colors.primary} />
                : !loadingStats && <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }]}>Données disponibles après enregistrement de transactions</Text>
              }
            </View>

            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: colors.foreground }]}>Nouvelles adhésions</Text>
                {loadingStats
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[styles.chartSub, { color: colors.mutedForeground }]}>6 derniers mois</Text>
                }
              </View>
              {membersChartData.length > 0
                ? <BarChart data={sliceForPeriod(membersChartData, period)} color="#10b981" />
                : !loadingStats && <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }]}>Données disponibles après ajout de membres</Text>
              }
            </View>
          </>
        )}

        {tab === "syndicats" && (
          <>
            <View style={styles.kpiGrid}>
              <KpiCard label="Syndicats actifs" value={`${syndicates.filter((s) => s.status === "active").length}`} icon="check-circle" color="#10b981" />
              <KpiCard label="Membres total" value={`${syndicates.reduce((s, sy) => s + sy.members, 0).toLocaleString()}`} icon="users" color={colors.primary} />
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SYNDICATS PAR TAILLE</Text>
            {syndicates.length === 0
              ? <Text style={[{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }]}>Aucun syndicat enregistré</Text>
              : [...syndicates].sort((a, b) => b.members - a.members).map((sy, i) => {
                const maxM = Math.max(...syndicates.map((s) => s.members));
                const colors2 = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
                const color = colors2[i % colors2.length];
                return (
                  <View key={sy.id} style={[styles.rankRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.rankNum, { backgroundColor: color + "18" }]}>
                      <Text style={[styles.rankNumText, { color }]}>#{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={[styles.rankName, { color: colors.foreground }]} numberOfLines={1}>{sy.name}</Text>
                        <Text style={[styles.rankVal, { color: colors.foreground }]}>{sy.members} membres</Text>
                      </View>
                      <MiniBar value={sy.members} max={maxM} color={color} />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Text style={[styles.rankMeta, { color: colors.mutedForeground }]}>{sy.sector}</Text>
                        <Text style={[styles.rankMeta, { color: colors.mutedForeground }]}>• {sy.region}</Text>
                        <View style={[styles.activePill, { backgroundColor: sy.status === "active" ? "#10b98118" : "#ef444418" }]}>
                          <Text style={[styles.activePillText, { color: sy.status === "active" ? "#10b981" : "#ef4444" }]}>
                            {sy.status === "active" ? "Actif" : "Inactif"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            }
          </>
        )}

        {tab === "finance" && (
          <>
            <View style={styles.kpiGrid}>
              <KpiCard label="Recettes (MAD)" value={`${platformRevenue.toLocaleString()}`} icon="arrow-down-circle" color="#10b981" />
              <KpiCard label="Dépenses (MAD)" value={`${platformExpenses.toLocaleString()}`} icon="arrow-up-circle" color="#ef4444" />
            </View>
            <View style={styles.kpiGrid}>
              <KpiCard label="Solde net" value={`${(platformRevenue - platformExpenses).toLocaleString()} MAD`} icon="dollar-sign" color="#3b82f6" />
              <KpiCard label="Abonnements actifs" value={`${syndicateSubscriptions.filter((s) => s.status === "active").length}`} icon="star" color="#8b5cf6" />
            </View>

            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>Revenus vs Dépenses (MAD)</Text>
              {expensesChartData.length > 0 && revenueChartData.length > 0
                ? (
                  <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#10b981", marginBottom: 6 }]}>▲ Recettes</Text>
                      <BarChart data={sliceForPeriod(revenueChartData, period)} color="#10b981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#ef4444", marginBottom: 6 }]}>▼ Dépenses</Text>
                      <BarChart data={sliceForPeriod(expensesChartData, period)} color="#ef4444" />
                    </View>
                  </View>
                )
                : <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }]}>Données disponibles après enregistrement de transactions</Text>
              }
            </View>

            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>Abonnements SaaS par plan</Text>
              {[
                { plan: "Enterprise", count: syndicateSubscriptions.filter((s) => s.planId === "plan_enterprise" && s.status === "active").length, color: "#f59e0b", amount: 18000 },
                { plan: "Pro", count: syndicateSubscriptions.filter((s) => s.planId === "plan_pro" && s.status === "active").length, color: "#7c3aed", amount: 9600 },
                { plan: "Essentiel", count: syndicateSubscriptions.filter((s) => s.planId === "plan_essentiel" && s.status === "active").length, color: "#6b7280", amount: 4800 },
              ].map((p) => (
                <View key={p.plan} style={styles.planStatRow}>
                  <View style={[styles.planStatDot, { backgroundColor: p.color }]} />
                  <Text style={[styles.planStatName, { color: colors.foreground }]}>{p.plan}</Text>
                  <Text style={[styles.planStatCount, { color: colors.mutedForeground }]}>{p.count} syndicat{p.count !== 1 ? "s" : ""}</Text>
                  <Text style={[styles.planStatAmount, { color: p.color }]}>{(p.count * p.amount).toLocaleString()} MAD/an</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {tab === "marketplace" && (
          <>
            <View style={styles.kpiGrid}>
              <KpiCard label="Produits actifs" value={`${products.filter((p) => p.status === "available").length}`} icon="shopping-bag" color="#f97316" />
              <KpiCard label="Commandes totales" value={`${totalOrders}`} icon="package" color="#3b82f6" />
            </View>
            <View style={styles.kpiGrid}>
              <KpiCard label="Livrées" value={`${deliveredOrders}`} icon="check-circle" color="#10b981" />
              <KpiCard label="En attente validation" value={`${products.filter((p) => p.status === "pending").length}`} icon="clock" color="#f59e0b" />
            </View>

            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>Commandes par statut</Text>
              {(["pending", "confirmed", "shipped", "delivered", "cancelled"] as const).map((status) => {
                const cnt = orders.filter((o) => o.status === status).length;
                const colors2: Record<string, string> = { pending: "#f59e0b", confirmed: "#3b82f6", shipped: "#8b5cf6", delivered: "#10b981", cancelled: "#ef4444" };
                const labels: Record<string, string> = { pending: "En attente", confirmed: "Confirmé", shipped: "Expédié", delivered: "Livré", cancelled: "Annulé" };
                return (
                  <View key={status} style={styles.orderStatRow}>
                    <Text style={[styles.orderStatLabel, { color: colors.foreground }]}>{labels[status]}</Text>
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <MiniBar value={cnt} max={totalOrders || 1} color={colors2[status]} />
                    </View>
                    <View style={[styles.orderStatChip, { backgroundColor: colors2[status] + "18" }]}>
                      <Text style={[styles.orderStatCount, { color: colors2[status] }]}>{cnt}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.chartTitle, { color: colors.foreground }]}>Top produits</Text>
              {products.length === 0
                ? <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 12 }]}>Aucun produit</Text>
                : products.slice(0, 5).map((p, i) => (
                  <View key={p.id} style={styles.topProductRow}>
                    <View style={[styles.topNum, { backgroundColor: colors.primary + "18" }]}>
                      <Text style={[{ fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary }]}>#{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.topName, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                      <Text style={[styles.topMeta, { color: colors.mutedForeground }]}>{p.category} • {p.seller}</Text>
                    </View>
                    <Text style={[styles.topPrice, { color: colors.foreground }]}>{p.price} MAD</Text>
                  </View>
                ))
              }
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold" },
  exportBtn: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  periodRow: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  periodBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  kpiGrid: { flexDirection: "row", gap: 12 },
  quickStats: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  qsCell: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 3 },
  qsVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  qsLab: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chartTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  chartSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginLeft: 4 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  rankNum: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rankNumText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  rankName: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold" },
  rankVal: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rankMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  activePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  activePillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  planStatRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  planStatDot: { width: 10, height: 10, borderRadius: 5 },
  planStatName: { fontSize: 13, fontFamily: "Inter_600SemiBold", width: 80 },
  planStatCount: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  planStatAmount: { fontSize: 13, fontFamily: "Inter_700Bold" },
  orderStatRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  orderStatLabel: { fontSize: 12, fontFamily: "Inter_500Medium", width: 80 },
  orderStatChip: { width: 32, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  orderStatCount: { fontSize: 12, fontFamily: "Inter_700Bold" },
  topProductRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  topNum: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  topName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  topMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  topPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
