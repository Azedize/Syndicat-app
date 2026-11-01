import * as FileSystem from "expo-file-system/legacy";
import { library } from "./api";

/**
 * Secure local handling of library files.
 *
 * - Files are fetched through a fresh 5-minute link issued by the server for
 *   this person and this version; the server re-checks the person's current
 *   access before sending any byte. No storage URL is ever kept.
 * - Bytes land in the app's PRIVATE cache (`cacheDirectory/mizan-docs/`),
 *   never in a shared or public directory, and are deleted when the viewer
 *   closes, when the condominium / account changes, and at sign-out.
 * - Nothing is kept for offline reading: every opening is revalidated online,
 *   so a revoked access or a replaced version takes effect at the next open.
 *   A copy the person explicitly exports (share sheet) is outside the app's
 *   control — that cannot be revoked.
 */

export type DocumentFileErrorCode =
  | "OFFLINE"
  | "AUTH_EXPIRED"
  | "ACCESS_REVOKED"
  | "NOT_FOUND"
  | "NO_FILE"
  | "STORAGE_OBJECT_MISSING"
  | "LINK_EXPIRED"
  | "DOCUMENT_REPLACED"
  | "INSUFFICIENT_STORAGE"
  | "INTERRUPTED"
  | "UNKNOWN";

export class DocumentFileError extends Error {
  constructor(public code: DocumentFileErrorCode, message?: string) {
    super(message ?? code);
  }
}

export interface DocumentFileRef {
  id: string;
  version?: number | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  fileName?: string | null;
}

export interface LocalDocumentFile {
  uri: string;
  mimeType: string;
  fileName: string;
  size: number;
}

const DIR = `${FileSystem.cacheDirectory ?? ""}mizan-docs/`;
const inFlight = new Map<string, Promise<LocalDocumentFile>>();

const EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

/** Maps an API failure (status / code) to a library error. */
export function toDocumentError(e: any): DocumentFileError {
  if (e instanceof DocumentFileError) return e;
  const status: number | undefined = e?.status;
  const code: string | undefined = e?.code;
  if (!status && /network|fetch|internet|timeout/i.test(String(e?.message ?? ""))) return new DocumentFileError("OFFLINE");
  if (code === "LINK_EXPIRED" || status === 410) return new DocumentFileError("LINK_EXPIRED");
  if (code === "LINK_OUTDATED" || code === "DOCUMENT_CHANGED") return new DocumentFileError("DOCUMENT_REPLACED");
  if (code === "STORAGE_OBJECT_MISSING") return new DocumentFileError("STORAGE_OBJECT_MISSING");
  if (code === "NO_FILE") return new DocumentFileError("NO_FILE");
  if (code === "ACCESS_REVOKED" || status === 403) return new DocumentFileError("ACCESS_REVOKED");
  if (status === 401) return new DocumentFileError("AUTH_EXPIRED");
  if (status === 404) return new DocumentFileError("NOT_FOUND");
  return new DocumentFileError("UNKNOWN", e?.message);
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

/** Reads the JSON error the server wrote instead of the file (non-200 download). */
async function serverError(uri: string, status: number): Promise<DocumentFileError> {
  let body: any = null;
  try {
    body = JSON.parse(await FileSystem.readAsStringAsync(uri));
  } catch {
    /* not JSON */
  }
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  return toDocumentError({ status, code: body?.code, message: body?.error });
}

/**
 * Downloads the current version of a document into the private cache.
 * Concurrent requests for the same document/version share one download.
 */
export function fetchDocumentFile(doc: DocumentFileRef, onProgress?: (ratio: number) => void): Promise<LocalDocumentFile> {
  const key = `${doc.id}-v${doc.version ?? 1}`;
  const running = inFlight.get(key);
  if (running) return running;
  const task = (async () => {
    await ensureDir();
    // Refuse early rather than fail half-way when the device is full.
    if (doc.sizeBytes) {
      const free = await FileSystem.getFreeDiskStorageAsync().catch(() => Number.MAX_SAFE_INTEGER);
      if (free < doc.sizeBytes * 2 + 5 * 1024 * 1024) throw new DocumentFileError("INSUFFICIENT_STORAGE");
    }
    let link: Awaited<ReturnType<typeof library.link>>;
    try {
      link = await library.link(doc.id);
    } catch (e) {
      throw toDocumentError(e);
    }
    const mimeType = link.mimeType ?? doc.mimeType ?? "application/octet-stream";
    const target = `${DIR}${key}${EXT[mimeType] ?? ""}`;
    const dl = FileSystem.createDownloadResumable(link.url, target, {}, (p) => {
      if (onProgress && p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    });
    let res: FileSystem.FileSystemDownloadResult | undefined;
    try {
      res = await dl.downloadAsync();
    } catch (e: any) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      throw /space|ENOSPC|storage/i.test(String(e?.message)) ? new DocumentFileError("INSUFFICIENT_STORAGE") : new DocumentFileError("INTERRUPTED");
    }
    if (!res) throw new DocumentFileError("INTERRUPTED");
    if (res.status !== 200) throw await serverError(res.uri, res.status);
    const info = await FileSystem.getInfoAsync(res.uri);
    return { uri: res.uri, mimeType, fileName: link.filename, size: info.exists ? (info.size ?? 0) : 0 };
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

export async function deleteDocumentFile(uri: string | null | undefined) {
  if (uri?.startsWith(DIR)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** Removes every cached library file (context change, sign-out, app start). */
export async function purgeDocumentCache() {
  if (!FileSystem.cacheDirectory) return;
  await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => {});
}

export const readAsBase64 = (uri: string) => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
export const readAsText = (uri: string) => FileSystem.readAsStringAsync(uri);
