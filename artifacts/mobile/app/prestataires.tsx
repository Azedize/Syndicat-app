import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { pickAndUploadInvoice } from "@/lib/upload";
import { prestataires as prestatairesApi } from "@/features/providers/api";
import EmptyState from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState } from "@/components/DataState";
import { Button, Card, Chip, ListItem, SheetHeader, Skeleton, StatusBadge, TextField, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";

type Lang = "fr" | "en" | "ar" | "es";
type Localized = Record<Lang, string>;

const STRINGS = {
  screenTitle: { fr: "Prestataires", en: "Service providers", ar: "مزودو الخدمات", es: "Proveedores" },
  provider: { fr: "prestataire", en: "provider", ar: "مزود", es: "proveedor" },
  providers: { fr: "prestataires", en: "providers", ar: "مزودون", es: "proveedores" },
  perMonthShort: { fr: "mois", en: "month", ar: "شهر", es: "mes" },
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
  contactsLabel: { fr: "Contact", en: "Contact", ar: "الاتصال", es: "Contacto" },
  call: { fr: "Appeler", en: "Call", ar: "اتصال", es: "Llamar" },
  suspended: { fr: "Suspendu", en: "Suspended", ar: "موقوف", es: "Suspendido" },
  activeLabel: { fr: "Actif", en: "Active", ar: "نشط", es: "Activo" },
  monthlyActive: { fr: "Contrats actifs / mois", en: "Active contracts / month", ar: "العقود النشطة / شهرياً", es: "Contratos activos / mes" },
  attachmentAdded: { fr: "Justificatif joint (image/PDF)", en: "Proof attached (image/PDF)", ar: "تم إرفاق الإثبات (صورة/PDF)", es: "Comprobante adjunto (imagen/PDF)" },
} as const;


type FeatherName = keyof typeof Feather.glyphMap;

const TYPE_CONFIG: Record<string, { label: Localized; icon: FeatherName; tone: StatusTone }> = {
  ascenseur: { label: { fr: "Ascenseur", en: "Elevator", ar: "مصعد", es: "Ascensor" }, icon: "chevrons-up", tone: "info" },
  nettoyage: { label: { fr: "Nettoyage", en: "Cleaning", ar: "تنظيف", es: "Limpieza" }, icon: "wind", tone: "info" },
  gardiennage: { label: { fr: "Gardiennage", en: "Security", ar: "حراسة", es: "Seguridad" }, icon: "shield", tone: "primary" },
  securite: { label: { fr: "Sécurité", en: "Security", ar: "الأمن", es: "Seguridad" }, icon: "shield", tone: "primary" },
  plomberie: { label: { fr: "Plomberie", en: "Plumbing", ar: "سباكة", es: "Fontanería" }, icon: "droplet", tone: "info" },
  electricite: { label: { fr: "Électricité", en: "Electrical", ar: "كهرباء", es: "Electricidad" }, icon: "zap", tone: "warning" },
  jardinage: { label: { fr: "Jardinage", en: "Gardening", ar: "بستنة", es: "Jardinería" }, icon: "feather", tone: "success" },
  peinture: { label: { fr: "Peinture", en: "Painting", ar: "طلاء", es: "Pintura" }, icon: "edit-3", tone: "warning" },
  menuiserie: { label: { fr: "Menuiserie", en: "Carpentry", ar: "نجارة", es: "Carpintería" }, icon: "box", tone: "warning" },
  autre: { label: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" }, icon: "tool", tone: "neutral" },
};

type Contract = { id: string; title: string; monthlyAmount?: string | number | null; endDate?: string | null; status?: string };
type Prestataire = {
  id: string;
  name: string;
  type: string;
  contactName?: string;
  phone?: string;
  email?: string;
  status: string;
  rating?: number | string | null;
  activeContracts: number;
  openWorkOrders: number;
  expiringContracts: number;
  contracts: Contract[];
};

const bare = (label: string) => label.replace(/\s*\*\s*$/, "");

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
  const { lang, isRTL } = useLanguage();
  const { money, date } = useFormat();
  const { showToast } = useToast();
  const L = (["fr", "en", "ar", "es"].includes(lang) ? lang : "fr") as Lang;
  // The API's requireAdmin guard permits only syndicate_admin for syndicate-scoped
  // provider mutations. Other management roles can still consult the list.
  const isAdmin = user?.role === "syndicate_admin";
  const { isWide } = useBreakpoints();

  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: "", type: "autre", contactName: "", phone: "", email: "", notes: "" });
  const [documentUrl, setDocumentUrl] = useState("");

  const resetForm = () => {
    setForm({ name: "", type: "autre", contactName: "", phone: "", email: "", notes: "" });
    setDocumentUrl("");
  };

  const handlePickJustification = async () => {
    try {
      setUploading(true);
      const result = await pickAndUploadInvoice();
      if (result) setDocumentUrl(result.objectPath);
    } catch {
      showToast({ type: "error", title: STRINGS.uploadErrorTitle[L], message: STRINGS.uploadError[L] });
    } finally {
      setUploading(false);
    }
  };

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setLoadError(false);
        }
        const qs = filterType !== "all" ? `?type=${filterType}` : "";
        const data = await apiRequest(`/prestataires${qs}`, "GET", undefined, token);
        setPrestataires(data.data ?? []);
        setLoadError(false);
      } catch {
        if (!silent) setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, filterType],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleCreatePrestataire = async () => {
    if (!form.name.trim() || !form.type.trim()) {
      showToast({ type: "warning", title: STRINGS.requiredTitle[L], message: STRINGS.requiredMessage[L] });
      return;
    }
    if (!documentUrl) {
      Alert.alert(STRINGS.requiredDocumentTitle[L], STRINGS.requiredDocumentMessage[L]);
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
      const name = form.name.trim();
      setShowAdd(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: STRINGS.createdTitle[L], message: `${name} ${STRINGS.createdMessage[L]}` });
      await load(true);
    } catch {
      showToast({ type: "error", title: STRINGS.loadingError[L], message: STRINGS.genericError[L] });
    } finally {
      setSubmitting(false);
    }
  };

  // Monthly cost of the contracts in force only (amounts are decimal strings from the API).
  const activeContractsOf = (p: Prestataire) => p.contracts.filter((c) => c.status === "active");
  const totalMonthly = prestataires.reduce((s, p) => s + activeContractsOf(p).reduce((cs, c) => cs + (Number(c.monthlyAmount) || 0), 0), 0);

  const types = [...new Set([...Object.keys(TYPE_CONFIG), ...prestataires.map((p) => p.type)])];
  const FILTERS = [{ key: "all", label: STRINGS.all[L] }, ...types.map((k) => ({ key: k, label: TYPE_CONFIG[k]?.label[L] ?? k }))];

  const openAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAdd(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader
        title={STRINGS.screenTitle[L]}
        subtitle={!loading && !loadError ? `${prestataires.length} ${prestataires.length !== 1 ? STRINGS.providers[L] : STRINGS.provider[L]}` : undefined}
        action={isAdmin ? { icon: "plus", label: STRINGS.addProvider[L], onPress: openAdd } : undefined}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ flexGrow: 0 }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} icon={f.key !== "all" ? TYPE_CONFIG[f.key]?.icon : undefined} selected={filterType === f.key} onPress={() => setFilterType(f.key)} />
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ padding: 16, gap: 12 }} accessibilityLabel={STRINGS.loadingTitle[L]}>
          <Skeleton height={88} radius={RADIUS.LG} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={150} radius={RADIUS.LG} />
          ))}
        </View>
      ) : loadError ? (
        <ErrorState title={STRINGS.loadingError[L]} description={STRINGS.errorDescription[L]} retryLabel={STRINGS.retry[L]} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, flexGrow: 1, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {prestataires.length > 0 ? (
            <Card padding="md" style={{ gap: 12 }}>
              <View>
                <Text style={[TYPE.caption, { color: colors.textMuted }]}>{STRINGS.monthlyActive[L]}</Text>
                <Text style={[TYPE.headline, { color: colors.foreground }]}>{money(totalMonthly)}</Text>
              </View>
              <View style={styles.stats}>
                {[
                  { label: STRINGS.activeContracts[L], value: prestataires.reduce((s, p) => s + p.activeContracts, 0), tone: "success" as StatusTone },
                  { label: STRINGS.expiringSoon[L], value: prestataires.reduce((s, p) => s + p.expiringContracts, 0), tone: "warning" as StatusTone },
                  { label: STRINGS.openWorks[L], value: prestataires.reduce((s, p) => s + p.openWorkOrders, 0), tone: "info" as StatusTone },
                ].map((s) => (
                  <View key={s.label} style={[styles.stat, { backgroundColor: toneColors(colors, s.tone).bg }]}>
                    <Text style={[TYPE.subtitle, { color: toneColors(colors, s.tone).text }]}>{s.value}</Text>
                    <Text style={[TYPE.caption, { color: toneColors(colors, s.tone).text, textAlign: "center" }]} numberOfLines={2}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {prestataires.length === 0 ? (
            <EmptyState
              icon="briefcase"
              title={STRINGS.noProviders[L]}
              description={STRINGS.emptyDescription[L]}
              actionLabel={isAdmin ? STRINGS.addProvider[L] : undefined}
              onAction={isAdmin ? openAdd : undefined}
            />
          ) : (
            prestataires.map((p) => {
              const tc = TYPE_CONFIG[p.type] ?? TYPE_CONFIG.autre;
              const tone = toneColors(colors, tc.tone);
              const hasExpiring = p.expiringContracts > 0;
              const current = activeContractsOf(p)[0];
              const rating = Number(p.rating);
              return (
                <Card key={p.id} padding="none" onPress={() => router.push(`/prestataire-detail?id=${p.id}` as any)} accessibilityLabel={p.name}>
                  <View style={styles.cardTop}>
                    <View style={[styles.typeIcon, { backgroundColor: tone.bg }]}>
                      <Feather name={tc.icon} size={20} color={tone.fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "auto" }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]}>
                        {TYPE_CONFIG[p.type]?.label[L] ?? p.type}
                        {rating > 0 ? ` · ★ ${rating.toFixed(1)}` : ""}
                      </Text>
                    </View>
                    <StatusBadge label={p.status === "active" ? STRINGS.activeLabel[L] : STRINGS.suspended[L]} tone={p.status === "active" ? "success" : "danger"} icon={null} />
                  </View>

                  <View style={[styles.section, { borderTopColor: colors.border }]}>
                    <View style={styles.metaRow}>
                      <Feather name="file-text" size={13} color={colors.textMuted} />
                      <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
                        {p.activeContracts} {p.activeContracts !== 1 ? STRINGS.contractsPlural[L] : STRINGS.contracts[L]}
                      </Text>
                      <Feather name="tool" size={13} color={colors.textMuted} />
                      <Text style={[TYPE.caption, { color: colors.textSecondary }]}>
                        {p.openWorkOrders} {STRINGS.openWorksCount[L]}
                      </Text>
                      {hasExpiring ? <StatusBadge label={STRINGS.expiringContract[L]} tone="warning" icon="alert-triangle" /> : null}
                    </View>
                    {current ? (
                      <View style={styles.contractRow}>
                        <Text style={[TYPE.caption, { color: colors.textMuted, flex: 1, textAlign: "auto" }]} numberOfLines={1}>
                          {current.title}
                          {current.endDate ? ` · ${STRINGS.endDate[L]} ${date(current.endDate)}` : ""}
                        </Text>
                        {current.monthlyAmount ? (
                          <Text style={[TYPE.label, { color: colors.foreground }]}>
                            {money(current.monthlyAmount)} / {STRINGS.perMonthShort[L]}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>

                  {p.contactName || p.phone ? (
                    <View style={[styles.section, styles.metaRow, { borderTopColor: colors.border }]}>
                      {p.contactName ? (
                        <Text style={[TYPE.secondary, { color: colors.foreground, flex: 1, textAlign: "auto" }]} numberOfLines={1}>
                          {p.contactName}
                        </Text>
                      ) : (
                        <View style={{ flex: 1 }} />
                      )}
                      {p.phone ? <Button label={STRINGS.call[L]} icon="phone" size="sm" variant="ghost" accessibilityLabel={`${STRINGS.call[L]} ${p.phone}`} onPress={() => Linking.openURL(`tel:${p.phone}`)} /> : null}
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add a provider */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={STRINGS.newProvider[L]} onClose={() => { setShowAdd(false); resetForm(); }} />
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TextField label={bare(STRINGS.name[L])} required placeholder={STRINGS.namePlaceholder[L]} value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>
                {bare(STRINGS.type[L])} <Text style={{ color: colors.danger }}>*</Text>
              </Text>
              <View style={styles.chips}>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <Chip key={k} label={v.label[L]} icon={v.icon} selected={form.type === k} onPress={() => setForm((p) => ({ ...p, type: k }))} />
                ))}
              </View>
            </View>
            <TextField label={STRINGS.contact[L]} placeholder={STRINGS.contactPlaceholder[L]} value={form.contactName} onChangeText={(v) => setForm((p) => ({ ...p, contactName: v }))} />
            <TextField label={STRINGS.phone[L]} placeholder="+212 6XX XXX XXX" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))} />
            <TextField label={STRINGS.email[L]} placeholder="contact@exemple.ma" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(v) => setForm((p) => ({ ...p, email: v }))} />
            <TextField label={STRINGS.notes[L]} placeholder={STRINGS.notesPlaceholder[L]} multiline value={form.notes} onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))} />

            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>
                {bare(STRINGS.proofLabel[L])} <Text style={{ color: colors.danger }}>*</Text>
              </Text>
              <Card padding="none">
                <ListItem
                  icon={documentUrl ? "check-circle" : "upload"}
                  iconTone={documentUrl ? "success" : "neutral"}
                  title={documentUrl ? STRINGS.attachmentAdded[L] : STRINGS.attachProof[L]}
                  subtitle={STRINGS.proofHelper[L]}
                  onPress={uploading ? undefined : handlePickJustification}
                  trailing={uploading ? <ActivityIndicator size="small" color={colors.primary} /> : undefined}
                />
              </Card>
            </View>

            <Button label={STRINGS.createProvider[L]} icon="check" size="lg" fullWidth loading={submitting} disabled={!form.name.trim() || !documentUrl || uploading} onPress={handleCreatePrestataire} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", gap: 2, borderRadius: RADIUS.MD, paddingVertical: 10, paddingHorizontal: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  typeIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  section: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  contractRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
