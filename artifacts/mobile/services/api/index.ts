// API endpoints by domain. Feature-specific endpoints live in features/<feature>/api.ts.
export * from "./client";
import { request } from "./client";
import { parseLoginResponse } from "@/lib/login-transport";

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role:
    | "super_admin"
    | "syndicate_admin"
    | "president"
    | "treasurer"
    | "secretary"
    | "committee_member"
    | "member"
    | "tenant";
  syndicateId?: string | null;
  phone?: string | null;
  profession?: string | null;
  avatar?: string | null;
  status: "active" | "inactive";
  memberSince?: string | null;
  createdAt?: string | null;
}

export const auth = {
  login: async (email: string, password: string) =>
    parseLoginResponse<ApiUser>(
      await request<unknown>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
        false,
      ),
    ),

  refresh: (refreshToken: string) =>
    request<{ data: { token: string; refreshToken: string } }>(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
      false,
    ),

  logout: (refreshToken?: string) =>
    request<{ message: string }>(
      "/auth/logout",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
      false,
    ),

  me: () => request<{ data: ApiUser }>("/auth/me"),

  /** Condominiums this account can act in, with its role in each. */
  contexts: () =>
    request<{ data: { syndicateId: string; name: string; city: string | null; status: string; organizationName: string | null; role: string; via: string; current: boolean }[] }>("/me/contexts"),

  /** Switches the session to another condominium (server decides the role). */
  switchContext: (syndicateId: string, refreshToken: string) =>
    request<{ data: { token: string; refreshToken: string; context: { syndicateId: string; role: string; name?: string } } }>("/auth/context", {
      method: "POST",
      body: JSON.stringify({ syndicateId, refreshToken }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  updateProfile: (
    data: Partial<Pick<ApiUser, "name" | "phone" | "profession" | "avatar">>,
  ) =>
    request<{ data: ApiUser; message: string }>("/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  register: (data: {
    name: string;
    email: string;
    phone?: string;
    password: string;
  }) =>
    request<{ data: { token: string; refreshToken: string; user: ApiUser } }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      false,
    ),

  forgotPassword: (email: string) =>
    request<{ message: string }>(
      "/auth/forgot-password",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      false,
    ),

  /** { email, code } from the reset e-mail, or { token } from a former reset link. */
  resetPassword: (proof: { email: string; code: string } | { token: string }, newPassword: string) =>
    request<{ message: string }>(
      "/auth/reset-password",
      {
        method: "POST",
        body: JSON.stringify({ ...proof, newPassword }),
      },
      false,
    ),
};

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export const audit = {
  getLogs: () =>
    request<{
      data: Array<{
        id: string;
        userId: string;
        userName: string | null;
        syndicateId: string | null;
        action: string;
        entity: string;
        entityId: string | null;
        details: string | null;
        createdAt: string;
      }>;
    }>("/audit"),

  log: (action: string, entity: string, entityId?: string, details?: string) =>
    request<{ message: string }>("/audit", {
      method: "POST",
      body: JSON.stringify({ action, entity, entityId, details }),
    }),
};

// ─── Content: cotisations, legal, support, subscriptions, etc. ───────────────

export const content = {
  cotisations: () => request<{ data: unknown[] }>("/cotisations"),
  createCotisation: (data: {
    memberId: string;
    label: string;
    period: string;
    amount: number;
    dueDate: string;
    status?: "pending" | "paid" | "overdue";
  }) =>
    request<{ data: unknown; message: string }>("/cotisations", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  payCotisation: (id: string, proofUrl?: string) =>
    request<{ data: unknown }>(`/cotisations/${id}/pay`, {
      method: "PUT",
      body: proofUrl ? JSON.stringify({ proofUrl }) : "{}",
    }),

  legalAlerts: () => request<{ data: unknown[] }>("/legal-alerts"),
  resolveLegalAlert: (id: string) =>
    request<{ data: unknown }>(`/legal-alerts/${id}/resolve`, {
      method: "PUT",
    }),

  supportTickets: () => request<{ data: unknown[] }>("/support"),
  createTicket: (data: unknown) =>
    request<{ data: unknown }>("/support", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resolveTicket: (id: string) =>
    request<{ data: unknown }>(`/support/${id}/resolve`, { method: "PUT" }),

  subscriptionPlans: () => request<{ data: unknown[] }>("/subscriptions/plans"),
  subscriptions: () => request<{ data: unknown[] }>("/subscriptions"),
  updateSubscription: (id: string, planId: string) =>
    request<{ data: unknown }>(`/subscriptions/${id}`, {
      method: "PUT",
      body: JSON.stringify({ planId }),
    }),

  auditLog: (entry: {
    action: string;
    entity: string;
    entityId?: string;
    details?: string;
  }) =>
    request<{ message: string }>("/audit", {
      method: "POST",
      body: JSON.stringify(entry),
    }),
  getAuditLogs: () => request<{ data: unknown[] }>("/audit"),

  partners: () => request<{ data: unknown[] }>("/partners"),
  addPartner: (data: unknown) =>
    request<{ data: unknown }>("/partners", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePartnerStatus: (id: string, status: string) =>
    request<{ data: unknown }>(`/partners/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),

  payslips: () => request<{ data: unknown[] }>("/payslips"),
  generatePayslip: (employeeId: string, month: string) =>
    request<{ data: unknown }>("/payslips", {
      method: "POST",
      body: JSON.stringify({ employeeId, month }),
    }),
};
