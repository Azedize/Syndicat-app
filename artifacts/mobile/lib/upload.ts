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

async function uploadUri(
  uri: string,
  fileName: string,
  contentType: string,
  onProgress?: UploadProgressCallback,
): Promise<UploadResult | undefined> {
  try {
    const token = await getToken();
    onProgress?.(0.05);
    const fileRes = await fetch(uri);
    const blob = await fileRes.blob();
    const size = blob.size ?? 0;

    // Validate file size
    if (size > MAX_ATTACHMENT_SIZE) {
      throw new Error(`FILE_TOO_LARGE:${Math.round(size / 1024 / 1024)}`);
    }

    onProgress?.(0.2);
    const urlRes = await fetch(`${getBaseUrl()}/storage/uploads/request-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: fileName, size: size || 5000000, contentType }),
    });
    if (!urlRes.ok) return undefined;
    const { uploadURL, objectPath } = await urlRes.json();
    onProgress?.(0.5);

    const uploadResp = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    onProgress?.(0.95);
    return uploadResp.ok ? { objectPath, fileName, contentType, size } : undefined;
  } catch (err: any) {
    if (err?.message?.startsWith("FILE_TOO_LARGE")) throw err;
    return undefined;
  }
}

/** Prompts the user to pick a PDF document and uploads it. Returns UploadResult, or undefined on failure/cancel. */
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
  const contentType = asset.mimeType ?? "application/octet-stream";
  return uploadUri(asset.uri, asset.name ?? `document-${Date.now()}`, contentType, onProgress);
}

/** Prompts the user to pick an invoice (PDF or image) and uploads it. */
export async function pickAndUploadInvoice(onProgress?: UploadProgressCallback): Promise<UploadResult | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const contentType = asset.mimeType ?? "application/pdf";
  return uploadUri(asset.uri, asset.name ?? `invoice-${Date.now()}`, contentType, onProgress);
}

/** Prompts the user to pick a photo from the gallery and uploads it. */
export async function pickAndUploadPhoto(onProgress?: UploadProgressCallback): Promise<UploadResult | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ext = asset.uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  return uploadUri(asset.uri, `photo-${Date.now()}.${ext}`, contentType, onProgress);
}

/** Opens the camera, captures a photo, and uploads it. Returns UploadResult, or undefined on failure/cancel/permission denied. */
export async function captureAndUploadPhoto(onProgress?: UploadProgressCallback): Promise<UploadResult | undefined> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") return undefined;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ext = asset.uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  return uploadUri(asset.uri, `camera-${Date.now()}.${ext}`, contentType, onProgress);
}
