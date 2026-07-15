import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
  boosted?: boolean;
  boostType?: string | null;
  boostExpiresAt?: string | null;
};

type Promotion = {
  id: string;
  productId: string;
  type: string;
  status: string;
  amount: string;
  startDate: string;
  endDate: string;
  rejectionReason?: string | null;
};

const PROMO_TYPES = [
  { value: "top_search", label: "Priorité recherche", ratePerDay: 15 },
  { value: "featured", label: "En vedette", ratePerDay: 25 },
  { value: "homepage", label: "Page d'accueil", ratePerDay: 40 },
];

/** Safe French price formatter — never crashes on null/NaN */
function formatMAD(price: string | number | null | undefined): string {
  const n = Number(price ?? 0);
  if (isNaN(n)) return "0";
  try { return n.toLocaleString("fr-FR"); } catch { return String(Math.round(n)); }
}

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
  const [imageLocalUris, setImageLocalUris] = useState<string[]>([]);
  const [imageObjectPaths, setImageObjectPaths] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Sponsored-listing request state
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [sponsorProduct, setSponsorProduct] = useState<Product | null>(null);
  const [sponsorType, setSponsorType] = useState(PROMO_TYPES[0]!.value);
  const [sponsorDays, setSponsorDays] = useState("7");
  const [sponsorPaymentMethod, setSponsorPaymentMethod] = useState("virement");
  const [sponsorProofLocalUri, setSponsorProofLocalUri] = useState<string | null>(null);
  const [sponsorProofObjectPath, setSponsorProofObjectPath] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [submittingPromo, setSubmittingPromo] = useState(false);

  // ─── Fetch ───────────────────────────────────────────────────────────

  const fetchListings = useCallback(async () => {
    try {
      const [listingsRes, promoRes] = await Promise.all([
        marketplace.myListings(),
        marketplace.myPromotions().catch(() => ({ data: [] })),
      ]);
      setProducts((listingsRes.data as Product[]) ?? []);
      setPromotions((promoRes.data as Promotion[]) ?? []);
    } catch {
      // keep stale
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchListings(); }, [fetchListings]);
  const onRefresh = () => { setRefreshing(true); fetchListings(); };

  const latestPromoForProduct = (productId: string): Promotion | undefined =>
    promotions
      .filter((pr) => pr.productId === productId)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

  const openSponsor = (p: Product) => {
    setSponsorProduct(p);
    setSponsorType(PROMO_TYPES[0]!.value);
    setSponsorDays("7");
    setSponsorPaymentMethod("virement");
    setSponsorProofLocalUri(null);
    setSponsorProofObjectPath(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pickSponsorProof = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setSponsorProofLocalUri(uri);
    setUploadingProof(true);
    const objectPath = await uploadImageUri(uri, user?.token);
    setUploadingProof(false);
    if (objectPath) {
      setSponsorProofObjectPath(objectPath);
    } else {
      setSponsorProofLocalUri(null);
      Alert.alert("Erreur", "Impossible de télécharger le justificatif. Réessayez.");
    }
  };

  const submitSponsorRequest = async () => {
    if (!sponsorProduct) return;
    const days = parseInt(sponsorDays, 10);
    if (!days || days < 1 || days > 90) {
      Alert.alert("Erreur", "La durée doit être comprise entre 1 et 90 jours.");
      return;
    }
    if (!sponsorPaymentMethod.trim()) {
      Alert.alert("Erreur", "Indiquez le mode de paiement utilisé.");
      return;
    }
    if (!sponsorProofObjectPath) {
      Alert.alert("Justificatif requis", "Ajoutez une capture ou une photo du paiement effectué.");
      return;
    }
    setSubmittingPromo(true);
    try {
      await marketplace.requestPromotion(sponsorProduct.id, {
        type: sponsorType,
        durationDays: days,
        paymentMethod: sponsorPaymentMethod.trim(),
        proofUrl: sponsorProofObjectPath,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Demande envoyée", "Votre demande de sponsorisation est en attente de validation du paiement par l'administration.");
      setSponsorProduct(null);
      await fetchListings();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible d'envoyer la demande.");
    } finally {
      setSubmittingPromo(false);
    }
  };

  const selectedPromoType = PROMO_TYPES.find((p) => p.value === sponsorType) ?? PROMO_TYPES[0]!;
  const sponsorEstimatedAmount = (parseInt(sponsorDays, 10) || 0) * selectedPromoType.ratePerDay;

  // ─── Form helpers ─────────────────────────────────────────────────────

  const resetForm = () => {
    setName(""); setDesc(""); setPrice(""); setStock("1");
    setCategory(CATS[0]!); setCondition("bon"); setLocation("");
    setImageLocalUris([]); setImageObjectPaths([]);
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
    setImageLocalUris([]); setImageObjectPaths([]);
    setShowForm(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── Image picker ──────────────────────────────────────────────────────

  const uploadImageUri = async (uri: string, token?: string): Promise<string | null> => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const baseUrl = domain
      ? `https://${domain}/api`
      : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`;
    try {
      const fileRes = await fetch(uri);
      if (!fileRes.ok) return null;
      const blob = await fileRes.blob();
      const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
      const ct = ext === "png" ? "image/png" : "image/jpeg";
      const form = new FormData();
      form.append("file", blob, `product-${Date.now()}.${ext === "png" ? "png" : "jpg"}`);
      const res = await fetch(`${baseUrl}/storage/uploads`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) return null;
      const { objectPath } = await res.json();
      return objectPath as string;
    } catch { return null; }
  };

  const pickProductImage = async () => {
    if (imageLocalUris.length >= 5) {
      Alert.alert("Maximum", "Vous pouvez ajouter au maximum 5 photos.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.75,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setImageLocalUris((prev) => [...prev, uri]);
    Haptics.selectionAsync();
    setUploadingImages(true);
    const objectPath = await uploadImageUri(uri, user?.token);
    setUploadingImages(false);
    if (objectPath) {
      setImageObjectPaths((prev) => [...prev, objectPath]);
    } else {
      // Remove the local uri if upload failed
      setImageLocalUris((prev) => prev.filter((u) => u !== uri));
      Alert.alert("Erreur", "Impossible de télécharger l'image. Réessayez.");
    }
  };

  const removeImage = (idx: number) => {
    setImageLocalUris((prev) => prev.filter((_, i) => i !== idx));
    setImageObjectPaths((prev) => prev.filter((_, i) => i !== idx));
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
    if (uploadingImages) {
      Alert.alert("Images", "Attendez la fin du téléchargement des images.");
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
        imageUrls: imageObjectPaths,
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

  const PROMO_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    pending_payment: { color: "#f59e0b", label: "Sponsorisation en attente de validation" },
    active:          { color: "#8b5cf6", label: "Sponsorisé" },
    rejected:        { color: "#ef4444", label: "Sponsorisation rejetée" },
  };

  const renderItem = ({ item: p }: { item: Product }) => {
    const sc = STATUS_CONFIG[p.status] ?? { color: colors.mutedForeground, label: p.status };
    const promo = latestPromoForProduct(p.id);
    const promoSc = promo ? PROMO_STATUS_CONFIG[promo.status] : undefined;
    return (
      <View style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.productName, { color: colors.foreground }]}>{p.name}</Text>
            <Text style={[styles.productPrice, { color: colors.primary }]}>
              {formatMAD(p.price)} MAD
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

        {promoSc && (
          <View style={[styles.rejectionBox, { backgroundColor: promoSc.color + "10", borderColor: promoSc.color + "30" }]}>
            <Feather name="zap" size={12} color={promoSc.color} />
            <Text style={[styles.rejectionText, { color: promoSc.color }]}>
              {promoSc.label}
              {promo?.status === "active" ? ` jusqu'au ${new Date(promo.endDate).toLocaleDateString("fr-MA")}` : ""}
              {promo?.status === "rejected" && promo.rejectionReason ? ` — ${promo.rejectionReason}` : ""}
            </Text>
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
          {p.status === "approved" && promo?.status !== "pending_payment" && promo?.status !== "active" && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#8b5cf612" }]}
              onPress={() => openSponsor(p)}
            >
              <Feather name="zap" size={14} color="#8b5cf6" />
              <Text style={[styles.actionBtnText, { color: "#8b5cf6" }]}>Sponsoriser</Text>
            </TouchableOpacity>
          )}
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

            {/* Photos */}
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Photos (optionnel, max 5)</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {imageLocalUris.map((uri, idx) => (
                <View key={uri} style={{ position: "relative" }}>
                  <Image
                    source={{ uri }}
                    style={{ width: 76, height: 76, borderRadius: 10, resizeMode: "cover" }}
                  />
                  <TouchableOpacity
                    style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#ef4444", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}
                    onPress={() => removeImage(idx)}
                  >
                    <Feather name="x" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {imageLocalUris.length < 5 && (
                <TouchableOpacity
                  style={{ width: 76, height: 76, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4 }}
                  onPress={pickProductImage}
                  disabled={uploadingImages}
                >
                  {uploadingImages
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <><Feather name="camera" size={20} color={colors.mutedForeground} /><Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Ajouter</Text></>}
                </TouchableOpacity>
              )}
            </View>

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

      {/* Sponsor / boost listing modal */}
      <Modal visible={!!sponsorProduct} animationType="slide" onRequestClose={() => setSponsorProduct(null)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingTop: topPad }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSponsorProduct(null)} style={{ padding: 4 }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Sponsoriser l'annonce</Text>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: "#8b5cf6" }, (submittingPromo || uploadingProof) && { opacity: 0.6 }]}
              onPress={submitSponsorRequest}
              disabled={submittingPromo || uploadingProof}
            >
              {submittingPromo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Envoyer</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 0 }]}>{sponsorProduct?.name}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>
              Choisissez le type de mise en avant, réglez le montant par le mode de paiement indiqué, puis téléchargez le justificatif. Votre annonce sera sponsorisée dès validation par l'administration.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Type de sponsorisation</Text>
            <View style={styles.conditionRow}>
              {PROMO_TYPES.map((pt) => (
                <TouchableOpacity
                  key={pt.value}
                  style={[
                    styles.conditionChip,
                    { borderColor: sponsorType === pt.value ? "#8b5cf6" : colors.border },
                    sponsorType === pt.value && { backgroundColor: "#8b5cf615" },
                  ]}
                  onPress={() => setSponsorType(pt.value)}
                >
                  <Text style={[styles.conditionChipText, { color: sponsorType === pt.value ? "#8b5cf6" : colors.foreground }]}>
                    {pt.label} · {pt.ratePerDay} MAD/j
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Durée (jours)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              keyboardType="number-pad"
              value={sponsorDays}
              onChangeText={setSponsorDays}
              maxLength={2}
            />

            <View style={[styles.infoBox, { backgroundColor: "#8b5cf610", borderColor: "#8b5cf630" }]}>
              <Feather name="tag" size={14} color="#8b5cf6" />
              <Text style={[styles.infoText, { color: "#8b5cf6" }]}>
                Montant à régler : {sponsorEstimatedAmount} MAD
              </Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Mode de paiement</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="Ex : Virement bancaire, espèces à l'accueil..."
              placeholderTextColor={colors.mutedForeground}
              value={sponsorPaymentMethod}
              onChangeText={setSponsorPaymentMethod}
              maxLength={200}
            />

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Justificatif de paiement</Text>
            {sponsorProofLocalUri ? (
              <View style={{ position: "relative", alignSelf: "flex-start" }}>
                <Image source={{ uri: sponsorProofLocalUri }} style={{ width: 100, height: 100, borderRadius: 10, resizeMode: "cover" }} />
                {uploadingProof && (
                  <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 10 }}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                <TouchableOpacity
                  style={{ position: "absolute", top: -6, right: -6, backgroundColor: "#ef4444", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}
                  onPress={() => { setSponsorProofLocalUri(null); setSponsorProofObjectPath(null); }}
                >
                  <Feather name="x" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={{ width: 100, height: 100, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 4 }}
                onPress={pickSponsorProof}
              >
                <Feather name="upload" size={20} color={colors.mutedForeground} />
                <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Ajouter</Text>
              </TouchableOpacity>
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
