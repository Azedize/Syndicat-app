/**
 * template-request.tsx — Template Request Workflow
 *
 * Syndicate admins submit requests for new document templates.
 * Displays their request history with real-time status badges.
 */
import { Feather } from "@/components/ui/Feather";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";
import { type ApiTemplateRequest, templateRequests as apiRequests } from "@/services/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "meeting_minutes", labelKey: "tsCategoryMeeting", icon: "clipboard" as const, color: "#5A4AD6" },
  { key: "financial", labelKey: "tsCategoryFinancial", icon: "dollar-sign" as const, color: "#13976C" },
  { key: "legal", labelKey: "tsCategoryLegal", icon: "shield" as const, color: "#C8323C" },
  { key: "elections", labelKey: "tsCategoryElections", icon: "check-circle" as const, color: "#C98511" },
  { key: "contracts", labelKey: "tsCategoryContracts", icon: "file-text" as const, color: "#0F6E7D" },
  { key: "certificates", labelKey: "tsCategoryCertificates", icon: "award" as const, color: "#1F8A9A" },
  { key: "regulations", labelKey: "tsCategoryRegulations", icon: "book" as const, color: "#1F8A9A" },
  { key: "administrative", labelKey: "tsCategoryAdministrative", icon: "briefcase" as const, color: "#0B7A57" },
  { key: "maintenance", labelKey: "tsCategoryMaintenance", icon: "tool" as const, color: "#C8642A" },
  { key: "insurance", labelKey: "tsCategoryInsurance", icon: "umbrella" as const, color: "#C2456E" },
];

const PRIORITIES = [
  { key: "low", labelKey: "trPriorityLow", color: "#6A6680" },
  { key: "normal", labelKey: "trPriorityNormal", color: "#5A4AD6" },
  { key: "high", labelKey: "trPriorityHigh", color: "#C98511" },
  { key: "urgent", labelKey: "trPriorityUrgent", color: "#C8323C" },
];

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap }> = {
  pending: { labelKey: "tsPending", color: "#C98511", bg: "#FBF1DD20", icon: "clock" },
  in_review: { labelKey: "tsInReview", color: "#5A4AD6", bg: "#EEEBFC20", icon: "eye" },
  approved: { labelKey: "tsApproved", color: "#13976C", bg: "#E5F4EC20", icon: "check-circle" },
  rejected: { labelKey: "tsRejected", color: "#C8323C", bg: "#FBE9EA20", icon: "x-circle" },
  need_more_info: { labelKey: "tsNeedMoreInfo", color: "#1F8A9A", bg: "#E4F2F420", icon: "info" },
};

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  category: string;
  description: string;
  businessPurpose: string;
  requiredFields: string;
  legalNotes: string;
  priority: "low" | "normal" | "high" | "urgent";
}

const emptyForm = (): FormState => ({
  title: "",
  category: "",
  description: "",
  businessPurpose: "",
  requiredFields: "",
  legalNotes: "",
  priority: "normal",
});

// ─── Screen ───────────────────────────────────────────────────────────────────

