import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useToast } from "@/context/ToastContext";
import { ticketedUrl } from "@/services/api";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();
  const { isDark, toggle: toggleTheme, mode, setMode } = useTheme();
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

  const initials =
    user?.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "";
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
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={22}
            color={colors.foreground}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {t("settingsTitle")}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 20,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/profile" as any)}
          activeOpacity={0.85}
        >
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitials}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <Text style={styles.profileRole}>{roleLabel}</Text>
            {user?.syndicate ? (
              <Text style={styles.profileSyndicate}>{user.syndicate}</Text>
            ) : null}
          </View>
          <View style={styles.profileChevron}>
            <Feather name="edit-2" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.profileChevronText}>{t("editProfile")}</Text>
          </View>
        </TouchableOpacity>

        {/* Appearance */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
            {t("appearanceSection")}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {/* Dark mode toggle */}
            <View style={styles.navRow}>
              <View
                style={[
                  styles.rowIcon,
                  {
                    backgroundColor: isDark
                      ? "#f59e0b18"
                      : colors.primary + "18",
                  },
                ]}
              >
                <Feather
                  name={isDark ? "moon" : "sun"}
                  size={16}
                  color={isDark ? "#f59e0b" : colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.navLabel, { color: colors.foreground }]}>
                  {t("darkModeLabel")}
                </Text>
                <Text
                  style={[styles.navSub, { color: colors.mutedForeground }]}
                >
                  {mode === "system"
                    ? t("systemAuto")
                    : isDark
                      ? t("enabled")
                      : t("disabled")}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={() => {
                  toggleTheme();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{
                  false: colors.muted,
                  true: colors.primary + "80",
                }}
                thumbColor={isDark ? colors.primary : colors.mutedForeground}
              />
            </View>
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            {/* System theme option */}
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => {
                setMode("system");
                Haptics.selectionAsync();
              }}
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: colors.primary + "18" },
                ]}
              >
                <Feather name="monitor" size={16} color={colors.primary} />
              </View>
              <Text
                style={[styles.navLabel, { color: colors.foreground, flex: 1 }]}
              >
                {t("followSystemTheme")}
              </Text>
              {mode === "system" ? (
                <Feather name="check" size={18} color={colors.primary} />
              ) : null}
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
            {t("notificationsSection")}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {notificationPreferencesLoading &&
            notificationPreferences.length === 0 ? (
              <View style={styles.syncRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text
                  style={[styles.navSub, { color: colors.mutedForeground }]}
                >
                  {t("settingsNotificationsLoading")}
                </Text>
              </View>
            ) : notificationPreferencesLoadError &&
              notificationPreferences.length === 0 ? (
              <TouchableOpacity
                style={styles.syncRow}
                onPress={refreshNotificationPreferences}
              >
                <Feather
                  name="refresh-cw"
                  size={15}
                  color={colors.destructive}
                />
                <Text
                  style={[
                    styles.navSub,
                    { color: colors.destructive, flex: 1 },
                  ]}
                >
                  {t("settingsNotificationsUnavailable")}
                </Text>
                <Text style={[styles.retryText, { color: colors.primary }]}>
                  {t("settingsNotificationsRetry")}
                </Text>
              </TouchableOpacity>
            ) : null}
            <SettingRow
              icon="bell"
              label={t("pushNotifications")}
              sub={t("pushNotificationsSub")}
              value={channelValue("push")}
              onToggle={(value) => handleNotificationToggle("push", value)}
              colors={colors}
              disabled={
                notificationPreferencesLoading ||
                notificationPreferences.length === 0
              }
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <SettingRow
              icon="mail"
              label={t("emailNotifications")}
              sub={t("emailNotificationsSub")}
              value={channelValue("email")}
              onToggle={(value) => handleNotificationToggle("email", value)}
              colors={colors}
              disabled={
                notificationPreferencesLoading ||
                notificationPreferences.length === 0
              }
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <SettingRow
              icon="bell"
              label={t("inAppNotifications")}
              sub={t("inAppNotificationsSub")}
              value={channelValue("inApp")}
              onToggle={(value) => handleNotificationToggle("inApp", value)}
              colors={colors}
              disabled={
                notificationPreferencesLoading ||
                notificationPreferences.length === 0
              }
            />
          </View>
        </View>

        {/* Language */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
            {t("languageSection")}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {LANG_OPTIONS.map((option, i) => (
              <View key={option.code}>
                {i > 0 ? (
                  <View
                    style={[styles.sep, { backgroundColor: colors.border }]}
                  />
                ) : null}
                <TouchableOpacity
                  style={styles.langRow}
                  onPress={() => {
                    setLang(option.code);
                    Haptics.selectionAsync();
                  }}
                >
                  <View
                    style={[
                      styles.rowIcon,
                      { backgroundColor: colors.primary + "18" },
                    ]}
                  >
                    <Text style={{ fontSize: 16 }}>{option.flag}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.navLabel, { color: colors.foreground }]}
                    >
                      {option.nativeLabel}
                    </Text>
                    {option.rtl && (
                      <Text
                        style={[
                          styles.navSub,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {t("rtlLabel")}
                      </Text>
                    )}
                  </View>
                  {lang === option.code ? (
                    <Feather name="check" size={18} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Security */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
            {t("securitySection")}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <SettingRow
              icon="cpu"
              label={t("biometricAuth")}
              sub={t("securityFeatureUnavailableSub")}
              value={false}
              onToggle={showUnavailableSecurity}
              colors={colors}
              disabled
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <SettingRow
              icon="shield"
              label={t("twoFactorAuth")}
              sub={t("securityFeatureUnavailableSub")}
              value={false}
              onToggle={showUnavailableSecurity}
              colors={colors}
              disabled
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <SettingRow
              icon="lock"
              label={t("autoLockLabel")}
              sub={t("securityFeatureUnavailableSub")}
              value={false}
              onToggle={showUnavailableSecurity}
              colors={colors}
              disabled
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.navRow}
              onPress={() => router.push("/profile" as any)}
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: colors.primary + "18" },
                ]}
              >
                <Feather name="key" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.navLabel, { color: colors.foreground }]}>
                  {t("changePassword")}
                </Text>
                <Text
                  style={[styles.navSub, { color: colors.mutedForeground }]}
                >
                  {t("viaProfilePage")}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.navRow}
              onPress={exportMyData}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: colors.primary + "18" },
                ]}
              >
                <Feather name="download" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.navLabel, { color: colors.foreground }]}>
                  {t("exportMyData")}
                </Text>
                <Text
                  style={[styles.navSub, { color: colors.mutedForeground }]}
                >
                  {t("exportMyDataSub")}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>
            {t("aboutSection")}
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {[
              {
                icon: "info" as const,
                label: t("appVersion"),
                value: t("appVersionValue"),
              },
              {
                icon: "server" as const,
                label: t("serverStatus"),
                value: t("operational"),
              },
            ].map((item, i) => (
              <View key={item.label}>
                {i > 0 ? (
                  <View
                    style={[styles.sep, { backgroundColor: colors.border }]}
                  />
                ) : null}
                <View style={styles.navRow}>
                  <View
                    style={[
                      styles.rowIcon,
                      { backgroundColor: colors.primary + "18" },
                    ]}
                  >
                    <Feather
                      name={item.icon}
                      size={16}
                      color={colors.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.navLabel,
                      { color: colors.foreground, flex: 1 },
                    ]}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={[styles.navValue, { color: colors.mutedForeground }]}
                  >
                    {item.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.destructive + "50" }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>
            {t("logout")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  sub,
  value,
  onToggle,
  colors,
  disabled = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sub?: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  colors: any;
  disabled?: boolean;
}) {
  return (
    <View style={styles.navRow}>
      <View
        style={[styles.rowIcon, { backgroundColor: colors.primary + "18" }]}
      >
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.navLabel, { color: colors.foreground }]}>
          {label}
        </Text>
        {sub ? (
          <Text style={[styles.navSub, { color: colors.mutedForeground }]}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: colors.muted, true: colors.primary + "80" }}
        thumbColor={value ? colors.primary : colors.mutedForeground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  profileCard: {
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitials: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  profileName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  profileRole: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  profileSyndicate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    marginTop: 1,
  },
  profileChevron: { alignItems: "center", gap: 4 },
  profileChevronText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.8)",
  },
  group: { gap: 8 },
  groupTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginStart: 4,
  },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  navRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  navSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 9, padding: 14 },
  retryText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  navValue: { fontSize: 12, fontFamily: "Inter_400Regular" },
  langRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  sep: { height: 1, marginHorizontal: 14 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  logoutText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
