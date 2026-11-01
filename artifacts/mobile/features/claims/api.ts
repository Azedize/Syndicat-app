// Claims endpoints and their types.
import { request } from "@/services/api/client";

// ─── Claims & incidents ───────────────────────────────────────────────────────

export type ClaimStatus = "received" | "qualified" | "assigned" | "in_progress" | "awaiting_info" | "resolved" | "closed" | "rejected";
export interface ClaimCard {
  id: string;
  reference: string;
  title: string;
  description: string;
  category: string;
  scope: "common" | "unit";
  location: string;
  lotNumber: string | null;
  status: ClaimStatus;
  priority: "urgent" | "high" | "normal" | "low";
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  overdue: boolean;
  reporterName: string;
  assigneeName: string | null;
  providerName: string | null;
  scheduledFor: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
  reopenCount: number;
  version: number;
  mine: boolean;
  allowedTransitions: ClaimStatus[];
  assigneeUserId?: string | null;
  prestataireId?: string | null;
}
export interface ClaimDetail extends ClaimCard {
  events: { id: string; type: string; fromStatus: string | null; toStatus: string | null; body: string | null; internal: boolean; authorName: string | null; createdAt: string; data?: any }[];
  attachments: { id: string; objectPath: string; fileName: string | null; mimeType: string | null; internal: boolean; createdAt: string }[];
}
const claimKey = () => `clm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const post = <T,>(path: string, body: unknown, key?: string) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body), headers: key ? { "Idempotency-Key": key } : undefined });

export const claims = {
  newKey: claimKey,
  list: (q: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) qs.set(k, v);
    return request<{ data: ClaimCard[]; total: number; page: number; pages: number }>(`/claims?${qs}`);
  },
  board: (q: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) qs.set(k, v);
    return request<{ data: { columns: { status: ClaimStatus; total: number; overdue: number; cards: ClaimCard[] }[]; transitions: Record<ClaimStatus, ClaimStatus[]> } }>(`/claims/board?${qs}`);
  },
  metrics: () => request<{ data: { open: number; overdue: number; unassigned: number; awaiting_info: number; avg_resolution_hours: number | null; resolved_in_period: number; workload: { label: string; open: number; overdue: number }[]; definitions: Record<string, string> } }>("/claims/metrics"),
  get: (id: string) => request<{ data: ClaimDetail }>(`/claims/${encodeURIComponent(id)}`),
  assignees: () => request<{ data: { people: { id: string; name: string; role: string }[]; providers: { id: string; name: string; type: string }[] } }>("/claims/assignees"),
  create: (body: Record<string, unknown>, key: string) => post<{ data: ClaimCard; replayed?: boolean }>("/claims", body, key),
  transition: (id: string, body: { to: ClaimStatus; expectedVersion: number; resolution?: string; reason?: string; question?: string; note?: string }, key: string) =>
    post<{ data: ClaimCard; replayed?: boolean }>(`/claims/${encodeURIComponent(id)}/transition`, body, key),
  assign: (id: string, body: { expectedVersion: number; assigneeUserId?: string | null; prestataireId?: string | null; instructions?: string }, key: string) =>
    post<{ data: ClaimCard }>(`/claims/${encodeURIComponent(id)}/assign`, body, key),
  priority: (id: string, priority: string, expectedVersion: number) => post<{ data: ClaimCard }>(`/claims/${encodeURIComponent(id)}/priority`, { priority, expectedVersion }),
  schedule: (id: string, body: { expectedVersion: number; scheduledFor: string; instructions?: string; createWorkOrder?: boolean }, key: string) =>
    post<{ data: ClaimCard }>(`/claims/${encodeURIComponent(id)}/schedule`, body, key),
  work: (id: string, body: { description: string; materials?: string; shareWithResident?: boolean; attachments?: string[] }, key: string) =>
    post<{ data: ClaimCard }>(`/claims/${encodeURIComponent(id)}/work`, body, key),
  comment: (id: string, body: { text: string; internal?: boolean; attachments?: string[] }, key: string) =>
    post<{ data: ClaimCard }>(`/claims/${encodeURIComponent(id)}/comments`, body, key),
  confirm: (id: string) => post<{ data: ClaimCard }>(`/claims/${encodeURIComponent(id)}/confirm`, {}),
  reopen: (id: string, reason: string, key: string) => post<{ data: ClaimCard }>(`/claims/${encodeURIComponent(id)}/reopen`, { reason }, key),
};
