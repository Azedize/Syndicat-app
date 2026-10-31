import React, { useEffect } from "react";
import { type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import Colors from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";

type Level = "background" | "surface" | "elevated" | "muted";

const KEY: Record<Level, "background" | "card" | "surfaceElevated" | "surfaceMuted"> = {
  background: "background",
  surface: "card",
  elevated: "surfaceElevated",
  muted: "surfaceMuted",
};

/**
 * A surface that takes the theme's colour for its level and crossfades when
 * the theme changes (no hard cut between light and dark). Screens already
 * read their colours from the theme tokens (useColors); use this for the
 * large areas where the switch should feel smooth: page backgrounds, sheets,
 * grouped sections. It is not meant to wrap every element.
 */
export default function ThemeSwitchingArea({
  level = "background",
  bordered = false,
  style,
  children,
  ...rest
}: ViewProps & { level?: Level; bordered?: boolean; style?: StyleProp<ViewStyle> }) {
  const { isDark } = useTheme();
  const reduce = useReducedMotion();
  const p = useSharedValue(isDark ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (isDark ? 1 : 0) : withTiming(isDark ? 1 : 0, { duration: 260 });
  }, [isDark, reduce, p]);

  const k = KEY[level];
  const light = Colors.light[k];
  const dark = Colors.dark[k];
  const lightBorder = Colors.light.border;
  const darkBorder = Colors.dark.border;
  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [light, dark]),
    ...(bordered ? { borderColor: interpolateColor(p.value, [0, 1], [lightBorder, darkBorder]) } : {}),
  }));

  return (
    <Animated.View {...rest} style={[bordered && { borderWidth: 1 }, style, animated]}>
      {children}
    </Animated.View>
  );
}
