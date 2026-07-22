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
import FilterChips from "@/components/FilterChips";
import FilterTabs from "@/components/FilterTabs";
import { marketplace } from "@/services/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMAD(price: string | number | null | undefined): string {
  const n = Number(price ?? 0);
  if (isNaN(n)) return "0";
  try { return n.toLocaleString("fr-FR"); } catch { return String(Math.round(n)); }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  condition: string;
  location: string;
  building?: string;
  stock: number;
  sellerId: string;
  sellerName: string;
  status: string;
  featured: boolean;
  boosted: boolean;
  viewCount: number;
  createdAt: string;
  rejectionReason?: string | null;
  moderationNote?: string | null;
  reservedByName?: string | null;
  reportCount?: number;
};

const CATEGORIES = ["Tous", "Électroménager", "Meubles", "Vêtements", "Électronique", "Sport", "Livres", "Autre"];
const CONDITION_LABELS: Record<string, string> = { neuf: "Neuf", bon: "Bon état", acceptable: "Acceptable", mauvais: "Mauvais état" };

const STATUS_COLORS: Record<string, string> = {
  approved: "#22c55e",
  pending_review: "#f59e0b",
  rejected: "#ef4444",
  modification_requested: "#f97316",
  sold_out: "#94a3b8",
  reserved: "#6366f1",
  sold: "#94a3b8",
};

