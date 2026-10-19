/**
 * FilterTabs — full-width segmented control (44 px track).
 *
 * Unlike FilterChips (scrollable, pill-shaped), FilterTabs:
 *   - fills the entire container width using flex: 1 per tab
 *   - never changes width when labels or counts change
 *   - shows the active tab as a raised segment on a muted track
 *
 * Usage:
 *   const TABS = [
 *     { key: "all",     label: "Tous" },
 *     { key: "pending", label: "En attente", count: 3 },
 *   ];
 *   <FilterTabs options={TABS} value={tab} onChange={setTab} />
 */

import * as Haptics from "expo-haptics";
import React, { useRef, useEffect } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { RADIUS, SPACING, TYPOGRAPHY } from "@/constants/spacing";
import { FONT } from "@/constants/typography";

export interface TabOption {
  key: string;
  label: string;
  /** Optional badge count shown next to the label */
  count?: number;
}

interface Props {
  options: TabOption[];
  value: string;
  onChange: (key: string) => void;
  accentColor?: string;
}

function Tab({
  opt,
  active,
  accentColor,
  onPress,
}: {
  opt: TabOption;
  active: boolean;
  accentColor: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: active ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [active]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={opt.count ? `${opt.label} (${opt.count})` : opt.label}
    >
      {/* Active segment: a raised surface that fades in under the label */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.segment,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
          },
        ]}
      />
      {/* Label row — fixed single line, never wraps */}
      <View style={styles.labelRow}>
        <Text
          style={[
            styles.label,
            {
              color: active ? colors.foreground : colors.textMuted,
              fontFamily: active ? FONT.semibold : FONT.medium,
            },
          ]}
          numberOfLines={1}
        >
          {opt.label}
        </Text>
        {opt.count !== undefined && opt.count > 0 ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: active ? accentColor : colors.border },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: active ? colors.primaryForeground : colors.textSecondary },
              ]}
              allowFontScaling={false}
            >
              {opt.count > 99 ? "99+" : opt.count}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function FilterTabs({
  options,
  value,
  onChange,
  accentColor,
}: Props) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const resolvedAccentColor = accentColor ?? colors.primary;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          direction: isRTL ? "rtl" : "ltr",
        },
      ]}
      accessibilityRole="tablist"
    >
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        {options.map((opt) => (
          <Tab
            key={opt.key}
            opt={opt}
            active={value === opt.key}
            accentColor={resolvedAccentColor}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(opt.key);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.LG,
    paddingVertical: SPACING.SM,
  },
  track: {
    flexDirection: "row",
    height: 44,
    borderRadius: RADIUS.MD,
    padding: 3,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  segment: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.SM + 1,
    borderWidth: StyleSheet.hairlineWidth,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.XS,
  },
  label: {
    fontSize: TYPOGRAPHY.MD,
    textAlign: "center",
    flexShrink: 1,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: RADIUS.FULL,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    textAlign: "center",
  },
});
