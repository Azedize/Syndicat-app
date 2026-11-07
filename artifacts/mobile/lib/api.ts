import { getApiBaseUrl, getToken, refreshAccessToken } from "../services/api";
import { requestLanguage } from "@/i18n/current";
import { fetchWithTimeout } from "./fetchTimeout";
import { dropDuplicateWrite } from "./singleFlight";

export function apiRequest<T = any>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  token?: string | null,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  return dropDuplicateWrite(method, path, body !== undefined ? JSON.stringify(body) : undefined, () =>
    send<T>(path, method, body, token, extraHeaders),
  );
}

async function send<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
  token: string | null | undefined,
  extraHeaders: Record<string, string> | undefined,
): Promise<T> {
  const url = `${getApiBaseUrl()}${path.trim()}`;

  // The stored token is the source of truth (it is renewed in the background);
  // a token passed by the caller may be stale.
  const resolvedToken = (await getToken()) ?? token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Language": requestLanguage(),
    Accept: "application/json",
    ...extraHeaders,
  };
  if (resolvedToken) {
    headers["Authorization"] = `Bearer ${resolvedToken}`;
  }

  let response = await fetchWithTimeout(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Access tokens live 15 minutes: renew once with the refresh token and
  // replay the request, like services/api does. Auth endpoints are excluded.
  if (response.status === 401 && resolvedToken && !path.startsWith("/auth/")) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      headers["Authorization"] = `Bearer ${renewed}`;
      response = await fetchWithTimeout(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    }
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message = data?.error ?? data?.message ?? `HTTP ${response.status}`;
    const err = new Error(message) as Error & {
      code?: string; detail?: string; action?: string;
      phone?: string; httpStatus?: number;
    };
    err.code       = data?.code;
    err.detail     = data?.detail;
    err.action     = data?.action;
    err.phone      = data?.phone;
    err.httpStatus = response.status;
    throw err;
  }

  return data as T;
}
