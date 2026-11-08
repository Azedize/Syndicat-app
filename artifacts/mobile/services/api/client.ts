// HTTP client: base URL, session tokens, authenticated requests, file tickets.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { isTunnelHost, resolveApiBaseUrl } from "@/lib/login-transport";
import { fetchWithTimeout } from "@/lib/fetchTimeout";
import { dropDuplicateWrite } from "@/lib/singleFlight";
import { requestLanguage } from "@/i18n/current";

const TOKEN_KEY = "@syndycat_token";
const REFRESH_TOKEN_KEY = "@syndycat_refresh_token";
const PENDING_REGISTER_KEY = "@mizan_pending_register";

/**
 * SecureStore only accepts [A-Za-z0-9._-] keys: the historical "@…" names
 * (still used for AsyncStorage on web and for migrating old sessions) are
 * invalid there and made every native token write throw.
 */
function secureKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "");
}

let warnedTunnel = false;

export function getApiBaseUrl(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const port = process.env.EXPO_PUBLIC_API_PORT ?? "5000";
  if (!apiUrl && !domain && !__DEV__) {
    console.error(
      "[API] EXPO_PUBLIC_DOMAIN is not set — requests will fail in production.",
    );
  }
  const metroHost = Constants.expoConfig?.hostUri?.split("/")[0].split(":")[0];
  // A local or emulator API address cannot be reached from a phone through the tunnel either.
  const localApi = !apiUrl || /\/\/(localhost|127\.0\.0\.1|10\.0\.[23]\.2)(:|\/)/.test(apiUrl);
  if (__DEV__ && localApi && !domain && isTunnelHost(metroHost) && !warnedTunnel) {
    warnedTunnel = true;
    console.warn(
      "[API] Expo tunnel mode: the tunnel serves the app's code only, not the API on port 5000. " +
        "Expose the API (e.g. cloudflared tunnel --url http://localhost:5000) and set " +
        "EXPO_PUBLIC_API_URL=https://…/api, or use LAN mode (pnpm dev) with the phone on the same Wi-Fi.",
    );
  }
  return resolveApiBaseUrl({
    apiUrl,
    domain,
    port,
    isDev: __DEV__,
    platform: Platform.OS,
    hostUri: Constants.expoConfig?.hostUri,
  });
}

