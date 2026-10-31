import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { SceneBuilding } from "@/components/signature/ResidenceScene";

export interface ResidenceData {
  buildings: (SceneBuilding & { lotCount: number; openTravaux: number; pendingCharges: number })[];
  /** The signed-in resident's lot, when the account has one. */
  myLot: { id: string; number: string; floor: number | null; buildingId: string; buildingName: string } | null;
}

/**
 * Real data behind the home screen's residence scene. /buildings is already
 * scoped by the API (a resident only gets the buildings of their own lots);
 * /lots/my-lot answers 404 when the account has no lot. The platform
 * super-admin is not attached to a residence (the API requires supervision
 * mode), so the scene is not loaded for that role.
 */
export function useResidence(role: string | undefined) {
  const enabled = !!role && role !== "super_admin";
  const resident = role === "member" || role === "tenant";
  return useQuery({
    queryKey: ["residence-scene", role],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ResidenceData> => {
      const [b, lot] = await Promise.all([
        apiRequest<{ data: Array<{ id: string; name: string; totalFloors: number | null; lotCount?: number; openTravaux?: number; pendingCharges?: number; status?: string }> }>("/buildings"),
        resident
          ? apiRequest<{ data: { id: string; number: string; floor: number | null; buildingId: string; buildingName: string } }>("/lots/my-lot").catch(() => null)
          : Promise.resolve(null),
      ]);
      const buildings = (b.data ?? [])
        .filter((x) => x.status !== "archived")
        .map((x) => ({
          id: x.id,
          name: x.name,
          floors: x.totalFloors && x.totalFloors > 0 ? x.totalFloors : null,
          lotCount: x.lotCount ?? 0,
          openTravaux: x.openTravaux ?? 0,
          pendingCharges: x.pendingCharges ?? 0,
        }));
      const l = lot?.data;
      return {
        buildings,
        myLot: l ? { id: l.id, number: l.number, floor: l.floor ?? null, buildingId: l.buildingId, buildingName: l.buildingName } : null,
      };
    },
  });
}
