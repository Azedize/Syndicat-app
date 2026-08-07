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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import EmptyState from "@/components/EmptyState";
import { ErrorState, LoadingState } from "@/components/DataState";
import { marketplace } from "@/services/api";

type ApiReview = {
  id: string;
  productId: string;
  productName: string;
  orderId?: string;
  reviewerId?: string;
  reviewerName?: string;
  rating: number;
  comment: string;
  createdAt?: string;
  sellerName?: string;
};

type ApiOrder = {
  id: string;
  productId: string;
  productName: string;
  buyerId: string;
  sellerName: string;
  status: string;
  createdAt?: string;
};

function formatReviewDate(value: string | undefined, lang: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "es"
        ? "es-ES"
        : lang === "en"
          ? "en-GB"
          : "fr-FR";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function StarRow({
  rating,
  onRate,
  size = 20,
}: {
  rating: number;
  onRate?: (n: number) => void;
  size?: number;
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onRate?.(n)}
          disabled={!onRate}
        >
          <Feather
            name={n <= rating ? "star" : "star"}
            size={size}
            color={n <= rating ? "#f59e0b" : colors.border}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReviewsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const { t, lang, isRTL } = useLanguage();

  const loadData = useCallback(async () => {
    setLoadError(false);
    try {
      const [reviewsRes, ordersRes] = await Promise.all([
        marketplace.reviews(),
        marketplace.orders(),
      ]);
      setReviews((reviewsRes.data as ApiReview[]) ?? []);
      setOrders((ordersRes.data as ApiOrder[]) ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);
  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : "0.0";

  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const reviewedOrderIds = reviews.map((r) => r.orderId).filter(Boolean);
  const pendingReviewOrders = deliveredOrders.filter(
    (o) => !reviewedOrderIds.includes(o.id),
  );

  const productNames = [
    "all",
    ...Array.from(new Set(reviews.map((r) => r.productName))),
  ];
  const filteredReviews =
    filterProduct === "all"
      ? reviews
      : reviews.filter((r) => r.productName === filterProduct);

  const ratingDist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    pct:
      reviews.length > 0
        ? (reviews.filter((r) => r.rating === star).length / reviews.length) *
          100
        : 0,
  }));

  const handleSubmit = async () => {
    if (!selectedOrderId || !comment.trim()) return;
    const order = orders.find((o) => o.id === selectedOrderId);
    if (!order) return;
    setSubmitting(true);
    try {
      const res = await marketplace.addReview({
        productId: order.productId,
        orderId: order.id,
        rating,
        comment: comment.trim(),
      });
      const newReview: ApiReview = {
        ...((res.data as Partial<ApiReview>) ?? {}),
        id: (res.data as any)?.id ?? `r${Date.now()}`,
        productId: order.productId,
        productName: order.productName,
        orderId: order.id,
        rating,
        comment: comment.trim(),
        reviewerName: "Moi",
      };
      setReviews((prev) => [newReview, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdd(false);
      setComment("");
      setRating(5);
      setSelectedOrderId("");
      Alert.alert(t("revSubmittedTitle"), t("revSubmittedMsg"));
    } catch {
      Alert.alert(t("revSubmitErrorTitle"), t("revSubmitError"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <LoadingState
          title={t("revLoadingTitle")}
          description={t("revLoadingDescription")}
        />
      </View>
    );
  }

  if (loadError && reviews.length === 0 && orders.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ErrorState
          title={t("revLoadErrorTitle")}
          description={t("revLoadError")}
          retryLabel={t("revRetry")}
          onRetry={() => {
            setLoading(true);
            loadData();
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.title,
              { color: colors.foreground, textAlign: isRTL ? "right" : "left" },
            ]}
          >
            {t("revTitle")}
          </Text>
          <Text
            style={[
              styles.subtitle,
              {
                color: colors.mutedForeground,
                textAlign: isRTL ? "right" : "left",
              },
            ]}
          >
            {reviews.length} {t("revSubtitle")}
          </Text>
        </View>
        {pendingReviewOrders.length > 0 && (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              setShowAdd(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Feather name="edit-2" size={16} color="#fff" />
            <Text style={styles.addBtnText}>{t("revAddBtn")}</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredReviews}
        keyExtractor={(r) => r.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          paddingBottom: insets.bottom + 32,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <>
            {/* Global rating summary */}
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.summaryLeft}>
                <Text style={[styles.bigRating, { color: colors.foreground }]}>
                  {avgRating}
                </Text>
                <StarRow rating={Math.round(parseFloat(avgRating))} size={18} />
                <Text
                  style={[
                    styles.ratingCount,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {reviews.length} avis
                </Text>
              </View>
              <View style={styles.summaryRight}>
                {ratingDist.map(({ star, count, pct }) => (
                  <View key={star} style={styles.ratingRow}>
                    <Text
                      style={[
                        styles.starNum,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {star}
                    </Text>
                    <Feather name="star" size={11} color="#f59e0b" />
                    <View
                      style={[
                        styles.ratingBar,
                        { backgroundColor: colors.muted },
                      ]}
                    >
                      <View
                        style={[
                          styles.ratingBarFill,
                          {
                            width: `${pct}%` as any,
                            backgroundColor: "#f59e0b",
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.ratingCount2,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Pending reviews banner */}
            {pendingReviewOrders.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.pendingBanner,
                  {
                    backgroundColor: colors.primary + "12",
                    borderColor: colors.primary + "40",
                  },
                ]}
                onPress={() => {
                  setShowAdd(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Feather name="star" size={16} color={colors.primary} />
                <Text style={[styles.pendingText, { color: colors.primary }]}>
                  {pendingReviewOrders.length}{" "}
                  {t(
                    pendingReviewOrders.length === 1
                      ? "revPendingOne"
                      : "revPendingMany",
                  )}
                </Text>
                <Feather
                  name="chevron-right"
                  size={16}
                  color={colors.primary}
                />
              </TouchableOpacity>
            )}

            {/* Product filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={{
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              {productNames.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        filterProduct === p ? colors.primary : colors.muted,
                    },
                  ]}
                  onPress={() => {
                    setFilterProduct(p);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text
                    style={[
                      styles.filterText,
                      {
                        color:
                          filterProduct === p ? "#fff" : colors.mutedForeground,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {p === "all" ? t("revFilterAll") : p}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filteredReviews.length === 0 && (
              <EmptyState
                icon="star"
                title={t("revEmptyText")}
                description={t("revEmptyDescription")}
                actionLabel={
                  pendingReviewOrders.length > 0 ? t("revAddBtn") : undefined
                }
                onAction={
                  pendingReviewOrders.length > 0
                    ? () => setShowAdd(true)
                    : undefined
                }
              />
            )}
          </>
        }
        renderItem={({ item: r }) => {
          const reviewerName = r.reviewerName ?? t("revAnonymous");
          const dateStr = formatReviewDate(r.createdAt, lang);
          const initials = reviewerName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <View
              style={[
                styles.reviewCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.reviewHeader}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: colors.primary + "18" },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {initials}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.reviewerName, { color: colors.foreground }]}
                  >
                    {reviewerName}
                  </Text>
                  <Text
                    style={[
                      styles.reviewDate,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {dateStr}
                  </Text>
                </View>
                <StarRow rating={r.rating} size={14} />
              </View>
              <View
                style={[styles.productTag, { backgroundColor: colors.muted }]}
              >
                <Feather
                  name="package"
                  size={11}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.productTagText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {r.productName}
                </Text>
              </View>
              <Text
                style={[styles.reviewComment, { color: colors.foreground }]}
              >
                {r.comment}
              </Text>
              {r.sellerName && (
                <View style={styles.reviewFooter}>
                  <Text
                    style={[
                      styles.sellerLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("revSeller")} {r.sellerName}
                  </Text>
                </View>
              )}
            </View>
          );
        }}
      />

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.addModal, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {t("revModalTitle")}
              </Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {pendingReviewOrders.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={[
                  styles.orderOption,
                  {
                    backgroundColor:
                      selectedOrderId === o.id
                        ? colors.primary + "15"
                        : colors.background,
                    borderColor:
                      selectedOrderId === o.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedOrderId(o.id)}
              >
                <Feather
                  name="package"
                  size={16}
                  color={
                    selectedOrderId === o.id
                      ? colors.primary
                      : colors.mutedForeground
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.orderOptionTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    {o.productName}
                  </Text>
                  <Text
                    style={[
                      styles.orderOptionSub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t("revSeller")} {o.sellerName} •{" "}
                    {formatReviewDate(o.createdAt, lang)}
                  </Text>
                </View>
                {selectedOrderId === o.id && (
                  <Feather
                    name="check-circle"
                    size={18}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            ))}

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
              {t("revFieldRating")}
            </Text>
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <StarRow
                rating={rating}
                onRate={(n) => {
                  setRating(n);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                size={36}
              />
              <Text
                style={[
                  styles.ratingLabel,
                  { color: colors.mutedForeground, marginTop: 8 },
                ]}
              >
                {t(
                  [
                    "",
                    "revRating1",
                    "revRating2",
                    "revRating3",
                    "revRating4",
                    "revRating5",
                  ][rating],
                )}
              </Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
              {t("revFieldComment")}
            </Text>
            <TextInput
              style={[
                styles.commentInput,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.foreground,
                },
              ]}
              placeholder={t("revCommentPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowAdd(false)}
                disabled={submitting}
              >
                <Text
                  style={[styles.cancelText, { color: colors.mutedForeground }]}
                >
                  {t("revCancelBtn")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor:
                      selectedOrderId && comment.trim() && !submitting
                        ? colors.primary
                        : colors.muted,
                  },
                ]}
                onPress={handleSubmit}
                disabled={!selectedOrderId || !comment.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.submitText,
                      {
                        color:
                          selectedOrderId && comment.trim()
                            ? "#fff"
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    {t("revSubmitBtn")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  summaryCard: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
    marginBottom: 4,
  },
  summaryLeft: { alignItems: "center", gap: 6, minWidth: 80 },
  bigRating: { fontSize: 40, fontFamily: "Inter_700Bold" },
  ratingCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  summaryRight: { flex: 1, gap: 6, justifyContent: "center" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  starNum: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    width: 10,
    textAlign: "right",
  },
  ratingBar: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  ratingBarFill: { height: 6, borderRadius: 3 },
  ratingCount2: { fontSize: 11, fontFamily: "Inter_400Regular", width: 16 },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  pendingText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  filterScroll: { flexShrink: 0 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: 150,
    flexShrink: 0,
  },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 40 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  reviewCard: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  reviewerName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  reviewDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  productTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  productTagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  reviewComment: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  reviewFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sellerLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  likeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  addModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 14,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  orderOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  orderOptionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  orderOptionSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  ratingLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  commentInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 100,
  },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  submitText: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
