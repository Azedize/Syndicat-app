// chat: safety endpoints (mounted by chat.routes.ts, in order).
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { blockedUsersTable, chatReportsTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();

// ─── Block / Unblock / List blocked users ────────────────────────────────────

router.get("/blocked-users", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({ id: blockedUsersTable.blockedId, name: usersTable.name })
      .from(blockedUsersTable)
      .leftJoin(usersTable, eq(usersTable.id, blockedUsersTable.blockedId))
      .where(eq(blockedUsersTable.blockerId, req.user!.userId));
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/blocked-users/:userId", requireAuth, async (req, res) => {
  const targetId = String(req.params.userId);
  if (targetId === req.user!.userId) {
    res.status(400).json({ error: "Action invalide" });
    return;
  }
  try {
    await db
      .insert(blockedUsersTable)
      .values({ blockerId: req.user!.userId, blockedId: targetId })
      .onConflictDoNothing();
    res.status(201).json({ message: "Utilisateur bloqué" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/blocked-users/:userId", requireAuth, async (req, res) => {
  const targetId = String(req.params.userId);
  try {
    await db
      .delete(blockedUsersTable)
      .where(
        and(
          eq(blockedUsersTable.blockerId, req.user!.userId),
          eq(blockedUsersTable.blockedId, targetId),
        ),
      );
    res.json({ message: "Utilisateur débloqué" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Report abuse ─────────────────────────────────────────────────────────────

router.post("/chat-reports", requireAuth, async (req, res) => {
  const schema = z.object({
    reportedUserId: z.string().optional(),
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
    reason: z.string().min(1).max(1000),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const [row] = await db
      .insert(chatReportsTable)
      .values({ reporterId: req.user!.userId, ...result.data })
      .returning();
    res.status(201).json({ data: row, message: "Signalement envoyé" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
