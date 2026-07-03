import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface StatItem {
  label: string;
  value: string | number;
  color?: string;
}

interface Props {
  stats: StatItem[];
}

export default function StatsStrip({ stats }: Props) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderBottomColor: colors.border },
      ]}
    >
      {stats.map((s, i) => (
        <View
          key={s.label}
          style={[
            styles.cell,
            i < stats.length - 1 && {
              borderRightWidth: StyleSheet.hairlineWidth,
              borderRightColor: colors.border,
            },
          ]}
        >
          <Text
            style={[styles.val, { color: s.color ?? colors.foreground }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {s.value}
          </Text>
          <Text
            style={[styles.lab, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  val: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    minWidth: 24,
    textAlign: "center",
  },
  lab: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    textAlign: "center",
  },
});
