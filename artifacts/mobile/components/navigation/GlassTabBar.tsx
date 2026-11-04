import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { DURATION, SPRING } from "@/constants/motion";
import { FONT } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";

const ICON_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  index: "home",
  members: "users",
  finance: "dollar-sign",
  marketplace: "shopping-bag",
  more: "menu",
};

const BAR_PADDING = 4;
const INDICATOR_WIDTH = 56;
const INDICATOR_HEIGHT = 34;

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
      ? supportTickets.filter((t) => t.status === "open" || t.status === "in_progress").length
      : 0;
    return unread + openElec + tickets;
  }, [alerts, elections, supportTickets, isAdmin]);

  if (count === 0) return null;

  return (
    <View style={[styles.badge, { backgroundColor: colors.destructive, borderColor: colors.surface }]}>
      <Text style={styles.badgeText} allowFontScaling={false}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

/** The glowing pill: it slides from tab to tab. Reduced motion: the springs are instant. */
function ActiveIndicator({ position, itemWidth }: { position: number; itemWidth: number }) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  // `start` follows the language's direction, set on the root view; a transform does not, so it changes sign.
  const direction = isRTL ? -1 : 1;
  const offset = useSharedValue(position * itemWidth * direction);

  useEffect(() => {
    offset.value = withSpring(position * itemWidth * direction, SPRING.glide);
  }, [position, itemWidth, direction, offset]);

  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const width = Math.min(INDICATOR_WIDTH, itemWidth - 6);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.indicator,
        {
          start: BAR_PADDING + (itemWidth - width) / 2,
          width,
          backgroundColor: colors.tabIndicator,
          borderColor: colors.tabIndicatorBorder,
          boxShadow: `0 0 14px ${colors.tabGlow}`,
        },
        animated,
      ]}
    />
  );
}

interface TabItemProps {
  routeName: string;
  label: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function TabItem({ routeName, label, focused, onPress, onLongPress }: TabItemProps) {
  const colors = useColors();
  const iconName = ICON_MAP[routeName] ?? "circle";
  const active = useSharedValue(focused ? 1 : 0);
  const pressed = useSharedValue(0);

  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, SPRING.glide);
  }, [focused, active]);

  const content = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.92]) }],
  }));
  const icon = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(active.value, [0, 1], [0, -1]) },
      { scale: interpolate(active.value, [0, 1], [1, 1.08]) },
    ],
  }));
  const activeIcon = useAnimatedStyle(() => ({ opacity: active.value }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        pressed.value = withSpring(1, SPRING.press);
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, SPRING.press);
      }}
      style={styles.item}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      <Animated.View style={[styles.itemContent, content]}>
        <Animated.View style={[styles.iconBox, icon]}>
          <Feather name={iconName} size={21} color={colors.textMuted} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.iconCentered, activeIcon]}>
            <Feather name={iconName} size={21} color={colors.tabActive} />
          </Animated.View>
          {routeName === "more" && <NotifBadge />}
        </Animated.View>
        <Text
          style={[
            styles.label,
            {
              color: focused ? colors.tabActive : colors.textMuted,
              fontFamily: focused ? FONT.semibold : FONT.medium,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Floating glass dock. iOS blurs what scrolls behind it; on Android a real blur would require
 * wrapping every screen in a BlurTargetView, so the glass is a denser translucent fill there.
 */
// expo-router 58: the tab bar receives `emitter` and `navigateToTab` (no `navigation`).
export function GlassTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const colors = useColors();
  const { isDark } = useTheme();
  const [barWidth, setBarWidth] = useState(0);
  const isIOS = Platform.OS === "ios";

  const visibleRoutes = state.routes.filter((route: any) => {
    const style = descriptors[route.key]?.options?.tabBarItemStyle as any;
    return style?.display !== "none";
  });
  const focusedKey = state.routes[state.index]?.key;
  const position = visibleRoutes.findIndex((route: any) => route.key === focusedKey);
  const itemWidth = visibleRoutes.length ? (barWidth - BAR_PADDING * 2) / visibleRoutes.length : 0;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets?.bottom ?? 0, 10) }]}>
      <Animated.View
        entering={FadeInDown.duration(DURATION.base)}
        style={[styles.dock, { borderColor: colors.glassBorder, boxShadow: `0 8px 24px ${colors.glassShadow}` }]}
      >
        <View style={styles.clip} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
          {isIOS ? <BlurView intensity={70} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isIOS ? colors.glassFill : colors.glassFillDense }]} />
          <View style={[styles.highlight, { backgroundColor: colors.glassHighlight }]} />
          {position >= 0 && itemWidth > 0 ? <ActiveIndicator position={position} itemWidth={itemWidth} /> : null}
          <View style={styles.row} accessibilityRole="tablist">
            {visibleRoutes.map((route: any) => {
              const focused = route.key === focusedKey;
              return (
                <TabItem
                  key={route.key}
                  routeName={route.name}
                  label={(descriptors[route.key]?.options?.title as string) ?? route.name}
                  focused={focused}
                  onPress={() => {
                    const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                      Haptics.selectionAsync().catch(() => {});
                      navigateToTab(route.key);
                    }
                  }}
                  onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
                />
              );
            })}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12 },
  dock: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth },
  clip: { borderRadius: 24, overflow: "hidden" },
  highlight: { position: "absolute", top: 0, start: 20, end: 20, height: StyleSheet.hairlineWidth },
  indicator: {
    position: "absolute",
    top: 7,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: "row", paddingTop: 8, paddingBottom: 6, paddingHorizontal: BAR_PADDING },
  item: { flex: 1, minHeight: 56 },
  itemContent: { flex: 1, alignItems: "center", gap: 5 },
  iconBox: { height: 32, minWidth: 32, alignItems: "center", justifyContent: "center" },
  iconCentered: { alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, lineHeight: 14, paddingHorizontal: 2 },
  badge: {
    position: "absolute",
    top: -2,
    end: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", includeFontPadding: false },
});
