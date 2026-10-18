import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  allocationKeySharesTable,
  allocationKeyVersionsTable,
  allocationKeysTable,
  budgetLinesTable,
  budgetsTable,
  expensesTable,
  lotsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * Charge allocation engine.
 *
 * Nothing is assumed: an amount is split between the lots listed by the key
 * that applies to its category, with their explicit coefficients (or equal
 * shares when the key explicitly says so). A lot of the building that the key
 * neither weights nor excludes (with a reason) is an error, never a silent
 * omission and never a default value. Surfaces are never used.
 *
 * Arithmetic is exact: amounts in cents and coefficients in millionths are
 * BigInt. ROUNDING RULE (reproducible): each lot first gets the integer part
 * of amount × coefficient / total; the cents left over (fewer than the number
 * of lots) go one by one to the lots with the largest remainders; equal
 * remainders are broken by lot number (natural order, then id). The lines of
 * a source therefore always add up exactly to the source amount.
 */
export const ROUNDING_RULE =
  "Centimes : partie entière de (montant × coefficient ÷ total des coefficients) pour chaque lot, puis les centimes restants un par un aux lots ayant les plus grands restes ; à reste égal, ordre des numéros de lot.";

export type Issue = { code: string; message: string; lotId?: string; lotNumber?: string; sourceId?: string; keyCode?: string };

export interface LotRef {
  id: string;
  number: string;
  archivedAt: Date | null;
}
export interface ShareRow {
  lotId: string;
  coefficient: string | null;
  excluded: boolean;
  exclusionReason: string | null;
}
export interface KeyVersionData {
  keyId: string | null;
  code: string;
  name: string;
  versionId: string | null;
  version: number;
  method: "shares" | "equal";
  categories: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceReference: string;
  shares: ShareRow[];
}
export interface SourceInput {
  type: "budget_line" | "budget_total" | "expense";
  id: string;
  label: string;
  category: string;
  amountCents: bigint;
  budgetId?: string | null;
  amountNote?: string;
  key: KeyVersionData | null;
}
export interface Line {
  lotId: string;
  lotNumber: string;
  coefficient: string;
  denominator: string;
  amountCents: bigint;
  adjustmentCents: bigint;
  explanation: string;
}

// ─── Exact numbers ────────────────────────────────────────────────────────────

