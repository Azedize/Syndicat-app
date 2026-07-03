import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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

const CATS = ["Éducation", "Fournitures", "Papeterie", "Livres", "Matériel", "Accessoires"];

type FormMode = "add" | "edit";

export default function MyShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { products, addProduct, updateProduct, deleteProduct } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const myProducts = products.filter((p) => p.seller === user?.name);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("add");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("Éducation");

  const totalRevenue = myProducts
    .filter((p) => p.status === "available")
    .reduce((s, p) => s + p.price * Math.max(1, 50 - p.stock), 0);

  const statusConfig = (status: Product["status"]) => {
    if (status === "available") return { color: colors.success, label: "Disponible", icon: "check-circle" as const };
    if (status === "sold_out") return { color: colors.destructive, label: "Épuisé", icon: "x-circle" as const };
    return { color: "#f59e0b", label: "En validation", icon: "clock" as const };
  };

  const openAdd = () => {
    setFormMode("add");
    setEditingProduct(null);
    setName(""); setDesc(""); setPrice(""); setStock(""); setCategory("Éducation");
    setShowForm(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openEdit = (p: Product) => {
    setFormMode("edit");
    setEditingProduct(p);
    setName(p.name);
    setDesc(p.description);
    setPrice(String(p.price));
    setStock(String(p.stock));
    setCategory(p.category);
    setSelectedProduct(null);
    setShowForm(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = () => {
    if (!name.trim() || !price.trim()) return;
    if (formMode === "add") {
      const p: Product = {
        id: Date.now().toString(),
        name: name.trim(),
        description: desc.trim(),
        price: parseFloat(price) || 0,
        seller: user?.name ?? "Moi",
        category,
        status: "pending",
        stock: parseInt(stock) || 1,
      };
      addProduct(p);
    } else if (editingProduct) {
      updateProduct({
        ...editingProduct,
        name: name.trim(),
        description: desc.trim(),
        price: parseFloat(price) || 0,
        stock: parseInt(stock) || editingProduct.stock,
        category,
      });
    }
    setShowForm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = (p: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Supprimer le produit",
      `Supprimer "${p.name}" de votre boutique? Cette action est irréversible.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            deleteProduct(p.id);
            setSelectedProduct(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  const STATS = [
    { label: "Produits", value: myProducts.length, color: colors.primary },
    { label: "En ligne", value: myProducts.filter((p) => p.status === "available").length, color: colors.success },
    { label: "En attente", value: myProducts.filter((p) => p.status === "pending").length, color: "#f59e0b" },
    { label: "Ventes est.", value: totalRevenue > 999 ? `${Math.round(totalRevenue / 1000)}k` : `${totalRevenue}`, color: colors.foreground },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Ma Boutique</Text>
          <Text style={styles.headerSub}>Gérez vos produits et ventes</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
          onPress={openAdd}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[styles.statsBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {STATS.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 ? <View style={[styles.statDiv, { backgroundColor: colors.border }]} /> : null}
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Pending notice */}
      {myProducts.some((p) => p.status === "pending") ? (
        <View style={[styles.noticeBanner, { backgroundColor: "#f59e0b12", borderColor: "#f59e0b40" }]}>
          <Feather name="clock" size={14} color="#f59e0b" />
          <Text style={[styles.noticeText, { color: "#f59e0b" }]}>
            {myProducts.filter((p) => p.status === "pending").length} produit(s) en attente de validation par l'administrateur
          </Text>
        </View>
      ) : null}

      {myProducts.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "15" }]}>
            <Feather name="shopping-bag" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Votre boutique est vide</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
            Ajoutez votre premier produit pour commencer à vendre sur la marketplace.
          </Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.emptyBtnText}>Ajouter un produit</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={myProducts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p }) => {
            const sc = statusConfig(p.status);
            return (
              <TouchableOpacity
                style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setSelectedProduct(p)}
                activeOpacity={0.8}
              >
                <View style={[styles.productImg, { backgroundColor: colors.primary + "12" }]}>
                  <Feather name="package" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.productDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{p.description}</Text>
                  <View style={styles.productMeta}>
                    <Text style={[styles.productPrice, { color: colors.primary }]}>{p.price} MAD</Text>
                    <View style={[styles.stockBadge, { backgroundColor: colors.muted }]}>
                      <Feather name="layers" size={10} color={colors.mutedForeground} />
                      <Text style={[styles.stockText, { color: colors.mutedForeground }]}>Stock: {p.stock}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.productRight}>
                  <View style={[styles.statusTag, { backgroundColor: sc.color + "15" }]}>
                    <Feather name={sc.icon} size={10} color={sc.color} />
                    <Text style={[styles.statusTagText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                  <View style={styles.actionBtns}>
                    <TouchableOpacity
                      style={[styles.iconBtn, { backgroundColor: colors.primary + "15" }]}
                      onPress={() => openEdit(p)}
                    >
                      <Feather name="edit-2" size={13} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconBtn, { backgroundColor: colors.destructive + "12" }]}
                      onPress={() => handleDelete(p)}
                    >
                      <Feather name="trash-2" size={13} color={colors.destructive} />
                    </TouchableOpacity>
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
                style={[styles.editHeaderBtn, { backgroundColor: colors.primary + "15" }]}
                onPress={() => openEdit(selectedProduct)}
              >
                <Feather name="edit-2" size={15} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              {/* Hero */}
              <View style={[styles.productHero, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "20" }]}>
                <View style={[styles.productHeroImg, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name="package" size={48} color={colors.primary} />
                </View>
                <Text style={[styles.productHeroName, { color: colors.foreground }]}>{selectedProduct.name}</Text>
                <Text style={[styles.productHeroPrice, { color: colors.primary }]}>{selectedProduct.price} MAD</Text>
                <View style={[styles.statusTag, { backgroundColor: statusConfig(selectedProduct.status).color + "15" }]}>
                  <Feather name={statusConfig(selectedProduct.status).icon} size={11} color={statusConfig(selectedProduct.status).color} />
                  <Text style={[styles.statusTagText, { color: statusConfig(selectedProduct.status).color }]}>
                    {statusConfig(selectedProduct.status).label}
                  </Text>
                </View>
              </View>

              {/* Details */}
              <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Description", value: selectedProduct.description || "—" },
                  { label: "Catégorie", value: selectedProduct.category },
                  { label: "Stock disponible", value: `${selectedProduct.stock} unités` },
                  { label: "Vendeur", value: selectedProduct.seller },
                ].map((item, i) => (
                  <View key={item.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                      <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={2}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => openEdit(selectedProduct)}
                >
                  <Feather name="edit-2" size={15} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: "#fff" }]}>Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "30", borderWidth: 1 }]}
                  onPress={() => handleDelete(selectedProduct)}
                >
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                  <Text style={[styles.actionBtnText, { color: colors.destructive }]}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Add / Edit form modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {formMode === "add" ? "Nouveau produit" : "Modifier le produit"}
            </Text>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {[
              { label: "Nom du produit *", value: name, setter: setName, placeholder: "Ex: Manuel pédagogique", numeric: false },
              { label: "Description", value: desc, setter: setDesc, placeholder: "Description courte du produit", numeric: false },
              { label: "Prix (MAD) *", value: price, setter: setPrice, placeholder: "150", numeric: true },
              { label: "Stock", value: stock, setter: setStock, placeholder: "10", numeric: true },
            ].map((field) => (
              <View key={field.label} style={{ gap: 6 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{field.label}</Text>
                <TextInput
                  style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                  value={field.value}
                  onChangeText={field.setter}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={field.numeric ? "numeric" : "default"}
                />
              </View>
            ))}

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Catégorie</Text>
              <View style={styles.catGrid}>
                {CATS.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: category === cat ? colors.primary : colors.card,
                        borderColor: category === cat ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.catText, { color: category === cat ? "#fff" : colors.mutedForeground }]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {formMode === "add" ? (
              <View style={[styles.noteBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                <Feather name="info" size={14} color={colors.primary} />
                <Text style={[styles.noteText, { color: colors.primary }]}>
                  Votre produit sera soumis à validation par l'administrateur avant d'apparaître dans le marketplace.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: name.trim() && price.trim() ? colors.primary : colors.muted }]}
              onPress={handleSave}
              disabled={!name.trim() || !price.trim()}
            >
              <Feather name={formMode === "add" ? "send" : "check"} size={16} color={name.trim() && price.trim() ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.saveBtnText, { color: name.trim() && price.trim() ? "#fff" : colors.mutedForeground }]}>
                {formMode === "add" ? "Soumettre pour validation" : "Enregistrer les modifications"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statsBar: { flexDirection: "row", paddingVertical: 16, borderBottomWidth: 1 },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  statDiv: { width: 1 },
  noticeBanner: { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 0, padding: 12, borderRadius: 12, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  emptyIcon: { width: 90, height: 90, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  emptyBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  productCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  productImg: { width: 54, height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 13, fontFamily: "Inter_700Bold" },
  productDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
  productMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  productPrice: { fontSize: 14, fontFamily: "Inter_700Bold" },
  stockBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  stockText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  productRight: { alignItems: "flex-end", gap: 8 },
  statusTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  actionBtns: { flexDirection: "row", gap: 6 },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, gap: 12 },
  modalTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  editHeaderBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  productHero: { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 8 },
  productHeroImg: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  productHeroName: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  productHeroPrice: { fontSize: 24, fontFamily: "Inter_700Bold" },
  detailCard: { borderRadius: 16, borderWidth: 1, padding: 4 },
  sep: { height: 1, marginHorizontal: 12 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 12, gap: 12 },
  detailLabel: { fontSize: 12, fontFamily: "Inter_400Regular", width: 110 },
  detailValue: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  catText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  noteBox: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start" },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 14, marginTop: 8 },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
