import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { marketplace, chat } from "@/services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  description: string;
  price: string;
  originalPrice?: string | null;
  category: string;
  condition: string;
  brand?: string | null;
  model?: string | null;
  purchaseYear?: string | null;
  sellingReason?: string | null;
  negotiable?: boolean;
  contactPreferences?: string;
  location: string;
  building?: string | null;
  block?: string | null;
  floor?: string | null;
  imageUrls: string;
  videoUrl?: string | null;
  stock: number;
  sellerId: string;
  sellerName: string;
  sellerPhone?: string | null;
  sellerEmail?: string | null;
  status: string;
  rejectionReason: string | null;
  moderationNote?: string | null;
  featured: boolean;
  boosted: boolean;
  viewCount: number;
  isFavorited: boolean;
  avgRating: string;
  ratingCount: number;
  reservedBy?: string | null;
  reservedByName?: string | null;
  reservedAt?: string | null;
  soldAt?: string | null;
  createdAt: string;
};

type Comment = {
  id: string;
  userId: string;
  userName: string | null;
  userRole: string | null;
  content: string;
  createdAt: string;
};

function formatMAD(price: string | number | null | undefined): string {
  const n = Number(price ?? 0);
  if (isNaN(n)) return "0";
  try { return n.toLocaleString("fr-FR"); } catch { return String(Math.round(n)); }
}

const CONDITION_LABELS: Record<string, string> = {
  neuf: "Neuf",
  bon: "Bon état",
  acceptable: "État acceptable",
  mauvais: "Mauvais état",
};

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
  approved: "Disponible",
  pending_review: "En attente de validation",
  rejected: "Rejeté",
  modification_requested: "Modifications requises",
  sold_out: "Épuisé",
  reserved: "Réservé",
  sold: "Vendu",
};

