/**
 * API base-URL resolution and login-response validation.
 *
 * EXPO_PUBLIC_API_URL is usually written for one target (e.g. the Android
 * emulator alias 10.0.2.2). In development the same bundle is also opened in
 * the browser or on a physical phone, where that alias does not exist, so the
 * host is adapted to where the app actually runs. Production URLs are never
 * rewritten.
 */

export interface ApiUrlInput {
  apiUrl?: string;
  domain?: string;
  port: string;
  isDev: boolean;
  platform: string; // "web" | "android" | "ios"
  hostUri?: string | null; // Metro host seen by the device, e.g. "192.168.1.20:8081"
}

const EMULATOR_ALIASES = new Set(["10.0.2.2", "10.0.3.2"]);
const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

function hostOf(hostUri?: string | null): string | null {
  if (!hostUri) return null;
  const host = hostUri.split("/")[0].split(":")[0].trim();
  return host || null;
}

function browserHost(): string {
  const g = globalThis as { location?: { hostname?: string } };
  return g.location?.hostname || "localhost";
}

export function resolveApiBaseUrl(input: ApiUrlInput): string {
  const { apiUrl, domain, port, isDev, platform } = input;
  const metroHost = hostOf(input.hostUri);
  // A LAN address of the dev machine, as seen by a physical device.
  const lanHost =
    metroHost && !LOOPBACK.has(metroHost) && !EMULATOR_ALIASES.has(metroHost) ? metroHost : null;

  if (apiUrl && apiUrl.trim()) {
    const base = apiUrl.trim().replace(/\/+$/, "");
    if (!isDev) return base;
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      return base;
    }
    if (platform === "web" && EMULATOR_ALIASES.has(url.hostname)) {
      // The emulator alias does not exist in a browser.
      url.hostname = browserHost();
    } else if (
      platform !== "web" &&
      lanHost &&
      (EMULATOR_ALIASES.has(url.hostname) || LOOPBACK.has(url.hostname))
    ) {
      // Physical device on the LAN: reach the API on the dev machine's IP.
      url.hostname = lanHost;
    }
    return url.toString().replace(/\/+$/, "");
  }

  if (domain && domain.trim()) return `https://${domain.trim()}/api`;

  if (platform === "web") return `http://${browserHost()}:${port}/api`;
  if (lanHost) return `http://${lanHost}:${port}/api`;
  return `http://${platform === "android" ? "10.0.2.2" : "localhost"}:${port}/api`;
}

export interface LoginPayload<U> {
  data: { token: string; refreshToken: string | null; user: U };
}

/**
 * Validates the /auth/login body before anything is stored. A malformed body
 * (proxy error page, wrong server on the port…) becomes an explicit error
 * instead of an undefined token saved as the session.
 */
export function parseLoginResponse<U>(json: unknown): LoginPayload<U> {
  const data = (json as { data?: Record<string, unknown> } | null)?.data;
  const token = data?.token;
  const user = data?.user;
  if (typeof token !== "string" || !token || !user || typeof user !== "object") {
    const err = new Error("Réponse de connexion invalide du serveur") as Error & {
      status?: number;
      code?: string;
    };
    err.status = 502;
    err.code = "INVALID_LOGIN_RESPONSE";
    throw err;
  }
  const refreshToken = typeof data?.refreshToken === "string" ? data.refreshToken : null;
  return { data: { token, refreshToken, user: user as U } };
}
