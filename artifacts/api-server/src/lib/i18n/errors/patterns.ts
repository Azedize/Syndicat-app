import type { ErrorPattern } from "./types.js";

/**
 * Messages built with values. The pattern matches the French message the
 * route builds; {1}, {2}… in the texts are the captured values.
 */
export const ERROR_PATTERNS: readonly ErrorPattern[] = [
  [/^Code incorrect \((\d+) tentatives? restantes?\)\.$/, "CODE_INCORRECT", "Code incorrect ({1} tentative(s) restante(s)).", "Incorrect code ({1} attempt(s) left).", "الرمز غير صحيح (المحاولات المتبقية: {1})."],
  [/^Code incorrect \((\d+) tentative\(s\) restante\(s\)\)\.$/, "CODE_INCORRECT", "Code incorrect ({1} tentative(s) restante(s)).", "Incorrect code ({1} attempt(s) left).", "الرمز غير صحيح (المحاولات المتبقية: {1})."],
  [/^Montant invalide : (.+)$/, "INVALID_AMOUNT", "Montant invalide : {1}", "Invalid amount: {1}", "مبلغ غير صالح: {1}"],
  [/^Les appels de fonds (.+) de la période (.+) existent déjà pour cet immeuble\.$/, "FUNDS_CALLS_EXIST", "Les appels de fonds {1} de la période {2} existent déjà pour cet immeuble.", "The {1} calls for funds for period {2} already exist for this building.", "طلبات الأداء {1} للفترة {2} موجودة بالفعل لهذه العمارة."],
  [/^Les lignes du budget \((.+) MAD\) doivent totaliser le montant des charges \((.+) MAD\)\. Le fonds de réserve ne figure pas parmi les lignes\.$/, "BUDGET_LINES_MISMATCH", "Les lignes du budget ({1} MAD) doivent totaliser le montant des charges ({2} MAD). Le fonds de réserve ne figure pas parmi les lignes.", "The budget lines ({1} MAD) must add up to the charges ({2} MAD). The reserve fund is not one of the lines.", "يجب أن يساوي مجموع بنود الميزانية ({1} درهم) مبلغ التكاليف ({2} درهم). صندوق الاحتياط ليس ضمن البنود."],
  [/^Le total du budget \((.+) MAD\) doit être égal aux charges \((.+) MAD\) plus le fonds de réserve \((.+) MAD\)\.$/, "BUDGET_TOTAL_MISMATCH", "Le total du budget ({1} MAD) doit être égal aux charges ({2} MAD) plus le fonds de réserve ({3} MAD).", "The budget total ({1} MAD) must equal the charges ({2} MAD) plus the reserve fund ({3} MAD).", "يجب أن يساوي مجموع الميزانية ({1} درهم) التكاليف ({2} درهم) مضافًا إليها صندوق الاحتياط ({3} درهم)."],
  [/^Ce fichier est déjà dans la bibliothèque \(« (.+) »\)$/, "DOCUMENT_DUPLICATE", "Ce fichier est déjà dans la bibliothèque (« {1} »)", "This file is already in the library (« {1} »).", "هذا الملف موجود بالفعل في المكتبة (« {1} »)."],
  [/^Transition invalide : "(.+)" → "(.+)"$/, "INVALID_TRANSITION", "Transition invalide : « {1} » → « {2} »", "Invalid status change: « {1} » → « {2} ».", "تغيير حالة غير صالح: « {1} » ← « {2} »."],
  [/^Conservation obligatoire jusqu'au (\d{4}-\d{2}-\d{2})$/, "RETENTION_REQUIRED", "Conservation obligatoire jusqu'au {1}", "Must be kept until {1}.", "يجب الاحتفاظ بها إلى غاية {1}."],
  [/^Le document au statut "(.+)" ne peut pas être signé$/, "DOCUMENT_NOT_SIGNABLE", "Le document au statut « {1} » ne peut pas être signé", "A document with status « {1} » cannot be signed.", "لا يمكن توقيع وثيقة في حالة « {1} »."],
  [/^Transition impossible depuis le statut "(.+)"$/, "INVALID_TRANSITION", "Transition impossible depuis le statut « {1} »", "This change is not possible from status « {1} ».", "هذا التغيير غير ممكن من الحالة « {1} »."],
  [/^Ce mandataire détient déjà le nombre maximal de pouvoirs \((\d+)\)$/, "PROXY_LIMIT_REACHED", "Ce mandataire détient déjà le nombre maximal de pouvoirs ({1})", "This proxy holder already holds the maximum number of proxies ({1}).", "يحمل هذا الوكيل بالفعل الحد الأقصى من التوكيلات ({1})."],
  [/^Ce mandataire représenterait plus de (\d+) % des voix de la copropriété \(art\. 16 decies\)$/, "PROXY_VOICES_LIMIT", "Ce mandataire représenterait plus de {1} % des voix de la copropriété (art. 16 decies)", "This proxy holder would represent more than {1}% of the condominium's votes (art. 16 decies).", "سيمثل هذا الوكيل أكثر من {1}٪ من أصوات الملكية المشتركة (المادة 16 مكرر عاشرًا)."],
  [/^Champ invalide : (.*)$/, "INVALID_FIELD", "Champ invalide : {1}", "Invalid field: {1}", "حقل غير صالح: {1}"],
  [/^Rôle invalide\. Valeurs acceptées: (.+)$/, "INVALID_ROLE", "Rôle invalide. Valeurs acceptées : {1}", "Invalid role. Accepted values: {1}", "دور غير صالح. القيم المقبولة: {1}"],
  [/^L'email (.+) est déjà utilisé$/, "EMAIL_TAKEN", "L'adresse {1} est déjà utilisée", "The address {1} is already in use.", "العنوان {1} مستخدم بالفعل."],
  [/^(\d+) répartition\(s\) finalisée\(s\) utilisent la version actuelle sur ces dates : elles ne seront pas recalculées\. Confirmez, puis corrigez-les explicitement si nécessaire\.$/, "ALLOCATIONS_NOT_RECALCULATED", "{1} répartition(s) finalisée(s) utilisent la version actuelle sur ces dates : elles ne seront pas recalculées. Confirmez, puis corrigez-les explicitement si nécessaire.", "{1} finalised allocation(s) use the current version on these dates: they will not be recalculated. Confirm, then correct them explicitly if needed.", "{1} توزيعًا نهائيًا يستعمل النسخة الحالية في هذه التواريخ: لن يُعاد حسابها. أكّد ثم صحّحها صراحةً عند الحاجة."],

  [/^(\d+) caractères au maximum$/, "TEXT_TOO_LONG", "{1} caractères au maximum", "{1} characters at most.", "{1} حرفًا كحد أقصى."],

  // Default messages of the validation library (zod 3), in English in the source.
  [/^Required$/, "FIELD_REQUIRED", "Champ obligatoire manquant.", "A required field is missing.", "حقل إلزامي مفقود."],
  [/^Invalid email$/, "EMAIL_INVALID", "Adresse e-mail invalide.", "Invalid email address.", "عنوان بريد إلكتروني غير صالح."],
  [/^String must contain at least (\d+) character\(s\)$/, "TEXT_TOO_SHORT", "Texte trop court ({1} caractère(s) minimum).", "Text too short ({1} character(s) minimum).", "النص قصير جدًا ({1} حرف على الأقل)."],
  [/^String must contain at most (\d+) character\(s\)$/, "TEXT_TOO_LONG", "Texte trop long ({1} caractère(s) maximum).", "Text too long ({1} character(s) maximum).", "النص طويل جدًا ({1} حرف كحد أقصى)."],
  [/^Array must contain at least (\d+) element\(s\)$/, "LIST_TOO_SHORT", "Sélectionnez au moins {1} élément(s).", "Select at least {1} item(s).", "اختر {1} عنصرًا على الأقل."],
  [/^Number must be (?:greater|less) than (?:or equal to )?(-?[\d.]+)$/, "INVALID_NUMBER", "Nombre hors limites ({1}).", "Number out of range ({1}).", "الرقم خارج الحدود ({1})."],
  [/^(?:Expected .+, received .+|Invalid input|Invalid date|Invalid uuid|Invalid url|Invalid enum value\..*|Invalid literal value.*|Invalid discriminator value.*|Expected number, received nan)$/, "INVALID_DATA", "Données invalides.", "Invalid data.", "بيانات غير صالحة."],
];
