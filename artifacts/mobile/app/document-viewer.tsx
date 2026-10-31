import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import EmptyState from "@/components/EmptyState";
import { FormSheet } from "@/components/FormSheet";
import ScreenHeader from "@/components/ScreenHeader";
import { Button, ListItem, Skeleton, StatusBadge, toneColors } from "@/components/ui";
import { SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import {
  deleteDocumentFile,
  fetchDocumentFile,
  readAsBase64,
  readAsText,
  toDocumentError,
  type DocumentFileErrorCode,
  type LocalDocumentFile,
} from "@/lib/documentFiles";
import { categoryLabel, categoryStyle, formatLabel, previewKind, sizeLabel } from "@/lib/documentMeta";
import { buildImageHtml, buildPdfHtml } from "@/lib/pdfHtml";
import { library, type LibraryDocument } from "@/services/api";

type Phase =
  | { kind: "meta" }
  | { kind: "download"; ratio: number }
  | { kind: "render" }
  | { kind: "ready" }
  | { kind: "error"; code: DocumentFileErrorCode | "PDF_INVALID" | "PDF_PASSWORD" };

const ERROR_TEXT: Record<string, string> = {
  OFFLINE: "dlErrOffline",
  AUTH_EXPIRED: "dlErrAuth",
  ACCESS_REVOKED: "dlErrDenied",
  NOT_FOUND: "dlErrNotFound",
  NO_FILE: "dlErrNoFile",
  STORAGE_OBJECT_MISSING: "dlErrMissing",
  LINK_EXPIRED: "dlErrInterrupted",
  DOCUMENT_REPLACED: "dlErrReplaced",
  INSUFFICIENT_STORAGE: "dlErrStorage",
  INTERRUPTED: "dlErrInterrupted",
  PDF_INVALID: "dlErrPdf",
  PDF_PASSWORD: "dlErrPdfPassword",
  UNKNOWN: "dlErrGeneric",
};

/**
 * Document detail and reader. Metadata comes from the server (access checked
 * there), the file from a fresh personal link into the private cache, removed
 * when this screen closes. PDF: native WebKit on iOS, lazy pdf.js on Android.
 */
export default function DocumentViewerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const { date, locale } = useFormat();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [doc, setDoc] = useState<LibraryDocument | null>(null);
  const [file, setFile] = useState<LocalDocumentFile | null>(null);
  const [content, setContent] = useState<{ html?: string; text?: string } | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "meta" });
  const [page, setPage] = useState<{ current: number; total: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState(false);
  const [sharing, setSharing] = useState(false);
  const fileRef = useRef<string | null>(null);
  const attempt = useRef(0);

  const kind = doc ? previewKind(doc.mimeType, Platform.OS) : "none";

  const load = useCallback(async () => {
    const run = ++attempt.current;
    setPhase({ kind: "meta" });
    setContent(null);
    setPage(null);
    try {
      const meta = (await library.get(String(id))).data;
      if (run !== attempt.current) return;
      setDoc(meta);
      if (!meta.hasFile) return setPhase({ kind: "error", code: "NO_FILE" });
      setPhase({ kind: "download", ratio: 0 });
      let local: LocalDocumentFile;
      try {
        local = await fetchDocumentFile(meta, (ratio) => run === attempt.current && setPhase({ kind: "download", ratio }));
      } catch (e) {
        const err = toDocumentError(e);
        // The document changed between the metadata and the link: reload once.
        if ((err.code === "DOCUMENT_REPLACED" || err.code === "LINK_EXPIRED") && run === attempt.current) {
          const fresh = (await library.get(String(id))).data;
          setDoc(fresh);
          local = await fetchDocumentFile(fresh);
        } else throw err;
      }
      if (run !== attempt.current) return void deleteDocumentFile(local.uri);
      await deleteDocumentFile(fileRef.current);
      fileRef.current = local.uri;
      setFile(local);
      const k = previewKind(local.mimeType, Platform.OS);
      if (k === "pdf" && Platform.OS !== "ios") {
        setPhase({ kind: "render" });
        setContent({ html: buildPdfHtml(await readAsBase64(local.uri), colors.surfaceMuted) });
      } else if (k === "image") {
        setPhase({ kind: "render" });
        setContent({ html: buildImageHtml(await readAsBase64(local.uri), local.mimeType, colors.background, meta.title) });
      } else if (k === "text") {
        setContent({ text: await readAsText(local.uri) });
        setPhase({ kind: "ready" });
      } else if (k === "pdf") {
        setPhase({ kind: "render" });
      } else {
        setPhase({ kind: "ready" });
      }
    } catch (e) {
      if (run !== attempt.current) return;
      setPhase({ kind: "error", code: toDocumentError(e).code });
    }
  }, [id, colors.surfaceMuted, colors.background]);

  useEffect(() => {
    load();
    return () => {
      attempt.current++;
      void deleteDocumentFile(fileRef.current);
    };
  }, [load]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === "loaded") {
        setPhase({ kind: "ready" });
        if (m.pages > 1) setPage({ current: 1, total: m.pages });
      } else if (m.type === "page") setPage({ current: m.current, total: m.total });
      else if (m.type === "error") setPhase({ kind: "error", code: m.kind === "password" ? "PDF_PASSWORD" : "PDF_INVALID" });
    } catch {
      /* ignore */
    }
  };

  const share = async () => {
    setMenu(false);
    if (!file || sharing) return;
    if (!(await Sharing.isAvailableAsync())) return Alert.alert(t("dlShare"), t("dlShareUnavailable"));
    setSharing(true);
    try {
      await Sharing.shareAsync(file.uri, { mimeType: file.mimeType, dialogTitle: doc?.title, UTI: file.mimeType === "application/pdf" ? "com.adobe.pdf" : undefined });
    } catch {
      /* dismissed */
    } finally {
      setSharing(false);
    }
  };

  const style = categoryStyle(doc?.category);
  const tc = toneColors(colors, style.tone);
  const fmt = formatLabel(doc?.mimeType, doc?.fileName);
  const errorCode = phase.kind === "error" ? phase.code : null;
  const canShare = !!file && phase.kind !== "meta" && phase.kind !== "download";

  const infoRows: { label: string; value: string; ltr?: boolean }[] = doc
    ? [
        { label: t("dlCategory"), value: categoryLabel(doc.category, t) },
        doc.publishedAt ? { label: t("dlPublished"), value: date(doc.publishedAt, { day: "numeric", month: "long", year: "numeric" }) } : { label: t("dlAdded"), value: date(doc.createdAt, { day: "numeric", month: "long", year: "numeric" }) },
        fmt ? { label: t("dlFormat"), value: fmt } : null,
        doc.sizeBytes ? { label: t("dlSize"), value: sizeLabel(doc.sizeBytes, locale, t) } : null,
        (doc.version ?? 1) > 1 ? { label: t("dlVersion"), value: `v${doc.version}` } : null,
        doc.documentNumber ? { label: t("dlReference"), value: doc.documentNumber, ltr: true } : null,
        user?.syndicate ? { label: t("dlCondominium"), value: user.syndicate } : null,
        doc.lotNumber ? { label: t("dlConcerns"), value: t("dlUnit").replace("{n}", doc.lotNumber) } : null,
        doc.fileName ? { label: t("dlFileName"), value: doc.fileName, ltr: true } : null,
      ].filter((x): x is { label: string; value: string; ltr?: boolean } => !!x)
    : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={doc ? categoryLabel(doc.category, t) || t("dlTitle") : t("dlTitle")}
        subtitle={user?.syndicate ?? undefined}
        action={doc ? { icon: "more-vertical", label: t("dlActions"), onPress: () => setMenu(true) } : undefined}
      />

      {/* Document header: identity of the file, always readable above the preview */}
      {doc ? (
        <View style={[styles.docHead, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.tile, { backgroundColor: tc.bg }]}>
            <Feather name={style.icon} size={18} color={tc.fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[TYPE.bodyStrong, { color: colors.foreground }]} numberOfLines={2} accessibilityRole="header">
              {doc.title}
            </Text>
            <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {[date(doc.publishedAt ?? doc.createdAt, { day: "numeric", month: "short", year: "numeric" }), sizeLabel(doc.sizeBytes, locale, t), (doc.version ?? 1) > 1 ? `v${doc.version}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          {page ? <StatusBadge label={t("dlPage").replace("{c}", String(page.current)).replace("{t}", String(page.total))} tone="neutral" icon={null} /> : null}
        </View>
      ) : null}

      <View style={styles.body}>
        {errorCode ? (
          <EmptyState
            icon={errorCode === "OFFLINE" ? "wifi-off" : errorCode === "AUTH_EXPIRED" ? "lock" : errorCode === "INSUFFICIENT_STORAGE" ? "hard-drive" : "alert-circle"}
            title={t(ERROR_TEXT[errorCode] ?? "dlErrGeneric")}
            actionLabel={
              errorCode === "AUTH_EXPIRED"
                ? t("dlSignIn")
                : ["ACCESS_REVOKED", "NOT_FOUND", "NO_FILE", "STORAGE_OBJECT_MISSING"].includes(errorCode)
                  ? t("dlBackToLibrary")
                  : errorCode === "PDF_INVALID" || errorCode === "PDF_PASSWORD"
                    ? t("dlOpenWith")
                    : t("dlRetry")
            }
            onAction={() => {
              if (errorCode === "AUTH_EXPIRED") return void logout().then(() => router.replace("/login"));
              if (["ACCESS_REVOKED", "NOT_FOUND", "NO_FILE", "STORAGE_OBJECT_MISSING"].includes(errorCode)) return router.back();
              if (errorCode === "PDF_INVALID" || errorCode === "PDF_PASSWORD") return void share();
              load();
            }}
          />
        ) : phase.kind === "meta" || phase.kind === "download" ? (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <View style={[styles.paper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="90%" height={10} />
              <Skeleton width="80%" height={10} />
              <Skeleton width="85%" height={10} />
              <Skeleton width="40%" height={10} />
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.round((phase.kind === "download" ? phase.ratio : 0.05) * 100)}%` }]} />
            </View>
            <Text style={[TYPE.secondary, { color: colors.textMuted, textAlign: "center" }]}>
              {phase.kind === "download" && phase.ratio > 0 ? t("dlDownloading").replace("{p}", String(Math.round(phase.ratio * 100))) : t("dlPreparing")}
            </Text>
          </View>
        ) : kind === "pdf" && Platform.OS === "ios" && file ? (
          <WebView
            source={{ uri: file.uri }}
            originWhitelist={["file://*"]}
            allowingReadAccessToURL={file.uri}
            allowFileAccess
            onLoadEnd={() => setPhase((p) => (p.kind === "render" ? { kind: "ready" } : p))}
            onError={() => setPhase({ kind: "error", code: "PDF_INVALID" })}
            style={{ flex: 1, backgroundColor: colors.surfaceMuted }}
            accessibilityLabel={doc?.title}
          />
        ) : content?.html ? (
          <View style={{ flex: 1 }}>
            <WebView
              source={{ html: content.html, baseUrl: "about:blank" }}
              originWhitelist={["*"]}
              onMessage={onMessage}
              javaScriptEnabled
              setSupportMultipleWindows={false}
              allowFileAccess={false}
              scalesPageToFit
              style={{ flex: 1, backgroundColor: kind === "pdf" ? colors.surfaceMuted : colors.background }}
              accessibilityLabel={doc?.title}
            />
            {phase.kind === "render" ? (
              <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background + "CC" }]}>
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("dlRendering")}</Text>
              </View>
            ) : null}
          </View>
        ) : content?.text !== undefined ? (
          <ScrollView contentContainerStyle={{ padding: SPACING.LG, paddingBottom: insets.bottom + 24 }}>
            <Text selectable style={[TYPE.body, { color: colors.foreground }]}>
              {content.text}
            </Text>
          </ScrollView>
        ) : (
          <EmptyState icon="file" title={t("dlNoPreviewTitle")} description={t("dlNoPreviewDesc").replace("{f}", fmt || "—")} actionLabel={t("dlOpenWith")} onAction={share} />
        )}
      </View>

      {/* Actions — only what a resident may do with a document they can see */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setMenu(false)} accessibilityLabel={t("close")} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          <Text style={[TYPE.subtitle, { color: colors.foreground, paddingHorizontal: 16 }]} numberOfLines={2}>
            {doc?.title}
          </Text>
          {canShare ? <ListItem icon="share" title={t("dlShare")} subtitle={t("dlShareNote")} onPress={share} divider /> : null}
          <ListItem icon="info" title={t("dlInfo")} onPress={() => { setMenu(false); setInfo(true); }} divider />
          <ListItem icon="refresh-cw" title={t("dlRetry")} onPress={() => { setMenu(false); load(); }} />
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <Button label={t("close")} variant="secondary" fullWidth onPress={() => setMenu(false)} />
          </View>
        </View>
      </Modal>

      <FormSheet visible={info} title={t("dlInfo")} onClose={() => setInfo(false)}>
        {infoRows.map((r) => (
          <View key={r.label} style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{r.label}</Text>
            <Text style={[TYPE.bodyStrong, styles.infoValue, { color: colors.foreground, writingDirection: r.ltr ? "ltr" : undefined }]} selectable={r.ltr}>
              {r.value}
            </Text>
          </View>
        ))}
        {doc?.description ? <Text style={[TYPE.body, { color: colors.foreground, marginTop: 8 }]}>{doc.description}</Text> : null}
        <View style={styles.note}>
          <Feather name="lock" size={13} color={colors.textMuted} />
          <Text style={[TYPE.caption, { color: colors.textMuted, flex: 1 }]}>{t("dlSecureNote")}</Text>
        </View>
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  docHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tile: { width: 38, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  loading: { flex: 1, padding: 24, gap: 16, justifyContent: "center" },
  paper: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 12, aspectRatio: 0.75, maxHeight: 360, alignSelf: "center", width: "70%" },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden", width: "70%", alignSelf: "center" },
  progressFill: { height: 4, borderRadius: 2 },
  center: { alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, gap: 4 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  infoValue: { flexShrink: 1, textAlign: "right" },
  note: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
});

