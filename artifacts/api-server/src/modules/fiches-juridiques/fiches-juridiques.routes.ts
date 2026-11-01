import { Router } from "express";
import { db } from "@workspace/db";
import { fichesJuridiquesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../../middleware/auth.js";
import { serialize } from "./fiches-juridiques.service.js";

const router = Router();

// ─── GET /fiches-juridiques — legal reference library, read-only for all ────
router.get("/fiches-juridiques", requireAuth, async (req, res) => {
  const { theme } = req.query as Record<string, string>;
  try {
    const where = theme ? eq(fichesJuridiquesTable.theme, theme) : undefined;
    const rows = await db.select().from(fichesJuridiquesTable).where(where).orderBy(desc(fichesJuridiquesTable.updated));
    res.json({ data: rows.map(serialize) });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.get("/fiches-juridiques/:id", requireAuth, async (req, res) => {
  try {
    const [row] = await db.select().from(fichesJuridiquesTable).where(eq(fichesJuridiquesTable.id, String(req.params.id)));
    if (!row) { res.status(404).json({ error: "Fiche introuvable" }); return; }
    res.json({ data: serialize(row) });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

export default router;
