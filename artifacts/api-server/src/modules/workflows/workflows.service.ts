import { db } from "@workspace/db";
import { workflowStepsTable } from "@workspace/db/schema";
import { asc, inArray } from "drizzle-orm";

export async function withSteps(rows: any[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const steps = await db
    .select()
    .from(workflowStepsTable)
    .where(inArray(workflowStepsTable.workflowId, ids))
    .orderBy(asc(workflowStepsTable.stepOrder));
  const map = new Map<string, any[]>();
  for (const s of steps) {
    if (!map.has(s.workflowId)) map.set(s.workflowId, []);
    map.get(s.workflowId)!.push(s);
  }
  return rows.map((r) => ({ ...r, steps: map.get(r.id) ?? [] }));
}
