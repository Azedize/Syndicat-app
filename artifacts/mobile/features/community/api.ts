// Community endpoints and their types.
import { request } from "@/services/api/client";

// ─── Publications ─────────────────────────────────────────────────────────────

export const publications = {
  list: (params?: { category?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    return request<{ data: unknown[] }>(`/publications?${qs}`);
  },
  create: (data: unknown) =>
    request<{ data: unknown }>("/publications", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  like: (id: string) =>
    request<{ data: unknown }>(`/publications/${id}/like`, { method: "POST" }),
};

// ─── Announcements ────────────────────────────────────────────────────────────

export interface ApiAnnouncement {
  id: string;
  syndicateId: string;
  title: string;
  body: string;
  priority: "info" | "important" | "urgent";
  authorId: string;
  author: string;
  audience: string;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  /** The viewer already acknowledged it ("lu et compris"). */
  acknowledged?: boolean;
  /** Team only: number of acknowledgements. */
  acknowledgementCount?: number;
}

export const announcements = {
  list: (params?: { priority?: string }) => {
    const qs = new URLSearchParams();
    if (params?.priority) qs.set("priority", params.priority);
    return request<{ data: ApiAnnouncement[]; total: number }>(
      `/announcements?${qs}`,
    );
  },
  create: (data: {
    title: string;
    body: string;
    priority: ApiAnnouncement["priority"];
    audience?: string;
    pinned?: boolean;
    expiresAt?: string;
  }) =>
    request<{ data: ApiAnnouncement; message: string }>("/announcements", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Partial<{
      title: string;
      body: string;
      priority: ApiAnnouncement["priority"];
      audience: string;
      pinned: boolean;
      expiresAt: string | null;
    }>,
  ) =>
    request<{ data: ApiAnnouncement; message: string }>(
      `/announcements/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),
  delete: (id: string) =>
    request<{ message: string }>(`/announcements/${id}`, { method: "DELETE" }),
};

// ─── Union Actions ────────────────────────────────────────────────────────────

export interface ApiUnionAction {
  id: string;
  syndicateId: string;
  title: string;
  description: string;
  type: "greve" | "manifestation" | "petition" | "negociation" | "communique";
  status: "planned" | "active" | "completed" | "cancelled";
  date: string;
  location?: string | null;
  organizer: string;
  participantsTarget: number;
  demands: string[];
  updates: Array<{ date: string; text: string }>;
  tags: string[];
  createdBy: string;
  createdAt: string;
  supportCount: number;
  participantsConfirmed: number;
  userSupports: boolean;
  userParticipates: boolean;
}

export const actions = {
  list: (params?: { type?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: ApiUnionAction[]; total: number }>(`/actions?${qs}`);
  },
  get: (id: string) => request<{ data: ApiUnionAction }>(`/actions/${id}`),
  create: (data: {
    title: string;
    description?: string;
    type: ApiUnionAction["type"];
    status?: ApiUnionAction["status"];
    date: string;
    location?: string;
    organizer: string;
    participantsTarget?: number;
    demands?: string[];
    updates?: Array<{ date: string; text: string }>;
    tags?: string[];
    syndicateId?: string;
  }) =>
    request<{ data: ApiUnionAction; message: string }>("/actions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Partial<{
      title: string;
      description: string;
      type: ApiUnionAction["type"];
      status: ApiUnionAction["status"];
      date: string;
      location: string | null;
      organizer: string;
      participantsTarget: number;
      demands: string[];
      updates: Array<{ date: string; text: string }>;
      tags: string[];
    }>,
  ) =>
    request<{ data: ApiUnionAction; message: string }>(`/actions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/actions/${id}`, { method: "DELETE" }),
  toggleSupport: (id: string) =>
    request<{ supported: boolean; message: string }>(`/actions/${id}/support`, {
      method: "POST",
    }),
  toggleParticipate: (id: string) =>
    request<{ participating: boolean; message: string }>(
      `/actions/${id}/participate`,
      { method: "POST" },
    ),
  participants: (id: string) =>
    request<{
      data: Array<{
        id: string;
        userId: string;
        userName: string;
        createdAt: string;
      }>;
    }>(`/actions/${id}/participants`),
};

// ─── P6: Ideas & Voting ───────────────────────────────────────────────────────

export interface ApiIdea {
  id: string;
  syndicateId?: string | null;
  userId?: string | null;
  userName: string;
  title: string;
  description: string;
  category: string;
  status: string;
  voteCount: number;
  voteDeadline?: string | null;
  implementedAt?: string | null;
  adminNote?: string | null;
  userVoted?: boolean;
  createdAt: string;
}

export const ideas = {
  list: () => request<{ data: ApiIdea[] }>("/ideas"),
  create: (data: { title: string; description: string; category: string }) =>
    request<{ data: ApiIdea; message: string }>("/ideas", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  vote: (id: string) =>
    request<{ voted: boolean; voteCount: number }>(`/ideas/${id}/vote`, {
      method: "POST",
    }),
  review: (id: string, data: { status: string; adminNote?: string }) =>
    request<{ data: ApiIdea; message: string }>(`/ideas/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/ideas/${id}`, { method: "DELETE" }),
};
