import { getToken } from "../services/api";

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  // In production, EXPO_PUBLIC_DOMAIN must be set — missing it silently breaks
  // all API calls. Fail loudly so misconfigured production builds are caught.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[VERIDIAN] EXPO_PUBLIC_DOMAIN is required in production builds. " +
        "Set it to your Replit dev domain in the environment variables.",
    );
  }
  // Dev fallback: API server on PORT (default 8080)
  const port = process.env.EXPO_PUBLIC_API_PORT ?? "8080";
  return `http://localhost:${port}/api`;
}

export async function apiRequest<T = any>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;

  // Auto-fetch token from storage if not passed explicitly
  const resolvedToken = token ?? (await getToken());

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
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
