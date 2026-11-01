import { db } from "@workspace/db";
import { refreshTokensTable, syndicatesTable, usersTable } from "@workspace/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { FinanceError } from "../../lib/treasury.js";

export async function loadCondominium(syndicateId: string) {
  const [s] = await db.select().from(syndicatesTable).where(eq(syndicatesTable.id, syndicateId));
  if (!s) throw new FinanceError(404, "CONDOMINIUM_NOT_FOUND", "Copropriété introuvable");
  return s;
}

export async function findUserByEmail(email: string) {
  const [u] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, status: usersTable.status, role: usersTable.role })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = lower(${email})`);
  if (!u) throw new FinanceError(404, "USER_NOT_FOUND", "Aucun compte MIZAN avec cet email : invitez d'abord la personne (Équipe).");
  if (u.status !== "active") throw new FinanceError(409, "USER_DISABLED", "Ce compte est désactivé");
  if (u.role === "super_admin") throw new FinanceError(400, "INVALID_USER", "Compte plateforme");
  return u;
}

/** Ends the sessions a person opened in a condominium (their next refresh falls back home). */
export async function revokeContextSessions(userId: string, syndicateId: string) {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokensTable.userId, userId),
        eq(refreshTokensTable.contextSyndicateId, syndicateId),
        isNull(refreshTokensTable.revokedAt),
      ),
    );
}
