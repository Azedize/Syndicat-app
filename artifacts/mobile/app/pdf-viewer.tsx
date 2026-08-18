/**
 * pdf-viewer.tsx — Enterprise In-App PDF Viewer
 *
 * Features:
 *  • WebView-based PDF rendering (iOS: native WebKit | Android: pdf.js HTML)
 *  • Custom toolbar: back, page counter, zoom controls, share, download
 *  • Loading skeleton with progress indicator
 *  • Error state with retry and fallback download button
 *  • Works in Expo Go (no native build required)
 *
 * Usage (expo-router):
 *   router.push({ pathname: "/pdf-viewer", params: { url: signedUrl, title: docTitle, docId } });
 */

import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, {
  WebViewMessageEvent,
  WebViewNavigation,
} from "react-native-webview";
import { useColors } from "@/hooks/useColors";
import { useLanguage, type LangCode } from "@/context/LanguageContext";

// ─── PDF.js HTML shell (Android / fallback) ─────────────────────────────────
// Embeds pdf.js from CDN with custom chrome stripped for a clean viewer experience.
// The page auto-scales to device width, shows page controls, and sends messages
// back to React Native via window.ReactNativeWebView.postMessage.

const PDF_STRINGS: Record<
  LangCode,
  {
    missingUrl: string;
    missingUrlDescription: string;
    back: string;
    page: string;
    loading: string;
    error: string;
    connection: string;
    retry: string;
    download: string;
  }
> = {
  fr: {
    missingUrl: "URL manquante",
    missingUrlDescription: "Le document n'a pas d'URL de prévisualisation.",
    back: "Retour",
    page: "Page",
    loading: "Chargement du PDF…",
    error: "Impossible de charger le PDF.",
    connection: "Vérifiez votre connexion.",
    retry: "Réessayer",
    download: "Télécharger",
  },
  en: {
    missingUrl: "Missing URL",
    missingUrlDescription: "This document has no preview URL.",
    back: "Back",
    page: "Page",
    loading: "Loading PDF…",
    error: "Unable to load the PDF.",
    connection: "Check your connection.",
    retry: "Retry",
    download: "Download",
  },
  ar: {
    missingUrl: "الرابط مفقود",
    missingUrlDescription: "لا يحتوي هذا المستند على رابط للمعاينة.",
    back: "رجوع",
    page: "صفحة",
    loading: "جارٍ تحميل ملف PDF…",
    error: "تعذر تحميل ملف PDF.",
    connection: "تحقق من اتصالك.",
    retry: "إعادة المحاولة",
    download: "تنزيل",
  },
  es: {
    missingUrl: "Falta la URL",
    missingUrlDescription: "Este documento no tiene una URL de vista previa.",
    back: "Volver",
    page: "Página",
    loading: "Cargando PDF…",
    error: "No se pudo cargar el PDF.",
    connection: "Compruebe su conexión.",
    retry: "Reintentar",
    download: "Descargar",
  },
};

function buildPdfJsHtml(
  pdfUrl: string,
  copy: (typeof PDF_STRINGS)[LangCode],
): string {
  const encoded = encodeURIComponent(pdfUrl);
  const loadingMessage = JSON.stringify(copy.loading);
  const errorMessage = JSON.stringify(copy.error);
  const connectionMessage = JSON.stringify(copy.connection);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body,html{width:100%;height:100%;background:#404040;overflow:hidden}
    #viewerContainer{width:100%;height:100%;overflow:auto;-webkit-overflow-scrolling:touch}
    canvas{display:block;margin:8px auto;box-shadow:0 2px 12px #0006}
    #loadingMsg{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      color:#fff;font-family:sans-serif;font-size:14px;text-align:center}
    #errorMsg{display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      color:#ff6b6b;font-family:sans-serif;font-size:14px;text-align:center}
  </style>
</head>
<body>
  <div id="loadingMsg">${loadingMessage.slice(1, -1)}</div>
  <div id="errorMsg">${errorMessage.slice(1, -1)}<br/>${connectionMessage.slice(1, -1)}</div>
  <div id="viewerContainer"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs" type="module"></script>
  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

    const container = document.getElementById('viewerContainer');
    const loadingMsg = document.getElementById('loadingMsg');
    const errorMsg = document.getElementById('errorMsg');
    let totalPages = 0;

    function postMsg(type, data) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data })); } catch(_) {}
    }

    async function renderPage(pdf, num) {
      const page = await pdf.getPage(num);
      const viewport = page.getViewport({ scale: window.devicePixelRatio || 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      container.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }

    async function loadPdf() {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: '${pdfUrl}', withCredentials: false });
        loadingTask.onProgress = (p) => {
          if (p.total > 0) postMsg('progress', { pct: Math.round(p.loaded/p.total*100) });
        };
        const pdf = await loadingTask.promise;
        totalPages = pdf.numPages;
        loadingMsg.style.display = 'none';
        postMsg('loaded', { pages: totalPages });
        for (let i = 1; i <= totalPages; i++) {
          await renderPage(pdf, i);
        }
        postMsg('rendered', { pages: totalPages });
      } catch(err) {
        loadingMsg.style.display = 'none';
        errorMsg.style.display = 'block';
        postMsg('error', { message: err.message || 'PDF load failed' });
      }
    }

    loadPdf();

    // Scroll position → current page estimate
    container.addEventListener('scroll', () => {
      if (!totalPages) return;
      const pct = container.scrollTop / (container.scrollHeight - container.clientHeight);
      const page = Math.max(1, Math.min(totalPages, Math.round(pct * totalPages) + 1));
      postMsg('page', { current: page, total: totalPages });
    }, { passive: true });
  </script>
