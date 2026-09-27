import { getApiBaseUrl, getToken } from "../services/api";

export async function apiRequest<T = any>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  token?: string | null,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = `${getApiBaseUrl()}${path.trim()}`;

  // Auto-fetch token from storage if not passed explicitly
  const resolvedToken = token ?? (await getToken());

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extraHeaders,
  };
  if (resolvedToken) {
    headers["Authorization"] = `Bearer ${resolvedToken}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
