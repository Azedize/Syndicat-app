import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBadge, toneColors } from "@/components/ui";
import { RADIUS, SPACING } from "@/constants/spacing";
import { FONT, TYPE } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { categoryLabel, categoryStyle, formatIcon, formatLabel, isRecentlyPublished, sizeLabel } from "../documentMeta";
import type { LibraryDocument } from "../api";

interface DocumentRowProps {
  doc: LibraryDocument;
  onOpen: (doc: LibraryDocument) => void;
  /** Team only: management sheet (separate touch target, never overlapping "open"). */
  onManage?: (doc: LibraryDocument) => void;
  divider?: boolean;
  /** Team view: show draft / archived states. */
  showLifecycle?: boolean;
}

/**
 * One document of the library: a file "tile" (category icon + format label),
 * title on two lines, category, date, format, size and real state badges.
 * The whole row opens the document; management has its own 44 pt button.
 */
function DocumentRow({ doc, onOpen, onManage, divider, showLifecycle }: DocumentRowProps) {
  const colors = useColors();
  const { t, isRTL } = useLanguage();
  const { date, locale } = useFormat();
  const style = categoryStyle(doc.category);
  const tc = toneColors(colors, style.tone);
  const fmt = formatLabel(doc.mimeType, doc.fileName);
  const size = sizeLabel(doc.sizeBytes, locale, t);
  const when = doc.publishedAt ?? doc.createdAt;
  const meta = [categoryLabel(doc.category, t), when ? date(when, { day: "numeric", month: "short", year: "numeric" }) : null].filter(Boolean).join(" · ");
  const fileMeta = [fmt, size, doc.lotNumber ? t("dlUnit").replace("{n}", doc.lotNumber) : null].filter(Boolean).join(" · ");
  const recent = doc.status === "published" && isRecentlyPublished(doc.publishedAt ?? null);
  const updated = (doc.version ?? 1) > 1;

  return (
    <View style={[styles.row, divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Pressable
        onPress={() => onOpen(doc)}
        disabled={!doc.hasFile}
        accessibilityRole="button"
        accessibilityLabel={`${doc.title}. ${meta}. ${fileMeta}`}
        accessibilityHint={doc.hasFile ? t("dlOpen").replace("{t}", "") : t("dlUnavailable")}
        accessibilityState={{ disabled: !doc.hasFile }}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: colors.surfaceMuted }]}
      >
        <View style={[styles.tile, { backgroundColor: tc.bg }]}>
          <Feather name={doc.mimeType?.startsWith("image/") ? formatIcon(doc.mimeType) : style.icon} size={20} color={tc.fg} />
          {fmt ? (
            <View style={[styles.fmt, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.fmtText, { color: colors.textSecondary }]} allowFontScaling={false}>
                {fmt.slice(0, 4)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.copy}>
          <Text style={[TYPE.bodyStrong, { color: colors.foreground }]} numberOfLines={2}>
            {doc.title}
          </Text>
          <Text style={[TYPE.caption, { color: colors.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
          {fileMeta ? (
            <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {fileMeta}
            </Text>
          ) : null}
          {recent || updated || !doc.hasFile || (showLifecycle && (doc.status === "archived" || doc.status === "draft")) ? (
            <View style={styles.badges}>
              {showLifecycle && doc.status === "archived" ? <StatusBadge label={t("dlArchived")} tone="neutral" icon="archive" /> : null}
              {showLifecycle && doc.status === "draft" ? <StatusBadge label={t("dlDraft")} tone="warning" icon="edit-3" /> : null}
              {recent ? <StatusBadge label={t("dlNew")} tone="primary" icon="star" /> : null}
              {updated ? <StatusBadge label={t("dlUpdated").replace("{v}", String(doc.version))} tone="info" icon="refresh-cw" /> : null}
              {!doc.hasFile ? <StatusBadge label={t("dlUnavailable")} tone="danger" icon="alert-circle" /> : null}
            </View>
          ) : null}
        </View>
        {doc.hasFile ? <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textMuted} /> : null}
      </Pressable>
      {onManage ? (
        <Pressable
          onPress={() => onManage(doc)}
          accessibilityRole="button"
          accessibilityLabel={`${t("dlManage")} — ${doc.title}`}
          hitSlop={4}
          style={({ pressed }) => [styles.more, pressed && { backgroundColor: colors.surfaceMuted }]}
        >
          <Feather name="more-vertical" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default React.memo(DocumentRow);

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch" },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.MD, paddingVertical: SPACING.MD, paddingStart: SPACING.LG, paddingEnd: SPACING.SM, minHeight: 72 },
  tile: { width: 46, height: 54, borderRadius: RADIUS.MD, alignItems: "center", justifyContent: "center" },
  fmt: { position: "absolute", bottom: -5, paddingHorizontal: 4, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  fmtText: { fontFamily: FONT.bold, fontSize: 8.5, letterSpacing: 0.3 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 },
  more: { width: 44, alignItems: "center", justifyContent: "center" },
});
