import { isValidMoroccanRib, maskRib } from "./treasury.js";

/**
 * The condominium's bank details as entered by the syndic (syndicates.bank_*).
 * Moroccan accounts are identified by a 24-digit RIB; an IBAN is accepted too
 * (a Moroccan IBAN is « MA » + 2 check digits + the RIB). Both are verified
 * by their check digits, so a typo is caught before it is printed on a call
 * for funds.
 */
export type BankIdentifier = { kind: "rib" | "iban"; value: string };

export class BankDetailsError extends Error {
  constructor(
    readonly code: "INVALID_RIB" | "INVALID_IBAN" | "INVALID_BIC",
    message: string,
  ) {
    super(message);
  }
}

function ibanChecksumOk(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  // Piecewise modulo: the number is longer than a double can hold.
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}

/** Returns the identifier normalised (no spaces, upper case), or throws. */
export function parseBankIdentifier(raw: string): BankIdentifier {
  const v = raw.replace(/[\s.-]/g, "").toUpperCase();
  if (/^\d+$/.test(v)) {
    if (!isValidMoroccanRib(v)) throw new BankDetailsError("INVALID_RIB", "RIB invalide : 24 chiffres attendus, clé RIB incorrecte.");
    return { kind: "rib", value: v };
  }
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) {
    if (!ibanChecksumOk(v)) throw new BankDetailsError("INVALID_IBAN", "IBAN invalide : clé de contrôle incorrecte.");
    if (v.startsWith("MA") && (v.length !== 28 || !isValidMoroccanRib(v.slice(4)))) {
      throw new BankDetailsError("INVALID_IBAN", "IBAN marocain invalide : « MA » + 2 chiffres + RIB de 24 chiffres.");
    }
    return { kind: "iban", value: v };
  }
  throw new BankDetailsError("INVALID_RIB", "Saisissez un RIB marocain (24 chiffres) ou un IBAN.");
}

/** BIC / SWIFT: 8 or 11 characters. */
export function parseBic(raw: string): string {
  const v = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v)) throw new BankDetailsError("INVALID_BIC", "Code BIC invalide (8 ou 11 caractères).");
  return v;
}

/** For audit entries and logs: the last four characters only. */
export function maskBankIdentifier(value: string | null | undefined): string | null {
  return value ? maskRib(value) : null;
}

/**
 * Normalises the bank fields of a condominium update in place: empty strings
 * clear a field, identifiers are verified. Returns the names of the bank
 * fields that are part of the update (for the audit trail).
 */
export function normaliseBankFields(update: Record<string, unknown>): string[] {
  const touched: string[] = [];
  for (const key of ["bankName", "bankIban", "bankBic"] as const) {
    if (update[key] === undefined) continue;
    touched.push(key);
    const raw = typeof update[key] === "string" ? (update[key] as string).trim() : "";
    if (!raw) { update[key] = null; continue; }
    if (key === "bankIban") update[key] = parseBankIdentifier(raw).value;
    else if (key === "bankBic") update[key] = parseBic(raw);
    else update[key] = raw.replace(/\s+/g, " ");
  }
  return touched;
}
