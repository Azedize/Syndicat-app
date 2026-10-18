import { Readable } from "stream";
import fs from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import type { Response } from "express";
import { ObjectStorageService } from "./objectStorage.js";
import { readLocalDocFile } from "./documentPdf.js";
import type { DetectedFileType } from "./file-signature.js";

/**
 * Where uploaded bytes live. Same layout as POST /storage/uploads: the file is
 * named by a random UUID plus the extension of its VERIFIED type, so a client
 * file name can never choose a path ("../", reserved names, double
 * extensions…). The object path is internal and never sent to residents.
 */
export const LOCAL_UPLOADS_DIR = path.resolve(process.env.LOCAL_UPLOADS_DIR ?? "uploads");
const storage = new ObjectStorageService();

export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Stockage indisponible");
    this.cause = cause;
  }
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Writes the verified bytes; throws StorageUnavailableError when storage fails. */
export async function storeVerifiedFile(buf: Buffer, type: DetectedFileType): Promise<{ objectPath: string; diskPath: string }> {
  const filename = `${randomUUID()}${type.ext}`;
  const diskPath = path.join(LOCAL_UPLOADS_DIR, filename);
  try {
    await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
    await fs.writeFile(diskPath, buf, { flag: "wx" });
  } catch (err) {
    throw new StorageUnavailableError(err);
  }
  return { objectPath: `/objects/uploads/${filename}`, diskPath };
}

/** Best-effort removal of bytes whose metadata could not be saved. */
export async function discardStoredFile(diskPath: string): Promise<void> {
  await fs.unlink(diskPath).catch(() => {});
}

/** RFC 6266 Content-Disposition with an ASCII fallback and the UTF-8 name. */
export function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const clean = path.basename(fileName).replace(/[\r\n"\\]/g, "_").slice(0, 180) || "document";
  const ascii = clean.normalize("NFKD").replace(/[^\x20-\x7e]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/**
 * Streams a stored object (configured cloud storage first, local disk as the
 * development fallback). Returns false when the object is missing everywhere,
 * so the caller can answer with a clear "file missing" error.
 */
export async function sendStoredObject(
  objectPath: string,
  res: Response,
  opts: { contentType: string; fileName: string; inline: boolean },
): Promise<boolean> {
  const headers = () => {
    res.setHeader("Content-Type", opts.contentType);
    res.setHeader("Content-Disposition", contentDisposition(opts.inline ? "inline" : "attachment", opts.fileName));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Text could be rendered as a page by a browser: never let it run anything.
    // (HTML / SVG are refused at upload; PDF and images keep their viewers.)
    if (opts.contentType.startsWith("text/")) res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  };
  if (objectPath.startsWith("/local-docs/")) {
    const [uuid, file] = objectPath.replace(/^\/local-docs\//, "").split("/");
    if (!/^[0-9a-f-]{36}$/i.test(uuid ?? "") || !file || file.includes("..") || /[/\\]/.test(file)) return false;
    try {
      const buf = await readLocalDocFile(uuid, file);
      headers();
      res.setHeader("Content-Length", String(buf.byteLength));
      res.end(buf);
      return true;
    } catch {
      return false;
    }
  }
  if (!objectPath.startsWith("/objects/")) return false;
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const response = await storage.downloadObject(file);
    if (response.ok && response.body) {
      headers();
      Readable.fromWeb(response.body as any).pipe(res);
      return true;
    }
  } catch {
    // Cloud storage not configured / object not there: try the local disk.
  }
  try {
    const buf = await fs.readFile(path.join(LOCAL_UPLOADS_DIR, path.basename(objectPath)));
    headers();
    res.setHeader("Content-Length", String(buf.byteLength));
    res.end(buf);
    return true;
  } catch {
    return false;
  }
}
