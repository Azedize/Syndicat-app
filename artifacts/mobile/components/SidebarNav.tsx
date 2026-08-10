import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, usePathname } from "expo-router";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import {
  SIDEBAR_COMPACT,
  SIDEBAR_FULL,
  useBreakpoints,
} from "@/hooks/useBreakpoints";
import MizanLogo from "@/components/brand/MizanLogo";
import { RADIUS, SPACING } from "@/constants/spacing";

interface NavItem {
  labelKey: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  match?: string[];
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  memberVisible?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    labelKey: "dashboard",
    icon: "home",
    route: "/(tabs)/",
    match: ["/", "/(tabs)/", "/(tabs)"],
  },
  {
    labelKey: "members",
    icon: "users",
    route: "/(tabs)/members",
    match: ["/members", "/(tabs)/members", "/member-detail"],
    adminOnly: true,
  },
  {
    labelKey: "finance",
    icon: "bar-chart-2",
    route: "/(tabs)/finance",
    match: ["/finance", "/(tabs)/finance"],
    adminOnly: true,
  },
  {
    labelKey: "marketplace",
    icon: "shopping-bag",
    route: "/(tabs)/marketplace",
    match: ["/marketplace", "/(tabs)/marketplace"],
  },
  {
    labelKey: "more",
    icon: "grid",
    route: "/(tabs)/more",
    match: ["/more", "/(tabs)/more"],
  },
];

const QUICK_LINKS: NavItem[] = [
  { labelKey: "alerts", icon: "bell", route: "/alerts", match: ["/alerts"] },
  {
    labelKey: "chat",
    icon: "message-circle",
    route: "/chat",
    match: ["/chat", "/chat-thread"],
  },
  {
    labelKey: "elections",
    icon: "check-square",
    route: "/elections",
    match: ["/elections"],
  },
  {
    labelKey: "meetings",
    icon: "calendar",
    route: "/meetings",
    match: ["/meetings"],
  },
  {
    labelKey: "navNegotiations",
    icon: "message-square",
    route: "/negociations",
    match: ["/negociations"],
    adminOnly: true,
  },
  {
    labelKey: "pv",
    icon: "file-text",
    route: "/pv",
    match: ["/pv"],
    adminOnly: true,
  },
  {
    labelKey: "navHumanResources",
    icon: "briefcase",
    route: "/ressources-humaines",
    match: ["/ressources-humaines"],
    adminOnly: true,
  },
  {
    labelKey: "navNationalBoard",
    icon: "globe",
    route: "/tableau-national",
    match: ["/tableau-national"],
    superAdminOnly: true,
  },
  {
    labelKey: "searchTitle",
    icon: "search",
    route: "/search",
    match: ["/search"],
  },
];

