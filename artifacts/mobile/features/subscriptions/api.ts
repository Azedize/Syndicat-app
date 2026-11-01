// Subscriptions endpoints and their types.
import { request } from "@/services/api/client";

// ─── P9: Subscriptions ────────────────────────────────────────────────────────

export interface ApiSubscriptionPlan {
  id: string;
  name: string;
  price: string | number;
  interval: string;
  features: string; // JSON string
  createdAt: string;
}

export interface ApiSyndicateSub {
  id: string;
  syndicateId: string;
  planId?: string | null;
  status: string;
  autoRenew?: boolean;
  createdAt: string;
  syndicateName?: string | null;
  planName?: string | null;
  planPrice?: string | number | null;
  planInterval?: string | null;
}

export const subscriptions = {
  plans: () => request<{ data: ApiSubscriptionPlan[] }>("/subscriptions/plans"),
  my: () => request<{ data: ApiSyndicateSub | null }>("/subscriptions/my"),
  list: () => request<{ data: ApiSyndicateSub[] }>("/subscriptions"),
  subscribe: (planId: string, syndicateId?: string) =>
    request<{ data: ApiSyndicateSub; message: string }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({ planId, syndicateId }),
    }),
  update: (id: string, data: { status?: string; autoRenew?: boolean }) =>
    request<{ data: ApiSyndicateSub; message: string }>(
      `/subscriptions/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
    ),
};
