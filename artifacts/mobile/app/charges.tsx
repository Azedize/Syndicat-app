import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
import { apiRequest } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import FilterChips from "@/components/FilterChips";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import StatsStrip from "@/components/StatsStrip";
import { ErrorState } from "@/components/DataState";
import { ticketedUrl } from "@/services/api";
import { uploadFileUri } from "@/lib/upload";

// Charges screen — co-owners see their personal charges; treasurer/admin manage all charges.
export default function ChargesScreen() {
  return (
    <RoleGuard
      allow={["super_admin", "syndicate_admin", "treasurer", "member"]}
    >
      <ChargesScreenInner />
    </RoleGuard>
  );
}

const STATUS_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  pending: "clock",
  pending_validation: "loader",
  paid: "check-circle",
  overdue: "alert-circle",
  rejected: "x-circle",
  partially_paid: "pie-chart",
  cancelled: "slash",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  pending_validation: "#3b82f6",
  paid: "#10b981",
  overdue: "#ef4444",
  rejected: "#ef4444",
  partially_paid: "#f97316",
  cancelled: "#6b7280",
};

const TYPE_KEYS: Record<string, string> = {
  charges_courantes: "typeChargesCourantes",
  fonds_reserve: "typeFondsReserve",
  appel_special: "typeAppelSpecial",
};

const PAYMENT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  virement: "send",
  cheque: "file-text",
  especes: "dollar-sign",
  online: "credit-card",
};

type Appel = {
  id: string;
  lotId: string;
  ownerId?: string;
  period: string;
  type: string;
  amount: number;
  amountPaid: number;
  remaining: number;
  lotNumber?: string | null;
  buildingName?: string | null;
  ownerName?: string | null;
  dueDate?: string;
  status: string;
  paidDate?: string;
  paymentMethod?: string;
  receiptNumber?: string;
  rejectionReason?: string;
  proofUrl?: string;
  buildingId: string;
};

