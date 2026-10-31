import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { CONTROL, RADIUS } from "@/constants/spacing";
import { FONT } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";

interface IconButtonProps {
  icon: keyof typeof Feather.glyphMap;
  /** Required: an icon-only control must be named for screen readers. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** surface: on a page; ghost: inline; onDark: on the navy hero */
  variant?: "surface" | "ghost" | "onDark";
  /** Unread / pending count (real data only). */
  badge?: number;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Square 44 pt icon control with an optional count badge. */
export default function IconButton({ icon, accessibilityLabel, onPress, variant = "surface", badge, disabled, testID, style }: IconButtonProps) {
  const colors = useColors();
  const tone = {
    surface: { bg: colors.surface, pressed: colors.surfaceMuted, fg: colors.foreground, border: colors.border },
    ghost: { bg: "transparent", pressed: colors.surfaceMuted, fg: colors.mutedForeground, border: "transparent" },
    onDark: { bg: "rgba(255,255,255,0.10)", pressed: "rgba(255,255,255,0.20)", fg: "#FFFFFF", border: "rgba(255,255,255,0.14)" },
  }[variant];
  const count = badge && badge > 0 ? (badge > 99 ? "99+" : String(badge)) : null;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={count ? `${accessibilityLabel} (${count})` : accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: pressed ? tone.pressed : tone.bg, borderColor: tone.border, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <Feather name={icon} size={20} color={tone.fg} />
      {count ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: variant === "onDark" ? colors.navy : colors.surface }]}>
          <Text style={styles.badgeText} allowFontScaling={false}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: CONTROL.HIT,
    height: CONTROL.HIT,
    borderRadius: RADIUS.MD,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    end: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontFamily: FONT.bold, fontSize: 10, lineHeight: 12 },
});
