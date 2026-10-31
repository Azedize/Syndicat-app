/**
 * Proves that a backup of the working base can be restored — into a separate,
 * disposable database `syndycat_restore_check` on the local server — and
 * compares it with the working base (tables and row counts). Nothing is
 * restored over an existing database: the target is created empty and only
 * this name is accepted.
 *
 *   node --env-file=../.env --import=tsx src/restore-check.ts restore <dump file>
 *   node --env-file=../.env --import=tsx src/restore-check.ts compare
 *   node --env-file=../.env --import=tsx src/restore-check.ts exec -- <command…>   (DATABASE_URL = restore check)
 *   node --env-file=../.env --import=tsx src/restore-check.ts drop --yes
 */
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const TARGET = "syndycat_restore_check";
const PG_BIN = process.env.PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const args = process.argv.slice(2).filter((a) => a !== "--");
const cmd = args[0];

const source = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(source.hostname)) throw new Error("serveur non local : refusé");
const target = new URL(source.toString());
target.pathname = `/${TARGET}`;
const admin = new URL(source.toString());
admin.pathname = "/postgres";

async function counts(url: URL) {
  const sql = postgres(url.toString(), { max: 1 });
  const tables = (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`).map((r) => r.table_name as string);
  const out = new Map<string, number>();
  for (const t of tables) out.set(t, Number((await sql.unsafe(`SELECT count(*)::int AS n FROM "${t}"`))[0].n));
  await sql.end();
  return out;
}

async function main() {
  if (target.pathname !== `/${TARGET}`) throw new Error("cible inattendue");
  switch (cmd) {
    case "restore": {
      const dump = args[1];
      if (!dump) throw new Error("fichier de sauvegarde manquant");
      const sql = postgres(admin.toString(), { max: 1 });
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM pg_database WHERE datname = ${TARGET}`;
      if (n) throw new Error(`${TARGET} existe déjà : supprimez-la d'abord (drop --yes). Rien n'est restauré par-dessus.`);
      await sql.unsafe(`CREATE DATABASE "${TARGET}" TEMPLATE template0 ENCODING 'UTF8'`);
      await sql.end();
      const r = spawnSync(`${PG_BIN}/pg_restore.exe`, ["--no-owner", "--no-privileges", "--exit-on-error", "-d", target.toString(), dump], { stdio: ["ignore", "inherit", "inherit"] });
      if (r.status !== 0) throw new Error(`pg_restore a échoué (code ${r.status})`);
      console.log(`Restauré dans ${TARGET}.`);
      break;
    }
    case "compare": {
      const [a, b] = await Promise.all([counts(source), counts(target)]);
      const diffs = [...a].filter(([t, n]) => b.get(t) !== n).map(([t, n]) => `${t}: ${n} → ${b.get(t) ?? "absente"}`);
      console.log(`Tables : ${a.size} (travail) / ${b.size} (restauration) · lignes : ${[...a.values()].reduce((s, n) => s + n, 0)} / ${[...b.values()].reduce((s, n) => s + n, 0)}`);
      console.log(diffs.length ? `Différences :\n  ${diffs.join("\n  ")}` : "Identique table par table.");
      break;
    }
    case "exec": {
      const [c, ...rest] = args.slice(1);
      const r = spawnSync(c, rest, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, DATABASE_URL: target.toString(), OUTBOUND_DELIVERY: "off" } });
      process.exitCode = r.status ?? 1;
      break;
    }
    case "drop": {
      if (!args.includes("--yes")) throw new Error("relancez avec --yes");
      const sql = postgres(admin.toString(), { max: 1 });
      await sql.unsafe(`DROP DATABASE IF EXISTS "${TARGET}" WITH (FORCE)`);
      await sql.end();
      console.log(`${TARGET} supprimée (aucune autre base concernée).`);
      break;
    }
    default:
      console.log("Commandes : restore <dump> | compare | exec -- <cmd> | drop --yes");
  }
}
main().catch((e) => { console.error((e as Error).message); process.exit(1); });
