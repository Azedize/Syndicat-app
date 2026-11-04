// Organizations endpoints and their types.
import { request } from "@/services/api/client";

// ─── Syndicates ───────────────────────────────────────────────────────────────

export const syndicates = {
  list: () => request<{ data: unknown[] }>("/syndicates"),
  get: (id: string) => request<{ data: unknown }>(`/syndicates/${id}`),
  create: (data: unknown) =>
    request<{ data: unknown }>("/syndicates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── Syndic companies, condominiums, assignments, portfolio ──────────────────

export type CondominiumStatus = "draft" | "active" | "suspended" | "archived";
export type TeamRole = "syndicate_admin" | "president" | "treasurer" | "secretary" | "committee_member";
export type MoneyByCurrency = { currency: string; amount: string }[];
export interface PortfolioRow {
  id: string;
  name: string;
  city: string | null;
  status: CondominiumStatus;
  currency: string;
  buildings: number;
  units: number;
  vacantUnits: number;
  coOwners: number;
  outstanding: string;
  overdueCalls: number;
  paymentsToValidate: number;
  openIncidents: number;
  treasury: string;
}
export interface Portfolio {
  condominiums: PortfolioRow[];
  totals: {
    condominiums: number;
    activeCondominiums: number;
    buildings: number;
    units: number;
    vacantUnits: number;
    coOwners: number;
    outstanding: MoneyByCurrency;
    overdueCalls: number;
    paymentsToValidate: number;
    openIncidents: number;
    treasury: MoneyByCurrency;
  } | null;
  definitions: Record<string, string>;
}
export interface CondominiumInput {
  name: string;
  address: string;
  city: string;
  email?: string;
  phone?: string;
  registrationNumber?: string;
  currency?: string;
  defaultLanguage?: "fr" | "ar" | "en" | "es";
  fiscalYearStartMonth?: number;
}

export const organizations = {
  mine: () => request<{ data: { id: string; name: string; status: string; role: "org_admin" | "org_staff" }[] }>("/organizations/mine"),
  portfolio: (orgId: string) => request<{ data: Portfolio }>(`/organizations/${encodeURIComponent(orgId)}/portfolio`),
  outstanding: (orgId: string, syndicateId: string) =>
    request<{ data: { id: string; period: string; type: string; status: string; due_date: string | null; remaining: string; lot_number: string; owner_name: string | null }[] }>(
      `/organizations/${encodeURIComponent(orgId)}/portfolio/${encodeURIComponent(syndicateId)}/outstanding`,
    ),
  incidents: (orgId: string, syndicateId: string) =>
    request<{ data: { kind: "ticket" | "sinistre" | "travaux"; id: string; label: string; status: string; created_at: string }[] }>(
      `/organizations/${encodeURIComponent(orgId)}/portfolio/${encodeURIComponent(syndicateId)}/incidents`,
    ),
  /** The key makes a retried submission return the condominium already created. */
  createCondominium: (orgId: string, body: CondominiumInput, idempotencyKey: string) =>
    request<{ data: { id: string; name: string; status: CondominiumStatus }; replayed?: boolean }>(
      `/organizations/${encodeURIComponent(orgId)}/condominiums`,
      { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": idempotencyKey } },
    ),
  setStatus: (syndicateId: string, status: Exclude<CondominiumStatus, "draft">, reason?: string) =>
    request<{ data: { id: string; status: CondominiumStatus } }>(`/condominiums/${encodeURIComponent(syndicateId)}/status`, {
      method: "POST",
      body: JSON.stringify(reason ? { status, reason } : { status }),
    }),
  memberships: (syndicateId: string) =>
    request<{
      data: {
        assignments: { id: string; userId: string; name: string; email: string; role: TeamRole; status: "active" | "revoked"; createdAt: string; revokedAt: string | null }[];
        homeTeam: { userId: string; name: string; email: string; role: TeamRole }[];
      };
    }>(`/condominiums/${encodeURIComponent(syndicateId)}/memberships`),
  assign: (syndicateId: string, email: string, role: TeamRole) =>
    request<{ data: { id: string } }>(`/condominiums/${encodeURIComponent(syndicateId)}/memberships`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  changeRole: (syndicateId: string, membershipId: string, role: TeamRole) =>
    request<{ data: { id: string } }>(`/condominiums/${encodeURIComponent(syndicateId)}/memberships/${encodeURIComponent(membershipId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  revoke: (syndicateId: string, membershipId: string) =>
    request<{ data: { id: string } }>(`/condominiums/${encodeURIComponent(syndicateId)}/memberships/${encodeURIComponent(membershipId)}`, {
      method: "DELETE",
    }),
};
