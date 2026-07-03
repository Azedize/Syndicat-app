import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "info" | "muted";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export default function Badge({ label, variant = "default" }: BadgeProps) {
  const colors = useColors();

  const getColors = () => {
    switch (variant) {
      case "success":
        return { bg: colors.success + "18", text: colors.success };
      case "warning":
        return { bg: colors.warning + "18", text: colors.warning };
      case "destructive":
        return { bg: colors.destructive + "18", text: colors.destructive };
      case "info":
        return { bg: colors.info + "18", text: colors.info };
      case "muted":
        return { bg: colors.muted, text: colors.mutedForeground };
      default:
        return { bg: colors.secondary, text: colors.secondaryForeground };
    }
  };

  const { bg, text } = getColors();

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
