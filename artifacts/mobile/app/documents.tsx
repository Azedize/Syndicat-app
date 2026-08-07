import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { getToken } from "@/services/api";
import React, { useRef, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActivity } from "@/context/ActivityContext";
import { useAuth } from "@/context/AuthContext";
import { useData, type Document } from "@/context/DataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useToast } from "@/context/ToastContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage, type LangCode } from "@/context/LanguageContext";
import FilterChips from "@/components/FilterChips";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";
import DocumentWizard from "@/components/DocumentWizard";
import MemberDocumentRequest from "@/components/MemberDocumentRequest";
import TemplateRequestModal from "@/components/TemplateRequestModal";
import SignatureOrderPanel from "@/components/SignatureOrderPanel";
import DocumentBundleModal, { type BundleType } from "@/components/DocumentBundleModal";
import EmptyState from "@/components/EmptyState";
import { ErrorState, LoadingState } from "@/components/DataState";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATS = [
  { key: "all",         labelKey: "documentCategoryAll" },
  { key: "pv",          labelKey: "documentCategoryPv" },
  { key: "juridique",   labelKey: "documentCategoryLegal" },
  { key: "finances",    labelKey: "documentCategoryFinance" },
  { key: "attestation", labelKey: "documentCategoryCertificate" },
];

const CAT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  pv:          "clipboard",
  juridique:   "shield",
  finances:    "dollar-sign",
  attestation: "award",
};

const CAT_COLORS: Record<string, string> = {
  pv:          "#10b981",
  juridique:   "#ef4444",
  finances:    "#f59e0b",
  attestation: "#8b5cf6",
};

// ── V1 — 12 essential production templates ────────────────────────────────────
const DOC_TEMPLATES = [
  { id: "t1",  name: "Attestation d'adhésion",         icon: "award"        as const, color: "#8b5cf6", desc: "Certifie l'appartenance d'un membre au syndicat",           category: "attestation" as const, templateId: "attestation"            },
  { id: "t2",  name: "Attestation de résidence",        icon: "home"         as const, color: "#0891b2", desc: "Certifie la résidence d'un copropriétaire dans l'immeuble", category: "attestation" as const, templateId: "attestation_residence"  },
  { id: "t3",  name: "Attestation de propriété",        icon: "key"          as const, color: "#2563EB", desc: "Certifie la propriété d'un lot de copropriété",             category: "attestation" as const, templateId: "attestation_propriete"  },
  { id: "t4",  name: "Attestation de paiement",         icon: "check-circle" as const, color: "#16a34a", desc: "Certifie le paiement des charges pour la période indiquée", category: "attestation" as const, templateId: "attestation_paiement"   },
  { id: "t5",  name: "Convocation officielle",          icon: "calendar"     as const, color: "#3b82f6", desc: "Convocation officielle à une réunion",                      category: "pv"          as const, templateId: "convocation"            },
  { id: "t6",  name: "Procès-verbal de réunion",        icon: "clipboard"    as const, color: "#10b981", desc: "Procès-verbal officiel enregistrant les délibérations",     category: "pv"          as const, templateId: "pv"                     },
  { id: "t7",  name: "Décision syndicale",              icon: "check-circle" as const, color: "#16a34a", desc: "Décision officielle prise par le bureau syndical",           category: "pv"          as const, templateId: "decision"               },
  { id: "t8",  name: "Rapport financier",               icon: "dollar-sign"  as const, color: "#f59e0b", desc: "Bilan financier de la période avec prévisions et réalisations", category: "finances" as const, templateId: "rapport_financier"      },
  { id: "t9",  name: "Appel de fonds",                  icon: "file-text"    as const, color: "#06b6d4", desc: "Appel de charges communes avec données copropriétaire auto",  category: "finances" as const, templateId: "appel_de_fonds"          },
  { id: "t10", name: "Facture",                         icon: "file-minus"   as const, color: "#dc2626", desc: "Facture officielle avec lignes et montants automatiques",      category: "finances" as const, templateId: "facture"                  },
  { id: "t11", name: "Contrat",                         icon: "file-text"    as const, color: "#0891b2", desc: "Contrat formel entre le syndicat et un tiers",               category: "juridique" as const, templateId: "contrat"                 },
  { id: "t12", name: "Mise en demeure",                 icon: "alert-circle" as const, color: "#ef4444", desc: "Document légal de mise en demeure officielle",               category: "juridique" as const, templateId: "mise_en_demeure"         },
];

// ─── Document-detail i18n strings ────────────────────────────────────────────

