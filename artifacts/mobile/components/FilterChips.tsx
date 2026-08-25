import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { RADIUS } from "@/constants/spacing";

// Locking these two constants is what keeps every filter bar in the app
// pixel-identical: same chip height, same bar height, everywhere.
const CHIP_HEIGHT = 40;
const CHIP_GAP = 8;
const BAR_VERTICAL_PADDING = 8;

export interface FilterOption {
  key: string;
  label: string;
  count?: number;
  icon?: keyof typeof Feather.glyphMap;
  /** Per-option active color (e.g. status semantics: green/orange/red). Falls back to `accentColor`. */
  color?: string;
}

interface Props {
  options: FilterOption[];
  value: string;
  onChange: (key: string) => void;
  accentColor?: string;
  /**
   * "scroll" (default) — chips keep their natural (auto) width based on label
   * length, with uniform padding/gap, inside a horizontal ScrollView. Best
   * when there are many options or long labels.
   *
   * "equal" — chips share the row width equally (flex: 1, no scroll). Best
   * for a small, fixed set of short options that should always fit on
   * screen (e.g. 3-4 status tabs).
   */
  mode?: "scroll" | "equal";
  /** @deprecated use `mode="equal"` instead of `scrollable={false}`. */
  scrollable?: boolean;
}

function Chip({
  opt,
  active,
  accentColor,
  equal,
  onPress,
}: {
  opt: FilterOption;
  active: boolean;
  accentColor: string;
  equal: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const activeColor = opt.color ?? accentColor;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      style={[
        styles.chip,
        equal ? styles.chipEqual : styles.chipAuto,
        {
          backgroundColor: active ? activeColor : colors.secondary,
          borderColor: active ? activeColor : colors.border,
        },
      ]}
    >
      {opt.icon ? (
        <Feather
          name={opt.icon}
          size={13}
          color={
            active
              ? colors.primaryForeground
              : (opt.color ?? colors.mutedForeground)
          }
          style={styles.chipIcon}
        />
      ) : null}
      <Text
        style={[
          styles.chipText,
          { color: active ? colors.primaryForeground : colors.foreground },
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {opt.label}
      </Text>
      {opt.count !== undefined ? (
        <View
          style={[
            styles.countPill,
            {
              backgroundColor: active
                ? colors.primaryForeground + "38"
                : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.countText,
              {
                color: active
                  ? colors.primaryForeground
                  : colors.mutedForeground,
              },
            ]}
            numberOfLines={1}
          >
            {opt.count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function FilterChips({
  options,
  value,
  onChange,
  accentColor,
  mode,
  scrollable = true,
}: Props) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const resolvedAccentColor = accentColor ?? colors.primary;
  const resolvedMode: "scroll" | "equal" =
    mode ?? (scrollable ? "scroll" : "equal");

  const renderChip = (opt: FilterOption) => (
    <Chip
      key={opt.key}
      opt={opt}
      active={value === opt.key}
      accentColor={resolvedAccentColor}
      equal={resolvedMode === "equal"}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(opt.key);
      }}
    />
  );

  if (resolvedMode === "equal") {
    return (
      <View
        style={[
          styles.bar,
          styles.equalRow,
          width < 390 && styles.compactRow,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        {options.map(renderChip)}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.card, borderBottomColor: colors.border },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          width < 390 && styles.compactScrollContent,
        ]}
      >
        {options.map(renderChip)}
      </ScrollView>
    </View>
  );
}

const BAR_HEIGHT = CHIP_HEIGHT + BAR_VERTICAL_PADDING * 2;

const styles = StyleSheet.create({
  // Fixed height on the wrapping bar guarantees every filter bar in the app
  // occupies exactly the same vertical space, regardless of icons/counts/labels.
  bar: {
    height: BAR_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: BAR_VERTICAL_PADDING,
    gap: CHIP_GAP,
  },
  equalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: BAR_VERTICAL_PADDING,
    gap: CHIP_GAP,
  },
  compactRow: {
    paddingHorizontal: 10,
    gap: 5,
  },
  compactScrollContent: {
    paddingHorizontal: 10,
    gap: 6,
  },
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.FULL,
    borderWidth: 1,
  },
  chipAuto: {
    minWidth: 76,
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  chipCompact: {
    paddingHorizontal: 10,
  },
  chipEqual: {
    flex: 1,
    paddingHorizontal: 8,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    flexShrink: 1,
  },
  countPill: {
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  countText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
});
