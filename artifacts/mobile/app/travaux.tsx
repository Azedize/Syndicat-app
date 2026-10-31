import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { pickAndUploadInvoice, pickAndUploadPdf, pickAndUploadPhoto } from "@/lib/upload";
import { prestataires as prestatairesApi, travaux as travauxApi, type ApiPrestataire } from "@/services/api";
import RoleGuard from "@/components/RoleGuard";
import EmptyState from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { Button, Card, Chip, ListItem, SheetHeader, Skeleton, StatusBadge, TextField, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";

const STRINGS = {
  screenTitle: {
    fr: "Travaux & Interventions",
    en: "Works & Interventions",
    ar: "الأشغال والتدخلات",
    es: "Obras e Intervenciones"
  },
  workOrder: {
    fr: "bon",
    en: "order",
    ar: "طلب",
    es: "orden"
  },
  workOrders: {
    fr: "bons",
    en: "orders",
    ar: "طلبات",
    es: "órdenes"
  },
  ofWorks: {
    fr: "de travaux",
    en: "of works",
    ar: "أشغال",
    es: "de obras"
  },
  total: {
    fr: "Total",
    en: "Total",
    ar: "المجموع",
    es: "Total"
  },
  priority: {
    fr: "Prioritaires",
    en: "Priority",
    ar: "أولوية",
    es: "Prioridad"
  },
  inProgress: {
    fr: "En cours",
    en: "In progress",
    ar: "قيد التنفيذ",
    es: "En curso"
  },
  completed: {
    fr: "Terminés",
    en: "Completed",
    ar: "مكتمل",
    es: "Completado"
  },
  filterAll: {
    fr: "Tous",
    en: "All",
    ar: "الكل",
    es: "Todos"
  },
  filterReported: {
    fr: "Signalés",
    en: "Reported",
    ar: "مبلغ عنه",
    es: "Reportado"
  },
  emptyList: {
    fr: "Aucun bon de travaux",
    en: "No work orders",
    ar: "لا توجد طلبات أشغال",
    es: "No hay órdenes de trabajo"
  },
  notAssigned: {
    fr: "Non assigné",
    en: "Not assigned",
    ar: "غير معين",
    es: "No asignado"
  },
  lot: {
    fr: "Lot",
    en: "Lot",
    ar: "وحدة",
    es: "Lote"
  },
  newWorkOrder: {
    fr: "Nouveau Bon de Travaux",
    en: "New Work Order",
    ar: "طلب أشغال جديد",
    es: "Nueva Orden de Trabajo"
  },
  titleLabel: {
    fr: "Titre *",
    en: "Title *",
    ar: "العنوان *",
    es: "Título *"
  },
  titlePlaceholder: {
    fr: "Ex: Fuite toiture terrasse",
    en: "Ex: Roof terrace leak",
    ar: "مثال: تسرب في سقف الشرفة",
    es: "Ej: Gotera en azotea"
  },
  descriptionLabel: {
    fr: "Description",
    en: "Description",
    ar: "الوصف",
    es: "Descripción"
  },
  descriptionPlaceholder: {
    fr: "Décrivez le problème en détail...",
    en: "Describe the problem in detail...",
    ar: "صف المشكلة بالتفصيل...",
    es: "Describa el problema en detalle..."
  },
  typeLabel: {
    fr: "Type de travaux",
    en: "Type of works",
    ar: "نوع الأشغال",
    es: "Tipo de obra"
  },
  priorityLabel: {
    fr: "Priorité",
    en: "Priority",
    ar: "الأولوية",
    es: "Prioridad"
  },
  submitBtn: {
    fr: "Créer le bon de travaux",
    en: "Create work order",
    ar: "إنشاء طلب الأشغال",
    es: "Crear orden de trabajo"
  },
  errorTitle: {
    fr: "Erreur",
    en: "Error",
    ar: "خطأ",
    es: "Error"
  },
  titleRequired: {
    fr: "Le titre est obligatoire",
    en: "Title is required",
    ar: "العنوان مطلوب",
    es: "El título es obligatorio"
  },
  createError: {
    fr: "Impossible de créer le bon de travaux",
    en: "Failed to create work order",
    ar: "فشل في إنشاء طلب الأشغال",
    es: "No se pudo crear la orden de trabajo"
  },
  priorityUrgent: { fr: "URGENT", en: "URGENT", ar: "عاجل", es: "URGENTE" },
  priorityHigh: { fr: "Élevée", en: "High", ar: "عالية", es: "Alta" },
  priorityNormal: { fr: "Normale", en: "Normal", ar: "عادية", es: "Normal" },
  priorityLow: { fr: "Faible", en: "Low", ar: "منخفضة", es: "Baja" },
  statusReported: { fr: "Signalé", en: "Reported", ar: "مبلغ عنه", es: "Reportado" },
  statusAssigned: { fr: "Assigné", en: "Assigned", ar: "معين", es: "Asignado" },
  statusInProgress: { fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  statusCompleted: { fr: "Terminé", en: "Completed", ar: "مكتمل", es: "Completado" },
  statusCancelled: { fr: "Annulé", en: "Cancelled", ar: "ملغى", es: "Cancelado" },
  statusPendingValidation: { fr: "À valider", en: "Pending validation", ar: "بانتظار التصديق", es: "Pendiente de validación" },
  assignAction: { fr: "Assigner un prestataire", en: "Assign a provider", ar: "تعيين مزود", es: "Asignar proveedor" },
  reportAction: { fr: "Soumettre le rapport", en: "Submit report", ar: "إرسال التقرير", es: "Enviar informe" },
  validateAction: { fr: "Valider l'intervention", en: "Validate the work", ar: "المصادقة على التدخل", es: "Validar la intervención" },
  prestataireIdLabel: { fr: "ID Prestataire *", en: "Provider ID *", ar: "معرف المزود *", es: "ID del proveedor *" },
  reportPdf: { fr: "Rapport d'intervention (PDF)", en: "Intervention report (PDF)", ar: "تقرير التدخل (PDF)", es: "Informe de intervención (PDF)" },
  photoProof: { fr: "Photo de preuve", en: "Proof photo", ar: "صورة إثبات", es: "Foto de prueba" },
  invoiceDoc: { fr: "Facture", en: "Invoice", ar: "الفاتورة", es: "Factura" },
  invoiceAmountLabel: { fr: "Montant de la facture (MAD)", en: "Invoice amount (MAD)", ar: "مبلغ الفاتورة", es: "Monto de la factura" },
  providerIdPlaceholder: { fr: "ID du prestataire", en: "Provider ID", ar: "معرف المزود", es: "ID del proveedor" },
  invoiceAmountPlaceholder: { fr: "0,00", en: "0.00", ar: "0.00", es: "0,00" },
  uploadReportError: { fr: "Échec du téléversement du rapport.", en: "Failed to upload the report.", ar: "فشل تحميل التقرير.", es: "No se pudo cargar el informe." },
  uploadPhotoError: { fr: "Échec du téléversement de la photo.", en: "Failed to upload the photo.", ar: "فشل تحميل الصورة.", es: "No se pudo cargar la foto." },
  uploadInvoiceError: { fr: "Échec du téléversement de la facture.", en: "Failed to upload the invoice.", ar: "فشل تحميل الفاتورة.", es: "No se pudo cargar la factura." },
  reportSubmitted: { fr: "Rapport soumis", en: "Report submitted", ar: "تم إرسال التقرير", es: "Informe enviado" },
  reportSubmittedMsg: { fr: "Le rapport d'intervention a été envoyé.", en: "The intervention report has been submitted.", ar: "تم إرسال تقرير التدخل.", es: "El informe de intervención ha sido enviado." },
  assignmentError: { fr: "Erreur lors de l'assignation.", en: "Error assigning the provider.", ar: "حدث خطأ أثناء تعيين المزود.", es: "Error al asignar el proveedor." },
  submissionError: { fr: "Erreur lors de la soumission.", en: "Error submitting the report.", ar: "حدث خطأ أثناء إرسال التقرير.", es: "Error al enviar el informe." },
  loadingError: { fr: "Erreur de chargement", en: "Loading error", ar: "خطأ في التحميل", es: "Error de carga" },
  loadingWorksError: { fr: "Impossible de charger les travaux.", en: "Unable to load works.", ar: "تعذر تحميل الأشغال.", es: "No se pueden cargar las obras." },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  confirm: { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
  worksValidated: { fr: "Travaux validés", en: "Works validated", ar: "تم اعتماد الأشغال", es: "Obras validadas" },
  worksValidatedMsg: { fr: "Intervention validée. La dépense est transmise au trésorier pour paiement.", en: "Work validated. The expense has been sent to the treasurer for payment.", ar: "تمت المصادقة على التدخل. أُحيلت النفقة إلى أمين المال للأداء.", es: "Intervención validada. El gasto se ha enviado al tesorero para su pago." },
  validationError: { fr: "Erreur lors de la validation.", en: "Error validating the intervention.", ar: "حدث خطأ أثناء اعتماد التدخل.", es: "Error al validar la intervención." },
  worksCreated: { fr: "Travaux créés", en: "Works created", ar: "تم إنشاء الأشغال", es: "Obras creadas" },
  worksCreatedMsg: { fr: "La demande d'intervention a été enregistrée.", en: "The intervention request has been saved.", ar: "تم تسجيل طلب التدخل.", es: "La solicitud de intervención ha sido registrada." },
  loadingTitle: { fr: "Chargement des travaux", en: "Loading works", ar: "جارٍ تحميل الأشغال", es: "Cargando obras" },
  loadingDescription: { fr: "Nous récupérons les interventions de votre résidence.", en: "We are retrieving interventions for your residence.", ar: "نحن نسترجع تدخلات إقامتك.", es: "Estamos recuperando las intervenciones de su residencia." },
  errorDescription: { fr: "Les interventions ne sont pas disponibles pour le moment. Vérifiez votre connexion puis réessayez.", en: "Interventions are unavailable right now. Check your connection and try again.", ar: "التدخلات غير متاحة حالياً. تحقق من الاتصال ثم أعد المحاولة.", es: "Las intervenciones no están disponibles ahora. Compruebe su conexión e inténtelo de nuevo." },
  emptyTitle: { fr: "Aucune intervention à afficher", en: "No interventions to show", ar: "لا توجد تدخلات لعرضها", es: "No hay intervenciones que mostrar" },
  emptyDescription: { fr: "Créez un bon de travaux pour suivre une réparation ou une maintenance.", en: "Create a work order to track a repair or maintenance task.", ar: "أنشئ طلب أشغال لتتبع إصلاح أو مهمة صيانة.", es: "Cree una orden de trabajo para seguir una reparación o tarea de mantenimiento." },
  createAction: { fr: "Créer un bon de travaux", en: "Create a work order", ar: "إنشاء طلب أشغال", es: "Crear una orden de trabajo" },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  missingDocs: { fr: "Rapport, photo et facture sont obligatoires", en: "Report, photo and invoice are required", ar: "التقرير والصورة والفاتورة مطلوبة", es: "Informe, foto y factura son obligatorios" },
  validateConfirm: { fr: "Confirmer la validation ? Une dépense approuvée sera créée ; le trésorier la paiera depuis « Dépenses ».", en: "Confirm validation? An approved expense will be created; the treasurer pays it from \"Expenses\".", ar: "تأكيد المصادقة؟ ستُنشأ نفقة مصادق عليها يؤديها أمين المال من «النفقات».", es: "¿Confirmar la validación? Se creará un gasto aprobado; el tesorero lo pagará desde «Gastos»." },
  typeEntretien: { fr: "Entretien courant", en: "Routine maintenance", ar: "صيانة دورية", es: "Mantenimiento rutinario" },
  typeReparation: { fr: "Réparation", en: "Repair", ar: "إصلاح", es: "Reparación" },
  typeAmelioration: { fr: "Amélioration", en: "Improvement", ar: "تحسين", es: "Mejora" },
  typeGrosTravaux: { fr: "Gros travaux", en: "Major works", ar: "أشغال كبرى", es: "Obras mayores" },
  typeUrgence: { fr: "Urgence", en: "Emergency", ar: "طوارئ", es: "Emergencia" },
  buildingLabel: { fr: "Immeuble *", en: "Building *", ar: "العمارة *", es: "Edificio *" },
  noBuilding: { fr: "Aucun immeuble n'est rattaché à votre compte.", en: "No building is linked to your account.", ar: "لا توجد عمارة مرتبطة بحسابك.", es: "No hay ningún edificio vinculado a su cuenta." },
  providerLabel: { fr: "Prestataire *", en: "Provider *", ar: "مقدم الخدمة *", es: "Proveedor *" },
  noProvider: { fr: "Aucun prestataire actif. Ajoutez-en un dans « Prestataires ».", en: "No active provider. Add one in \"Providers\".", ar: "لا يوجد مقدم خدمة نشط. أضف واحداً في «مقدمو الخدمات».", es: "Ningún proveedor activo. Añada uno en «Proveedores»." },
  providersLoading: { fr: "Chargement des prestataires…", en: "Loading providers…", ar: "جارٍ تحميل مقدمي الخدمات…", es: "Cargando proveedores…" },
  estimatedLabel: { fr: "Montant estimé (MAD)", en: "Estimated amount (MAD)", ar: "المبلغ التقديري (درهم)", es: "Importe estimado (MAD)" },
  amountInvalid: { fr: "Montant invalide", en: "Invalid amount", ar: "مبلغ غير صالح", es: "Importe no válido" },
  attached: { fr: "Joint", en: "Attached", ar: "مرفق", es: "Adjunto" },
  toAttach: { fr: "À joindre", en: "To attach", ar: "للإرفاق", es: "Por adjuntar" },
  reportDocsHint: { fr: "Les trois pièces sont exigées avant la validation.", en: "All three documents are required before validation.", ar: "الوثائق الثلاث مطلوبة قبل المصادقة.", es: "Los tres documentos son obligatorios antes de la validación." },
  myRequests: { fr: "Mes demandes d'intervention", en: "My intervention requests", ar: "طلبات التدخل الخاصة بي", es: "Mis solicitudes de intervención" },
  requestAction: { fr: "Demander une intervention", en: "Request an intervention", ar: "طلب تدخل", es: "Solicitar una intervención" },
  awaitingSyndic: { fr: "Traitée par le syndic", en: "Handled by the property manager", ar: "يعالجه وكيل الاتحاد", es: "Gestionada por el administrador" },
};


type FeatherName = keyof typeof Feather.glyphMap;

const PRIORITY_CONFIG: Record<string, { tone: StatusTone; icon: FeatherName; stringKey: keyof typeof STRINGS }> = {
  urgent: { tone: "danger", icon: "alert-circle", stringKey: "priorityUrgent" },
  high: { tone: "warning", icon: "alert-triangle", stringKey: "priorityHigh" },
  normal: { tone: "info", icon: "info", stringKey: "priorityNormal" },
  low: { tone: "neutral", icon: "minus-circle", stringKey: "priorityLow" },
};

const STATUS_CONFIG: Record<string, { tone: StatusTone; icon: FeatherName; stringKey: keyof typeof STRINGS }> = {
  reported: { tone: "warning", icon: "flag", stringKey: "statusReported" },
  assigned: { tone: "info", icon: "user-check", stringKey: "statusAssigned" },
  in_progress: { tone: "primary", icon: "loader", stringKey: "statusInProgress" },
  pending_validation: { tone: "warning", icon: "clock", stringKey: "statusPendingValidation" },
  completed: { tone: "success", icon: "check-circle", stringKey: "statusCompleted" },
  cancelled: { tone: "neutral", icon: "slash", stringKey: "statusCancelled" },
};

const TYPE_CONFIG: Record<string, keyof typeof STRINGS> = {
  entretien: "typeEntretien",
  reparation: "typeReparation",
  amelioration: "typeAmelioration",
  gros_travaux: "typeGrosTravaux",
  urgence: "typeUrgence",
};

type Travail = {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  priority: string;
  buildingId: string;
  reportedByName?: string;
  estimatedAmount?: number | string | null;
  actualAmount?: number | string | null;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  prestataire?: { id: string; name: string; phone: string; type: string } | null;
  lot?: { id: string; number: string; floor: number; type: string } | null;
};

type Building = { id: string; name: string };
const emptyForm = () => ({ title: "", description: "", type: "entretien", priority: "normal", buildingId: "", estimatedAmount: "" });
const parseAmount = (v: string) => Number(v.replace(/\s/g, "").replace(",", "."));

// The API scopes the list: the syndicate team sees the syndicate's work
// orders, residents only the requests they reported.
export default function TravauxScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"]}>
      <TravauxScreenInner />
    </RoleGuard>
  );
}

function TravauxScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { lang, isRTL } = useLanguage();
  const { money, date } = useFormat();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const S = (k: keyof typeof STRINGS) => STRINGS[k][lang as "fr"] ?? STRINGS[k].fr;
  const isResident = user?.role === "member" || user?.role === "tenant";
  // Same roles as the API (assign / report / validate are requireAdmin).
  const canRunWorkflow = user?.role === "syndicate_admin" || user?.role === "super_admin";

  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [myLot, setMyLot] = useState<{ id: string; buildingId: string } | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Workflow action sheet (assign / report)
  const [actionTravail, setActionTravail] = useState<Travail | null>(null);
  const [providers, setProviders] = useState<ApiPrestataire[] | null>(null);
  const [assignPrestataireId, setAssignPrestataireId] = useState("");
  const [reportUrl, setReportUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [uploading, setUploading] = useState<"" | "report" | "photo" | "invoice">("");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setLoadError(false);
        }
        const qs = filter !== "all" ? `?status=${filter}` : "";
        const data = await apiRequest(`/travaux${qs}`, "GET", undefined, token);
        setTravaux(data.data ?? []);
        setLoadError(false);
      } catch {
        if (!silent) setLoadError(true);
        else showToast({ type: "error", title: S("loadingError"), message: S("errorDescription") });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, filter, lang],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiRequest("/buildings", "GET", undefined, token)
      .then((r) => setBuildings((r?.data ?? []).map((b: any) => ({ id: b.id, name: b.name }))))
      .catch(() => setBuildings([]));
    if (isResident) {
      apiRequest("/lots/my-lot", "GET", undefined, token)
        .then((r) => (r?.data?.id ? setMyLot({ id: r.data.id, buildingId: r.data.buildingId }) : null))
        .catch(() => setMyLot(null));
    }
  }, [token, isResident]);

  const openForm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm({ ...emptyForm(), buildingId: myLot?.buildingId ?? (buildings.length === 1 ? buildings[0].id : "") });
    setShowModal(true);
  };

  const closeActionModal = () => {
    setActionTravail(null);
    setAssignPrestataireId("");
    setReportUrl("");
    setPhotoUrl("");
    setInvoiceUrl("");
    setInvoiceAmount("");
  };

  const openAction = (tr: Travail) => {
    setActionTravail(tr);
    if (tr.status === "reported" && providers === null) {
      prestatairesApi
        .list({ status: "active" })
        .then((r) => setProviders(r.data ?? []))
        .catch(() => setProviders([]));
    }
  };

  const handleAssign = async () => {
    if (!actionTravail || !assignPrestataireId) return;
    try {
      setActionBusy(true);
      await travauxApi.assign(actionTravail.id, assignPrestataireId);
      closeActionModal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      load(true);
    } catch {
      showToast({ type: "error", title: S("errorTitle"), message: S("assignmentError") });
    } finally {
      setActionBusy(false);
    }
  };

  // A cancelled picker returns undefined (no message); a failed upload throws.
  const pick = async (kind: "report" | "photo" | "invoice") => {
    const run = kind === "report" ? pickAndUploadPdf : kind === "photo" ? pickAndUploadPhoto : pickAndUploadInvoice;
    const set = kind === "report" ? setReportUrl : kind === "photo" ? setPhotoUrl : setInvoiceUrl;
    const err = kind === "report" ? "uploadReportError" : kind === "photo" ? "uploadPhotoError" : "uploadInvoiceError";
    try {
      setUploading(kind);
      const r = await run();
      if (r) set(r.objectPath);
    } catch {
      showToast({ type: "error", title: S("errorTitle"), message: S(err) });
    } finally {
      setUploading("");
    }
  };

  const invoiceAmountValid = !invoiceAmount || (Number.isFinite(parseAmount(invoiceAmount)) && parseAmount(invoiceAmount) > 0);

  const handleSubmitReport = async () => {
    if (!actionTravail || !reportUrl || !photoUrl || !invoiceUrl) {
      showToast({ type: "warning", title: S("errorTitle"), message: S("missingDocs") });
      return;
    }
    try {
      setActionBusy(true);
      await travauxApi.submitReport(actionTravail.id, {
        reportUrl,
        photoUrls: [photoUrl],
        invoiceUrl,
        invoiceAmount: invoiceAmount ? parseAmount(invoiceAmount) : undefined,
      });
      closeActionModal();
      showToast({ type: "success", title: S("reportSubmitted"), message: S("reportSubmittedMsg") });
      load(true);
    } catch {
      showToast({ type: "error", title: S("errorTitle"), message: S("submissionError") });
    } finally {
      setActionBusy(false);
    }
  };

  const handleValidate = (tr: Travail) => {
    Alert.alert(S("validateAction"), S("validateConfirm"), [
      { text: S("cancel"), style: "cancel" },
      {
        text: S("confirm"),
        onPress: async () => {
          try {
            await travauxApi.validate(tr.id);
            showToast({ type: "success", title: S("worksValidated"), message: S("worksValidatedMsg") });
            load(true);
          } catch (e: any) {
            // e.g. report / photos / invoice missing, already validated
            showToast({ type: "error", title: S("errorTitle"), message: e?.message || S("validationError") });
          }
        },
      },
    ]);
  };

  const estimatedValid = !form.estimatedAmount || (Number.isFinite(parseAmount(form.estimatedAmount)) && parseAmount(form.estimatedAmount) > 0);

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      showToast({ type: "warning", title: S("errorTitle"), message: S("titleRequired") });
      return;
    }
    if (!form.buildingId || !estimatedValid) return;
    try {
      setSubmitting(true);
      await apiRequest(
        "/travaux",
        "POST",
        {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          type: form.type,
          priority: form.priority,
          buildingId: form.buildingId,
          lotId: myLot && myLot.buildingId === form.buildingId ? myLot.id : undefined,
          estimatedAmount: form.estimatedAmount ? parseAmount(form.estimatedAmount) : undefined,
        },
        token,
      );
      setShowModal(false);
      setForm(emptyForm());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: S("worksCreated"), message: S("worksCreatedMsg") });
      load(true);
    } catch {
      showToast({ type: "error", title: S("errorTitle"), message: S("createError") });
    } finally {
      setSubmitting(false);
    }
  };

  const stats = {
    total: travaux.length,
    urgent: travaux.filter((x) => x.priority === "urgent" || x.priority === "high").length,
    inProgress: travaux.filter((x) => x.status === "in_progress" || x.status === "assigned").length,
    done: travaux.filter((x) => x.status === "completed").length,
  };

  const FILTERS = [
    { key: "all", label: S("filterAll") },
    { key: "reported", label: S("filterReported") },
    { key: "in_progress", label: S("inProgress") },
    { key: "pending_validation", label: S("statusPendingValidation") },
    { key: "completed", label: S("completed") },
  ];

  const docRow = (kind: "report" | "photo" | "invoice", icon: FeatherName, label: string, done: boolean, last = false) => (
    <ListItem
      icon={icon}
      iconTone={done ? "success" : "neutral"}
      title={label}
      subtitle={done ? S("attached") : S("toAttach")}
      onPress={() => pick(kind)}
      divider={!last}
      trailing={uploading === kind ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name={done ? "check-circle" : "upload"} size={18} color={done ? colors.success : colors.textMuted} />}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader
        title={isResident ? S("myRequests") : S("screenTitle")}
        subtitle={!loading ? `${travaux.length} ${travaux.length !== 1 ? S("workOrders") : S("workOrder")} ${S("ofWorks")}` : undefined}
        action={{ icon: "plus", label: isResident ? S("requestAction") : S("newWorkOrder"), onPress: openForm }}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ flexGrow: 0 }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ padding: 16, gap: 12 }} accessibilityLabel={S("loadingTitle")}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={140} radius={RADIUS.LG} />
          ))}
        </View>
      ) : loadError ? (
        <ErrorState title={S("loadingError")} description={S("errorDescription")} retryLabel={S("retry")} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, flexGrow: 1, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {travaux.length > 0 && !isResident ? (
            <Card padding="md">
              <View style={styles.stats}>
                {[
                  { label: S("total"), value: stats.total, tone: "neutral" as StatusTone },
                  { label: S("priority"), value: stats.urgent, tone: "danger" as StatusTone },
                  { label: S("inProgress"), value: stats.inProgress, tone: "primary" as StatusTone },
                  { label: S("completed"), value: stats.done, tone: "success" as StatusTone },
                ].map((s) => (
                  <View key={s.label} style={styles.stat}>
                    <Text style={[TYPE.headline, { color: toneColors(colors, s.tone).text }]}>{s.value}</Text>
                    <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "center" }]} numberOfLines={1}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {travaux.length === 0 ? (
            <EmptyState icon="tool" title={S("emptyTitle")} description={S("emptyDescription")} actionLabel={isResident ? S("requestAction") : S("createAction")} onAction={openForm} />
          ) : (
            travaux.map((tr) => {
              const pri = PRIORITY_CONFIG[tr.priority] ?? PRIORITY_CONFIG.normal;
              const sta = STATUS_CONFIG[tr.status] ?? STATUS_CONFIG.reported;
              const priTone = toneColors(colors, pri.tone);
              const meta = [S(TYPE_CONFIG[tr.type] || "typeReparation"), tr.lot ? `${S("lot")} ${tr.lot.number}` : null, date(tr.createdAt)].filter(Boolean).join(" · ");
              const open = tr.status !== "completed" && tr.status !== "cancelled";
              return (
                <Card key={tr.id} padding="none">
                  <View style={[styles.accent, { backgroundColor: priTone.fg }]} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "auto" }]} numberOfLines={2}>
                          {tr.title}
                        </Text>
                        <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]} numberOfLines={1}>
                          {meta}
                        </Text>
                      </View>
                      <StatusBadge label={S(sta.stringKey)} tone={sta.tone} icon={sta.icon} />
                    </View>

                    {tr.description ? (
                      <Text style={[TYPE.secondary, { color: colors.textSecondary, textAlign: "auto" }]} numberOfLines={2}>
                        {tr.description}
                      </Text>
                    ) : null}

                    <View style={[styles.footer, { borderTopColor: colors.border }]}>
                      <StatusBadge label={S(pri.stringKey)} tone={pri.tone} icon={pri.icon} />
                      <View style={styles.footerItem}>
                        <Feather name={tr.prestataire ? "briefcase" : "user-x"} size={12} color={tr.prestataire ? colors.textSecondary : colors.warning} />
                        <Text style={[TYPE.caption, { color: tr.prestataire ? colors.textSecondary : colors.warningText }]} numberOfLines={1}>
                          {tr.prestataire ? tr.prestataire.name : S("notAssigned")}
                        </Text>
                      </View>
                      {tr.estimatedAmount ? <Text style={[TYPE.caption, { color: colors.textSecondary }]}>≈ {money(tr.estimatedAmount)}</Text> : null}
                    </View>

                    {open && canRunWorkflow ? (
                      tr.status === "reported" ? (
                        <Button label={S("assignAction")} icon="user-plus" variant="secondary" size="sm" onPress={() => openAction(tr)} />
                      ) : tr.status === "assigned" || tr.status === "in_progress" ? (
                        <Button label={S("reportAction")} icon="upload" variant="secondary" size="sm" onPress={() => openAction(tr)} />
                      ) : tr.status === "pending_validation" ? (
                        <Button label={S("validateAction")} icon="check-circle" size="sm" onPress={() => handleValidate(tr)} />
                      ) : null
                    ) : open && isResident ? (
                      <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]}>{S("awaitingSyndic")}</Text>
                    ) : null}
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Workflow: assign a provider or submit the report */}
      <Modal visible={!!actionTravail} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeActionModal}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={actionTravail?.status === "reported" ? S("assignAction") : S("reportAction")} subtitle={actionTravail?.title} onClose={closeActionModal} />
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            {actionTravail?.status === "reported" ? (
              <>
                <Text style={[TYPE.label, { color: colors.foreground }]}>{S("providerLabel")}</Text>
                {providers === null ? (
                  <View style={styles.inline}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{S("providersLoading")}</Text>
                  </View>
                ) : providers.length === 0 ? (
                  <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{S("noProvider")}</Text>
                ) : (
                  <Card padding="none">
                    {providers.map((p, i) => (
                      <ListItem
                        key={p.id}
                        icon="briefcase"
                        iconTone={assignPrestataireId === p.id ? "primary" : "neutral"}
                        title={p.name}
                        subtitle={[p.type, p.phone].filter(Boolean).join(" · ")}
                        onPress={() => setAssignPrestataireId(p.id)}
                        divider={i < providers.length - 1}
                        trailing={assignPrestataireId === p.id ? <Feather name="check-circle" size={20} color={colors.primary} /> : undefined}
                      />
                    ))}
                  </Card>
                )}
                <Button label={S("assignAction")} icon="user-plus" fullWidth size="lg" loading={actionBusy} disabled={!assignPrestataireId} onPress={handleAssign} />
              </>
            ) : (
              <>
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{S("reportDocsHint")}</Text>
                <Card padding="none">
                  {docRow("report", "file-text", S("reportPdf"), !!reportUrl)}
                  {docRow("photo", "camera", S("photoProof"), !!photoUrl)}
                  {docRow("invoice", "file", S("invoiceDoc"), !!invoiceUrl, true)}
                </Card>
                <TextField
                  label={S("invoiceAmountLabel")}
                  placeholder={S("invoiceAmountPlaceholder")}
                  keyboardType="decimal-pad"
                  value={invoiceAmount}
                  onChangeText={setInvoiceAmount}
                  error={!invoiceAmountValid ? S("amountInvalid") : undefined}
                />
                <Button
                  label={S("reportAction")}
                  icon="send"
                  fullWidth
                  size="lg"
                  loading={actionBusy}
                  disabled={!reportUrl || !photoUrl || !invoiceUrl || !invoiceAmountValid || !!uploading}
                  onPress={handleSubmitReport}
                />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* New work order / intervention request */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={isResident ? S("requestAction") : S("newWorkOrder")} onClose={() => setShowModal(false)} />
          <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{S("buildingLabel")}</Text>
              {buildings.length === 0 ? (
                <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{S("noBuilding")}</Text>
              ) : (
                <View style={styles.chips}>
                  {buildings.map((b) => (
                    <Chip key={b.id} label={b.name} icon="home" selected={form.buildingId === b.id} onPress={() => setForm((p) => ({ ...p, buildingId: b.id }))} />
                  ))}
                </View>
              )}
            </View>

            <TextField label={S("titleLabel").replace(" *", "")} required placeholder={S("titlePlaceholder")} value={form.title} onChangeText={(v) => setForm((p) => ({ ...p, title: v }))} maxLength={200} />
            <TextField label={S("descriptionLabel")} placeholder={S("descriptionPlaceholder")} value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} multiline maxLength={2000} />

            <View style={styles.field}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{S("typeLabel")}</Text>
              <View style={styles.chips}>
                {Object.entries(TYPE_CONFIG).map(([k, key]) => (
                  <Chip key={k} label={S(key)} selected={form.type === k} onPress={() => setForm((p) => ({ ...p, type: k }))} />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{S("priorityLabel")}</Text>
              <View style={styles.chips}>
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <Chip key={k} label={S(v.stringKey)} icon={v.icon} selected={form.priority === k} onPress={() => setForm((p) => ({ ...p, priority: k }))} />
                ))}
              </View>
            </View>

            {!isResident ? (
              <TextField
                label={S("estimatedLabel")}
                placeholder={S("invoiceAmountPlaceholder")}
                keyboardType="decimal-pad"
                value={form.estimatedAmount}
                onChangeText={(v) => setForm((p) => ({ ...p, estimatedAmount: v }))}
                error={!estimatedValid ? S("amountInvalid") : undefined}
              />
            ) : null}

            <Button
              label={isResident ? S("requestAction") : S("submitBtn")}
              icon="send"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={!form.title.trim() || !form.buildingId || !estimatedValid}
              onPress={handleSubmit}
            />
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
  stat: { flex: 1, alignItems: "center", gap: 2 },
  accent: { position: "absolute", top: 0, bottom: 0, start: 0, width: 4 },
  cardBody: { padding: 14, paddingStart: 18, gap: 10 },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  footer: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  field: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
