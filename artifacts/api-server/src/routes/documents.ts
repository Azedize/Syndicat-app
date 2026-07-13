import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { documentsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/documents", requireAuth, async (req, res) => {
  const { category } = req.query as Record<string, string>;
  try {
    const syndicateId = req.user!.syndicateId || "";
    const conditions: any[] = [eq(documentsTable.syndicateId, syndicateId)];
    if (category) conditions.push(eq(documentsTable.category, category as any));
    const rows = await db
      .select()
      .from(documentsTable)
      .where(and(...conditions))
      .orderBy(desc(documentsTable.createdAt));
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/documents/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
    if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    res.json({ data: doc });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/documents",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1).max(500),
      category: z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]),
      content: z.string().max(500000).optional(),
      status: z.enum(["published", "draft", "pending"]).default("published"),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
    try {
      const size = result.data.content
        ? `${Math.round(result.data.content.length / 1024)}Ko`
        : "0Ko";
      const [doc] = await db
        .insert(documentsTable)
        .values({
          ...result.data,
          syndicateId: req.user!.syndicateId || "",
          size,
          createdBy: req.user!.userId,
        })
        .returning();
      res.status(201).json({ data: doc, message: "Document généré avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/documents/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      title: z.string().min(1).max(500).optional(),
      category: z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]).optional(),
      content: z.string().max(500000).optional(),
      status: z.enum(["published", "draft", "pending"]).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const updates: Record<string, unknown> = { ...result.data };
      if (result.data.content !== undefined) {
        updates.size = `${Math.round(result.data.content.length / 1024)}Ko`;
      }
      const [doc] = await db
        .update(documentsTable)
        .set(updates)
        .where(eq(documentsTable.id, id))
        .returning();
      res.json({ data: doc, message: "Document mis à jour avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
