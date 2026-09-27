import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface MyChargesSummary {
  /** Amount still due across all calls (partial payments deducted). */
  due: number;
  overdueCount: number;
  underReviewCount: number;
  paidCount: number;
  openCount: number;
  /** paid | overdue | under_review | due | none */
  status: "paid" | "overdue" | "under_review" | "due" | "none";
}

/**
 * The signed-in co-owner's calls for funds, summarised from the API (the
 * server scopes /appels-de-fonds to the resident's own lots). Used by the
 * home screen and the profile instead of the legacy "cotisations" data.
 */
export function useMyCharges(enabled = true) {
  return useQuery({
    queryKey: ["my-charges"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<MyChargesSummary> => {
      const res = await apiRequest<{ data: Array<{ status: string; remaining?: string; amount: string; amountPaid?: string }> }>(
        "/appels-de-fonds",
      );
      const rows = (res.data ?? []).filter((a) => a.status !== "cancelled");
      const due = rows.reduce(
        (s, a) => s + Number(a.remaining ?? Number(a.amount) - Number(a.amountPaid ?? 0)),
        0,
      );
      const overdueCount = rows.filter((a) => a.status === "overdue").length;
      const underReviewCount = rows.filter((a) => a.status === "pending_validation").length;
      const status: MyChargesSummary["status"] =
        rows.length === 0
          ? "none"
          : overdueCount > 0
            ? "overdue"
            : due <= 0
              ? "paid"
              : underReviewCount > 0
                ? "under_review"
                : "due";
      const paidCount = rows.filter((a) => a.status === "paid").length;
      const openCount = rows.length - paidCount - overdueCount;
      return { due, overdueCount, underReviewCount, paidCount, openCount, status };
    },
  });
}
