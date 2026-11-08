import type { ErrorEntries } from "./types.js";

/** Sign-in, sign-up, codes, passwords, e-mail and phone, users, team, platform accounts. */
export const ACCOUNT_ERRORS: ErrorEntries = {
  // ── Sign-in ──
  "Email ou mot de passe invalide": ["INVALID_CREDENTIALS", "Incorrect email or password.", "البريد الإلكتروني أو كلمة المرور غير صحيحة."],
  "Email ou mot de passe incorrect": ["INVALID_CREDENTIALS", "Incorrect email or password.", "البريد الإلكتروني أو كلمة المرور غير صحيحة."],
  "Compte en attente d'activation": ["ACCOUNT_PENDING", "Your account is awaiting activation.", "حسابك في انتظار التفعيل."],
  "Compte désactivé": ["ACCOUNT_DISABLED", "Your account is disabled.", "حسابك معطّل."],
  "Compte introuvable ou désactivé": ["ACCOUNT_DISABLED", "Account not found or disabled.", "الحساب غير موجود أو معطّل."],
  "Compte introuvable ou désactivé.": ["ACCOUNT_DISABLED", "Account not found or disabled.", "الحساب غير موجود أو معطّل."],
  "Compte introuvable": ["ACCOUNT_NOT_FOUND", "Account not found.", "الحساب غير موجود."],
  "Mot de passe requis": ["PASSWORD_REQUIRED", "Password required.", "كلمة المرور مطلوبة."],
  "Mot de passe actuel incorrect": ["CURRENT_PASSWORD_INCORRECT", "Current password is incorrect.", "كلمة المرور الحالية غير صحيحة."],
  "Le nouveau mot de passe doit être différent de l'actuel": ["PASSWORD_UNCHANGED", "The new password must be different from the current one.", "يجب أن تختلف كلمة المرور الجديدة عن الحالية."],
  "Le mot de passe doit contenir au moins 8 caractères": ["PASSWORD_TOO_SHORT", "The password must contain at least 8 characters.", "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل."],

  // ── Sign-up and codes ──
  "Veuillez vérifier votre adresse email avant de créer le compte.": ["EMAIL_NOT_VERIFIED", "Please verify your email address before creating the account.", "يُرجى التحقق من بريدك الإلكتروني قبل إنشاء الحساب."],
  "Adresse email invalide": ["EMAIL_INVALID", "Invalid email address.", "عنوان بريد إلكتروني غير صالح."],
  "Adresse e-mail invalide": ["EMAIL_INVALID", "Invalid email address.", "عنوان بريد إلكتروني غير صالح."],
  "Cet email est déjà utilisé": ["EMAIL_TAKEN", "This email is already in use.", "هذا البريد الإلكتروني مستخدم بالفعل."],
  "Cette adresse est déjà utilisée par un autre compte.": ["EMAIL_TAKEN", "This address is already used by another account.", "هذا العنوان مستخدم من قِبل حساب آخر."],
  "C'est déjà votre adresse actuelle.": ["EMAIL_UNCHANGED", "This is already your current address.", "هذا هو عنوانك الحالي بالفعل."],
  "Cette adresse e-mail ne peut pas recevoir de messages (domaine réservé). Indiquez une adresse réelle.": ["EMAIL_UNDELIVERABLE", "This email address cannot receive messages (reserved domain). Enter a real address.", "لا يمكن لهذا العنوان استقبال الرسائل (نطاق محجوز). أدخل عنوانًا حقيقيًا."],
  "Le service email est indisponible. Réessayez plus tard.": ["EMAIL_SERVICE_UNAVAILABLE", "The email service is unavailable. Please try again later.", "خدمة البريد الإلكتروني غير متاحة. أعد المحاولة لاحقًا."],
  "Impossible d'envoyer le code. Vérifiez l'adresse email.": ["CODE_SEND_FAILED", "The code could not be sent. Check the email address.", "تعذّر إرسال الرمز. تحقق من البريد الإلكتروني."],
  "Le code n'a pas pu être envoyé. Réessayez plus tard.": ["CODE_SEND_FAILED", "The code could not be sent. Please try again later.", "تعذّر إرسال الرمز. أعد المحاولة لاحقًا."],
  "Email et code requis": ["EMAIL_AND_CODE_REQUIRED", "Email and code required.", "البريد الإلكتروني والرمز مطلوبان."],
  "Code expiré ou introuvable. Demandez un nouveau code.": ["CODE_EXPIRED", "Code expired or not found. Request a new code.", "الرمز منتهي الصلاحية أو غير موجود. اطلب رمزًا جديدًا."],
  "Trop de tentatives incorrectes. Demandez un nouveau code.": ["CODE_TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Request a new code.", "محاولات خاطئة كثيرة جدًا. اطلب رمزًا جديدًا."],
  "Trop de tentatives. Demandez un nouveau code.": ["CODE_TOO_MANY_ATTEMPTS", "Too many attempts. Request a new code.", "محاولات كثيرة جدًا. اطلب رمزًا جديدًا."],
  "Code incorrect ou expiré. Vérifiez le code ou demandez-en un nouveau.": ["RESET_CODE_INVALID", "Incorrect or expired code. Check the code or request a new one.", "الرمز غير صحيح أو منتهي الصلاحية. تحقق منه أو اطلب رمزًا جديدًا."],
  "Lien de réinitialisation invalide ou expiré.": ["RESET_LINK_INVALID", "Invalid or expired reset link.", "رابط إعادة التعيين غير صالح أو منتهي الصلاحية."],
  "Adresse ou code invalide": ["EMAIL_OR_CODE_INVALID", "Invalid address or code.", "العنوان أو الرمز غير صالح."],
  "Ce message contenait un code, un lien ou un mot de passe à usage unique : il n'est pas conservé. Demandez-en un nouveau.": ["ONE_TIME_SECRET_NOT_KEPT", "This message contained a one-time code, link or password: it is not kept. Request a new one.", "احتوت هذه الرسالة على رمز أو رابط أو كلمة مرور لاستعمال واحد: لا يتم الاحتفاظ بها. اطلب واحدًا جديدًا."],

  // ── Phone ──
  "Numéro de téléphone invalide (ex. : 06 XX XX XX XX ou +212 6 XX XX XX XX)": ["PHONE_INVALID", "Invalid phone number (e.g. 06 XX XX XX XX or +212 6 XX XX XX XX).", "رقم هاتف غير صالح (مثال: 06 XX XX XX XX أو ‎+212 6 XX XX XX XX)."],
  "Numéro de téléphone requis": ["PHONE_REQUIRED", "Phone number required.", "رقم الهاتف مطلوب."],
  "Numéro de téléphone et code requis": ["PHONE_AND_CODE_REQUIRED", "Phone number and code required.", "رقم الهاتف والرمز مطلوبان."],
  "phone et code requis": ["PHONE_AND_CODE_REQUIRED", "Phone number and code required.", "رقم الهاتف والرمز مطلوبان.", "Numéro de téléphone et code requis"],
  "Le numéro de téléphone du syndicat doit être vérifié par SMS.": ["PHONE_NOT_VERIFIED", "The condominium's phone number must be verified by SMS.", "يجب التحقق من رقم هاتف الملكية المشتركة عبر رسالة قصيرة."],

  // ── Users and team ──
  "Utilisateur introuvable": ["USER_NOT_FOUND", "User not found.", "المستخدم غير موجود."],
  "Un Super Admin ne peut pas être rattaché à un syndicat": ["SUPER_ADMIN_NO_CONDOMINIUM", "A platform administrator cannot be attached to a condominium.", "لا يمكن ربط مسؤول المنصة بملكية مشتركة."],
  "Cet email est déjà enregistré comme membre d'un autre syndicat": ["EMAIL_IN_OTHER_CONDOMINIUM", "This email is already registered as a member of another condominium.", "هذا البريد مسجّل بالفعل كعضو في ملكية مشتركة أخرى."],
  "La supervision et un syndicat cible sont requis pour modifier ce compte.": ["SUPERVISION_REQUIRED", "Supervision mode and a target condominium are required to change this account.", "وضع الإشراف وملكية مشتركة مستهدفة مطلوبان لتعديل هذا الحساب."],
  "Vous êtes déjà rattaché à un syndicat": ["ALREADY_IN_CONDOMINIUM", "You are already attached to a condominium.", "أنت مرتبط بالفعل بملكية مشتركة."],
  "L'administrateur doit appartenir au syndicat cible": ["ADMIN_NOT_IN_CONDOMINIUM", "The administrator must belong to the target condominium.", "يجب أن ينتمي المسؤول إلى الملكية المشتركة المستهدفة."],
  "L'administrateur doit être un membre actif non affecté à un syndicat": ["ADMIN_NOT_AVAILABLE", "The administrator must be an active member not assigned to a condominium.", "يجب أن يكون المسؤول عضوًا نشطًا غير مُعيَّن لملكية مشتركة."],
  "L'administrateur a déjà été affecté à un syndicat": ["ADMIN_ALREADY_ASSIGNED", "The administrator is already assigned to a condominium.", "تم تعيين المسؤول بالفعل لملكية مشتركة."],
  "Société de syndic introuvable": ["COMPANY_NOT_FOUND", "Property management company not found.", "شركة التسيير غير موجودة."],

  // ── Account deletion and own data ──
  "Aucun lot associé à votre compte": ["NO_UNIT", "No unit is linked to your account.", "لا توجد وحدة مرتبطة بحسابك."],
  "Aucun bail associé à ce compte": ["NO_LEASE", "No lease is linked to this account.", "لا يوجد عقد كراء مرتبط بهذا الحساب."],
};
