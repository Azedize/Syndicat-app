/**
 * seedgen — discovery, generation, verification and cleanup of test data.
 *
 *   pnpm --filter @workspace/scripts run seedgen -- <command> [--seed N] [--scale X]
 *
 *   inspect     environment, databases, volumes generated / not generated
 *               (read only)
 *   inventory   discover every table and write docs/database/DATABASE_TABLES_INVENTORY.md
 *   plan        strategy and volumes per table (docs/database/DATABASE_SEEDING_PLAN.md)
 *   reference   check the reference data the generator relies on (plans)
 *   generate    generate a run (refused if this seed already exists)
 *   verify      integrity checks on the whole database
 *   report      volumes before/after + checks → docs/database/DATABASE_SEEDING_REPORT.md
 *   cleanup     remove ONLY the data of the run of --seed
 *   backup      pg_dump of the database + copy of the generated files
 *   reset       remove EVERY generator run (all seeds) after a backup;
 *               --dry-run lists what would be removed and changes nothing
 *   files-check every generated file exists, has its size and decodes
 *   scenarios   add edge cases to the run of --seed: a residence without
 *               documents, syndics without a residence (additive, idempotent)
 *   marketplace add the large marketplace catalogue to the run of --seed
 *               (additive, idempotent: ids mkt-s<seed>-NNNN)
 *   run         the whole procedure: environment -> migrations -> backup ->
 *               reset -> generate (data + documents) -> checks -> report
 *               (--dry-run: steps 1, 2 and the reset plan only)
 *
 * Options: --seed (default 20261019), --scale (default 1 ≈ 1 000 users,
 * 60 condominiums), --syndicates (override the number of condominiums).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db, pool } from "@workspace/db";
import { apiLib } from "../api-lib.js";
import { allRunsRoots, cleanupRun, planRemoval, predicates, removeSet } from "./cleanup.js";
import { backupDatabase } from "./backup.js";
import { findResidues, knownSeeds, removeResidues, type Residue } from "./residues.js";
import { checkFiles, fileCheckOk, type FileCheckReport } from "./filecheck.js";
import { fileStats } from "./documents.js";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { EMAIL_ROOT, Generator, runDomain, TEST_PASSWORD } from "./generate.js";
import { assertDevDatabase, assertUploadsDirFor } from "./guard.js";
import { UPLOADS_DIR } from "./files.js";
import { dependencyOrder, introspect, type TableInfo } from "./introspect.js";
import { PLAN, planFor } from "./plan.js";
import { verifyDatabase, type CheckResult } from "./verify.js";
import { seedMarketplace } from "./marketplace.js";
import { seedScenarios } from "./scenarios.js";
import { extrasPhase, type ExtrasEnv } from "./extras.js";
import { Rng } from "./rng.js";

const ROOT = path.resolve(process.cwd(), "..");
const STATE_DIR = path.resolve(process.cwd(), ".seedgen");
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith("--")) ?? "help";
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const seed = Number(opt("seed", "20261019"));
const scale = Number(opt("scale", "1"));
const runKey = `seedgen:s${seed}`;
const log = (m: string) => console.log(m);
const manifestPath = () => path.join(STATE_DIR, `run-s${seed}.json`);
const dryRun = args.includes("--dry-run");
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

async function main() {
  const target = assertDevDatabase();
  if (["generate", "run", "marketplace", "scenarios", "reset", "cleanup"].includes(cmd)) assertUploadsDirFor(target.database, UPLOADS_DIR);
  log(`Base : ${target.database} @ ${target.host} (développement local)`);
  const tables = await introspect();
  log(`${tables.length} tables découvertes dans le schéma public`);
  switch (cmd) {
    case "inspect": {
      // Read only: where we are, and what belongs to the generator or not.
      const q = (text: string, params: unknown[] = []) => pool.unsafe(text, params as any[]) as unknown as Promise<any[]>;
      const [srv] = await q(`SELECT version() AS v, current_database() AS db`);
      const dbs = (await q(`SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1`)).map((r) => r.datname);
      log(`Serveur : ${String(srv.v).split(" on ")[0]} · base ${srv.db} · bases du serveur : ${dbs.join(", ")}`);
      const [m] = await q(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
      log(`Migrations appliquées : ${m.n}`);
      const [u] = await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE email LIKE '%.' || $1)::int AS gen FROM users`, [EMAIL_ROOT]);
      const [s] = await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE creation_key LIKE 'seedgen:%')::int AS gen FROM syndicates`);
      log(`Comptes : ${u.total} (générés ${u.gen}, autres ${u.total - u.gen}) · copropriétés : ${s.total} (générées ${s.gen}, autres ${s.total - s.gen})`);
      for (const r of await q(`SELECT split_part(creation_key, ':', 2) AS run, count(*)::int AS n FROM syndicates WHERE creation_key LIKE 'seedgen:%' GROUP BY 1 ORDER BY 1`)) log(`  lancement ${r.run} : ${r.n} copropriétés`);
      const preds = predicates(tables, allRunsRoots(EMAIL_ROOT));
      const plan = await planRemoval(tables, preds);
      const genRows = [...plan.rows.values()].reduce((a, b) => a + b, 0);
      const allRows = tables.reduce((a, t) => a + Number(t.rows ?? 0), 0);
      log(`Lignes rattachées au générateur : ${genRows} sur ~${allRows} (estimation PostgreSQL) · fichiers générés : ${plan.files.length}`);
      log("Rien n'a été modifié.");
      break;
    }
    case "marketplace":
      await seedMarketplace(seed, log, { listings: Number(opt("listings", "200")) });
      break;
    case "scenarios":
      await seedScenarios(seed, log);
      break;
    case "inventory":
      writeFileSync(path.join(ROOT, "docs/database/DATABASE_TABLES_INVENTORY.md"), inventoryMd(tables));
      log("→ DATABASE_TABLES_INVENTORY.md");
      break;
    case "plan":
      writeFileSync(path.join(ROOT, "docs/database/DATABASE_SEEDING_PLAN.md"), planMd(tables));
      log("→ DATABASE_SEEDING_PLAN.md");
      break;
    case "reference": {
      const plans = await pool`SELECT id, name, price FROM subscription_plans WHERE is_active IS DISTINCT FROM false`;
      log(`Plans d'abonnement actifs : ${plans.length} (${plans.map((p: any) => p.name).join(", ")})`);
      if (!plans.length) throw new Error("Aucun plan d'abonnement : lancez d'abord le seed de référence (pnpm db:seed).");
      break;
    }
    case "generate":
      await generate(tables);
      break;
    case "verify": {
      const checks = await verifyDatabase(tables);
      printChecks(checks);
      if (checks.some((c) => !c.ok)) process.exitCode = 1;
      break;
    }
    case "report": {
      const checks = await verifyDatabase(tables);
      const files = await checkFiles(predicates(tables, allRunsRoots(EMAIL_ROOT)));
      writeFileSync(path.join(ROOT, "docs/database/DATABASE_SEEDING_REPORT.md"), reportMd(tables, checks, files));
      printChecks(checks);
      log("→ DATABASE_SEEDING_REPORT.md");
      break;
    }
    case "cleanup": {
      log(`Suppression des données du lancement ${runKey} uniquement :`);
      const removed = await cleanupRun(tables, runKey, runDomain(seed), log);
      log(`Terminé : ${[...removed.values()].reduce((s, n) => s + n, 0)} lignes / fichiers supprimés.`);
      break;
    }
    case "backup": {
      const plan = await planRemoval(tables, predicates(tables, allRunsRoots(EMAIL_ROOT)));
      const bk = backupDatabase(STATE_DIR, target.database, plan.files, Object.fromEntries(plan.rows));
      log(`Sauvegarde : ${bk.dumpFile} (${(bk.dumpBytes / 1e6).toFixed(1)} Mo), ${bk.files} fichiers copiés`);
      break;
    }
    case "reset":
      await reset(tables, target.database);
      break;
    case "files-check": {
      const r = await checkFiles(predicates(tables, allRunsRoots(EMAIL_ROOT)));
      printFileCheck(r);
      if (!fileCheckOk(r)) process.exitCode = 1;
      break;
    }
    case "run":
      await runAll(tables, target.database);
      break;
    default:
      log("Commandes : inspect | inventory | marketplace | scenarios | plan | reference | generate | verify | report | cleanup | backup | reset | files-check | run  (--seed N --scale X --dry-run)");
  }
}

async function generate(tables: TableInfo[]) {
  const existing = await pool`SELECT COUNT(*)::int AS n FROM syndicates WHERE creation_key LIKE ${runKey + ":%"}`;
  if (existing[0].n > 0) {
    throw new Error(`Le lancement ${runKey} existe déjà (${existing[0].n} copropriétés). Rien n'est recréé : utilisez une autre --seed, ou « cleanup --seed ${seed} » d'abord.`);
  }
  const plans = (await pool`SELECT id, name, price FROM subscription_plans WHERE is_active IS DISTINCT FROM false ORDER BY sort_order NULLS LAST, name`) as unknown as { id: string; name: string; price: string | null }[];
  if (!plans.length) throw new Error("Aucun plan d'abonnement : lancez d'abord pnpm db:seed (données de référence).");
  const order = dependencyOrder(tables).order;
  const before = Object.fromEntries(tables.map((t) => [t.name, t.rows]));
  const now = new Date();
  const companies = opt("companies", "") ? Number(opt("companies", "")) : undefined;
  const g = new Generator({ seed, scale, companies, runKey, order, now, log });
  // own random stream: the earlier phases (and the test accounts) stay the same for a seed
  const extras: ExtrasEnv = { rng: new Rng((seed * 31 + 7) >>> 0), now, order, counts: g.counts, usersDone: new Set() };
  const nSyndicates = Number(opt("syndicates", String(Math.max(2, Math.round(60 * scale)))));
  const started = Date.now();
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(manifestPath(), JSON.stringify({ runKey, seed, scale, startedAt: new Date().toISOString(), before, status: "running" }, null, 1));

  // engine of the project (same code as the generate-appels route)
  const { loadSources, computeAllocation } = await apiLib("lib/allocation.ts");
  const { finalizeAllocation } = await apiLib("lib/allocation-store.ts");

  try {
    const { orgs } = await pool.begin((tx) => g.global(tx, plans));
    const adminPools = new Map<string, any[]>();
    for (let i = 0; i < nSyndicates; i++) {
      const t0 = Date.now();
      const orgId = orgs[i % orgs.length];
      const pool_ = adminPools.get(orgId) ?? [];
      adminPools.set(orgId, pool_);
      const c = await pool.begin(async (tx) => {
        const ctx = await g.structure(tx, i, orgId, plans, pool_);
        await g.activity(tx, ctx);
        return ctx;
      });
      // calls for funds through the allocation engine, quarter by quarter
      const year = new Date().getUTCFullYear();
      const quarters = [`${year - 1}-Q4`, `${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`];
      let issued = 0;
      for (const bud of c.budgets) {
        for (const period of quarters.filter((q) => Number(q.slice(0, 4)) === bud.year)) {
          const { sources, errors } = await loadSources(c.sid, bud.buildingId, period, [{ type: "budget_total", budgetId: bud.id, part: "charges" }], { implicitTantiemes: true });
          const computation = await computeAllocation(bud.buildingId, period, sources, errors);
          if (!computation.valid) throw new Error(`Répartition ${period} invalide : ${computation.errors[0]?.code} ${computation.errors[0]?.message}`);
          const qn = Number(period.slice(-1));
          const issueDate = `${period.slice(0, 4)}-${String((qn - 1) * 3 + 1).padStart(2, "0")}-01`;
          const due = new Date(`${issueDate}T00:00:00Z`);
          due.setUTCDate(due.getUTCDate() + 30);
          const out: { appels: unknown[] } = await db.transaction((tx: any) =>
            finalizeAllocation(tx, { syndicateId: c.sid, buildingId: bud.buildingId, period, chargeType: "charges_courantes", computation, userId: c.admin.id, issueDate, dueDate: due.toISOString().slice(0, 10) }),
          );
          issued += out.appels.length;
        }
      }
      await pool.begin(async (tx) => g.payments(tx, c));
      await pool.begin(async (tx) => g.documents(tx, c));
      await extrasPhase(extras, c);
      log(`[${i + 1}/${nSyndicates}] ${c.name} — ${c.buildings.length} imm., ${c.lots.length} lots, ${c.allUsers.length} comptes, ${issued} appels — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  } catch (err) {
    log(`ÉCHEC : ${(err as Error).message}`);
    log("Annulation du lancement pour ne laisser aucune donnée partielle…");
    await cleanupRun(await introspect(), runKey, runDomain(seed), () => {});
    writeFileSync(manifestPath(), JSON.stringify({ runKey, seed, scale, status: "rolled_back", error: (err as Error).message }, null, 1));
    throw err;
  }
  const after = await introspect();
  const afterCounts = Object.fromEntries(after.map((t) => [t.name, t.rows]));
  writeFileSync(manifestPath(), JSON.stringify({ runKey, seed, scale, startedAt: new Date(started).toISOString(), durationSeconds: Math.round((Date.now() - started) / 1000), before, after: afterCounts, generated: Object.fromEntries(g.counts), emailDomain: runDomain(seed), status: "done" }, null, 1));
  log(`Terminé en ${Math.round((Date.now() - started) / 1000)} s. Mot de passe des comptes de test : voir DATABASE_SEEDING_GUIDE.md`);
}

/** Removes every generator run after a backup; --dry-run only reports. */
async function reset(tables: TableInfo[], database: string): Promise<Record<string, number>> {
  const preds = predicates(tables, allRunsRoots(EMAIL_ROOT));
  const plan = await planRemoval(tables, preds);
  const total = [...plan.rows.values()].reduce((a, b) => a + b, 0);
  const kept = (await pool.unsafe(`SELECT (SELECT COUNT(*) FROM syndicates WHERE NOT COALESCE(${preds.get("syndicates")}, false))::int AS syndicates, (SELECT COUNT(*) FROM users WHERE NOT COALESCE(${preds.get("users")}, false))::int AS users`)) as unknown as { syndicates: number; users: number }[];
  log(`${dryRun ? "[dry-run] " : ""}Données des lancements du générateur : ${total} lignes dans ${plan.rows.size} tables, ${plan.files.length} fichiers.`);
  for (const [t, n] of plan.rows) log(`  ${t}: ${n}`);
  log(`Conservé (hors générateur) : ${kept[0].syndicates} copropriété(s), ${kept[0].users} compte(s) — données de démonstration et comptes non générés.`);
  log("Recherche des résidus d'anciens lancements (références sans clé étrangère)…");
  const residues = await findResidues(tables, await knownSeeds(STATE_DIR));
  const proven = residues.reduce((a, r) => a + r.proven, 0);
  for (const r of residues) log(`  ${r.table}.${r.column} : ${r.dangling} orphelines, ${r.proven} issues du générateur (prouvé)${r.dangling > r.proven ? `, ${r.dangling - r.proven} conservées (origine non prouvée)` : ""}`);
  mkdirSync(STATE_DIR, { recursive: true });
  if (dryRun) {
    writeFileSync(path.join(STATE_DIR, `reset-plan-${stamp()}.json`), JSON.stringify({ dryRun: true, rows: Object.fromEntries(plan.rows), files: plan.files.length, kept: kept[0], residues: residues.map(({ ids, ...r }) => r) }, null, 1));
    log("Aucune modification (dry-run).");
    return Object.fromEntries(plan.rows);
  }
  if (!total && !plan.files.length && !proven) {
    log("Rien à supprimer.");
    return {};
  }
  const bk = backupDatabase(STATE_DIR, database, plan.files, Object.fromEntries(plan.rows));
  log(`Sauvegarde : ${bk.dumpFile} (${(bk.dumpBytes / 1e6).toFixed(1)} Mo), ${bk.files} fichiers copiés`);
  const removed = await removeSet(tables, preds, () => {});
  const residueRemoved = proven ? await removeResidues(residues) : {};
  for (const [t, n] of Object.entries(residueRemoved)) removed.set(`${t} (résidus)`, n);
  const left = await planRemoval(await introspect(), preds);
  const leftRows = [...left.rows.values()].reduce((a, b) => a + b, 0);
  const report = { at: new Date().toISOString(), backup: bk.dir, removed: Object.fromEntries(removed), remaining: leftRows, kept: kept[0], residues: residues.map(({ ids, ...r }) => r) };
  writeFileSync(path.join(STATE_DIR, `reset-${stamp()}.json`), JSON.stringify(report, null, 1));
  for (const f of readdirSync(STATE_DIR).filter((f) => /^run-s\d+\.json$/.test(f))) {
    const m = JSON.parse(readFileSync(path.join(STATE_DIR, f), "utf8"));
    writeFileSync(path.join(STATE_DIR, f), JSON.stringify({ ...m, status: "removed", removedAt: report.at }, null, 1));
  }
  log(`Supprimé : ${[...removed.entries()].filter(([k]) => k !== "(fichiers)").reduce((a, [, n]) => a + n, 0)} lignes, ${removed.get("(fichiers)") ?? 0} fichiers. Restant du générateur : ${leftRows}.`);
  if (leftRows) throw new Error(`${leftRows} lignes du générateur restent après la suppression.`);
  return Object.fromEntries(removed);
}

