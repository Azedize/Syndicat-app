import { governanceDelegationsTable } from "@workspace/db/schema";

// ─── Role → icon helper (used in API response so mobile can rely on it) ────
export function roleToIcon(role: string | null | undefined): string {
  switch (role) {
    case "president":
      return "star";
    case "treasurer":
      return "dollar-sign";
    case "secretary":
      return "file-text";
    case "committee_member":
      return "users";
    default:
      return "user";
  }
}

// ─── GET /governance/delegations ─────────────────────────────────────────────
export function delegationStatus(
  status: string,
  endDate: string,
): "active" | "expired" | "revoked" {
  if (status === "revoked") return "revoked";
  const end = new Date(endDate);
  return !Number.isNaN(end.getTime()) && end < new Date()
    ? "expired"
    : "active";
}

export function serializeDelegation(
  row: typeof governanceDelegationsTable.$inferSelect,
) {
  return {
    id: row.id,
    delegant: row.delegantName,
    delegataire: row.delegataireName,
    domaine: row.domaine,
    startDate: row.startDate,
    endDate: row.endDate,
    status: delegationStatus(row.status, row.endDate),
    description: row.description ?? "",
  };
}