const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Contenu inapproprié" },
  { value: "fraude", label: "Fraude / arnaque" },
  { value: "faux_produit", label: "Faux produit" },
  { value: "produit_interdit", label: "Produit interdit" },
  { value: "mauvaise_info", label: "Informations incorrectes" },
  { value: "autre", label: "Autre" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { showToast } = useToast();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [contactingSeller, setContactingSeller] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [markingSold, setMarkingSold] = useState(false);

  // Only super_admin has marketplace moderation rights — syndicate_admin is read-only
  const isAdmin = user?.role === "super_admin";
  const isSeller = product?.sellerId === user?.id;
  const isReserver = product?.reservedBy === user?.id;

  const [pendingPromo, setPendingPromo] = useState<{ id: string; type: string; amount: string; paymentMethod: string | null; proofUrl: string | null } | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [showRejectPromo, setShowRejectPromo] = useState(false);
  const [rejectPromoReason, setRejectPromoReason] = useState("");

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      const [pRes, cRes] = await Promise.all([
        marketplace.productDetail(id),
        marketplace.comments(id),
      ]);
      setProduct(pRes.data as Product);
      setComments((cRes.data as Comment[]) ?? []);
    } catch {
      // keep stale
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    if (!isAdmin || !id) return;
    marketplace.pendingPromotions()
      .then((res) => {
        const match = (res.data ?? []).find((pr: any) => pr.productId === id);
        setPendingPromo(match ?? null);
      })
      .catch(() => {});
  }, [isAdmin, id, product?.boosted]);

  const handleValidatePromotion = (approve: boolean) => {
    if (!pendingPromo) return;
    if (approve) {
      Alert.alert("Valider la sponsorisation", "Confirmez avoir vérifié le justificatif avant d'approuver.", [
        { text: "Annuler", style: "cancel" },
        {
          text: "Approuver",
          onPress: async () => {
            setValidatingPromo(true);
            try {
              await marketplace.validatePromotion(pendingPromo.id, { approve: true });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setPendingPromo(null);
              fetchAll();
            } catch (e: any) {
              Alert.alert("Erreur", e?.message ?? "Impossible de valider la sponsorisation");
            } finally {
              setValidatingPromo(false);
            }
          },
        },
      ]);
    } else {
      setRejectPromoReason("");
      setShowRejectPromo(true);
    }
  };

  const submitRejectPromotion = async () => {
    if (!pendingPromo || !rejectPromoReason.trim()) return;
    setValidatingPromo(true);
    try {
      await marketplace.validatePromotion(pendingPromo.id, { approve: false, rejectionReason: rejectPromoReason.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingPromo(null);
      setShowRejectPromo(false);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de rejeter la demande");
    } finally {
      setValidatingPromo(false);
    }
  };

  useEffect(() => { fetchAll(); }, [fetchAll]);
  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  // ─── Actions ────────────────────────────────────────────────────────────

  const toggleFavorite = async () => {
    if (!product) return;
    setFavoriteLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await marketplace.toggleFavorite(product.id);
      setProduct((p) => p ? { ...p, isFavorited: (res as { isFavorited: boolean }).isFavorited } : p);
    } catch {
      Alert.alert("Erreur", "Impossible de modifier les favoris");
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleContactSeller = async () => {
    if (!product) return;
    setContactingSeller(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await chat.contactSeller(product.id);
      router.push(`/chat-thread?id=${res.data.id}`);
    } catch (e: any) {
      if (e?.code === "USER_BLOCKED") {
        Alert.alert("Indisponible", "Vous ne pouvez pas contacter ce vendeur.");
      } else {
        Alert.alert("Erreur", e?.message ?? "Impossible de contacter le vendeur");
      }
    } finally {
      setContactingSeller(false);
    }
  };

  const handleReserve = async () => {
    if (!product) return;
    setReserving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await marketplace.reserveProduct(product.id);
      setProduct((p) => p ? { ...p, ...(res.data as Partial<Product>) } : p);
      showToast({ type: "success", title: "Réservé !", message: "Le produit vous est réservé. Contactez le vendeur pour finaliser." });
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de réserver ce produit");
    } finally {
      setReserving(false);
    }
  };

  const handleUnreserve = () => {
    Alert.alert("Annuler la réservation", "Êtes-vous sûr de vouloir annuler votre réservation ?", [
      { text: "Non", style: "cancel" },
      {
        text: "Annuler la réservation",
        style: "destructive",
        onPress: async () => {
          setReserving(true);
          try {
            const res = await marketplace.unreserveProduct(product!.id);
            setProduct((p) => p ? { ...p, ...(res.data as Partial<Product>) } : p);
            showToast({ type: "success", title: "Réservation annulée", message: "Le produit est à nouveau disponible" });
          } catch (e: any) {
            Alert.alert("Erreur", e?.message ?? "Impossible d'annuler la réservation");
          } finally {
            setReserving(false);
          }
        },
      },
    ]);
  };

  const handleMarkSold = () => {
    Alert.alert(
      "Marquer comme vendu",
      "Confirmez que la transaction est terminée. Le produit sera archivé comme vendu.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Marquer comme vendu",
          onPress: async () => {
            setMarkingSold(true);
            try {
              const res = await marketplace.markSold(product!.id);
              setProduct((p) => p ? { ...p, ...(res.data as Partial<Product>) } : p);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast({ type: "success", title: "Vendu !", message: "La vente est enregistrée. Bravo !" });
            } catch (e: any) {
              Alert.alert("Erreur", e?.message ?? "Impossible de marquer comme vendu");
            } finally {
              setMarkingSold(false);
            }
          },
        },
      ],
    );
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !product) return;
    setSendingComment(true);
    try {
      const res = await marketplace.addComment(product.id, commentText.trim());
      setComments((prev) => [...prev, res.data as Comment]);
      setCommentText("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Erreur", "Impossible d'envoyer le commentaire");
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert("Supprimer", "Supprimer ce commentaire ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            await marketplace.deleteComment(product!.id, commentId);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
          } catch {
            Alert.alert("Erreur", "Impossible de supprimer");
          }
        },
      },
    ]);
  };

  const handleModerate = (action: string, extra?: Record<string, string>) => {
    if (!product) return;
    const labels: Record<string, string> = {
      approve: "Approuver ce produit ?",
      reject: "Rejeter ce produit ?",
      feature: "Mettre en avant ce produit ?",
    };
    Alert.alert("Modération", labels[action] ?? action, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Confirmer",
        onPress: async () => {
          try {
            const res = await marketplace.moderate(product.id, { action, ...extra });
            setProduct((p) => p ? { ...p, ...(res.data as Partial<Product>) } : p);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert("Erreur", "Action impossible");
          }
        },
      },
    ]);
  };

  const handleSubmitReport = async () => {
    if (!reportReason || !product) return;
    setSubmittingReport(true);
    try {
      await marketplace.reportProduct(product.id, { reason: reportReason, details: reportDetails });
      setShowReportModal(false);
      setReportReason("");
      setReportDetails("");
      showToast({ type: "success", title: "Signalement envoyé", message: "Merci. Notre équipe examinera ce produit." });
    } catch {
      Alert.alert("Erreur", "Impossible d'envoyer le signalement");
    } finally {
      setSubmittingReport(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>Produit introuvable</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const parsedImages: string[] = (() => { try { return JSON.parse(product.imageUrls ?? "[]"); } catch { return []; } })();
  const parsedContactPrefs: string[] = (() => { try { return JSON.parse(product.contactPreferences ?? '["chat"]'); } catch { return ["chat"]; } })();
  const price = formatMAD(product.price) + " MAD";
  const statusColor = STATUS_COLORS[product.status] ?? colors.mutedForeground;
  const statusLabel = STATUS_LABELS[product.status] ?? product.status;

  const canReserve = !isSeller && !isAdmin && product.status === "approved";
  const canUnreserve = product.status === "reserved" && (isReserver || isSeller || isAdmin);
  const canMarkSold = (isSeller || isAdmin) && ["approved", "reserved"].includes(product.status);

  // Count of FABs visible
  const fabCount = [
    !isSeller && !isAdmin && ["approved", "reserved"].includes(product.status), // contact
    canReserve || canUnreserve, // reserve/unreserve
    canMarkSold, // mark sold
  ].filter(Boolean).length;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 60}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 + fabCount * 58 }}
      >
        {/* Header bar */}
        <View style={[styles.headerBar, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{product.name}</Text>
          <TouchableOpacity onPress={toggleFavorite} style={styles.iconBtn} disabled={favoriteLoading}>
            <Feather name="heart" size={22} color={product.isFavorited ? "#ef4444" : colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Image area */}
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.secondary }]}>
          {parsedImages.length > 0 ? (
            <Text style={[styles.imageCount, { color: colors.mutedForeground }]}>
              {parsedImages.length} photo(s)
            </Text>
          ) : (
            <Feather name="image" size={48} color={colors.mutedForeground} />
          )}
          {product.status === "reserved" && (
            <View style={[styles.overlayBadge, { backgroundColor: "#6366f1CC" }]}>
              <Feather name="lock" size={14} color="#fff" />
              <Text style={styles.overlayBadgeText}>Réservé par {product.reservedByName ?? "un résident"}</Text>
            </View>
          )}
          {product.status === "sold" && (
            <View style={[styles.overlayBadge, { backgroundColor: "#374151CC" }]}>
              <Feather name="check-circle" size={14} color="#fff" />
              <Text style={styles.overlayBadgeText}>Vendu</Text>
            </View>
          )}
        </View>

        {/* Product info card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            {product.featured && (
              <View style={[styles.statusBadge, { backgroundColor: "#f59e0b20" }]}>
                <Feather name="star" size={11} color="#f59e0b" />
                <Text style={[styles.statusText, { color: "#f59e0b", marginStart: 3 }]}>Vedette</Text>
              </View>
            )}
            {product.negotiable && (
              <View style={[styles.statusBadge, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.statusText, { color: colors.primary }]}>Négociable</Text>
              </View>
            )}
          </View>

          <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={[styles.productPrice, { color: colors.primary }]}>{price}</Text>
            {product.originalPrice && Number(product.originalPrice) > 0 && (
              <Text style={[styles.originalPrice, { color: colors.mutedForeground }]}>
                {formatMAD(product.originalPrice)} MAD
              </Text>
            )}
          </View>

          {/* Category / condition */}
          <View style={styles.metaRow}>
            <Feather name="tag" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{product.category}</Text>
            <Feather name="box" size={13} color={colors.mutedForeground} style={{ marginStart: 12 }} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{CONDITION_LABELS[product.condition] ?? product.condition}</Text>
          </View>

          {/* Brand / model / year */}
          {(product.brand || product.model || product.purchaseYear) && (
            <View style={styles.metaRow}>
              <Feather name="cpu" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {[product.brand, product.model, product.purchaseYear ? `(${product.purchaseYear})` : null].filter(Boolean).join(" · ")}
              </Text>
            </View>
          )}

          {/* Location */}
          {(product.location || product.building) && (
            <View style={styles.metaRow}>
              <Feather name="map-pin" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {[product.building, product.block ? `Bloc ${product.block}` : null, product.floor ? `Ét. ${product.floor}` : null, product.location].filter(Boolean).join(" · ")}
              </Text>
            </View>
          )}

          {/* Seller */}
          <View style={styles.metaRow}>
            <Feather name="user" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{product.sellerName}</Text>
            <Feather name="eye" size={13} color={colors.mutedForeground} style={{ marginStart: 12 }} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{product.viewCount} vues</Text>
          </View>

          {/* Rating */}
          {Number(product.ratingCount) > 0 && (
            <View style={styles.metaRow}>
              <Feather name="star" size={13} color="#f59e0b" />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {product.avgRating} / 5 ({product.ratingCount} avis)
              </Text>
            </View>
          )}

          {/* Contact preferences */}
          {parsedContactPrefs.length > 0 && (
            <View style={styles.metaRow}>
              <Feather name="phone" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                Contact : {parsedContactPrefs.map((c) => ({ chat: "Messagerie", phone: "Téléphone", email: "Email" }[c] ?? c)).join(", ")}
              </Text>
            </View>
          )}

          {/* Description */}
          {product.description ? (
            <Text style={[styles.description, { color: colors.foreground, borderTopColor: colors.border }]}>{product.description}</Text>
          ) : null}

          {/* Selling reason */}
          {product.sellingReason ? (
            <View style={[styles.infoBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="info" size={13} color={colors.mutedForeground} />
              <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>Raison de vente : {product.sellingReason}</Text>
            </View>
          ) : null}

          {/* Rejection reason / modification notes */}
          {product.rejectionReason && (isSeller || isAdmin) && (
            <View style={[styles.rejectionBox, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "40" }]}>
              <Feather name="alert-circle" size={14} color={colors.destructive} />
              <Text style={[styles.rejectionText, { color: colors.destructive }]}>{product.rejectionReason}</Text>
            </View>
          )}
          {product.moderationNote && isAdmin && (
            <View style={[styles.rejectionBox, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b40" }]}>
              <Feather name="info" size={14} color="#f59e0b" />
              <Text style={[styles.rejectionText, { color: "#f59e0b" }]}>{product.moderationNote}</Text>
            </View>
          )}
        </View>

        {/* Admin moderation panel */}
        {isAdmin && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Modération</Text>
            <View style={styles.moderationRow}>
              {product.status === "pending_review" && (
                <>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.success + "15" }]} onPress={() => handleModerate("approve")}>
                    <Feather name="check" size={16} color={colors.success} />
                    <Text style={[styles.modBtnText, { color: colors.success }]}>Approuver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: "#f9731615" }]} onPress={() => {
                    Alert.prompt
                      ? Alert.prompt("Modifications requises", "Précisez les changements attendus du vendeur", (reason) => {
                          if (reason?.trim()) marketplace.moderate(product.id, { action: "request_modification", reason }).then((r) => setProduct((p) => p ? { ...p, ...(r.data as Partial<Product>) } : p)).catch(() => {});
                        })
                      : Alert.alert("Action", "Utilisez la liste de validation pour demander des modifications");
                  }}>
                    <Feather name="edit" size={16} color="#f97316" />
                    <Text style={[styles.modBtnText, { color: "#f97316" }]}>Modifier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.destructive + "15" }]} onPress={() => handleModerate("reject")}>
                    <Feather name="x" size={16} color={colors.destructive} />
                    <Text style={[styles.modBtnText, { color: colors.destructive }]}>Rejeter</Text>
                  </TouchableOpacity>
                </>
              )}
              {product.status === "approved" && !product.featured && (
                <TouchableOpacity style={[styles.modBtn, { backgroundColor: "#f59e0b15" }]} onPress={() => handleModerate("feature")}>
                  <Feather name="star" size={16} color="#f59e0b" />
                  <Text style={[styles.modBtnText, { color: "#f59e0b" }]}>Mettre en avant</Text>
                </TouchableOpacity>
              )}
            </View>

            {pendingPromo && (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: 13 }]}>Demande de sponsorisation en attente</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  Type : {pendingPromo.type} · Montant : {formatMAD(pendingPromo.amount)} MAD · Paiement : {pendingPromo.paymentMethod ?? "—"}
                </Text>
                {pendingPromo.proofUrl
                  ? <Text style={{ fontSize: 12, color: colors.success }}>Justificatif fourni ✓</Text>
                  : <Text style={{ fontSize: 12, color: colors.destructive }}>Aucun justificatif fourni</Text>}
                <View style={styles.moderationRow}>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.success + "15" }]} onPress={() => handleValidatePromotion(true)} disabled={validatingPromo}>
                    <Feather name="check" size={16} color={colors.success} />
                    <Text style={[styles.modBtnText, { color: colors.success }]}>Approuver le paiement</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.destructive + "15" }]} onPress={() => handleValidatePromotion(false)} disabled={validatingPromo}>
                    <Feather name="x" size={16} color={colors.destructive} />
                    <Text style={[styles.modBtnText, { color: colors.destructive }]}>Rejeter</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Comments */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Commentaires ({comments.length})</Text>
          {comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <Feather name="message-circle" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun commentaire — posez une question au vendeur</Text>
            </View>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={[styles.commentRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.commentAvatar, { backgroundColor: colors.primary + "20" }]}>
                  <Text style={[styles.commentInitial, { color: colors.primary }]}>{(c.userName ?? "?")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{c.userName ?? "Utilisateur"}</Text>
                    <Text style={[styles.commentDate, { color: colors.mutedForeground }]}>{new Date(c.createdAt).toLocaleDateString("fr-MA")}</Text>
                  </View>
                  <Text style={[styles.commentContent, { color: colors.foreground }]}>{c.content}</Text>
                </View>
                {(isAdmin || c.userId === user?.id) && (
                  <TouchableOpacity onPress={() => handleDeleteComment(c.id)} style={{ padding: 4 }}>
                    <Feather name="trash-2" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* Report button */}
        {!isSeller && ["approved", "reserved"].includes(product.status) && (
          <TouchableOpacity
            style={[styles.reportBtn, { borderColor: colors.border }]}
            onPress={() => setShowReportModal(true)}
          >
            <Feather name="flag" size={14} color={colors.mutedForeground} />
            <Text style={[styles.reportBtnText, { color: colors.mutedForeground }]}>Signaler ce produit</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Comment input */}
      <View style={[styles.commentInputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={[styles.commentInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          placeholder="Poser une question au vendeur..."
          placeholderTextColor={colors.mutedForeground}
          value={commentText}
          onChangeText={setCommentText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.secondary }]}
          onPress={handleSendComment}
          disabled={!commentText.trim() || sendingComment}
        >
          {sendingComment ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={18} color={commentText.trim() ? "#fff" : colors.mutedForeground} />}
        </TouchableOpacity>
      </View>

      {/* Contact Seller FAB */}
      {!isSeller && !isAdmin && ["approved", "reserved"].includes(product.status) && (
        <TouchableOpacity
          style={[styles.contactSellerFab, { backgroundColor: colors.card, borderColor: colors.border, bottom: insets.bottom + 80 + (canReserve || canUnreserve ? 58 : 0) + (canMarkSold ? 58 : 0) }]}
          onPress={handleContactSeller}
          disabled={contactingSeller}
        >
          {contactingSeller ? <ActivityIndicator size="small" color={colors.primary} /> : (
            <>
              <Feather name="message-circle" size={18} color={colors.primary} />
              <Text style={[styles.contactSellerFabText, { color: colors.primary }]}>Contacter le vendeur</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Reserve / Unreserve FAB */}
      {canReserve && (
        <TouchableOpacity
          style={[styles.cartFab, { backgroundColor: "#6366f1", bottom: insets.bottom + 80 }]}
          onPress={handleReserve}
          disabled={reserving}
        >
          {reserving ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Feather name="lock" size={18} color="#fff" />
              <Text style={styles.cartFabText}>Réserver ce produit</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {canUnreserve && (
        <TouchableOpacity
          style={[styles.cartFab, { backgroundColor: colors.card, borderWidth: 1, borderColor: "#6366f1", bottom: insets.bottom + 80 }]}
          onPress={handleUnreserve}
          disabled={reserving}
        >
          {reserving ? <ActivityIndicator size="small" color="#6366f1" /> : (
            <>
              <Feather name="unlock" size={18} color="#6366f1" />
              <Text style={[styles.cartFabText, { color: "#6366f1" }]}>Annuler la réservation</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Mark as Sold FAB — seller only */}
      {canMarkSold && (
        <TouchableOpacity
          style={[styles.cartFab, { backgroundColor: colors.success, bottom: insets.bottom + 80 + (canReserve || canUnreserve ? 58 : 0) }]}
          onPress={handleMarkSold}
          disabled={markingSold}
        >
          {markingSold ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={styles.cartFabText}>Marquer comme vendu</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Report modal */}
      {showReportModal && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={() => setShowReportModal(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, bottom: insets.bottom + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Signaler ce produit</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.reportOption, { borderColor: reportReason === r.value ? colors.primary : colors.border }, reportReason === r.value && { backgroundColor: colors.primary + "10" }]}
                onPress={() => setReportReason(r.value)}
              >
                <View style={[styles.radioCircle, { borderColor: reportReason === r.value ? colors.primary : colors.border }]}>
                  {reportReason === r.value && <View style={[styles.radioFill, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.reportOptionText, { color: colors.foreground }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.reportDetailsInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder="Détails supplémentaires (optionnel)"
              placeholderTextColor={colors.mutedForeground}
              value={reportDetails}
              onChangeText={setReportDetails}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.reportSubmitBtn, { backgroundColor: !reportReason ? colors.secondary : colors.destructive }]}
              onPress={handleSubmitReport}
              disabled={!reportReason || submittingReport}
            >
              {submittingReport ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.reportSubmitText}>Envoyer le signalement</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Reject sponsorship modal */}
      {showRejectPromo && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={() => setShowRejectPromo(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, bottom: insets.bottom + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rejeter la sponsorisation</Text>
            <TextInput
              style={[styles.reportDetailsInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder="Motif du rejet (obligatoire)"
              placeholderTextColor={colors.mutedForeground}
              value={rejectPromoReason}
              onChangeText={setRejectPromoReason}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.reportSubmitBtn, { backgroundColor: !rejectPromoReason.trim() ? colors.secondary : colors.destructive }]}
              onPress={submitRejectPromotion}
              disabled={!rejectPromoReason.trim() || validatingPromo}
            >
              {validatingPromo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.reportSubmitText}>Confirmer le rejet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  errorText: { fontSize: 16, textAlign: "center" },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  backBtnText: { color: "#fff", fontWeight: "600" },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  iconBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "600" },
  imagePlaceholder: { height: 220, alignItems: "center", justifyContent: "center" },
  imageCount: { fontSize: 14 },
  overlayBadge: { position: "absolute", bottom: 0, start: 0, end: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  overlayBadgeText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 16, gap: 8 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "600" },
  productName: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  productPrice: { fontSize: 24, fontWeight: "800" },
  originalPrice: { fontSize: 15, textDecorationLine: "line-through" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 13 },
  description: { fontSize: 14, lineHeight: 22, borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  infoBoxText: { fontSize: 12, flex: 1, lineHeight: 17 },
  rejectionBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  rejectionText: { fontSize: 13, flex: 1, lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  moderationRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  modBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  modBtnText: { fontSize: 13, fontWeight: "600" },
  emptyComments: { alignItems: "center", gap: 8, paddingVertical: 16 },
  emptyText: { fontSize: 13, textAlign: "center" },
  commentRow: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: 1, alignItems: "flex-start" },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  commentInitial: { fontSize: 14, fontWeight: "700" },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  commentAuthor: { fontSize: 13, fontWeight: "600" },
  commentDate: { fontSize: 11 },
  commentContent: { fontSize: 13, lineHeight: 18 },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", margin: 16, padding: 12, borderRadius: 8, borderWidth: 1 },
  reportBtnText: { fontSize: 13 },
  commentInputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  commentInput: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  cartFab: { position: "absolute", start: 16, end: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 14, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
  cartFabText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  contactSellerFab: { position: "absolute", start: 16, end: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  contactSellerFabText: { fontSize: 15, fontWeight: "700" },
  modal: { position: "absolute", start: 0, end: 0, borderTopStartRadius: 20, borderTopEndRadius: 20, padding: 24, gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  reportOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, borderWidth: 1.5 },
  radioCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioFill: { width: 8, height: 8, borderRadius: 4 },
  reportOptionText: { fontSize: 14 },
  reportDetailsInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 72, textAlignVertical: "top" },
  reportSubmitBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  reportSubmitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
