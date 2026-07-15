import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "@syndycat_token";
const REFRESH_TOKEN_KEY = "@syndycat_refresh_token";

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  // In dev, fall back to the API server port (8080 by default; override with EXPO_PUBLIC_API_PORT)
  const port = process.env.EXPO_PUBLIC_API_PORT ?? "8080";
  if (__DEV__) {
    return `http://localhost:${port}/api`;
  }
  console.error("[API] EXPO_PUBLIC_DOMAIN is not set — requests will fail in production.");
  return `http://localhost:${port}/api`;
}

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export async function removeRefreshToken(): Promise<void> {
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function clearAllTokens(): Promise<void> {
  await Promise.all([removeToken(), removeRefreshToken()]);
}

// ─── Token Refresh Logic ──────────────────────────────────────────────────────

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

async function attemptTokenRefresh(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise((resolve) => {
      refreshQueue.push(resolve);
    });
  }

  isRefreshing = true;

  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      isRefreshing = false;
      refreshQueue.forEach((cb) => cb(null));
      refreshQueue = [];
      return null;
    }

    const res = await fetch(`${getBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      isRefreshing = false;
      refreshQueue.forEach((cb) => cb(null));
      refreshQueue = [];
      await clearAllTokens();
      return null;
    }

    const json = await res.json();
    const newToken: string = json.data?.token;
    const newRefreshToken: string = json.data?.refreshToken;

    if (newToken) await setToken(newToken);
    if (newRefreshToken) await setRefreshToken(newRefreshToken);

    isRefreshing = false;
    refreshQueue.forEach((cb) => cb(newToken));
    refreshQueue = [];

    return newToken;
  } catch {
    isRefreshing = false;
    refreshQueue.forEach((cb) => cb(null));
    refreshQueue = [];
    return null;
  }
}

// ─── Core request function with auto-retry on 401 ────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
  withAuth = true,
  _isRetry = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (withAuth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && withAuth && !_isRetry) {
    const newToken = await attemptTokenRefresh();
    if (newToken) {
      return request<T>(path, options, withAuth, true);
    }
    // Refresh failed — propagate 401 so AuthContext can sign the user out
    const errJson = await res.json().catch(() => ({}));
    const err: any = new Error((errJson as any).error || "Session expirée");
    err.status = 401;
    throw err;
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err: any = new Error((json as any).message || (json as any).error || `HTTP ${res.status}`);
    err.status = res.status;
    if ((json as any).code) err.code = (json as any).code;
    // Carry the full error payload so callers can react to structured fields
    // (e.g. tie-detection candidate lists) without re-parsing the response.
    err.body = json;
    throw err;
  }

  return json as T;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "syndicate_admin" | "member";
  syndicateId?: string | null;
  phone?: string | null;
  profession?: string | null;
  avatar?: string | null;
  status: "active" | "inactive";
  memberSince?: string | null;
  createdAt?: string | null;
}

export const auth = {
  login: (email: string, password: string) =>
    request<{ data: { token: string; refreshToken: string; user: ApiUser } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false),

  refresh: (refreshToken: string) =>
    request<{ data: { token: string; refreshToken: string } }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }, false),

  logout: (refreshToken?: string) =>
    request<{ message: string }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }, false),

  me: () => request<{ data: ApiUser }>("/auth/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  updateProfile: (data: Partial<Pick<ApiUser, "name" | "phone" | "profession" | "avatar">>) =>
    request<{ data: ApiUser; message: string }>("/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }, false),

  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }, false),
};

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export const audit = {
  getLogs: () =>
    request<{ data: Array<{
      id: string;
      userId: string;
      userName: string | null;
      syndicateId: string | null;
      action: string;
      entity: string;
      entityId: string | null;
      details: string | null;
      createdAt: string;
    }> }>("/audit"),

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
  buildingName: string | null;
  buildingAddress: string | null;
}

export const locataires = {
  myLease: () => request<{ data: ApiTenantLease }>("/locataires/my-lease"),
};

// ─── Members ─────────────────────────────────────────────────────────────────

export const members = {
  list: (params?: { syndicateId?: string; status?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.syndicateId) qs.set("syndicateId", params.syndicateId);
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    return request<{ data: unknown[] }>(`/members?${qs}`);
  },
  get: (id: string) => request<{ data: unknown }>(`/members/${id}`),
  create: (data: unknown) =>
    request<{ data: unknown }>("/members", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request<{ data: unknown }>(`/members/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  updateStatus: (id: string, status: string) =>
    request<{ data: unknown }>(`/members/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
};

// ─── Syndicates ───────────────────────────────────────────────────────────────

export const syndicates = {
  list: () => request<{ data: unknown[] }>("/syndicates"),
  get: (id: string) => request<{ data: unknown }>(`/syndicates/${id}`),
  create: (data: unknown) =>
    request<{ data: unknown }>("/syndicates", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request<{ data: unknown }>(`/syndicates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};

// ─── Elections ────────────────────────────────────────────────────────────────

export const elections = {
  list: () => request<{ data: unknown[] }>("/elections"),
  get: (id: string) =>
    // Ballots are anonymous by design — the API only confirms participation (hasVoted),
    // it never reveals which candidate was chosen, even to the voter themselves.
    request<{ data: unknown; candidates: unknown[]; questions: unknown[]; hasVoted: boolean; isEligible: boolean; mandates: unknown[]; myDelegation: any; delegatedToMe: any[] }>(`/elections/${id}`),
  create: (data: unknown) =>
    request<{ data: unknown }>("/elections", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request<{ data: unknown }>(`/elections/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  transition: (id: string, action: string, reason?: string, tiebreakWinnerIds?: string[]) =>
    request<{ data: unknown; message: string }>(`/elections/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ action, reason, tiebreakWinnerIds }),
    }),
  vote: (electionId: string, candidateId?: string, abstain?: boolean, onBehalfOfUserId?: string) =>
    request<{ message: string }>(`/elections/${electionId}/vote`, {
      method: "POST",
      body: JSON.stringify({ candidateId, abstain: !!abstain, onBehalfOfUserId }),
    }),
  eligibleVoters: (electionId: string) =>
    request<{ data: { id: string; name: string }[] }>(`/elections/${electionId}/eligible-voters`),
  delegate: (electionId: string, granteeId: string) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/delegate`, {
      method: "POST",
      body: JSON.stringify({ granteeId }),
    }),
  revokeDelegation: (electionId: string) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/delegate`, { method: "DELETE" }),
  setInvalidVotes: (electionId: string, count: number) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/invalid-votes`, {
      method: "PUT",
      body: JSON.stringify({ count }),
    }),
  results: (electionId: string) =>
    request<{ data: any }>(`/elections/${electionId}/results`),
  submitCandidacy: (electionId: string, data: unknown) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/candidates`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  validateCandidacy: (electionId: string, candidateId: string, decision: "approved" | "rejected", reason?: string) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/candidates/${candidateId}/validate`, {
      method: "PUT",
      body: JSON.stringify({ decision, reason }),
    }),
  withdrawCandidacy: (electionId: string, candidateId: string) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/candidates/${candidateId}/withdraw`, { method: "POST" }),
  updateProgram: (electionId: string, candidateId: string, data: unknown) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/candidates/${candidateId}/program`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  askQuestion: (electionId: string, candidateId: string, question: string) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/candidates/${candidateId}/questions`, {
      method: "POST",
      body: JSON.stringify({ question }),
    }),
  answerQuestion: (electionId: string, questionId: string, answer: string) =>
    request<{ data: unknown; message: string }>(`/elections/${electionId}/questions/${questionId}/answer`, {
      method: "PUT",
      body: JSON.stringify({ answer }),
    }),
  mandates: () => request<{ data: unknown[] }>("/elections/mandates"),
  resignMandate: (mandateId: string, reason?: string) =>
    request<{ data: unknown; message: string }>(`/elections/mandates/${mandateId}/resign`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  revokeMandate: (mandateId: string, reason: string) =>
    request<{ data: unknown; message: string }>(`/elections/mandates/${mandateId}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

// ─── Meetings ─────────────────────────────────────────────────────────────────

export const meetings = {
  list: () => request<{ data: unknown[] }>("/meetings"),
  get: (id: string) => request<{ data: unknown }>(`/meetings/${id}`),
  create: (data: unknown) =>
    request<{ data: unknown }>("/meetings", { method: "POST", body: JSON.stringify(data) }),
  confirmAttendance: (id: string) =>
    request<{ message: string }>(`/meetings/${id}/attend`, { method: "POST" }),
};

// ─── Finance ──────────────────────────────────────────────────────────────────

export const finance = {
  transactions: () => request<{ data: unknown[] }>("/finance/transactions"),
  addTransaction: (data: unknown) =>
    request<{ data: unknown }>("/finance/transactions", { method: "POST", body: JSON.stringify(data) }),
  salaries: () => request<{ data: unknown[] }>("/finance/salaries"),
  caisse: () => request<{ data: unknown[] }>("/finance/caisse"),
  invoices: () => request<{ data: unknown[] }>("/invoices"),
  addInvoice: (data: unknown) =>
    request<{ data: unknown }>("/invoices", { method: "POST", body: JSON.stringify(data) }),
  bons: () => request<{ data: unknown[] }>("/bons-livraison"),
  addBon: (data: unknown) =>
    request<{ data: unknown }>("/bons-livraison", { method: "POST", body: JSON.stringify(data) }),
  updateBon: (id: string, data: unknown) =>
    request<{ data: unknown }>(`/bons-livraison/${id}/status`, { method: "PUT", body: JSON.stringify(data) }),
};

// ─── Marketplace ──────────────────────────────────────────────────────────────

export const marketplace = {
  // ── Products ──────────────────────────────────────────────────────────────
  products: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(`/products?${qs}`);
  },
  featured: () => request<{ data: unknown[] }>("/products/featured"),
  pending: () => request<{ data: unknown[]; pagination: unknown }>("/products/pending"),
  myFavorites: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(`/products/my-favorites?${qs}`);
  },
  myListings: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(`/products/my-listings?${qs}`);
  },
  productDetail: (id: string) =>
    request<{ data: unknown }>(`/products/${id}`),
  addProduct: (data: unknown) =>
    request<{ data: unknown; message: string }>("/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: unknown) =>
    request<{ data: unknown; message: string }>(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (id: string) =>
    request<{ message: string }>(`/products/${id}`, { method: "DELETE" }),

  // ── Moderation ────────────────────────────────────────────────────────────
  moderate: (id: string, payload: { action: string; reason?: string; note?: string; boostType?: string; boostDays?: number }) =>
    request<{ data: unknown; message: string }>(`/products/${id}/moderate`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Favorites ─────────────────────────────────────────────────────────────
  toggleFavorite: (id: string) =>
    request<{ isFavorited: boolean; message: string }>(`/products/${id}/favorite`, { method: "POST" }),

  // ── Comments ──────────────────────────────────────────────────────────────
  comments: (productId: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(`/products/${productId}/comments?${qs}`);
  },
  addComment: (productId: string, content: string) =>
    request<{ data: unknown }>(`/products/${productId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  deleteComment: (productId: string, commentId: string) =>
    request<{ message: string }>(`/products/${productId}/comments/${commentId}`, { method: "DELETE" }),

  // ── Reports ───────────────────────────────────────────────────────────────
  reportProduct: (id: string, payload: { reason: string; details?: string }) =>
    request<{ data: unknown; message: string }>(`/products/${id}/report`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Premium promotion ─────────────────────────────────────────────────────
  promote: (id: string, payload: { type: string; durationDays: number; amount?: number }) =>
    request<{ data: unknown; message: string }>(`/products/${id}/promote`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Cart ──────────────────────────────────────────────────────────────────
  cart: () => request<{ data: unknown[] }>("/cart"),
  addToCart: (productId: string, quantity = 1) =>
    request<{ data: unknown; message: string }>("/cart", {
      method: "POST",
      body: JSON.stringify({ productId, quantity }),
    }),
  updateCartItem: (id: string, quantity: number) =>
    request<{ data: unknown }>(`/cart/${id}`, { method: "PUT", body: JSON.stringify({ quantity }) }),
  removeFromCart: (id: string) =>
    request<{ message: string }>(`/cart/${id}`, { method: "DELETE" }),
  clearCart: () => request<{ message: string }>("/cart", { method: "DELETE" }),

  // ── Orders ────────────────────────────────────────────────────────────────
  orders: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return request<{ data: unknown[]; pagination: unknown }>(`/orders?${qs}`);
  },
  placeOrder: (cartItemIds: string[]) =>
    request<{ data: unknown; message: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({ cartItemIds }),
    }),

  // ── Reviews ───────────────────────────────────────────────────────────────
  reviews: (productId?: string) => {
    const qs = productId ? `?productId=${productId}` : "";
    return request<{ data: unknown[] }>(`/reviews${qs}`);
  },
  addReview: (data: unknown) =>
    request<{ data: unknown }>("/reviews", { method: "POST", body: JSON.stringify(data) }),
};

// ─── Documents ───────────────────────────────────────────────────────────────

export const documents = {
  list: (params?: { category?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: unknown[] }>(`/documents?${qs}`);
  },
  generate: (title: string, category: string, content?: string) =>
    request<{ data: unknown }>("/documents", {
      method: "POST",
      body: JSON.stringify({ title, category, content, status: "published" }),
    }),
  get: (id: string) => request<{ data: unknown }>(`/documents/${id}`),
  update: (id: string, data: { title?: string; category?: string; content?: string; status?: string }) =>
    request<{ data: unknown }>(`/documents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  // FIX BUG-07: delete a document (admin only)
  delete: (id: string) =>
    request<{ message: string }>(`/documents/${id}`, { method: "DELETE" }),
  // Get a signed 1-hour download URL for a document's PDF
  downloadUrl: (id: string) =>
    request<{ url: string; expiresIn: number }>(`/documents/${id}/download-url`),
  // Record a signature on a document
  sign: (id: string, signatureData?: string) =>
    request<{ data: unknown }>(`/documents/${id}/sign`, {
      method: "POST",
      body: JSON.stringify({ signatureData }),
    }),
  // Get signature history for a document
  signatures: (id: string) =>
    request<{ data: unknown[] }>(`/documents/${id}/signatures`),
};

// ─── Publications ─────────────────────────────────────────────────────────────

export const publications = {
  list: (params?: { category?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    return request<{ data: unknown[] }>(`/publications?${qs}`);
  },
  create: (data: unknown) =>
    request<{ data: unknown }>("/publications", { method: "POST", body: JSON.stringify(data) }),
  like: (id: string) =>
    request<{ data: unknown }>(`/publications/${id}/like`, { method: "POST" }),
};

// ─── Content: alerts, cotisations, legal, support, notifications, etc. ────────

export const content = {
  alerts: () => request<{ data: unknown[] }>("/alerts"),
  markAlertRead: (id: string) =>
    request<{ data: unknown }>(`/alerts/${id}/read`, { method: "PUT" }),
  markAllAlertsRead: () =>
    request<{ message: string }>("/alerts/read-all", { method: "PUT" }),
  registerPushToken: (pushToken: string) =>
    request<{ message: string }>("/users/push-token", {
      method: "PUT",
      body: JSON.stringify({ pushToken }),
    }),

  cotisations: () => request<{ data: unknown[] }>("/cotisations"),
  createCotisation: (data: {
    memberId: string;
    label: string;
    period: string;
    amount: number;
    dueDate: string;
    status?: "pending" | "paid" | "overdue";
  }) => request<{ data: unknown; message: string }>("/cotisations", {
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
    request<{ data: unknown }>(`/legal-alerts/${id}/resolve`, { method: "PUT" }),

  supportTickets: () => request<{ data: unknown[] }>("/support"),
  createTicket: (data: unknown) =>
    request<{ data: unknown }>("/support", { method: "POST", body: JSON.stringify(data) }),
  resolveTicket: (id: string) =>
    request<{ data: unknown }>(`/support/${id}/resolve`, { method: "PUT" }),

  notificationPrefs: () => request<{ data: unknown[] }>("/notifications/preferences"),
  toggleNotificationPref: (id: string, channel: string, value: boolean) =>
    request<{ data: unknown }>(`/notifications/preferences/${id}`, {
      method: "PUT",
      body: JSON.stringify({ [channel]: value }),
    }),

  subscriptionPlans: () => request<{ data: unknown[] }>("/subscriptions/plans"),
  subscriptions: () => request<{ data: unknown[] }>("/subscriptions"),
  updateSubscription: (id: string, planId: string) =>
    request<{ data: unknown }>(`/subscriptions/${id}`, {
      method: "PUT",
      body: JSON.stringify({ planId }),
    }),

  auditLog: (entry: { action: string; entity: string; entityId?: string; details?: string }) =>
    request<{ message: string }>("/audit", {
      method: "POST",
      body: JSON.stringify(entry),
    }),
  getAuditLogs: () => request<{ data: unknown[] }>("/audit"),

  partners: () => request<{ data: unknown[] }>("/partners"),
  addPartner: (data: unknown) =>
    request<{ data: unknown }>("/partners", { method: "POST", body: JSON.stringify(data) }),
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

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ApiConversation {
  id: string;
  convType: "direct" | "group" | "announcement" | "support" | "building" | "marketplace" | "incident" | "emergency";
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

  unreadCount: () =>
    request<{ total: number }>("/conversations/unread-count"),

  search: (q: string) =>
    request<{ data: { id: string; name: string; matchedInMessages: boolean }[] }>(
      `/conversations/search?q=${encodeURIComponent(q)}`,
    ),

  messages: (id: string) =>
    request<{ data: ApiMessage[]; total: number }>(`/conversations/${id}/messages`),

  since: (id: string, since: string) =>
    request<{ data: ApiMessage[]; typing: string[] }>(`/conversations/${id}/since?since=${encodeURIComponent(since)}`),

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
    request<{ data: { id: string; name: string; email: string; role: string; syndicateId: string | null }[] }>(
      "/conversations/contactable-users",
    ),

  // Legacy alias kept for existing callers
  sendMessage: (id: string, text: string) =>
    request<{ data: ApiMessage }>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  deleteMessage: (messageId: string, mode: "for_me" | "for_everyone" = "for_everyone") =>
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
    request<{ message: string }>(`/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`, {
      method: "DELETE",
    }),

  typing: (id: string) =>
    request<{ message: string }>(`/conversations/${id}/typing`, { method: "PATCH" }),

  typingUsers: (id: string) =>
    request<{ data: string[] }>(`/conversations/${id}/typing`),

  create: (params: {
    participantId?: string;
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
    request<{ data: ApiConversation; existing?: boolean }>("/conversations/product", {
      method: "POST",
      body: JSON.stringify({ productId }),
    }),

  openIncidentChat: (incidentId: string) =>
    request<{ data: ApiConversation; existing?: boolean }>("/conversations/incident", {
      method: "POST",
      body: JSON.stringify({ incidentId }),
    }),

  markRead: (id: string) =>
    request<{ message: string }>(`/conversations/${id}/read`, { method: "PATCH" }),

  archive: (id: string) =>
    request<{ message: string }>(`/conversations/${id}/archive`, { method: "PATCH" }),

  unarchive: (id: string) =>
    request<{ message: string }>(`/conversations/${id}/unarchive`, { method: "PATCH" }),

  delete: (id: string) =>
    request<{ message: string }>(`/conversations/${id}`, { method: "DELETE" }),

  blockedUsers: () =>
    request<{ data: { id: string; name: string | null }[] }>("/blocked-users"),

  blockUser: (userId: string) =>
    request<{ message: string }>(`/blocked-users/${userId}`, { method: "POST" }),

  unblockUser: (userId: string) =>
    request<{ message: string }>(`/blocked-users/${userId}`, { method: "DELETE" }),

  reportAbuse: (payload: { reportedUserId?: string; conversationId?: string; messageId?: string; reason: string }) =>
    request<{ message: string }>("/chat-reports", {
      method: "POST",
      body: JSON.stringify(payload),
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
  syStatus: string;
}

export const statistics = {
  platform: () => request<{ data: PlatformStats }>("/statistics/platform"),
  hr: () => request<{ data: HRStats }>("/statistics/hr"),
  financeSummary: () => request<{ data: FinanceSummary }>("/statistics/finance/summary"),
  syndicates: () => request<{ data: EnrichedSyndicate[] }>("/statistics/syndicates"),
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
}

export const announcements = {
  list: (params?: { priority?: string }) => {
    const qs = new URLSearchParams();
    if (params?.priority) qs.set("priority", params.priority);
    return request<{ data: ApiAnnouncement[]; total: number }>(`/announcements?${qs}`);
  },
  create: (data: {
    title: string;
    body: string;
    priority: ApiAnnouncement["priority"];
    audience?: string;
    pinned?: boolean;
    expiresAt?: string;
  }) => request<{ data: ApiAnnouncement; message: string }>("/announcements", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  update: (id: string, data: Partial<{
    title: string; body: string;
    priority: ApiAnnouncement["priority"];
    audience: string; pinned: boolean; expiresAt: string | null;
  }>) => request<{ data: ApiAnnouncement; message: string }>(`/announcements/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }),
  delete: (id: string) => request<{ message: string }>(`/announcements/${id}`, { method: "DELETE" }),
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
  }) => request<{ data: ApiUnionAction; message: string }>("/actions", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{
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
  }>) => request<{ data: ApiUnionAction; message: string }>(`/actions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/actions/${id}`, { method: "DELETE" }),
  toggleSupport: (id: string) =>
    request<{ supported: boolean; message: string }>(`/actions/${id}/support`, { method: "POST" }),
  toggleParticipate: (id: string) =>
    request<{ participating: boolean; message: string }>(`/actions/${id}/participate`, { method: "POST" }),
  participants: (id: string) =>
    request<{ data: Array<{ id: string; userId: string; userName: string; createdAt: string }> }>(`/actions/${id}/participants`),
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
    request<{ data: ApiIdea; message: string }>("/ideas", { method: "POST", body: JSON.stringify(data) }),
  vote: (id: string) =>
    request<{ voted: boolean; voteCount: number }>(`/ideas/${id}/vote`, { method: "POST" }),
  review: (id: string, data: { status: string; adminNote?: string }) =>
    request<{ data: ApiIdea; message: string }>(`/ideas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ message: string }>(`/ideas/${id}`, { method: "DELETE" }),
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
  list: () => request<{ data: ApiExpenseJustification[] }>("/expense-justifications"),
  create: (data: { title: string; description: string; amount: number; category?: string; receiptUrl?: string }) =>
    request<{ data: ApiExpenseJustification; message: string }>("/expense-justifications", { method: "POST", body: JSON.stringify(data) }),
  challenge: (id: string, reason: string) =>
    request<{ data: ApiExpenseJustification; message: string }>(`/expense-justifications/${id}/challenge`, { method: "POST", body: JSON.stringify({ reason }) }),
  vote: (id: string, vote: "for" | "against") =>
    request<{ data: ApiExpenseJustification }>(`/expense-justifications/${id}/vote`, { method: "POST", body: JSON.stringify({ vote }) }),
  resolve: (id: string, outcome: string) =>
    request<{ data: ApiExpenseJustification; message: string }>(`/expense-justifications/${id}/resolve`, { method: "PUT", body: JSON.stringify({ outcome }) }),
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
  list: () => request<{ data: ApiTeamMember[]; syndicate: { name: string; address?: string | null; email?: string | null; phone?: string | null } }>("/team"),
  updateSyndicate: (data: { phone?: string; email?: string; address?: string; website?: string }) =>
    request<{ message: string }>("/team/syndicate", { method: "PUT", body: JSON.stringify(data) }),
  updateMember: (id: string, committeeRole: string) =>
    request<{ message: string }>(`/team/members/${id}`, { method: "PUT", body: JSON.stringify({ committeeRole }) }),
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
    request<{ data: ApiRanking[] }>("/rankings/compute", { method: "POST", body: JSON.stringify({ syndicateId }) }),
  list: (params?: { month?: number; year?: number; region?: string }) => {
    const qs = new URLSearchParams();
    if (params?.month) qs.set("month", String(params.month));
    if (params?.year) qs.set("year", String(params.year));
    if (params?.region) qs.set("region", params.region);
    return request<{ data: ApiRanking[] }>(`/rankings?${qs}`);
  },
  mySyndicate: () => request<{ data: ApiRanking[] }>("/rankings/my-syndicate"),
};

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
    request<{ data: ApiSyndicateSub; message: string }>("/subscriptions", { method: "POST", body: JSON.stringify({ planId, syndicateId }) }),
  update: (id: string, data: { status?: string; autoRenew?: boolean }) =>
    request<{ data: ApiSyndicateSub; message: string }>(`/subscriptions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
};