type AdminTab = "catalogue" | "validation" | "signales" | "commandes" | "stats";

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MarketplaceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [products, setProducts] = useState<Product[]>([]);
  const [pending, setPending] = useState<Product[]>([]);
  const [reported, setReported] = useState<Product[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [adminTab, setAdminTab] = useState<AdminTab>("catalogue");
  const [moderating, setModerating] = useState<string | null>(null);

  // Request modification modal
  const [showModModal, setShowModModal] = useState(false);
  const [modProductId, setModProductId] = useState("");
  const [modProductName, setModProductName] = useState("");
  const [modReason, setModReason] = useState("");
  const [submittingMod, setSubmittingMod] = useState(false);

  // Reject with reason modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectProductId, setRejectProductId] = useState("");
  const [rejectProductName, setRejectProductName] = useState("");
  const [selectedRejectReason, setSelectedRejectReason] = useState("");
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);

  // RBAC: super_admin = platform owner with full moderation rights
  //       syndicate_admin = organisation admin — read-only marketplace view, no moderation
  const isSuperAdmin = user?.role === "super_admin";
  const isSyndicateAdmin = user?.role === "syndicate_admin";
  const isAdmin = isSuperAdmin || isSyndicateAdmin;

  // ─── Fetch ─────────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (category !== "Tous") params.category = category;
      if (search.trim()) params.search = search.trim();
      const res = await marketplace.products(params);
      setProducts((res.data as Product[]) ?? []);
    } catch { /* keep stale */ }
  }, [category, search]);

  const fetchPending = useCallback(async () => {
    if (!isSuperAdmin) return; // moderation queue is super_admin only
    try {
      const res = await marketplace.pending();
      setPending((res.data as Product[]) ?? []);
    } catch { /* keep stale */ }
  }, [isSuperAdmin]);

  const fetchReported = useCallback(async () => {
    if (!isSuperAdmin) return; // reported queue is super_admin only
    try {
      const res = await marketplace.reported();
      setReported((res.data as Product[]) ?? []);
    } catch { /* keep stale */ }
  }, [isSuperAdmin]);

  const fetchStats = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await marketplace.stats();
      setStats(res.data);
    } catch { /* keep stale */ }
  }, [isAdmin]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchProducts(), fetchPending(), fetchReported(), fetchStats()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchProducts, fetchPending, fetchReported, fetchStats]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  // ─── Moderate ──────────────────────────────────────────────────────────

  const handleModerate = (id: string, action: "approve" | "reject", productName: string) => {
    if (action === "reject") {
      // Open reason picker modal instead of plain Alert
      setRejectProductId(id);
      setRejectProductName(productName);
      setSelectedRejectReason("");
      setCustomRejectReason("");
      setShowRejectModal(true);
      return;
    }
    Alert.alert(
      "Approuver le produit",
      `Approuver "${productName}" et le rendre visible ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Approuver",
          onPress: async () => {
            setModerating(id);
            try {
              await marketplace.moderate(id, { action: "approve" });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await Promise.all([fetchProducts(), fetchPending(), fetchStats()]);
            } catch {
              showToast({ type: "error", title: "Erreur", message: "Action de modération impossible" });
            } finally {
              setModerating(null);
            }
          },
        },
      ],
    );
  };

  const REJECT_REASONS = [
    "Contenu inapproprié",
    "Informations manquantes",
    "Mauvaise catégorie",
    "Annonce en double",
    "Article prohibé",
    "Autre",
  ];

  const submitRejectWithReason = async () => {
    const reason = selectedRejectReason === "Autre" ? customRejectReason.trim() : selectedRejectReason;
    if (!reason) return;
    setSubmittingReject(true);
    try {
      await marketplace.moderate(rejectProductId, { action: "reject", reason });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRejectModal(false);
      await Promise.all([fetchProducts(), fetchPending(), fetchStats()]);
      showToast({ type: "success", title: "Produit rejeté", message: "Le vendeur a été notifié" });
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Rejet impossible" });
    } finally {
      setSubmittingReject(false);
    }
  };

  const openRequestMod = (id: string, name: string) => {
    setModProductId(id);
    setModProductName(name);
    setModReason("");
    setShowModModal(true);
  };

  const submitModRequest = async () => {
    if (!modReason.trim()) return;
    setSubmittingMod(true);
    try {
      await marketplace.moderate(modProductId, { action: "request_modification", reason: modReason.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModModal(false);
      await Promise.all([fetchProducts(), fetchPending(), fetchStats()]);
      showToast({ type: "success", title: "Modifications demandées", message: "Le vendeur a été notifié" });
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Impossible d'envoyer la demande" });
    } finally {
      setSubmittingMod(false);
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────

  const renderProductCard = ({ item: p }: { item: Product }) => {
    const price = formatMAD(p.price) + " MAD";
    const isReserved = p.status === "reserved";
    const isSold = p.status === "sold";
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: isSold ? 0.65 : 1 }]}
        onPress={() => { router.push({ pathname: "/product-detail", params: { id: p.id } } as any); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        activeOpacity={0.8}
      >
        <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.secondary }]}>
          {p.featured && (
            <View style={[styles.featuredBadge, { backgroundColor: "#f59e0b" }]}>
              <Feather name="star" size={10} color="#fff" />
              <Text style={styles.featuredBadgeText}>Vedette</Text>
            </View>
          )}
          {isReserved && (
            <View style={[styles.reservedBadge, { backgroundColor: "#6366f1" }]}>
              <Feather name="lock" size={10} color="#fff" />
              <Text style={styles.featuredBadgeText}>Réservé</Text>
            </View>
          )}
          {isSold && (
            <View style={[styles.reservedBadge, { backgroundColor: "#94a3b8" }]}>
              <Feather name="check-circle" size={10} color="#fff" />
              <Text style={styles.featuredBadgeText}>Vendu</Text>
            </View>
          )}
          <Feather name="shopping-bag" size={28} color={colors.mutedForeground} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>{p.name ?? ""}</Text>
          <Text style={[styles.cardPrice, { color: colors.primary }]}>{price}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.conditionBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.conditionText, { color: colors.mutedForeground }]}>
                {CONDITION_LABELS[p.condition] ?? p.condition ?? ""}
              </Text>
            </View>
            {p.location ? (
              <View style={styles.locationRow}>
                <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]} numberOfLines={1}>{p.location}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.sellerRow}>
            <Feather name="user" size={11} color={colors.mutedForeground} />
            <Text style={[styles.sellerText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {p.sellerName ?? ""}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPendingCard = ({ item: p }: { item: Product }) => (
    <View style={[styles.pendingCard, { backgroundColor: colors.card, borderColor: "#f59e0b40", borderLeftColor: "#f59e0b" }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pendingName, { color: colors.foreground }]}>{p.name ?? ""}</Text>
        <Text style={[styles.pendingMeta, { color: colors.mutedForeground }]}>
          {formatMAD(p.price)} MAD · {p.category ?? ""} · {CONDITION_LABELS[p.condition] ?? p.condition ?? ""}
        </Text>
        <Text style={[styles.pendingMeta, { color: colors.mutedForeground }]}>Vendeur : {p.sellerName}</Text>
        {p.description ? (
          <Text style={[styles.pendingDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{p.description}</Text>
        ) : null}
      </View>
      <View style={styles.pendingActions}>
        <TouchableOpacity
          style={[styles.modBtn, { backgroundColor: colors.success + "15" }]}
          onPress={() => handleModerate(p.id, "approve", p.name)}
          disabled={moderating === p.id}
        >
          {moderating === p.id ? (
            <ActivityIndicator size="small" color={colors.success} />
          ) : (
            <>
              <Feather name="check" size={14} color={colors.success} />
              <Text style={[styles.modBtnText, { color: colors.success }]}>Approuver</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modBtn, { backgroundColor: "#f9731615" }]}
          onPress={() => openRequestMod(p.id, p.name)}
          disabled={moderating === p.id}
        >
          <Feather name="edit" size={14} color="#f97316" />
          <Text style={[styles.modBtnText, { color: "#f97316" }]}>Modifier</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modBtn, { backgroundColor: colors.destructive + "15" }]}
          onPress={() => handleModerate(p.id, "reject", p.name)}
          disabled={moderating === p.id}
        >
          <Feather name="x" size={14} color={colors.destructive} />
          <Text style={[styles.modBtnText, { color: colors.destructive }]}>Rejeter</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modBtn, { backgroundColor: colors.primary + "10" }]}
          onPress={() => { router.push({ pathname: "/product-detail", params: { id: p.id } } as any); }}
        >
          <Feather name="eye" size={14} color={colors.primary} />
          <Text style={[styles.modBtnText, { color: colors.primary }]}>Voir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderReportedCard = ({ item: p }: { item: Product }) => (
    <View style={[styles.pendingCard, { backgroundColor: colors.card, borderColor: colors.destructive + "40", borderLeftColor: colors.destructive }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Text style={[styles.pendingName, { color: colors.foreground }]}>{p.name ?? ""}</Text>
          {(p as any).reportCount > 0 && (
            <View style={[styles.reportBadge, { backgroundColor: colors.destructive }]}>
              <Text style={styles.reportBadgeText}>{(p as any).reportCount}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.pendingMeta, { color: colors.mutedForeground }]}>
          Statut : {p.status} · Vendeur : {p.sellerName}
        </Text>
        {p.moderationNote ? (
          <Text style={[styles.pendingDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{p.moderationNote}</Text>
        ) : null}
      </View>
      <View style={styles.pendingActions}>
        <TouchableOpacity
          style={[styles.modBtn, { backgroundColor: colors.primary + "10" }]}
          onPress={() => { router.push({ pathname: "/product-detail", params: { id: p.id } } as any); }}
        >
          <Feather name="eye" size={14} color={colors.primary} />
          <Text style={[styles.modBtnText, { color: colors.primary }]}>Examiner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modBtn, { backgroundColor: colors.destructive + "15" }]}
          onPress={() => handleModerate(p.id, "reject", p.name)}
          disabled={moderating === p.id}
        >
          <Feather name="x" size={14} color={colors.destructive} />
          <Text style={[styles.modBtnText, { color: colors.destructive }]}>Rejeter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Main render ────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Marketplace</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {isSuperAdmin
                ? `${pending.length} en attente · ${reported.length} signalé${reported.length !== 1 ? "s" : ""}`
                : isSyndicateAdmin
                ? "Vue lecture seule"
                : `${products.length} produit${products.length !== 1 ? "s" : ""} disponible${products.length !== 1 ? "s" : ""}`}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {isSuperAdmin ? (
              // Super Admin — full moderation access + dashboard shortcut
              <>
                <TouchableOpacity
                  style={[styles.headerBtn, { backgroundColor: colors.primary + "15" }]}
                  onPress={() => { router.push("/admin/marketplace" as any); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  accessibilityLabel="Tableau de modération"
                >
                  <Feather name="shield" size={18} color={colors.primary} />
                </TouchableOpacity>
                <View style={[styles.adminBadge, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="shield" size={14} color={colors.primary} />
                  <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Super Admin</Text>
                </View>
              </>
            ) : isSyndicateAdmin ? (
              // Syndicate Admin — read-only view, no moderation shortcut
              <View style={[styles.adminBadge, { backgroundColor: colors.secondary }]}>
                <Feather name="eye" size={13} color={colors.mutedForeground} />
                <Text style={[styles.adminBadgeText, { color: colors.mutedForeground }]}>Lecture seule</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.headerBtn, { backgroundColor: colors.secondary }]}
                  onPress={() => { router.push("/favorites" as any); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Feather name="heart" size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.headerBtn, { backgroundColor: colors.primary + "15" }]}
                  onPress={() => { router.push("/cart"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Feather name="shopping-cart" size={20} color={colors.primary} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {!isAdmin && (
          <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Rechercher un produit, vendeur..."
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      {/* Tabs — Super Admin gets moderation queues; Syndicate Admin gets read-only tabs */}
      {isAdmin ? (
        <FilterTabs
          options={[
            { key: "catalogue", label: "Catalogue" },
            // Validation + Signalés: super_admin moderation queues only
            ...(isSuperAdmin ? [
              { key: "validation", label: `Validation (${pending.length})` },
              { key: "signales",   label: `Signalés (${reported.length})` },
            ] : []),
            { key: "commandes", label: "Commandes" },
            { key: "stats",     label: "Stats" },
          ]}
          value={adminTab}
          onChange={(k) => {
            // Redirect syndicate_admin away from moderation tabs if URL-navigated directly
            if (!isSuperAdmin && (k === "validation" || k === "signales")) return;
            setAdminTab(k as AdminTab);
          }}
          accentColor={colors.primary}
        />
      ) : (
        <FilterChips
          options={CATEGORIES.map((cat) => ({ key: cat, label: cat }))}
          value={category}
          onChange={setCategory}
          accentColor={colors.primary}
        />
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Chargement du marketplace...</Text>
        </View>
      ) : isSuperAdmin && adminTab === "validation" ? (
        // Moderation queue — super_admin only
        <FlatList
          key="validation-list"
          data={pending}
          keyExtractor={(p) => p.id}
          renderItem={renderPendingCard}
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="check-circle" size={44} color={colors.success} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>File vide !</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Aucun produit en attente de validation.</Text>
            </View>
          }
        />
      ) : isSuperAdmin && adminTab === "signales" ? (
        // Reported queue — super_admin only
        <FlatList
          key="signales-list"
          data={reported}
          keyExtractor={(p) => p.id}
          renderItem={renderReportedCard}
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="flag" size={44} color={colors.success} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun signalement</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Aucun produit signalé en attente d'examen.</Text>
            </View>
          }
        />
      ) : isAdmin && adminTab === "commandes" ? (
        <OrdersAdminView colors={colors} insets={insets} isWide={isWide} refreshing={refreshing} onRefresh={onRefresh} />
      ) : isAdmin && adminTab === "stats" ? (
        <StatsView colors={colors} insets={insets} isWide={isWide} stats={stats} refreshing={refreshing} onRefresh={onRefresh} />
      ) : (
        <FlatList
          key="catalogue-list"
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={renderProductCard}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="shopping-bag" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {search ? "Aucun résultat" : "Marketplace vide"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                {search ? `Aucun produit ne correspond à "${search}"` : "Soyez le premier à publier un produit !"}
              </Text>
            </View>
          }
        />
      )}

      {/* Sell FAB — visible to members */}
      {!isAdmin && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary, bottom: isWide ? 24 : insets.bottom + 80 }]}
          onPress={() => { router.push("/my-shop"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
        >
          <Feather name="plus" size={22} color="#fff" />
          <Text style={styles.fabText}>Vendre</Text>
        </TouchableOpacity>
      )}

      {/* Reject with reason modal */}
      <Modal visible={showRejectModal} transparent animationType="slide" onRequestClose={() => setShowRejectModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={() => setShowRejectModal(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rejeter le produit</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 12 }} numberOfLines={1}>{rejectProductName}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 }}>Motif de rejet</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {["Contenu inapproprié", "Informations manquantes", "Mauvaise catégorie", "Annonce en double", "Article prohibé", "Autre"].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    backgroundColor: selectedRejectReason === r ? colors.destructive + "18" : colors.secondary,
                    borderColor: selectedRejectReason === r ? colors.destructive : colors.border,
                  }}
                  onPress={() => setSelectedRejectReason(r)}
                >
                  {selectedRejectReason === r && <Feather name="check" size={11} color={colors.destructive} />}
                  <Text style={{ fontSize: 12, fontWeight: "600", color: selectedRejectReason === r ? colors.destructive : colors.foreground }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedRejectReason === "Autre" && (
              <TextInput
                style={[styles.modInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background, minHeight: 70 }]}
                placeholder="Précisez le motif..."
                placeholderTextColor={colors.mutedForeground}
                value={customRejectReason}
                onChangeText={setCustomRejectReason}
                multiline
                maxLength={500}
              />
            )}
            <TouchableOpacity
              style={[styles.modSubmitBtn, { backgroundColor: (!selectedRejectReason || (selectedRejectReason === "Autre" && !customRejectReason.trim())) ? colors.secondary : colors.destructive, marginTop: 12 }]}
              onPress={submitRejectWithReason}
              disabled={!selectedRejectReason || (selectedRejectReason === "Autre" && !customRejectReason.trim()) || submittingReject}
            >
              {submittingReject ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modSubmitText}>Rejeter le produit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Request modification modal */}
      <Modal visible={showModModal} transparent animationType="slide" onRequestClose={() => setShowModModal(false)}>
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={() => setShowModModal(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Demander des modifications</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 10 }}>{modProductName}</Text>
            <TextInput
              style={[styles.modInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder="Décrivez les modifications requises (images manquantes, catégorie incorrecte, etc.)"
              placeholderTextColor={colors.mutedForeground}
              value={modReason}
              onChangeText={setModReason}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.modSubmitBtn, { backgroundColor: !modReason.trim() ? colors.secondary : "#f97316" }]}
              onPress={submitModRequest}
              disabled={!modReason.trim() || submittingMod}
            >
              {submittingMod ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modSubmitText}>Envoyer la demande</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Orders admin sub-view ────────────────────────────────────────────────────

function OrdersAdminView({ colors, insets, isWide, refreshing, onRefresh }: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: ReturnType<typeof import("react-native-safe-area-context").useSafeAreaInsets>;
  isWide: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    marketplace.orders().then((r) => { setOrders((r.data as any[]) ?? []); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>;

  const statusColors: Record<string, string> = { pending: "#f59e0b", confirmed: colors.primary, shipped: "#6366f1", delivered: colors.success, cancelled: colors.destructive };
  const statusLabels: Record<string, string> = { pending: "En attente", confirmed: "Confirmé", shipped: "Expédié", delivered: "Livré", cancelled: "Annulé" };

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListEmptyComponent={
        <View style={styles.empty}><Feather name="package" size={44} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune commande</Text></View>
      }
      renderItem={({ item: o }) => (
        <View style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.orderName, { color: colors.foreground }]}>{o.productName}</Text>
            <Text style={[styles.orderMeta, { color: colors.mutedForeground }]}>{o.buyerName} → {o.sellerName}</Text>
            <Text style={[styles.orderAmount, { color: colors.primary }]}>{Number(o.amount).toLocaleString("fr-FR")} MAD</Text>
          </View>
          <View style={[styles.orderStatus, { backgroundColor: (statusColors[o.status] ?? colors.mutedForeground) + "20" }]}>
            <Text style={[styles.orderStatusText, { color: statusColors[o.status] ?? colors.mutedForeground }]}>{statusLabels[o.status] ?? o.status}</Text>
          </View>
        </View>
      )}
    />
  );
}

// ─── Stats sub-view ───────────────────────────────────────────────────────────

function StatsView({ colors, insets, isWide, stats, refreshing, onRefresh }: {
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  insets: ReturnType<typeof import("react-native-safe-area-context").useSafeAreaInsets>;
  isWide: boolean;
  stats: any;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  if (!stats) return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>;

  const kpis = [
    { label: "En attente", value: stats.pending, color: "#f59e0b", icon: "clock" as const },
    { label: "Approuvés", value: stats.approved, color: colors.success, icon: "check-circle" as const },
    { label: "Réservés", value: stats.reserved, color: "#6366f1", icon: "lock" as const },
    { label: "Vendus", value: stats.sold, color: "#94a3b8", icon: "check-circle" as const },
    { label: "Rejetés", value: stats.rejected, color: colors.destructive, icon: "x-circle" as const },
    { label: "Signalés", value: stats.reported, color: colors.destructive, icon: "flag" as const },
  ];

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {kpis.map((k) => (
          <View key={k.label} style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border, width: "47%" }]}>
            <Feather name={k.icon} size={18} color={k.color} />
            <Text style={{ fontSize: 26, fontWeight: "800", color: k.color }}>{k.value}</Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{k.label}</Text>
          </View>
        ))}
      </View>

      {stats.topSellers?.length > 0 && (
        <>
          <Text style={[styles.sectionHeader, { color: colors.foreground }]}>Top vendeurs</Text>
          {stats.topSellers.map((s: any, i: number) => (
            <View key={s.sellerId ?? i} style={[styles.rankRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.rankNum, { color: colors.primary }]}>#{i + 1}</Text>
              <Text style={[styles.rankName, { color: colors.foreground }]}>{s.sellerName ?? "—"}</Text>
              <Text style={[styles.rankValue, { color: colors.mutedForeground }]}>{s.totalSold} vente{s.totalSold !== 1 ? "s" : ""}</Text>
            </View>
          ))}
        </>
      )}

      {stats.mostViewed?.length > 0 && (
        <>
          <Text style={[styles.sectionHeader, { color: colors.foreground }]}>Produits les plus vus</Text>
          {stats.mostViewed.map((p: any, i: number) => (
            <View key={p.id ?? i} style={[styles.rankRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="eye" size={13} color={colors.mutedForeground} />
              <Text style={[styles.rankName, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.rankValue, { color: colors.mutedForeground }]}>{p.viewCount} vues</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  adminBadgeText: { fontSize: 12, fontWeight: "700" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  list: { padding: 12, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  loadingText: { fontSize: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptySub: { fontSize: 14, textAlign: "center", maxWidth: 280 },
  card: { flex: 1, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  cardImagePlaceholder: { height: 110, alignItems: "center", justifyContent: "center" },
  featuredBadge: { position: "absolute", top: 6, start: 6, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  reservedBadge: { position: "absolute", top: 6, end: 6, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  featuredBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  cardBody: { padding: 10, gap: 4 },
  cardName: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  cardPrice: { fontSize: 15, fontWeight: "800" },
  cardMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  conditionBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  conditionText: { fontSize: 10, fontWeight: "600" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  locationText: { fontSize: 10, maxWidth: 80 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  sellerText: { fontSize: 11 },
  pendingCard: { borderRadius: 10, borderWidth: 1, borderStartWidth: 4, padding: 14, gap: 10 },
  pendingName: { fontSize: 15, fontWeight: "700" },
  pendingMeta: { fontSize: 12, marginTop: 2 },
  pendingDesc: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  pendingActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  modBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  modBtnText: { fontSize: 12, fontWeight: "600" },
  reportBadge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  reportBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  orderRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, gap: 10 },
  orderName: { fontSize: 14, fontWeight: "600" },
  orderMeta: { fontSize: 11, marginTop: 2 },
  orderAmount: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  orderStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  orderStatusText: { fontSize: 11, fontWeight: "600" },
  fab: { position: "absolute", end: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 28, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
  fabText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  // Modification modal
  modal: { position: "absolute", start: 0, end: 0, bottom: 0, borderTopStartRadius: 20, borderTopEndRadius: 20, padding: 24, gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  modInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 100, textAlignVertical: "top" },
  modSubmitBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 4 },
  modSubmitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  // Stats
  kpiCard: { borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "center", gap: 4 },
  sectionHeader: { fontSize: 15, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 6 },
  rankNum: { fontSize: 14, fontWeight: "800", width: 24 },
  rankName: { fontSize: 13, fontWeight: "600" },
  rankValue: { fontSize: 12 },
});