const DOC_STRINGS: Record<string, Record<LangCode, string>> = {
  detailTitle:    { fr: "Détails du document",   en: "Document Details",      ar: "تفاصيل الوثيقة",        es: "Detalles del documento"   },
  preview:        { fr: "APERÇU",                en: "PREVIEW",               ar: "معاينة",                 es: "VISTA PREVIA"             },
  openPdf:        { fr: "Ouvrir le PDF",         en: "Open PDF",              ar: "فتح ملف PDF",            es: "Abrir PDF"                },
  metadata:       { fr: "INFORMATIONS",          en: "INFORMATION",           ar: "المعلومات",              es: "INFORMACIÓN"              },
  docNumber:      { fr: "Numéro",                en: "Number",                ar: "الرقم",                  es: "Número"                   },
  version:        { fr: "Version",               en: "Version",               ar: "الإصدار",                es: "Versión"                  },
  category:       { fr: "Catégorie",             en: "Category",              ar: "الفئة",                  es: "Categoría"                },
  status:         { fr: "Statut",                en: "Status",                ar: "الحالة",                 es: "Estado"                   },
  createdDate:    { fr: "Créé le",               en: "Created",               ar: "تاريخ الإنشاء",          es: "Creado"                   },
  updatedDate:    { fr: "Mis à jour",            en: "Updated",               ar: "آخر تحديث",              es: "Actualizado"              },
  createdBy:      { fr: "Créé par",              en: "Created by",            ar: "أنشأ بواسطة",            es: "Creado por"               },
  signatureStatus:{ fr: "Signature",             en: "Signature",             ar: "التوقيع",                es: "Firma"                    },
  verification:   { fr: "Vérification",          en: "Verification",          ar: "التحقق",                 es: "Verificación"             },
  signed:         { fr: "Signé",                 en: "Signed",                ar: "موقّع",                  es: "Firmado"                  },
  validated:      { fr: "Validé",                en: "Validated",             ar: "معتمد",                  es: "Validado"                 },
  pending:        { fr: "En attente",            en: "Pending",               ar: "قيد الانتظار",           es: "Pendiente"                },
  verified:       { fr: "Vérifié ✓",             en: "Verified ✓",            ar: "تم التحقق ✓",            es: "Verificado ✓"             },
  notVerified:    { fr: "Non vérifié",           en: "Not verified",          ar: "غير محقق",               es: "No verificado"            },
  actions:        { fr: "ACTIONS RAPIDES",       en: "QUICK ACTIONS",         ar: "إجراءات سريعة",          es: "ACCIONES RÁPIDAS"         },
  download:       { fr: "Télécharger",           en: "Download",              ar: "تحميل",                  es: "Descargar"                },
  share:          { fr: "Partager",              en: "Share",                 ar: "مشاركة",                 es: "Compartir"                },
  qrVerify:       { fr: "Code QR",              en: "QR Code",               ar: "رمز QR",                 es: "Código QR"                },
  comments:       { fr: "Commentaires",          en: "Comments",              ar: "التعليقات",              es: "Comentarios"              },
  history:        { fr: "Historique",            en: "History",               ar: "السجل",                  es: "Historial"                },
  sign:           { fr: "Signer",                en: "Sign",                  ar: "توقيع",                  es: "Firmar"                   },
  edit:           { fr: "Modifier",              en: "Edit",                  ar: "تعديل",                  es: "Editar"                   },
  workflow:       { fr: "FLUX DE VALIDATION",    en: "VALIDATION WORKFLOW",   ar: "مسار الاعتماد",          es: "FLUJO DE VALIDACIÓN"      },
  currentStatus:  { fr: "Statut actuel",         en: "Current status",        ar: "الحالة الحالية",         es: "Estado actual"            },
  submitReview:   { fr: "Soumettre pour révision",en:"Submit for review",     ar: "إرسال للمراجعة",         es: "Enviar para revisión"     },
  approve:        { fr: "Approuver",             en: "Approve",               ar: "اعتماد",                 es: "Aprobar"                  },
  reject:         { fr: "Rejeter",               en: "Reject",                ar: "رفض",                    es: "Rechazar"                 },
  publish:        { fr: "Publier",               en: "Publish",               ar: "نشر",                    es: "Publicar"                 },
  archive:        { fr: "Archiver",              en: "Archive",               ar: "أرشفة",                  es: "Archivar"                 },
  delete:         { fr: "Supprimer",             en: "Delete",                ar: "حذف",                    es: "Eliminar"                 },
  fileSize:       { fr: "Taille",                en: "File size",             ar: "الحجم",                  es: "Tamaño"                   },
  publishedCount: { fr: "Publiés",               en: "Published",              ar: "منشورة",                 es: "Publicados"                },
  draftsCount:    { fr: "Brouillons",            en: "Drafts",                 ar: "مسودات",                  es: "Borradores"                },
  pendingCount:   { fr: "En attente",            en: "Pending",                ar: "قيد الانتظار",            es: "Pendientes"                },
  signedCount:    { fr: "Signés",                en: "Signed",                 ar: "موقعة",                   es: "Firmados"                  },
  previewUnavailableTitle: {
    fr: "Aperçu indisponible", en: "Preview unavailable", ar: "المعاينة غير متاحة", es: "Vista previa no disponible",
  },
  previewUnavailableMessage: {
    fr: "Le PDF n'est pas encore disponible. Il est peut-être encore en cours de génération.",
    en: "The PDF is not available yet. It may still be generating.",
    ar: "ملف PDF غير متاح بعد. قد يكون قيد الإنشاء.",
    es: "El PDF aún no está disponible. Es posible que todavía se esté generando.",
  },
  previewErrorTitle: {
    fr: "Aperçu impossible", en: "Unable to preview", ar: "تعذر عرض المعاينة", es: "No se puede mostrar la vista previa",
  },
  previewMissingFile: {
    fr: "Ce document n'a pas encore de fichier PDF associé.",
    en: "This document does not have an associated PDF file yet.",
    ar: "لا يحتوي هذا المستند على ملف PDF مرتبط بعد.",
    es: "Este documento aún no tiene un archivo PDF asociado.",
  },
  previewConnectionError: {
    fr: "Impossible d'ouvrir l'aperçu. Vérifiez votre connexion.",
    en: "The preview could not be opened. Check your connection.",
    ar: "تعذر فتح المعاينة. تحقق من الاتصال.",
    es: "No se pudo abrir la vista previa. Compruebe la conexión.",
  },
  generatedTitle: { fr: "Document généré", en: "Document generated", ar: "تم إنشاء المستند", es: "Documento generado" },
  generatedMessage: { fr: "\"{name}\" a été créé avec succès.", en: "\"{name}\" was created successfully.", ar: "تم إنشاء «{name}» بنجاح.", es: "«{name}» se creó correctamente." },
  generationError: { fr: "Erreur de génération", en: "Generation error", ar: "خطأ في الإنشاء", es: "Error de generación" },
  generationFailed: { fr: "Impossible de générer le document. Vérifiez la connexion et réessayez.", en: "The document could not be generated. Check your connection and try again.", ar: "تعذر إنشاء المستند. تحقق من الاتصال ثم أعد المحاولة.", es: "No se pudo generar el documento. Compruebe la conexión e inténtelo de nuevo." },
  signedTitle: { fr: "Document signé", en: "Document signed", ar: "تم توقيع المستند", es: "Documento firmado" },
  signedMessage: { fr: "Votre signature électronique a été enregistrée avec succès.", en: "Your electronic signature was recorded successfully.", ar: "تم تسجيل توقيعك الإلكتروني بنجاح.", es: "Su firma electrónica se registró correctamente." },
  signatureError: { fr: "Erreur de signature", en: "Signature error", ar: "خطأ في التوقيع", es: "Error de firma" },
  alreadySigned: { fr: "Vous avez déjà signé ce document.", en: "You have already signed this document.", ar: "لقد وقّعت هذا المستند مسبقاً.", es: "Ya ha firmado este documento." },
  signatureFailed: { fr: "Impossible d'enregistrer la signature. Vérifiez la connexion.", en: "The signature could not be recorded. Check your connection.", ar: "تعذر تسجيل التوقيع. تحقق من الاتصال.", es: "No se pudo registrar la firma. Compruebe la conexión." },
  requiredTitle: { fr: "Titre requis", en: "Title required", ar: "العنوان مطلوب", es: "Título obligatorio" },
  requiredTitleMessage: { fr: "Le titre du document ne peut pas être vide.", en: "The document title cannot be empty.", ar: "لا يمكن أن يكون عنوان المستند فارغاً.", es: "El título del documento no puede estar vacío." },
  savedTitle: { fr: "Modifications enregistrées", en: "Changes saved", ar: "تم حفظ التغييرات", es: "Cambios guardados" },
  savedMessage: { fr: "\"{name}\" a été mis à jour avec succès.", en: "\"{name}\" was updated successfully.", ar: "تم تحديث «{name}» بنجاح.", es: "«{name}» se actualizó correctamente." },
  saveError: { fr: "Échec de la sauvegarde", en: "Save failed", ar: "فشل الحفظ", es: "Error al guardar" },
  saveFailedMessage: { fr: "Impossible d'enregistrer les modifications.", en: "The changes could not be saved.", ar: "تعذر حفظ التغييرات.", es: "No se pudieron guardar los cambios." },
  actionFailed: { fr: "Action échouée", en: "Action failed", ar: "فشل الإجراء", es: "Acción fallida" },
  actionFailedMessage: { fr: "Action impossible. Vérifiez la connexion.", en: "The action could not be completed. Check your connection.", ar: "تعذر إتمام الإجراء. تحقق من الاتصال.", es: "No se pudo completar la acción. Compruebe la conexión." },
  archiveConfirmTitle: { fr: "Archiver le document", en: "Archive document", ar: "أرشفة المستند", es: "Archivar el documento" },
  archiveConfirmMessage: { fr: "Ce document sera archivé et ne sera plus affiché dans les listes actives.", en: "This document will be archived and removed from active lists.", ar: "ستتم أرشفة هذا المستند وإزالته من القوائم النشطة.", es: "Este documento se archivará y dejará de aparecer en las listas activas." },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  archivedTitle: { fr: "Archivé", en: "Archived", ar: "تمت الأرشفة", es: "Archivado" },
  archivedMessage: { fr: "Le document a été archivé.", en: "The document was archived.", ar: "تمت أرشفة المستند.", es: "El documento se archivó." },
  rejectedTitle: { fr: "Document rejeté", en: "Document rejected", ar: "تم رفض المستند", es: "Documento rechazado" },
  rejectedMessage: { fr: "Le document a été rejeté. L'initiateur sera notifié.", en: "The document was rejected. The requester will be notified.", ar: "تم رفض المستند. سيتم إشعار مقدمه.", es: "El documento fue rechazado. Se notificará al solicitante." },
  rejectError: { fr: "Rejet échoué", en: "Rejection failed", ar: "فشل الرفض", es: "Error al rechazar" },
  rejectFailedMessage: { fr: "Impossible de rejeter le document.", en: "The document could not be rejected.", ar: "تعذر رفض المستند.", es: "No se pudo rechazar el documento." },
  deleteConfirmTitle: { fr: "Supprimer le document", en: "Delete document", ar: "حذف المستند", es: "Eliminar el documento" },
  deleteConfirmMessage: { fr: "\"{name}\" sera déplacé dans la corbeille. Vous pourrez le restaurer ultérieurement.", en: "\"{name}\" will be moved to the recycle bin. You can restore it later.", ar: "سيُنقل «{name}» إلى سلة المحذوفات ويمكنك استعادته لاحقاً.", es: "«{name}» se moverá a la papelera y podrá restaurarlo más tarde." },
  deletedTitle: { fr: "Document supprimé", en: "Document deleted", ar: "تم حذف المستند", es: "Documento eliminado" },
  deletedMessage: { fr: "\"{name}\" a été déplacé dans la corbeille.", en: "\"{name}\" was moved to the recycle bin.", ar: "تم نقل «{name}» إلى سلة المحذوفات.", es: "«{name}» se movió a la papelera." },
  deleteError: { fr: "Suppression échouée", en: "Deletion failed", ar: "فشل الحذف", es: "Error al eliminar" },
  deleteFailedMessage: { fr: "Impossible de supprimer ce document.", en: "The document could not be deleted.", ar: "تعذر حذف هذا المستند.", es: "No se pudo eliminar este documento." },
  commentAdded: { fr: "Commentaire ajouté", en: "Comment added", ar: "تمت إضافة التعليق", es: "Comentario añadido" },
  commentAddedMessage: { fr: "Votre commentaire a été publié avec succès.", en: "Your comment was posted successfully.", ar: "تم نشر تعليقك بنجاح.", es: "Su comentario se publicó correctamente." },
  sendFailed: { fr: "Envoi échoué", en: "Send failed", ar: "فشل الإرسال", es: "Error de envío" },
  commentSendFailed: { fr: "Impossible d'ajouter le commentaire.", en: "The comment could not be added.", ar: "تعذر إضافة التعليق.", es: "No se pudo añadir el comentario." },
  deleteCommentTitle: { fr: "Supprimer le commentaire", en: "Delete comment", ar: "حذف التعليق", es: "Eliminar el comentario" },
  irreversible: { fr: "Cette action est irréversible.", en: "This action cannot be undone.", ar: "لا يمكن التراجع عن هذا الإجراء.", es: "Esta acción no se puede deshacer." },
  commentDeleted: { fr: "Commentaire supprimé", en: "Comment deleted", ar: "تم حذف التعليق", es: "Comentario eliminado" },
  commentDeletedMessage: { fr: "Le commentaire a été retiré.", en: "The comment was removed.", ar: "تمت إزالة التعليق.", es: "El comentario se eliminó." },
  versionRestoreTitle: { fr: "Restaurer la version {version}", en: "Restore version {version}", ar: "استعادة الإصدار {version}", es: "Restaurar la versión {version}" },
  versionRestoreMessage: { fr: "La version actuelle sera sauvegardée dans l'historique et remplacée par cette version.", en: "The current version will be saved to history and replaced by this version.", ar: "سيتم حفظ الإصدار الحالي في السجل واستبداله بهذا الإصدار.", es: "La versión actual se guardará en el historial y se reemplazará por esta versión." },
  versionRestored: { fr: "Version {version} restaurée", en: "Version {version} restored", ar: "تمت استعادة الإصدار {version}", es: "Versión {version} restaurada" },
  versionRestoredMessage: { fr: "Le document a été remplacé par cette version avec succès.", en: "The document was successfully replaced by this version.", ar: "تم استبدال المستند بهذا الإصدار بنجاح.", es: "El documento se reemplazó correctamente por esta versión." },
  restoreError: { fr: "Restauration échouée", en: "Restore failed", ar: "فشلت الاستعادة", es: "Error al restaurar" },
  restoreFailedMessage: { fr: "Impossible de restaurer cette version.", en: "This version could not be restored.", ar: "تعذر استعادة هذا الإصدار.", es: "No se pudo restaurar esta versión." },
  submittedTitle: { fr: "Demande soumise", en: "Request submitted", ar: "تم إرسال الطلب", es: "Solicitud enviada" },
  submittedMessage: { fr: "Votre demande de document a été envoyée à l'administrateur.", en: "Your document request was sent to the administrator.", ar: "تم إرسال طلب المستند إلى المسؤول.", es: "Su solicitud de documento se envió al administrador." },
  bundleTitle: { fr: "Générer un dossier complet", en: "Generate a complete package", ar: "إنشاء ملف كامل", es: "Generar un expediente completo" },
  bundleRecovery: { fr: "Recouvrement", en: "Debt recovery", ar: "تحصيل الديون", es: "Recobro" },
  bundleRecoverySub: { fr: "5 documents · Relance → Juridique", en: "5 documents · Reminder → Legal", ar: "5 مستندات · تذكير ← قانوني", es: "5 documentos · Recordatorio → Legal" },
  bundleSale: { fr: "Dossier de vente", en: "Sale package", ar: "ملف البيع", es: "Expediente de venta" },
  bundleSaleSub: { fr: "4 documents · Notaire", en: "4 documents · Notary", ar: "4 مستندات · موثق", es: "4 documentos · Notario" },
  bundleAg: { fr: "Assemblée Générale", en: "General Assembly", ar: "الجمع العام", es: "Asamblea General" },
  bundleAgSub: { fr: "3 documents · Convocation + PV + décisions", en: "3 documents · Notice + minutes + decisions", ar: "3 مستندات · استدعاء + محضر + قرارات", es: "3 documentos · Convocatoria + acta + decisiones" },
  bundleGenerated: { fr: "Dossier généré", en: "Package generated", ar: "تم إنشاء الملف", es: "Expediente generado" },
  bundleGeneratedMessage: { fr: "{count} document(s) créés et disponibles dans la liste.", en: "{count} document(s) created and available in the list.", ar: "تم إنشاء {count} مستند وإتاحتها في القائمة.", es: "{count} documento(s) creados y disponibles en la lista." },
  signaturePanelTitle: { fr: "SIGNATURES ÉLECTRONIQUES", en: "ELECTRONIC SIGNATURES", ar: "التوقيعات الإلكترونية", es: "FIRMAS ELECTRÓNICAS" },
  handwrittenSignature: { fr: "Signature manuscrite", en: "Handwritten signature", ar: "التوقيع بخط اليد", es: "Firma manuscrita" },
  signatureGuidance: { fr: "Signez avec votre doigt dans la zone ci-dessous. Cette signature sera intégrée au document et horodatée.", en: "Sign with your finger in the area below. Your signature will be embedded in the document and timestamped.", ar: "وقّع بإصبعك في المنطقة أدناه. سيتم إدراج توقيعك في المستند وتسجيل وقته.", es: "Firme con el dedo en el área siguiente. La firma se integrará en el documento y se fechará." },
  clear: { fr: "Effacer", en: "Clear", ar: "مسح", es: "Borrar" },
  confirmSignature: { fr: "Confirmer la signature", en: "Confirm signature", ar: "تأكيد التوقيع", es: "Confirmar firma" },
  sending: { fr: "Envoi…", en: "Sending…", ar: "جارٍ الإرسال…", es: "Enviando…" },
  editDocument: { fr: "Modifier le document", en: "Edit document", ar: "تعديل المستند", es: "Editar el documento" },
  titleLabel: { fr: "Titre", en: "Title", ar: "العنوان", es: "Título" },
  contentLabel: { fr: "Contenu", en: "Content", ar: "المحتوى", es: "Contenido" },
  contentPlaceholder: { fr: "Contenu du document…", en: "Document content…", ar: "محتوى المستند…", es: "Contenido del documento…" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  saving: { fr: "Enregistrement…", en: "Saving…", ar: "جارٍ الحفظ…", es: "Guardando…" },
  rejectDocument: { fr: "Rejeter le document", en: "Reject document", ar: "رفض المستند", es: "Rechazar el documento" },
  rejectGuidance: { fr: "Indiquez la raison du rejet. L'initiateur sera notifié.", en: "Enter the reason for rejection. The requester will be notified.", ar: "أدخل سبب الرفض. سيتم إشعار مقدم الطلب.", es: "Indique el motivo del rechazo. Se notificará al solicitante." },
  rejectionReasonPlaceholder: { fr: "Motif de rejet (requis)…", en: "Rejection reason (required)…", ar: "سبب الرفض (مطلوب)…", es: "Motivo del rechazo (obligatorio)…" },
  confirmRejection: { fr: "Confirmer le rejet", en: "Confirm rejection", ar: "تأكيد الرفض", es: "Confirmar rechazo" },
  versionHistory: { fr: "Historique des versions", en: "Version history", ar: "سجل الإصدارات", es: "Historial de versiones" },
  noPreviousVersions: { fr: "Aucune version précédente", en: "No previous versions", ar: "لا توجد إصدارات سابقة", es: "No hay versiones anteriores" },
  qrVerificationTitle: { fr: "QR Code de vérification", en: "Verification QR code", ar: "رمز QR للتحقق", es: "Código QR de verificación" },
  qrVerificationGuidance: { fr: "Scannez ce code pour vérifier l'authenticité du document.", en: "Scan this code to verify the document's authenticity.", ar: "امسح هذا الرمز للتحقق من أصالة المستند.", es: "Escanee este código para verificar la autenticidad del documento." },
  qrUnavailable: { fr: "QR code indisponible", en: "QR code unavailable", ar: "رمز QR غير متاح", es: "Código QR no disponible" },
  commentsTitle: { fr: "Commentaires", en: "Comments", ar: "التعليقات", es: "Comentarios" },
  commentPlaceholder: { fr: "Ajouter un commentaire…", en: "Add a comment…", ar: "إضافة تعليق…", es: "Añadir un comentario…" },
  noComments: { fr: "Aucun commentaire", en: "No comments", ar: "لا توجد تعليقات", es: "No hay comentarios" },
  firstComment: { fr: "Soyez le premier à commenter", en: "Be the first to comment", ar: "كن أول من يعلق", es: "Sea el primero en comentar" },
  unknownAuthor: { fr: "Inconnu", en: "Unknown", ar: "غير معروف", es: "Desconocido" },
  close: { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
};

// ─── Download progress state ──────────────────────────────────────────────────

interface DownloadState {
  active: boolean;
  docTitle: string;
  progress: number;          // 0–1
  bytesDownloaded: number;
  totalBytes: number;
  speedKbps: number;
  remainingSec: number;
  phase: "fetching_url" | "downloading" | "done" | "error";
  errorMsg?: string;
  localUri?: string;
}

const INIT_DL: DownloadState = {
  active: false, docTitle: "", progress: 0,
  bytesDownloaded: 0, totalBytes: 0, speedKbps: 0, remainingSec: 0,
  phase: "fetching_url",
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentsScreen() {
  const colors          = useColors();
  const insets          = useSafeAreaInsets();
  const { showToast }   = useToast();
  const { user }        = useAuth();
  const {
    documents,
    documentsLoading,
    documentsLoadError,
    updateDocument,
    refreshDocuments,
    deleteDocument,
  } = useData();
  const { logActivity } = useActivity();
  const { toggleFavorite, isFavorite } = useFavorites();
  const FAV_ID = "screen-documents";
  const { isWide } = useBreakpoints();
  const { lang, isRTL, t } = useLanguage();
  const docText = (key: string, values?: Record<string, string | number>) => {
    const template = DOC_STRINGS[key]?.[lang] ?? key;
    return Object.entries(values ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      template,
    );
  };
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  // isAdmin controls viewing and document workflow (approve/reject/generate).
  // super_admin is excluded from write actions on syndicate documents per spec:
  // "Ahmed ne doit jamais voir les documents privés d'un résident".
  // Secretary and President manage documents in the syndicate.
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "secretary" || user?.role === "president";

  // List / filter
  const [category, setCategory] = useState("all");
  const [search,   setSearch]   = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Selected document
  const [selected, setSelected] = useState<Document | null>(null);

  // Generate modal
  const [showGenerate,     setShowGenerate]     = useState(false);
  const [generating,       setGenerating]       = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof DOC_TEMPLATES[0] | null>(null);
  const [genMember,        setGenMember]        = useState("");
  const [genNote,          setGenNote]          = useState("");
  const [genLanguage,      setGenLanguage]      = useState<"fr" | "ar" | "en" | "es">("fr");

  // Edit modal
  const [showEdit,    setShowEdit]    = useState(false);
  const [editTitle,   setEditTitle]   = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit,  setSavingEdit]  = useState(false);

  // Signature modal
  const [showSign,   setShowSign]   = useState(false);
  const [signing,    setSigning]    = useState(false);
  const [sigEmpty,   setSigEmpty]   = useState(true);
  // Bumped after a successful sign to force SignatureOrderPanel to remount + re-fetch
  const [sigPanelKey, setSigPanelKey] = useState(0);
  const sigPadRef = useRef<SignaturePadHandle>(null);
  const sigSvgRef = useRef<string>("");

  // Member document request + template request modals
  const [showMemberRequest,  setShowMemberRequest]  = useState(false);
  const [showTemplateRequest, setShowTemplateRequest] = useState(false);

  // Bundle modals (admin only)
  const [showBundleMenu,  setShowBundleMenu]  = useState(false);
  const [activeBundleType, setActiveBundleType] = useState<BundleType | null>(null);

  const openBundle = (type: BundleType) => {
    setShowBundleMenu(false);
    setActiveBundleType(type);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Workflow actions
  const [workflowBusy,     setWorkflowBusy]     = useState(false);
  const [showRejectModal,  setShowRejectModal]   = useState(false);
  const [rejectReason,     setRejectReason]      = useState("");

  // Version history
  const [showVersions,     setShowVersions]      = useState(false);
  const [versions,         setVersions]          = useState<Array<{
    id: string; versionNumber: number; title: string; createdAt: string; createdByName: string | null;
  }>>([]);
  const [versionsLoading,  setVersionsLoading]   = useState(false);
  const [restoringVersion, setRestoringVersion]  = useState<string | null>(null);

  // Comments
  type DocComment = { id: string; content: string; parentId: string | null; isDeleted: boolean; createdAt: string; authorId: string; authorName: string | null; authorRole: string | null };
  const [showComments,    setShowComments]    = useState(false);
  const [comments,        setComments]        = useState<DocComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText,     setCommentText]     = useState("");
  const [postingComment,  setPostingComment]  = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);

  // QR code
  const [showQR,    setShowQR]    = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Download progress
  const [dlState, setDlState] = useState<DownloadState>(INIT_DL);
  const dlRef = useRef<ReturnType<typeof FileSystem.createDownloadResumable> | null>(null);
  const dlStartTime = useRef(0);
  const dlStartBytes = useRef(0);
  const lastSpeedUpdate = useRef(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ─── Filtering ───────────────────────────────────────────────────────────────

  const filtered = documents.filter((d) => {
    const matchCat    = category === "all" || d.category === category;
    const matchSearch = !search || d.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // ─── Status display ──────────────────────────────────────────────────────────

  const statusConfig = (status: string): { label: string; color: string } =>
    ({
      published:      { label: t("docStatusPublished"),     color: colors.success },
      draft:          { label: t("docStatusDraft"),         color: colors.mutedForeground },
      pending:        { label: t("docStatusPending"),       color: "#f59e0b" },
      generated:      { label: t("docStatusGenerated"),     color: "#3b82f6" },
      pending_review: { label: t("docStatusPendingReview"), color: "#f59e0b" },
      validated:      { label: t("docStatusValidated"),     color: "#10b981" },
      signed:         { label: t("docStatusSigned"),         color: "#8b5cf6" },
      archived:       { label: t("docStatusArchived"),      color: colors.mutedForeground },
      rejected:       { label: t("docStatusRejected"),      color: "#ef4444" },
      expired:        { label: t("docStatusExpired"),       color: "#dc2626" },
    } as Record<string, { label: string; color: string }>)[status]
    ?? { label: status, color: colors.mutedForeground };

  const handleRefreshDocuments = async () => {
    setRefreshing(true);
    try {
      await refreshDocuments();
    } catch {
      showToast({
        type: "error",
        title: t("documentsUnavailableTitle"),
        message: t("documentsUnavailableDescription"),
      });
    } finally {
      setRefreshing(false);
    }
  };

  // ─── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!selectedTemplate || generating) return;
    const content = [genMember && `Destinataire: ${genMember}`, genNote].filter(Boolean).join("\n");
    setGenerating(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.generate(
        selectedTemplate.name,
        selectedTemplate.category,
        content || undefined,
        selectedTemplate.templateId,
        genMember || undefined,
        genLanguage,
      );
      logActivity({ action: "Document généré", target: selectedTemplate.name, route: "/documents", icon: "file-text", color: "#6366f1" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshDocuments().catch(() => {});
      showToast({ type: "success", title: docText("generatedTitle"), message: docText("generatedMessage", { name: selectedTemplate.name }) });
      setShowGenerate(false);
      setSelectedTemplate(null);
      setGenMember("");
      setGenNote("");
      setGenLanguage("fr");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ type: "error", title: docText("generationError"), message: docText("generationFailed") });
    } finally {
      setGenerating(false);
    }
  };

  // ─── Preview — opens in-app PDF viewer ──────────────────────────────────────

  const handlePreview = async (doc: Document) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.downloadUrl(doc.id);
      let signedUrl = (res as any).url as string | undefined;
      if (signedUrl) {
        // local-docs URLs go through requireAuth which can't receive the
        // Authorization header from a WebView — append the JWT as ?token=…
        if (signedUrl.includes("/local-docs/")) {
          const jwt = await getToken();
          if (jwt) {
            signedUrl = signedUrl.includes("?")
              ? `${signedUrl}&token=${encodeURIComponent(jwt)}`
              : `${signedUrl}?token=${encodeURIComponent(jwt)}`;
          }
        }
        router.push({
          pathname: "/pdf-viewer",
          params: { url: signedUrl, title: doc.title, docId: doc.id },
        });
        return;
      }
      showToast({ type: "warning", title: docText("previewUnavailableTitle"), message: docText("previewUnavailableMessage") });
    } catch (err: any) {
      showToast({
        type: "error",
        title: docText("previewErrorTitle"),
        message: err?.message?.includes("404") ? docText("previewMissingFile") : docText("previewConnectionError"),
      });
    }
  };

  // ─── Download with real progress ─────────────────────────────────────────────

  const startDownload = async (doc: Document, afterDownload: "share" | "open" = "open") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setDlState({ ...INIT_DL, active: true, docTitle: doc.title, phase: "fetching_url" });
    progressAnim.setValue(0);

    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.downloadUrl(doc.id);
      const signedUrl = (res as any).url as string | undefined;
      const filename  = (res as any).filename as string | undefined;

      if (!signedUrl) {
        setDlState((s) => ({ ...s, phase: "error", errorMsg: t("downloadNoFile") }));
        return;
      }

      const safeName  = filename ?? `${doc.title.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
      const cacheDir  = (FileSystem as any).cacheDirectory ?? "";
      const localPath = `${cacheDir}${safeName}`;

      setDlState((s) => ({ ...s, phase: "downloading" }));
      dlStartTime.current    = Date.now();
      dlStartBytes.current   = 0;
      lastSpeedUpdate.current = Date.now();

      const dl = FileSystem.createDownloadResumable(
        signedUrl,
        localPath,
        {},
        (progress) => {
          const downloaded = progress.totalBytesWritten;
          const total      = progress.totalBytesExpectedToWrite;
          const pct        = total > 0 ? downloaded / total : 0;

          // Speed calculation (Kbps, updated max every 500ms)
          const now       = Date.now();
          const elapsed   = (now - dlStartTime.current) / 1000;
          const speedKbps = elapsed > 0 ? Math.round((downloaded / 1024) / elapsed) : 0;
          const remainingSec =
            speedKbps > 0 && total > 0
              ? Math.round(((total - downloaded) / 1024) / speedKbps)
              : 0;

          setDlState((s) => ({
            ...s,
            progress:        pct,
            bytesDownloaded: downloaded,
            totalBytes:      total,
            speedKbps,
            remainingSec,
          }));

          Animated.timing(progressAnim, {
            toValue:         pct,
            duration:        200,
            useNativeDriver: false,
          }).start();
        },
      );

      dlRef.current = dl;
      const result = await dl.downloadAsync();

      if (!result?.uri) {
        setDlState((s) => ({ ...s, phase: "error", errorMsg: t("downloadInterrupted") }));
        return;
      }

      setDlState((s) => ({ ...s, phase: "done", progress: 1, localUri: result.uri }));
      Animated.timing(progressAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      logActivity({ action: "Document téléchargé", target: doc.title, route: "/documents", icon: "download", color: "#6366f1" });

      if (afterDownload === "share") {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
        }
        setDlState(INIT_DL);
      }
      // For "open" mode, keep the success panel visible so user can act on it
    } catch (err: any) {
      if (err?.message?.includes("cancelled") || err?.message?.includes("aborted")) {
        setDlState(INIT_DL);
        return;
      }
      setDlState((s) => ({
        ...s,
        phase: "error",
        errorMsg: t("downloadFailed"),
      }));
    }
  };

  const cancelDownload = () => {
    dlRef.current?.pauseAsync().catch(() => {});
    dlRef.current = null;
    setDlState(INIT_DL);
  };

  const retryDownload = (doc: Document) => startDownload(doc);

  const openDownloadedFile = async (uri: string) => {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
    }
    setDlState(INIT_DL);
  };

  // ─── Edit ────────────────────────────────────────────────────────────────────

  const openEdit = async (doc: Document) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditTitle(doc.title);
    setEditContent("");
    setShowEdit(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = (await docsApi.get(doc.id)) as { data: Record<string, unknown> };
      setEditContent(String(res.data.content ?? ""));
    } catch {
      // leave empty — user can still overwrite
    }
  };

  // ─── Sign ────────────────────────────────────────────────────────────────────

  const openSign = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sigSvgRef.current = "";
    setSigEmpty(true);
    setShowSign(true);
  };

  const handleConfirmSign = async () => {
    if (!selected || sigEmpty || signing) return;
    setSigning(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.sign(selected.id, sigSvgRef.current || undefined);
      updateDocument(selected.id, { status: "signed" as Document["status"] });
      logActivity({ action: "Document signé", target: selected.title, route: "/documents", icon: "edit-3", color: "#8b5cf6" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshDocuments().catch(() => {});
      setShowSign(false);
      setSigPanelKey((k) => k + 1);   // forces SignatureOrderPanel to re-fetch
      setSelected((s) => (s ? { ...s, status: "signed" as Document["status"] } : s));
      showToast({ type: "success", title: docText("signedTitle"), message: docText("signedMessage") });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({
        type: "error",
        title: docText("signatureError"),
        message: err?.message?.includes("409") ? docText("alreadySigned") : docText("signatureFailed"),
      });
    } finally {
      setSigning(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    if (!editTitle.trim()) { showToast({ type: "warning", title: docText("requiredTitle"), message: docText("requiredTitleMessage") }); return; }
    setSavingEdit(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.update(selected.id, { title: editTitle.trim(), content: editContent });
      updateDocument(selected.id, { title: editTitle.trim(), content: editContent });
      logActivity({ action: "Document modifié", target: editTitle.trim(), route: "/documents", icon: "edit-2", color: "#6366f1" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowEdit(false);
      setSelected((s) => (s ? { ...s, title: editTitle.trim(), content: editContent } : s));
      showToast({ type: "success", title: docText("savedTitle"), message: docText("savedMessage", { name: editTitle.trim() }) });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ type: "error", title: docText("saveError"), message: docText("saveFailedMessage") });
    } finally {
      setSavingEdit(false);
    }
  };

  // ─── Workflow actions ─────────────────────────────────────────────────────────

  const applyStatusUpdate = async (newStatus: string, successTitle: string, successMsg: string) => {
    if (!selected || workflowBusy) return;
    setWorkflowBusy(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.update(selected.id, { status: newStatus });
      updateDocument(selected.id, { status: newStatus as Document["status"] });
      setSelected((s) => s ? { ...s, status: newStatus as Document["status"] } : s);
      await refreshDocuments().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: successTitle, message: successMsg });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ type: "error", title: docText("actionFailed"), message: docText("actionFailedMessage") });
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleSubmitForReview = () =>
    applyStatusUpdate("pending_review", docText("documentsDashboardStatusInReview"), docText("documentsDashboardInReviewDescription"));

  const handleApproveDoc = () =>
    applyStatusUpdate("validated", t("docStatusValidated"), t("documentsDashboardPendingApprovalDescription"));

  const handlePublishDoc = () =>
    applyStatusUpdate("published", t("docStatusPublished"), t("documentsDashboardPublishedDescription"));

  const handleArchiveDoc = () => {
    if (!selected) return;
    Alert.alert(
      docText("archiveConfirmTitle"),
      docText("archiveConfirmMessage"),
      [
        { text: docText("cancel"), style: "cancel" },
        { text: docText("archive"), onPress: () => applyStatusUpdate("archived", docText("archivedTitle"), docText("archivedMessage")) },
      ],
    );
  };

  const handleRejectDoc = async () => {
    if (!selected || workflowBusy || !rejectReason.trim()) return;
    setWorkflowBusy(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.update(selected.id, { status: "rejected", rejectionReason: rejectReason.trim() } as any);
      updateDocument(selected.id, { status: "rejected" as Document["status"] });
      setSelected((s) => s ? { ...s, status: "rejected" as Document["status"] } : s);
      await refreshDocuments().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setShowRejectModal(false);
      setRejectReason("");
      showToast({ type: "warning", title: docText("rejectedTitle"), message: docText("rejectedMessage") });
    } catch (err: any) {
      showToast({ type: "error", title: docText("rejectError"), message: docText("rejectFailedMessage") });
    } finally {
      setWorkflowBusy(false);
    }
  };

  // ─── Soft-delete ──────────────────────────────────────────────────────────────

  const handleDelete = () => {
    if (!selected) return;
    Alert.alert(
      docText("deleteConfirmTitle"),
      docText("deleteConfirmMessage", { name: selected.title }),
      [
        { text: docText("cancel"), style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            // Optimistic: close modal + remove from list immediately
            const docId = selected.id;
            const docTitle = selected.title;
            setSelected(null);
            deleteDocument(docId);
            try {
              const { documents: docsApi } = await import("@/services/api");
              await docsApi.delete(docId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast({ type: "success", title: docText("deletedTitle"), message: docText("deletedMessage", { name: docTitle }) });
              refreshDocuments().catch(() => {});
            } catch (err: any) {
              // Rollback: re-fetch list to restore the document
              refreshDocuments().catch(() => {});
              showToast({ type: "error", title: docText("deleteError"), message: docText("deleteFailedMessage") });
            }
          },
        },
      ],
    );
  };

  // ─── Version history ──────────────────────────────────────────────────────────

  const handleShowVersions = async () => {
    if (!selected) return;
    setVersions([]);
    setShowVersions(true);
    setVersionsLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = (await docsApi.versions(selected.id)) as { data: typeof versions };
      setVersions(res.data ?? []);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  };

  // ─── Comments ─────────────────────────────────────────────────────────────────

  const handleShowComments = async () => {
    if (!selected) return;
    setComments([]);
    setShowComments(true);
    setCommentsLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.comments(selected.id);
      setComments((res.data ?? []).filter((c) => !c.isDeleted));
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!selected || !commentText.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      await docsApi.addComment(selected.id, commentText.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCommentText("");
      const res = await docsApi.comments(selected.id);
      setComments((res.data ?? []).filter((c) => !c.isDeleted));
      showToast({ type: "success", title: docText("commentAdded"), message: docText("commentAddedMessage") });
    } catch (err: any) {
      showToast({ type: "error", title: docText("sendFailed"), message: docText("commentSendFailed") });
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    if (!selected) return;
    Alert.alert(docText("deleteCommentTitle"), docText("irreversible"), [
      { text: docText("cancel"), style: "cancel" },
      {
        text: "Supprimer", style: "destructive",
        onPress: async () => {
          setDeletingComment(commentId);
          try {
            const { documents: docsApi } = await import("@/services/api");
            await docsApi.deleteComment(selected.id, commentId);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
            showToast({ type: "success", title: docText("commentDeleted"), message: docText("commentDeletedMessage") });
          } catch (err: any) {
            showToast({ type: "error", title: docText("deleteError"), message: docText("commentSendFailed") });
          } finally {
            setDeletingComment(null);
          }
        },
      },
    ]);
  };

  // ─── QR code ──────────────────────────────────────────────────────────────────

  const handleShowQR = async () => {
    if (!selected) return;
    setQrDataUrl(null);
    setShowQR(true);
    setQrLoading(true);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.qrCode(selected.id);
      setQrDataUrl(res.qrDataUrl ?? null);
    } catch {
      setQrDataUrl(null);
    } finally {
      setQrLoading(false);
    }
  };

  const handleRestoreVersion = (versionId: string, versionNum: number) => {
    if (!selected || restoringVersion) return;
    Alert.alert(
      docText("versionRestoreTitle", { version: versionNum }),
      docText("versionRestoreMessage"),
      [
        { text: docText("cancel"), style: "cancel" },
        {
          text: "Restaurer",
          onPress: async () => {
            setRestoringVersion(versionId);
            try {
              const { documents: docsApi } = await import("@/services/api");
              await docsApi.restoreVersion(selected.id, versionId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await refreshDocuments().catch(() => {});
              setShowVersions(false);
              setSelected(null);
              showToast({ type: "success", title: docText("versionRestored", { version: versionNum }), message: docText("versionRestoredMessage") });
            } catch (err: any) {
              showToast({ type: "error", title: docText("restoreError"), message: docText("restoreFailedMessage") });
            } finally {
              setRestoringVersion(null);
            }
          },
        },
      ],
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("documentsTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {t("documentsCount").replace("{count}", String(filtered.length))}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => toggleFavorite({ id: FAV_ID, title: t("documentsTitle"), icon: "file-text", color: "#6366f1", route: "/documents" })}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="star" size={20} color={isFavorite(FAV_ID) ? "#f59e0b" : colors.mutedForeground} />
        </TouchableOpacity>
        {isAdmin ? (
          <TouchableOpacity
            style={{ padding: 6, marginRight: 4 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/documents-recycle-bin"); }}
          >
            <Feather name="trash-2" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
        {isAdmin ? (
          <>
            {/* Bundle docs (admin) */}
            <TouchableOpacity
              style={{ padding: 6, marginRight: 2 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { setShowBundleMenu((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Feather name="package" size={20} color={showBundleMenu ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
            {/* Demander un nouveau modèle (admin) */}
            <TouchableOpacity
              style={{ padding: 6, marginRight: 2 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { setShowTemplateRequest(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Feather name="layout" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.generateBtn, { backgroundColor: colors.primary }]}
              onPress={() => { setShowGenerate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Feather name="file-plus" size={16} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          /* Demander un document (member / tenant) */
          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: "#8b5cf6" }]}
            onPress={() => { setShowMemberRequest(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="send" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Search ── */}
      <View style={[styles.searchWrap, { margin: 12, marginBottom: 0, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder={t("documentSearchPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={16} color={colors.mutedForeground} /></TouchableOpacity> : null}
      </View>

      <FilterChips
        options={CATS.map((c) => ({ key: c.key, label: t(c.labelKey) }))}
        value={category}
        onChange={setCategory}
        accentColor={colors.primary}
      />

      {/* ── Stats row ── */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: DOC_STRINGS.publishedCount[lang], count: documents.filter((d) => d.status === "published").length, color: colors.success },
          { label: DOC_STRINGS.draftsCount[lang], count: documents.filter((d) => d.status === "draft" || d.status === "generated").length, color: colors.mutedForeground },
          { label: DOC_STRINGS.pendingCount[lang], count: documents.filter((d) => d.status === "pending" || d.status === "pending_review").length, color: "#f59e0b" },
          { label: DOC_STRINGS.signedCount[lang], count: documents.filter((d) => d.status === "signed" || d.status === "validated").length, color: "#8b5cf6" },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statCount, { color: s.color }]}>{s.count}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Document list ── */}
      {documentsLoading ? (
        <LoadingState
          title={t("documentsLoadingTitle")}
          description={t("documentsLoadingDescription")}
          accentColor={colors.primary}
        />
      ) : documentsLoadError ? (
        <ErrorState
          title={t("documentsUnavailableTitle")}
          description={t("documentsUnavailableDescription")}
          retryLabel={t("retry")}
          onRetry={() => void handleRefreshDocuments()}
          accentColor={colors.primary}
        />
      ) : (
      <FlatList
        data={filtered}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ flexGrow: filtered.length === 0 ? 1 : undefined, padding: 14, gap: 10, paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefreshDocuments()}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="file-text"
            title={documents.length === 0 ? t("noDocuments") : t("noDocumentsForFilter")}
            description={documents.length === 0 ? t("noDocumentsDescription") : t("noDocumentsForFilterDescription")}
            accentColor={colors.primary}
          />
        }
        renderItem={({ item: d }) => {
          const sc       = statusConfig(d.status);
          const catColor = CAT_COLORS[d.category] ?? colors.primary;
          return (
            <TouchableOpacity
              style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: catColor }]}
              onPress={() => setSelected(d)}
              activeOpacity={0.8}
            >
              <View style={[styles.docIcon, { backgroundColor: catColor + "15" }]}>
                <Feather name={CAT_ICONS[d.category] ?? "file-text"} size={20} color={catColor} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.docTitle, { color: colors.foreground }]} numberOfLines={2}>{d.title}</Text>
                <View style={styles.docMeta}>
                  <Text style={[styles.docDate, { color: colors.mutedForeground }]}>{d.date}</Text>
                  <Text style={[styles.docDot, { color: colors.mutedForeground }]}>•</Text>
                  <Text style={[styles.docSize, { color: colors.mutedForeground }]}>{d.size}</Text>
                </View>
                <View style={[styles.docStatus, { backgroundColor: sc.color + "15" }]}>
                  <Text style={[styles.docStatusText, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.downloadBtn, { backgroundColor: colors.primary + "15" }]}
                onPress={() => startDownload(d)}
              >
                <Feather name="download" size={16} color={colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
      )}

      {/* ── Member document request modal ── */}
      <MemberDocumentRequest
        visible={showMemberRequest}
        onClose={() => setShowMemberRequest(false)}
        onComplete={(docId) => {
          setShowMemberRequest(false);
          refreshDocuments().catch(() => {});
          showToast({ type: "success", title: docText("submittedTitle"), message: docText("submittedMessage") });
        }}
      />

      {/* ── Template request modal ── */}
      <TemplateRequestModal
        visible={showTemplateRequest}
        onClose={() => setShowTemplateRequest(false)}
        onSubmitted={() => { setShowTemplateRequest(false); }}
      />

      {/* ── Bundle quick-menu (admin) ── */}
      {showBundleMenu && (
        <View style={[styles.bundleMenu, { backgroundColor: colors.card, borderColor: colors.border, top: (Platform.OS === "web" ? 67 : insets.top) + 56 }]}>
          <Text style={[styles.bundleMenuTitle, { color: colors.mutedForeground }]}>{docText("bundleTitle")}</Text>
          {([
            { type: "recovery" as BundleType, icon: "alert-triangle" as const, color: "#dc2626", label: docText("bundleRecovery"), sub: docText("bundleRecoverySub") },
            { type: "sale" as BundleType, icon: "package" as const, color: "#7c3aed", label: docText("bundleSale"), sub: docText("bundleSaleSub") },
            { type: "ag" as BundleType, icon: "users" as const, color: "#3b82f6", label: docText("bundleAg"), sub: docText("bundleAgSub") },
          ] as const).map((b) => (
            <TouchableOpacity
              key={b.type}
              style={[styles.bundleMenuItem, { borderBottomColor: colors.border }]}
              onPress={() => openBundle(b.type)}
              activeOpacity={0.75}
            >
              <View style={[styles.bundleMenuIcon, { backgroundColor: b.color + "15" }]}>
                <Feather name={b.icon} size={18} color={b.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bundleMenuItemLabel, { color: colors.foreground }]}>{b.label}</Text>
                <Text style={[styles.bundleMenuItemSub, { color: colors.mutedForeground }]}>{b.sub}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Document Bundle Modal ── */}
      {activeBundleType && (
        <DocumentBundleModal
          visible={!!activeBundleType}
          bundleType={activeBundleType}
          onClose={() => setActiveBundleType(null)}
          onComplete={(docs) => {
            setActiveBundleType(null);
            setShowBundleMenu(false);
            refreshDocuments().catch(() => {});
            showToast({
              type: "success",
              title: docText("bundleGenerated"),
              message: docText("bundleGeneratedMessage", { count: docs.length }),
            });
          }}
        />
      )}

      {/* ── Download progress overlay ── */}
      {dlState.active ? (
        <View style={[styles.dlOverlay, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Title row */}
          <View style={styles.dlHeader}>
            <Feather
              name={dlState.phase === "done" ? "check-circle" : dlState.phase === "error" ? "alert-circle" : "download-cloud"}
              size={20}
              color={dlState.phase === "done" ? colors.success : dlState.phase === "error" ? "#ef4444" : colors.primary}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.dlTitle, { color: colors.foreground }]} numberOfLines={1}>{dlState.docTitle}</Text>
              <Text style={[styles.dlSub, { color: colors.mutedForeground }]}>
                {dlState.phase === "fetching_url"  ? t("downloadPreparing")
                  : dlState.phase === "done"        ? t("downloadComplete")
                  : dlState.phase === "error"       ? dlState.errorMsg ?? "Erreur"
                  : (() => {
                      const mb   = (dlState.bytesDownloaded / (1024 * 1024)).toFixed(1);
                      const tot  = dlState.totalBytes > 0 ? ` / ${(dlState.totalBytes / (1024 * 1024)).toFixed(1)} Mo` : "";
                      const spd  = dlState.speedKbps > 0 ? `  •  ${dlState.speedKbps > 1024 ? `${(dlState.speedKbps/1024).toFixed(1)} Mo/s` : `${dlState.speedKbps} Ko/s`}` : "";
                      const rem  = dlState.remainingSec > 0 ? `  •  ${dlState.remainingSec}s` : "";
                      return `${mb}${tot}${spd}${rem}`;
                    })()
                }
              </Text>
            </View>
            {dlState.phase !== "done" && dlState.phase !== "error" ? (
              <TouchableOpacity onPress={cancelDownload} style={styles.dlCancel}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setDlState(INIT_DL)} style={styles.dlCancel}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* Progress bar */}
          {dlState.phase !== "done" && dlState.phase !== "error" ? (
            <View style={[styles.dlBarBg, { backgroundColor: colors.border }]}>
              <Animated.View
                style={[
                  styles.dlBarFill,
                  {
                    backgroundColor: colors.primary,
                    width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                  },
                ]}
              />
            </View>
          ) : null}

          {/* % label */}
          {dlState.phase === "downloading" ? (
            <Text style={[styles.dlPct, { color: colors.primary }]}>{Math.round(dlState.progress * 100)}%</Text>
          ) : null}

          {/* Action buttons */}
          {dlState.phase === "done" && dlState.localUri ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.dlBtn, { backgroundColor: colors.primary }]}
                onPress={() => openDownloadedFile(dlState.localUri!)}
              >
                <Feather name="share-2" size={14} color="#fff" />
                <Text style={styles.dlBtnText}>{t("downloadOpenShare")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dlBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setDlState(INIT_DL)}
              >
                <Text style={[styles.dlBtnText, { color: colors.foreground }]}>{docText("close")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {dlState.phase === "error" ? (
            <TouchableOpacity
              style={[styles.dlBtn, { backgroundColor: "#ef4444", marginTop: 10 }]}
              onPress={() => {
                if (selected) retryDownload(selected);
              }}
            >
              <Feather name="refresh-cw" size={14} color="#fff" />
                <Text style={styles.dlBtnText}>{t("retry")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* ── Document detail modal — premium enterprise redesign ── */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (() => {
          const catColor  = CAT_COLORS[selected.category] ?? colors.primary;
          const sc        = statusConfig(selected.status);
          const docRef    = `REF-${selected.id.slice(0, 8).toUpperCase()}`;
          const isSigned  = selected.status === "signed";
          const isValid   = selected.status === "validated";
          const isVerified= ["published", "signed", "validated"].includes(selected.status);
          return (
            <View style={[detailStyles.root, { backgroundColor: colors.background }]}>

              {/* ── Modal header ── */}
              <View style={[detailStyles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => setSelected(null)} style={detailStyles.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
                <Text style={[detailStyles.headerTitle, { color: colors.foreground }]}>
                  {DOC_STRINGS.detailTitle[lang]}
                </Text>
                <View style={[detailStyles.headerDocType, { backgroundColor: catColor + "15" }]}>
                  <Feather name={CAT_ICONS[selected.category] ?? "file-text"} size={13} color={catColor} />
                  <Text style={[detailStyles.headerDocTypeText, { color: catColor }]}>
                    {t(CATS.find((c) => c.key === selected.category)?.labelKey ?? selected.category)}
                  </Text>
                </View>
              </View>

              <ScrollView contentContainerStyle={detailStyles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* ── Hero band — title displayed exactly once ── */}
                <View style={[detailStyles.heroBand, { backgroundColor: catColor }]}>
                  <View style={detailStyles.heroIconRow}>
                    <View style={detailStyles.heroIconWrap}>
                      <Feather name={CAT_ICONS[selected.category] ?? "file-text"} size={26} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={detailStyles.heroRef}>{docRef}</Text>
                      <Text style={detailStyles.heroTitle} numberOfLines={3}>{selected.title}</Text>
                    </View>
                  </View>
                  <View style={detailStyles.heroBadgeRow}>
                    <View style={detailStyles.heroPill}>
                      <Text style={detailStyles.heroPillText}>v1.0</Text>
                    </View>
                    <View style={[detailStyles.heroPill, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                      <Text style={detailStyles.heroPillText}>{selected.size}</Text>
                    </View>
                    <View style={[detailStyles.heroStatusPill, { backgroundColor: "rgba(0,0,0,0.22)" }]}>
                      <View style={detailStyles.heroStatusDot} />
                      <Text style={detailStyles.heroStatusText}>{sc.label}</Text>
                    </View>
                  </View>
                </View>

                {/* ── PDF Preview section ── */}
                <View style={detailStyles.section}>
                  <Text style={[detailStyles.sectionLabel, { color: colors.mutedForeground }]}>
                    {DOC_STRINGS.preview[lang]}
                  </Text>
                  <TouchableOpacity
                    style={[detailStyles.pdfCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handlePreview(selected)}
                    activeOpacity={0.82}
                  >
                    <View style={[detailStyles.pdfThumb, { backgroundColor: colors.muted }]}>
                      {/* Simulated PDF page thumbnail */}
                      <View style={[detailStyles.pdfPage, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: "#000" }]}>
                        <View style={[detailStyles.pdfPageHeader, { backgroundColor: catColor + "18" }]} />
                        {[80, 65, 75, 55, 70].map((w, i) => (
                          <View key={i} style={[detailStyles.pdfPageLine, { backgroundColor: colors.border, width: `${w}%` as any }]} />
                        ))}
                        <View style={[detailStyles.pdfPageLine, { backgroundColor: colors.border, width: "40%" as any }]} />
                        <View style={{ flex: 1 }} />
                        <View style={[detailStyles.pdfStamp, { backgroundColor: catColor + "18", borderColor: catColor + "40" }]}>
                          <Feather name={isVerified ? "check-circle" : "file"} size={12} color={catColor} />
                        </View>
                      </View>
                      {/* Shadow overlay */}
                      <View style={detailStyles.pdfThumbOverlay} />
                    </View>
                    <View style={[detailStyles.pdfCardInfo, { borderTopColor: colors.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Feather name="file-text" size={14} color={colors.mutedForeground} />
                        <Text style={[detailStyles.pdfCardSize, { color: colors.mutedForeground }]}>{selected.size}</Text>
                        {isVerified ? (
                          <View style={[detailStyles.verifiedChip, { backgroundColor: "#10b98115" }]}>
                            <Feather name="shield" size={10} color="#10b981" />
                            <Text style={[detailStyles.verifiedChipText, { color: "#10b981" }]}>{DOC_STRINGS.verified[lang]}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={[detailStyles.pdfOpenBtn, { backgroundColor: catColor + "18" }]}>
                        <Feather name="eye" size={14} color={catColor} />
                        <Text style={[detailStyles.pdfOpenBtnText, { color: catColor }]}>{DOC_STRINGS.openPdf[lang]}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* ── Metadata section — all 9 fields ── */}
                <View style={detailStyles.section}>
                  <Text style={[detailStyles.sectionLabel, { color: colors.mutedForeground }]}>
                    {DOC_STRINGS.metadata[lang]}
                  </Text>
                  <View style={[detailStyles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {([
                      { icon: "hash"        as const, label: DOC_STRINGS.docNumber[lang],       value: docRef,                                                  valueColor: undefined                                                                                     },
                      { icon: "layers"      as const, label: DOC_STRINGS.version[lang],          value: "v1.0",                                                  valueColor: undefined                                                                                     },
                      { icon: "tag"         as const, label: DOC_STRINGS.category[lang],         value: t(CATS.find((c) => c.key === selected.category)?.labelKey ?? selected.category),  valueColor: catColor                                                             },
                      { icon: "activity"    as const, label: DOC_STRINGS.status[lang],           value: sc.label,                                                valueColor: sc.color                                                                                      },
                      { icon: "calendar"    as const, label: DOC_STRINGS.createdDate[lang],      value: selected.date,                                           valueColor: undefined                                                                                     },
                      { icon: "refresh-cw"  as const, label: DOC_STRINGS.updatedDate[lang],      value: selected.date,                                           valueColor: undefined                                                                                     },
                      { icon: "user"        as const, label: DOC_STRINGS.createdBy[lang],        value: user?.name ?? "—",                                       valueColor: undefined                                                                                     },
                      { icon: "edit-3"      as const, label: DOC_STRINGS.signatureStatus[lang],  value: isSigned ? DOC_STRINGS.signed[lang] : isValid ? DOC_STRINGS.validated[lang] : DOC_STRINGS.pending[lang],  valueColor: isSigned ? "#8b5cf6" : isValid ? "#10b981" : colors.mutedForeground },
                      { icon: "shield"      as const, label: DOC_STRINGS.verification[lang],     value: isVerified ? DOC_STRINGS.verified[lang] : DOC_STRINGS.notVerified[lang],    valueColor: isVerified ? "#10b981" : colors.mutedForeground                       },
                    ] as { icon: keyof typeof Feather.glyphMap; label: string; value: string; valueColor: string | undefined }[]).map((item, i, arr) => (
                      <View key={item.label}>
                        <View style={detailStyles.metaRow}>
                          <View style={[detailStyles.metaIconBox, { backgroundColor: colors.muted }]}>
                            <Feather name={item.icon} size={13} color={item.valueColor ?? colors.mutedForeground} />
                          </View>
                          <Text style={[detailStyles.metaLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                          <Text style={[detailStyles.metaValue, { color: item.valueColor ?? colors.foreground }]} numberOfLines={1}>
                            {item.value}
                          </Text>
                        </View>
                        {i < arr.length - 1 ? <View style={[detailStyles.metaSep, { backgroundColor: colors.border }]} /> : null}
                      </View>
                    ))}
                  </View>
                </View>

                {/* ── Quick actions — responsive 3-column grid ── */}
                <View style={detailStyles.section}>
                  <Text style={[detailStyles.sectionLabel, { color: colors.mutedForeground }]}>
                    {DOC_STRINGS.actions[lang]}
                  </Text>
                  <View style={detailStyles.actionsGrid}>
                    {/* Download */}
                    <TouchableOpacity
                      style={[detailStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => startDownload(selected)}
                      activeOpacity={0.78}
                    >
                      <View style={[detailStyles.actionIcon, { backgroundColor: colors.primary + "15" }]}>
                        <Feather name="download" size={20} color={colors.primary} />
                      </View>
                      <Text style={[detailStyles.actionCardLabel, { color: colors.foreground }]}>{DOC_STRINGS.download[lang]}</Text>
                    </TouchableOpacity>

                    {/* Share */}
                    <TouchableOpacity
                      style={[detailStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); startDownload(selected, "share"); }}
                      activeOpacity={0.78}
                    >
                      <View style={[detailStyles.actionIcon, { backgroundColor: "#3b82f615" }]}>
                        <Feather name="share-2" size={20} color="#3b82f6" />
                      </View>
                      <Text style={[detailStyles.actionCardLabel, { color: colors.foreground }]}>{DOC_STRINGS.share[lang]}</Text>
                    </TouchableOpacity>

                    {/* QR Code verification */}
                    <TouchableOpacity
                      style={[detailStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={handleShowQR}
                      activeOpacity={0.78}
                    >
                      <View style={[detailStyles.actionIcon, { backgroundColor: "#06b6d415" }]}>
                        <Feather name="grid" size={20} color="#06b6d4" />
                      </View>
                      <Text style={[detailStyles.actionCardLabel, { color: colors.foreground }]}>{DOC_STRINGS.qrVerify[lang]}</Text>
                    </TouchableOpacity>

                    {/* Comments */}
                    <TouchableOpacity
                      style={[detailStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={handleShowComments}
                      activeOpacity={0.78}
                    >
                      <View style={[detailStyles.actionIcon, { backgroundColor: "#f59e0b15" }]}>
                        <Feather name="message-square" size={20} color="#f59e0b" />
                      </View>
                      <Text style={[detailStyles.actionCardLabel, { color: colors.foreground }]}>{DOC_STRINGS.comments[lang]}</Text>
                    </TouchableOpacity>

                    {/* Version history */}
                    <TouchableOpacity
                      style={[detailStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={handleShowVersions}
                      activeOpacity={0.78}
                    >
                      <View style={[detailStyles.actionIcon, { backgroundColor: "#64748b15" }]}>
                        <Feather name="clock" size={20} color="#64748b" />
                      </View>
                      <Text style={[detailStyles.actionCardLabel, { color: colors.foreground }]}>{DOC_STRINGS.history[lang]}</Text>
                    </TouchableOpacity>

                    {/* Sign or Edit depending on status */}
                    {isAdmin && ["generated", "validated"].includes(selected.status) ? (
                      <TouchableOpacity
                        style={[detailStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={openSign}
                        activeOpacity={0.78}
                      >
                        <View style={[detailStyles.actionIcon, { backgroundColor: "#8b5cf615" }]}>
                          <Feather name="edit-3" size={20} color="#8b5cf6" />
                        </View>
                        <Text style={[detailStyles.actionCardLabel, { color: colors.foreground }]}>{DOC_STRINGS.sign[lang]}</Text>
                      </TouchableOpacity>
                    ) : isAdmin ? (
                      <TouchableOpacity
                        style={[detailStyles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => openEdit(selected)}
                        activeOpacity={0.78}
                      >
                        <View style={[detailStyles.actionIcon, { backgroundColor: colors.primary + "15" }]}>
                          <Feather name="edit-2" size={20} color={colors.primary} />
                        </View>
                        <Text style={[detailStyles.actionCardLabel, { color: colors.foreground }]}>{DOC_STRINGS.edit[lang]}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {/* ── Signature order panel ── */}
                <View style={detailStyles.section}>
                  <Text style={[detailStyles.sectionLabel, { color: colors.mutedForeground }]}>
                    {docText("signaturePanelTitle")}
                  </Text>
                  <SignatureOrderPanel
                    key={sigPanelKey}
                    documentId={selected.id}
                    onSignPress={["generated", "validated"].includes(selected.status) ? openSign : undefined}
                  />
                </View>

                {/* ── Validation workflow — admin only ── */}
                {isAdmin ? (
                  <View style={detailStyles.section}>
                    <Text style={[detailStyles.sectionLabel, { color: colors.mutedForeground }]}>
                      {DOC_STRINGS.workflow[lang]}
                    </Text>
                    <View style={[detailStyles.workflowCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      {/* Current status indicator */}
                      <View style={detailStyles.wfStatusRow}>
                        <View style={[detailStyles.wfStatusDot, { backgroundColor: sc.color }]} />
                        <Text style={[detailStyles.wfStatusLabel, { color: colors.mutedForeground }]}>
                          {DOC_STRINGS.currentStatus[lang]}
                        </Text>
                        <View style={[detailStyles.wfStatusChip, { backgroundColor: sc.color + "18" }]}>
                          <Text style={[detailStyles.wfStatusChipText, { color: sc.color }]}>{sc.label}</Text>
                        </View>
                      </View>

                      <View style={[detailStyles.wfDivider, { backgroundColor: colors.border }]} />

                      {/* Submit for review */}
                      {["draft", "generated"].includes(selected.status) ? (
                        <TouchableOpacity
                          style={[detailStyles.wfPrimaryBtn, { backgroundColor: "#f59e0b", opacity: workflowBusy ? 0.55 : 1 }]}
                          onPress={handleSubmitForReview}
                          disabled={workflowBusy}
                        >
                          {workflowBusy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="send" size={16} color="#fff" />}
                          <Text style={detailStyles.wfPrimaryBtnText}>{DOC_STRINGS.submitReview[lang]}</Text>
                        </TouchableOpacity>
                      ) : null}

                      {/* Approve / Reject */}
                      {selected.status === "pending_review" ? (
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <TouchableOpacity
                            style={[detailStyles.wfPrimaryBtn, { flex: 1, backgroundColor: "#10b981", opacity: workflowBusy ? 0.55 : 1 }]}
                            onPress={handleApproveDoc}
                            disabled={workflowBusy}
                          >
                            {workflowBusy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={16} color="#fff" />}
                            <Text style={detailStyles.wfPrimaryBtnText}>{DOC_STRINGS.approve[lang]}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[detailStyles.wfPrimaryBtn, { flex: 1, backgroundColor: "#ef4444", opacity: workflowBusy ? 0.55 : 1 }]}
                            onPress={() => { setRejectReason(""); setShowRejectModal(true); }}
                            disabled={workflowBusy}
                          >
                            <Feather name="x-circle" size={16} color="#fff" />
                            <Text style={detailStyles.wfPrimaryBtnText}>{DOC_STRINGS.reject[lang]}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {/* Publish */}
                      {["validated", "signed"].includes(selected.status) ? (
                        <TouchableOpacity
                          style={[detailStyles.wfPrimaryBtn, { backgroundColor: "#10b981", opacity: workflowBusy ? 0.55 : 1 }]}
                          onPress={handlePublishDoc}
                          disabled={workflowBusy}
                        >
                          {workflowBusy ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="globe" size={16} color="#fff" />}
                          <Text style={detailStyles.wfPrimaryBtnText}>{DOC_STRINGS.publish[lang]}</Text>
                        </TouchableOpacity>
                      ) : null}

                      {/* Archive + Delete */}
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {selected.status === "published" ? (
                          <TouchableOpacity
                            style={[detailStyles.wfOutlineBtn, { flex: 1, borderColor: "#64748b40", opacity: workflowBusy ? 0.55 : 1 }]}
                            onPress={handleArchiveDoc}
                            disabled={workflowBusy}
                          >
                            <Feather name="archive" size={14} color="#64748b" />
                            <Text style={[detailStyles.wfOutlineBtnText, { color: "#64748b" }]}>{DOC_STRINGS.archive[lang]}</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[detailStyles.wfOutlineBtn, { flex: 1, borderColor: "#ef444440" }]}
                          onPress={handleDelete}
                        >
                          <Feather name="trash-2" size={14} color="#ef4444" />
                          <Text style={[detailStyles.wfOutlineBtnText, { color: "#ef4444" }]}>{DOC_STRINGS.delete[lang]}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : null}

                {/* bottom padding */}
                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          );
        })() : null}
      </Modal>

      {/* ── Signature modal ── */}
      <Modal visible={showSign} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowSign(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginStart: 12 }}>
               <Text style={[styles.modalTitle, { color: colors.foreground }]}>{docText("handwrittenSignature")}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
               {docText("signatureGuidance")}
            </Text>
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignSelf: "center" }}>
              <SignaturePad
                ref={sigPadRef}
                width={320}
                height={180}
                onChange={(svg, isEmpty) => { sigSvgRef.current = svg; setSigEmpty(isEmpty); }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.secBtn, { flex: 1, borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => { sigPadRef.current?.clear(); }}
              >
                <Feather name="rotate-ccw" size={16} color={colors.foreground} />
                 <Text style={[styles.secBtnText, { color: colors.foreground }]}>{docText("clear")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryAction, { flex: 1, backgroundColor: sigEmpty ? colors.mutedForeground : "#8b5cf6", opacity: signing ? 0.7 : 1 }]}
                disabled={sigEmpty || signing}
                onPress={handleConfirmSign}
              >
                {signing ? <ActivityIndicator color="#fff" /> : <Feather name="check" size={18} color="#fff" />}
                <Text style={styles.primaryActionText}>{signing ? docText("sending") : docText("confirmSignature")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Document Wizard (7-step generate modal) ── */}
      <DocumentWizard
        visible={showGenerate}
        onClose={() => { setShowGenerate(false); }}
        onComplete={(_docId) => {
          setShowGenerate(false);
          refreshDocuments();
        }}
      />

      {/* ── Edit modal ── */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{docText("editDocument")}</Text>
            <TouchableOpacity onPress={() => setShowEdit(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{docText("titleLabel")}</Text>
              <TextInput
                style={[styles.fieldInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{docText("contentLabel")}</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, minHeight: 180, textAlignVertical: "top" }]}
                value={editContent}
                onChangeText={setEditContent}
                placeholder={docText("contentPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>
            <TouchableOpacity
              style={[styles.primaryAction, { backgroundColor: colors.primary, opacity: savingEdit ? 0.6 : 1 }]}
              onPress={handleSaveEdit}
              disabled={savingEdit}
            >
              {savingEdit ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={18} color="#fff" />}
              <Text style={styles.primaryActionText}>{savingEdit ? docText("saving") : docText("save")}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Reject reason modal ── */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.overlayTitle, { color: colors.foreground }]}>{docText("rejectDocument")}</Text>
            <Text style={[styles.overlaySub, { color: colors.mutedForeground }]}>
              {docText("rejectGuidance")}
            </Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldTextArea, { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground, minHeight: 100, textAlignVertical: "top" }]}
              placeholder={docText("rejectionReasonPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.overlayBtn, { backgroundColor: colors.muted, flex: 1 }]}
                onPress={() => { setShowRejectModal(false); setRejectReason(""); }}
              >
                <Text style={[styles.overlayBtnText, { color: colors.foreground }]}>{docText("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.overlayBtn, { backgroundColor: rejectReason.trim() ? "#ef4444" : "#ef444460", flex: 1, opacity: workflowBusy ? 0.6 : 1 }]}
                onPress={handleRejectDoc}
                disabled={!rejectReason.trim() || workflowBusy}
              >
                {workflowBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.overlayBtnText, { color: "#fff" }]}>{docText("confirmRejection")}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Version history modal ── */}
      <Modal visible={showVersions} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowVersions(false)}>
              <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{docText("versionHistory")}</Text>
            </View>
            <Feather name="clock" size={20} color={colors.mutedForeground} />
          </View>
          {versionsLoading ? (
            <View style={styles.empty}><ActivityIndicator color={colors.primary} /></View>
          ) : versions.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="clock" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{docText("noPreviousVersions")}</Text>
            </View>
          ) : (
            <FlatList
              data={versions}
              keyExtractor={(v) => v.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
              renderItem={({ item: v }) => (
                <View style={[styles.versionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.versionBadge, { backgroundColor: colors.primary + "15" }]}>
                    <Text style={[styles.versionBadgeText, { color: colors.primary }]}>v{v.versionNumber}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.versionTitle, { color: colors.foreground }]} numberOfLines={1}>{v.title}</Text>
                    <Text style={[styles.versionMeta, { color: colors.mutedForeground }]}>
                      {new Date(v.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                      {v.createdByName ? `  ·  ${v.createdByName}` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.versionRestoreBtn, { backgroundColor: colors.primary, opacity: restoringVersion === v.id ? 0.6 : 1 }]}
                    disabled={restoringVersion !== null}
                    onPress={() => handleRestoreVersion(v.id, v.versionNumber)}
                  >
                    {restoringVersion === v.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Feather name="rotate-ccw" size={14} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── QR Code modal ── */}
      <Modal visible={showQR} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.card, alignItems: "center" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: "100%" }}>
              <Feather name="grid" size={20} color="#06b6d4" />
              <Text style={[styles.overlayTitle, { color: colors.foreground, flex: 1 }]}>{docText("qrVerificationTitle")}</Text>
              <TouchableOpacity onPress={() => setShowQR(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.overlaySub, { color: colors.mutedForeground, textAlign: "center" }]}>
              {docText("qrVerificationGuidance")}
            </Text>
            {qrLoading ? (
              <View style={{ height: 200, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color="#06b6d4" size="large" />
              </View>
            ) : qrDataUrl ? (
              <View style={[styles.qrContainer, { backgroundColor: "#fff", borderColor: colors.border }]}>
                {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
                <Image source={{ uri: qrDataUrl }} style={{ width: 200, height: 200 }} resizeMode="contain" />
              </View>
            ) : (
              <View style={{ height: 160, alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
                <Text style={[styles.overlaySub, { color: colors.mutedForeground }]}>{docText("qrUnavailable")}</Text>
              </View>
            )}
            <Text style={[styles.versionMeta, { color: colors.mutedForeground, textAlign: "center" }]}>
              {selected?.id.slice(0, 12).toUpperCase()}
            </Text>
          </View>
        </View>
      </Modal>

      {/* ── Comments modal ── */}
      <Modal visible={showComments} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowComments(false)}>
              <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{docText("commentsTitle")}</Text>
            </View>
            <Feather name="message-square" size={20} color="#f59e0b" />
          </View>

          {/* Comment input */}
          <View style={[styles.commentInputRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              style={[styles.commentInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
              placeholder={docText("commentPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.commentSendBtn, { backgroundColor: commentText.trim() ? "#f59e0b" : colors.muted, opacity: postingComment ? 0.6 : 1 }]}
              onPress={handlePostComment}
              disabled={!commentText.trim() || postingComment}
            >
              {postingComment
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="send" size={16} color="#fff" />
              }
            </TouchableOpacity>
          </View>

          {commentsLoading ? (
            <View style={styles.empty}><ActivityIndicator color="#f59e0b" /></View>
          ) : comments.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="message-square" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{docText("noComments")}</Text>
              <Text style={[styles.versionMeta, { color: colors.mutedForeground }]}>{docText("firstComment")}</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
              renderItem={({ item: c }) => (
                <View style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <View style={[styles.commentAvatar, { backgroundColor: colors.primary + "20" }]}>
                      <Text style={[styles.commentAvatarText, { color: colors.primary }]}>
                        {(c.authorName ?? "?")[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{c.authorName ?? docText("unknownAuthor")}</Text>
                      <Text style={[styles.versionMeta, { color: colors.mutedForeground }]}>
                        {new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    {isAdmin ? (
                      <TouchableOpacity
                        onPress={() => handleDeleteComment(c.id)}
                        disabled={deletingComment === c.id}
                        style={{ padding: 4 }}
                      >
                        {deletingComment === c.id
                          ? <ActivityIndicator size="small" color="#ef4444" />
                          : <Feather name="trash-2" size={14} color="#ef4444" />
                        }
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text style={[styles.commentContent, { color: colors.foreground }]}>{c.content}</Text>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:             { flex: 1 },
  header:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn:          { padding: 4 },
  title:            { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle:         { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  generateBtn:      { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  // Bundle menu
  bundleMenu:       { position: "absolute", right: 14, zIndex: 100, borderWidth: 1, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8, overflow: "hidden" as const, minWidth: 260 },
  bundleMenuTitle:  { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" as const, padding: 12, paddingBottom: 6 },
  bundleMenuItem:   { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, padding: 14, borderBottomWidth: 1 },
  bundleMenuIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: "center" as const, justifyContent: "center" as const },
  bundleMenuItemLabel: { fontSize: 13, fontWeight: "700" },
  bundleMenuItemSub:   { fontSize: 11, marginTop: 1 },
  searchWrap:       { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput:      { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  statsRow:         { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1 },
  statItem:         { flex: 1, alignItems: "center", gap: 2 },
  statCount:        { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel:        { fontSize: 10, fontFamily: "Inter_400Regular" },
  empty:            { alignItems: "center", gap: 12, marginTop: 60 },
  emptyText:        { fontSize: 14, fontFamily: "Inter_400Regular" },
  docCard:          { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, gap: 12 },
  docIcon:          { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docTitle:         { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  docMeta:          { flexDirection: "row", alignItems: "center", gap: 4 },
  docDate:          { fontSize: 11, fontFamily: "Inter_400Regular" },
  docDot:           { fontSize: 10 },
  docSize:          { fontSize: 11, fontFamily: "Inter_400Regular" },
  docStatus:        { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  docStatusText:    { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  downloadBtn:      { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  // Download overlay
  dlOverlay:        { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -4 } },
  dlHeader:         { flexDirection: "row", alignItems: "center" },
  dlTitle:          { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dlSub:            { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  dlCancel:         { padding: 6 },
  dlBarBg:          { height: 6, borderRadius: 3, marginTop: 10, overflow: "hidden" },
  dlBarFill:        { height: 6, borderRadius: 3 },
  dlPct:            { fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 4, textAlign: "right" as const },
  dlBtn:            { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  dlBtnText:        { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  // Modals
  modal:            { flex: 1 },
  modalHeader:      { flexDirection: "row", alignItems: "center", padding: 20, borderBottomWidth: 1, gap: 4 },
  modalTitle:       { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
  previewArea:      { borderRadius: 20, borderWidth: 1, padding: 30, alignItems: "center", gap: 10 },
  previewIcon:      { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  previewTitle:     { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  previewCat:       { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  metaCard:         { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sep:              { height: 1, marginHorizontal: 14 },
  metaRow:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  metaLabel:        { fontSize: 13, fontFamily: "Inter_400Regular" },
  metaValue:        { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  primaryAction:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14 },
  primaryActionText:{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  secondaryActions: { flexDirection: "row", gap: 10 },
  secBtn:           { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  secBtnText:       { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  genSectionLabel:  { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
  templatesGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  templateCard:     { width: "47%", borderRadius: 16, padding: 14, gap: 8, position: "relative" },
  templateIcon:     { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  templateName:     { fontSize: 13, fontFamily: "Inter_700Bold" },
  templateDesc:     { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  selectedCheck:    { position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  genPreviewBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  genPreviewText:   { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  fieldLabel:       { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput:       { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldTextArea:    { minHeight: 80, textAlignVertical: "top" },
  langChip:         { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  genHint:          { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  genHintText:      { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  // Reject / overlay modals
  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  overlayCard:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
  overlayTitle:     { fontSize: 17, fontFamily: "Inter_700Bold" },
  overlaySub:       { fontSize: 13, fontFamily: "Inter_400Regular" },
  overlayBtn:       { paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  overlayBtnText:   { fontSize: 14, fontFamily: "Inter_700Bold" },
  // Version history
  versionCard:      { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  versionBadge:     { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  versionBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  versionTitle:     { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  versionMeta:      { fontSize: 11, fontFamily: "Inter_400Regular" },
  versionRestoreBtn:{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  // QR Code
  qrContainer:      { width: 224, height: 224, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 12 },
  // Comments
  commentInputRow:  { flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 12, borderBottomWidth: 1 },
  commentInput:     { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: "Inter_400Regular", maxHeight: 100 },
  commentSendBtn:   { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  commentCard:      { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  commentAvatar:    { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  commentAvatarText:{ fontSize: 13, fontFamily: "Inter_700Bold" },
  commentAuthor:    { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  commentContent:   { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
});

// ─── Detail modal styles (premium enterprise redesign) ────────────────────────

const detailStyles = StyleSheet.create({
  // Root & header
  root:               { flex: 1 },
  header:             { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 10 },
  headerBtn:          { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  headerTitle:        { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", textAlign: "center" as const },
  headerDocType:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  headerDocTypeText:  { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Scroll container
  scrollContent:      { paddingBottom: 60 },

  // ── Hero band ──
  heroBand:           { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18, gap: 14 },
  heroIconRow:        { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  heroIconWrap:       { width: 50, height: 50, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  heroRef:            { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.72)", letterSpacing: 1.4, marginBottom: 5, textTransform: "uppercase" as const },
  heroTitle:          { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff", lineHeight: 23 },
  heroBadgeRow:       { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  heroPill:           { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)" },
  heroPillText:       { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.92)" },
  heroStatusPill:     { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroStatusDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.85)" },
  heroStatusText:     { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },

  // ── Generic section ──
  section:            { paddingHorizontal: 16, paddingTop: 22 },
  sectionLabel:       { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.3, marginBottom: 10, textTransform: "uppercase" as const },

  // ── PDF preview card ──
  pdfCard:            { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  pdfThumb:           { height: 150, alignItems: "center", justifyContent: "center" },
  pdfPage:            { width: 88, height: 118, borderRadius: 6, borderWidth: 1, padding: 9, gap: 5, alignItems: "flex-start", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  pdfPageHeader:      { width: "100%", height: 10, borderRadius: 3, marginBottom: 2 },
  pdfPageLine:        { height: 5, borderRadius: 3 },
  pdfStamp:           { position: "absolute", bottom: 7, right: 7, width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pdfThumbOverlay:    { position: "absolute", bottom: 0, left: 0, right: 0, height: 30 },
  pdfCardInfo:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1 },
  pdfCardSize:        { fontSize: 12, fontFamily: "Inter_400Regular" },
  verifiedChip:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, marginLeft: 6 },
  verifiedChipText:   { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  pdfOpenBtn:         { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  pdfOpenBtnText:     { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // ── Metadata grid ──
  metaCard:           { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  metaRow:            { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  metaIconBox:        { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  metaLabel:          { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  metaValue:          { fontSize: 13, fontFamily: "Inter_600SemiBold", maxWidth: "52%", textAlign: "right" as const },
  metaSep:            { height: 1, marginHorizontal: 14 },

  // ── Actions grid ──
  actionsGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard:         { borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center", gap: 8, minWidth: "30%", flexGrow: 1, flexBasis: "30%" },
  actionIcon:         { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  actionCardLabel:    { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" as const },

  // ── Workflow card ──
  workflowCard:       { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  wfStatusRow:        { flexDirection: "row", alignItems: "center", gap: 8 },
  wfStatusDot:        { width: 8, height: 8, borderRadius: 4 },
  wfStatusLabel:      { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  wfStatusChip:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  wfStatusChipText:   { fontSize: 12, fontFamily: "Inter_700Bold" },
  wfDivider:          { height: 1 },
  wfPrimaryBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  wfPrimaryBtnText:   { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  wfOutlineBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  wfOutlineBtnText:   { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
