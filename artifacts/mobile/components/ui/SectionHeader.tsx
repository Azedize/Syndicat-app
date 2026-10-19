import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CONTROL, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

interface SectionHeaderProps {
  title: string;
  /** Small line above the title (context, count). */
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Heading of a screen section, with an optional "see all"-style link. */
export default function SectionHeader({ title, eyebrow, actionLabel, onAction }: SectionHeaderProps) {
  const colors = useColors();
  const { isRTL, lang } = useLanguage();
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {eyebrow ? (
          <Text style={[TYPE.overline, { color: colors.textMuted, letterSpacing: lang === "ar" ? 0 : TYPE.overline.letterSpacing }]} numberOfLines={1}>
            {lang === "ar" ? eyebrow : eyebrow.toUpperCase()}
          </Text>
        ) : null}
        <Text style={[TYPE.subtitle, { color: colors.foreground }]} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="link" accessibilityLabel={`${actionLabel} — ${title}`} hitSlop={8} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
          <Text style={[TYPE.label, { color: colors.primary }]}>{actionLabel}</Text>
          <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: SPACING.MD },
  copy: { flex: 1, gap: 2 },
  action: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: CONTROL.HIT - 12, paddingVertical: 4 },
});
