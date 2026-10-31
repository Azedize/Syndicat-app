/**
 * testdb — the isolated test database `syndycat_test`.
 *
 *   pnpm --filter @workspace/scripts run testdb -- <command>
 *
 *   info      source and target databases (no password printed), state
 *   create    create `syndycat_test` on the same local server if absent
 *   migrate   apply the repository's migrations to it (drizzle migrate)
 *   reference reference data + demo accounts of seed.ts (all on .test domains)
 *   generate  full synthetic data set: seedgen run + marketplace catalogue
 *   exec -- <command…>   run any command with DATABASE_URL = the test base
 *   drop      drop `syndycat_test` (asks for --yes; never any other base)
 *
 * The target URL is derived from DATABASE_URL in .env by changing ONLY the
 * database name. Every command refuses to run unless the target database is
 * exactly `syndycat_test` on a local host, so the working base
 * (`syndycat_global_cps`) can never be the target. Nothing is copied from the
 * working base: the test data is generated (synthetic, reserved domains).
 * Its files go to artifacts/api-server/uploads-test (LOCAL_UPLOADS_DIR); an API
 * started with `exec` serves that directory.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";

const TEST_DB = "syndycat_test";
/** The test base's files (absolute: the API and the generator resolve it from different folders). */
const TEST_UPLOADS = path.resolve(process.cwd(), "../artifacts/api-server/uploads-test");
const args = process.argv.slice(2).filter((a) => a !== "--");
const cmd = args[0] ?? "info";

function urls() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL absent (.env)");
  const source = new URL(raw);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(source.hostname)) throw new Error(`Serveur non local (${source.hostname}) : refusé.`);
  const target = new URL(raw);
  target.pathname = `/${TEST_DB}`;
  const admin = new URL(raw);
  admin.pathname = "/postgres";
  return { source, target, admin };
}
const show = (u: URL) => `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)} (utilisateur ${u.username})`;

function assertTarget(u: URL) {
  if (u.pathname !== `/${TEST_DB}`) throw new Error(`Cible inattendue « ${u.pathname.slice(1)} » : seul ${TEST_DB} est autorisé.`);
}

function run(command: string, cmdArgs: string[], cwd: string) {
  const { target } = urls();
  assertTarget(target);
  console.log(`→ ${command} ${cmdArgs.join(" ")}  [DATABASE_URL = ${show(target)}]`);
  const r = spawnSync(command, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    // Disposable test base: nothing leaves the machine (e-mail, SMS, push).
    env: { ...process.env, DATABASE_URL: target.toString(), OUTBOUND_DELIVERY: "off", MIZAN_DB_ROLE: "test", LOCAL_UPLOADS_DIR: TEST_UPLOADS },
  });
  if (r.status !== 0) throw new Error(`${command} a échoué (code ${r.status})`);
}

async function main() {
  const { source, target, admin } = urls();
  assertTarget(target);
  const root = path.resolve(process.cwd(), "..");
  switch (cmd) {
    case "info": {
      console.log(`Base de travail (source, jamais modifiée ici) : ${show(source)}`);
      console.log(`Base de test (cible)                          : ${show(target)}`);
      const sql = postgres(admin.toString(), { max: 1 });
      const [row] = await sql`SELECT count(*)::int AS n FROM pg_database WHERE datname = ${TEST_DB}`;
      console.log(`${TEST_DB} existe : ${row.n ? "oui" : "non"}`);
      await sql.end();
      if (row.n) {
        const t = postgres(target.toString(), { max: 1 });
        const [m] = await t`SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public')::int AS tables,
          (SELECT count(*) FROM users)::int AS users`.catch(() => [{ tables: 0, users: 0 }]);
        console.log(`  tables : ${m.tables} · comptes : ${m.users}`);
        await t.end();
      }
      break;
    }
    case "create": {
      if (source.pathname === target.pathname) throw new Error("La source est déjà la base de test.");
      const sql = postgres(admin.toString(), { max: 1 });
      const [row] = await sql`SELECT count(*)::int AS n FROM pg_database WHERE datname = ${TEST_DB}`;
      if (row.n) console.log(`${TEST_DB} existe déjà : rien à faire.`);
      else {
        await sql.unsafe(`CREATE DATABASE "${TEST_DB}" TEMPLATE template0 ENCODING 'UTF8'`);
        console.log(`${TEST_DB} créée.`);
      }
      await sql.end();
      break;
    }
    case "migrate":
      run("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], root);
      break;
    case "reference":
      run("node", ["--import=tsx", "./src/seed.ts"], process.cwd());
      break;
    case "generate":
      run("node", ["--import=tsx", "./src/seedgen/cli.ts", "run"], process.cwd());
      run("node", ["--import=tsx", "./src/seedgen/cli.ts", "marketplace"], process.cwd());
      run("node", ["--import=tsx", "./src/seedgen/cli.ts", "scenarios"], process.cwd());
      break;
    case "exec": {
      const [c, ...rest] = args.slice(1);
      if (!c) throw new Error("Usage : testdb -- exec <commande…>");
      run(c, rest, process.cwd());
      break;
    }
    case "drop": {
      if (!args.includes("--yes")) throw new Error(`Suppression de ${TEST_DB} : relancez avec --yes.`);
      const sql = postgres(admin.toString(), { max: 1 });
      await sql.unsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
      await sql.end();
      console.log(`${TEST_DB} supprimée (la base de travail n'est pas concernée).`);
      break;
    }
    default:
      console.log("Commandes : info | create | migrate | reference | generate | exec -- <cmd> | drop --yes");
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
