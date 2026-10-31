/**
 * StatisticsHeader — the MIZAN screen header with a strip of key counts.
 *
 * Usage:
 *   <StatisticsHeader
 *     title="Lots & Unités"
 *     subtitle="12 lots"
 *     stats={[
 *       { label: "Total", value: 12 },
 *       { label: "Occupés", value: 10, color: "#0B7A57" },
 *     ]}
 *     action={{ icon: "plus", onPress: handleAdd, label: "Ajouter" }}
 *   />
 *
 * `color` on a stat marks it with a small dot; values stay in the text color
 * so they remain readable in both themes.
 */
import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import ScreenHeader from "@/components/ScreenHeader";
import { StatItem } from "@/components/StatsStrip";
import { TYPE } from "@/constants/typography";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

interface ActionButton {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  /** @deprecated Headers share the MIZAN navy; kept for compatibility. */
  color?: string;
  onBack?: () => void;
  action?: ActionButton;
  action2?: ActionButton;
  rightContent?: React.ReactNode;
  /** Stats shown in the strip below the header. Pass [] to hide the strip. */
  stats?: StatItem[];
}

export default function StatisticsHeader({ title, subtitle, onBack, action, action2, rightContent, stats = [] }: Props) {
  const colors = useColors();
  const { width } = useBreakpoints();
  return (
    <View>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} action={action} action2={action2} rightContent={rightContent} />
      {stats.length > 0 ? (
        <View style={[styles.strip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {stats.map((s, i) => (
            <View
              key={s.label}
              accessible
              accessibilityLabel={`${s.label}: ${s.value}`}
              style={[
                styles.cell,
                width < 390 && styles.cellCompact,
                i < stats.length - 1 && { borderEndWidth: StyleSheet.hairlineWidth, borderEndColor: colors.border },
              ]}
            >
              <Text style={[TYPE.amount, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {s.value}
              </Text>
              <View style={styles.labelRow}>
                {s.color ? <View style={[styles.dot, { backgroundColor: s.color }]} /> : null}
                <Text style={[TYPE.caption, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>
                  {s.label}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 6, gap: 2, minWidth: 0 },
  cellCompact: { paddingHorizontal: 3 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: "100%" },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
