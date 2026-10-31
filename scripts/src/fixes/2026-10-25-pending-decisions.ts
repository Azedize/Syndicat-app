/**
 * Corrections awaiting a decision (2026-10-25) — prepared, NOT run on the
 * working base without explicit authorisation.
 *
 *   node --env-file=../.env --import=tsx src/fixes/2026-10-25-pending-decisions.ts <op> [--apply] [--plan file] [--out dir]
 *   node --env-file=../.env --import=tsx src/fixes/2026-10-25-pending-decisions.ts rollback <rollback.json> [--apply]
 *
 * Operations
 *   overdue-partial   calls stored « overdue » although part is paid and
 *                     validated → « partially_paid » (or « pending_validation »
 *                     when a declared payment awaits review), exactly the rows
 *                     of the audit plan (--plan), each re-verified.
 *   redact-secrets    email_logs bodies holding a one-time secret (codes,
 *                     reset links, temporary passwords, invitations) → body
 *                     emptied; the row (who, when, status) is kept.
 *   fixture-logs      demonstration rows email_1…email_7 written « sent » /
 *                     « failed » / « pending » by the old seed, never
 *                     transmitted → « skipped » with the reason.
 *
 * Without --apply nothing is written (the transaction is rolled back). With
 * --apply: one transaction, rows locked, every row re-checked, the number of
 * changed rows must equal the plan, a rollback file is written first (no
 * secret in it: redacted bodies cannot be put back from here — the
 * pre-change backup holds them).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";

const args = process.argv.slice(2);
const op = args[0];
const apply = args.includes("--apply");
const opt = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const outDir = opt("out") ?? ".seedgen/plans";
const SECRET_TEMPLATES = ["password_reset", "otp", "email_change", "welcome", "team_invitation"];
const FIXTURES = ["email_1", "email_2", "email_3", "email_4", "email_5", "email_6", "email_7"];
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const DRY = Symbol("dry-run");

async function run<T>(fn: (tx: any) => Promise<T>) {
  try {
    return await (pool as any).begin(async (tx: any) => {
      const r = await fn(tx);
      if (!apply) throw Object.assign(new Error("dry"), { [DRY]: r });
      return r;
    });
  } catch (e: any) {
    if (e?.[DRY] !== undefined) return e[DRY] as T;
    throw e;
  }
}

function writeRollback(name: string, payload: unknown) {
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}-rollback-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 1));
  return file;
}

async function main() {
  const [{ d }] = await (pool as any).unsafe("SELECT current_database() AS d");
  console.log(`Base : ${d} · ${apply ? "EXÉCUTION" : "simulation (rien n'est écrit)"}`);

  if (op === "overdue-partial") {
    const planFile = opt("plan");
    if (!planFile) throw new Error("--plan <fichier du plan d'audit> requis");
    const plan = JSON.parse(readFileSync(planFile, "utf8")) as { database: string; count: number; rows: { id: string; before: string; after: string; amountCents: number; paidCents: number }[] };
    if (plan.database !== "syndycat_global_cps" && plan.database !== d) throw new Error(`plan établi sur ${plan.database}, base actuelle ${d}`);
    const result = await run(async (tx) => {
      const ids = plan.rows.map((r) => r.id);
      const rows = await tx`SELECT a.id, a.status, a.amount, a.amount_paid, a.due_date,
          COALESCE((SELECT SUM(p.amount) FROM appel_payments p WHERE p.appel_id = a.id AND p.status = 'validated'), 0) AS validated,
          (SELECT count(*)::int FROM appel_payments p WHERE p.appel_id = a.id AND p.status = 'pending') AS pending
        FROM appels_de_fonds a WHERE a.id IN ${tx(ids)} FOR UPDATE OF a`;
      const byId = new Map(rows.map((r: any) => [r.id, r]));
      const changes: { id: string; before: string; after: string }[] = [];
      const refused: string[] = [];
      for (const p of plan.rows) {
        const r: any = byId.get(p.id);
        const expected = r && r.pending > 0 ? "pending_validation" : "partially_paid";
        const ok = r && r.status === p.before && cents(r.amount) === p.amountCents && cents(r.amount_paid) === p.paidCents
          && cents(r.validated) === p.paidCents && p.paidCents > 0 && p.paidCents < p.amountCents && expected === p.after;
        if (!ok) { refused.push(p.id); continue; }
        changes.push({ id: p.id, before: p.before, after: p.after });
      }
      if (refused.length) throw new Error(`${refused.length} ligne(s) ne correspondent plus au plan (ex. ${refused.slice(0, 3).join(", ")}) : rien n'est modifié.`);
      let rollback: string | null = null;
      if (apply) rollback = writeRollback("overdue-partial", { database: d, table: "appels_de_fonds", column: "status", rows: changes.map((c) => ({ id: c.id, restore: c.before, expectCurrent: c.after })) });
      let updated = 0;
      for (const after of ["partially_paid", "pending_validation"]) {
        const group = changes.filter((c) => c.after === after).map((c) => c.id);
        if (group.length) updated += (await tx`UPDATE appels_de_fonds SET status = ${after} WHERE id IN ${tx(group)} AND status = 'overdue' RETURNING id`).length;
      }
      if (updated !== plan.count) throw new Error(`${updated} ligne(s) modifiées pour ${plan.count} attendues : annulé.`);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM appels_de_fonds WHERE status = 'overdue' AND amount_paid > 0`;
      return { planned: plan.count, updated, remainingOverdueWithPayment: n, rollback };
    });
    console.log(result);
  } else if (op === "redact-secrets") {
    const result = await run(async (tx) => {
      const rows = await tx`SELECT id, template, status FROM email_logs WHERE template IN ${tx(SECRET_TEMPLATES)} AND body_html IS NOT NULL ORDER BY created_at FOR UPDATE`;
      let rollback: string | null = null;
      if (apply) rollback = writeRollback("redact-secrets", { database: d, note: "Les corps expurgés ne sont pas copiés ici (secrets). Ils restent dans la sauvegarde prise avant l'opération.", rows: rows.map((r: any) => ({ id: r.id, template: r.template, status: r.status })) });
      const done = rows.length ? (await tx`UPDATE email_logs SET body_html = NULL WHERE id IN ${tx(rows.map((r: any) => r.id))} AND body_html IS NOT NULL RETURNING id`).length : 0;
      if (done !== rows.length) throw new Error("nombre de lignes inattendu : annulé");
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM email_logs WHERE template IN ${tx(SECRET_TEMPLATES)} AND body_html IS NOT NULL`;
      return { found: rows.length, redacted: done, remaining: n, byTemplate: rows.reduce((m: any, r: any) => ((m[r.template] = (m[r.template] ?? 0) + 1), m), {}), rollback };
    });
    console.log(result);
  } else if (op === "fixture-logs") {
    const reason = "Journal de démonstration (seed) : jamais transmis à un fournisseur.";
    const result = await run(async (tx) => {
      // A fixture: written by the seed (id email_N), sent_at equal to created_at
      // or never set, no provider proof.
      const rows = await tx`SELECT id, status, error_message, sent_at, created_at FROM email_logs
        WHERE id IN ${tx(FIXTURES)} AND status <> 'skipped' AND provider_message_id IS NULL
          AND (sent_at IS NULL OR sent_at = created_at) FOR UPDATE`;
      let rollback: string | null = null;
      if (apply) rollback = writeRollback("fixture-logs", { database: d, table: "email_logs", rows: rows.map((r: any) => ({ id: r.id, status: r.status, error_message: r.error_message, sent_at: r.sent_at })) });
      const done = rows.length ? (await tx`UPDATE email_logs SET status = 'skipped', error_message = ${reason}, sent_at = NULL WHERE id IN ${tx(rows.map((r: any) => r.id))} RETURNING id`).length : 0;
      if (done !== rows.length) throw new Error("nombre de lignes inattendu : annulé");
      return { found: rows.length, changed: done, before: rows.map((r: any) => `${r.id}:${r.status}`), rollback };
    });
    console.log(result);
  } else if (op === "rollback") {
    const file = args[1];
    const rb = JSON.parse(readFileSync(file, "utf8"));
    const result = await run(async (tx) => {
      if (rb.table === "appels_de_fonds") {
        let n = 0;
        for (const r of rb.rows) n += (await tx`UPDATE appels_de_fonds SET status = ${r.restore} WHERE id = ${r.id} AND status = ${r.expectCurrent} RETURNING id`).length;
        if (n !== rb.rows.length) throw new Error(`${n}/${rb.rows.length} lignes dans l'état attendu : annulé`);
        return { restored: n };
      }
      if (rb.table === "email_logs") {
        let n = 0;
        for (const r of rb.rows) n += (await tx`UPDATE email_logs SET status = ${r.status}, error_message = ${r.error_message}, sent_at = ${r.sent_at} WHERE id = ${r.id} AND status = 'skipped' RETURNING id`).length;
        if (n !== rb.rows.length) throw new Error(`${n}/${rb.rows.length} lignes dans l'état attendu : annulé`);
        return { restored: n };
      }
      throw new Error("retour arrière impossible depuis ce fichier (corps expurgés : restaurer depuis la sauvegarde)");
    });
    console.log(result);
  } else {
    console.log("Opérations : overdue-partial --plan <f> | redact-secrets | fixture-logs | rollback <f>  [--apply]");
  }
  await pool.end();
}

main().catch(async (e) => { console.error((e as Error).message); await pool.end().catch(() => {}); process.exit(1); });
