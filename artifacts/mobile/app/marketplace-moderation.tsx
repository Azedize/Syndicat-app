/**
 * Marketplace Moderation Dashboard
 * Accessible by super_admin and syndicate_admin only.
 * Shows all product statuses with full moderation workflow:
 *   PENDING → APPROVED | REJECTED | NEEDS_CHANGES
 * Includes: counters, full product detail, reject reason picker, reports viewer.
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
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { marketplace } from "@/services/api";

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
  pendingReports?: number;
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

const STATUS_TABS: { key: StatusTab; label: string; color: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { key: "pending_review", label: "En attente", color: "#f59e0b", icon: "clock" },
  { key: "approved", label: "Approuvés", color: "#22c55e", icon: "check-circle" },
  { key: "rejected", label: "Rejetés", color: "#ef4444", icon: "x-circle" },
  { key: "modification_requested", label: "Modifs requises", color: "#f97316", icon: "edit-2" },
  { key: "reported", label: "Signalés", color: "#dc2626", icon: "flag" },
  { key: "reserved", label: "Réservés", color: "#6366f1", icon: "lock" },
  { key: "sold", label: "Vendus", color: "#94a3b8", icon: "package" },
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

export default function MarketplaceModerationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [activeTab, setActiveTab] = useState<StatusTab>("pending_review");
  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [moderating, setModerating] = useState<string | null>(null);

  // Reject modal
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Changes modal
  const [changesModal, setChangesModal] = useState(false);
  const [changesTarget, setChangesTarget] = useState<{ id: string; name: string } | null>(null);
  const [changesComment, setChangesComment] = useState("");
  const [changesSubmitting, setChangesSubmitting] = useState(false);

  // Product detail modal
  const [detailModal, setDetailModal] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  // Reports modal
  const [reportsModal, setReportsModal] = useState(false);
  const [reportsTarget, setReportsTarget] = useState<{ id: string; name: string } | null>(null);
  const [reports, setReports] = useState<ProductReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  // ─── Fetch ───────────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async (tab: StatusTab) => {
    try {
      if (tab === "reported") {
        const res = await marketplace.reported();
        setProducts((res.data as Product[]) ?? []);
      } else {
        const res = await marketplace.products({ status: tab });
        setProducts((res.data as Product[]) ?? []);
      }
    } catch {
      setProducts([]);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await marketplace.stats();
      const d = res.data as any;
      setStats({
        pending_review: Number(d?.pending ?? 0),
        approved: Number(d?.approved ?? 0),
        rejected: Number(d?.rejected ?? 0),
        modification_requested: Number(d?.needs_changes ?? 0),
        reported: Number(d?.reported ?? 0),
        reserved: Number(d?.reserved ?? 0),
        sold: Number(d?.sold ?? 0),
      });
    } catch { /* keep stale */ }
  }, []);

  const fetchAll = useCallback(async (tab: StatusTab) => {
    setLoading(true);
    await Promise.all([fetchProducts(tab), fetchStats()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchProducts, fetchStats]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAll(activeTab);
  }, [activeTab, fetchAll, isAdmin]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll(activeTab);
  };

  const switchTab = (tab: StatusTab) => {
    setActiveTab(tab);
    setProducts([]);
  };

  // ─── Moderate actions ────────────────────────────────────────────────────

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
      showToast({ type: "error", title: "Motif requis", message: "Veuillez sélectionner ou saisir un motif de rejet" });
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
    } finally {
      setRejectSubmitting(false);
    }
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
    } finally {
      setChangesSubmitting(false);
    }
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
              showToast({ type: "success", title: "Approuvé", message: "Le vendeur a été notifié" });
              fetchAll(activeTab);
            } catch {
              showToast({ type: "error", title: "Erreur", message: "Approbation impossible" });
            } finally {
              setModerating(null);
            }
          },
        },
      ],
    );
  };

  const openReports = async (id: string, name: string) => {
    setReportsTarget({ id, name });
    setReportsModal(true);
    setReportsLoading(true);
    try {
      const res = await marketplace.productReports(id);
      setReports((res.data as ProductReport[]) ?? []);
    } catch {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  };

  // ─── Access guard ────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.centered, { paddingTop: topPad + 40 }]}>
          <Feather name="lock" size={44} color={colors.destructive} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Accès refusé</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Seuls les administrateurs peuvent accéder à la modération.
          </Text>
        </View>
      </View>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const tabConfig = STATUS_TABS.find((t) => t.key === activeTab)!;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Modération</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Tableau de bord marketplace</Text>
          </View>
          <View style={[styles.adminBadge, { backgroundColor: colors.primary + "15" }]}>
            <Feather name="shield" size={13} color={colors.primary} />
            <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
          </View>
        </View>
      </View>

      {/* Status Counter Strip */}
      <View style={[styles.counterStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.counterScroll}>
          {STATUS_TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.counterChip,
                {
                  backgroundColor: activeTab === t.key ? t.color + "20" : colors.secondary,
                  borderColor: activeTab === t.key ? t.color : "transparent",
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => switchTab(t.key)}
            >
              <Feather name={t.icon} size={13} color={t.color} />
              <Text style={[styles.counterNum, { color: t.color }]}>
                {stats[t.key] ?? "—"}
              </Text>
              <Text style={[styles.counterLabel, { color: activeTab === t.key ? t.color : colors.mutedForeground }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Tab Header */}
      <View style={[styles.tabHeader, { backgroundColor: colors.background }]}>
        <Feather name={tabConfig.icon} size={15} color={tabConfig.color} />
        <Text style={[styles.tabTitle, { color: tabConfig.color }]}>
          {tabConfig.label}
          {products.length > 0 ? ` (${products.length})` : ""}
        </Text>
      </View>

      {/* Product List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Chargement...</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <ProductModerationCard
              product={item}
              tab={activeTab}
              colors={colors}
              moderating={moderating}
              onApprove={handleApprove}
              onReject={openRejectModal}
              onChanges={openChangesModal}
              onDetail={(p) => { setDetailProduct(p); setDetailModal(true); }}
              onReports={(id, name) => openReports(id, name)}
              onViewSeller={(sellerId) => router.push({ pathname: "/member-detail", params: { id: sellerId } } as any)}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name={tabConfig.icon} size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun produit</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Aucun produit avec le statut "{tabConfig.label}".
              </Text>
            </View>
          }
        />
      )}

      {/* ─── Reject Modal ─────────────────────────────────────────────────── */}
      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]}
            onPress={() => setRejectModal(false)}
          />
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Rejeter le produit</Text>
            {rejectTarget && (
              <Text style={[styles.sheetSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {rejectTarget.name}
              </Text>
            )}

            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Motif de rejet</Text>
            <View style={styles.reasonGrid}>
              {REJECT_REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonChip,
                    {
                      backgroundColor: selectedReason === r ? colors.destructive + "20" : colors.secondary,
                      borderColor: selectedReason === r ? colors.destructive : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedReason(r)}
                >
                  {selectedReason === r && (
                    <Feather name="check" size={12} color={colors.destructive} />
                  )}
                  <Text style={[styles.reasonChipText, { color: selectedReason === r ? colors.destructive : colors.foreground }]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedReason === "Autre" && (
              <TextInput
                style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
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
                style={[styles.sheetBtnSecondary, { borderColor: colors.border }]}
                onPress={() => setRejectModal(false)}
              >
                <Text style={[styles.sheetBtnSecondaryText, { color: colors.foreground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sheetBtnPrimary,
                  { backgroundColor: (!selectedReason || (selectedReason === "Autre" && !customReason.trim())) ? colors.secondary : colors.destructive },
                ]}
                onPress={submitReject}
                disabled={!selectedReason || (selectedReason === "Autre" && !customReason.trim()) || rejectSubmitting}
              >
                {rejectSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="x" size={15} color="#fff" />
                    <Text style={styles.sheetBtnPrimaryText}>Rejeter</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Request Changes Modal ────────────────────────────────────────── */}
      <Modal visible={changesModal} transparent animationType="slide" onRequestClose={() => setChangesModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]}
            onPress={() => setChangesModal(false)}
          />
          <View style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Demander des modifications</Text>
            {changesTarget && (
              <Text style={[styles.sheetSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {changesTarget.name}
              </Text>
            )}
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Commentaire pour le vendeur</Text>
            <TextInput
              style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder="Ex : Veuillez ajouter des photos supplémentaires et corriger la catégorie..."
              placeholderTextColor={colors.mutedForeground}
              value={changesComment}
              onChangeText={setChangesComment}
              multiline
              maxLength={1000}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.sheetBtnSecondary, { borderColor: colors.border }]}
                onPress={() => setChangesModal(false)}
              >
                <Text style={[styles.sheetBtnSecondaryText, { color: colors.foreground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtnPrimary, { backgroundColor: !changesComment.trim() ? colors.secondary : "#f97316" }]}
                onPress={submitChanges}
                disabled={!changesComment.trim() || changesSubmitting}
              >
                {changesSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="edit-2" size={15} color="#fff" />
                    <Text style={styles.sheetBtnPrimaryText}>Envoyer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Product Detail Modal ─────────────────────────────────────────── */}
      <Modal visible={detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]}
            onPress={() => setDetailModal(false)}
          />
          <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            {detailProduct && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Status badge */}
                <View style={styles.detailStatusRow}>
                  <StatusBadge status={detailProduct.status} colors={colors} />
                  <TouchableOpacity onPress={() => setDetailModal(false)}>
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* Image placeholder */}
                {(() => {
                  const imgs = parseImageUrls(detailProduct.imageUrls);
                  return imgs.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                      {imgs.map((url, i) => (
                        <View key={i} style={[styles.imgThumb, { backgroundColor: colors.secondary }]}>
                          <Feather name="image" size={28} color={colors.mutedForeground} />
                          <Text style={{ fontSize: 9, color: colors.mutedForeground, marginTop: 2 }}>Photo {i + 1}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={[styles.imgPlaceholder, { backgroundColor: colors.secondary }]}>
                      <Feather name="shopping-bag" size={36} color={colors.mutedForeground} />
                      <Text style={[{ fontSize: 12, color: colors.mutedForeground, marginTop: 6 }]}>Aucune photo</Text>
                    </View>
                  );
                })()}

                <Text style={[styles.detailTitle, { color: colors.foreground }]}>{detailProduct.name ?? ""}</Text>
                <Text style={[styles.detailPrice, { color: colors.primary }]}>{formatMAD(detailProduct.price)} MAD</Text>

                {/* Info grid */}
                <View style={[styles.infoGrid, { borderColor: colors.border }]}>
                  {[
                    { label: "Catégorie", value: detailProduct.category },
                    { label: "Marque", value: detailProduct.brand },
                    { label: "Modèle", value: detailProduct.model },
                    { label: "État", value: CONDITION_LABELS[detailProduct.condition ?? ""] ?? detailProduct.condition },
                    { label: "Localisation", value: detailProduct.location },
                    { label: "Bâtiment", value: detailProduct.building },
                    { label: "Vendeur", value: detailProduct.sellerName },
                    { label: "Soumis le", value: formatDate(detailProduct.createdAt) },
                    { label: "Modéré le", value: formatDate(detailProduct.moderatedAt) },
                  ].filter((row) => row.value).map((row) => (
                    <View key={row.label} style={[styles.infoRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[styles.infoValue, { color: colors.foreground }]}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                {detailProduct.description ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Description</Text>
                    <Text style={[styles.descText, { color: colors.mutedForeground }]}>{detailProduct.description}</Text>
                  </>
                ) : null}

                {detailProduct.rejectionReason ? (
                  <View style={[styles.reasonBox, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "40" }]}>
                    <Feather name="alert-circle" size={14} color={colors.destructive} />
                    <Text style={[styles.reasonBoxText, { color: colors.destructive }]}>{detailProduct.rejectionReason}</Text>
                  </View>
                ) : null}

                {detailProduct.moderationNote ? (
                  <View style={[styles.reasonBox, { backgroundColor: "#f59e0b12", borderColor: "#f59e0b40" }]}>
                    <Feather name="message-circle" size={14} color="#f59e0b" />
                    <Text style={[styles.reasonBoxText, { color: "#f59e0b" }]}>{detailProduct.moderationNote}</Text>
                  </View>
                ) : null}

                {/* Actions for pending */}
                {detailProduct.status === "pending_review" && (
                  <View style={styles.detailActions}>
                    <ActionBtn
                      label="Approuver"
                      icon="check"
                      color={colors.success}
                      onPress={() => {
                        setDetailModal(false);
                        handleApprove(detailProduct.id, detailProduct.name);
                      }}
                    />
                    <ActionBtn
                      label="Modifications"
                      icon="edit-2"
                      color="#f97316"
                      onPress={() => {
                        setDetailModal(false);
                        openChangesModal(detailProduct.id, detailProduct.name);
                      }}
                    />
                    <ActionBtn
                      label="Rejeter"
                      icon="x"
                      color={colors.destructive}
                      onPress={() => {
                        setDetailModal(false);
                        openRejectModal(detailProduct.id, detailProduct.name);
                      }}
                    />
                  </View>
                )}

                <View style={{ height: 32 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Reports Modal ────────────────────────────────────────────────── */}
      <Modal visible={reportsModal} transparent animationType="slide" onRequestClose={() => setReportsModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]}
            onPress={() => setReportsModal(false)}
          />
          <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
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
              <View style={[styles.centered, { flex: 0, paddingVertical: 40 }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : reports.length === 0 ? (
              <View style={[styles.centered, { flex: 0, paddingVertical: 40 }]}>
                <Feather name="flag" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptySub, { color: colors.mutedForeground, marginTop: 8 }]}>Aucun signalement</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {reports.map((r) => (
                  <View key={r.id} style={[styles.reportCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={styles.reportHeader}>
                      <View style={[styles.reportBadge, { backgroundColor: colors.destructive + "20" }]}>
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
                    <View style={[styles.reportStatusRow, { backgroundColor: r.status === "pending" ? "#f59e0b15" : "#22c55e15" }]}>
                      <Text style={{ fontSize: 11, color: r.status === "pending" ? "#f59e0b" : "#22c55e", fontWeight: "600" }}>
                        {r.status === "pending" ? "En attente de traitement" : "Traité"}
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, colors }: { status: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  const STATUS_COLORS: Record<string, string> = {
    approved: "#22c55e",
    pending_review: "#f59e0b",
    rejected: "#ef4444",
    modification_requested: "#f97316",
    sold_out: "#94a3b8",
    reserved: "#6366f1",
    sold: "#94a3b8",
  };
  const STATUS_LABELS: Record<string, string> = {
    approved: "Approuvé",
    pending_review: "En attente",
    rejected: "Rejeté",
    modification_requested: "Modifs requises",
    sold_out: "Épuisé",
    reserved: "Réservé",
    sold: "Vendu",
  };
  const color = STATUS_COLORS[status] ?? colors.mutedForeground;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: color + "18" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: "700", color }}>{STATUS_LABELS[status] ?? status}</Text>
    </View>
  );
}

function ActionBtn({ label, icon, color, onPress }: { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={{ flex: 1, flexDirection: "column", alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: color + "18" }}
      onPress={onPress}
    >
      <Feather name={icon} size={18} color={color} />
      <Text style={{ fontSize: 11, fontWeight: "700", color }}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProductModerationCard({
  product: p,
  tab,
  colors,
  moderating,
  onApprove,
  onReject,
  onChanges,
  onDetail,
  onReports,
  onViewSeller,
}: {
  product: Product;
  tab: StatusTab;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  moderating: string | null;
  onApprove: (id: string, name: string) => void;
  onReject: (id: string, name: string) => void;
  onChanges: (id: string, name: string) => void;
  onDetail: (p: Product) => void;
  onReports: (id: string, name: string) => void;
  onViewSeller: (sellerId: string) => void;
}) {
  const isPending = p.status === "pending_review";
  const isReported = tab === "reported";
  const borderColor = tab === "pending_review"
    ? "#f59e0b"
    : tab === "rejected"
    ? "#ef4444"
    : tab === "modification_requested"
    ? "#f97316"
    : tab === "reported"
    ? "#dc2626"
    : tab === "approved"
    ? "#22c55e"
    : tab === "reserved"
    ? "#6366f1"
    : "#94a3b8";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: borderColor + "30", borderLeftColor: borderColor }]}>
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>{p.name ?? ""}</Text>
          <Text style={[styles.cardPrice, { color: colors.primary }]}>{formatMAD(p.price)} MAD</Text>
        </View>
        {(p.reportCount ?? 0) > 0 && (
          <View style={[styles.reportCountBadge, { backgroundColor: "#ef4444" }]}>
            <Feather name="flag" size={10} color="#fff" />
            <Text style={styles.reportCountText}>{p.reportCount}</Text>
          </View>
        )}
      </View>

      {/* Meta grid */}
      <View style={styles.metaGrid}>
        {p.category ? <MetaRow icon="tag" label={p.category} colors={colors} /> : null}
        {p.brand || p.model ? <MetaRow icon="box" label={[p.brand, p.model].filter(Boolean).join(" · ")} colors={colors} /> : null}
        {p.sellerName ? <MetaRow icon="user" label={p.sellerName} colors={colors} /> : null}
        {p.building ? <MetaRow icon="home" label={p.building} colors={colors} /> : null}
        <MetaRow icon="calendar" label={formatDate(p.createdAt)} colors={colors} />
        {p.condition ? <MetaRow icon="star" label={CONDITION_LABELS[p.condition] ?? p.condition} colors={colors} /> : null}
      </View>

      {/* Rejection reason */}
      {p.rejectionReason ? (
        <View style={[styles.rejectionBox, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "30" }]}>
          <Feather name="alert-circle" size={12} color={colors.destructive} />
          <Text style={[styles.rejectionText, { color: colors.destructive }]} numberOfLines={2}>{p.rejectionReason}</Text>
        </View>
      ) : null}

      {/* Moderation note */}
      {p.moderationNote && !p.rejectionReason ? (
        <View style={[styles.rejectionBox, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b30" }]}>
          <Feather name="message-circle" size={12} color="#f59e0b" />
          <Text style={[styles.rejectionText, { color: "#f59e0b" }]} numberOfLines={2}>{p.moderationNote}</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={styles.actions}>
        {/* View detail always visible */}
        <ActionPill icon="eye" label="Voir" color={colors.primary} onPress={() => onDetail(p)} />

        {/* Approve — pending, modification_requested, reported */}
        {(isPending || p.status === "modification_requested" || isReported) && (
          <ActionPill
            icon="check"
            label="Approuver"
            color={colors.success}
            loading={moderating === p.id}
            onPress={() => onApprove(p.id, p.name)}
          />
        )}

        {/* Request changes — pending */}
        {isPending && (
          <ActionPill
            icon="edit-2"
            label="Modifier"
            color="#f97316"
            onPress={() => onChanges(p.id, p.name)}
          />
        )}

        {/* Reject — pending, approved, reported */}
        {(isPending || p.status === "approved" || isReported) && (
          <ActionPill
            icon="x"
            label="Rejeter"
            color={colors.destructive}
            onPress={() => onReject(p.id, p.name)}
          />
        )}

        {/* View reports */}
        {isReported && (
          <ActionPill icon="flag" label="Rapports" color="#dc2626" onPress={() => onReports(p.id, p.name)} />
        )}

        {/* View seller */}
        <ActionPill
          icon="external-link"
          label="Vendeur"
          color={colors.mutedForeground}
          onPress={() => onViewSeller(p.sellerId)}
        />
      </View>
    </View>
  );
}

function MetaRow({ icon, label, colors }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  return (
    <View style={styles.metaRow}>
      <Feather name={icon} size={11} color={colors.mutedForeground} />
      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ActionPill({ icon, label, color, loading, onPress }: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  color: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.pill, { backgroundColor: color + "15", borderColor: color + "30" }]}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Feather name={icon} size={12} color={color} />
      )}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 1 },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 16 },
  adminBadgeText: { fontSize: 11, fontWeight: "700" },

  counterStrip: { borderBottomWidth: 1 },
  counterScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: "row" },
  counterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  counterNum: { fontSize: 13, fontWeight: "800" },
  counterLabel: { fontSize: 11, fontWeight: "600" },

  tabHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  tabTitle: { fontSize: 14, fontWeight: "700" },

  list: { padding: 12, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  loadingText: { fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  emptySub: { fontSize: 13, textAlign: "center", maxWidth: 260 },

  // Cards
  card: { borderRadius: 12, borderWidth: 1, borderLeftWidth: 4, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardName: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  cardPrice: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  reportCountBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
  reportCountText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11 },

  rejectionBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, borderWidth: 1, padding: 8 },
  rejectionText: { flex: 1, fontSize: 12, lineHeight: 17 },

  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  pillText: { fontSize: 11, fontWeight: "600" },

  // Modals
  bottomSheet: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    padding: 20,
    gap: 0,
    maxHeight: "80%",
  },
  detailSheet: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  sheetSub: { fontSize: 13, marginBottom: 14 },
  sheetTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  sectionLabel: { fontSize: 13, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  reasonChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  reasonChipText: { fontSize: 12, fontWeight: "600" },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 100, textAlignVertical: "top", marginTop: 4 },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  sheetBtnSecondary: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  sheetBtnSecondaryText: { fontSize: 14, fontWeight: "600" },
  sheetBtnPrimary: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
  sheetBtnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Detail modal
  detailStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  imgThumb: { width: 100, height: 80, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 8 },
  imgPlaceholder: { height: 100, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  detailTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  detailPrice: { fontSize: 20, fontWeight: "800", marginBottom: 14 },
  infoGrid: { borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  infoLabel: { fontSize: 12, fontWeight: "600" },
  infoValue: { fontSize: 12, maxWidth: "60%", textAlign: "right" },
  descText: { fontSize: 14, lineHeight: 21, marginBottom: 14 },
  reasonBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 10 },
  reasonBoxText: { flex: 1, fontSize: 13, lineHeight: 19 },
  detailActions: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 8 },

  // Reports
  reportCard: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8, gap: 6 },
  reportHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reportBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  reportBadgeText: { fontSize: 11, fontWeight: "700" },
  reportDate: { fontSize: 11 },
  reportReporter: { fontSize: 12 },
  reportDetails: { fontSize: 13, lineHeight: 19 },
  reportStatusRow: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
});
