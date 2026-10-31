import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { FONT } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { type ThemeMode, useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";

const OPTIONS: { mode: ThemeMode; icon: keyof typeof Feather.glyphMap; labelKey: string }[] = [
  { mode: "light", icon: "sun", labelKey: "uiThemeLight" },
  { mode: "dark", icon: "moon", labelKey: "uiThemeDark" },
  { mode: "system", icon: "smartphone", labelKey: "uiThemeSystem" },
];

const tap = () => {
  if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
};

/**
 * Light / dark / system, as a segmented control whose indicator slides to
 * the chosen mode. The change applies at once on every screen (theme tokens),
 * and is saved. Accessible as a radio group; no slide when the user asked the
 * system to reduce motion.
 */
export default function ThemeSwitcher({ testID = "theme-switcher" }: { testID?: string }) {
  const { mode, setMode } = useTheme();
  const { t } = useLanguage();
  const colors = useColors();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = OPTIONS.findIndex((o) => o.mode === mode);
  const x = useSharedValue(0);
  const segment = width > 0 ? (width - 8) / OPTIONS.length : 0;

  useEffect(() => {
    const to = index * segment;
    x.value = reduce ? to : withSpring(to, { damping: 20, stiffness: 220, mass: 0.6 });
  }, [index, segment, reduce, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("uiTheme")}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { width: segment, backgroundColor: colors.card, shadowColor: colors.shadow }, indicator]}
        />
      ) : null}
      {OPTIONS.map((o) => {
        const on = o.mode === mode;
        return (
          <Pressable
            key={o.mode}
            testID={`${testID}-${o.mode}`}
            onPress={() => {
              if (on) return;
              tap();
              setMode(o.mode);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={t(o.labelKey)}
            style={styles.option}
          >
            <Feather name={o.icon} size={15} color={on ? colors.tint : colors.textMuted} />
            <Text style={[styles.label, { color: on ? colors.foreground : colors.textMuted }]} numberOfLines={1}>
              {t(o.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Compact light/dark switch for headers: the icon turns as the theme changes.
 * A long press goes back to following the system.
 */
export function ThemeToggleButton({ onDark = false, testID = "theme-toggle" }: { onDark?: boolean; testID?: string }) {
  const { isDark, setMode } = useTheme();
  const { t } = useLanguage();
  const colors = useColors();
  const reduce = useReducedMotion();
  const turn = useSharedValue(isDark ? 1 : 0);
  useEffect(() => {
    turn.value = reduce ? (isDark ? 1 : 0) : withTiming(isDark ? 1 : 0, { duration: 320 });
  }, [isDark, reduce, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  const fg = onDark ? "#FFFFFF" : colors.foreground;
  return (
    <Pressable
      testID={testID}
      onPress={() => { tap(); setMode(isDark ? "light" : "dark"); }}
      onLongPress={() => { tap(); setMode("system"); }}
      accessibilityRole="button"
      accessibilityLabel={isDark ? t("lightMode") : t("darkMode")}
      accessibilityHint={t("uiThemeSystem")}
      hitSlop={6}
      style={({ pressed }) => [
        styles.toggle,
        onDark
          ? { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)" }
          : { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Animated.View style={spin}>
        <Feather name={isDark ? "sun" : "moon"} size={17} color={fg} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 4, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, position: "relative" },
  indicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    start: 4,
    borderRadius: 10,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  option: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6 },
  label: { fontFamily: FONT.semibold, fontSize: 13 },
  toggle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
});
