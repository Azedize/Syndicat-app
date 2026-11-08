import type { ErrorEntries } from "./types.js";

/** Budgets, calls for funds, payments, receipts, treasury, expenses, invoices, subscriptions. */
export const FINANCE_ERRORS: ErrorEntries = {
  // ── Access ──
  "La supervision et le syndicat cible sont requis pour accéder aux finances d'un syndicat.": ["SUPERVISION_REQUIRED", "Supervision mode and the target condominium are required to access a condominium's finances.", "وضع الإشراف والملكية المشتركة المستهدفة مطلوبان للوصول إلى مالية ملكية مشتركة."],
  "Les Super Admins doivent activer la supervision et préciser le syndicat cible pour accéder aux pièces financières.": ["SUPERVISION_REQUIRED", "Platform administrators must turn on supervision and select the target condominium to access financial documents.", "يجب على مسؤولي المنصة تفعيل الإشراف وتحديد الملكية المشتركة للوصول إلى الوثائق المالية."],
  "Ressource financière introuvable": ["FINANCE_ITEM_NOT_FOUND", "Financial item not found.", "العنصر المالي غير موجود."],
  "Vous ne pouvez accéder qu'aux pièces de vos propres charges": ["OWN_CHARGES_ONLY", "You can only access the documents of your own charges.", "يمكنك الوصول فقط إلى وثائق تكاليفك الخاصة."],
  "appelDeFondsId, url et filename sont obligatoires": ["ATTACHMENT_FIELDS_REQUIRED", "The call for funds and the file are required.", "طلب الأداء والملف مطلوبان.", "L'appel de fonds et le fichier sont obligatoires."],
  "invoiceId, url et filename sont obligatoires": ["ATTACHMENT_FIELDS_REQUIRED", "The invoice and the file are required.", "الفاتورة والملف مطلوبان.", "La facture et le fichier sont obligatoires."],

  // ── Budgets ──
  "Budget introuvable": ["BUDGET_NOT_FOUND", "Budget not found.", "الميزانية غير موجودة."],
  "Budget not found": ["BUDGET_NOT_FOUND", "Budget not found.", "الميزانية غير موجودة.", "Budget introuvable"],
  "year and buildingId are required": ["YEAR_AND_BUILDING_REQUIRED", "Year and building are required.", "السنة والعمارة مطلوبتان.", "L'année et l'immeuble sont obligatoires."],
  "Un budget est créé en brouillon ; son approbation se fait en AG.": ["BUDGET_DRAFT_ONLY", "A budget is created as a draft; it is approved in a general assembly.", "تُنشأ الميزانية كمسودة؛ وتتم المصادقة عليها في الجمع العام."],
  "Budget approuvé en AG : ses montants ne peuvent plus être modifiés sans nouvelle délibération.": ["BUDGET_APPROVED_LOCKED", "Budget approved in a general assembly: its amounts cannot change without a new resolution.", "ميزانية مصادق عليها في الجمع العام: لا يمكن تعديل مبالغها دون مداولة جديدة."],
  "L'approbation d'un budget doit référencer l'assemblée générale qui l'a voté.": ["BUDGET_APPROVAL_NEEDS_ASSEMBLY", "A budget approval must reference the general assembly that voted it.", "يجب أن تشير المصادقة على الميزانية إلى الجمع العام الذي صوّت عليها."],
  "La réunion sélectionnée n'appartient pas au syndicat du budget": ["MEETING_NOT_IN_CONDOMINIUM", "The selected meeting does not belong to the budget's condominium.", "الاجتماع المختار لا ينتمي إلى ملكية الميزانية."],
  "Un prestataire n'appartient pas à cet immeuble": ["SUPPLIER_NOT_IN_BUILDING", "A supplier does not belong to this building.", "أحد مقدمي الخدمات لا ينتمي إلى هذه العمارة."],

  // ── Calls for funds ──
  "Appel de fonds introuvable": ["FUNDS_CALL_NOT_FOUND", "Call for funds not found.", "طلب الأداء غير موجود."],
  "La copropriété doit être active pour émettre des appels de fonds.": ["CONDOMINIUM_NOT_ACTIVE", "The condominium must be active to issue calls for funds.", "يجب أن تكون الملكية المشتركة نشطة لإصدار طلبات الأداء."],
  "Le budget doit être approuvé en assemblée générale avant d'émettre des appels de fonds.": ["BUDGET_NOT_APPROVED", "The budget must be approved in a general assembly before issuing calls for funds.", "يجب المصادقة على الميزانية في الجمع العام قبل إصدار طلبات الأداء."],
  "Seul un appel sans paiement validé ni en attente peut être annulé.": ["FUNDS_CALL_NOT_CANCELLABLE", "Only a call with no validated or pending payment can be cancelled.", "لا يمكن إلغاء إلا طلب أداء دون أداء مصادق عليه أو قيد الانتظار."],
  "Un motif d'annulation est obligatoire": ["CANCEL_REASON_REQUIRED", "A cancellation reason is required.", "سبب الإلغاء إلزامي."],
  "Les cotisations sont remplacées par les appels de fonds : déclarez et validez les paiements depuis « Charges ».": ["DUES_REPLACED", "Dues are replaced by calls for funds: declare and validate payments from « Charges ».", "عُوِّضت المساهمات بطلبات الأداء: صرّح بالأداءات وصادق عليها من « التكاليف »."],
  "Cotisation introuvable": ["DUE_NOT_FOUND", "Due not found.", "المساهمة غير موجودة."],

  // ── Payments and receipts ──
  "Vous ne pouvez soumettre un paiement que pour vos propres appels de fonds": ["OWN_FUNDS_CALLS_ONLY", "You can only submit a payment for your own calls for funds.", "يمكنك تقديم أداء لطلبات الأداء الخاصة بك فقط."],
  "Le justificatif doit être un fichier téléversé sur MIZAN par vous-même.": ["PROOF_NOT_OWN_UPLOAD", "The proof must be a file you uploaded to MIZAN yourself.", "يجب أن يكون الإثبات ملفًا رفعته بنفسك على ميزان."],
  "Un justificatif de paiement est obligatoire.": ["PROOF_REQUIRED", "A proof of payment is required.", "إثبات الأداء إلزامي."],
  "Un paiement est déjà en attente de validation pour cet appel.": ["PAYMENT_ALREADY_PENDING", "A payment is already awaiting validation for this call.", "يوجد أداء في انتظار المصادقة لهذا الطلب."],
  "Cet appel n'est pas en attente de validation": ["PAYMENT_NOT_PENDING", "This call is not awaiting validation.", "هذا الطلب ليس في انتظار المصادقة."],
  "Un motif de rejet est obligatoire": ["REJECT_REASON_REQUIRED", "A rejection reason is required.", "سبب الرفض إلزامي."],
  "Un motif de rejet est requis": ["REJECT_REASON_REQUIRED", "A rejection reason is required.", "سبب الرفض إلزامي."],
  "Reçu disponible uniquement pour les paiements validés": ["RECEIPT_NOT_AVAILABLE", "A receipt is only available for validated payments.", "الوصل متاح فقط للأداءات المصادق عليها."],
  "Paiement introuvable": ["PAYMENT_NOT_FOUND", "Payment not found.", "الأداء غير موجود."],
  "Un paiement remboursé ne peut pas être réactivé": ["PAYMENT_REFUNDED", "A refunded payment cannot be reactivated.", "لا يمكن إعادة تفعيل أداء مسترجَع."],
  "Le paiement n'est pas confirmable dans son état actuel": ["PAYMENT_NOT_CONFIRMABLE", "The payment cannot be confirmed in its current state.", "لا يمكن تأكيد الأداء في حالته الحالية."],
  "Le paiement a déjà été traité": ["PAYMENT_ALREADY_PROCESSED", "The payment has already been processed.", "تمت معالجة الأداء بالفعل."],
  "Paiement non créé": ["PAYMENT_NOT_CREATED", "The payment was not created.", "لم يتم إنشاء الأداء."],
  "Vous ne pouvez demander ce dossier que pour votre propre lot": ["OWN_UNIT_ONLY", "You can only request this file for your own unit.", "يمكنك طلب هذا الملف لوحدتك فقط."],
  "Erreur serveur lors de la génération du dossier de recouvrement": ["DOCUMENT_GENERATION_FAILED", "The recovery file could not be generated.", "تعذّر إنشاء ملف التحصيل."],
  "Erreur serveur lors de la génération du dossier de vente": ["DOCUMENT_GENERATION_FAILED", "The sale file could not be generated.", "تعذّر إنشاء ملف البيع."],

  // ── Treasury, bank, reconciliation ──
  "Transaction introuvable": ["TRANSACTION_NOT_FOUND", "Transaction not found.", "المعاملة غير موجودة."],
  "La caisse est désormais un compte de trésorerie : enregistrez l'opération dans le journal (POST /treasury/entries).": ["CASH_IS_TREASURY_ACCOUNT", "Petty cash is now a treasury account: record the operation in the treasury journal.", "أصبح الصندوق حسابًا للخزينة: سجّل العملية في دفتر الخزينة."],
  "Un motif d'extourne est obligatoire": ["REVERSAL_REASON_REQUIRED", "A reversal reason is required.", "سبب القيد العكسي إلزامي."],
  "Un relevé commence déjà à cette date": ["STATEMENT_DATE_TAKEN", "A statement already starts on this date.", "يوجد كشف يبدأ بالفعل في هذا التاريخ."],
  "Rapprochement incomplet : le relevé ne peut pas être clôturé": ["RECONCILIATION_INCOMPLETE", "Reconciliation incomplete: the statement cannot be closed.", "المطابقة غير مكتملة: لا يمكن إغلاق الكشف."],

  // ── Expenses, invoices, payroll ──
  "Dépense introuvable": ["EXPENSE_NOT_FOUND", "Expense not found.", "المصروف غير موجود."],
  "Facture introuvable": ["INVOICE_NOT_FOUND", "Invoice not found.", "الفاتورة غير موجودة."],
  "Bon introuvable": ["ORDER_NOT_FOUND", "Order not found.", "سند الطلب غير موجود."],
  "Partenaire introuvable": ["PARTNER_NOT_FOUND", "Partner not found.", "الشريك غير موجود."],
  "La supervision et un syndicat cible sont requis pour accéder aux fiches de paie.": ["SUPERVISION_REQUIRED", "Supervision mode and a target condominium are required to access payslips.", "وضع الإشراف وملكية مشتركة مستهدفة مطلوبان للوصول إلى أوراق الأجور."],
  "La génération de fiches de paie n'est pas disponible : enregistrez les salaires depuis « Fiches de paie ».": ["PAYROLL_GENERATION_UNAVAILABLE", "Payslip generation is not available: record salaries from « Payslips ».", "إنشاء أوراق الأجور غير متاح: سجّل الأجور من « أوراق الأجور »."],

  // ── Subscriptions (condominium → platform) ──
  "Abonnement introuvable": ["SUBSCRIPTION_NOT_FOUND", "Subscription not found.", "الاشتراك غير موجود."],
  "Statut d'abonnement invalide": ["INVALID_SUBSCRIPTION_STATUS", "Invalid subscription status.", "حالة اشتراك غير صالحة."],
  "Plan d'abonnement invalide": ["INVALID_PLAN", "Invalid subscription plan.", "باقة اشتراك غير صالحة."],
  "Plan introuvable": ["PLAN_NOT_FOUND", "Plan not found.", "الباقة غير موجودة."],
  "Plan introuvable ou inactif": ["PLAN_NOT_FOUND", "Plan not found or inactive.", "الباقة غير موجودة أو غير نشطة."],
  "Plan payant introuvable": ["PLAN_NOT_FOUND", "Paid plan not found.", "الباقة المدفوعة غير موجودة."],
  "planId est requis": ["PLAN_REQUIRED", "A plan is required.", "الباقة مطلوبة.", "La formule est obligatoire."],
  "Seul le Super Admin peut changer le plan.": ["PLATFORM_ONLY", "Only the platform administrator can change the plan.", "وحده مسؤول المنصة يمكنه تغيير الباقة."],
  "Seul le Super Admin peut modifier le statut de l'abonnement.": ["PLATFORM_ONLY", "Only the platform administrator can change the subscription status.", "وحده مسؤول المنصة يمكنه تعديل حالة الاشتراك."],
  "La souscription en attente est introuvable ou déjà finalisée": ["PENDING_SUBSCRIPTION_NOT_FOUND", "The pending subscription was not found or is already completed.", "الاشتراك قيد الانتظار غير موجود أو تم إتمامه."],
  "Un paiement par carte est déjà en cours pour cette copropriété. Terminez-le ou attendez son expiration.": ["CARD_PAYMENT_IN_PROGRESS", "A card payment is already in progress for this condominium. Finish it or wait for it to expire.", "يوجد أداء بالبطاقة جارٍ لهذه الملكية المشتركة. أكمله أو انتظر انتهاء صلاحيته."],
  "Impossible de démarrer le paiement Stripe": ["CARD_PAYMENT_FAILED", "The card payment could not be started.", "تعذّر بدء الأداء بالبطاقة."],
  "Impossible d'ouvrir le portail Stripe": ["CARD_PORTAL_FAILED", "The billing portal could not be opened.", "تعذّر فتح بوابة الفوترة."],
  "Le prix du plan n'est pas configuré": ["PLAN_PRICE_MISSING", "The plan price is not configured.", "سعر الباقة غير مُعَدّ."],
  "Le prix Stripe configuré ne correspond pas au plan": ["PLAN_PRICE_MISMATCH", "The configured card price does not match the plan.", "سعر البطاقة المُعَدّ لا يطابق الباقة."],
  "Aucun produit Stripe n'est associé à ce plan. Exécutez seed-stripe-products.": ["PLAN_PRICE_MISSING", "Card payment is not configured for this plan.", "الأداء بالبطاقة غير مُعَدّ لهذه الباقة."],
  "Aucun prix Stripe correspondant à ce plan": ["PLAN_PRICE_MISSING", "Card payment is not configured for this plan.", "الأداء بالبطاقة غير مُعَدّ لهذه الباقة."],
  "Signature Stripe manquante ou invalide": ["WEBHOOK_INVALID", "Invalid payment notification.", "إشعار أداء غير صالح."],
  "Corps webhook Stripe invalide": ["WEBHOOK_INVALID", "Invalid payment notification.", "إشعار أداء غير صالح."],
  "Webhook Stripe invalide": ["WEBHOOK_INVALID", "Invalid payment notification.", "إشعار أداء غير صالح."],
};
