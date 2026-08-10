import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StatCard from "@/components/StatCard";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  SIDEBAR_COMPACT,
  SIDEBAR_FULL,
  useBreakpoints,
} from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { LinearGradient } from "expo-linear-gradient";
import { audit as auditApi } from "@/services/api";

// Keeping the original quick actions arrays mapping for the different roles.
// To save space and maintain exact logic, these are preserved exactly.
const QUICK_ACTIONS_SUPER = [
  {
    labelKey: "syndicates",
    icon: "briefcase",
    route: "/members",
    color: "#2563EB",
  },
  {
    labelKey: "tableauNational",
    icon: "globe",
    route: "/tableau-national",
    color: "#6366f1",
  },
  {
    labelKey: "gestionUtilisateurs",
    icon: "users",
    route: "/utilisateurs",
    color: "#3b82f6",
  },
  {
    labelKey: "statistiquesGlobales",
    icon: "trending-up",
    route: "/statistiques",
    color: "#10b981",
  },
  {
    labelKey: "plansAbonnements",
    icon: "star",
    route: "/abonnements",
    color: "#f59e0b",
  },
  {
    labelKey: "support",
    icon: "headphones",
    route: "/support",
    color: "#ef4444",
  },
  {
    labelKey: "auditLog",
    icon: "shield",
    route: "/journal-audit",
    color: "#8b5cf6",
  },
  {
    labelKey: "creerSyndicat",
    icon: "plus-circle",
    route: "/syndicate-setup",
    color: "#0ea5e9",
  },
];
const QUICK_ACTIONS_ADMIN = [
  { labelKey: "owners", icon: "users", route: "/members", color: "#2563EB" },
  {
    labelKey: "charges",
    icon: "credit-card",
    route: "/charges",
    color: "#10b981",
  },
  { labelKey: "travaux", icon: "tool", route: "/travaux", color: "#f59e0b" },
  {
    labelKey: "assemblee",
    icon: "users",
    route: "/assemblee-generale",
    color: "#6366f1",
  },
  {
    labelKey: "tableauBord",
    icon: "bar-chart-2",
    route: "/tableau-bord-financier",
    color: "#3b82f6",
  },
  {
    labelKey: "prestataires",
    icon: "briefcase",
    route: "/prestataires",
    color: "#f97316",
  },
  {
    labelKey: "documents",
    icon: "folder",
    route: "/documents",
    color: "#6366f1",
  },
  {
    labelKey: "teamSyndic",
    icon: "award",
    route: "/equipe-syndic",
    color: "#8b5cf6",
  },
];
const QUICK_ACTIONS_PRESIDENT = [
  {
    labelKey: "assembleesGenerales",
    icon: "users",
    route: "/assemblee-generale",
    color: "#2563EB",
  },
  {
    labelKey: "reunionsConvocations",
    icon: "calendar",
    route: "/meetings",
    color: "#3b82f6",
  },
  {
    labelKey: "votesResolutions",
    icon: "check-square",
    route: "/elections",
    color: "#f59e0b",
  },
  {
    labelKey: "documentsCopro",
    icon: "folder",
    route: "/documents",
    color: "#6366f1",
  },
  {
    labelKey: "governance",
    icon: "award",
    route: "/governance",
    color: "#8b5cf6",
  },
  { labelKey: "travaux", icon: "tool", route: "/travaux", color: "#f97316" },
];
const QUICK_ACTIONS_TREASURER = [
  {
    labelKey: "tableauBord",
    icon: "bar-chart-2",
    route: "/tableau-bord-financier",
    color: "#3b82f6",
  },
  {
    labelKey: "chargesAppels",
    icon: "credit-card",
    route: "/charges",
    color: "#10b981",
  },
  {
    labelKey: "budgetPrevisionnel",
    icon: "pie-chart",
    route: "/budget-previsionnel",
    color: "#8b5cf6",
  },
  {
    labelKey: "rapportsFinanciers",
    icon: "bar-chart-2",
    route: "/reports",
    color: "#2563EB",
  },
  {
    labelKey: "escalationLabel",
    icon: "trending-up",
    route: "/escalation",
    color: "#ef4444",
  },
  {
    labelKey: "devisFactures",
    icon: "file-text",
    route: "/invoices",
    color: "#6366f1",
  },
];
const QUICK_ACTIONS_SECRETARY = [
  {
    labelKey: "documentsCopro",
    icon: "folder",
    route: "/documents",
    color: "#6366f1",
  },
  {
    labelKey: "reunionsConvocations",
    icon: "calendar",
    route: "/meetings",
    color: "#3b82f6",
  },
  {
    labelKey: "assembleesGenerales",
    icon: "users",
    route: "/assemblee-generale",
    color: "#2563EB",
  },
  { labelKey: "pvLabel", icon: "file-text", route: "/pv", color: "#8b5cf6" },
  {
    labelKey: "publicationsActualites",
    icon: "rss",
    route: "/publications",
    color: "#f97316",
  },
  {
    labelKey: "actesAdministratifs",
    icon: "file-text",
    route: "/actes-administratifs",
    color: "#06b6d4",
  },
];
const QUICK_ACTIONS_COMMITTEE = [
  {
    labelKey: "reunionsConvocations",
    icon: "calendar",
    route: "/meetings",
    color: "#3b82f6",
  },
  {
    labelKey: "votesResolutions",
    icon: "check-square",
    route: "/elections",
    color: "#f59e0b",
  },
  {
    labelKey: "governance",
    icon: "award",
    route: "/governance",
    color: "#8b5cf6",
  },
  {
    labelKey: "documentsCopro",
    icon: "folder",
    route: "/documents",
    color: "#6366f1",
  },
  {
    labelKey: "avisResidents",
    icon: "bell",
    route: "/annonces",
    color: "#ec4899",
  },
  {
    labelKey: "notifications",
    icon: "bell",
    route: "/notifications",
    color: "#f59e0b",
  },
];
const QUICK_ACTIONS_MEMBER = [
  {
    labelKey: "paymentHistory",
    icon: "credit-card",
    route: "/paiements",
    color: "#10b981",
  },
  {
    labelKey: "documentsCopro",
    icon: "folder",
    route: "/documents",
    color: "#6366f1",
  },
  {
    labelKey: "reclamationsLabel",
    icon: "inbox",
    route: "/reclamations",
    color: "#f97316",
  },
  {
    labelKey: "reunionsConvocations",
    icon: "calendar",
    route: "/meetings",
    color: "#3b82f6",
  },
  {
    labelKey: "votesResolutions",
    icon: "check-square",
    route: "/elections",
    color: "#f59e0b",
  },
  {
    labelKey: "notifications",
    icon: "bell",
    route: "/notifications",
    color: "#ec4899",
  },
];
const QUICK_ACTIONS_TENANT = [
  {
    labelKey: "documentsCopro",
    icon: "folder",
    route: "/documents",
    color: "#6366f1",
  },
  {
    labelKey: "avisResidents",
    icon: "bell",
    route: "/annonces",
    color: "#f59e0b",
  },
  {
    labelKey: "demandesIntervention",
    icon: "headphones",
    route: "/support",
    color: "#ef4444",
  },
  {
    labelKey: "notifications",
    icon: "bell",
    route: "/notifications",
    color: "#ec4899",
  },
  {
    labelKey: "monBail",
    icon: "file-text",
    route: "/mon-bail",
    color: "#3b82f6",
  },
];

