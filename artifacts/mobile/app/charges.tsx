import { Feather } from "@expo/vector-icons";
import { shareContent } from "@/hooks/useShare";
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
  Pressable,
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
import AllocationDetail from "@/components/AllocationDetail";
import ObligationAccount from "@/components/ObligationAccount";
import EmptyState from "@/components/EmptyState";
import { BalanceMeter, Button, Skeleton, StatusBadge, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { useCallStatus } from "@/hooks/useCallStatus";
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
  /** Motive to write in the bank transfer (e.g. A203-2026Q4-CC-7F3A9B). */
  paymentReference?: string | null;
};

/** Where and how to transfer: the syndicate's own account, never the platform's. */
type TransferInfo = { bankName: string | null; label: string; rib: string | null; reference: string | null };

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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${(Number.isFinite(amount) ? amount : 0).toFixed(2)} MAD`;
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

/** One figure of the summary strip (amount from the API, toned only when it needs attention). */
function MiniStat({ label, value, tone }: { label: string; value: string; tone?: StatusTone }) {
  const colors = useColors();
  const tc = tone ? toneColors(colors, tone) : null;
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[TYPE.bodyStrong, { color: tc?.text ?? colors.foreground, fontVariant: ["tabular-nums"] }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

function ChargesScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, lang, isRTL } = useLanguage();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const callStatus = useCallStatus();
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
  const [transfer, setTransfer] = useState<TransferInfo | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payProof, setPayProof] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // Totals come from the API (validated payments, partial ones included) —
  // never recomputed from the currently loaded page.
  const [stats, setStats] = useState({ total: 0, collected: 0, pending: 0, overdue: 0 });
  const [rejectModal, setRejectModal] = useState<Appel | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
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
    setTransfer(null);
    // The syndicate's bank account and the call's reference, from the server.
    setTransferLoading(true);
    apiRequest<{ data: { paymentOptions: { bankAccount: { label: string; bankName: string | null; rib: string | null } | null; reference?: string | null } | null } }>(
      `/appels-de-fonds/${appel.id}/account`,
      "GET",
      undefined,
      token,
    )
      .then((r) => {
        const o = r.data?.paymentOptions;
        setTransfer({
          bankName: o?.bankAccount?.bankName ?? null,
          label: o?.bankAccount?.label ?? "",
          rib: o?.bankAccount?.rib ?? null,
          reference: o?.reference ?? appel.paymentReference ?? null,
        });
      })
      .catch(() => setTransfer({ bankName: null, label: "", rib: null, reference: appel.paymentReference ?? null }))
      .finally(() => setTransferLoading(false));
  };

  const shareTransfer = () => {
    if (!payModal || !transfer) return;
    const lines = [
      t("trfShareTitle"),
      transfer.rib ? `${t("trfRib")} : ${transfer.rib}${transfer.bankName ? ` (${transfer.bankName})` : ""}` : null,
      transfer.reference ? `${t("trfMotive")} : ${transfer.reference}` : null,
      `${t("trfAmount")} : ${formatMAD(payModal.remaining, lang)}`,
    ].filter(Boolean);
    shareContent(lines.join("\n"), t("trfShareTitle")).catch(() => {});
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("chargesAppels")} subtitle={`${t("chargesCollectionRate")}: ${rate}%`} />

      <View style={[styles.summary, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <BalanceMeter
          paid={collected}
          total={total}
          paidLabel={t("recovered")}
          remainingLabel={t("uiRemaining")}
          paidText={formatMAD(collected, lang)}
          remainingText={formatMAD(Math.max(0, total - collected), lang)}
          overdue={overdue > 0}
        />
        <View style={[styles.miniStats, { borderTopColor: colors.border }]}>
          <MiniStat label={t("totalAppele")} value={formatMAD(total, lang)} />
          <MiniStat label={t("inProgressPayment")} value={formatMAD(pending, lang)} tone="warning" />
          <MiniStat label={t("latePayment")} value={formatMAD(overdue, lang)} tone={overdue > 0 ? "danger" : undefined} />
        </View>
      </View>

      {/* Payment history shortcut — visible to members only */}
      {!isAdmin && (
        <Pressable
          style={({ pressed }) => [styles.historyBanner, { backgroundColor: pressed ? colors.surfaceMuted : colors.card, borderColor: colors.border }]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            router.push("/paiements" as any);
          }}
          accessibilityRole="link"
        >
          <Feather name="clock" size={15} color={colors.primary} />
          <Text style={[TYPE.bodyStrong, { color: colors.foreground, flex: 1 }]}>{t("paymentHistoryShortcut")}</Text>
          <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={16} color={colors.textMuted} />
        </Pressable>
      )}

      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

      {loading ? (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 32 }]}>
          {[1, 2, 3, 4].map((k) => (
            <View key={k} style={[styles.card, styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Skeleton width={44} height={44} radius={12} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={11} />
              </View>
              <Skeleton width={72} height={18} />
            </View>
          ))}
        </ScrollView>
      ) : loadError ? (
        <ErrorState
          title={t("chargesLoadErrorTitle")}
          description={t("chargesLoadErrorDescription")}
          retryLabel={t("retry")}
          onRetry={() => load()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[filtered.length === 0 ? { flexGrow: 1 } : styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 32 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <EmptyState icon="credit-card" title={t("noChargesFound")} description={t("chargesEmptyHint")} />
          ) : (
            filtered.map((appel) => {
              const st = callStatus(appel.status);
              const tc = toneColors(colors, st.tone);
              const label = getStatusLabel(appel.status);
              const isOverdue = appel.status === "overdue";
              const canPay =
                !isAdmin &&
                (appel.status === "pending" || appel.status === "overdue" || appel.status === "rejected" || appel.status === "partially_paid");

              return (
                <View key={appel.id} style={[styles.card, { backgroundColor: colors.card, borderColor: isOverdue ? colors.danger + "55" : colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.amtCircle, { backgroundColor: tc.bg }]}>
                      <Feather name={st.icon} size={20} color={tc.fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]} numberOfLines={2}>
                        {appel.period} — {getTypeLabel(appel.type)}
                      </Text>
                      <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={2}>
                        {t("lotLabel")} {appel.lotNumber ?? "—"}
                        {isAdmin && appel.ownerName ? ` · ${appel.ownerName}` : ""}
                      </Text>
                      {appel.dueDate ? (
                        <View style={styles.dueRow}>
                          <Feather name="calendar" size={12} color={isOverdue ? colors.danger : colors.textMuted} />
                          <Text style={[TYPE.caption, { color: isOverdue ? colors.dangerText : colors.textMuted }]}>
                            {t("dueDate")}: {formatDate(appel.dueDate, lang)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6, maxWidth: "45%" }}>
                      <Text style={[TYPE.amount, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {formatMAD(appel.amount, lang)}
                      </Text>
                      <StatusBadge label={label} tone={st.tone} icon={st.icon} />
                    </View>
                  </View>

                  {appel.amountPaid > 0 && appel.remaining > 0 ? (
                    <View style={styles.partial}>
                      <BalanceMeter
                        paid={appel.amountPaid}
                        total={appel.amount}
                        paidLabel={t("recovered")}
                        remainingLabel={t("remainingToPay")}
                        paidText={formatMAD(appel.amountPaid, lang)}
                        remainingText={formatMAD(appel.remaining, lang)}
                        overdue={isOverdue}
                      />
                    </View>
                  ) : null}

                  {(appel.status === "paid" || appel.amountPaid > 0) && appel.receiptNumber ? (
                    <Pressable
                      style={({ pressed }) => [styles.infoRow, { borderTopColor: colors.border, backgroundColor: pressed ? colors.surfaceMuted : "transparent" }]}
                      onPress={() => downloadReceipt(appel)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t("paymentReceiptLabel")} ${appel.receiptNumber}`}
                    >
                      <Feather name="check-circle" size={14} color={colors.success} />
                      <Text style={[TYPE.caption, { color: colors.successText, flex: 1 }]}>
                        {t("paymentReceiptLabel")} {appel.receiptNumber} — {formatDate(appel.paidDate, lang)} · {getPaymentMethodLabel(appel.paymentMethod)}
                      </Text>
                      <Feather name="download" size={14} color={colors.success} />
                    </Pressable>
                  ) : null}

                  {(appel.status === "rejected" || appel.status === "partially_paid") && appel.rejectionReason ? (
                    <View style={[styles.infoRow, { borderTopColor: colors.border, backgroundColor: colors.dangerSoft }]}>
                      <Feather name="alert-circle" size={14} color={colors.danger} />
                      <Text style={[TYPE.caption, { color: colors.dangerText, flex: 1 }]}>
                        {t("paymentRejectedLabel")}: {appel.rejectionReason}
                      </Text>
                    </View>
                  ) : null}

                  {appel.status === "pending_validation" && appel.paymentMethod ? (
                    <View style={[styles.infoRow, { borderTopColor: colors.border, backgroundColor: colors.infoSoft }]}>
                      <Feather name="clock" size={14} color={colors.info} />
                      <Text style={[TYPE.caption, { color: colors.infoText, flex: 1 }]}>
                        {t("inProgressPayment")} — {getPaymentMethodLabel(appel.paymentMethod)}
                      </Text>
                      {isAdmin && appel.proofUrl ? (
                        <Pressable onPress={() => openProof(appel)} hitSlop={8} style={styles.inlineLink} accessibilityRole="button">
                          <Feather name="eye" size={14} color={colors.info} />
                          <Text style={[TYPE.label, { color: colors.infoText }]}>{t("viewProof")}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={[styles.actions, { borderTopColor: colors.border }]}>
                    <Button label={t("fcAccountShort")} icon="file-text" variant="ghost" size="sm" onPress={() => setAccountId(appel.id)} />
                    <Button label={t("uiCalcDetail")} icon="info" variant="ghost" size="sm" onPress={() => setDetailId(appel.id)} />
                    {canPay ? (
                      <Button
                        label={appel.status === "rejected" ? t("resubmitLabel") : t("submitPaymentModal")}
                        icon="credit-card"
                        size="sm"
                        style={{ flexGrow: 1, minWidth: 150 }}
                        onPress={() => openPayModal(appel)}
                      />
                    ) : null}
                    {isAdmin && appel.status === "pending_validation" ? (
                      <>
                        <Button
                          label={t("rejectBtn")}
                          icon="x"
                          variant="secondary"
                          size="sm"
                          style={{ flexGrow: 1, minWidth: 150 }}
                          onPress={() => {
                            setRejectModal(appel);
                            setRejectReason("");
                          }}
                        />
                        <Button
                          label={t("validateLabel")}
                          icon="check"
                          size="sm"
                          style={{ flexGrow: 1, minWidth: 150 }}
                          disabled={!!approvingId && approvingId !== appel.id}
                          loading={approvingId === appel.id}
                          onPress={() => handleApprove(appel.id)}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <AllocationDetail appelId={detailId} onClose={() => setDetailId(null)} />
      <ObligationAccount appelId={accountId} onClose={() => setAccountId(null)} onChanged={() => load(true)} />

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
                  { backgroundColor: colors.dangerSoft, borderColor: colors.danger + "40" },
                ]}
              >
                <Text style={[styles.payAmtLabel, { color: colors.dangerText }]}>
                  {t("paymentToReject")}
                </Text>
                <Text style={[styles.payAmtVal, { color: colors.dangerText }]}>
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
                { backgroundColor: colors.danger, opacity: submitting ? 0.7 : 1 },
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
                  { backgroundColor: colors.successSoft, borderColor: colors.success + "40" },
                ]}
              >
                <Text style={[styles.payAmtLabel, { color: colors.successText }]}>
                  {t("paymentAmountLabel")}
                </Text>
                <Text style={[styles.payAmtVal, { color: colors.successText }]}>
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
                      payMethod === m.key ? colors.success : colors.border,
                    borderWidth: payMethod === m.key ? 2 : 1,
                  },
                ]}
                onPress={() => setPayMethod(m.key)}
              >
                <Feather
                  name={m.icon}
                  size={18}
                  color={
                    payMethod === m.key ? colors.success : colors.mutedForeground
                  }
                />
                <Text style={[styles.methodText, { color: colors.foreground }]}>
                  {m.label}
                </Text>
                {payMethod === m.key ? (
                  <Feather
                    name="check-circle"
                    size={16}
                    color={colors.success}
                    style={{ marginStart: "auto" }}
                  />
                ) : null}
              </TouchableOpacity>
            ))}

            {payMethod === "virement" ? (
              <View style={[styles.transferBox, { backgroundColor: colors.primarySoft, borderColor: colors.primary + "33" }]}>
                <View style={styles.transferHead}>
                  <Feather name="send" size={16} color={colors.tint} />
                  <Text style={[styles.transferTitle, { color: colors.foreground }]}>{t("trfTitle")}</Text>
                </View>
                {transferLoading ? (
                  <ActivityIndicator color={colors.tint} />
                ) : transfer?.rib ? (
                  <>
                    <View style={styles.transferRow}>
                      <Text style={[styles.transferLabel, { color: colors.textMuted }]}>{t("trfRib")}{transfer.bankName ? ` · ${transfer.bankName}` : ""}</Text>
                      <Text selectable style={[styles.transferValue, { color: colors.foreground }]}>{transfer.rib}</Text>
                    </View>
                    {transfer.reference ? (
                      <View style={styles.transferRow}>
                        <Text style={[styles.transferLabel, { color: colors.textMuted }]}>{t("trfMotive")}</Text>
                        <Text selectable style={[styles.transferRef, { color: colors.tint }]}>{transfer.reference}</Text>
                      </View>
                    ) : null}
                    <View style={styles.transferRow}>
                      <Text style={[styles.transferLabel, { color: colors.textMuted }]}>{t("trfAmount")}</Text>
                      <Text selectable style={[styles.transferValue, { color: colors.foreground }]}>{payModal ? formatMAD(payModal.remaining, lang) : "—"}</Text>
                    </View>
                    <Text style={[styles.transferHint, { color: colors.textMuted }]}>{t("trfHint")}</Text>
                    <TouchableOpacity onPress={shareTransfer} style={styles.transferShare} accessibilityRole="button">
                      <Feather name="share-2" size={15} color={colors.tint} />
                      <Text style={[styles.transferShareText, { color: colors.tint }]}>{t("trfShare")}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={[styles.transferHint, { color: colors.warningText }]}>{t("trfNoAccount")}</Text>
                )}
              </View>
            ) : null}

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
                    <Feather name="file-text" size={18} color="#5A4AD6" />
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
                    <ActivityIndicator size="small" color="#5A4AD6" />
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_400Regular",
                        color: "#5A4AD6",
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
                      backgroundColor: colors.dangerSoft,
                      borderColor: colors.danger + "40",
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
                      color: colors.danger,
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
                    backgroundColor: "#5A4AD615",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="camera" size={18} color="#5A4AD6" />
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
                  backgroundColor: colors.success,
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
  transferBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginTop: 4 },
  transferHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  transferTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  transferRow: { gap: 2 },
  transferLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  transferValue: { fontFamily: "Inter_600SemiBold", fontSize: 15, fontVariant: ["tabular-nums"] },
  transferRef: { fontFamily: "Inter_700Bold", fontSize: 17, letterSpacing: 0.5 },
  transferHint: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  transferShare: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 36 },
  transferShareText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  root: { flex: 1 },
  summary: { borderBottomWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  miniStats: { flexDirection: "row", gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  miniStat: { flex: 1, minWidth: 0, gap: 2 },
  skeletonCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  partial: { paddingHorizontal: 14, paddingBottom: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  inlineLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  progressBg: {
    height: 4,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: 4, borderRadius: 2 },
  list: { padding: 16, gap: 10 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
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
  payAmtVal: { fontSize: 28, fontFamily: "Fraunces_600SemiBold" },
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
