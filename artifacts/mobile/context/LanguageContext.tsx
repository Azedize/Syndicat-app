import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyScriptFonts } from "@/constants/typography";
import * as Updates from "expo-updates";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Alert, I18nManager, Platform } from "react-native";

import { LANG_OPTIONS, type LangCode, type LangOption } from "@/i18n/languages";
import { TRANSLATIONS } from "@/i18n/translations";
import { setRequestLanguage } from "@/i18n/current";

// Re-exported so existing imports from this module keep working.
export { LANG_OPTIONS };
export type { LangCode, LangOption };

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

/**
 * The language last used by the provider. The error screen is drawn above the
 * providers (the error boundary wraps them), so it reads this instead of the
 * context.
 */
let lastLanguage: LangCode = "fr";
export const getLastLanguage = () => lastLanguage;

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("fr");
  // Display presets follow the script before any child renders.
  applyScriptFonts(lang);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && ["fr", "en", "ar", "es"].includes(saved)) {
          setLangState(saved as LangCode);
        }
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((code: LangCode) => {
    const option = LANG_OPTIONS.find((o) => o.code === code);
    const newIsRTL = option?.rtl ?? false;
    const currentIsRTL = I18nManager.isRTL;
    setLangState(code);
    const persist = AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});

    if (newIsRTL !== currentIsRTL) {
      I18nManager.allowRTL(newIsRTL);
      I18nManager.forceRTL(newIsRTL);

      // Layout mirroring (RTL) is a native-level flag (Yoga's root layout
      // direction) — it only takes effect after the native app process
      // actually restarts. A JS-only refresh is not enough: React Navigation,
      // gesture-handler, and Reanimated all read I18nManager.isRTL once at
      // native init and never re-check it, so screens (tab bar, dashboard,
      // stacks, etc.) stay mirrored to the old direction until a real restart.
      const attemptReload = async () => {
        // Make sure the new language is on disk before restarting, so the
        // relaunched app reads the new value back out of storage.
        await persist;
        try {
          // Works in EAS/production builds and dev clients built with
          // expo-updates configured — triggers a full native reload.
          await Updates.reloadAsync();
          return;
        } catch {
          // expo-updates reload isn't available in this runtime (e.g. Expo Go) —
          // fall through and ask the user to restart manually.
        }
        // In the language just chosen (the user may not read the previous one).
        const say = (key: string) => TRANSLATIONS[key]?.[code] ?? TRANSLATIONS[key]?.fr ?? key;
        Alert.alert(say("restartRequiredTitle"), say(newIsRTL ? "restartRequiredRtl" : "restartRequiredLtr"));
      };
      attemptReload();
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      const entry = TRANSLATIONS[key];
      if (!entry) return key;
      return entry[lang] ?? entry["fr"] ?? key;
    },
    [lang],
  );

  const currentOption =
    LANG_OPTIONS.find((o) => o.code === lang) ?? LANG_OPTIONS[0];
  const isRTL = currentOption.rtl;
  lastLanguage = lang;
  setRequestLanguage(lang);

  // Web: the page declares its language and direction (screen readers, the
  // browser's own RTL handling) and its title follows the language.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    const tagline = TRANSLATIONS.appTitleTagline?.[lang] ?? TRANSLATIONS.appTitleTagline?.fr;
    if (tagline) document.title = `MIZAN — ${tagline}`;
  }, [lang, isRTL]);

  return (
    <LanguageContext.Provider
      value={{ lang, setLang, t, isRTL, currentOption }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
