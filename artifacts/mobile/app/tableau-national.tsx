import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { statistics, type EnrichedSyndicate } from "@/services/api";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface SyndicateStat {
  id: string;
  name: string;
  region: string;
  members: number;
  activeMembers: number;
  cotisationRate: number;
  balance: number;
  pendingElections: number;
  openTickets: number;
  lastActivity: string;
  status: "healthy" | "warning" | "critical";
  adminName: string;
}

interface PlatformAlert {
  id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "critical";
  date: string;
  syndicat?: string;
}

type TabType = "syndicats" | "alertes" | "finances" | "stats" | "classement";

type RankingRow = {
  id: string;
  syndicateId: string;
  syndicateName?: string | null;
  rank: number;
  totalScore: number;
  collectionRate: number;
  incidentResolutionRate: number;
  documentationScore: number;
  meetingComplianceScore: number;
  memberSatisfaction: number;
  month: number;
  year: number;
  region?: string | null;
};

const HEALTH_CONFIG = {
  healthy: { label: "Sain", color: "#10b981", bg: "#10b98118", icon: "check-circle" as const },
  warning: { label: "Attention", color: "#f59e0b", bg: "#f59e0b18", icon: "alert-triangle" as const },
  critical: { label: "Critique", color: "#ef4444", bg: "#ef444418", icon: "alert-circle" as const },
};

const ALERT_TYPE_CONFIG = {
  info: { color: "#3b82f6", bg: "#3b82f618", icon: "info" as const },
  warning: { color: "#f59e0b", bg: "#f59e0b18", icon: "alert-triangle" as const },
  critical: { color: "#ef4444", bg: "#ef444418", icon: "alert-circle" as const },
};

function mapEnrichedToStat(e: EnrichedSyndicate): SyndicateStat {
  return {
    id: e.id,
    name: e.name,
    region: e.region,
    members: e.members,
    activeMembers: e.activeMembers,
    cotisationRate: e.cotisationRate,
    balance: e.balance,
    pendingElections: e.pendingElections,
    openTickets: e.openTickets,
    lastActivity: e.syStatus === "active" ? "Actif" : "Inactif",
    status: e.status,
    adminName: e.adminName,
  };
}

