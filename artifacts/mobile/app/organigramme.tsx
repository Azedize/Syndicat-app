/**
 * ORGANIGRAMME DU SYNDICAT
 * Enterprise-grade governance organizational chart.
 * Displays a premium visual hierarchy of the syndicate's governance structure
 * with real DB data, role-colour coding, interactive detail modals,
 * and a super-admin national view.
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { ErrorState, LoadingState } from "@/components/DataState";
import { apiRequest } from "@/lib/api";
import { crossPlatformShadow } from "@/lib/shadow";
import { useBreakpoints } from "@/hooks/useBreakpoints";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RolePermissions {
  modules: string[];
  approvalRights: string[];
  signatureRights: string[];
  reportsAccess: string[];
  documentAccess: string[];
  financialAccess: string[];
  permissions: string[];
}

interface OrgNode {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string | null;
  role: string;
  roleLabel: string;
  color: string;
  level: number;
  mandateStart: string;
  mandateEnd: string;
  status: "active" | "expiring" | "expired";
  appointedAt?: string;
  permissions: RolePermissions;
}

interface OrgStats {
  activeMandates: number;
  expiringMandates: number;
  expiredMandates: number;
  vacantPositions: number;
  vacantRoles: string[];
  committeeCount: number;
  totalMembers: number;
  alerts: string[];
}

interface OrgData {
  syndicate: { id: string; name: string; address: string; city: string; foundingDate: string; logoColor: string } | null;
  hierarchy: {
    admins: OrgNode[];
    president: OrgNode | null;
    treasurer: OrgNode | null;
    secretary: OrgNode | null;
    committeeMembers: OrgNode[];
  };
  stats: OrgStats;
  allNodes: OrgNode[];
}

interface NationalSyndicate {
  id: string;
  name: string;
  city: string;
  region: string;
  status: string;
  logoColor: string;
  buildingsCount: number;
  membersCount: number;
  councilCount: number;
  vacantPositions: number;
  vacantRoles: string[];
  expiredMandates: number;
  governanceStatus: "healthy" | "warning" | "critical";
  president: { name: string; email: string } | null;
  alerts: string[];
}

interface NationalData {
  syndicates: NationalSyndicate[];
  summary: {
    total: number;
    healthy: number;
    warnings: number;
    critical: number;
    totalVacancies: number;
    totalExpired: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get("window");

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(s: string | null | undefined, locale = "fr-FR"): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

function statusBadge(status: OrgNode["status"]): { labelKey: string; color: string; bg: string } {
  switch (status) {
    case "active":   return { labelKey: "orgModalStatusActive", color: "#059669", bg: "#d1fae5" };
    case "expiring": return { labelKey: "orgModalStatusExpiring", color: "#d97706", bg: "#fef3c7" };
    case "expired":  return { labelKey: "orgModalStatusExpired", color: "#dc2626", bg: "#fee2e2" };
  }
}

function govStatusColor(s: NationalSyndicate["governanceStatus"]): string {
  if (s === "healthy")  return "#059669";
  if (s === "warning")  return "#d97706";
  return "#dc2626";
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Top-of-screen dashboard stat cards */
function StatCards({ stats, colors, t }: { stats: OrgStats; colors: ReturnType<typeof useColors>; t: (key: string) => string }) {
  const cards = [
    { label: t("orgStatActiveMandates"), value: stats.activeMandates, icon: "award" as const, color: "#2563EB" },
    { label: t("orgStatCommitteeMembers"), value: stats.committeeCount, icon: "users" as const, color: "#7C3AED" },
    { label: t("orgStatExpiring"), value: stats.expiringMandates, icon: "clock" as const, color: "#EA580C" },
    { label: t("orgStatVacant"), value: stats.vacantPositions, icon: "alert-circle" as const, color: "#dc2626" },
  ];
  return (
    <View style={styles.statRow}>
      {cards.map((c) => (
        <View key={c.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: c.color + "30" }]}>
          <View style={[styles.statIconWrap, { backgroundColor: c.color + "15" }]}>
            <Feather name={c.icon} size={14} color={c.color} />
          </View>
          <Text style={[styles.statValue, { color: c.color }]}>{c.value}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]} numberOfLines={2}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Individual hierarchy node card */
function NodeCard({
  node,
  isTop = false,
  onPress,
  colors,
  t,
}: {
  node: OrgNode;
  isTop?: boolean;
  onPress: (n: OrgNode) => void;
  colors: ReturnType<typeof useColors>;
  t: (key: string) => string;
}) {
  const badge = statusBadge(node.status);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(node); }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.nodeCard,
          isTop
            ? { backgroundColor: node.color, borderColor: node.color }
            : { backgroundColor: colors.card, borderColor: node.color + "40" },
          isTop && styles.nodeCardTop,
        ]}
      >
        {/* Avatar */}
        <View style={[
          styles.nodeAvatar,
          { backgroundColor: isTop ? "rgba(255,255,255,0.2)" : node.color + "18" },
        ]}>
          <Text style={[styles.nodeInitials, { color: isTop ? "#fff" : node.color }]}>
            {node.name ? initials(node.name) : "??"}
          </Text>
        </View>

        {/* Info */}
        <View style={{ flex: 1, gap: 3 }}>
             <Text style={[styles.nodeName, { color: isTop ? "#fff" : colors.foreground }]} numberOfLines={1}>
             {node.name || t("orgVacantNode")}
          </Text>
          <View style={styles.nodeRolePill}>
            <View style={[styles.roleDot, { backgroundColor: isTop ? "rgba(255,255,255,0.7)" : node.color }]} />
            <Text style={[styles.nodeRoleText, { color: isTop ? "rgba(255,255,255,0.9)" : node.color }]}>
              {node.roleLabel}
            </Text>
          </View>
          {node.email ? (
            <Text style={[styles.nodeMeta, { color: isTop ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]} numberOfLines={1}>
              {node.email}
            </Text>
          ) : null}
        </View>

        {/* Status badge */}
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={[styles.statusBadge, { backgroundColor: isTop ? "rgba(255,255,255,0.15)" : badge.bg }]}>
             <Text style={[styles.statusBadgeText, { color: isTop ? "#fff" : badge.color }]}>{t(badge.labelKey)}</Text>
          </View>
          <Feather name="chevron-right" size={14} color={isTop ? "rgba(255,255,255,0.6)" : colors.mutedForeground} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Connector line between hierarchy levels */
function Connector({ color }: { color: string }) {
  return (
    <View style={styles.connectorWrap}>
      <View style={[styles.connectorLine, { backgroundColor: color + "40" }]} />
      <View style={[styles.connectorArrow, { borderTopColor: color + "60" }]} />
    </View>
  );
}

/** Vacant position placeholder */
function VacantCard({ roleLabel, color, colors, t }: { roleLabel: string; color: string; colors: ReturnType<typeof useColors>; t: (key: string) => string }) {
  return (
    <View style={[styles.vacantCard, { borderColor: color + "40", backgroundColor: color + "06" }]}>
      <View style={[styles.vacantIcon, { backgroundColor: color + "15" }]}>
        <Feather name="user-x" size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.vacantLabel, { color: colors.mutedForeground }]}>{roleLabel}</Text>
         <Text style={[styles.vacantSub, { color: color }]}>{t("orgVacantPosition")}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: "#fee2e2" }]}>
         <Text style={[styles.statusBadgeText, { color: "#dc2626" }]}>{t("orgVacantBadge")}</Text>
      </View>
    </View>
  );
}

