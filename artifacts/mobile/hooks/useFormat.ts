import { useCallback, useMemo } from "react";
import { useLanguage } from "@/context/LanguageContext";

/** Intl locale of each app language (ar-MA keeps Western digits, as used in Morocco). */
export function localeOf(lang: string): string {
  return lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";
}

/**
 * Locale-aware formatting of amounts and dates. Display only: amounts are
 * formatted from the values the API returns, never recomputed or rounded
 * beyond the requested number of decimals.
 */
export function useFormat() {
  const { lang } = useLanguage();
  const locale = useMemo(() => localeOf(lang), [lang]);

  const number = useCallback(
    (value: number, decimals = 2) => {
      try {
        return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
      } catch {
        return value.toFixed(decimals);
      }
    },
    [locale],
  );

  const money = useCallback(
    (value: number | string | null | undefined, opts: { decimals?: number; currency?: string } = {}) => {
      const n = typeof value === "string" ? Number(value) : (value ?? 0);
      return `${number(Number.isFinite(n) ? n : 0, opts.decimals ?? 2)} ${opts.currency ?? "MAD"}`;
    },
    [number],
  );

  const date = useCallback(
    (value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) => {
      if (!value) return "";
      // A bare YYYY-MM-DD is a calendar day: read it at noon so no time zone shifts it.
      const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      try {
        return d.toLocaleDateString(locale, options);
      } catch {
        return d.toDateString();
      }
    },
    [locale],
  );

  return { locale, number, money, date };
}
