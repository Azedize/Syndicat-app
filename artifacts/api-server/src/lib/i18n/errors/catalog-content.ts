import type { ErrorEntries } from "./types.js";

/** Documents, signatures, claims, incidents, announcements, support, statistics, chat. */
export const CONTENT_ERRORS: ErrorEntries = {
  // ── Documents ──
  "Document introuvable": ["DOCUMENT_NOT_FOUND", "Document not found.", "الوثيقة غير موجودة."],
  "Version introuvable": ["VERSION_NOT_FOUND", "Version not found.", "النسخة غير موجودة."],
  "Document ou version invalide": ["DOCUMENT_OR_VERSION_INVALID", "Invalid document or version.", "وثيقة أو نسخة غير صالحة."],
  "La supervision est requise pour accéder à ce document.": ["SUPERVISION_REQUIRED", "Supervision mode is required to access this document.", "وضع الإشراف مطلوب للوصول إلى هذه الوثيقة."],
  "La supervision est requise pour restaurer ce document.": ["SUPERVISION_REQUIRED", "Supervision mode is required to restore this document.", "وضع الإشراف مطلوب لاسترجاع هذه الوثيقة."],
  "La supervision est requise pour purger ce document.": ["SUPERVISION_REQUIRED", "Supervision mode is required to purge this document.", "وضع الإشراف مطلوب لحذف هذه الوثيقة نهائيًا."],
  "La supervision est requise pour signer ce document.": ["SUPERVISION_REQUIRED", "Supervision mode is required to sign this document.", "وضع الإشراف مطلوب لتوقيع هذه الوثيقة."],
  "Ce document n'est pas supprimé": ["DOCUMENT_NOT_DELETED", "This document is not deleted.", "هذه الوثيقة غير محذوفة."],
  "Effectuez d'abord une suppression logique avant de purger": ["DELETE_BEFORE_PURGE", "Delete the document first, then purge it.", "احذف الوثيقة أولًا ثم احذفها نهائيًا."],
  "Les données de signature ne sont pas un SVG valide": ["SIGNATURE_INVALID", "The signature is not valid.", "التوقيع غير صالح."],
  "Vous avez déjà signé ce document": ["ALREADY_SIGNED", "You have already signed this document.", "لقد وقّعت هذه الوثيقة بالفعل."],
  "Erreur serveur lors de la génération du document": ["DOCUMENT_GENERATION_FAILED", "The document could not be generated.", "تعذّر إنشاء الوثيقة."],
  "Erreur serveur lors de la soumission de la demande": ["REQUEST_SUBMIT_FAILED", "The request could not be submitted.", "تعذّر إرسال الطلب."],
  "source invalide (generated | upload)": ["INVALID_SOURCE", "Invalid document source.", "مصدر وثيقة غير صالح.", "Source du document invalide"],
  "Utilisez POST /documents/upload pour ajouter un document": ["USE_DOCUMENT_UPLOAD", "Add documents from the Documents screen.", "أضف الوثائق من شاشة الوثائق.", "Ajoutez les documents depuis l'écran Documents."],
  "Utilisez POST /documents/upload": ["USE_DOCUMENT_UPLOAD", "Add documents from the Documents screen.", "أضف الوثائق من شاشة الوثائق.", "Ajoutez les documents depuis l'écran Documents."],
  "Utilisez DELETE /documents/:id (suppression logique)": ["USE_DOCUMENT_DELETE", "Delete documents from the Documents screen.", "احذف الوثائق من شاشة الوثائق.", "Supprimez les documents depuis l'écran Documents."],
  "Demande introuvable": ["REQUEST_NOT_FOUND", "Request not found.", "الطلب غير موجود."],

  // ── Claims and incidents ──
  "Ticket introuvable": ["TICKET_NOT_FOUND", "Ticket not found.", "التذكرة غير موجودة."],
  "Commentaire introuvable": ["COMMENT_NOT_FOUND", "Comment not found.", "التعليق غير موجود."],
  "Commentaire vide": ["COMMENT_EMPTY", "The comment is empty.", "التعليق فارغ."],
  "Motif de clôture requis": ["CLOSE_REASON_REQUIRED", "A closing reason is required.", "سبب الإغلاق مطلوب."],
  "Module remplacé : utilisez /claims (réclamations de la copropriété)": ["USE_CLAIMS", "This feature was replaced: use the condominium's claims.", "تم تعويض هذه الخاصية: استعمل شكايات الملكية المشتركة.", "Fonction remplacée : utilisez les réclamations de la copropriété."],
  "Seuls les administrateurs peuvent contacter le support plateforme.": ["SUPPORT_ADMINS_ONLY", "Only administrators can contact platform support.", "وحدهم المسؤولون يمكنهم التواصل مع دعم المنصة."],
  "Seuls les tickets syndicat peuvent être escaladés.": ["ESCALATION_NOT_ALLOWED", "Only condominium tickets can be escalated.", "لا يمكن تصعيد إلا تذاكر الملكية المشتركة."],
  "buildingId, type, description et date sont obligatoires": ["INCIDENT_FIELDS_REQUIRED", "Building, type, description and date are required.", "العمارة والنوع والوصف والتاريخ إلزامية.", "L'immeuble, le type, la description et la date sont obligatoires."],
  "Sinistre introuvable": ["INCIDENT_NOT_FOUND", "Incident not found.", "الحادث غير موجود."],
  "Sinistre introuvable ou accès refusé": ["INCIDENT_NOT_FOUND", "Incident not found or access denied.", "الحادث غير موجود أو تم رفض الوصول."],

  // ── Announcements, alerts, publications ──
  "Annonce introuvable": ["ANNOUNCEMENT_NOT_FOUND", "Announcement not found.", "الإعلان غير موجود."],
  "Alerte introuvable": ["ALERT_NOT_FOUND", "Notification not found.", "الإشعار غير موجود."],
  "Publication introuvable": ["PUBLICATION_NOT_FOUND", "Publication not found.", "المنشور غير موجود."],

  // ── Statistics, email log ──
  "Les Super Admins doivent activer le mode supervision pour accéder aux statistiques d'un syndicat.": ["SUPERVISION_REQUIRED", "Platform administrators must turn on supervision mode to access a condominium's statistics.", "يجب على مسؤولي المنصة تفعيل وضع الإشراف للوصول إلى إحصائيات ملكية مشتركة."],
  "Email log introuvable": ["EMAIL_LOG_NOT_FOUND", "Email record not found.", "سجل البريد غير موجود."],
  "Corps de l'email introuvable — impossible de renvoyer": ["EMAIL_BODY_MISSING", "The email content is not available: it cannot be sent again.", "محتوى البريد غير متاح: لا يمكن إعادة إرساله."],

  // ── Chat ──
  "Délai de suppression dépassé (60 minutes)": ["CHAT_DELETE_WINDOW_PASSED", "Too late to delete (60 minutes).", "انقضت مهلة الحذف (60 دقيقة)."],
  "Délai de modification dépassé (15 minutes)": ["CHAT_EDIT_WINDOW_PASSED", "Too late to edit (15 minutes).", "انقضت مهلة التعديل (15 دقيقة)."],
};
