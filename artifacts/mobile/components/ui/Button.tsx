import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { CONTROL, RADIUS, SPACING } from "@/constants/spacing";
import { FONT } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Feather.glyphMap;
  /** Icon after the label (e.g. a directional arrow — pass the RTL-aware name). */
  trailingIcon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { sm: CONTROL.SM, md: CONTROL.MD, lg: CONTROL.LG };
const FONT_SIZE: Record<ButtonSize, number> = { sm: 13, md: 14, lg: 15 };

/**
 * The one button of the app. Primary = the single main action of a screen;
 * secondary = alternative actions; ghost = low-emphasis / inline; destructive
 * = irreversible actions (always behind a confirmation).
 */
export default function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const colors = useColors();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary, pressed: colors.primaryStrong },
    secondary: { bg: colors.surface, fg: colors.foreground, border: colors.borderStrong, pressed: colors.surfaceMuted },
    ghost: { bg: "transparent", fg: colors.tint, border: "transparent", pressed: colors.primarySoft },
    destructive: { bg: colors.destructive, fg: colors.destructiveForeground, border: colors.destructive, pressed: colors.destructive },
  }[variant];

  const fg = inactive && variant !== "ghost" ? colors.disabledForeground : palette.fg;

  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        if (haptic && Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={size === "sm" ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: size === "sm" ? SPACING.MD : SPACING.LG + 4,
          backgroundColor: inactive && variant !== "ghost" ? colors.disabled : pressed ? palette.pressed : palette.bg,
          borderColor: inactive && variant !== "ghost" ? colors.disabled : palette.border,
          opacity: inactive && variant === "ghost" ? 0.5 : 1,
          alignSelf: fullWidth ? "stretch" : "auto",
          transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : icon ? (
          <Feather name={icon} size={size === "sm" ? 15 : 18} color={fg} />
        ) : null}
        <Text style={[styles.label, { color: fg, fontSize: FONT_SIZE[size] }]} numberOfLines={1}>
          {label}
        </Text>
        {trailingIcon && !loading ? <Feather name={trailingIcon} size={size === "sm" ? 15 : 18} color={fg} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.SM },
  label: { fontFamily: FONT.semibold, flexShrink: 1 },
});
