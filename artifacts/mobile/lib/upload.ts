import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { getToken } from "@/services/api";

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`;
}

async function uploadUri(uri: string, fileName: string, contentType: string): Promise<string | undefined> {
  try {
    const token = await getToken();
    const urlRes = await fetch(`${getBaseUrl()}/storage/uploads/request-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name: fileName, size: 5000000, contentType }),
    });
    if (!urlRes.ok) return undefined;
    const { uploadURL, objectPath } = await urlRes.json();
    const fileRes = await fetch(uri);
    const blob = await fileRes.blob();
    const uploadResp = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
    return uploadResp.ok ? objectPath : undefined;
  } catch {
    return undefined;
  }
}

/** Prompts the user to pick a PDF document and uploads it. Returns the object path, or undefined on failure/cancel. */
export async function pickAndUploadPdf(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  return uploadUri(asset.uri, asset.name ?? `document-${Date.now()}.pdf`, "application/pdf");
}

/** Prompts the user to pick any document (PDF, image, or other file type) and uploads it. */
export async function pickAndUploadDocument(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const contentType = asset.mimeType ?? "application/octet-stream";
  return uploadUri(asset.uri, asset.name ?? `document-${Date.now()}`, contentType);
}

/** Prompts the user to pick an invoice (PDF or image) and uploads it. */
export async function pickAndUploadInvoice(): Promise<string | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const contentType = asset.mimeType ?? "application/pdf";
  return uploadUri(asset.uri, asset.name ?? `invoice-${Date.now()}`, contentType);
}

/** Prompts the user to pick a photo from the library and uploads it. */
export async function pickAndUploadPhoto(): Promise<string | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ext = asset.uri.split(".").pop() ?? "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  return uploadUri(asset.uri, `photo-${Date.now()}.${ext}`, contentType);
}

/** Opens the camera, captures a photo, and uploads it. Returns the object path, or undefined on failure/cancel/permission denied. */
export async function captureAndUploadPhoto(): Promise<string | undefined> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") return undefined;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return undefined;
  const asset = result.assets[0];
  const ext = asset.uri.split(".").pop() ?? "jpg";
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  return uploadUri(asset.uri, `violation-${Date.now()}.${ext}`, contentType);
}
