import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { askText } from "@/components/ui/TextPrompt";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { chat } from "@/features/chat/api";
import { marketplace } from "@/features/marketplace/api";
import { ErrorState, LoadingState } from "@/components/DataState";
import { crossPlatformShadow } from "@/lib/shadow";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Button, IconButton } from "@/components/ui";
import { FONT } from "@/constants/typography";
import { useFileTicket } from "@/hooks/useFileTicket";
import { listingImages, resolveMediaUrl } from "@/lib/media";
import { categoryIcon, categoryLabelKey, conditionLabelKey } from "@/features/marketplace/catalog";
import { useWindowDimensions } from "react-native";

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
  /** Seller is a current resident of this condominium (server fact). */
  sellerVerifiedResident?: boolean;
  otherResidence?: boolean;
  residenceCity?: string | null;
  /** The viewer is the neighbour who reserved it (the server hides who otherwise). */
  reservedByMe?: boolean;
  /** Sold to the viewer: they may rate the exchange once. */
  canReview?: boolean;
};

type Comment = {
  id: string;
  userId: string;
  userName: string | null;
  userRole: string | null;
  content: string;
  createdAt: string;
};

function formatMAD(price: string | number | null | undefined, locale: string): string {
  const n = Number(price ?? 0);
  if (isNaN(n)) return "0";
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

const CONDITION_KEYS: Record<string, string> = {
  neuf: "marketplaceConditionNew",
  bon: "marketplaceConditionGood",
  acceptable: "marketplaceConditionAcceptable",
  mauvais: "marketplaceConditionPoor",
};

const CATEGORY_KEYS: Record<string, string> = {
  electromenager: "marketplaceCategoryAppliances",
  meubles: "marketplaceCategoryFurniture",
  vetements: "marketplaceCategoryClothing",
  electronique: "marketplaceCategoryElectronics",
  sport: "marketplaceCategorySports",
  livres: "marketplaceCategoryBooks",
  autre: "marketplaceCategoryOther",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "#13976C",
  pending_review: "#C98511",
  rejected: "#C8323C",
  modification_requested: "#C8642A",
  sold_out: "#A6A1BE",
  reserved: "#5A4AD6",
  sold: "#A6A1BE",
};

const STATUS_KEYS: Record<string, string> = {
  approved: "productStatusAvailable",
  pending_review: "marketplaceStatusPendingReview",
  rejected: "marketplaceStatusRejected",
  modification_requested: "marketplaceStatusModificationRequested",
  sold_out: "marketplaceStatusSoldOut",
  reserved: "marketplaceStatusReserved",
  sold: "marketplaceStatusSold",
};

const REPORT_REASONS = [
  { value: "spam", labelKey: "productReportSpam" },
  { value: "inappropriate", labelKey: "productReportInappropriate" },
  { value: "fraude", labelKey: "productReportFraud" },
  { value: "faux_produit", labelKey: "productReportFake" },
  { value: "produit_interdit", labelKey: "productReportProhibited" },
  { value: "mauvaise_info", labelKey: "productReportIncorrectInfo" },
  { value: "autre", labelKey: "onboardingOther" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { showToast } = useToast();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, lang, isRTL } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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
  const isReserver = !!product?.reservedByMe || (!!product?.reservedBy && product?.reservedBy === user?.id);
  const ticket = useFileTicket();
  const { width: winW } = useWindowDimensions();
  const [photo, setPhoto] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

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
       setLoadError(false);
    } catch {
       setLoadError(true);
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
        Alert.alert(t("productValidatePromotion"), t("productValidatePromotionMessage"), [
        { text: t("cartCancel"), style: "cancel" },
        {
          text: t("approveBtn"),
          onPress: async () => {
            setValidatingPromo(true);
            try {
              await marketplace.validatePromotion(pendingPromo.id, { approve: true });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setPendingPromo(null);
              fetchAll();
            } catch (e: any) {
               Alert.alert(t("cartUpdateErrorTitle"), t("productPromotionValidationError"));
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
      Alert.alert(t("cartUpdateErrorTitle"), t("productPromotionRejectError"));
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
      Alert.alert(t("cartUpdateErrorTitle"), t("productFavoriteError"));
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
        Alert.alert(t("productUnavailableTitle"), t("productContactBlocked"));
      } else {
        Alert.alert(t("cartUpdateErrorTitle"), t("productContactError"));
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
      showToast({ type: "success", title: t("productReservedTitle"), message: t("productReservedMessage") });
    } catch (e: any) {
      Alert.alert(t("cartUpdateErrorTitle"), t("productReserveError"));
    } finally {
      setReserving(false);
    }
  };

  const handleUnreserve = () => {
    Alert.alert(t("productCancelReservation"), t("productCancelReservationMessage"), [
      { text: t("productNo"), style: "cancel" },
      {
         text: t("productCancelReservation"),
        style: "destructive",
        onPress: async () => {
          setReserving(true);
          try {
            const res = await marketplace.unreserveProduct(product!.id);
            setProduct((p) => p ? { ...p, ...(res.data as Partial<Product>) } : p);
             showToast({ type: "success", title: t("productReservationCancelled"), message: t("productAvailableAgain") });
          } catch (e: any) {
            Alert.alert(t("cartUpdateErrorTitle"), t("productCancelReservationError"));
          } finally {
            setReserving(false);
          }
        },
      },
    ]);
  };

  const handleMarkSold = () => {
    Alert.alert(
      t("productMarkSold"),
      t("productMarkSoldMessage"),
      [
        { text: t("cartCancel"), style: "cancel" },
        {
          text: t("mkMarkSold"),
          onPress: async () => {
            setMarkingSold(true);
            try {
              const res = await marketplace.markSold(product!.id);
              setProduct((p) => p ? { ...p, ...(res.data as Partial<Product>) } : p);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
               showToast({ type: "success", title: t("productSoldTitle"), message: t("productSoldMessage") });
            } catch (e: any) {
              Alert.alert(t("cartUpdateErrorTitle"), t("productMarkSoldError"));
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
      Alert.alert(t("cartUpdateErrorTitle"), t("productCommentSendError"));
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    Alert.alert(t("productDelete"), t("productDeleteCommentMessage"), [
      { text: t("cartCancel"), style: "cancel" },
      {
        text: t("productDelete"),
        style: "destructive",
        onPress: async () => {
          try {
            await marketplace.deleteComment(product!.id, commentId);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
          } catch {
            Alert.alert(t("cartUpdateErrorTitle"), t("productCommentDeleteError"));
          }
        },
      },
    ]);
  };

  const handleModerate = (action: string, extra?: Record<string, string>) => {
    if (!product) return;
    const labels: Record<string, string> = {
      approve: t("productModerateApprove"),
      reject: t("productModerateReject"),
      feature: t("productModerateFeature"),
    };
    Alert.alert(t("productModeration"), labels[action] ?? action, [
      { text: t("cartCancel"), style: "cancel" },
      {
         text: t("cartConfirm"),
        onPress: async () => {
          try {
            const res = await marketplace.moderate(product.id, { action, ...extra });
            setProduct((p) => p ? { ...p, ...(res.data as Partial<Product>) } : p);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
             Alert.alert(t("cartUpdateErrorTitle"), t("marketplaceModerationError"));
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
       showToast({ type: "success", title: t("productReportSent"), message: t("productReportSentMessage") });
    } catch {
       Alert.alert(t("cartUpdateErrorTitle"), t("productReportError"));
    } finally {
      setSubmittingReport(false);
    }
  };

  const submitReview = async () => {
    if (!product) return;
    setSubmittingReview(true);
    try {
      await marketplace.addReview({ productId: product.id, rating: reviewRating, comment: reviewText.trim() });
      setShowReview(false);
      setProduct((p) => (p ? { ...p, canReview: false } : p));
      showToast({ type: "success", title: t("mkReviewThanks"), message: t("mkReviewThanksMsg") });
    } catch (e: any) {
      Alert.alert(t("cartUpdateErrorTitle"), e?.message ?? t("uiActionFailed"));
    } finally {
      setSubmittingReview(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <LoadingState
          title={t("productLoadingTitle")}
          description={t("productLoadingDescription")}
        />
      </View>
    );
  }

  if (!product) {
    if (loadError) {
      return (
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <ErrorState
            title={t("productDataUnavailable")}
            description={t("productDataUnavailableDescription")}
            retryLabel={t("marketplaceRetry")}
            onRetry={fetchAll}
          />
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.backBtnText, { color: colors.foreground }]}>{t("productBack")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{t("productNotFound")}</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.backBtnText}>{t("productBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Same number format as the listing cards (useFormat).
  const locale = lang === "fr" ? "fr-FR" : lang === "en" ? "en-US" : lang === "ar" ? "ar-MA" : "es-ES";
  const parsedImages: string[] = (() => { try { return JSON.parse(product.imageUrls ?? "[]"); } catch { return []; } })();
  const parsedContactPrefs: string[] = (() => { try { return JSON.parse(product.contactPreferences ?? '["chat"]'); } catch { return ["chat"]; } })();
  const price = formatMAD(product.price, locale) + " MAD";
  const statusColor = STATUS_COLORS[product.status] ?? colors.mutedForeground;
  const statusLabel = t(STATUS_KEYS[product.status] ?? product.status);

  const canReserve = !isSeller && !isAdmin && product.status === "approved";
  const canUnreserve = product.status === "reserved" && (isReserver || isSeller || isAdmin);
  const canMarkSold = (isSeller || isAdmin) && ["approved", "reserved"].includes(product.status);

  // Count of FABs visible
  const fabCount = [
    !isSeller && !isAdmin && ["approved", "reserved"].includes(product.status), // contact
    canReserve || canUnreserve, // reserve/unreserve
    canMarkSold, // mark sold
  ].filter(Boolean).length;

  const images = listingImages(product.imageUrls);
  const galleryW = Math.min(winW, 720);
  const isBuyer = !isSeller && !isAdmin;
  const sold = product.status === "sold";
  const reservedByOther = product.status === "reserved" && !isReserver && !isSeller;
  const contactLabels: Record<string, string> = { chat: t("productContactChat"), phone: t("productContactPhone"), email: t("productContactEmail") };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}
      behavior="padding"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Gallery ── */}
        <View style={[pd.gallery, { width: "100%", backgroundColor: colors.primarySoft }]}>
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / galleryW))}
              style={{ width: galleryW, alignSelf: "center" }}
            >
              {images.map((img, i) => (
                <Image
                  key={img + i}
                  source={resolveMediaUrl(img, ticket) ? { uri: resolveMediaUrl(img, ticket)! } : undefined}
                  style={{ width: galleryW, height: 360 }}
                  contentFit="cover"
                  transition={200}
                  accessibilityLabel={`${product.name} — ${i + 1}/${images.length}`}
                />
              ))}
            </ScrollView>
          ) : (
            <LinearGradient colors={[colors.primarySoft, colors.surfaceMuted]} style={pd.noPhoto}>
              <Feather name={categoryIcon(product.category)} size={56} color={colors.tint} />
            </LinearGradient>
          )}
          <LinearGradient colors={["rgba(14,12,28,0.55)", "rgba(14,12,28,0)"]} style={[pd.topShade, { paddingTop: insets.top + 8 }]}>
            <IconButton icon={isRTL ? "arrow-right" : "arrow-left"} variant="onDark" accessibilityLabel={t("back")} onPress={() => router.back()} />
            <IconButton
              icon="heart"
              variant="onDark"
              accessibilityLabel={product.isFavorited ? t("uiFavoriteRemove") : t("uiFavoriteAdd")}
              onPress={toggleFavorite}
              disabled={favoriteLoading}
            />
          </LinearGradient>
          {images.length > 1 ? (
            <View style={pd.dots}>
              {images.map((_, i) => (
                <View key={i} style={[pd.dot, { backgroundColor: i === photo ? "#FFFFFF" : "rgba(255,255,255,0.5)", width: i === photo ? 18 : 6 }]} />
              ))}
            </View>
          ) : null}
          {product.status === "reserved" || sold ? (
            <View style={[pd.statusPill, { backgroundColor: sold ? "rgba(58,54,82,0.9)" : "rgba(20,17,58,0.85)" }]}>
              <Feather name={sold ? "check-circle" : "lock"} size={13} color="#FFFFFF" />
              <Text style={pd.statusPillText}>{sold ? t("marketplaceStatusSold") : isReserver ? t("mkReservedByYou") : t("mkReserved")}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Content sheet ── */}
        <View style={[pd.sheet, { backgroundColor: colors.background }]}>
          <View style={pd.priceRow}>
            <Text style={[pd.price, { color: colors.foreground }]}>{price}</Text>
            {product.originalPrice && Number(product.originalPrice) > Number(product.price) ? (
              <Text style={[pd.oldPrice, { color: colors.textMuted }]}>{formatMAD(product.originalPrice, locale)} MAD</Text>
            ) : null}
            {product.negotiable ? (
              <View style={[pd.pill, { backgroundColor: colors.primarySoft }]}>
                <Text style={[pd.pillText, { color: colors.tint }]}>{t("mkNegotiable")}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[pd.name, { color: colors.foreground }]} accessibilityRole="header">{product.name}</Text>

          <View style={pd.chips}>
            <View style={[pd.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name={categoryIcon(product.category)} size={13} color={colors.tint} />
              <Text style={[pd.chipText, { color: colors.textSecondary }]}>{t(categoryLabelKey(product.category))}</Text>
            </View>
            {product.condition ? (
              <View style={[pd.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="star" size={13} color={colors.goldText} />
                <Text style={[pd.chipText, { color: colors.textSecondary }]}>{t(conditionLabelKey(product.condition))}</Text>
              </View>
            ) : null}
            {product.brand || product.model || product.purchaseYear ? (
              <View style={[pd.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="info" size={13} color={colors.textMuted} />
                <Text style={[pd.chipText, { color: colors.textSecondary }]}>
                  {[product.brand, product.model, product.purchaseYear].filter(Boolean).join(" · ")}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Seller */}
          <View style={[pd.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={pd.sellerRow}>
              <View style={[pd.avatar, { backgroundColor: colors.primarySoft }]}>
                <Text style={[pd.avatarText, { color: colors.tint }]}>{(product.sellerName ?? "?").trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[pd.sellerName, { color: colors.foreground }]} numberOfLines={1}>{product.sellerName}</Text>
                {product.sellerVerifiedResident ? (
                  <View style={pd.verified}>
                    <Feather name="check-circle" size={13} color={colors.success} />
                    <Text style={[pd.verifiedText, { color: colors.successText }]}>
                      {t("mkVerifiedNeighbour")}{product.building ? ` · ${t("mkBuildingShort").replace("{b}", product.building)}` : ""}
                    </Text>
                  </View>
                ) : (
                  <Text style={[pd.verifiedText, { color: colors.textMuted }]}>{t("mkNotVerified")}</Text>
                )}
              </View>
              {Number(product.ratingCount) > 0 ? (
                <View style={[pd.pill, { backgroundColor: colors.goldSoft }]}>
                  <Feather name="star" size={12} color={colors.goldText} />
                  <Text style={[pd.pillText, { color: colors.goldText }]}>{product.avgRating} ({product.ratingCount})</Text>
                </View>
              ) : null}
            </View>
            {parsedContactPrefs.length > 0 ? (
              <Text style={[pd.small, { color: colors.textMuted }]}>
                {t("mkContactBy")} {parsedContactPrefs.map((c) => contactLabels[c] ?? c).join(" · ")}
                {product.sellerPhone ? ` · ${product.sellerPhone}` : ""}
              </Text>
            ) : null}
          </View>

          {product.description ? (
            <View style={pd.block}>
              <Text style={[pd.blockTitle, { color: colors.foreground }]}>{t("mkDescription")}</Text>
              <Text style={[pd.body, { color: colors.textSecondary }]}>{product.description}</Text>
              {product.sellingReason ? (
                <Text style={[pd.small, { color: colors.textMuted }]}>{t("productSellingReason")} : {product.sellingReason}</Text>
              ) : null}
            </View>
          ) : null}

          {/* Listing from another residence: city only, questions on the listing. */}
          {!isSeller && product.otherResidence ? (
            <View style={[pd.card, { backgroundColor: colors.goldSoft, borderColor: colors.gold, flexDirection: "row", gap: 10, alignItems: "flex-start" }]}>
              <Feather name="map-pin" size={16} color={colors.goldText} />
              <Text style={[{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.goldText, fontFamily: "Inter_500Medium" }]}>{t("mkOtherResidenceNote").replace("{city}", product.residenceCity ?? "—")}</Text>
            </View>
          ) : null}

          {/* How the exchange works */}
          {!isSeller ? (
            <View style={[pd.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[pd.blockTitle, { color: colors.foreground }]}>{t("mkHowTitle")}</Text>
              {[
                { icon: "lock" as const, text: t("mkHowReserve") },
                { icon: "map-pin" as const, text: t("mkHowMeet") },
                { icon: "check-circle" as const, text: t("mkHowPay") },
              ].map((x, i) => (
                <View key={i} style={pd.step}>
                  <View style={[pd.stepNum, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[pd.stepNumText, { color: colors.tint }]}>{i + 1}</Text>
                  </View>
                  <Text style={[pd.body, { color: colors.textSecondary, flex: 1 }]}>{x.text}</Text>
                </View>
              ))}
              <View style={[pd.safety, { backgroundColor: colors.warningSoft }]}>
                <Feather name="shield" size={15} color={colors.warning} />
                <Text style={[pd.small, { color: colors.warningText, flex: 1 }]}>{t("mkSafety")}</Text>
              </View>
            </View>
          ) : null}

          {product.rejectionReason && (isSeller || isAdmin) ? (
            <View style={[pd.safety, { backgroundColor: colors.dangerSoft }]}>
              <Feather name="alert-circle" size={15} color={colors.danger} />
              <Text style={[pd.small, { color: colors.dangerText, flex: 1 }]}>{product.rejectionReason}</Text>
            </View>
          ) : null}
          {product.moderationNote && isAdmin ? (
            <View style={[pd.safety, { backgroundColor: colors.warningSoft }]}>
              <Feather name="info" size={15} color={colors.warning} />
              <Text style={[pd.small, { color: colors.warningText, flex: 1 }]}>{product.moderationNote}</Text>
            </View>
          ) : null}
        </View>

        {/* Admin moderation panel */}
        {isAdmin && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("productModerationSection")}</Text>
            <View style={styles.moderationRow}>
              {product.status === "pending_review" && (
                <>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.success + "15" }]} onPress={() => handleModerate("approve")}>
                    <Feather name="check" size={16} color={colors.success} />
                    <Text style={[styles.modBtnText, { color: colors.success }]}>{t("productApproveAction")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.warning + "15" }]} onPress={() => {
                    askText({ title: t("productRequestChangesTitle"), message: t("productRequestChangesDescription"), required: true }).then((reason) => {
                      if (reason) marketplace.moderate(product.id, { action: "request_modification", reason }).then((r) => setProduct((p) => p ? { ...p, ...(r.data as Partial<Product>) } : p)).catch(() => {});
                    });
                  }}>
                    <Feather name="edit" size={16} color={colors.warning} />
                    <Text style={[styles.modBtnText, { color: colors.warning }]}>{t("productRequestChangesAction")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.destructive + "15" }]} onPress={() => handleModerate("reject")}>
                    <Feather name="x" size={16} color={colors.destructive} />
                    <Text style={[styles.modBtnText, { color: colors.destructive }]}>{t("productRejectAction")}</Text>
                  </TouchableOpacity>
                </>
              )}
              {product.status === "approved" && !product.featured && (
                <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.warning + "15" }]} onPress={() => handleModerate("feature")}>
                  <Feather name="star" size={16} color={colors.warning} />
                  <Text style={[styles.modBtnText, { color: colors.warning }]}>{t("productFeatureAction")}</Text>
                </TouchableOpacity>
              )}
            </View>

            {pendingPromo && (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: 13 }]}>{t("productPendingPromotion")}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  {t("productPromotionType")}: {pendingPromo.type} · {t("productPromotionAmount")}: {formatMAD(pendingPromo.amount, locale)} MAD · {t("productPromotionPayment")}: {pendingPromo.paymentMethod ?? "—"}
                </Text>
                {pendingPromo.proofUrl
                  ? <Text style={{ fontSize: 12, color: colors.success }}>{t("productProofProvided")}</Text>
                  : <Text style={{ fontSize: 12, color: colors.destructive }}>{t("productProofMissing")}</Text>}
                <View style={styles.moderationRow}>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.success + "15" }]} onPress={() => handleValidatePromotion(true)} disabled={validatingPromo}>
                    <Feather name="check" size={16} color={colors.success} />
                    <Text style={[styles.modBtnText, { color: colors.success }]}>{t("productApprovePayment")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modBtn, { backgroundColor: colors.destructive + "15" }]} onPress={() => handleValidatePromotion(false)} disabled={validatingPromo}>
                    <Feather name="x" size={16} color={colors.destructive} />
                    <Text style={[styles.modBtnText, { color: colors.destructive }]}>{t("productRejectAction")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}


        {/* Questions (public) */}
        <View style={[pd.card, pd.cardInset, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[pd.blockTitle, { color: colors.foreground }]}>{t("mkQuestions")} ({comments.length})</Text>
          {comments.length === 0 ? (
            <Text style={[pd.small, { color: colors.textMuted }]}>{t("mkNoQuestions")}</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={[pd.comment, { borderBottomColor: colors.border }]}>
                <View style={[pd.commentAvatar, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[pd.avatarText, { color: colors.tint, fontSize: 13 }]}>{(c.userName ?? "?")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[pd.small, { color: colors.foreground, fontFamily: FONT.semibold }]}>
                    {c.userName ?? t("productUser")} · <Text style={{ color: colors.textMuted, fontFamily: FONT.regular }}>{new Date(c.createdAt).toLocaleDateString(locale)}</Text>
                  </Text>
                  <Text style={[pd.body, { color: colors.textSecondary }]}>{c.content}</Text>
                </View>
                {isAdmin || c.userId === user?.id ? (
                  <Pressable onPress={() => handleDeleteComment(c.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("productDelete")}>
                    <Feather name="trash-2" size={14} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
          {!sold ? (
            <View style={pd.askRow}>
              <TextInput
                style={[pd.askInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}
                placeholder={t("productAskSellerPlaceholder")}
                placeholderTextColor={colors.textMuted}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={1000}
              />
              <Pressable
                onPress={handleSendComment}
                disabled={!commentText.trim() || sendingComment}
                accessibilityRole="button"
                accessibilityLabel={t("send")}
                style={[pd.askSend, { backgroundColor: commentText.trim() ? colors.primary : colors.surfaceMuted }]}
              >
                {sendingComment ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="send" size={17} color={commentText.trim() ? "#FFFFFF" : colors.textMuted} />}
              </Pressable>
            </View>
          ) : null}
        </View>

        {!isSeller && ["approved", "reserved"].includes(product.status) ? (
          <Pressable onPress={() => setShowReportModal(true)} style={pd.report} accessibilityRole="button">
            <Feather name="flag" size={14} color={colors.textMuted} />
            <Text style={[pd.small, { color: colors.textMuted }]}>{t("productReportTitle")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* ── Action bar: only what this person can do now ── */}
      {(() => {
        const actions: React.ReactNode[] = [];
        if (isBuyer && ["approved", "reserved"].includes(product.status) && !sold) {
          actions.push(<Button key="contact" label={t("productContactSellerAction")} icon="message-circle" variant="secondary" loading={contactingSeller} onPress={handleContactSeller} style={{ flex: 1 }} />);
        }
        if (canReserve) actions.push(<Button key="reserve" label={t("productReserveAction")} icon="lock" loading={reserving} onPress={handleReserve} style={{ flex: 1 }} />);
        if (canUnreserve && !isSeller) actions.push(<Button key="unreserve" label={t("productCancelReservation")} icon="unlock" variant="secondary" loading={reserving} onPress={handleUnreserve} style={{ flex: 1 }} />);
        if (canMarkSold) actions.push(<Button key="sold" label={t("mkHandedOver")} icon="check-circle" loading={markingSold} onPress={handleMarkSold} style={{ flex: 1 }} />);
        if (isSeller && product.status === "reserved") actions.push(<Button key="free" label={t("mkFreeReservation")} icon="unlock" variant="secondary" loading={reserving} onPress={handleUnreserve} style={{ flex: 1 }} />);
        if (product.canReview) actions.push(<Button key="review" label={t("mkRateSeller")} icon="star" onPress={() => setShowReview(true)} style={{ flex: 1 }} />);
        if (reservedByOther && actions.length === 0) {
          return (
            <View style={[pd.bar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.border }]}>
              <Text style={[pd.small, { color: colors.textMuted, textAlign: "center", flex: 1 }]}>{t("mkReservedByNeighbour")}</Text>
            </View>
          );
        }
        if (!actions.length) return null;
        return (
          <View style={[pd.bar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopColor: colors.border }]}>
            {actions}
          </View>
        );
      })()}

      {/* Rate the exchange */}
      {showReview ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={() => setShowReview(false)} accessibilityLabel={t("close")} />
          <View style={[styles.modal, { backgroundColor: colors.card, bottom: insets.bottom + 16, gap: 14 }]}>
            <Text style={[pd.blockTitle, { color: colors.foreground }]}>{t("mkRateSeller")}</Text>
            <View style={pd.stars} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: 5, now: reviewRating }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setReviewRating(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n}/5`}>
                  <Feather name="star" size={30} color={n <= reviewRating ? colors.gold : colors.borderStrong} />
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[pd.askInput, { minHeight: 80, backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}
              placeholder={t("mkReviewPlaceholder")}
              placeholderTextColor={colors.textMuted}
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              maxLength={2000}
            />
            <Button label={t("mkPublishReview")} fullWidth loading={submittingReview} onPress={submitReview} />
          </View>
        </View>
      ) : null}

      {/* Report modal */}
      {showReportModal && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={() => setShowReportModal(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, bottom: insets.bottom + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("productReportTitle")}</Text>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.reportOption, { borderColor: reportReason === r.value ? colors.primary : colors.border }, reportReason === r.value && { backgroundColor: colors.primary + "10" }]}
                onPress={() => setReportReason(r.value)}
              >
                <View style={[styles.radioCircle, { borderColor: reportReason === r.value ? colors.primary : colors.border }]}>
                  {reportReason === r.value && <View style={[styles.radioFill, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.reportOptionText, { color: colors.foreground }]}>{t(r.labelKey)}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.reportDetailsInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder={t("productReportDetailsPlaceholder")}
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
              {submittingReport ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.reportSubmitText}>{t("productSendReport")}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Reject sponsorship modal */}
      {showRejectPromo && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={() => setShowRejectPromo(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, bottom: insets.bottom + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("productRejectPromotionTitle")}</Text>
            <TextInput
              style={[styles.reportDetailsInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              placeholder={t("productRejectPromotionPlaceholder")}
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
              {validatingPromo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.reportSubmitText}>{t("productConfirmReject")}</Text>}
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
  cartFab: { position: "absolute", start: 16, end: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 14, ...crossPlatformShadow({ color: "#000", offsetY: 2, opacity: 0.2, radius: 6, elevation: 4 }) },
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

const pd = StyleSheet.create({
  gallery: { height: 360, overflow: "hidden" },
  noPhoto: { flex: 1, alignItems: "center", justifyContent: "center" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 28 },
  dots: { position: "absolute", bottom: 40, alignSelf: "center", flexDirection: "row", gap: 5 },
  dot: { height: 6, borderRadius: 3 },
  statusPill: { position: "absolute", bottom: 40, start: 16, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  statusPillText: { fontFamily: FONT.semibold, fontSize: 12, color: "#FFFFFF" },
  sheet: { marginTop: -24, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 22, gap: 16 },
  priceRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 10 },
  price: { fontFamily: "Fraunces_600SemiBold", fontSize: 32, lineHeight: 38, fontVariant: ["lining-nums"] },
  oldPrice: { fontFamily: FONT.medium, fontSize: 15, textDecorationLine: "line-through" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontFamily: FONT.semibold, fontSize: 12 },
  name: { fontFamily: FONT.semibold, fontSize: 20, lineHeight: 27, marginTop: -6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 34, borderRadius: 999, borderWidth: 1 },
  chipText: { fontFamily: FONT.medium, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  cardInset: { marginHorizontal: 20, marginTop: 16 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Fraunces_600SemiBold", fontSize: 20 },
  sellerName: { fontFamily: FONT.semibold, fontSize: 16 },
  verified: { flexDirection: "row", alignItems: "center", gap: 5 },
  verifiedText: { fontFamily: FONT.medium, fontSize: 12 },
  small: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18 },
  block: { gap: 8 },
  blockTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 18, lineHeight: 24 },
  body: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: FONT.bold, fontSize: 13 },
  safety: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12 },
  comment: { flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  askRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  askInput: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONT.regular, fontSize: 14 },
  askSend: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  report: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44, marginTop: 8 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  stars: { flexDirection: "row", justifyContent: "center", gap: 10 },
});
