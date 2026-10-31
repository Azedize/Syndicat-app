import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyState from "@/components/EmptyState";
import { Avatar, Button, Card, ListItem, StatusBadge, toneColors, type StatusTone } from "@/components/ui";
import { RADIUS, SPACING } from "@/constants/spacing";
import { FONT, TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

import { MENU_SECTIONS_DEF, type AllRoles } from "@/constants/menu";
import { ThemeToggleButton } from "@/components/theme/ThemeSwitcher";

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { alerts, elections, supportTickets, members, cart, conversations } = useData();
  const { isWide } = useBreakpoints();
  const { t, isRTL } = useLanguage();
  const [query, setQuery] = useState("");
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const role = user?.role ?? "member";
  const unreadAlerts = alerts.filter((a) => !a.read).length;
  const openElections = elections.filter((e) => e.status === "open").length;
  const openTickets = supportTickets.filter((tk) => tk.status === "open").length;
  const activeOwners = members.filter((m) => m.status === "active").length;
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const unreadMessages = conversations.reduce((s, c) => s + c.unread, 0);

  const handleNav = (route: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    router.push(route as any);
  };

  const handleLogout = () => {
    const doLogout = async () => {
      await logout();
      router.replace("/login");
    };
    if (Platform.OS === "web") return void doLogout();
    Alert.alert(t("uiLogoutTitle"), t("uiLogoutMessage"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("logoutLabel"), style: "destructive", onPress: () => void doLogout() },
    ]);
  };

  // Build translated sections from definitions (role filtering unchanged),
  // then narrow them with the search query.
  const needle = query.trim().toLocaleLowerCase();
  const visibleSections = MENU_SECTIONS_DEF.map((section) => ({
    title: t(section.titleKey),
    titleKey: section.titleKey,
    items: section.items
      .filter((item) => item.roles.includes(role as any))
      .map((item) => ({ ...item, label: t(item.labelKey) }))
      .filter((item) => !needle || item.label.toLocaleLowerCase().includes(needle) || t(section.titleKey).toLocaleLowerCase().includes(needle)),
  })).filter((s) => s.items.length > 0);

  // Badges reflect the destination's own data only.
  const getBadge = (route: string): number | undefined => {
    if (route === "/notifications" && unreadAlerts > 0) return unreadAlerts;
    if (route === "/cart" && cartCount > 0) return cartCount;
    if (route === "/elections" && openElections > 0) return openElections;
    if (route === "/chat" && unreadMessages > 0) return unreadMessages;
    if ((route === "/support" || route === "/platform-support") && openTickets > 0 && (role === "syndicate_admin" || role === "super_admin")) {
      return route === (role === "super_admin" ? "/platform-support" : "/support") ? openTickets : undefined;
    }
    return undefined;
  };

  const roleLabel =
    role === "super_admin"      ? t("superAdministrateur") :
    role === "syndicate_admin"  ? t("gestionnairesSyndic") :
    role === "president"        ? t("rolePresident") :
    role === "treasurer"        ? t("roleTresorier") :
    role === "secretary"        ? t("roleSecrétaire") :
    role === "committee_member" ? t("roleMembreConseil") :
    role === "tenant"           ? t("roleTenant") :
                                  t("copropriétaire");

  const roleIcon: keyof typeof Feather.glyphMap =
    role === "super_admin"      ? "shield" :
    role === "syndicate_admin"  ? "briefcase" :
    role === "president"        ? "award" :
    role === "treasurer"        ? "bar-chart-2" :
    role === "secretary"        ? "file-text" :
    role === "committee_member" ? "users" :
    role === "tenant"           ? "key" : "home";

  const isSyndicateTeam = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member"].includes(role);

  // Stats strip items — scoped by role, each one a link to its source.
  const statsItems: { icon: keyof typeof Feather.glyphMap; label: string; value: number; tone: StatusTone; route: string; show: boolean }[] =
    role === "tenant"
      ? [
          { icon: "bell", label: t("alerts"), value: unreadAlerts, tone: "danger", route: "/notifications", show: true },
          { icon: "headphones", label: t("demandesIntervention"), value: openTickets, tone: "info", route: "/support", show: true },
          { icon: "message-circle", label: t("chat"), value: unreadMessages, tone: "primary", route: "/chat", show: true },
        ]
      : role === "member"
        ? [
            { icon: "bell", label: t("alerts"), value: unreadAlerts, tone: "danger", route: "/notifications", show: true },
            { icon: "check-square", label: t("votes"), value: openElections, tone: "warning", route: "/elections", show: true },
            { icon: "shopping-cart", label: t("panierLabel"), value: cartCount, tone: "primary", route: "/cart", show: false },
          ]
        : isSyndicateTeam
          ? [
              { icon: "bell", label: t("alerts"), value: unreadAlerts, tone: "danger", route: "/notifications", show: true },
              { icon: "check-square", label: t("votes"), value: openElections, tone: "warning", route: "/elections", show: role !== "treasurer" },
              { icon: "headphones", label: t("demandesIntervention"), value: openTickets, tone: "info", route: "/support", show: role === "syndicate_admin" || role === "president" },
              { icon: "users", label: t("owners"), value: activeOwners, tone: "primary", route: "/members", show: role === "syndicate_admin" },
            ]
          : /* super_admin */
            [
              { icon: "bell", label: t("alerts"), value: unreadAlerts, tone: "danger", route: "/notifications", show: true },
              { icon: "headphones", label: t("support"), value: openTickets, tone: "info", route: "/platform-support", show: true },
            ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[TYPE.title, { color: colors.foreground }]} accessibilityRole="header">
            {t("menuLabel")}
          </Text>
          <ThemeToggleButton testID="menu-theme-toggle" />
        </View>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("uiSearchModules")}
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("uiSearchModules")}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("uiClearSearch")}>
              <Feather name="x-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: isWide ? 24 : 16, paddingTop: 4, gap: SPACING.XL, paddingBottom: isWide ? 32 : insets.bottom + 104 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!needle ? (
          <>
            {/* Profile */}
            <Card onPress={() => handleNav("/profile")} accessibilityLabel={`${user?.name ?? ""}, ${roleLabel} — ${t("uiOpenProfile")}`} padding="md">
              <View style={styles.userRow}>
                <Avatar name={user?.name ?? "?"} size={52} />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={[TYPE.subtitle, { color: colors.foreground }]} numberOfLines={1}>
                    {user?.name}
                  </Text>
                  <Text style={[TYPE.secondary, { color: colors.textMuted }]} numberOfLines={1}>
                    {user?.email}
                  </Text>
                  <StatusBadge label={roleLabel} tone="primary" icon={roleIcon} />
                </View>
                <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.textMuted} />
              </View>
            </Card>

            {/* Live counters, each one opens its module */}
            <View style={styles.statsStrip}>
              {statsItems.filter((s) => s.show).map((s) => {
                const tc = toneColors(colors, s.tone);
                return (
                  <Pressable
                    key={s.route + s.label}
                    onPress={() => handleNav(s.route)}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.label}: ${s.value}`}
                    style={({ pressed }) => [styles.statCell, { backgroundColor: pressed ? colors.surfaceMuted : colors.card, borderColor: colors.border }]}
                  >
                    <View style={[styles.statIcon, { backgroundColor: tc.bg }]}>
                      <Feather name={s.icon} size={15} color={tc.fg} />
                    </View>
                    <Text style={[TYPE.amount, { color: colors.foreground }]}>{s.value}</Text>
                    <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "center" }]} numberOfLines={2}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Sections */}
        {visibleSections.length === 0 ? (
          <EmptyState icon="search" title={t("uiNoModule")} />
        ) : (
          <View style={isWide ? styles.sectionsGrid : styles.sections}>
            {visibleSections.map((section) => (
              <View key={section.titleKey} style={[styles.section, isWide && styles.sectionDesktop]}>
                <Text style={[TYPE.overline, styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
                  {section.title.toLocaleUpperCase()}
                </Text>
                <Card padding="none">
                  {section.items.map((item, i) => {
                    const badge = getBadge(item.route);
                    return (
                      <ListItem
                        key={item.labelKey}
                        icon={item.icon}
                        iconTone={toneOfHex(item.color)}
                        title={item.label}
                        onPress={() => handleNav(item.route)}
                        chevron
                        divider={i < section.items.length - 1}
                        trailing={
                          badge != null ? (
                            <View style={[styles.menuBadge, { backgroundColor: colors.danger }]} accessibilityLabel={String(badge)}>
                              <Text style={styles.menuBadgeText} allowFontScaling={false}>
                                {badge > 99 ? "99+" : badge}
                              </Text>
                            </View>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </Card>
              </View>
            ))}
          </View>
        )}

        {!needle ? (
          <>
            {/* App info */}
            <Card padding="none">
              <View style={[styles.infoRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("uiApplication")}</Text>
                <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>MIZAN</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("uiVersion")}</Text>
                <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{Constants.expoConfig?.version ?? "—"}</Text>
              </View>
            </Card>

            <Button label={t("logoutLabel")} icon="log-out" variant="secondary" onPress={handleLogout} fullWidth style={{ borderColor: colors.danger + "55" }} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The menu definitions keep their historical hex colors; they map to semantic tones. */
function toneOfHex(value: string): StatusTone {
  const v = value.toLowerCase();
  if (["10b981", "0f766e", "06b6d4"].some((h) => v.includes(h))) return "success";
  if (["f59e0b", "f97316"].some((h) => v.includes(h))) return "warning";
  if (["ef4444", "ec4899"].some((h) => v.includes(h))) return "danger";
  if (["8b5cf6", "a78bfa", "7c3aed"].some((h) => v.includes(h))) return "info";
  if (v.includes("6b7280")) return "neutral";
  return "primary";
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderRadius: RADIUS.MD, borderWidth: 1, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: FONT.regular, fontSize: 15, paddingVertical: 10 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  statsStrip: { flexDirection: "row", gap: 10 },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 6, gap: 4, borderRadius: RADIUS.LG, borderWidth: 1, minHeight: 96 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sections: { gap: SPACING.XL },
  sectionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  section: { gap: 8 },
  sectionDesktop: { flex: 1, minWidth: 280 },
  sectionTitle: { paddingHorizontal: 4 },
  menuBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  menuBadgeText: { fontSize: 11, fontFamily: FONT.bold, color: "#fff" },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16 },
});