const SCALE = 1_000_000n;
/** "12.5" → 12500000n (millionths); null when not a valid non-negative decimal with ≤ 6 decimals. */
export function parseCoefficient(v: string | number | null | undefined): bigint | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  return BigInt(i) * SCALE + BigInt((f + "000000").slice(0, 6));
}
export const formatCoefficient = (m: bigint) => {
  const i = m / SCALE;
  const f = (m % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return f ? `${i}.${f}` : `${i}`;
};
export const centsOf = (amount: string | number): bigint => {
  const s = String(amount).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Montant invalide : ${amount}`);
  const neg = s.startsWith("-");
  const [i, f = ""] = s.replace("-", "").split(".");
  const c = BigInt(i) * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -c : c;
};
export const money = (c: bigint) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
};
const human = (c: bigint) => `${money(c).replace(".", ",")} MAD`;
const natural = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });

// ─── Periods ──────────────────────────────────────────────────────────────────

/** First and last day of a period YYYY, YYYY-Qn or YYYY-MM. */
export function periodRange(period: string): { start: string; end: string; perYear: number } | null {
  let m = /^(\d{4})$/.exec(period);
  if (m) return { start: `${m[1]}-01-01`, end: `${m[1]}-12-31`, perYear: 1 };
  m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (m) {
    const q = Number(m[2]);
    const endMonth = q * 3;
    const last = new Date(Date.UTC(Number(m[1]), endMonth, 0)).getUTCDate();
    return { start: `${m[1]}-${String(endMonth - 2).padStart(2, "0")}-01`, end: `${m[1]}-${String(endMonth).padStart(2, "0")}-${last}`, perYear: 4 };
  }
  m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (m) {
    const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
    return { start: `${m[1]}-${m[2]}-01`, end: `${m[1]}-${m[2]}-${last}`, perYear: 12 };
  }
  return null;
}

/** Share of an annual amount for one period, half-up to the cent (rule shown with the result). */
export function periodShare(annualCents: bigint, perYear: number): bigint {
  const p = BigInt(perYear);
  return (annualCents * 2n + p) / (2n * p);
}

// ─── Validation of a key against the building ────────────────────────────────

export function validateKey(key: KeyVersionData, lots: LotRef[], period?: { start: string; end: string }): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const byLot = new Map<string, ShareRow[]>();
  for (const s of key.shares) byLot.set(s.lotId, [...(byLot.get(s.lotId) ?? []), s]);
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const tag = { keyCode: key.code };
  for (const [lotId, rows] of byLot) {
    const lot = lotById.get(lotId);
    if (rows.length > 1) errors.push({ ...tag, code: "DUPLICATE_UNIT", lotId, lotNumber: lot?.number, message: `Lot ${lot?.number ?? lotId} présent ${rows.length} fois dans la clé ${key.code}` });
    if (!lot) {
      errors.push({ ...tag, code: "FOREIGN_UNIT", lotId, message: `La clé ${key.code} contient un lot qui n'appartient pas à l'immeuble (${lotId})` });
      continue;
    }
    const r = rows[0];
    if (lot.archivedAt && !r.excluded) {
      errors.push({ ...tag, code: "INELIGIBLE_UNIT", lotId, lotNumber: lot.number, message: `Lot ${lot.number} archivé mais pondéré dans la clé ${key.code} : créez une nouvelle version de la clé` });
    }
    if (r.excluded) {
      if (!r.exclusionReason?.trim()) errors.push({ ...tag, code: "EXCLUSION_REASON_REQUIRED", lotId, lotNumber: lot.number, message: `Lot ${lot.number} exclu sans motif (clé ${key.code})` });
      continue;
    }
    if (r.coefficient === null || r.coefficient === undefined || r.coefficient === "") {
      errors.push({ ...tag, code: "MISSING_SHARE", lotId, lotNumber: lot.number, message: `Lot ${lot.number} : coefficient manquant dans la clé ${key.code}` });
      continue;
    }
    if (String(r.coefficient).trim().startsWith("-")) {
      errors.push({ ...tag, code: "NEGATIVE_COEFFICIENT", lotId, lotNumber: lot.number, message: `Lot ${lot.number} : coefficient négatif (${r.coefficient}) dans la clé ${key.code}` });
      continue;
    }
    const c = parseCoefficient(r.coefficient);
    if (c === null) {
      errors.push({ ...tag, code: "INVALID_COEFFICIENT", lotId, lotNumber: lot.number, message: `Lot ${lot.number} : coefficient invalide « ${r.coefficient} » (nombre positif, 6 décimales au plus)` });
      continue;
    }
    if (key.method === "equal" && c !== SCALE) {
      errors.push({ ...tag, code: "EQUAL_KEY_COEFFICIENT", lotId, lotNumber: lot.number, message: `Clé ${key.code} « parts égales » : chaque lot inclus a le coefficient 1 (lot ${lot.number} : ${r.coefficient})` });
    }
    if (c === 0n) warnings.push({ ...tag, code: "ZERO_COEFFICIENT", lotId, lotNumber: lot.number, message: `Lot ${lot.number} : coefficient 0, il ne paiera rien sur la clé ${key.code}` });
  }
  // Every active lot must be either weighted or explicitly excluded.
  for (const lot of lots) {
    if (!lot.archivedAt && !byLot.has(lot.id)) {
      errors.push({ ...tag, code: "MISSING_SHARE", lotId: lot.id, lotNumber: lot.number, message: `Lot ${lot.number} : ni coefficient ni exclusion dans la clé ${key.code}` });
    }
  }
  const total = key.shares.filter((s) => !s.excluded).reduce((t, s) => t + (parseCoefficient(s.coefficient) ?? 0n), 0n);
  if (total === 0n) errors.push({ ...tag, code: "ZERO_DENOMINATOR", message: `La clé ${key.code} n'a aucun coefficient positif : impossible de répartir` });
  if (key.effectiveTo && key.effectiveTo < key.effectiveFrom) errors.push({ ...tag, code: "INVALID_EFFECTIVE_DATES", message: `Clé ${key.code} : fin (${key.effectiveTo}) avant le début (${key.effectiveFrom})` });
  if (period && (period.start < key.effectiveFrom || (key.effectiveTo && period.start > key.effectiveTo))) {
    errors.push({ ...tag, code: "KEY_NOT_EFFECTIVE", message: `La clé ${key.code} v${key.version} ne s'applique pas à cette période (du ${key.effectiveFrom}${key.effectiveTo ? ` au ${key.effectiveTo}` : ""})` });
  }
  if (period && key.effectiveTo && period.end > key.effectiveTo) {
    warnings.push({ ...tag, code: "KEY_CHANGES_IN_PERIOD", message: `La clé ${key.code} v${key.version} prend fin le ${key.effectiveTo}, en cours de période : la version en vigueur au début de la période est utilisée` });
  }
  return { errors, warnings };
}

// ─── Split ────────────────────────────────────────────────────────────────────

export function splitSource(source: SourceInput, lots: LotRef[]): Line[] {
  const key = source.key!;
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const rows = key.shares
    .filter((s) => !s.excluded)
    .map((s) => ({ lotId: s.lotId, number: lotById.get(s.lotId)?.number ?? s.lotId, w: parseCoefficient(s.coefficient)! }))
    .sort((a, b) => natural(a.number, b.number) || a.lotId.localeCompare(b.lotId));
  const W = rows.reduce((t, r) => t + r.w, 0n);
  const A = source.amountCents;
  const parts = rows.map((r) => ({ ...r, floor: (A * r.w) / W, rem: (A * r.w) % W, extra: 0n }));
  let residual = A - parts.reduce((t, p) => t + p.floor, 0n);
  const order = [...parts].sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : 0) || natural(a.number, b.number) || a.lotId.localeCompare(b.lotId));
  for (const p of order) {
    if (residual <= 0n) break;
    p.extra = 1n;
    residual -= 1n;
  }
  return parts.map((p) => {
    const amount = p.floor + p.extra;
    const exact = `${human(A)} × ${formatCoefficient(p.w)} ÷ ${formatCoefficient(W)}`;
    return {
      lotId: p.lotId,
      lotNumber: p.number,
      coefficient: formatCoefficient(p.w),
      denominator: formatCoefficient(W),
      amountCents: amount,
      adjustmentCents: p.extra,
      explanation:
        key.method === "equal"
          ? `${human(A)} en parts égales entre ${rows.length} lots (clé ${key.code} v${key.version}) = ${human(amount)}${p.extra ? " (+0,01 arrondi)" : ""}`
          : `${exact} (clé ${key.code} v${key.version}) = ${human(amount)}${p.extra ? " (+0,01 arrondi)" : ""}`,
    };
  });
}

