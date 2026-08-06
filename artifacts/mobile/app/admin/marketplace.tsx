/**
 * /admin/marketplace — Global Marketplace Moderation Dashboard
 *
 * RBAC: super_admin ONLY.
 * Syndicat admins and all other roles are redirected away by RoleGuard.
 *
 * Capabilities:
 *   • Approve / Reject (reason picker) / Request Modifications (comment)
 *   • Browse all status queues: pending, approved, rejected,
 *     modification_requested, reported, reserved, sold
 *   • Per-product reports viewer
 *   • Seller profile deep-link
 *   • Live counter strip (from /stats)
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { marketplace } from "@/services/api";
import { ErrorState, LoadingState } from "@/components/DataState";

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price: string | number;
  category?: string | null;
  condition?: string | null;
  brand?: string | null;
  model?: string | null;
  location?: string | null;
  building?: string | null;
  sellerId: string;
  sellerName?: string | null;
  status: string;
  featured?: boolean;
  boosted?: boolean;
  imageUrls?: string | string[] | null;
  createdAt: string;
  rejectionReason?: string | null;
  moderationNote?: string | null;
  moderatedAt?: string | null;
  reportCount?: number;
};

type ProductReport = {
  id: string;
  productId: string;
  reporterId: string;
  reporterName?: string | null;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: string;
};

type StatusTab =
  | "pending_review"
  | "approved"
  | "rejected"
  | "modification_requested"
  | "reported"
  | "reserved"
  | "sold";

const STATE_COPY = {
  loadingTitle: {
    fr: "Chargement de la modération",
    en: "Loading moderation",
    ar: "جارٍ تحميل الإشراف",
    es: "Cargando moderación",
  },
  loadingDescription: {
    fr: "Nous récupérons les annonces et leurs statuts.",
    en: "We are retrieving listings and their statuses.",
    ar: "نحن نسترجع الإعلانات وحالاتها.",
    es: "Estamos recuperando los anuncios y sus estados.",
  },
  unavailableTitle: {
    fr: "Données marketplace indisponibles",
    en: "Marketplace data unavailable",
    ar: "بيانات السوق غير متاحة",
    es: "Datos del marketplace no disponibles",
  },
  productsUnavailable: {
    fr: "La file de modération n'est pas disponible. Réessayez pour vérifier les annonces.",
    en: "The moderation queue is unavailable. Retry to check listings.",
    ar: "قائمة الإشراف غير متاحة. أعد المحاولة للتحقق من الإعلانات.",
    es: "La cola de moderación no está disponible. Reintente para verificar los anuncios.",
  },
  statsUnavailable: {
    fr: "Les compteurs marketplace ne sont pas disponibles. Réessayez pour actualiser les volumes.",
    en: "Marketplace counters are unavailable. Retry to refresh the volumes.",
    ar: "عدادات السوق غير متاحة. أعد المحاولة لتحديث الأحجام.",
    es: "Los contadores del marketplace no están disponibles. Reintente para actualizar los volúmenes.",
  },
  reportsUnavailable: {
    fr: "Les signalements ne sont pas disponibles. Réessayez pour charger l'historique.",
    en: "Reports are unavailable. Retry to load the history.",
    ar: "البلاغات غير متاحة. أعد المحاولة لتحميل السجل.",
    es: "Los reportes no están disponibles. Reintente para cargar el historial.",
  },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_TABS: {
  key: StatusTab;
  label: string;
  color: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}[] = [
  { key: "pending_review",          label: "En attente",      color: "#f59e0b", icon: "clock"       },
  { key: "approved",                label: "Approuvés",       color: "#22c55e", icon: "check-circle" },
  { key: "rejected",                label: "Rejetés",         color: "#ef4444", icon: "x-circle"    },
  { key: "modification_requested",  label: "Modifs requises", color: "#f97316", icon: "edit-2"      },
  { key: "reported",                label: "Signalés",        color: "#dc2626", icon: "flag"        },
  { key: "reserved",                label: "Réservés",        color: "#6366f1", icon: "lock"        },
  { key: "sold",                    label: "Vendus",          color: "#94a3b8", icon: "package"     },
];

const REJECT_REASONS = [
  "Contenu inapproprié",
  "Informations manquantes",
  "Mauvaise catégorie",
  "Annonce en double",
  "Article prohibé",
  "Photos insuffisantes",
  "Prix non conforme",
  "Autre",
];

const CONDITION_LABELS: Record<string, string> = {
  neuf: "Neuf",
  bon: "Bon état",
  acceptable: "Acceptable",
  mauvais: "Mauvais état",
};

const REPORT_REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  inappropriate: "Contenu inapproprié",
  fraude: "Fraude",
  mauvaise_info: "Mauvaises informations",
  produit_interdit: "Produit prohibé",
  faux_produit: "Faux produit",
  autre: "Autre",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMAD(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  if (isNaN(n)) return "0";
  try { return n.toLocaleString("fr-FR"); } catch { return String(Math.round(n)); }
}

function safeDate(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(s?: string | null) {
  const d = safeDate(s);
  if (!d) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function parseImageUrls(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function ModerationDashboard() {
  const colors   = useColors();
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [activeTab, setActiveTab] = useState<StatusTab>("pending_review");
  const [products,  setProducts]  = useState<Product[]>([]);
  const [stats,     setStats]     = useState<Record<string, number>>({});
  const [loading,   setLoading]   = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [refreshing,setRefreshing]= useState(false);
  const [moderating,setModerating]= useState<string | null>(null);

  // ── Reject modal ──────────────────────────────────────────────────────────
  const [rejectModal,       setRejectModal]       = useState(false);
  const [rejectTarget,      setRejectTarget]      = useState<{ id: string; name: string } | null>(null);
  const [selectedReason,    setSelectedReason]    = useState("");
  const [customReason,      setCustomReason]      = useState("");
  const [rejectSubmitting,  setRejectSubmitting]  = useState(false);

  // ── Request-changes modal ─────────────────────────────────────────────────
  const [changesModal,      setChangesModal]      = useState(false);
  const [changesTarget,     setChangesTarget]     = useState<{ id: string; name: string } | null>(null);
  const [changesComment,    setChangesComment]    = useState("");
  const [changesSubmitting, setChangesSubmitting] = useState(false);

  // ── Product detail modal ──────────────────────────────────────────────────
  const [detailModal,   setDetailModal]   = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  // ── Reports modal ─────────────────────────────────────────────────────────
  const [reportsModal,   setReportsModal]   = useState(false);
  const [reportsTarget,  setReportsTarget]  = useState<{ id: string; name: string } | null>(null);
  const [reports,        setReports]        = useState<ProductReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(false);

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async (tab: StatusTab) => {
    setProductsError(false);
    try {
      if (tab === "reported") {
        const res = await marketplace.reported();
        setProducts((res.data as Product[]) ?? []);
      } else {
        const res = await marketplace.products({ status: tab });
        setProducts((res.data as Product[]) ?? []);
      }
    } catch {
      setProductsError(true);
      setProducts([]);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsError(false);
    try {
      const res = await marketplace.stats();
      const d   = res.data as any;
      setStats({
        pending_review:         Number(d?.pending      ?? 0),
        approved:               Number(d?.approved     ?? 0),
        rejected:               Number(d?.rejected     ?? 0),
        modification_requested: Number(d?.needs_changes ?? 0),
        reported:               Number(d?.reported     ?? 0),
        reserved:               Number(d?.reserved     ?? 0),
        sold:                   Number(d?.sold         ?? 0),
      });
    } catch {
      setStatsError(true);
    }
  }, []);

  const fetchAll = useCallback(async (tab: StatusTab) => {
    setLoading(true);
    await Promise.all([fetchProducts(tab), fetchStats()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchProducts, fetchStats]);

  useEffect(() => { fetchAll(activeTab); }, [activeTab, fetchAll]);

  const onRefresh  = () => { setRefreshing(true); fetchAll(activeTab); };
  const switchTab  = (tab: StatusTab) => { setActiveTab(tab); setProducts([]); };

  // ─── Moderation actions ────────────────────────────────────────────────────

  const openRejectModal = (id: string, name: string) => {
    setRejectTarget({ id, name });
    setSelectedReason("");
    setCustomReason("");
    setRejectModal(true);
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    const reason = selectedReason === "Autre" ? customReason.trim() : selectedReason;
    if (!reason) {
      showToast({ type: "error", title: "Motif requis", message: "Sélectionnez ou saisissez un motif de rejet" });
      return;
    }
    setRejectSubmitting(true);
    try {
      await marketplace.moderate(rejectTarget.id, { action: "reject", reason });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRejectModal(false);
      showToast({ type: "success", title: "Produit rejeté", message: "Le vendeur a été notifié" });
      fetchAll(activeTab);
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible de rejeter le produit" });
    } finally { setRejectSubmitting(false); }
  };

  const openChangesModal = (id: string, name: string) => {
    setChangesTarget({ id, name });
    setChangesComment("");
    setChangesModal(true);
  };

  const submitChanges = async () => {
    if (!changesTarget || !changesComment.trim()) return;
    setChangesSubmitting(true);
    try {
      await marketplace.moderate(changesTarget.id, { action: "request_modification", reason: changesComment.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setChangesModal(false);
      showToast({ type: "success", title: "Modifications demandées", message: "Le vendeur a été notifié" });
      fetchAll(activeTab);
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible d'envoyer la demande" });
    } finally { setChangesSubmitting(false); }
  };

  const handleApprove = (id: string, name: string) => {
    Alert.alert(
      "Approuver le produit",
      `Approuver "${name}" et le rendre visible dans le marketplace ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Approuver",
          onPress: async () => {
            setModerating(id);
            try {
              await marketplace.moderate(id, { action: "approve" });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast({ type: "success", title: "Approuvé ✓", message: "Le vendeur a été notifié" });
              fetchAll(activeTab);
            } catch {
              showToast({ type: "error", title: "Erreur", message: "Approbation impossible" });
            } finally { setModerating(null); }
          },
        },
      ],
    );
  };

  const fetchReports = useCallback(async (id: string) => {
    setReportsLoading(true);
    setReportsError(false);
    try {
      const res = await marketplace.productReports(id);
      setReports((res.data as ProductReport[]) ?? []);
    } catch {
      setReportsError(true);
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const openReports = (id: string, name: string) => {
    setReportsTarget({ id, name });
    setReports([]);
    setReportsError(false);
    setReportsModal(true);
    void fetchReports(id);
  };

  // ─── Derived ───────────────────────────────────────────────────────────────

  const tabConfig = STATUS_TABS.find((t) => t.key === activeTab)!;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Modération Marketplace</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Administration globale de la plateforme</Text>
          </View>
          <View style={[styles.rolePill, { backgroundColor: "#ef444420", borderColor: "#ef444430" }]}>
            <Feather name="shield" size={12} color="#ef4444" />
            <Text style={[styles.rolePillText, { color: "#ef4444" }]}>Super Admin</Text>
          </View>
        </View>
      </View>

      {/* ── Counter strip ──────────────────────────────────────────────── */}
      <View style={[styles.counterStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.counterScroll}>
          {STATUS_TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.counterChip,
                {
                  backgroundColor: activeTab === t.key ? t.color + "22" : colors.secondary,
                  borderColor:     activeTab === t.key ? t.color : "transparent",
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => switchTab(t.key)}
            >
              <Feather name={t.icon} size={12} color={t.color} />
              <Text style={[styles.counterNum, { color: t.color }]}>
                {stats[t.key] !== undefined ? stats[t.key] : "—"}
              </Text>
              <Text style={[styles.counterLabel, { color: activeTab === t.key ? t.color : colors.mutedForeground }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {statsError ? (
        <View style={[styles.dataWarning, { backgroundColor: "#f59e0b12", borderBottomColor: colors.border }]}>
          <Feather name="alert-circle" size={14} color="#f59e0b" />
          <Text style={[styles.dataWarningText, { color: colors.foreground }]}>
            {STATE_COPY.statsUnavailable[lang]}
          </Text>
          <TouchableOpacity onPress={() => void fetchStats()} accessibilityRole="button" accessibilityLabel={STATE_COPY.retry[lang]}>
            <Text style={[styles.dataWarningRetry, { color: "#f59e0b" }]}>{STATE_COPY.retry[lang]}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Active tab label ───────────────────────────────────────────── */}
      <View style={[styles.tabBar, { backgroundColor: colors.background }]}>
        <Feather name={tabConfig.icon} size={14} color={tabConfig.color} />
        <Text style={[styles.tabLabel, { color: tabConfig.color }]}>
          {tabConfig.label}
          {products.length > 0 ? ` · ${products.length} produit${products.length !== 1 ? "s" : ""}` : ""}
        </Text>
      </View>

      {/* ── Product list ───────────────────────────────────────────────── */}
      {loading ? (
        <LoadingState
          title={STATE_COPY.loadingTitle[lang]}
          description={STATE_COPY.loadingDescription[lang]}
          accentColor={tabConfig.color}
        />
      ) : productsError ? (
        <ErrorState
          title={STATE_COPY.unavailableTitle[lang]}
          description={STATE_COPY.productsUnavailable[lang]}
          retryLabel={STATE_COPY.retry[lang]}
          onRetry={() => void fetchAll(activeTab)}
          accentColor={tabConfig.color}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              tab={activeTab}
              colors={colors}
              moderating={moderating}
              onApprove={handleApprove}
              onReject={openRejectModal}
              onChanges={openChangesModal}
              onDetail={(p) => { setDetailProduct(p); setDetailModal(true); }}
              onReports={openReports}
              onViewSeller={(sid) => router.push({ pathname: "/member-detail", params: { id: sid } } as any)}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name={tabConfig.icon} size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun produit</Text>
              <Text style={[styles.emptySub,  { color: colors.mutedForeground }]}>
                Aucun produit avec le statut « {tabConfig.label} ».
              </Text>
            </View>
          }
        />
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODALS
      ════════════════════════════════════════════════════════════════ */}

      {/* ── Reject modal ───────────────────────────────────────────────── */}
      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, styles.overlay]} onPress={() => setRejectModal(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Rejeter le produit</Text>
            {rejectTarget && (
              <Text style={[styles.sheetSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {rejectTarget.name}
              </Text>
            )}

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Motif de rejet</Text>
            <View style={styles.reasonGrid}>
              {REJECT_REASONS.map((r) => {
                const active = selectedReason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.reasonChip,
                      {
                        backgroundColor: active ? colors.destructive + "20" : colors.secondary,
                        borderColor:     active ? colors.destructive : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedReason(r)}
                  >
                    {active && <Feather name="check" size={11} color={colors.destructive} />}
                    <Text style={[styles.reasonChipText, { color: active ? colors.destructive : colors.foreground }]}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedReason === "Autre" && (
              <TextInput
                style={[styles.textarea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                placeholder="Précisez le motif..."
                placeholderTextColor={colors.mutedForeground}
                value={customReason}
                onChangeText={setCustomReason}
                multiline
                maxLength={500}
              />
            )}

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: colors.border }]}
                onPress={() => setRejectModal(false)}
              >
                <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { backgroundColor: (!selectedReason || (selectedReason === "Autre" && !customReason.trim())) ? colors.muted : colors.destructive },
                ]}
                onPress={submitReject}
                disabled={!selectedReason || (selectedReason === "Autre" && !customReason.trim()) || rejectSubmitting}
              >
                {rejectSubmitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Feather name="x" size={14} color="#fff" /><Text style={styles.btnPrimaryText}>Rejeter</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Request-changes modal ──────────────────────────────────────── */}
      <Modal visible={changesModal} transparent animationType="slide" onRequestClose={() => setChangesModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, styles.overlay]} onPress={() => setChangesModal(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Demander des modifications</Text>
            {changesTarget && (
              <Text style={[styles.sheetSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {changesTarget.name}
              </Text>
            )}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Commentaire pour le vendeur</Text>
            <TextInput
              style={[styles.textarea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder="Ex : Ajoutez des photos supplémentaires et corrigez la catégorie..."
              placeholderTextColor={colors.mutedForeground}
              value={changesComment}
              onChangeText={setChangesComment}
              multiline
              maxLength={1000}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: colors.border }]}
                onPress={() => setChangesModal(false)}
              >
                <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: !changesComment.trim() ? colors.muted : "#f97316" }]}
                onPress={submitChanges}
                disabled={!changesComment.trim() || changesSubmitting}
              >
                {changesSubmitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Feather name="edit-2" size={14} color="#fff" /><Text style={styles.btnPrimaryText}>Envoyer</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Product detail modal ───────────────────────────────────────── */}
      <Modal visible={detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, styles.overlay]} onPress={() => setDetailModal(false)} />
          <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {detailProduct && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Status + close */}
                <View style={styles.detailHeader}>
                  <StatusBadge status={detailProduct.status} colors={colors} />
                  <TouchableOpacity onPress={() => setDetailModal(false)}>
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* Image thumbnails */}
                {(() => {
                  const imgs = parseImageUrls(detailProduct.imageUrls);
                  return imgs.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                      {imgs.map((_, i) => (
                        <View key={i} style={[styles.imgThumb, { backgroundColor: colors.secondary }]}>
                          <Feather name="image" size={26} color={colors.mutedForeground} />
                          <Text style={{ fontSize: 9, color: colors.mutedForeground, marginTop: 2 }}>Photo {i + 1}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={[styles.imgPlaceholder, { backgroundColor: colors.secondary }]}>
                      <Feather name="shopping-bag" size={32} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 4 }}>Aucune photo</Text>
                    </View>
                  );
                })()}

                <Text style={[styles.detailTitle, { color: colors.foreground }]}>{detailProduct.name}</Text>
                <Text style={[styles.detailPrice, { color: colors.primary  }]}>{formatMAD(detailProduct.price)} MAD</Text>

                {/* Info grid */}
                <View style={[styles.infoGrid, { borderColor: colors.border }]}>
                  {([
                    { label: "Catégorie",    value: detailProduct.category },
                    { label: "Marque",       value: detailProduct.brand },
                    { label: "Modèle",       value: detailProduct.model },
                    { label: "État",         value: CONDITION_LABELS[detailProduct.condition ?? ""] ?? detailProduct.condition },
                    { label: "Localisation", value: detailProduct.location },
                    { label: "Bâtiment",     value: detailProduct.building },
                    { label: "Vendeur",      value: detailProduct.sellerName },
                    { label: "Soumis le",    value: formatDate(detailProduct.createdAt) },
                    { label: "Modéré le",    value: formatDate(detailProduct.moderatedAt) },
                  ] as { label: string; value: string | null | undefined }[])
                    .filter((r) => r.value)
                    .map((r, i, arr) => (
                      <View
                        key={r.label}
                        style={[styles.infoRow, { borderBottomColor: colors.border, borderBottomWidth: i < arr.length - 1 ? 1 : 0 }]}
                      >
                        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                        <Text style={[styles.infoValue, { color: colors.foreground    }]}>{r.value}</Text>
                      </View>
                    ))}
                </View>

                {detailProduct.description ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 12 }]}>Description</Text>
                    <Text style={[styles.descText, { color: colors.mutedForeground }]}>{detailProduct.description}</Text>
                  </>
                ) : null}

                {detailProduct.rejectionReason ? (
                  <View style={[styles.alertBox, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "35" }]}>
                    <Feather name="alert-circle" size={13} color={colors.destructive} />
                    <Text style={[styles.alertBoxText, { color: colors.destructive }]}>{detailProduct.rejectionReason}</Text>
                  </View>
                ) : null}

                {detailProduct.moderationNote && !detailProduct.rejectionReason ? (
                  <View style={[styles.alertBox, { backgroundColor: "#f59e0b12", borderColor: "#f59e0b35" }]}>
                    <Feather name="message-circle" size={13} color="#f59e0b" />
                    <Text style={[styles.alertBoxText, { color: "#f59e0b" }]}>{detailProduct.moderationNote}</Text>
                  </View>
                ) : null}

                {/* Moderation actions for pending products */}
                {detailProduct.status === "pending_review" && (
                  <View style={styles.detailActions}>
                    <ActionBtn label="Approuver"   icon="check"   color={colors.success}      onPress={() => { setDetailModal(false); handleApprove(detailProduct.id, detailProduct.name); }} />
                    <ActionBtn label="Modifications" icon="edit-2" color="#f97316"             onPress={() => { setDetailModal(false); openChangesModal(detailProduct.id, detailProduct.name); }} />
                    <ActionBtn label="Rejeter"     icon="x"       color={colors.destructive}  onPress={() => { setDetailModal(false); openRejectModal(detailProduct.id, detailProduct.name); }} />
                  </View>
                )}

                <View style={{ height: 36 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Reports modal ─────────────────────────────────────────────── */}
      <Modal visible={reportsModal} transparent animationType="slide" onRequestClose={() => setReportsModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, styles.overlay]} onPress={() => setReportsModal(false)} />
          <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetTitleRow}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Signalements</Text>
              <TouchableOpacity onPress={() => setReportsModal(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {reportsTarget && (
              <Text style={[styles.sheetSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {reportsTarget.name}
              </Text>
            )}

            {reportsLoading ? (
              <LoadingState
                title={STATE_COPY.loadingTitle[lang]}
                description={STATE_COPY.loadingDescription[lang]}
                accentColor={colors.primary}
              />
            ) : reportsError ? (
              <ErrorState
                title={STATE_COPY.unavailableTitle[lang]}
                description={STATE_COPY.reportsUnavailable[lang]}
                retryLabel={STATE_COPY.retry[lang]}
                onRetry={() => reportsTarget ? void fetchReports(reportsTarget.id) : undefined}
                accentColor={colors.primary}
              />
            ) : reports.length === 0 ? (
              <View style={[styles.centered, { flex: 0, paddingVertical: 40 }]}>
                <Feather name="flag" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptySub, { color: colors.mutedForeground, marginTop: 8 }]}>Aucun signalement</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {reports.map((r) => (
                  <View key={r.id} style={[styles.reportCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.reportTop}>
                      <View style={[styles.reportBadge, { backgroundColor: colors.destructive + "18" }]}>
                        <Feather name="flag" size={11} color={colors.destructive} />
                        <Text style={[styles.reportBadgeText, { color: colors.destructive }]}>
                          {REPORT_REASON_LABELS[r.reason] ?? r.reason}
                        </Text>
                      </View>
                      <Text style={[styles.reportDate, { color: colors.mutedForeground }]}>{formatDate(r.createdAt)}</Text>
                    </View>
                    <Text style={[styles.reportReporter, { color: colors.mutedForeground }]}>
                      Par : {r.reporterName ?? "Anonyme"}
                    </Text>
                    {r.details ? (
                      <Text style={[styles.reportDetails, { color: colors.foreground }]}>{r.details}</Text>
                    ) : null}
                    <View style={[styles.reportStatusPill, { backgroundColor: r.status === "pending" ? "#f59e0b15" : "#22c55e15" }]}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: r.status === "pending" ? "#f59e0b" : "#22c55e" }}>
                        {r.status === "pending" ? "En attente" : "Traité"}
                      </Text>
                    </View>
                  </View>
                ))}
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Entry point (wraps with RoleGuard) ───────────────────────────────────────

export default function AdminMarketplaceScreen() {
  return (
    <RoleGuard allow={["super_admin"]}>
      <ModerationDashboard />
    </RoleGuard>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type Colors = ReturnType<typeof import("@/hooks/useColors").useColors>;

function StatusBadge({ status, colors }: { status: string; colors: Colors }) {
  const STATUS_MAP: Record<string, { color: string; label: string }> = {
    approved:               { color: "#22c55e", label: "Approuvé"       },
    pending_review:         { color: "#f59e0b", label: "En attente"     },
    rejected:               { color: "#ef4444", label: "Rejeté"         },
    modification_requested: { color: "#f97316", label: "Modifs requises" },
    reserved:               { color: "#6366f1", label: "Réservé"        },
    sold:                   { color: "#94a3b8", label: "Vendu"          },
  };
  const { color, label } = STATUS_MAP[status] ?? { color: colors.mutedForeground, label: status };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: color + "18" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: "700", color }}>{label}</Text>
    </View>
  );
}

function ActionBtn({ label, icon, color, onPress }: { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: color + "18" }}
      onPress={onPress}
    >
      <Feather name={icon} size={18} color={color} />
      <Text style={{ fontSize: 11, fontWeight: "700", color }}>{label}</Text>
    </TouchableOpacity>
  );
}

