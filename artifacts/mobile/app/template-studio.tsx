/**
 * template-studio.tsx — Template Management Studio
 *
 * Super-admin-only screen for managing all document template definitions.
 * Features: stats dashboard, category filter, template cards with lifecycle actions.
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import RoleGuard from "@/components/RoleGuard";
import { apiRequest as libApiRequest } from "@/lib/api";
import { templateRequests as requestsApi, type ApiTemplateRequest } from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateDefinition {
  id: string;
  slug: string;
  category: string;
  name: string | Record<string, string>;
  description?: string | Record<string, string>;
  status: "draft" | "published" | "archived" | "disabled";
  languages: string | string[];
  currentVersion: number;
  usageCount: number;
  syndicateId: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StudioStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  disabled: number;
  totalUsage: number;
  byCategory: Record<string, number>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "all",             labelKey: "tsCategoryAll",            icon: "grid"          as const, color: "#2563EB" },
  { key: "meeting_minutes", labelKey: "tsCategoryMeeting",        icon: "clipboard"     as const, color: "#3b82f6" },
  { key: "financial",       labelKey: "tsCategoryFinancial",       icon: "dollar-sign"   as const, color: "#10b981" },
  { key: "legal",           labelKey: "tsCategoryLegal",           icon: "shield"        as const, color: "#ef4444" },
  { key: "elections",       labelKey: "tsCategoryElections",       icon: "check-circle"  as const, color: "#f59e0b" },
  { key: "contracts",       labelKey: "tsCategoryContracts",       icon: "file-text"     as const, color: "#0891b2" },
  { key: "certificates",    labelKey: "tsCategoryCertificates",    icon: "award"         as const, color: "#8b5cf6" },
  { key: "regulations",     labelKey: "tsCategoryRegulations",    icon: "book"          as const, color: "#06b6d4" },
  { key: "administrative",  labelKey: "tsCategoryAdministrative",  icon: "briefcase"     as const, color: "#16a34a" },
  { key: "maintenance",     labelKey: "tsCategoryMaintenance",     icon: "tool"          as const, color: "#f97316" },
  { key: "insurance",       labelKey: "tsCategoryInsurance",       icon: "umbrella"      as const, color: "#ec4899" },
];

const STATUS_CONFIG = {
  draft:     { labelKey: "tsStatusDraft",     color: "#f59e0b", bg: "#fef3c720", icon: "edit-2"      as const },
  published: { labelKey: "tsStatusPublished", color: "#16a34a", bg: "#dcfce720", icon: "check-circle" as const },
  archived:  { labelKey: "tsStatusArchived",  color: "#6b7280", bg: "#f3f4f620", icon: "archive"      as const },
  disabled:  { labelKey: "tsStatusDisabled",  color: "#dc2626", bg: "#fee2e220", icon: "slash"        as const },
};

const LANG_FLAGS: Record<string, string> = { fr: "🇫🇷", ar: "🇲🇦", en: "🇬🇧", es: "🇪🇸" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseName(raw: string | Record<string, string> | undefined, lang = "fr"): string {
  if (!raw) return "—";
  if (typeof raw === "object") return raw[lang] ?? raw.fr ?? Object.values(raw)[0] ?? "—";
  try { const p = JSON.parse(raw); return p[lang] ?? p.fr ?? Object.values(p)[0] ?? raw; }
  catch { return raw as string; }
}

function parseLangs(raw: string | string[] | undefined): string[] {
  if (!raw) return ["fr"];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw as string); } catch { return ["fr"]; }
}

function relativeDate(iso: string, lang: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return lang === "fr" ? `il y a ${minutes}m` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === "fr" ? `il y a ${hours}h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return lang === "fr" ? `il y a ${days}j` : `${days}d ago`;
  return new Date(iso).toLocaleDateString(`${lang}-MA`);
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiRequest(path: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", body?: object) {
  return libApiRequest(path.replace(/^\/api/, ""), method, body);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: keyof typeof Feather.glyphMap; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onAction,
  t,
  lang,
}: {
  template: TemplateDefinition;
  onAction: (action: string, template: TemplateDefinition) => void;
  t: (key: string) => string;
  lang: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sc = STATUS_CONFIG[template.status] ?? STATUS_CONFIG.draft;
  const name = parseName(template.name);
  const langs = parseLangs(template.languages);
  const cat = CATEGORIES.find((c) => c.key === template.category);

  return (
    <View style={styles.card}>
      {/* Category accent bar */}
      <View style={[styles.cardAccentBar, { backgroundColor: cat?.color ?? "#2563EB" }]} />

      <View style={styles.cardInner}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.cardCatPill, { backgroundColor: (cat?.color ?? "#2563EB") + "20" }]}>
            <Feather name={cat?.icon ?? "file"} size={11} color={cat?.color ?? "#2563EB"} />
            <Text style={[styles.cardCatText, { color: cat?.color ?? "#2563EB" }]}>{cat ? t(cat.labelKey) : template.category}</Text>
          </View>

          <View style={styles.cardHeaderRight}>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.color + "44" }]}>
              <Feather name={sc.icon} size={10} color={sc.color} />
              <Text style={[styles.statusText, { color: sc.color }]}>{t(sc.labelKey)}</Text>
            </View>

            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuOpen(true); }}
              style={styles.menuBtn}
            >
              <Feather name="more-vertical" size={17} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Name + slug */}
        <Text style={styles.cardName} numberOfLines={2}>{name}</Text>
        <Text style={styles.cardSlug}>{t("templateSlugPrefix")} {template.slug}</Text>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.cardFooterLeft}>
            <Feather name="layers" size={12} color="#64748b" />
            <Text style={styles.cardMeta}>v{template.currentVersion}</Text>
            <View style={styles.dot} />
            <Feather name="file-text" size={12} color="#64748b" />
            <Text style={styles.cardMeta}>{template.usageCount} {t("tsUsages")}</Text>
          </View>

          <View style={styles.langRow}>
            {langs.slice(0, 4).map((l) => (
              <Text key={l} style={styles.langFlag}>{LANG_FLAGS[l] ?? l}</Text>
            ))}
          </View>
        </View>

        <Text style={styles.cardDate}>{t("tsModified")} {relativeDate(template.updatedAt, lang)}</Text>
      </View>

      {/* Action Sheet Modal */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>{name}</Text>

            {[
              { icon: "edit-2" as const, labelKey: "tsEdit", action: "edit", always: true },
              { icon: "eye" as const, labelKey: "tsPreview", action: "preview", always: true },
              { icon: "copy" as const, labelKey: "tsDuplicate", action: "duplicate", always: true },
              { icon: "clock" as const, labelKey: "tsVersions", action: "versions", always: true },
              { icon: "key" as const, labelKey: "tsPermissions", action: "permissions", always: true },
              ...(template.status !== "published" ? [{ icon: "globe" as const, labelKey: "tsPublish", action: "publish", always: false }] : []),
              ...(template.status === "published" ? [{ icon: "slash" as const, labelKey: "tsDisable", action: "disable", always: false }] : []),
              ...(template.status !== "archived" ? [{ icon: "archive" as const, labelKey: "tsArchive", action: "archive", always: false }] : []),
              ...(["archived", "disabled"].includes(template.status) ? [{ icon: "refresh-cw" as const, labelKey: "tsRestore", action: "restore", always: false }] : []),
            ].map((item) => (
              <TouchableOpacity
                key={item.action}
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setTimeout(() => onAction(item.action, template), 150);
                }}
              >
                <Feather name={item.icon} size={17} color={item.action === "archive" || item.action === "disable" ? "#ef4444" : "#e2e8f0"} />
                <Text style={[styles.menuItemText, (item.action === "archive" || item.action === "disable") && { color: "#ef4444" }]}>{t(item.labelKey)}</Text>
                <Feather name="chevron-right" size={14} color="#475569" />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

function TemplateStudioContent() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [stats, setStats] = useState<StudioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCat, setSelectedCat] = useState("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // ── Template Requests ──
  const [showRequests,      setShowRequests]      = useState(false);
  const [requests,          setRequests]          = useState<ApiTemplateRequest[]>([]);
  const [reqLoading,        setReqLoading]        = useState(false);
  const [pendingCount,      setPendingCount]      = useState(0);
  const [selectedReq,       setSelectedReq]       = useState<ApiTemplateRequest | null>(null);
  const [reviewStatus,      setReviewStatus]      = useState<ApiTemplateRequest["status"]>("in_review");
  const [reviewNotes,       setReviewNotes]       = useState("");
  const [reviewReason,      setReviewReason]      = useState("");
  const [reviewSubmitting,  setReviewSubmitting]  = useState(false);

  const fabAnim = useRef(new Animated.Value(1)).current;

  const loadData = useCallback(async () => {
    try {
      const [tmplRes, statsRes] = await Promise.all([
        apiRequest("/api/template-studio/templates"),
        apiRequest("/api/template-studio/stats"),
      ]);
      setTemplates(tmplRes.data ?? []);
      setStats(statsRes.data ?? null);
    } catch (err: any) {
      showToast({ type: "error", message: t("tsLoadError") });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast, t]);

  const loadRequests = useCallback(async () => {
    setReqLoading(true);
    try {
      const res = await requestsApi.list();
      setRequests(res.data ?? []);
      setPendingCount((res.data ?? []).filter((r) => r.status === "pending" || r.status === "in_review").length);
    } catch {
      showToast({ type: "error", message: t("tsRequestsLoadError") });
    } finally {
      setReqLoading(false);
    }
  }, [showToast, t]);

  // Load pending count on mount
  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const filteredTemplates = templates.filter((t) => {
    if (selectedCat !== "all" && t.category !== selectedCat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = parseName(t.name).toLowerCase();
      return name.includes(q) || t.slug.includes(q) || t.category.includes(q);
    }
    return true;
  });

  const handleAction = async (action: string, template: TemplateDefinition) => {
    if (action === "edit") {
      router.push({ pathname: "/template-editor", params: { id: template.id } });
      return;
    }
    if (action === "versions" || action === "permissions" || action === "preview") {
      router.push({ pathname: "/template-editor", params: { id: template.id, tab: action } });
      return;
    }
    if (action === "duplicate") {
      Alert.prompt(
        "Dupliquer le template",
        "Entrez le slug du nouveau template (ex: attestation_v2) :",
        async (newSlug) => {
          if (!newSlug?.trim()) return;
          try {
            setActionLoading(template.id);
            await apiRequest(`/api/template-studio/templates/${template.id}/duplicate`, "POST", { newSlug: newSlug.trim() });
             showToast({ type: "success", message: t("tsDuplicateSuccess") });
            loadData();
          } catch {
             showToast({ type: "error", message: t("tsActionError") });
          } finally {
            setActionLoading(null);
          }
        },
        "plain-text",
        `${template.slug}_copie`,
      );
      return;
    }

    const actionMap: Record<string, { labelKey: string; confirm: string }> = {
      publish:  { labelKey: "tsPublish", confirm: `${t("tsPublish")} "${parseName(template.name)}"?` },
      archive:  { labelKey: "tsArchive", confirm: `${t("tsArchive")} "${parseName(template.name)}"?` },
      restore:  { labelKey: "tsRestore", confirm: `${t("tsRestore")} "${parseName(template.name)}"?` },
      disable:  { labelKey: "tsDisable", confirm: `${t("tsDisable")} "${parseName(template.name)}"?` },
    };

    const cfg = actionMap[action];
    if (!cfg) return;

    Alert.alert(t(cfg.labelKey), cfg.confirm, [
      { text: t("tsCancel"), style: "cancel" },
      {
        text: t(cfg.labelKey),
        style: action === "archive" || action === "disable" ? "destructive" : "default",
        onPress: async () => {
          try {
            setActionLoading(template.id);
            await apiRequest(`/api/template-studio/templates/${template.id}/${action}`, "POST");
            showToast({ type: "success", message: t("tsActionSuccess") });
            loadData();
          } catch {
            showToast({ type: "error", message: t("tsActionError") });
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(fabAnim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true }),
    ]).start();
    router.push({ pathname: "/template-editor", params: { mode: "create" } });
  };

  return (
    <View style={[styles.root, { backgroundColor: "#0f172a" }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#e2e8f0" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t("tsStudioTitle")}</Text>
          <Text style={styles.headerSub}>{t("tsStudioSubtitle")}</Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: "#2563EB22" }]}>
          <Feather name="layers" size={14} color="#a78bfa" />
          <Text style={styles.headerBadgeText}>{stats?.total ?? "—"}</Text>
        </View>
        <TouchableOpacity
          style={styles.requestsBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowRequests(true); }}
        >
          <Feather name="inbox" size={17} color="#a78bfa" />
          {pendingCount > 0 && (
            <View style={styles.requestsBadge}>
              <Text style={styles.requestsBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Strip */}
        {stats && (
          <View style={styles.statsStrip}>
            <StatCard label={t("tsStatusPublished")} value={stats.published} icon="check-circle" color="#16a34a" />
            <StatCard label={t("tsStatusDraft")} value={stats.draft} icon="edit-2" color="#f59e0b" />
            <StatCard label={t("tsStatusArchived")} value={stats.archived} icon="archive" color="#6b7280" />
            <StatCard label={t("tsUsages")} value={stats.totalUsage} icon="bar-chart-2" color="#2563EB" />
          </View>
        )}

        {/* Search */}
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t("tsSearchPlaceholder")}
            placeholderTextColor="#475569"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={16} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
          {CATEGORIES.map((cat) => {
            const active = selectedCat === cat.key;
            const count = cat.key === "all" ? templates.length : templates.filter((t) => t.category === cat.key).length;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.catChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                onPress={() => { Haptics.selectionAsync(); setSelectedCat(cat.key); }}
              >
                <Feather name={cat.icon} size={13} color={active ? "#fff" : cat.color} />
                <Text style={[styles.catLabel, active && { color: "#fff" }]}>{t(cat.labelKey)}</Text>
                <View style={[styles.catCount, { backgroundColor: active ? "#ffffff33" : cat.color + "22" }]}>
                  <Text style={[styles.catCountText, { color: active ? "#fff" : cat.color }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Results header */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            {filteredTemplates.length} {t("tsResults")}
          </Text>
          <TouchableOpacity onPress={handleCreate} style={styles.addInlineBtn}>
            <Feather name="plus" size={14} color="#a78bfa" />
            <Text style={styles.addInlineText}>{t("tsNew")}</Text>
          </TouchableOpacity>
        </View>

        {/* Template List */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>{t("tsLoadingTitle")}</Text>
          </View>
        ) : filteredTemplates.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Feather name="layers" size={36} color="#2563EB" />
            </View>
            <Text style={styles.emptyTitle}>{t("tsNoResults")}</Text>
            <Text style={styles.emptyDesc}>
              {search ? `${t("tsNoSearchResults")} "${search}"` : t("tsFirstTemplate")}
            </Text>
            {!search && (
              <TouchableOpacity style={styles.emptyBtn} onPress={handleCreate}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>{t("tsCreate")}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.listWrap}>
            {filteredTemplates.map((template) => (
              <View key={template.id} style={actionLoading === template.id ? { opacity: 0.5 } : undefined}>
                <TemplateCard template={template} onAction={handleAction} t={t} lang={lang} />
              </View>
            ))}
          </View>
        )}

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <Animated.View style={[styles.fabWrap, { bottom: insets.bottom + 24, transform: [{ scale: fabAnim }] }]}>
        <TouchableOpacity style={styles.fab} onPress={handleCreate} activeOpacity={0.85}>
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Requests List Modal ── */}
      <Modal visible={showRequests} animationType="slide" onRequestClose={() => { setShowRequests(false); setSelectedReq(null); }}>
        <View style={[styles.root, { backgroundColor: "#0f172a" }]}>
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => { setShowRequests(false); setSelectedReq(null); }} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color="#e2e8f0" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>{t("tsRequests")}</Text>
              <Text style={styles.headerSub}>{requests.length} {t("tsRequestCount")}</Text>
            </View>
            <TouchableOpacity onPress={loadRequests} style={styles.backBtn}>
              <Feather name="refresh-cw" size={17} color="#a78bfa" />
            </TouchableOpacity>
          </View>

          {reqLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : requests.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}><Feather name="inbox" size={36} color="#2563EB" /></View>
              <Text style={styles.emptyTitle}>{t("tsNoRequests")}</Text>
              <Text style={styles.emptyDesc}>{t("tsNoRequestsDescription")}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}>
              {(() => {
                const STATUS_CFG: Record<string, { labelKey: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
                   pending:       { labelKey: "tsPending",       color: "#f59e0b", icon: "clock" },
                   in_review:     { labelKey: "tsInReview",      color: "#3b82f6", icon: "eye" },
                   approved:      { labelKey: "tsApproved",       color: "#10b981", icon: "check-circle" },
                   rejected:      { labelKey: "tsRejected",       color: "#ef4444", icon: "x-circle" },
                   need_more_info:{ labelKey: "tsNeedMoreInfo",   color: "#8b5cf6", icon: "info" },
                };
                return requests.map((req) => {
                  const sc = STATUS_CFG[req.status] ?? STATUS_CFG.pending;
                  return (
                    <TouchableOpacity
                      key={req.id}
                      style={[styles.card, { flexDirection: "column" }]}
                      onPress={() => {
                        setSelectedReq(req);
                        setReviewStatus(req.status);
                        setReviewNotes(req.reviewNotes ?? "");
                        setReviewReason(req.rejectionReason ?? "");
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 10 }}>
                        <View style={[{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: sc.color + "20" }]}>
                          <Feather name={sc.icon} size={15} color={sc.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardName, { fontSize: 13, marginBottom: 2 }]} numberOfLines={1}>{req.title}</Text>
                          <Text style={[styles.cardMeta, { color: "#64748b" }]}>{req.syndicateName ?? req.syndicateId ?? "—"}  ·  {req.requesterName ?? "—"}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: sc.color + "15", borderColor: sc.color + "40" }]}>
                           <Text style={[styles.statusText, { color: sc.color }]}>{t(sc.labelKey)}</Text>
                        </View>
                        <Feather name="chevron-right" size={15} color="#475569" />
                      </View>
                      {req.description ? (
                        <Text style={[styles.cardMeta, { paddingHorizontal: 14, paddingBottom: 12 }]} numberOfLines={2}>{req.description}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Review Single Request Modal ── */}
      {selectedReq && (
        <Modal visible={!!selectedReq && showRequests} animationType="slide" transparent onRequestClose={() => setSelectedReq(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" }}>
            <View style={[styles.reviewSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.reviewHandle} />
              <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16 }}>
                <Text style={[styles.headerTitle, { flex: 1, fontSize: 16 }]}>{selectedReq.title}</Text>
                <TouchableOpacity onPress={() => setSelectedReq(null)}>
                  <Feather name="x" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {/* Info rows */}
      {[
                   { k: t("tsSyndicate"), v: selectedReq.syndicateName },
                   { k: t("tsRequester"), v: selectedReq.requesterName },
                   { k: t("tsCategory"), v: selectedReq.category },
                   { k: t("tsPriority"),  v: selectedReq.priority },
                   { k: t("tsSubmittedOn"), v: new Date(selectedReq.createdAt).toLocaleDateString(`${lang}-MA`, { dateStyle: "long" }) },
                  selectedReq.businessPurpose ? { k: "Contexte", v: selectedReq.businessPurpose } : null,
                  selectedReq.requiredFields   ? { k: "Champs requis", v: selectedReq.requiredFields } : null,
                  selectedReq.legalNotes       ? { k: "Références légales", v: selectedReq.legalNotes } : null,
                ].filter(Boolean).map((row: any) => (
                  <View key={row.k} style={styles.reviewInfoRow}>
                    <Text style={styles.reviewInfoKey}>{row.k}</Text>
                    <Text style={styles.reviewInfoVal}>{row.v ?? "—"}</Text>
                  </View>
                ))}

                {selectedReq.description ? (
                  <View style={styles.reviewDescBox}>
                    <Text style={styles.reviewDescLabel}>{t("tsDescription")}</Text>
                    <Text style={styles.reviewDescText}>{selectedReq.description}</Text>
                  </View>
                ) : null}

                {/* Review form */}
                <Text style={[styles.headerSub, { marginTop: 20, marginBottom: 10, color: "#94a3b8", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }]}>
                  {t("tsDecision")}
                </Text>

                {/* Status chips */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {(["in_review", "approved", "rejected", "need_more_info"] as const).map((s) => {
                    const labels: Record<string, string> = { in_review: t("tsInReview"), approved: t("tsApproved"), rejected: t("tsRejected"), need_more_info: t("tsNeedMoreInfo") };
                    const colors: Record<string, string> = { in_review: "#3b82f6", approved: "#10b981", rejected: "#ef4444", need_more_info: "#8b5cf6" };
                    const active = reviewStatus === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.reviewChip, active && { backgroundColor: colors[s] + "22", borderColor: colors[s] }]}
                        onPress={() => setReviewStatus(s)}
                      >
                        <Text style={[styles.reviewChipText, active && { color: colors[s] }]}>{labels[s]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.reviewInput}
                  value={reviewNotes}
                  onChangeText={setReviewNotes}
                  placeholder={t("tsReviewNotesPlaceholder")}
                  placeholderTextColor="#475569"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                {reviewStatus === "rejected" && (
                  <TextInput
                    style={[styles.reviewInput, { marginTop: 10 }]}
                    value={reviewReason}
                    onChangeText={setReviewReason}
                    placeholder={t("tsRejectionReasonPlaceholder")}
                    placeholderTextColor="#475569"
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                )}

                <View style={{ height: 20 }} />
              </ScrollView>

              <TouchableOpacity
                style={[styles.reviewSubmitBtn, reviewSubmitting && { opacity: 0.6 }]}
                disabled={reviewSubmitting}
                onPress={async () => {
                  if (!selectedReq) return;
                  setReviewSubmitting(true);
                  try {
                    await requestsApi.review(selectedReq.id, {
                      status: reviewStatus,
                      reviewNotes: reviewNotes.trim() || undefined,
                      rejectionReason: reviewReason.trim() || undefined,
                    });
                     showToast({ type: "success", message: t("tsDecisionSaved") });
                    setSelectedReq(null);
                    loadRequests();
                  } catch {
                     showToast({ type: "error", message: t("tsActionError") });
                  } finally {
                    setReviewSubmitting(false);
                  }
                }}
              >
                {reviewSubmitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="check" size={17} color="#fff" />}
                <Text style={styles.reviewSubmitText}>
                   {reviewSubmitting ? t("tsSaving") : t("tsSaveDecision")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

export default function TemplateStudio() {
  return (
    <RoleGuard allow={["super_admin"]}>
      <TemplateStudioContent />
    </RoleGuard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1 },
  scroll:         { flex: 1 },

  // Header
  header:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16,
                    borderBottomWidth: 1, borderBottomColor: "#1e293b", gap: 12 },
  backBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: "#1e293b",
                    alignItems: "center", justifyContent: "center" },
  headerCenter:   { flex: 1 },
  headerTitle:    { fontSize: 18, fontWeight: "700", color: "#f1f5f9", letterSpacing: -0.3 },
  headerSub:      { fontSize: 11, color: "#64748b", marginTop: 1 },
  headerBadge:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10,
                    paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#2563EB33" },
  headerBadgeText:{ fontSize: 13, fontWeight: "700", color: "#a78bfa" },

  // Stats
  statsStrip:     { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  statCard:       { flex: 1, backgroundColor: "#1e293b", borderRadius: 14, padding: 12,
                    borderLeftWidth: 3, alignItems: "flex-start" },
  statIcon:       { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center",
                    marginBottom: 8 },
  statValue:      { fontSize: 20, fontWeight: "800", color: "#f1f5f9", letterSpacing: -0.5 },
  statLabel:      { fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: "500" },

  // Search
  searchWrap:     { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 12,
                    backgroundColor: "#1e293b", borderRadius: 14, paddingHorizontal: 14,
                    borderWidth: 1, borderColor: "#334155" },
  searchIcon:     { marginRight: 8 },
  searchInput:    { flex: 1, height: 44, color: "#f1f5f9", fontSize: 14 },

  // Category chips
  catScroll:      { marginBottom: 4 },
  catContent:     { paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: "row" },
  catChip:        { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12,
                    paddingVertical: 8, borderRadius: 100, borderWidth: 1.5, borderColor: "#334155",
                    backgroundColor: "#1e293b" },
  catLabel:       { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  catCount:       { minWidth: 20, height: 18, borderRadius: 9, alignItems: "center",
                    justifyContent: "center", paddingHorizontal: 5 },
  catCountText:   { fontSize: 10, fontWeight: "700" },

  // Results header
  resultsHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    paddingHorizontal: 16, marginBottom: 4, marginTop: 4 },
  resultsCount:   { fontSize: 12, color: "#64748b", fontWeight: "500" },
  addInlineBtn:   { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10,
                    paddingVertical: 5, borderRadius: 8, backgroundColor: "#2563EB22" },
  addInlineText:  { fontSize: 12, color: "#a78bfa", fontWeight: "600" },

  // Template list
  listWrap:       { paddingHorizontal: 16, gap: 12, paddingTop: 8 },
  card:           { backgroundColor: "#1e293b", borderRadius: 18, overflow: "hidden",
                    borderWidth: 1, borderColor: "#334155", flexDirection: "row" },
  cardAccentBar:  { width: 4, borderRadius: 2 },
  cardInner:      { flex: 1, padding: 16 },
  cardHeader:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardCatPill:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8,
                    paddingVertical: 4, borderRadius: 20 },
  cardCatText:    { fontSize: 10, fontWeight: "600" },
  cardHeaderRight:{ flexDirection: "row", alignItems: "center", gap: 8 },
  statusBadge:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8,
                    paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusText:     { fontSize: 10, fontWeight: "700" },
  menuBtn:        { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  cardName:       { fontSize: 15, fontWeight: "700", color: "#f1f5f9", lineHeight: 21, marginBottom: 4 },
  cardSlug:       { fontSize: 11, color: "#475569", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    marginBottom: 12 },
  cardFooter:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardFooterLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMeta:       { fontSize: 11, color: "#64748b" },
  dot:            { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#334155", marginHorizontal: 2 },
  langRow:        { flexDirection: "row", gap: 3 },
  langFlag:       { fontSize: 14 },
  cardDate:       { fontSize: 10, color: "#475569", marginTop: 8 },

  // Action menu
  menuOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  menuSheet:      { backgroundColor: "#1e293b", borderTopLeftRadius: 28, borderTopRightRadius: 28,
                    paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12,
                    borderWidth: 1, borderBottomWidth: 0, borderColor: "#334155" },
  menuHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: "#334155",
                    alignSelf: "center", marginBottom: 16 },
  menuTitle:      { fontSize: 16, fontWeight: "700", color: "#f1f5f9", marginBottom: 16, textAlign: "center" },
  menuItem:       { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14,
                    borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  menuItemText:   { flex: 1, fontSize: 15, color: "#e2e8f0", fontWeight: "500" },

  // Loading / empty
  loadingWrap:    { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  loadingText:    { color: "#64748b", marginTop: 12, fontSize: 14 },
  emptyWrap:      { alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon:      { width: 80, height: 80, borderRadius: 24, backgroundColor: "#2563EB11",
                    alignItems: "center", justifyContent: "center", marginBottom: 20,
                    borderWidth: 1, borderColor: "#2563EB33" },
  emptyTitle:     { fontSize: 18, fontWeight: "700", color: "#f1f5f9", marginBottom: 8 },
  emptyDesc:      { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 20 },
  emptyBtn:       { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24,
                    backgroundColor: "#2563EB", paddingHorizontal: 20, paddingVertical: 12,
                    borderRadius: 12 },
  emptyBtnText:   { color: "#fff", fontWeight: "700", fontSize: 14 },

  // FAB
  fabWrap:        { position: "absolute", right: 24 },
  fab:            { width: 56, height: 56, borderRadius: 28, backgroundColor: "#2563EB",
                    alignItems: "center", justifyContent: "center",
                    shadowColor: "#2563EB", shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },

  // Requests button (header)
  requestsBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: "#1e293b",
                        alignItems: "center", justifyContent: "center" },
  requestsBadge:      { position: "absolute", top: -2, right: -2, minWidth: 16, height: 16,
                        borderRadius: 8, backgroundColor: "#ef4444", alignItems: "center",
                        justifyContent: "center", paddingHorizontal: 3 },
  requestsBadgeText:  { fontSize: 9, fontWeight: "800", color: "#fff" },

  // Review sheet (bottom modal)
  reviewSheet:        { backgroundColor: "#1e293b", borderTopLeftRadius: 28, borderTopRightRadius: 28,
                        paddingHorizontal: 20, paddingTop: 12, maxHeight: "90%", flex: 0 },
  reviewHandle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: "#334155",
                        alignSelf: "center", marginBottom: 16 },
  reviewInfoRow:      { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9,
                        borderBottomWidth: 1, borderBottomColor: "#1e293b30" },
  reviewInfoKey:      { fontSize: 11, color: "#64748b", fontWeight: "500" },
  reviewInfoVal:      { fontSize: 11, color: "#e2e8f0", fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  reviewDescBox:      { backgroundColor: "#0f172a", borderRadius: 12, padding: 14, marginTop: 14,
                        borderWidth: 1, borderColor: "#334155" },
  reviewDescLabel:    { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase",
                        letterSpacing: 0.5, marginBottom: 8 },
  reviewDescText:     { fontSize: 13, color: "#94a3b8", lineHeight: 20 },
  reviewChip:         { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, borderWidth: 1.5,
                        borderColor: "#334155", backgroundColor: "#0f172a" },
  reviewChipText:     { fontSize: 12, fontWeight: "600", color: "#64748b" },
  reviewInput:        { backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155", borderRadius: 12,
                        paddingHorizontal: 14, paddingVertical: 12, color: "#f1f5f9", fontSize: 13,
                        minHeight: 80, textAlignVertical: "top" },
  reviewSubmitBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                        backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 14, marginTop: 16 },
  reviewSubmitText:   { fontSize: 14, fontWeight: "700", color: "#fff" },
});