function formatMAD(amount: number, lang: "fr" | "en" | "ar" | "es"): string {
  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "en"
        ? "en-US"
        : lang === "es"
          ? "es-ES"
          : "fr-FR";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "MAD",
      maximumFractionDigits: 0,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString()} MAD`;
  }
}

function formatDate(
  value: string | undefined,
  lang: "fr" | "en" | "ar" | "es",
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "en"
        ? "en-US"
        : lang === "es"
          ? "es-ES"
          : "fr-FR";
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ChargesScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, lang } = useLanguage();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [appels, setAppels] = useState<Appel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState(typeof params.filter === "string" ? params.filter : "all");
  const [payModal, setPayModal] = useState<Appel | null>(null);
  const [payMethod, setPayMethod] = useState("virement");
  const [payNote, setPayNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [payProof, setPayProof] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // Totals come from the API (validated payments, partial ones included) —
  // never recomputed from the currently loaded page.
  const [stats, setStats] = useState({ total: 0, collected: 0, pending: 0, overdue: 0 });
  const [rejectModal, setRejectModal] = useState<Appel | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);

  const isAdmin =
    user?.role === "super_admin" ||
    user?.role === "syndicate_admin" ||
    user?.role === "treasurer";

  // Translated configs built inside the component so t() is available
  const PAYMENT_METHODS = [
    {
      key: "virement",
      label: t("payMethodVirement"),
      icon: PAYMENT_ICONS.virement,
    },
    { key: "cheque", label: t("payMethodCheque"), icon: PAYMENT_ICONS.cheque },
    {
      key: "especes",
      label: t("payMethodEspeces"),
      icon: PAYMENT_ICONS.especes,
    },
    // No "online" entry: there is no card/CMI gateway yet, and the API only
    // accepts verifiable methods (transfer, cheque, cash) with a proof.
  ];

  const FILTERS = [
    { key: "all", label: t("all") },
    { key: "pending", label: t("atPay") },
    { key: "pending_validation", label: t("inValidation") },
    { key: "overdue", label: t("latePayment") },
    { key: "partially_paid", label: t("statusPartiallyPaid") },
    { key: "paid", label: t("paid") },
    { key: "rejected", label: t("statusRejected") },
  ];

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: t("atPay"),
      pending_validation: t("inValidation"),
      paid: t("paid"),
      overdue: t("latePayment"),
      rejected: t("statusRejected"),
      partially_paid: t("statusPartiallyPaid"),
      cancelled: t("statusCancelled"),
    };
    return map[status] ?? status;
  };

  const getTypeLabel = (type: string) => {
    const key = TYPE_KEYS[type];
    return key ? t(key as any) : type;
  };

  const getPaymentMethodLabel = (method: string | undefined) => {
    if (!method) return "";
    const labels: Record<string, string> = {
      virement: t("payMethodVirement"),
      cheque: t("payMethodCheque"),
      especes: t("payMethodEspeces"),
      online: t("payMethodOnline"),
    };
    return labels[method] ?? method;
  };

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        setLoadError(false);
        const qs = filter !== "all" ? `?status=${filter}` : "";
        const data = await apiRequest(
          `/appels-de-fonds${qs}`,
          "GET",
          undefined,
          token,
        );
        setAppels(
          (data.data ?? []).map((a: any) => ({
            ...a,
            amount: Number(a.amount) || 0,
            amountPaid: Number(a.amountPaid) || 0,
            remaining: Number(a.remaining ?? a.amount) || 0,
          })),
        );
        if (data.stats) {
          setStats({
            total: Number(data.stats.total) || 0,
            collected: Number(data.stats.collected) || 0,
            pending: Number(data.stats.pending) || 0,
            overdue: Number(data.stats.overdue) || 0,
          });
        }
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, filter],
  );

  useEffect(() => {
    load();
  }, [load]);
  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const choosePayProof = () => {
    Alert.alert(t("proofSourceTitle"), undefined, [
      { text: t("proofFromCamera"), onPress: () => pickProofImage("camera") },
      { text: t("proofFromGallery"), onPress: () => pickProofImage("library") },
      { text: t("proofFromPdf"), onPress: pickProofPdf },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  const pickProofImage = async (source: "camera" | "library") => {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t("error"), t("permissionDeniedMessage"));
        return;
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      const isPng = asset.mimeType === "image/png" || asset.uri.toLowerCase().endsWith(".png");
      setPayProof({
        uri: asset.uri,
        name: `justificatif-${Date.now()}.${isPng ? "png" : "jpg"}`,
        type: isPng ? "image/png" : "image/jpeg",
      });
      Haptics.selectionAsync();
    } catch {
      Alert.alert(t("error"), t("uploadProofFailed"));
    }
  };

  const pickProofPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset) return;
      setPayProof({ uri: asset.uri, name: asset.name ?? `justificatif-${Date.now()}.pdf`, type: "application/pdf" });
      Haptics.selectionAsync();
    } catch {
      Alert.alert(t("error"), t("uploadProofFailed"));
    }
  };

  const openProof = async (appel: Appel) => {
    if (!appel.proofUrl) return;
    try {
      const { Linking } = await import("react-native");
      await Linking.openURL(await ticketedUrl(`/storage${appel.proofUrl}`));
    } catch {
      showToast({ type: "error", title: t("error"), message: t("errorGeneric") });
    }
  };

  const openPayModal = (appel: Appel) => {
    setPayModal(appel);
    setPayAmount(String(appel.remaining));
    setPayProof(null);
    setPayNote("");
  };

  const downloadReceipt = async (appel: Appel) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const receiptUrl = await ticketedUrl(`/appels-de-fonds/${appel.id}/receipt`);
      const { Linking } = await import("react-native");
      await Linking.openURL(receiptUrl);
    } catch {
      showToast({
        type: "error",
        title: t("error"),
        message: t("errorGeneric"),
      });
    }
  };

  const handlePay = async () => {
    if (!payModal || submitting) return;
    const amount = Number(payAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > payModal.remaining || !/^\d+([.,]\d{1,2})?$/.test(payAmount.trim())) {
      Alert.alert(t("error"), t("invalidPaymentAmount"));
      return;
    }
    if (!payProof) {
      Alert.alert(t("error"), t("proofRequiredHint"));
      return;
    }
    try {
      setSubmitting(true);
      setUploadingProof(true);
      let proofUrl: string;
      try {
        proofUrl = (await uploadFileUri(payProof.uri, payProof.name, payProof.type)).objectPath;
      } catch (e: any) {
        showToast({ type: "error", title: t("error"), message: e?.message || t("uploadProofFailed") });
        return;
      } finally {
        setUploadingProof(false);
      }
      await apiRequest(
        `/appels-de-fonds/${payModal.id}/pay`,
        "PUT",
        {
          paymentMethod: payMethod,
          amount: amount.toFixed(2),
          reference: payNote.trim() || undefined,
          proofUrl,
        },
        token,
      );
      setPayModal(null);
      setPayNote("");
      setPayProof(null);
      showToast({ type: "success", title: t("success"), message: t("paymentSubmittedMessage") });
      queryClient.invalidateQueries({ queryKey: ["my-charges"] });
      load(true);
    } catch (e: any) {
      // Show the server's reason (already under review, amount too high…).
      Alert.alert(t("error"), e?.message || t("paymentSubmissionFailed"));
      load(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (approvingId) return;
    setApprovingId(id);
    try {
      await apiRequest(
        `/appels-de-fonds/${id}/validate`,
        "PUT",
        { approve: true },
        token,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      // e.g. no treasury account configured, payment already processed
      Alert.alert(t("error"), e?.message || t("paymentValidationFailed"));
    } finally {
      setApprovingId(null);
      load(true);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) {
      Alert.alert(t("error"), t("rejectionReasonRequired"));
      return;
    }
    if (submitting) return;
    try {
      setSubmitting(true);
      await apiRequest(
        `/appels-de-fonds/${rejectModal.id}/validate`,
        "PUT",
        {
          approve: false,
          rejectionReason: rejectReason.trim(),
        },
        token,
      );
      setRejectModal(null);
      setRejectReason("");
      load(true);
    } catch (e: any) {
      Alert.alert(t("error"), e?.message || t("paymentRejectionFailed"));
      load(true);
    } finally {
      setSubmitting(false);
    }
  };

  const { total, collected, pending, overdue } = stats;
  const rate = total > 0 ? Math.round((collected / total) * 100) : 0;

  const filtered =
    filter === "all" ? appels : appels.filter((a) => a.status === filter);

  // Skeleton loading placeholder
  const SkeletonCard = () => (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardTop}>
        <View
          style={[styles.amtCircle, { backgroundColor: colors.secondary }]}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <View
            style={{
              height: 14,
              width: "60%",
              backgroundColor: colors.secondary,
              borderRadius: 7,
            }}
          />
          <View
            style={{
              height: 11,
              width: "40%",
              backgroundColor: colors.secondary,
              borderRadius: 6,
            }}
          />
        </View>
        <View style={{ gap: 6, alignItems: "flex-end" }}>
          <View
            style={{
              height: 20,
              width: 80,
              backgroundColor: colors.secondary,
              borderRadius: 6,
            }}
          />
          <View
            style={{
              height: 16,
              width: 60,
              backgroundColor: colors.secondary,
              borderRadius: 8,
            }}
          />
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t("chargesAppels")}
        subtitle={`${t("chargesCollectionRate")}: ${rate}%`}
        color="#10b981"
      />

      <View
        style={[
          styles.summary,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <StatsStrip
          stats={[
            {
              label: t("totalAppele"),
              value: formatMAD(total, lang),
              color: colors.foreground,
            },
            {
              label: t("recovered"),
              value: formatMAD(collected, lang),
              color: "#10b981",
            },
            {
              label: t("inProgressPayment"),
              value: formatMAD(pending, lang),
              color: "#f59e0b",
            },
            {
              label: t("latePayment"),
              value: formatMAD(overdue, lang),
              color: "#ef4444",
            },
          ]}
        />
        <View
          style={[styles.progressBg, { backgroundColor: colors.secondary }]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${rate}%` as any,
                backgroundColor:
                  rate > 80 ? "#10b981" : rate > 50 ? "#f59e0b" : "#ef4444",
              },
            ]}
          />
        </View>
      </View>

      {/* Payment history shortcut — visible to members only */}
      {!isAdmin && (
        <TouchableOpacity
          style={[
            styles.historyBanner,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/paiements" as any);
          }}
          activeOpacity={0.75}
        >
          <Feather name="clock" size={14} color="#10b981" />
          <Text
            style={[styles.historyBannerText, { color: colors.foreground }]}
          >
            {t("paymentHistoryShortcut")}
          </Text>
          <Feather
            name="chevron-right"
            size={14}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      )}

      <FilterChips
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        accentColor="#10b981"
      />

      {loading ? (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: isWide ? 32 : insets.bottom + 100 },
          ]}
        >
          {[1, 2, 3, 4].map((k) => (
            <SkeletonCard key={k} />
          ))}
        </ScrollView>
      ) : loadError ? (
        <ErrorState
          title={t("chargesLoadErrorTitle")}
          description={t("chargesLoadErrorDescription")}
          retryLabel={t("retry")}
          onRetry={() => load()}
          accentColor="#10b981"
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: isWide ? 32 : insets.bottom + 100 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#10b981"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Feather
                name="credit-card"
                size={36}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                {t("noChargesFound")}
              </Text>
              <Text
                style={[styles.emptyHint, { color: colors.mutedForeground }]}
              >
                {t("chargesEmptyHint")}
              </Text>
            </View>
          ) : (
            filtered.map((appel) => {
              const color = STATUS_COLORS[appel.status] ?? "#6b7280";
              const icon = STATUS_ICONS[appel.status] ?? "clock";
              const label = getStatusLabel(appel.status);
              const isOverdue = appel.status === "overdue";

              return (
                <View
                  key={appel.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: isOverdue ? "#ef444430" : colors.border,
                    },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.amtCircle,
                        { backgroundColor: color + "18" },
                      ]}
                    >
                      <Feather name={icon} size={20} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.cardPeriod,
                          { color: colors.foreground },
                        ]}
                      >
                        {appel.period} — {getTypeLabel(appel.type)}
                      </Text>
                      <Text
                        style={[
                          styles.cardLot,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {t("lotLabel")} {appel.lotNumber ?? "—"}
                        {isAdmin && appel.ownerName ? ` • ${appel.ownerName}` : ""}{" "}
                        {appel.dueDate
                          ? `• ${t("dueDate")}: ${formatDate(appel.dueDate, lang)}`
                          : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text
                        style={[
                          styles.cardAmount,
                          { color: isOverdue ? "#ef4444" : colors.foreground },
                        ]}
                      >
                        {formatMAD(appel.amount, lang)}
                      </Text>
                      {appel.amountPaid > 0 && appel.remaining > 0 ? (
                        <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#f97316" }}>
                          {t("remainingToPay")}: {formatMAD(appel.remaining, lang)}
                        </Text>
                      ) : null}
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: color + "18" },
                        ]}
                      >
                        <Text style={[styles.statusText, { color }]}>
                          {label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {(appel.status === "paid" || appel.amountPaid > 0) && appel.receiptNumber ? (
                    <TouchableOpacity
                      style={[
                        styles.receiptRow,
                        { borderTopColor: colors.border },
                      ]}
                      onPress={() => downloadReceipt(appel)}
                    >
                      <Feather name="check-circle" size={12} color="#10b981" />
                      <Text
                        style={[
                          styles.receiptText,
                          { color: "#10b981", flex: 1 },
                        ]}
                      >
                        {t("paymentReceiptLabel")} {appel.receiptNumber} —{" "}
                        {formatDate(appel.paidDate, lang)} ·{" "}
                        {getPaymentMethodLabel(appel.paymentMethod)}
                      </Text>
                      <Feather name="download" size={12} color="#10b981" />
                    </TouchableOpacity>
                  ) : null}

                  {(appel.status === "rejected" || appel.status === "partially_paid") && appel.rejectionReason ? (
                    <View
                      style={[
                        styles.rejectRow,
                        {
                          borderTopColor: colors.border,
                          backgroundColor: "#ef444410",
                        },
                      ]}
                    >
                      <Feather name="alert-circle" size={12} color="#ef4444" />
                      <Text
                        style={[
                          styles.receiptText,
                          { color: "#ef4444", flex: 1 },
                        ]}
                      >
                        {t("paymentRejectedLabel")}: {appel.rejectionReason}
                      </Text>
                    </View>
                  ) : null}

                  {appel.status === "pending_validation" &&
                  appel.paymentMethod ? (
                    <View
                      style={[
                        styles.receiptRow,
                        { borderTopColor: colors.border },
                      ]}
                    >
                      <Feather name="loader" size={12} color="#3b82f6" />
                      <Text style={[styles.receiptText, { color: "#3b82f6" }]}>
                        {t("inProgressPayment")} —{" "}
                        {getPaymentMethodLabel(appel.paymentMethod)}
                      </Text>
                      {isAdmin && appel.proofUrl ? (
                        <TouchableOpacity onPress={() => openProof(appel)} style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name="eye" size={12} color="#3b82f6" />
                          <Text style={[styles.receiptText, { color: "#3b82f6" }]}>{t("viewProof")}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Member actions */}
                  {(appel.status === "pending" ||
                    appel.status === "overdue" ||
                    appel.status === "rejected" ||
                    appel.status === "partially_paid") &&
                  !isAdmin ? (
                    <TouchableOpacity
                      style={[
                        styles.payBtn,
                        {
                          backgroundColor:
                            appel.status === "rejected" ? "#f97316" : "#10b981",
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        openPayModal(appel);
                      }}
                    >
                      <Feather name="credit-card" size={14} color="#fff" />
                      <Text style={styles.payBtnText}>
                        {appel.status === "rejected"
                          ? t("resubmitLabel")
                          : t("submitPaymentModal")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* Admin actions */}
                  {isAdmin && appel.status === "pending_validation" ? (
                    <View
                      style={[
                        styles.adminActions,
                        { borderTopColor: colors.border },
                      ]}
                    >
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          { backgroundColor: "#10b98115", opacity: approvingId ? 0.6 : 1 },
                        ]}
                        disabled={!!approvingId}
                        onPress={() => handleApprove(appel.id)}
                      >
                        {approvingId === appel.id ? (
                          <ActivityIndicator size="small" color="#10b981" />
                        ) : (
                          <Feather name="check" size={14} color="#10b981" />
                        )}
                        <Text
                          style={[styles.actionBtnText, { color: "#10b981" }]}
                        >
                          {t("validateLabel")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          { backgroundColor: "#ef444415" },
                        ]}
                        onPress={() => {
                          setRejectModal(appel);
                          setRejectReason("");
                        }}
                      >
                        <Feather name="x" size={14} color="#ef4444" />
                        <Text
                          style={[styles.actionBtnText, { color: "#ef4444" }]}
                        >
                          {t("rejectBtn")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Rejection reason modal (admin) */}
      <Modal
        visible={!!rejectModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setRejectModal(null)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("rejectReason")}
            </Text>
            <TouchableOpacity onPress={() => setRejectModal(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={[styles.modalBody, { gap: 16 }]}>
            {rejectModal ? (
              <View
                style={[
                  styles.payAmtBox,
                  { backgroundColor: "#ef444410", borderColor: "#ef444430" },
                ]}
              >
                <Text style={[styles.payAmtLabel, { color: "#ef4444" }]}>
                  {t("paymentToReject")}
                </Text>
                <Text style={[styles.payAmtVal, { color: "#ef4444" }]}>
                  {formatMAD(rejectModal.amount, lang)}
                </Text>
                <Text
                  style={[
                    styles.payAmtPeriod,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {rejectModal.period}
                </Text>
              </View>
            ) : null}
            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              {t("rejectReason")} *
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                  minHeight: 80,
                  textAlignVertical: "top",
                },
              ]}
              placeholder={t("rejectionReasonPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: "#ef4444", opacity: submitting ? 0.7 : 1 },
              ]}
              onPress={handleReject}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="x-circle" size={16} color="#fff" />
                  <Text style={styles.submitText}>{t("rejectPaymentBtn")}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Payment modal */}
      <Modal
        visible={!!payModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPayModal(null)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t("submitPaymentModal")}
            </Text>
            <TouchableOpacity onPress={() => setPayModal(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={[styles.modalBody, { gap: 16 }]}>
            {payModal ? (
              <View
                style={[
                  styles.payAmtBox,
                  { backgroundColor: "#10b98110", borderColor: "#10b98130" },
                ]}
              >
                <Text style={[styles.payAmtLabel, { color: "#10b981" }]}>
                  {t("paymentAmountLabel")}
                </Text>
                <Text style={[styles.payAmtVal, { color: "#10b981" }]}>
                  {formatMAD(payModal.remaining, lang)}
                </Text>
                <Text
                  style={[
                    styles.payAmtPeriod,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {payModal.period} • {getTypeLabel(payModal.type)}
                </Text>
              </View>
            ) : null}

            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              {t("declaredAmountLabel")}
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
              keyboardType="decimal-pad"
              value={payAmount}
              onChangeText={setPayAmount}
            />
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: -8 }}>
              {t("declaredAmountHint")}
            </Text>

            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              {t("paymentMethod")}
            </Text>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[
                  styles.methodBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor:
                      payMethod === m.key ? "#10b981" : colors.border,
                    borderWidth: payMethod === m.key ? 2 : 1,
                  },
                ]}
                onPress={() => setPayMethod(m.key)}
              >
                <Feather
                  name={m.icon}
                  size={18}
                  color={
                    payMethod === m.key ? "#10b981" : colors.mutedForeground
                  }
                />
                <Text style={[styles.methodText, { color: colors.foreground }]}>
                  {m.label}
                </Text>
                {payMethod === m.key ? (
                  <Feather
                    name="check-circle"
                    size={16}
                    color="#10b981"
                    style={{ marginLeft: "auto" }}
                  />
                ) : null}
              </TouchableOpacity>
            ))}

            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              {t("paymentRefLabel")}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder={t("paymentRefPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={payNote}
              onChangeText={setPayNote}
            />

            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              {t("paymentProofLabel")} *
            </Text>
            {payProof ? (
              <View style={{ gap: 8 }}>
                {payProof.type === "application/pdf" ? (
                  <View style={[styles.methodBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Feather name="file-text" size={18} color="#3b82f6" />
                    <Text style={[styles.methodText, { color: colors.foreground }]} numberOfLines={1}>
                      {payProof.name}
                    </Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: payProof.uri }}
                    style={{
                      width: "100%",
                      height: 160,
                      borderRadius: 12,
                      resizeMode: "cover",
                    }}
                  />
                )}
                {uploadingProof && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ActivityIndicator size="small" color="#3b82f6" />
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_400Regular",
                        color: "#3b82f6",
                      }}
                    >
                      {t("uploadingProof")}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[
                    styles.input,
                    {
                      backgroundColor: "#ef444410",
                      borderColor: "#ef444430",
                      alignItems: "center",
                      paddingVertical: 10,
                    },
                  ]}
                  onPress={() => setPayProof(null)}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Inter_500Medium",
                      color: "#ef4444",
                    }}
                  >
                    {t("removeProofLabel")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.methodBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderStyle: "dashed",
                  },
                ]}
                onPress={choosePayProof}
                activeOpacity={0.8}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "#3b82f615",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="camera" size={18} color="#3b82f6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Inter_500Medium",
                      color: colors.foreground,
                    }}
                  >
                    {t("attachProofLabel")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: "Inter_400Regular",
                      color: colors.mutedForeground,
                    }}
                  >
                    {t("proofRequiredHint")}
                  </Text>
                </View>
                <Feather
                  name="upload"
                  size={16}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: "#10b981",
                  opacity: submitting || uploadingProof || !payProof ? 0.6 : 1,
                },
              ]}
              onPress={handlePay}
              disabled={submitting || uploadingProof || !payProof}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={styles.submitText}>{t("submitPaymentBtn")}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  summary: { borderBottomWidth: StyleSheet.hairlineWidth },
  progressBg: {
    height: 4,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: 4, borderRadius: 2 },
  list: { padding: 16, gap: 10 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  amtCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardPeriod: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardLot: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  receiptText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rejectRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  payBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  adminActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 10,
    borderRadius: 10,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  historyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  historyBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, paddingBottom: 40 },
  payAmtBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  payAmtLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  payAmtVal: { fontSize: 28, fontFamily: "Inter_700Bold" },
  payAmtPeriod: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  methodBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
  },
  methodText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
