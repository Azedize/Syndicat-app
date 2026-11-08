import type { ErrorEntries } from "./types.js";

/**
 * Validation messages declared in the request schemas, and refusals thrown
 * as `{ status, message }` by shared helpers (session guard, allocation,
 * treasury). The route answers them as `{ error: <message> }`.
 */
export const VALIDATION_ERRORS: ErrorEntries = {
  // ── Session guard (lib/access.ts) ──
  "Compte désactivé ou introuvable": ["ACCOUNT_DISABLED", "Your account is disabled or no longer exists.", "حسابك معطّل أو لم يعد موجودًا."],
  "Mot de passe modifié : reconnectez-vous.": ["SESSION_PASSWORD_CHANGED", "Your password was changed: please sign in again.", "تم تغيير كلمة المرور: يُرجى تسجيل الدخول مجددًا."],

  // ── Dates, amounts, formats ──
  "Date invalide": ["INVALID_DATE", "Invalid date.", "تاريخ غير صالح."],
  "Date AAAA-MM-JJ": ["INVALID_DATE", "Date as YYYY-MM-DD.", "التاريخ بصيغة سنة-شهر-يوم."],
  "Date au format AAAA-MM-JJ": ["INVALID_DATE", "Date as YYYY-MM-DD.", "التاريخ بصيغة سنة-شهر-يوم."],
  "Heure invalide (HH:MM)": ["INVALID_TIME", "Invalid time (HH:MM).", "وقت غير صالح (س:د)."],
  "Montant invalide": ["INVALID_AMOUNT", "Invalid amount.", "مبلغ غير صالح."],
  "Montant invalide (2 décimales)": ["INVALID_AMOUNT", "Invalid amount (2 decimals).", "مبلغ غير صالح (رقمان عشريان)."],
  "Montant invalide (nombre positif, 2 décimales maximum)": ["INVALID_AMOUNT", "Invalid amount (positive number, 2 decimals at most).", "مبلغ غير صالح (عدد موجب، رقمان عشريان على الأكثر)."],
  "Montant hors limites": ["AMOUNT_OUT_OF_RANGE", "Amount out of range.", "المبلغ خارج الحدود المسموح بها."],
  "Montant de ligne invalide (non nul, 2 décimales)": ["INVALID_AMOUNT", "Invalid line amount (not zero, 2 decimals).", "مبلغ سطر غير صالح (غير منعدم، رقمان عشريان)."],
  "Solde invalide (2 décimales maximum)": ["INVALID_AMOUNT", "Invalid balance (2 decimals at most).", "رصيد غير صالح (رقمان عشريان على الأكثر)."],
  "Catégorie invalide (minuscules, chiffres et _)": ["INVALID_CATEGORY", "Invalid category (lower-case letters, digits and _).", "فئة غير صالحة (حروف صغيرة وأرقام و _)."],
  "Période invalide (AAAA, AAAA-Tn ou AAAA-MM)": ["INVALID_PERIOD", "Invalid period (YYYY, YYYY-Qn or YYYY-MM).", "فترة غير صالحة (سنة، سنة-ربع أو سنة-شهر)."],
  "Période invalide (ex. '2026-05', '2026-Q1' ou '2026')": ["INVALID_PERIOD", "Invalid period (e.g. '2026-05', '2026-Q1' or '2026').", "فترة غير صالحة (مثال: '2026-05' أو '2026-Q1' أو '2026')."],
  "Mode de paiement invalide (virement, chèque ou espèces)": ["INVALID_PAYMENT_METHOD", "Invalid payment method (transfer, cheque or cash).", "طريقة أداء غير صالحة (تحويل، شيك أو نقدًا)."],
  "Caractères non autorisés": ["INVALID_CHARACTERS", "Characters not allowed.", "أحرف غير مسموح بها."],
  "Caractères de contrôle interdits": ["INVALID_CHARACTERS", "Control characters are not allowed.", "أحرف التحكم غير مسموح بها."],
  "Format email invalide": ["EMAIL_INVALID", "Invalid email format.", "صيغة بريد إلكتروني غير صالحة."],
  "Email invalide": ["EMAIL_INVALID", "Invalid email.", "بريد إلكتروني غير صالح."],
  "Format téléphone invalide (ex: +212600000000 ou 0600000000)": ["PHONE_INVALID", "Invalid phone format (e.g. +212600000000 or 0600000000).", "صيغة هاتف غير صالحة (مثال: ‎+212600000000 أو 0600000000)."],
  "Format numéro d'enregistrement invalide": ["INVALID_REGISTRATION_NUMBER", "Invalid registration number format.", "صيغة رقم التسجيل غير صالحة."],
  "Le numéro ICE doit comporter 15 chiffres": ["INVALID_ICE", "The ICE number must have 15 digits.", "يجب أن يتكون رقم ICE من 15 رقمًا."],
  "ICE invalide (15 chiffres)": ["INVALID_ICE", "Invalid ICE (15 digits).", "رقم ICE غير صالح (15 رقمًا)."],
  "Format numéro RC invalide": ["INVALID_RC", "Invalid trade register (RC) number format.", "صيغة رقم السجل التجاري غير صالحة."],
  "Devise invalide (code ISO, ex. MAD)": ["INVALID_CURRENCY", "Invalid currency (ISO code, e.g. MAD).", "عملة غير صالحة (رمز ISO، مثال: MAD)."],
  "Le code comporte 6 chiffres": ["CODE_FORMAT", "The code has 6 digits.", "يتكون الرمز من 6 أرقام."],
  "Le nom doit contenir au moins 2 caractères": ["NAME_TOO_SHORT", "The name must contain at least 2 characters.", "يجب أن يحتوي الاسم على حرفين على الأقل."],
  "L'avatar doit être une image téléchargée sur le serveur": ["AVATAR_NOT_UPLOADED", "The profile picture must be an image uploaded to MIZAN.", "يجب أن تكون صورة الملف الشخصي صورة مرفوعة على ميزان."],

  "Aucune modification": ["NO_CHANGES", "No changes.", "لا يوجد أي تعديل."],

  // ── Required fields ──
  "Le nom est obligatoire": ["NAME_REQUIRED", "Name is required.", "الاسم مطلوب."],
  "Le nom de la copropriété est obligatoire": ["NAME_REQUIRED", "The condominium name is required.", "اسم الملكية المشتركة مطلوب."],
  "L'adresse est obligatoire": ["ADDRESS_REQUIRED", "Address is required.", "العنوان مطلوب."],
  "La ville est obligatoire": ["CITY_REQUIRED", "City is required.", "المدينة مطلوبة."],
  "Le titre est obligatoire": ["TITLE_REQUIRED", "Title is required.", "العنوان مطلوب."],
  "L'immeuble est obligatoire": ["BUILDING_REQUIRED", "Building is required.", "العمارة مطلوبة."],
  "Le fournisseur est obligatoire": ["SUPPLIER_REQUIRED", "Supplier is required.", "المورّد مطلوب."],
  "La référence du virement / n° de chèque est obligatoire": ["PAYMENT_REFERENCE_REQUIRED", "The transfer reference or cheque number is required.", "مرجع التحويل أو رقم الشيك مطلوب."],
  "La facture doit être téléversée sur MIZAN": ["INVOICE_NOT_UPLOADED", "The invoice must be uploaded to MIZAN.", "يجب رفع الفاتورة على ميزان."],
  "Le justificatif doit être téléchargé sur le serveur avant la soumission.": ["PROOF_NOT_UPLOADED", "The proof must be uploaded before submitting.", "يجب رفع الإثبات قبل الإرسال."],
  "Indiquez la raison": ["REASON_REQUIRED", "Give the reason.", "اذكر السبب."],
  "Indiquez la raison du changement": ["REASON_REQUIRED", "Give the reason for the change.", "اذكر سبب التغيير."],
  "Indiquez la raison de la correction": ["REASON_REQUIRED", "Give the reason for the correction.", "اذكر سبب التصحيح."],
  "Indiquez la raison de l'ajustement": ["REASON_REQUIRED", "Give the reason for the adjustment.", "اذكر سبب التعديل."],
  "Indiquez le motif (vente, succession, donation…)": ["REASON_REQUIRED", "Give the reason (sale, inheritance, gift…).", "اذكر السبب (بيع، إرث، هبة…)."],
  "Indiquez le motif de l'archivage": ["REASON_REQUIRED", "Give the reason for archiving.", "اذكر سبب الأرشفة."],
  "Indiquez pourquoi la ligne est ignorée (doublon d'import, erreur…)": ["REASON_REQUIRED", "Say why the line is ignored (duplicate import, error…).", "اذكر سبب تجاهل السطر (استيراد مكرر، خطأ…)."],
  "Décrivez l'anomalie": ["DESCRIPTION_REQUIRED", "Describe the discrepancy.", "صِف الخلل."],

  // ── Allocation keys and calls for funds ──
  "Clé de répartition introuvable dans cet immeuble": ["ALLOCATION_KEY_NOT_FOUND", "Allocation key not found in this building.", "مفتاح التوزيع غير موجود في هذه العمارة."],
  "Ligne budgétaire introuvable dans cet immeuble": ["BUDGET_LINE_NOT_FOUND", "Budget line not found in this building.", "بند الميزانية غير موجود في هذه العمارة."],
  "Budget introuvable dans cet immeuble": ["BUDGET_NOT_FOUND", "Budget not found in this building.", "الميزانية غير موجودة في هذه العمارة."],
  "La même source est sélectionnée deux fois": ["DUPLICATE_SOURCE", "The same source is selected twice.", "تم اختيار المصدر نفسه مرتين."],
  "Prévisualisez avant de confirmer": ["PREVIEW_REQUIRED", "Preview before confirming.", "عاين قبل التأكيد."],
  "Appel émis avant l'enregistrement des répartitions : pas de détail de calcul": ["NO_ALLOCATION_DETAIL", "Call issued before allocations were recorded: no calculation detail.", "طلب صادر قبل تسجيل التوزيعات: لا توجد تفاصيل الحساب."],
  "Indiquez au moins une catégorie de charges": ["CHARGE_CATEGORY_REQUIRED", "Give at least one charge category.", "اذكر فئة تكاليف واحدة على الأقل."],
  "Indiquez la source de la règle (règlement, décision d'AG…)": ["RULE_SOURCE_REQUIRED", "Give the source of the rule (by-laws, assembly decision…).", "اذكر مصدر القاعدة (النظام، قرار الجمع العام…)."],
  "La clé doit lister les lots": ["KEY_UNITS_REQUIRED", "The key must list the units.", "يجب أن يتضمن المفتاح قائمة الوحدات."],
  "Code court : lettres, chiffres, - ou _": ["INVALID_SHORT_CODE", "Short code: letters, digits, - or _.", "رمز قصير: حروف وأرقام و - أو _."],
  "Sélectionnez au moins une dépense ou ligne budgétaire": ["SOURCE_REQUIRED", "Select at least one expense or budget line.", "اختر مصروفًا أو بند ميزانية واحدًا على الأقل."],

  // ── Finance journal ──
  "Un paiement de copropriétaire s'enregistre sur son appel de fonds (déclaration puis validation).": ["USE_FUNDS_CALL_PAYMENT", "A co-owner's payment is recorded on their call for funds (declaration, then validation).", "يُسجَّل أداء المالك المشترك على طلب الأداء الخاص به (تصريح ثم مصادقة)."],
  "Une dépense passe par le circuit des dépenses (soumission, approbation, paiement).": ["USE_EXPENSE_WORKFLOW", "An expense goes through the expense workflow (submission, approval, payment).", "يمر المصروف عبر مسار المصاريف (تقديم، مصادقة، أداء)."],
  "Un salaire se paie depuis la fiche de paie.": ["USE_PAYSLIP", "A salary is paid from the payslip.", "يُؤدّى الأجر من ورقة الأجر."],
  "Un justificatif (facture) est obligatoire pour toute dépense.": ["INVOICE_REQUIRED", "A supporting document (invoice) is required for every expense.", "الإثبات (الفاتورة) إلزامي لكل مصروف."],

  // ── Bank statements ──
  "La fin de période précède le début": ["END_BEFORE_START", "The period end is before its start.", "نهاية الفترة تسبق بدايتها."],
  "Un relevé ne peut pas couvrir une période future": ["STATEMENT_IN_FUTURE", "A statement cannot cover a future period.", "لا يمكن أن يغطي الكشف فترة مستقبلية."],
  "Une ligne est datée hors de la période du relevé": ["LINE_OUT_OF_PERIOD", "A line is dated outside the statement period.", "سطر مؤرخ خارج فترة الكشف."],

  // ── Claims ──
  "Décrivez le problème (10 caractères minimum)": ["DESCRIPTION_TOO_SHORT", "Describe the problem (10 characters minimum).", "صِف المشكلة (10 أحرف على الأقل)."],
  "Décrivez ce qui ne va toujours pas (10 caractères minimum)": ["DESCRIPTION_TOO_SHORT", "Describe what is still wrong (10 characters minimum).", "صِف ما لا يزال غير سليم (10 أحرف على الأقل)."],
  "Indiquez où se trouve le problème": ["LOCATION_REQUIRED", "Say where the problem is.", "اذكر مكان المشكلة."],
  "Choisissez le lot concerné": ["UNIT_REQUIRED", "Choose the unit concerned.", "اختر الوحدة المعنية."],
  "Choisissez un responsable ou un prestataire": ["ASSIGNEE_REQUIRED", "Choose a person in charge or a supplier.", "اختر مسؤولًا أو مقدم خدمة."],

  // ── Document library ──
  "Catégorie inconnue": ["UNKNOWN_CATEGORY", "Unknown category.", "فئة غير معروفة."],
  "Niveau d'accès inconnu": ["UNKNOWN_ACCESS_LEVEL", "Unknown access level.", "مستوى وصول غير معروف."],
  "Type et identifiant de la fiche liée vont ensemble": ["LINK_FIELDS_TOGETHER", "The linked record's type and identifier go together.", "نوع السجل المرتبط ومعرّفه متلازمان."],

  // ── Elections ──
  "Une abstention ne comporte aucun candidat": ["ABSTENTION_NO_CANDIDATE", "An abstention has no candidate.", "الامتناع لا يتضمن أي مترشح."],
  "Choisissez un candidat ou abstenez-vous": ["CHOICE_REQUIRED", "Choose a candidate or abstain.", "اختر مترشحًا أو امتنع عن التصويت."],
  "Un candidat ne peut être choisi qu'une fois": ["CANDIDATE_TWICE", "A candidate can only be chosen once.", "لا يمكن اختيار المترشح إلا مرة واحدة."],
  "Aucun syndic désigné par l'assemblée n'est enregistré (élection de type syndic)": ["NO_ELECTED_SYNDIC", "No syndic appointed by the assembly is recorded (syndic election).", "لا يوجد سانديك معيَّن من طرف الجمع العام مسجَّل (انتخاب السانديك)."],
  "Aucun syndic adjoint désigné n'est enregistré": ["NO_ELECTED_DEPUTY", "No appointed deputy syndic is recorded.", "لا يوجد نائب سانديك معيَّن مسجَّل."],

  // ── Units and leases ──
  "La référence du lot est obligatoire": ["UNIT_REFERENCE_REQUIRED", "The unit reference is required.", "مرجع الوحدة مطلوب."],
  "Référence trop longue (30 caractères maximum)": ["REFERENCE_TOO_LONG", "Reference too long (30 characters maximum).", "المرجع طويل جدًا (30 حرفًا كحد أقصى)."],
  "Référence invalide (lettres, chiffres, espace, . _ / -)": ["INVALID_REFERENCE", "Invalid reference (letters, digits, space, . _ / -).", "مرجع غير صالح (حروف، أرقام، مسافة، . _ / -)."],
  "Au moins un propriétaire": ["OWNER_REQUIRED", "At least one owner.", "مالك واحد على الأقل."],
  "Tantièmes invalides": ["INVALID_SHARES", "Invalid shares.", "حصص غير صالحة."],
  "Surface invalide": ["INVALID_AREA", "Invalid area.", "مساحة غير صالحة."],
  "Quote-part invalide (0 < part ≤ 100 %)": ["INVALID_OWNER_SHARE", "Invalid share (0 < share ≤ 100%).", "حصة غير صالحة (0 < الحصة ≤ 100٪)."],
  "Propriétaire en double": ["DUPLICATE_OWNER", "Duplicate owner.", "مالك مكرر."],
  "Les quotes-parts des propriétaires doivent totaliser 100 %": ["OWNER_SHARES_TOTAL", "The owners' shares must add up to 100%.", "يجب أن يكون مجموع حصص الملاك 100٪."],
  "Type de lot invalide": ["INVALID_UNIT_TYPE", "Invalid unit type.", "نوع وحدة غير صالح."],
  "L'étage est obligatoire pour ce type de lot": ["FLOOR_REQUIRED", "The floor is required for this unit type.", "الطابق مطلوب لهذا النوع من الوحدات."],
  "owners ou ownerId, pas les deux": ["OWNERS_EXCLUSIVE", "Give the owners list or a single owner, not both.", "قدّم قائمة الملاك أو مالكًا واحدًا، وليس الاثنين.", "Indiquez la liste des propriétaires ou un seul propriétaire, pas les deux."],
  "Choisissez un locataire existant ou saisissez-en un nouveau": ["TENANT_REQUIRED", "Choose an existing tenant or enter a new one.", "اختر مكتريًا موجودًا أو أدخل مكتريًا جديدًا."],
  "La fin du bail précède son début": ["END_BEFORE_START", "The lease end is before its start.", "نهاية عقد الكراء تسبق بدايته."],

  // ── Storage ──
  "File too large (max 20 MB)": ["FILE_TOO_LARGE", "File too large (20 MB maximum).", "الملف كبير جدًا (20 ميغابايت كحد أقصى).", "Fichier trop volumineux (20 Mo maximum)"],
  "Content type not allowed. Supported: PDF, JPG, PNG, DOCX": ["FILE_TYPE_REFUSED", "File type not allowed. Accepted: PDF, JPG, PNG, DOCX.", "نوع الملف غير مسموح به. المقبول: PDF، JPG، PNG، DOCX.", "Type de fichier non autorisé. Acceptés : PDF, JPG, PNG, DOCX."],
};