</body>
</html>`;
}

// ─── iOS native PDF URL ───────────────────────────────────────────────────────
// iOS WebKit renders PDF natively when given a direct URL. No JS needed.

function buildIosViewerUrl(pdfUrl: string) {
  return pdfUrl; // WebKit handles the rest
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PdfViewerScreen() {
  const colors = useColors();
  const { lang } = useLanguage();
  const copy = PDF_STRINGS[lang];
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    url: string;
    title: string;
    docId?: string;
  }>();
  const { url: rawUrl, title = "Document", docId } = params;
  const pdfUrl = Array.isArray(rawUrl) ? rawUrl[0] : (rawUrl ?? "");

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadPct, setLoadPct] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const webRef = useRef<WebView>(null);

  const isIos = Platform.OS === "ios";

  // ── WebView source ──────────────────────────────────────────────────────────

  const webSource: { uri: string } | { html: string; baseUrl: string } = isIos
    ? { uri: buildIosViewerUrl(pdfUrl) }
    : { html: buildPdfJsHtml(pdfUrl, copy), baseUrl: "https://syndycat.ma" };

  // ── Messages from pdf.js (Android) ─────────────────────────────────────────

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as Record<string, unknown>;
      switch (msg.type) {
        case "progress":
          setLoadPct(msg.pct as number);
          Animated.timing(progressAnim, {
            toValue: (msg.pct as number) / 100,
            duration: 200,
            useNativeDriver: false,
          }).start();
          break;
        case "loaded":
          setTotalPages(msg.pages as number);
          break;
        case "rendered":
          setPhase("ready");
          Animated.timing(progressAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: false,
          }).start();
          break;
        case "page":
          setCurrentPage(msg.current as number);
          setTotalPages(msg.total as number);
          break;
        case "error":
          setPhase("error");
          break;
      }
    } catch {
      setPhase("error");
    }
  };

  // ── iOS native load events ──────────────────────────────────────────────────

  const onNavChange = (nav: WebViewNavigation) => {
    // iOS native PDF doesn't send messages — infer state from navigation events
  };

  // ── Download & share ────────────────────────────────────────────────────────

  const handleShare = async () => {
    if (!pdfUrl) return;
    setDownloading(true);
    try {
      const cacheDir = (FileSystem as any).cacheDirectory ?? "";
      const filename = `${title.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
      const localPath = `${cacheDir}${filename}`;
      const res = await FileSystem.downloadAsync(pdfUrl, localPath);
      if (res.uri) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(res.uri, {
            mimeType: "application/pdf",
            UTI: "com.adobe.pdf",
          });
        }
      }
    } catch {
      setPhase("error");
    } finally {
      setDownloading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!pdfUrl) {
    return (
      <View
        style={[
          styles.root,
          styles.center,
          { backgroundColor: colors.background },
        ]}
      >
        <Feather name="alert-circle" size={40} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>
          {copy.missingUrl}
        </Text>
        <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
          {copy.missingUrlDescription}
        </Text>
        <TouchableOpacity
          style={[styles.retryBtn, { borderColor: colors.border }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.retryText, { color: colors.foreground }]}>
            {copy.back}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Web platform: WebView unsupported — use a native <iframe> via DOM ────────
  if (Platform.OS === "web") {
    return (
      <View style={[styles.root, { backgroundColor: "#1a1a2e" }]}>
        <StatusBar barStyle="light-content" />
        {/* Toolbar */}
        <View style={[styles.toolbar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.toolBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.toolTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.toolBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => {
              if (typeof window !== "undefined") window.open(pdfUrl, "_blank");
            }}
          >
            <Feather name="external-link" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* iframe — only works in a DOM environment */}
        {React.createElement("iframe", {
          src: pdfUrl,
          style: {
            flex: 1,
            border: "none",
            width: "100%",
            height: "100%",
            backgroundColor: "#404040",
          } as any,
          title: title,
        })}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: "#1a1a2e" }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Toolbar ── */}
      <View style={[styles.toolbar, { paddingTop: insets.top + 8 }]}>
        {/* Back */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.toolBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Title + page counter */}
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.toolTitle} numberOfLines={1}>
            {title}
          </Text>
          {totalPages > 0 ? (
            <Text style={styles.toolSub}>
              {copy.page} {currentPage} / {totalPages}
            </Text>
          ) : null}
        </View>

        {/* Share / Download */}
        {downloading ? (
          <ActivityIndicator
            color="#fff"
            size="small"
            style={{ marginRight: 8 }}
          />
        ) : (
          <TouchableOpacity
            onPress={handleShare}
            style={styles.toolBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="share-2" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Loading progress bar ── */}
      {phase === "loading" ? (
        <View style={styles.progressBg}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      ) : null}

      {/* ── Error state ── */}
      {phase === "error" ? (
        <View style={[styles.errorOverlay, styles.center]}>
          <Feather name="alert-circle" size={48} color="#ff6b6b" />
          <Text style={styles.errorTitleWhite}>{copy.error}</Text>
          <Text style={styles.errorSubWhite}>{copy.connection}</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setPhase("loading");
                webRef.current?.reload();
              }}
            >
              <Feather name="refresh-cw" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{copy.retry}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#ffffff20" }]}
              onPress={handleShare}
            >
              <Feather name="download" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{copy.download}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* ── WebView ── */}
      <WebView
        ref={webRef as any}
        source={webSource as any}
        style={styles.webview}
        onLoadStart={() => setPhase("loading")}
        onLoadEnd={() => {
          if (isIos) {
            setPhase("ready");
          }
        }}
        onError={() => setPhase("error")}
        onNavigationStateChange={onNavChange}
        onMessage={onMessage}
        // Security
        originWhitelist={["*"]}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        // Performance
        cacheEnabled
        javaScriptEnabled
        domStorageEnabled
        // UX
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator
        scrollEnabled
        // iOS-specific: allow PDF rendering
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Loading overlay
        renderLoading={() => (
          <View style={[styles.loadingOverlay, styles.center]}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>
              {loadPct > 0 ? `Chargement… ${loadPct}%` : "Préparation du PDF…"}
            </Text>
          </View>
        )}
        startInLoadingState
      />

      {/* ── Bottom bar (page navigation hint) ── */}
      {phase === "ready" && totalPages > 1 ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 4 }]}>
          <Text style={styles.bottomBarText}>
            Faites défiler pour naviguer entre les {totalPages} pages
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1a1a2e" },
  center: { alignItems: "center", justifyContent: "center" },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#1a1a2e",
    zIndex: 10,
  },
  toolBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  toolTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#ffffff" },
  toolSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#ffffff80",
    marginTop: 2,
  },
  progressBg: { height: 3, backgroundColor: "#ffffff20", overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#6366f1" },
  webview: { flex: 1, backgroundColor: "#404040" },
  loadingOverlay: {
    position: "absolute" as const,
    inset: 0,
    backgroundColor: "#1a1a2e",
    zIndex: 5,
  },
  loadingText: {
    color: "#ffffffaa",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 16,
  },
  errorOverlay: {
    position: "absolute" as const,
    inset: 0,
    backgroundColor: "#1a1a2e",
    zIndex: 6,
  },
  errorTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 16 },
  errorSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    textAlign: "center" as const,
  },
  errorTitleWhite: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginTop: 16,
  },
  errorSubWhite: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#ffffff80",
    marginTop: 8,
    textAlign: "center" as const,
  },
  retryBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6366f1",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  bottomBar: {
    backgroundColor: "#00000040",
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center" as const,
  },
  bottomBarText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#ffffff80",
  },
});
