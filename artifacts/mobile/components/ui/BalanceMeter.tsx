import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";
import { RADIUS, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";

interface BalanceMeterProps {
  /** Validated amount paid (from the API). */
  paid: number;
  /** Amount called (from the API). */
  total: number;
  paidLabel: string;
  remainingLabel: string;
  /** Already formatted (locale + currency) by the caller. */
  paidText: string;
  remainingText: string;
  /** The remaining part is past due. */
  overdue?: boolean;
  /** onDark: on the navy hero */
  variant?: "default" | "onDark";
}

/**
 * MIZAN signature visual — "le fléau": the beam of a scale. The settled part
 * fills from the start side; a gold pivot marks where the balance stands.
 * Amounts and labels are always written out, the bar only illustrates them.
 */
export default function BalanceMeter({ paid, total, paidLabel, remainingLabel, paidText, remainingText, overdue, variant = "default" }: BalanceMeterProps) {
  const colors = useColors();
  const ratio = total > 0 ? Math.min(1, Math.max(0, paid / total)) : 0;
  const fill = useRef(new Animated.Value(0)).current;
  const onDark = variant === "onDark";

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) fill.setValue(ratio);
        else Animated.timing(fill, { toValue: ratio, duration: 650, useNativeDriver: false }).start();
      });
    return () => {
      cancelled = true;
    };
  }, [ratio, fill]);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const remainingTone = overdue ? colors.danger : colors.warning;
  const track = onDark ? "rgba(255,255,255,0.16)" : colors.surfaceMuted;
  const textMain = onDark ? "#FFFFFF" : colors.foreground;
  const textSub = onDark ? "rgba(255,255,255,0.72)" : colors.textMuted;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${paidLabel} ${paidText}, ${remainingLabel} ${remainingText}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    >
      <View style={[styles.track, { backgroundColor: track }]}>
        <Animated.View style={[styles.fill, { width, backgroundColor: onDark ? colors.teal : colors.success }]} />
        <Animated.View style={[styles.pivotWrap, { start: width }]}>
          <View style={[styles.pivot, { backgroundColor: colors.gold, borderColor: onDark ? colors.navy : colors.card }]} />
        </Animated.View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={styles.legendHead}>
            <Feather name="check-circle" size={13} color={onDark ? colors.teal : colors.success} />
            <Text style={[TYPE.caption, { color: textSub }]} numberOfLines={1}>
              {paidLabel}
            </Text>
          </View>
          <Text style={[TYPE.amount, { color: textMain }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {paidText}
          </Text>
        </View>
        <View style={[styles.legendItem, styles.legendEnd]}>
          <View style={styles.legendHead}>
            <Feather name={overdue ? "alert-circle" : "clock"} size={13} color={remainingTone} />
            <Text style={[TYPE.caption, { color: textSub }]} numberOfLines={1}>
              {remainingLabel}
            </Text>
          </View>
          <Text style={[TYPE.amount, { color: textMain }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {remainingText}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.MD },
  track: { height: 10, borderRadius: RADIUS.FULL, overflow: "visible", justifyContent: "center" },
  fill: { position: "absolute", top: 0, bottom: 0, start: 0, borderRadius: RADIUS.FULL },
  pivotWrap: { position: "absolute", width: 0, alignItems: "center", justifyContent: "center", top: -3, bottom: -3 },
  pivot: { width: 14, height: 14, borderRadius: 3, borderWidth: 2, transform: [{ rotate: "45deg" }] },
  legend: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.LG },
  legendItem: { flex: 1, minWidth: 0, gap: 2 },
  legendEnd: { alignItems: "flex-end" },
  legendHead: { flexDirection: "row", alignItems: "center", gap: 5 },
});
