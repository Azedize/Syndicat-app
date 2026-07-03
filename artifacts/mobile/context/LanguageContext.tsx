import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { I18nManager } from "react-native";

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
  appName: { fr: "SYNDYCAT", en: "SYNDYCAT", ar: "سنديكات", es: "SYNDYCAT" },
  appTagline: { fr: "Global CPS Platform", en: "Global CPS Platform", ar: "منصة CPS العالمية", es: "Plataforma CPS Global" },
  selectRole: { fr: "Sélectionnez votre rôle", en: "Select your role", ar: "اختر دورك", es: "Seleccione su rol" },
  superAdmin: { fr: "Super Admin", en: "Super Admin", ar: "مدير عام", es: "Super Admin" },
  superAdminDesc: { fr: "Gestion globale", en: "Global management", ar: "الإدارة العامة", es: "Gestión global" },
  syndicateAdmin: { fr: "Admin Syndicat", en: "Syndicate Admin", ar: "مدير النقابة", es: "Admin Sindicato" },
  syndicateAdminDesc: { fr: "Gestion du syndicat", en: "Syndicate management", ar: "إدارة النقابة", es: "Gestión del sindicato" },
  member: { fr: "Membre", en: "Member", ar: "عضو", es: "Miembro" },
  memberDesc: { fr: "Accès membre", en: "Member access", ar: "وصول العضو", es: "Acceso miembro" },
  login: { fr: "Connexion", en: "Login", ar: "تسجيل الدخول", es: "Iniciar sesión" },
  email: { fr: "Email", en: "Email", ar: "البريد الإلكتروني", es: "Correo electrónico" },
  password: { fr: "Mot de passe", en: "Password", ar: "كلمة المرور", es: "Contraseña" },
  connect: { fr: "Se connecter", en: "Sign in", ar: "تسجيل الدخول", es: "Conectar" },
  demoMode: { fr: "Mode démo — email pré-rempli selon le rôle sélectionné", en: "Demo mode — email pre-filled per selected role", ar: "وضع تجريبي — البريد الإلكتروني محدد مسبقاً", es: "Modo demo — email prellenado según rol" },
  dashboard: { fr: "Tableau de bord", en: "Dashboard", ar: "لوحة القيادة", es: "Panel" },
  members: { fr: "Membres", en: "Members", ar: "الأعضاء", es: "Miembros" },
  finance: { fr: "Finance", en: "Finance", ar: "المالية", es: "Finanzas" },
  marketplace: { fr: "Marché", en: "Market", ar: "السوق", es: "Mercado" },
  more: { fr: "Plus", en: "More", ar: "المزيد", es: "Más" },
  settings: { fr: "Paramètres", en: "Settings", ar: "الإعدادات", es: "Ajustes" },
  profile: { fr: "Mon Profil", en: "My Profile", ar: "ملفي الشخصي", es: "Mi Perfil" },
  logout: { fr: "Se déconnecter", en: "Logout", ar: "تسجيل الخروج", es: "Cerrar sesión" },
  language: { fr: "Langue", en: "Language", ar: "اللغة", es: "Idioma" },
  appearance: { fr: "Apparence", en: "Appearance", ar: "المظهر", es: "Apariencia" },
  notifications: { fr: "Notifications", en: "Notifications", ar: "الإشعارات", es: "Notificaciones" },
  security: { fr: "Sécurité", en: "Security", ar: "الأمان", es: "Seguridad" },
  about: { fr: "À propos", en: "About", ar: "حول", es: "Acerca de" },
  darkMode: { fr: "Mode sombre", en: "Dark mode", ar: "الوضع الداكن", es: "Modo oscuro" },
  search: { fr: "Rechercher...", en: "Search...", ar: "بحث...", es: "Buscar..." },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  close: { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
  confirm: { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
  delete: { fr: "Supprimer", en: "Delete", ar: "حذف", es: "Eliminar" },
  edit: { fr: "Modifier", en: "Edit", ar: "تعديل", es: "Editar" },
  add: { fr: "Ajouter", en: "Add", ar: "إضافة", es: "Agregar" },
  back: { fr: "Retour", en: "Back", ar: "رجوع", es: "Volver" },
  welcome: { fr: "Bonjour", en: "Hello", ar: "مرحباً", es: "Hola" },
  elections: { fr: "Élections", en: "Elections", ar: "الانتخابات", es: "Elecciones" },
  meetings: { fr: "Réunions", en: "Meetings", ar: "الاجتماعات", es: "Reuniones" },
  documents: { fr: "Documents", en: "Documents", ar: "الوثائق", es: "Documentos" },
  chat: { fr: "Chat", en: "Chat", ar: "المحادثة", es: "Chat" },
  support: { fr: "Support", en: "Support", ar: "الدعم", es: "Soporte" },
  governance: { fr: "Gouvernance", en: "Governance", ar: "الحوكمة", es: "Gobernanza" },
  legal: { fr: "Juridique", en: "Legal", ar: "قانوني", es: "Legal" },
  reports: { fr: "Rapports", en: "Reports", ar: "التقارير", es: "Informes" },
  aiAssistant: { fr: "Assistant IA", en: "AI Assistant", ar: "مساعد الذكاء الاصطناعي", es: "Asistente IA" },
  aiGreeting: {
    fr: "Bonjour ! Je suis votre assistant syndical. Comment puis-je vous aider ?",
    en: "Hello! I am your union assistant. How can I help you?",
    ar: "مرحباً! أنا مساعدك النقابي. كيف يمكنني مساعدتك؟",
    es: "¡Hola! Soy tu asistente sindical. ¿Cómo puedo ayudarte?"
  },
  typeMessage: { fr: "Écrire un message...", en: "Type a message...", ar: "اكتب رسالة...", es: "Escribe un mensaje..." },
  askQuestion: { fr: "Poser une question", en: "Ask a question", ar: "اطرح سؤالاً", es: "Hacer una pregunta" },
  recurringTasks: { fr: "Tâches Récurrentes", en: "Recurring Tasks", ar: "المهام المتكررة", es: "Tareas Recurrentes" },
  versionHistory: { fr: "Historique des Versions", en: "Version History", ar: "سجل الإصدارات", es: "Historial de Versiones" },
  paymentPrediction: { fr: "Prévisions", en: "Predictions", ar: "التنبؤات", es: "Previsiones" },
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
      I18nManager.forceRTL(newIsRTL);
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
