import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SPACING, RADIUS } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { toneColors, type StatusTone } from "./tone";

interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Third line: date, reference… */
  meta?: string;
  /** Icon tile on the leading side… */
  icon?: keyof typeof Feather.glyphMap;
  iconTone?: StatusTone;
  /** …or any leading element (Avatar). */
  leading?: React.ReactNode;
  /** Amount, badge, switch… */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Shows the directional chevron when the row navigates. */
  chevron?: boolean;
  divider?: boolean;
  accessibilityHint?: string;
}

/** One row of a list: leading visual, two or three lines of text, trailing slot. */
function ListItem({ title, subtitle, meta, icon, iconTone = "primary", leading, trailing, onPress, chevron, divider, accessibilityHint }: ListItemProps) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const tone = toneColors(colors, iconTone);
  const content = (
    <>
      {leading ?? (icon ? (
        <View style={[styles.tile, { backgroundColor: tone.bg }]}>
          <Feather name={icon} size={18} color={tone.fg} />
        </View>
      ) : null)}
      <View style={styles.copy}>
        <Text style={[TYPE.bodyStrong, { color: colors.foreground }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[TYPE.secondary, { color: colors.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textMuted} /> : null}
    </>
  );
  const rowStyle = [styles.row, divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, meta].filter(Boolean).join(", ")}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {content}
    </Pressable>
  );
}

export default React.memo(ListItem);

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.MD, paddingHorizontal: SPACING.LG, paddingVertical: SPACING.MD, minHeight: 60 },
  tile: { width: 40, height: 40, borderRadius: RADIUS.MD, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { alignItems: "flex-end", flexShrink: 0, maxWidth: "45%" },
});