export function SidebarNav() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isDesktop, isTablet } = useBreakpoints();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t, isRTL } = useLanguage();

  if (!user) return null;

  const isAdmin =
    user.role === "super_admin" || user.role === "syndicate_admin";
  const sidebarWidth = isDesktop ? SIDEBAR_FULL : SIDEBAR_COMPACT;
  const showLabels = isDesktop;
  const topPad = Platform.OS === "web" ? 16 : insets.top + 16;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const visibleQuickLinks = QUICK_LINKS.filter((item) => {
    if (item.superAdminOnly) return user.role === "super_admin";
    if (item.adminOnly) return isAdmin;
    return true;
  });

  const isActive = (item: NavItem): boolean => {
    if (!pathname) return false;
    const matches = item.match ?? [item.route];
    for (const m of matches) {
      if (m === "/" || m === "/(tabs)/" || m === "/(tabs)") {
        if (
          pathname === "/" ||
          pathname === "/(tabs)/" ||
          pathname === "/(tabs)"
        )
          return true;
      } else if (pathname.startsWith(m)) {
        return true;
      }
    }
    return false;
  };

  const navigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.navigate(route as any);
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace("/login" as any);
  };

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel =
    user.role === "super_admin"
      ? t("profileRoleSuperAdmin")
      : user.role === "syndicate_admin"
        ? t("profileRoleSyndicateAdmin")
        : user.role === "president"
          ? t("profileRolePresident")
          : user.role === "treasurer"
            ? t("profileRoleTreasurer")
            : user.role === "secretary"
              ? t("profileRoleSecretary")
              : user.role === "committee_member"
                ? t("profileRoleCommittee")
                : user.role === "tenant"
                  ? t("profileRoleTenant")
                  : t("profileRoleMember");

  return (
    <View
      style={[
        styles.sidebar,
        {
          width: sidebarWidth,
          backgroundColor: colors.card,
          borderRightWidth: isRTL ? 0 : 1,
          borderLeftWidth: isRTL ? 1 : 0,
          borderRightColor: colors.border,
          borderLeftColor: colors.border,
          paddingTop: topPad,
          direction: isRTL ? "rtl" : "ltr",
        },
      ]}
    >
      {/* Brand */}
      <View
        style={[
          styles.brand,
          {
            borderBottomColor: colors.border,
            justifyContent: showLabels ? "flex-start" : "center",
          },
        ]}
      >
        {showLabels ? (
          <MizanLogo
            variant="horizontal"
            colorScheme={isDark ? "dark" : "light"}
            size={40}
            showTagline={false}
          />
        ) : (
          <MizanLogo
            variant="icon"
            colorScheme={isDark ? "dark" : "light"}
            size={32}
          />
        )}
      </View>

      {/* Search button */}
      <TouchableOpacity
        style={[
          styles.searchBtn,
          {
            backgroundColor: colors.secondary,
            marginHorizontal: showLabels ? 12 : 8,
            marginBottom: 4,
            justifyContent: showLabels ? "flex-start" : "center",
            paddingHorizontal: showLabels ? 14 : 0,
          },
        ]}
        onPress={() => navigate("/search")}
        activeOpacity={0.75}
      >
        <Feather name="search" size={15} color={colors.primary} />
        {showLabels && (
          <Text style={[styles.searchText, { color: colors.primary }]}>
            {t("searchPlaceholder")}
          </Text>
        )}
      </TouchableOpacity>

      {/* Main nav */}
      <View style={styles.navSection}>
        {showLabels && (
          <Text
            style={[styles.navSectionLabel, { color: colors.mutedForeground }]}
          >
            {t("navPrimary")}
          </Text>
        )}
        {visibleItems.map((item) => {
          const active = isActive(item);
          return (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.navItem,
                {
                  backgroundColor: active
                    ? colors.primary + "15"
                    : "transparent",
                  marginHorizontal: showLabels ? 8 : 6,
                  justifyContent: showLabels ? "flex-start" : "center",
                  paddingHorizontal: showLabels ? 12 : 0,
                },
              ]}
              onPress={() => navigate(item.route)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.navIconWrap,
                  {
                    backgroundColor: active
                      ? colors.primary + "20"
                      : "transparent",
                  },
                ]}
              >
                <Feather
                  name={item.icon}
                  size={18}
                  color={active ? colors.primary : colors.mutedForeground}
                />
              </View>
              {showLabels && (
                <Text
                  style={[
                    styles.navLabel,
                    { color: active ? colors.primary : colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {item.labelKey === "members" && user.role === "super_admin"
                    ? t("navSyndicates")
                    : t(item.labelKey)}
                </Text>
              )}
              {active && (
                <View
                  style={[
                    styles.activeBar,
                    {
                      backgroundColor: colors.primary,
                      left: isRTL ? 0 : undefined,
                      right: isRTL ? undefined : 0,
                    },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Quick links */}
      <View style={[styles.navSection, { marginTop: 8 }]}>
        {showLabels && (
          <Text
            style={[styles.navSectionLabel, { color: colors.mutedForeground }]}
          >
            {t("navQuickAccess")}
          </Text>
        )}
        {visibleQuickLinks.map((item) => {
          const active = isActive(item);
          return (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.navItem,
                {
                  backgroundColor: active
                    ? colors.primary + "12"
                    : "transparent",
                  marginHorizontal: showLabels ? 8 : 6,
                  justifyContent: showLabels ? "flex-start" : "center",
                  paddingHorizontal: showLabels ? 12 : 0,
                },
              ]}
              onPress={() => navigate(item.route)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.navIconWrap,
                  {
                    backgroundColor: active
                      ? colors.primary + "15"
                      : "transparent",
                  },
                ]}
              >
                <Feather
                  name={item.icon}
                  size={16}
                  color={active ? colors.primary : colors.mutedForeground}
                />
              </View>
              {showLabels && (
                <Text
                  style={[
                    styles.navLabelSmall,
                    { color: active ? colors.primary : colors.mutedForeground },
                  ]}
                  numberOfLines={1}
                >
                  {t(item.labelKey)}
                </Text>
              )}
              {active && (
                <View
                  style={[
                    styles.activeBar,
                    {
                      backgroundColor: colors.primary,
                      left: isRTL ? 0 : undefined,
                      right: isRTL ? undefined : 0,
                    },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* User section */}
      <TouchableOpacity
        style={[
          styles.userSection,
          {
            justifyContent: showLabels ? "flex-start" : "center",
            borderTopColor: colors.border,
          },
        ]}
        onPress={() => navigate("/profile")}
        activeOpacity={0.75}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        {showLabels && (
          <View style={styles.userInfo}>
            <Text
              style={[styles.userName, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {user.name}
            </Text>
            <Text
              style={[styles.userRole, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {roleLabel}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity
        style={[
          styles.logoutBtn,
          {
            borderTopColor: colors.border,
            justifyContent: showLabels ? "flex-start" : "center",
            paddingHorizontal: showLabels ? 16 : 0,
            marginBottom: insets.bottom > 0 ? insets.bottom : 8,
          },
        ]}
        onPress={handleLogout}
        activeOpacity={0.75}
      >
        <Feather name="log-out" size={16} color={colors.destructive} />
        {showLabels && (
          <Text style={[styles.logoutText, { color: colors.destructive }]}>
            {t("logout")}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    height: "100%" as any,
    borderRightWidth: 1,
    borderLeftWidth: 1,
    flexDirection: "column",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  logoBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.SM,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  brandName: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  searchBtn: {
    height: 36,
    borderRadius: RADIUS.SM,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  searchText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  navSection: {
    gap: 2,
  },
  navSectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginLeft: 20,
    marginBottom: 4,
    marginTop: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.SM,
    height: 42,
    borderRadius: RADIUS.MD,
    overflow: "hidden",
    position: "relative",
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.SM,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  navLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  navLabelSmall: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  activeBar: {
    position: "absolute",
    width: 3,
    height: 20,
    borderRadius: 2,
  },
  divider: { height: 1, marginHorizontal: 12, marginBottom: 6 },
  userSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  userRole: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  logoutText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
