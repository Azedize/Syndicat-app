/**
 * Audit (read only) of the calls for funds stored as « overdue » although
 * something has been paid on them (2026-10-25).
 *
 *   node --env-file=../.env --import=tsx src/audits/overdue-partial-audit.ts [--plan <file.json>]
 *
 * Runs inside a READ ONLY transaction: PostgreSQL refuses any write.
 * For each call it re-derives, from the ledger of payments, the status the
 * API would compute (lib/treasury.ts settlementStatus, plus « pending
 * validation » when a declared payment awaits review) and checks:
 *   - stored amount_paid  = sum of VALIDATED payments (pending, rejected and
 *     reversed ones do not count);
 *   - every validated payment has its journal entry (same amount), not
 *     reversed;
 *   - adjustments: the current amount is the last adjusted amount;
 *   - the due date has passed.
 * A call is a « confirmed » correction candidate only when every check holds
 * and the derived status differs from the stored one. Anything else is
 * reported in its category and left alone.
 *
 * The plan file holds only technical ids, before/after statuses and amounts
 * in cents (no names, no e-mails), plus a checksum of the evidence.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";

const planArg = process.argv.indexOf("--plan");
const planFile = planArg > 0 ? process.argv[planArg + 1] : null;
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

async function main() {
  const report = await (pool as any).begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx: any) => {
    const [{ d, today }] = await tx`SELECT current_database() AS d, to_char(now() AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD') AS today`;
    const rows = await tx`
      SELECT a.id, a.status, a.amount, a.amount_paid, a.original_amount, a.due_date, a.building_id,
        s.creation_key IS NOT NULL AS generated,
        COALESCE((SELECT SUM(p.amount) FROM appel_payments p WHERE p.appel_id = a.id AND p.status = 'validated'), 0) AS validated_sum,
        (SELECT count(*)::int FROM appel_payments p WHERE p.appel_id = a.id AND p.status = 'validated') AS validated_n,
        (SELECT count(*)::int FROM appel_payments p WHERE p.appel_id = a.id AND p.status = 'pending') AS pending_n,
        (SELECT count(*)::int FROM appel_payments p WHERE p.appel_id = a.id AND p.status = 'rejected') AS rejected_n,
        (SELECT count(*)::int FROM appel_payments p WHERE p.appel_id = a.id AND p.status = 'reversed') AS reversed_n,
        (SELECT count(*)::int FROM appel_payments p
           LEFT JOIN ledger_entries l ON l.id = p.ledger_entry_id
           WHERE p.appel_id = a.id AND p.status = 'validated'
             AND (l.id IS NULL OR l.amount <> p.amount OR l.source_type <> 'appel_payment' OR l.source_id <> p.id
                  OR EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = l.id))) AS ledger_bad,
        (SELECT x.new_amount FROM appel_adjustments x WHERE x.appel_id = a.id ORDER BY x.created_at DESC LIMIT 1) AS last_adjusted
      FROM appels_de_fonds a
      JOIN buildings b ON b.id = a.building_id
      JOIN syndicates s ON s.id = b.syndicate_id
      WHERE a.status = 'overdue' AND a.amount_paid > 0
      ORDER BY a.id`;
    const categories: Record<string, number> = {};
    const bump = (k: string) => (categories[k] = (categories[k] ?? 0) + 1);
    const confirmed: { id: string; before: string; after: string; amountCents: number; paidCents: number; dueDate: string }[] = [];
    for (const r of rows) {
      const amount = cents(r.amount);
      const paid = cents(r.amount_paid);
      const validated = cents(r.validated_sum);
      const problems: string[] = [];
      if (paid !== validated) problems.push("montant payé ≠ paiements validés");
      if (r.ledger_bad > 0) problems.push("paiement validé sans écriture conforme");
      if (r.last_adjusted !== null && cents(r.last_adjusted) !== amount) problems.push("montant ≠ dernier ajustement");
      if (!r.due_date || r.due_date >= today) problems.push("échéance non passée");
      if (paid >= amount) problems.push("entièrement payé");
      if (problems.length) {
        for (const p of problems) bump(`anomalie : ${p}`);
        continue;
      }
      const derived = r.pending_n > 0 ? "pending_validation" : "partially_paid";
      if (derived === r.status) { bump("déjà cohérent"); continue; }
      bump(r.pending_n > 0 ? "confirmé → en validation (paiement déclaré en attente)" : "confirmé → partiellement payé");
      confirmed.push({ id: r.id, before: r.status, after: derived, amountCents: amount, paidCents: paid, dueDate: r.due_date });
    }
    const origin = { generated: rows.filter((r: any) => r.generated).length, other: rows.filter((r: any) => !r.generated).length };
    const withRejected = rows.filter((r: any) => r.rejected_n > 0).length;
    const withReversed = rows.filter((r: any) => r.reversed_n > 0).length;
    return { database: d, today, total: rows.length, origin, withRejected, withReversed, categories, confirmed };
  });

  const { confirmed, ...summary } = report;
  console.log(JSON.stringify({ ...summary, confirmedCount: confirmed.length }, null, 1));
  if (planFile) {
    const evidence = createHash("sha256").update(JSON.stringify(confirmed)).digest("hex");
    mkdirSync(path.dirname(planFile), { recursive: true });
    writeFileSync(planFile, JSON.stringify({ createdAt: new Date().toISOString(), database: report.database, rule: "lib/treasury.ts settlementStatus + pending declared payment ⇒ pending_validation", count: confirmed.length, evidenceSha256: evidence, rows: confirmed }, null, 1));
    console.log(`Plan : ${planFile} (${confirmed.length} lignes, empreinte ${evidence.slice(0, 16)}…)`);
  }
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