// ─── Loading keys, lots and sources ───────────────────────────────────────────

export async function buildingLots(buildingId: string): Promise<LotRef[]> {
  return db.select({ id: lotsTable.id, number: lotsTable.number, archivedAt: lotsTable.archivedAt }).from(lotsTable).where(eq(lotsTable.buildingId, buildingId));
}

export async function loadKeyVersion(versionId: string): Promise<KeyVersionData | null> {
  const [v] = await db
    .select({ v: allocationKeyVersionsTable, k: allocationKeysTable })
    .from(allocationKeyVersionsTable)
    .innerJoin(allocationKeysTable, eq(allocationKeysTable.id, allocationKeyVersionsTable.keyId))
    .where(eq(allocationKeyVersionsTable.id, versionId));
  if (!v) return null;
  const shares = await db.select().from(allocationKeySharesTable).where(eq(allocationKeySharesTable.versionId, versionId));
  return {
    keyId: v.k.id,
    code: v.k.code,
    name: v.k.name,
    versionId: v.v.id,
    version: v.v.version,
    method: v.v.method as "shares" | "equal",
    categories: v.v.categories,
    effectiveFrom: v.v.effectiveFrom,
    effectiveTo: v.v.effectiveTo,
    sourceReference: v.v.sourceReference,
    shares: shares.map((s) => ({ lotId: s.lotId, coefficient: s.coefficient, excluded: s.excluded, exclusionReason: s.exclusionReason })),
  };
}

/**
 * Key version for a category at a date: among the building's active keys,
 * the versions in force at `date` whose categories include `category`.
 * Zero or several candidates are errors (no guessing between two rules).
 */
