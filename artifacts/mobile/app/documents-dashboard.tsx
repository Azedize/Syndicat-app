/**
 * documents-dashboard.tsx — Enterprise Document Dashboard
 *
 * 8 status widgets + recent activity + expiring docs + quick actions
 */

import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData, type Document } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { ErrorState, LoadingState } from "@/components/DataState";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Widget {
  id: string;
  label: string;
  count: number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  filterStatus?: string;
  description: string;
}

const STATE_COPY = {
  loadingTitle: {
    fr: "Chargement des échéances",
    en: "Loading expiry data",
    ar: "جارٍ تحميل بيانات الانتهاء",
    es: "Cargando vencimientos",
  },
  loadingDescription: {
    fr: "Nous vérifions les documents dont la conservation arrive à échéance.",
    en: "We are checking documents approaching their retention deadline.",
    ar: "نحن نتحقق من المستندات التي تقترب مدة الاحتفاظ بها من الانتهاء.",
    es: "Estamos comprobando los documentos cuya conservación se acerca a su vencimiento.",
  },
  unavailableTitle: {
    fr: "Échéances indisponibles",
    en: "Expiry data unavailable",
    ar: "بيانات الانتهاء غير متاحة",
    es: "Datos de vencimiento no disponibles",
  },
  unavailableDescription: {
    fr: "Les échéances de conservation ne sont pas disponibles pour le moment. Réessayez pour actualiser cette section.",
    en: "Retention expiry data is unavailable right now. Retry to refresh this section.",
    ar: "بيانات انتهاء مدة الاحتفاظ غير متاحة حالياً. أعد المحاولة لتحديث هذا القسم.",
    es: "Los datos de vencimiento de conservación no están disponibles ahora. Reintente para actualizar esta sección.",
  },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
} as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentsDashboard() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();
  const { documents } = useData();
  const { lang } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  // ── Real expiring-documents summary (30/60/90-day retention buckets) ───────
  // Replaces the previous client-side "published > 345 days ago" heuristic
  // with the backend's actual retentionUntil-based computation.
  interface SummaryDoc { id: string; title: string }
  interface Summary {
    total: number;
    byStatus: Record<string, number>;
    expiring: { in30: number; in60: number; in90: number; documents30: SummaryDoc[] };
  }
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(false);

  const loadSummary = React.useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(false);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = (await (docsApi as any).summary?.()) as { data: Summary } | undefined;
      if (res?.data) {
        setSummary(res.data);
      } else {
        setSummaryError(true);
      }
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // ── Compute metrics ─────────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const byStatus = (st: string | string[]) =>
      documents.filter((d) => (Array.isArray(st) ? st.includes(d.status) : d.status === st)).length;

    const recentDocs = [...documents]
      .filter((d) => d.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);

    const recentlyModified = [...documents]
      .filter((d) => d.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    // Real 30-day retention-expiry bucket from the backend. The render keeps
    // this section in an explicit loading/error state until the request settles.
    const expiringCount = summary?.expiring.in30 ?? 0;
    const expiringDocs = (summary?.expiring.documents30 ?? []).map((sd) => ({
      id: sd.id,
      title: sd.title,
      date: "Conservation légale bientôt échue",
    }));

    return {
      draft:          byStatus("draft"),
      generated:      byStatus("generated"),
      pending_review: byStatus("pending_review"),
      validated:      byStatus("validated"),
      pending_sign:   byStatus(["generated", "validated"]),
      signed:         byStatus("signed"),
      published:      byStatus("published"),
      archived:       byStatus("archived"),
      total:          documents.length,
      expiring:       expiringCount,
      recentDocs,
      recentlyModified,
      expiringDocs,
    };
  }, [documents, summary]);

  // ── Widgets ─────────────────────────────────────────────────────────────────

  const widgets: Widget[] = [
    {
      id: "draft",
      label: "Brouillons",
      count: metrics.draft + metrics.generated,
      icon: "edit-3",
      color: "#64748b",
      filterStatus: "draft",
      description: "Documents en cours de rédaction",
    },
    {
      id: "pending_review",
      label: "En révision",
      count: metrics.pending_review,
      icon: "eye",
      color: "#f59e0b",
      filterStatus: "pending_review",
      description: "Attendent un examen éditorial",
    },
    {
      id: "validated",
      label: "En approbation",
      count: metrics.validated,
      icon: "check-square",
      color: "#0891b2",
      filterStatus: "validated",
      description: "Attendent validation finale",
    },
    {
      id: "pending_sign",
      label: "À signer",
      count: metrics.pending_sign,
      icon: "pen-tool",
      color: "#8b5cf6",
      filterStatus: "generated",
      description: "Prêts pour signature électronique",
    },
    {
      id: "signed",
      label: "Signés",
      count: metrics.signed,
      icon: "check-circle",
      color: "#10b981",
      filterStatus: "signed",
      description: "Signatures complètes",
    },
    {
      id: "published",
      label: "Publiés",
      count: metrics.published,
      icon: "globe",
      color: "#6366f1",
      filterStatus: "published",
      description: "Accessibles aux membres",
    },
    {
      id: "expiring",
      label: "Expirent bientôt",
      count: metrics.expiring,
      icon: "clock",
      color: "#ef4444",
      description: "Renouvellement recommandé dans 30j",
    },
    {
      id: "archived",
      label: "Archivés",
      count: metrics.archived,
      icon: "archive",
      color: "#94a3b8",
      filterStatus: "archived",
      description: "Conservation légale à long terme",
    },
  ];

  const totalActive = metrics.draft + metrics.generated + metrics.pending_review + metrics.validated + metrics.pending_sign;
  const completionPct = metrics.total > 0 ? Math.round((metrics.published + metrics.archived) / metrics.total * 100) : 0;

  // ── Status helpers ──────────────────────────────────────────────────────────

  const statusConfig = (status: string) =>
    ({
      published:      { label: "Publié",     color: "#6366f1" },
      draft:          { label: "Brouillon",   color: "#94a3b8" },
      generated:      { label: "Généré",      color: "#3b82f6" },
      pending_review: { label: "En révision", color: "#f59e0b" },
      validated:      { label: "Validé",      color: "#10b981" },
      signed:         { label: "Signé",       color: "#8b5cf6" },
      archived:       { label: "Archivé",     color: "#64748b" },
    } as Record<string, { label: string; color: string }>)[status]
    ?? { label: status, color: "#64748b" };

  const CAT_COLORS: Record<string, string> = {
    statuts: "#2563EB", reglements: "#3b82f6", pv: "#10b981",
    juridique: "#ef4444", finances: "#f59e0b", attestation: "#8b5cf6",
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Tableau de bord</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Documents — Vue d'ensemble</Text>
        </View>
        <TouchableOpacity
          style={[styles.headerAction, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/documents")}
        >
          <Feather name="file-text" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}
      >
        {/* ── Summary card ── */}
        <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTotal}>{metrics.total}</Text>
            <Text style={styles.summaryLabel}>Documents au total</Text>
            <View style={styles.summaryProgress}>
              <View style={[styles.summaryProgressFill, { width: `${completionPct}%` }]} />
            </View>
            <Text style={styles.summaryPct}>{completionPct}% publiés ou archivés</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <View style={styles.summaryBadge}>
              <Feather name="activity" size={14} color={colors.primary} />
              <Text style={[styles.summaryBadgeText, { color: colors.primary }]}>{totalActive} actifs</Text>
            </View>
            <View style={[styles.summaryBadge, { backgroundColor: "#ffffff15" }]}>
              <Feather name="globe" size={14} color="#fff" />
              <Text style={[styles.summaryBadgeText, { color: "#fff" }]}>{metrics.published} publiés</Text>
            </View>
          </View>
        </View>

        {/* ── 8 widgets grid ── */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>STATUTS DES DOCUMENTS</Text>
        <View style={styles.widgetsGrid}>
          {widgets.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={[styles.widget, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/documents?status=${w.filterStatus ?? w.id}`)}
              activeOpacity={0.8}
            >
              <View style={[styles.widgetIcon, { backgroundColor: w.color + "15" }]}>
                <Feather name={w.icon} size={18} color={w.color} />
              </View>
              <Text style={[styles.widgetCount, { color: w.count > 0 ? w.color : colors.mutedForeground }]}>
                {w.count}
              </Text>
              <Text style={[styles.widgetLabel, { color: colors.foreground }]} numberOfLines={1}>{w.label}</Text>
              <Text style={[styles.widgetDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{w.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Workflow health ── */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PIPELINE DE VALIDATION</Text>
        <View style={[styles.pipeline, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { label: "Brouillon",    count: metrics.draft,          color: "#94a3b8" },
            { label: "Généré",       count: metrics.generated,      color: "#3b82f6" },
            { label: "En révision",  count: metrics.pending_review, color: "#f59e0b" },
            { label: "Validé",       count: metrics.validated,      color: "#10b981" },
            { label: "Signé",        count: metrics.signed,         color: "#8b5cf6" },
            { label: "Publié",       count: metrics.published,      color: "#6366f1" },
          ].map((step, i, arr) => (
            <React.Fragment key={step.label}>
              <View style={styles.pipelineStep}>
                <View style={[styles.pipelineDot, { backgroundColor: step.count > 0 ? step.color : colors.border }]}>
                  {step.count > 0 ? (
                    <Text style={styles.pipelineDotText}>{step.count}</Text>
                  ) : (
                    <View style={[styles.pipelineDotInner, { backgroundColor: colors.border }]} />
                  )}
                </View>
                <Text style={[styles.pipelineLabel, { color: step.count > 0 ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                  {step.label}
                </Text>
              </View>
              {i < arr.length - 1 ? (
                <View style={[styles.pipelineArrow, { backgroundColor: colors.border }]} />
              ) : null}
            </React.Fragment>
          ))}
        </View>

        {/* ── Expiring soon ── */}
        {summaryLoading ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>⚠ EXPIRENT BIENTÔT</Text>
            <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <LoadingState
                title={STATE_COPY.loadingTitle[lang]}
                description={STATE_COPY.loadingDescription[lang]}
                accentColor="#ef4444"
              />
            </View>
          </>
        ) : summaryError ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>⚠ EXPIRENT BIENTÔT</Text>
            <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ErrorState
                title={STATE_COPY.unavailableTitle[lang]}
                description={STATE_COPY.unavailableDescription[lang]}
                retryLabel={STATE_COPY.retry[lang]}
                onRetry={() => void loadSummary()}
                accentColor="#ef4444"
              />
            </View>
          </>
        ) : metrics.expiringDocs.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>⚠ EXPIRENT BIENTÔT</Text>
            <View style={[styles.expiringCard, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
              {metrics.expiringDocs.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.expiringRow}
                  onPress={() => router.push("/documents")}
                >
                  <Feather name="clock" size={14} color="#ef4444" />
                  <Text style={styles.expiringTitle} numberOfLines={1}>{d.title}</Text>
                  <Text style={styles.expiringDate}>{d.date}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        {/* ── Recently modified ── */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>RÉCEMMENT MODIFIÉS</Text>
        {metrics.recentlyModified.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="file-text" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun document récent</Text>
          </View>
        ) : (
          <View style={[styles.recentList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {metrics.recentlyModified.map((d, i) => {
              const sc  = statusConfig(d.status);
              const cc  = CAT_COLORS[d.category] ?? colors.primary;
              return (
                <View key={d.id}>
                  {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
                  <TouchableOpacity
                    style={styles.recentRow}
                    onPress={() => router.push("/documents")}
                  >
                    <View style={[styles.recentDot, { backgroundColor: cc }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recentTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {d.title}
                      </Text>
                      <Text style={[styles.recentMeta, { color: colors.mutedForeground }]}>
                        {d.date} · {d.size}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc.color + "15" }]}>
                      <Text style={[styles.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Quick actions ── */}
        {isAdmin ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACTIONS RAPIDES</Text>
            <View style={styles.quickActions}>
              {[
                { label: "Nouveau document",   icon: "file-plus"  as const, color: colors.primary,    onPress: () => router.push("/documents") },
                { label: "Voir tous",          icon: "list"        as const, color: "#10b981",         onPress: () => router.push("/documents") },
                { label: "Documents signés",   icon: "check-circle" as const, color: "#8b5cf6",        onPress: () => router.push("/documents?status=signed") },
                { label: "Archives légales",   icon: "archive"    as const, color: "#64748b",          onPress: () => router.push("/documents?status=archived") },
              ].map((a) => (
                <TouchableOpacity
                  key={a.label}
                  style={[styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={a.onPress}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: a.color + "15" }]}>
                    <Feather name={a.icon} size={20} color={a.color} />
                  </View>
                  <Text style={[styles.quickActionLabel, { color: colors.foreground }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:               { flex: 1 },
  header:             { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  headerTitle:        { fontSize: 20, fontFamily: "Inter_700Bold" },
  headerSub:          { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerAction:       { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  sectionTitle:       { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: -8 },
  summaryCard:        { borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center" },
  summaryTotal:       { fontSize: 48, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 52 },
  summaryLabel:       { fontSize: 13, fontFamily: "Inter_400Regular", color: "#ffffffcc", marginBottom: 12 },
  summaryProgress:    { height: 6, backgroundColor: "#ffffff30", borderRadius: 3, overflow: "hidden", marginBottom: 4, width: 140 },
  summaryProgressFill:{ height: 6, backgroundColor: "#fff", borderRadius: 3 },
  summaryPct:         { fontSize: 10, fontFamily: "Inter_400Regular", color: "#ffffffaa" },
  summaryBadge:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  summaryBadgeText:   { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  widgetsGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  widget:             { width: "47%", borderRadius: 16, padding: 14, gap: 6, borderWidth: 1 },
  widgetIcon:         { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  widgetCount:        { fontSize: 28, fontFamily: "Inter_700Bold", lineHeight: 32 },
  widgetLabel:        { fontSize: 12, fontFamily: "Inter_700Bold" },
  widgetDesc:         { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 13 },
  pipeline:           { borderRadius: 16, padding: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  pipelineStep:       { alignItems: "center", gap: 6, flex: 1, minWidth: 48 },
  pipelineDot:        { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pipelineDotText:    { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  pipelineDotInner:   { width: 10, height: 10, borderRadius: 5 },
  pipelineLabel:      { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" as const },
  pipelineArrow:      { width: 8, height: 2, borderRadius: 1, marginBottom: 12 },
  expiringCard:       { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  expiringRow:        { flexDirection: "row", alignItems: "center", gap: 10 },
  expiringTitle:      { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#ef4444" },
  expiringDate:       { fontSize: 11, fontFamily: "Inter_400Regular", color: "#ef4444" },
  recentList:         { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  recentRow:          { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  recentDot:          { width: 8, height: 8, borderRadius: 4 },
  recentTitle:        { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  recentMeta:         { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusBadge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusBadgeText:    { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  divider:            { height: 1, marginHorizontal: 14 },
  emptyCard:          { borderRadius: 16, borderWidth: 1, padding: 32, alignItems: "center", gap: 10 },
  emptyText:          { fontSize: 14, fontFamily: "Inter_400Regular" },
  stateCard:          { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  quickActions:       { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickAction:        { width: "47%", borderRadius: 16, padding: 16, alignItems: "center", gap: 10, borderWidth: 1 },
  quickActionIcon:    { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  quickActionLabel:   { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" as const },
});
