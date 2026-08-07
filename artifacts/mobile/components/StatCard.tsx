import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  iconColor?: string;
  trend?: string;
  trendUp?: boolean;
  subtitle?: string;
}

export default function StatCard({
  label,
  value,
  icon,
  iconColor,
  trend,
  trendUp,
  subtitle,
}: StatCardProps) {
  const colors = useColors();

  const ic = iconColor ?? colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: ic + "18" }]}>
        <Feather name={icon} size={20} color={ic} />
      </View>
      {/* Value: auto-shrinks font to prevent overflow on small screens */}
      <Text
        style={[styles.value, { color: colors.foreground }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {value}
      </Text>
      <Text
        style={[styles.label, { color: colors.mutedForeground }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.subtitle, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      ) : null}
      {trend ? (
        <View style={styles.trendRow}>
          <Feather
            name={trendUp ? "trending-up" : "trending-down"}
            size={11}
            color={trendUp ? colors.success : colors.destructive}
          />
          <Text
            style={[
              styles.trend,
              { color: trendUp ? colors.success : colors.destructive },
            ]}
            numberOfLines={1}
          >
            {trend}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 22,
    padding: 15,
    borderWidth: 1,
    gap: 6,
    minHeight: 136,
    justifyContent: "space-between",
    // Prevent the card itself from growing unboundedly and squeezing siblings
    minWidth: 0,
    overflow: "hidden",
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  value: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    // Overflow guard: never force the value wider than the card
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    minWidth: 0,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    minWidth: 0,
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  trend: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
    minWidth: 0,
  },
});
