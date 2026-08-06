import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { pickAndUploadInvoice } from "@/lib/upload";
import { prestataires as prestatairesApi } from "@/services/api";
import EmptyState from "@/components/EmptyState";
import FilterChips from "@/components/FilterChips";
import ScreenHeader from "@/components/ScreenHeader";
import StatsStrip from "@/components/StatsStrip";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";

type Lang = "fr" | "en" | "ar" | "es";
type Localized = Record<Lang, string>;

const STRINGS = {
  screenTitle: { fr: "Prestataires", en: "Service providers", ar: "مزودو الخدمات", es: "Proveedores" },
  provider: { fr: "prestataire", en: "provider", ar: "مزود", es: "proveedor" },
  providers: { fr: "prestataires", en: "providers", ar: "مزودون", es: "proveedores" },
  perMonth: { fr: "MAD/mois", en: "MAD/month", ar: "درهم/شهرياً", es: "MAD/mes" },
  summaryProviders: { fr: "Prestataires", en: "Providers", ar: "مزودو الخدمات", es: "Proveedores" },
  activeContracts: { fr: "Contrats actifs", en: "Active contracts", ar: "العقود النشطة", es: "Contratos activos" },
  expiringSoon: { fr: "Expirent bientôt", en: "Expiring soon", ar: "تنتهي قريباً", es: "Vencen pronto" },
  openWorks: { fr: "Travaux ouverts", en: "Open works", ar: "الأشغال المفتوحة", es: "Obras abiertas" },
  all: { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  noProviders: { fr: "Aucun prestataire", en: "No providers", ar: "لا يوجد مزودون", es: "Sin proveedores" },
  emptyDescription: { fr: "Aucun prestataire enregistré. Ajoutez votre premier prestataire de services.", en: "No providers have been recorded. Add your first service provider.", ar: "لم يتم تسجيل أي مزود. أضف أول مزود خدمات لك.", es: "No hay proveedores registrados. Añada su primer proveedor de servicios." },
  addProvider: { fr: "Ajouter un prestataire", en: "Add a provider", ar: "إضافة مزود", es: "Añadir proveedor" },
  loadingTitle: { fr: "Chargement des prestataires", en: "Loading providers", ar: "جارٍ تحميل مزودي الخدمات", es: "Cargando proveedores" },
  loadingDescription: { fr: "Nous récupérons les contrats et interventions de votre résidence.", en: "We are retrieving your residence's contracts and work orders.", ar: "نحن نسترجع عقود وتدخلات إقامتك.", es: "Estamos recuperando los contratos e intervenciones de su residencia." },
  loadingError: { fr: "Impossible de charger les prestataires", en: "Unable to load providers", ar: "تعذر تحميل مزودي الخدمات", es: "No se pueden cargar los proveedores" },
  errorDescription: { fr: "Les prestataires ne sont pas disponibles pour le moment. Vérifiez votre connexion puis réessayez.", en: "Providers are unavailable right now. Check your connection and try again.", ar: "مزودو الخدمات غير متاحين حالياً. تحقق من الاتصال ثم أعد المحاولة.", es: "Los proveedores no están disponibles ahora. Compruebe su conexión e inténtelo de nuevo." },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  uploadErrorTitle: { fr: "Erreur de téléversement", en: "Upload error", ar: "خطأ في الرفع", es: "Error de carga" },
  uploadError: { fr: "Impossible de téléverser le document.", en: "Unable to upload the document.", ar: "تعذر رفع الوثيقة.", es: "No se pudo cargar el documento." },
  requiredTitle: { fr: "Champs requis", en: "Required fields", ar: "حقول مطلوبة", es: "Campos obligatorios" },
  requiredMessage: { fr: "Le nom et le type du prestataire sont obligatoires.", en: "The provider name and type are required.", ar: "اسم ونوع مزود الخدمة مطلوبان.", es: "El nombre y el tipo del proveedor son obligatorios." },
  requiredDocumentTitle: { fr: "Justificatif obligatoire", en: "Proof required", ar: "الإثبات مطلوب", es: "Comprobante obligatorio" },
  requiredDocumentMessage: { fr: "Joignez une image ou un PDF justifiant le besoin de ce prestataire.", en: "Attach an image or PDF explaining why this provider is needed.", ar: "أرفق صورة أو ملف PDF يوضح سبب الحاجة إلى مزود الخدمة هذا.", es: "Adjunte una imagen o PDF que justifique la necesidad de este proveedor." },
  createdTitle: { fr: "Prestataire ajouté", en: "Provider added", ar: "تمت إضافة المزود", es: "Proveedor añadido" },
  createdMessage: { fr: "a été enregistré avec succès.", en: "has been saved successfully.", ar: "تم تسجيله بنجاح.", es: "se ha guardado correctamente." },
  genericError: { fr: "Une erreur est survenue. Réessayez.", en: "Something went wrong. Please try again.", ar: "حدث خطأ. حاول مرة أخرى.", es: "Se produjo un error. Inténtelo de nuevo." },
  newProvider: { fr: "Nouveau prestataire", en: "New provider", ar: "مزود جديد", es: "Nuevo proveedor" },
  name: { fr: "Nom *", en: "Name *", ar: "الاسم *", es: "Nombre *" },
  namePlaceholder: { fr: "Ex. Ascenseurs Atlas", en: "e.g. Atlas Elevators", ar: "مثال: مصاعد أطلس", es: "Ej. Ascensores Atlas" },
  type: { fr: "Type *", en: "Type *", ar: "النوع *", es: "Tipo *" },
  contact: { fr: "Contact", en: "Contact", ar: "جهة الاتصال", es: "Contacto" },
  contactPlaceholder: { fr: "Nom du contact", en: "Contact name", ar: "اسم جهة الاتصال", es: "Nombre del contacto" },
  phone: { fr: "Téléphone", en: "Phone", ar: "الهاتف", es: "Teléfono" },
  email: { fr: "Email", en: "Email", ar: "البريد الإلكتروني", es: "Correo electrónico" },
  notes: { fr: "Note / besoin", en: "Notes / need", ar: "ملاحظة / الحاجة", es: "Nota / necesidad" },
  notesPlaceholder: { fr: "Décrivez le besoin justifiant ce prestataire", en: "Describe why this provider is needed", ar: "صف سبب الحاجة إلى مزود الخدمة هذا", es: "Describa la necesidad de este proveedor" },
  proofLabel: { fr: "Justificatif (image ou PDF) *", en: "Proof (image or PDF) *", ar: "الإثبات (صورة أو PDF) *", es: "Comprobante (imagen o PDF) *" },
  attachProof: { fr: "Joindre une image ou un PDF justifiant le besoin", en: "Attach an image or PDF explaining the need", ar: "إرفاق صورة أو ملف PDF يوضح الحاجة", es: "Adjuntar una imagen o PDF que justifique la necesidad" },
  proofHelper: { fr: "Obligatoire : une photo, un devis ou un document PDF expliquant pourquoi ce prestataire est nécessaire.", en: "Required: a photo, quote, or PDF explaining why this provider is needed.", ar: "مطلوب: صورة أو عرض سعر أو ملف PDF يوضح سبب الحاجة إلى مزود الخدمة.", es: "Obligatorio: una foto, presupuesto o PDF que explique por qué se necesita este proveedor." },
  createProvider: { fr: "Créer le prestataire", en: "Create provider", ar: "إنشاء المزود", es: "Crear proveedor" },
  contracts: { fr: "contrat", en: "contract", ar: "عقد", es: "contrato" },
  contractsPlural: { fr: "contrats", en: "contracts", ar: "عقود", es: "contratos" },
  openWorksCount: { fr: "travaux en cours", en: "works in progress", ar: "أشغال قيد التنفيذ", es: "obras en curso" },
  expiringContract: { fr: "Contrat expirant", en: "Expiring contract", ar: "عقد منتهٍ قريباً", es: "Contrato por vencer" },
  endDate: { fr: "Fin", en: "End", ar: "النهاية", es: "Fin" },
  attachmentAdded: { fr: "Justificatif joint (image/PDF)", en: "Proof attached (image/PDF)", ar: "تم إرفاق الإثبات (صورة/PDF)", es: "Comprobante adjunto (imagen/PDF)" },
} as const;

const TYPE_CONFIG: Record<string, { label: Localized; icon: keyof typeof Feather.glyphMap; color: string }> = {
  ascenseur: { label: { fr: "Ascenseur", en: "Elevator", ar: "مصعد", es: "Ascensor" }, icon: "chevrons-up", color: "#3b82f6" },
  nettoyage: { label: { fr: "Nettoyage", en: "Cleaning", ar: "تنظيف", es: "Limpieza" }, icon: "wind", color: "#06b6d4" },
  gardiennage: { label: { fr: "Gardiennage", en: "Security", ar: "حراسة", es: "Seguridad" }, icon: "shield", color: "#2563EB" },
  plomberie: { label: { fr: "Plomberie", en: "Plumbing", ar: "سباكة", es: "Fontanería" }, icon: "droplet", color: "#0ea5e9" },
  electricite: { label: { fr: "Électricité", en: "Electrical", ar: "كهرباء", es: "Electricidad" }, icon: "zap", color: "#f59e0b" },
  jardinage: { label: { fr: "Jardinage", en: "Gardening", ar: "بستنة", es: "Jardinería" }, icon: "feather", color: "#10b981" },
  peinture: { label: { fr: "Peinture", en: "Painting", ar: "طلاء", es: "Pintura" }, icon: "edit-3", color: "#ec4899" },
  autre: { label: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" }, icon: "tool", color: "#6b7280" },
};

type Prestataire = {
  id: string;
  name: string;
  type: string;
  contactName?: string;
  phone?: string;
  email?: string;
  status: string;
  rating?: number;
  activeContracts: number;
  openWorkOrders: number;
  expiringContracts: number;
  contracts: any[];
};

export default function PrestatairesScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "president", "committee_member"]}>
      <PrestatairesScreenInner />
    </RoleGuard>
  );
}

function PrestatairesScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { lang } = useLanguage();
  const { showToast } = useToast();
  // President and committee_member oversee vendors (they approve contracts at governance level).
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "president" || user?.role === "committee_member";
  const { isWide } = useBreakpoints();

  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "autre", contactName: "", phone: "", email: "", notes: "",
  });
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentName, setDocumentName] = useState("");

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const resetForm = () => {
    setForm({ name: "", type: "autre", contactName: "", phone: "", email: "", notes: "" });
    setDocumentUrl("");
    setDocumentName("");
  };

  const handlePickJustification = async () => {
    try {
      setUploading(true);
      const result = await pickAndUploadInvoice();
      if (result) setDocumentUrl(result.objectPath);
      setDocumentName(result ? STRINGS.attachmentAdded[lang] : documentName);
    } catch {
      showToast({ type: "error", title: STRINGS.uploadErrorTitle[lang], message: STRINGS.uploadError[lang] });
    } finally { setUploading(false); }
  };

  const handleCreatePrestataire = async () => {
    if (!form.name.trim() || !form.type.trim()) {
      showToast({ type: "warning", title: STRINGS.requiredTitle[lang], message: STRINGS.requiredMessage[lang] });
      return;
    }
    if (!documentUrl) {
      Alert.alert(
        STRINGS.requiredDocumentTitle[lang],
        STRINGS.requiredDocumentMessage[lang],
      );
      return;
    }
    try {
      setSubmitting(true);
      await prestatairesApi.create({
        name: form.name.trim(),
        type: form.type.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
        documentUrl,
      });
      setShowAdd(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: STRINGS.createdTitle[lang], message: `${form.name} ${STRINGS.createdMessage[lang]}` });
      load();
    } catch {
      showToast({ type: "error", title: STRINGS.loadingError[lang], message: STRINGS.genericError[lang] });
    } finally { setSubmitting(false); }
  };

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setLoadError(false);
      }
      const qs = filterType !== "all" ? `?type=${filterType}` : "";
      const data = await apiRequest(`/prestataires${qs}`, "GET", undefined, token);
      setPrestataires(data.data ?? []);
    } catch {
      if (!silent) setLoadError(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, filterType, lang]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const totalMonthly = prestataires.reduce((s, p) => {
    const mc = p.contracts.reduce((cs: number, c: any) => cs + (c.monthlyAmount ?? 0), 0);
    return s + mc;
  }, 0);

  const FILTERS = [
    { key: "all", label: STRINGS.all[lang] },
    ...Object.entries(TYPE_CONFIG).map(([k, v]) => ({ key: k, label: v.label[lang] })),
  ];

  const renderStars = (rating?: number) => {
    if (!rating) return null;
    return (
      <View style={{ flexDirection: "row", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Feather key={i} name="star" size={10} color={i <= rating ? "#f59e0b" : colors.border} />
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: "#3b82f6", paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{STRINGS.screenTitle[lang]}</Text>
          <Text style={styles.headerSub}>
            {prestataires.length} {prestataires.length !== 1 ? STRINGS.providers[lang] : STRINGS.provider[lang]} • {totalMonthly.toLocaleString("fr-MA")} {STRINGS.perMonth[lang]}
          </Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}
            style={styles.addBtn}
          >
            <Feather name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Summary cards */}
      <View style={[styles.summaryRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: STRINGS.summaryProviders[lang], value: prestataires.length, color: "#3b82f6" },
          { label: STRINGS.activeContracts[lang], value: prestataires.reduce((s, p) => s + p.activeContracts, 0), color: "#10b981" },
          { label: STRINGS.expiringSoon[lang], value: prestataires.reduce((s, p) => s + p.expiringContracts, 0), color: "#f59e0b" },
          { label: STRINGS.openWorks[lang], value: prestataires.reduce((s, p) => s + p.openWorkOrders, 0), color: "#2563EB" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.sumCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={[styles.sumVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.sumLab, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <FilterChips
        options={FILTERS}
        value={filterType}
        onChange={(key) => setFilterType(key)}
        accentColor="#3b82f6"
        mode="scroll"
      />

      {loading ? (
        <LoadingState title={STRINGS.loadingTitle[lang]} description={STRINGS.loadingDescription[lang]} accentColor="#3b82f6" />
      ) : loadError ? (
        <ErrorState
          title={STRINGS.loadingError[lang]}
          description={STRINGS.errorDescription[lang]}
          retryLabel={STRINGS.retry[lang]}
          onRetry={() => load()}
          accentColor="#ef4444"
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
          showsVerticalScrollIndicator={false}
        >
          {prestataires.length === 0 ? (
            <EmptyState
              icon="briefcase"
              title={STRINGS.noProviders[lang]}
              description={STRINGS.emptyDescription[lang]}
              actionLabel={STRINGS.addProvider[lang]}
              onAction={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}
              accentColor="#3b82f6"
            />
          ) : (
            prestataires.map((p) => {
              const tc = TYPE_CONFIG[p.type] ?? TYPE_CONFIG.autre;
              const hasExpiring = p.expiringContracts > 0;

              return (
                <TouchableOpacity key={p.id} activeOpacity={0.8} onPress={() => router.push(`/prestataire-detail?id=${p.id}` as any)}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: hasExpiring ? "#f59e0b40" : colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeIcon, { backgroundColor: tc.color + "18" }]}>
                      <Feather name={tc.icon} size={22} color={tc.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardName, { color: colors.foreground }]}>{p.name}</Text>
                      <Text style={[styles.cardType, { color: tc.color }]}>{tc.label[lang]}</Text>
                      {renderStars(p.rating)}
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: p.status === "active" ? "#10b981" : "#ef4444" }]} />
                  </View>

                  {/* Contact */}
                  {(p.phone || p.email || p.contactName) ? (
                    <View style={[styles.contactRow, { borderTopColor: colors.border }]}>
                      {p.contactName ? (
                        <Text style={[styles.contactText, { color: colors.mutedForeground }]}>
                          <Text style={{ color: colors.foreground }}>{p.contactName}</Text>
                        </Text>
                      ) : null}
                      {p.phone ? (
                        <TouchableOpacity
                          style={styles.contactAction}
                          onPress={() => Linking.openURL(`tel:${p.phone}`)}
                        >
                          <Feather name="phone" size={13} color="#3b82f6" />
                          <Text style={[styles.contactActionText, { color: "#3b82f6" }]}>{p.phone}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Contracts & Work */}
                  <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
                    <View style={styles.statItem}>
                      <Feather name="file-text" size={13} color="#10b981" />
                      <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                        {p.activeContracts} {p.activeContracts !== 1 ? STRINGS.contractsPlural[lang] : STRINGS.contracts[lang]}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Feather name="tool" size={13} color="#2563EB" />
                      <Text style={[styles.statText, { color: colors.mutedForeground }]}>
                        {p.openWorkOrders} {STRINGS.openWorksCount[lang]}
                      </Text>
                    </View>
                    {hasExpiring ? (
                      <View style={styles.statItem}>
                        <Feather name="alert-triangle" size={13} color="#f59e0b" />
                        <Text style={[styles.statText, { color: "#f59e0b" }]}>{STRINGS.expiringContract[lang]}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Contract amounts */}
                  {p.contracts.length > 0 ? (
                    <View style={[styles.contractRow, { borderTopColor: colors.border }]}>
                      {p.contracts.slice(0, 1).map((c: any) => (
                        <View key={c.id} style={styles.contractItem}>
                          <Text style={[styles.contractTitle, { color: colors.mutedForeground }]} numberOfLines={1}>{c.title}</Text>
                          {c.monthlyAmount ? (
                            <Text style={[styles.contractAmt, { color: colors.foreground }]}>
                              {c.monthlyAmount.toLocaleString("fr-MA")} {STRINGS.perMonth[lang]}
                            </Text>
                          ) : null}
                          {c.endDate ? (
                            <Text style={[styles.contractDate, { color: hasExpiring ? "#f59e0b" : colors.mutedForeground }]}>
                              {STRINGS.endDate[lang]}: {c.endDate}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add prestataire modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{STRINGS.newProvider[lang]}</Text>
            <TouchableOpacity onPress={() => { setShowAdd(false); resetForm(); }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{STRINGS.name[lang]}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder={STRINGS.namePlaceholder[lang]}
              placeholderTextColor={colors.mutedForeground}
              value={form.name}
              onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{STRINGS.type[lang]}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setForm((p) => ({ ...p, type: k }))}
                  style={[
                    styles.typeChip,
                    { borderColor: form.type === k ? v.color : colors.border, backgroundColor: form.type === k ? v.color + "18" : colors.card },
                  ]}
                >
                  <Feather name={v.icon} size={13} color={form.type === k ? v.color : colors.mutedForeground} />
                  <Text style={[styles.typeChipText, { color: form.type === k ? v.color : colors.mutedForeground }]}>{v.label[lang]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{STRINGS.contact[lang]}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder={STRINGS.contactPlaceholder[lang]}
              placeholderTextColor={colors.mutedForeground}
              value={form.contactName}
              onChangeText={(v) => setForm((p) => ({ ...p, contactName: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{STRINGS.phone[lang]}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="+212 6XX XXX XXX"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              value={form.phone}
              onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{STRINGS.email[lang]}</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder="contact@exemple.ma"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              value={form.email}
              onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{STRINGS.notes[lang]}</Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder={STRINGS.notesPlaceholder[lang]}
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={form.notes}
              onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{STRINGS.proofLabel[lang]}</Text>
            <TouchableOpacity
              style={[
                styles.uploadBtn,
                { borderColor: documentUrl ? "#10b981" : colors.border, backgroundColor: documentUrl ? "#10b98110" : colors.card },
              ]}
              onPress={handlePickJustification}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#3b82f6" size="small" />
              ) : (
                <Feather name={documentUrl ? "check-circle" : "upload"} size={18} color={documentUrl ? "#10b981" : "#3b82f6"} />
              )}
              <Text style={[styles.uploadBtnText, { color: documentUrl ? "#10b981" : colors.foreground }]}>
                {documentName || STRINGS.attachProof[lang]}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              {STRINGS.proofHelper[lang]}
            </Text>

            <TouchableOpacity
              style={[styles.submitBtn, { opacity: submitting ? 0.6 : 1 }]}
              onPress={handleCreatePrestataire}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>{STRINGS.createProvider[lang]}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  summaryRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  sumCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  sumVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sumLab: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
  chip: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  typeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardType: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  contactText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  contactAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  contactActionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  statItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  contractRow: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  contractItem: { gap: 2 },
  contractTitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  contractAmt: { fontSize: 14, fontFamily: "Inter_700Bold" },
  contractDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },

  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 4 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  inputMulti: { minHeight: 80, textAlignVertical: "top" },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 16 },
  uploadBtnText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  helperText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 15 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3b82f6", borderRadius: 14, paddingVertical: 15, marginTop: 24 },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
