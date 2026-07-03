import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { syndicatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/syndicates", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(syndicatesTable);
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/syndicates", requireAuth, requireRole("super_admin"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    sector: z.string().min(1),
    region: z.string().default(""),
    adminId: z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [syndicate] = await db.insert(syndicatesTable).values(result.data).returning();
    res.status(201).json({ data: syndicate, message: "Syndicat créé avec succès" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/syndicates/:id", requireAuth, requireRole("super_admin"), async (req, res) => {
  const id = req.params.id as string;
  const schema = z.object({
    name: z.string().optional(),
    sector: z.string().optional(),
    region: z.string().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    adminId: z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [updated] = await db.update(syndicatesTable).set(result.data).where(eq(syndicatesTable.id, id)).returning();
    res.json({ data: updated, message: "Syndicat mis à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
