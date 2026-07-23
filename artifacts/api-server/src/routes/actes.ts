import { Router } from "express";
import { db } from "@workspace/db";
import { actesAdministratifsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// ─── GET /actes ───────────────────────────────────────────────────────────────

router.get("/actes", requireAuth, async (req, res) => {
  const { role, syndicateId } = req.user!;
  if (!syndicateId && role !== "super_admin") {
    res.status(400).json({ error: "Syndicat requis" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(actesAdministratifsTable)
      .where(
        role === "super_admin"
          ? undefined
          : eq(actesAdministratifsTable.syndicateId, syndicateId!),
      )
      .orderBy(desc(actesAdministratifsTable.date));
    res.json({ data: rows });
  } catch (err) {
    req.log.error({ err }, "GET /actes error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /actes/:id ──────────────────────────────────────────────────────────

router.get("/actes/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const { role, syndicateId } = req.user!;
  try {
    const [acte] = await db
      .select()
      .from(actesAdministratifsTable)
      .where(eq(actesAdministratifsTable.id, id));
    if (!acte) { res.status(404).json({ error: "Acte introuvable" }); return; }
    if (role !== "super_admin" && acte.syndicateId !== syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    res.json(acte);
  } catch (err) {
    req.log.error({ err }, "GET /actes/:id error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /actes ──────────────────────────────────────────────────────────────

router.post(
  "/actes",
  requireAuth,
  // Secretary creates administrative acts; president signs them.
  requireRole("syndicate_admin", "secretary", "president"),
  async (req, res) => {
    const { role, syndicateId, userId, name } = req.user!;
    const {
      type,
      statut = "brouillon",
      numero,
      titre,
      objet,
      date,
      dateEcheance,
      auteur,
      signataires = [],
      destinataires = [],
      resumeContenu,
      important = false,
    } = req.body as {
      type: string;
      statut?: string;
      numero: string;
      titre: string;
      objet: string;
      date: string;
      dateEcheance?: string;
      auteur: string;
      signataires?: string[];
      destinataires?: string[];
      resumeContenu?: string;
      important?: boolean;
    };

    if (!type || !numero || !titre || !objet || !date || !auteur) {
      res.status(400).json({ error: "Champs obligatoires manquants : type, numero, titre, objet, date, auteur" });
      return;
    }

    const targetSyndicateId = role === "super_admin"
      ? (req.body.syndicateId as string | undefined) ?? syndicateId
      : syndicateId;

    if (!targetSyndicateId) {
      res.status(400).json({ error: "Syndicat requis" });
      return;
    }

    try {
      const [created] = await db
        .insert(actesAdministratifsTable)
        .values({
          syndicateId: targetSyndicateId,
          createdById: userId,
          type,
          statut,
          numero,
          titre,
          objet,
          date,
          dateEcheance: dateEcheance ?? null,
          auteur,
          signataires,
          destinataires,
          resumeContenu: resumeContenu ?? null,
          important,
        })
        .returning();

      await serverAuditLog(req, {
        syndicateId: targetSyndicateId,
        action: "acte.create",
        entity: "acte_administratif",
        entityId: created.id,
        details: `Créé: ${titre} (${type}, ${statut})`,
      });

      res.status(201).json(created);
    } catch (err) {
      req.log.error({ err }, "POST /actes error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── PATCH /actes/:id ─────────────────────────────────────────────────────────

router.patch(
  "/actes/:id",
  requireAuth,
  requireRole("syndicate_admin", "super_admin"),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const { role, syndicateId, userId, name } = req.user!;
    try {
      const [existing] = await db
        .select()
        .from(actesAdministratifsTable)
        .where(eq(actesAdministratifsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Acte introuvable" }); return; }
      if (role !== "super_admin" && existing.syndicateId !== syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      const updates: Partial<typeof existing> = {};
      const allowed = [
        "statut", "titre", "objet", "date", "dateEcheance",
        "auteur", "signataires", "destinataires", "resumeContenu", "important",
      ] as const;
      for (const key of allowed) {
        if (req.body[key] !== undefined) (updates as any)[key] = req.body[key];
      }

      const [updated] = await db
        .update(actesAdministratifsTable)
        .set(updates)
        .where(eq(actesAdministratifsTable.id, id))
        .returning();

      await serverAuditLog(req, {
        syndicateId: existing.syndicateId ?? undefined,
        action: "acte.update",
        entity: "acte_administratif",
        entityId: id,
        details: `Mis à jour: ${Object.keys(updates).join(", ")}`,
      });

      res.json(updated);
    } catch (err) {
      req.log.error({ err }, "PATCH /actes/:id error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── DELETE /actes/:id ────────────────────────────────────────────────────────

router.delete(
  "/actes/:id",
  requireAuth,
  requireRole("syndicate_admin", "super_admin"),
  async (req, res) => {
    const { id } = req.params as { id: string };
    const { role, syndicateId, userId, name } = req.user!;
    try {
      const [existing] = await db
        .select()
        .from(actesAdministratifsTable)
        .where(eq(actesAdministratifsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Acte introuvable" }); return; }
      if (role !== "super_admin" && existing.syndicateId !== syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      await db
        .delete(actesAdministratifsTable)
        .where(eq(actesAdministratifsTable.id, id));

      await serverAuditLog(req, {
        syndicateId: existing.syndicateId ?? undefined,
        action: "acte.delete",
        entity: "acte_administratif",
        entityId: id,
        details: `Supprimé: ${existing.titre}`,
      });

      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err }, "DELETE /actes/:id error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
