import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  auth as authApi,
  getToken,
  setToken,
  removeToken,
  getRefreshToken,
  setRefreshToken,
  removeRefreshToken,
  clearAllTokens,
} from "../services/api";

/**
 * Platform roles — must stay in sync with the API server's UserRole type.
 *   super_admin      — SaaS platform owner.
 *   syndicate_admin  — Full operational manager of a syndicate.
 *   president        — Elected president: governance, signatures, assemblies.
 *   treasurer        — Elected treasurer: finance, budgets, charges, debt recovery.
 *   secretary        — Appointed secretary: documents, meetings, minutes, publications.
 *   committee_member — Council member: participates in votes/meetings (read-only elsewhere).
 *   member           — Co-owner / resident: payments, documents, complaints, votes.
 *   tenant           — Renter: documents, complaints, maintenance requests.
 */
export type UserRole =
  | "super_admin"
  | "syndicate_admin"
  | "president"
  | "treasurer"
  | "secretary"
  | "committee_member"
  | "member"
  | "tenant";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  syndicate?: string;
  syndicateId?: string | null;
  avatar?: string;
  memberSince?: string;
  status: "active" | "inactive";
  phone?: string;
  profession?: string;
  /** Invitation accounts must replace their temporary password first. */
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithTokens: (
    token: string,
    refreshToken: string,
    user: Record<string, unknown>,
  ) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Last known profile, so a signed-in resident still opens the app when the API
 * is unreachable at launch (offline, server restart). Non-secret data only;
 * tokens stay in SecureStore. Cleared on logout and on a refused session.
 */
const USER_CACHE_KEY = "@syndycat_user";

async function cacheUser(u: AuthUser): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
  } catch {
    // Cache is a convenience; the live session does not depend on it.
  }
}

async function readCachedUser(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function mapApiUser(u: Record<string, unknown>): AuthUser {
  return {
    id: String(u.id ?? ""),
    name: String(u.name ?? ""),
    email: String(u.email ?? ""),
    role: (u.role as UserRole) ?? "member",
    syndicate: u.syndicate
      ? String(u.syndicate)
      : u.syndicateName
        ? String(u.syndicateName)
        : undefined,
    syndicateId: (u.syndicateId as string) ?? undefined,
    avatar: (u.avatar as string) ?? undefined,
    memberSince:
      (u.memberSince as string) ??
      (u.createdAt ? String(u.createdAt).slice(0, 10) : undefined),
    status: (u.status as "active" | "inactive") ?? "active",
    phone: (u.phone as string) ?? undefined,
    profession: (u.profession as string) ?? undefined,
    mustChangePassword: u.mustChangePassword === true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await getToken();
        if (storedToken) {
          setTokenState(storedToken);
          try {
            const res = await authApi.me();
            const u = mapApiUser(res.data as unknown as Record<string, unknown>);
            setUser(u);
            await cacheUser(u);
          } catch (err: any) {
            if (err?.status === 401) {
              // The server refused the session (expired or revoked).
              await clearAllTokens();
              await AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
              setTokenState(null);
            } else {
              // API unreachable: keep the session and open with the last known
              // profile; requests resume once the network is back.
              const cached = await readCachedUser();
              if (cached) setUser(cached);
            }
          }
        }
      } catch {
        await clearAllTokens();
        setTokenState(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const emailLower = email.trim().toLowerCase();
      try {
        const res = await authApi.login(emailLower, password);
        const { token: newToken, refreshToken, user: u } = res.data;
        await setToken(newToken);
        if (refreshToken) await setRefreshToken(refreshToken);
        setTokenState(newToken);
        const mapped = mapApiUser(u as unknown as Record<string, unknown>);
        setUser(mapped);
        await cacheUser(mapped);
        return true;
      } catch (error: any) {
        if (error?.status === 401 || error?.httpStatus === 401) {
          return false;
        }
        throw error;
      }
    },
    [],
  );

  const loginWithTokens = useCallback(
    async (
      newToken: string,
      newRefreshToken: string,
      u: Record<string, unknown>,
    ): Promise<void> => {
      await setToken(newToken);
      await setRefreshToken(newRefreshToken);
      setTokenState(newToken);
      const mapped = mapApiUser(u);
      setUser(mapped);
      await cacheUser(mapped);
    },
    [],
  );

  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const refreshTokenValue = await getRefreshToken();
      if (!refreshTokenValue) return;
      const res = await authApi.refresh(refreshTokenValue);
      const { token: newToken, refreshToken: newRefreshToken } = res.data;
      if (newToken) {
        await setToken(newToken);
        setTokenState(newToken);
      }
      if (newRefreshToken) await setRefreshToken(newRefreshToken);
      // Re-fetch user to get updated syndicateId
      const meRes = await authApi.me();
      const u = mapApiUser(meRes.data as unknown as Record<string, unknown>);
      setUser(u);
      await cacheUser(u);
    } catch (err) {
      // Silently fail — user will get stale data but remains logged in
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const rt = await getRefreshToken();
      if (rt) {
        await authApi.logout(rt).catch(() => {});
      }
    } catch {}
    await clearAllTokens();
    await AsyncStorage.multiRemove([USER_CACHE_KEY, "@syndycat_demo_email"]);
    setTokenState(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((data: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...data };
      void cacheUser(next);
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        loginWithTokens,
        refreshSession,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