function MetaRow({ icon, label, colors }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; colors: Colors }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Feather name={icon} size={11} color={colors.mutedForeground} />
      <Text style={{ fontSize: 11, color: colors.mutedForeground }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Pill({ icon, label, color, loading, onPress }: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string; color: string; loading?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.pill, { backgroundColor: color + "15", borderColor: color + "30" }]}
      onPress={onPress} disabled={loading}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : <Feather name={icon} size={12} color={color} />}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProductCard({
  product: p, tab, colors, moderating,
  onApprove, onReject, onChanges, onDetail, onReports, onViewSeller,
}: {
  product: Product; tab: StatusTab; colors: Colors; moderating: string | null;
  onApprove:    (id: string, name: string) => void;
  onReject:     (id: string, name: string) => void;
  onChanges:    (id: string, name: string) => void;
  onDetail:     (p: Product) => void;
  onReports:    (id: string, name: string) => void;
  onViewSeller: (sellerId: string) => void;
}) {
  const STATUS_BORDER: Record<StatusTab, string> = {
    pending_review:         "#f59e0b",
    approved:               "#22c55e",
    rejected:               "#ef4444",
    modification_requested: "#f97316",
    reported:               "#dc2626",
    reserved:               "#6366f1",
    sold:                   "#94a3b8",
  };
  const accent    = STATUS_BORDER[tab];
  const isPending = p.status === "pending_review";
  const isReported = tab === "reported";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: accent + "30", borderLeftColor: accent }]}>
      {/* Top row */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName,  { color: colors.foreground }]} numberOfLines={2}>{p.name ?? ""}</Text>
          <Text style={[styles.cardPrice, { color: colors.primary    }]}>{formatMAD(p.price)} MAD</Text>
        </View>
        {(p.reportCount ?? 0) > 0 && (
          <View style={[styles.reportCountBadge, { backgroundColor: "#ef4444" }]}>
            <Feather name="flag" size={10} color="#fff" />
            <Text style={styles.reportCountText}>{p.reportCount}</Text>
          </View>
        )}
      </View>

      {/* Metadata */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {p.category    && <MetaRow icon="tag"      label={p.category}                                         colors={colors} />}
        {(p.brand || p.model) && <MetaRow icon="box" label={[p.brand, p.model].filter(Boolean).join(" · ")} colors={colors} />}
        {p.sellerName  && <MetaRow icon="user"     label={p.sellerName}                                       colors={colors} />}
        {p.building    && <MetaRow icon="home"     label={p.building}                                         colors={colors} />}
        <MetaRow icon="calendar" label={formatDate(p.createdAt)} colors={colors} />
        {p.condition   && <MetaRow icon="star"     label={CONDITION_LABELS[p.condition] ?? p.condition}       colors={colors} />}
      </View>

      {/* Rejection / note banner */}
      {p.rejectionReason && (
        <View style={[styles.banner, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "30" }]}>
          <Feather name="alert-circle" size={12} color={colors.destructive} />
          <Text style={[styles.bannerText, { color: colors.destructive }]} numberOfLines={2}>{p.rejectionReason}</Text>
        </View>
      )}
      {p.moderationNote && !p.rejectionReason && (
        <View style={[styles.banner, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b30" }]}>
          <Feather name="message-circle" size={12} color="#f59e0b" />
          <Text style={[styles.bannerText, { color: "#f59e0b" }]} numberOfLines={2}>{p.moderationNote}</Text>
        </View>
      )}

      {/* Action pills */}
      <View style={styles.pills}>
        <Pill icon="eye"           label="Voir"      color={colors.primary}      onPress={() => onDetail(p)} />
        {(isPending || p.status === "modification_requested" || isReported) && (
          <Pill icon="check"       label="Approuver" color={colors.success}      loading={moderating === p.id} onPress={() => onApprove(p.id, p.name)} />
        )}
        {isPending && (
          <Pill icon="edit-2"      label="Modifier"  color="#f97316"             onPress={() => onChanges(p.id, p.name)} />
        )}
        {(isPending || p.status === "approved" || isReported) && (
          <Pill icon="x"           label="Rejeter"   color={colors.destructive}  onPress={() => onReject(p.id, p.name)} />
        )}
        {isReported && (
          <Pill icon="flag"        label="Rapports"  color="#dc2626"             onPress={() => onReports(p.id, p.name)} />
        )}
        <Pill icon="external-link" label="Vendeur"   color={colors.mutedForeground} onPress={() => onViewSeller(p.sellerId)} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header:    { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  backBtn:   { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title:     { fontSize: 19, fontWeight: "800" },
  subtitle:  { fontSize: 11, marginTop: 1 },
  rolePill:  { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  rolePillText: { fontSize: 11, fontWeight: "700" },

  // Counter strip
  counterStrip:  { borderBottomWidth: 1 },
  counterScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: "row" },
  counterChip:   { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  counterNum:    { fontSize: 13, fontWeight: "800" },
  counterLabel:  { fontSize: 11, fontWeight: "600" },

  // Tab bar
  tabBar:  { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  tabLabel:{ fontSize: 14, fontWeight: "700" },

  // States
  centered:     { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  loadingText:  { fontSize: 14 },
  emptyTitle:   { fontSize: 17, fontWeight: "700", marginTop: 8 },
  emptySub:     { fontSize: 13, textAlign: "center", maxWidth: 260 },
  dataWarning:  { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1 },
  dataWarningText: { flex: 1, fontSize: 11, lineHeight: 16 },
  dataWarningRetry: { fontSize: 11, fontWeight: "700" },

  // Cards
  list:               { padding: 12, gap: 12 },
  card:               { borderRadius: 12, borderWidth: 1, borderLeftWidth: 4, padding: 14, gap: 10 },
  cardName:           { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  cardPrice:          { fontSize: 16, fontWeight: "800", marginTop: 2 },
  reportCountBadge:   { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
  reportCountText:    { color: "#fff", fontSize: 10, fontWeight: "700" },
  banner:             { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, borderWidth: 1, padding: 8 },
  bannerText:         { flex: 1, fontSize: 12, lineHeight: 17 },
  pills:              { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill:               { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  pillText:           { fontSize: 11, fontWeight: "600" },

  // Modals / sheets
  overlay:    { backgroundColor: "rgba(0,0,0,0.55)" },
  sheet:      { position: "absolute", start: 0, end: 0, bottom: 0, borderTopStartRadius: 24, borderTopEndRadius: 24, padding: 20, maxHeight: "80%" },
  detailSheet:{ position: "absolute", start: 0, end: 0, bottom: 0, borderTopStartRadius: 24, borderTopEndRadius: 24, padding: 20, maxHeight: "90%" },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  sheetSub:   { fontSize: 13, marginBottom: 14 },
  sheetTitleRow:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8 },

  reasonGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  reasonChip:     { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  reasonChipText: { fontSize: 12, fontWeight: "600" },
  textarea:       { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: "top", marginTop: 4 },

  sheetActions:    { flexDirection: "row", gap: 10, marginTop: 16 },
  btnSecondary:    { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  btnSecondaryText:{ fontSize: 14, fontWeight: "600" },
  btnPrimary:      { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  btnPrimaryText:  { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Detail modal
  detailHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  imgThumb:       { width: 96, height: 76, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 8 },
  imgPlaceholder: { height: 96, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  detailTitle:    { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  detailPrice:    { fontSize: 20, fontWeight: "800", marginBottom: 14 },
  infoGrid:       { borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 14 },
  infoRow:        { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  infoLabel:      { fontSize: 12, fontWeight: "600" },
  infoValue:      { fontSize: 12, maxWidth: "60%", textAlign: "right" },
  descText:       { fontSize: 14, lineHeight: 21, marginBottom: 14 },
  alertBox:       { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 10 },
  alertBoxText:   { flex: 1, fontSize: 13, lineHeight: 19 },
  detailActions:  { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 8 },

  // Reports
  reportCard:       { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8, gap: 6 },
  reportTop:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reportBadge:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  reportBadgeText:  { fontSize: 11, fontWeight: "700" },
  reportDate:       { fontSize: 11 },
  reportReporter:   { fontSize: 12 },
  reportDetails:    { fontSize: 13, lineHeight: 19 },
  reportStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
});