function TemplateRequestContent() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const { showToast } = useToast();

  const [requests, setRequests] = useState<ApiTemplateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [selectedRequest, setSelectedRequest] = useState<ApiTemplateRequest | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await apiRequests.list();
      setRequests(res.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleSubmit = async () => {
    if (!form.title.trim()) { showToast({ type: "error", message: t("trRequiredTitle") }); return; }
    if (!form.category)      { showToast({ type: "error", message: t("trRequiredCategory") }); return; }
    if (!form.description.trim()) { showToast({ type: "error", message: t("trRequiredDescription") }); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      await apiRequests.create({
        title:           form.title.trim(),
        category:        form.category,
        description:     form.description.trim() || undefined,
        businessPurpose: form.businessPurpose.trim() || undefined,
        requiredFields:  form.requiredFields.trim() || undefined,
        legalNotes:      form.legalNotes.trim() || undefined,
        priority:        form.priority,
      });
      showToast({ type: "success", message: t("trSubmitted") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false);
      setForm(emptyForm());
      load();
    } catch (err: any) {
      showToast({ type: "error", message: t("trSubmitError") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#E7E1D6" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t("tsRequests")}</Text>
          <Text style={s.headerSub}>{t("trSubtitle")}</Text>
        </View>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowForm(true); }}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={s.newBtnText}>{t("trNew")}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Info banner ── */}
      <View style={s.infoBanner}>
        <Feather name="info" size={14} color="#5CC6D4" />
        <Text style={s.infoBannerText}>
          {t("trInfo")}
        </Text>
      </View>

      {/* ── List ── */}
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5A4AD6" />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
      >
        {loading ? (
          <LoadingState title={t("trLoading")} description={t("tsLoadingDescription")} accentColor="#5A4AD6" />
        ) : loadError ? (
          <ErrorState title={t("trLoadError")} description={t("tsActionError")} retryLabel={t("tsRetry")} onRetry={load} accentColor="#C8323C" />
        ) : requests.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Feather name="inbox" size={34} color="#5A4AD6" />
            </View>
            <Text style={s.emptyTitle}>{t("trEmpty")}</Text>
            <Text style={s.emptyDesc}>{t("trEmptyDescription")}</Text>
          </View>
        ) : (
          requests.map((req) => {
            const sc = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending;
            const cat = CATEGORIES.find((c) => c.key === req.category);
            const pri = PRIORITIES.find((p) => p.key === req.priority);
            return (
              <TouchableOpacity
                key={req.id}
                style={s.card}
                onPress={() => setSelectedRequest(req)}
                activeOpacity={0.8}
              >
                {/* Status bar */}
                <View style={[s.statusBar, { backgroundColor: sc.color }]} />
                <View style={s.cardInner}>
                  {/* Header */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <View style={[s.catPill, { backgroundColor: (cat?.color ?? "#5A4AD6") + "20" }]}>
                      <Feather name={cat?.icon ?? "file"} size={11} color={cat?.color ?? "#5A4AD6"} />
                      <Text style={[s.catPillText, { color: cat?.color ?? "#5A4AD6" }]}>{cat ? t(cat.labelKey) : req.category}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: sc.bg, borderColor: sc.color + "44" }]}>
                      <Feather name={sc.icon} size={10} color={sc.color} />
                      <Text style={[s.statusBadgeText, { color: sc.color }]}>{t(sc.labelKey)}</Text>
                    </View>
                    {req.priority !== "normal" && (
                      <View style={[s.priBadge, { backgroundColor: (pri?.color ?? "#6A6680") + "20" }]}>
                        <Text style={[s.priBadgeText, { color: pri?.color ?? "#6A6680" }]}>{pri ? t(pri.labelKey) : req.priority}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={s.cardTitle} numberOfLines={2}>{req.title}</Text>
                  {req.description ? (
                    <Text style={s.cardDesc} numberOfLines={2}>{req.description}</Text>
                  ) : null}

                  {/* Review notes */}
                  {req.reviewNotes ? (
                    <View style={s.reviewNote}>
                      <Feather name="message-square" size={11} color="#5CC6D4" />
                      <Text style={s.reviewNoteText} numberOfLines={2}>{req.reviewNotes}</Text>
                    </View>
                  ) : null}
                  {req.rejectionReason ? (
                    <View style={[s.reviewNote, { backgroundColor: "#C8323C15", borderColor: "#C8323C30" }]}>
                      <Feather name="alert-circle" size={11} color="#C8323C" />
                      <Text style={[s.reviewNoteText, { color: "#C8323C" }]} numberOfLines={2}>{req.rejectionReason}</Text>
                    </View>
                  ) : null}

                  <Text style={s.cardDate}>
                    {new Date(req.createdAt).toLocaleDateString(`${lang}-MA`, { dateStyle: "medium" })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ── New Request Modal ── */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={s.modalHandle} />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
              <Text style={s.modalTitle}>{t("trNewRequest")}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={{ marginLeft: "auto" }}>
                <Feather name="x" size={20} color="#6A6680" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {/* Title */}
              <View style={s.formField}>
                <Text style={s.formLabel}>{t("trTitle")} <Text style={{ color: "#C8323C" }}>*</Text></Text>
                <TextInput
                  style={s.input}
                  value={form.title}
                  onChangeText={(t) => setForm({ ...form, title: t })}
                  placeholder={t("trTitlePlaceholder")}
                  placeholderTextColor="#4D4964"
                />
              </View>

              {/* Category */}
              <View style={s.formField}>
                <Text style={s.formLabel}>{t("trCategoryRequired")} <Text style={{ color: "#C8323C" }}>*</Text></Text>
                <View style={s.chipRow}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.key}
                      style={[s.chip, form.category === cat.key && { backgroundColor: cat.color + "22", borderColor: cat.color }]}
                      onPress={() => setForm({ ...form, category: cat.key })}
                    >
                      <Feather name={cat.icon} size={11} color={form.category === cat.key ? cat.color : "#6A6680"} />
                      <Text style={[s.chipText, form.category === cat.key && { color: cat.color }]}>{t(cat.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Description */}
              <View style={s.formField}>
                <Text style={s.formLabel}>{t("trDescriptionRequired")} <Text style={{ color: "#C8323C" }}>*</Text></Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={form.description}
                  onChangeText={(t) => setForm({ ...form, description: t })}
                  placeholder={t("trDescriptionPlaceholder")}
                  placeholderTextColor="#4D4964"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Business purpose */}
              <View style={s.formField}>
                <Text style={s.formLabel}>{t("trBusinessPurpose")}</Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={form.businessPurpose}
                  onChangeText={(t) => setForm({ ...form, businessPurpose: t })}
                  placeholder={t("trBusinessPurposePlaceholder")}
                  placeholderTextColor="#4D4964"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Required fields */}
              <View style={s.formField}>
                <Text style={s.formLabel}>{t("trRequiredFields")}</Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={form.requiredFields}
                  onChangeText={(t) => setForm({ ...form, requiredFields: t })}
                  placeholder={t("trRequiredFieldsPlaceholder")}
                  placeholderTextColor="#4D4964"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Legal notes */}
              <View style={s.formField}>
                <Text style={s.formLabel}>{t("trLegalNotes")}</Text>
                <TextInput
                  style={s.input}
                  value={form.legalNotes}
                  onChangeText={(t) => setForm({ ...form, legalNotes: t })}
                  placeholder={t("trLegalNotesPlaceholder")}
                  placeholderTextColor="#4D4964"
                />
              </View>

              {/* Priority */}
              <View style={s.formField}>
                <Text style={s.formLabel}>{t("trPriority")}</Text>
                <View style={s.chipRow}>
                  {PRIORITIES.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      style={[s.chip, form.priority === p.key && { backgroundColor: p.color + "22", borderColor: p.color }]}
                      onPress={() => setForm({ ...form, priority: p.key as FormState["priority"] })}
                    >
                      <Text style={[s.chipText, form.priority === p.key && { color: p.color }]}>{t(p.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={s.cancelBtnText}>{t("trCancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
                <Text style={s.submitBtnText}>{submitting ? t("trSending") : t("trSubmit")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal visible={!!selectedRequest} animationType="slide" transparent onRequestClose={() => setSelectedRequest(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            {selectedRequest && (() => {
              const sc = STATUS_CONFIG[selectedRequest.status] ?? STATUS_CONFIG.pending;
              const cat = CATEGORIES.find((c) => c.key === selectedRequest.category);
              return (
                <>
                  <View style={s.modalHandle} />
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
                    <Text style={s.modalTitle} numberOfLines={2}>{selectedRequest.title}</Text>
                    <TouchableOpacity onPress={() => setSelectedRequest(null)} style={{ marginLeft: "auto" }}>
                      <Feather name="x" size={20} color="#6A6680" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={[s.detailStatusBadge, { backgroundColor: sc.bg, borderColor: sc.color + "44" }]}>
                      <Feather name={sc.icon} size={14} color={sc.color} />
                      <Text style={[s.detailStatusText, { color: sc.color }]}>{t(sc.labelKey)}</Text>
                    </View>

                    {[
                      { label: t("trCategory"), value: cat ? t(cat.labelKey) : selectedRequest.category },
                      { label: t("trPriority"), value: PRIORITIES.find((p) => p.key === selectedRequest.priority) ? t(PRIORITIES.find((p) => p.key === selectedRequest.priority)!.labelKey) : selectedRequest.priority },
                      { label: t("trSubmittedOn"), value: new Date(selectedRequest.createdAt).toLocaleDateString(`${lang}-MA`, { dateStyle: "long" }) },
                      selectedRequest.reviewedAt ? { label: t("trReviewedOn"), value: new Date(selectedRequest.reviewedAt).toLocaleDateString(`${lang}-MA`, { dateStyle: "long" }) } : null,
                    ].filter(Boolean).map((row: any) => (
                      <View key={row.label} style={s.detailRow}>
                        <Text style={s.detailKey}>{row.label}</Text>
                        <Text style={s.detailVal}>{row.value}</Text>
                      </View>
                    ))}

                    {selectedRequest.description ? (
                      <View style={s.detailSection}>
                        <Text style={s.detailSectionTitle}>{t("trDescriptionRequired")}</Text>
                        <Text style={s.detailSectionBody}>{selectedRequest.description}</Text>
                      </View>
                    ) : null}

                    {selectedRequest.businessPurpose ? (
                      <View style={s.detailSection}>
                        <Text style={s.detailSectionTitle}>{t("trBusinessPurpose")}</Text>
                        <Text style={s.detailSectionBody}>{selectedRequest.businessPurpose}</Text>
                      </View>
                    ) : null}

                    {selectedRequest.reviewNotes ? (
                      <View style={[s.detailSection, { backgroundColor: "#5A4AD615", borderColor: "#5A4AD630" }]}>
                        <Text style={[s.detailSectionTitle, { color: "#5CC6D4" }]}>{t("trReviewerNotes")}</Text>
                        <Text style={[s.detailSectionBody, { color: "#9BDDE6" }]}>{selectedRequest.reviewNotes}</Text>
                      </View>
                    ) : null}

                    {selectedRequest.rejectionReason ? (
                      <View style={[s.detailSection, { backgroundColor: "#C8323C15", borderColor: "#C8323C30" }]}>
                        <Text style={[s.detailSectionTitle, { color: "#C8323C" }]}>{t("trRejectionReason")}</Text>
                        <Text style={[s.detailSectionBody, { color: "#fca5a5" }]}>{selectedRequest.rejectionReason}</Text>
                      </View>
                    ) : null}

                    <View style={{ height: 20 }} />
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function TemplateRequestScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "super_admin"]}>
      <TemplateRequestContent />
    </RoleGuard>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: "#0E0C1C" },
  header:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16,
                      borderBottomWidth: 1, borderBottomColor: "#17142B", gap: 12 },
  backBtn:          { width: 38, height: 38, borderRadius: 19, backgroundColor: "#17142B",
                      alignItems: "center", justifyContent: "center" },
  headerTitle:      { fontSize: 17, fontWeight: "700", color: "#F0ECE4" },
  headerSub:        { fontSize: 11, color: "#6A6680", marginTop: 1 },
  newBtn:           { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#5A4AD6",
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  newBtnText:       { fontSize: 13, fontWeight: "700", color: "#fff" },
  infoBanner:       { flexDirection: "row", alignItems: "flex-start", gap: 10, margin: 16,
                      backgroundColor: "#5A4AD615", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#5A4AD630" },
  infoBannerText:   { flex: 1, fontSize: 12, color: "#5CC6D4", lineHeight: 18 },
  loadingText:      { color: "#6A6680", marginTop: 12, fontSize: 14 },
  emptyWrap:        { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon:        { width: 80, height: 80, borderRadius: 24, backgroundColor: "#5A4AD611",
                      alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: "#5A4AD633" },
  emptyTitle:       { fontSize: 18, fontWeight: "700", color: "#F0ECE4", marginBottom: 8 },
  emptyDesc:        { fontSize: 13, color: "#6A6680", textAlign: "center", lineHeight: 20 },
  card:             { backgroundColor: "#17142B", borderRadius: 16, overflow: "hidden",
                      borderWidth: 1, borderColor: "#3A3652", flexDirection: "row" },
  statusBar:        { width: 4 },
  cardInner:        { flex: 1, padding: 14 },
  catPill:          { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8,
                      paddingVertical: 4, borderRadius: 20 },
  catPillText:      { fontSize: 10, fontWeight: "600" },
  statusBadge:      { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8,
                      paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusBadgeText:  { fontSize: 10, fontWeight: "700" },
  priBadge:         { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  priBadgeText:     { fontSize: 10, fontWeight: "600" },
  cardTitle:        { fontSize: 14, fontWeight: "700", color: "#F0ECE4", marginTop: 8, marginBottom: 4, lineHeight: 20 },
  cardDesc:         { fontSize: 12, color: "#6A6680", lineHeight: 17, marginBottom: 6 },
  reviewNote:       { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#5A4AD610",
                      borderRadius: 8, padding: 8, marginVertical: 4, borderWidth: 1, borderColor: "#5A4AD625" },
  reviewNoteText:   { flex: 1, fontSize: 11, color: "#5CC6D4", lineHeight: 16 },
  cardDate:         { fontSize: 10, color: "#A6A1BE", marginTop: 8 },
  // Modal
  modalOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet:       { backgroundColor: "#17142B", borderTopLeftRadius: 28, borderTopRightRadius: 28,
                      paddingHorizontal: 20, paddingTop: 12, maxHeight: "92%", flex: 0 },
  modalHandle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: "#3A3652",
                      alignSelf: "center", marginBottom: 16 },
  modalTitle:       { fontSize: 17, fontWeight: "700", color: "#F0ECE4", flex: 1 },
  formField:        { marginBottom: 18 },
  formLabel:        { fontSize: 12, fontWeight: "600", color: "#A6A1BE", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  input:            { backgroundColor: "#0E0C1C", borderWidth: 1, borderColor: "#3A3652", borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 12, color: "#F0ECE4", fontSize: 14 },
  inputMulti:       { minHeight: 80, textAlignVertical: "top" },
  chipRow:          { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:             { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7,
                      borderRadius: 100, borderWidth: 1.5, borderColor: "#3A3652", backgroundColor: "#0E0C1C" },
  chipText:         { fontSize: 11, fontWeight: "600", color: "#6A6680" },
  modalFooter:      { flexDirection: "row", gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#3A3652" },
  cancelBtn:        { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "#3A3652",
                      alignItems: "center", justifyContent: "center" },
  cancelBtnText:    { fontSize: 14, fontWeight: "600", color: "#A6A1BE" },
  submitBtn:        { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      gap: 8, backgroundColor: "#5A4AD6", paddingVertical: 14, borderRadius: 14 },
  submitBtnText:    { fontSize: 14, fontWeight: "700", color: "#fff" },
  // Detail
  detailStatusBadge:{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14,
                      paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  detailStatusText: { fontSize: 13, fontWeight: "700" },
  detailRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#17142B" },
  detailKey:        { fontSize: 12, color: "#6A6680", fontWeight: "500" },
  detailVal:        { fontSize: 12, color: "#F0ECE4", fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  detailSection:    { backgroundColor: "#0E0C1C", borderRadius: 12, padding: 14, marginTop: 14,
                      borderWidth: 1, borderColor: "#3A3652" },
  detailSectionTitle: { fontSize: 11, fontWeight: "700", color: "#6A6680", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  detailSectionBody:  { fontSize: 13, color: "#A6A1BE", lineHeight: 20 },
});
