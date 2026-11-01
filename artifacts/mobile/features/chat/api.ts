// Chat endpoints and their types.
import { request } from "@/services/api/client";

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ApiConversation {
  id: string;
  convType:
    | "direct"
    | "group"
    | "announcement"
    | "support"
    | "building"
    | "marketplace"
    | "incident"
    | "emergency";
  isGroup: boolean;
  participant: string;
  participantId?: string | null;
  role: string;
  lastMessage: string;
  time: string;
  unread: number;
  syndicateId?: string | null;
  buildingId?: string | null;
  productId?: string | null;
  incidentId?: string | null;
  participantIds?: string[];
  isArchived?: boolean;
  isBlocked?: boolean;
}

export interface ApiMessageReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface ApiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  messageType: "text" | "image" | "document" | "announcement" | "voice";
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
  durationSeconds?: number | null;
  isMe: boolean;
  createdAt: string;
  reactions?: ApiMessageReaction[];
}

export const chat = {
  conversations: (opts?: { archived?: boolean }) =>
    request<{ data: ApiConversation[]; total: number }>(
      `/conversations${opts?.archived ? "?archived=true" : ""}`,
    ),

  unreadCount: () => request<{ total: number }>("/conversations/unread-count"),

  search: (q: string) =>
    request<{
      data: { id: string; name: string; matchedInMessages: boolean }[];
    }>(`/conversations/search?q=${encodeURIComponent(q)}`),

  messages: (id: string) =>
    request<{ data: ApiMessage[]; total: number }>(
      `/conversations/${id}/messages`,
    ),

  since: (id: string, since: string) =>
    request<{ data: ApiMessage[]; typing: string[] }>(
      `/conversations/${id}/since?since=${encodeURIComponent(since)}`,
    ),

  send: (
    id: string,
    payload: {
      text?: string;
      messageType?: "text" | "image" | "document" | "announcement" | "voice";
      attachmentUrl?: string;
      attachmentType?: string;
      attachmentName?: string;
      attachmentSize?: number;
      durationSeconds?: number;
    },
  ) =>
    request<{ data: ApiMessage }>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: payload.text ?? "", ...payload }),
    }),

  contactableUsers: () =>
    request<{
      data: {
        id: string;
        name: string;
        email: string;
        role: string;
        syndicateId: string | null;
      }[];
    }>("/conversations/contactable-users"),

  // Legacy alias kept for existing callers
  sendMessage: (id: string, text: string) =>
    request<{ data: ApiMessage }>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  deleteMessage: (
    messageId: string,
    mode: "for_me" | "for_everyone" = "for_everyone",
  ) =>
    request<{ message: string; mode: string }>(`/messages/${messageId}`, {
      method: "DELETE",
      body: JSON.stringify({ mode }),
    }),

  editMessage: (messageId: string, text: string) =>
    request<{ data: Record<string, unknown> }>(`/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ text }),
    }),

  react: (messageId: string, emoji: string) =>
    request<{ message: string }>(`/messages/${messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }),

  unreact: (messageId: string, emoji: string) =>
    request<{ message: string }>(
      `/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`,
      {
        method: "DELETE",
      },
    ),

  typing: (id: string) =>
    request<{ message: string }>(`/conversations/${id}/typing`, {
      method: "PATCH",
    }),

  typingUsers: (id: string) =>
    request<{ data: string[] }>(`/conversations/${id}/typing`),

  create: (params: {
    participantId?: string;
    syndicateAdminLookup?: string;
    isGroup?: boolean;
    name?: string;
    convType?: ApiConversation["convType"];
    buildingId?: string;
    participantIds?: string[];
  }) =>
    request<{ data: ApiConversation; existing?: boolean }>("/conversations", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  contactSeller: (productId: string) =>
    request<{ data: ApiConversation; existing?: boolean }>(
      "/conversations/product",
      {
        method: "POST",
        body: JSON.stringify({ productId }),
      },
    ),

  openIncidentChat: (incidentId: string) =>
    request<{ data: ApiConversation; existing?: boolean }>(
      "/conversations/incident",
      {
        method: "POST",
        body: JSON.stringify({ incidentId }),
      },
    ),

  markRead: (id: string) =>
    request<{ message: string }>(`/conversations/${id}/read`, {
      method: "PATCH",
    }),

  archive: (id: string) =>
    request<{ message: string }>(`/conversations/${id}/archive`, {
      method: "PATCH",
    }),

  unarchive: (id: string) =>
    request<{ message: string }>(`/conversations/${id}/unarchive`, {
      method: "PATCH",
    }),

  delete: (id: string) =>
    request<{ message: string }>(`/conversations/${id}`, { method: "DELETE" }),

  blockedUsers: () =>
    request<{ data: { id: string; name: string | null }[] }>("/blocked-users"),

  blockUser: (userId: string) =>
    request<{ message: string }>(`/blocked-users/${userId}`, {
      method: "POST",
    }),

  unblockUser: (userId: string) =>
    request<{ message: string }>(`/blocked-users/${userId}`, {
      method: "DELETE",
    }),

  reportAbuse: (payload: {
    reportedUserId?: string;
    conversationId?: string;
    messageId?: string;
    reason: string;
  }) =>
    request<{ message: string }>("/chat-reports", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
