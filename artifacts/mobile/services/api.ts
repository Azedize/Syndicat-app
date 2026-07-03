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
    const err: any = new Error((json as any).error || `HTTP ${res.status}`);
    err.status = res.status;
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
  get: (id: string) => request<{ data: unknown; candidates: unknown[] }>(`/elections/${id}`),
  create: (data: unknown) =>
    request<{ data: unknown }>("/elections", { method: "POST", body: JSON.stringify(data) }),
  vote: (electionId: string, candidateId: string) =>
    request<{ message: string }>(`/elections/${electionId}/vote`, {
      method: "POST",
      body: JSON.stringify({ candidateId }),
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
  products: (params?: { status?: string; category?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category) qs.set("category", params.category);
    if (params?.search) qs.set("search", params.search);
    return request<{ data: unknown[] }>(`/products?${qs}`);
  },
  addProduct: (data: unknown) =>
    request<{ data: unknown }>("/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: unknown) =>
    request<{ data: unknown }>(`/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (id: string) =>
    request<{ message: string }>(`/products/${id}`, { method: "DELETE" }),
  validateProduct: (id: string, action: "approve" | "reject" = "approve") =>
    request<{ data: unknown }>(`/products/${id}/validate`, {
      method: "PUT",
      body: JSON.stringify({ action }),
    }),
  orders: () => request<{ data: unknown[] }>("/orders"),
  placeOrder: (cartItemIds: string[]) =>
    request<{ data: unknown }>("/orders", {
      method: "POST",
      body: JSON.stringify({ cartItemIds }),
    }),
  reviews: () => request<{ data: unknown[] }>("/reviews"),
  addReview: (data: unknown) =>
    request<{ data: unknown }>("/reviews", { method: "POST", body: JSON.stringify(data) }),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const chat = {
  conversations: () => request<{ data: unknown[] }>("/conversations"),
  messages: (conversationId: string) =>
    request<{ data: unknown[] }>(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, text: string) =>
    request<{ data: unknown }>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
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
