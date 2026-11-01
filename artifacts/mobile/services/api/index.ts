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

  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>(
      "/auth/reset-password",
      {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
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

// ─── Locataires (tenant lease info) ────────────────────────────────────────────

export interface ApiTenantLease {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lotId: string | null;
  buildingId: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  monthlyRent: string | null;
  depositAmount: string | null;
  status: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  createdAt: string;
  lotNumber: string | null;
  floor: number | null;
  lotType: string | null;
  buildingName: string | null;
  buildingAddress: string | null;
}

export const locataires = {
  myLease: () => request<{ data: ApiTenantLease }>("/locataires/my-lease"),
};

// ─── Members ─────────────────────────────────────────────────────────────────

export const members = {
  list: (params?: {
    syndicateId?: string;
    status?: string;
    search?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.syndicateId) qs.set("syndicateId", params.syndicateId);
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    return request<{ data: unknown[] }>(`/members?${qs}`);
  },
  get: (id: string) => request<{ data: unknown }>(`/members/${id}`),
  create: (data: unknown) =>
    request<{ data: unknown }>("/members", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: unknown) =>
    request<{ data: unknown }>(`/members/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateStatus: (id: string, status: string) =>
    request<{ data: unknown }>(`/members/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
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

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface PlatformStats {
  totalSyndicates: number;
  activeSyndicates: number;
  totalMembers: number;
  activeMembers: number;
  totalRevenue: number;
  totalExpenses: number;
  openTickets: number;
  charts: {
    revenue: { label: string; value: number }[];
    members: { label: string; value: number }[];
    expenses: { label: string; value: number }[];
  };
}

export interface HRStats {
  totalMembers: number;
  activeMembers: number;
  cotisationRate: number;
  overdueMembers: number;
  paidCotisations: number;
  totalCotisations: number;
  charts: {
    adhesions: { label: string; valeur: number }[];
    cotisations: { label: string; valeur: number }[];
    actions: { label: string; valeur: number }[];
  };
}

export interface FinanceSummary {
  caisseBalance: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  totalRevenue: number;
  totalExpenses: number;
}

export interface EnrichedSyndicate {
  id: string;
  name: string;
  region: string;
  sector: string;
  members: number;
  activeMembers: number;
  cotisationRate: number;
  balance: number;
  pendingElections: number;
  openTickets: number;
  status: "healthy" | "warning" | "critical";
  adminName: string;
  adminId?: string | null;
  syStatus: string;
}

export const statistics = {
  platform: () => request<{ data: PlatformStats }>("/statistics/platform"),
  hr: () => request<{ data: HRStats }>("/statistics/hr"),
  financeSummary: () =>
    request<{ data: FinanceSummary }>("/statistics/finance/summary"),
  reports: (period: "month" | "quarter" | "year") =>
    request<{
      data: {
        revenueChart: { label: string; value: number }[];
        membersChart: { label: string; value: number }[];
        kpi: {
          revenues: number;
          expenses: number;
          memberGrowth: number;
          cotisationRate: number | null;
        };
      };
    }>(`/statistics/reports?period=${period}`),
  syndicates: () =>
    request<{ data: EnrichedSyndicate[] }>("/statistics/syndicates"),
};

// ─── P11: Team Directory ──────────────────────────────────────────────────────

export interface ApiTeamMember {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  committeeRole?: string | null;
  joinDate?: string | null;
  type: "admin" | "committee";
}

export const team = {
  list: () =>
    request<{
      data: ApiTeamMember[];
      syndicate: {
        name: string;
        address?: string | null;
        email?: string | null;
        phone?: string | null;
      };
    }>("/team"),
  updateSyndicate: (data: {
    phone?: string;
    email?: string;
    address?: string;
    website?: string;
  }) =>
    request<{ message: string }>("/team/syndicate", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateMember: (id: string, committeeRole: string) =>
    request<{ message: string }>(`/team/members/${id}`, {
      method: "PUT",
      body: JSON.stringify({ committeeRole }),
    }),
  invite: (data: {
    name: string;
    email: string;
    phone?: string;
    role: string;
  }) =>
    request<{
      data: {
        id: string;
        name: string;
        email: string;
        role: string;
        tempPassword: string;
      };
      message: string;
    }>("/team/invite", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── P12: National Rankings ───────────────────────────────────────────────────

export interface ApiRanking {
  id: string;
  syndicateId: string;
  syndicateName?: string | null;
  rank: number;
  totalScore: number;
  collectionRate: number;
  incidentResolutionRate: number;
  documentationScore: number;
  meetingComplianceScore: number;
  memberSatisfaction: number;
  month: number;
  year: number;
  region?: string | null;
}

export const rankings = {
  compute: (syndicateId?: string) =>
    request<{ data: ApiRanking[] }>("/rankings/compute", {
      method: "POST",
      body: JSON.stringify({ syndicateId }),
    }),
  list: (params?: { month?: number; year?: number; region?: string }) => {
    const qs = new URLSearchParams();
    if (params?.month) qs.set("month", String(params.month));
    if (params?.year) qs.set("year", String(params.year));
    if (params?.region) qs.set("region", params.region);
    return request<{ data: ApiRanking[] }>(`/rankings?${qs}`);
  },
  mySyndicate: () => request<{ data: ApiRanking[] }>("/rankings/my-syndicate"),
};
