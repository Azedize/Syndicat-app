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
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { marketplace } from "@/services/api";

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
  status: string;
  rejectionReason: string | null;
  viewCount: number;
  createdAt: string;
};

const CATS = ["Électroménager", "Meubles", "Vêtements", "Électronique", "Sport", "Livres", "Autre"];
const CONDITIONS = [
  { value: "neuf", label: "Neuf" },
  { value: "bon", label: "Bon état" },
  { value: "acceptable", label: "État acceptable" },
  { value: "mauvais", label: "Mauvais état" },
];

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  approved:               { color: "#22c55e", label: "Publié" },
  pending_review:         { color: "#f59e0b", label: "En validation" },
  rejected:               { color: "#ef4444", label: "Rejeté" },
  modification_requested: { color: "#f97316", label: "Modif. requises" },
  sold_out:               { color: "#94a3b8", label: "Épuisé" },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [category, setCategory] = useState(CATS[0]!);
  const [condition, setCondition] = useState("bon");
  const [location, setLocation] = useState("");

  // ─── Fetch ───────────────────────────────────────────────────────────

  const fetchListings = useCallback(async () => {
    try {
      const res = await marketplace.myListings();
      setProducts((res.data as Product[]) ?? []);
    } catch {
      // keep stale
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchListings(); }, [fetchListings]);
  const onRefresh = () => { setRefreshing(true); fetchListings(); };

  // ─── Form helpers ─────────────────────────────────────────────────────

  const resetForm = () => {
    setName(""); setDesc(""); setPrice(""); setStock("1");
    setCategory(CATS[0]!); setCondition("bon"); setLocation("");
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setShowForm(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setName(p.name);
    setDesc(p.description);
    setPrice(String(Number(p.price)));
    setStock(String(p.stock));
    setCategory(p.category);
    setCondition(p.condition);
    setLocation(p.location ?? "");
    setShowForm(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert(t("required"), t("onboardingRequired"));
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert(t("error"), t("error"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: desc.trim(),
        price: parsedPrice,
        stock: parseInt(stock) || 1,
        category,
        condition,
        location: location.trim(),
        imageUrls: [],
      };
      if (editingId) {
        await marketplace.updateProduct(editingId, payload);
      } else {
        await marketplace.addProduct(payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false);
      resetForm();
      await fetchListings();
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string, productName: string) => {
    Alert.alert(t("delete"), `${t("delete")} "${productName}" ?`, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          setDeleting(id);
          try {
            await marketplace.deleteProduct(id);
            setProducts((prev) => prev.filter((p) => p.id !== id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert(t("error"), t("error"));
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);
  };

  // ─── Stats ────────────────────────────────────────────────────────────

  const approved = products.filter((p) => p.status === "approved");
  const totalViews = products.reduce((s, p) => s + (p.viewCount ?? 0), 0);

  // ─── Render ───────────────────────────────────────────────────────────

  const renderItem = ({ item: p }: { item: Product }) => {
    const sc = STATUS_CONFIG[p.status] ?? { color: colors.mutedForeground, label: p.status };
    return (
      <View style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.productName, { color: colors.foreground }]}>{p.name}</Text>
            <Text style={[styles.productPrice, { color: colors.primary }]}>
              {Number(p.price).toLocaleString("fr-MA")} MAD
            </Text>
            <Text style={[styles.productMeta, { color: colors.mutedForeground }]}>
              {p.category} · Stock: {p.stock} · {p.viewCount ?? 0} vue(s)
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: sc.color + "20" }]}>
            <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>

        {p.rejectionReason && (
          <View style={[styles.rejectionBox, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "30" }]}>
            <Feather name="alert-circle" size={12} color={colors.destructive} />
            <Text style={[styles.rejectionText, { color: colors.destructive }]}>{p.rejectionReason}</Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary + "12" }]}
            onPress={() => openEdit(p)}
          >
            <Feather name="edit-2" size={14} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t("edit")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
            onPress={() => { router.push({ pathname: "/product-detail", params: { id: p.id } } as any); }}
          >
            <Feather name="eye" size={14} color={colors.foreground} />
            <Text style={[styles.actionBtnText, { color: colors.foreground }]}>{t("viewDetails")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.destructive + "12" }]}
            onPress={() => handleDelete(p.id, p.name)}
            disabled={deleting === p.id}
          >
            {deleting === p.id ? (
              <ActivityIndicator size="small" color={colors.destructive} />
            ) : (
              <>
                <Feather name="trash-2" size={14} color={colors.destructive} />
                <Text style={[styles.actionBtnText, { color: colors.destructive }]}>{t("delete")}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginStart: 10 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>{t("myShop")}</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {approved.length} produit{approved.length !== 1 ? "s" : ""} publié{approved.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={openAdd}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.addBtnText}>{t("add")}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: "Total annonces", value: products.length },
            { label: "Publiés", value: approved.length },
            { label: "Total vues", value: totalViews },
          ].map((s) => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="package" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noProducts")}</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                Publiez votre premier produit et touchez tous les résidents de la plateforme.
              </Text>
              <TouchableOpacity style={[styles.emptyAction, { backgroundColor: colors.primary }]} onPress={openAdd}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyActionText}>{t("newPublication")}</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Add / Edit modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
            <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editingId ? t("edit") : t("newPublication")}
            </Text>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: saving ? colors.secondary : colors.primary }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>{t("save")}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Name */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Titre de l'annonce *</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Ex : Machine à laver Samsung 8kg"
              placeholderTextColor={colors.mutedForeground}
              value={name}
              onChangeText={setName}
              maxLength={200}
            />

            {/* Price + Stock */}
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Prix (MAD) *</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                  placeholder="500"
                  placeholderTextColor={colors.mutedForeground}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Stock</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
                  placeholder="1"
                  placeholderTextColor={colors.mutedForeground}
                  value={stock}
                  onChangeText={setStock}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Category */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {CATS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: category === c ? colors.primary : colors.card }]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={[styles.chipText, { color: category === c ? "#fff" : colors.foreground }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Condition */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>État</Text>
            <View style={styles.conditionRow}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[
                    styles.conditionChip,
                    { borderColor: condition === c.value ? colors.primary : colors.border },
                    condition === c.value && { backgroundColor: colors.primary + "15" },
                  ]}
                  onPress={() => setCondition(c.value)}
                >
                  <Text style={[styles.conditionChipText, { color: condition === c.value ? colors.primary : colors.foreground }]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Location */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Localisation</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Ex : Hay Riad, Rabat"
              placeholderTextColor={colors.mutedForeground}
              value={location}
              onChangeText={setLocation}
              maxLength={200}
            />

            {/* Description */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("descriptionLabel")}</Text>
            <TextInput
              style={[styles.textarea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Décrivez votre produit : état, caractéristiques, raison de la vente..."
              placeholderTextColor={colors.mutedForeground}
              value={desc}
              onChangeText={setDesc}
              multiline
              maxLength={2000}
              textAlignVertical="top"
            />

            {!editingId && (
              <View style={[styles.infoBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                <Feather name="info" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary }]}>
                  Votre annonce sera soumise à validation avant d'être publiée sur le marketplace.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10, marginTop: 2, textAlign: "center" },
  list: { padding: 12, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60, padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: "700" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  emptyActionText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  productCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  productName: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  productPrice: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  productMeta: { fontSize: 11, marginTop: 3 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  rejectionBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: 8, borderRadius: 8, borderWidth: 1 },
  rejectionText: { fontSize: 11, flex: 1, lineHeight: 16 },
  cardActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
  // Modal
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveBtnText: { color: "#fff", fontWeight: "700" },
  modalBody: { padding: 16, gap: 4, paddingBottom: 60 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  textarea: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 120 },
  rowFields: { flexDirection: "row", gap: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "600" },
  conditionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  conditionChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5 },
  conditionChipText: { fontSize: 13, fontWeight: "600" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  infoText: { fontSize: 13, flex: 1, lineHeight: 18 },
});
