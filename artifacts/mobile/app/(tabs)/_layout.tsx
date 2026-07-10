import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";

import { useAuth } from "@/context/AuthContext";
import { useRole } from "@/hooks/usePermission";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

const ICON_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  index: "home",
  members: "users",
  finance: "dollar-sign",
  marketplace: "shopping-bag",
  more: "menu",
};

function NotifBadge() {
  const { user } = useAuth();
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
    <View style={bs.dot}>
      <Text style={bs.dotText}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

const bs = StyleSheet.create({
  dot: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#ef4444",
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

function CustomTabBar({ state, descriptors, navigation, insets }: any) {
  const colors = useColors();
  const { isWide } = useBreakpoints();
  const isIOS = Platform.OS === "ios";
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  if (isWide) return null;

  const visibleRoutes = state.routes.filter((route: any) => {
    const opts = descriptors[route.key]?.options ?? {};
    const s = opts.tabBarItemStyle as any;
    return s?.display !== "none";
  });

  const pb = Math.max(insets?.bottom ?? 0, 10);

  return (
    <View style={[ts.bar, { borderTopColor: colors.border }]}>
      {isIOS ? (
        <BlurView
          intensity={90}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]}
        />
      )}

      <View style={[ts.inner, { paddingBottom: pb }]}>
        {visibleRoutes.map((route: any) => {
          const routeIndex = state.routes.findIndex(
            (r: any) => r.key === route.key
          );
          const focused = state.index === routeIndex;
          const label =
            (descriptors[route.key]?.options?.title as string) ?? route.name;
          const iconName = ICON_MAP[route.name] ?? "circle";
          const primary = "#7c3aed";

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              style={ts.item}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
            >
              <View
                style={[
                  ts.pill,
                  focused && { backgroundColor: primary + "1e" },
                ]}
              >
                <View style={{ position: "relative" }}>
                  <Feather
                    name={iconName}
                    size={22}
                    color={focused ? primary : colors.mutedForeground}
                  />
                  {route.name === "more" && <NotifBadge />}
                </View>
              </View>
              <Text
                style={[
                  ts.label,
                  {
                    color: focused ? primary : colors.mutedForeground,
                    fontFamily: focused
                      ? "Inter_600SemiBold"
                      : "Inter_400Regular",
                  },
                ]}
              >
                {label}
              </Text>
              {focused && (
                <View style={[ts.activeDot, { backgroundColor: primary }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const ts = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    paddingTop: 6,
    alignItems: "flex-start",
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingTop: 2,
  },
  pill: {
    width: 56,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 9.5,
    letterSpacing: 0.1,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
});

export default function TabLayout() {
  const { isSuperAdmin, isSyndicateAdmin, isAdmin, isTenant, role } = useRole();
  const hiddenTabStyle = { display: "none" as const };

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {/* Dashboard — all roles */}
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />

      {/* Members / Syndicats — admin only.
          Super Admin sees "Syndicats" (platform list).
          Syndic Admin sees "Membres" (their syndicate's members). */}
      <Tabs.Screen
        name="members"
        options={{
          title: isSuperAdmin ? "Syndicats" : "Membres",
          tabBarItemStyle: isAdmin ? undefined : hiddenTabStyle,
        }}
      />

      {/* Finance — admin only.
          Super Admin sees platform revenue / global stats.
          Syndic Admin sees their syndicate's financial overview. */}
      <Tabs.Screen
        name="finance"
        options={{
          title: "Finance",
          tabBarItemStyle: isAdmin ? undefined : hiddenTabStyle,
        }}
      />

      {/* Marketplace — visible to super_admin, syndicate_admin, member.
          Tenant is blocked: cannot browse or purchase. */}
      <Tabs.Screen
        name="marketplace"
        options={{
          title: "Marketplace",
          tabBarItemStyle: isTenant ? hiddenTabStyle : undefined,
        }}
      />

      {/* More — all roles (content gated per role inside the screen) */}
      <Tabs.Screen name="more" options={{ title: "Plus" }} />
    </Tabs>
  );
}
