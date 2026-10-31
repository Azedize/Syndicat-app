import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Trailing actions (IconButton / Button). */
  actions?: React.ReactNode;
  /** Content below the title row (search field…). */
  children?: React.ReactNode;
}

/** Header of a tab screen (no back button): large title on the page background. */
export default function PageHeader({ title, subtitle, actions, children }: PageHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  return (
    <View style={[styles.wrap, { paddingTop: topPad + 12, backgroundColor: colors.background }]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={[TYPE.title, { color: colors.foreground }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={[TYPE.secondary, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.LG, paddingBottom: SPACING.MD, gap: SPACING.MD },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.MD },
  copy: { flex: 1, minWidth: 0 },
  actions: { flexDirection: "row", gap: SPACING.SM },
});
