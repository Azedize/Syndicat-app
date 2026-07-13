import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Alert, I18nManager, Platform } from "react-native";

export type LangCode = "fr" | "en" | "ar" | "es";

export interface LangOption {
  code: LangCode;
  label: string;
  nativeLabel: string;
  flag: string;
  rtl: boolean;
}

export const LANG_OPTIONS: LangOption[] = [
  { code: "fr", label: "Français", nativeLabel: "Français", flag: "🇫🇷", rtl: false },
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧", rtl: false },
  { code: "ar", label: "العربية", nativeLabel: "العربية", flag: "🇲🇦", rtl: true },
  { code: "es", label: "Español", nativeLabel: "Español", flag: "🇪🇸", rtl: false },
];

type Translations = Record<string, Record<LangCode, string>>;

export const TRANSLATIONS: Translations = {
  // ─── App ───────────────────────────────────────────────────────────────────
  appName:       { fr: "SYNDYCAT", en: "SYNDYCAT", ar: "سنديكات", es: "SYNDYCAT" },
  appTagline:    { fr: "Global CPS Platform", en: "Global CPS Platform", ar: "منصة CPS العالمية", es: "Plataforma CPS Global" },

  // ─── Roles ─────────────────────────────────────────────────────────────────
  selectRole:        { fr: "Sélectionnez votre rôle", en: "Select your role", ar: "اختر دورك", es: "Seleccione su rol" },
  superAdmin:        { fr: "Super Admin", en: "Super Admin", ar: "مدير عام", es: "Super Admin" },
  superAdminDesc:    { fr: "Gestion globale", en: "Global management", ar: "الإدارة العامة", es: "Gestión global" },
  syndicateAdmin:    { fr: "Admin Syndicat", en: "Syndicate Admin", ar: "مدير النقابة", es: "Admin Sindicato" },
  syndicateAdminDesc:{ fr: "Gestion du syndicat", en: "Syndicate management", ar: "إدارة النقابة", es: "Gestión del sindicato" },
  member:            { fr: "Membre", en: "Member", ar: "عضو", es: "Miembro" },
  memberDesc:        { fr: "Accès membre", en: "Member access", ar: "وصول العضو", es: "Acceso miembro" },
  roleSuperAdmin:    { fr: "Super Admin", en: "Super Admin", ar: "مدير عام", es: "Super Admin" },
  roleSyndicAdmin:   { fr: "Admin Syndicat", en: "Syndicate Admin", ar: "مدير النقابة", es: "Admin Sindicato" },
  roleMember:        { fr: "Membre", en: "Member", ar: "عضو", es: "Miembro" },
  roleTenant:        { fr: "Locataire", en: "Tenant", ar: "مستأجر", es: "Inquilino" },

  // ─── Auth / Login ──────────────────────────────────────────────────────────
  login:                { fr: "Connexion", en: "Login", ar: "تسجيل الدخول", es: "Iniciar sesión" },
  email:                { fr: "Email", en: "Email", ar: "البريد الإلكتروني", es: "Correo electrónico" },
  password:             { fr: "Mot de passe", en: "Password", ar: "كلمة المرور", es: "Contraseña" },
  connect:              { fr: "Se connecter", en: "Sign in", ar: "تسجيل الدخول", es: "Conectar" },
  demoMode:             { fr: "Mode démo — email pré-rempli selon le rôle sélectionné", en: "Demo mode — email pre-filled per selected role", ar: "وضع تجريبي — البريد الإلكتروني محدد مسبقاً", es: "Modo demo — email prellenado según rol" },
  emailPlaceholder:     { fr: "votre@email.com", en: "your@email.com", ar: "بريدك@الإلكتروني.com", es: "tu@correo.com" },
  passwordPlaceholder:  { fr: "••••••••", en: "••••••••", ar: "••••••••", es: "••••••••" },
  forgotPassword:       { fr: "Mot de passe oublié ?", en: "Forgot password?", ar: "نسيت كلمة المرور؟", es: "¿Olvidó su contraseña?" },
  emailRequired:        { fr: "Veuillez saisir votre email.", en: "Please enter your email.", ar: "الرجاء إدخال بريدك الإلكتروني.", es: "Por favor ingrese su correo." },
  passwordRequired:     { fr: "Veuillez saisir votre mot de passe.", en: "Please enter your password.", ar: "الرجاء إدخال كلمة المرور.", es: "Por favor ingrese su contraseña." },
  passwordTooShort:     { fr: "Le mot de passe doit contenir au moins 6 caractères.", en: "Password must be at least 6 characters.", ar: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.", es: "La contraseña debe tener al menos 6 caracteres." },
  invalidCredentials:   { fr: "Email ou mot de passe incorrect.", en: "Incorrect email or password.", ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.", es: "Correo o contraseña incorrectos." },

  // ─── Forgot Password ───────────────────────────────────────────────────────
  forgotPasswordTitle:    { fr: "Mot de passe oublié", en: "Forgot Password", ar: "نسيت كلمة المرور", es: "Contraseña olvidada" },
  forgotPasswordSubtitle: { fr: "Saisissez votre email et nous vous enverrons un lien de réinitialisation.", en: "Enter your email and we will send you a reset link.", ar: "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.", es: "Ingrese su correo y le enviaremos un enlace de restablecimiento." },
  emailAddress:           { fr: "Adresse email", en: "Email address", ar: "عنوان البريد الإلكتروني", es: "Dirección de correo" },
  sendLink:               { fr: "Envoyer le lien", en: "Send link", ar: "إرسال الرابط", es: "Enviar enlace" },
  haveCode:               { fr: "Vous avez déjà un code ? ", en: "Already have a code? ", ar: "لديك رمز بالفعل؟ ", es: "¿Ya tiene un código? " },
  resetWithCode:          { fr: "Réinitialiser avec le code", en: "Reset with code", ar: "إعادة التعيين بالرمز", es: "Restablecer con código" },
  emailSentTitle:         { fr: "Email envoyé !", en: "Email sent!", ar: "تم إرسال البريد الإلكتروني!", es: "¡Correo enviado!" },
  emailSentMsg:           { fr: "Si l'adresse {email} est associée à un compte SYNDYCAT, vous recevrez un email avec un lien de réinitialisation dans quelques minutes.", en: "If {email} is linked to a SYNDYCAT account, you will receive a reset link email in a few minutes.", ar: "إذا كان {email} مرتبطاً بحساب SYNDYCAT، ستتلقى رسالة إعادة تعيين خلال دقائق.", es: "Si {email} está vinculado a una cuenta SYNDYCAT, recibirá un correo de restablecimiento en unos minutos." },
  checkSpam:              { fr: "Vérifiez aussi vos spams.", en: "Check your spam folder too.", ar: "تحقق أيضاً من مجلد البريد العشوائي.", es: "Revise también su carpeta de spam." },
  enterResetCode:         { fr: "Saisir mon code de réinitialisation", en: "Enter my reset code", ar: "إدخال رمز إعادة التعيين", es: "Ingresar mi código de restablecimiento" },
  backToLogin:            { fr: "Retour à la connexion", en: "Back to login", ar: "العودة إلى تسجيل الدخول", es: "Volver al inicio de sesión" },
  emailRequiredFP:        { fr: "Veuillez saisir votre adresse email.", en: "Please enter your email address.", ar: "الرجاء إدخال عنوان بريدك الإلكتروني.", es: "Por favor ingrese su dirección de correo." },
  emailInvalid:           { fr: "Adresse email invalide.", en: "Invalid email address.", ar: "عنوان البريد الإلكتروني غير صالح.", es: "Dirección de correo no válida." },

  // ─── Reset Password ────────────────────────────────────────────────────────
  resetPasswordTitle:       { fr: "Nouveau mot de passe", en: "New Password", ar: "كلمة مرور جديدة", es: "Nueva contraseña" },
  resetPasswordSubtitle:    { fr: "Saisissez le code reçu par email et choisissez un nouveau mot de passe.", en: "Enter the code received by email and choose a new password.", ar: "أدخل الرمز المستلم عبر البريد الإلكتروني واختر كلمة مرور جديدة.", es: "Ingrese el código recibido por correo y elija una nueva contraseña." },
  resetCodeLabel:           { fr: "Code de réinitialisation", en: "Reset code", ar: "رمز إعادة التعيين", es: "Código de restablecimiento" },
  pasteCodePlaceholder:     { fr: "Collez votre code ici (64 caractères)", en: "Paste your code here (64 characters)", ar: "الصق رمزك هنا (64 حرفاً)", es: "Pegue su código aquí (64 caracteres)" },
  copyFromEmailHint:        { fr: "Copiez le code depuis le lien reçu par email.", en: "Copy the code from the link received by email.", ar: "انسخ الرمز من الرابط المستلم عبر البريد الإلكتروني.", es: "Copie el código del enlace recibido por correo." },
  newPasswordLabel:         { fr: "Nouveau mot de passe", en: "New password", ar: "كلمة المرور الجديدة", es: "Nueva contraseña" },
  minCharsPlaceholder:      { fr: "Minimum 8 caractères", en: "Minimum 8 characters", ar: "8 أحرف على الأقل", es: "Mínimo 8 caracteres" },
  strengthPrefix:           { fr: "Force : ", en: "Strength: ", ar: "القوة: ", es: "Seguridad: " },
  confirmPasswordLabel:     { fr: "Confirmer le mot de passe", en: "Confirm password", ar: "تأكيد كلمة المرور", es: "Confirmar contraseña" },
  repeatPasswordPlaceholder:{ fr: "Répétez le mot de passe", en: "Repeat password", ar: "أعد كلمة المرور", es: "Repita la contraseña" },
  resetPasswordBtn:         { fr: "Réinitialiser le mot de passe", en: "Reset password", ar: "إعادة تعيين كلمة المرور", es: "Restablecer contraseña" },
  noCode:                   { fr: "Pas de code ? ", en: "No code? ", ar: "ليس لديك رمز؟ ", es: "¿Sin código? " },
  requestNewLink:           { fr: "Demander un nouveau lien", en: "Request a new link", ar: "طلب رابط جديد", es: "Solicitar nuevo enlace" },
  passwordChangedTitle:     { fr: "Mot de passe modifié !", en: "Password changed!", ar: "تم تغيير كلمة المرور!", es: "¡Contraseña cambiada!" },
  passwordChangedMsg:       { fr: "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.", en: "Your password has been reset successfully. You can now log in with your new password.", ar: "تم إعادة تعيين كلمة مرورك بنجاح. يمكنك الآن تسجيل الدخول بكلمة مرورك الجديدة.", es: "Su contraseña ha sido restablecida. Ahora puede iniciar sesión con su nueva contraseña." },
  passwordWeak:             { fr: "Faible", en: "Weak", ar: "ضعيفة", es: "Débil" },
  passwordMedium:           { fr: "Moyen", en: "Medium", ar: "متوسطة", es: "Media" },
  passwordGood:             { fr: "Bon", en: "Good", ar: "جيدة", es: "Buena" },
  passwordExcellent:        { fr: "Excellent", en: "Excellent", ar: "ممتازة", es: "Excelente" },
  invalidResetLink:         { fr: "Lien invalide ou expiré. Demandez un nouveau lien.", en: "Invalid or expired link. Request a new one.", ar: "الرابط غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.", es: "Enlace inválido o expirado. Solicite uno nuevo." },
  codeRequired:             { fr: "Veuillez saisir votre code de réinitialisation.", en: "Please enter your reset code.", ar: "الرجاء إدخال رمز إعادة التعيين.", es: "Por favor ingrese su código de restablecimiento." },
  codeLength:               { fr: "Le code doit contenir exactement 64 caractères.", en: "The code must be exactly 64 characters.", ar: "يجب أن يحتوي الرمز على 64 حرفاً بالضبط.", es: "El código debe tener exactamente 64 caracteres." },
  newPasswordRequired:      { fr: "Veuillez saisir un nouveau mot de passe.", en: "Please enter a new password.", ar: "الرجاء إدخال كلمة مرور جديدة.", es: "Por favor ingrese una nueva contraseña." },
  newPasswordTooShort:      { fr: "Le mot de passe doit contenir au moins 8 caractères.", en: "Password must be at least 8 characters.", ar: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.", es: "La contraseña debe tener al menos 8 caracteres." },
  passwordsMismatch:        { fr: "Les mots de passe ne correspondent pas.", en: "Passwords do not match.", ar: "كلمتا المرور غير متطابقتين.", es: "Las contraseñas no coinciden." },

  // ─── Navigation / Tabs ─────────────────────────────────────────────────────
  dashboard:   { fr: "Tableau de bord", en: "Dashboard", ar: "لوحة القيادة", es: "Panel" },
  members:     { fr: "Membres", en: "Members", ar: "الأعضاء", es: "Miembros" },
  finance:     { fr: "Finance", en: "Finance", ar: "المالية", es: "Finanzas" },
  marketplace: { fr: "Marché", en: "Market", ar: "السوق", es: "Mercado" },
  more:        { fr: "Plus", en: "More", ar: "المزيد", es: "Más" },

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings:              { fr: "Paramètres", en: "Settings", ar: "الإعدادات", es: "Ajustes" },
  settingsTitle:         { fr: "Paramètres", en: "Settings", ar: "الإعدادات", es: "Ajustes" },
  profile:               { fr: "Mon Profil", en: "My Profile", ar: "ملفي الشخصي", es: "Mi Perfil" },
  logout:                { fr: "Se déconnecter", en: "Logout", ar: "تسجيل الخروج", es: "Cerrar sesión" },
  language:              { fr: "Langue", en: "Language", ar: "اللغة", es: "Idioma" },
  appearance:            { fr: "Apparence", en: "Appearance", ar: "المظهر", es: "Apariencia" },
  notifications:         { fr: "Notifications", en: "Notifications", ar: "الإشعارات", es: "Notificaciones" },
  security:              { fr: "Sécurité", en: "Security", ar: "الأمان", es: "Seguridad" },
  about:                 { fr: "À propos", en: "About", ar: "حول", es: "Acerca de" },
  darkMode:              { fr: "Mode sombre", en: "Dark mode", ar: "الوضع الداكن", es: "Modo oscuro" },
  editProfile:           { fr: "Modifier", en: "Edit", ar: "تعديل", es: "Editar" },
  appearanceSection:     { fr: "APPARENCE", en: "APPEARANCE", ar: "المظهر", es: "APARIENCIA" },
  darkModeLabel:         { fr: "Mode sombre", en: "Dark mode", ar: "الوضع الداكن", es: "Modo oscuro" },
  systemAuto:            { fr: "Automatique (système)", en: "Automatic (system)", ar: "تلقائي (النظام)", es: "Automático (sistema)" },
  enabled:               { fr: "Activé", en: "Enabled", ar: "مفعّل", es: "Activado" },
  disabled:              { fr: "Désactivé", en: "Disabled", ar: "معطّل", es: "Desactivado" },
  followSystemTheme:     { fr: "Suivre le thème du système", en: "Follow system theme", ar: "اتباع مظهر النظام", es: "Seguir el tema del sistema" },
  notificationsSection:  { fr: "NOTIFICATIONS", en: "NOTIFICATIONS", ar: "الإشعارات", es: "NOTIFICACIONES" },
  pushNotifications:     { fr: "Notifications push", en: "Push notifications", ar: "إشعارات فورية", es: "Notificaciones push" },
  pushNotificationsSub:  { fr: "Alertes et actualités", en: "Alerts and news", ar: "التنبيهات والأخبار", es: "Alertas y noticias" },
  emailNotifications:    { fr: "Notifications par email", en: "Email notifications", ar: "إشعارات البريد الإلكتروني", es: "Notificaciones por correo" },
  emailNotificationsSub: { fr: "Récapitulatifs hebdomadaires", en: "Weekly summaries", ar: "ملخصات أسبوعية", es: "Resúmenes semanales" },
  smsNotifications:      { fr: "Notifications SMS", en: "SMS notifications", ar: "إشعارات الرسائل النصية", es: "Notificaciones SMS" },
  smsNotificationsSub:   { fr: "Alertes urgentes seulement", en: "Urgent alerts only", ar: "التنبيهات العاجلة فقط", es: "Solo alertas urgentes" },
  securitySection:       { fr: "SÉCURITÉ", en: "SECURITY", ar: "الأمان", es: "SEGURIDAD" },
  biometricAuth:         { fr: "Authentification biométrique", en: "Biometric authentication", ar: "المصادقة البيومترية", es: "Autenticación biométrica" },
  twoFactorAuth:         { fr: "Double authentification", en: "Two-factor authentication", ar: "المصادقة الثنائية", es: "Autenticación de dos factores" },
  autoLockLabel:         { fr: "Verrouillage auto", en: "Auto-lock", ar: "قفل تلقائي", es: "Bloqueo automático" },
  autoLockSub:           { fr: "Après 5 min d'inactivité", en: "After 5 min of inactivity", ar: "بعد 5 دقائق من عدم النشاط", es: "Tras 5 min de inactividad" },
  changePassword:        { fr: "Changer le mot de passe", en: "Change password", ar: "تغيير كلمة المرور", es: "Cambiar contraseña" },
  viaProfilePage:        { fr: "Via la page profil", en: "Via the profile page", ar: "عبر صفحة الملف الشخصي", es: "Mediante la página de perfil" },
  aboutSection:          { fr: "À PROPOS", en: "ABOUT", ar: "حول", es: "ACERCA DE" },
  appVersion:            { fr: "Version de l'application", en: "App version", ar: "إصدار التطبيق", es: "Versión de la app" },
  serverStatus:          { fr: "Statut serveur", en: "Server status", ar: "حالة الخادم", es: "Estado del servidor" },
  operational:           { fr: "✓ Opérationnel", en: "✓ Operational", ar: "✓ يعمل", es: "✓ Operativo" },
  logoutConfirmTitle:    { fr: "Déconnexion", en: "Logout", ar: "تسجيل الخروج", es: "Cerrar sesión" },
  logoutConfirmMessage:  { fr: "Êtes-vous sûr de vouloir vous déconnecter ?", en: "Are you sure you want to log out?", ar: "هل أنت متأكد أنك تريد تسجيل الخروج؟", es: "¿Está seguro de que desea cerrar sesión?" },
  languageSection:       { fr: "LANGUE", en: "LANGUAGE", ar: "اللغة", es: "IDIOMA" },
  chooseLanguage:        { fr: "Choisir la langue", en: "Choose language", ar: "اختر اللغة", es: "Elegir idioma" },

  // ─── Common UI actions ─────────────────────────────────────────────────────
  search:    { fr: "Rechercher...", en: "Search...", ar: "بحث...", es: "Buscar..." },
  cancel:    { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  save:      { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  close:     { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
  confirm:   { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
  delete:    { fr: "Supprimer", en: "Delete", ar: "حذف", es: "Eliminar" },
  edit:      { fr: "Modifier", en: "Edit", ar: "تعديل", es: "Editar" },
  add:       { fr: "Ajouter", en: "Add", ar: "إضافة", es: "Agregar" },
  back:      { fr: "Retour", en: "Back", ar: "رجوع", es: "Volver" },
  welcome:   { fr: "Bonjour", en: "Hello", ar: "مرحباً", es: "Hola" },
  send:      { fr: "Envoyer", en: "Send", ar: "إرسال", es: "Enviar" },
  create:    { fr: "Créer", en: "Create", ar: "إنشاء", es: "Crear" },
  update:    { fr: "Mettre à jour", en: "Update", ar: "تحديث", es: "Actualizar" },
  submit:    { fr: "Soumettre", en: "Submit", ar: "إرسال", es: "Enviar" },
  apply:     { fr: "Appliquer", en: "Apply", ar: "تطبيق", es: "Aplicar" },
  filter:    { fr: "Filtrer", en: "Filter", ar: "تصفية", es: "Filtrar" },
  refresh:   { fr: "Actualiser", en: "Refresh", ar: "تحديث", es: "Actualizar" },
  retry:     { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  download:  { fr: "Télécharger", en: "Download", ar: "تنزيل", es: "Descargar" },
  upload:    { fr: "Téléverser", en: "Upload", ar: "رفع", es: "Subir" },
  share:     { fr: "Partager", en: "Share", ar: "مشاركة", es: "Compartir" },
  preview:   { fr: "Aperçu", en: "Preview", ar: "معاينة", es: "Vista previa" },
  viewDetails:{ fr: "Voir détails", en: "View details", ar: "عرض التفاصيل", es: "Ver detalles" },
  seeAll:    { fr: "Voir tout", en: "See all", ar: "عرض الكل", es: "Ver todo" },
  loading:   { fr: "Chargement...", en: "Loading...", ar: "جارٍ التحميل...", es: "Cargando..." },
  error:     { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  success:   { fr: "Succès", en: "Success", ar: "نجاح", es: "Éxito" },
  warning:   { fr: "Avertissement", en: "Warning", ar: "تحذير", es: "Advertencia" },
  info:      { fr: "Information", en: "Information", ar: "معلومة", es: "Información" },
  ok:        { fr: "OK", en: "OK", ar: "موافق", es: "Aceptar" },
  yes:       { fr: "Oui", en: "Yes", ar: "نعم", es: "Sí" },
  no:        { fr: "Non", en: "No", ar: "لا", es: "No" },
  noData:    { fr: "Aucune donnée", en: "No data", ar: "لا توجد بيانات", es: "Sin datos" },
  optional:  { fr: "Facultatif", en: "Optional", ar: "اختياري", es: "Opcional" },
  required:  { fr: "Requis", en: "Required", ar: "مطلوب", es: "Requerido" },
  na:        { fr: "N/A", en: "N/A", ar: "غير متاح", es: "N/A" },
  total:     { fr: "Total", en: "Total", ar: "المجموع", es: "Total" },
  at:        { fr: "à", en: "at", ar: "في", es: "a las" },
  from:      { fr: "Du", en: "From", ar: "من", es: "Desde" },
  to:        { fr: "au", en: "to", ar: "إلى", es: "hasta" },
  by:        { fr: "par", en: "by", ar: "بواسطة", es: "por" },
  on:        { fr: "le", en: "on", ar: "في", es: "el" },
  new:       { fr: "Nouveau", en: "New", ar: "جديد", es: "Nuevo" },
  all:       { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  none:      { fr: "Aucun", en: "None", ar: "لا شيء", es: "Ninguno" },
  unknown:   { fr: "Inconnu", en: "Unknown", ar: "غير معروف", es: "Desconocido" },
  today:     { fr: "Aujourd'hui", en: "Today", ar: "اليوم", es: "Hoy" },

  // ─── Common field labels ────────────────────────────────────────────────────
  titleLabel:       { fr: "Titre", en: "Title", ar: "العنوان", es: "Título" },
  descriptionLabel: { fr: "Description", en: "Description", ar: "الوصف", es: "Descripción" },
  nameLabel:        { fr: "Nom", en: "Name", ar: "الاسم", es: "Nombre" },
  phoneLabel:       { fr: "Téléphone", en: "Phone", ar: "الهاتف", es: "Teléfono" },
  addressLabel:     { fr: "Adresse", en: "Address", ar: "العنوان", es: "Dirección" },
  dateLabel:        { fr: "Date", en: "Date", ar: "التاريخ", es: "Fecha" },
  timeLabel:        { fr: "Heure", en: "Time", ar: "الوقت", es: "Hora" },
  typeLabel:        { fr: "Type", en: "Type", ar: "النوع", es: "Tipo" },
  amountLabel:      { fr: "Montant", en: "Amount", ar: "المبلغ", es: "Monto" },
  amountMAD:        { fr: "Montant (MAD)", en: "Amount (MAD)", ar: "المبلغ (درهم)", es: "Monto (MAD)" },
  statusLabel:      { fr: "Statut", en: "Status", ar: "الحالة", es: "Estado" },
  notesLabel:       { fr: "Notes", en: "Notes", ar: "ملاحظات", es: "Notas" },
  categoryLabel:    { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  priorityLabel:    { fr: "Priorité", en: "Priority", ar: "الأولوية", es: "Prioridad" },
  locationLabel:    { fr: "Lieu", en: "Location", ar: "الموقع", es: "Ubicación" },

  // ─── Status labels ─────────────────────────────────────────────────────────
  statusActive:    { fr: "Actif", en: "Active", ar: "نشط", es: "Activo" },
  statusInactive:  { fr: "Inactif", en: "Inactive", ar: "غير نشط", es: "Inactivo" },
  statusPending:   { fr: "En attente", en: "Pending", ar: "بانتظار", es: "Pendiente" },
  statusOpen:      { fr: "Ouvert", en: "Open", ar: "مفتوح", es: "Abierto" },
  statusClosed:    { fr: "Fermé", en: "Closed", ar: "مغلق", es: "Cerrado" },
  statusUpcoming:  { fr: "À venir", en: "Upcoming", ar: "قادم", es: "Próximo" },
  statusInProgress:{ fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  statusCompleted: { fr: "Terminé", en: "Completed", ar: "مكتمل", es: "Completado" },
  statusCancelled: { fr: "Annulé", en: "Cancelled", ar: "ملغى", es: "Cancelado" },
  statusPaid:      { fr: "Payé", en: "Paid", ar: "مدفوع", es: "Pagado" },
  statusUnpaid:    { fr: "Impayé", en: "Unpaid", ar: "غير مدفوع", es: "No pagado" },
  statusLate:      { fr: "En retard", en: "Late", ar: "متأخر", es: "Atrasado" },
  statusDraft:     { fr: "Brouillon", en: "Draft", ar: "مسودة", es: "Borrador" },
  statusSuspended: { fr: "Suspendu", en: "Suspended", ar: "معلق", es: "Suspendido" },
  statusTrial:     { fr: "Essai", en: "Trial", ar: "تجريبي", es: "Prueba" },
  statusScheduled: { fr: "Planifiée", en: "Scheduled", ar: "مجدول", es: "Programado" },
  statusHealthy:   { fr: "Sain", en: "Healthy", ar: "جيد", es: "Saludable" },
  statusWarning:   { fr: "Attention", en: "Warning", ar: "تحذير", es: "Advertencia" },
  statusCritical:  { fr: "Critique", en: "Critical", ar: "حرج", es: "Crítico" },

  // ─── Not found ─────────────────────────────────────────────────────────────
  notFoundTitle:   { fr: "Cette page n'existe pas.", en: "This screen doesn't exist.", ar: "هذه الصفحة غير موجودة.", es: "Esta página no existe." },
  goHomeLink:      { fr: "Aller à l'accueil !", en: "Go to home screen!", ar: "الذهاب إلى الرئيسية!", es: "¡Ir a la pantalla de inicio!" },

  // ─── Sidebar ───────────────────────────────────────────────────────────────
  sidebarNavigation:  { fr: "NAVIGATION", en: "NAVIGATION", ar: "التنقل", es: "NAVEGACIÓN" },
  sidebarQuickAccess: { fr: "ACCÈS RAPIDE", en: "QUICK ACCESS", ar: "وصول سريع", es: "ACCESO RÁPIDO" },
  sidebarSearch:      { fr: "Rechercher… ⌘K", en: "Search… ⌘K", ar: "بحث… ⌘K", es: "Buscar… ⌘K" },
  sidebarLogout:      { fr: "Déconnexion", en: "Logout", ar: "تسجيل الخروج", es: "Cerrar sesión" },
  syndicates:         { fr: "Syndicats", en: "Syndicates", ar: "النقابات", es: "Sindicatos" },

  // ─── AI Assistant ──────────────────────────────────────────────────────────
  aiAssistant:        { fr: "Assistant IA", en: "AI Assistant", ar: "مساعد الذكاء الاصطناعي", es: "Asistente IA" },
  aiAssistantFull:    { fr: "Assistant IA SYNDYCAT", en: "SYNDYCAT AI Assistant", ar: "مساعد الذكاء الاصطناعي SYNDYCAT", es: "Asistente IA SYNDYCAT" },
  aiOnline:           { fr: "En ligne — Prêt à répondre", en: "Online — Ready to respond", ar: "متصل — جاهز للرد", es: "En línea — Listo para responder" },
  aiSuggestions:      { fr: "SUGGESTIONS RAPIDES", en: "QUICK SUGGESTIONS", ar: "اقتراحات سريعة", es: "SUGERENCIAS RÁPIDAS" },
  aiGreeting: {
    fr: "Bonjour ! Je suis votre assistant syndical. Comment puis-je vous aider ?",
    en: "Hello! I am your union assistant. How can I help you?",
    ar: "مرحباً! أنا مساعدك النقابي. كيف يمكنني مساعدتك؟",
    es: "¡Hola! Soy tu asistente sindical. ¿Cómo puedo ayudarte?"
  },
  typeMessage:    { fr: "Écrire un message...", en: "Type a message...", ar: "اكتب رسالة...", es: "Escribe un mensaje..." },
  askQuestion:    { fr: "Poser une question", en: "Ask a question", ar: "اطرح سؤالاً", es: "Hacer una pregunta" },

  // ─── Quick features ────────────────────────────────────────────────────────
  recurringTasks:  { fr: "Tâches Récurrentes", en: "Recurring Tasks", ar: "المهام المتكررة", es: "Tareas Recurrentes" },
  versionHistory:  { fr: "Historique des Versions", en: "Version History", ar: "سجل الإصدارات", es: "Historial de Versiones" },
  paymentPrediction:{ fr: "Prévisions", en: "Predictions", ar: "التنبؤات", es: "Previsiones" },

  // ─── Domain navigation labels ──────────────────────────────────────────────
  elections:    { fr: "Élections", en: "Elections", ar: "الانتخابات", es: "Elecciones" },
  meetings:     { fr: "Réunions", en: "Meetings", ar: "الاجتماعات", es: "Reuniones" },
  documents:    { fr: "Documents", en: "Documents", ar: "الوثائق", es: "Documentos" },
  chat:         { fr: "Chat", en: "Chat", ar: "المحادثة", es: "Chat" },
  support:      { fr: "Support", en: "Support", ar: "الدعم", es: "Soporte" },
  governance:   { fr: "Gouvernance", en: "Governance", ar: "الحوكمة", es: "Gobernanza" },
  legal:        { fr: "Juridique", en: "Legal", ar: "قانوني", es: "Legal" },
  reports:      { fr: "Rapports", en: "Reports", ar: "التقارير", es: "Informes" },
  alerts:       { fr: "Alertes", en: "Alerts", ar: "التنبيهات", es: "Alertas" },
  announcements:{ fr: "Annonces", en: "Announcements", ar: "الإعلانات", es: "Anuncios" },
  calendar:     { fr: "Calendrier", en: "Calendar", ar: "التقويم", es: "Calendario" },
  ideas:        { fr: "Idées", en: "Ideas", ar: "الأفكار", es: "Ideas" },
  parking:      { fr: "Parking", en: "Parking", ar: "مواقف السيارات", es: "Estacionamiento" },
  publications: { fr: "Publications", en: "Publications", ar: "المنشورات", es: "Publicaciones" },
  actions:      { fr: "Actions syndicales", en: "Union Actions", ar: "الإجراءات النقابية", es: "Acciones sindicales" },
  pv:           { fr: "Procès-Verbaux", en: "Minutes", ar: "محاضر الاجتماعات", es: "Actas" },
  travaux:      { fr: "Travaux", en: "Works", ar: "الأشغال", es: "Obras" },
  reclamations: { fr: "Réclamations", en: "Complaints", ar: "الشكاوى", es: "Reclamaciones" },
  sinistres:    { fr: "Sinistres", en: "Claims", ar: "الحوادث", es: "Siniestros" },
  prestataires: { fr: "Prestataires", en: "Providers", ar: "مزودو الخدمات", es: "Proveedores" },
  locataires:   { fr: "Locataires", en: "Tenants", ar: "المستأجرون", es: "Inquilinos" },
  lots:         { fr: "Lots", en: "Units", ar: "الوحدات", es: "Unidades" },
  buildings:    { fr: "Immeubles", en: "Buildings", ar: "المباني", es: "Edificios" },
  agenda:       { fr: "Agenda", en: "Agenda", ar: "جدول الأعمال", es: "Agenda" },
  budget:       { fr: "Budget", en: "Budget", ar: "الميزانية", es: "Presupuesto" },
  charges:      { fr: "Charges", en: "Charges", ar: "الرسوم", es: "Cargos" },
  cotisations:  { fr: "Cotisations", en: "Contributions", ar: "الاشتراكات", es: "Cuotas" },
  invoices:     { fr: "Factures", en: "Invoices", ar: "الفواتير", es: "Facturas" },
  orders:       { fr: "Commandes", en: "Orders", ar: "الطلبات", es: "Pedidos" },
  favorites:    { fr: "Favoris", en: "Favorites", ar: "المفضلة", es: "Favoritos" },
  reviews:      { fr: "Avis", en: "Reviews", ar: "التقييمات", es: "Reseñas" },
  myShop:       { fr: "Ma Boutique", en: "My Shop", ar: "متجري", es: "Mi Tienda" },
  cart:         { fr: "Panier", en: "Cart", ar: "سلة التسوق", es: "Carrito" },
  escalation:   { fr: "Escalade", en: "Escalation", ar: "التصعيد", es: "Escalada" },
  workflow:     { fr: "Workflow", en: "Workflow", ar: "سير العمل", es: "Flujo de trabajo" },
  statistics:   { fr: "Statistiques", en: "Statistics", ar: "الإحصائيات", es: "Estadísticas" },
  transparency: { fr: "Transparence", en: "Transparency", ar: "الشفافية", es: "Transparencia" },
  simulateur:   { fr: "Simulateur", en: "Simulator", ar: "المحاكي", es: "Simulador" },
  reglements:   { fr: "Règlements", en: "Regulations", ar: "اللوائح", es: "Reglamentos" },
  abonnements:  { fr: "Abonnements", en: "Subscriptions", ar: "الاشتراكات", es: "Suscripciones" },
  fichesPaie:   { fr: "Fiches de Paie", en: "Pay Slips", ar: "قسائم الرواتب", es: "Nóminas" },
  bonLivraison: { fr: "Bons de Livraison", en: "Delivery Notes", ar: "سندات التسليم", es: "Albaranes" },
  tableauBord:  { fr: "Tableau de Bord Financier", en: "Financial Dashboard", ar: "لوحة القيادة المالية", es: "Panel Financiero" },
  tableauNational:{ fr: "Tableau National", en: "National Board", ar: "اللوحة الوطنية", es: "Tablero Nacional" },
  teamSyndic:   { fr: "Équipe Syndicale", en: "Syndicate Team", ar: "فريق النقابة", es: "Equipo Sindical" },
  utilisateurs: { fr: "Utilisateurs", en: "Users", ar: "المستخدمون", es: "Usuarios" },
  actesAdmin:   { fr: "Actes Administratifs", en: "Administrative Acts", ar: "الأعمال الإدارية", es: "Actos Administrativos" },
  repertoireJuridique:{ fr: "Répertoire Juridique", en: "Legal Directory", ar: "الدليل القانوني", es: "Directorio Jurídico" },
  assemblee:    { fr: "Assemblée Générale", en: "General Assembly", ar: "الجمعية العامة", es: "Asamblea General" },
  partenaires:  { fr: "Partenaires", en: "Partners", ar: "الشركاء", es: "Socios" },
  messagerie:   { fr: "Messagerie", en: "Messaging", ar: "الرسائل", es: "Mensajería" },
  monBail:      { fr: "Mon Bail", en: "My Lease", ar: "عقد إيجاري", es: "Mi Contrato" },
  monLot:       { fr: "Mon Lot", en: "My Unit", ar: "وحدتي", es: "Mi Unidad" },
  etatDesLieux: { fr: "État des Lieux", en: "Property Inspection", ar: "جرد الحالة", es: "Inventario" },
  journalAudit: { fr: "Journal d'Audit", en: "Audit Log", ar: "سجل التدقيق", es: "Registro de Auditoría" },
  onboarding:   { fr: "Bienvenue", en: "Welcome", ar: "أهلاً وسهلاً", es: "Bienvenido" },
  cgu:          { fr: "Conditions d'utilisation", en: "Terms of Service", ar: "شروط الاستخدام", es: "Términos de uso" },
  syndSetup:    { fr: "Configuration Syndicat", en: "Syndicate Setup", ar: "إعداد النقابة", es: "Configuración Sindicato" },

  // ─── Meetings ──────────────────────────────────────────────────────────────
  meetingsTitle:          { fr: "Réunions", en: "Meetings", ar: "الاجتماعات", es: "Reuniones" },
  upcomingMeetings:       { fr: "réunion(s) à venir", en: "upcoming meeting(s)", ar: "اجتماع(ات) قادمة", es: "reunión(es) próxima(s)" },
  nextMeeting:            { fr: "Prochaine réunion", en: "Next meeting", ar: "الاجتماع القادم", es: "Próxima reunión" },
  confirmAttendanceTitle: { fr: "Confirmer la présence", en: "Confirm attendance", ar: "تأكيد الحضور", es: "Confirmar asistencia" },
  confirmAttendanceMsg:   { fr: "Confirmer votre présence à", en: "Confirm your attendance at", ar: "تأكيد حضورك في", es: "Confirmar su asistencia a" },
  attendanceConfirmedLabel:{ fr: "Présence confirmée", en: "Attendance confirmed", ar: "تم تأكيد الحضور", es: "Asistencia confirmada" },
  confirmMyAttendance:    { fr: "Confirmer ma présence", en: "Confirm my attendance", ar: "تأكيد حضوري", es: "Confirmar mi asistencia" },
  downloadPVBtn:          { fr: "Télécharger le PV", en: "Download minutes", ar: "تنزيل المحضر", es: "Descargar acta" },
  pvDownloadedTitle:      { fr: "PV téléchargé", en: "Minutes downloaded", ar: "تم تنزيل المحضر", es: "Acta descargada" },
  pvDownloadedMsg:        { fr: "Disponible dans votre espace Documents.", en: "Available in your Documents space.", ar: "متاح في مساحة مستنداتك.", es: "Disponible en su espacio de Documentos." },
  noMeetings:             { fr: "Aucune réunion", en: "No meetings", ar: "لا توجد اجتماعات", es: "Sin reuniones" },
  agendaLabel:            { fr: "Ordre du jour", en: "Agenda", ar: "جدول الأعمال", es: "Orden del día" },
  moreAgendaPoints:       { fr: "autres points", en: "more items", ar: "نقاط أخرى", es: "puntos más" },
  allFilter:              { fr: "Toutes", en: "All", ar: "الكل", es: "Todas" },
  upcomingFilter:         { fr: "À venir", en: "Upcoming", ar: "القادمة", es: "Próximas" },
  completedFilter:        { fr: "Terminées", en: "Completed", ar: "المنتهية", es: "Completadas" },
  participants:           { fr: "participants", en: "attendees", ar: "مشاركون", es: "participantes" },
  fullAgenda:             { fr: "Agenda complet", en: "Full agenda", ar: "جدول الأعمال الكامل", es: "Agenda completa" },
  meetTypeBoard:          { fr: "Bureau", en: "Board", ar: "مجلس الإدارة", es: "Junta" },
  meetTypeGeneral:        { fr: "Assemblée Générale", en: "General Assembly", ar: "الجمعية العامة", es: "Asamblea General" },
  meetTypeCommittee:      { fr: "Commission", en: "Committee", ar: "لجنة", es: "Comisión" },
  meetTypeEmergency:      { fr: "Urgence", en: "Emergency", ar: "طوارئ", es: "Emergencia" },
  meetTypeOrdinary:       { fr: "AG Ordinaire", en: "Ordinary GA", ar: "جمعية عامة عادية", es: "AG Ordinaria" },
  meetTypeExtraordinary:  { fr: "AG Extraordinaire", en: "Extraordinary GA", ar: "جمعية عامة غير عادية", es: "AG Extraordinaria" },
  meetTypeConstitutive:   { fr: "AG Constitutive", en: "Constitutive GA", ar: "جمعية تأسيسية", es: "AG Constitutiva" },
  meetTypeElective:       { fr: "AG Élective", en: "Elective GA", ar: "جمعية انتخابية", es: "AG Electiva" },
  defaultMeetType:        { fr: "Réunion", en: "Meeting", ar: "اجتماع", es: "Reunión" },
  createMeeting:          { fr: "Nouvelle réunion", en: "New meeting", ar: "اجتماع جديد", es: "Nueva reunión" },
  meetingTitleLabel:      { fr: "Titre de la réunion *", en: "Meeting title *", ar: "عنوان الاجتماع *", es: "Título de la reunión *" },
  meetingDateLabel:       { fr: "Date (AAAA-MM-JJ) *", en: "Date (YYYY-MM-DD) *", ar: "التاريخ (YYYY-MM-DD) *", es: "Fecha (AAAA-MM-DD) *" },
  meetingTimeLabel:       { fr: "Heure (HH:MM)", en: "Time (HH:MM)", ar: "الوقت (HH:MM)", es: "Hora (HH:MM)" },
  meetingLocationLabel:   { fr: "Lieu", en: "Location", ar: "الموقع", es: "Lugar" },
  meetingTypeLabel:       { fr: "Type de réunion", en: "Meeting type", ar: "نوع الاجتماع", es: "Tipo de reunión" },
  meetingDescLabel:       { fr: "Description / Ordre du jour", en: "Description / Agenda", ar: "الوصف / جدول الأعمال", es: "Descripción / Agenda" },
  locationTBD:            { fr: "À définir", en: "TBD", ar: "سيُحدد لاحقاً", es: "Por definir" },
  presenceConfirmed:      { fr: "Présence confirmée", en: "Attendance confirmed", ar: "تم تأكيد الحضور", es: "Asistencia confirmada" },
  meetingCreatedLog:      { fr: "Réunion créée", en: "Meeting created", ar: "تم إنشاء الاجتماع", es: "Reunión creada" },
  cannotCreateMeeting:    { fr: "Impossible de créer la réunion.", en: "Failed to create meeting.", ar: "فشل في إنشاء الاجتماع.", es: "No se pudo crear la reunión." },
  cannotEditMeeting:      { fr: "Impossible de modifier la réunion.", en: "Failed to update meeting.", ar: "فشل في تعديل الاجتماع.", es: "No se pudo actualizar la reunión." },

  // ─── Elections ─────────────────────────────────────────────────────────────
  electionsTitle:       { fr: "Élections", en: "Elections", ar: "الانتخابات", es: "Elecciones" },
  activeElections:      { fr: "élection(s) en cours", en: "active election(s)", ar: "انتخاب(ات) جارية", es: "elección(es) activa(s)" },
  loadingElections:     { fr: "Chargement des élections...", en: "Loading elections...", ar: "جارٍ تحميل الانتخابات...", es: "Cargando elecciones..." },
  cannotLoadElections:  { fr: "Impossible de charger les élections", en: "Failed to load elections", ar: "فشل في تحميل الانتخابات", es: "No se pudieron cargar las elecciones" },
  noElections:          { fr: "Aucune élection pour le moment", en: "No elections at the moment", ar: "لا توجد انتخابات في الوقت الحالي", es: "Sin elecciones en este momento" },
  voteRegisteredTitle:  { fr: "Vote enregistré ✓", en: "Vote registered ✓", ar: "تم تسجيل التصويت ✓", es: "Voto registrado ✓" },
  voteRegisteredMsg:    { fr: "Votre vote a été enregistré de manière sécurisée et anonyme. Merci pour votre participation!", en: "Your vote has been recorded securely and anonymously. Thank you for participating!", ar: "تم تسجيل صوتك بشكل آمن وسري. شكراً لمشاركتك!", es: "Su voto ha sido registrado de forma segura y anónima. ¡Gracias por participar!" },
  voteErrorTitle:       { fr: "Erreur de vote", en: "Vote error", ar: "خطأ في التصويت", es: "Error de voto" },
  confirmVoteTitle:     { fr: "Confirmer le vote", en: "Confirm vote", ar: "تأكيد التصويت", es: "Confirmar voto" },
  confirmVoteMsg:       { fr: "Voulez-vous voter pour {name}?\n\nAttention: cette action est irréversible.", en: "Do you want to vote for {name}?\n\nWarning: this action is irreversible.", ar: "هل تريد التصويت لـ {name}؟\n\nتحذير: هذا الإجراء لا رجعة فيه.", es: "¿Desea votar por {name}?\n\nAtención: esta acción es irreversible." },
  voteBtn:              { fr: "Voter", en: "Vote", ar: "صوّت", es: "Votar" },
  createElectionTitle:  { fr: "Nouvelle Élection", en: "New Election", ar: "انتخاب جديد", es: "Nueva Elección" },
  electionCreatedMsg:   { fr: "La nouvelle élection a été créée avec succès.", en: "The new election has been created successfully.", ar: "تم إنشاء الانتخاب الجديد بنجاح.", es: "La nueva elección ha sido creada con éxito." },
  invalidDateFormat:    { fr: "Les dates doivent être au format AAAA-MM-JJ.", en: "Dates must be in YYYY-MM-DD format.", ar: "يجب أن تكون التواريخ بتنسيق YYYY-MM-DD.", es: "Las fechas deben estar en formato AAAA-MM-DD." },
  endAfterStart:        { fr: "La date de fin doit être postérieure à la date de début.", en: "End date must be after start date.", ar: "يجب أن يكون تاريخ الانتهاء بعد تاريخ البدء.", es: "La fecha de fin debe ser posterior a la de inicio." },
  candidatesLabel:      { fr: "candidats", en: "candidates", ar: "مرشحون", es: "candidatos" },
  totalVotesLabel:      { fr: "votes", en: "votes", ar: "أصوات", es: "votos" },
  endDateLabel:         { fr: "Fin:", en: "End:", ar: "النهاية:", es: "Fin:" },
  voteRegisteredStatus: { fr: "Vote enregistré ✓", en: "Vote registered ✓", ar: "تم التصويت ✓", es: "Voto registrado ✓" },
  voteToOpen:           { fr: "Voter — Appuyer pour ouvrir", en: "Vote — Tap to open", ar: "صوّت — اضغط للفتح", es: "Votar — Tocar para abrir" },
  seeResultsBtn:        { fr: "Voir les résultats", en: "See results", ar: "عرض النتائج", es: "Ver resultados" },
  opensOnLabel:         { fr: "Ouverture le", en: "Opens on", ar: "يفتح في", es: "Abre el" },
  myVoteLabel:          { fr: "Mon vote", en: "My vote", ar: "صوتي", es: "Mi voto" },
  voteForThisCandidate: { fr: "Voter pour ce candidat", en: "Vote for this candidate", ar: "التصويت لهذا المرشح", es: "Votar por este candidato" },
  electionInProgress:   { fr: "Élection en cours", en: "Election in progress", ar: "الانتخاب جارٍ", es: "Elección en curso" },
  finalResultsTitle:    { fr: "Résultats finaux", en: "Final results", ar: "النتائج النهائية", es: "Resultados finales" },
  electionNewTitle:     { fr: "Titre *", en: "Title *", ar: "العنوان *", es: "Título *" },
  electionNewDesc:      { fr: "Description", en: "Description", ar: "الوصف", es: "Descripción" },
  electionStartDate:    { fr: "Date début (AAAA-MM-JJ) *", en: "Start date (YYYY-MM-DD) *", ar: "تاريخ البدء *", es: "Fecha inicio (AAAA-MM-DD) *" },
  electionEndDate:      { fr: "Date fin (AAAA-MM-JJ) *", en: "End date (YYYY-MM-DD) *", ar: "تاريخ الانتهاء *", es: "Fecha fin (AAAA-MM-DD) *" },
  fromToLabel:          { fr: "Du {start} au {end}", en: "From {start} to {end}", ar: "من {start} إلى {end}", es: "Del {start} al {end}" },

  // ─── Documents ─────────────────────────────────────────────────────────────
  documentsTitle:  { fr: "Documents", en: "Documents", ar: "الوثائق", es: "Documentos" },
  noDocuments:     { fr: "Aucun document", en: "No documents", ar: "لا توجد وثائق", es: "Sin documentos" },
  downloadError:   { fr: "Impossible d'ouvrir ce document.", en: "Unable to open this document.", ar: "تعذر فتح هذا المستند.", es: "No se puede abrir este documento." },
  uploadedBy:      { fr: "Ajouté par", en: "Uploaded by", ar: "أضافه", es: "Subido por" },
  documentCategory:{ fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },

  // ─── Announcements ─────────────────────────────────────────────────────────
  announcesTitle:  { fr: "Annonces", en: "Announcements", ar: "الإعلانات", es: "Anuncios" },
  noAnnouncements: { fr: "Aucune annonce", en: "No announcements", ar: "لا توجد إعلانات", es: "Sin anuncios" },
  publishedOn:     { fr: "Publié le", en: "Published on", ar: "نُشر في", es: "Publicado el" },
  likeBtn:         { fr: "J'aime", en: "Like", ar: "أعجبني", es: "Me gusta" },
  commentBtn:      { fr: "Commenter", en: "Comment", ar: "تعليق", es: "Comentar" },

  // ─── Chat / Messaging ──────────────────────────────────────────────────────
  chatTitle:        { fr: "Messagerie", en: "Messaging", ar: "الرسائل", es: "Mensajería" },
  noConversations:  { fr: "Aucune conversation", en: "No conversations", ar: "لا توجد محادثات", es: "Sin conversaciones" },
  sendMessageBtn:   { fr: "Envoyer le message", en: "Send message", ar: "إرسال الرسالة", es: "Enviar mensaje" },
  newConversation:  { fr: "Nouvelle conversation", en: "New conversation", ar: "محادثة جديدة", es: "Nueva conversación" },
  searchConversations:{ fr: "Rechercher une conversation...", en: "Search conversations...", ar: "بحث في المحادثات...", es: "Buscar conversación..." },
  internalMessaging:{ fr: "Messagerie interne", en: "Internal messaging", ar: "الرسائل الداخلية", es: "Mensajería interna" },

  // ─── Support ───────────────────────────────────────────────────────────────
  supportTitle:     { fr: "Support", en: "Support", ar: "الدعم", es: "Soporte" },
  newTicket:        { fr: "Nouveau ticket", en: "New ticket", ar: "تذكرة جديدة", es: "Nuevo ticket" },
  ticketTitleLabel: { fr: "Titre du ticket *", en: "Ticket title *", ar: "عنوان التذكرة *", es: "Título del ticket *" },
  ticketDescLabel:  { fr: "Description *", en: "Description *", ar: "الوصف *", es: "Descripción *" },
  ticketPriorityLabel:{ fr: "Priorité", en: "Priority", ar: "الأولوية", es: "Prioridad" },
  noTickets:        { fr: "Aucun ticket", en: "No tickets", ar: "لا توجد تذاكر", es: "Sin tickets" },
  submitTicket:     { fr: "Soumettre le ticket", en: "Submit ticket", ar: "إرسال التذكرة", es: "Enviar ticket" },
  ticketCreated:    { fr: "Ticket créé avec succès.", en: "Ticket created successfully.", ar: "تم إنشاء التذكرة بنجاح.", es: "Ticket creado con éxito." },
  addReply:         { fr: "Ajouter une réponse", en: "Add a reply", ar: "إضافة رد", es: "Agregar respuesta" },
  replyPlaceholder: { fr: "Votre réponse...", en: "Your reply...", ar: "ردك...", es: "Tu respuesta..." },
  ticketOpen:       { fr: "Ouvert", en: "Open", ar: "مفتوح", es: "Abierto" },
  ticketInProgress: { fr: "En cours", en: "In progress", ar: "قيد المعالجة", es: "En progreso" },
  ticketResolved:   { fr: "Résolu", en: "Resolved", ar: "محلول", es: "Resuelto" },
  ticketClosed:     { fr: "Fermé", en: "Closed", ar: "مغلق", es: "Cerrado" },
  priorityLow:      { fr: "Faible", en: "Low", ar: "منخفضة", es: "Baja" },
  priorityNormal:   { fr: "Normale", en: "Normal", ar: "عادية", es: "Normal" },
  priorityHigh:     { fr: "Élevée", en: "High", ar: "عالية", es: "Alta" },
  priorityUrgent:   { fr: "URGENT", en: "URGENT", ar: "عاجل", es: "URGENTE" },

  // ─── Finance ───────────────────────────────────────────────────────────────
  budgetTitle:         { fr: "Budget Prévisionnel", en: "Budget", ar: "الميزانية التقديرية", es: "Presupuesto" },
  chargesTitle:        { fr: "Charges", en: "Charges", ar: "الرسوم", es: "Cargos" },
  cotisationsTitle:    { fr: "Cotisations", en: "Contributions", ar: "الاشتراكات", es: "Cuotas" },
  paymentsTitle:       { fr: "Paiements", en: "Payments", ar: "المدفوعات", es: "Pagos" },
  invoicesTitle:       { fr: "Factures", en: "Invoices", ar: "الفواتير", es: "Facturas" },
  totalBudget:         { fr: "Budget total", en: "Total budget", ar: "إجمالي الميزانية", es: "Presupuesto total" },
  allocated:           { fr: "Alloué", en: "Allocated", ar: "مخصص", es: "Asignado" },
  spent:               { fr: "Dépensé", en: "Spent", ar: "مُنفق", es: "Gastado" },
  remaining:           { fr: "Restant", en: "Remaining", ar: "المتبقي", es: "Restante" },
  paid:                { fr: "Payés", en: "Paid", ar: "مدفوع", es: "Pagados" },
  pendingPayment:      { fr: "En attente", en: "Pending", ar: "بانتظار الدفع", es: "Pendiente" },
  latePayment:         { fr: "En retard", en: "Late", ar: "متأخر", es: "Atrasado" },
  noInvoices:          { fr: "Aucune facture", en: "No invoices", ar: "لا توجد فواتير", es: "Sin facturas" },
  noCotisations:       { fr: "Aucune cotisation", en: "No contributions", ar: "لا توجد اشتراكات", es: "Sin cuotas" },
  noBudget:            { fr: "Aucun budget", en: "No budget", ar: "لا توجد ميزانية", es: "Sin presupuesto" },
  noCharges:           { fr: "Aucune charge", en: "No charges", ar: "لا توجد رسوم", es: "Sin cargos" },
  payNow:              { fr: "Payer maintenant", en: "Pay now", ar: "ادفع الآن", es: "Pagar ahora" },
  markPaid:            { fr: "Marquer payé", en: "Mark as paid", ar: "وضع علامة مدفوع", es: "Marcar como pagado" },
  autoRenewal:         { fr: "Renouvellement auto", en: "Auto renewal", ar: "تجديد تلقائي", es: "Renovación automática" },
  manualRenewal:       { fr: "Renouvellement manuel", en: "Manual renewal", ar: "تجديد يدوي", es: "Renovación manual" },
  monthlyLabel:        { fr: "mensuel", en: "monthly", ar: "شهري", es: "mensual" },
  perMonth:            { fr: "mois", en: "month", ar: "شهر", es: "mes" },
  perYear:             { fr: "an", en: "year", ar: "سنة", es: "año" },
  currentPlan:         { fr: "Votre plan actuel", en: "Your current plan", ar: "خطتك الحالية", es: "Tu plan actual" },
  currentPlanBadge:    { fr: "✓ Plan actuel", en: "✓ Current plan", ar: "✓ الخطة الحالية", es: "✓ Plan actual" },
  noPlanAvailable:     { fr: "Aucun plan disponible", en: "No plan available", ar: "لا توجد خطة متاحة", es: "Sin plan disponible" },
  customPlan:          { fr: "Besoin d'un plan personnalisé?", en: "Need a custom plan?", ar: "هل تحتاج خطة مخصصة؟", es: "¿Necesita un plan personalizado?" },
  contactTeam:         { fr: "Contactez notre équipe pour une offre sur mesure.", en: "Contact our team for a tailored offer.", ar: "تواصل مع فريقنا للحصول على عرض مخصص.", es: "Contacte a nuestro equipo para una oferta a medida." },
  manageSubscription:  { fr: "Gérer l'abonnement", en: "Manage subscription", ar: "إدارة الاشتراك", es: "Gestionar suscripción" },
  suspendSubscription: { fr: "Suspendre l'abonnement", en: "Suspend subscription", ar: "تعليق الاشتراك", es: "Suspender suscripción" },
  reactivateSubscription:{ fr: "Réactiver l'abonnement", en: "Reactivate subscription", ar: "إعادة تفعيل الاشتراك", es: "Reactivar suscripción" },
  subscriptionActivated:{ fr: "Abonnement activé avec succès.", en: "Subscription activated successfully.", ar: "تم تفعيل الاشتراك بنجاح.", es: "Suscripción activada con éxito." },
  changePlanTitle:     { fr: "Changer de plan", en: "Change plan", ar: "تغيير الخطة", es: "Cambiar plan" },
  noSubscriptions:     { fr: "Aucun abonnement enregistré", en: "No subscriptions found", ar: "لم يتم العثور على اشتراكات", es: "Sin suscripciones" },
  tabSyndicates:       { fr: "Syndicats", en: "Syndicates", ar: "النقابات", es: "Sindicatos" },
  tabPricingPlans:     { fr: "Plans tarifaires", en: "Pricing plans", ar: "خطط التسعير", es: "Planes tarifarios" },
  syndicatesTotal:     { fr: "Total syndicats", en: "Total syndicates", ar: "إجمالي النقابات", es: "Total sindicatos" },
  activesLabel:        { fr: "Actifs", en: "Active", ar: "نشطة", es: "Activos" },
  plansLabel:          { fr: "Plans", en: "Plans", ar: "الخطط", es: "Planes" },

  // ─── Pay slips ─────────────────────────────────────────────────────────────
  paySlipMonth:      { fr: "Mois (AAAA-MM) *", en: "Month (YYYY-MM) *", ar: "الشهر (YYYY-MM) *", es: "Mes (AAAA-MM) *" },
  paySlipPost:       { fr: "Poste / Rôle *", en: "Position / Role *", ar: "المنصب / الدور *", es: "Puesto / Rol *" },
  paySlipNew:        { fr: "Nouvelle Fiche de Paie", en: "New Pay Slip", ar: "قسيمة راتب جديدة", es: "Nueva Nómina" },
  noPaySlips:        { fr: "Aucune fiche de paie", en: "No pay slips", ar: "لا توجد قسائم رواتب", es: "Sin nóminas" },
  paidOnLabel:       { fr: "Payé le", en: "Paid on", ar: "مدفوع في", es: "Pagado el" },
  postRequired:      { fr: "Le poste est obligatoire.", en: "Position is required.", ar: "المنصب مطلوب.", es: "El puesto es obligatorio." },

  // ─── Complaints / Claims ───────────────────────────────────────────────────
  reclamationsTitle: { fr: "Réclamations", en: "Complaints", ar: "الشكاوى", es: "Reclamaciones" },
  noReclamations:    { fr: "Aucune réclamation", en: "No complaints", ar: "لا توجد شكاوى", es: "Sin reclamaciones" },
  newReclamation:    { fr: "Nouvelle réclamation", en: "New complaint", ar: "شكوى جديدة", es: "Nueva reclamación" },
  sinistresTitle:    { fr: "Sinistres", en: "Claims", ar: "الحوادث", es: "Siniestros" },
  noSinistres:       { fr: "Aucun sinistre", en: "No claims", ar: "لا توجد حوادث", es: "Sin siniestros" },
  newSinistre:       { fr: "Nouveau sinistre", en: "New claim", ar: "حادث جديد", es: "Nuevo siniestro" },

  // ─── Works / Travaux ──────────────────────────────────────────────────────
  travauxTitle:      { fr: "Travaux & Interventions", en: "Works & Interventions", ar: "الأشغال والتدخلات", es: "Obras e Intervenciones" },
  workOrder:         { fr: "bon", en: "order", ar: "طلب", es: "orden" },
  workOrders:        { fr: "bons", en: "orders", ar: "طلبات", es: "órdenes" },
  ofWorks:           { fr: "de travaux", en: "of works", ar: "أشغال", es: "de obras" },
  priorityItems:     { fr: "Prioritaires", en: "Priority", ar: "أولوية", es: "Prioridad" },
  noWorkOrders:      { fr: "Aucun bon de travaux", en: "No work orders", ar: "لا توجد طلبات أشغال", es: "No hay órdenes de trabajo" },
  notAssigned:       { fr: "Non assigné", en: "Not assigned", ar: "غير معين", es: "No asignado" },
  lotLabel:          { fr: "Lot", en: "Unit", ar: "وحدة", es: "Lote" },
  newWorkOrder:      { fr: "Nouveau Bon de Travaux", en: "New Work Order", ar: "طلب أشغال جديد", es: "Nueva Orden de Trabajo" },
  titleRequired:     { fr: "Le titre est obligatoire", en: "Title is required", ar: "العنوان مطلوب", es: "El título es obligatorio" },
  createWorkError:   { fr: "Impossible de créer le bon de travaux", en: "Failed to create work order", ar: "فشل في إنشاء طلب الأشغال", es: "No se pudo crear la orden de trabajo" },
  uploadFailed:      { fr: "Échec du téléversement", en: "Upload failed", ar: "فشل الرفع", es: "Error al subir" },
  assignProvider:    { fr: "Assigner un prestataire", en: "Assign a provider", ar: "تعيين مزود", es: "Asignar proveedor" },
  submitReport:      { fr: "Soumettre le rapport", en: "Submit report", ar: "إرسال التقرير", es: "Enviar informe" },
  validateAndPay:    { fr: "Valider & payer", en: "Validate & pay", ar: "تصديق ودفع", es: "Validar y pagar" },
  providerIdLabel:   { fr: "ID Prestataire *", en: "Provider ID *", ar: "معرف المزود *", es: "ID del proveedor *" },
  reportPdf:         { fr: "Rapport d'intervention (PDF)", en: "Intervention report (PDF)", ar: "تقرير التدخل (PDF)", es: "Informe de intervención (PDF)" },
  photoProof:        { fr: "Photo de preuve", en: "Proof photo", ar: "صورة إثبات", es: "Foto de prueba" },
  invoiceDoc:        { fr: "Facture", en: "Invoice", ar: "الفاتورة", es: "Factura" },
  invoiceAmountLabel:{ fr: "Montant de la facture (MAD)", en: "Invoice amount (MAD)", ar: "مبلغ الفاتورة", es: "Monto de la factura" },
  missingDocs:       { fr: "Rapport, photo et facture sont obligatoires", en: "Report, photo and invoice are required", ar: "التقرير والصورة والفاتورة مطلوبة", es: "Informe, foto y factura son obligatorios" },
  validateConfirmMsg:{ fr: "Confirmer la validation et le paiement de cette intervention ?", en: "Confirm validation and payment for this intervention?", ar: "تأكيد التصديق ودفع هذا التدخل؟", es: "¿Confirmar validación y pago de esta intervención?" },
  typeEntretien:     { fr: "Entretien courant", en: "Routine maintenance", ar: "صيانة دورية", es: "Mantenimiento rutinario" },
  typeReparation:    { fr: "Réparation", en: "Repair", ar: "إصلاح", es: "Reparación" },
  typeAmelioration:  { fr: "Amélioration", en: "Improvement", ar: "تحسين", es: "Mejora" },
  typeGrosTravaux:   { fr: "Gros travaux", en: "Major works", ar: "أشغال كبرى", es: "Obras mayores" },
  typeUrgence:       { fr: "Urgence", en: "Emergency", ar: "طوارئ", es: "Emergencia" },
  filterAll2:        { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  filterReported:    { fr: "Signalés", en: "Reported", ar: "مبلغ عنه", es: "Reportado" },
  workStatusReported:{ fr: "Signalé", en: "Reported", ar: "مبلغ عنه", es: "Reportado" },
  workStatusAssigned:{ fr: "Assigné", en: "Assigned", ar: "معين", es: "Asignado" },
  workStatusInProgress:{ fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  workStatusCompleted:{ fr: "Terminé", en: "Completed", ar: "مكتمل", es: "Completado" },
  workStatusCancelled:{ fr: "Annulé", en: "Cancelled", ar: "ملغى", es: "Cancelado" },
  workStatusPendingValidation:{ fr: "À valider", en: "Pending validation", ar: "بانتظار التصديق", es: "Pendiente de validación" },

  // ─── Members ───────────────────────────────────────────────────────────────
  membersTitle:    { fr: "Membres", en: "Members", ar: "الأعضاء", es: "Miembros" },
  noMembers:       { fr: "Aucun membre", en: "No members", ar: "لا يوجد أعضاء", es: "Sin miembros" },
  memberDetail:    { fr: "Détail membre", en: "Member detail", ar: "تفاصيل العضو", es: "Detalle miembro" },
  joinedOn:        { fr: "Membre depuis", en: "Member since", ar: "عضو منذ", es: "Miembro desde" },
  contactInfo:     { fr: "Informations de contact", en: "Contact information", ar: "معلومات الاتصال", es: "Información de contacto" },
  paymentHistory:  { fr: "Historique des paiements", en: "Payment history", ar: "سجل المدفوعات", es: "Historial de pagos" },
  sendMessage:     { fr: "Envoyer un message", en: "Send a message", ar: "إرسال رسالة", es: "Enviar mensaje" },
  membersCount:    { fr: "membre(s)", en: "member(s)", ar: "عضو(أعضاء)", es: "miembro(s)" },

  // ─── Providers ─────────────────────────────────────────────────────────────
  prestatairesTitle:{ fr: "Prestataires", en: "Service Providers", ar: "مزودو الخدمات", es: "Proveedores" },
  noProviders:      { fr: "Aucun prestataire", en: "No providers", ar: "لا يوجد مزودون", es: "Sin proveedores" },
  newProvider:      { fr: "Nouveau prestataire", en: "New provider", ar: "مزود جديد", es: "Nuevo proveedor" },
  providerType:     { fr: "Type de prestataire", en: "Provider type", ar: "نوع المزود", es: "Tipo de proveedor" },
  providerRating:   { fr: "Note", en: "Rating", ar: "التقييم", es: "Calificación" },
  providerContact:  { fr: "Contact", en: "Contact", ar: "تواصل", es: "Contacto" },

  // ─── Buildings / Lots / Tenants ────────────────────────────────────────────
  buildingsTitle:  { fr: "Immeubles", en: "Buildings", ar: "المباني", es: "Edificios" },
  noBuildings:     { fr: "Aucun immeuble", en: "No buildings", ar: "لا توجد مبانٍ", es: "Sin edificios" },
  lotsTitle:       { fr: "Lots", en: "Units", ar: "الوحدات", es: "Unidades" },
  noLots:          { fr: "Aucun lot", en: "No units", ar: "لا توجد وحدات", es: "Sin unidades" },
  locatairesTitle: { fr: "Locataires", en: "Tenants", ar: "المستأجرون", es: "Inquilinos" },
  noTenants:       { fr: "Aucun locataire", en: "No tenants", ar: "لا يوجد مستأجرون", es: "Sin inquilinos" },
  floor:           { fr: "Étage", en: "Floor", ar: "الطابق", es: "Piso" },
  surface:         { fr: "Surface", en: "Area", ar: "المساحة", es: "Superficie" },
  occupancy:       { fr: "Occupation", en: "Occupancy", ar: "الإشغال", es: "Ocupación" },

  // ─── Notifications ─────────────────────────────────────────────────────────
  notificationsTitle:{ fr: "Notifications", en: "Notifications", ar: "الإشعارات", es: "Notificaciones" },
  noNotifications:   { fr: "Aucune notification", en: "No notifications", ar: "لا توجد إشعارات", es: "Sin notificaciones" },
  markAllRead:       { fr: "Tout marquer lu", en: "Mark all as read", ar: "وضع علامة مقروء للكل", es: "Marcar todo como leído" },
  markRead:          { fr: "Marquer lu", en: "Mark as read", ar: "وضع علامة مقروء", es: "Marcar como leído" },
  electionsPendingVote:{ fr: "élection(s) en cours — votre vote est attendu", en: "election(s) in progress — your vote is expected", ar: "انتخاب(ات) جارية — صوتك منتظر", es: "elección(es) en curso — se espera su voto" },
  cotisationLate:    { fr: "cotisation(s) en retard — régularisez votre situation", en: "late contribution(s) — please regularize your situation", ar: "اشتراك(ات) متأخرة — يرجى تسوية وضعك", es: "cuota(s) atrasada(s) — regularice su situación" },
  unreadAlerts:      { fr: "alerte(s) non lue(s) dans votre tableau de bord", en: "unread alert(s) in your dashboard", ar: "تنبيه(ات) غير مقروء في لوحتك", es: "alerta(s) no leída(s) en su panel" },
  pendingTickets:    { fr: "ticket(s) support en attente de traitement", en: "support ticket(s) pending treatment", ar: "تذكرة(تذاكر) دعم بانتظار المعالجة", es: "ticket(s) de soporte pendiente(s)" },
  newTicketCreated:  { fr: "Nouveau ticket créé", en: "New ticket created", ar: "تم إنشاء تذكرة جديدة", es: "Nuevo ticket creado" },
  electionOpened:    { fr: "Nouvelle élection ouverte", en: "New election opened", ar: "انتخاب جديد مفتوح", es: "Nueva elección abierta" },
  newAlertReceived:  { fr: "Nouvelle alerte", en: "New alert", ar: "تنبيه جديد", es: "Nueva alerta" },

  // ─── Alerts ────────────────────────────────────────────────────────────────
  alertsTitle:     { fr: "Alertes", en: "Alerts", ar: "التنبيهات", es: "Alertas" },
  noAlerts:        { fr: "Aucune alerte", en: "No alerts", ar: "لا توجد تنبيهات", es: "Sin alertas" },
  alertLegal:      { fr: "Juridique", en: "Legal", ar: "قانوني", es: "Legal" },
  alertFinance:    { fr: "Finance", en: "Finance", ar: "المالية", es: "Finanzas" },
  alertGeneral:    { fr: "Général", en: "General", ar: "عام", es: "General" },
  markAsRead:      { fr: "Marquer comme lu", en: "Mark as read", ar: "وضع علامة مقروء", es: "Marcar como leído" },

  // ─── Audit Log ─────────────────────────────────────────────────────────────
  journalTitle:    { fr: "Journal d'Audit", en: "Audit Log", ar: "سجل التدقيق", es: "Registro de Auditoría" },
  loadingLogs:     { fr: "Chargement des journaux...", en: "Loading logs...", ar: "جارٍ تحميل السجلات...", es: "Cargando registros..." },
  noLogs:          { fr: "Aucun journal d'audit", en: "No audit logs", ar: "لا توجد سجلات تدقيق", es: "Sin registros de auditoría" },
  actorLabel:      { fr: "Acteur", en: "Actor", ar: "الفاعل", es: "Actor" },
  actionLabel:     { fr: "Action", en: "Action", ar: "الإجراء", es: "Acción" },
  targetLabel:     { fr: "Cible", en: "Target", ar: "الهدف", es: "Objetivo" },
  supervisionLabel:{ fr: "Supervision", en: "Supervision", ar: "الإشراف", es: "Supervisión" },

  // ─── Workflow ──────────────────────────────────────────────────────────────
  workflowTitle:   { fr: "Workflow", en: "Workflow", ar: "سير العمل", es: "Flujo de trabajo" },
  noWorkflows:     { fr: "Aucun workflow trouvé", en: "No workflows found", ar: "لم يتم العثور على سير عمل", es: "Sin flujos de trabajo" },
  workflowSteps:   { fr: "Étapes du workflow", en: "Workflow steps", ar: "خطوات سير العمل", es: "Pasos del flujo" },
  approveBtn:      { fr: "Approuver", en: "Approve", ar: "موافقة", es: "Aprobar" },
  rejectBtn:       { fr: "Rejeter", en: "Reject", ar: "رفض", es: "Rechazar" },
  approveConfirm:  { fr: "Confirmer l'approbation ?", en: "Confirm approval?", ar: "تأكيد الموافقة؟", es: "¿Confirmar aprobación?" },
  rejectConfirm:   { fr: "Confirmer le rejet ?", en: "Confirm rejection?", ar: "تأكيد الرفض؟", es: "¿Confirmar rechazo?" },

  // ─── Transparency ──────────────────────────────────────────────────────────
  transparencyTitle:{ fr: "Transparence Financière", en: "Financial Transparency", ar: "الشفافية المالية", es: "Transparencia Financiera" },
  voteFor:          { fr: "Pour ✓", en: "For ✓", ar: "مع ✓", es: "A favor ✓" },
  voteAgainst:      { fr: "Contre ✗", en: "Against ✗", ar: "ضد ✗", es: "En contra ✗" },

  // ─── Statistics ────────────────────────────────────────────────────────────
  statisticsTitle:  { fr: "Statistiques", en: "Statistics", ar: "الإحصائيات", es: "Estadísticas" },
  overviewLabel:    { fr: "Vue d'ensemble", en: "Overview", ar: "نظرة عامة", es: "Resumen" },
  trendsLabel:      { fr: "Tendances", en: "Trends", ar: "الاتجاهات", es: "Tendencias" },

  // ─── Marketplace / Products ────────────────────────────────────────────────
  marketplaceTitle: { fr: "Marketplace", en: "Marketplace", ar: "السوق", es: "Mercado" },
  noProducts:       { fr: "Aucun produit", en: "No products", ar: "لا توجد منتجات", es: "Sin productos" },
  addToCart:        { fr: "Ajouter au panier", en: "Add to cart", ar: "إضافة للسلة", es: "Agregar al carrito" },
  productAvailable: { fr: "Disponible", en: "Available", ar: "متاح", es: "Disponible" },
  productSoldOut:   { fr: "Épuisé", en: "Sold out", ar: "نفد المخزون", es: "Agotado" },
  productPending:   { fr: "En attente", en: "Pending", ar: "بانتظار", es: "Pendiente" },
  priceLabel:       { fr: "Prix", en: "Price", ar: "السعر", es: "Precio" },
  quantityLabel:    { fr: "Quantité", en: "Quantity", ar: "الكمية", es: "Cantidad" },
  noOrders:         { fr: "Aucune commande", en: "No orders", ar: "لا توجد طلبات", es: "Sin pedidos" },
  noFavorites:      { fr: "Aucun favori", en: "No favorites", ar: "لا توجد مفضلة", es: "Sin favoritos" },
  noReviews:        { fr: "Aucun avis", en: "No reviews", ar: "لا توجد تقييمات", es: "Sin reseñas" },
  cartEmpty:        { fr: "Panier vide", en: "Empty cart", ar: "السلة فارغة", es: "Carrito vacío" },

  // ─── SyndicateCard ─────────────────────────────────────────────────────────
  syndicateHealthy:  { fr: "Sain", en: "Healthy", ar: "جيد", es: "Saludable" },
  syndicateWarning:  { fr: "Attention", en: "Warning", ar: "تحذير", es: "Advertencia" },
  syndicateCritical: { fr: "Critique", en: "Critical", ar: "حرج", es: "Crítico" },
  syndicateActive:   { fr: "Actif", en: "Active", ar: "نشط", es: "Activo" },
  syndicateInactive: { fr: "Inactif", en: "Inactive", ar: "غير نشط", es: "Inactivo" },
  buildingsLabel:    { fr: "Immeubles", en: "Buildings", ar: "المباني", es: "Edificios" },
  membersLabel:      { fr: "Membres", en: "Members", ar: "الأعضاء", es: "Miembros" },
  regNumberLabel:    { fr: "N° Enreg.", en: "Reg. No.", ar: "رقم التسجيل", es: "N° Registro" },

  // ─── MemberCard ────────────────────────────────────────────────────────────
  memberActive:    { fr: "Actif", en: "Active", ar: "نشط", es: "Activo" },
  memberInactive:  { fr: "Inactif", en: "Inactive", ar: "غير نشط", es: "Inactivo" },
  memberPending:   { fr: "En attente", en: "Pending", ar: "بانتظار", es: "Pendiente" },
  cotisationPaid:  { fr: "Payée", en: "Paid", ar: "مدفوع", es: "Pagada" },
  cotisationLateLabel:{ fr: "En retard", en: "Late", ar: "متأخر", es: "Atrasado" },

  // ─── Error / Boundary ──────────────────────────────────────────────────────
  errorOccurred:   { fr: "Une erreur s'est produite", en: "An error occurred", ar: "حدث خطأ", es: "Se produjo un error" },
  reloadApp:       { fr: "Veuillez recharger l'application pour continuer", en: "Please reload the application to continue", ar: "الرجاء إعادة تحميل التطبيق للمتابعة", es: "Por favor recargue la aplicación para continuar" },
  tryAgain:        { fr: "Réessayer", en: "Try again", ar: "حاول مجدداً", es: "Intentar de nuevo" },
  errorDetails:    { fr: "Détails de l'erreur", en: "Error details", ar: "تفاصيل الخطأ", es: "Detalles del error" },

  // ─── Publications ──────────────────────────────────────────────────────────
  publicationsTitle:{ fr: "Publications", en: "Publications", ar: "المنشورات", es: "Publicaciones" },
  noPublications:   { fr: "Aucune publication", en: "No publications", ar: "لا توجد منشورات", es: "Sin publicaciones" },
  newPublication:   { fr: "Nouvelle publication", en: "New publication", ar: "منشور جديد", es: "Nueva publicación" },
  writePublication: { fr: "Écrire une publication...", en: "Write a publication...", ar: "اكتب منشوراً...", es: "Escribir una publicación..." },

  // ─── Ideas ─────────────────────────────────────────────────────────────────
  ideasTitle:      { fr: "Idées & Propositions", en: "Ideas & Proposals", ar: "الأفكار والمقترحات", es: "Ideas y Propuestas" },
  noIdeas:         { fr: "Aucune idée", en: "No ideas", ar: "لا توجد أفكار", es: "Sin ideas" },
  newIdea:         { fr: "Nouvelle idée", en: "New idea", ar: "فكرة جديدة", es: "Nueva idea" },
  ideaTitleLabel:  { fr: "Titre de l'idée *", en: "Idea title *", ar: "عنوان الفكرة *", es: "Título de la idea *" },
  ideaDescLabel:   { fr: "Description *", en: "Description *", ar: "الوصف *", es: "Descripción *" },
  voteUp:          { fr: "Voter pour", en: "Vote up", ar: "تصويت إيجابي", es: "Votar a favor" },
  voteDown:        { fr: "Voter contre", en: "Vote down", ar: "تصويت سلبي", es: "Votar en contra" },

  // ─── Escalation ────────────────────────────────────────────────────────────
  escalationTitle: { fr: "Escalade de Dettes", en: "Debt Escalation", ar: "تصعيد الديون", es: "Escalada de Deudas" },
  noEscalations:   { fr: "Aucune escalade", en: "No escalations", ar: "لا يوجد تصعيد", es: "Sin escaladas" },

  // ─── Parking ───────────────────────────────────────────────────────────────
  parkingTitle:    { fr: "Parking", en: "Parking", ar: "مواقف السيارات", es: "Estacionamiento" },
  noParking:       { fr: "Aucune place de parking", en: "No parking spots", ar: "لا توجد أماكن انتظار", es: "Sin plazas de aparcamiento" },
  reserveSpot:     { fr: "Réserver", en: "Reserve", ar: "احجز", es: "Reservar" },
  spotAvailable:   { fr: "Disponible", en: "Available", ar: "متاح", es: "Disponible" },
  spotOccupied:    { fr: "Occupé", en: "Occupied", ar: "مشغول", es: "Ocupado" },

  // ─── Onboarding ────────────────────────────────────────────────────────────
  onboardingStep1Title:  { fr: "Informations", en: "Information", ar: "المعلومات", es: "Información" },
  onboardingStep2Title:  { fr: "Profession", en: "Profession", ar: "المهنة", es: "Profesión" },
  onboardingStep3Title:  { fr: "Avatar", en: "Avatar", ar: "الصورة الرمزية", es: "Avatar" },
  onboardingStep4Title:  { fr: "Confirmation", en: "Confirmation", ar: "التأكيد", es: "Confirmación" },
  onboardingStep1Desc:   { fr: "Ces informations permettront aux autres membres de vous identifier.", en: "This information will allow other members to identify you.", ar: "ستسمح هذه المعلومات للأعضاء الآخرين بالتعرف عليك.", es: "Esta información permitirá a otros miembros identificarle." },
  onboardingStep2Desc:   { fr: "Informations professionnelles pour personnaliser votre expérience syndicale.", en: "Professional information to personalize your union experience.", ar: "معلومات مهنية لتخصيص تجربتك النقابية.", es: "Información profesional para personalizar su experiencia sindical." },
  onboardingStep3Desc:   { fr: "Choisissez la couleur de votre avatar. Vos initiales seront affichées automatiquement.", en: "Choose your avatar color. Your initials will be displayed automatically.", ar: "اختر لون صورتك الرمزية. ستُعرض أحرفك الأولى تلقائياً.", es: "Elija el color de su avatar. Sus iniciales se mostrarán automáticamente." },
  fullNameLabel:         { fr: "Nom complet *", en: "Full name *", ar: "الاسم الكامل *", es: "Nombre completo *" },
  fullNamePlaceholder:   { fr: "Prénom et NOM", en: "First and LAST name", ar: "الاسم الأول والاسم الأخير", es: "Nombre y APELLIDO" },
  phonePlaceholder:      { fr: "+212 6 00 00 00 00", en: "+1 555 000 0000", ar: "+212 6 00 00 00 00", es: "+34 600 000 000" },
  addressPlaceholder:    { fr: "Rue, quartier...", en: "Street, neighborhood...", ar: "الشارع، الحي...", es: "Calle, barrio..." },
  cityLabel:             { fr: "Ville *", en: "City *", ar: "المدينة *", es: "Ciudad *" },
  employerLabel:         { fr: "Établissement / Employeur *", en: "Institution / Employer *", ar: "المؤسسة / صاحب العمل *", es: "Institución / Empleador *" },
  employerPlaceholder:   { fr: "Ex: Lycée Al Kindi, Casablanca", en: "Ex: Al Kindi High School, Casablanca", ar: "مثال: ثانوية القندي، الدار البيضاء", es: "Ej: Instituto Al Kindi, Casablanca" },
  sectorLabel:           { fr: "Secteur d'activité", en: "Industry sector", ar: "قطاع النشاط", es: "Sector de actividad" },
  seniorityLabel:        { fr: "Ancienneté", en: "Seniority", ar: "الأقدمية", es: "Antigüedad" },
  onboardingRequired:    { fr: "Requis", en: "Required", ar: "مطلوب", es: "Requerido" },
  fullNameRequired:      { fr: "Le nom complet est obligatoire.", en: "Full name is required.", ar: "الاسم الكامل مطلوب.", es: "El nombre completo es obligatorio." },
  phoneRequired:         { fr: "Le téléphone est obligatoire.", en: "Phone number is required.", ar: "رقم الهاتف مطلوب.", es: "El teléfono es obligatorio." },
  cityRequired:          { fr: "Veuillez sélectionner une ville.", en: "Please select a city.", ar: "الرجاء اختيار مدينة.", es: "Por favor seleccione una ciudad." },
  employerRequired:      { fr: "L'employeur est obligatoire.", en: "Employer is required.", ar: "صاحب العمل مطلوب.", es: "El empleador es obligatorio." },
  termsRequired:         { fr: "Conditions requises", en: "Terms required", ar: "الشروط مطلوبة", es: "Términos requeridos" },
  termsRequiredMsg:      { fr: "Veuillez accepter les conditions d'utilisation pour continuer.", en: "Please accept the terms of use to continue.", ar: "يرجى قبول شروط الاستخدام للمتابعة.", es: "Por favor acepte los términos de uso para continuar." },
  profileCompletedTitle: { fr: "Profil complété !", en: "Profile completed!", ar: "تم إكمال الملف الشخصي!", es: "¡Perfil completado!" },
  profileCompletedMsg:   { fr: "Votre profil a été enregistré avec succès.", en: "Your profile has been saved successfully.", ar: "تم حفظ ملفك الشخصي بنجاح.", es: "Su perfil ha sido guardado con éxito." },
  accessApp:             { fr: "Accéder à l'application", en: "Access the app", ar: "الوصول إلى التطبيق", es: "Acceder a la aplicación" },

  // ─── Profile ───────────────────────────────────────────────────────────────
  profileTitle:    { fr: "Mon Profil", en: "My Profile", ar: "ملفي الشخصي", es: "Mi Perfil" },
  editProfileBtn:  { fr: "Modifier le profil", en: "Edit profile", ar: "تعديل الملف الشخصي", es: "Editar perfil" },
  saveProfile:     { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  profileUpdated:  { fr: "Profil mis à jour avec succès.", en: "Profile updated successfully.", ar: "تم تحديث الملف الشخصي بنجاح.", es: "Perfil actualizado con éxito." },

  // ─── Governance / AG / PV ──────────────────────────────────────────────────
  governanceTitle: { fr: "Gouvernance", en: "Governance", ar: "الحوكمة", es: "Gobernanza" },
  agTitle:         { fr: "Assemblée Générale", en: "General Assembly", ar: "الجمعية العامة", es: "Asamblea General" },
  pvTitle:         { fr: "Procès-Verbaux", en: "Meeting Minutes", ar: "محاضر الاجتماعات", es: "Actas de Reuniones" },
  noPVs:           { fr: "Aucun procès-verbal", en: "No minutes", ar: "لا توجد محاضر", es: "Sin actas" },
  resolutionLabel: { fr: "Résolution", en: "Resolution", ar: "القرار", es: "Resolución" },
  approvedLabel:   { fr: "Approuvé", en: "Approved", ar: "موافق عليه", es: "Aprobado" },
  rejectedLabel:   { fr: "Rejeté", en: "Rejected", ar: "مرفوض", es: "Rechazado" },

  // ─── Legal ─────────────────────────────────────────────────────────────────
  legalTitle:       { fr: "Ressources Juridiques", en: "Legal Resources", ar: "الموارد القانونية", es: "Recursos Legales" },
  legalAlertTitle:  { fr: "Alertes Juridiques", en: "Legal Alerts", ar: "التنبيهات القانونية", es: "Alertas Legales" },
  noLegalAlerts:    { fr: "Aucune alerte juridique", en: "No legal alerts", ar: "لا توجد تنبيهات قانونية", es: "Sin alertas legales" },
  repertoireTitle:  { fr: "Répertoire Juridique", en: "Legal Directory", ar: "الدليل القانوني", es: "Directorio Jurídico" },
  noLegalDocs:      { fr: "Aucun document juridique", en: "No legal documents", ar: "لا توجد وثائق قانونية", es: "Sin documentos legales" },

  // ─── National Board ────────────────────────────────────────────────────────
  tableauNationalTitle:{ fr: "Tableau National", en: "National Board", ar: "اللوحة الوطنية", es: "Tablero Nacional" },
  nationalRanking:     { fr: "Classement national", en: "National ranking", ar: "التصنيف الوطني", es: "Clasificación nacional" },
  noRankings:          { fr: "Aucun classement disponible", en: "No rankings available", ar: "لا يوجد تصنيف متاح", es: "Sin clasificaciones" },

  // ─── Users / Team ──────────────────────────────────────────────────────────
  utilisateursTitle: { fr: "Utilisateurs", en: "Users", ar: "المستخدمون", es: "Usuarios" },
  noUsers:           { fr: "Aucun utilisateur", en: "No users", ar: "لا يوجد مستخدمون", es: "Sin usuarios" },
  teamTitle:         { fr: "Équipe Syndicale", en: "Syndicate Team", ar: "فريق النقابة", es: "Equipo Sindical" },
  noTeamMembers:     { fr: "Aucun membre d'équipe", en: "No team members", ar: "لا يوجد أعضاء في الفريق", es: "Sin miembros del equipo" },

  // ─── Actions / Union ──────────────────────────────────────────────────────
  actionsTitle:    { fr: "Actions Syndicales", en: "Union Actions", ar: "الإجراءات النقابية", es: "Acciones Sindicales" },
  noActions:       { fr: "Aucune action syndicale", en: "No union actions", ar: "لا توجد إجراءات نقابية", es: "Sin acciones sindicales" },
  newAction:       { fr: "Nouvelle action", en: "New action", ar: "إجراء جديد", es: "Nueva acción" },
  participantsLabel:{ fr: "Participants", en: "Participants", ar: "المشاركون", es: "Participantes" },

  // ─── Partners ──────────────────────────────────────────────────────────────
  partenairesTitle: { fr: "Partenaires", en: "Partners", ar: "الشركاء", es: "Socios" },
  noPartners:       { fr: "Aucun partenaire", en: "No partners", ar: "لا يوجد شركاء", es: "Sin socios" },

  // ─── Activity ──────────────────────────────────────────────────────────────
  activityTitle:   { fr: "Activité Récente", en: "Recent Activity", ar: "النشاط الأخير", es: "Actividad Reciente" },
  noActivity:      { fr: "Aucune activité récente", en: "No recent activity", ar: "لا يوجد نشاط حديث", es: "Sin actividad reciente" },

  // ─── Simulateur ────────────────────────────────────────────────────────────
  simulateurTitle: { fr: "Simulateur de Charges", en: "Charge Simulator", ar: "محاكي الرسوم", es: "Simulador de Cargos" },
  simulate:        { fr: "Simuler", en: "Simulate", ar: "محاكاة", es: "Simular" },

  // ─── Bon de livraison ──────────────────────────────────────────────────────
  bonLivraisonTitle:{ fr: "Bons de Livraison", en: "Delivery Notes", ar: "سندات التسليم", es: "Albaranes" },
  noBonsLivraison:  { fr: "Aucun bon de livraison", en: "No delivery notes", ar: "لا توجد سندات تسليم", es: "Sin albaranes" },

  // ─── Reports ───────────────────────────────────────────────────────────────
  reportsTitle:    { fr: "Rapports", en: "Reports", ar: "التقارير", es: "Informes" },
  generateReport:  { fr: "Générer un rapport", en: "Generate report", ar: "إنشاء تقرير", es: "Generar informe" },
  exportPDF:       { fr: "Exporter en PDF", en: "Export as PDF", ar: "تصدير بصيغة PDF", es: "Exportar como PDF" },
  exportExcel:     { fr: "Exporter en Excel", en: "Export as Excel", ar: "تصدير بصيغة Excel", es: "Exportar como Excel" },

  // ─── Syndicate Setup ────────────────────────────────────────────────────────
  syndSetupTitle:  { fr: "Configuration du Syndicat", en: "Syndicate Setup", ar: "إعداد النقابة", es: "Configuración del Sindicato" },
  sandboxRequired: { fr: "Sandbox requis", en: "Sandbox required", ar: "وضع الاختبار مطلوب", es: "Sandbox requerido" },
  sandboxMsg:      { fr: "Activez le mode sandbox pour cette fonctionnalité.", en: "Please enable sandbox mode for this feature.", ar: "الرجاء تفعيل وضع الاختبار لهذه الميزة.", es: "Por favor active el modo sandbox para esta función." },
  applyChangesTitle:{ fr: "Appliquer les modifications", en: "Apply changes", ar: "تطبيق التغييرات", es: "Aplicar cambios" },
  applyChangesMsg: { fr: "Voulez-vous appliquer ces modifications ?", en: "Do you want to apply these changes?", ar: "هل تريد تطبيق هذه التغييرات؟", es: "¿Desea aplicar estos cambios?" },
  changesApplied:  { fr: "Les modifications ont été appliquées.", en: "Changes have been applied.", ar: "تم تطبيق التغييرات.", es: "Los cambios han sido aplicados." },

  // ─── Mon Bail / Lot ────────────────────────────────────────────────────────
  monBailTitle:    { fr: "Mon Bail", en: "My Lease", ar: "عقد إيجاري", es: "Mi Contrato de Arrendamiento" },
  monLotTitle:     { fr: "Mon Lot", en: "My Unit", ar: "وحدتي", es: "Mi Unidad" },
  etatDesLieuxTitle:{ fr: "État des Lieux", en: "Property Inspection Report", ar: "تقرير جرد الحالة", es: "Informe de Inventario" },
  leaseStart:      { fr: "Début du bail", en: "Lease start", ar: "بداية الإيجار", es: "Inicio del contrato" },
  leaseEnd:        { fr: "Fin du bail", en: "Lease end", ar: "نهاية الإيجار", es: "Fin del contrato" },
  monthlyRent:     { fr: "Loyer mensuel", en: "Monthly rent", ar: "الإيجار الشهري", es: "Renta mensual" },

  // ─── Actes Administratifs ──────────────────────────────────────────────────
  actesTitle:      { fr: "Actes Administratifs", en: "Administrative Acts", ar: "الأعمال الإدارية", es: "Actos Administrativos" },
  noActes:         { fr: "Aucun acte administratif", en: "No administrative acts", ar: "لا توجد أعمال إدارية", es: "Sin actos administrativos" },

  // ─── CGU ──────────────────────────────────────────────────────────────────
  cguTitle:        { fr: "Conditions Générales d'Utilisation", en: "Terms of Service", ar: "الشروط العامة للاستخدام", es: "Términos y Condiciones de Uso" },
  acceptTerms:     { fr: "J'accepte les conditions d'utilisation", en: "I accept the terms of use", ar: "أوافق على شروط الاستخدام", es: "Acepto los términos de uso" },

  // ─── Reglements ────────────────────────────────────────────────────────────
  reglementsTitle: { fr: "Règlements de Copropriété", en: "Condominium Regulations", ar: "لوائح الملكية المشتركة", es: "Reglamentos de Copropiedad" },
  noReglements:    { fr: "Aucun règlement", en: "No regulations", ar: "لا توجد لوائح", es: "Sin reglamentos" },

  // ─── Travaux Privatifs ─────────────────────────────────────────────────────
  travauxPrivatifsTitle:{ fr: "Travaux Privatifs", en: "Private Works", ar: "الأشغال الخاصة", es: "Obras Privadas" },
  finalDecision:        { fr: "Décision finale", en: "Final decision", ar: "القرار النهائي", es: "Decisión final" },
  noTravauxPrivatifs:   { fr: "Aucun travaux privatif", en: "No private works", ar: "لا توجد أشغال خاصة", es: "Sin obras privadas" },

  // ─── Financial Dashboard ──────────────────────────────────────────────────
  tableauBordTitle:{ fr: "Tableau de Bord Financier", en: "Financial Dashboard", ar: "لوحة القيادة المالية", es: "Panel Financiero" },
  income:          { fr: "Revenus", en: "Income", ar: "الإيرادات", es: "Ingresos" },
  expenses:        { fr: "Dépenses", en: "Expenses", ar: "النفقات", es: "Gastos" },
  balance:         { fr: "Solde", en: "Balance", ar: "الرصيد", es: "Balance" },

  // ─── Search ────────────────────────────────────────────────────────────────
  searchTitle:     { fr: "Recherche", en: "Search", ar: "البحث", es: "Búsqueda" },
  searchPlaceholder:{ fr: "Rechercher dans l'application...", en: "Search in the app...", ar: "البحث في التطبيق...", es: "Buscar en la aplicación..." },
  searchResults:   { fr: "Résultats", en: "Results", ar: "النتائج", es: "Resultados" },
  noResults:       { fr: "Aucun résultat", en: "No results", ar: "لا توجد نتائج", es: "Sin resultados" },

  // ─── Calendar ──────────────────────────────────────────────────────────────
  calendarTitle:   { fr: "Calendrier", en: "Calendar", ar: "التقويم", es: "Calendario" },
  noEvents:        { fr: "Aucun événement", en: "No events", ar: "لا توجد أحداث", es: "Sin eventos" },
  eventTitle:      { fr: "Événement", en: "Event", ar: "حدث", es: "Evento" },

  // ─── Additional UI strings ───────────────────────────────────────────────────
  choosePlan:         { fr: "Choisir ce plan", en: "Choose this plan", ar: "اختر هذه الخطة", es: "Elegir este plan" },
  contactTeamCustom:  { fr: "Contactez notre équipe pour une offre sur mesure.", en: "Contact our team for a tailored offer.", ar: "اتصل بفريقنا للحصول على عرض مخصص.", es: "Contacta con nuestro equipo para una oferta a medida." },
  // Greetings
  greetingMorning:    { fr: "Bonjour", en: "Good morning", ar: "صباح الخير", es: "Buenos días" },
  greetingAfternoon:  { fr: "Bon après-midi", en: "Good afternoon", ar: "طاب مساؤك", es: "Buenas tardes" },
  greetingEvening:    { fr: "Bonsoir", en: "Good evening", ar: "مساء الخير", es: "Buenas noches" },
  // Dashboard / index
  recentActivity:     { fr: "Activité récente", en: "Recent activity", ar: "النشاط الأخير", es: "Actividad reciente" },
  noRecentActivity:   { fr: "Aucune activité récente", en: "No recent activity", ar: "لا يوجد نشاط أخير", es: "Sin actividad reciente" },
  quickAccess:        { fr: "Accès rapide", en: "Quick access", ar: "وصول سريع", es: "Acceso rápido" },
  yourActions:        { fr: "Vos actions apparaîtront ici", en: "Your actions will appear here", ar: "ستظهر إجراءاتك هنا", es: "Sus acciones aparecerán aquí" },
  electionActive:     { fr: "Élection en cours", en: "Election in progress", ar: "الانتخابات جارية", es: "Elección en curso" },
  // Finance tab
  financeAdminSub:    { fr: "Gestion financière de la copropriété", en: "Financial management of the co-ownership", ar: "الإدارة المالية للملكية المشتركة", es: "Gestión financiera de la copropiedad" },
  financeMemberSub:   { fr: "Mes finances & paiements", en: "My finances & payments", ar: "شؤوني المالية ومدفوعاتي", es: "Mis finanzas y pagos" },
  financeModules:     { fr: "Modules financiers", en: "Financial modules", ar: "الوحدات المالية", es: "Módulos financieros" },
  // Marketplace
  sellAction:         { fr: "Vendre", en: "Sell", ar: "بيع", es: "Vender" },
  searchProduct:      { fr: "Rechercher un produit, vendeur...", en: "Search for a product, seller...", ar: "البحث عن منتج، بائع...", es: "Buscar un producto, vendedor..." },
  featuredLabel:      { fr: "Vedette", en: "Featured", ar: "مميز", es: "Destacado" },
  myListings:         { fr: "Mes annonces", en: "My listings", ar: "إعلاناتي", es: "Mis anuncios" },
  pendingApproval:    { fr: "En attente d'approbation", en: "Pending approval", ar: "بانتظار الموافقة", es: "Pendiente de aprobación" },
  approveProduct:     { fr: "Approuver", en: "Approve", ar: "موافقة", es: "Aprobar" },
  rejectProduct:      { fr: "Rejeter", en: "Reject", ar: "رفض", es: "Rechazar" },
  loadingMarketplace: { fr: "Chargement du marketplace...", en: "Loading marketplace...", ar: "جارٍ تحميل السوق...", es: "Cargando el mercado..." },
  // Members tab
  newSyndicate:       { fr: "Nouveau syndicat", en: "New syndicate", ar: "نقابة جديدة", es: "Nuevo sindicato" },
  addMember:          { fr: "Ajouter un membre", en: "Add a member", ar: "إضافة عضو", es: "Agregar miembro" },
  syndicateList:      { fr: "Liste des syndicats", en: "Syndicate list", ar: "قائمة النقابات", es: "Lista de sindicatos" },
  // More tab
  moreTitle:          { fr: "Plus de fonctionnalités", en: "More features", ar: "المزيد من الميزات", es: "Más funciones" },
  adminTools:         { fr: "Outils Administration", en: "Admin Tools", ar: "أدوات الإدارة", es: "Herramientas de administración" },
  financial:          { fr: "Financier", en: "Financial", ar: "مالي", es: "Financiero" },
  managementTools:    { fr: "Gestion & Outils", en: "Management & Tools", ar: "الإدارة والأدوات", es: "Gestión y herramientas" },
  tenantSpace:        { fr: "Espace Locataire", en: "Tenant Space", ar: "فضاء المستأجر", es: "Espacio inquilino" },
  // Buildings
  residential:        { fr: "Résidentiel", en: "Residential", ar: "سكني", es: "Residencial" },
  commercial:         { fr: "Commercial", en: "Commercial", ar: "تجاري", es: "Comercial" },
  offices:            { fr: "Bureaux", en: "Offices", ar: "مكاتب", es: "Oficinas" },
  mixed:              { fr: "Mixte", en: "Mixed", ar: "مختلط", es: "Mixto" },
  buildingsResidences:{ fr: "Immeubles & Résidences", en: "Buildings & Residences", ar: "المباني والإقامات", es: "Edificios y Residencias" },
  newBuilding:        { fr: "Nouvel immeuble", en: "New building", ar: "مبنى جديد", es: "Nuevo edificio" },
  // Cart
  cartTitle:          { fr: "Mon Panier", en: "My Cart", ar: "سلتي", es: "Mi carrito" },
  checkout:           { fr: "Commander", en: "Checkout", ar: "إتمام الطلب", es: "Pagar" },
  orderPlaced:        { fr: "Commande passée avec succès !", en: "Order placed successfully!", ar: "تم إنشاء الطلب بنجاح!", es: "¡Pedido realizado con éxito!" },
  // CGU / Terms
  acceptCgu:          { fr: "Accepter les CGU", en: "Accept Terms", ar: "قبول الشروط", es: "Aceptar Términos" },
  // General Assembly
  nextAG:             { fr: "PROCHAINE AG", en: "NEXT GA", ar: "الجمعية العامة القادمة", es: "PRÓXIMA AG" },
  resolutions:        { fr: "Résolutions", en: "Resolutions", ar: "القرارات", es: "Resoluciones" },
  adopted:            { fr: "Adoptée", en: "Adopted", ar: "معتمدة", es: "Adoptada" },
  abstentions:        { fr: "Abstentions", en: "Abstentions", ar: "امتناع", es: "Abstenciones" },
  votesFor:           { fr: "Pour", en: "For", ar: "مع", es: "A favor" },
  votesAgainst:       { fr: "Contre", en: "Against", ar: "ضد", es: "En contra" },
  // Bon livraison
  deliveryNoteTitle:  { fr: "Bon de Livraison", en: "Delivery Note", ar: "وصل التسليم", es: "Albarán" },
  incoming:           { fr: "Entrées", en: "Incoming", ar: "الواردة", es: "Entradas" },
  outgoing:           { fr: "Sorties", en: "Outgoing", ar: "الصادرة", es: "Salidas" },
  recipient:          { fr: "Destinataire", en: "Recipient", ar: "المستلم", es: "Destinatario" },
  // Charges
  atPay:              { fr: "À payer", en: "To pay", ar: "للدفع", es: "Por pagar" },
  inValidation:       { fr: "En validation", en: "In validation", ar: "قيد التحقق", es: "En validación" },
  // Equipe syndic
  teamRole:           { fr: "Rôle", en: "Role", ar: "الدور", es: "Rol" },
  teamMember:         { fr: "Membre d'équipe", en: "Team member", ar: "عضو الفريق", es: "Miembro del equipo" },
  addTeamMember:      { fr: "Ajouter un membre", en: "Add member", ar: "إضافة عضو", es: "Agregar miembro" },
  // Etat des lieux
  inspectionTitle:    { fr: "État des Lieux", en: "Property Inspection", ar: "جرد الحالة", es: "Inventario de estado" },
  newInspection:      { fr: "Nouvel état des lieux", en: "New inspection", ar: "جرد حالة جديد", es: "Nuevo inventario" },
  // Favorites
  myFavorites:        { fr: "Mes Favoris", en: "My Favorites", ar: "مفضلتي", es: "Mis favoritos" },
  // Governance
  governanceOverview: { fr: "Vue d'ensemble", en: "Overview", ar: "نظرة عامة", es: "Visión general" },
  // Ideas
  submitIdea:         { fr: "Soumettre une idée", en: "Submit an idea", ar: "إرسال فكرة", es: "Enviar una idea" },
  noIdeasYet:         { fr: "Aucune idée soumise", en: "No ideas submitted yet", ar: "لم يتم إرسال أي فكرة بعد", es: "No hay ideas enviadas aún" },
  beFirst:            { fr: "Soyez le premier à proposer une amélioration", en: "Be the first to propose an improvement", ar: "كن أول من يقترح تحسيناً", es: "Sea el primero en proponer una mejora" },
  // Invoices
  invoiceNumber:      { fr: "Facture N°", en: "Invoice No.", ar: "فاتورة رقم", es: "Factura N°" },
  dueDate:            { fr: "Échéance", en: "Due date", ar: "تاريخ الاستحقاق", es: "Vencimiento" },
  // Locataires
  tenantDetail:       { fr: "Détail locataire", en: "Tenant detail", ar: "تفاصيل المستأجر", es: "Detalle inquilino" },
  rentAmount:         { fr: "Loyer mensuel", en: "Monthly rent", ar: "الإيجار الشهري", es: "Alquiler mensual" },
  // Lots
  lotDetail:          { fr: "Détail du lot", en: "Unit detail", ar: "تفاصيل الوحدة", es: "Detalle de la unidad" },
  lotNumber:          { fr: "Numéro du lot", en: "Unit number", ar: "رقم الوحدة", es: "Número de unidad" },
  lotType:            { fr: "Type de lot", en: "Unit type", ar: "نوع الوحدة", es: "Tipo de unidad" },
  // Mon bail
  myLease:            { fr: "Mon Bail", en: "My Lease", ar: "عقد إيجاري", es: "Mi contrato de arrendamiento" },
  leaseStatus:        { fr: "Statut du bail", en: "Lease status", ar: "حالة العقد", es: "Estado del contrato" },
  // Mon lot
  myUnit:             { fr: "Mon Lot", en: "My Unit", ar: "وحدتي السكنية", es: "Mi unidad" },
  // Messagerie interne
  internalMessagingTitle:{ fr: "Messagerie Interne", en: "Internal Messaging", ar: "المراسلات الداخلية", es: "Mensajería interna" },
  // Notifications
  markAllAsRead:      { fr: "Tout marquer comme lu", en: "Mark all as read", ar: "تحديد الكل كمقروء", es: "Marcar todo como leído" },
  // Onboarding
  nextStep:           { fr: "Étape suivante", en: "Next step", ar: "الخطوة التالية", es: "Siguiente paso" },
  previousStep:       { fr: "Étape précédente", en: "Previous step", ar: "الخطوة السابقة", es: "Paso anterior" },
  iAgree:             { fr: "J'accepte les", en: "I agree to the", ar: "أوافق على", es: "Acepto los" },
  termsOfUse:         { fr: "Conditions d'utilisation", en: "Terms of use", ar: "شروط الاستخدام", es: "Términos de uso" },
  chooseColor:        { fr: "Choisir une couleur", en: "Choose a color", ar: "اختر لوناً", es: "Elegir un color" },
  // Orders
  orderDetail:        { fr: "Détail de la commande", en: "Order detail", ar: "تفاصيل الطلب", es: "Detalle del pedido" },
  orderStatus:        { fr: "Statut de la commande", en: "Order status", ar: "حالة الطلب", es: "Estado del pedido" },
  orderDate:          { fr: "Date de commande", en: "Order date", ar: "تاريخ الطلب", es: "Fecha del pedido" },
  // Paiements
  paymentMethod:      { fr: "Méthode de paiement", en: "Payment method", ar: "طريقة الدفع", es: "Método de pago" },
  paymentRef:         { fr: "Référence", en: "Reference", ar: "المرجع", es: "Referencia" },
  // Parking
  parkingSpot:        { fr: "Place de parking", en: "Parking spot", ar: "مكان الانتظار", es: "Plaza de aparcamiento" },
  spotNumber:         { fr: "Numéro de place", en: "Spot number", ar: "رقم المكان", es: "Número de plaza" },
  // Partenaires
  partnersTitle:      { fr: "Partenaires", en: "Partners", ar: "الشركاء", es: "Socios" },
  partnerWebsite:     { fr: "Site web", en: "Website", ar: "الموقع الإلكتروني", es: "Sitio web" },
  // Prestataire detail
  providerDetail:     { fr: "Détail prestataire", en: "Provider detail", ar: "تفاصيل المزود", es: "Detalle del proveedor" },
  servicesDone:       { fr: "Interventions réalisées", en: "Completed services", ar: "الخدمات المنجزة", es: "Servicios realizados" },
  averageRating:      { fr: "Note moyenne", en: "Average rating", ar: "التقييم المتوسط", es: "Calificación media" },
  // Product detail
  productDetail:      { fr: "Détail du produit", en: "Product detail", ar: "تفاصيل المنتج", es: "Detalle del producto" },
  seller:             { fr: "Vendeur", en: "Seller", ar: "البائع", es: "Vendedor" },
  condition:          { fr: "État", en: "Condition", ar: "الحالة", es: "Estado" },
  // Profile
  memberSince:        { fr: "Membre depuis", en: "Member since", ar: "عضو منذ", es: "Miembro desde" },
  changeAvatar:       { fr: "Changer l'avatar", en: "Change avatar", ar: "تغيير الصورة الرمزية", es: "Cambiar avatar" },
  // Publications
  newPost:            { fr: "Nouvelle publication", en: "New post", ar: "منشور جديد", es: "Nueva publicación" },
  // PV
  pvNew:              { fr: "Nouveau PV", en: "New minutes", ar: "محضر جديد", es: "Nueva acta" },
  pvDate:             { fr: "Date du PV", en: "Minutes date", ar: "تاريخ المحضر", es: "Fecha del acta" },
  // Reports
  reportType:         { fr: "Type de rapport", en: "Report type", ar: "نوع التقرير", es: "Tipo de informe" },
  // Reviews
  reviewTitle:        { fr: "Avis", en: "Review", ar: "مراجعة", es: "Reseña" },
  writeReview:        { fr: "Écrire un avis", en: "Write a review", ar: "كتابة مراجعة", es: "Escribir una reseña" },
  // Search
  recentSearches:     { fr: "RECHERCHES RÉCENTES", en: "RECENT SEARCHES", ar: "عمليات البحث الأخيرة", es: "BÚSQUEDAS RECIENTES" },
  searchMembers:      { fr: "Rechercher membres, documents, réunions...", en: "Search members, documents, meetings...", ar: "البحث عن الأعضاء، المستندات، الاجتماعات...", es: "Buscar miembros, documentos, reuniones..." },
  noSearchResults:    { fr: "Aucun résultat", en: "No results", ar: "لا توجد نتائج", es: "Sin resultados" },
  // Simulateur (simulateurTitle and simulate already exist above)
  simulationResult:   { fr: "Résultat de simulation", en: "Simulation result", ar: "نتيجة المحاكاة", es: "Resultado de simulación" },
  // Sinistres
  sinistreType:       { fr: "Type de sinistre", en: "Claim type", ar: "نوع الحادث", es: "Tipo de siniestro" },
  declarationDate:    { fr: "Date de déclaration", en: "Declaration date", ar: "تاريخ التصريح", es: "Fecha de declaración" },
  // Syndicate setup
  syndicateName:      { fr: "Nom du syndicat *", en: "Syndicate name *", ar: "اسم النقابة *", es: "Nombre del sindicato *" },
  syndicateCity:      { fr: "Ville *", en: "City *", ar: "المدينة *", es: "Ciudad *" },
  // Tableau national
  nationalOverview:   { fr: "Vue Nationale", en: "National Overview", ar: "نظرة وطنية", es: "Vista nacional" },
  totalMembers:       { fr: "Total membres", en: "Total members", ar: "إجمالي الأعضاء", es: "Total miembros" },
  // Travaux privatifs
  privateWorks:       { fr: "Travaux Privatifs", en: "Private Works", ar: "الأشغال الخاصة", es: "Obras Privadas" },
  requestPrivateWork: { fr: "Demander des travaux", en: "Request works", ar: "طلب أشغال", es: "Solicitar obras" },
  // Utilisateurs
  userRole:           { fr: "Rôle utilisateur", en: "User role", ar: "دور المستخدم", es: "Rol de usuario" },
  userStatus:         { fr: "Statut utilisateur", en: "User status", ar: "حالة المستخدم", es: "Estado del usuario" },
  banUser:            { fr: "Bannir l'utilisateur", en: "Ban user", ar: "حظر المستخدم", es: "Prohibir usuario" },
  // Transparency (balance already exists above)
  totalRevenue:       { fr: "Total recettes", en: "Total revenue", ar: "إجمالي الإيرادات", es: "Total de ingresos" },
  totalExpenses:      { fr: "Total dépenses", en: "Total expenses", ar: "إجمالي المصروفات", es: "Total de gastos" },
  // Alerts
  alertDetail:        { fr: "Détail de l'alerte", en: "Alert detail", ar: "تفاصيل التنبيه", es: "Detalle de la alerta" },
  // Announcements
  newAnnouncement:    { fr: "Nouvelle annonce", en: "New announcement", ar: "إعلان جديد", es: "Nuevo anuncio" },
  publish:            { fr: "Publier", en: "Publish", ar: "نشر", es: "Publicar" },
  pinned:             { fr: "Épinglée", en: "Pinned", ar: "مثبت", es: "Fijado" },
  audienceLabel:      { fr: "Destinataires", en: "Audience", ar: "الجمهور", es: "Audiencia" },
  // Calendar additions (noEvents and eventTitle already exist above)
  addEvent:           { fr: "Ajouter un événement", en: "Add event", ar: "إضافة حدث", es: "Agregar evento" },
  // Agenda
  agendaTitle:        { fr: "Agenda", en: "Agenda", ar: "جدول الأعمال", es: "Agenda" },

  // ─── Dashboard / Index quick-action labels ──────────────────────────────────
  navNational:        { fr: "Tableau National", en: "National Dashboard", ar: "اللوحة الوطنية", es: "Panel Nacional" },
  navAudit:           { fr: "Audit", en: "Audit", ar: "التدقيق", es: "Auditoría" },
  navCopro:           { fr: "Copropriétaires", en: "Co-owners", ar: "الملاك المشتركون", es: "Copropietarios" },
  navAssemblies:      { fr: "Assemblées", en: "Assemblies", ar: "الجمعيات", es: "Asambleas" },
  navFinBoard:        { fr: "Tableau Financier", en: "Financial Dashboard", ar: "اللوحة المالية", es: "Panel Financiero" },
  navMyApart:         { fr: "Mon Appart.", en: "My Apartment", ar: "شقتي", es: "Mi Apartamento" },
  navIncidents:       { fr: "Incidents", en: "Incidents", ar: "الحوادث", es: "Incidentes" },
  myFavoritesList:    { fr: "Mes favoris", en: "My favorites", ar: "المفضلة", es: "Mis favoritos" },
  superAdminLabel:    { fr: "Super Administrateur", en: "Super Administrator", ar: "المدير العام", es: "Super Administrador" },
  adminSyndicLabel:   { fr: "Admin Syndicat", en: "Syndicate Admin", ar: "مدير النقابة", es: "Admin Sindicato" },
  tenantLabel:        { fr: "Locataire", en: "Tenant", ar: "المستأجر", es: "Inquilino" },
  memberLabel:        { fr: "Membre", en: "Member", ar: "العضو", es: "Miembro" },

  // ─── Announcements (annonces) ───────────────────────────────────────────────
  priorityImportant:    { fr: "Important", en: "Important", ar: "مهم", es: "Importante" },
  priorityInfo:         { fr: "Info", en: "Info", ar: "معلومة", es: "Info" },
  filterToutes:         { fr: "Toutes", en: "All", ar: "الكل", es: "Todas" },
  createAnnouncement:   { fr: "Créer une annonce", en: "Create announcement", ar: "إنشاء إعلان", es: "Crear anuncio" },
  publishAnnouncement:  { fr: "Publier l'annonce", en: "Publish announcement", ar: "نشر الإعلان", es: "Publicar anuncio" },
  annFormTitle:         { fr: "Titre *", en: "Title *", ar: "العنوان *", es: "Título *" },
  annFormContent:       { fr: "Contenu *", en: "Content *", ar: "المحتوى *", es: "Contenido *" },
  annFormExpiry:        { fr: "Date d'expiration", en: "Expiry date", ar: "تاريخ الانتهاء", es: "Fecha de expiración" },
  expiresOn:            { fr: "Expire le", en: "Expires on", ar: "تنتهي في", es: "Expira el" },
  deleteAnnouncement:   { fr: "Supprimer l'annonce", en: "Delete announcement", ar: "حذف الإعلان", es: "Eliminar anuncio" },
  requiredFields:       { fr: "Champs requis", en: "Required fields", ar: "الحقول المطلوبة", es: "Campos requeridos" },
  confirmDeleteTitle:   { fr: "Confirmer la suppression", en: "Confirm deletion", ar: "تأكيد الحذف", es: "Confirmar eliminación" },
  authorLabel:          { fr: "Auteur", en: "Author", ar: "المؤلف", es: "Autor" },
  announcePinned:       { fr: "Épinglée", en: "Pinned", ar: "مثبت", es: "Fijado" },
  noAnnouncementsYet:   { fr: "Aucune annonce pour le moment", en: "No announcements yet", ar: "لا توجد إعلانات في الوقت الحالي", es: "Sin anuncios por el momento" },

  // ─── Support (tickets) ──────────────────────────────────────────────────────
  catTechnique:         { fr: "Technique", en: "Technical", ar: "تقني", es: "Técnico" },
  catFinancial:         { fr: "Financier", en: "Financial", ar: "مالي", es: "Financiero" },
  catLegal:             { fr: "Juridique", en: "Legal", ar: "قانوني", es: "Legal" },
  catGeneral:           { fr: "Général", en: "General", ar: "عام", es: "General" },
  filterAllTickets:     { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  filterOpen:           { fr: "Ouverts", en: "Open", ar: "مفتوح", es: "Abiertos" },
  filterResolved:       { fr: "Résolus", en: "Resolved", ar: "محلول", es: "Resueltos" },
  replyLabel:           { fr: "Réponse", en: "Reply", ar: "الرد", es: "Respuesta" },
  replyInputPlaceholder:{ fr: "Saisissez votre réponse...", en: "Type your reply...", ar: "اكتب ردك...", es: "Escriba su respuesta..." },
  sendReply:            { fr: "Envoyer la réponse", en: "Send reply", ar: "إرسال الرد", es: "Enviar respuesta" },
  ticketResolvedMsg:    { fr: "Ce ticket a été résolu.", en: "This ticket has been resolved.", ar: "تم حل هذه التذكرة.", es: "Este ticket ha sido resuelto." },
  supportTeamNote:      { fr: "L'équipe support répondra dans 24 à 48 heures ouvrées.", en: "The support team will respond within 24-48 business hours.", ar: "سيرد فريق الدعم خلال 24 إلى 48 ساعة عمل.", es: "El equipo de soporte responderá en 24 a 48 horas hábiles." },
  subjectRequired:      { fr: "Le sujet est obligatoire.", en: "Subject is required.", ar: "الموضوع مطلوب.", es: "El asunto es obligatorio." },
  descRequired:         { fr: "La description est obligatoire.", en: "Description is required.", ar: "الوصف مطلوب.", es: "La descripción es obligatoria." },

  // ─── Alerts (page) ──────────────────────────────────────────────────────────
  filterUnread:         { fr: "Non lus", en: "Unread", ar: "غير مقروء", es: "No leídos" },
  filterUrgentAlerts:   { fr: "Urgents", en: "Urgent", ar: "عاجل", es: "Urgentes" },
  filterWarnings:       { fr: "Avertissements", en: "Warnings", ar: "تحذيرات", es: "Advertencias" },
  filterInfoAlerts:     { fr: "Infos", en: "Info", ar: "معلومات", es: "Info" },
  allReadMsg:           { fr: "Tout est lu !", en: "All caught up!", ar: "كل شيء مقروء!", es: "¡Todo al día!" },
  noAlertsMsg:          { fr: "Aucune alerte pour le moment", en: "No alerts at the moment", ar: "لا توجد تنبيهات في الوقت الحالي", es: "Sin alertas por el momento" },
  messageLabel:         { fr: "Message", en: "Message", ar: "الرسالة", es: "Mensaje" },
  seeAllAlerts:         { fr: "Voir toutes les alertes", en: "See all alerts", ar: "عرض جميع التنبيهات", es: "Ver todas las alertas" },
  destinataireLabel:    { fr: "Destinataires", en: "Recipients", ar: "المستلمون", es: "Destinatarios" },

  // ─── Activity log ───────────────────────────────────────────────────────────
  yesterday:            { fr: "Hier", en: "Yesterday", ar: "أمس", es: "Ayer" },
  monthJan:             { fr: "Jan", en: "Jan", ar: "يناير", es: "Ene" },
  monthFeb:             { fr: "Fév", en: "Feb", ar: "فبراير", es: "Feb" },
  monthMar:             { fr: "Mar", en: "Mar", ar: "مارس", es: "Mar" },
  monthApr:             { fr: "Avr", en: "Apr", ar: "أبريل", es: "Abr" },
  monthMay:             { fr: "Mai", en: "May", ar: "مايو", es: "May" },
  monthJun:             { fr: "Juin", en: "Jun", ar: "يونيو", es: "Jun" },
  monthJul:             { fr: "Juil", en: "Jul", ar: "يوليو", es: "Jul" },
  monthAug:             { fr: "Aoû", en: "Aug", ar: "أغسطس", es: "Ago" },
  monthSep:             { fr: "Sep", en: "Sep", ar: "سبتمبر", es: "Sep" },
  monthOct:             { fr: "Oct", en: "Oct", ar: "أكتوبر", es: "Oct" },
  monthNov:             { fr: "Nov", en: "Nov", ar: "نوفمبر", es: "Nov" },
  monthDec:             { fr: "Déc", en: "Dec", ar: "ديسمبر", es: "Dic" },
  suspiciousLogin:      { fr: "tentative(s) de connexion suspecte(s) détectée(s)", en: "suspicious login attempt(s) detected", ar: "محاولة(محاولات) تسجيل دخول مشبوهة مكتشفة", es: "intento(s) de inicio de sesión sospechoso(s) detectado(s)" },
  auditTrailSub:        { fr: "Audit trail & traçabilité complète", en: "Audit trail & full traceability", ar: "مسار التدقيق والتتبع الكامل", es: "Pista de auditoría y trazabilidad completa" },
  detailUser:           { fr: "Utilisateur", en: "User", ar: "المستخدم", es: "Usuario" },
  detailTimestamp:      { fr: "Horodatage", en: "Timestamp", ar: "الطابع الزمني", es: "Marca de tiempo" },
  detailIP:             { fr: "Adresse IP", en: "IP Address", ar: "عنوان IP", es: "Dirección IP" },
  exportSuccess:        { fr: "Journal exporté avec succès", en: "Log exported successfully", ar: "تم تصدير السجل بنجاح", es: "Registro exportado con éxito" },

  // ─── Journal Audit ──────────────────────────────────────────────────────────
  platformGlobal:       { fr: "Plateforme globale", en: "Global platform", ar: "المنصة العالمية", es: "Plataforma global" },
  yourSyndicate:        { fr: "Votre syndicat", en: "Your syndicate", ar: "نقابتك", es: "Su sindicato" },
  accessRestricted:     { fr: "Accès réservé aux administrateurs", en: "Access restricted to administrators", ar: "الوصول مقتصر على المديرين", es: "Acceso restringido a administradores" },
  auditEntityAll:       { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  auditEntityElection:  { fr: "Élection", en: "Election", ar: "انتخاب", es: "Elección" },
  auditEntityMember:    { fr: "Membre", en: "Member", ar: "عضو", es: "Miembro" },
  auditEntityPayment:   { fr: "Paiement", en: "Payment", ar: "دفع", es: "Pago" },
  auditEntityMeeting:   { fr: "Réunion", en: "Meeting", ar: "اجتماع", es: "Reunión" },
  auditEntityDocument:  { fr: "Document", en: "Document", ar: "وثيقة", es: "Documento" },
  auditEntityWork:      { fr: "Travaux", en: "Works", ar: "أشغال", es: "Obras" },
  noLogsMsg:            { fr: "Le journal d'audit est vide pour ce filtre.", en: "The audit log is empty for this filter.", ar: "سجل التدقيق فارغ لهذا المرشح.", es: "El registro de auditoría está vacío para este filtro." },

  // ─── Transparency ───────────────────────────────────────────────────────────
  statusApproved:       { fr: "Approuvé", en: "Approved", ar: "معتمد", es: "Aprobado" },
  statusContested:      { fr: "Contesté", en: "Contested", ar: "مطعون فيه", es: "Impugnado" },
  statusResolved:       { fr: "Résolu", en: "Resolved", ar: "محلول", es: "Resuelto" },
  contestReason:        { fr: "Motif de contestation *", en: "Contest reason *", ar: "سبب الطعن *", es: "Motivo de impugnación *" },
  confirmContest:       { fr: "Confirmer la contestation", en: "Confirm contest", ar: "تأكيد الطعن", es: "Confirmar impugnación" },
  publishJustif:        { fr: "Publier un justificatif", en: "Publish justification", ar: "نشر مبرر", es: "Publicar justificación" },
  noJustifications:     { fr: "Aucun justificatif", en: "No justifications", ar: "لا توجد مبررات", es: "Sin justificaciones" },
  noJustifDesc:         { fr: "Aucun justificatif de dépense n'a été soumis pour le moment.", en: "No expense justification has been submitted yet.", ar: "لم يتم تقديم أي مبرر للنفقات حتى الآن.", es: "No se ha enviado ninguna justificación de gastos aún." },
  amountRequired:       { fr: "Le montant est obligatoire.", en: "Amount is required.", ar: "المبلغ مطلوب.", es: "El monto es obligatorio." },
  contestRequired:      { fr: "La raison de contestation est obligatoire.", en: "Contest reason is required.", ar: "سبب الطعن مطلوب.", es: "El motivo de impugnación es obligatorio." },
  contestedBy:          { fr: "Contesté par", en: "Contested by", ar: "بواسطة الطاعن", es: "Impugnado por" },
  contestBtn:           { fr: "Contester", en: "Contest", ar: "اعتراض", es: "Impugnar" },
  cannotAdd:            { fr: "Impossible d'ajouter", en: "Unable to add", ar: "تعذر الإضافة", es: "No se puede agregar" },
  cannotContest:        { fr: "Impossible de contester", en: "Unable to contest", ar: "تعذر الاعتراض", es: "No se puede impugnar" },
  cannotVote:           { fr: "Impossible de voter", en: "Unable to vote", ar: "تعذر التصويت", es: "No se puede votar" },

  // ─── Reports ────────────────────────────────────────────────────────────────
  revenueEvolution:     { fr: "Évolution des revenus", en: "Revenue evolution", ar: "تطور الإيرادات", es: "Evolución de ingresos" },
  memberGrowth:         { fr: "Croissance des membres", en: "Member growth", ar: "نمو الأعضاء", es: "Crecimiento de miembros" },
  unitMAD:              { fr: "MAD", en: "MAD", ar: "درهم", es: "MAD" },
  kpiRevenue:           { fr: "Revenus", en: "Revenue", ar: "الإيرادات", es: "Ingresos" },
  kpiExpenses:          { fr: "Dépenses", en: "Expenses", ar: "النفقات", es: "Gastos" },
  kpiGrowth:            { fr: "Croissance", en: "Growth", ar: "النمو", es: "Crecimiento" },
  kpiCollectionRate:    { fr: "Taux cotis.", en: "Coll. rate", ar: "معدل التحصيل", es: "Tasa cuotas" },
  periodMonth:          { fr: "Ce mois", en: "This month", ar: "هذا الشهر", es: "Este mes" },
  periodQuarter:        { fr: "Trimestre", en: "Quarter", ar: "ربع السنة", es: "Trimestre" },
  periodYear:           { fr: "Année", en: "Year", ar: "السنة", es: "Año" },
  goodLabel:            { fr: "Bon", en: "Good", ar: "جيد", es: "Bueno" },
  lowLabel:             { fr: "Faible", en: "Low", ar: "منخفض", es: "Bajo" },
  exportReports:        { fr: "Exporter des rapports", en: "Export reports", ar: "تصدير التقارير", es: "Exportar informes" },
  collectionRateTitle:  { fr: "Recouvrement des cotisations", en: "Contribution collection", ar: "تحصيل الاشتراكات", es: "Recaudación de cuotas" },
  surplusLabel:         { fr: "Excédent", en: "Surplus", ar: "الفائض", es: "Excedente" },
  downloadReceipt:      { fr: "Télécharger le reçu", en: "Download receipt", ar: "تنزيل الإيصال", es: "Descargar recibo" },
  reportExported:       { fr: "Rapport exporté avec succès", en: "Report exported successfully", ar: "تم تصدير التقرير بنجاح", es: "Informe exportado con éxito" },

  // ─── Tableau National ────────────────────────────────────────────────────────
  tabRanking:           { fr: "Classement", en: "Ranking", ar: "الترتيب", es: "Clasificación" },
  totalPlatformBalance: { fr: "Solde Total de la Plateforme", en: "Platform Total Balance", ar: "رصيد المنصة الإجمالي", es: "Saldo Total de la Plataforma" },
  syndicateDistrib:     { fr: "Répartition par syndicat", en: "Distribution by syndicate", ar: "التوزيع حسب النقابة", es: "Distribución por sindicato" },
  recoveryRateLabel:    { fr: "Taux de recouvrement", en: "Recovery rate", ar: "معدل الاسترداد", es: "Tasa de recuperación" },
  criticalAlertsMsg:    { fr: "alerte(s) critique(s) nécessitent une action immédiate", en: "critical alert(s) require immediate action", ar: "تنبيه(تنبيهات) حرجة تتطلب إجراءً فورياً", es: "alerta(s) crítica(s) requieren acción inmediata" },
  takeOver:             { fr: "Prendre en charge", en: "Take over", ar: "تولي المسؤولية", es: "Tomar control" },
  rankingCalc:          { fr: "Calcul du classement...", en: "Calculating ranking...", ar: "جارٍ حساب الترتيب...", es: "Calculando clasificación..." },
  noRanking:            { fr: "Aucun classement disponible", en: "No ranking available", ar: "لا يوجد ترتيب متاح", es: "Sin clasificación disponible" },
  noSyndicates:         { fr: "Aucun syndicat", en: "No syndicates", ar: "لا توجد نقابات", es: "Sin sindicatos" },
  noSyndicatesDesc:     { fr: "Aucun syndicat enregistré pour le moment.", en: "No syndicates registered yet.", ar: "لا توجد نقابات مسجلة حتى الآن.", es: "No hay sindicatos registrados aún." },
  actionNextUpdate:     { fr: "Action enregistrée. Impact visible à la prochaine mise à jour.", en: "Action recorded. Impact visible at next update.", ar: "تم تسجيل الإجراء. سيظهر التأثير عند التحديث القادم.", es: "Acción registrada. El impacto será visible en la próxima actualización." },

  // ─── Elections ──────────────────────────────────────────────────────────────
  openElections:        { fr: "Scrutins ouverts", en: "Open elections", ar: "الاقتراعات المفتوحة", es: "Escrutinios abiertos" },
  voteNow:              { fr: "Voter", en: "Vote", ar: "صوّت", es: "Votar" },
  electionResults:      { fr: "Résultats", en: "Results", ar: "النتائج", es: "Resultados" },
  alreadyVoted:         { fr: "Déjà voté", en: "Already voted", ar: "تم التصويت", es: "Ya votó" },
  candidateList:        { fr: "Liste des candidats", en: "Candidate list", ar: "قائمة المرشحين", es: "Lista de candidatos" },
  yourVote:             { fr: "Votre vote", en: "Your vote", ar: "صوتك", es: "Su voto" },
  castVote:             { fr: "Enregistrer mon vote", en: "Cast my vote", ar: "تسجيل صوتي", es: "Emitir mi voto" },
  electionClosed:       { fr: "Élection clôturée", en: "Election closed", ar: "الانتخاب مغلق", es: "Elección cerrada" },
  votesCount:           { fr: "votes", en: "votes", ar: "أصوات", es: "votos" },
  winner:               { fr: "Élu", en: "Elected", ar: "منتخب", es: "Elegido" },

  // ─── Meetings ───────────────────────────────────────────────────────────────
  confirmAttendance:    { fr: "Confirmer présence", en: "Confirm attendance", ar: "تأكيد الحضور", es: "Confirmar asistencia" },
  meetingLocation:      { fr: "Lieu de la réunion", en: "Meeting location", ar: "مكان الاجتماع", es: "Lugar de la reunión" },
  attendees:            { fr: "Participants", en: "Attendees", ar: "المشاركون", es: "Asistentes" },
  newMeeting:           { fr: "Nouvelle réunion", en: "New meeting", ar: "اجتماع جديد", es: "Nueva reunión" },
  meetingType:          { fr: "Type de réunion", en: "Meeting type", ar: "نوع الاجتماع", es: "Tipo de reunión" },
  ordinary:             { fr: "Ordinaire", en: "Ordinary", ar: "عادي", es: "Ordinaria" },
  extraordinary:        { fr: "Extraordinaire", en: "Extraordinary", ar: "استثنائي", es: "Extraordinaria" },
  quorum:               { fr: "Quorum", en: "Quorum", ar: "النصاب", es: "Quórum" },
  present:              { fr: "Présent", en: "Present", ar: "حاضر", es: "Presente" },
  absent:               { fr: "Absent", en: "Absent", ar: "غائب", es: "Ausente" },

  // ─── Governance ─────────────────────────────────────────────────────────────
  syndicCouncil:        { fr: "Conseil Syndical", en: "Syndicate Council", ar: "المجلس النقابي", es: "Consejo Sindical" },
  boardMembers:         { fr: "Membres du conseil", en: "Board members", ar: "أعضاء المجلس", es: "Miembros del consejo" },
  governanceDoc:        { fr: "Documents de gouvernance", en: "Governance documents", ar: "وثائق الحوكمة", es: "Documentos de gobernanza" },
  noGovernance:         { fr: "Aucune donnée de gouvernance", en: "No governance data", ar: "لا توجد بيانات حوكمة", es: "Sin datos de gobernanza" },

  // ─── Parking ────────────────────────────────────────────────────────────────
  violationReport:      { fr: "Signaler une infraction", en: "Report violation", ar: "الإبلاغ عن مخالفة", es: "Reportar infracción" },
  spotReserved:         { fr: "Réservé", en: "Reserved", ar: "محجوز", es: "Reservado" },
  plateNumber:          { fr: "Plaque d'immatriculation", en: "License plate", ar: "لوحة الترخيص", es: "Matrícula" },
  parkingViolation:     { fr: "Infraction parking", en: "Parking violation", ar: "مخالفة الانتظار", es: "Infracción de aparcamiento" },
  reservationDate:      { fr: "Date de réservation", en: "Reservation date", ar: "تاريخ الحجز", es: "Fecha de reserva" },

  // ─── Service provider types ──────────────────────────────────────────────────
  catMaintenance:       { fr: "Maintenance", en: "Maintenance", ar: "صيانة", es: "Mantenimiento" },
  catCleaning:          { fr: "Nettoyage", en: "Cleaning", ar: "تنظيف", es: "Limpieza" },
  catSecurity:          { fr: "Sécurité", en: "Security", ar: "أمن", es: "Seguridad" },
  catPlumbing:          { fr: "Plomberie", en: "Plumbing", ar: "سباكة", es: "Fontanería" },
  catElectrical:        { fr: "Électricité", en: "Electrical", ar: "كهرباء", es: "Electricidad" },
  catOther:             { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
  allProviders:         { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  evaluateProvider:     { fr: "Évaluer", en: "Evaluate", ar: "تقييم", es: "Evaluar" },
  noEvaluations:        { fr: "Aucune évaluation", en: "No evaluations", ar: "لا توجد تقييمات", es: "Sin evaluaciones" },
  contracts:            { fr: "Contrats", en: "Contracts", ar: "العقود", es: "Contratos" },
  noContracts:          { fr: "Aucun contrat", en: "No contracts", ar: "لا توجد عقود", es: "Sin contratos" },

  // ─── Simulateur ─────────────────────────────────────────────────────────────
  monthlyFee:           { fr: "Charges mensuelles", en: "Monthly charges", ar: "الرسوم الشهرية", es: "Cargos mensuales" },
  chargeType:           { fr: "Type de charge", en: "Charge type", ar: "نوع الرسوم", es: "Tipo de cargo" },
  simulationUnits:      { fr: "Nombre de lots", en: "Number of units", ar: "عدد الوحدات", es: "Número de unidades" },

  // ─── Syndicate Setup ────────────────────────────────────────────────────────
  syndicSetupTitle:     { fr: "Créer un syndicat", en: "Create a syndicate", ar: "إنشاء نقابة", es: "Crear un sindicato" },
  syndicateReg:         { fr: "Numéro d'enregistrement", en: "Registration number", ar: "رقم التسجيل", es: "Número de registro" },
  syndicateAddress:     { fr: "Adresse *", en: "Address *", ar: "العنوان *", es: "Dirección *" },
  syndicateCountry:     { fr: "Pays", en: "Country", ar: "البلد", es: "País" },
  finishSetup:          { fr: "Terminer la configuration", en: "Finish setup", ar: "إنهاء الإعداد", es: "Finalizar configuración" },

  // ─── Onboarding ─────────────────────────────────────────────────────────────
  welcomeTitle:         { fr: "Bienvenue sur SYNDYCAT", en: "Welcome to SYNDYCAT", ar: "مرحباً بك في سنديكات", es: "Bienvenido a SYNDYCAT" },
  getStarted:           { fr: "Commencer", en: "Get started", ar: "ابدأ", es: "Comenzar" },
  skipBtn:              { fr: "Ignorer", en: "Skip", ar: "تخطي", es: "Omitir" },

  // ─── General Assembly ────────────────────────────────────────────────────────
  convocation:          { fr: "Convocation", en: "Convocation", ar: "استدعاء", es: "Convocatoria" },
  noAssemblies:         { fr: "Aucune assemblée", en: "No assemblies", ar: "لا توجد جمعيات", es: "Sin asambleas" },
  newAssembly:          { fr: "Nouvelle assemblée", en: "New assembly", ar: "جمعية جديدة", es: "Nueva asamblea" },

  // ─── PV (Minutes) ────────────────────────────────────────────────────────────
  noPv:                 { fr: "Aucun procès-verbal", en: "No meeting minutes", ar: "لا توجد محاضر", es: "Sin actas" },

  // ─── Tenants ─────────────────────────────────────────────────────────────────
  depositAmount:        { fr: "Caution", en: "Deposit", ar: "التأمين", es: "Depósito" },

  // ─── Lot (Unit) ──────────────────────────────────────────────────────────────
  tantièmes:            { fr: "Tantièmes", en: "Shares", ar: "الحصص", es: "Cuotas" },
  apartment:            { fr: "Appartement", en: "Apartment", ar: "شقة", es: "Apartamento" },
  garage:               { fr: "Garage", en: "Garage", ar: "مرآب", es: "Garaje" },
  store:                { fr: "Local commercial", en: "Commercial unit", ar: "محل تجاري", es: "Local comercial" },

  // ─── Users management ────────────────────────────────────────────────────────
  usersTitle:           { fr: "Utilisateurs", en: "Users", ar: "المستخدمون", es: "Usuarios" },
  banConfirm:           { fr: "Êtes-vous sûr de vouloir bannir cet utilisateur ?", en: "Are you sure you want to ban this user?", ar: "هل أنت متأكد من رغبتك في حظر هذا المستخدم؟", es: "¿Está seguro de que desea prohibir este usuario?" },
  unbanUser:            { fr: "Débannir l'utilisateur", en: "Unban user", ar: "رفع حظر المستخدم", es: "Desbloquear usuario" },
  lastLogin:            { fr: "Dernière connexion", en: "Last login", ar: "آخر دخول", es: "Último acceso" },

  // ─── Buildings ───────────────────────────────────────────────────────────────
  units:                { fr: "Unités", en: "Units", ar: "الوحدات", es: "Unidades" },
  floors:               { fr: "Étages", en: "Floors", ar: "الطوابق", es: "Pisos" },
  constructionYear:     { fr: "Année de construction", en: "Construction year", ar: "سنة البناء", es: "Año de construcción" },
  buildingType:         { fr: "Type d'immeuble", en: "Building type", ar: "نوع المبنى", es: "Tipo de edificio" },

  // ─── Finance tab ──────────────────────────────────────────────────────────────
  currentBalance:       { fr: "Solde actuel", en: "Current balance", ar: "الرصيد الحالي", es: "Saldo actual" },
  transactionsLabel:    { fr: "Transactions", en: "Transactions", ar: "المعاملات", es: "Transacciones" },
  pendingPaymentLabel:  { fr: "Paiement en attente", en: "Pending payment", ar: "دفعة معلقة", es: "Pago pendiente" },
  financialManagement:  { fr: "Gestion financière", en: "Financial management", ar: "الإدارة المالية", es: "Gestión financiera" },

  // ─── Legal ───────────────────────────────────────────────────────────────────
  legalAlerts:          { fr: "Alertes juridiques", en: "Legal alerts", ar: "التنبيهات القانونية", es: "Alertas legales" },
  acteAdm:              { fr: "Actes administratifs", en: "Administrative acts", ar: "الأعمال الإدارية", es: "Actos administrativos" },
  articleLabel:         { fr: "Article", en: "Article", ar: "مادة", es: "Artículo" },
  lawLabel:             { fr: "Loi", en: "Law", ar: "قانون", es: "Ley" },

  // ─── Union Actions ───────────────────────────────────────────────────────────
  joinAction:           { fr: "Rejoindre", en: "Join", ar: "انضم", es: "Unirse" },

  // ─── Cotisations ─────────────────────────────────────────────────────────────
  cotisationPeriod:     { fr: "Période", en: "Period", ar: "الفترة", es: "Período" },
  paymentProof:         { fr: "Justificatif de paiement", en: "Payment proof", ar: "إثبات الدفع", es: "Comprobante de pago" },
  uploadProof:          { fr: "Téléverser le justificatif", en: "Upload proof", ar: "رفع الإثبات", es: "Subir comprobante" },
  proofUploaded:        { fr: "Justificatif soumis avec succès", en: "Proof submitted successfully", ar: "تم إرسال الإثبات بنجاح", es: "Comprobante enviado con éxito" },

  // ─── Reglements ──────────────────────────────────────────────────────────────

  // ─── Bon Livraison ────────────────────────────────────────────────────────────
  supplierLabel:        { fr: "Fournisseur", en: "Supplier", ar: "المورد", es: "Proveedor" },
  itemsLabel:           { fr: "Articles", en: "Items", ar: "العناصر", es: "Artículos" },
  unitPrice:            { fr: "Prix unitaire", en: "Unit price", ar: "السعر الوحدوي", es: "Precio unitario" },
  noBL:                 { fr: "Aucun bon de livraison", en: "No delivery notes", ar: "لا توجد وصولات تسليم", es: "Sin albaranes" },
  newBL:                { fr: "Nouveau bon", en: "New delivery note", ar: "وصل تسليم جديد", es: "Nuevo albarán" },

  // ─── My Shop ─────────────────────────────────────────────────────────────────
  myShopTitle:          { fr: "Ma Boutique", en: "My Shop", ar: "متجري", es: "Mi Tienda" },
  addProduct:           { fr: "Ajouter un produit", en: "Add product", ar: "إضافة منتج", es: "Agregar producto" },
  productTitle2:        { fr: "Nom du produit *", en: "Product name *", ar: "اسم المنتج *", es: "Nombre del producto *" },
  editProduct:          { fr: "Modifier le produit", en: "Edit product", ar: "تعديل المنتج", es: "Editar producto" },
  deleteProduct:        { fr: "Supprimer le produit", en: "Delete product", ar: "حذف المنتج", es: "Eliminar producto" },
  myProducts:           { fr: "Mes produits", en: "My products", ar: "منتجاتي", es: "Mis productos" },
  noMyProducts:         { fr: "Vous n'avez pas encore de produits", en: "You have no products yet", ar: "ليس لديك منتجات بعد", es: "Aún no tiene productos" },

  // ─── Partners ────────────────────────────────────────────────────────────────
  partnerCategory:      { fr: "Catégorie du partenaire", en: "Partner category", ar: "فئة الشريك", es: "Categoría del socio" },
  partnerDiscount:      { fr: "Réduction", en: "Discount", ar: "خصم", es: "Descuento" },
  visitWebsite:         { fr: "Visiter le site", en: "Visit website", ar: "زيارة الموقع", es: "Visitar sitio" },

  // ─── Travaux Privatifs ───────────────────────────────────────────────────────
  noPrivateWorks:       { fr: "Aucun travaux privatif", en: "No private works", ar: "لا توجد أشغال خاصة", es: "Sin obras privadas" },
  requestedBy:          { fr: "Demandé par", en: "Requested by", ar: "طلب من", es: "Solicitado por" },
  approvalRequired:     { fr: "Approbation requise", en: "Approval required", ar: "الموافقة مطلوبة", es: "Aprobación requerida" },

  // ─── Escalation ──────────────────────────────────────────────────────────────
  escalationLevel:      { fr: "Niveau d'escalade", en: "Escalation level", ar: "مستوى التصعيد", es: "Nivel de escalada" },
  escalationDate:       { fr: "Date d'escalade", en: "Escalation date", ar: "تاريخ التصعيد", es: "Fecha de escalada" },
  sendFormalNotice:     { fr: "Envoyer une mise en demeure", en: "Send formal notice", ar: "إرسال إشعار رسمي", es: "Enviar notificación formal" },

  // ─── My Lease ────────────────────────────────────────────────────────────────
  leaseDetails:         { fr: "Détails du bail", en: "Lease details", ar: "تفاصيل العقد", es: "Detalles del contrato" },
  landlord:             { fr: "Propriétaire", en: "Landlord", ar: "المالك", es: "Arrendador" },
  noLeaseData:          { fr: "Aucun bail trouvé", en: "No lease found", ar: "لم يتم العثور على عقد", es: "Sin contrato encontrado" },

  // ─── My Unit ─────────────────────────────────────────────────────────────────
  noUnitData:           { fr: "Aucun lot associé", en: "No unit associated", ar: "لا توجد وحدة مرتبطة", es: "Sin unidad asociada" },

  // ─── Etat des Lieux ──────────────────────────────────────────────────────────
  noInspections:        { fr: "Aucun état des lieux", en: "No inspections", ar: "لا توجد جرودات حالة", es: "Sin inventarios" },
  inspectionType:       { fr: "Type d'état des lieux", en: "Inspection type", ar: "نوع جرد الحالة", es: "Tipo de inventario" },
  entryInspection:      { fr: "Entrée", en: "Entry", ar: "دخول", es: "Entrada" },
  exitInspection:       { fr: "Sortie", en: "Exit", ar: "خروج", es: "Salida" },

  // ─── CGU ────────────────────────────────────────────────────────────────────
  privacyPolicy:        { fr: "Politique de confidentialité", en: "Privacy policy", ar: "سياسة الخصوصية", es: "Política de privacidad" },
  lastUpdated:          { fr: "Dernière mise à jour", en: "Last updated", ar: "آخر تحديث", es: "Última actualización" },

  // ─── Reclamations ────────────────────────────────────────────────────────────
  reclamationSubject:   { fr: "Objet de la réclamation *", en: "Complaint subject *", ar: "موضوع الشكوى *", es: "Asunto de la reclamación *" },
  reclamationDesc:      { fr: "Description de la réclamation *", en: "Complaint description *", ar: "وصف الشكوى *", es: "Descripción de la reclamación *" },
  noReclamationsYet:    { fr: "Aucune réclamation pour le moment", en: "No complaints yet", ar: "لا توجد شكاوى في الوقت الحالي", es: "Sin reclamaciones por el momento" },

  // ─── Admin Acts ──────────────────────────────────────────────────────────────

  // ─── Legal Directory ─────────────────────────────────────────────────────────
  noRepertoire:         { fr: "Aucun texte juridique", en: "No legal texts", ar: "لا توجد نصوص قانونية", es: "Sin textos legales" },

  // ─── Agenda / Calendar ────────────────────────────────────────────────────────
  eventType:            { fr: "Type d'événement", en: "Event type", ar: "نوع الحدث", es: "Tipo de evento" },
  eventDate:            { fr: "Date de l'événement", en: "Event date", ar: "تاريخ الحدث", es: "Fecha del evento" },
  noAgenda:             { fr: "Aucun événement à l'agenda", en: "No agenda events", ar: "لا توجد أحداث في جدول الأعمال", es: "Sin eventos en la agenda" },

  // ─── Internal Messaging ──────────────────────────────────────────────────────
  groupConversation:    { fr: "Conversation de groupe", en: "Group conversation", ar: "محادثة جماعية", es: "Conversación grupal" },
  directMessage:        { fr: "Message direct", en: "Direct message", ar: "رسالة مباشرة", es: "Mensaje directo" },
  noMessages:           { fr: "Aucun message", en: "No messages", ar: "لا توجد رسائل", es: "Sin mensajes" },

  // ─── Profile ─────────────────────────────────────────────────────────────────
  myProperties:         { fr: "Mes biens", en: "My properties", ar: "عقاراتي", es: "Mis propiedades" },
  accountInfo:          { fr: "Informations du compte", en: "Account information", ar: "معلومات الحساب", es: "Información de la cuenta" },
  editProfileTitle:     { fr: "Modifier le profil", en: "Edit profile", ar: "تعديل الملف الشخصي", es: "Editar perfil" },
  firstNameLabel:       { fr: "Prénom", en: "First name", ar: "الاسم الأول", es: "Nombre" },
  lastNameLabel:        { fr: "Nom de famille", en: "Last name", ar: "اللقب", es: "Apellido" },

  // ─── Workflow ────────────────────────────────────────────────────────────────
  workflowPending:      { fr: "En attente", en: "Pending", ar: "بانتظار", es: "Pendiente" },
  workflowApproved:     { fr: "Approuvé", en: "Approved", ar: "معتمد", es: "Aprobado" },
  workflowRejected:     { fr: "Rejeté", en: "Rejected", ar: "مرفوض", es: "Rechazado" },
  stepLabel:            { fr: "Étape", en: "Step", ar: "خطوة", es: "Paso" },
  rejectReason:         { fr: "Motif de rejet", en: "Rejection reason", ar: "سبب الرفض", es: "Motivo de rechazo" },

  // ─── Notifications (page) ────────────────────────────────────────────────────
  notifSettings:        { fr: "Paramètres de notification", en: "Notification settings", ar: "إعدادات الإشعارات", es: "Configuración de notificaciones" },
  clearAll:             { fr: "Tout effacer", en: "Clear all", ar: "مسح الكل", es: "Borrar todo" },

  // ─── Documents ───────────────────────────────────────────────────────────────
  docPV:                { fr: "PV d'assemblée", en: "Meeting minutes", ar: "محاضر الاجتماعات", es: "Actas de asamblea" },
  docReglement:         { fr: "Règlement de copropriété", en: "Co-ownership rules", ar: "نظام الملكية المشتركة", es: "Reglamento de copropiedad" },
  docContracts:         { fr: "Contrats", en: "Contracts", ar: "العقود", es: "Contratos" },
  docOther:             { fr: "Autres", en: "Other", ar: "أخرى", es: "Otros" },
  addDocument:          { fr: "Ajouter un document", en: "Add document", ar: "إضافة وثيقة", es: "Agregar documento" },
  documentAdded:        { fr: "Document ajouté avec succès", en: "Document added successfully", ar: "تمت إضافة الوثيقة بنجاح", es: "Documento agregado con éxito" },

  // ─── More tab extras ──────────────────────────────────────────────────────────
  paySlips:             { fr: "Fiches de paie", en: "Pay slips", ar: "قسائم الرواتب", es: "Nóminas" },
  deliveryNotes:        { fr: "Bons de livraison", en: "Delivery notes", ar: "وصولات التسليم", es: "Albaranes" },
  debtEscalation:       { fr: "Escalade de dettes", en: "Debt escalation", ar: "تصعيد الديون", es: "Escalada de deudas" },
  partnersLabel:        { fr: "Partenaires", en: "Partners", ar: "الشركاء", es: "Socios" },
  subscriptionLabel:    { fr: "Abonnement", en: "Subscription", ar: "الاشتراك", es: "Suscripción" },
  workflowLabel:        { fr: "Workflow", en: "Workflow", ar: "سير العمل", es: "Flujo de trabajo" },
  simulatorLabel:       { fr: "Simulateur", en: "Simulator", ar: "المحاكي", es: "Simulador" },
  privateWorksLabel:    { fr: "Travaux privatifs", en: "Private works", ar: "أشغال خاصة", es: "Obras privadas" },
  myBailLabel:          { fr: "Mon Bail", en: "My Lease", ar: "عقدي", es: "Mi Contrato" },
  inspectionLabel:      { fr: "État des lieux", en: "Property inspection", ar: "جرد الحالة", es: "Inventario" },
  statisticsLabel:      { fr: "Statistiques", en: "Statistics", ar: "الإحصائيات", es: "Estadísticas" },

  // ─── PV screen ────────────────────────────────────────────────────────────
  pvTypeBureau:         { fr: "Bureau", en: "Board", ar: "المكتب", es: "Oficina" },
  pvTypeAG:             { fr: "Assemblée Générale", en: "General Assembly", ar: "الجمعية العامة", es: "Asamblea General" },
  pvTypeCommission:     { fr: "Commission", en: "Committee", ar: "اللجنة", es: "Comisión" },
  pvTypeElection:       { fr: "Élection", en: "Election", ar: "الانتخاب", es: "Elección" },
  pvTypeUrgence:        { fr: "Urgence", en: "Emergency", ar: "طارئ", es: "Urgencia" },
  pvStatusDraft:        { fr: "Brouillon", en: "Draft", ar: "مسودة", es: "Borrador" },
  pvStatusPending:      { fr: "En attente", en: "Pending", ar: "قيد الانتظار", es: "Pendiente" },
  pvStatusPublished:    { fr: "Publié", en: "Published", ar: "منشور", es: "Publicado" },
  pvFilterAll:          { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  pvFilterAllStatus:    { fr: "Tous statuts", en: "All statuses", ar: "جميع الحالات", es: "Todos los estados" },
  pvFilterPublished:    { fr: "Publiés", en: "Published", ar: "منشورة", es: "Publicados" },
  pvFilterDraft:        { fr: "Brouillons", en: "Drafts", ar: "مسودات", es: "Borradores" },
  pvPublishedCount:     { fr: "publié", en: "published", ar: "منشور", es: "publicado" },
  pvPublishedCountPl:   { fr: "publiés", en: "published", ar: "منشورة", es: "publicados" },
  pvInProgressCount:    { fr: "en cours", en: "in progress", ar: "قيد الإنجاز", es: "en curso" },
  pvNoneMatching:       { fr: "Aucun PV correspondant", en: "No matching minutes", ar: "لا توجد محاضر مطابقة", es: "Sin actas coincidentes" },
  pvPresences:          { fr: "présences", en: "attendees", ar: "الحضور", es: "asistentes" },
  pvRedacteur:          { fr: "Rédacteur", en: "Author", ar: "المحرر", es: "Redactor" },
  pvSummaryLabel:       { fr: "RÉSUMÉ", en: "SUMMARY", ar: "ملخص", es: "RESUMEN" },
  pvResolutionsLabel:   { fr: "RÉSOLUTIONS ADOPTÉES", en: "ADOPTED RESOLUTIONS", ar: "القرارات المعتمدة", es: "RESOLUCIONES ADOPTADAS" },
  pvSignatairesLabel:   { fr: "SIGNATAIRES", en: "SIGNATORIES", ar: "الموقعون", es: "FIRMANTES" },
  pvDownloadPDF:        { fr: "Télécharger PDF", en: "Download PDF", ar: "تنزيل PDF", es: "Descargar PDF" },
  pvPublishBtn:         { fr: "Publier", en: "Publish", ar: "نشر", es: "Publicar" },
  pvPublishTitle:       { fr: "Publier le PV", en: "Publish minutes", ar: "نشر المحضر", es: "Publicar acta" },
  pvPublishConfirm:     { fr: "Ce PV sera visible par tous les membres. Confirmer?", en: "These minutes will be visible to all members. Confirm?", ar: "سيكون هذا المحضر مرئياً لجميع الأعضاء. تأكيد؟", es: "Estas actas serán visibles para todos los miembros. ¿Confirmar?" },
  pvDownloadTitle:      { fr: "Téléchargement", en: "Download", ar: "تنزيل", es: "Descarga" },
  pvDownloadedSuffix:   { fr: "a été téléchargé (PDF).", en: "has been downloaded (PDF).", ar: "تم تنزيله (PDF).", es: "ha sido descargado (PDF)." },
  pvNewTitle:           { fr: "Nouveau Procès-Verbal", en: "New Minutes", ar: "محضر جديد", es: "Nueva Acta" },
  pvTitleFieldLabel:    { fr: "Titre du PV *", en: "Minutes title *", ar: "عنوان المحضر *", es: "Título del acta *" },
  pvTitlePlaceholder:   { fr: "Ex: PV Réunion Bureau — Juin 2026", en: "e.g.: Board meeting minutes — June 2026", ar: "مثال: محضر اجتماع المكتب — يونيو 2026", es: "Ej.: Acta reunión de oficina — Junio 2026" },
  pvMeetingTypeLabel:   { fr: "Type de réunion *", en: "Meeting type *", ar: "نوع الاجتماع *", es: "Tipo de reunión *" },
  pvSummaryFieldLabel:  { fr: "Résumé *", en: "Summary *", ar: "الملخص *", es: "Resumen *" },
  pvSummaryPlaceholder: { fr: "Décrivez l'objet et le déroulement de la réunion...", en: "Describe the purpose and course of the meeting...", ar: "صف موضوع ومجريات الاجتماع...", es: "Describa el objeto y desarrollo de la reunión..." },
  pvResolutionsFieldLabel:{ fr: "Résolutions", en: "Resolutions", ar: "القرارات", es: "Resoluciones" },
  pvResolutionPlaceholder:{ fr: "Ajouter une résolution...", en: "Add a resolution...", ar: "إضافة قرار...", es: "Agregar una resolución..." },
  pvCreateBtn:          { fr: "Créer le PV (brouillon)", en: "Create minutes (draft)", ar: "إنشاء المحضر (مسودة)", es: "Crear acta (borrador)" },
  pvCreateError:        { fr: "Impossible de créer le PV", en: "Unable to create the minutes", ar: "تعذر إنشاء المحضر", es: "No se pudo crear el acta" },

  // ─── Escalation screen ────────────────────────────────────────────────────
  escLevelReminder:     { fr: "Rappel", en: "Reminder", ar: "تذكير", es: "Recordatorio" },
  escLevelWarning:      { fr: "Mise en demeure", en: "Formal notice", ar: "إنذار رسمي", es: "Notificación formal" },
  escLevelFinalWarning: { fr: "Dernière mise en demeure", en: "Final formal notice", ar: "الإنذار الرسمي الأخير", es: "Última notificación formal" },
  escLevelAgmProposal:  { fr: "AG Extraordinaire", en: "Extraordinary AGM", ar: "جمعية عامة استثنائية", es: "AG Extraordinaria" },
  escLevelLegalAction:  { fr: "Action juridique", en: "Legal action", ar: "إجراء قانوني", es: "Acción legal" },
  escLoadError:         { fr: "Chargement impossible", en: "Unable to load", ar: "تعذر التحميل", es: "No se pudo cargar" },
  escScanTitle:         { fr: "Scan terminé", en: "Scan complete", ar: "اكتمل الفحص", es: "Escaneo completo" },
  escScanCreated:       { fr: "nouvelle(s) escalade(s) créée(s)", en: "new escalation(s) created", ar: "تصعيد(ات) جديدة تم إنشاؤها", es: "nueva(s) escalada(s) creada(s)" },
  escScanSkipped:       { fr: "ignorée(s)", en: "skipped", ar: "تم تجاهلها", es: "omitida(s)" },
  escScanErrors:        { fr: "erreur(s)", en: "error(s)", ar: "خطأ(أخطاء)", es: "error(es)" },
  escScanError:         { fr: "Scan impossible", en: "Unable to scan", ar: "تعذر الفحص", es: "No se pudo escanear" },
  escJustifRequired:    { fr: "Justification requise", en: "Justification required", ar: "التبرير مطلوب", es: "Justificación requerida" },
  escJustifMinLen:      { fr: "La justification doit comporter au moins 10 caractères.", en: "The justification must be at least 10 characters.", ar: "يجب أن يتكون التبرير من 10 أحرف على الأقل.", es: "La justificación debe tener al menos 10 caracteres." },
  escOverrideError:     { fr: "Opération impossible", en: "Operation not possible", ar: "العملية غير ممكنة", es: "Operación no posible" },
  escResolveTitle:      { fr: "Marquer comme résolu", en: "Mark as resolved", ar: "وضع علامة كمحلول", es: "Marcar como resuelto" },
  escResolveConfirm:    { fr: "Confirmer la résolution de l'escalade pour", en: "Confirm resolution of the escalation for", ar: "تأكيد حل التصعيد لـ", es: "Confirmar la resolución de la escalada para" },
  escResidentFallback:  { fr: "ce résident", en: "this resident", ar: "هذا الساكن", es: "este residente" },
  escConfirmBtn:        { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
  escResolveError:      { fr: "Résolution impossible", en: "Unable to resolve", ar: "تعذر الحل", es: "No se pudo resolver" },
  escOpenDocError:      { fr: "Impossible d'ouvrir le document", en: "Unable to open the document", ar: "تعذر فتح المستند", es: "No se pudo abrir el documento" },
  escStatReminders:     { fr: "Rappels", en: "Reminders", ar: "التذكيرات", es: "Recordatorios" },
  escStatWarning:       { fr: "Mise en demeure", en: "Formal notice", ar: "إنذار رسمي", es: "Notificación formal" },
  escStatFinalWarning:  { fr: "Dernière M.D.", en: "Final notice", ar: "الإنذار الأخير", es: "Última notif." },
  escStatAgm:           { fr: "AG Extraord.", en: "Extraord. AGM", ar: "جمعية استثنائية", es: "AG Extraord." },
  escStatLegal:         { fr: "Contentieux", en: "Litigation", ar: "التقاضي", es: "Litigio" },
  escFilterAll:         { fr: "Toutes", en: "All", ar: "الكل", es: "Todas" },
  escHeaderTitle:       { fr: "Recouvrement", en: "Debt Recovery", ar: "استرداد الديون", es: "Recuperación" },
  escHeaderSubtitle:    { fr: "Suivi des escalades de dette", en: "Debt escalation tracking", ar: "متابعة تصعيد الديون", es: "Seguimiento de escaladas de deuda" },
  escScanning:          { fr: "Scan…", en: "Scanning…", ar: "جارٍ الفحص…", es: "Escaneando…" },
  escLaunchScan:        { fr: "Lancer scan", en: "Run scan", ar: "بدء الفحص", es: "Iniciar escaneo" },
  escEmptyMsg:          { fr: "Aucune escalade active", en: "No active escalation", ar: "لا يوجد تصعيد نشط", es: "Sin escalada activa" },
  escStatusOverridden:  { fr: "Annulé", en: "Cancelled", ar: "ملغى", es: "Cancelado" },
  escStatusMeeting:     { fr: "AG planifiée", en: "AGM scheduled", ar: "الجمعية مجدولة", es: "AG programada" },
  escResidentUnknown:   { fr: "Résident inconnu", en: "Unknown resident", ar: "ساكن غير معروف", es: "Residente desconocido" },
  escLotNumber:         { fr: "Lot N°", en: "Unit No.", ar: "الوحدة رقم", es: "Unidad N°" },
  escAmountDue:         { fr: "Montant impayé", en: "Amount due", ar: "المبلغ المستحق", es: "Monto adeudado" },
  escOverdueSince:      { fr: "Impayé depuis", en: "Overdue since", ar: "متأخر منذ", es: "Vencido desde" },
  escMonths:            { fr: "mois", en: "months", ar: "أشهر", es: "meses" },
  escViewLetter:        { fr: "Voir la lettre", en: "View letter", ar: "عرض الرسالة", es: "Ver la carta" },
  escCancelBtn:         { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  escResolvedBtn:       { fr: "Résolu", en: "Resolved", ar: "محلول", es: "Resuelto" },
  escDownloadLetter:    { fr: "Télécharger la lettre", en: "Download letter", ar: "تنزيل الرسالة", es: "Descargar la carta" },
  escOverrideModalTitle:{ fr: "Annuler l'escalade", en: "Cancel escalation", ar: "إلغاء التصعيد", es: "Cancelar escalada" },
  escJustifLabel:       { fr: "Justification (obligatoire) *", en: "Justification (required) *", ar: "التبرير (إلزامي) *", es: "Justificación (obligatoria) *" },
  escJustifPlaceholder: { fr: "Expliquez la raison de cette annulation…", en: "Explain the reason for this cancellation…", ar: "اشرح سبب هذا الإلغاء…", es: "Explique el motivo de esta cancelación…" },

  // ─── Invoices screen ──────────────────────────────────────────────────────
  invStatusDraft:       { fr: "Brouillon", en: "Draft", ar: "مسودة", es: "Borrador" },
  invStatusSent:        { fr: "Envoyé", en: "Sent", ar: "مرسل", es: "Enviado" },
  invStatusPaid:        { fr: "Payé", en: "Paid", ar: "مدفوع", es: "Pagado" },
  invStatusOverdue:     { fr: "En retard", en: "Overdue", ar: "متأخر", es: "Atrasado" },
  invStatusCancelled:   { fr: "Annulé", en: "Cancelled", ar: "ملغى", es: "Cancelado" },
  invHeaderTitle:       { fr: "Devis & Factures", en: "Quotes & Invoices", ar: "عروض الأسعار والفواتير", es: "Presupuestos y Facturas" },
  invHeaderSub:         { fr: "Gestion financière — justificatifs obligatoires", en: "Financial management — supporting documents required", ar: "الإدارة المالية — المستندات الداعمة إلزامية", es: "Gestión financiera — comprobantes obligatorios" },
  invEncaisse:          { fr: "Encaissé (MAD)", en: "Collected (MAD)", ar: "المحصل (درهم)", es: "Cobrado (MAD)" },
  invEnAttente:         { fr: "En attente", en: "Pending", ar: "قيد الانتظار", es: "Pendiente" },
  invEnRetard:          { fr: "En retard", en: "Overdue", ar: "متأخر", es: "Atrasado" },
  invTabFactures:       { fr: "Factures", en: "Invoices", ar: "الفواتير", es: "Facturas" },
  invTabDevis:          { fr: "Devis", en: "Quotes", ar: "عروض الأسعار", es: "Presupuestos" },
  invAucunFacture:      { fr: "Aucun facture", en: "No invoice", ar: "لا توجد فاتورة", es: "Sin factura" },
  invAucunDevis:        { fr: "Aucun devis", en: "No quote", ar: "لا يوجد عرض سعر", es: "Sin presupuesto" },
  invEmptyPrompt:       { fr: "Appuyez sur + pour créer votre premier", en: "Tap + to create your first", ar: "اضغط على + لإنشاء أول", es: "Toque + para crear su primer" },
  invWithProof:         { fr: "avec justificatif.", en: "with a supporting document.", ar: "مع مستند داعم.", es: "con comprobante." },
  invJustificatif:      { fr: "Justificatif", en: "Supporting doc", ar: "مستند داعم", es: "Comprobante" },
  invEmis:              { fr: "Émis", en: "Issued", ar: "صادر", es: "Emitido" },
  invEcheance:          { fr: "Échéance", en: "Due", ar: "الاستحقاق", es: "Vencimiento" },
  invFacture:           { fr: "Facture", en: "Invoice", ar: "فاتورة", es: "Factura" },
  invDevis:             { fr: "Devis", en: "Quote", ar: "عرض سعر", es: "Presupuesto" },
  invDestinataire:      { fr: "Destinataire", en: "Recipient", ar: "المستلم", es: "Destinatario" },
  invDateEmission:      { fr: "Date d'émission", en: "Issue date", ar: "تاريخ الإصدار", es: "Fecha de emisión" },
  invDateEcheance:      { fr: "Date d'échéance", en: "Due date", ar: "تاريخ الاستحقاق", es: "Fecha de vencimiento" },
  invDetailArticles:    { fr: "Détail des articles", en: "Item details", ar: "تفاصيل البنود", es: "Detalle de artículos" },
  invTotal:             { fr: "Total", en: "Total", ar: "المجموع", es: "Total" },
  invPieceJustif:       { fr: "Pièce justificative", en: "Supporting document", ar: "المستند الداعم", es: "Documento de respaldo" },
  invAppuyerAgrandir:   { fr: "Appuyer pour agrandir", en: "Tap to enlarge", ar: "اضغط للتكبير", es: "Toque para ampliar" },
  invJustifJoint:       { fr: "Justificatif joint", en: "Document attached", ar: "المستند مرفق", es: "Documento adjunto" },
  invAucunJustifJoint:  { fr: "Aucun justificatif joint à ce document.", en: "No supporting document attached.", ar: "لا يوجد مستند داعم مرفق بهذا المستند.", es: "Ningún comprobante adjunto a este documento." },
  invPdfExportedTitle:  { fr: "PDF", en: "PDF", ar: "PDF", es: "PDF" },
  invPdfExportedMsg:    { fr: "Le document a été exporté en PDF.", en: "The document has been exported as PDF.", ar: "تم تصدير المستند بصيغة PDF.", es: "El documento ha sido exportado como PDF." },
  invSentTitle:         { fr: "Envoyé", en: "Sent", ar: "مرسل", es: "Enviado" },
  invSentMsg:           { fr: "Le document a été envoyé par email.", en: "The document has been sent by email.", ar: "تم إرسال المستند عبر البريد الإلكتروني.", es: "El documento ha sido enviado por correo electrónico." },
  invEnvoyerBtn:        { fr: "Envoyer", en: "Send", ar: "إرسال", es: "Enviar" },
  invOriginalCaption:   { fr: "Pièce justificative originale", en: "Original supporting document", ar: "المستند الداعم الأصلي", es: "Documento de respaldo original" },
  invNouveauDoc:        { fr: "Nouveau document", en: "New document", ar: "مستند جديد", es: "Nuevo documento" },
  invJustifObligatoire: { fr: "Le justificatif est obligatoire", en: "The supporting document is required", ar: "المستند الداعم إلزامي", es: "El comprobante es obligatorio" },
  invDestinataireLabel: { fr: "Destinataire (syndicat / fournisseur) *", en: "Recipient (syndicate / supplier) *", ar: "المستلم (النقابة / المورد) *", es: "Destinatario (sindicato / proveedor) *" },
  invDestinatairePh:    { fr: "Ex: Syndicat Résidence Al Andalous...", en: "e.g.: Al Andalous Residence Syndicate...", ar: "مثال: نقابة إقامة الأندلس...", es: "Ej.: Sindicato Residencia Al Andalous..." },
  invLibelleLabel:      { fr: "Libellé de la prestation *", en: "Service description *", ar: "وصف الخدمة *", es: "Descripción del servicio *" },
  invLibellePh:         { fr: "Ex: Maintenance ascenseur, peinture cage...", en: "e.g.: Elevator maintenance, stairwell painting...", ar: "مثال: صيانة المصعد، طلاء الدرج...", es: "Ej.: Mantenimiento de ascensor, pintura de escalera..." },
  invMontantLabel:      { fr: "Montant total (MAD) *", en: "Total amount (MAD) *", ar: "المبلغ الإجمالي (درهم) *", es: "Monto total (MAD) *" },
  invNotesLabel:        { fr: "Notes / Remarques", en: "Notes / Remarks", ar: "ملاحظات", es: "Notas / Observaciones" },
  invNotesPh:           { fr: "Informations complémentaires...", en: "Additional information...", ar: "معلومات إضافية...", es: "Información adicional..." },
  invProofSectionTitle: { fr: "Pièce justificative fournisseur", en: "Supplier supporting document", ar: "المستند الداعم للمورد", es: "Documento de respaldo del proveedor" },
  invObligatoireBadge:  { fr: "OBLIGATOIRE", en: "REQUIRED", ar: "إلزامي", es: "OBLIGATORIO" },
  invProofSectionSub:   { fr: "Photo ou scan de la facture originale du fournisseur — JPEG, PNG", en: "Photo or scan of the original supplier invoice — JPEG, PNG", ar: "صورة أو مسح ضوئي للفاتورة الأصلية للمورد — JPEG، PNG", es: "Foto o escaneo de la factura original del proveedor — JPEG, PNG" },
  invProofErrorBanner:  { fr: "Veuillez joindre une pièce justificative avant de continuer.", en: "Please attach a supporting document before continuing.", ar: "يرجى إرفاق مستند داعم قبل المتابعة.", es: "Por favor adjunte un comprobante antes de continuar." },
  invChanger:           { fr: "Changer", en: "Change", ar: "تغيير", es: "Cambiar" },
  invSupprimer:         { fr: "Supprimer", en: "Delete", ar: "حذف", es: "Eliminar" },
  invTeleverser:        { fr: "Téléverser depuis mon appareil", en: "Upload from my device", ar: "تحميل من جهازي", es: "Subir desde mi dispositivo" },
  invTeleverserSub:     { fr: "Photo de galerie · Appareil photo · Fichier image", en: "Gallery photo · Camera · Image file", ar: "صورة من المعرض · الكاميرا · ملف صورة", es: "Foto de galería · Cámara · Archivo de imagen" },
  invMaxSize:           { fr: "max 10 Mo", en: "max 10 MB", ar: "بحد أقصى 10 ميغابايت", es: "máx. 10 MB" },
  invCreerFacture:      { fr: "Créer la facture", en: "Create the invoice", ar: "إنشاء الفاتورة", es: "Crear la factura" },
  invCreerDevis:        { fr: "Créer le devis", en: "Create the quote", ar: "إنشاء عرض السعر", es: "Crear el presupuesto" },
  invHintMissingProof:  { fr: "⚠ Justificatif manquant — requis pour valider", en: "⚠ Missing supporting document — required to validate", ar: "⚠ المستند الداعم مفقود — مطلوب للتحقق", es: "⚠ Comprobante faltante — requerido para validar" },
  invHintFillFields:    { fr: "Remplissez tous les champs obligatoires pour continuer", en: "Fill in all required fields to continue", ar: "املأ جميع الحقول المطلوبة للمتابعة", es: "Complete todos los campos obligatorios para continuar" },
  invPermissionRequired:{ fr: "Permission requise", en: "Permission required", ar: "الإذن مطلوب", es: "Permiso requerido" },
  invPermGallery:       { fr: "Veuillez autoriser l'accès à la galerie pour joindre un justificatif.", en: "Please allow access to the gallery to attach a supporting document.", ar: "يرجى السماح بالوصول إلى المعرض لإرفاق مستند داعم.", es: "Permita el acceso a la galería para adjuntar un comprobante." },
  invPermCamera:        { fr: "Veuillez autoriser l'accès à la caméra.", en: "Please allow access to the camera.", ar: "يرجى السماح بالوصول إلى الكاميرا.", es: "Permita el acceso a la cámara." },
  invJoindreJustif:     { fr: "Joindre un justificatif", en: "Attach a supporting document", ar: "إرفاق مستند داعم", es: "Adjuntar un comprobante" },
  invChoisirSource:     { fr: "Choisissez la source de votre fichier", en: "Choose the source of your file", ar: "اختر مصدر ملفك", es: "Elija la fuente de su archivo" },
  invGaleriePhoto:      { fr: "Galerie photo", en: "Photo gallery", ar: "معرض الصور", es: "Galería de fotos" },
  invAppareilPhoto:     { fr: "Appareil photo", en: "Camera", ar: "الكاميرا", es: "Cámara" },
};

interface LanguageContextValue {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: (key: string) => string;
  isRTL: boolean;
  currentOption: LangOption;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "fr",
  setLang: () => {},
  t: (k) => k,
  isRTL: false,
  currentOption: LANG_OPTIONS[0],
});

const STORAGE_KEY = "@syndycat_language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("fr");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && ["fr", "en", "ar", "es"].includes(saved)) {
        setLangState(saved as LangCode);
      }
    }).catch(() => {});
  }, []);

  const setLang = useCallback((code: LangCode) => {
    const option = LANG_OPTIONS.find((o) => o.code === code);
    const newIsRTL = option?.rtl ?? false;
    const currentIsRTL = I18nManager.isRTL;
    setLangState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});

    if (newIsRTL !== currentIsRTL) {
      I18nManager.allowRTL(newIsRTL);
      I18nManager.forceRTL(newIsRTL);

      // Layout mirroring (RTL) only takes effect after the native app restarts.
      // Try to reload automatically (works in production/EAS builds using expo-updates);
      // fall back to prompting the user to restart manually (e.g. in Expo Go / dev client).
      const attemptReload = async () => {
        try {
          if (Platform.OS !== "web" && Updates.reloadAsync) {
            await Updates.reloadAsync();
            return;
          }
        } catch {
          // expo-updates is not available in this runtime (e.g. Expo Go) — fall through to manual prompt.
        }
        Alert.alert(
          option?.rtl ? "إعادة التشغيل مطلوبة" : "Redémarrage requis",
          option?.rtl
            ? "الرجاء إغلاق التطبيق وإعادة فتحه لتطبيق اتجاه الكتابة من اليمين إلى اليسار بشكل كامل."
            : "Veuillez fermer complètement l'application et la rouvrir pour appliquer la mise en page de droite à gauche.",
        );
      };
      attemptReload();
    }
  }, []);

  const t = useCallback((key: string): string => {
    const entry = TRANSLATIONS[key];
    if (!entry) return key;
    return entry[lang] ?? entry["fr"] ?? key;
  }, [lang]);

  const currentOption = LANG_OPTIONS.find((o) => o.code === lang) ?? LANG_OPTIONS[0];
  const isRTL = currentOption.rtl;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL, currentOption }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
