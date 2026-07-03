import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const auditSchema = z.object({
  action: z.string().min(1),
  entity: z.string().min(1),
  entityId: z.string().optional(),
  details: z.string().optional(),
});

router.post("/audit", requireAuth, async (req, res) => {
  const result = auditSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    await db.insert(auditLogsTable).values({
      userId: req.user!.userId,
      userName: req.user!.name,
      syndicateId: req.user!.syndicateId,
      action: result.data.action,
      entity: result.data.entity,
      entityId: result.data.entityId,
      details: result.data.details,
    });
    res.status(201).json({ message: "Action journalisée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/audit", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    const logs = syndicateId
      ? await db.select().from(auditLogsTable)
          .where(eq(auditLogsTable.syndicateId, syndicateId))
          .orderBy(desc(auditLogsTable.createdAt))
          .limit(200)
      : await db.select().from(auditLogsTable)
          .orderBy(desc(auditLogsTable.createdAt))
          .limit(200);
    res.json({ data: logs });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
