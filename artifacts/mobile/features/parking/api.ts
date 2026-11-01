// Parking endpoints and their types.
import { request } from "@/services/api/client";

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
    return request<{ data: ApiParkingSpot[]; total: number }>(
      `/parking/spots?${qs}`,
    );
  },
  mySpot: () => request<{ data: ApiParkingSpot | null }>("/parking/spots/my"),
  createSpot: (data: {
    buildingId: string;
    spotNumber: string;
    type?: string;
    floor?: string;
    lotId?: string;
    notes?: string;
  }) =>
    request<{ data: ApiParkingSpot; message: string }>("/parking/spots", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSpot: (
    id: string,
    data: {
      lotId?: string | null;
      status?: string;
      notes?: string;
      floor?: string;
    },
  ) =>
    request<{ data: ApiParkingSpot; message: string }>(`/parking/spots/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  vehicles: (params?: { buildingId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.buildingId) qs.set("buildingId", params.buildingId);
    return request<{ data: ApiVehicle[]; total: number }>(
      `/parking/vehicles?${qs}`,
    );
  },
  registerVehicle: (data: {
    plateNumber: string;
    brand?: string;
    model?: string;
    color?: string;
    lotId?: string;
  }) =>
    request<{ data: ApiVehicle; message: string }>("/parking/vehicles", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteVehicle: (id: string) =>
    request<{ message: string }>(`/parking/vehicles/${id}`, {
      method: "DELETE",
    }),

  violations: (params?: { buildingId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.buildingId) qs.set("buildingId", params.buildingId);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: ApiParkingViolation[]; total: number }>(
      `/parking/violations?${qs}`,
    );
  },
  reportViolation: (data: {
    buildingId: string;
    spotId?: string;
    plateNumber: string;
    photoUrl?: string;
    notes?: string;
  }) =>
    request<{ data: ApiParkingViolation; message: string }>(
      "/parking/violations",
      { method: "POST", body: JSON.stringify(data) },
    ),
  resolveViolation: (id: string, status: "resolved" | "dismissed") =>
    request<{ data: ApiParkingViolation; message: string }>(
      `/parking/violations/${id}/status`,
      { method: "PUT", body: JSON.stringify({ status }) },
    ),

  reservations: (params?: { spotId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.spotId) qs.set("spotId", params.spotId);
    if (params?.status) qs.set("status", params.status);
    return request<{ data: ApiVisitorReservation[]; total: number }>(
      `/parking/reservations?${qs}`,
    );
  },
  reserve: (data: {
    spotId: string;
    visitorName: string;
    visitorPlate?: string;
    startTime: string;
    endTime: string;
    notes?: string;
  }) =>
    request<{ data: ApiVisitorReservation; message: string }>(
      "/parking/reservations",
      { method: "POST", body: JSON.stringify(data) },
    ),
  cancelReservation: (id: string) =>
    request<{ data: ApiVisitorReservation; message: string }>(
      `/parking/reservations/${id}`,
      { method: "DELETE" },
    ),
  availability: (spotId: string, params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    return request<{
      data: Array<{ id: string; startTime: string; endTime: string }>;
    }>(`/parking/availability/${spotId}?${qs}`);
  },
};

