import { createHash } from "node:crypto";

/**
 * Reference a co-owner writes in the motive of a bank transfer, one per call
 * for funds: <LOT>-<PERIOD>-<TYPE>-<CHECK>, e.g. A203-2026Q4-CC-7F3A9B.
 *  - readable: the owner recognises the lot and the period;
 *  - unique: the 6-character check code comes from the call's id (two
 *    buildings may have the same lot number);
 *  - short (≤ 25 characters) and made of characters every Moroccan bank
 *    accepts in a transfer motive.
 * Same formula as migration 0016 (backfill of existing calls).
 */
const TYPE_CODES: Record<string, string> = { charges_courantes: "CC", fonds_travaux: "FT" };

export function paymentReferenceFor(appelId: string, lotNumber: string, period: string, type: string | null | undefined): string {
  const lot = lotNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  const per = period.replace(/-/g, "");
  const t = type ? TYPE_CODES[type] ?? type.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() : "XX";
  const check = createHash("sha256").update(appelId, "utf8").digest("hex").slice(0, 6).toUpperCase();
  return `${lot}-${per}-${t}-${check}`;
}

/** Normalises what a bank prints in a statement line for reference matching. */
export function normaliseForMatch(text: string | null | undefined): string {
  return (text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
