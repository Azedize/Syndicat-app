import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useData, type Invoice } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import {
  pickAndUploadPhoto,
  captureAndUploadPhoto,
  pickAndUploadDocument,
  type UploadResult,
} from "@/lib/upload";

/** Converts a storage objectPath to a full retrievable URL.
 *  objectPath = "/objects/<uuid>" → /api/storage/objects/<uuid>
 */
function proofUrlFromResult(result: UploadResult): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const base = domain
    ? `https://${domain}/api`
    : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`;
  // objectPath already has leading slash: "/objects/..."
  return `${base}/storage${result.objectPath}`;
}

type TabType = "factures" | "devis";

const STATUS_CONFIG: Record<Invoice["status"], { labelKey: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  draft:     { labelKey: "invStatusDraft",     color: "#6b7280", icon: "edit-3"   },
  sent:      { labelKey: "invStatusSent",      color: "#3b82f6", icon: "send"     },
  paid:      { labelKey: "invStatusPaid",      color: "#10b981", icon: "check-circle" },
  overdue:   { labelKey: "invStatusOverdue",   color: "#ef4444", icon: "alert-circle" },
  cancelled: { labelKey: "invStatusCancelled", color: "#6b7280", icon: "x-circle" },
};

export default function InvoicesScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <InvoicesScreenInner />
    </RoleGuard>
  );
}

function InvoicesScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { invoices, addInvoice } = useData();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const { token } = useAuth();
  const { showToast } = useToast();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [tab, setTab] = useState<TabType>("factures");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [proofModalUri, setProofModalUri] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const downloadInvoicePdf = async (invoiceId: string) => {
    try {
      setDownloadingPdf(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const base = domain
        ? `https://${domain}`
        : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}`;
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
      const url = `${base}/api/pdf/invoice/${invoiceId}${tokenParam}`;
      await Linking.openURL(url);
    } catch {
      showToast({ type: "error", title: t("error"), message: t("invPdfError") });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Form state
  const [addType, setAddType] = useState<"devis" | "facture">("facture");
  const [addRecipient, setAddRecipient] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addNotes, setAddNotes] = useState("");
  // Proof attachment — upload happens immediately on pick, before form submission
  const [proofUpload, setProofUpload] = useState<UploadResult | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredInvoices = invoices.filter(
    (inv) => inv.type === (tab === "factures" ? "facture" : "devis")
  );

  const totalRevenue = invoices.filter((i) => i.type === "facture" && i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalPending = invoices.filter((i) => i.type === "facture" && i.status === "sent").reduce((s, i) => s + i.amount, 0);
  const totalOverdue = invoices.filter((i) => i.type === "facture" && i.status === "overdue").reduce((s, i) => s + i.amount, 0);

  // ─── Proof upload ─────────────────────────────────────────────────────────────
  // Files are uploaded to storage immediately on pick (not at form submit).
  // This ensures we have a real URL before calling the API.

  const doPickAndUpload = async (mode: "gallery" | "camera" | "document") => {
    if (proofUploading) return;
    setProofUploading(true);
    setProofError(false);
    try {
      let result: UploadResult | undefined;
      if (mode === "camera") result = await captureAndUploadPhoto();
      else if (mode === "gallery") result = await pickAndUploadPhoto();
      else result = await pickAndUploadDocument();

      if (result) {
        setProofUpload(result);
        Haptics.selectionAsync();
      }
    } catch (err: unknown) {
      const uploadCode = err instanceof Error ? err.message : "";
      showToast({ type: "error", title: t("error"), message: uploadCode.startsWith("FILE_TOO_LARGE")
        ? t("uploadErrorSize")
        : t("uploadError") });
    } finally {
      setProofUploading(false);
    }
  };

  const showPickerOptions = () => {
    if (Platform.OS === "web") { doPickAndUpload("gallery"); return; }
    Alert.alert(
      t("invJoindreJustif"),
      t("invChoisirSource"),
      [
        { text: t("invGaleriePhoto"), onPress: () => doPickAndUpload("gallery") },
        { text: t("invAppareilPhoto"), onPress: () => doPickAndUpload("camera") },
        { text: t("invDocumentOption"), onPress: () => doPickAndUpload("document") },
        { text: t("cancel"), style: "cancel" },
      ]
    );
  };

  // ─── Create invoice ──────────────────────────────────────────────────────────

  const resetForm = () => {
    setAddRecipient(""); setAddAmount(""); setAddLabel("");
    setAddNotes(""); setProofUpload(null); setProofError(false);
  };

  const handleAdd = async () => {
    if (!addRecipient.trim() || !addAmount.trim() || !addLabel.trim()) return;
    if (!proofUpload) {
      setProofError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const count = invoices.filter((i) => i.type === addType).length + 1;
    const pad = String(count).padStart(4, "0");
    const ref = addType === "facture" ? `FAC-${new Date().getFullYear()}-${pad}` : `DEV-${new Date().getFullYear()}-${pad}`;
    const realProofUrl = proofUrlFromResult(proofUpload);
    const inv: Invoice = {
      id: `inv${Date.now()}`,
      reference: ref,
      type: addType,
      recipient: addRecipient.trim(),
      syndicate: addRecipient.trim().slice(0, 3).toUpperCase(),
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      amount: parseFloat(addAmount),
      status: "draft",
      items: [{ label: addLabel.trim(), quantity: 1, unitPrice: parseFloat(addAmount) }],
      proofUrl: realProofUrl,  // ← real storage URL, saved to DB
    };
    setIsSubmitting(true);
    const success = await addInvoice(inv);
    setIsSubmitting(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({
        type: "success",
        title: t("invCreatedTitle"),
        message: addType === "facture" ? t("invCreatedInvoiceMsg") : t("invCreatedQuoteMsg"),
      });
      setShowAdd(false);
      resetForm();
    } else {
      showToast({ type: "error", title: t("error"), message: t("invCreateError") });
    }
  };

  const isFormValid = !!(addRecipient.trim() && addAmount.trim() && addLabel.trim() && proofUpload);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("invHeaderTitle")}</Text>
          <Text style={styles.headerSub}>{t("invHeaderSub")}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
          onPress={() => { setShowAdd(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={[styles.summaryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { value: totalRevenue, label: t("invEncaisse"), color: "#10b981" },
          { value: totalPending, label: t("invEnAttente"), color: "#f59e0b" },
          { value: totalOverdue, label: t("invEnRetard"), color: "#ef4444" },
        ].map(({ value, label, color }) => (
          <View key={label} style={[styles.statBox, { backgroundColor: color + "12" }]}>
            <Text style={[styles.statValue, { color }]}>{value.toLocaleString()}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["factures", "devis"] as TabType[]).map((tv) => (
          <TouchableOpacity
            key={tv}
            style={[styles.tabBtn, tab === tv && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(tv)}
          >
            <Feather
              name={tv === "factures" ? "file-text" : "clipboard"}
              size={15}
              color={tab === tv ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.tabLabel, { color: tab === tv ? colors.primary : colors.mutedForeground }]}>
              {tv === "factures" ? t("invTabFactures") : t("invTabDevis")}
              {filteredInvoices.length > 0 && tab === tv ? ` (${filteredInvoices.length})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filteredInvoices}
        keyExtractor={(inv) => inv.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <Feather name="file-text" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {tab === "factures" ? t("invAucunFacture") : t("invAucunDevis")}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {t("invEmptyPrompt")} {tab === "factures" ? t("invFacture").toLowerCase() : t("invDevis").toLowerCase()} {t("invWithProof")}
            </Text>
          </View>
        }
        renderItem={({ item: inv }) => {
          const sc = STATUS_CONFIG[inv.status];
          return (
            <TouchableOpacity
              style={[styles.invoiceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedInvoice(inv); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <View style={[styles.invIcon, { backgroundColor: inv.type === "facture" ? colors.primary + "15" : "#f59e0b15" }]}>
                <Feather
                  name={inv.type === "facture" ? "file-text" : "clipboard"}
                  size={20}
                  color={inv.type === "facture" ? colors.primary : "#f59e0b"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[styles.invRef, { color: colors.foreground }]}>{inv.reference}</Text>
                  {inv.proofUri ? (
                    <View style={[styles.proofBadge, { backgroundColor: "#10b98118" }]}>
                      <Feather name="paperclip" size={9} color="#10b981" />
                      <Text style={[styles.proofBadgeText, { color: "#10b981" }]}>{t("invJustificatif")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.invRecipient, { color: colors.mutedForeground }]}>{inv.recipient}</Text>
                <Text style={[styles.invDate, { color: colors.mutedForeground }]}>
                  {t("invEmis")} : {inv.date} · {t("invEcheance")} : {inv.dueDate}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={[styles.invAmount, { color: colors.foreground }]}>{inv.amount.toLocaleString()} MAD</Text>
                <View style={[styles.statusBadge, { backgroundColor: sc.color + "18" }]}>
                  <Feather name={sc.icon} size={10} color={sc.color} />
                  <Text style={[styles.statusText, { color: sc.color }]}>{t(sc.labelKey)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ─── Detail modal ──────────────────────────────────────────────────────── */}
      <Modal visible={!!selectedInvoice} transparent animationType="slide" onRequestClose={() => setSelectedInvoice(null)}>
        <View style={styles.modalOverlay}>
          {selectedInvoice && (
            <ScrollView
              style={[styles.detailModal, { backgroundColor: colors.card }]}
              contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: insets.bottom + 24 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.detailHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailRef, { color: colors.foreground }]}>{selectedInvoice.reference}</Text>
                  <Text style={[styles.detailType, { color: colors.mutedForeground }]}>
                    {selectedInvoice.type === "facture" ? t("invFacture") : t("invDevis")}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[selectedInvoice.status].color + "18" }]}>
                  <Text style={[styles.statusText, { color: STATUS_CONFIG[selectedInvoice.status].color }]}>
                    {t(STATUS_CONFIG[selectedInvoice.status].labelKey)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedInvoice(null)} style={{ marginStart: 12 }}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Info grid */}
              <View style={[styles.detailInfo, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {[
                  { label: t("invDestinataire"), value: selectedInvoice.recipient },
                  { label: t("invDateEmission"), value: selectedInvoice.date },
                  { label: t("invDateEcheance"), value: selectedInvoice.dueDate },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
                  </View>
                ))}
              </View>

              {/* Items */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("invDetailArticles")}</Text>
              <View style={[styles.itemsBox, { borderColor: colors.border }]}>
                {selectedInvoice.items.map((item, i) => (
                  <View key={i} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.itemLabel, { color: colors.foreground, flex: 1 }]}>{item.label}</Text>
                    <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>×{item.quantity}</Text>
                    <Text style={[styles.itemPrice, { color: colors.foreground }]}>
                      {(item.quantity * item.unitPrice).toLocaleString()} MAD
                    </Text>
                  </View>
                ))}
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.totalLabel, { color: colors.foreground }]}>{t("invTotal")}</Text>
                  <Text style={[styles.totalAmount, { color: colors.primary }]}>
                    {selectedInvoice.amount.toLocaleString()} MAD
                  </Text>
                </View>
              </View>

              {/* Justificatif */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("invPieceJustif")}</Text>
              {selectedInvoice.proofUri || selectedInvoice.proofUrl ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => {
                    const uri = selectedInvoice.proofUri ?? selectedInvoice.proofUrl ?? null;
                    setProofModalUri(uri);
                  }}
                  style={styles.proofThumbWrap}
                >
                  <Image
                    source={{ uri: selectedInvoice.proofUri ?? selectedInvoice.proofUrl }}
                    style={styles.proofThumb}
                    resizeMode="cover"
                  />
                  <View style={styles.proofThumbOverlay}>
                    <Feather name="zoom-in" size={20} color="#fff" />
                    <Text style={styles.proofThumbOverlayText}>{t("invAppuyerAgrandir")}</Text>
                  </View>
                  <View style={[styles.proofVerified, { backgroundColor: "#10b981" }]}>
                    <Feather name="check" size={10} color="#fff" />
                    <Text style={styles.proofVerifiedText}>{t("invJustifJoint")}</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={[styles.noProof, { backgroundColor: "#ef444410", borderColor: "#ef444430" }]}>
                  <Feather name="alert-triangle" size={18} color="#ef4444" />
                  <Text style={[styles.noProofText, { color: "#ef4444" }]}>
                    {t("invAucunJustifJoint")}
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.actionBtns}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                  disabled={downloadingPdf}
                  onPress={() => downloadInvoicePdf(selectedInvoice.id)}
                >
                  {downloadingPdf ? (
                    <ActivityIndicator size="small" color={colors.foreground} />
                  ) : (
                    <Feather name="download" size={16} color={colors.foreground} />
                  )}
                  <Text style={[styles.actionBtnText, { color: colors.foreground }]}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    try {
                      await apiRequest(`/invoices/${selectedInvoice.id}/send`, "POST");
                      await Share.share({
                        title: selectedInvoice.reference,
                        message: `${t("invSharePrefix")} ${selectedInvoice.reference} — ${selectedInvoice.recipient} — ${selectedInvoice.amount.toLocaleString()} MAD`,
                      });
                    } catch {
                      showToast({ type: "error", title: t("error"), message: t("invSendError") });
                    }
                  }}
                >
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={[styles.actionBtnText, { color: "#fff" }]}>{t("invEnvoyerBtn")}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ─── Proof fullscreen modal ─────────────────────────────────────────────── */}
      <Modal visible={!!proofModalUri} transparent animationType="fade" onRequestClose={() => setProofModalUri(null)}>
        <View style={styles.proofFullOverlay}>
          <TouchableOpacity style={styles.proofFullClose} onPress={() => setProofModalUri(null)}>
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
          {proofModalUri && (
            <Image source={{ uri: proofModalUri }} style={styles.proofFullImg} resizeMode="contain" />
          )}
          <Text style={styles.proofFullCaption}>{t("invOriginalCaption")}</Text>
        </View>
      </Modal>

      {/* ─── Add modal ──────────────────────────────────────────────────────────── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => { setShowAdd(false); resetForm(); }}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[styles.addModal, { backgroundColor: colors.card }]}
            contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <View style={styles.detailHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addTitle, { color: colors.foreground }]}>{t("invNouveauDoc")}</Text>
                <Text style={[styles.addSub, { color: colors.mutedForeground }]}>
                  {t("invJustifObligatoire")}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setShowAdd(false); resetForm(); }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Type selector */}
            <View style={styles.typeRow}>
              {(["facture", "devis"] as const).map((tv) => (
                <TouchableOpacity
                  key={tv}
                  style={[styles.typeChip, {
                    backgroundColor: addType === tv ? colors.primary : colors.background,
                    borderColor: addType === tv ? colors.primary : colors.border,
                  }]}
                  onPress={() => setAddType(tv)}
                >
                  <Feather
                    name={tv === "facture" ? "file-text" : "clipboard"}
                    size={14}
                    color={addType === tv ? "#fff" : colors.mutedForeground}
                  />
                  <Text style={[styles.typeChipText, { color: addType === tv ? "#fff" : colors.mutedForeground }]}>
                    {tv === "facture" ? t("invFacture") : t("invDevis")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Fields */}
            {[
              { label: t("invDestinataireLabel"), val: addRecipient, set: setAddRecipient, placeholder: t("invDestinatairePh") },
              { label: t("invLibelleLabel"), val: addLabel, set: setAddLabel, placeholder: t("invLibellePh") },
              { label: t("invMontantLabel"), val: addAmount, set: setAddAmount, placeholder: "0.00", numeric: true },
            ].map(({ label, val, set, placeholder, numeric }) => (
              <View key={label}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground }]}
                  placeholder={placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={val}
                  onChangeText={set}
                  keyboardType={numeric ? "decimal-pad" : "default"}
                />
              </View>
            ))}

            <View>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("invNotesLabel")}</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, minHeight: 60 }]}
                placeholder={t("invNotesPh")}
                placeholderTextColor={colors.mutedForeground}
                value={addNotes}
                onChangeText={setAddNotes}
                multiline
              />
            </View>

            {/* ── Justificatif section ── */}
            <View style={[
              styles.proofSection,
              { borderColor: proofError ? "#ef4444" : colors.border, backgroundColor: proofError ? "#ef444405" : colors.background }
            ]}>
              {/* Header */}
              <View style={styles.proofSectionHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="paperclip" size={15} color={proofError ? "#ef4444" : colors.primary} />
                    <Text style={[styles.proofSectionTitle, { color: proofError ? "#ef4444" : colors.foreground }]}>
                      {t("invProofSectionTitle")}
                    </Text>
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: "#ef444418" }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#ef4444" }}>{t("invObligatoireBadge")}</Text>
                    </View>
                  </View>
                  <Text style={[styles.proofSectionSub, { color: colors.mutedForeground }]}>
                    {t("invProofSectionSub")}
                  </Text>
                </View>
              </View>

              {proofError && !proofUpload && (
                <View style={styles.proofErrorBanner}>
                  <Feather name="alert-circle" size={13} color="#ef4444" />
                  <Text style={styles.proofErrorText}>{t("invProofErrorBanner")}</Text>
                </View>
              )}

              {/* Preview or upload zone */}
              {proofUpload ? (
                <View style={{ gap: 10 }}>
                  {/* Thumbnail or doc icon */}
                  <View style={styles.proofPreviewWrap}>
                    {proofUpload.contentType.startsWith("image/") ? (
                      <Image
                        source={{ uri: proofUrlFromResult(proofUpload) }}
                        style={styles.proofPreview}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.proofPreview, { alignItems: "center", justifyContent: "center", backgroundColor: colors.secondary }]}>
                        <Feather name="file-text" size={40} color={colors.primary} />
                        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginTop: 8, paddingHorizontal: 8, textAlign: "center" }} numberOfLines={2}>
                          {proofUpload.fileName}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.proofPreviewBadge, { backgroundColor: "#10b981" }]}>
                      <Feather name="check-circle" size={12} color="#fff" />
                      <Text style={styles.proofPreviewBadgeText}>{t("invJustifJoint")}</Text>
                    </View>
                  </View>
                  {/* Change / remove row */}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.proofActionBtn, { flex: 1, backgroundColor: colors.muted, borderColor: colors.border }]}
                      onPress={showPickerOptions}
                      disabled={proofUploading || isSubmitting}
                    >
                      <Feather name="refresh-cw" size={14} color={colors.foreground} />
                      <Text style={[styles.proofActionBtnText, { color: colors.foreground }]}>{t("invChanger")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.proofActionBtn, { backgroundColor: "#ef444410", borderColor: "#ef444430" }]}
                      onPress={() => { setProofUpload(null); setProofError(false); }}
                      disabled={proofUploading || isSubmitting}
                    >
                      <Feather name="trash-2" size={14} color="#ef4444" />
                      <Text style={[styles.proofActionBtnText, { color: "#ef4444" }]}>{t("invSupprimer")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : proofUploading ? (
                <View style={[styles.proofUploadZone, { borderColor: colors.primary + "60", backgroundColor: colors.primary + "06", gap: 12 }]}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                    {t("invUploading")}
                  </Text>
                </View>
              ) : (
                /* Upload zone */
                <TouchableOpacity
                  style={[
                    styles.proofUploadZone,
                    {
                      borderColor: proofError ? "#ef4444" : colors.primary + "60",
                      backgroundColor: proofError ? "#ef444408" : colors.primary + "06",
                    },
                  ]}
                  onPress={showPickerOptions}
                  activeOpacity={0.8}
                >
                  <View style={[styles.proofUploadIcon, { backgroundColor: proofError ? "#ef444418" : colors.primary + "18" }]}>
                    <Feather name="upload-cloud" size={28} color={proofError ? "#ef4444" : colors.primary} />
                  </View>
                  <Text style={[styles.proofUploadTitle, { color: proofError ? "#ef4444" : colors.primary }]}>
                    {t("invTeleverser")}
                  </Text>
                  <Text style={[styles.proofUploadSub, { color: colors.mutedForeground }]}>
                    {t("invTeleverserSub")}
                  </Text>
                  <View style={[styles.proofUploadFormats, { backgroundColor: colors.muted }]}>
                    {["JPG", "PNG", "HEIC", "PDF"].map((fmt) => (
                      <View key={fmt} style={[styles.fmtBadge, { backgroundColor: colors.card }]}>
                        <Text style={[styles.fmtText, { color: colors.mutedForeground }]}>{fmt}</Text>
                      </View>
                    ))}
                    <Text style={[styles.fmtSep, { color: colors.mutedForeground }]}>· {t("invMaxSize")}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: isFormValid && !isSubmitting ? colors.primary : colors.muted },
              ]}
              onPress={handleAdd}
              disabled={isSubmitting || proofUploading}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather
                  name={addType === "facture" ? "file-text" : "clipboard"}
                  size={18}
                  color={isFormValid ? "#fff" : colors.mutedForeground}
                />
              )}
              <Text style={[styles.submitBtnText, { color: isFormValid && !isSubmitting ? "#fff" : colors.mutedForeground }]}>
                {isSubmitting
                  ? t("invCreating")
                  : addType === "facture" ? t("invCreerFacture") : t("invCreerDevis")}
              </Text>
            </TouchableOpacity>

            {!isFormValid && !isSubmitting && (
              <Text style={[styles.submitHint, { color: colors.mutedForeground }]}>
                {!proofUpload
                  ? t("invHintMissingProof")
                  : t("invHintFillFields")}
              </Text>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  summaryRow: { flexDirection: "row", padding: 16, gap: 10, borderBottomWidth: 1 },
  statBox: { flex: 1, padding: 12, borderRadius: 12, gap: 4 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },

  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13 },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  emptyBox: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  invoiceCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  invIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  invRef: { fontSize: 14, fontFamily: "Inter_700Bold" },
  invRecipient: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  invDate: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  invAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  proofBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  proofBadgeText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  detailModal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" },
  addModal: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "95%" },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  detailRef: { fontSize: 20, fontFamily: "Inter_700Bold" },
  detailType: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  detailInfo: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", maxWidth: "60%", textAlign: "right" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  itemsBox: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1 },
  itemLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  itemQty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  itemPrice: { fontSize: 13, fontFamily: "Inter_700Bold", minWidth: 80, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", padding: 14, borderTopWidth: 1 },
  totalLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  totalAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  actionBtns: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },

  // Proof in detail
  proofThumbWrap: { borderRadius: 16, overflow: "hidden", position: "relative" },
  proofThumb: { width: "100%", height: 200, borderRadius: 16 },
  proofThumbOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.4)", paddingVertical: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  proofThumbOverlayText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  proofVerified: {
    position: "absolute", top: 10, right: 10,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  proofVerifiedText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  noProof: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 16, borderRadius: 14, borderWidth: 1,
  },
  noProofText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },

  // Proof fullscreen
  proofFullOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center", justifyContent: "center",
  },
  proofFullClose: {
    position: "absolute", top: 56, right: 20,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    zIndex: 10,
  },
  proofFullImg: { width: "100%", height: "80%" },
  proofFullCaption: {
    color: "rgba(255,255,255,0.6)", fontSize: 12,
    fontFamily: "Inter_400Regular", marginTop: 16,
  },

  // Add form
  addTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  addSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  typeRow: { flexDirection: "row", gap: 10 },
  typeChip: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5,
  },
  typeChipText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 7 },
  input: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },

  // Proof section in form
  proofSection: {
    borderRadius: 18, borderWidth: 1.5,
    padding: 16, gap: 14,
  },
  proofSectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  proofSectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  proofSectionSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 16 },
  proofErrorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#ef444415", borderRadius: 10, padding: 10,
  },
  proofErrorText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#ef4444", flex: 1 },
  proofPreviewWrap: { position: "relative", borderRadius: 14, overflow: "hidden" },
  proofPreview: { width: "100%", height: 160, borderRadius: 14 },
  proofPreviewBadge: {
    position: "absolute", bottom: 10, right: 10,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  proofPreviewBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  proofActionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  proofActionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  proofUploadZone: {
    borderWidth: 1.5, borderStyle: "dashed", borderRadius: 16,
    padding: 24, alignItems: "center", gap: 10,
  },
  proofUploadIcon: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  proofUploadTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  proofUploadSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  proofUploadFormats: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginTop: 2,
  },
  fmtBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  fmtText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  fmtSep: { fontSize: 10, fontFamily: "Inter_400Regular" },

  // Submit
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: 16,
  },
  submitBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  submitHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -8 },
});
