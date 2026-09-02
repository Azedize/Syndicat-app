import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { getToken } from "@/services/api";

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`;
}

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
 * Upload a file URI directly to the API server (POST /storage/uploads, multipart).
 *
 * The server saves the file to local or configured cloud storage and returns the same objectPath format
 * ("/objects/uploads/<uuid>") so the rest of the pipeline is unchanged.
 */
async function uploadUri(
  uri: string,
  fileName: string,
  contentType: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadResult> {
  const token = await getToken();
  onProgress?.(0.05);

  // Fetch the local file/blob URI into memory
  const fileRes = await fetch(uri);
  if (!fileRes.ok) throw new Error(`Cannot read file (${fileRes.status})`);
  const blob = await fileRes.blob();
  const size = blob.size ?? 0;

  if (size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`FILE_TOO_LARGE:${Math.round(size / 1024 / 1024)}`);
  }

  onProgress?.(0.3);

  // Build multipart form and POST directly to the API server.
  // The server writes the file to workspace storage (dev) or GCS (prod).
  const form = new FormData();
  form.append("file", blob, fileName);

  const uploadRes = await fetch(`${getBaseUrl()}/storage/uploads`, {
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
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") return undefined;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ext = imageExtFromAsset(asset);
  const ct = ext === "png" ? "image/png" : "image/jpeg";
  return uploadUri(asset.uri, `camera-${Date.now()}.${ext}`, ct, onProgress);
}
