import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StatCard from "@/components/StatCard";
import { useAuth } from "@/context/AuthContext";
import { useActivity } from "@/context/ActivityContext";
import { useData } from "@/context/DataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useLanguage } from "@/context/LanguageContext";
import { SIDEBAR_COMPACT, SIDEBAR_FULL, useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type QuickActionKey = {
  labelKey: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  route: string;
  color: string;
};

// Super Admin is the PLATFORM OWNER — not a syndicate employee.
// Quick actions must only point to platform-administration screens.
// Syndicate-level routes (/finance, /buildings, /reports, /legal) are
// intentionally excluded — those belong to syndicate admins.
const QUICK_ACTIONS_SUPER: QuickActionKey[] = [
  { labelKey: "syndicates",          icon: "briefcase",  route: "/members",          color: "#7c3aed" },
  { labelKey: "tableauNational",     icon: "globe",      route: "/tableau-national", color: "#6366f1" },
  { labelKey: "gestionUtilisateurs", icon: "users",      route: "/utilisateurs",     color: "#3b82f6" },
  { labelKey: "statistiquesGlobales",icon: "trending-up",route: "/statistiques",     color: "#10b981" },
  { labelKey: "plansAbonnements",    icon: "star",       route: "/abonnements",      color: "#f59e0b" },
  { labelKey: "support",             icon: "headphones", route: "/support",          color: "#ef4444" },
  { labelKey: "auditLog",            icon: "shield",     route: "/journal-audit",    color: "#8b5cf6" },
  { labelKey: "creerSyndicat",       icon: "plus-circle",route: "/syndicate-setup",  color: "#0ea5e9" },
];

const QUICK_ACTIONS_ADMIN: QuickActionKey[] = [
  { labelKey: "owners",        icon: "users",       route: "/members",                   color: "#7c3aed" },
  { labelKey: "charges",       icon: "credit-card", route: "/charges",                   color: "#10b981" },
  { labelKey: "travaux",       icon: "tool",        route: "/travaux",                   color: "#f59e0b" },
  { labelKey: "assemblee",     icon: "users",       route: "/assemblee-generale",        color: "#6366f1" },
  { labelKey: "tableauBord",   icon: "bar-chart-2", route: "/tableau-bord-financier",    color: "#3b82f6" },
  { labelKey: "prestataires",  icon: "briefcase",   route: "/prestataires",              color: "#f97316" },
  { labelKey: "documents",     icon: "folder",      route: "/documents",                 color: "#6366f1" },
  { labelKey: "teamSyndic",    icon: "award",       route: "/equipe-syndic",             color: "#8b5cf6" },
];

const QUICK_ACTIONS_MEMBER: QuickActionKey[] = [
  { labelKey: "myApartment",   icon: "home",           route: "/mon-lot",            color: "#7c3aed" },
  { labelKey: "charges",       icon: "credit-card",    route: "/charges",            color: "#10b981" },
  { labelKey: "travaux",       icon: "tool",           route: "/travaux",            color: "#f59e0b" },
  { labelKey: "assemblee",     icon: "users",          route: "/assemblee-generale", color: "#6366f1" },
  { labelKey: "documents",     icon: "folder",         route: "/documents",          color: "#6366f1" },
  { labelKey: "chat",          icon: "message-circle", route: "/chat",               color: "#3b82f6" },
];

const QUICK_ACTIONS_TENANT: QuickActionKey[] = [
  { labelKey: "myApartment",   icon: "home",           route: "/mon-lot",    color: "#7c3aed" },
  { labelKey: "monBail",       icon: "file-text",      route: "/mon-bail",   color: "#3b82f6" },
  { labelKey: "travaux",       icon: "tool",           route: "/travaux",    color: "#f59e0b" },
  { labelKey: "incidents",     icon: "alert-triangle", route: "/sinistres",  color: "#ef4444" },
  { labelKey: "documents",     icon: "folder",         route: "/documents",  color: "#6366f1" },
  { labelKey: "chat",          icon: "message-circle", route: "/chat",       color: "#ec4899" },
];

const ACTION_GAP = 10;

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { members, elections, meetings, transactions, syndicates, alerts, conversations, cotisations, supportTickets } = useData();
  const { favorites } = useFavorites();
  const { activities } = useActivity();
  const { t } = useLanguage();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const { isWide, isDesktop, isTablet, width: screenWidth } = useBreakpoints();

  if (!user) return null;

  const isSuperAdmin = user.role === "super_admin";
  const isSyndicateAdmin = user.role === "syndicate_admin";
  const isMember = user.role === "member";
  const isTenant = user.role === "tenant";
  const isAdmin = isSuperAdmin || isSyndicateAdmin;

  const activeMembers = members.filter((m) => m.status === "active").length;
  const openElections = elections.filter((e) => e.status === "open").length;
  const upcomingMeetings = meetings.filter((m) => m.status === "scheduled");
  const totalRevenue = transactions
    .filter((t) => (t.type === "cotisation" || t.type === "recette") && t.status === "paid")
    .reduce((sum, t) => sum + t.amount, 0);
  const pendingCotisations = transactions.filter((t) => t.type === "cotisation" && t.status === "pending").length;
  const unreadAlerts = alerts.filter((a) => !a.read && !dismissedAlerts.has(a.id));
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  const quickActionsRaw = isSuperAdmin
    ? QUICK_ACTIONS_SUPER
    : isSyndicateAdmin
    ? QUICK_ACTIONS_ADMIN
    : isTenant
    ? QUICK_ACTIONS_TENANT
    : QUICK_ACTIONS_MEMBER;

  const quickActions = quickActionsRaw.map((a) => ({ ...a, label: t(a.labelKey) }));

  const greetingTime = () => {
    const h = new Date().getHours();
    if (h < 12) return t("greetingMorning");
    if (h < 18) return t("greetingAfternoon");
    return t("greetingEvening");
  };

  const roleLabel = isSuperAdmin
    ? t("superAdministrateur")
    : isSyndicateAdmin
    ? t("syndicateAdminRole")
    : isTenant
    ? t("roleTenant")
    : t("roleMember");

  const topPadding = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const topAlert = unreadAlerts[0];

  // Compute exact item width to avoid flex conflicts
  const sidebarW = isWide ? (isDesktop ? SIDEBAR_FULL : SIDEBAR_COMPACT) : 0;
  const hPad = isWide ? 24 : 20;
  const contentWidth = screenWidth - sidebarW - hPad * 2;
  const numCols = isDesktop ? 6 : isTablet ? 4 : 3;
  const actionItemWidth = Math.floor((contentWidth - ACTION_GAP * (numCols - 1)) / numCols);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: topPadding + 16, paddingHorizontal: hPad }]}>
        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greetingTime()},</Text>
            <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
            {user.syndicate ? <Text style={styles.syndicate}>{user.syndicate}</Text> : null}
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/search" as any); }}
            >
              <Feather name="search" size={20} color="#fff" />
            </TouchableOpacity>
            {totalUnread > 0 ? (
              <TouchableOpacity style={styles.headerBtn} onPress={() => router.push("/chat" as any)}>
                <Feather name="message-circle" size={20} color="#fff" />
                <View style={[styles.headerBadge, { backgroundColor: "#f59e0b" }]}>
                  <Text style={styles.headerBadgeText}>{totalUnread}</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push("/notifications" as any)}
            >
              <Feather name="bell" size={20} color="#fff" />
              {unreadAlerts.length > 0 ? (
                <View style={[styles.headerBadge, { backgroundColor: "#ef4444" }]}>
                  <Text style={styles.headerBadgeText}>{unreadAlerts.length}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.roleBadge}>
          <Feather name={isSuperAdmin ? "shield" : isSyndicateAdmin ? "briefcase" : "user"} size={11} color="rgba(255,255,255,0.9)" />
          <Text style={styles.roleBadgeText}>{roleLabel}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingHorizontal: hPad, paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Alert banner */}
        {topAlert && !dismissedAlerts.has(topAlert.id) ? (
          <TouchableOpacity
            style={[
              styles.alertBanner,
              {
                backgroundColor:
                  topAlert.type === "error" ? "#ef444410" :
                  topAlert.type === "warning" ? "#f59e0b10" :
                  topAlert.type === "success" ? "#10b98110" : colors.primary + "10",
                borderColor:
                  topAlert.type === "error" ? "#ef444440" :
                  topAlert.type === "warning" ? "#f59e0b40" :
                  topAlert.type === "success" ? "#10b98140" : colors.primary + "40",
              },
            ]}
            onPress={() => router.push("/notifications" as any)}
            activeOpacity={0.85}
          >
            <Feather
              name={topAlert.type === "error" ? "alert-circle" : topAlert.type === "warning" ? "alert-triangle" : topAlert.type === "success" ? "check-circle" : "info"}
              size={16}
              color={topAlert.type === "error" ? "#ef4444" : topAlert.type === "warning" ? "#f59e0b" : topAlert.type === "success" ? "#10b981" : colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertBannerTitle, { color: topAlert.type === "error" ? "#ef4444" : topAlert.type === "warning" ? "#f59e0b" : topAlert.type === "success" ? "#10b981" : colors.primary }]}>
                {topAlert.title}
              </Text>
              <Text style={[styles.alertBannerMsg, { color: colors.mutedForeground }]} numberOfLines={1}>
                {topAlert.message}
              </Text>
            </View>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => setDismissedAlerts((p) => new Set(p).add(topAlert.id))}
            >
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </TouchableOpacity>
        ) : null}

        {/* Upcoming meeting strip — tenants are not copropriétaires, no AG access */}
        {!isTenant && upcomingMeetings.length > 0 && (
          <View style={{ gap: 8 }}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("nextMeetings")}</Text>
              <TouchableOpacity onPress={() => router.push("/meetings" as any)}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>{t("seeAll")}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingEnd: 4 }}>
              {upcomingMeetings.slice(0, 3).map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.meetingChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => router.push("/meetings" as any)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.meetingChipDate, { backgroundColor: colors.primary }]}>
                    <Text style={styles.meetingChipDay}>{m.date ? m.date.split("-")[2] ?? "?" : "?"}</Text>
                    <Text style={styles.meetingChipMonth}>
                      {m.date ? new Date(m.date).toLocaleDateString("fr-FR", { month: "short" }).slice(0, 3).toUpperCase() : "—"}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.meetingChipTitle, { color: colors.foreground }]} numberOfLines={2}>{m.title}</Text>
                    <Text style={[styles.meetingChipTime, { color: colors.mutedForeground }]}>{m.time} • {(m.location ?? "").split(",")[0]}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Open election banner — tenants cannot vote in syndicate elections */}
        {!isTenant && openElections > 0 ? (
          <TouchableOpacity
            style={[styles.electionBanner, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/elections" as any)}
            activeOpacity={0.85}
          >
            <View style={[styles.electionBannerIcon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Feather name="check-square" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.electionBannerLabel}>{t("ongoingElection")}</Text>
              <Text style={styles.electionBannerTitle}>{openElections} {t("electionVoteNow")}</Text>
            </View>
            <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        ) : null}

        {/* Stats */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("overviewLabel")}</Text>
          {isSuperAdmin ? (
            <>
              <View style={styles.statsRow}>
                <StatCard label={t("syndicates")} value={syndicates.length} icon="briefcase" />
                <StatCard label={t("totalMembers")} value={syndicates.reduce((s, sy) => s + sy.members, 0)} icon="users" />
              </View>
              <View style={styles.statsRow}>
                <StatCard label={t("activeCount")} value={syndicates.filter((s) => s.status === "active").length} icon="activity" iconColor="#10b981" />
                <StatCard label={t("openTickets")} value={supportTickets.filter((t) => t.status === "open").length} icon="headphones" iconColor="#ef4444" subtitle={t("support")} />
              </View>
            </>
          ) : isSyndicateAdmin ? (
            <>
              <View style={styles.statsRow}>
                <StatCard label={t("activeMembers")} value={activeMembers} icon="users" />
                <StatCard label={t("revenue")} value={`${(totalRevenue / 1000).toFixed(1)}k`} icon="trending-up" />
              </View>
              <View style={styles.statsRow}>
                <StatCard label={t("dueCotisations")} value={pendingCotisations} icon="alert-circle" iconColor="#f59e0b" subtitle={t("pendingLabel")} />
                <StatCard label={t("scheduledMeetings")} value={upcomingMeetings.length} icon="calendar" iconColor="#3b82f6" />
              </View>
            </>
          ) : (
            <>
              {(() => {
                const myCot = cotisations.length > 0 ? cotisations[0] : null;
                const cotLabel = myCot?.status === "paid" ? t("paid") : myCot?.status === "overdue" ? t("overdue") : t("pendingLabel");
                const cotColor = myCot?.status === "paid" ? "#10b981" : myCot?.status === "overdue" ? "#ef4444" : "#f59e0b";
                const myMember = members.find((m) => m.email === user.email);
                const memberStatus = myMember?.status === "active" ? t("active") : myMember?.status === "inactive" ? t("inactive") : t("pendingLabel");
                const memberColor = myMember?.status === "active" ? "#10b981" : myMember?.status === "inactive" ? "#ef4444" : "#f59e0b";
                return (
                  <>
                    <View style={styles.statsRow}>
                      <StatCard label={t("myStatus")} value={memberStatus} icon="check-circle" iconColor={memberColor} />
                      <StatCard label={t("cotisationLabel")} value={cotLabel} icon="credit-card" iconColor={cotColor} />
                    </View>
                    <View style={styles.statsRow}>
                      <StatCard label={t("elections")} value={openElections} icon="check-square" iconColor="#f59e0b" />
                      <StatCard
                        label={t("amountDue")}
                        value={
                          myCot?.status !== "paid"
                            ? (() => {
                                const amt = Number(myCot?.amount ?? 0);
                                try {
                                  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(amt)) + " MAD";
                                } catch {
                                  return `${Math.round(amt)} MAD`;
                                }
                              })()
                            : "0 MAD"
                        }
                        icon="dollar-sign"
                        iconColor={myCot?.status !== "paid" ? "#ef4444" : "#10b981"}
                      />
                    </View>
                  </>
                );
              })()}
            </>
          )}
        </View>

        {/* Quick actions — responsive grid with exact widths */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("quickAccess")}</Text>
          <View style={styles.actionsGrid}>
            {quickActions.map((a) => (
              <TouchableOpacity
                key={a.labelKey}
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    width: actionItemWidth,
                  },
                ]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(a.route as any); }}
                activeOpacity={0.72}
              >
                <View style={[styles.actionIcon, { backgroundColor: a.color + "18" }]}>
                  <Feather name={a.icon} size={isTablet ? 22 : 20} color={a.color} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.foreground }]} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Favorites quick-access */}
        {favorites.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("myFavorites")}</Text>
              <TouchableOpacity onPress={() => router.push("/favorites" as any)}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>{t("seeAll")}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingEnd: 4 }}>
              {favorites.slice(0, 8).map((fav) => (
                <TouchableOpacity
                  key={fav.id}
                  style={[styles.favChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(fav.route as any); }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.favIcon, { backgroundColor: fav.color + "18" }]}>
                    <Feather name={fav.icon as any} size={16} color={fav.color} />
                  </View>
                  <Text style={[styles.favLabel, { color: colors.foreground }]} numberOfLines={1}>{fav.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recent activity */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("recentActivity")}</Text>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/activity" as any); }}>
              <Text style={[styles.seeAll, { color: colors.primary }]}>{t("seeAll")}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {activities.length > 0 ? (
              activities.slice(0, 5).map((act, i) => (
                <View
                  key={act.id}
                  style={[styles.activityItem, i < Math.min(activities.length, 5) - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}
                >
                  <View style={[styles.activityIcon, { backgroundColor: act.color + "18" }]}>
                    <Feather name={act.icon as any} size={14} color={act.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.activityLabel, { color: colors.foreground }]} numberOfLines={1}>{act.action}</Text>
                    <Text style={[styles.activityDate, { color: colors.mutedForeground }]} numberOfLines={1}>{act.target}</Text>
                  </View>
                  <Text style={[styles.activityTime, { color: colors.mutedForeground }]}>{(act as any).time ?? ""}</Text>
                </View>
              ))
            ) : isAdmin ? (
              transactions.slice(0, 5).map((tx, i) => (
                <View
                  key={tx.id}
                  style={[styles.activityItem, i < 4 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null]}
                >
                  <View style={[styles.activityIcon, { backgroundColor: tx.type === "cotisation" ? "#7c3aed18" : tx.type === "depense" ? "#ef444418" : "#10b98118" }]}>
                    <Feather
                      name={tx.type === "cotisation" ? "credit-card" : tx.type === "depense" ? "arrow-up-circle" : tx.type === "salaire" ? "user" : "arrow-down-circle"}
                      size={14}
                      color={tx.type === "cotisation" ? colors.primary : tx.type === "depense" ? colors.destructive : "#10b981"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.activityLabel, { color: colors.foreground }]} numberOfLines={1}>{tx.label}</Text>
                    <Text style={[styles.activityDate, { color: colors.mutedForeground }]}>{tx.date}</Text>
                  </View>
                  <Text style={[styles.activityAmount, { color: tx.type === "depense" || tx.type === "salaire" ? colors.destructive : colors.success }]}>
                    {tx.type === "depense" || tx.type === "salaire" ? "-" : "+"}{tx.amount} MAD
                  </Text>
                </View>
              ))
            ) : (
              <TouchableOpacity
                style={styles.activityEmpty}
                onPress={() => router.push("/elections" as any)}
                activeOpacity={0.75}
              >
                <View style={[styles.activityEmptyIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="activity" size={22} color={colors.primary} />
                </View>
                <Text style={[styles.activityEmptyTitle, { color: colors.foreground }]}>{t("noRecentActivity")}</Text>
                <Text style={[styles.activityEmptyText, { color: colors.mutedForeground }]}>{t("noRecentActivityDesc")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingBottom: 20, gap: 10 },
  headerContent: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  greeting: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },
  userName: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", marginTop: 2 },
  syndicate: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)", marginTop: 2 },
  headerBtns: { flexDirection: "row", gap: 8 },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", position: "relative" },
  headerBadge: { position: "absolute", top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  headerBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  roleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.9)" },
  body: { paddingTop: 16, gap: 12 },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  alertBannerTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  alertBannerMsg: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  seeAll: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  meetingChip: { width: 220, flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, overflow: "hidden", gap: 12 },
  meetingChipDate: { width: 52, alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 2 },
  meetingChipDay: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  meetingChipMonth: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.8)" },
  meetingChipTitle: { fontSize: 12, fontFamily: "Inter_700Bold", paddingEnd: 12 },
  meetingChipTime: { fontSize: 10, fontFamily: "Inter_400Regular", paddingEnd: 12 },
  electionBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  electionBannerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  electionBannerLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.75)" },
  electionBannerTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  section: { gap: 0 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 12 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: ACTION_GAP },
  actionBtn: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 8,
  },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  activityCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  activityItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  activityIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  activityLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  activityDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  activityAmount: { fontSize: 13, fontFamily: "Inter_700Bold", flexShrink: 0 },
  activityTime: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 0 },
  activityEmpty: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, gap: 8 },
  activityEmptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  activityEmptyTitle: { fontSize: 14, fontFamily: "Inter_700Bold", textAlign: "center" },
  activityEmptyText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  favChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  favIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  favLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", maxWidth: 100 },
});
