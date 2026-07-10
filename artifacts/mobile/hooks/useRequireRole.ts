import { useEffect } from "react";
import { router } from "expo-router";
import { useAuth, type UserRole } from "@/context/AuthContext";

/**
 * Route-level guard: redirects away from a screen if the current user's role
 * is not in `allowedRoles`. Mobile navigation (expo-router) has no built-in
 * per-route access control — hiding a menu item does not stop direct/deep-link
 * navigation, so screens that show role-restricted data must call this hook.
 *
 * Usage: `useRequireRole(["super_admin", "syndicate_admin"]);` at the top of
 * the screen component, before rendering any restricted content.
 */
export function useRequireRole(allowedRoles: UserRole[]) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user || !allowedRoles.includes(user.role)) {
      router.replace("/(tabs)/" as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);

  return { user, allowed: !!user && allowedRoles.includes(user.role), isLoading };
}
