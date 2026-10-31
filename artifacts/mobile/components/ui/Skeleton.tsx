import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { RADIUS, SPACING } from "@/constants/spacing";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Placeholder block while real content loads: a light band sweeps across it
 * (UI thread, Reanimated). Colours follow the theme; the sweep follows the
 * reading direction; it stays still when the system asks to reduce motion,
 * and stops as soon as the block unmounts (the data has arrived).
 */
export default function Skeleton({ width = "100%", height = 14, radius = RADIUS.SM, style }: SkeletonProps) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduce || w === 0) return;
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(t);
  }, [reduce, w, t]);

  const band = Math.max(60, w * 0.6);
  const sweep = useAnimatedStyle(() => {
    const x = -band + t.value * (w + band);
    return { transform: [{ translateX: isRTL ? -x : x }] };
  });

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.skeleton, overflow: "hidden" }, style]}
    >
      {!reduce && w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { width: band }, sweep]}>
          <LinearGradient
            colors={[colors.skeleton, colors.skeletonHighlight, colors.skeleton]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A card-shaped placeholder: optional media, title, two lines. */
export function SkeletonCard({ media = false, lines = 2, style }: { media?: boolean; lines?: number; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View style={[skel.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {media ? <Skeleton height={140} radius={RADIUS.MD} /> : null}
      <Skeleton width="62%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "45%" : "88%"} height={12} />
      ))}
    </View>
  );
}

/** A list of row placeholders (icon, two lines), as many as fit a screen. */
export function SkeletonList({ count = 6, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View
      style={[skel.list, { backgroundColor: colors.card, borderColor: colors.border }, style]}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[skel.row, i < count - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Skeleton width={40} height={40} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={i % 2 ? "70%" : "55%"} height={14} />
            <Skeleton width={i % 3 ? "40%" : "60%"} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Profile placeholder: avatar, name, a few info rows. */
export function SkeletonProfile({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ alignItems: "center", gap: SPACING.MD }, style]} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <Skeleton width={96} height={96} radius={48} />
      <Skeleton width={180} height={20} />
      <Skeleton width={110} height={14} />
      <SkeletonList count={4} style={{ alignSelf: "stretch", marginTop: SPACING.MD }} />
    </View>
  );
}

/** Product grid placeholder (photo, price, name), laid out like the real cards. */
export function SkeletonProductGrid({ count = 4, cardWidth, gap = SPACING.MD }: { count?: number; cardWidth: number; gap?: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap }} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[skel.product, { width: cardWidth, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Skeleton height={cardWidth} radius={0} />
          <View style={{ padding: 12, gap: 8 }}>
            <Skeleton width="55%" height={18} />
            <Skeleton width="85%" height={12} />
            <Skeleton width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skel = StyleSheet.create({
  card: { borderRadius: RADIUS.LG, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.LG, gap: 10 },
  list: { borderRadius: RADIUS.LG, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  product: { borderRadius: RADIUS.LG + 2, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
});
