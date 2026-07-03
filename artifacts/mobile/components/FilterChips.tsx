import * as Haptics from "expo-haptics";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

export interface FilterOption {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  options: FilterOption[];
  value: string;
  onChange: (key: string) => void;
  accentColor?: string;
  scrollable?: boolean;
}

function Chip({
  opt,
  active,
  accentColor,
  onPress,
}: {
  opt: FilterOption;
  active: boolean;
  accentColor: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.chip,
        {
          backgroundColor: active ? accentColor : colors.secondary,
          borderColor: active ? accentColor : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? "#fff" : colors.foreground },
        ]}
        numberOfLines={1}
      >
        {opt.label}
        {opt.count !== undefined ? (
          <Text style={[styles.chipCount, { color: active ? "rgba(255,255,255,0.75)" : colors.mutedForeground }]}>
            {" "}{opt.count}
          </Text>
        ) : null}
      </Text>
    </TouchableOpacity>
  );
}

export default function FilterChips({
  options,
  value,
  onChange,
  accentColor = "#7c3aed",
  scrollable = true,
}: Props) {
  const colors = useColors();

  const content = options.map((opt) => (
    <Chip
      key={opt.key}
      opt={opt}
      active={value === opt.key}
      accentColor={accentColor}
      onPress={() => {
        Haptics.selectionAsync();
        onChange(opt.key);
      }}
    />
  ));

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.scrollWrap, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.scrollContent}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.wrapRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollWrap: {
    maxHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    height: 32,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  chipCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
