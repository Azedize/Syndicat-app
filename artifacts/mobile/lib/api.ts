import { getToken } from "../services/api";

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  // fallback: API server on PORT (default 8080 in dev)
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
    throw new Error(message);
  }

  return data as T;
}
