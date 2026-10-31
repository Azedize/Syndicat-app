import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Write guard: the generator only writes to a local development database.
 * Anything else (remote host, production marker) stops the command before
 * any write, with the reason — there is no override flag.
 */
export function assertDevDatabase(): { host: string; database: string } {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL absent : aucune base cible.");
  const url = new URL(raw);
  const host = url.hostname;
  const database = url.pathname.replace(/^\//, "");
  const problems: string[] = [];
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) problems.push(`hôte « ${host} » non local`);
  if (/prod/i.test(database) || /prod/i.test(host)) problems.push(`base « ${database} » marquée production`);
  if (process.env.NODE_ENV === "production") problems.push("NODE_ENV=production");
  if (problems.length) {
    throw new Error(`Écriture refusée — environnement non identifié comme développement : ${problems.join(", ")}. Lancez le générateur uniquement sur une base locale de développement.`);
  }
  return { host, database };
}

/**
 * Each uploads directory belongs to ONE database: a marker file
 * `.mizan-database` holds its name. The generator refuses to write files for
 * a database into another database's directory (same seed ⇒ same file
 * names: a test run would overwrite the working base's documents).
 * A directory without marker is claimed only if it holds no file yet.
 */
export function assertUploadsDirFor(database: string, uploadsDir: string): void {
  const marker = path.join(uploadsDir, ".mizan-database");
  if (existsSync(marker)) {
    const owner = readFileSync(marker, "utf8").trim();
    if (owner !== database) {
      throw new Error(`Dossier de fichiers ${uploadsDir} réservé à la base « ${owner} » : la base « ${database} » doit utiliser son propre dossier (LOCAL_UPLOADS_DIR).`);
    }
    return;
  }
  const files = existsSync(uploadsDir) ? readdirSync(uploadsDir).filter((f) => !f.startsWith(".")) : [];
  if (files.length) {
    throw new Error(`Dossier de fichiers ${uploadsDir} sans marqueur de base et non vide (${files.length} fichiers) : indiquez sa base dans ${marker} avant de générer.`);
  }
  mkdirSync(uploadsDir, { recursive: true });
  writeFileSync(marker, `${database}
`);
}
