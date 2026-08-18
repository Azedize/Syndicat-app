/**
 * Governance — Conseil Syndical management
 * Bureau members (conseil_syndical table), mandates, and delegations.
 *
 * Endpoints:
 *   GET  /governance/conseil       — list active council members for this syndicate
 *   POST /governance/conseil       — add a council member (admin only)
 *   DELETE /governance/conseil/:id — remove / resign a council member (admin only)
 *   GET  /governance/mandats       — derive mandate list from council rows
 *   GET  /governance/delegations   — list persisted authority delegations
 *   POST /governance/delegations   — create a bounded authority delegation
 *   DELETE /governance/delegations/:id — revoke a delegation
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  conseilSyndicalTable,
  governanceDelegationsTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requireGovernanceAccess,
} from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

function requireGovernanceScope(req: any, res: any, next: any): void {
  if (req.user.role !== "super_admin" && !req.user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return;
  }
  next();
}

// ─── Role → icon helper (used in API response so mobile can rely on it) ────
function roleToIcon(role: string | null | undefined): string {
  switch (role) {
    case "president":
      return "star";
    case "treasurer":
      return "dollar-sign";
    case "secretary":
      return "file-text";
    case "committee_member":
      return "users";
    default:
      return "user";
  }
}

// ─── GET /governance/conseil ─────────────────────────────────────────────────
router.get(
  "/governance/conseil",
  requireAuth,
  requireGovernanceScope,
  async (req, res) => {
    try {
      const user = req.user!;
      if (!user.syndicateId) return void res.json({ data: [] });

      const rows = await db
        .select()
        .from(conseilSyndicalTable)
        .where(
          and(
            eq(conseilSyndicalTable.syndicateId, user.syndicateId),
            eq(conseilSyndicalTable.status, "active"),
          ),
        )
        .orderBy(desc(conseilSyndicalTable.createdAt));

      const data = rows.map((r) => ({
        id: r.id,
        name: r.name ?? "",
        role: r.role ?? "",
        icon: roleToIcon(r.role),
        since: r.mandateStart
          ? String(r.mandateStart).slice(0, 4)
          : new Date().getFullYear().toString(),
        email: r.email ?? "",
        phone: r.phone ?? "",
        mandateStart: r.mandateStart ?? "",
        mandateEnd: r.mandateEnd ?? "",
        status: r.status ?? "active",
        notes: r.notes ?? "",
      }));

      res.json({ data });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /governance/conseil ─────────────────────────────────────────────────
router.post(
  "/governance/conseil",
  requireAuth,
  requireGovernanceScope,
  requireAdmin,
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1).max(200),
      role: z.string().min(1).max(100),
      email: z.string().email().optional().default(""),
      phone: z.string().max(30).optional().default(""),
      mandateStart: z.string().optional(),
      mandateEnd: z.string().optional(),
      notes: z.string().max(1000).optional().default(""),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return void res
        .status(400)
        .json({ error: "Données invalides", details: parsed.error.flatten() });
    }

    try {
      const user = req.user!;
      if (!user.syndicateId) {
        return void res
          .status(400)
          .json({ error: "Aucun syndicat associé à votre compte" });
      }

      const { name, role, email, phone, mandateStart, mandateEnd, notes } =
        parsed.data;

      const [row] = await db
        .insert(conseilSyndicalTable)
        .values({
          syndicateId: user.syndicateId,
          name,
          role,
          email,
          phone,
          mandateStart,
          mandateEnd,
          notes,
          status: "active",
        } as any)
        .returning();

      await serverAuditLog(req, {
        action: "CREATE",
        entity: "conseil_syndical",
        entityId: row.id,
        details: `${name} — ${role}`,
      });

      res.status(201).json({
        data: {
          id: row.id,
          name: row.name ?? "",
          role: row.role ?? "",
          icon: roleToIcon(row.role),
          since: row.mandateStart
            ? String(row.mandateStart).slice(0, 4)
            : new Date().getFullYear().toString(),
          email: row.email ?? "",
          phone: row.phone ?? "",
          mandateStart: row.mandateStart ?? "",
          mandateEnd: row.mandateEnd ?? "",
          status: "active",
          notes: row.notes ?? "",
        },
        message: "Membre ajouté au conseil syndical",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── DELETE /governance/conseil/:id ─────────────────────────────────────────
router.delete(
  "/governance/conseil/:id",
  requireAuth,
  requireGovernanceScope,
  requireAdmin,
  async (req, res) => {
    try {
      const user = req.user!;
      if (!user.syndicateId) {
        return void res
          .status(400)
          .json({ error: "Aucun syndicat associé à votre compte" });
      }

      const id = String(req.params.id);

      const [existing] = await db
        .select()
        .from(conseilSyndicalTable)
        .where(
          and(
            eq(conseilSyndicalTable.id, id),
            eq(conseilSyndicalTable.syndicateId, user.syndicateId),
          ),
        );

      if (!existing) {
        return void res.status(404).json({ error: "Membre introuvable" });
      }

      await db
        .update(conseilSyndicalTable)
        .set({ status: "resigned", resignedAt: new Date() } as any)
        .where(eq(conseilSyndicalTable.id, id));

      await serverAuditLog(req, {
        action: "DELETE",
        entity: "conseil_syndical",
        entityId: id,
        details: `${existing.name ?? ""} — ${existing.role ?? ""}`,
      });

      res.json({ message: "Membre retiré du conseil syndical" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /governance/mandats ─────────────────────────────────────────────────
// Derives mandate list from conseil_syndical rows (all, not just active).
router.get(
  "/governance/mandats",
  requireAuth,
  requireGovernanceScope,
  async (req, res) => {
    try {
      const user = req.user!;
      if (!user.syndicateId) return void res.json({ data: [] });

      const rows = await db
        .select()
        .from(conseilSyndicalTable)
        .where(eq(conseilSyndicalTable.syndicateId, user.syndicateId))
        .orderBy(desc(conseilSyndicalTable.createdAt));

      const now = new Date();

      const mandats = rows.map((r) => {
        const end = r.mandateEnd ? new Date(r.mandateEnd) : null;
        let status: "actif" | "expire" | "vacant" = "actif";
        if (r.status !== "active") {
          status = "expire";
        } else if (end && end < now) {
          status = "expire";
        } else if (!r.name) {
          status = "vacant";
        }

        return {
          id: r.id,
          poste: r.role ?? "Poste non défini",
          holder: r.name ?? "",
          startDate: r.mandateStart ?? "",
          endDate: r.mandateEnd ?? "",
          status,
          bureau: "Conseil Syndical",
        };
      });

      res.json({ data: mandats });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /governance/delegations ─────────────────────────────────────────────
function delegationStatus(
  status: string,
  endDate: string,
): "active" | "expired" | "revoked" {
  if (status === "revoked") return "revoked";
  const end = new Date(endDate);
  return !Number.isNaN(end.getTime()) && end < new Date()
    ? "expired"
    : "active";
}

function serializeDelegation(
  row: typeof governanceDelegationsTable.$inferSelect,
) {
  return {
    id: row.id,
    delegant: row.delegantName,
    delegataire: row.delegataireName,
    domaine: row.domaine,
    startDate: row.startDate,
    endDate: row.endDate,
    status: delegationStatus(row.status, row.endDate),
    description: row.description ?? "",
  };
}

router.get(
  "/governance/delegations",
  requireAuth,
  requireGovernanceScope,
  async (req, res) => {
    try {
      const user = req.user!;
      if (!user.syndicateId) return void res.json({ data: [] });

      const rows = await db
        .select()
        .from(governanceDelegationsTable)
        .where(eq(governanceDelegationsTable.syndicateId, user.syndicateId))
        .orderBy(desc(governanceDelegationsTable.createdAt));

      res.json({ data: rows.map(serializeDelegation) });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /governance/delegations ────────────────────────────────────────────
router.post(
  "/governance/delegations",
  requireAuth,
  requireGovernanceScope,
  requireGovernanceAccess,
  async (req, res) => {
    const dateOnly = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ");
    const schema = z.object({
      delegantId: z.string().min(1),
      delegataireId: z.string().min(1),
      domaine: z.string().trim().min(1).max(200),
      description: z.string().trim().max(2000).optional().default(""),
      startDate: dateOnly,
      endDate: dateOnly,
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }

    const {
      delegantId,
      delegataireId,
      domaine,
      description,
      startDate,
      endDate,
    } = parsed.data;
    if (delegantId === delegataireId) {
      res
        .status(400)
        .json({ error: "Les deux membres doivent être différents" });
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      res
        .status(400)
        .json({ error: "La date de fin doit suivre la date de début" });
      return;
    }

    try {
      const user = req.user!;
      if (!user.syndicateId) {
        res.status(403).json({ error: "Syndicat non défini dans le token" });
        return;
      }

      const councilRows = await db
        .select()
        .from(conseilSyndicalTable)
        .where(
          and(
            eq(conseilSyndicalTable.syndicateId, user.syndicateId),
            eq(conseilSyndicalTable.status, "active"),
            inArray(conseilSyndicalTable.id, [delegantId, delegataireId]),
          ),
        );
      const delegant = councilRows.find((row) => row.id === delegantId);
      const delegataire = councilRows.find((row) => row.id === delegataireId);
      if (!delegant || !delegataire) {
        res.status(400).json({
          error:
            "Les délégant et délégataire doivent être membres actifs du conseil",
        });
        return;
      }

      const [row] = await db
        .insert(governanceDelegationsTable)
        .values({
          syndicateId: user.syndicateId,
          delegantId,
          delegantName: delegant.name,
          delegataireId,
          delegataireName: delegataire.name,
          domaine,
          description,
          startDate,
          endDate,
          status: "active",
          createdBy: user.userId,
        })
        .returning();

      await serverAuditLog(req, {
        action: "CREATE",
        entity: "governance_delegation",
        entityId: row.id,
        details: `${delegant.name} → ${delegataire.name} — ${domaine}`,
      });

      res.status(201).json({
        data: serializeDelegation(row),
        message: "Délégation créée",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── DELETE /governance/delegations/:id ───────────────────────────────────────
router.delete(
  "/governance/delegations/:id",
  requireAuth,
  requireGovernanceScope,
  requireGovernanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      if (!user.syndicateId) {
        res.status(403).json({ error: "Syndicat non défini dans le token" });
        return;
      }
      const id = String(req.params.id);
      const [existing] = await db
        .select()
        .from(governanceDelegationsTable)
        .where(
          and(
            eq(governanceDelegationsTable.id, id),
            eq(governanceDelegationsTable.syndicateId, user.syndicateId),
          ),
        );
      if (!existing) {
        res.status(404).json({ error: "Délégation introuvable" });
        return;
      }
      if (existing.status === "revoked") {
        res.status(409).json({ error: "Cette délégation est déjà révoquée" });
        return;
      }

      await db
        .update(governanceDelegationsTable)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedBy: user.userId,
        })
        .where(
          and(
            eq(governanceDelegationsTable.id, id),
            eq(governanceDelegationsTable.syndicateId, user.syndicateId),
          ),
        );

      await serverAuditLog(req, {
        action: "DELETE",
        entity: "governance_delegation",
        entityId: id,
        details: `${existing.delegantName} → ${existing.delegataireName} — ${existing.domaine}`,
      });

      res.json({ message: "Délégation révoquée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
