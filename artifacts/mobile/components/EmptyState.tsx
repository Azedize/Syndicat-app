/**
 * EmptyState — the single "no results for this view" pattern used by every
 * filterable list screen (chat, messagerie interne, members, etc.).
 *
 * Why this exists: several screens used to render their empty message
 * directly inside a FlatList's ListEmptyComponent with a hardcoded
 * marginTop. That works for one specific list height, but breaks the
 * moment the screen's chrome (header/search/filter bar) changes size —
 * the empty state either sits too high, too low, or forces the outer
 * FlatList to grow/scroll strangely. Because it lived inside the
 * ListEmptyComponent, it also had no guaranteed relationship to the
 * available space below the filter bar.
 *
 * The fix: EmptyState always fills 100% of the space its parent gives it
 * (flex: 1) and centers its content vertically and horizontally inside
 * that space. Pair it with a list wrapper that also uses flex: 1 (see
 * `contentContainerStyle={{ flexGrow: 1 }}` on the FlatList, or place it
 * as a sibling to the FlatList behind a `list.length === 0` check) so the
 * filter bar above never moves and no extra scrollable area is created.
 *
 * Usage:
 *   <FlatList
 *     data={filtered}
 *     contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : { gap: 8 }}
 *     ListEmptyComponent={
 *       <EmptyState
 *         icon="message-circle"
 *         title="No conversations"
 *         description="Start a new conversation to see it here."
 *         actionLabel="New conversation"
 *         onAction={handleOpenNew}
 *       />
 *     }
 *     ...
 *   />
 */

import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { RADIUS, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import Button from "@/components/ui/Button";

interface Props {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Overrides the icon/accent color. Defaults to the theme's primary color. */
  accentColor?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  accentColor,
}: Props) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={[styles.iconWrap, { backgroundColor: accentColor ? accent + "15" : colors.primarySoft }]}>
        <View style={[styles.iconInner, { borderColor: (accentColor ? accent : colors.primary) + "33" }]}>
          {/* The diamond frame is rotated; the icon is turned back upright. */}
          <View style={{ transform: [{ rotate: "-45deg" }] }}>
            <Feather name={icon} size={28} color={accent} />
          </View>
        </View>
      </View>
      <Text style={[TYPE.subtitle, styles.center, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[TYPE.secondary, styles.center, { color: colors.textMuted, maxWidth: 320 }]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: SPACING.XS }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // flex: 1 + centered content: this view takes exactly the space its parent
  // (the list's remaining area) gives it.
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.MD,
    paddingHorizontal: SPACING.XXL,
    paddingVertical: SPACING.XL,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.FULL,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.XS,
  },
  iconInner: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
  },
  center: { textAlign: "center" },
});