// ─── P7/P8: Debt Escalation & Reserve Alerts ────────────────────────────────

export const debtEscalations = {
  escalate: () =>
    request<{ escalations: number; data: any[] }>("/appels-de-fonds/escalate-debts", { method: "POST" }),
  list: () =>
    request<{ data: any[] }>("/debt-escalations"),
};

export const reserveFund = {
  check: (thresholdMonths = 3) =>
    request<{ alerts: number; data: any[] }>("/budgets/check-reserve-fund", { method: "POST", body: JSON.stringify({ thresholdMonths }) }),
};

// ─── Module Prestataires ─────────────────────────────────────────────────────

export interface ApiPrestataire {
  id: string;
  name: string;
  type: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  ice?: string | null;
  rc?: string | null;
  status: string;
  rating?: string | number | null;
  evaluationsCount?: number;
  notes?: string | null;
  documentUrl?: string | null;
  activeContracts?: number;
  openWorkOrders?: number;
  expiringContracts?: number;
  contracts?: ApiContrat[];
  recentTravaux?: ApiTravail[];
  evaluations?: ApiEvaluation[];
  createdAt: string;
}

export interface ApiContrat {
  id: string;
  prestataireId: string;
  buildingId: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  monthlyAmount?: string | number | null;
  annualAmount?: string | number | null;
  autoRenew?: boolean;
  status: string;
  documentUrl?: string | null;
  notes?: string | null;
  renewedFromContractId?: string | null;
  terminatedAt?: string | null;
  terminationReason?: string | null;
  prestataireNom?: string;
  prestataireType?: string;
  createdAt: string;
}

