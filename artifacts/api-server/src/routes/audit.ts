import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

const auditSchema = z.object({
  action: z.string().min(1),
  entity: z.string().min(1),
  entityId: z.string().optional(),
  details: z.string().optional(),
  // Only honored for super_admin (see below) — lets the client report which syndicate
  // a supervised action actually affected, and whether it was a platform-level action.
  syndicateId: z.string().optional(),
  platformAction: z.boolean().optional(),
});

router.post("/audit", requireAuth, async (req, res) => {
  const result = auditSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    // A syndicate_admin cannot claim to act on another syndicate or mark a platform
    // action, so those overrides are only trusted from super_admin callers.
    const isSuperAdmin = req.user!.role === "super_admin";
    // Routed through serverAuditLog so every write shares one supervision policy.
    await serverAuditLog(req, {
      action: result.data.action,
      entity: result.data.entity,
      entityId: result.data.entityId,
      details: result.data.details,
      syndicateId: isSuperAdmin ? result.data.syndicateId : undefined,
      platformAction: isSuperAdmin ? result.data.platformAction : undefined,
    });
    res.status(201).json({ message: "Action journalisée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/audit", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
  try {
    const pagination = getPagination(req, 50);
    const { limit, offset } = pagination;
    const syndicateId = req.user!.syndicateId;
    // Optional: filter by actor userId or date range
    const { actorId, since } = req.query as Record<string, string | undefined>;

    const conditions: ReturnType<typeof eq>[] = [];
    if (syndicateId) conditions.push(eq(auditLogsTable.syndicateId, syndicateId));
    if (actorId) conditions.push(eq(auditLogsTable.actorId, actorId));
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) conditions.push(gte(auditLogsTable.createdAt, d));
    }

    const baseQuery = db.select().from(auditLogsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogsTable.createdAt));

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogsTable)
      .where(conditions.length ? and(...conditions) : undefined);

    const logs = await baseQuery.limit(limit).offset(offset);

    res.json(buildPagedResponse(logs, total, pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
