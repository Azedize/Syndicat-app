/**
 * usePermission — centralised RBAC hook for the mobile UI.
 *
 * Usage:
 *   const canManageBudgets = usePermission("write:budgets");
 *   const { isSuperAdmin, isSyndicateAdmin } = useRole();
 */

import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/context/AuthContext";

export type PermissionAction =
  // Viewing
  | "view:admin-panel"
  | "view:finance"
  | "view:members"
  | "view:marketplace"
  | "view:budget"
  | "view:buildings"
  | "view:lots"
  | "view:tenants"
  | "view:elections"
  | "view:documents"
  | "view:audit-log"
  | "view:platform-stats"
  | "view:charges"
  | "view:meetings"
  | "view:incidents"
  | "view:prestataires"
  // Platform management (super_admin only)
  | "manage:syndicates"
  | "manage:subscriptions"
  | "manage:users"
  // Syndicate operations (syndicate_admin only)
  | "write:buildings"
  | "write:budgets"
  | "write:members"
  | "write:charges"
  | "write:meetings"
  | "write:documents"
  | "write:incidents"
  | "write:prestataires"
  // Member / tenant actions
  | "submit:incident"
  | "submit:payment"
  | "vote"
  | "view:my-apartment";

const PERMISSIONS: Record<PermissionAction, UserRole[]> = {
  // Viewing — what each role can see
  "view:admin-panel":     ["super_admin", "syndicate_admin"],
  "view:finance":         ["super_admin", "syndicate_admin"],
  "view:members":         ["super_admin", "syndicate_admin"],
  "view:marketplace":     ["super_admin", "syndicate_admin", "member"],
  "view:budget":          ["super_admin", "syndicate_admin"],
  "view:buildings":       ["super_admin", "syndicate_admin", "member", "tenant"],
  "view:lots":            ["super_admin", "syndicate_admin", "member", "tenant"],
  "view:tenants":         ["super_admin", "syndicate_admin"],
  "view:elections":       ["super_admin", "syndicate_admin", "member"],
  "view:documents":       ["super_admin", "syndicate_admin", "member", "tenant"],
  "view:audit-log":       ["super_admin", "syndicate_admin"],
  "view:platform-stats":  ["super_admin"],
  "view:charges":         ["super_admin", "syndicate_admin", "member"],
  "view:meetings":        ["super_admin", "syndicate_admin", "member"],
  "view:incidents":       ["super_admin", "syndicate_admin", "member", "tenant"],
  "view:prestataires":    ["super_admin", "syndicate_admin"],
  // Platform management
  "manage:syndicates":    ["super_admin"],
  "manage:subscriptions": ["super_admin"],
  "manage:users":         ["super_admin"],
  // Syndicate operations
  "write:buildings":      ["syndicate_admin"],
  "write:budgets":        ["syndicate_admin"],
  "write:members":        ["syndicate_admin"],
  "write:charges":        ["syndicate_admin"],
  "write:meetings":       ["super_admin", "syndicate_admin"],
  "write:documents":      ["super_admin", "syndicate_admin"],
  "write:incidents":      ["super_admin", "syndicate_admin"],
  "write:prestataires":   ["syndicate_admin"],
  // Member / tenant
  "submit:incident":      ["super_admin", "syndicate_admin", "member", "tenant"],
  "submit:payment":       ["member"],
  "vote":                 ["member"],
  "view:my-apartment":    ["member", "tenant"],
};

/**
 * Returns true if the currently signed-in user has permission to perform the action.
 */
export function usePermission(action: PermissionAction): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return PERMISSIONS[action]?.includes(user.role) ?? false;
}

/**
 * Returns structured role booleans for convenient conditional rendering.
 */
export function useRole() {
  const { user } = useAuth();
  const role = user?.role ?? "member";
  return {
    role,
    isSuperAdmin:     role === "super_admin",
    isSyndicateAdmin: role === "syndicate_admin",
    isAdmin:          role === "super_admin" || role === "syndicate_admin",
    isMember:         role === "member",
    isTenant:         role === "tenant",
    /** True if the user can participate in member-level actions (not tenant) */
    isOwner:          role === "member",
  };
}
