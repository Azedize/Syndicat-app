import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ensureCameraPermission } from "./permissions";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { getApiBaseUrl, getToken } from "@/services/api";

/** Max attachment size: 50 MB */
export const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

export interface UploadResult {
  objectPath: string;
  fileName: string;
  contentType: string;
  size: number;
}

export type UploadProgressCallback = (progress: number) => void;

/**
 * Upload a local file URI directly to the API server (POST /storage/uploads, multipart).
 *
 * The server saves the file to local or configured cloud storage and returns the same objectPath format
 * ("/objects/uploads/<uuid>") so the rest of the pipeline is unchanged.
 */
export async function uploadFileUri(
  uri: string,
  fileName: string,
  contentType: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
  const token = await getToken();
  onProgress?.(0.05);

  const form = new FormData();
  let size = 0;
  if (Platform.OS === "web") {
    // Browser: the picker returns a blob:/data: URL that fetch can read.
    const fileRes = await fetch(uri);
    if (!fileRes.ok) throw new Error(`Cannot read file (${fileRes.status})`);
    const blob = await fileRes.blob();
    size = blob.size ?? 0;
    if (size > MAX_ATTACHMENT_SIZE) {
      throw new Error(`FILE_TOO_LARGE:${Math.round(size / 1024 / 1024)}`);
    }
    form.append("file", blob, fileName);
  } else {
    // Android / iOS: React Native's FormData streams the file from its URI
    // ({ uri, name, type }). A Blob part is not serialized reliably there,
    // which made every native upload fail.
    try {
      size = new File(uri).size ?? 0;
    } catch {
      size = 0; // size unknown (e.g. content:// URI) — the server enforces its own limit
    }
    if (size > MAX_ATTACHMENT_SIZE) {
      throw new Error(`FILE_TOO_LARGE:${Math.round(size / 1024 / 1024)}`);
    }
    form.append("file", { uri, name: fileName, type: contentType } as unknown as Blob);
  }

  onProgress?.(0.3);

  const uploadRes = await fetch(`${getApiBaseUrl()}/storage/uploads`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  onProgress?.(0.9);

  if (!uploadRes.ok) {
    const errBody = await uploadRes.json().catch(() => ({}));
    throw new Error((errBody as any).error ?? `Upload failed (${uploadRes.status})`);
  }

  const { objectPath } = await uploadRes.json();
  onProgress?.(1.0);

  return { objectPath, fileName, contentType, size };
}

const uploadUri = uploadFileUri;

/** Prompts the user to pick a PDF document and uploads it. Returns UploadResult, or undefined on cancel. */
export async function pickAndUploadPdf(onProgress?: UploadProgressCallback): Promise<UploadResult | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  return uploadUri(asset.uri, asset.name ?? `document-${Date.now()}.pdf`, "application/pdf", onProgress);
}

/** Prompts the user to pick any document (PDF, DOCX, XLSX, ZIP, image, etc.) and uploads it. */
export async function pickAndUploadDocument(onProgress?: UploadProgressCallback): Promise<UploadResult | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ct = asset.mimeType ?? "application/octet-stream";
  return uploadUri(asset.uri, asset.name ?? `document-${Date.now()}`, ct, onProgress);
}

/** Prompts the user to pick an invoice (PDF or image) and uploads it. */
export async function pickAndUploadInvoice(onProgress?: UploadProgressCallback): Promise<UploadResult | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ct = asset.mimeType ?? "application/pdf";
  return uploadUri(asset.uri, asset.name ?? `invoice-${Date.now()}`, ct, onProgress);
}

/**
 * Derive a safe image extension from an Expo asset.
 * On Expo Web the URI is a blob: or data: URL — parsing it gives garbage.
 * We fall back to the asset.mimeType when that happens.
 */
function imageExtFromAsset(asset: { uri: string; mimeType?: string | null }): "jpg" | "png" {
  // Native: URI is a real file path, extension is reliable.
  if (!asset.uri.startsWith("blob:") && !asset.uri.startsWith("data:")) {
    const tail = asset.uri.split("?")[0].split(".").pop()?.toLowerCase();
    if (tail === "png") return "png";
  }
  // Web: use MIME type metadata from the picker.
  if (asset.mimeType === "image/png") return "png";
  return "jpg";
}

/** Prompts the user to pick a photo from the gallery and uploads it. */
export async function pickAndUploadPhoto(onProgress?: UploadProgressCallback): Promise<UploadResult | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ext = imageExtFromAsset(asset);
  const ct = ext === "png" ? "image/png" : "image/jpeg";
  return uploadUri(asset.uri, `photo-${Date.now()}.${ext}`, ct, onProgress);
}

/** Opens the camera, captures a photo, and uploads it. Returns UploadResult, or undefined on cancel/permission denied. */
export async function captureAndUploadPhoto(onProgress?: UploadProgressCallback): Promise<UploadResult | undefined> {
  if (!(await ensureCameraPermission())) return undefined;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ext = imageExtFromAsset(asset);
  const ct = ext === "png" ? "image/png" : "image/jpeg";
  return uploadUri(asset.uri, `camera-${Date.now()}.${ext}`, ct, onProgress);
}


// ─── Document library ─────────────────────────────────────────────────────────

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

/** Library limit (the server enforces it too, and checks the real content type). */
export const MAX_LIBRARY_SIZE = 25 * 1024 * 1024;

/** Lets the person choose a file, without sending it yet. */
export async function pickLibraryFile(): Promise<PickedFile | undefined> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "application/pdf",
      "image/*",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/csv",
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const a = result.assets[0];
  return { uri: a.uri, name: a.name ?? "document", mimeType: a.mimeType ?? "application/octet-stream", size: a.size ?? null };
}

/** Error from the server with its stable code (FILE_TOO_LARGE, DOCUMENT_DUPLICATE…). */
export class LibraryUploadError extends Error {
  constructor(message: string, public code?: string, public status?: number, public body?: any) {
    super(message);
  }
}

/**
 * Sends the file and its metadata in one request: the document only exists
 * (and is listed) once the server has stored the file AND saved the record.
 * `path` is "/documents/upload" or "/documents/:id/file" (replacement).
 */
export async function sendLibraryFile(
  path: string,
  file: PickedFile,
  fields: Record<string, string | undefined>,
): Promise<any> {
  if (file.size && file.size > MAX_LIBRARY_SIZE) {
    throw new LibraryUploadError("Fichier trop volumineux (25 Mo maximum)", "FILE_TOO_LARGE", 413);
  }
  const token = await getToken();
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") form.append(k, v);
  if (Platform.OS === "web") {
    const blob = await (await fetch(file.uri)).blob();
    form.append("file", blob, file.name);
  } else {
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  }
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new LibraryUploadError("Connexion interrompue : le document n'a pas été enregistré. Réessayez.", "NETWORK");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new LibraryUploadError((body as any).error ?? `Échec (${res.status})`, (body as any).code, res.status, body);
  return body;
}