export async function resolveKey(buildingId: string, category: string, date: string, keyId?: string): Promise<{ key: KeyVersionData | null; issue?: Issue }> {
  const rows = await db
    .select({ id: allocationKeyVersionsTable.id, keyId: allocationKeysTable.id, code: allocationKeysTable.code, categories: allocationKeyVersionsTable.categories, from: allocationKeyVersionsTable.effectiveFrom, to: allocationKeyVersionsTable.effectiveTo })
    .from(allocationKeyVersionsTable)
    .innerJoin(allocationKeysTable, eq(allocationKeysTable.id, allocationKeyVersionsTable.keyId))
    .where(and(eq(allocationKeysTable.buildingId, buildingId), eq(allocationKeysTable.status, "active"), ...(keyId ? [eq(allocationKeysTable.id, keyId)] : [])));
  const inForce = rows.filter((r) => r.from <= date && (!r.to || r.to >= date));
  if (keyId) {
    if (rows.length === 0) return { key: null, issue: { code: "KEY_NOT_FOUND", message: "Clé de répartition introuvable dans cet immeuble" } };
    if (inForce.length === 0) return { key: null, issue: { code: "KEY_NOT_EFFECTIVE", keyCode: rows[0].code, message: `La clé ${rows[0].code} n'a pas de version en vigueur au ${date}` } };
    const key = await loadKeyVersion(inForce[0].id);
    if (key && !key.categories.includes(category)) {
      return { key, issue: { code: "CATEGORY_NOT_COVERED", keyCode: key.code, message: `La clé ${key.code} ne couvre pas la catégorie « ${category} » (catégories : ${key.categories.join(", ")})` } };
    }
    return { key };
  }
  const match = inForce.filter((r) => r.categories.includes(category));
  if (match.length === 0) return { key: null, issue: { code: "NO_KEY_FOR_CATEGORY", message: `Aucune clé de répartition en vigueur au ${date} pour la catégorie « ${category} »` } };
  if (match.length > 1) {
    return { key: null, issue: { code: "AMBIGUOUS_KEY", message: `Plusieurs clés couvrent « ${category} » (${match.map((m) => m.code).join(", ")}) : choisissez la clé` } };
  }
  return { key: await loadKeyVersion(match[0].id) };
}

/** The general-charges key the calls were based on so far: the lots' tantièmes. */
export function tantiemesKey(lots: (LotRef & { tantiemes: number | null })[], date: string): KeyVersionData {
  return {
    keyId: null,
    code: "TANTIEMES",
    name: "Tantièmes des lots (fiche du lot)",
    versionId: null,
    version: 1,
    method: "shares",
    categories: ["charges_generales", "fonds_reserve"],
    effectiveFrom: date,
    effectiveTo: null,
    sourceReference: "Tantièmes saisis sur chaque lot — à vérifier contre le règlement de copropriété",
    shares: lots
      .filter((l) => !l.archivedAt)
      .map((l) =>
        (l.tantiemes ?? 0) > 0
          ? { lotId: l.id, coefficient: String(l.tantiemes), excluded: false, exclusionReason: null }
          : { lotId: l.id, coefficient: null, excluded: true, exclusionReason: "0 tantième sur la fiche du lot" },
      ),
  };
}

export type SourceRequest = { type: "budget_line" | "expense"; id: string; keyId?: string } | { type: "budget_total"; budgetId: string; part: "charges" | "fonds_reserve"; keyId?: string };

