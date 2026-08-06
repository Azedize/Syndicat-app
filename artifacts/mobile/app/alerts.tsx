import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
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
import { useAuth } from "@/context/AuthContext";
import { useData, type Alert as AppAlert } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type Filter = "all" | "unread" | "info" | "warning" | "success" | "error";

// ─── Contextual notification label prefix ────────────────────────────────────
const TYPE_META: Record<
  AppAlert["type"],
  {
    prefixKey: string;
    icon: React.ComponentProps<typeof Feather>["name"];
    color: string;
    bgColor: string;
    borderColor: string;
    badgeKey: string;
  }
> = {
  warning: {
    prefixKey: "notificationFilterWarning",
    icon: "alert-triangle",
    color: "#f59e0b",
    bgColor: "#fffbeb",
    borderColor: "#fef3c7",
    badgeKey: "alertWarning",
  },
  error: {
    prefixKey: "notificationFilterUrgent",
    icon: "alert-circle",
    color: "#ef4444",
    bgColor: "#fff5f5",
    borderColor: "#fee2e2",
    badgeKey: "alertError",
  },
  info: {
    prefixKey: "notificationFilterInfo",
    icon: "info",
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#dbeafe",
    badgeKey: "alertInfo",
  },
  success: {
    prefixKey: "notificationFilterSuccess",
    icon: "check-circle",
    color: "#10b981",
    bgColor: "#f0fdf4",
    borderColor: "#d1fae5",
    badgeKey: "alertSuccess",
  },
};

// ─── Group notifications by time bucket ──────────────────────────────────────
type Group = { title: string; data: AppAlert[] };

