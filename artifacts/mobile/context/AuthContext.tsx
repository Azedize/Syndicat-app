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

export type UserRole = "super_admin" | "syndicate_admin" | "member";

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
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapApiUser(u: Record<string, unknown>): AuthUser {
  return {
    id: String(u.id ?? ""),
    name: String(u.name ?? ""),
    email: String(u.email ?? ""),
    role: (u.role as UserRole) ?? "member",
    syndicateId: (u.syndicateId as string) ?? undefined,
    avatar: (u.avatar as string) ?? undefined,
    memberSince:
      (u.memberSince as string) ??
      (u.createdAt ? String(u.createdAt).slice(0, 10) : undefined),
    status: (u.status as "active" | "inactive") ?? "active",
    phone: (u.phone as string) ?? undefined,
    profession: (u.profession as string) ?? undefined,
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
            setUser(mapApiUser(res.data as unknown as Record<string, unknown>));
          } catch (err: any) {
            if (err?.status === 401) {
              await clearAllTokens();
              setTokenState(null);
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
        setUser(mapApiUser(u as unknown as Record<string, unknown>));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      const rt = await getRefreshToken();
      if (rt) {
        await authApi.logout(rt).catch(() => {});
      }
    } catch {}
    await clearAllTokens();
    await AsyncStorage.multiRemove(["@syndycat_user", "@syndycat_demo_email"]);
    setTokenState(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((data: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, logout, updateUser }}
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
