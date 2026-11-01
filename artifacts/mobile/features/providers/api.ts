// Providers endpoints and their types.
import { request } from "@/services/api/client";

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
  prestataire?: {
    id: string;
    name: string;
    phone: string;
    type: string;
  } | null;
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
    return request<{ data: ApiPrestataire[]; total: number }>(
      `/prestataires?${qs}`,
    );
  },
  get: (id: string) => request<ApiPrestataire>(`/prestataires/${id}`),
  create: (data: Partial<ApiPrestataire>) =>
    request<ApiPrestataire>("/prestataires", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ApiPrestataire>) =>
    request<ApiPrestataire>(`/prestataires/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/prestataires/${id}`, { method: "DELETE" }),
  dashboard: () =>
    request<{ data: ApiPrestatairesDashboard }>("/prestataires/dashboard"),
  ranking: () =>
    request<{ data: ApiPrestataire[] }>("/prestataires/ranking/top"),
  addEvaluation: (
    id: string,
    data: {
      travauxId?: string;
      quality: number;
      speed: number;
      communication: number;
      price: number;
      comment?: string;
    },
  ) =>
    request<{ data: ApiEvaluation; newRating: number }>(
      `/prestataires/${id}/evaluations`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
};

export const contrats = {
  list: (params?: {
    buildingId?: string;
    prestataireId?: string;
    status?: string;
  }) => {
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
  }) =>
    request<ApiContrat>("/contrats", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ApiContrat>) =>
    request<ApiContrat>(`/contrats/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  renew: (
    id: string,
    data: {
      endDate: string;
      documentUrl?: string;
      monthlyAmount?: number;
      annualAmount?: number;
    },
  ) =>
    request<ApiContrat>(`/contrats/${id}/renew`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  suspend: (id: string) =>
    request<ApiContrat>(`/contrats/${id}/suspend`, { method: "POST" }),
  reactivate: (id: string) =>
    request<ApiContrat>(`/contrats/${id}/reactivate`, { method: "POST" }),
  resilier: (id: string, reason: string) =>
    request<ApiContrat>(`/contrats/${id}/resilier`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

export const travaux = {
  list: (params?: {
    buildingId?: string;
    status?: string;
    priority?: string;
    type?: string;
    prestataireId?: string;
  }) => {
    const qs = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    return request<{ data: ApiTravail[]; total: number }>(`/travaux?${qs}`);
  },
  get: (id: string) => request<{ data: ApiTravail }>(`/travaux/${id}`),
  create: (data: Partial<ApiTravail>) =>
    request<{ data: ApiTravail; message: string }>("/travaux", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ApiTravail>) =>
    request<{ data: ApiTravail; message: string }>(`/travaux/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/travaux/${id}`, { method: "DELETE" }),
  assign: (id: string, prestataireId: string) =>
    request<{ data: ApiTravail; message: string }>(`/travaux/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ prestataireId }),
    }),
  submitReport: (
    id: string,
    data: {
      reportUrl: string;
      photoUrls: string[];
      invoiceUrl: string;
      invoiceAmount?: number;
    },
  ) =>
    request<{ data: ApiTravail; message: string }>(`/travaux/${id}/report`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  validate: (id: string) =>
    request<{ data: ApiTravail; message: string }>(`/travaux/${id}/validate`, {
      method: "POST",
    }),
};
