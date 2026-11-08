/**
 * Server error messages in the reader's language.
 *
 * Routes keep answering `{ error: "<French message>", code? }`. Just before
 * the answer leaves, `localizeErrorBody` (installed by app.ts) looks the
 * message up in the catalogue and:
 *   - replaces it with the text in the request's language (Accept-Language,
 *     sent by the app on every call): French, English or Arabic; Spanish
 *     readers get English until the catalogue has Spanish;
 *   - adds the stable `code` when the route did not set one (a route's own
 *     code is never changed: the app already relies on some of them).
 * The response shape does not change. A message absent from the catalogue is
 * sent unchanged and logged once, so the gaps can be found;
 * `scripts/src/server-errors-i18n-test.ts` fails when a message of a priority
 * module is missing.
 */
import { ACCOUNT_ERRORS } from "./catalog-accounts.js";
import { CONTENT_ERRORS } from "./catalog-content.js";
import { CORE_ERRORS } from "./catalog-core.js";
import { FINANCE_ERRORS } from "./catalog-finance.js";
import { GOVERNANCE_ERRORS } from "./catalog-governance.js";
import { PROPERTY_ERRORS } from "./catalog-property.js";
import { ERROR_PATTERNS } from "./patterns.js";
import { VALIDATION_ERRORS } from "./catalog-validation.js";
import { OPERATIONS_ERRORS } from "./catalog-operations.js";
import { OPERATIONS_ERRORS_2 } from "./catalog-operations-2.js";
import { OPERATIONS_PATTERNS } from "./patterns-operations.js";
import type { ErrorEntry } from "./types.js";

export type ErrorLang = "fr" | "en" | "ar";

export const ERROR_CATALOG: Readonly<Record<string, ErrorEntry>> = {
  ...CORE_ERRORS,
  ...ACCOUNT_ERRORS,
  ...PROPERTY_ERRORS,
  ...FINANCE_ERRORS,
  ...GOVERNANCE_ERRORS,
  ...CONTENT_ERRORS,
  ...VALIDATION_ERRORS,
  ...OPERATIONS_ERRORS,
  ...OPERATIONS_ERRORS_2,
};

/** Language of the error texts for an Accept-Language header. */
export function errorLang(header: string | string[] | undefined): ErrorLang {
  const v = (Array.isArray(header) ? header[0] : header ?? "").slice(0, 2).toLowerCase();
  if (v === "ar") return "ar";
  if (v === "en" || v === "es") return "en";
  return "fr";
}

const fill = (text: string, values: string[]) => text.replace(/\{(\d)\}/g, (_m, i: string) => values[Number(i) - 1] ?? "");

/** The message in `lang` and its stable code, or null when the catalogue does not know it. */
export function translateError(message: string, lang: ErrorLang): { error: string; code: string } | null {
  const entry = ERROR_CATALOG[message] ?? ERROR_CATALOG[message.trim()];
  if (entry) {
    const [code, en, ar, fr] = entry;
    return { code, error: lang === "en" ? en : lang === "ar" ? ar : fr ?? message };
  }
  for (const [pattern, code, fr, en, ar] of [...ERROR_PATTERNS, ...OPERATIONS_PATTERNS]) {
    const m = pattern.exec(message);
    if (m) return { code, error: fill(lang === "en" ? en : lang === "ar" ? ar : fr, m.slice(1)) };
  }
  return null;
}

const reported = new Set<string>();

/**
 * The error body to send: translated message, stable code added when missing.
 * Bodies that are not error answers are returned as they are.
 */
export function localizeErrorBody(body: unknown, status: number, lang: ErrorLang, onUnknown?: (message: string) => void): unknown {
  if (status < 400 || !body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  if (typeof b.error !== "string" || !b.error) return body;
  const t = translateError(b.error, lang);
  if (!t) {
    if (onUnknown && !reported.has(b.error)) {
      reported.add(b.error);
      onUnknown(b.error);
    }
    return body;
  }
  return { ...b, error: t.error, code: typeof b.code === "string" && b.code ? b.code : t.code };
}
