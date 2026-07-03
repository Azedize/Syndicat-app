import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { shareContent } from "@/hooks/useShare";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData, type Product } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import FilterChips from "@/components/FilterChips";
import FilterTabs from "@/components/FilterTabs";

const CATEGORIES = ["Tous", "Éducation", "Fournitures", "Papeterie", "Livres", "Matériel", "Accessoires"];

type AdminTab = "catalogue" | "validation" | "commandes";

export default function MarketplaceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { products, orders, validateProduct, addToCart, cart } = useData();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [adminTab, setAdminTab] = useState<AdminTab>("catalogue");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const isAdmin = user?.role === "super_admin";

  const filtered = products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.seller.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "Tous" || p.category === category;
    const matchStatus = isAdmin ? true : p.status === "available";
    return matchSearch && matchCat && matchStatus;
  });

  const pendingProducts = products.filter((p) => p.status === "pending");

  const handleValidate = (id: string, productName: string) => {
    Alert.alert("Valider le produit", `Valider "${productName}" pour qu'il apparaisse dans le catalogue?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Valider",
        onPress: () => {
          validateProduct(id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const handleReject = () => {
    Alert.alert("Produit rejeté", "Le vendeur sera notifié du refus.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const statusConfig = (status: Product["status"]) => ({
    available: { color: colors.success, label: "Disponible" },
    sold_out: { color: colors.destructive, label: "Épuisé" },
    pending: { color: "#f59e0b", label: "En attente" },
  }[status]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Marketplace</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {isAdmin ? `${pendingProducts.length} en validation` : `${filtered.length} produits disponibles`}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              style={[styles.cartBtn, { backgroundColor: colors.secondary }]}
              onPress={() => { router.push("/search" as any); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Feather name="search" size={18} color={colors.primary} />
            </TouchableOpacity>
            {isAdmin ? (
              <View style={[styles.adminBadge, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="shield" size={14} color={colors.primary} />
                <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
              </View>
            ) : (
              <TouchableOpacity style={[styles.cartBtn, { backgroundColor: colors.primary + "15" }]} onPress={() => { router.push("/cart"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                <Feather name="shopping-cart" size={20} color={colors.primary} />
                {cartCount > 0 && (
                  <View style={[styles.cartBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.cartBadgeText}>{cartCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Rechercher un produit..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
        </View>
      </View>

      {isAdmin ? (
        <FilterTabs
          options={[
            { key: "catalogue",  label: "Catalogue" },
            { key: "validation", label: `Validation (${pendingProducts.length})` },
            { key: "commandes",  label: "Commandes" },
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

      {/* Admin Validation Tab */}
      {isAdmin && adminTab === "validation" ? (
        <FlatList
          data={pendingProducts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyVal}>
              <Feather name="check-circle" size={40} color={colors.success} />
              <Text style={[styles.emptyValTitle, { color: colors.foreground }]}>Tout est validé!</Text>
              <Text style={[styles.emptyValSub, { color: colors.mutedForeground }]}>Aucun produit en attente de validation.</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <View style={[styles.valCard, { backgroundColor: colors.card, borderColor: "#f59e0b40", borderLeftColor: "#f59e0b" }]}>
              <View style={styles.valTop}>
                <View style={[styles.valImg, { backgroundColor: colors.primary + "10" }]}>
                  <Feather name="package" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.valName, { color: colors.foreground }]}>{p.name}</Text>
                  <Text style={[styles.valDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{p.description}</Text>
                  <View style={styles.valMeta}>
                    <Feather name="user" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.valSeller, { color: colors.primary }]}>{p.seller}</Text>
                    <Text style={[styles.valDot, { color: colors.mutedForeground }]}>•</Text>
                    <Text style={[styles.valPrice, { color: colors.foreground }]}>{p.price} MAD</Text>
                    <Text style={[styles.valDot, { color: colors.mutedForeground }]}>•</Text>
                    <Text style={[styles.valStock, { color: colors.mutedForeground }]}>Stock: {p.stock}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.valActions}>
                <TouchableOpacity
                  style={[styles.valBtn, { backgroundColor: colors.destructive + "15", borderColor: colors.destructive + "30" }]}
                  onPress={handleReject}
                >
                  <Feather name="x" size={15} color={colors.destructive} />
                  <Text style={[styles.valBtnText, { color: colors.destructive }]}>Rejeter</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.valBtn, { flex: 2, backgroundColor: colors.success, borderColor: colors.success }]}
                  onPress={() => handleValidate(p.id, p.name)}
                >
                  <Feather name="check" size={15} color="#fff" />
                  <Text style={[styles.valBtnText, { color: "#fff" }]}>Valider & Publier</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      ) : isAdmin && adminTab === "commandes" ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: isWide ? 32 : insets.bottom + 100 }}>
          <View style={[styles.statsGrid, { gap: 12 }]}>
            {[
              { label: "Commandes totales", value: String(orders.length), color: colors.primary, icon: "shopping-bag" as const },
              { label: "En cours", value: String(orders.filter((o) => o.status === "pending" || o.status === "confirmed").length), color: "#f59e0b", icon: "clock" as const },
              { label: "Livrées", value: String(orders.filter((o) => o.status === "delivered").length), color: colors.success, icon: "check-circle" as const },
              { label: "Commission (MAD)", value: Math.round(orders.filter((o) => o.status === "delivered").reduce((s, o) => s + o.amount, 0) * 0.05).toLocaleString("fr-MA"), color: "#8b5cf6", icon: "dollar-sign" as const },
            ].map((s) => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIcon, { backgroundColor: s.color + "15" }]}>
                  <Feather name={s.icon} size={18} color={s.color} />
                </View>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.comNote, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30", marginTop: 16 }]}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={[styles.comNoteText, { color: colors.primary }]}>
              Commission plateforme: 5% sur chaque transaction. Les fonds sont reversés mensuellement.
            </Text>
          </View>
        </ScrollView>
      ) : (
        /* Product grid */
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={2}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          columnWrapperStyle={{ gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="package" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun produit trouvé</Text>
            </View>
          }
          renderItem={({ item: p }) => {
            const sc = statusConfig(p.status);
            return (
              <TouchableOpacity
                style={[styles.productCard, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setSelectedProduct(p)}
                activeOpacity={0.8}
              >
                <View style={[styles.productImg, { backgroundColor: colors.primary + "10" }]}>
                  <Feather name="package" size={28} color={colors.primary} />
                  {isAdmin ? (
                    <View style={[styles.productStatusBadge, { backgroundColor: sc.color }]}>
                      <Text style={styles.productStatusText}>{sc.label}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.productInfo}>
                  <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>{p.name}</Text>
                  <Text style={[styles.productSeller, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {p.seller}
                  </Text>
                  <View style={styles.productBottom}>
                    <Text style={[styles.productPrice, { color: colors.primary }]}>{p.price} MAD</Text>
                    {p.status === "available" ? (
                      <TouchableOpacity
                        style={[styles.addCartBtn, { backgroundColor: colors.primary }]}
                        onPress={() => {
                          addToCart({ productId: p.id, name: p.name, price: p.price, seller: p.seller, quantity: 1 });
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          Alert.alert("Ajouté!", `${p.name} est dans votre panier.`);
                        }}
                      >
                        <Feather name="shopping-cart" size={12} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <Text style={[styles.soldOut, { color: sc.color }]}>{sc.label}</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Product detail modal */}
      <Modal visible={!!selectedProduct} animationType="slide" presentationStyle="pageSheet">
        {selectedProduct ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelectedProduct(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                {selectedProduct.name}
              </Text>
              <TouchableOpacity
                style={[styles.shareBtn, { backgroundColor: colors.secondary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  shareContent(`${selectedProduct.name}\n${selectedProduct.description}\nPrix: ${selectedProduct.price} MAD\n\nDisponible sur SYNDYCAT Marketplace`, selectedProduct.name);
                }}
              >
                <Feather name="share-2" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}>
              <View style={[styles.detailImg, { backgroundColor: colors.primary + "10" }]}>
                <Feather name="package" size={60} color={colors.primary} />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={[styles.detailName, { color: colors.foreground }]}>{selectedProduct.name}</Text>
                <Text style={[styles.detailDesc, { color: colors.mutedForeground }]}>{selectedProduct.description}</Text>
              </View>
              <View style={[styles.detailMeta, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Vendeur", value: selectedProduct.seller },
                  { label: "Catégorie", value: selectedProduct.category },
                  { label: "Stock", value: `${selectedProduct.stock} unités` },
                  { label: "Statut", value: statusConfig(selectedProduct.status).label },
                ].map((item, i) => (
                  <View key={item.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.detailFooter}>
                <Text style={[styles.detailPrice, { color: colors.primary }]}>{selectedProduct.price} MAD</Text>
                {selectedProduct.status === "available" ? (
                  <TouchableOpacity
                    style={[styles.buyBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      addToCart({ productId: selectedProduct.id, name: selectedProduct.name, price: selectedProduct.price, seller: selectedProduct.seller, quantity: 1 });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setSelectedProduct(null);
                      Alert.alert("Ajouté au panier!", `${selectedProduct.name} a été ajouté.`, [
                        { text: "Voir le panier", onPress: () => router.push("/cart") },
                        { text: "Continuer", style: "cancel" },
                      ]);
                    }}
                  >
                    <Feather name="shopping-cart" size={16} color="#fff" />
                    <Text style={styles.buyBtnText}>Ajouter au panier</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.soldOutBtn, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.soldOutBtnText, { color: colors.mutedForeground }]}>Rupture de stock</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  adminBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  cartBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cartBadge: { position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cartBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  searchWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  productCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  productImg: { height: 100, alignItems: "center", justifyContent: "center", position: "relative" },
  productStatusBadge: { position: "absolute", top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  productStatusText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  productInfo: { padding: 12, gap: 4 },
  productName: { fontSize: 12, fontFamily: "Inter_700Bold", lineHeight: 16 },
  productSeller: { fontSize: 10, fontFamily: "Inter_400Regular" },
  productBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  productPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  addCartBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  soldOut: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  valCard: { borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, padding: 16, gap: 14 },
  valTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  valImg: { width: 54, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  valName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  valDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  valMeta: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  valSeller: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  valDot: { fontSize: 11 },
  valPrice: { fontSize: 12, fontFamily: "Inter_700Bold" },
  valStock: { fontSize: 11, fontFamily: "Inter_400Regular" },
  valActions: { flexDirection: "row", gap: 10 },
  valBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  valBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyVal: { alignItems: "center", gap: 12, marginTop: 60 },
  emptyValTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyValSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: "45%", borderRadius: 16, borderWidth: 1, padding: 16, gap: 6, margin: 4 },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  comNote: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: "flex-start" },
  comNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center", marginHorizontal: 8 },
  shareBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detailImg: { height: 160, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  detailName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  detailDesc: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  detailMeta: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sep: { height: 1, marginHorizontal: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  metaLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  metaValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  detailFooter: { flexDirection: "row", alignItems: "center", gap: 16 },
  detailPrice: { fontSize: 26, fontFamily: "Inter_700Bold" },
  buyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14 },
  buyBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  soldOutBtn: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: 14 },
  soldOutBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