/** Turns the requested sources into amounts + keys, with the reasons they cannot be used. */
export async function loadSources(
  syndicateId: string,
  buildingId: string,
  period: string,
  requests: SourceRequest[],
  opts: { implicitTantiemes?: boolean } = {},
): Promise<{ sources: SourceInput[]; errors: Issue[] }> {
  const range = periodRange(period)!;
  const errors: Issue[] = [];
  const sources: SourceInput[] = [];
  const seen = new Set<string>();
  for (const r of requests) {
    const sid = r.type === "budget_total" ? `${r.budgetId}:${r.part}` : r.id;
    if (seen.has(`${r.type}:${sid}`)) {
      errors.push({ code: "DUPLICATE_SOURCE", sourceId: sid, message: "La même source est sélectionnée deux fois" });
      continue;
    }
    seen.add(`${r.type}:${sid}`);
    let label = "";
    let category = "";
    let amountCents = 0n;
    let budgetId: string | null = null;
    let amountNote: string | undefined;
    if (r.type === "budget_line") {
      const [row] = await db
        .select({ line: budgetLinesTable, budget: budgetsTable })
        .from(budgetLinesTable)
        .innerJoin(budgetsTable, eq(budgetsTable.id, budgetLinesTable.budgetId))
        .where(eq(budgetLinesTable.id, r.id));
      if (!row || row.budget.buildingId !== buildingId) {
        errors.push({ code: "SOURCE_NOT_FOUND", sourceId: r.id, message: "Ligne budgétaire introuvable dans cet immeuble" });
        continue;
      }
      if (row.budget.status !== "approved") {
        errors.push({ code: "BUDGET_NOT_APPROVED", sourceId: r.id, message: `Le budget ${row.budget.year} n'est pas approuvé en assemblée générale` });
        continue;
      }
      if (String(row.budget.year) !== period.slice(0, 4)) {
        errors.push({ code: "PERIOD_OUTSIDE_BUDGET", sourceId: r.id, message: `La période ${period} n'appartient pas à l'exercice ${row.budget.year}` });
        continue;
      }
      label = `${row.line.label} (budget ${row.budget.year})`;
      category = row.line.category;
      budgetId = row.budget.id;
      const quarter = /^\d{4}-Q([1-4])$/.exec(period)?.[1];
      const qAmount = quarter ? (row.line as any)[`amountQ${quarter}`] : null;
      if (qAmount !== null && qAmount !== undefined) {
        amountCents = centsOf(qAmount);
        amountNote = `montant du trimestre ${quarter} de la ligne`;
      } else {
        amountCents = periodShare(centsOf(row.line.amountAnnual ?? "0"), range.perYear);
        amountNote = range.perYear === 1 ? "montant annuel de la ligne" : `montant annuel ÷ ${range.perYear}, arrondi au centime le plus proche`;
      }
    } else if (r.type === "budget_total") {
      const [b] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, r.budgetId));
      if (!b || b.buildingId !== buildingId) {
        errors.push({ code: "SOURCE_NOT_FOUND", sourceId: r.budgetId, message: "Budget introuvable dans cet immeuble" });
        continue;
      }
      if (b.status !== "approved") {
        errors.push({ code: "BUDGET_NOT_APPROVED", sourceId: r.budgetId, message: "Le budget doit être approuvé en assemblée générale avant d'émettre des appels de fonds." });
        continue;
      }
      label = r.part === "fonds_reserve" ? `Fonds de réserve (budget ${b.year})` : `Charges courantes (budget ${b.year})`;
      category = r.part === "fonds_reserve" ? "fonds_reserve" : "charges_generales";
      budgetId = b.id;
      amountCents = periodShare(centsOf((r.part === "fonds_reserve" ? b.fondsReserve : b.chargesAmount) ?? "0"), range.perYear);
      amountNote = range.perYear === 1 ? "montant annuel" : `montant annuel ÷ ${range.perYear}, arrondi au centime le plus proche`;
    } else {
      const [e] = await db.select().from(expensesTable).where(and(eq(expensesTable.id, r.id), eq(expensesTable.syndicateId, syndicateId)));
      if (!e) {
        errors.push({ code: "SOURCE_NOT_FOUND", sourceId: r.id, message: "Dépense introuvable" });
        continue;
      }
      if (e.buildingId !== buildingId) {
        errors.push({ code: e.buildingId ? "SOURCE_OTHER_BUILDING" : "EXPENSE_BUILDING_REQUIRED", sourceId: r.id, message: e.buildingId ? "Cette dépense concerne un autre immeuble" : `Dépense ${e.reference} sans immeuble : précisez-le avant de la répartir` });
        continue;
      }
      if (!["approved", "paid"].includes(e.status)) {
        errors.push({ code: "EXPENSE_NOT_APPROVED", sourceId: r.id, message: `Dépense ${e.reference} « ${e.status} » : seule une dépense approuvée ou payée se répartit` });
        continue;
      }
      label = `${e.reference} — ${e.label}`;
      category = e.category;
      amountCents = centsOf(e.amount);
      amountNote = "montant de la dépense";
    }
    if (amountCents <= 0n) {
      errors.push({ code: "INVALID_SOURCE_AMOUNT", sourceId: sid, message: `${label} : montant nul pour la période, rien à répartir` });
      continue;
    }
    let key: KeyVersionData | null = null;
    if (opts.implicitTantiemes && r.type === "budget_total" && !r.keyId) {
      const lots = await db
        .select({ id: lotsTable.id, number: lotsTable.number, archivedAt: lotsTable.archivedAt, tantiemes: lotsTable.tantiemes })
        .from(lotsTable)
        .where(and(eq(lotsTable.buildingId, buildingId), isNull(lotsTable.archivedAt)));
      key = tantiemesKey(lots, range.start);
    } else {
      const res = await resolveKey(buildingId, category, range.start, r.keyId);
      if (res.issue) errors.push({ ...res.issue, sourceId: sid });
      key = res.issue ? null : res.key;
    }
    sources.push({ type: r.type, id: sid, label, category, amountCents, budgetId, amountNote, key });
  }
  return { sources, errors };
}

