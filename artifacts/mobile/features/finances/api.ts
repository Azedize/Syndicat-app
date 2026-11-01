// Finances endpoints and their types.
import { request } from "@/services/api/client";

// ─── Finance ──────────────────────────────────────────────────────────────────

export const finance = {
  transactions: () => request<{ data: unknown[] }>("/finance/transactions"),
  addTransaction: (data: unknown) =>
    request<{ data: unknown }>("/finance/transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  salaries: () => request<{ data: unknown[] }>("/finance/salaries"),
  caisse: () => request<{ data: unknown[] }>("/finance/caisse"),
  invoices: () => request<{ data: unknown[] }>("/invoices"),
  addInvoice: (data: unknown) =>
    request<{ data: unknown }>("/invoices", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  bons: () => request<{ data: unknown[] }>("/bons-livraison"),
  addBon: (data: unknown) =>
    request<{ data: unknown }>("/bons-livraison", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateBon: (id: string, data: unknown) =>
    request<{ data: unknown }>(`/bons-livraison/${id}/status`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateTransactionStatus: (id: string, status: string) =>
    request<{ data: unknown }>(`/finance/transactions/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

// ─── P10: Financial Transparency ─────────────────────────────────────────────

export interface ApiExpenseJustification {
  id: string;
  syndicateId?: string | null;
  title: string;
  description: string;
  amount: string | number;
  category?: string | null;
  receiptUrl?: string | null;
  status: string;
  submitterName?: string | null;
  challengerName?: string | null;
  challengeReason?: string | null;
  votesFor?: number;
  votesAgainst?: number;
  voteCount?: number;
  createdAt: string;
}

export const transparency = {
  list: () =>
    request<{ data: ApiExpenseJustification[] }>("/expense-justifications"),
  create: (data: {
    title: string;
    description: string;
    amount: number;
    category?: string;
    receiptUrl?: string;
  }) =>
    request<{ data: ApiExpenseJustification; message: string }>(
      "/expense-justifications",
      { method: "POST", body: JSON.stringify(data) },
    ),
  challenge: (id: string, reason: string) =>
    request<{ data: ApiExpenseJustification; message: string }>(
      `/expense-justifications/${id}/challenge`,
      { method: "POST", body: JSON.stringify({ reason }) },
    ),
  vote: (id: string, vote: "for" | "against") =>
    request<{ data: ApiExpenseJustification }>(
      `/expense-justifications/${id}/vote`,
      { method: "POST", body: JSON.stringify({ vote }) },
    ),
  resolve: (id: string, outcome: string) =>
    request<{ data: ApiExpenseJustification; message: string }>(
      `/expense-justifications/${id}/resolve`,
      { method: "PUT", body: JSON.stringify({ outcome }) },
    ),
};

// ─── P7/P8: Debt Escalation & Reserve Alerts ────────────────────────────────

export const debtEscalations = {
  escalate: () =>
    request<{ escalations: number; data: any[] }>(
      "/appels-de-fonds/escalate-debts",
      { method: "POST" },
    ),
  list: () => request<{ data: any[] }>("/debt-escalations"),
};

export const reserveFund = {
  check: (thresholdMonths = 3) =>
    request<{ alerts: number; data: any[] }>("/budgets/check-reserve-fund", {
      method: "POST",
      body: JSON.stringify({ thresholdMonths }),
    }),
};
