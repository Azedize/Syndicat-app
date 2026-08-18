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
import { useLanguage, type LangCode } from "@/context/LanguageContext";

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
  { key: "administrative", labelKey: "categoryAdministrative" },
  { key: "financial", labelKey: "categoryFinancial" },
  { key: "legal", labelKey: "categoryLegal" },
  { key: "meeting", labelKey: "categoryMeeting" },
  { key: "attestation", labelKey: "categoryAttestation" },
  { key: "maintenance", labelKey: "categoryMaintenance" },
  { key: "other", labelKey: "categoryOther" },
];

const PRIORITIES = [
  { key: "low", labelKey: "priorityLow", color: "#64748b" },
  { key: "normal", labelKey: "priorityNormal", color: "#3b82f6" },
  { key: "high", labelKey: "priorityHigh", color: "#f59e0b" },
  { key: "urgent", labelKey: "priorityUrgent", color: "#ef4444" },
];

const FIELD_TYPES = ["text", "date", "number", "boolean", "select"] as const;

const STRINGS: Record<string, Record<LangCode, string>> = {
  requestTitle: {
    fr: "Demander un nouveau modèle",
    en: "Request a new template",
    ar: "طلب نموذج جديد",
    es: "Solicitar una nueva plantilla",
  },
  sentTitle: {
    fr: "Demande envoyée !",
    en: "Request sent!",
    ar: "تم إرسال الطلب!",
    es: "¡Solicitud enviada!",
  },
  sentDescription: {
    fr: "L'équipe MIZAN examinera votre demande. Vous recevrez une notification par e-mail dès qu'une décision sera prise.",
    en: "The MIZAN team will review your request. You will receive an email notification when a decision is made.",
    ar: "سيراجع فريق MIZAN طلبك. ستتلقى إشعاراً بالبريد الإلكتروني عند اتخاذ القرار.",
    es: "El equipo de MIZAN revisará su solicitud. Recibirá una notificación por correo cuando se tome una decisión.",
  },
  close: { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
  templateTitle: {
    fr: "Titre du modèle",
    en: "Template title",
    ar: "عنوان النموذج",
    es: "Título de la plantilla",
  },
  templateTitlePlaceholder: {
    fr: "Ex. : Attestation de fin de chantier",
    en: "E.g. completion certificate",
    ar: "مثال: شهادة نهاية الأشغال",
    es: "Ej.: certificado de fin de obra",
  },
  category: { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  description: {
    fr: "Description",
    en: "Description",
    ar: "الوصف",
    es: "Descripción",
  },
  optional: { fr: "facultatif", en: "optional", ar: "اختياري", es: "opcional" },
  descriptionPlaceholder: {
    fr: "Décrivez le modèle, son usage et les sections attendues…",
    en: "Describe the template, its use, and expected sections…",
    ar: "صف النموذج واستخدامه والأقسام المطلوبة…",
    es: "Describa la plantilla, su uso y las secciones esperadas…",
  },
  businessPurpose: {
    fr: "Objectif métier / base légale",
    en: "Business purpose / legal basis",
    ar: "الغرض المهني / الأساس القانوني",
    es: "Objetivo empresarial / base legal",
  },
  businessPurposePlaceholder: {
    fr: "Loi 18-00, article… / Réponse aux exigences de la mairie…",
    en: "Law 18-00, article… / Response to municipality requirements…",
    ar: "القانون 18-00، المادة… / الاستجابة لمتطلبات الجماعة…",
    es: "Ley 18-00, artículo… / Respuesta a requisitos municipales…",
  },
  priority: { fr: "Priorité", en: "Priority", ar: "الأولوية", es: "Prioridad" },
  scope: {
    fr: "Portée de diffusion",
    en: "Distribution scope",
    ar: "نطاق النشر",
    es: "Alcance de difusión",
  },
  privateScope: {
    fr: "Mon syndicat uniquement",
    en: "My syndicate only",
    ar: "نقابتي فقط",
    es: "Solo mi sindicato",
  },
  globalScope: {
    fr: "Tous les syndicats",
    en: "All syndicates",
    ar: "جميع النقابات",
    es: "Todos los sindicatos",
  },
  requiredFields: {
    fr: "Champs requis dans le modèle",
    en: "Required template fields",
    ar: "الحقول المطلوبة في النموذج",
    es: "Campos obligatorios de la plantilla",
  },
  requiredFieldsDescription: {
    fr: "Listez les champs que ce modèle devrait contenir (les données auto-remplies depuis la base ne sont pas à lister).",
    en: "List the fields this template should contain (do not list data automatically filled from the database).",
    ar: "اذكر الحقول التي يجب أن يحتويها النموذج (لا تذكر البيانات المملوءة تلقائياً من قاعدة البيانات).",
    es: "Indique los campos que debe contener la plantilla (no incluya datos rellenados automáticamente desde la base de datos).",
  },
  type: { fr: "Type", en: "Type", ar: "النوع", es: "Tipo" },
  required: { fr: "Requis", en: "Required", ar: "مطلوب", es: "Obligatorio" },
  optionalField: {
    fr: "Optionnel",
    en: "Optional",
    ar: "اختياري",
    es: "Opcional",
  },
  fieldNamePlaceholder: {
    fr: "Nom du champ (ex. : Motif, Date d'effet…)",
    en: "Field name (e.g. reason, effective date…)",
    ar: "اسم الحقل (مثال: السبب، تاريخ السريان…)",
    es: "Nombre del campo (ej.: motivo, fecha de vigencia…)",
  },
  addField: {
    fr: "Ajouter ce champ",
    en: "Add this field",
    ar: "إضافة هذا الحقل",
    es: "Añadir este campo",
  },
  legalNotes: {
    fr: "Notes légales",
    en: "Legal notes",
    ar: "ملاحظات قانونية",
    es: "Notas legales",
  },
  legalNotesPlaceholder: {
    fr: "Articles de loi pertinents, mentions obligatoires, conformité RGPD…",
    en: "Relevant legal articles, mandatory notices, data protection compliance…",
    ar: "المواد القانونية ذات الصلة، الإشعارات الإلزامية، الامتثال لحماية البيانات…",
    es: "Artículos legales pertinentes, avisos obligatorios, cumplimiento de protección de datos…",
  },
  submit: {
    fr: "Soumettre la demande",
    en: "Submit request",
    ar: "إرسال الطلب",
    es: "Enviar solicitud",
  },
  titleRequired: {
    fr: "Le titre est requis.",
    en: "A title is required.",
    ar: "العنوان مطلوب.",
    es: "El título es obligatorio.",
  },
  submitSuccess: {
    fr: "Demande de modèle soumise avec succès !",
    en: "Template request submitted successfully!",
    ar: "تم إرسال طلب النموذج بنجاح!",
    es: "¡Solicitud de plantilla enviada correctamente!",
  },
  submitError: {
    fr: "Impossible de soumettre la demande. Veuillez réessayer.",
    en: "The request could not be submitted. Please try again.",
    ar: "تعذر إرسال الطلب. يرجى المحاولة مجدداً.",
    es: "No se pudo enviar la solicitud. Inténtelo de nuevo.",
  },
  categoryAdministrative: {
    fr: "Administratif",
    en: "Administrative",
    ar: "إداري",
    es: "Administrativo",
  },
  categoryFinancial: {
    fr: "Financier",
    en: "Financial",
    ar: "مالي",
    es: "Financiero",
  },
  categoryLegal: { fr: "Juridique", en: "Legal", ar: "قانوني", es: "Jurídico" },
  categoryMeeting: {
    fr: "Réunion / PV",
    en: "Meeting / Minutes",
    ar: "اجتماع / محضر",
    es: "Reunión / Acta",
  },
  categoryAttestation: {
    fr: "Attestation",
    en: "Certificate",
    ar: "شهادة",
    es: "Certificado",
  },
  categoryMaintenance: {
    fr: "Maintenance / Travaux",
    en: "Maintenance / Works",
    ar: "الصيانة / الأشغال",
    es: "Mantenimiento / Obras",
  },
  categoryOther: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
  priorityLow: { fr: "Basse", en: "Low", ar: "منخفضة", es: "Baja" },
  priorityNormal: { fr: "Normale", en: "Normal", ar: "عادية", es: "Normal" },
  priorityHigh: { fr: "Haute", en: "High", ar: "مرتفعة", es: "Alta" },
  priorityUrgent: { fr: "Urgente", en: "Urgent", ar: "عاجلة", es: "Urgente" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TemplateRequestModal({
  visible,
  onClose,
  onSubmitted,
}: Props) {
  const colors = useColors();
  const { lang } = useLanguage();
  const copy = (key: string) => STRINGS[key][lang];
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("administrative");
  const [description, setDescription] = useState("");
  const [businessPurpose, setBusinessPurpose] = useState("");
  const [legalNotes, setLegalNotes] = useState("");
  const [priority, setPriority] = useState<
    "low" | "normal" | "high" | "urgent"
  >("normal");
  const [publishScope, setPublishScope] = useState<"private" | "global">(
    "private",
  );
  const [fields, setFields] = useState<RequiredField[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New field row inputs
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] =
    useState<RequiredField["type"]>("text");
  const [newFieldReq, setNewFieldReq] = useState(false);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setTitle("");
      setCategory("administrative");
      setDescription("");
      setBusinessPurpose("");
      setLegalNotes("");
      setPriority("normal");
      setPublishScope("private");
      setFields([]);
      setSubmitting(false);
      setSubmitted(false);
      setError(null);
      setNewFieldName("");
      setNewFieldType("text");
      setNewFieldReq(false);
    }
  }, [visible]);

  const addField = () => {
    if (!newFieldName.trim()) return;
    setFields((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        name: newFieldName.trim(),
        type: newFieldType,
        required: newFieldReq,
      },
    ]);
    setNewFieldName("");
    setNewFieldType("text");
    setNewFieldReq(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError(copy("titleRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.templateRequests.create({
        title: title.trim(),
        category,
        description: description.trim() || undefined,
        businessPurpose: businessPurpose.trim() || undefined,
        legalNotes: legalNotes.trim() || undefined,
        priority,
        publishScope,
        requiredFields: fields.map(({ id: _id, ...f }) => f),
      });
      setSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.showToast({ type: "success", message: copy("submitSuccess") });
      onSubmitted?.();
    } catch {
      setError(copy("submitError"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  const s = makeStyles(colors);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.container, { paddingTop: topPad }]}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>
            {copy("requestTitle")}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {submitted ? (
          // ── Success state ───────────────────────────────────────────────
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              gap: 20,
            }}
          >
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: "#10b98120",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="check-circle" size={44} color="#10b981" />
            </View>
            <Text
              style={[
                s.sectionTitle,
                { fontSize: 20, color: colors.foreground, textAlign: "center" },
              ]}
            >
              {copy("sentTitle")}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.mutedForeground,
                textAlign: "center",
                lineHeight: 20,
                maxWidth: 300,
              }}
            >
              {copy("sentDescription")}
            </Text>
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: "#10b981" }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={s.submitBtnText}>{copy("close")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={{
                padding: 20,
                gap: 20,
                paddingBottom: 120,
              }}
            >
              {/* Title */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>
                  {copy("templateTitle")}{" "}
                  <Text style={{ color: "#ef4444" }}>*</Text>
                </Text>
                <TextInput
                  style={[
                    s.input,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder={copy("templateTitlePlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              {/* Category */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>
                  {copy("category")} <Text style={{ color: "#ef4444" }}>*</Text>
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingRight: 20 }}
                >
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.key}
                      style={[
                        s.chip,
                        {
                          backgroundColor:
                            category === cat.key
                              ? colors.primary + "15"
                              : colors.card,
                          borderColor:
                            category === cat.key
                              ? colors.primary
                              : colors.border,
                        },
                      ]}
                      onPress={() => setCategory(cat.key)}
                    >
                      <Text
                        style={[
                          s.chipText,
                          {
                            color:
                              category === cat.key
                                ? colors.primary
                                : colors.mutedForeground,
                          },
                        ]}
                      >
                        {copy(cat.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Description */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>
                  {copy("description")}{" "}
                  <Text style={{ color: colors.mutedForeground }}>
                    ({copy("optional")})
                  </Text>
                </Text>
                <TextInput
                  style={[
                    s.input,
                    s.textarea,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder={copy("descriptionPlaceholder")}
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
                <Text style={[s.label, { color: colors.foreground }]}>
                  {copy("businessPurpose")}{" "}
                  <Text style={{ color: colors.mutedForeground }}>
                    ({copy("optional")})
                  </Text>
                </Text>
                <TextInput
                  style={[
                    s.input,
                    s.textarea,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder={copy("businessPurposePlaceholder")}
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
                <Text style={[s.label, { color: colors.foreground }]}>
                  {copy("priority")}
                </Text>
                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  {PRIORITIES.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      style={[
                        s.chip,
                        {
                          backgroundColor:
                            priority === p.key ? p.color + "15" : colors.card,
                          borderColor:
                            priority === p.key ? p.color : colors.border,
                        },
                      ]}
                      onPress={() => setPriority(p.key as any)}
                    >
                      <Text
                        style={[
                          s.chipText,
                          {
                            color:
                              priority === p.key
                                ? p.color
                                : colors.mutedForeground,
                          },
                        ]}
                      >
                        {copy(p.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Scope */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>
                  {copy("scope")}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    {
                      key: "private",
                      label: copy("privateScope"),
                      icon: "lock" as const,
                    },
                    {
                      key: "global",
                      label: copy("globalScope"),
                      icon: "globe" as const,
                    },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        s.chip,
                        {
                          flex: 1,
                          gap: 6,
                          backgroundColor:
                            publishScope === opt.key
                              ? colors.primary + "12"
                              : colors.card,
                          borderColor:
                            publishScope === opt.key
                              ? colors.primary
                              : colors.border,
                        },
                      ]}
                      onPress={() => setPublishScope(opt.key as any)}
                    >
                      <Feather
                        name={opt.icon}
                        size={12}
                        color={
                          publishScope === opt.key
                            ? colors.primary
                            : colors.mutedForeground
                        }
                      />
                      <Text
                        style={[
                          s.chipText,
                          {
                            color:
                              publishScope === opt.key
                                ? colors.primary
                                : colors.mutedForeground,
                            textAlign: "center",
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Required fields */}
              <View
                style={[
                  s.section,
                  { borderColor: colors.border, backgroundColor: colors.card },
                ]}
              >
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>
                  {copy("requiredFields")}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.mutedForeground,
                    marginBottom: 12,
                    lineHeight: 17,
                  }}
                >
                  {copy("requiredFieldsDescription")}
                </Text>

                {/* Existing fields */}
                {fields.map((f) => (
                  <View key={f.id} style={s.fieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.foreground,
                          fontWeight: "600",
                        }}
                      >
                        {f.name}
                      </Text>
                      <Text
                        style={{ fontSize: 11, color: colors.mutedForeground }}
                      >
                        {copy("type")}: {f.type}{" "}
                        {f.required
                          ? `· ${copy("required")}`
                          : `· ${copy("optionalField")}`}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeField(f.id)}>
                      <Feather name="trash-2" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Add field row */}
                <View style={{ gap: 8, marginTop: fields.length > 0 ? 12 : 0 }}>
                  <TextInput
                    style={[
                      s.input,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        color: colors.foreground,
                      },
                    ]}
                    placeholder={copy("fieldNamePlaceholder")}
                    placeholderTextColor={colors.mutedForeground}
                    value={newFieldName}
                    onChangeText={setNewFieldName}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 6 }}
                    >
                      {FIELD_TYPES.map((t) => (
                        <TouchableOpacity
                          key={t}
                          style={[
                            s.chip,
                            {
                              backgroundColor:
                                newFieldType === t
                                  ? colors.primary + "15"
                                  : colors.background,
                              borderColor:
                                newFieldType === t
                                  ? colors.primary
                                  : colors.border,
                            },
                          ]}
                          onPress={() => setNewFieldType(t)}
                        >
                          <Text
                            style={[
                              s.chipText,
                              {
                                color:
                                  newFieldType === t
                                    ? colors.primary
                                    : colors.mutedForeground,
                              },
                            ]}
                          >
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TouchableOpacity
                      style={[
                        s.chip,
                        {
                          backgroundColor: newFieldReq
                            ? "#ef444415"
                            : colors.background,
                          borderColor: newFieldReq ? "#ef4444" : colors.border,
                        },
                      ]}
                      onPress={() => setNewFieldReq((p) => !p)}
                    >
                      <Text
                        style={[
                          s.chipText,
                          {
                            color: newFieldReq
                              ? "#ef4444"
                              : colors.mutedForeground,
                          },
                        ]}
                      >
                        {copy("required")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[
                      s.chip,
                      {
                        borderColor: colors.primary,
                        borderStyle: "dashed",
                        flexDirection: "row",
                        gap: 6,
                        alignSelf: "flex-start",
                        paddingHorizontal: 12,
                      },
                    ]}
                    onPress={addField}
                    disabled={!newFieldName.trim()}
                  >
                    <Feather name="plus" size={12} color={colors.primary} />
                    <Text style={[s.chipText, { color: colors.primary }]}>
                      {copy("addField")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Legal notes */}
              <View>
                <Text style={[s.label, { color: colors.foreground }]}>
                  {copy("legalNotes")}{" "}
                  <Text style={{ color: colors.mutedForeground }}>
                    ({copy("optional")})
                  </Text>
                </Text>
                <TextInput
                  style={[
                    s.input,
                    s.textarea,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder={copy("legalNotesPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={legalNotes}
                  onChangeText={setLegalNotes}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>

              {error && (
                <View
                  style={[
                    s.errorBanner,
                    { borderColor: "#ef444430", backgroundColor: "#ef444410" },
                  ]}
                >
                  <Feather name="alert-circle" size={14} color="#ef4444" />
                  <Text style={{ fontSize: 12, color: "#ef4444", flex: 1 }}>
                    {error}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View
              style={[
                s.footer,
                {
                  paddingBottom: insets.bottom + 16,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  s.submitBtn,
                  {
                    flex: 1,
                    backgroundColor: submitting
                      ? colors.border
                      : colors.primary,
                  },
                ]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#fff" />
                    <Text style={s.submitBtnText}>{copy("submit")}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>,
) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "700",
      flex: 1,
      textAlign: "center",
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
      backgroundColor: colors.muted,
    },
    label: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
    input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
    textarea: { minHeight: 70 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    chipText: { fontSize: 12, fontWeight: "600" },
    section: { borderWidth: 1, borderRadius: 14, padding: 14 },
    sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
    fieldRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.muted,
      marginBottom: 8,
      gap: 10,
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
    },
    footer: { padding: 16, borderTopWidth: 1 },
    submitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 14,
    },
    submitBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  });
}
