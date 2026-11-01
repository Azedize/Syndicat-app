// Directory endpoints and their types.
import { request } from "@/services/api/client";

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
