import { getApiBaseUrl, withFileTicket } from "@/services/api";

/**
 * URL of an uploaded image for <Image>: server objects (/objects/…) are
 * private and fetched with a short-lived download ticket (useFileTicket);
 * absolute https URLs are used as they are.
 */
export function resolveMediaUrl(raw: string | null | undefined, ticket: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("https://") || raw.startsWith("http://")) return raw;
  if (raw.startsWith("/objects/") && ticket) return withFileTicket(`${getApiBaseUrl()}/storage${raw}`, ticket);
  return null;
}

/** The image paths stored on a listing (JSON array), never throwing. */
export function listingImages(imageUrls: string | null | undefined): string[] {
  try {
    const v = JSON.parse(imageUrls ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