/** Pending migrations (journal of lib/db vs drizzle.__drizzle_migrations). */
async function pendingMigrations(): Promise<number> {
  const journal = JSON.parse(readFileSync(path.join(ROOT, "lib/db/drizzle/meta/_journal.json"), "utf8")) as { entries: unknown[] };
  const [r] = (await pool.unsafe(`SELECT COUNT(*)::int AS n FROM drizzle.__drizzle_migrations`).catch(() => [{ n: 0 }])) as unknown as { n: number }[];
  return Math.max(0, journal.entries.length - r.n);
}

async function runAll(tables: TableInfo[], database: string) {
  const t0 = Date.now();
  const steps: { step: string; result: string }[] = [];
  const step = (name: string, result: string) => {
    steps.push({ step: name, result });
    log(`\n■ ${name} — ${result}`);
  };
  // 1. environment and connection
  const [conn] = (await pool.unsafe(`SELECT current_database() AS db, version() AS v`)) as unknown as { db: string; v: string }[];
  step("1. Environnement", `${conn.db} (base locale de développement), ${conn.v.split(",")[0]}`);
  // 2. migrations
  const pending = await pendingMigrations();
  if (pending && !dryRun) {
    const res = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
    if (res.status !== 0) throw new Error("Échec de l'application des migrations.");
    step("2. Migrations", `${pending} migration(s) appliquée(s)`);
  } else step("2. Migrations", pending ? `${pending} en attente (non appliquées en dry-run)` : "aucune migration en attente");
  // 3-4. backup and reset of previous generated data
  const removed = await reset(tables, database);
  step("3–4. Sauvegarde et nettoyage", dryRun ? "plan affiché, rien supprimé (dry-run)" : `${Object.entries(removed).filter(([k]) => k !== "(fichiers)").reduce((a, [, n]) => a + n, 0)} lignes et ${removed["(fichiers)"] ?? 0} fichiers supprimés (sauvegarde dans .seedgen/backups)`);
  if (dryRun) {
    log(`\n[dry-run] Génération prévue : graine ${seed}, échelle ${scale} (${Math.max(2, Math.round(60 * scale))} copropriétés). Aucune donnée écrite.`);
    return;
  }
  // 5-7. data, physical documents and their metadata
  await generate(await introspect());
  step("5–7. Génération", `données + ${[...fileStats.values()].reduce((a, b) => a + b, 0)} fichiers produits par la phase documents`);
  // 8. checks
  const after = await introspect();
  const checks = await verifyDatabase(after);
  printChecks(checks);
  const files = await checkFiles(predicates(after, allRunsRoots(EMAIL_ROOT)));
  printFileCheck(files);
  step("8. Contrôles", `${checks.filter((c) => c.ok).length}/${checks.length} contrôles d'intégrité ; fichiers ${fileCheckOk(files) ? "OK" : "EN ÉCHEC"}`);
  // 9. report
  writeFileSync(path.join(ROOT, "docs/database/DATABASE_SEEDING_REPORT.md"), reportMd(after, checks, files, removed));
  writeFileSync(path.join(STATE_DIR, `pipeline-s${seed}.json`), JSON.stringify({ steps, durationSeconds: Math.round((Date.now() - t0) / 1000), fileStats: Object.fromEntries(fileStats), files }, null, 1));
  step("9. Rapport", "docs/database/DATABASE_SEEDING_REPORT.md");
}

