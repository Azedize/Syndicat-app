// Supported languages: codes, labels and reading direction.

export type LangCode = "fr" | "en" | "ar" | "es";

export interface LangOption {
  code: LangCode;
  label: string;
  nativeLabel: string;
  flag: string;
  rtl: boolean;
}

export const LANG_OPTIONS: LangOption[] = [
  {
    code: "fr",
    label: "Français",
    nativeLabel: "Français",
    flag: "🇫🇷",
    rtl: false,
  },
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    flag: "🇬🇧",
    rtl: false,
  },
  {
    code: "ar",
    label: "العربية",
    nativeLabel: "العربية",
    flag: "🇲🇦",
    rtl: true,
  },
  {
    code: "es",
    label: "Español",
    nativeLabel: "Español",
    flag: "🇪🇸",
    rtl: false,
  },
];
