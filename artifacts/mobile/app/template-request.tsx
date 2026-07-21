/**
 * template-request.tsx — Template Request Workflow
 *
 * Syndicate admins submit requests for new document templates.
 * Displays their request history with real-time status badges.
 */
import { Feather } from "@expo/vector-icons";
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
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";
import { type ApiTemplateRequest, templateRequests as apiRequests } from "@/services/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "meeting_minutes", label: "Procès-verbaux",   icon: "clipboard"   as const, color: "#3b82f6" },
  { key: "financial",       label: "Finance",          icon: "dollar-sign" as const, color: "#10b981" },
  { key: "legal",           label: "Juridique",        icon: "shield"      as const, color: "#ef4444" },
  { key: "elections",       label: "Élections",        icon: "check-circle" as const, color: "#f59e0b" },
  { key: "contracts",       label: "Contrats",         icon: "file-text"   as const, color: "#0891b2" },
  { key: "certificates",    label: "Certificats",      icon: "award"       as const, color: "#8b5cf6" },
  { key: "regulations",     label: "Règlements",       icon: "book"        as const, color: "#06b6d4" },
  { key: "administrative",  label: "Administratif",    icon: "briefcase"   as const, color: "#16a34a" },
  { key: "maintenance",     label: "Maintenance",      icon: "tool"        as const, color: "#f97316" },
  { key: "insurance",       label: "Assurance",        icon: "umbrella"    as const, color: "#ec4899" },
];