export default function TableauNationalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const { alerts } = useData();
  const { token } = useAuth();

  const [tab, setTab] = useState<TabType>("syndicats");
  const [selectedSyndicat, setSelectedSyndicat] = useState<SyndicateStat | null>(null);
  const [filterHealth, setFilterHealth] = useState<"all" | "healthy" | "warning" | "critical">("all");
  const [syndicats, setSyndicats] = useState<SyndicateStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    statistics.syndicates()
      .then((res) => setSyndicats(res.data.map(mapEnrichedToStat)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "classement") return;
    setRankingsLoading(true);
    apiRequest("/rankings", "GET", undefined, token)
      .then((data) => setRankings(data.data ?? []))
      .catch(() => {})
      .finally(() => setRankingsLoading(false));
  }, [tab, token]);

  // Map DataContext alerts to platform alerts format
  const platformAlerts: PlatformAlert[] = alerts.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.message ?? "",
    type: (a.type === "error" ? "critical" : a.type === "warning" ? "warning" : "info") as "info" | "warning" | "critical",
    date: a.date ?? new Date().toISOString().slice(0, 10),
    syndicat: undefined,
  }));

  const totalMembers = syndicats.reduce((s, x) => s + x.members, 0);
  const totalBalance = syndicats.reduce((s, x) => s + x.balance, 0);
  const avgCotisation = syndicats.length > 0 ? Math.round(syndicats.reduce((s, x) => s + x.cotisationRate, 0) / syndicats.length) : 0;
  const criticalCount = syndicats.filter((x) => x.status === "critical").length;
  const criticalAlerts = platformAlerts.filter((a) => a.type === "critical").length;

  const filteredSyndicats = syndicats.filter((s) => filterHealth === "all" || s.status === filterHealth);

  const TABS: { key: TabType; label: string; icon: keyof typeof Feather.glyphMap; badge?: number }[] = [
    { key: "syndicats", label: "Syndicats", icon: "layers", badge: criticalCount || undefined },
    { key: "alertes", label: "Alertes", icon: "bell", badge: criticalAlerts || undefined },
    { key: "finances", label: "Finances", icon: "dollar-sign" },
    { key: "stats", label: "Statistiques", icon: "bar-chart-2" },
    { key: "classement", label: "Classement", icon: "award" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Tableau National</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {loading ? "Chargement..." : `${syndicats.length} syndicats · ${totalMembers.toLocaleString()} membres au total`}
          </Text>
        </View>
        <View style={[styles.platformBadge, { backgroundColor: colors.primary + "15" }]}>
          <Feather name="shield" size={12} color={colors.primary} />
          <Text style={[styles.platformBadgeText, { color: colors.primary }]}>Super Admin</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.kpiScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingVertical: 10 }}
      >
        {loading
          ? <ActivityIndicator color={colors.primary} style={{ marginHorizontal: 20 }} />
          : [
            { label: "Syndicats", value: syndicats.length.toString(), icon: "layers" as const, color: colors.primary },
            { label: "Membres total", value: totalMembers.toLocaleString(), icon: "users" as const, color: "#3b82f6" },
            { label: "Taux cotis. moy.", value: `${avgCotisation}%`, icon: "percent" as const, color: "#10b981" },
            { label: "Solde plateforme", value: `${(totalBalance / 1000).toFixed(0)}k MAD`, icon: "dollar-sign" as const, color: "#6366f1" },
            { label: "Alertes critiques", value: criticalAlerts.toString(), icon: "alert-circle" as const, color: "#ef4444" },
            { label: "Syndicats critiques", value: criticalCount.toString(), icon: "alert-triangle" as const, color: "#f59e0b" },
          ].map((kpi) => (
            <View key={kpi.label} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.kpiIcon, { backgroundColor: kpi.color + "18" }]}>
                <Feather name={kpi.icon} size={14} color={kpi.color} />
              </View>
              <Text style={[styles.kpiVal, { color: kpi.color }]}>{kpi.value}</Text>
              <Text style={[styles.kpiLabel, { color: colors.mutedForeground }]}>{kpi.label}</Text>
            </View>
          ))
        }
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabsScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
            onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
          >
            <Feather name={t.icon} size={14} color={tab === t.key ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
            {t.badge ? (
              <View style={[styles.tabBadge, { backgroundColor: t.key === "alertes" ? "#ef4444" : "#f59e0b" }]}>
                <Text style={styles.tabBadgeText}>{t.badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === "syndicats" ? (
        loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>Chargement des syndicats...</Text>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 50, borderBottomWidth: 1, borderBottomColor: colors.border }}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
            >
              {(["all", "healthy", "warning", "critical"] as const).map((s) => {
                const labels = { all: "Tous", healthy: "Sain", warning: "Attention", critical: "Critique" };
                const c = s === "all" ? colors.primary : HEALTH_CONFIG[s].color;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, { backgroundColor: filterHealth === s ? c : colors.secondary, borderColor: filterHealth === s ? c : colors.border }]}
                    onPress={() => { setFilterHealth(s); Haptics.selectionAsync(); }}
                  >
                    {s !== "all" ? <Feather name={HEALTH_CONFIG[s].icon} size={11} color={filterHealth === s ? "#fff" : HEALTH_CONFIG[s].color} /> : null}
                    <Text style={[styles.chipText, { color: filterHealth === s ? "#fff" : colors.foreground }]}>{labels[s]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {filteredSyndicats.length === 0 ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }}>
                <Feather name="inbox" size={40} color={colors.mutedForeground} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.foreground }}>Aucun syndicat</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
                  {syndicats.length === 0 ? "Aucun syndicat enregistré sur la plateforme." : "Aucun syndicat ne correspond à ce filtre."}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredSyndicats}
                keyExtractor={(s) => s.id}
                contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 80 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: synd }) => {
                  const hc = HEALTH_CONFIG[synd.status];
                  return (
                    <TouchableOpacity
                      style={[styles.syndicatCard, { backgroundColor: colors.card, borderColor: synd.status === "critical" ? "#ef444440" : synd.status === "warning" ? "#f59e0b30" : colors.border }]}
                      onPress={() => { setSelectedSyndicat(synd); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.syndicatHeader}>
                        <View style={[styles.syndicatAvatar, { backgroundColor: colors.primary + "15" }]}>
                          <Feather name="layers" size={16} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.syndicatName, { color: colors.foreground }]} numberOfLines={2}>{synd.name}</Text>
                          <Text style={[styles.syndicatRegion, { color: colors.mutedForeground }]}>{synd.region}</Text>
                        </View>
                        <View style={[styles.healthBadge, { backgroundColor: hc.bg }]}>
                          <Feather name={hc.icon} size={11} color={hc.color} />
                          <Text style={[styles.healthBadgeText, { color: hc.color }]}>{hc.label}</Text>
                        </View>
                      </View>
                      <View style={[styles.metricsRow, { borderColor: colors.border }]}>
                        {[
                          { label: "Membres", value: synd.members.toLocaleString(), color: colors.foreground },
                          { label: "Cotisations", value: `${synd.cotisationRate}%`, color: synd.cotisationRate >= 80 ? "#10b981" : synd.cotisationRate >= 70 ? "#f59e0b" : "#ef4444" },
                          { label: "Solde", value: `${(synd.balance / 1000).toFixed(0)}k`, color: colors.foreground },
                          { label: "Tickets", value: synd.openTickets.toString(), color: synd.openTickets > 10 ? "#ef4444" : synd.openTickets > 5 ? "#f59e0b" : "#10b981" },
                        ].map((m, i, arr) => (
                          <View key={m.label} style={[styles.metricCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                            <Text style={[styles.metricVal, { color: m.color }]}>{m.value}</Text>
                            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.syndicatFooter}>
                        <Feather name="user" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.syndicatAdmin, { color: colors.mutedForeground }]}>{synd.adminName}</Text>
                        <Text style={[styles.syndicatDot, { color: colors.mutedForeground }]}>·</Text>
                        <Feather name="clock" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.syndicatTime, { color: colors.mutedForeground }]}>{synd.lastActivity}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </>
        )
      ) : tab === "alertes" ? (
        <FlatList
          data={platformAlerts}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: "center", justifyContent: "center", padding: 32, gap: 10 }}>
              <Feather name="bell-off" size={32} color={colors.mutedForeground} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.foreground }}>Aucune alerte</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground }}>Tout est sous contrôle.</Text>
            </View>
          }
          ListHeaderComponent={
            criticalAlerts > 0 ? (
              <View style={[styles.alertBanner, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}>
                <Feather name="alert-circle" size={14} color="#ef4444" />
                <Text style={[styles.alertBannerText, { color: "#ef4444" }]}>
                  {criticalAlerts} alerte{criticalAlerts > 1 ? "s" : ""} critique{criticalAlerts > 1 ? "s" : ""} nécessitent une action immédiate
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item: alert }) => {
            const ac = ALERT_TYPE_CONFIG[alert.type];
            return (
              <TouchableOpacity
                style={[styles.alertCard, { backgroundColor: colors.card, borderColor: alert.type === "critical" ? "#ef444440" : colors.border, borderLeftColor: ac.color, borderLeftWidth: 4 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Alert.alert(alert.title, `${alert.body}\n\nDate: ${alert.date}${alert.syndicat ? `\nSyndicat: ${alert.syndicat}` : ""}`, [
                    { text: "Fermer", style: "cancel" },
                    { text: "Prendre en charge", onPress: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) },
                  ]);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.alertCardHeader}>
                  <View style={[styles.alertIcon, { backgroundColor: ac.bg }]}>
                    <Feather name={ac.icon} size={16} color={ac.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.alertTitle, { color: colors.foreground }]}>{alert.title}</Text>
                    {alert.syndicat ? (
                      <Text style={[styles.alertSyndicat, { color: colors.primary }]}>{alert.syndicat}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.alertDate, { color: colors.mutedForeground }]}>{alert.date.slice(5)}</Text>
                </View>
                <Text style={[styles.alertBody, { color: colors.mutedForeground }]} numberOfLines={2}>{alert.body}</Text>
              </TouchableOpacity>
            );
          }}
        />
      ) : tab === "finances" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 80 }}>
          <View style={[styles.financeHero, { backgroundColor: colors.primary }]}>
            <View style={styles.financeHeroRow}>
              <Feather name="dollar-sign" size={20} color="rgba(255,255,255,0.6)" />
              <Text style={styles.financeHeroLabel}>Solde Total de la Plateforme</Text>
            </View>
            <Text style={styles.financeHeroAmount}>{loading ? "..." : totalBalance.toLocaleString("fr-MA")} MAD</Text>
            <Text style={styles.financeHeroSub}>{syndicats.length} syndicats · Données en temps réel</Text>
          </View>

          <View style={[styles.financeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.financeCardTitle, { color: colors.foreground }]}>Répartition par syndicat</Text>
            {loading
              ? <ActivityIndicator color={colors.primary} />
              : syndicats.length === 0
                ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>Aucun syndicat</Text>
                : [...syndicats].sort((a, b) => b.balance - a.balance).map((synd, i) => {
                  const pct = totalBalance > 0 ? (synd.balance / totalBalance) * 100 : 0;
                  const syndColors = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#6366f1", "#ec4899"];
                  const c = syndColors[i % syndColors.length];
                  return (
                    <View key={synd.id} style={styles.financeRow}>
                      <View style={[styles.syndDot, { backgroundColor: c }]} />
                      <Text style={[styles.financeRowName, { color: colors.foreground }]} numberOfLines={1}>{synd.name.split("—")[0].trim()}</Text>
                      <View style={[styles.financeBar, { backgroundColor: colors.border }]}>
                        <View style={[styles.financeBarFill, { width: `${pct}%`, backgroundColor: c }]} />
                      </View>
                      <Text style={[styles.financeRowAmt, { color: colors.foreground }]}>{(synd.balance / 1000).toFixed(0)}k</Text>
                    </View>
                  );
                })
            }
          </View>

          <View style={[styles.financeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.financeCardTitle, { color: colors.foreground }]}>Taux de recouvrement des cotisations</Text>
            {loading
              ? <ActivityIndicator color={colors.primary} />
              : [...syndicats].sort((a, b) => b.cotisationRate - a.cotisationRate).map((synd) => {
                const c = synd.cotisationRate >= 85 ? "#10b981" : synd.cotisationRate >= 70 ? "#f59e0b" : "#ef4444";
                return (
                  <View key={synd.id} style={styles.cotisRow}>
                    <Text style={[styles.cotisName, { color: colors.foreground }]} numberOfLines={1}>{synd.name.split("—")[0].trim().slice(0, 25)}</Text>
                    <View style={[styles.financeBar, { backgroundColor: colors.border }]}>
                      <View style={[styles.financeBarFill, { width: `${synd.cotisationRate}%`, backgroundColor: c }]} />
                    </View>
                    <Text style={[styles.cotisRate, { color: c }]}>{synd.cotisationRate}%</Text>
                  </View>
                );
              })
            }
          </View>

          <View style={styles.exportRow}>
            {[
              { label: "Rapport financier consolidé", icon: "file-text" as const, color: "#6366f1" },
              { label: "Export Excel — tous syndicats", icon: "download" as const, color: "#10b981" },
            ].map((a) => (
              <TouchableOpacity
                key={a.label}
                style={[styles.exportBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("Export", `"${a.label}" généré avec succès.`); }}
                activeOpacity={0.8}
              >
                <View style={[styles.exportIcon, { backgroundColor: a.color + "18" }]}>
                  <Feather name={a.icon} size={16} color={a.color} />
                </View>
                <Text style={[styles.exportLabel, { color: colors.foreground }]}>{a.label}</Text>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : tab === "stats" ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 80 }}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.statCardHeader}>
              <View style={[styles.statIcon, { backgroundColor: colors.primary + "18" }]}>
                <Feather name="map-pin" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.statCardTitle, { color: colors.foreground }]}>Membres par région</Text>
            </View>
            {loading
              ? <ActivityIndicator color={colors.primary} />
              : Array.from(new Set(syndicats.map((s) => s.region))).map((region, i) => {
                const count = syndicats.filter((s) => s.region === region).reduce((sum, s) => sum + s.members, 0);
                const pct = totalMembers > 0 ? (count / totalMembers) * 100 : 0;
                const regionColors = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b"];
                const c = regionColors[i % regionColors.length];
                return (
                  <View key={region} style={styles.regionRow}>
                    <View style={[styles.regionDot, { backgroundColor: c }]} />
                    <Text style={[styles.regionName, { color: colors.foreground, flex: 1 }]}>{region}</Text>
                    <View style={[styles.regionBar, { backgroundColor: colors.border }]}>
                      <View style={[styles.regionBarFill, { width: `${pct}%`, backgroundColor: c }]} />
                    </View>
                    <Text style={[styles.regionCount, { color: colors.mutedForeground }]}>{count.toLocaleString()}</Text>
                  </View>
                );
              })
            }
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.statCardHeader}>
              <View style={[styles.statIcon, { backgroundColor: "#10b98118" }]}>
                <Feather name="activity" size={15} color="#10b981" />
              </View>
              <Text style={[styles.statCardTitle, { color: colors.foreground }]}>Santé de la plateforme</Text>
            </View>
            {(["healthy", "warning", "critical"] as const).map((health) => {
              const hc = HEALTH_CONFIG[health];
              const count = syndicats.filter((s) => s.status === health).length;
              return (
                <View key={health} style={styles.healthRow}>
                  <Feather name={hc.icon} size={14} color={hc.color} />
                  <Text style={[styles.healthLabel, { color: colors.foreground, flex: 1 }]}>{hc.label}</Text>
                  <View style={[styles.healthBar, { backgroundColor: colors.border }]}>
                    <View style={[styles.healthBarFill, { width: syndicats.length > 0 ? `${(count / syndicats.length) * 100}%` : "0%", backgroundColor: hc.color }]} />
                  </View>
                  <Text style={[styles.healthCount, { color: hc.color }]}>{count} syndicat{count !== 1 ? "s" : ""}</Text>
                </View>
              );
            })}
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.statCardHeader}>
              <View style={[styles.statIcon, { backgroundColor: "#6366f118" }]}>
                <Feather name="zap" size={15} color="#6366f1" />
              </View>
              <Text style={[styles.statCardTitle, { color: colors.foreground }]}>Actions rapides</Text>
            </View>
            {[
              { label: "Créer un nouveau syndicat", icon: "plus-circle" as const, color: colors.primary, route: undefined },
              { label: "Gérer les abonnements", icon: "star" as const, color: "#f59e0b", route: "/abonnements" },
              { label: "Exporter rapport national", icon: "download" as const, color: "#10b981", route: undefined },
              { label: "Envoyer communiqué global", icon: "send" as const, color: "#ec4899", route: undefined },
            ].map((action, i) => (
              <View key={action.label}>
                {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                <TouchableOpacity
                  style={styles.quickActionRow}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (action.route) router.push(action.route as any);
                    else Alert.alert("Action", `"${action.label}" — fonctionnalité disponible dans la prochaine mise à jour.`);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: action.color + "18" }]}>
                    <Feather name={action.icon} size={16} color={action.color} />
                  </View>
                  <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>{action.label}</Text>
                  <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : tab === "classement" ? (
        rankingsLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
            <ActivityIndicator size="large" color="#f59e0b" />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>Calcul du classement...</Text>
          </View>
        ) : (
          <FlatList
            data={rankings}
            keyExtractor={(r) => r.id}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 80 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 4 }]}>
                <Text style={[styles.statCardTitle, { color: colors.foreground }]}>
                  Classement National · {rankings[0]?.month ?? "—"}/{rankings[0]?.year ?? ""}
                </Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, marginTop: 4 }}>
                  Score calculé sur 5 critères : recouvrement, résolution incidents, documentation, réunions, satisfaction.
                </Text>
              </View>
            }
            ListEmptyComponent={
              <View style={{ alignItems: "center", justifyContent: "center", padding: 40, gap: 12 }}>
                <Feather name="award" size={36} color={colors.mutedForeground} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.foreground }}>Aucun classement disponible</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
                  Utilisez "Calculer le classement" dans le panneau super-admin pour générer les scores.
                </Text>
              </View>
            }
            renderItem={({ item: r, index }) => {
              const podiumColors = ["#f59e0b", "#9ca3af", "#a16207"];
              const rankColor = r.rank <= 3 ? podiumColors[r.rank - 1] : colors.primary;
              return (
                <View style={[styles.syndicatCard, { backgroundColor: colors.card, borderColor: r.rank === 1 ? "#f59e0b40" : colors.border }]}>
                  <View style={styles.syndicatHeader}>
                    <View style={[styles.syndicatAvatar, { backgroundColor: rankColor + "20" }]}>
                      <Text style={{ fontSize: r.rank <= 3 ? 18 : 14, fontFamily: "Inter_700Bold", color: rankColor }}>#{r.rank}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.syndicatName, { color: colors.foreground }]} numberOfLines={1}>{r.syndicateName ?? r.syndicateId}</Text>
                      {r.region ? <Text style={[styles.syndicatRegion, { color: colors.mutedForeground }]}>{r.region}</Text> : null}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: rankColor }}>{Math.round(r.totalScore)}</Text>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>/ 100</Text>
                    </View>
                  </View>
                  <View style={[styles.metricsRow, { borderColor: colors.border }]}>
                    {[
                      { label: "Recouvr.", value: `${Math.round(r.collectionRate)}%`, color: "#10b981" },
                      { label: "Incidents", value: `${Math.round(r.incidentResolutionRate)}%`, color: "#3b82f6" },
                      { label: "Docs", value: `${Math.round(r.documentationScore)}`, color: "#7c3aed" },
                      { label: "Réunions", value: `${Math.round(r.meetingComplianceScore)}`, color: "#f59e0b" },
                    ].map((m, i, arr) => (
                      <View key={m.label} style={[styles.metricCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                        <Text style={[styles.metricVal, { color: m.color }]}>{m.value}</Text>
                        <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            }}
          />
        )
      ) : null}

      <Modal visible={!!selectedSyndicat} animationType="slide" presentationStyle="pageSheet">
        {selectedSyndicat ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelectedSyndicat(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground, flex: 1, marginLeft: 12 }]} numberOfLines={2}>
                {selectedSyndicat.name}
              </Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
              {(() => {
                const hc = HEALTH_CONFIG[selectedSyndicat.status];
                return (
                  <>
                    <View style={[styles.syndicatDetailHero, { backgroundColor: hc.bg, borderColor: hc.color + "40" }]}>
                      <View style={[styles.syndicatDetailIcon, { backgroundColor: hc.color + "25" }]}>
                        <Feather name={hc.icon} size={24} color={hc.color} />
                      </View>
                      <Text style={[styles.syndicatDetailName, { color: colors.foreground }]}>{selectedSyndicat.name}</Text>
                      <View style={[styles.healthBadge, { backgroundColor: hc.bg, borderWidth: 1, borderColor: hc.color + "60" }]}>
                        <Feather name={hc.icon} size={11} color={hc.color} />
                        <Text style={[styles.healthBadgeText, { color: hc.color }]}>{hc.label}</Text>
                      </View>
                    </View>

                    <View style={styles.detailMetrics}>
                      {[
                        { label: "Membres totaux", value: selectedSyndicat.members.toLocaleString(), color: colors.primary },
                        { label: "Membres actifs", value: selectedSyndicat.activeMembers.toLocaleString(), color: "#10b981" },
                        { label: "Taux cotisations", value: `${selectedSyndicat.cotisationRate}%`, color: selectedSyndicat.cotisationRate >= 80 ? "#10b981" : "#f59e0b" },
                        { label: "Solde", value: `${selectedSyndicat.balance.toLocaleString()} MAD`, color: "#6366f1" },
                      ].map((m) => (
                        <View key={m.label} style={[styles.detailMetricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <Text style={[styles.detailMetricVal, { color: m.color }]}>{m.value}</Text>
                          <Text style={[styles.detailMetricLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {[
                        { label: "Région", value: selectedSyndicat.region },
                        { label: "Administrateur", value: selectedSyndicat.adminName },
                        { label: "Élections en attente", value: selectedSyndicat.pendingElections.toString() },
                        { label: "Tickets ouverts", value: selectedSyndicat.openTickets.toString() },
                        { label: "Statut", value: selectedSyndicat.lastActivity },
                      ].map((row, i) => (
                        <View key={row.label}>
                          {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                          <View style={styles.infoRow}>
                            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                            <Text style={[styles.infoValue, { color: colors.foreground }]}>{row.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    <View style={styles.detailActions}>
                      {[
                        { label: "Contacter l'admin", icon: "message-circle" as const, bg: colors.primary, text: "#fff" },
                        { label: "Rapport détaillé", icon: "file-text" as const, bg: colors.secondary, text: colors.primary },
                      ].map((a) => (
                        <TouchableOpacity
                          key={a.label}
                          style={[styles.detailActionBtn, { backgroundColor: a.bg }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (a.label === "Contacter l'admin") router.push("/chat" as any);
                            else Alert.alert("Rapport", `Rapport détaillé de ${selectedSyndicat.name} généré.`);
                            setSelectedSyndicat(null);
                          }}
                        >
                          <Feather name={a.icon} size={14} color={a.text} />
                          <Text style={[styles.detailActionText, { color: a.text }]}>{a.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  platformBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  platformBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  kpiScroll: { borderBottomWidth: 1, maxHeight: 90 },
  kpiCard: { alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1, gap: 4, minWidth: 100 },
  kpiIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  kpiVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  kpiLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  tabsScroll: { flexShrink: 0, borderBottomWidth: 1 },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 14 },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  syndicatCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  syndicatHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  syndicatAvatar: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  syndicatName: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  syndicatRegion: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  healthBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  healthBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  metricsRow: { flexDirection: "row", borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  metricCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  metricVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  metricLabel: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  syndicatFooter: { flexDirection: "row", alignItems: "center", gap: 5 },
  syndicatAdmin: { fontSize: 11, fontFamily: "Inter_400Regular" },
  syndicatDot: { fontSize: 11 },
  syndicatTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  alertBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  alertCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  alertCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  alertIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  alertTitle: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  alertSyndicat: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  alertDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  alertBody: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  financeHero: { borderRadius: 20, padding: 20, gap: 8 },
  financeHeroRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  financeHeroLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" },
  financeHeroAmount: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  financeHeroSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" },
  financeCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  financeCardTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  financeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  syndDot: { width: 8, height: 8, borderRadius: 4 },
  financeRowName: { fontSize: 11, fontFamily: "Inter_500Medium", width: 80 },
  financeBar: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  financeBarFill: { height: 6, borderRadius: 3 },
  financeRowAmt: { fontSize: 11, fontFamily: "Inter_600SemiBold", width: 36, textAlign: "right" },
  cotisRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cotisName: { fontSize: 10, fontFamily: "Inter_500Medium", width: 80 },
  cotisRate: { fontSize: 11, fontFamily: "Inter_700Bold", width: 32, textAlign: "right" },
  exportRow: { gap: 8 },
  exportBtn: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  exportIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  exportLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  statCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  statCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  regionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  regionDot: { width: 8, height: 8, borderRadius: 4 },
  regionName: { fontSize: 11, fontFamily: "Inter_500Medium" },
  regionBar: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  regionBarFill: { height: 6, borderRadius: 3 },
  regionCount: { fontSize: 11, fontFamily: "Inter_600SemiBold", width: 50, textAlign: "right" },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  healthLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  healthBar: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  healthBarFill: { height: 6, borderRadius: 3 },
  healthCount: { fontSize: 11, fontFamily: "Inter_600SemiBold", width: 70, textAlign: "right" },
  sep: { height: 1 },
  quickActionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  quickActionIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  syndicatDetailHero: { alignItems: "center", gap: 10, padding: 20, borderRadius: 18, borderWidth: 1 },
  syndicatDetailIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  syndicatDetailName: { fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" },
  detailMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailMetricCard: { flex: 1, minWidth: "45%", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 4 },
  detailMetricVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  detailMetricLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  infoCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  detailActions: { flexDirection: "row", gap: 10 },
  detailActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 13 },
  detailActionText: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
