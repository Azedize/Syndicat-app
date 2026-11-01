// Statistics endpoints and their types.
import { request } from "@/services/api/client";

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
