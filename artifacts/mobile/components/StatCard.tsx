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
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
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
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 6,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  value: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
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
  },
});
