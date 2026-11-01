import { db } from "@workspace/db";
import { appelsDeFondsTable, invoicesTable, buildingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────
export async function getAppelSyndicateId(appelId: string): Promise<string | null> {
  const [appel] = await db
    .select({ buildingId: appelsDeFondsTable.buildingId })
    .from(appelsDeFondsTable)
    .where(eq(appelsDeFondsTable.id, appelId));
  if (!appel) return null;
  const [b] = await db
    .select({ syndicateId: buildingsTable.syndicateId })
    .from(buildingsTable)
    .where(eq(buildingsTable.id, appel.buildingId));
  return b?.syndicateId ?? null;
}

export async function getInvoiceSyndicateId(
  invoiceId: string,
): Promise<string | null> {
  const [inv] = await db
    .select({ syndicateId: invoicesTable.syndicateId })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId));
  return inv?.syndicateId ?? null;
}
