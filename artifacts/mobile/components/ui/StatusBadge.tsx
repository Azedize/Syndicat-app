import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { RADIUS, SPACING } from "@/constants/spacing";
import { FONT } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";
import { TONE_ICON, toneColors, type StatusTone } from "./tone";

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  /** Overrides the tone's default icon. `null` hides it (only when the label alone is explicit). */
  icon?: keyof typeof Feather.glyphMap | null;
  size?: "sm" | "md";
}

/** Status pill: icon + label on a soft tone (never color alone). */
export default function StatusBadge({ label, tone = "neutral", icon, size = "sm" }: StatusBadgeProps) {
  const colors = useColors();
  const c = toneColors(colors, tone);
  const glyph = icon === null ? null : (icon ?? TONE_ICON[tone]);
  return (
    <View
      style={[styles.badge, size === "md" && styles.md, { backgroundColor: c.bg }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {glyph ? <Feather name={glyph} size={size === "md" ? 14 : 12} color={c.fg} /> : null}
      <Text style={[styles.label, size === "md" && styles.labelMd, { color: c.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: SPACING.SM,
    paddingVertical: 3,
    borderRadius: RADIUS.FULL,
    maxWidth: "100%",
  },
  md: { paddingHorizontal: 10, paddingVertical: 5 },
  label: { fontFamily: FONT.semibold, fontSize: 11, lineHeight: 15, flexShrink: 1 },
  labelMd: { fontSize: 12, lineHeight: 16 },
});
