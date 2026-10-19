import React from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { RADIUS, SPACING } from "@/constants/spacing";
import { useColors } from "@/hooks/useColors";
import { crossPlatformShadow } from "@/lib/shadow";

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** none: list containers (rows bring their own padding) */
  padding?: "none" | "sm" | "md" | "lg";
  /** flat: border only; raised: a soft shadow for the one card that leads a screen */
  elevation?: "flat" | "raised";
  style?: StyleProp<ViewStyle>;
}

const PAD = { none: 0, sm: SPACING.MD, md: SPACING.LG, lg: SPACING.XL } as const;

/** Surface container. Cards are not nested: inside a card, use rows and dividers. */
export default function Card({ children, onPress, accessibilityLabel, padding = "md", elevation = "flat", style }: CardProps) {
  const colors = useColors();
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: colors.card, borderColor: colors.border, padding: PAD[padding] },
    elevation === "raised" && crossPlatformShadow({ color: colors.shadow, offsetY: 6, opacity: 0.07, radius: 16, elevation: 3 }),
  ];
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && { backgroundColor: colors.surfaceMuted }, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.LG, borderWidth: 1, overflow: "hidden" },
});
