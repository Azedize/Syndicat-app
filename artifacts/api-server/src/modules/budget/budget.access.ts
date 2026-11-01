import { db } from "@workspace/db";
import { syndicatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { isSyndicateTeamRole } from "../../middleware/auth.js";

/** True when the user is syndicate-scoped (not super_admin). Used for row-level scoping in finance queries. */
export function isSyndicateScoped(role: string): boolean {
  return isSyndicateTeamRole(role as any);
}

export const CHARGE_READ_ROLES = [
  "super_admin",
  "syndicate_admin",
  "treasurer",
  "member",
] as const;

export async function resolveSupervisedChargeSyndicate(req: any): Promise<string> {
  if (req.query.supervision !== "true") {
    throw Object.assign(
      new Error("La supervision est requise pour cibler un syndicat."),
      { status: 403, code: "SUPERVISION_REQUIRED" },
    );
  }

  const syndicateId =
    typeof req.query.syndicateId === "string"
      ? req.query.syndicateId.trim()
      : "";
  if (!syndicateId) {
    throw Object.assign(new Error("syndicateId est requis."), {
      status: 403,
      code: "SYNDICATE_TARGET_REQUIRED",
    });
  }

  const [syndicate] = await db
    .select({ id: syndicatesTable.id })
    .from(syndicatesTable)
    .where(eq(syndicatesTable.id, syndicateId))
    .limit(1);
  if (!syndicate) {
    throw Object.assign(new Error("Syndicat introuvable."), { status: 404 });
  }
  return syndicateId;
}