const ACTION_GAP = 12;

interface DashboardActivity {
  id: string;
  action: string;
  target: string;
  timestamp: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

function mapAuditActivity(raw: {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
}): DashboardActivity {
  const entity = (raw.entity ?? "").toLowerCase();
  const isFinance =
    entity.includes("payment") ||
    entity.includes("transaction") ||
    entity.includes("cotisation") ||
    entity.includes("invoice");
  const isDocument = entity.includes("document") || entity.includes("file");
  const isGovernance =
    entity.includes("meeting") ||
    entity.includes("election") ||
    entity.includes("vote");

  return {
    id: raw.id,
    action: raw.action ?? "",
    target: raw.entityId
      ? `${raw.entity ?? ""} #${raw.entityId.slice(0, 8)}`
      : (raw.entity ?? ""),
    timestamp: raw.createdAt ?? "",
    icon: isFinance
      ? "dollar-sign"
      : isDocument
        ? "file-text"
        : isGovernance
          ? "calendar"
          : "activity",
    color: isFinance
      ? "#10b981"
      : isDocument
        ? "#6366f1"
        : isGovernance
          ? "#3b82f6"
          : "#6b7280",
  };
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    dataLoading,
    dataLoadError,
    refreshData,
    members,
    elections,
    meetings,
    transactions,
    syndicates,
    alerts,
    conversations,
    cotisations,
    supportTickets,
  } = useData();
  const { t, lang, isRTL } = useLanguage();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(
    new Set(),
  );
  const [serverActivities, setServerActivities] = useState<DashboardActivity[]>(
    [],
  );
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadError, setActivityLoadError] = useState(false);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const { isWide, isDesktop, isTablet, width: screenWidth } = useBreakpoints();

  useEffect(() => {
    const role = user?.role;
    const canReadAudit =
      role === "super_admin" ||
      role === "syndicate_admin" ||
      role === "president";
    if (!user || !canReadAudit) {
      setServerActivities([]);
      setActivityLoading(false);
      setActivityLoadError(false);
      return;
    }

    let cancelled = false;
    setActivityLoading(true);
    setActivityLoadError(false);
    auditApi
      .getLogs()
      .then((res) => {
        if (cancelled) return;
        setServerActivities((res.data ?? []).slice(0, 5).map(mapAuditActivity));
      })
      .catch(() => {
        if (!cancelled) setActivityLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, activityRefreshKey]);

  if (!user) return null;

  const role = user.role;
  const isSuperAdmin = role === "super_admin";
  const isSyndicateAdmin = role === "syndicate_admin";
  const isPresident = role === "president";
  const isTreasurer = role === "treasurer";
  const isSecretary = role === "secretary";
  const isCommitteeMember = role === "committee_member";
  const isMember = role === "member";
  const isTenant = role === "tenant";
  const isSyndicateTeam =
    isSyndicateAdmin ||
    isPresident ||
    isTreasurer ||
    isSecretary ||
    isCommitteeMember;
  const canViewElections =
    isSyndicateAdmin ||
    isPresident ||
    isSecretary ||
    isCommitteeMember ||
    isMember;

  const activeMembers = members.filter((m) => m.status === "active").length;
  const openElections = elections.filter((e) => e.status === "open").length;
  const upcomingMeetings = meetings.filter((m) => m.status === "scheduled");
  const totalRevenue = transactions
    .filter(
      (t) =>
        (t.type === "cotisation" || t.type === "recette") &&
        t.status === "paid",
    )
    .reduce((sum, t) => sum + t.amount, 0);
  const pendingCotisations = transactions.filter(
    (t) => t.type === "cotisation" && t.status === "pending",
  ).length;
  const unreadAlerts = alerts.filter(
    (a) => !a.read && !dismissedAlerts.has(a.id),
  );
  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);
  const personalActivities: DashboardActivity[] = [
    ...alerts.slice(0, 3).map((alert) => ({
      id: `alert-${alert.id}`,
      action: alert.title,
      target: alert.message,
      timestamp: alert.date,
      icon:
        alert.type === "error"
          ? ("alert-circle" as const)
          : alert.type === "warning"
            ? ("alert-triangle" as const)
            : ("bell" as const),
      color:
        alert.type === "error"
          ? "#ef4444"
          : alert.type === "warning"
            ? "#f59e0b"
            : "#3b82f6",
    })),
    ...cotisations.slice(0, 2).map((cotisation) => ({
      id: `cotisation-${cotisation.id}`,
      action: t("cotisationLabel"),
      target: `${cotisation.label} · ${
        cotisation.status === "paid"
          ? t("paid")
          : cotisation.status === "overdue"
            ? t("overdue")
            : t("pendingLabel")
      }`,
      timestamp: cotisation.paidDate ?? cotisation.dueDate,
      icon: "credit-card" as const,
      color:
        cotisation.status === "paid"
          ? "#10b981"
          : cotisation.status === "overdue"
            ? "#ef4444"
            : "#f59e0b",
    })),
  ];
  const dashboardActivities =
    isSuperAdmin || isSyndicateAdmin || isPresident
      ? serverActivities
      : personalActivities.slice(0, 5);

  const quickActionsRaw = isSuperAdmin
    ? QUICK_ACTIONS_SUPER
    : isSyndicateAdmin
      ? QUICK_ACTIONS_ADMIN
      : isPresident
        ? QUICK_ACTIONS_PRESIDENT
        : isTreasurer
          ? QUICK_ACTIONS_TREASURER
          : isSecretary
            ? QUICK_ACTIONS_SECRETARY
            : isCommitteeMember
              ? QUICK_ACTIONS_COMMITTEE
              : isTenant
                ? QUICK_ACTIONS_TENANT
                : QUICK_ACTIONS_MEMBER;

  const resolveActionColor = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized.includes("10b981") || normalized.includes("06b6d4")) {
      return colors.success;
    }
    if (normalized.includes("f59e0b") || normalized.includes("f97316")) {
      return colors.warning;
    }
    if (normalized.includes("ef4444") || normalized.includes("ec4899")) {
      return colors.destructive;
    }
    if (normalized.includes("8b5cf6") || normalized.includes("6366f1")) {
      return colors.info;
    }
    return colors.primary;
  };

  const quickActions = quickActionsRaw.map((a) => ({
    ...a,
    color: resolveActionColor(a.color),
    label: t(a.labelKey) || a.labelKey,
  }));

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
      : isPresident
        ? t("rolePresident")
        : isTreasurer
          ? t("roleTresorier")
          : isSecretary
            ? t("roleSecrétaire")
            : isCommitteeMember
              ? t("roleMembreConseil")
              : isTenant
                ? t("roleTenant")
                : t("roleMember");

  const topPadding = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  const topAlert = unreadAlerts[0];
  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "en"
        ? "en-US"
        : lang === "es"
          ? "es-ES"
          : "fr-FR";
  const formatMad = (amount: number) => {
    try {
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(amount))} MAD`;
    } catch {
      return `${Math.round(amount)} MAD`;
    }
  };
  const formatDate = (
    value: string,
    options: Intl.DateTimeFormatOptions = {},
  ) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    try {
      return date.toLocaleDateString(locale, options);
    } catch {
      return value;
    }
  };

  const sidebarW = isWide ? (isDesktop ? SIDEBAR_FULL : SIDEBAR_COMPACT) : 0;
  const hPad = isWide ? 32 : 20;
  const contentWidth = screenWidth - sidebarW - hPad * 2;
  // Two comfortable touch columns on phones; the old three-column grid
  // made labels wrap and hid the action hierarchy on compact Android screens.
  const numCols = isDesktop ? 6 : isTablet ? 4 : 2;
  const actionItemWidth = Math.floor(
    (contentWidth - ACTION_GAP * (numCols - 1)) / numCols,
  );

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          direction: isRTL ? "rtl" : "ltr",
        },
      ]}
    >
      {/* Premium Header */}
      <LinearGradient
        colors={[colors.primary, "#1D4ED8"]}
        style={[
          styles.header,
          {
            paddingTop: topPadding + 20,
            paddingHorizontal: hPad,
            paddingBottom: 24,
          },
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.greeting}>{greetingTime()},</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {user.name}
            </Text>
            {user.syndicate && (
              <View style={styles.syndicateWrapper}>
                <Feather
                  name="map-pin"
                  size={12}
                  color="rgba(255,255,255,0.7)"
                />
                <Text style={styles.syndicate}>{user.syndicate}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/search" as any);
              }}
            >
              <Feather
                name="search"
                size={22}
                color={colors.primaryForeground}
              />
            </TouchableOpacity>
            {totalUnread > 0 && (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => router.push("/chat" as any)}
              >
                <Feather
                  name="message-circle"
                  size={22}
                  color={colors.primaryForeground}
                />
                <View
                  style={[
                    styles.headerBadge,
                    { backgroundColor: colors.warning },
                  ]}
                >
                  <Text style={styles.headerBadgeText}>{totalUnread}</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push("/notifications" as any)}
            >
              <Feather name="bell" size={22} color={colors.primaryForeground} />
              {unreadAlerts.length > 0 && (
                <View
                  style={[
                    styles.headerBadge,
                    { backgroundColor: colors.destructive },
                  ]}
                >
                  <Text style={styles.headerBadgeText}>
                    {unreadAlerts.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.roleBadgeWrapper}>
          <View style={styles.roleBadge}>
            <Feather
              name={
                isSuperAdmin
                  ? "shield"
                  : isSyndicateAdmin
                    ? "briefcase"
                    : isPresident
                      ? "award"
                      : isTreasurer
                        ? "bar-chart-2"
                        : isSecretary
                          ? "file-text"
                          : isCommitteeMember
                            ? "users"
                            : isTenant
                              ? "key"
                              : "home"
              }
              size={12}
              color={colors.primary}
            />
            <Text style={[styles.roleBadgeText, { color: colors.primary }]}>
              {roleLabel}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1, marginTop: -20 }}
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: hPad,
            paddingBottom: isWide ? 40 : insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Data Status */}
        <View
          style={[
            styles.dataStatusCard,
            {
              backgroundColor: dataLoadError
                ? colors.destructive + "10"
                : colors.card,
              borderColor: dataLoadError
                ? colors.destructive + "30"
                : colors.border,
              shadowColor: "#000",
              elevation: 4,
            },
          ]}
        >
          {dataLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View
              style={[
                styles.dataStatusIcon,
                {
                  backgroundColor: dataLoadError
                    ? colors.destructive + "20"
                    : colors.success + "20",
                },
              ]}
            >
              <Feather
                name={dataLoadError ? "wifi-off" : "check"}
                size={16}
                color={dataLoadError ? colors.destructive : colors.success}
              />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[styles.dataStatusTitle, { color: colors.foreground }]}
            >
              {dataLoading
                ? t("dashboardLoading")
                : dataLoadError
                  ? t("dashboardLoadError")
                  : t("dashboardUpdated")}
            </Text>
            {!dataLoading && dataLoadError && (
              <Text
                style={[
                  styles.dataStatusMessage,
                  { color: colors.mutedForeground },
                ]}
              >
                {t("dashboardRetryHint")}
              </Text>
            )}
          </View>
          {!dataLoading && dataLoadError && (
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={refreshData}
            >
              <Text style={styles.retryButtonText}>{t("dashboardRetry")}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Alerts Banner */}
        {topAlert && !dismissedAlerts.has(topAlert.id) && (
          <View
            style={[
              styles.alertBanner,
              {
                backgroundColor:
                  topAlert.type === "error"
                    ? colors.destructive + "12"
                    : topAlert.type === "warning"
                      ? colors.warning + "16"
                      : topAlert.type === "success"
                        ? colors.success + "14"
                        : colors.primary + "10",
                borderColor:
                  topAlert.type === "error"
                    ? colors.destructive + "45"
                    : topAlert.type === "warning"
                      ? colors.warning + "45"
                      : topAlert.type === "success"
                        ? colors.success + "45"
                        : colors.primary + "30",
              },
            ]}
          >
            <TouchableOpacity
              style={styles.alertBannerMain}
              onPress={() => router.push("/notifications" as any)}
              accessibilityRole="button"
              accessibilityLabel={topAlert.title}
            >
              <View
                style={[
                  styles.alertIconWrap,
                  {
                    backgroundColor:
                      topAlert.type === "error"
                        ? colors.destructive + "20"
                        : topAlert.type === "warning"
                          ? colors.warning + "22"
                          : topAlert.type === "success"
                            ? colors.success + "20"
                            : colors.primary + "20",
                  },
                ]}
              >
                <Feather
                  name={
                    topAlert.type === "error"
                      ? "alert-circle"
                      : topAlert.type === "warning"
                        ? "alert-triangle"
                        : topAlert.type === "success"
                          ? "check-circle"
                          : "info"
                  }
                  size={18}
                  color={
                    topAlert.type === "error"
                      ? colors.destructive
                      : topAlert.type === "warning"
                        ? colors.warning
                        : topAlert.type === "success"
                          ? colors.success
                          : colors.primary
                  }
                />
              </View>
              <View style={styles.alertBannerCopy}>
                <Text
                  style={[
                    styles.alertBannerTitle,
                    { color: colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {topAlert.title}
                </Text>
                <Text
                  style={[
                    styles.alertBannerMsg,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={2}
                >
                  {topAlert.message}
                </Text>
              </View>
              <Feather
                name={isRTL ? "chevron-left" : "chevron-right"}
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.alertDismiss}
              onPress={() =>
                setDismissedAlerts((p) => new Set(p).add(topAlert.id))
              }
              accessibilityRole="button"
              accessibilityLabel={t("close")}
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions Grid */}
        {!dataLoading && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>
                  {t("quickAccess")}
                </Text>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  {t("overviewLabel")}
                </Text>
              </View>
              <Feather
                name={isRTL ? "arrow-up-left" : "arrow-up-right"}
                size={18}
                color={colors.mutedForeground}
              />
            </View>
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
                      shadowColor: "#000",
                      elevation: 2,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(a.route as any);
                  }}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      { backgroundColor: a.color + "15" },
                    ]}
                  >
                    <Feather name={a.icon as any} size={24} color={a.color} />
                  </View>
                  <Text
                    style={[styles.actionLabel, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Upcoming Meetings Horizontal Scroll */}
        {!dataLoading &&
          !isTenant &&
          !isSuperAdmin &&
          upcomingMeetings.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  {t("nextMeetings")}
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/meetings" as any)}
                >
                  <Text style={[styles.seeAll, { color: colors.primary }]}>
                    {t("seeAll")}
                  </Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 16, paddingEnd: 10 }}
              >
                {upcomingMeetings.slice(0, 3).map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.meetingCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => router.push("/meetings" as any)}
                  >
                    <View
                      style={[
                        styles.meetingDateBox,
                        { backgroundColor: colors.primary + "15" },
                      ]}
                    >
                      <Text
                        style={[styles.meetingDay, { color: colors.primary }]}
                      >
                        {m.date ? (m.date.split("-")[2] ?? "?") : "?"}
                      </Text>
                      <Text
                        style={[styles.meetingMonth, { color: colors.primary }]}
                      >
                        {m.date
                          ? formatDate(m.date, { month: "short" })
                              .slice(0, 3)
                              .toUpperCase()
                          : "—"}
                      </Text>
                    </View>
                    <View style={styles.meetingInfo}>
                      <Text
                        style={[
                          styles.meetingTitle,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={2}
                      >
                        {m.title}
                      </Text>
                      <View style={styles.meetingMeta}>
                        <Feather
                          name="clock"
                          size={12}
                          color={colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.meetingTime,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {m.time}
                        </Text>
                        <Text style={{ color: colors.border }}>|</Text>
                        <Feather
                          name="map-pin"
                          size={12}
                          color={colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.meetingTime,
                            { color: colors.mutedForeground },
                          ]}
                          numberOfLines={1}
                        >
                          {(m.location ?? "").split(",")[0]}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

        {/* Ongoing Election Banner */}
        {!dataLoading && canViewElections && openElections > 0 && (
          <TouchableOpacity
            style={[styles.electionBanner, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/elections" as any)}
          >
            <View style={styles.electionBannerIcon}>
              <Feather name="check-square" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.electionBannerLabel}>
                {t("ongoingElection")}
              </Text>
              <Text style={styles.electionBannerTitle}>
                {openElections} {t("electionVoteNow")}
              </Text>
            </View>
            <Feather
              name={isRTL ? "chevron-left" : "chevron-right"}
              size={20}
              color={colors.primaryForeground}
            />
          </TouchableOpacity>
        )}

        {/* Key Metrics Dashboard */}
        {!dataLoading && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>
                  {t("overviewLabel")}
                </Text>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  {roleLabel}
                </Text>
              </View>
              <View
                style={[
                  styles.livePill,
                  { backgroundColor: colors.success + "14" },
                ]}
              >
                <View
                  style={[styles.liveDot, { backgroundColor: colors.success }]}
                />
                <Text style={[styles.livePillText, { color: colors.success }]}>
                  {t("dashboardUpdated")}
                </Text>
              </View>
            </View>
            {isSuperAdmin ? (
              <>
                <View style={styles.statsRow}>
                  <StatCard
                    label={t("syndicates")}
                    value={syndicates.length}
                    icon="briefcase"
                  />
                  <StatCard
                    label={t("totalMembers")}
                    value={syndicates.reduce((s, sy) => s + sy.members, 0)}
                    icon="users"
                  />
                </View>
                <View style={styles.statsRow}>
                  <StatCard
                    label={t("activeCount")}
                    value={
                      syndicates.filter((s) => s.status === "active").length
                    }
                    icon="activity"
                    iconColor={colors.success}
                  />
                  <StatCard
                    label={t("openTickets")}
                    value={
                      supportTickets.filter((t) => t.status === "open").length
                    }
                    icon="headphones"
                    iconColor={colors.destructive}
                    subtitle={t("support")}
                  />
                </View>
              </>
            ) : isSyndicateTeam ? (
              <>
                <View style={styles.statsRow}>
                  <StatCard
                    label={t("activeMembers")}
                    value={activeMembers}
                    icon="users"
                  />
                  {isTreasurer || isSyndicateAdmin ? (
                    <StatCard
                      label={t("revenue")}
                      value={formatMad(totalRevenue)}
                      icon="trending-up"
                      iconColor={colors.success}
                    />
                  ) : (
                    <StatCard
                      label={t("scheduledMeetings")}
                      value={upcomingMeetings.length}
                      icon="calendar"
                      iconColor={colors.info}
                    />
                  )}
                </View>
                <View style={styles.statsRow}>
                  {isTreasurer || isSyndicateAdmin ? (
                    <StatCard
                      label={t("dueCotisations")}
                      value={pendingCotisations}
                      icon="alert-circle"
                      iconColor={colors.warning}
                      subtitle={t("pendingLabel")}
                    />
                  ) : (
                    <StatCard
                      label={t("elections")}
                      value={openElections}
                      icon="check-square"
                      iconColor={colors.warning}
                    />
                  )}
                  <StatCard
                    label={t("scheduledMeetings")}
                    value={upcomingMeetings.length}
                    icon="calendar"
                    iconColor={colors.info}
                  />
                </View>
              </>
            ) : (
              (() => {
                const myCot = cotisations.length > 0 ? cotisations[0] : null;
                const cotLabel =
                  myCot?.status === "paid"
                    ? t("paid")
                    : myCot?.status === "overdue"
                      ? t("overdue")
                      : t("pendingLabel");
                const cotColor =
                  myCot?.status === "paid"
                    ? colors.success
                    : myCot?.status === "overdue"
                      ? colors.destructive
                      : colors.warning;
                const myMember = members.find((m) => m.email === user.email);
                const memberStatus =
                  myMember?.status === "active"
                    ? t("active")
                    : myMember?.status === "inactive"
                      ? t("inactive")
                      : t("pendingLabel");
                const memberColor =
                  myMember?.status === "active"
                    ? colors.success
                    : myMember?.status === "inactive"
                      ? colors.destructive
                      : colors.warning;
                return (
                  <>
                    <View style={styles.statsRow}>
                      <StatCard
                        label={t("myStatus")}
                        value={memberStatus}
                        icon="check-circle"
                        iconColor={memberColor}
                      />
                      <StatCard
                        label={t("cotisationLabel")}
                        value={cotLabel}
                        icon="credit-card"
                        iconColor={cotColor}
                      />
                    </View>
                    <View style={styles.statsRow}>
                      <StatCard
                        label={t("elections")}
                        value={openElections}
                        icon="check-square"
                        iconColor={colors.warning}
                      />
                      <StatCard
                        label={t("amountDue")}
                        value={
                          myCot?.status !== "paid"
                            ? formatMad(Number(myCot?.amount ?? 0))
                            : "0 MAD"
                        }
                        icon="dollar-sign"
                        iconColor={
                          myCot?.status !== "paid"
                            ? colors.destructive
                            : colors.success
                        }
                      />
                    </View>
                  </>
                );
              })()
            )}
          </View>
        )}

        {/* Recent Activity */}
        {!dataLoading && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t("recentActivity")}
              </Text>
              <TouchableOpacity onPress={() => router.push("/activity" as any)}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>
                  {t("seeAll")}
                </Text>
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.activityList,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {activityLoading ? (
                <View style={styles.activityEmpty}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text
                    style={[
                      styles.activityEmptyText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("dashboardActivityLoading")}
                  </Text>
                </View>
              ) : activityLoadError ? (
                <View style={styles.activityEmpty}>
                  <Feather
                    name="wifi-off"
                    size={24}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.activityEmptyText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("dashboardActivityUnavailable")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActivityRefreshKey((key) => key + 1)}
                  >
                    <Text style={[styles.seeAll, { color: colors.primary }]}>
                      {t("dashboardRetry")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : dashboardActivities.length > 0 ? (
                dashboardActivities.map((act, i) => (
                  <View
                    key={act.id}
                    style={[
                      styles.activityItem,
                      i < dashboardActivities.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.activityIconWrap,
                        { backgroundColor: act.color + "15" },
                      ]}
                    >
                      <Feather
                        name={act.icon as any}
                        size={16}
                        color={act.color}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={[
                          styles.activityLabel,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {act.action}
                      </Text>
                      <Text
                        style={[
                          styles.activityTarget,
                          { color: colors.mutedForeground },
                        ]}
                        numberOfLines={1}
                      >
                        {act.target}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.activityTime,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {act.timestamp
                        ? formatDate(act.timestamp, {
                            day: "2-digit",
                            month: "short",
                          })
                        : ""}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.activityEmpty}>
                  <Feather
                    name="clock"
                    size={24}
                    color={colors.mutedForeground}
                    style={{ marginBottom: 12 }}
                  />
                  <Text
                    style={[
                      styles.activityEmptyText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("noRecentActivity")}
                  </Text>
                  <Text
                    style={[
                      styles.activityEmptyDescription,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("noRecentActivityDesc")}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    elevation: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  greeting: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: "rgba(255,255,255,0.85)",
  },
  userName: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: "#FFF",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  syndicateWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  syndicate: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
  },

  headerBtns: { flexDirection: "row", gap: 12 },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1D4ED8",
  },
  headerBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#FFF" },

  roleBadgeWrapper: { alignSelf: "flex-start" },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  roleBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#2563EB",
  },

  body: { gap: 24, paddingTop: 32 },

  dataStatusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  dataStatusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dataStatusTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  dataStatusMessage: { fontFamily: "Inter_400Regular", fontSize: 12 },
  retryButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  retryButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#FFF",
  },

  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  alertBannerMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    padding: 6,
  },
  alertBannerCopy: { flex: 1, minWidth: 0, gap: 3 },
  alertDismiss: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  alertIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBannerTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  alertBannerMsg: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },

  section: { gap: 14 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.3,
  },
  eyebrow: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  seeAll: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: ACTION_GAP },
  actionBtn: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    flex: 1,
    textAlign: "left",
  },

  meetingCard: {
    width: 260,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  meetingDateBox: {
    width: 68,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  meetingDay: { fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 28 },
  meetingMonth: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  meetingInfo: { flex: 1, padding: 16, justifyContent: "center", gap: 8 },
  meetingTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 20,
  },
  meetingMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  meetingTime: { fontFamily: "Inter_500Medium", fontSize: 12 },

  electionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderRadius: 24,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  electionBannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  electionBannerLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  electionBannerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#FFF",
  },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  livePillText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },

  activityList: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
  },
  activityEmpty: { alignItems: "center", gap: 8, padding: 24 },
  activityEmptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    textAlign: "center",
  },
  activityEmptyDescription: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  activityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activityLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  activityTarget: { fontFamily: "Inter_400Regular", fontSize: 13 },
  activityTime: { fontFamily: "Inter_500Medium", fontSize: 12 },
});