function printFileCheck(r: FileCheckReport) {
  log(`Fichiers : ${r.stored} enregistrés — PDF ${r.pdf.ok} valides (${r.pdf.pages} pages) / ${r.pdf.bad} invalides, PNG ${r.png.ok} valides / ${r.png.bad} invalides, ${r.missing} absents, ${r.sizeMismatch} tailles différentes`);
  for (const x of r.references) if (x.refs) log(`  ${x.column}: ${x.refs} références${x.unknown ? `, ${x.unknown} SANS FICHIER` : ""}`);
  for (const f of r.failures) log(`  ÉCHEC ${f}`);
}

function printChecks(checks: CheckResult[]) {
  const failed = checks.filter((c) => !c.ok);
  for (const c of failed) log(`ÉCHEC ${c.group} — ${c.name} : ${c.found}`);
  log(`${checks.length - failed.length}/${checks.length} contrôles réussis`);
}

// ─── Markdown writers ─────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/\|/g, "\\|");

function inventoryMd(tables: TableInfo[]): string {
  const { order } = dependencyOrder(tables);
  const lines = [
    "# Inventaire des tables de la base",
    "",
    `Généré par \`seedgen inventory\` le ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC, à partir du catalogue PostgreSQL réel (schéma \`public\`). ${tables.length} tables, ${tables.reduce((s, t) => s + t.foreignKeys.length, 0)} clés étrangères, aucune dépendance circulaire.`,
    "",
    "Ordre d'insertion (parents d'abord) : " + order.join(" → "),
    "",
    "| Table | Fonction | Lignes actuelles | Prévu (génération) | Clés étrangères |",
    "|---|---|---:|---|---|",
    ...tables.map((t) => {
      const p = planFor(t.name);
      return `| \`${t.name}\` | ${esc(p.role)} | ${t.rows} | ${esc(p.volume)} | ${t.foreignKeys.map((f) => `${f.columns.join("+")}→${f.refTable}`).join(", ") || "—"} |`;
    }),
    "",
    "## Détail par table",
    "",
  ];
  for (const t of tables) {
    const p = planFor(t.name);
    lines.push(`### \`${t.name}\` — ${t.rows} ligne(s)`, "", `*${p.role}* — génération : ${p.volume}${p.note ? ` — ${p.note}` : ""}`, "");
    lines.push("| Colonne | Type | Obligatoire | Défaut |", "|---|---|---|---|");
    for (const c of t.columns) lines.push(`| \`${c.name}\`${t.primaryKey.includes(c.name) ? " (PK)" : ""} | ${c.type} | ${c.nullable ? "" : "oui"} | ${c.default ? `\`${esc(c.default.slice(0, 40))}\`` : ""} |`);
    if (t.foreignKeys.length) lines.push("", "Clés étrangères : " + t.foreignKeys.map((f) => `\`${f.columns.join(",")}\` → \`${f.refTable}(${f.refColumns.join(",")})\` (${f.onDelete})`).join(" ; "));
    const uniq = [...t.uniques.map((u) => u.definition), ...t.indexes.filter((i) => i.definition.includes("UNIQUE") && !i.name.endsWith("_pkey")).map((i) => i.definition.replace(/^.* USING btree /, "UNIQUE "))];
    if (uniq.length) lines.push("", "Unicité : " + uniq.map((u) => `\`${esc(u)}\``).join(" ; "));
    if (t.checks.length) lines.push("", "Contrôles : " + t.checks.map((c) => `\`${esc(c.definition.slice(0, 160))}\``).join(" ; "));
    const idx = t.indexes.filter((i) => !i.definition.includes("UNIQUE"));
    if (idx.length) lines.push("", "Index : " + idx.map((i) => `\`${i.name}\``).join(", "));
    if (t.triggers.length) lines.push("", "Déclencheurs : " + t.triggers.map((x) => `\`${x}\``).join(", "));
    lines.push("");
  }
  return lines.join("\n");
}