function groupByTime(items: AppAlert[], translate: (key: string) => string): Group[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const today: AppAlert[] = [];
  const yesterdayItems: AppAlert[] = [];
  const thisWeek: AppAlert[] = [];
  const older: AppAlert[] = [];

  for (const item of items) {
    const d = new Date(item.date);
    if (isNaN(d.getTime())) {
      older.push(item);
      continue;
    }
    const ds = d.toDateString();
    if (ds === todayStr) today.push(item);
    else if (ds === yesterdayStr) yesterdayItems.push(item);
    else if (d >= weekAgo) thisWeek.push(item);
    else older.push(item);
  }

  const groups: Group[] = [];
  if (today.length) groups.push({ title: translate("notificationToday"), data: today });
  if (yesterdayItems.length) groups.push({ title: translate("notificationYesterday"), data: yesterdayItems });
  if (thisWeek.length) groups.push({ title: translate("notificationThisWeek"), data: thisWeek });
  if (older.length) groups.push({ title: translate("notificationEarlier"), data: older });
  return groups;
}

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { alerts, markAlertRead, markAllAlertsRead } = useData();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<AppAlert | null>(null);

  const filters: {
    key: Filter;
    label: string;
    icon: React.ComponentProps<typeof Feather>["name"];
  }[] = [
    { key: "all", label: t("notificationFilterAll"), icon: "bell" },
    { key: "unread", label: t("notificationFilterUnread"), icon: "circle" },
    { key: "error", label: t("notificationFilterUrgent"), icon: "alert-circle" },
    { key: "warning", label: t("notificationFilterWarning"), icon: "alert-triangle" },
    { key: "info", label: t("notificationFilterInfo"), icon: "info" },
    { key: "success", label: t("notificationFilterSuccess"), icon: "check-circle" },
  ];

  const unread = alerts.filter((a) => !a.read).length;

  // Sorted: unread first, then by date desc
  const sorted = useMemo(
    () =>
      [...alerts].sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        return isNaN(db) || isNaN(da) ? 0 : db - da;
      }),
    [alerts]
  );

  const filtered = useMemo(() => {
    return sorted.filter((a) => {
      if (filter === "all") return true;
      if (filter === "unread") return !a.read;
      return a.type === filter;
    });
  }, [sorted, filter]);

  // Flatten groups for FlatList
  type ListItem =
    | { kind: "header"; title: string; id: string }
    | { kind: "notif"; item: AppAlert; id: string };

  const listData = useMemo<ListItem[]>(() => {
    const groups = groupByTime(filtered, t);
    const out: ListItem[] = [];
    for (const g of groups) {
      out.push({ kind: "header", title: g.title, id: `h-${g.title}` });
      for (const item of g.data) out.push({ kind: "notif", item, id: item.id });
    }
    return out;
  }, [filtered, t]);

  const handleMarkAllRead = () => {
    markAllAlertsRead();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleTap = (alert: AppAlert) => {
    setSelected(alert);
    if (!alert.read) {
      markAlertRead(alert.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const filterAccentColor = (f: Filter) => {
    if (f === "all") return colors.primary;
    if (f === "unread") return colors.foreground;
    return TYPE_META[f as AppAlert["type"]]?.color ?? colors.primary;
  };

  // ─── Dark-mode-aware background tint ───────────────────────────────────────
  const isDark = colors.background === "#0f172a" || colors.background === "#09090b";

  const cardBg = (alert: AppAlert) => {
    const meta = TYPE_META[alert.type];
    if (alert.read) return colors.card;
    return isDark ? meta.color + "12" : meta.bgColor;
  };

  const cardBorderColor = (alert: AppAlert) => {
    const meta = TYPE_META[alert.type];
    if (alert.read) return colors.border;
    return isDark ? meta.color + "35" : meta.borderColor;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("notificationsTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {unread > 0
              ? `${unread} ${t("notificationsUnreadCount").replace("{count}", "").trim()}`
              : t("notificationsUpToDate")}
          </Text>
        </View>
        {unread > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, { backgroundColor: colors.primary + "15" }]}
            onPress={handleMarkAllRead}
          >
            <Feather name="check-square" size={14} color={colors.primary} />
            <Text style={[styles.markAllText, { color: colors.primary }]}>
              {t("markAllShort")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
        style={[styles.filtersBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
      >
        {filters.map((f) => {
          const active = filter === f.key;
          const accent = filterAccentColor(f.key);
          const count = f.key === "unread" ? unread : f.key === "all" ? alerts.length : alerts.filter((a) => a.type === f.key).length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: accent, borderColor: accent }
                  : { backgroundColor: colors.background, borderColor: colors.border },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setFilter(f.key);
              }}
            >
              <Feather name={f.icon} size={11} color={active ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.chipText, { color: active ? "#fff" : colors.mutedForeground }]}>
                {f.label}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    styles.chipBadge,
                    { backgroundColor: active ? "rgba(255,255,255,0.3)" : accent + "20" },
                  ]}
                >
                  <Text style={[styles.chipBadgeText, { color: active ? "#fff" : accent }]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Notification list ── */}
      <FlatList
        data={listData}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{
          padding: 16,
          gap: 6,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "10" }]}>
              <Feather name="bell-off" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {t("notificationNoneTitle")}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {filter === "all"
                ? t("notificationNoneDescription")
                : t("notificationNoneFiltered")}
            </Text>
            {filter !== "all" && (
              <TouchableOpacity
                style={[styles.showAllBtn, { borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setFilter("all")}
              >
                <Text style={[styles.showAllText, { color: colors.foreground }]}>
                  {t("notificationShowAll")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item: listItem }) => {
          if (listItem.kind === "header") {
            return (
              <View style={styles.groupHeader}>
                <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
                  {listItem.title}
                </Text>
                <View style={[styles.groupLine, { backgroundColor: colors.border }]} />
              </View>
            );
          }

          const alert = listItem.item;
          const meta = TYPE_META[alert.type];

          return (
            <TouchableOpacity
              style={[
                styles.notifCard,
                {
                  backgroundColor: cardBg(alert),
                  borderColor: cardBorderColor(alert),
                  borderLeftColor: meta.color,
                },
              ]}
              onPress={() => handleTap(alert)}
              activeOpacity={0.75}
            >
              {/* Unread dot */}
              {!alert.read && (
                <View style={[styles.unreadDot, { backgroundColor: meta.color }]} />
              )}

              {/* Icon */}
              <View style={[styles.notifIcon, { backgroundColor: meta.color + "18" }]}>
                <Feather name={meta.icon} size={20} color={meta.color} />
              </View>

              {/* Content */}
              <View style={{ flex: 1, gap: 3 }}>
                {/* Prefix + badge row */}
                <View style={styles.prefixRow}>
                  <Text style={[styles.notifPrefix, { color: meta.color }]}>
                    {t(meta.prefixKey)}
                  </Text>
                  <View style={[styles.badgePill, { backgroundColor: meta.color + "18" }]}>
                    <Text style={[styles.badgePillText, { color: meta.color }]}>
                      {t(meta.badgeKey)}
                    </Text>
                  </View>
                  {!alert.read && (
                    <View style={[styles.newPill, { backgroundColor: meta.color }]}>
                      <Text style={styles.newPillText}>{t("notificationNew")}</Text>
                    </View>
                  )}
                </View>

                {/* Title */}
                <Text
                  style={[
                    styles.notifTitle,
                    {
                      color: colors.foreground,
                      fontFamily: alert.read ? "Inter_500Medium" : "Inter_700Bold",
                    },
                  ]}
                  numberOfLines={2}
                >
                  {alert.title}
                </Text>

                {/* Message */}
                <Text
                  style={[styles.notifMsg, { color: colors.mutedForeground }]}
                  numberOfLines={2}
                >
                  {alert.message}
                </Text>

                {/* Footer */}
                <View style={styles.notifFooter}>
                  <Feather name="clock" size={10} color={colors.mutedForeground} />
                  <Text style={[styles.notifDate, { color: colors.mutedForeground }]}>
                    {alert.date}
                  </Text>
                  <Text style={[styles.notifSep, { color: colors.border }]}>·</Text>
                  <Text style={[styles.notifTarget, { color: colors.mutedForeground }]}>
                    {alert.target === "all"
                      ? t("notificationTargetAll")
                      : alert.target === "admin"
                      ? t("notificationTargetAdmin")
                      : t("notificationTargetMember")}
                  </Text>
                </View>
              </View>

              <Feather
                name="chevron-right"
                size={14}
                color={colors.mutedForeground}
                style={{ alignSelf: "center", marginLeft: 4 }}
              />
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Detail modal ── */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (() => {
          const meta = TYPE_META[selected.type];
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View
                style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
              >
                <TouchableOpacity onPress={() => setSelected(null)} style={styles.modalClose}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
                <Text style={[styles.modalHeaderTitle, { color: colors.foreground }]}>
                  {t("notificationDetail")}
                </Text>
                <View style={{ width: 34 }} />
              </View>

              <ScrollView
                contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Hero block */}
                <View
                  style={[
                    styles.heroCard,
                    {
                      backgroundColor: isDark ? meta.color + "12" : meta.bgColor,
                      borderColor: isDark ? meta.color + "30" : meta.borderColor,
                    },
                  ]}
                >
                  <View style={[styles.heroIconWrap, { backgroundColor: meta.color + "20" }]}>
                    <Feather name={meta.icon} size={38} color={meta.color} />
                  </View>
                  <View style={[styles.heroTypePill, { backgroundColor: meta.color }]}>
                    <Text style={styles.heroTypePillText}>{t(meta.prefixKey)}</Text>
                  </View>
                  <Text style={[styles.heroTitle, { color: colors.foreground }]}>
                    {selected.title}
                  </Text>
                </View>

                {/* Message */}
                <View
                  style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={[styles.infoCardLabel, { color: colors.mutedForeground }]}>
                    {t("notificationMessageLabel")}
                  </Text>
                  <Text style={[styles.infoCardText, { color: colors.foreground }]}>
                    {selected.message}
                  </Text>
                </View>

                {/* Meta rows */}
                <View
                  style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  {[
                    { label: t("notificationDateLabel"), value: selected.date, icon: "calendar" as const },
                    {
                      label: t("notificationRecipientsLabel"),
                      value:
                        selected.target === "all"
                          ? t("notificationTargetAll")
                          : selected.target === "admin"
                          ? t("notificationTargetAdmin")
                          : t("notificationTargetMember"),
                      icon: "users" as const,
                    },
                    {
                      label: t("notificationStatusLabel"),
                      value: selected.read ? t("notificationRead") : t("notificationUnread"),
                      icon: "eye" as const,
                    },
                    { label: t("notificationPriorityLabel"), value: t(meta.badgeKey), icon: "flag" as const },
                  ].map((row, i) => (
                    <View key={row.label}>
                      {i > 0 && (
                        <View style={[styles.metaSep, { backgroundColor: colors.border }]} />
                      )}
                      <View style={styles.metaRow}>
                        <View style={styles.metaRowLeft}>
                          <Feather name={row.icon} size={13} color={colors.mutedForeground} />
                          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>
                            {row.label}
                          </Text>
                        </View>
                        <Text style={[styles.metaValue, { color: colors.foreground }]}>
                          {row.value}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {!selected.read && (
                  <TouchableOpacity
                    style={[styles.readBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      markAlertRead(selected.id);
                      setSelected(null);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                  >
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={styles.readBtnText}>{t("notificationMarkRead")}</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          );
        })() : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  markAllText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Filters
  filtersBar: { borderBottomWidth: 1 },
  filtersRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: "row" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  chipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: "center",
  },
  chipBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  // Group header
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 2,
  },
  groupTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  groupLine: { flex: 1, height: 1 },

  // Notification card
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    gap: 12,
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    top: 13,
    right: 13,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  prefixRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  notifPrefix: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  badgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgePillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  newPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newPillText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  notifTitle: { fontSize: 13, lineHeight: 18 },
  notifMsg: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  notifFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  notifDate: { fontSize: 10, fontFamily: "Inter_400Regular" },
  notifSep: { fontSize: 10 },
  notifTarget: { fontSize: 10, fontFamily: "Inter_400Regular" },

  // Empty state
  empty: { alignItems: "center", gap: 12, paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  showAllBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  showAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Modal
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeaderTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },

  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  heroIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTypePill: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroTypePillText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    lineHeight: 22,
  },

  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  infoCardLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  infoCardText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },

  metaCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  metaSep: { height: 1 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  metaRowLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  metaValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  readBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
  },
  readBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
