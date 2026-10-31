/**
 * Residues of earlier generator runs: rows that point to a deleted user or
 * condominium through a column WITHOUT a foreign key (an older cleanup could
 * miss them, see removeSet). A row is attributed to the generator only on
 * proof, never because it "looks" fictitious:
 *   - the dangling value, or the row id, is a UUID that a known seed's random
 *     stream produces — the former derivation (16 consecutive mulberry32
 *     draws) or the current one (SHA-256 of seed and counter); or
 *   - the row carries a text that only the generator writes.
 * Every other dangling row (test suites, manual actions) is reported, not
 * touched.
 */
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { pool } from "@workspace/db";
import type { TableInfo } from "./introspect.js";

/** Columns checked: [column, referenced table]. */
const REF_COLUMNS: [string, string][] = [
  ["syndicate_id", "syndicates"],
  ["user_id", "users"],
  ["owner_id", "users"],
  ["author_id", "users"],
  ["created_by", "users"],
  ["buyer_id", "users"],
  ["seller_id", "users"],
  ["reviewer_id", "users"],
  ["reporter_id", "users"],
  ["product_id", "products"],
];
/** Exact values written only by the generator (generate.ts). */
const SIGNATURES: Record<string, string> = {
  audit_logs: `details = 'Généré par seedgen'`,
  orders: `product_name = 'Article' AND type = 'direct'`,
  reviews: `comment = 'Transaction sans souci.'`,
};

const hex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, "0")).join("");
const asUuid = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;

/** Which of `values` a seed produces (old mulberry32 derivation, or SHA-256 counter). */
export function producedBySeed(seed: number, values: Set<string>, maxDraws = 12_000_000, maxCounter = 1_500_000): Set<string> {
  const found = new Set<string>();
  const wanted = [...values].filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v));
  if (!wanted.length) return found;
  // current derivation
  const set = new Set(wanted);
  for (let n = 0; n < maxCounter && found.size < set.size; n++) {
    const h = [...createHash("sha256").update(`seedgen:${seed}:${n}`).digest().subarray(0, 16)];
    h[6] = (h[6] & 0x0f) | 0x40;
    h[8] = (h[8] & 0x3f) | 0x80;
    const u = asUuid(hex(h));
    if (set.has(u)) found.add(u);
  }
  // former derivation: 16 consecutive draws floor(next() * 256) from any position
  const byKey = new Map<number, number[][]>();
  for (const v of wanted) {
    if (found.has(v)) continue;
    const b = v.replace(/-/g, "").match(/../g)!.map((x) => parseInt(x, 16));
    const key = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    byKey.set(key, [...(byKey.get(key) ?? []), b]);
  }
  if (byKey.size) {
    let s = seed >>> 0 || 1;
    const draw = () => {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 256);
    };
    const ring = new Uint8Array(16);
    for (let i = 0; i < 16; i++) ring[i] = draw();
    for (let p = 0; p < maxDraws; p++) {
      const at = (i: number) => ring[(p + i) & 15];
      const key = ((at(0) << 24) | (at(1) << 16) | (at(2) << 8) | at(3)) >>> 0;
      const cands = byKey.get(key);
      if (cands) {
        for (const b of cands) {
          let ok = true;
          for (let i = 4; i < 16 && ok; i++) {
            if (i === 6) ok = (at(6) & 0x0f) === (b[6] & 0x0f);
            else if (i === 8) ok = (at(8) & 0x3f) === (b[8] & 0x3f);
            else ok = at(i) === b[i];
          }
          if (ok) found.add(asUuid(hex(b)));
        }
      }
      ring[p & 15] = draw();
    }
  }
  return found;
}

/** Seeds the generator used on this machine (manifests and remaining markers). */
export async function knownSeeds(stateDir: string): Promise<number[]> {
  const seeds = new Set<number>();
  try {
    for (const f of readdirSync(stateDir)) {
      const m = /^run-s(\d+)\.json$/.exec(f);
      if (m) seeds.add(Number(m[1]));
    }
  } catch {
    /* no state dir */
  }
  for (const r of (await pool.unsafe(`SELECT DISTINCT split_part(creation_key, ':', 2) AS k FROM syndicates WHERE creation_key LIKE 'seedgen:s%'`)) as unknown as { k: string }[]) seeds.add(Number(r.k.slice(1)));
  return [...seeds].filter((s) => Number.isFinite(s));
}

export interface Residue {
  table: string;
  column: string;
  dangling: number;
  proven: number;
  ids: string[];
}

/** Dangling rows per (table, column) and those proven to come from the generator. */
export async function findResidues(tables: TableInfo[], seeds: number[]): Promise<Residue[]> {
  const out: Residue[] = [];
  const pending: { t: TableInfo; col: string; ref: string; rows: { id: string | null; v: string; sig: boolean }[] }[] = [];
  const values = new Set<string>();
  for (const t of tables) {
    const cols = new Set(t.columns.map((c) => c.name));
    if (!cols.has("id")) continue;
    for (const [col, ref] of REF_COLUMNS) {
      if (!cols.has(col) || t.foreignKeys.some((f) => f.columns.length === 1 && f.columns[0] === col)) continue;
      const sig = SIGNATURES[t.name] ?? "FALSE";
      const rows = (await pool.unsafe(`SELECT id::text AS id, "${col}"::text AS v, (${sig}) AS sig FROM "${t.name}" WHERE "${col}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${ref}" z WHERE z.id = "${t.name}"."${col}")`)) as unknown as { id: string; v: string; sig: boolean }[];
      // organizations.created_by holds the run key, not a user
      const real = t.name === "organizations" && col === "created_by" ? rows.filter((r) => !r.v.startsWith("seedgen:")) : rows;
      if (!real.length) continue;
      pending.push({ t, col, ref, rows: real });
      for (const r of real) {
        values.add(r.v);
        if (r.id) values.add(r.id);
      }
    }
  }
  const proven = new Set<string>();
  for (const s of seeds) for (const v of producedBySeed(s, values)) proven.add(v);
  for (const p of pending) {
    const ids = p.rows.filter((r) => r.sig || proven.has(r.v) || (r.id && proven.has(r.id))).map((r) => r.id!);
    out.push({ table: p.t.name, column: p.col, dangling: p.rows.length, proven: ids.length, ids });
  }
  return out;
}

/** Deletes the proven residues (one transaction); returns rows removed per table. */
export async function removeResidues(res: Residue[]): Promise<Record<string, number>> {
  const byTable = new Map<string, Set<string>>();
  for (const r of res) for (const id of r.ids) byTable.set(r.table, (byTable.get(r.table) ?? new Set()).add(id));
  const removed: Record<string, number> = {};
  await pool.begin(async (tx) => {
    await tx.unsafe("SET LOCAL mizan.ledger_maintenance = 'on'");
    for (const [t, ids] of byTable) {
      const list = [...ids];
      let n = 0;
      for (let i = 0; i < list.length; i += 5000) n += (await tx.unsafe(`DELETE FROM "${t}" WHERE id::text = ANY($1::text[])`, [list.slice(i, i + 5000)])).count;
      removed[t] = n;
    }
  });
  return removed;
}
