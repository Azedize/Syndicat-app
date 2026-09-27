import { db } from "@workspace/db";
import { documentSequencesTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

type SequenceExecutor = Pick<typeof db, "insert">;

/**
 * Atomically allocates the next number of a continuous per-syndicate, per-year
 * sequence (e.g. REC-2026-000042). One counter row per (syndicateId, prefix,
 * year) is incremented with INSERT … ON CONFLICT DO UPDATE, so concurrent
 * requests never receive the same number. Pass the caller's transaction so a
 * rolled-back operation also rolls back the allocated number (no gaps).
 */
export async function nextSequenceNumber(
  executor: SequenceExecutor,
  scopeId: string,
  prefix: string,
  pad = 4,
): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await executor
    .insert(documentSequencesTable)
    .values({ syndicateId: scopeId, prefix, year, currentValue: 1 })
    .onConflictDoUpdate({
      target: [
        documentSequencesTable.syndicateId,
        documentSequencesTable.prefix,
        documentSequencesTable.year,
      ],
      set: { currentValue: sql`${documentSequencesTable.currentValue} + 1` },
    })
    .returning({ currentValue: documentSequencesTable.currentValue });

  return `${prefix}-${year}-${String(row.currentValue).padStart(pad, "0")}`;
}
