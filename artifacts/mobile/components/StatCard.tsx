import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { RADIUS, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { toneColors, type StatusTone } from "@/components/ui/tone";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  /** Semantic tone of the icon (preferred over iconColor). */
  tone?: StatusTone;
  /** Legacy: explicit icon color. */
  iconColor?: string;
  trend?: string;
  trendUp?: boolean;
  subtitle?: string;
  /** Makes the whole card a link (e.g. to the detailed screen). */
  onPress?: () => void;
}

/** One figure with its label. The value comes from real data only. */
export default function StatCard({ label, value, icon, tone, iconColor, trend, trendUp, subtitle, onPress }: StatCardProps) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const t = toneColors(colors, tone ?? "primary");
  const ic = iconColor ?? t.fg;
  const icBg = iconColor ? iconColor + "1A" : t.bg;

  const body = (
    <>
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: icBg }]}>
          <Feather name={icon} size={18} color={ic} />
        </View>
        {onPress ? <Feather name={isRTL ? "arrow-up-left" : "arrow-up-right"} size={16} color={colors.textMuted} /> : null}
      </View>
      {/* Value: auto-shrinks to stay on one line on small screens */}
      <Text style={[TYPE.amountLarge, styles.value, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      <View style={styles.bottom}>
        <Text style={[TYPE.label, { color: colors.textSecondary, fontFamily: TYPE.caption.fontFamily }]} numberOfLines={2}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {trend ? (
          <View style={styles.trendRow}>
            <Feather name={trendUp ? "trending-up" : "trending-down"} size={12} color={trendUp ? colors.success : colors.danger} />
            <Text style={[TYPE.caption, { color: trendUp ? colors.successText : colors.dangerText, flexShrink: 1 }]} numberOfLines={1}>
              {trend}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  if (!onPress) {
    return (
      <View style={cardStyle} accessible accessibilityLabel={`${label}: ${value}${subtitle ? `, ${subtitle}` : ""}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${subtitle ? `, ${subtitle}` : ""}`}
      style={({ pressed }) => [cardStyle, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: RADIUS.LG,
    padding: SPACING.LG,
    borderWidth: 1,
    gap: SPACING.SM,
    minHeight: 128,
    justifyContent: "space-between",
    minWidth: 0,
    overflow: "hidden",
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconWrap: { width: 36, height: 36, borderRadius: RADIUS.MD, alignItems: "center", justifyContent: "center" },
  value: { minWidth: 0, marginTop: 2 },
  bottom: { gap: 2, minWidth: 0 },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
});
