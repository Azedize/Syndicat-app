import { getApiBaseUrl, withFileTicket } from "@/services/api";

/** Server-hosted avatars are private object paths, fetched with a download ticket. */
export function resolveAvatarUrl(raw: string | null | undefined, ticket: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/objects/") && ticket) {
    return withFileTicket(`${getApiBaseUrl()}/storage${raw}`, ticket);
  }
  return null;
}
