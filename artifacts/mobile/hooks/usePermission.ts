/**
 * usePermission — centralised RBAC hook for the mobile UI.
 *
 * Roles (must stay in sync with AuthContext.tsx and API auth middleware):
 *   super_admin      — SaaS platform owner.
 *   syndicate_admin  — Full operational manager of a syndicate.
 *   president        — Elected president: governance, signatures, assemblies.
 *   treasurer        — Elected treasurer: finance, budgets, charges, debt recovery.
 *   secretary        — Appointed secretary: documents, meetings, minutes, publications.
 *   committee_member — Council member: votes/meetings (read-only elsewhere).
 *   member           — Co-owner / resident: payments, documents, complaints, votes.
 *   tenant           — Renter: documents, complaints, maintenance requests.
 *
 * Usage:
 *   const canManageBudgets = usePermission("write:budgets");
 *   const { isTreasurer, isSecretary } = useRole();
 */

import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/context/AuthContext";

/** Roles that form the syndicate management team */
export const SYNDICATE_TEAM_ROLES: UserRole[] = [
  "syndicate_admin",
  "president",
  "treasurer",
  "secretary",
  "committee_member",
];

export function isSyndicateTeam(role: UserRole): boolean {
  return SYNDICATE_TEAM_ROLES.includes(role);
}

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
  | "view:governance"
  // Platform management (super_admin only)
  | "manage:syndicates"
  | "manage:subscriptions"
  | "manage:users"
  // Syndicate operations (admin + role-specific)
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
  // ─── Viewing ────────────────────────────────────────────────────────────────
  "view:admin-panel":    ["super_admin", "syndicate_admin"],
  // Finance: admin + treasurer only (secretary/committee cannot see financials)
  "view:finance":        ["syndicate_admin", "treasurer"],
  // Members: admin + president (needs membership list for governance)
  "view:members":        ["super_admin", "syndicate_admin", "president"],
  // Marketplace: admin only (team members don't run a marketplace shop)
  "view:marketplace":    ["syndicate_admin"],
  // Budget: admin + treasurer
  "view:budget":         ["syndicate_admin", "treasurer"],
  // Buildings/lots: all roles can view residence structure
  "view:buildings":      ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"],
  "view:lots":           ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"],
  // Tenants list: admin management only
  "view:tenants":        ["syndicate_admin"],
  // Elections: all except super_admin (platform owner doesn't vote in syndicates)
  "view:elections":      ["syndicate_admin", "president", "secretary", "committee_member", "member"],
  // Documents: everyone except super_admin (platform docs are in template studio)
  "view:documents":      ["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"],
  // Audit log: platform owner + admin only
  "view:audit-log":      ["super_admin", "syndicate_admin"],
  // Platform stats: super_admin only
  "view:platform-stats": ["super_admin"],
  // Charges: admin + treasurer + member (members see their own)
  "view:charges":        ["syndicate_admin", "treasurer", "member"],
  // Meetings: all team + member (participates)
  "view:meetings":       ["syndicate_admin", "president", "secretary", "committee_member", "member"],
  // Incidents: admin + member + tenant (submit their own)
  "view:incidents":      ["syndicate_admin", "president", "secretary", "member", "tenant"],
  // Vendors: admin only
  "view:prestataires":   ["syndicate_admin", "president"],
  // Governance screen (elected board overview): team roles
  "view:governance":     ["syndicate_admin", "president", "secretary", "committee_member"],
  // ─── Platform management ────────────────────────────────────────────────────
  "manage:syndicates":   ["super_admin"],
  "manage:subscriptions":["super_admin"],
  "manage:users":        ["super_admin"],
  // ─── Syndicate write operations ─────────────────────────────────────────────
  "write:buildings":     ["syndicate_admin"],
  // Finance writes: admin + treasurer
  "write:budgets":       ["syndicate_admin", "treasurer"],
  "write:charges":       ["syndicate_admin", "treasurer"],
  // Member management: admin only
  "write:members":       ["syndicate_admin"],
  // Meeting management: admin + president + secretary
  "write:meetings":      ["syndicate_admin", "president", "secretary"],
  // Document management: admin + secretary + president (signs)
  "write:documents":     ["syndicate_admin", "secretary", "president"],
  // Incidents: admin + president (oversight)
  "write:incidents":     ["syndicate_admin", "president"],
  // Vendor contracts: admin only
  "write:prestataires":  ["syndicate_admin"],
  // ─── Member / tenant actions ────────────────────────────────────────────────
  "submit:incident":     ["syndicate_admin", "president", "secretary", "committee_member", "member", "tenant"],
  "submit:payment":      ["member"],
  // Voting: owners (members) + management team
  "vote":                ["syndicate_admin", "president", "secretary", "committee_member", "member"],
  "view:my-apartment":   ["member", "tenant"],
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
  const role: UserRole = (user?.role ?? "member") as UserRole;

  const isSuperAdmin     = role === "super_admin";
  const isSyndicateAdmin = role === "syndicate_admin";
  const isPresident      = role === "president";
  const isTreasurer      = role === "treasurer";
  const isSecretary      = role === "secretary";
  const isCommitteeMember = role === "committee_member";
  const isMember         = role === "member";
  const isTenant         = role === "tenant";

  /** True for any of the 5 syndicate management team roles */
  const isSyndicateTeamMember = isSyndicateTeam(role);

  /** True for super_admin or syndicate_admin (platform/full operational admin) */
  const isAdmin = isSuperAdmin || isSyndicateAdmin;

  /** True if user is a co-owner who can vote and pays charges */
  const isOwner = isMember;

  return {
    role,
    isSuperAdmin,
    isSyndicateAdmin,
    isPresident,
    isTreasurer,
    isSecretary,
    isCommitteeMember,
    isMember,
    isTenant,
    isSyndicateTeamMember,
    isAdmin,
    isOwner,
  };
}