function planMd(tables: TableInfo[]): string {
  const groups = new Map<string, TableInfo[]>();
  for (const t of tables) {
    const g = planFor(t.name).group;
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  const lines = [
    "# Plan de génération des données de test",
    "",
    "Stratégie et volumes cibles par table (échelle `--scale 1`). Les volumes réels obtenus figurent dans `docs/database/DATABASE_SEEDING_REPORT.md`.",
    "",
    "## Principes",
    "",
    "- **Copropriété par copropriété** : chaque copropriété est un locataire complet et cohérent (utilisateurs, immeubles, lots, propriétaires, finances, activité). Aucune donnée n'est partagée entre copropriétés, sauf les administrateurs de syndic d'une même société (via `syndicate_memberships`).",
    "- **Règles métier du projet** : les appels de fonds sont émis par le moteur de répartition du projet (`loadSources` → `computeAllocation` → `finalizeAllocation`, comme la route `generate-appels`). Les paiements suivent la règle de validation : seuls les paiements validés comptent, avec écriture de journal et reçu ; un paiement déclaré reste « en validation ». Statuts calculés comme `settlementStatus()`.",
    "- **Ordre des dépendances** : déduit du catalogue (clés étrangères), parents d'abord ; aucune contrainte désactivée.",
    "- **Reproductible** : générateur pseudo-aléatoire initialisé par `--seed` (mêmes données pour la même graine). Identifiants UUID v4 comme `gen_random_uuid()`.",
    "- **Traçabilité** : `syndicates.creation_key = seedgen:s<seed>:<n>`, `organizations.created_by = seedgen:s<seed>`, e-mails `@s<seed>.seedgen.mizan.test`. Le nettoyage ne supprime que ce qui dépend de ces marqueurs.",
    "- **Sécurité** : écriture uniquement sur une base locale de développement (hôte local, pas de marqueur « prod », `NODE_ENV` ≠ production). Aucun e-mail, SMS, notification push ni paiement réel n'est déclenché (insertion directe, sans passer par les services d'envoi). Mot de passe de test haché avec bcrypt (coût 10, comme l'API).",
    "",
    "## Répartition des utilisateurs (≈ 1 000)",
    "",
    "| Rôle | Par copropriété | Total (60 copropriétés) |",
    "|---|---|---:|",
    "| Administrateurs de plateforme | — | 2 (+ existants) |",
    "| Administrateurs de syndic | 1 (30 % partagés entre copropriétés d'une même société) | ≈ 42 |",
    "| Président, trésorier, secrétaire | 2 à 3 | ≈ 170 |",
    "| Membres du conseil | 1 à 3 | ≈ 120 |",
    "| Copropriétaires (comptes) | 5 à 10 | ≈ 420 |",
    "| Locataires (comptes) | 3 à 7 | ≈ 250 |",
    "",
    "Statuts : 86 % actifs, 8 % en attente (mot de passe à changer), 4 % inactifs, 2 % suspendus. Profils en français et en arabe.",
    "",
  ];
  for (const [g, ts] of groups) {
    lines.push(`## ${g}`, "", "| Table | Stratégie | Volume prévu |", "|---|---|---|");
    for (const t of ts) {
      const p = planFor(t.name);
      lines.push(`| \`${t.name}\` | ${esc(p.role)}${p.note ? ` — ${esc(p.note)}` : ""} | ${esc(p.volume)} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Explanations of failures that come from data predating the generator. */
const KNOWN: Record<string, string> = {
  "Lignes budgétaires = montant des charges du budget":
    "Budgets de démonstration du seed initial (budget_atlas_2026, budget_agdal_2026) dont les lignes dépassent le montant des charges ; aucun budget généré n'est concerné. À corriger dans scripts/src/seed.ts (non modifié ici).",
  "Procuration utilisée ⇒ reçu de vote du mandant porté par le mandataire":
    "Procuration de démonstration eproxy_2 du seed initial : statut « used » sans bulletin du mandant. Aucune procuration générée n'est concernée. À corriger dans scripts/src/seed.ts (non modifié ici).",
  "Procuration : mandant et mandataire de la copropriété de l'élection":
    "Procuration de démonstration eproxy_2 du seed initial : mandant et mandataire (user_member_4, user_member_3) rattachés à une autre copropriété que l'élection election_2. Aucune procuration générée n'est concernée. À corriger dans scripts/src/seed.ts (non modifié ici).",
};

function latestReset(): { at: string; backup: string; removed: Record<string, number> } | null {
  if (!existsSync(STATE_DIR)) return null;
  const f = readdirSync(STATE_DIR).filter((x) => /^reset-\d/.test(x)).sort().at(-1);
  return f ? JSON.parse(readFileSync(path.join(STATE_DIR, f), "utf8")) : null;
}

function reportMd(tables: TableInfo[], checks: CheckResult[], files?: FileCheckReport, removedNow?: Record<string, number>): string {
  const manifest = existsSync(manifestPath()) ? JSON.parse(readFileSync(manifestPath(), "utf8")) : null;
  const before: Record<string, number> = manifest?.before ?? {};
  const failed = checks.filter((c) => !c.ok);
  const lines = [
    "# Rapport de génération des données de test",
    "",
    manifest ? `Lancement \`${manifest.runKey}\` (graine ${manifest.seed}, échelle ${manifest.scale}) — statut **${manifest.status}**, durée ${manifest.durationSeconds ?? "?"} s. Domaine des comptes : \`${manifest.emailDomain ?? ""}\`.` : "Aucun lancement enregistré pour cette graine.",
    "",
    `Contrôles d'intégrité : **${checks.length - failed.length}/${checks.length} réussis**.`,
    "",
    `Utilisateurs générés : **${tables.find((t) => t.name === "users") && manifest?.generated?.users ? manifest.generated.users : "?"}** (comptes de test, domaine réservé ; voir docs/database/DATABASE_SEEDING_GUIDE.md).`,
    "",
    "## Volumes par table",
    "",
    "| Table | Avant | Ajoutées | Après | Statut |",
    "|---|---:|---:|---:|---|",
    ...tables.map((t) => {
      const b = before[t.name] ?? 0;
      const added = t.rows - b;
      const p = planFor(t.name);
      return `| \`${t.name}\` | ${b} | ${added} | ${t.rows} | ${added > 0 ? "alimentée" : p.skip ? `non alimentée : ${esc(p.skip)}` : "inchangée"} |`;
    }),
    "",
    "## Contrôles d'intégrité",
    "",
    "| Groupe | Contrôle | Lignes trouvées | Résultat |",
    "|---|---|---:|---|",
    ...checks.filter((c) => c.group !== "Clés étrangères" || !c.ok).map((c) => `| ${c.group} | ${esc(c.name)} | ${c.found} | ${c.ok ? "OK" : "**ÉCHEC**"} |`),
    `| Clés étrangères | ${checks.filter((c) => c.group === "Clés étrangères").length} contraintes vérifiées (relations orphelines) | ${checks.filter((c) => c.group === "Clés étrangères").reduce((s, c) => s + c.found, 0)} | ${checks.filter((c) => c.group === "Clés étrangères" && !c.ok).length ? "**ÉCHEC**" : "OK"} |`,
    "",

  ];
  const reset = latestReset();
  const removed = removedNow && Object.keys(removedNow).length ? removedNow : reset?.removed;
  if (removed && Object.keys(removed).length) {
    lines.push(
      "## Nettoyage préalable (anciennes données du générateur)",
      "",
      `${reset ? `Exécuté le ${reset.at.slice(0, 16).replace("T", " ")} UTC ; sauvegarde complète (pg_dump + fichiers) dans \`scripts/${path.relative(process.cwd(), reset.backup).replace(/\\/g, "/")}\`.` : ""} Seules les données rattachées aux marqueurs du générateur ont été supprimées ; données de démonstration et comptes non générés conservés.`,
      "",
      "| Table | Lignes supprimées |",
      "|---|---:|",
      ...Object.entries(removed).map(([t, n]) => `| \`${t}\` | ${n} |`),
      "",
    );
  }
  const residues = (reset as { residues?: { table: string; column: string; dangling: number; proven: number }[] } | null)?.residues ?? [];
  if (residues.length) {
    lines.push(
      "### Résidus d'anciens lancements",
      "",
      "Lignes pointant vers un utilisateur ou une copropriété supprimés par une colonne sans clé étrangère. Supprimées uniquement si leur appartenance au générateur est prouvée (identifiant produit par une graine connue, ou texte écrit seulement par le générateur) ; les autres sont conservées.",
      "",
      "| Table.colonne | Orphelines | Prouvées générateur (supprimées) | Conservées |",
      "|---|---:|---:|---:|",
      ...residues.map((r) => `| \`${r.table}.${r.column}\` | ${r.dangling} | ${r.proven} | ${r.dangling - r.proven} |`),
      "",
    );
  }
  const pipelinePath = path.join(STATE_DIR, `pipeline-s${seed}.json`);
  const pipeline = existsSync(pipelinePath) ? (JSON.parse(readFileSync(pipelinePath, "utf8")) as { fileStats: Record<string, number>; steps: { step: string; result: string }[] }) : null;
  const stats = fileStats.size ? Object.fromEntries(fileStats) : pipeline?.fileStats;
  if (files) {
    lines.push(
      "## Fichiers réels",
      "",
      `Emplacement : \`artifacts/api-server/uploads/\` (stockage local de l'API, chemins \`/objects/uploads/<id>.pdf|png\`). Chaque fichier est enregistré dans \`storage_objects\` et relié à son objet métier.`,
      "",
      `- Fichiers enregistrés : **${files.stored}** — PDF valides **${files.pdf.ok}** (${files.pdf.pages} pages au total), PDF invalides ${files.pdf.bad} ; PNG valides **${files.png.ok}**, PNG invalides ${files.png.bad}.`,
      `- Absents du disque : ${files.missing} ; taille différente de celle enregistrée : ${files.sizeMismatch}.`,
      "- Validation : structure PDF complète (en-tête, table xref, objets, arbre des pages, flux décompressés) et PNG décodé (CRC, pixels décompressés).",
      "",
      "| Référence | Fichiers référencés | Sans fichier |",
      "|---|---:|---:|",
      ...files.references.map((x) => `| \`${x.column}\` | ${x.refs} | ${x.unknown} |`),
      "",
    );
    if (stats) lines.push("| Type de document produit | Fichiers |", "|---|---:|", ...Object.entries(stats).map(([k, n]) => `| ${k} | ${n} |`), "");
    if (files.failures.length) lines.push("Échecs :", "", ...files.failures.map((f) => `- ${esc(f)}`), "");
  }
  if (pipeline) lines.push("## Procédure exécutée (`seedgen run`)", "", ...pipeline.steps.map((x) => `- **${x.step}** — ${esc(x.result)}`), "");
  const apiPath = path.join(STATE_DIR, `api-check-s${seed}.json`);
  if (existsSync(apiPath)) {
    const api = JSON.parse(readFileSync(apiPath, "utf8")) as { at: string; condominium: string; results: { name: string; pass: boolean; detail: string; ms?: number }[] };
    lines.push(
      "## Vérification à travers l'API",
      "",
      `Exécutée le ${api.at.slice(0, 16).replace("T", " ")} UTC sur « ${api.condominium} » avec des comptes générés de chaque rôle (\`seedgen:api\`) : **${api.results.filter((r) => r.pass).length}/${api.results.length} réussies**.`,
      "",
      "| Vérification | Détail | Temps | Résultat |",
      "|---|---|---:|---|",
      ...api.results.map((r) => `| ${esc(r.name)} | ${esc(r.detail)} | ${r.ms ?? ""} | ${r.pass ? "OK" : "**ÉCHEC**"} |`),
      "",
    );
  }
  if (failed.length) {
    lines.push("## Échecs constatés", "", ...failed.map((c) => `- ${c.group} — ${c.name} : ${c.found} ligne(s). ${KNOWN[c.name] ?? "À analyser."}`), "");
  }
  return lines.join("\n");
}

void TEST_PASSWORD;
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
