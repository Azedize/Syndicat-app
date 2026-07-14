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
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

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
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: accent + "15" }]}>
        <Feather name={icon} size={32} color={accent} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: accent }]}
          onPress={onAction}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // flex: 1 + centered content is the whole trick: this view always takes
  // up exactly the space its parent (the list's remaining area) gives it,
  // so it never pushes content down or leaves a stray gap depending on
  // screen chrome height.
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