/** Role detail modal */
function RoleModal({ node, visible, onClose, isAdmin, colors, t, locale }: {
  node: OrgNode | null;
  visible: boolean;
  onClose: () => void;
  isAdmin: boolean;
  colors: ReturnType<typeof useColors>;
  t: (key: string) => string;
  locale: string;
}) {
  if (!node) return null;
  const badge = statusBadge(node.status);

  const sections = [
    { title: t("orgPermModules"), icon: "grid" as const, items: node.permissions.modules },
    { title: t("orgPermApproval"), icon: "check-square" as const, items: node.permissions.approvalRights },
    { title: t("orgPermSignature"), icon: "pen-tool" as const, items: node.permissions.signatureRights },
    { title: t("orgPermReports"), icon: "bar-chart-2" as const, items: node.permissions.reportsAccess },
    { title: t("orgPermDocuments"), icon: "folder" as const, items: node.permissions.documentAccess },
    { title: t("orgPermFinancial"), icon: "dollar-sign" as const, items: node.permissions.financialAccess },
    { title: t("orgPermPermissions"), icon: "shield" as const, items: node.permissions.permissions },
  ].filter((s) => s.items.length > 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        {/* Modal header */}
        <View style={[styles.modalHeader, { backgroundColor: node.color, borderBottomColor: node.color }]}>
          <View style={styles.modalAvatar}>
            <Text style={styles.modalInitials}>{node.name ? initials(node.name) : "?"}</Text>
          </View>
          <View style={{ flex: 1 }}>
             <Text style={styles.modalName} numberOfLines={1}>{node.name || t("orgVacantNode")}</Text>
            <Text style={styles.modalRole}>{node.roleLabel}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.modalClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* Contact + mandate info */}
          <View style={[styles.infoGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <InfoRow icon="mail"      label="Email"        value={node.email || "—"}          colors={colors} />
             <InfoRow icon="phone" label={t("orgModalPhone")} value={node.phone || "—"} colors={colors} />
             <InfoRow icon="calendar" label={t("orgModalMandateStart")} value={formatDate(node.mandateStart, locale)} colors={colors} />
             <InfoRow icon="calendar" label={t("orgModalMandateEnd")} value={formatDate(node.mandateEnd, locale)} colors={colors} />
            {node.appointedAt && (
               <InfoRow icon="clock" label={t("orgModalAppointed")} value={formatDate(node.appointedAt, locale)} colors={colors} />
            )}
            <View style={styles.infoRowWrap}>
              <Feather name="activity" size={14} color={colors.mutedForeground} />
               <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{t("orgModalStatus")}</Text>
              <View style={[styles.statusBadge, { backgroundColor: badge.bg, marginLeft: "auto" }]}>
                 <Text style={[styles.statusBadgeText, { color: badge.color }]}>{t(badge.labelKey)}</Text>
              </View>
            </View>
          </View>

          {/* Permissions sections */}
          {sections.map((sec) => (
            <View key={sec.title} style={[styles.permSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.permHeader}>
                <View style={[styles.permIconWrap, { backgroundColor: node.color + "15" }]}>
                  <Feather name={sec.icon} size={14} color={node.color} />
                </View>
                <Text style={[styles.permTitle, { color: colors.foreground }]}>{sec.title}</Text>
              </View>
              <View style={styles.permItems}>
                {sec.items.map((item) => (
                  <View key={item} style={styles.permItem}>
                    <View style={[styles.permDot, { backgroundColor: node.color }]} />
                    <Text style={[styles.permItemText, { color: colors.foreground }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoRow({ icon, label, value, colors }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.infoRowWrap}>
      <Feather name={icon} size={14} color={colors.mutedForeground} />
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function OrganigrammeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const { t, lang } = useLanguage();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [orgData, setOrgData]         = useState<OrgData | null>(null);
  const [nationalData, setNationalData] = useState<NationalData | null>(null);
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showNational, setShowNational] = useState(() => user?.role === "super_admin");

  const isSuperAdmin   = user?.role === "super_admin";
  const isAdminOrAbove = ["super_admin", "syndicate_admin"].includes(user?.role ?? "");
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    try {
      const [orgRes, natRes] = await Promise.all([
        apiRequest<{ data: OrgData }>("/organigramme"),
        isSuperAdmin ? apiRequest<{ data: NationalData }>("/organigramme/national") : Promise.resolve(null),
      ]);
      if (orgRes?.data) setOrgData(orgRes.data);
      if (natRes?.data) setNationalData(natRes.data);
    } catch {
      if (isRefresh) {
        Alert.alert(t("orgLoadError"), t("orgRetry"));
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSuperAdmin, t]);

  useEffect(() => { load(); }, [load]);

  const handleShare = async () => {
    try {
      const synName = orgData?.syndicate?.name ?? t("orgSyndicateFallback");
      const president = orgData?.hierarchy?.president;
      const treasurer = orgData?.hierarchy?.treasurer;
      const secretary = orgData?.hierarchy?.secretary;
      const text = [
        `🏢 ORGANIGRAMME — ${synName}`,
        "",
         `🏅 ${t("orgVacantPresident")}: ${president?.name ?? t("orgVacantBadge")}`,
         `💰 ${t("orgVacantTreasurer")}: ${treasurer?.name ?? t("orgVacantBadge")}`,
         `📋 ${t("orgVacantSecretary")}: ${secretary?.name ?? t("orgVacantBadge")}`,
         `👥 ${t("orgStatCommitteeMembers")}: ${orgData?.stats?.committeeCount ?? 0}`,
         `✅ ${t("orgStatActiveMandates")}: ${orgData?.stats?.activeMandates ?? 0}`,
      ].join("\n");
      await Share.share({ message: text, title: `Organigramme — ${synName}` });
    } catch {
      Alert.alert(t("orgShareErrorTitle"), t("orgShareError"));
    }
  };

  // ── Render national card ──────────────────────────────────────────────────
  const renderNationalCard = ({ item }: { item: NationalSyndicate }) => {
    const gColor = govStatusColor(item.governanceStatus);
    return (
      <View style={[styles.natCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Left stripe */}
        <View style={[styles.natStripe, { backgroundColor: item.logoColor }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={styles.natHeader}>
            <View>
              <Text style={[styles.natName, { color: colors.foreground }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.natCity, { color: colors.mutedForeground }]}>{item.city}{item.region ? ` — ${item.region}` : ""}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: gColor + "18" }]}>
              <View style={[styles.roleDot, { backgroundColor: gColor }]} />
              <Text style={[styles.statusBadgeText, { color: gColor }]}>
                {item.governanceStatus === "healthy" ? t("orgNatStatusHealthy") : item.governanceStatus === "warning" ? t("orgNatStatusWarning") : t("orgNatStatusCritical")}
              </Text>
            </View>
          </View>

          <View style={styles.natStats}>
            <NatStat icon="home" value={item.buildingsCount} label={t("orgNatBuildings")} colors={colors} />
            <NatStat icon="users" value={item.membersCount} label={t("orgNatMembers")} colors={colors} />
            <NatStat icon="award" value={item.councilCount} label={t("orgNatCouncil")} colors={colors} />
            <NatStat icon="user-x" value={item.vacantPositions} label={t("orgNatVacant")} colors={colors} color={item.vacantPositions > 0 ? "#dc2626" : undefined} />
          </View>

          {item.president && (
            <Text style={[styles.natPresident, { color: colors.mutedForeground }]}>
              🏅 {t("orgNatPresident")} {item.president.name}
            </Text>
          )}

          {item.alerts.length > 0 && (
            <View style={styles.natAlerts}>
              {item.alerts.map((a) => (
                <View key={a} style={styles.natAlert}>
                  <Feather name="alert-triangle" size={10} color="#d97706" />
                  <Text style={styles.natAlertText}>{a}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("orgTitle")}</Text>
        </View>
        <LoadingState title={t("orgLoading")} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("orgTitle")}</Text>
        </View>
        <ErrorState
          title={t("orgLoadError")}
          description={t("orgLoadErrorDescription")}
          retryLabel={t("orgRetry")}
          onRetry={() => load()}
        />
      </View>
    );
  }

  const h = orgData?.hierarchy;
  const stats = orgData?.stats;
  const syndicate = orgData?.syndicate;
  const synColor = syndicate?.logoColor ?? "#7c3aed";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("orgTitle")}</Text>
          {syndicate && (
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {syndicate.name}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {isSuperAdmin && (
            <TouchableOpacity
              style={[styles.headerBtn, showNational ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}
              onPress={() => { setShowNational((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Feather name="globe" size={16} color={showNational ? "#fff" : colors.foreground} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.headerBtn, { backgroundColor: colors.muted }]} onPress={handleShare}>
            <Feather name="share-2" size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Super Admin National View ── */}
      {isSuperAdmin && showNational && nationalData ? (
        <View style={{ flex: 1 }}>
          {/* National summary strip */}
          <View style={[styles.natSummary, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={styles.natSummaryInner}>
              <NatSumStat value={nationalData.summary.total} label={t("orgNatSummaryTotal")} color="#2563EB" />
              <NatSumStat value={nationalData.summary.healthy} label={t("orgNatSummaryHealthy")} color="#059669" />
              <NatSumStat value={nationalData.summary.warnings} label={t("orgNatSummaryWarnings")} color="#d97706" />
              <NatSumStat value={nationalData.summary.critical} label={t("orgNatSummaryCritical")} color="#dc2626" />
              <NatSumStat value={nationalData.summary.totalVacancies} label={t("orgNatSummaryVacancies")} color="#ef4444" />
            </View>
          </View>
          <FlatList
            data={nationalData.syndicates}
            keyExtractor={(s) => s.id}
            renderItem={renderNationalCard}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        >
          {/* ── Super admin: no syndicate selected ── */}
          {isSuperAdmin && !orgData && (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: "#7C3AED15", alignItems: "center", justifyContent: "center" }}>
                <Feather name="globe" size={28} color="#7C3AED" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
                {t("orgNationalView")}
              </Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>
                {t("orgNationalDesc")}
              </Text>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#7C3AED", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                onPress={() => { setShowNational(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
              >
                <Feather name="globe" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{t("orgNationalBtn")}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Governance alerts ── */}
          {stats && stats.alerts.length > 0 && (
            <View style={[styles.alertBanner, { backgroundColor: "#fef3c7", borderColor: "#fbbf24" }]}>
              <Feather name="alert-triangle" size={14} color="#d97706" />
              <View style={{ flex: 1, gap: 2 }}>
                {stats.alerts.map((a) => (
                  <Text key={a} style={styles.alertText}>{a}</Text>
                ))}
              </View>
            </View>
          )}

          {/* ── Dashboard stat cards ── */}
          {stats && <StatCards stats={stats} colors={colors} t={t} />}

          {/* ── Org chart title ── */}
          {(!isSuperAdmin || orgData) && <View style={[styles.sectionHeader, { borderLeftColor: synColor }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("orgHierarchyTitle")}</Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              {t("orgHierarchySub")}
            </Text>
          </View>}

          {(!isSuperAdmin || orgData) && <View style={styles.chartWrap}>
            {/* Level 2: Syndicate Admin */}
            <View style={[styles.levelLabel, { backgroundColor: "#2563EB10" }]}>
              <Text style={[styles.levelLabelText, { color: "#2563EB" }]}>{t("orgLevel1")}</Text>
            </View>

            {h && h.admins.length > 0 ? (
              h.admins.map((admin, idx) => (
                <React.Fragment key={admin.id}>
                  <NodeCard node={admin} isTop colors={colors} onPress={setSelectedNode} t={t} />
                  {idx < h.admins.length - 1 && <View style={[styles.connectorSmall, { backgroundColor: colors.border }]} />}
                </React.Fragment>
              ))
            ) : (
              <VacantCard roleLabel={t("orgVacantAdmin")} color="#2563EB" colors={colors} t={t} />
            )}

            {/* Level 3: Président */}
            <Connector color="#7C3AED" />
            <View style={[styles.levelLabel, { backgroundColor: "#7C3AED10" }]}>
              <Text style={[styles.levelLabelText, { color: "#7C3AED" }]}>{t("orgLevel2")}</Text>
            </View>
            {h?.president ? (
              <NodeCard node={h.president} colors={colors} onPress={setSelectedNode} t={t} />
            ) : (
              <VacantCard roleLabel={t("orgVacantPresident")} color="#7C3AED" colors={colors} t={t} />
            )}

            {/* Level 4: Trésorier */}
            <Connector color="#059669" />
            <View style={[styles.levelLabel, { backgroundColor: "#05966910" }]}>
              <Text style={[styles.levelLabelText, { color: "#059669" }]}>{t("orgLevel3")}</Text>
            </View>
            {h?.treasurer ? (
              <NodeCard node={h.treasurer} colors={colors} onPress={setSelectedNode} t={t} />
            ) : (
              <VacantCard roleLabel={t("orgVacantTreasurer")} color="#059669" colors={colors} t={t} />
            )}

            {/* Level 5: Secrétaire */}
            <Connector color="#EA580C" />
            <View style={[styles.levelLabel, { backgroundColor: "#EA580C10" }]}>
              <Text style={[styles.levelLabelText, { color: "#EA580C" }]}>{t("orgLevel4")}</Text>
            </View>
            {h?.secretary ? (
              <NodeCard node={h.secretary} colors={colors} onPress={setSelectedNode} t={t} />
            ) : (
              <VacantCard roleLabel={t("orgVacantSecretary")} color="#EA580C" colors={colors} t={t} />
            )}

            {/* Level 6: Membres du Bureau */}
            {h && (h.committeeMembers.length > 0 || true) && (
              <>
                <Connector color="#6B7280" />
                <View style={[styles.levelLabel, { backgroundColor: "#6B728010" }]}>
                  <Text style={[styles.levelLabelText, { color: "#6B7280" }]}>{t("orgLevel5")}</Text>
                </View>
                {h.committeeMembers.length > 0 ? (
                  h.committeeMembers.map((m) => (
                    <NodeCard key={m.id} node={m} colors={colors} onPress={setSelectedNode} t={t} />
                  ))
                ) : (
                  <VacantCard roleLabel={t("orgStatCommitteeMembers")} color="#6B7280" colors={colors} t={t} />
                )}
              </>
            )}

            {/* Bottom spacer */}
            <View style={{ height: 20 }} />
          </View>}

          {/* ── Admin actions (admin only) ── */}
          {isAdminOrAbove && (
            <View style={[styles.adminActions, { borderTopColor: colors.border }]}>
              <Text style={[styles.adminActionsTitle, { color: colors.mutedForeground }]}>{t("orgAdminActions")}</Text>
              <View style={styles.adminActionsRow}>
                <TouchableOpacity
                  style={[styles.adminActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/governance" as any); }}
                >
                  <Feather name="award" size={16} color={colors.primary} />
                  <Text style={[styles.adminActionLabel, { color: colors.foreground }]}>{t("orgManageCouncil")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adminActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={handleShare}
                >
                  <Feather name="printer" size={16} color={colors.primary} />
                  <Text style={[styles.adminActionLabel, { color: colors.foreground }]}>{t("orgExport")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adminActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/elected-members" as any); }}
                >
                  <Feather name="user-check" size={16} color={colors.primary} />
                  <Text style={[styles.adminActionLabel, { color: colors.foreground }]}>{t("orgElectedMandates")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Role Detail Modal ── */}
      <RoleModal
        node={selectedNode}
        visible={selectedNode !== null}
        onClose={() => setSelectedNode(null)}
        isAdmin={isAdminOrAbove}
        colors={colors}
        t={t}
        locale={locale}
      />
    </View>
  );
}

// ─── Tiny helpers ────────────────────────────────────────────────────────────

function NatStat({ icon, value, label, colors, color }: {
  icon: keyof typeof Feather.glyphMap;
  value: number;
  label: string;
  colors: ReturnType<typeof useColors>;
  color?: string;
}) {
  return (
    <View style={styles.natStat}>
      <Feather name={icon} size={11} color={color ?? colors.mutedForeground} />
      <Text style={[styles.natStatVal, { color: color ?? colors.foreground }]}>{value}</Text>
      <Text style={[styles.natStatLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function NatSumStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.natSumStat}>
      <Text style={[styles.natSumVal, { color }]}>{value}</Text>
      <Text style={[styles.natSumLabel, { color: "#6b7280" }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...crossPlatformShadow({ color: "#000", offsetY: 2, opacity: 0.04, radius: 4, elevation: 2 }),
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  headerSub: { fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Loading
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14 },

  // Alerts
  alertBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    margin: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertText: { fontSize: 12, color: "#92400e", fontWeight: "500", lineHeight: 18 },

  // Stat cards
  statRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    ...crossPlatformShadow({ color: "#000", offsetY: 1, opacity: 0.04, radius: 3, elevation: 1 }),
  },
  statIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: "500", textAlign: "center", lineHeight: 13 },

  // Section header
  sectionHeader: {
    borderLeftWidth: 3,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 6,
    paddingLeft: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  sectionSub: { fontSize: 12, marginTop: 2 },

  // Chart wrap
  chartWrap: { paddingHorizontal: 16, gap: 10, paddingTop: 8 },

  // Level label
  levelLabel: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, alignSelf: "flex-start" },
  levelLabelText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },

  // Node card
  nodeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    ...crossPlatformShadow({ color: "#000", offsetY: 2, opacity: 0.06, radius: 6, elevation: 2 }),
  },
  nodeCardTop: {
    ...crossPlatformShadow({ color: "#000", offsetY: 2, opacity: 0.14, radius: 10, elevation: 4 }),
  },
  nodeAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeInitials: { fontSize: 16, fontWeight: "800" },
  nodeName: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  nodeRolePill: { flexDirection: "row", alignItems: "center", gap: 5 },
  roleDot: { width: 6, height: 6, borderRadius: 3 },
  nodeRoleText: { fontSize: 12, fontWeight: "600" },
  nodeMeta: { fontSize: 11 },

  // Connector
  connectorWrap: { alignItems: "center", gap: 0, marginVertical: 2 },
  connectorLine: { width: 2, height: 20 },
  connectorArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  connectorSmall: { height: 6, width: 2, alignSelf: "center", borderRadius: 1 },

  // Vacant card
  vacantCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  vacantIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  vacantLabel: { fontSize: 13, fontWeight: "600" },
  vacantSub: { fontSize: 11, fontWeight: "500", marginTop: 2 },

  // Status badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },

  // Admin actions
  adminActions: {
    margin: 16,
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  adminActionsTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  adminActionsRow: { flexDirection: "row", gap: 10 },
  adminActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  adminActionLabel: { fontSize: 12, fontWeight: "600" },

  // Modal
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 20,
    paddingTop: 24,
  },
  modalAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalInitials: { fontSize: 18, fontWeight: "800", color: "#fff" },
  modalName: { fontSize: 17, fontWeight: "800", color: "#fff" },
  modalRole: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: "500", marginTop: 2 },
  modalClose: { padding: 4 },

  infoGrid: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRowWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  infoLabel: { fontSize: 12, fontWeight: "500", width: 90 },
  infoValue: { fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" },

  permSection: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  permHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  permIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  permTitle: { fontSize: 13, fontWeight: "700" },
  permItems: { padding: 14, gap: 8 },
  permItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  permDot: { width: 6, height: 6, borderRadius: 3 },
  permItemText: { fontSize: 13 },

  // National view
  natSummary: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  natSummaryInner: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 16 },
  natSumStat: { alignItems: "center", gap: 2 },
  natSumVal: { fontSize: 20, fontWeight: "800" },
  natSumLabel: { fontSize: 10, fontWeight: "600" },

  natCard: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    ...crossPlatformShadow({ color: "#000", offsetY: 1, opacity: 0.05, radius: 4, elevation: 1 }),
  },
  natStripe: { width: 4 },
  natHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  natName: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  natCity: { fontSize: 12, marginTop: 2 },
  natStats: { flexDirection: "row", gap: 16 },
  natStat: { alignItems: "center", gap: 2 },
  natStatVal: { fontSize: 14, fontWeight: "700" },
  natStatLabel: { fontSize: 9, fontWeight: "600" },
  natPresident: { fontSize: 12 },
  natAlerts: { gap: 4 },
  natAlert: { flexDirection: "row", alignItems: "center", gap: 5 },
  natAlertText: { fontSize: 11, color: "#92400e" },
});