export async function getToken(): Promise<string | null> {
  try {
    if (Platform.OS !== "web") {
      const secureToken = await SecureStore.getItemAsync(secureKey(TOKEN_KEY));
      if (secureToken) return secureToken;

      const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
      if (legacyToken) {
        await SecureStore.setItemAsync(secureKey(TOKEN_KEY), legacyToken);
        await AsyncStorage.removeItem(TOKEN_KEY);
      }
      return legacyToken;
    }
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS !== "web") {
    await SecureStore.setItemAsync(secureKey(TOKEN_KEY), token);
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  if (Platform.OS !== "web") {
    await SecureStore.deleteItemAsync(secureKey(TOKEN_KEY));
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    if (Platform.OS !== "web") {
      const secureToken = await SecureStore.getItemAsync(secureKey(REFRESH_TOKEN_KEY));
      if (secureToken) return secureToken;

      const legacyToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
      if (legacyToken) {
        await SecureStore.setItemAsync(secureKey(REFRESH_TOKEN_KEY), legacyToken);
        await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
      }
      return legacyToken;
    }
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  if (Platform.OS !== "web") {
    await SecureStore.setItemAsync(secureKey(REFRESH_TOKEN_KEY), token);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export async function removeRefreshToken(): Promise<void> {
  if (Platform.OS !== "web") {
    await SecureStore.deleteItemAsync(secureKey(REFRESH_TOKEN_KEY));
  }
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function clearAllTokens(): Promise<void> {
  clearFileTicket();
  await Promise.all([removeToken(), removeRefreshToken()]);
}

export async function getPendingRegistration(): Promise<string | null> {
  try {
    if (Platform.OS !== "web") {
      const secureData = await SecureStore.getItemAsync(secureKey(PENDING_REGISTER_KEY));
      if (secureData) return secureData;

      const legacyData = await AsyncStorage.getItem(PENDING_REGISTER_KEY);
      if (legacyData) {
        await SecureStore.setItemAsync(secureKey(PENDING_REGISTER_KEY), legacyData);
        await AsyncStorage.removeItem(PENDING_REGISTER_KEY);
      }
      return legacyData;
    }
    return await AsyncStorage.getItem(PENDING_REGISTER_KEY);
  } catch {
    return null;
  }
}

export async function setPendingRegistration(value: string): Promise<void> {
  if (Platform.OS !== "web") {
    await SecureStore.setItemAsync(secureKey(PENDING_REGISTER_KEY), value);
    await AsyncStorage.removeItem(PENDING_REGISTER_KEY);
    return;
  }
  await AsyncStorage.setItem(PENDING_REGISTER_KEY, value);
}

export async function removePendingRegistration(): Promise<void> {
  if (Platform.OS !== "web") {
    await SecureStore.deleteItemAsync(secureKey(PENDING_REGISTER_KEY));
  }
  await AsyncStorage.removeItem(PENDING_REGISTER_KEY);
}

// ─── Token Refresh Logic ──────────────────────────────────────────────────────

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

// Session events, so the auth state follows what happens to the tokens in
// the background (renewed after 15 min, or revoked on the server).
type SessionListener = { expired?: (reason?: string) => void; renewed?: (token: string) => void };
const sessionListeners = new Set<SessionListener>();
export function subscribeSession(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/** Renews the access token with the stored refresh token (single flight). */
export function refreshAccessToken(): Promise<string | null> {
  return attemptTokenRefresh();
}

async function attemptTokenRefresh(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshQueue.push(resolve);
    });
  }

  isRefreshing = true;

  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      isRefreshing = false;
      refreshQueue.forEach((cb) => cb(null));
      refreshQueue = [];
      return null;
    }

    const res = await fetchWithTimeout(`${getApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      isRefreshing = false;
      refreshQueue.forEach((cb) => cb(null));
      refreshQueue = [];
      // Only a definitive refusal ends the session. Rate limiting or a server
      // error is transient: keep the tokens and let the user retry.
      if (res.status === 401 || res.status === 403) {
        const reason = ((await res.json().catch(() => null)) as { code?: string } | null)?.code;
        await clearAllTokens();
        sessionListeners.forEach((l) => l.expired?.(reason));
      }
      return null;
    }

    const json = await res.json();
    const newToken: string = json.data?.token;
    const newRefreshToken: string = json.data?.refreshToken;

    if (newToken) await setToken(newToken);
    if (newRefreshToken) await setRefreshToken(newRefreshToken);

    isRefreshing = false;
    refreshQueue.forEach((cb) => cb(newToken));
    refreshQueue = [];
    if (newToken) sessionListeners.forEach((l) => l.renewed?.(newToken));

    return newToken;
  } catch {
    isRefreshing = false;
    refreshQueue.forEach((cb) => cb(null));
    refreshQueue = [];
    return null;
  }
}

// ─── Core request function with auto-retry on 401 ────────────────────────────

export function request<T>(
  path: string,
  options: RequestInit = {},
  withAuth = true,
  _isRetry = false,
): Promise<T> {
  if (_isRetry) return send<T>(path, options, withAuth, true);
  return dropDuplicateWrite(options.method, path, options.body ?? undefined, () => send<T>(path, options, withAuth, false));
}

async function send<T>(path: string, options: RequestInit, withAuth: boolean, _isRetry: boolean): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Language": requestLanguage(),
    ...(options.headers as Record<string, string>),
  };

  if (withAuth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetchWithTimeout(`${getApiBaseUrl()}${path.trim()}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && withAuth && !_isRetry) {
    const newToken = await attemptTokenRefresh();
    if (newToken) {
      return request<T>(path, options, withAuth, true);
    }
    // Refresh failed — propagate 401 so AuthContext can sign the user out
    const errJson = await res.json().catch(() => ({}));
    const err: any = new Error((errJson as any).error || "Session expirée");
    err.status = 401;
    throw err;
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err: any = new Error(
      (json as any).message || (json as any).error || `HTTP ${res.status}`,
    );
    err.status = res.status;
    if ((json as any).code) err.code = (json as any).code;
    // Carry the full error payload so callers can react to structured fields
    // (e.g. tie-detection candidate lists) without re-parsing the response.
    err.body = json;
    throw err;
  }

  return json as T;
}

// ─── Download tickets ────────────────────────────────────────────────────────
// URLs opened outside fetch (Linking.openURL, <Image>, WebView) cannot carry an
// Authorization header. They get a short-lived, GET-only ticket in ?token=
// instead of the session token, which must never appear in a URL.

let fileTicketCache: { ticket: string; expiresAt: number } | null = null;
let fileTicketInFlight: Promise<string | null> | null = null;

export async function getFileTicket(): Promise<string | null> {
  // Reuse a cached ticket while it has at least 60 s of validity left.
  if (fileTicketCache && fileTicketCache.expiresAt - Date.now() > 60_000) {
    return fileTicketCache.ticket;
  }
  if (!fileTicketInFlight) {
    fileTicketInFlight = request<{ data: { ticket: string; expiresIn: number } }>(
      "/auth/file-ticket",
      { method: "POST" },
    )
      .then(({ data }) => {
        fileTicketCache = {
          ticket: data.ticket,
          expiresAt: Date.now() + data.expiresIn * 1000,
        };
        return data.ticket;
      })
      .catch(() => null)
      .finally(() => {
        fileTicketInFlight = null;
      });
  }
  return fileTicketInFlight;
}

export function clearFileTicket(): void {
  fileTicketCache = null;
}

/** Appends a download ticket to an API URL (keeps existing query params). */
export function withFileTicket(url: string, ticket: string | null): string {
  if (!ticket) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(ticket)}`;
}

/** Full API URL for a protected GET resource, ready for Linking.openURL. */
export async function ticketedUrl(path: string): Promise<string> {
  const url = path.startsWith("http") ? path : `${getApiBaseUrl()}${path}`;
  return withFileTicket(url, await getFileTicket());
}
