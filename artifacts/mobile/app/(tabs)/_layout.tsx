import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo } from "react";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { SPRING } from "@/constants/motion";
import { FONT } from "@/constants/typography";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/hooks/usePermission";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { crossPlatformShadow } from "@/lib/shadow";

const ICON_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  index: "home",
  members: "users",
  finance: "dollar-sign",
  marketplace: "shopping-bag",
  more: "menu",
};

function NotifBadge() {
  const { user } = useAuth();
  const colors = useColors();
  const role = user?.role ?? "member";
  const isAdmin = role === "super_admin" || role === "syndicate_admin";
  const { alerts, elections, supportTickets } = useData();

  const count = useMemo(() => {
    const unread = alerts.filter((a) => !a.read).length;
    const openElec = elections.filter((e) => e.status === "open").length;
    const tickets = isAdmin
      ? supportTickets.filter(
          (t) => t.status === "open" || t.status === "in_progress"
        ).length
      : 0;
    return unread + openElec + tickets;
  }, [alerts, elections, supportTickets, isAdmin]);

  if (count === 0) return null;

  return (
    <View style={[bs.dot, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
      <Text style={bs.dotText} allowFontScaling={false}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

const bs = StyleSheet.create({
  dot: {
    position: "absolute",
    top: -6,
    end: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  dotText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    includeFontPadding: false,
  },
});

/**
 * Floating dock: a rounded bar lifted above the home indicator. The active
 * destination gets a soft pill behind its icon, a bolder label and a small
 * gold pivot (the MIZAN balance mark) — never color alone.
 */
// expo-router 58: the tab bar receives `emitter` and `navigateToTab` (no `navigation`).
function CustomTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const colors = useColors();
  const { isWide } = useBreakpoints();
  const { isDark } = useTheme();
  const isIOS = Platform.OS === "ios";

  if (isWide) return null;

  const visibleRoutes = state.routes.filter((route: any) => {
    const opts = descriptors[route.key]?.options ?? {};
    const s = opts.tabBarItemStyle as any;
    return s?.display !== "none";
  });

  const bottom = Math.max(insets?.bottom ?? 0, 10);

  return (
    <View pointerEvents="box-none" style={[ts.wrap, { bottom }]}>
      <View
        style={[
          ts.shadow,
          crossPlatformShadow({ color: colors.shadow, offsetY: 8, opacity: isDark ? 0.4 : 0.12, radius: 20, elevation: 10 }),
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={ts.clip}>
          {isIOS ? (
            <>
              <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: 0.82 }]} />
            </>
          ) : null}
          <View style={ts.inner} accessibilityRole="tablist">
            {visibleRoutes.map((route: any) => {
              const routeIndex = state.routes.findIndex(
                (r: any) => r.key === route.key
              );
              const focused = state.index === routeIndex;
              const label =
                (descriptors[route.key]?.options?.title as string) ?? route.name;
              const iconName = ICON_MAP[route.name] ?? "circle";

              return (
                <Pressable
                  key={route.key}
                  onPress={() => {
                    const event = emitter.emit({
                      type: "tabPress",
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
                      navigateToTab(route.key);
                    }
                  }}
                  onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
                  style={ts.item}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: focused }}
                >
                  <TabPill focused={focused} color={colors.primarySoft}>
                    <View>
                      <Feather
                        name={iconName}
                        size={21}
                        color={focused ? colors.primary : colors.textMuted}
                      />
                      {route.name === "more" && <NotifBadge />}
                    </View>
                  </TabPill>
                  <Text
                    style={[
                      ts.label,
                      {
                        color: focused ? colors.foreground : colors.textMuted,
                        fontFamily: focused ? FONT.semibold : FONT.medium,
                      },
                    ]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                  >
                    {label}
                  </Text>
                  <View style={[ts.pivot, { backgroundColor: focused ? colors.gold : "transparent" }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

/** Active-tab pill: opens with the house spring (reduced motion: instant). */
function TabPill({ focused, color, children }: { focused: boolean; color: string; children: React.ReactNode }) {
  const p = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(focused ? 1 : 0, SPRING.glide);
  }, [focused, p]);
  const pill = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scaleX: interpolate(p.value, [0, 1], [0.55, 1]) }],
  }));
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(p.value, [0, 1], [0, -1]) }] }));
  return (
    <View style={ts.pill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: 16 }, pill]} />
      <Animated.View style={icon}>{children}</Animated.View>
    </View>
  );
}

const ts = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  shadow: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clip: {
    borderRadius: 24,
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    minHeight: 52,
  },
  pill: {
    width: 52,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    paddingHorizontal: 2,
  },
  pivot: {
    width: 4,
    height: 4,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }],
  },
});

export default function TabLayout() {
  const { isSuperAdmin, isSyndicateAdmin, isTreasurer, isPresident, isAdmin, role } = useRole();
  const { t } = useLanguage();
  const hiddenTabStyle = { display: "none" as const };

  // Finance tab: Syndicate Admin has full access; Treasurer manages finances.
  // President gets read-only budget access via this tab.
  // Secretary/CommitteeMember/Member access finance via the More menu.
  const showFinanceTab = isSyndicateAdmin || isTreasurer || isPresident;

  // Members tab: Super Admin (platform list of syndicates) + Syndicate Admin (members list).
  // President/Secretary/CommitteeMember access member info via governance screens.
  const showMembersTab = isAdmin;

  // Members are buyers in the marketplace — they need to browse and purchase.
  // Tenants can also browse and purchase from the marketplace.
  // Syndicate Admin manages the marketplace (seller).
  const showMarketplaceTab = isSyndicateAdmin || role === "member" || role === "tenant";

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {/* Dashboard — all roles */}
      <Tabs.Screen name="index" options={{ title: t("tabHome") }} />

      {/* Members / Syndicats — super_admin sees platform list; syndicate_admin sees members */}
      <Tabs.Screen
        name="members"
        options={{
          title: isSuperAdmin ? t("syndicates") : t("members"),
          tabBarItemStyle: showMembersTab ? undefined : hiddenTabStyle,
        }}
      />

      {/* Finance — Syndicate Admin (full) + Treasurer (financial management only).
          Super Admin uses Tableau National. President/Secretary/Member access
          relevant finance items via More menu. */}
      <Tabs.Screen
        name="finance"
        options={{
          title: t("finance"),
          tabBarItemStyle: showFinanceTab ? undefined : hiddenTabStyle,
        }}
      />

      {/* Marketplace — Syndicate Admin only. */}
      <Tabs.Screen
        name="marketplace"
        options={{
          title: t("marketplace"),
          tabBarItemStyle: showMarketplaceTab ? undefined : hiddenTabStyle,
        }}
      />

      {/* More — all roles (content gated per role inside the screen) */}
      <Tabs.Screen name="more" options={{ title: t("more") }} />
    </Tabs>
  );
}
