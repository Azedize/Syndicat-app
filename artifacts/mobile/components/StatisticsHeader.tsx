/**
 * StatisticsHeader — colored screen header + stats strip in one component.
 *
 * Replaces the repetitive pattern found across ~10 screens:
 *   <View style={header}> ... </View>
 *   <View style={statsStrip}> ... </View>
 *
 * The stats strip is rendered on a white/card background below the
 * colored header so it stands out visually.
 *
 * Usage:
 *   <StatisticsHeader
 *     title="Lots & Unités"
 *     subtitle="12 lots"
 *     color="#1E3A5F"
 *     stats={[
 *       { label: "Total", value: 12 },
 *       { label: "Occupés", value: 10, color: "#16a34a" },
 *       { label: "Vacants", value: 2, color: "#dc2626" },
 *     ]}
 *     action={{ icon: "plus", onPress: handleAdd }}
 *   />
 */

import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { StatItem } from "@/components/StatsStrip";
import { MIZAN } from "@/constants/brand";

interface ActionButton {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  color?: string;
  onBack?: () => void;
  action?: ActionButton;
  action2?: ActionButton;
  rightContent?: React.ReactNode;
  /** Stats shown in the strip below the header. Pass [] to hide the strip. */
  stats?: StatItem[];
}

export default function StatisticsHeader({
  title,
  subtitle,
  color = MIZAN.colors.blue,
  onBack,
  action,
  action2,
  rightContent,
  stats = [],
}: Props) {
  const insets = useSafeAreaInsets();
  const { isWide, width } = useBreakpoints();
  const colors = useColors();
  const goBack = useBackNavigation();

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  const handleBack = onBack ?? goBack;

  return (
    <View>
      {/* Colored header row */}
      <View
        style={[
          styles.header,
          width < 390 && styles.headerCompact,
          { backgroundColor: color, paddingTop: topPad + 14 },
        ]}
      >
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.titles}>
            <Text style={[styles.title, width < 390 && styles.titleCompact]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightContent ? (
          <View style={styles.rightSlot}>{rightContent}</View>
        ) : (
          <View style={styles.actions}>
            {action2 ? (
              <TouchableOpacity
                onPress={action2.onPress}
                style={[styles.actionBtn, width < 390 && styles.actionBtnCompact]}
                hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              >
                <Feather name={action2.icon} size={20} color="#fff" />
              </TouchableOpacity>
            ) : null}
            {action ? (
              <TouchableOpacity
                onPress={action.onPress}
                style={[styles.actionBtn, width < 390 && styles.actionBtnCompact]}
                hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              >
                <Feather name={action.icon} size={20} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      {/* Stats strip — only rendered when stats are provided */}
      {stats.length > 0 ? (
        <View
          style={[
            styles.strip,
            {
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}
        >
          {stats.map((s, i) => (
            <View
              key={s.label}
              style={[
                styles.cell,
                width < 390 && styles.cellCompact,
                i < stats.length - 1 && {
                  borderRightWidth: StyleSheet.hairlineWidth,
                  borderRightColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.val,
                  { color: s.color ?? colors.foreground },
                ]}
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    minHeight: 56,
  },
  headerCompact: {
    paddingHorizontal: 12,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  titleCompact: {
    fontSize: 18,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  rightSlot: {
    flexShrink: 0,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnCompact: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  // Stats strip
  strip: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  cellCompact: {
    paddingHorizontal: 2,
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
