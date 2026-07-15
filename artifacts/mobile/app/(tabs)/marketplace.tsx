import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import FilterChips from "@/components/FilterChips";
import FilterTabs from "@/components/FilterTabs";
import { marketplace } from "@/services/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a price as French locale MAD string without crashing on null/NaN */
function formatMAD(price: string | number | null | undefined): string {
  const n = Number(price ?? 0);
  if (isNaN(n)) return "0";
  try {
    return n.toLocaleString("fr-FR");
  } catch {
    return String(Math.round(n));
  }
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
  stock: number;
  sellerId: string;
  sellerName: string;
  status: string;
  featured: boolean;
  boosted: boolean;
  viewCount: number;
  createdAt: string;
};

const CATEGORIES = ["Tous", "Électroménager", "Meubles", "Vêtements", "Électronique", "Sport", "Livres", "Autre"];
const CONDITION_LABELS: Record<string, string> = { neuf: "Neuf", bon: "Bon état", acceptable: "Acceptable", mauvais: "Mauvais état" };

type AdminTab = "catalogue" | "validation" | "commandes";

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MarketplaceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [products, setProducts] = useState<Product[]>([]);
  const [pending, setPending] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [adminTab, setAdminTab] = useState<AdminTab>("catalogue");
  const [moderating, setModerating] = useState<string | null>(null);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  // ─── Fetch ─────────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (category !== "Tous") params.category = category;
      if (search.trim()) params.search = search.trim();
      const res = await marketplace.products(params);
      setProducts((res.data as Product[]) ?? []);
    } catch {
      // keep stale data
    }
  }, [category, search]);

  const fetchPending = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await marketplace.pending();
      setPending((res.data as Product[]) ?? []);
    } catch {
      // keep stale
    }
  }, [isAdmin]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchProducts(), fetchPending()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchProducts, fetchPending]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  // ─── Moderate ──────────────────────────────────────────────────────────

  const handleModerate = (id: string, action: "approve" | "reject", productName: string) => {
    const labels = { approve: "Approuver", reject: "Rejeter" };
    Alert.alert(
      `${labels[action]} le produit`,
      `${labels[action]} "${productName}" ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: labels[action],
          style: action === "reject" ? "destructive" : "default",
          onPress: async () => {
            setModerating(id);
            try {
              await marketplace.moderate(id, { action });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // refresh both lists
              await Promise.all([fetchProducts(), fetchPending()]);
            } catch {
              Alert.alert("Erreur", "Action impossible");
            } finally {
              setModerating(null);
            }
          },
        },
      ],
    );
  };

  // ─── Render helpers ────────────────────────────────────────────────────

  const renderProductCard = ({ item: p }: { item: Product }) => {
    const price = formatMAD(p.price) + " MAD";
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
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
          {/* ⚠️ Feather must NOT be inside <Text> — use a View row instead */}
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
        <Text style={[styles.pendingMeta, { color: colors.mutedForeground }]}>
          Vendeur : {p.sellerName}
        </Text>
        {p.description ? (
          <Text style={[styles.pendingDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {p.description}
          </Text>
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

  // ─── Main render ────────────────────────────────────────────────────────

  const listData = products;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Marketplace</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {isAdmin
                ? `${pending.length} en attente de validation`
                : `${listData.length} produit${listData.length !== 1 ? "s" : ""} disponible${listData.length !== 1 ? "s" : ""}`}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {isAdmin ? (
              <View style={[styles.adminBadge, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="shield" size={14} color={colors.primary} />
                <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
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
      </View>

      {/* Tabs / filter chips */}
      {isAdmin ? (
        <FilterTabs
          options={[
            { key: "catalogue", label: "Catalogue" },
            { key: "validation", label: `Validation (${pending.length})` },
            { key: "commandes", label: "Commandes" },
          ]}
          value={adminTab}
          onChange={(k) => setAdminTab(k as AdminTab)}
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
      ) : isAdmin && adminTab === "validation" ? (
        <FlatList
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
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Aucun produit en attente de validation.
              </Text>
            </View>
          }
        />
      ) : isAdmin && adminTab === "commandes" ? (
        <OrdersAdminView colors={colors} insets={insets} isWide={isWide} refreshing={refreshing} onRefresh={onRefresh} />
      ) : (
        <FlatList
          data={listData}
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
                {search
                  ? `Aucun produit ne correspond à "${search}"`
                  : "Soyez le premier à publier un produit !"}
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
    </View>
  );
}

// ─── Orders admin sub-view ────────────────────────────────────────────────────

function OrdersAdminView({
  colors, insets, isWide, refreshing, onRefresh,
}: {
  colors: ReturnType<typeof useColors>;
  insets: ReturnType<typeof useSafeAreaInsets>;
  isWide: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    marketplace.orders().then((r) => { setOrders((r.data as any[]) ?? []); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "#f59e0b",
    confirmed: colors.primary,
    shipped: "#6366f1",
    delivered: colors.success,
    cancelled: colors.destructive,
  };
  const statusLabels: Record<string, string> = {
    pending: "En attente",
    confirmed: "Confirmé",
    shipped: "Expédié",
    delivered: "Livré",
    cancelled: "Annulé",
  };

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Feather name="package" size={44} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune commande</Text>
        </View>
      }
      renderItem={({ item: o }) => (
        <View style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.orderName, { color: colors.foreground }]}>{o.productName}</Text>
            <Text style={[styles.orderMeta, { color: colors.mutedForeground }]}>
              {o.buyerName} → {o.sellerName}
            </Text>
            <Text style={[styles.orderAmount, { color: colors.primary }]}>
              {formatMAD(o.amount)} MAD
            </Text>
          </View>
          <View style={[styles.orderStatus, { backgroundColor: (statusColors[o.status] ?? colors.mutedForeground) + "20" }]}>
            <Text style={[styles.orderStatusText, { color: statusColors[o.status] ?? colors.mutedForeground }]}>
              {statusLabels[o.status] ?? o.status}
            </Text>
          </View>
        </View>
      )}
    />
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
  orderRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 12, gap: 10 },
  orderName: { fontSize: 14, fontWeight: "600" },
  orderMeta: { fontSize: 11, marginTop: 2 },
  orderAmount: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  orderStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  orderStatusText: { fontSize: 11, fontWeight: "600" },
  fab: {
    position: "absolute",
    end: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  fabText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