/** Full calculation: validation of every key, lines per source, totals per lot. */
export async function computeAllocation(buildingId: string, period: string, sources: SourceInput[], loadErrors: Issue[]) {
  const range = periodRange(period)!;
  const lots = await buildingLots(buildingId);
  const errors = [...loadErrors];
  const warnings: Issue[] = [];
  const results: { source: SourceInput; lines: Line[] }[] = [];
  for (const s of sources) {
    if (!s.key) continue;
    const v = validateKey(s.key, lots, range);
    errors.push(...v.errors.map((e) => ({ ...e, sourceId: s.id })));
    warnings.push(...v.warnings.map((e) => ({ ...e, sourceId: s.id })));
    if (v.errors.length === 0) results.push({ source: s, lines: splitSource(s, lots) });
  }
  const perLot = new Map<string, { lotId: string; lotNumber: string; amountCents: bigint }>();
  for (const r of results) {
    for (const l of r.lines) {
      const cur = perLot.get(l.lotId) ?? { lotId: l.lotId, lotNumber: l.lotNumber, amountCents: 0n };
      cur.amountCents += l.amountCents;
      perLot.set(l.lotId, cur);
    }
  }
  const sourceTotal = sources.reduce((t, s) => t + s.amountCents, 0n);
  const computedTotal = results.reduce((t, r) => t + r.source.amountCents, 0n);
  const allocated = [...perLot.values()].reduce((t, l) => t + l.amountCents, 0n);
  const excluded = sources.flatMap((s) => (s.key?.shares ?? []).filter((x) => x.excluded).map((x) => ({ sourceId: s.id, lotId: x.lotId, lotNumber: lots.find((l) => l.id === x.lotId)?.number ?? x.lotId, reason: x.exclusionReason })));
  // Canonical inputs: the hash proves the confirmation is the previewed calculation.
  const inputs = {
    buildingId,
    period,
    roundingRule: ROUNDING_RULE,
    sources: sources.map((s) => ({ type: s.type, id: s.id, label: s.label, category: s.category, amount: money(s.amountCents), amountNote: s.amountNote, budgetId: s.budgetId ?? null, key: s.key })),
    lots: lots.map((l) => ({ id: l.id, number: l.number, archived: !!l.archivedAt })).sort((a, b) => a.id.localeCompare(b.id)),
  };
  const inputsHash = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
  return {
    valid: errors.length === 0 && results.length === sources.length && sources.length > 0,
    errors,
    warnings,
    inputs,
    inputsHash,
    results,
    perLot: [...perLot.values()].sort((a, b) => natural(a.lotNumber, b.lotNumber)),
    excluded,
    // Every computed source reconciles to the cent (largest-remainder rule).
    totals: { source: sourceTotal, allocated, reconciled: allocated === computedTotal },
  };
}

export type Computation = Awaited<ReturnType<typeof computeAllocation>>;

/** JSON view of a computation (BigInt → strings). */
export function computationView(c: Computation) {
  return {
    valid: c.valid,
    errors: c.errors,
    warnings: c.warnings,
    inputsHash: c.inputsHash,
    roundingRule: ROUNDING_RULE,
    sources: c.results.map((r) => ({
      type: r.source.type,
      id: r.source.id,
      label: r.source.label,
      category: r.source.category,
      amount: money(r.source.amountCents),
      amountNote: r.source.amountNote,
      key: r.source.key ? { code: r.source.key.code, name: r.source.key.name, version: r.source.key.version, versionId: r.source.key.versionId, method: r.source.key.method, sourceReference: r.source.key.sourceReference } : null,
      lines: r.lines.map((l) => ({ lotId: l.lotId, lotNumber: l.lotNumber, coefficient: l.coefficient, denominator: l.denominator, amount: money(l.amountCents), roundingAdjustment: money(l.adjustmentCents), explanation: l.explanation })),
      total: money(r.lines.reduce((t, l) => t + l.amountCents, 0n)),
    })),
    perLot: c.perLot.map((l) => ({ lotId: l.lotId, lotNumber: l.lotNumber, amount: money(l.amountCents) })),
    excluded: c.excluded,
    totals: { source: money(c.totals.source), allocated: money(c.totals.allocated), reconciled: c.totals.reconciled },
  };
}

/** Lots of these ids that exist in the building (for key editing). */
export async function lotsOfBuilding(buildingId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select({ id: lotsTable.id }).from(lotsTable).where(and(eq(lotsTable.buildingId, buildingId), inArray(lotsTable.id, ids)));
}
