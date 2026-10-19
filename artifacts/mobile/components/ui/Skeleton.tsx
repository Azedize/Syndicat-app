import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { RADIUS } from "@/constants/spacing";
import { useColors } from "@/hooks/useColors";

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Placeholder block while content loads (static when "reduce motion" is on). */
export default function Skeleton({ width = "100%", height = 14, radius = RADIUS.SM, style }: SkeletonProps) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0.55, duration: 800, useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);
  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceMuted, opacity: pulse }, style]}
    />
  );
}
