import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { ErrorState } from "@/components/DataState";
import EmptyState from "@/components/EmptyState";
import FilterTabs from "@/components/FilterTabs";
import ScreenHeader from "@/components/ScreenHeader";
import { Button, Card, ListItem, type StatusTone } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

type TabType = "preferences" | "historique";

const ALERT_TONES: Record<string, StatusTone> = {
  info: "info",
  warning: "warning",
  success: "success",
  error: "danger",
};

const ALERT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  info: "info",
  warning: "alert-triangle",
  success: "check-circle",
  error: "alert-circle",
};

export default function NotificationsScreen() {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const {
    notificationPreferences,
    notificationPreferencesLoading,
    notificationPreferencesLoadError,
    refreshNotificationPreferences,
    toggleNotificationPref,
    toggleNotificationChannel,
    alerts,
    markAlertRead,
  } = useData();
  const { showToast } = useToast();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  // Opening notifications is first about reading them.
  const [tab, setTab] = useState<TabType>("historique");
  const unread = alerts.filter((a) => !a.read).length;
  const channelValue = (channel: "push" | "email" | "inApp") =>
    notificationPreferences.length > 0 &&
    notificationPreferences.every((preference) => preference[channel]);

  const categoryMeta = (category: string) => {
    const normalized = category.toLowerCase();
    if (
      normalized.includes("financ") ||
      normalized.includes("charge") ||
      normalized.includes("payment")
    ) {
      return {
        label: t("notificationCategoryFinancial"),
        description: t("notificationCategoryFinancialDescription"),
      };
    }
    if (normalized.includes("document") || normalized.includes("acte")) {
      return {
        label: t("notificationCategoryDocuments"),
        description: t("notificationCategoryDocumentsDescription"),
      };
    }
    if (
      normalized.includes("meeting") ||
      normalized.includes("réunion") ||
      normalized.includes("reunion") ||
      normalized.includes("assembl")
    ) {
      return {
        label: t("notificationCategoryMeetings"),
        description: t("notificationCategoryMeetingsDescription"),
      };
    }
    if (normalized.includes("message") || normalized.includes("chat")) {
      return {
        label: t("notificationCategoryMessages"),
        description: t("notificationCategoryMessagesDescription"),
      };
    }
    if (
      normalized.includes("security") ||
      normalized.includes("sécurité") ||
      normalized.includes("securite") ||
      normalized.includes("account")
    ) {
      return {
        label: t("notificationCategorySecurity"),
        description: t("notificationCategorySecurityDescription"),
      };
    }
    if (
      normalized.includes("work") ||
      normalized.includes("travaux") ||
      normalized.includes("incident") ||
      normalized.includes("sinistre")
    ) {
      return {
        label: t("notificationCategoryWorks"),
        description: t("notificationCategoryWorksDescription"),
      };
    }
    return { label: category || t("notificationsTitle"), description: "" };
  };

  const handleToggle = async (
    id: string,
    channel: "push" | "email" | "inApp",
  ) => {
    Haptics.selectionAsync();
    const saved = await toggleNotificationPref(id, channel);
    if (!saved) {
      showToast({
        type: "error",
        title: t("error"),
        message: t("settingsNotificationsSaveError"),
      });
    }
  };

  const handleGlobalToggle = async (
    channel: "push" | "email" | "inApp",
    value: boolean,
  ) => {
    Haptics.selectionAsync();
    const saved = await toggleNotificationChannel(channel, value);
    if (!saved) {
      showToast({
        type: "error",
        title: t("error"),
        message: t("settingsNotificationsSaveError"),
      });
    }
  };

  const handleMarkAllRead = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    alerts.filter((a) => !a.read).forEach((a) => markAlertRead(a.id));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader
        title={t("notificationsTitle")}
        subtitle={unread > 0 ? `${unread} ${t("uiUnread")}` : undefined}
        action={tab === "historique" && unread > 0 ? { icon: "check-square", label: t("markAllReadBtn"), onPress: handleMarkAllRead } : undefined}
      />

      <FilterTabs
        options={[
          { key: "historique", label: t("historyTab"), count: unread || undefined },
          { key: "preferences", label: t("preferencesTab") },
        ]}
        value={tab}
        onChange={(k) => setTab(k as TabType)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          gap: 16,
          paddingBottom: isWide ? 32 : insets.bottom + 100,
        }}
      >
        {tab === "preferences" && (
          <>
            {notificationPreferencesLoading &&
            notificationPreferences.length === 0 ? (
              <View
                style={[
                  styles.syncCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={[styles.syncText, { color: colors.mutedForeground }]}
                >
                  {t("settingsNotificationsLoading")}
                </Text>
              </View>
            ) : notificationPreferencesLoadError &&
              notificationPreferences.length === 0 ? (
              <ErrorState
                title={t("settingsNotificationsUnavailable")}
                description={t("settingsNotificationsUnavailable")}
                retryLabel={t("settingsNotificationsRetry")}
                onRetry={() => {
                  void refreshNotificationPreferences();
                }}
                accentColor={colors.destructive}
              />
            ) : null}
            {/* Global controls */}
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text
                style={[styles.sectionLabel, { color: colors.mutedForeground }]}
              >
                {t("globalSettingsLabel")}
              </Text>

              {[
                {
                  icon: "bell" as const,
                  color: colors.tint,
                  label: t("pushNotifsLabel"),
                  sub: t("pushNotifsSub"),
                  channel: "push" as const,
                  value: channelValue("push"),
                },
                {
                  icon: "mail" as const,
                  color: colors.info,
                  label: t("emailNotifsLabel"),
                  sub: t("emailNotifsSub"),
                  channel: "email" as const,
                  value: channelValue("email"),
                },
                {
                  icon: "bell" as const,
                  color: colors.success,
                  label: t("inAppNotifications"),
                  sub: t("inAppNotificationsSub"),
                  channel: "inApp" as const,
                  value: channelValue("inApp"),
                },
              ].map((item, i, arr) => (
                <View key={item.label}>
                  {i > 0 && (
                    <View
                      style={[styles.sep, { backgroundColor: colors.border }]}
                    />
                  )}
                  <View style={[styles.switchRow, { flexDirection: "row" }] }>
                    <View
                      style={[
                        styles.rowIcon,
                        { backgroundColor: item.color + "18" },
                      ]}
                    >
                      <Feather name={item.icon} size={18} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.rowLabel, { color: colors.foreground }]}
                      >
                        {item.label}
                      </Text>
                      <Text
                        style={[
                          styles.rowSub,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {item.sub}
                      </Text>
                    </View>
                    <Switch
                      value={item.value}
                      onValueChange={(value) => {
                        void handleGlobalToggle(item.channel, value);
                      }}
                      disabled={
                        notificationPreferencesLoading ||
                        notificationPreferences.length === 0
                      }
                      trackColor={{
                        false: colors.border,
                        true: item.color + "60",
                      }}
                      thumbColor={item.value ? item.color : colors.surface}
                    />
                  </View>
                </View>
              ))}
            </View>

            {/* Per-category preferences */}
            <Text
              style={[styles.sectionTitle, { color: colors.mutedForeground }]}
            >
              {t("perCategoryLabel")}
            </Text>

            {notificationPreferences.map((pref, index) => (
              <View
                key={pref.id}
                style={[
                  styles.prefCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.prefHeader, { flexDirection: "row" }] }>
                  {(() => {
                    const meta = categoryMeta(
                      pref.category ||
                        pref.label ||
                        [
                          "financial",
                          "documents",
                          "meetings",
                          "messages",
                          "security",
                          "works",
                        ][index] ||
                        "",
                    );
                    return (
                      <>
                        <View
                          style={[
                            styles.prefIcon,
                            { backgroundColor: pref.color + "18" },
                          ]}
                        >
                          <Feather
                            name={pref.icon as keyof typeof Feather.glyphMap}
                            size={20}
                            color={pref.color}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.prefLabel,
                              { color: colors.foreground },
                            ]}
                          >
                            {meta.label}
                          </Text>
                          <Text
                            style={[
                              styles.prefDesc,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {meta.description || pref.description}
                          </Text>
                        </View>
                      </>
                    );
                  })()}
                </View>

                <View
                  style={[
                    styles.prefDivider,
                    { backgroundColor: colors.border },
                  ]}
                />

                <View style={[styles.prefChannels, { flexDirection: "row" }] }>
                  {[
                    {
                      key: "push" as const,
                      label: t("notificationChannelPush"),
                      icon: "smartphone" as const,
                    },
                    {
                      key: "email" as const,
                      label: t("notificationChannelEmail"),
                      icon: "mail" as const,
                    },
                    {
                      key: "inApp" as const,
                      label: t("notificationChannelInApp"),
                      icon: "bell" as const,
                    },
                  ].map((ch, i, arr) => (
                    <View
                      key={ch.key}
                      style={[
                        styles.channelCell,
                        i < arr.length - 1
                          ? {
                              borderRightWidth: isRTL ? 0 : 1,
                              borderLeftWidth: isRTL ? 1 : 0,
                              borderRightColor: colors.border,
                              borderLeftColor: colors.border,
                            }
                          : null,
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          marginBottom: 6,
                        }}
                      >
                        <Feather
                          name={ch.icon}
                          size={12}
                          color={colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.channelLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {ch.label}
                        </Text>
                      </View>
                      <Switch
                        value={pref[ch.key]}
                        onValueChange={() => handleToggle(pref.id, ch.key)}
                        trackColor={{
                          false: colors.border,
                          true: pref.color + "60",
                        }}
                        thumbColor={pref[ch.key] ? pref.color : colors.surface}
                        accessibilityLabel={`${ch.label}`}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "historique" && (
          <>
            {alerts.length === 0 ? (
              <EmptyState icon="bell-off" title={t("notificationNoneTitle")} />
            ) : (
              <>
                {unread > 0 ? (
                  <Button label={`${t("markAllReadBtn")} (${unread})`} icon="check-square" variant="secondary" fullWidth onPress={handleMarkAllRead} />
                ) : null}
                <Card padding="none">
                  {alerts.map((alert, i) => {
                    const tone = ALERT_TONES[alert.type] ?? "info";
                    const typeLabel =
                      alert.type === "info" ? t("alertInfo") : alert.type === "warning" ? t("alertWarning") : alert.type === "success" ? t("alertSuccess") : t("alertError");
                    return (
                      <ListItem
                        key={alert.id}
                        icon={ALERT_ICONS[alert.type] ?? "bell"}
                        iconTone={tone}
                        title={alert.title}
                        subtitle={alert.message}
                        meta={`${typeLabel} · ${alert.date}`}
                        divider={i < alerts.length - 1}
                        accessibilityHint={alert.read ? undefined : t("uiUnread")}
                        trailing={!alert.read ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} accessibilityLabel={t("uiUnread")} /> : undefined}
                        chevron={!!alert.link}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          markAlertRead(alert.id);
                          // Opens what the notification is about (the server gives the
                          // link only to roles allowed there; the screen checks again).
                          if (alert.link) router.push(alert.link as any);
                        }}
                      />
                    );
                  })}
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Fraunces_600SemiBold",
    textAlign: "center",
  },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
    gap: 0,
  },
  syncCard: {
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  syncText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginStart: 4,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  sep: { height: 1, marginVertical: 2 },
  prefCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 14,
    gap: 10,
  },
  prefHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  prefIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  prefLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },
  prefDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 16,
  },
  prefDivider: { height: 1 },
  prefChannels: { flexDirection: "row" },
  channelCell: { flex: 1, alignItems: "center", paddingVertical: 6 },
  channelLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  markAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryRow: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  summaryCell: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 4 },
  summaryDot: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  notifIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  notifTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  notifMsg: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  notifFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  typeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  notifDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", gap: 12, paddingVertical: 48 },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