export interface ApiTravail {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  priority: string;
  buildingId: string;
  lotId?: string | null;
  prestataireId?: string | null;
  reportedByName?: string | null;
  assignedAt?: string | null;
  estimatedAmount?: string | number | null;
  actualAmount?: string | number | null;
  reportUrl?: string | null;
  photoUrls?: string | null;
  invoiceUrl?: string | null;
  invoiceAmount?: string | number | null;
  validatedByName?: string | null;
  validatedAt?: string | null;
  responseTimeMinutes?: number | null;
  resolutionTimeMinutes?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  prestataire?: { id: string; name: string; phone: string; type: string } | null;
  lot?: { id: string; number: string; floor: number; type: string } | null;
}

export interface ApiEvaluation {
  id: string;
  prestataireId: string;
  travauxId?: string | null;
  quality: number;
  speed: number;
  communication: number;
  price: number;
  average: string | number;
  comment?: string | null;
  ratedByName?: string | null;
  createdAt: string;
}

export interface ApiPrestatairesDashboard {
  totalPrestataires: number;
  prestatairesActifs: number;
  contratsExpires: number;
  contratsBientotExpires: number;
  totalInterventions: number;
  coutTotal: number;
  meilleursPrestataires: ApiPrestataire[];
  moinsBonsPrestataires: ApiPrestataire[];
}

