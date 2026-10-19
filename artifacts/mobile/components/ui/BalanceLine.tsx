import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";

interface BalanceLineProps {
  /** onDark: on the navy hero */
  variant?: "default" | "onDark";
  style?: StyleProp<ViewStyle>;
}

/**
 * The "balance line" — MIZAN's brand mark reduced to a divider: a hairline
 * that fades in from both ends to a small gold pivot. Decorative only.
 */
export default function BalanceLine({ variant = "default", style }: BalanceLineProps) {
  const colors = useColors();
  const line = variant === "onDark" ? "rgba(255,255,255,0.35)" : colors.borderStrong;
  const clear = variant === "onDark" ? "rgba(255,255,255,0)" : colors.border + "00";
  return (
    <View style={[styles.wrap, style]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <LinearGradient colors={[clear, line]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.side} />
      <View style={[styles.pivot, { backgroundColor: colors.gold }]} />
      <LinearGradient colors={[line, clear]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", height: 8 },
  side: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  pivot: { width: 6, height: 6, transform: [{ rotate: "45deg" }], marginHorizontal: 6, borderRadius: 1 },
});