const PRIORITIES = [
  { key: "low",    label: "Basse",   color: "#64748b" },
  { key: "normal", label: "Normale", color: "#3b82f6" },
  { key: "high",   label: "Haute",   color: "#f59e0b" },
  { key: "urgent", label: "Urgente", color: "#ef4444" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap }> = {
  pending:           { label: "En attente",          color: "#f59e0b", bg: "#fef3c720", icon: "clock" },
  in_review:         { label: "En cours d'examen",   color: "#3b82f6", bg: "#dbeafe20", icon: "eye" },
  approved:          { label: "Approuvé",             color: "#10b981", bg: "#d1fae520", icon: "check-circle" },
  rejected:          { label: "Refusé",               color: "#ef4444", bg: "#fee2e220", icon: "x-circle" },
  need_more_info:    { label: "Infos supplémentaires", color: "#8b5cf6", bg: "#ede9fe20", icon: "info" },
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
  const { showToast } = useToast();

  const [requests, setRequests] = useState<ApiTemplateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [selectedRequest, setSelectedRequest] = useState<ApiTemplateRequest | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequests.list();
      setRequests(res.data ?? []);
    } catch {
      showToast({ type: "error", message: "Erreur lors du chargement des demandes" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleSubmit = async () => {
    if (!form.title.trim()) { showToast({ type: "error", message: "Le titre est requis" }); return; }
    if (!form.category)      { showToast({ type: "error", message: "Choisissez une catégorie" }); return; }
    if (!form.description.trim()) { showToast({ type: "error", message: "La description est requise" }); return; }

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
      showToast({ type: "success", message: "Demande soumise avec succès" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false);
      setForm(emptyForm());
      load();
    } catch (err: any) {
      showToast({ type: "error", message: err?.message ?? "Erreur lors de la soumission" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#e2e8f0" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Demandes de modèles</Text>
          <Text style={s.headerSub}>Proposez un nouveau modèle de document</Text>
        </View>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowForm(true); }}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={s.newBtnText}>Nouvelle</Text>
        </TouchableOpacity>
      </View>

      {/* ── Info banner ── */}
      <View style={s.infoBanner}>
        <Feather name="info" size={14} color="#a78bfa" />
        <Text style={s.infoBannerText}>
          Votre demande sera examinée par l'équipe VERIDIAN. Une fois approuvée, le modèle sera créé et mis à votre disposition.
        </Text>
      </View>

      {/* ── List ── */}
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
      >
        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={s.loadingText}>Chargement…</Text>
          </View>
        ) : requests.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}>
              <Feather name="inbox" size={34} color="#2563EB" />
            </View>
            <Text style={s.emptyTitle}>Aucune demande</Text>
            <Text style={s.emptyDesc}>
              Vous n'avez pas encore soumis de demande de modèle. Appuyez sur "Nouvelle" pour commencer.
            </Text>
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
                    <View style={[s.catPill, { backgroundColor: (cat?.color ?? "#2563EB") + "20" }]}>
                      <Feather name={cat?.icon ?? "file"} size={11} color={cat?.color ?? "#2563EB"} />
                      <Text style={[s.catPillText, { color: cat?.color ?? "#2563EB" }]}>{cat?.label ?? req.category}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: sc.bg, borderColor: sc.color + "44" }]}>
                      <Feather name={sc.icon} size={10} color={sc.color} />
                      <Text style={[s.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                    {req.priority !== "normal" && (
                      <View style={[s.priBadge, { backgroundColor: (pri?.color ?? "#64748b") + "20" }]}>
                        <Text style={[s.priBadgeText, { color: pri?.color ?? "#64748b" }]}>{pri?.label}</Text>
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
                      <Feather name="message-square" size={11} color="#a78bfa" />
                      <Text style={s.reviewNoteText} numberOfLines={2}>{req.reviewNotes}</Text>
                    </View>
                  ) : null}
                  {req.rejectionReason ? (
                    <View style={[s.reviewNote, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}>
                      <Feather name="alert-circle" size={11} color="#ef4444" />
                      <Text style={[s.reviewNoteText, { color: "#ef4444" }]} numberOfLines={2}>{req.rejectionReason}</Text>
                    </View>
                  ) : null}

                  <Text style={s.cardDate}>
                    {new Date(req.createdAt).toLocaleDateString("fr-MA", { dateStyle: "medium" })}
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
              <Text style={s.modalTitle}>Nouvelle demande de modèle</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={{ marginLeft: "auto" }}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {/* Title */}
              <View style={s.formField}>
                <Text style={s.formLabel}>Titre du modèle <Text style={{ color: "#ef4444" }}>*</Text></Text>
                <TextInput
                  style={s.input}
                  value={form.title}
                  onChangeText={(t) => setForm({ ...form, title: t })}
                  placeholder="Ex: Contrat de maintenance ascenseur"
                  placeholderTextColor="#475569"
                />
              </View>

              {/* Category */}
              <View style={s.formField}>
                <Text style={s.formLabel}>Catégorie <Text style={{ color: "#ef4444" }}>*</Text></Text>
                <View style={s.chipRow}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.key}
                      style={[s.chip, form.category === cat.key && { backgroundColor: cat.color + "22", borderColor: cat.color }]}
                      onPress={() => setForm({ ...form, category: cat.key })}
                    >
                      <Feather name={cat.icon} size={11} color={form.category === cat.key ? cat.color : "#64748b"} />
                      <Text style={[s.chipText, form.category === cat.key && { color: cat.color }]}>{cat.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Description */}
              <View style={s.formField}>
                <Text style={s.formLabel}>Description <Text style={{ color: "#ef4444" }}>*</Text></Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={form.description}
                  onChangeText={(t) => setForm({ ...form, description: t })}
                  placeholder="Décrivez l'objectif et l'usage de ce modèle…"
                  placeholderTextColor="#475569"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Business purpose */}
              <View style={s.formField}>
                <Text style={s.formLabel}>Contexte métier</Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={form.businessPurpose}
                  onChangeText={(t) => setForm({ ...form, businessPurpose: t })}
                  placeholder="Quel problème ce modèle résout-il ? Quelle est la fréquence d'utilisation attendue ?"
                  placeholderTextColor="#475569"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Required fields */}
              <View style={s.formField}>
                <Text style={s.formLabel}>Champs requis (variables)</Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={form.requiredFields}
                  onChangeText={(t) => setForm({ ...form, requiredFields: t })}
                  placeholder="Ex: date_intervention, nom_prestataire, montant_devis, description_travaux…"
                  placeholderTextColor="#475569"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Legal notes */}
              <View style={s.formField}>
                <Text style={s.formLabel}>Références légales (optionnel)</Text>
                <TextInput
                  style={s.input}
                  value={form.legalNotes}
                  onChangeText={(t) => setForm({ ...form, legalNotes: t })}
                  placeholder="Ex: Art. 15 de la loi 18-00 relative à la copropriété"
                  placeholderTextColor="#475569"
                />
              </View>

              {/* Priority */}
              <View style={s.formField}>
                <Text style={s.formLabel}>Priorité</Text>
                <View style={s.chipRow}>
                  {PRIORITIES.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      style={[s.chip, form.priority === p.key && { backgroundColor: p.color + "22", borderColor: p.color }]}
                      onPress={() => setForm({ ...form, priority: p.key as FormState["priority"] })}
                    >
                      <Text style={[s.chipText, form.priority === p.key && { color: p.color }]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={s.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
                <Text style={s.submitBtnText}>{submitting ? "Envoi…" : "Soumettre la demande"}</Text>
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
                      <Feather name="x" size={20} color="#64748b" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={[s.detailStatusBadge, { backgroundColor: sc.bg, borderColor: sc.color + "44" }]}>
                      <Feather name={sc.icon} size={14} color={sc.color} />
                      <Text style={[s.detailStatusText, { color: sc.color }]}>{sc.label}</Text>
                    </View>

                    {[
                      { label: "Catégorie", value: cat?.label ?? selectedRequest.category },
                      { label: "Priorité", value: PRIORITIES.find((p) => p.key === selectedRequest.priority)?.label ?? selectedRequest.priority },
                      { label: "Soumis le", value: new Date(selectedRequest.createdAt).toLocaleDateString("fr-MA", { dateStyle: "long" }) },
                      selectedRequest.reviewedAt ? { label: "Examiné le", value: new Date(selectedRequest.reviewedAt).toLocaleDateString("fr-MA", { dateStyle: "long" }) } : null,
                    ].filter(Boolean).map((row: any) => (
                      <View key={row.label} style={s.detailRow}>
                        <Text style={s.detailKey}>{row.label}</Text>
                        <Text style={s.detailVal}>{row.value}</Text>
                      </View>
                    ))}

                    {selectedRequest.description ? (
                      <View style={s.detailSection}>
                        <Text style={s.detailSectionTitle}>Description</Text>
                        <Text style={s.detailSectionBody}>{selectedRequest.description}</Text>
                      </View>
                    ) : null}

                    {selectedRequest.businessPurpose ? (
                      <View style={s.detailSection}>
                        <Text style={s.detailSectionTitle}>Contexte métier</Text>
                        <Text style={s.detailSectionBody}>{selectedRequest.businessPurpose}</Text>
                      </View>
                    ) : null}

                    {selectedRequest.reviewNotes ? (
                      <View style={[s.detailSection, { backgroundColor: "#2563EB15", borderColor: "#2563EB30" }]}>
                        <Text style={[s.detailSectionTitle, { color: "#a78bfa" }]}>Notes de l'examinateur</Text>
                        <Text style={[s.detailSectionBody, { color: "#c4b5fd" }]}>{selectedRequest.reviewNotes}</Text>
                      </View>
                    ) : null}

                    {selectedRequest.rejectionReason ? (
                      <View style={[s.detailSection, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}>
                        <Text style={[s.detailSectionTitle, { color: "#ef4444" }]}>Motif de refus</Text>
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
  root:             { flex: 1, backgroundColor: "#0f172a" },
  header:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16,
                      borderBottomWidth: 1, borderBottomColor: "#1e293b", gap: 12 },
  backBtn:          { width: 38, height: 38, borderRadius: 19, backgroundColor: "#1e293b",
                      alignItems: "center", justifyContent: "center" },
  headerTitle:      { fontSize: 17, fontWeight: "700", color: "#f1f5f9" },
  headerSub:        { fontSize: 11, color: "#64748b", marginTop: 1 },
  newBtn:           { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2563EB",
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  newBtnText:       { fontSize: 13, fontWeight: "700", color: "#fff" },
  infoBanner:       { flexDirection: "row", alignItems: "flex-start", gap: 10, margin: 16,
                      backgroundColor: "#2563EB15", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#2563EB30" },
  infoBannerText:   { flex: 1, fontSize: 12, color: "#a78bfa", lineHeight: 18 },
  loadingText:      { color: "#64748b", marginTop: 12, fontSize: 14 },
  emptyWrap:        { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyIcon:        { width: 80, height: 80, borderRadius: 24, backgroundColor: "#2563EB11",
                      alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: "#2563EB33" },
  emptyTitle:       { fontSize: 18, fontWeight: "700", color: "#f1f5f9", marginBottom: 8 },
  emptyDesc:        { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 20 },
  card:             { backgroundColor: "#1e293b", borderRadius: 16, overflow: "hidden",
                      borderWidth: 1, borderColor: "#334155", flexDirection: "row" },
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
  cardTitle:        { fontSize: 14, fontWeight: "700", color: "#f1f5f9", marginTop: 8, marginBottom: 4, lineHeight: 20 },
  cardDesc:         { fontSize: 12, color: "#64748b", lineHeight: 17, marginBottom: 6 },
  reviewNote:       { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#2563EB10",
                      borderRadius: 8, padding: 8, marginVertical: 4, borderWidth: 1, borderColor: "#2563EB25" },
  reviewNoteText:   { flex: 1, fontSize: 11, color: "#a78bfa", lineHeight: 16 },
  cardDate:         { fontSize: 10, color: "#475569", marginTop: 8 },
  // Modal
  modalOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet:       { backgroundColor: "#1e293b", borderTopLeftRadius: 28, borderTopRightRadius: 28,
                      paddingHorizontal: 20, paddingTop: 12, maxHeight: "92%", flex: 0 },
  modalHandle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: "#334155",
                      alignSelf: "center", marginBottom: 16 },
  modalTitle:       { fontSize: 17, fontWeight: "700", color: "#f1f5f9", flex: 1 },
  formField:        { marginBottom: 18 },
  formLabel:        { fontSize: 12, fontWeight: "600", color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  input:            { backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#334155", borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 12, color: "#f1f5f9", fontSize: 14 },
  inputMulti:       { minHeight: 80, textAlignVertical: "top" },
  chipRow:          { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:             { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7,
                      borderRadius: 100, borderWidth: 1.5, borderColor: "#334155", backgroundColor: "#0f172a" },
  chipText:         { fontSize: 11, fontWeight: "600", color: "#64748b" },
  modalFooter:      { flexDirection: "row", gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#334155" },
  cancelBtn:        { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "#334155",
                      alignItems: "center", justifyContent: "center" },
  cancelBtnText:    { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
  submitBtn:        { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      gap: 8, backgroundColor: "#2563EB", paddingVertical: 14, borderRadius: 14 },
  submitBtnText:    { fontSize: 14, fontWeight: "700", color: "#fff" },
  // Detail
  detailStatusBadge:{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14,
                      paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  detailStatusText: { fontSize: 13, fontWeight: "700" },
  detailRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  detailKey:        { fontSize: 12, color: "#64748b", fontWeight: "500" },
  detailVal:        { fontSize: 12, color: "#f1f5f9", fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  detailSection:    { backgroundColor: "#0f172a", borderRadius: 12, padding: 14, marginTop: 14,
                      borderWidth: 1, borderColor: "#334155" },
  detailSectionTitle: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  detailSectionBody:  { fontSize: 13, color: "#94a3b8", lineHeight: 20 },
});
