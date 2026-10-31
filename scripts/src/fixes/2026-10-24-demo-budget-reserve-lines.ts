/**
 * Data fix (2026-10-24) — the two demonstration budgets of seed.ts counted the
 * reserve fund twice: once in budgets.fonds_reserve and once as a budget line
 * of category « reserves » (bl_4 on budget_atlas_2026, bl_7 on
 * budget_agdal_2026). The rule used by the execution report, the calls for
 * funds and the allocation is « lines = charges, total = charges + reserve ».
 *
 * Only those two lines are removed, inside one transaction, after every
 * precondition is checked (ids, origin, amounts to the cent, no reference).
 * The removed rows are written to the given backup directory first. If any
 * check fails, nothing is changed. Running it again does nothing.
 *
 *   node --env-file=../.env --import=tsx src/fixes/2026-10-24-demo-budget-reserve-lines.ts <backupDir> [--apply]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";

const TARGETS = [
  { budget: "budget_atlas_2026", line: "bl_4", creator: "user_admin_atlas" },
  { budget: "budget_agdal_2026", line: "bl_7", creator: "user_admin_agdal" },
];
const cents = (v: unknown) => Math.round(Number(v) * 100);
const [backupDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");

async function main() {
  if (!backupDir) throw new Error("Usage: <backupDir> [--apply]");
  const [{ d }] = await (pool as any).unsafe("SELECT current_database() AS d");
  console.log(`Base : ${d}`);
  await (pool as any).begin(async (tx: any) => {
    const removed: unknown[] = [];
    for (const t of TARGETS) {
      const [b] = await tx`SELECT b.*, s.creation_key FROM budgets b JOIN buildings bu ON bu.id = b.building_id JOIN syndicates s ON s.id = bu.syndicate_id WHERE b.id = ${t.budget} FOR UPDATE OF b`;
      if (!b) { console.log(`${t.budget} : absent — rien à faire`); continue; }
      const lines = await tx`SELECT * FROM budget_lines WHERE budget_id = ${t.budget} ORDER BY id`;
      const reserveLine = lines.find((l: any) => l.id === t.line);
      if (!reserveLine) { console.log(`${t.budget} : ligne ${t.line} déjà retirée — rien à faire`); continue; }
      const others = lines.filter((l: any) => l.id !== t.line);
      const problems: string[] = [];
      if (b.creation_key) problems.push("budget issu du générateur, pas du jeu de démonstration");
      if (b.created_by !== t.creator) problems.push(`créateur inattendu ${b.created_by}`);
      if (reserveLine.category !== "reserves") problems.push(`catégorie de ${t.line} = ${reserveLine.category}`);
      if (cents(reserveLine.amount_annual) !== cents(b.fonds_reserve)) problems.push("la ligne ne correspond pas au fonds de réserve");
      if (others.reduce((s: number, l: any) => s + cents(l.amount_annual), 0) !== cents(b.charges_amount)) problems.push("les autres lignes ne totalisent pas les charges");
      if (cents(b.total_amount) !== cents(b.charges_amount) + cents(b.fonds_reserve)) problems.push("total ≠ charges + réserve");
      const refs = await tx.unsafe(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('budget_line_id','line_id','source_id')`,
      );
      for (const r of refs) {
        const [{ n }] = await tx.unsafe(`SELECT count(*)::int AS n FROM "${r.table_name}" WHERE "${r.column_name}"::text = $1`, [t.line]);
        if (n) problems.push(`${t.line} référencée par ${r.table_name}.${r.column_name}`);
      }
      if (problems.length) throw new Error(`${t.budget} : correction refusée — ${problems.join(" ; ")}`);
      console.log(`${t.budget} : charges ${b.charges_amount} = Σ autres lignes ; réserve ${b.fonds_reserve} ; total ${b.total_amount} ✓ — ligne ${t.line} (${reserveLine.label}, ${reserveLine.amount_annual}) en double`);
      removed.push(reserveLine);
    }
    if (!removed.length) return;
    writeFileSync(path.join(backupDir, "budget_lines-removed-2026-10-24.json"), JSON.stringify(removed, null, 2));
    if (!apply) throw Object.assign(new Error("Simulation : relancez avec --apply pour corriger."), { dry: true });
    await tx`DELETE FROM budget_lines WHERE id IN ${tx(removed.map((l: any) => l.id))}`;
    // Post-condition, inside the transaction: lines = charges for both budgets.
    for (const t of TARGETS) {
      const [r] = await tx`SELECT b.charges_amount, COALESCE(SUM(l.amount_annual), 0) AS s FROM budgets b LEFT JOIN budget_lines l ON l.budget_id = b.id WHERE b.id = ${t.budget} GROUP BY b.id`;
      if (r && cents(r.s) !== cents(r.charges_amount)) throw new Error(`${t.budget} : contrôle final en échec`);
    }
    console.log(`Corrigé : ${removed.length} ligne(s) retirée(s) ; copie dans ${backupDir}`);
  }).catch((e: any) => {
    if (e?.dry) console.log(e.message);
    else throw e;
  });
  await pool.end();
}

main().catch(async (e) => {
  console.error(e.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
