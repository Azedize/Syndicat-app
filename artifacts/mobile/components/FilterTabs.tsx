/**
 * FilterTabs — full-width segmented tab bar with a fixed height (44 px).
 *
 * Unlike FilterChips (scrollable, pill-shaped), FilterTabs:
 *   - fills the entire container width using flex: 1 per tab
 *   - never changes width when labels or counts change
 *   - shows an animated bottom-border active indicator
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
  const underlineAnim = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(underlineAnim, {
      toValue: active ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [active]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      {/* Label row — fixed single line, never wraps */}
      <View style={styles.labelRow}>
        <Text
          style={[
            styles.label,
            { color: active ? accentColor : colors.mutedForeground },
          ]}
          numberOfLines={1}
        >
          {opt.label}
        </Text>
        {opt.count !== undefined && opt.count > 0 ? (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: active
                  ? accentColor
                  : colors.mutedForeground + "33",
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: active ? "#fff" : colors.mutedForeground },
              ]}
            >
              {opt.count > 99 ? "99+" : opt.count}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Animated bottom indicator */}
      <Animated.View
        style={[
          styles.indicator,
          {
            backgroundColor: accentColor,
            opacity: underlineAnim,
            transform: [
              {
                scaleX: underlineAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ],
          },
        ]}
      />
    </TouchableOpacity>
  );
}

export default function FilterTabs({
  options,
  value,
  onChange,
  accentColor = "#2563EB",
}: Props) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {options.map((opt) => (
        <Tab
          key={opt.key}
          opt={opt}
          active={value === opt.key}
          accentColor={accentColor}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(opt.key);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    height: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    position: "relative",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 1,
  },
});
