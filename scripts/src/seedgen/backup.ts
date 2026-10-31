/**
 * Backup before a reset: full database dump (pg_dump custom format) plus a
 * copy of the files the reset will delete, in .seedgen/backups/<timestamp>/.
 * The connection string is passed to pg_dump through the environment, never
 * printed nor written to the manifest.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { uploadPath } from "./files.js";

function pgDumpBinary(): string {
  if (process.env.PG_DUMP) return process.env.PG_DUMP;
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["pg_dump"], { encoding: "utf8" });
  const found = probe.status === 0 ? probe.stdout.split(/\r?\n/).find(Boolean) : undefined;
  if (found) return found.trim();
  for (const v of ["18", "17", "16", "15"]) {
    const p = `C:\\Program Files\\PostgreSQL\\${v}\\bin\\pg_dump.exe`;
    if (existsSync(p)) return p;
  }
  throw new Error("pg_dump introuvable : installez les outils clients PostgreSQL ou indiquez PG_DUMP=<chemin>.");
}

export interface BackupResult {
  dir: string;
  dumpFile: string;
  dumpBytes: number;
  files: number;
}

export function backupDatabase(stateDir: string, database: string, files: string[], plannedRows: Record<string, number>): BackupResult {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(stateDir, "backups", stamp);
  mkdirSync(path.join(dir, "files"), { recursive: true });
  const dumpFile = path.join(dir, `${database}.dump`);
  const url = new URL(process.env.DATABASE_URL!);
  const res = spawnSync(pgDumpBinary(), ["--format=custom", "--no-owner", "--file", dumpFile, "--host", url.hostname, "--port", url.port || "5432", "--username", decodeURIComponent(url.username), "--dbname", url.pathname.slice(1)], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
    encoding: "utf8",
  });
  if (res.status !== 0 || !existsSync(dumpFile)) throw new Error(`Sauvegarde impossible (pg_dump) : ${(res.stderr || res.error?.message || "").trim()}`);
  let copied = 0;
  for (const f of files) {
    const p = uploadPath(f);
    if (p && existsSync(p)) {
      copyFileSync(p, path.join(dir, "files", path.basename(p)));
      copied++;
    }
  }
  const dumpBytes = statSync(dumpFile).size;
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        database,
        dump: path.basename(dumpFile),
        dumpBytes,
        filesCopied: copied,
        rowsToRemove: plannedRows,
        restore: [
          `pg_restore --clean --if-exists --no-owner --dbname <base locale> "${path.basename(dumpFile)}"`,
          "copier files/* vers artifacts/api-server/uploads/",
        ],
      },
      null,
      1,
    ),
  );
  return { dir, dumpFile, dumpBytes, files: copied };
}
