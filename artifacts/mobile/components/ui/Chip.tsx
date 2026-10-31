import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { CONTROL, RADIUS } from "@/constants/spacing";
import { FONT } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  trailingIcon?: keyof typeof Feather.glyphMap;
}

/** Selectable chip for filter / sort panels (selection shown by fill + check, not color alone). */
export default function Chip({ label, selected = false, onPress, icon, trailingIcon }: ChipProps) {
  const colors = useColors();
  const fg = selected ? colors.primaryForeground : colors.textSecondary;
  const glyph = icon ?? (selected ? "check" : undefined);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : pressed ? colors.surfaceMuted : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      {glyph ? <Feather name={glyph} size={13} color={fg} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {trailingIcon ? <Feather name={trailingIcon} size={13} color={fg} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: CONTROL.SM, paddingHorizontal: 12, borderRadius: RADIUS.FULL, borderWidth: 1 },
  label: { fontFamily: FONT.semibold, fontSize: 12.5 },
});
