import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import IconButton from "./IconButton";

interface SheetHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Shows a back arrow (nested view inside the sheet). */
  onBack?: () => void;
}

/** Header of a modal sheet: optional back, title, close. */
export default function SheetHeader({ title, subtitle, onClose, onBack }: SheetHeaderProps) {
  const colors = useColors();
  const { isRTL, t } = useLanguage();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {onBack ? <IconButton icon={isRTL ? "arrow-right" : "arrow-left"} variant="ghost" onPress={onBack} accessibilityLabel={t("back")} /> : null}
      <View style={styles.copy}>
        <Text style={[TYPE.headline, { color: colors.foreground }]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[TYPE.secondary, { color: colors.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <IconButton icon="x" variant="ghost" onPress={onClose} accessibilityLabel={t("close")} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.SM, paddingStart: SPACING.LG, paddingEnd: SPACING.SM, paddingVertical: SPACING.MD, borderBottomWidth: StyleSheet.hairlineWidth },
  copy: { flex: 1, minWidth: 0 },
});
