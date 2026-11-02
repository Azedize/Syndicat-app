import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Constants from "expo-constants";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
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
import { useAuth } from "@/context/AuthContext";
import { LANG_OPTIONS, useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import ScreenHeader from "@/components/ScreenHeader";
import { Avatar, Button, Card, Chip, ListItem, SectionHeader, StatusBadge } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import {
  enablePushNotifications,
  getPushPermissionAction,
  type PushPermissionAction,
} from "@/features/notifications/hooks/usePushNotifications";
import { apiRequest } from "@/lib/api";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useFileTicket } from "@/hooks/useFileTicket";
import { useToast } from "@/context/ToastContext";
import { ticketedUrl } from "@/services/api";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import ThemeSwitchingArea from "@/components/theme/ThemeSwitchingArea";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout, user, token } = useAuth();
  const fileTicket = useFileTicket(!!token);
  const { mode, setMode } = useTheme();
  const { lang, setLang, t, isRTL } = useLanguage();
  const {
    notificationPreferences,
    notificationPreferencesLoading,
    notificationPreferencesLoadError,
    refreshNotificationPreferences,
    toggleNotificationChannel,
  } = useData();
  const { showToast } = useToast();

  // Right of access (Loi 09-08): download the personal data held about me.
  const exportMyData = async () => {
    try {
      await Linking.openURL(await ticketedUrl("/me/data-export"));
    } catch {
      showToast({ type: "error", title: t("error"), message: t("exportMyDataError") });
    }
  };
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const channelValue = (channel: "push" | "email" | "inApp") =>
    notificationPreferences.length > 0 &&
    notificationPreferences.every((preference) => preference[channel]);

  // The phone's own authorization: refreshed when the user comes back from the system settings.
  const [pushAction, setPushAction] = useState<PushPermissionAction>("none");
  const refreshPushAction = useCallback(() => {
    getPushPermissionAction().then(setPushAction).catch(() => {});
  }, []);
  useEffect(() => {
    refreshPushAction();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPushAction();
    });
    return () => sub.remove();
  }, [refreshPushAction]);
  const handlePushPermission = async () => {
    if (pushAction === "settings") {
      await Linking.openSettings().catch(() => {});
      return;
    }
    await enablePushNotifications().catch(() => {});
    refreshPushAction();
  };

  const handleNotificationToggle = async (
    channel: "push" | "email" | "inApp",
    value: boolean,
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const saved = await toggleNotificationChannel(channel, value);
    if (!saved) {
      showToast({
        type: "error",
        title: t("error"),
        message: t("settingsNotificationsSaveError"),
      });
    }
  };

  const showUnavailableSecurity = () => {
    Alert.alert(
      t("securityFeatureUnavailable"),
      t("securityFeatureUnavailableSub"),
      [{ text: t("ok") }],
    );
  };

  const handleLogout = () => {
    Alert.alert(t("logoutConfirmTitle"), t("logoutConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("logout"),
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const roleLabel =
    user?.role === "super_admin"
      ? t("superAdmin")
      : user?.role === "syndicate_admin"
        ? t("syndicateAdmin")
        : user?.role === "president"
          ? t("rolePresident")
          : user?.role === "treasurer"
            ? t("roleTresorier")
            : user?.role === "secretary"
              ? t("roleSecrétaire")
              : user?.role === "committee_member"
                ? t("roleMembreConseil")
                : user?.role === "tenant"
                  ? t("roleTenant")
                  : t("member");

  // Real server reachability (GET /healthz), not a fixed label.
  const [server, setServer] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    let cancelled = false;
    apiRequest("/healthz")
      .then(() => !cancelled && setServer("ok"))
      .catch(() => !cancelled && setServer("down"));
    return () => {
      cancelled = true;
    };
  }, []);

  const notifDisabled = notificationPreferencesLoading || notificationPreferences.length === 0;
  const switchProps = (value: boolean) => ({
    trackColor: { false: colors.border, true: colors.primary },
    thumbColor: Platform.OS === "android" ? (value ? colors.primaryForeground : colors.surface) : undefined,
  });

  return (
    <ThemeSwitchingArea style={[styles.root, { direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader title={t("settingsTitle")} />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <Card onPress={() => router.push("/profile" as any)} accessibilityLabel={`${user?.name ?? ""} — ${t("editProfile")}`}>
          <View style={styles.profileRow}>
            <Avatar name={user?.name ?? "?"} uri={resolveAvatarUrl(user?.avatar, fileTicket)} size={52} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={[TYPE.subtitle, { color: colors.foreground }]} numberOfLines={1}>
                {user?.name}
              </Text>
              <StatusBadge label={roleLabel} tone="primary" icon="user" />
              {user?.syndicate ? (
                <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
                  {user.syndicate}
                </Text>
              ) : null}
            </View>
            <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.textMuted} />
          </View>
        </Card>

        {/* Appearance: explicit choice light / dark / system */}
        <View style={styles.group}>
          <SectionHeader title={t("appearanceSection")} />
          <Card padding="md" style={{ gap: 12 }}>
            <Text style={[TYPE.label, { color: colors.textSecondary }]}>{t("uiTheme")}</Text>
            <ThemeSwitcher testID="settings-theme" />
          </Card>
        </View>

        {/* Notifications */}
        <View style={styles.group}>
          <SectionHeader title={t("notificationsSection")} actionLabel={t("seeAll")} onAction={() => router.push("/notifications" as any)} />
          <Card padding="none">
            {notificationPreferencesLoading && notificationPreferences.length === 0 ? (
              <View style={styles.syncRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("settingsNotificationsLoading")}</Text>
              </View>
            ) : notificationPreferencesLoadError && notificationPreferences.length === 0 ? (
              <ListItem icon="alert-circle" iconTone="danger" title={t("settingsNotificationsUnavailable")} trailing={<Button label={t("settingsNotificationsRetry")} size="sm" variant="ghost" onPress={refreshNotificationPreferences} />} divider />
            ) : null}
            {pushAction !== "none" ? (
              <ListItem
                icon="bell-off"
                iconTone="danger"
                title={t("permPushOffTitle")}
                subtitle={t(pushAction === "ask" ? "permPushOffAsk" : "permPushOffSettings")}
                chevron
                divider
                onPress={handlePushPermission}
              />
            ) : null}
            {(
              [
                ["push", "smartphone", t("pushNotifications"), t("pushNotificationsSub")],
                ["email", "mail", t("emailNotifications"), t("emailNotificationsSub")],
                ["inApp", "bell", t("inAppNotifications"), t("inAppNotificationsSub")],
              ] as const
            ).map(([channel, icon, label, sub], i) => (
              <ListItem
                key={channel}
                icon={icon}
                title={label}
                subtitle={sub}
                divider={i < 2}
                trailing={
                  <Switch
                    value={channelValue(channel)}
                    disabled={notifDisabled}
                    onValueChange={(v) => handleNotificationToggle(channel, v)}
                    accessibilityLabel={label}
                    {...switchProps(channelValue(channel))}
                  />
                }
              />
            ))}
          </Card>
        </View>

        {/* Presentation, replayed on request */}
        <View style={styles.group}>
          <Card padding="none">
            <ListItem icon="play-circle" title={t("flReplay")} subtitle={t("flReplaySub")} chevron onPress={() => router.push("/intro")} />
          </Card>
        </View>

        {/* Language */}
        <View style={styles.group}>
          <SectionHeader title={t("languageSection")} />
          <Card padding="none">
            {LANG_OPTIONS.map((option, i) => (
              <ListItem
                key={option.code}
                leading={
                  <View style={[styles.flag, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={{ fontSize: 18, color: colors.foreground }}>{option.flag}</Text>
                  </View>
                }
                title={option.nativeLabel}
                subtitle={option.rtl ? t("rtlLabel") : undefined}
                onPress={() => {
                  setLang(option.code);
                  Haptics.selectionAsync().catch(() => {});
                }}
                divider={i < LANG_OPTIONS.length - 1}
                trailing={lang === option.code ? <Feather name="check-circle" size={20} color={colors.primary} accessibilityLabel={t("enabled")} /> : undefined}
              />
            ))}
          </Card>
        </View>

        {/* Security & data */}
        <View style={styles.group}>
          <SectionHeader title={t("securitySection")} />
          <Card padding="none">
            <ListItem icon="key" title={t("changePassword")} subtitle={t("viaProfilePage")} onPress={() => router.push("/profile" as any)} chevron divider />
            <ListItem icon="download" title={t("exportMyData")} subtitle={t("exportMyDataSub")} onPress={exportMyData} chevron divider />
            {(
              [
                ["cpu", t("biometricAuth")],
                ["shield", t("twoFactorAuth")],
                ["lock", t("autoLockLabel")],
              ] as const
            ).map(([icon, label], i) => (
              <ListItem
                key={label}
                icon={icon}
                iconTone="neutral"
                title={label}
                subtitle={t("uiUnavailableFeature")}
                onPress={showUnavailableSecurity}
                divider={i < 2}
                trailing={<StatusBadge label={t("disabled")} tone="neutral" icon={null} />}
              />
            ))}
          </Card>
        </View>

        {/* About: real version and server reachability */}
        <View style={styles.group}>
          <SectionHeader title={t("aboutSection")} />
          <Card padding="none">
            <ListItem icon="info" title={t("appVersion")} trailing={<Text style={[TYPE.bodyStrong, { color: colors.textSecondary }]}>{Constants.expoConfig?.version ?? "—"}</Text>} divider />
            <ListItem
              icon="server"
              iconTone={server === "ok" ? "success" : server === "down" ? "danger" : "neutral"}
              title={t("serverStatus")}
              trailing={
                <StatusBadge
                  label={server === "ok" ? t("uiReachable") : server === "down" ? t("uiUnreachable") : t("uiChecking")}
                  tone={server === "ok" ? "success" : server === "down" ? "danger" : "neutral"}
                />
              }
            />
          </Card>
        </View>

        <Button label={t("logout")} icon="log-out" variant="secondary" fullWidth onPress={handleLogout} style={{ borderColor: colors.danger + "55" }} />
        <Button label={t("delTitle")} icon="trash-2" variant="ghost" fullWidth onPress={() => router.push("/delete-account" as any)} />
      </ScrollView>
    </ThemeSwitchingArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  group: { gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  flag: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