export const prestataires = {
  list: (params?: { type?: string; status?: string; buildingId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.status) qs.set("status", params.status);
    if (params?.buildingId) qs.set("buildingId", params.buildingId);
    return request<{ data: ApiPrestataire[]; total: number }>(`/prestataires?${qs}`);
  },
  get: (id: string) => request<ApiPrestataire>(`/prestataires/${id}`),
  create: (data: Partial<ApiPrestataire>) =>
    request<ApiPrestataire>("/prestataires", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ApiPrestataire>) =>
    request<ApiPrestataire>(`/prestataires/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ success: boolean }>(`/prestataires/${id}`, { method: "DELETE" }),
  dashboard: () => request<{ data: ApiPrestatairesDashboard }>("/prestataires/dashboard"),
  ranking: () => request<{ data: ApiPrestataire[] }>("/prestataires/ranking/top"),
  addEvaluation: (
    id: string,
    data: { travauxId?: string; quality: number; speed: number; communication: number; price: number; comment?: string },
  ) =>
    request<{ data: ApiEvaluation; newRating: number }>(`/prestataires/${id}/evaluations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const contrats = {
  list: (params?: { buildingId?: string; prestataireId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.buildingId) qs.set("buildingId", params.buildingId);
    if (params?.prestataireId) qs.set("prestataireId", params.prestataireId);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: ApiContrat[]; total: number }>(`/contrats?${qs}`);
  },
  create: (data: {
    prestataireId: string;
    buildingId: string;
    title: string;
    startDate?: string;
    endDate?: string;
    monthlyAmount?: number;
    annualAmount?: number;
    autoRenew?: boolean;
    documentUrl: string;
    notes?: string;
  }) => request<ApiContrat>("/contrats", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ApiContrat>) =>
    request<ApiContrat>(`/contrats/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  renew: (id: string, data: { endDate: string; documentUrl?: string; monthlyAmount?: number; annualAmount?: number }) =>
    request<ApiContrat>(`/contrats/${id}/renew`, { method: "POST", body: JSON.stringify(data) }),
  suspend: (id: string) => request<ApiContrat>(`/contrats/${id}/suspend`, { method: "POST" }),
  reactivate: (id: string) => request<ApiContrat>(`/contrats/${id}/reactivate`, { method: "POST" }),
  resilier: (id: string, reason: string) =>
    request<ApiContrat>(`/contrats/${id}/resilier`, { method: "POST", body: JSON.stringify({ reason }) }),
};

// ─── Parking ─────────────────────────────────────────────────────────────────

export interface ApiParkingSpot {
  id: string;
  buildingId: string;
  lotId?: string | null;
  spotNumber: string;
  type: "resident" | "garage" | "visitor";
  floor?: string | null;
  status: "available" | "occupied" | "reserved" | "maintenance";
  notes?: string | null;
  createdAt?: string | null;
  lot?: { number: string; type: string } | null;
}

export interface ApiVehicle {
  id: string;
  userId: string;
  lotId?: string | null;
  plateNumber: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  status: "active" | "inactive";
  createdAt?: string | null;
  owner?: { id: string; name: string; email: string } | null;
  lot?: { id: string; number: string } | null;
}

export interface ApiParkingViolation {
  id: string;
  spotId?: string | null;
  buildingId: string;
  plateNumber: string;
  reportedById: string;
  reportedByName: string;
  photoUrl?: string | null;
  notes?: string | null;
  status: "open" | "resolved" | "dismissed";
  resolvedById?: string | null;
  resolvedAt?: string | null;
  reportedAt: string;
  createdAt?: string | null;
  spot?: { spotNumber: string; type: string } | null;
}

export interface ApiVisitorReservation {
  id: string;
  spotId: string;
  requestedById: string;
  visitorName: string;
  visitorPlate?: string | null;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "expired";
  notes?: string | null;
  createdAt?: string | null;
  spot?: { spotNumber: string; floor?: string | null } | null;
}

export const parking = {
  spots: (params?: { buildingId?: string; type?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.buildingId) qs.set("buildingId", params.buildingId);
    if (params?.type) qs.set("type", params.type);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: ApiParkingSpot[]; total: number }>(`/parking/spots?${qs}`);
  },
  mySpot: () => request<{ data: ApiParkingSpot | null }>("/parking/spots/my"),
  createSpot: (data: { buildingId: string; spotNumber: string; type?: string; floor?: string; lotId?: string; notes?: string }) =>
    request<{ data: ApiParkingSpot; message: string }>("/parking/spots", { method: "POST", body: JSON.stringify(data) }),
  updateSpot: (id: string, data: { lotId?: string | null; status?: string; notes?: string; floor?: string }) =>
    request<{ data: ApiParkingSpot; message: string }>(`/parking/spots/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  vehicles: (params?: { buildingId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.buildingId) qs.set("buildingId", params.buildingId);
    return request<{ data: ApiVehicle[]; total: number }>(`/parking/vehicles?${qs}`);
  },
  registerVehicle: (data: { plateNumber: string; brand?: string; model?: string; color?: string; lotId?: string }) =>
    request<{ data: ApiVehicle; message: string }>("/parking/vehicles", { method: "POST", body: JSON.stringify(data) }),
  deleteVehicle: (id: string) =>
    request<{ message: string }>(`/parking/vehicles/${id}`, { method: "DELETE" }),

  violations: (params?: { buildingId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.buildingId) qs.set("buildingId", params.buildingId);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: ApiParkingViolation[]; total: number }>(`/parking/violations?${qs}`);
  },
  reportViolation: (data: { buildingId: string; spotId?: string; plateNumber: string; photoUrl?: string; notes?: string }) =>
    request<{ data: ApiParkingViolation; message: string }>("/parking/violations", { method: "POST", body: JSON.stringify(data) }),
  resolveViolation: (id: string, status: "resolved" | "dismissed") =>
    request<{ data: ApiParkingViolation; message: string }>(`/parking/violations/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),

  reservations: (params?: { spotId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.spotId) qs.set("spotId", params.spotId);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: ApiVisitorReservation[]; total: number }>(`/parking/reservations?${qs}`);
  },
  reserve: (data: { spotId: string; visitorName: string; visitorPlate?: string; startTime: string; endTime: string; notes?: string }) =>
    request<{ data: ApiVisitorReservation; message: string }>("/parking/reservations", { method: "POST", body: JSON.stringify(data) }),
  cancelReservation: (id: string) =>
    request<{ data: ApiVisitorReservation; message: string }>(`/parking/reservations/${id}`, { method: "DELETE" }),
  availability: (spotId: string, params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    return request<{ data: Array<{ id: string; startTime: string; endTime: string }> }>(`/parking/availability/${spotId}?${qs}`);
  },
};

export const travaux = {
  list: (params?: { buildingId?: string; status?: string; priority?: string; type?: string; prestataireId?: string }) => {
    const qs = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => { if (v) qs.set(k, v); });
    return request<{ data: ApiTravail[]; total: number }>(`/travaux?${qs}`);
  },
  get: (id: string) => request<{ data: ApiTravail }>(`/travaux/${id}`),
  create: (data: Partial<ApiTravail>) =>
    request<{ data: ApiTravail; message: string }>("/travaux", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ApiTravail>) =>
    request<{ data: ApiTravail; message: string }>(`/travaux/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request<{ success: boolean }>(`/travaux/${id}`, { method: "DELETE" }),
  assign: (id: string, prestataireId: string) =>
    request<{ data: ApiTravail; message: string }>(`/travaux/${id}/assign`, { method: "POST", body: JSON.stringify({ prestataireId }) }),
  submitReport: (id: string, data: { reportUrl: string; photoUrls: string[]; invoiceUrl: string; invoiceAmount?: number }) =>
    request<{ data: ApiTravail; message: string }>(`/travaux/${id}/report`, { method: "POST", body: JSON.stringify(data) }),
  validate: (id: string) =>
    request<{ data: ApiTravail; message: string }>(`/travaux/${id}/validate`, { method: "POST" }),
};
