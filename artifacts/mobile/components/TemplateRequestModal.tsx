/**
 * TemplateRequestModal — Submit a request for a new document template.
 *
 * Any authenticated user can request a new template. Super Admin will review,
 * approve or reject it from their admin panel, and can build the template
 * using the visual builder.
 *
 * Fields:
 *  - Title (required)
 *  - Category (required)
 *  - Description (optional)
 *  - Business purpose / legal basis (optional)
 *  - Priority (low / normal / high / urgent)
 *  - Required fields list (add/remove rows)
 *  - Legal notes (optional)
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequiredField {
  id: string;
  name: string;
  type: "text" | "date" | "number" | "boolean" | "select";
  required: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "administrative", label: "Administratif" },
  { key: "financial",      label: "Financier" },
  { key: "legal",          label: "Juridique" },
  { key: "meeting",        label: "Réunion / PV" },
  { key: "attestation",    label: "Attestation" },
  { key: "maintenance",    label: "Maintenance / Travaux" },
  { key: "other",          label: "Autre" },
];

const PRIORITIES = [
  { key: "low",    label: "Basse",    color: "#64748b" },
  { key: "normal", label: "Normale",  color: "#3b82f6" },
  { key: "high",   label: "Haute",    color: "#f59e0b" },
  { key: "urgent", label: "Urgente",  color: "#ef4444" },
];

const FIELD_TYPES = ["text", "date", "number", "boolean", "select"] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplateRequestModal({ visible, onClose, onSubmitted }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Form state
  const [title,           setTitle]           = useState("");
  const [category,        setCategory]        = useState("administrative");
  const [description,     setDescription]     = useState("");
  const [businessPurpose, setBusinessPurpose] = useState("");
  const [legalNotes,      setLegalNotes]      = useState("");
  const [priority,        setPriority]        = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [publishScope,    setPublishScope]    = useState<"private" | "global">("private");
  const [fields,          setFields]          = useState<RequiredField[]>([]);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitted,       setSubmitted]       = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  // New field row inputs
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<RequiredField["type"]>("text");
  const [newFieldReq,  setNewFieldReq]  = useState(false);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setTitle(""); setCategory("administrative"); setDescription("");
      setBusinessPurpose(""); setLegalNotes(""); setPriority("normal");
      setPublishScope("private"); setFields([]); setSubmitting(false);
      setSubmitted(false); setError(null); setNewFieldName(""); setNewFieldType("text"); setNewFieldReq(false);
    }
  }, [visible]);

  const addField = () => {
    if (!newFieldName.trim()) return;
    setFields((prev) => [...prev, {
      id:       Date.now().toString(),
      name:     newFieldName.trim(),
      type:     newFieldType,
      required: newFieldReq,
    }]);
    setNewFieldName(""); setNewFieldType("text"); setNewFieldReq(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError("Le titre est requis."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.templateRequests.create({
        title:           title.trim(),
        category,
        description:     description.trim() || undefined,
        businessPurpose: businessPurpose.trim() || undefined,
        legalNotes:      legalNotes.trim() || undefined,
        priority,
        publishScope,
        requiredFields:  fields.map(({ id: _id, ...f }) => f),
      });
      setSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.showToast({ type: "success", message: "Demande de modèle soumise avec succès !" });
      onSubmitted?.();
    } catch {
      setError("Impossible de soumettre la demande. Veuillez réessayer.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  const s = makeStyles(colors);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { paddingTop: topPad }]}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>Demander un nouveau modèle</Text>
          <View style={{ width: 36 }} />
        </View>

        {submitted ? (
          // ── Success state ───────────────────────────────────────────────
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#10b98120", alignItems: "center", justifyContent: "center" }}>
              <Feather name="check-circle" size={44} color="#10b981" />
            </View>
            <Text style={[s.sectionTitle, { fontSize: 20, color: colors.foreground, textAlign: "center" }]}>Demande envoyée !</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 20, maxWidth: 300 }}>
              L'équipe Syndycat examinera votre demande. Vous recevrez une notification par e-mail dès qu'une décision sera prise.
            </Text>
            <TouchableOpacity style={[s.submitBtn, { backgroundColor: "#10b981" }]} onPress={onClose} activeOpacity={0.85}>
              <Text style={s.submitBtnText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 120 }}>

              {/* Title */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>Titre du modèle <Text style={{ color: "#ef4444" }}>*</Text></Text>
                <TextInput
                  style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Ex: Attestation de fin de chantier"
                  placeholderTextColor={colors.mutedForeground}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              {/* Category */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>Catégorie <Text style={{ color: "#ef4444" }}>*</Text></Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.key}
                      style={[s.chip, {
                        backgroundColor: category === cat.key ? colors.primary + "15" : colors.card,
                        borderColor: category === cat.key ? colors.primary : colors.border,
                      }]}
                      onPress={() => setCategory(cat.key)}
                    >
                      <Text style={[s.chipText, { color: category === cat.key ? colors.primary : colors.mutedForeground }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Description */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>Description <Text style={{ color: colors.mutedForeground }}>(optionnel)</Text></Text>
                <TextInput
                  style={[s.input, s.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Décrivez le modèle, son usage et les sections attendues…"
                  placeholderTextColor={colors.mutedForeground}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Business purpose */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>Objectif métier / base légale <Text style={{ color: colors.mutedForeground }}>(optionnel)</Text></Text>
                <TextInput
                  style={[s.input, s.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Loi 18-00, article…  /  Réponse aux exigences de la mairie…"
                  placeholderTextColor={colors.mutedForeground}
                  value={businessPurpose}
                  onChangeText={setBusinessPurpose}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              {/* Priority */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>Priorité</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {PRIORITIES.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      style={[s.chip, {
                        backgroundColor: priority === p.key ? p.color + "15" : colors.card,
                        borderColor: priority === p.key ? p.color : colors.border,
                      }]}
                      onPress={() => setPriority(p.key as any)}
                    >
                      <Text style={[s.chipText, { color: priority === p.key ? p.color : colors.mutedForeground }]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Scope */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>Portée de diffusion</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { key: "private", label: "Mon syndicat uniquement", icon: "lock" as const },
                    { key: "global",  label: "Tous les syndicats",      icon: "globe" as const },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.chip, { flex: 1, gap: 6,
                        backgroundColor: publishScope === opt.key ? colors.primary + "12" : colors.card,
                        borderColor: publishScope === opt.key ? colors.primary : colors.border,
                      }]}
                      onPress={() => setPublishScope(opt.key as any)}
                    >
                      <Feather name={opt.icon} size={12} color={publishScope === opt.key ? colors.primary : colors.mutedForeground} />
                      <Text style={[s.chipText, { color: publishScope === opt.key ? colors.primary : colors.mutedForeground, textAlign: "center" }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Required fields */}
              <View style={[s.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>Champs requis dans le modèle</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 12, lineHeight: 17 }}>
                  Listez les champs que ce modèle devrait contenir (les données auto-remplies depuis la DB ne sont pas à lister).
                </Text>

                {/* Existing fields */}
                {fields.map((f) => (
                  <View key={f.id} style={s.fieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600" }}>{f.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Type: {f.type} {f.required ? "· Requis" : "· Optionnel"}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeField(f.id)}>
                      <Feather name="trash-2" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Add field row */}
                <View style={{ gap: 8, marginTop: fields.length > 0 ? 12 : 0 }}>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                    placeholder="Nom du champ (ex: Motif, Date d'effet…)"
                    placeholderTextColor={colors.mutedForeground}
                    value={newFieldName}
                    onChangeText={setNewFieldName}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      {FIELD_TYPES.map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[s.chip, { backgroundColor: newFieldType === t ? colors.primary + "15" : colors.background, borderColor: newFieldType === t ? colors.primary : colors.border }]}
                          onPress={() => setNewFieldType(t)}
                        >
                          <Text style={[s.chipText, { color: newFieldType === t ? colors.primary : colors.mutedForeground }]}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TouchableOpacity
                      style={[s.chip, { backgroundColor: newFieldReq ? "#ef444415" : colors.background, borderColor: newFieldReq ? "#ef4444" : colors.border }]}
                      onPress={() => setNewFieldReq((p) => !p)}
                    >
                      <Text style={[s.chipText, { color: newFieldReq ? "#ef4444" : colors.mutedForeground }]}>Requis</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[s.chip, { borderColor: colors.primary, borderStyle: "dashed", flexDirection: "row", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12 }]}
                    onPress={addField}
                    disabled={!newFieldName.trim()}
                  >
                    <Feather name="plus" size={12} color={colors.primary} />
                    <Text style={[s.chipText, { color: colors.primary }]}>Ajouter ce champ</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Legal notes */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>Notes légales <Text style={{ color: colors.mutedForeground }}>(optionnel)</Text></Text>
                <TextInput
                  style={[s.input, s.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder="Articles de loi pertinents, mentions obligatoires, conformité RGPD…"
                  placeholderTextColor={colors.mutedForeground}
                  value={legalNotes}
                  onChangeText={setLegalNotes}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              {error && (
                <View style={[s.errorBanner, { borderColor: "#ef444430", backgroundColor: "#ef444410" }]}>
                  <Feather name="alert-circle" size={14} color="#ef4444" />
                  <Text style={{ fontSize: 12, color: "#ef4444", flex: 1 }}>{error}</Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[s.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
              <TouchableOpacity style={[s.submitBtn, { flex: 1, backgroundColor: submitting ? colors.border : colors.primary }]} onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Feather name="send" size={16} color="#fff" /><Text style={s.submitBtnText}>Soumettre la demande</Text></>
                }
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: colors.background },
    header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle:  { fontSize: 17, fontWeight: "700", flex: 1, textAlign: "center" },
    closeBtn:     { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.muted },
    label:        { fontSize: 13, fontWeight: "600", marginBottom: 6 },
    input:        { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
    textarea:     { minHeight: 70 },
    chip:         { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
    chipText:     { fontSize: 12, fontWeight: "600" },
    section:      { borderWidth: 1, borderRadius: 14, padding: 14 },
    sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
    fieldRow:     { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10, backgroundColor: colors.muted, marginBottom: 8, gap: 10 },
    errorBanner:  { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
    footer:       { padding: 16, borderTopWidth: 1 },
    submitBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14 },
    submitBtnText:{ fontSize: 15, fontWeight: "700", color: "#fff" },
  });
}
