import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import StatCard from "@/components/StatCard";
import {
  BalanceLine,
  BalanceMeter,
  Button,
  Card,
  IconButton,
  ListItem,
  SectionHeader,
  Skeleton,
  ZelligePattern,
  toneColors,
  type StatusTone,
} from "@/components/ui";
import { RADIUS, SPACING } from "@/constants/spacing";
import { displayFace, FONT, TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import {
  SIDEBAR_COMPACT,
  SIDEBAR_FULL,
  useBreakpoints,
} from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useMyCharges } from "@/hooks/useMyCharges";
import { audit as auditApi } from "@/services/api";
import Animated, { FadeInDown } from "react-native-reanimated";
import ResidenceScene from "@/components/signature/ResidenceScene";
import { DURATION, STAGGER } from "@/constants/motion";
import { useResidence } from "@/hooks/useResidence";

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
    color: "#1F5EFF",
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
    color: "#1F5EFF",
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
    color: "#f59e0b",
  },
  {
    labelKey: "documents",
    icon: "folder",
    route: "/documents",
    color: "#1F5EFF",
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
    color: "#1F5EFF",
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
    labelKey: "devisFactures",
    icon: "file-text",
    route: "/invoices",
    color: "#1F5EFF",
  },
];
const QUICK_ACTIONS_SECRETARY = [
  {
    labelKey: "documentsCopro",
    icon: "folder",
    route: "/documents",
    color: "#1F5EFF",
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
    color: "#f59e0b",
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
    color: "#1F5EFF",
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
    route: "/bibliotheque",
    color: "#1F5EFF",
  },
  {
    labelKey: "reclamationsLabel",
    icon: "inbox",
    route: "/reclamations",
    color: "#f59e0b",
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
    route: "/bibliotheque",
    color: "#1F5EFF",
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
const SCENE_H = 132;

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
        ? "#1F5EFF"
        : isGovernance
          ? "#3b82f6"
          : "#6b7280",
  };
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myCharges = useMyCharges(user?.role === "member");
  const residence = useResidence(user?.role);
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
  const { isDark: isDarkHero } = useTheme();

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
          ? colors.danger
          : alert.type === "warning"
            ? colors.warning
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
          ? colors.success
          : cotisation.status === "overdue"
            ? colors.danger
            : colors.warning,
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

  // The action arrays keep their historical hex colors; they map to semantic tones.
  const toneOfAction = (value: string): StatusTone => {
    const normalized = value.toLowerCase();
    if (normalized.includes("10b981") || normalized.includes("06b6d4")) return "success";
    if (normalized.includes("f59e0b") || normalized.includes("f97316")) return "warning";
    if (normalized.includes("ef4444") || normalized.includes("ec4899")) return "danger";
    if (normalized.includes("8b5cf6") || normalized.includes("6366f1")) return "info";
    return "primary";
  };

  const quickActions = quickActionsRaw.map((a) => ({
    ...a,
    tone: toneOfAction(a.color),
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

  const roleIcon: keyof typeof Feather.glyphMap = isSuperAdmin
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
                : "home";

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
  const formatMad = (amount: number, decimals = 0) => {
    try {
      return `${new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(decimals === 0 ? Math.round(amount) : amount)} MAD`;
    } catch {
      return `${decimals === 0 ? Math.round(amount) : amount.toFixed(decimals)} MAD`;
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
  const count = (key: string, n: number) => t(key).replace("{n}", String(n));
  const go = (route: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    router.push(route as any);
  };

  const sidebarW = isWide ? (isDesktop ? SIDEBAR_FULL : SIDEBAR_COMPACT) : 0;
  const hPad = isWide ? 32 : 16;
  const contentWidth = screenWidth - sidebarW - hPad * 2;
  // Two comfortable touch columns on phones (labels stay on two lines at most).
  const numCols = isDesktop ? 4 : isTablet ? 3 : 2;
  const actionItemWidth = Math.floor(
    (contentWidth - ACTION_GAP * (numCols - 1)) / numCols,
  );

  // ── Priorities: only real, actionable items, most urgent first ──────────
  const charges = myCharges.data;
  type Priority = {
    key: string;
    icon: keyof typeof Feather.glyphMap;
    tone: StatusTone;
    title: string;
    subtitle?: string;
    route: string;
    dismiss?: () => void;
  };
  const priorities: Priority[] = [];
  // The account works, but no notice, receipt or reset link can reach it.
  if (user.emailStatus === "undeliverable") {
    priorities.push({ key: "email", icon: "mail", tone: "warning", title: t("emcBannerTitle"), subtitle: t("emcBannerAction"), route: "/email-change" });
  }
  // A profile without a phone number cannot be reached by the syndic.
  if (!user.phone) {
    priorities.push({ key: "profile", icon: "user", tone: "info", title: t("onbPriorityTitle"), subtitle: t("onbPrioritySubtitle"), route: "/onboarding" });
  }
  if (isMember && charges && charges.overdueCount > 0) {
    priorities.push({ key: "overdue", icon: "alert-circle", tone: "danger", title: count("uiOverdueCalls", charges.overdueCount), subtitle: t("uiOverdueCallsDesc"), route: "/charges" });
  } else if (isMember && charges && charges.underReviewCount > 0) {
    priorities.push({ key: "review", icon: "clock", tone: "info", title: t("uiUnderReview"), subtitle: t("uiUnderReviewDesc"), route: "/charges" });
  }
  if (topAlert && !dismissedAlerts.has(topAlert.id)) {
    priorities.push({
      key: `alert-${topAlert.id}`,
      icon: topAlert.type === "error" ? "alert-circle" : topAlert.type === "warning" ? "alert-triangle" : topAlert.type === "success" ? "check-circle" : "bell",
      tone: topAlert.type === "error" ? "danger" : topAlert.type === "warning" ? "warning" : topAlert.type === "success" ? "success" : "info",
      title: topAlert.title,
      subtitle: topAlert.message,
      route: "/notifications",
      dismiss: () => setDismissedAlerts((p) => new Set(p).add(topAlert.id)),
    });
  }
  if (canViewElections && openElections > 0) {
    priorities.push({ key: "votes", icon: "check-square", tone: "warning", title: count("uiOpenVotes", openElections), subtitle: t("uiOpenVotesDesc"), route: "/elections" });
  }
  const openTickets = supportTickets.filter((tk) => tk.status === "open" || tk.status === "in_progress").length;
  if ((isSuperAdmin || isSyndicateAdmin) && openTickets > 0) {
    priorities.push({ key: "tickets", icon: "headphones", tone: "info", title: count("uiOpenTickets", openTickets), route: "/support" });
  }

  const showMeetings = !isTenant && !isSuperAdmin && upcomingMeetings.length > 0;

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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: isWide ? 40 : insets.bottom + 104 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => { refreshData(); setActivityRefreshKey((k) => k + 1); }} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {/* ── Hero: navy, zellige texture, greeting, the balance ── */}
        <LinearGradient
          colors={[colors.navy, isDarkHero ? "#1A1640" : "#2B2475"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: topPadding + 12, paddingHorizontal: hPad }]}
        >
          <ZelligePattern color="#FFFFFF" opacity={0.035} />
          <View style={styles.heroTop}>
            <View style={styles.heroIdentity}>
              <Text style={[styles.greeting, { textAlign: isRTL ? "right" : "left" }]} numberOfLines={1}>
                {greetingTime()}
              </Text>
              <Text style={[styles.userName, { textAlign: isRTL ? "right" : "left" }, lang === "ar" && { fontFamily: displayFace(lang), lineHeight: 40 }]} numberOfLines={1} accessibilityRole="header">
                {user.name}
              </Text>
            </View>
            <View style={styles.heroActions}>
              <IconButton icon="search" variant="onDark" accessibilityLabel={t("uiSearch")} onPress={() => go("/search")} />
              {totalUnread > 0 ? (
                <IconButton icon="message-circle" variant="onDark" accessibilityLabel={t("uiMessages")} badge={totalUnread} onPress={() => go("/chat")} />
              ) : null}
              <IconButton icon="bell" variant="onDark" accessibilityLabel={t("notifications")} badge={unreadAlerts.length} onPress={() => go("/notifications")} />
            </View>
          </View>

          <View style={styles.heroMeta}>
            <View style={styles.heroChip}>
              <Feather name={roleIcon} size={12} color={colors.gold} />
              <Text style={styles.heroChipText} numberOfLines={1}>
                {roleLabel}
              </Text>
            </View>
            {user.syndicate ? (
              <View style={[styles.heroChip, styles.heroChipShrink]}>
                <Feather name="map-pin" size={12} color="rgba(255,255,255,0.75)" />
                <Text style={styles.heroChipText} numberOfLines={1}>
                  {user.syndicate}
                </Text>
              </View>
            ) : null}
          </View>

          {residence.isLoading ? (
            <Skeleton height={SCENE_H} radius={RADIUS.LG} style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
          ) : residence.data ? (
            residence.data.buildings.length > 0 ? (
              (() => {
                const r = residence.data;
                const lot = r.myLot;
                const floorText =
                  lot?.floor === null || lot?.floor === undefined
                    ? null
                    : lot.floor < 0
                      ? t("sceneBasement")
                      : lot.floor === 0
                        ? t("sceneGroundFloor")
                        : t("sceneFloorN").replace("{n}", String(lot.floor));
                const sceneBuildings = lot
                  ? [...r.buildings].sort((a, b) => (a.id === lot.buildingId ? -1 : b.id === lot.buildingId ? 1 : 0))
                  : r.buildings;
                const totalLots = r.buildings.reduce((n, b) => n + b.lotCount, 0);
                const openWorks = r.buildings.reduce((n, b) => n + b.openTravaux, 0);
                const buildingsText = t("sceneBuildings").replace("{n}", String(r.buildings.length));
                const lotsText = t("sceneLots").replace("{n}", String(totalLots));
                const title = lot ? lot.buildingName : user.syndicate || (r.buildings.length === 1 ? r.buildings[0].name : null);
                const meta = lot
                  ? [t("sceneLotN").replace("{n}", lot.number), floorText].filter(Boolean).join(" · ")
                  : [buildingsText, lotsText, openWorks > 0 ? t("sceneOpenWorks").replace("{n}", String(openWorks)) : null].filter(Boolean).join(" · ");
                const a11y = lot
                  ? t("sceneA11yResident").replace("{building}", lot.buildingName).replace("{lot}", lot.number).replace("{floor}", floorText ?? "")
                  : t("sceneA11yTeam").replace("{buildings}", buildingsText).replace("{lots}", lotsText);
                return (
                  <View style={styles.sceneWrap}>
                    <ResidenceScene
                      buildings={sceneBuildings}
                      highlight={lot ? { buildingId: lot.buildingId, floor: lot.floor } : null}
                      width={contentWidth}
                      height={SCENE_H}
                      accessibilityLabel={a11y}
                      onPress={() => go(lot ? "/mon-lot" : isSyndicateTeam ? "/buildings" : "/mon-lot")}
                    />
                    <View style={styles.sceneCaption}>
                      {title ? <Text style={[styles.sceneTitle, lang === "ar" && { fontFamily: displayFace(lang), lineHeight: 28 }]} numberOfLines={1}>{title}</Text> : null}
                      <Text style={styles.sceneMeta} numberOfLines={1}>{meta}</Text>
                      {r.buildings.length > 4 ? (
                        <Text style={styles.sceneMeta}>{t("sceneMoreBuildings").replace("{n}", String(r.buildings.length - 4))}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })()
            ) : isSyndicateTeam ? (
              <Text style={styles.balanceNote}>{t("sceneNoBuilding")}</Text>
            ) : null
          ) : null}

          {isMember ? (
            <Pressable
              onPress={() => go("/charges")}
              accessibilityRole="button"
              accessibilityLabel={`${t("uiMyBalance")} — ${t("uiSeeMyCharges")}`}
              style={({ pressed }) => [styles.balanceCard, pressed && { backgroundColor: "rgba(255,255,255,0.12)" }]}
            >
              <View style={styles.balanceHead}>
                <Text style={styles.balanceTitle}>{t("uiMyBalance")}</Text>
                <View style={styles.balanceLink}>
                  <Text style={styles.balanceLinkText}>{t("uiSeeMyCharges")}</Text>
                  <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={14} color="#FFFFFF" />
                </View>
              </View>
              {myCharges.isLoading ? (
                <View style={{ gap: 10 }}>
                  <Skeleton height={10} radius={5} style={{ backgroundColor: "rgba(255,255,255,0.14)" }} />
                  <Skeleton width="60%" height={18} style={{ backgroundColor: "rgba(255,255,255,0.14)" }} />
                </View>
              ) : myCharges.isError ? (
                <Text style={styles.balanceNote}>{t("unavailable")}</Text>
              ) : !charges || charges.status === "none" ? (
                <Text style={styles.balanceNote}>{t("uiNoChargesYet")}</Text>
              ) : (
                <BalanceMeter
                  variant="onDark"
                  paid={charges.paid}
                  total={charges.total}
                  paidLabel={t("uiSettled")}
                  remainingLabel={t("uiRemaining")}
                  paidText={formatMad(charges.paid, 2)}
                  remainingText={formatMad(charges.due, 2)}
                  overdue={charges.overdueCount > 0}
                />
              )}
            </Pressable>
          ) : null}

          <BalanceLine variant="onDark" style={{ marginTop: SPACING.LG }} />
        </LinearGradient>

        <View style={[styles.body, { paddingHorizontal: hPad }]}>
          {/* ── Load error (data from the API) ── */}
          {!dataLoading && dataLoadError ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.dangerSoft, borderColor: colors.danger + "40" }]} accessibilityLiveRegion="polite">
              <Feather name="wifi-off" size={18} color={colors.danger} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[TYPE.bodyStrong, { color: colors.dangerText }]}>{t("uiLoadError")}</Text>
                <Text style={[TYPE.secondary, { color: colors.dangerText }]}>{t("dashboardRetryHint")}</Text>
              </View>
              <Button label={t("uiRetry")} size="sm" variant="secondary" onPress={refreshData} />
            </View>
          ) : null}

          {dataLoading ? (
            <View style={styles.section} accessibilityLabel={t("dashboardLoading")}>
              <Skeleton width="40%" height={16} />
              <Skeleton height={72} radius={16} />
              <View style={styles.statsRow}>
                <Skeleton height={120} radius={16} style={{ flex: 1 }} />
                <Skeleton height={120} radius={16} style={{ flex: 1 }} />
              </View>
              <Skeleton height={56} radius={12} />
              <Skeleton height={56} radius={12} />
            </View>
          ) : (
            <>
              {/* ── To do ── */}
              <Animated.View entering={FadeInDown.duration(DURATION.base).delay(0*STAGGER)} style={styles.section}>
                <SectionHeader eyebrow={t("uiPriorities")} title={t("uiToDo")} />
                <Card padding="none" elevation="raised">
                  {priorities.length === 0 ? (
                    <ListItem icon="check" iconTone="success" title={t("uiAllClear")} subtitle={t("uiAllClearDesc")} />
                  ) : (
                    priorities.map((p, i) => (
                      <View key={p.key} style={styles.priorityRow}>
                        <View style={{ flex: 1 }}>
                          <ListItem
                            icon={p.icon}
                            iconTone={p.tone}
                            title={p.title}
                            subtitle={p.subtitle}
                            onPress={() => go(p.route)}
                            chevron={!p.dismiss}
                            divider={i < priorities.length - 1}
                          />
                        </View>
                        {p.dismiss ? (
                          <IconButton icon="x" variant="ghost" accessibilityLabel={t("close")} onPress={p.dismiss} style={styles.dismiss} />
                        ) : null}
                      </View>
                    ))
                  )}
                </Card>
              </Animated.View>

              {/* ── Key figures (same sources as before) ── */}
              <Animated.View entering={FadeInDown.duration(DURATION.base).delay(1*STAGGER)} style={styles.section}>
                <SectionHeader eyebrow={roleLabel} title={t("uiKeyFigures")} />
                {isSuperAdmin ? (
                  <>
                    <View style={styles.statsRow}>
                      <StatCard label={t("syndicates")} value={syndicates.length} icon="briefcase" onPress={() => go("/members")} />
                      <StatCard label={t("totalMembers")} value={syndicates.reduce((s, sy) => s + sy.members, 0)} icon="users" />
                    </View>
                    <View style={styles.statsRow}>
                      <StatCard label={t("activeCount")} value={syndicates.filter((s) => s.status === "active").length} icon="activity" tone="success" />
                      <StatCard
                        label={t("openTickets")}
                        value={supportTickets.filter((tk) => tk.status === "open").length}
                        icon="headphones"
                        tone="danger"
                        subtitle={t("support")}
                        onPress={() => go("/support")}
                      />
                    </View>
                  </>
                ) : isSyndicateTeam ? (
                  <>
                    <View style={styles.statsRow}>
                      <StatCard label={t("activeMembers")} value={activeMembers} icon="users" />
                      {isTreasurer || isSyndicateAdmin ? (
                        <StatCard label={t("revenue")} value={formatMad(totalRevenue)} icon="trending-up" tone="success" />
                      ) : (
                        <StatCard label={t("scheduledMeetings")} value={upcomingMeetings.length} icon="calendar" tone="info" onPress={() => go("/meetings")} />
                      )}
                    </View>
                    <View style={styles.statsRow}>
                      {isTreasurer || isSyndicateAdmin ? (
                        <StatCard label={t("dueCotisations")} value={pendingCotisations} icon="alert-circle" tone="warning" subtitle={t("pendingLabel")} />
                      ) : (
                        <StatCard label={t("elections")} value={openElections} icon="check-square" tone="warning" onPress={() => go("/elections")} />
                      )}
                      <StatCard label={t("scheduledMeetings")} value={upcomingMeetings.length} icon="calendar" tone="info" onPress={() => go("/meetings")} />
                    </View>
                  </>
                ) : (
                  (() => {
                    const myMember = members.find((m) => m.email === user.email);
                    const memberStatus = myMember?.status === "active" ? t("active") : myMember?.status === "inactive" ? t("inactive") : t("pendingLabel");
                    const memberTone: StatusTone = myMember?.status === "active" ? "success" : myMember?.status === "inactive" ? "danger" : "warning";
                    return (
                      <View style={styles.statsRow}>
                        <StatCard label={t("myStatus")} value={memberStatus} icon="check-circle" tone={memberTone} />
                        {isTenant ? (
                          <StatCard label={t("notifications")} value={unreadAlerts.length} icon="bell" tone="info" onPress={() => go("/notifications")} />
                        ) : (
                          <StatCard label={t("elections")} value={openElections} icon="check-square" tone="warning" onPress={() => go("/elections")} />
                        )}
                      </View>
                    );
                  })()
                )}
              </Animated.View>

              {/* ── Next meetings ── */}
              {showMeetings ? (
                <Animated.View entering={FadeInDown.duration(DURATION.base).delay(2*STAGGER)} style={styles.section}>
                  <SectionHeader title={t("nextMeetings")} actionLabel={t("seeAll")} onAction={() => go("/meetings")} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingEnd: 4 }}>
                    {upcomingMeetings.slice(0, 3).map((m) => (
                      <Pressable
                        key={m.id}
                        onPress={() => go("/meetings")}
                        accessibilityRole="button"
                        accessibilityLabel={`${m.title}, ${m.date ? formatDate(m.date, { day: "numeric", month: "long" }) : ""} ${m.time ?? ""}`}
                        style={({ pressed }) => [styles.meetingCard, { backgroundColor: pressed ? colors.surfaceMuted : colors.card, borderColor: colors.border }]}
                      >
                        <View style={[styles.meetingDateBox, { backgroundColor: colors.primarySoft }]}>
                          <Text style={[styles.meetingDay, { color: colors.tint }]}>{m.date ? (m.date.split("-")[2] ?? "?") : "?"}</Text>
                          <Text style={[styles.meetingMonth, { color: colors.tint }]}>{m.date ? formatDate(m.date, { month: "short" }) : "—"}</Text>
                        </View>
                        <View style={styles.meetingInfo}>
                          <Text style={[TYPE.bodyStrong, { color: colors.foreground }]} numberOfLines={2}>
                            {m.title}
                          </Text>
                          <View style={styles.meetingMeta}>
                            <Feather name="clock" size={12} color={colors.textMuted} />
                            <Text style={[TYPE.caption, { color: colors.textMuted }]}>{m.time}</Text>
                          </View>
                          {m.location ? (
                            <View style={styles.meetingMeta}>
                              <Feather name="map-pin" size={12} color={colors.textMuted} />
                              <Text style={[TYPE.caption, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>
                                {(m.location ?? "").split(",")[0]}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Animated.View>
              ) : null}

              {/* ── Quick access ── */}
              <Animated.View entering={FadeInDown.duration(DURATION.base).delay(3*STAGGER)} style={styles.section}>
                <SectionHeader title={t("uiQuickActions")} />
                <View style={styles.actionsGrid}>
                  {quickActions.map((a) => {
                    const tc = toneColors(colors, a.tone);
                    return (
                      <Pressable
                        key={a.labelKey}
                        onPress={() => go(a.route)}
                        accessibilityRole="button"
                        accessibilityLabel={a.label}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          { width: actionItemWidth, backgroundColor: pressed ? colors.surfaceMuted : colors.card, borderColor: colors.border },
                        ]}
                      >
                        <View style={[styles.actionIcon, { backgroundColor: tc.bg }]}>
                          <Feather name={a.icon as any} size={18} color={tc.fg} />
                        </View>
                        <Text style={[styles.actionLabel, { color: colors.foreground }]} numberOfLines={2}>
                          {a.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Animated.View>

              {/* ── Recent activity ── */}
              <Animated.View entering={FadeInDown.duration(DURATION.base).delay(4*STAGGER)} style={styles.section}>
                <SectionHeader title={t("uiRecentActivity")} actionLabel={t("seeAll")} onAction={() => go("/activity")} />
                <Card padding="none">
                  {activityLoading ? (
                    <View style={styles.activityLoading} accessibilityLabel={t("dashboardActivityLoading")}>
                      {[0, 1, 2].map((i) => (
                        <View key={i} style={styles.skeletonRow}>
                          <Skeleton width={40} height={40} radius={12} />
                          <View style={{ flex: 1, gap: 6 }}>
                            <Skeleton width="70%" height={12} />
                            <Skeleton width="45%" height={10} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : activityLoadError ? (
                    <View style={styles.activityEmpty}>
                      <Feather name="wifi-off" size={22} color={colors.textMuted} />
                      <Text style={[TYPE.secondary, { color: colors.textMuted, textAlign: "center" }]}>{t("dashboardActivityUnavailable")}</Text>
                      <Button label={t("dashboardRetry")} size="sm" variant="ghost" onPress={() => setActivityRefreshKey((key) => key + 1)} />
                    </View>
                  ) : dashboardActivities.length > 0 ? (
                    dashboardActivities.map((act, i) => (
                      <ListItem
                        key={act.id}
                        icon={act.icon}
                        iconTone={toneOfAction(act.color)}
                        title={act.action}
                        subtitle={act.target}
                        trailing={
                          act.timestamp ? (
                            <Text style={[TYPE.caption, { color: colors.textMuted }]}>{formatDate(act.timestamp, { day: "2-digit", month: "short" })}</Text>
                          ) : undefined
                        }
                        divider={i < dashboardActivities.length - 1}
                      />
                    ))
                  ) : (
                    <View style={styles.activityEmpty}>
                      <Feather name="clock" size={22} color={colors.textMuted} />
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{t("noRecentActivity")}</Text>
                      <Text style={[TYPE.secondary, { color: colors.textMuted, textAlign: "center" }]}>{t("noRecentActivityDesc")}</Text>
                    </View>
                  )}
                </Card>
              </Animated.View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    paddingBottom: SPACING.LG,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
    gap: SPACING.MD,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: SPACING.MD },
  heroIdentity: { flex: 1, minWidth: 0, gap: 2 },
  greeting: { fontFamily: FONT.medium, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.75)" },
  userName: { fontFamily: FONT.display, fontSize: 27, lineHeight: 34, color: "#FFFFFF" },
  sceneWrap: { gap: SPACING.SM },
  sceneCaption: { alignItems: "center", gap: 2 },
  sceneTitle: { fontFamily: FONT.display, fontSize: 17, lineHeight: 23, color: "#FFFFFF", textAlign: "center" },
  sceneMeta: { fontFamily: FONT.medium, fontSize: 12, lineHeight: 16, color: "rgba(255,255,255,0.72)", textAlign: "center" },
  heroActions: { flexDirection: "row", gap: SPACING.SM },
  heroMeta: { flexDirection: "row", gap: SPACING.SM, flexWrap: "wrap" },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.FULL,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroChipShrink: { flexShrink: 1, maxWidth: "70%" },
  heroChipText: { fontFamily: FONT.semibold, fontSize: 12, lineHeight: 16, color: "#FFFFFF", flexShrink: 1 },
  balanceCard: {
    marginTop: SPACING.XS,
    padding: SPACING.LG,
    borderRadius: RADIUS.LG,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    gap: SPACING.MD,
  },
  balanceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.SM },
  balanceTitle: { fontFamily: FONT.semibold, fontSize: 14, lineHeight: 20, color: "#FFFFFF", flexShrink: 1 },
  balanceLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  balanceLinkText: { fontFamily: FONT.medium, fontSize: 12, color: "rgba(255,255,255,0.85)" },
  balanceNote: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 19, color: "rgba(255,255,255,0.8)" },

  body: { gap: SPACING.XL, paddingTop: SPACING.XL },
  section: { gap: SPACING.MD },
  statsRow: { flexDirection: "row", gap: SPACING.MD },

  errorBanner: { flexDirection: "row", alignItems: "center", gap: SPACING.MD, padding: SPACING.MD, borderRadius: RADIUS.LG, borderWidth: 1 },
  priorityRow: { flexDirection: "row", alignItems: "center" },
  dismiss: { marginEnd: SPACING.SM },

  meetingCard: { width: 248, flexDirection: "row", gap: SPACING.MD, padding: SPACING.MD, borderRadius: RADIUS.LG, borderWidth: 1 },
  meetingDateBox: { width: 52, height: 56, borderRadius: RADIUS.MD, alignItems: "center", justifyContent: "center" },
  meetingDay: { fontFamily: FONT.bold, fontSize: 20, lineHeight: 24 },
  meetingMonth: { fontFamily: FONT.semibold, fontSize: 11, lineHeight: 14 },
  meetingInfo: { flex: 1, minWidth: 0, gap: 4 },
  meetingMeta: { flexDirection: "row", alignItems: "center", gap: 5 },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: ACTION_GAP },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.SM + 2, padding: SPACING.MD, minHeight: 60, borderRadius: RADIUS.LG, borderWidth: 1 },
  actionIcon: { width: 36, height: 36, borderRadius: RADIUS.MD, alignItems: "center", justifyContent: "center" },
  actionLabel: { flex: 1, fontFamily: FONT.semibold, fontSize: 13, lineHeight: 17 },

  activityLoading: { padding: SPACING.LG, gap: SPACING.LG },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: SPACING.MD },
  activityEmpty: { alignItems: "center", justifyContent: "center", gap: SPACING.SM, paddingVertical: SPACING.XL, paddingHorizontal: SPACING.LG },
});
