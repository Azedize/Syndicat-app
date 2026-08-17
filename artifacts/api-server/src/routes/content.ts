import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { createAlert, sendEmailToMany } from "../lib/notify.js";
import { supportTicketTemplate } from "../lib/email/templates.js";
import {
  legalAlertsTable,
  supportTicketsTable,
  ticketRepliesTable,
  cotisationsTable,
  alertsTable,
  alertReadsTable,
  paymentProofsTable,
  notificationPreferencesTable,
  partnersTable,
  payslipsTable,
  subscriptionPlansTable,
  syndicateSubscriptionsTable,
  announcementsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, desc, count, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  syndicateWhere,
  effectiveSyndicateId,
} from "../lib/syndicate-filter.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

function isSameSyndicate(req: any, syndicateId: string | null): boolean {
  return (
    req.user.role === "super_admin" || req.user.syndicateId === syndicateId
  );
}

function requireSyndicateScope(req: any, res: any): string | null {
  if (req.user.role !== "super_admin" && !req.user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return null;
  }
  return req.user.syndicateId ?? null;
}

// ─── Legal Alerts ─────────────────────────────────────────────────────────────

router.get("/legal-alerts", requireAuth, async (req, res) => {
  const pagination = getPagination(req);
  try {
    const where = syndicateWhere(req, legalAlertsTable.syndicateId);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(legalAlertsTable)
        .where(where)
        .orderBy(desc(legalAlertsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(legalAlertsTable).where(where),
    ]);
    res.json(buildPagedResponse(rows, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/legal-alerts",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      description: z.string(),
      level: z.enum(["critical", "warning", "info"]),
      category: z.enum([
        "statuts",
        "budget",
        "election",
        "travail",
        "convention",
      ]),
      date: z.string(),
      action: z.string().optional(),
      syndicateId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      const [row] = await db
        .insert(legalAlertsTable)
        .values({ ...data, syndicateId: sid, status: "open" })
        .returning();
      res.status(201).json({ data: row });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/legal-alerts/:id/resolve",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    try {
      const [alert] = await db
        .select()
        .from(legalAlertsTable)
        .where(eq(legalAlertsTable.id, id));
      if (!alert) {
        res.status(404).json({ error: "Alerte introuvable" });
        return;
      }
      if (!isSameSyndicate(req, alert.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const [updated] = await db
        .update(legalAlertsTable)
        .set({ status: "resolved" })
        .where(eq(legalAlertsTable.id, id))
        .returning();
      await serverAuditLog(req, {
        action: "RESOLVE",
        entity: "legal_alert",
        entityId: id,
        syndicateId: alert.syndicateId ?? undefined,
      });
      res.json({ data: updated, message: "Alerte résolue" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Support Tickets ──────────────────────────────────────────────────────────

// ─── Support helpers ──────────────────────────────────────────────────────────

// Categories valid for each scope
const SYNDICATE_CATEGORIES = [
  "paiement",
  "maintenance",
  "juridique",
  "administratif",
  "general",
] as const;
const PLATFORM_CATEGORIES = [
  "bug",
  "feature",
  "acces",
  "formation",
  "autre",
] as const;
type SyndicateCat = (typeof SYNDICATE_CATEGORIES)[number];
type PlatformCat = (typeof PLATFORM_CATEGORIES)[number];

/** Return true when the caller may access/modify this ticket. */
function canAccessTicket(
  req: any,
  ticket: {
    syndicateId: string | null;
    scope: string | null;
    submittedById: string | null;
  },
): boolean {
  const role = req.user!.role as string;
  const uid = req.user!.userId as string;
  const sid = req.user!.syndicateId as string | null;

  if (role === "super_admin") return true;

  // Platform tickets: syndicate_admin may see their own, members may never see platform tickets
  if (ticket.scope === "platform") {
    return role === "syndicate_admin" && ticket.syndicateId === sid;
  }

  // Syndicate tickets: same syndicate; members/tenants only their own
  if (ticket.syndicateId !== sid) return false;
  if (role === "syndicate_admin") return true;
  return ticket.submittedById === uid;
}

// ─── Support — LIST ──────────────────────────────────────────────────────────

router.get("/support", requireAuth, async (req, res) => {
  const { status, scope } = req.query as Record<string, string>;
  const pagination = getPagination(req);
  const role = req.user!.role as string;
  const uid = req.user!.userId as string;
  const sid = req.user!.syndicateId as string | null;

  if (role !== "super_admin" && !requireSyndicateScope(req, res)) return;

  try {
    const conditions: any[] = [];

    if (role === "super_admin") {
      // Super-admin only manages platform-scope tickets (Level 2)
      conditions.push(eq(supportTicketsTable.scope, "platform"));
    } else if (role === "syndicate_admin") {
      if (scope === "platform") {
        // Their own platform tickets (Level 2 they submitted)
        conditions.push(eq(supportTicketsTable.scope, "platform"));
        if (sid) conditions.push(eq(supportTicketsTable.syndicateId, sid));
      } else {
        // Syndicate-level tickets they manage (Level 1)
        conditions.push(eq(supportTicketsTable.scope, "syndicate"));
        if (sid) conditions.push(eq(supportTicketsTable.syndicateId, sid));
      }
    } else {
      // member / tenant — only their own syndicate-level tickets
      conditions.push(eq(supportTicketsTable.scope, "syndicate"));
      conditions.push(eq(supportTicketsTable.submittedById, uid));
    }

    if (status) conditions.push(eq(supportTicketsTable.status, status as any));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(supportTicketsTable)
        .where(where)
        .orderBy(desc(supportTicketsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(supportTicketsTable).where(where),
    ]);
    res.json(buildPagedResponse(rows, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Support — CREATE ─────────────────────────────────────────────────────────

router.post("/support", requireAuth, async (req, res) => {
  const role = req.user!.role as string;
  const sid = req.user!.syndicateId as string | null;

  // Determine scope — only syndicate_admin / super_admin may open platform tickets
  const requestedScope = String(req.body?.scope ?? "syndicate");
  const scope = requestedScope === "platform" ? "platform" : "syndicate";
  if (
    scope === "platform" &&
    role !== "syndicate_admin" &&
    role !== "super_admin"
  ) {
    res
      .status(403)
      .json({
        error:
          "Seuls les administrateurs peuvent contacter le support plateforme.",
      });
    return;
  }
  if (!sid && scope === "syndicate") {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return;
  }
  if (!sid && role !== "super_admin") {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return;
  }

  const schema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    priority: z.enum(["high", "medium", "low"]).default("medium"),
    category:
      scope === "platform"
        ? z.enum(PLATFORM_CATEGORIES).default("autre")
        : z.enum(SYNDICATE_CATEGORIES).default("general"),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ error: "Données invalides", details: result.error.flatten() });
    return;
  }

  try {
    const [ticket] = await db
      .insert(supportTicketsTable)
      .values({
        ...result.data,
        scope,
        syndicateId: sid,
        submittedById: req.user!.userId,
        submittedByName: req.user!.name,
        status: "open",
      } as any)
      .returning();

    const urgencyType = result.data.priority === "high" ? "error" : "warning";

    if (scope === "syndicate") {
      // Level 1: alert and notify syndicate admin only
      createAlert({
        title: "Nouveau ticket support",
        message: `"${result.data.title}" de ${req.user!.name} (${result.data.priority}).`,
        type: urgencyType,
        syndicateId: sid || null,
        target: "admin",
      }).catch(() => {});

      (async () => {
        if (!sid) return;
        const admins = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.syndicateId, sid),
              eq(usersTable.role, "syndicate_admin"),
            ),
          );
        const { subject, html } = supportTicketTemplate(
          result.data.title,
          req.user!.name,
          result.data.priority,
        );
        await sendEmailToMany(
          admins.map((a) => a.email),
          subject,
          html,
          "support_ticket",
          sid,
        );
      })().catch(() => {});
    } else {
      // Level 2: alert and notify all super_admins
      createAlert({
        title: "Nouveau ticket plateforme",
        message: `"${result.data.title}" de ${req.user!.name} — syndicat ${sid ?? "?"} (${result.data.priority}).`,
        type: urgencyType,
        syndicateId: null,
        target: "admin",
      }).catch(() => {});

      (async () => {
        const admins = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.role, "super_admin"));
        const { subject, html } = supportTicketTemplate(
          result.data.title,
          req.user!.name,
          result.data.priority,
        );
        await sendEmailToMany(
          admins.map((a) => a.email),
          subject,
          html,
          "support_ticket",
          null,
        );
      })().catch(() => {});
    }

    res.status(201).json({ data: ticket, message: "Ticket créé" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Support — DETAIL ─────────────────────────────────────────────────────────

router.get("/support/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  if (req.user!.role !== "super_admin" && !requireSyndicateScope(req, res))
    return;
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket introuvable" });
      return;
    }
    if (!canAccessTicket(req, ticket)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    const replies = await db
      .select()
      .from(ticketRepliesTable)
      .where(eq(ticketRepliesTable.ticketId, id))
      .orderBy(ticketRepliesTable.createdAt);
    res.json({ data: { ...ticket, replies } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Support — REPLY ──────────────────────────────────────────────────────────

router.post("/support/:id/replies", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  if (req.user!.role !== "super_admin" && !requireSyndicateScope(req, res))
    return;
  const schema = z.object({ text: z.string().min(1).max(5000) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Réponse invalide" });
    return;
  }
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id));
    if (!ticket) {
      res.status(404).json({ error: "Ticket introuvable" });
      return;
    }
    if (!canAccessTicket(req, ticket)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const [reply] = await db
      .insert(ticketRepliesTable)
      .values({
        ticketId: id,
        authorId: req.user!.userId,
        authorName: req.user!.name,
        text: result.data.text,
      })
      .returning();
    await db
      .update(supportTicketsTable)
      .set({ status: "in_progress" })
      .where(eq(supportTicketsTable.id, id));

    // Notify the ticket submitter that a reply arrived
    createAlert({
      title: "Réponse à votre ticket",
      message: `${req.user!.name} a répondu à votre ticket.`,
      type: "info",
      syndicateId: ticket.syndicateId || null,
      target: "admin",
    }).catch(() => {});

    res.status(201).json({ data: reply, message: "Réponse ajoutée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Support — RESOLVE ────────────────────────────────────────────────────────

router.put(
  "/support/:id/resolve",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    if (req.user!.role !== "super_admin" && !requireSyndicateScope(req, res))
      return;
    try {
      const [ticket] = await db
        .select()
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.id, id));
      if (!ticket) {
        res.status(404).json({ error: "Ticket introuvable" });
        return;
      }
      if (!canAccessTicket(req, ticket)) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const [updated] = await db
        .update(supportTicketsTable)
        .set({ status: "resolved" })
        .where(eq(supportTicketsTable.id, id))
        .returning();
      res.json({ data: updated, message: "Ticket résolu" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Support — ESCALATE (Level 1 → Level 2) ──────────────────────────────────

router.post(
  "/support/:id/escalate",
  requireAuth,
  requireRole("syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const sid = req.user!.syndicateId as string | null;
    if (!sid) {
      res.status(403).json({ error: "Syndicat non défini dans le token" });
      return;
    }
    try {
      const [ticket] = await db
        .select()
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.id, id));
      if (!ticket) {
        res.status(404).json({ error: "Ticket introuvable" });
        return;
      }
      if (ticket.scope !== "syndicate") {
        res
          .status(400)
          .json({
            error: "Seuls les tickets syndicat peuvent être escaladés.",
          });
        return;
      }
      if (ticket.syndicateId !== sid) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      // Create a Level-2 platform ticket that references the original
      const [platformTicket] = await db
        .insert(supportTicketsTable)
        .values({
          title: `[ESCALADE] ${ticket.title}`,
          description: ticket.description,
          priority: ticket.priority ?? "medium",
          category: "bug",
          scope: "platform",
          escalatedFrom: ticket.id,
          syndicateId: sid,
          submittedById: req.user!.userId,
          submittedByName: req.user!.name,
          status: "open",
        } as any)
        .returning();

      // Mark original as escalated (in_progress)
      await db
        .update(supportTicketsTable)
        .set({ status: "in_progress" })
        .where(eq(supportTicketsTable.id, id));

      // Notify super_admins
      createAlert({
        title: "Ticket escaladé vers la plateforme",
        message: `"${ticket.title}" a été escaladé par ${req.user!.name}.`,
        type: "error",
        syndicateId: null,
        target: "admin",
      }).catch(() => {});

      res
        .status(201)
        .json({
          data: platformTicket,
          message: "Ticket escaladé au support plateforme",
        });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Cotisations ──────────────────────────────────────────────────────────────

router.get("/cotisations", requireAuth, async (req, res) => {
  const pagination = getPagination(req);
  const sid = requireSyndicateScope(req, res);
  if (req.user!.role !== "super_admin" && !sid) return;
  try {
    const where =
      req.user!.role === "member"
        ? and(
            eq(cotisationsTable.memberId, req.user!.userId),
            eq(cotisationsTable.syndicateId, sid!),
          )
        : syndicateWhere(req, cotisationsTable.syndicateId);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(cotisationsTable)
        .where(where)
        .orderBy(desc(cotisationsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(cotisationsTable).where(where),
    ]);
    res.json(buildPagedResponse(rows, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * POST /cotisations — Admin creates a cotisation record for a member
 */
router.post(
  "/cotisations",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      memberId: z.string().min(1),
      label: z.string().min(1),
      period: z.string().min(1),
      amount: z.number().positive(),
      dueDate: z.string(),
      status: z.enum(["pending", "paid", "overdue"]).default("pending"),
      syndicateId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      const [row] = await db
        .insert(cotisationsTable)
        .values({ ...data, syndicateId: sid } as any)
        .returning();
      res.status(201).json({ data: row, message: "Cotisation créée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

/**
 * POST /cotisations/:id/pay
 * Member submits payment proof (mandatory) → status becomes "pending_validation",
 * pending admin review at PUT /payment-proofs/:id/review. Members can never
 * self-mark a cotisation as paid.
 * Admins may mark a cotisation as paid directly (e.g. confirmed cash/bank payment).
 */
router.put("/cotisations/:id/pay", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const schema = z.object({ proofUrl: z.string().url().optional() });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const [cotisation] = await db
      .select()
      .from(cotisationsTable)
      .where(eq(cotisationsTable.id, id));
    if (!cotisation) {
      res.status(404).json({ error: "Cotisation introuvable" });
      return;
    }
    const isMember = req.user!.role === "member";
    if (isMember && cotisation.memberId !== req.user!.userId) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    if (!isMember && !isSameSyndicate(req, cotisation.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    if (cotisation.status === "paid") {
      res.status(400).json({ error: "Cette cotisation est déjà payée" });
      return;
    }

    if (isMember) {
      // Members can never self-mark a cotisation as paid — a proof of payment
      // is mandatory and always routes through admin review.
      if (!result.data.proofUrl) {
        res.status(400).json({ error: "Une preuve de paiement est requise" });
        return;
      }
      if (cotisation.status === "pending_validation") {
        res
          .status(400)
          .json({
            error:
              "Une preuve est déjà en attente de validation pour cette cotisation",
          });
        return;
      }
      await db.transaction(async (tx) => {
        await tx
          .update(cotisationsTable)
          .set({ status: "pending_validation" })
          .where(eq(cotisationsTable.id, id));
        await tx.insert(paymentProofsTable).values({
          cotisationId: id,
          proofUrl: result.data.proofUrl!,
          uploadedById: req.user!.userId,
          status: "pending",
        });
      });
      res.json({
        message: "Preuve de paiement soumise, en attente de validation",
      });
    } else {
      // Admin direct payment (bank transfer confirmed manually, cash, etc.)
      const receipt = `REC-${Date.now()}`;
      const [updated] = await db
        .update(cotisationsTable)
        .set({
          status: "paid",
          paidDate: new Date().toISOString().split("T")[0],
          receipt,
        })
        .where(eq(cotisationsTable.id, id))
        .returning();
      res.json({ data: updated, message: "Paiement enregistré", receipt });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * GET /cotisations/:id/proofs — list payment proofs for a cotisation
 */
router.get(
  "/cotisations/:id/proofs",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    try {
      const [cotisation] = await db
        .select()
        .from(cotisationsTable)
        .where(eq(cotisationsTable.id, id));
      if (!cotisation) {
        res.status(404).json({ error: "Cotisation introuvable" });
        return;
      }
      if (!isSameSyndicate(req, cotisation.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const proofs = await db
        .select()
        .from(paymentProofsTable)
        .where(eq(paymentProofsTable.cotisationId, id))
        .orderBy(desc(paymentProofsTable.createdAt));
      res.json({ data: proofs });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

/**
 * PUT /payment-proofs/:id/review — admin approves or rejects a proof
 */
router.put(
  "/payment-proofs/:id/review",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      action: z.enum(["approve", "reject"]),
      note: z.string().max(500).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Action invalide" });
      return;
    }
    try {
      const [proof] = await db
        .select()
        .from(paymentProofsTable)
        .where(eq(paymentProofsTable.id, id));
      if (!proof) {
        res.status(404).json({ error: "Preuve introuvable" });
        return;
      }

      const [cotisation] = await db
        .select()
        .from(cotisationsTable)
        .where(eq(cotisationsTable.id, proof.cotisationId));
      if (!cotisation) {
        res.status(404).json({ error: "Cotisation introuvable" });
        return;
      }
      if (!isSameSyndicate(req, cotisation.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      const approved = result.data.action === "approve";
      await db.transaction(async (tx) => {
        await tx
          .update(paymentProofsTable)
          .set({
            status: approved ? "approved" : "rejected",
            reviewedById: req.user!.userId,
            reviewNote: result.data.note,
            reviewedAt: new Date(),
          })
          .where(eq(paymentProofsTable.id, id));

        if (approved) {
          const receipt = `REC-${Date.now()}`;
          await tx
            .update(cotisationsTable)
            .set({
              status: "paid",
              paidDate: new Date().toISOString().split("T")[0],
              receipt,
            })
            .where(eq(cotisationsTable.id, proof.cotisationId));
        } else {
          // Rejected → revert to pending
          await tx
            .update(cotisationsTable)
            .set({ status: "pending" })
            .where(eq(cotisationsTable.id, proof.cotisationId));
        }
      });

      await serverAuditLog(req, {
        action: approved ? "APPROVE_PROOF" : "REJECT_PROOF",
        entity: "payment_proof",
        entityId: id,
        details: result.data.note,
        syndicateId: cotisation.syndicateId ?? undefined,
      });

      res.json({ message: approved ? "Paiement validé" : "Paiement rejeté" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── System Alerts (per-user reads) ──────────────────────────────────────────

router.get("/alerts", requireAuth, async (req, res) => {
  const pagination = getPagination(req);
  try {
    const where = syndicateWhere(req, alertsTable.syndicateId);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(alertsTable)
        .where(where)
        .orderBy(desc(alertsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(alertsTable).where(where),
    ]);

    // Annotate with per-user read status
    const alertIds = rows.map((a) => a.id);
    const readRows =
      alertIds.length > 0
        ? await db
            .select()
            .from(alertReadsTable)
            .where(
              and(
                inArray(alertReadsTable.alertId, alertIds),
                eq(alertReadsTable.userId, req.user!.userId),
              ),
            )
        : [];

    const readSet = new Set(readRows.map((r) => r.alertId));
    const annotated = rows.map((a) => ({
      ...a,
      readByUser: readSet.has(a.id),
    }));

    res.json({ ...buildPagedResponse(annotated, Number(total), pagination) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/alerts/:id/read", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  try {
    const [alert] = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.id, id));
    if (!alert) {
      res.status(404).json({ error: "Alerte introuvable" });
      return;
    }
    if (!isSameSyndicate(req, alert.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    // Upsert into per-user read table (ignore conflict)
    await db
      .insert(alertReadsTable)
      .values({ alertId: id, userId: req.user!.userId })
      .onConflictDoNothing();
    res.json({ message: "Alerte marquée comme lue" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/alerts/read-all", requireAuth, async (req, res) => {
  try {
    const where = syndicateWhere(req, alertsTable.syndicateId);
    const rows = await db
      .select({ id: alertsTable.id })
      .from(alertsTable)
      .where(where);
    if (rows.length === 0) {
      res.json({ message: "Aucune alerte" });
      return;
    }

    const values = rows.map((r) => ({
      alertId: r.id,
      userId: req.user!.userId,
    }));
    await db.insert(alertReadsTable).values(values).onConflictDoNothing();

    res.json({ message: "Toutes les alertes marquées comme lues" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/alerts",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      message: z.string().min(1),
      type: z.enum(["info", "warning", "success", "error"]).default("info"),
      date: z.string(),
      target: z.enum(["all", "admin", "member"]).default("all"),
      syndicateId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      const [row] = await db
        .insert(alertsTable)
        .values({ ...data, syndicateId: sid } as any)
        .returning();
      res.status(201).json({ data: row });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Notification Preferences ─────────────────────────────────────────────────

router.get("/notifications/preferences", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(notificationPreferencesTable)
      .where(eq(notificationPreferencesTable.userId, req.user!.userId));
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/notifications/preferences/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const schema = z.object({
    push: z.boolean().optional(),
    email: z.boolean().optional(),
    inApp: z.boolean().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const [updated] = await db
      .update(notificationPreferencesTable)
      .set(result.data)
      .where(
        and(
          eq(notificationPreferencesTable.id, id),
          eq(notificationPreferencesTable.userId, req.user!.userId),
        ),
      )
      .returning();
    res.json({ data: updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Partners ─────────────────────────────────────────────────────────────────

router.get("/partners", requireAuth, async (req, res) => {
  const pagination = getPagination(req);
  try {
    const where = syndicateWhere(req, partnersTable.syndicateId);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(partnersTable)
        .where(where)
        .orderBy(desc(partnersTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(partnersTable).where(where),
    ]);
    res.json(buildPagedResponse(rows, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/partners",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      type: z.enum([
        "assurance",
        "banque",
        "formation",
        "sante",
        "juridique",
        "commercial",
        "autre",
      ]),
      sector: z.string(),
      contact: z.string(),
      phone: z.string(),
      email: z.string(),
      benefit: z.string(),
      discount: z.string().optional(),
      startDate: z.string(),
      endDate: z.string().optional(),
      description: z.string().default(""),
      syndicateId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      const [row] = await db
        .insert(partnersTable)
        .values({ ...data, syndicateId: sid, status: "pending" } as any)
        .returning();
      res.status(201).json({ data: row, message: "Partenaire ajouté" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/partners/:id/status",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      status: z.enum(["active", "pending", "expired"]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }
    try {
      const [partner] = await db
        .select()
        .from(partnersTable)
        .where(eq(partnersTable.id, id));
      if (!partner) {
        res.status(404).json({ error: "Partenaire introuvable" });
        return;
      }
      if (!isSameSyndicate(req, partner.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const [updated] = await db
        .update(partnersTable)
        .set({ status: result.data.status } as any)
        .where(eq(partnersTable.id, id))
        .returning();
      res.json({ data: updated });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Payslips ─────────────────────────────────────────────────────────────────

router.get("/payslips", requireAuth, async (req, res) => {
  const pagination = getPagination(req);
  try {
    const where =
      req.user!.role === "member"
        ? eq(payslipsTable.userId, req.user!.userId)
        : syndicateWhere(req, payslipsTable.syndicateId);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(payslipsTable)
        .where(where)
        .orderBy(desc(payslipsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(payslipsTable).where(where),
    ]);
    res.json(buildPagedResponse(rows, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/payslips",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      role: z.string(),
      month: z.string(),
      baseSalary: z.number().int().positive(),
      allowances: z.number().int().nonnegative().default(0),
      deductions: z.number().int().nonnegative().default(0),
      cnss: z.number().int().nonnegative().default(0),
      ir: z.number().int().nonnegative().default(0),
      mutuelle: z.number().int().nonnegative().default(0),
      syndicateId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      const netSalary =
        data.baseSalary +
        data.allowances -
        data.deductions -
        data.cnss -
        data.ir -
        data.mutuelle;
      const [row] = await db
        .insert(payslipsTable)
        .values({
          ...data,
          syndicateId: sid,
          netSalary,
          status: "draft",
        } as any)
        .returning();
      res.status(201).json({ data: row, message: "Fiche de paie générée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Subscriptions ────────────────────────────────────────────────────────────

router.get("/subscriptions/plans", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(subscriptionPlansTable);
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get(
  "/subscriptions",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(syndicateSubscriptionsTable)
        .orderBy(desc(syndicateSubscriptionsTable.createdAt));
      res.json({ data: rows });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/subscriptions/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      status: z.enum(["active", "trial", "suspended", "cancelled"]).optional(),
      autoRenew: z.boolean().optional(),
      planId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const [updated] = await db
        .update(syndicateSubscriptionsTable)
        .set(result.data)
        .where(eq(syndicateSubscriptionsTable.id, id))
        .returning();
      res.json({ data: updated, message: "Abonnement mis à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Announcements ────────────────────────────────────────────────────────────

router.get("/announcements", requireAuth, async (req, res) => {
  const pagination = getPagination(req);
  try {
    const where = syndicateWhere(req, announcementsTable.syndicateId);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(announcementsTable)
        .where(where)
        .orderBy(
          desc(announcementsTable.pinned),
          desc(announcementsTable.createdAt),
        )
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(announcementsTable).where(where),
    ]);
    res.json(buildPagedResponse(rows, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/announcements",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      priority: z.enum(["info", "important", "urgent"]).default("info"),
      audience: z.string().default("Tous les membres"),
      pinned: z.boolean().default(false),
      expiresAt: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res
        .status(400)
        .json({ error: "Données invalides", details: result.error.issues });
      return;
    }
    try {
      const synId = effectiveSyndicateId(req);
      if (!synId) {
        res.status(400).json({ error: "Syndicat requis" });
        return;
      }
      const [row] = await db
        .insert(announcementsTable)
        .values({
          ...result.data,
          syndicateId: synId,
          authorId: req.user!.userId,
          author: req.user!.name ?? "Administrateur",
          expiresAt: result.data.expiresAt
            ? new Date(result.data.expiresAt)
            : undefined,
        } as any)
        .returning();
      await serverAuditLog(req, {
        action: "create",
        entity: "announcement",
        entityId: row.id,
        details: `Annonce: ${row.title}`,
        syndicateId: synId,
      });
      res.status(201).json({ data: row, message: "Annonce publiée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/announcements/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      title: z.string().min(1).optional(),
      body: z.string().min(1).optional(),
      priority: z.enum(["info", "important", "urgent"]).optional(),
      audience: z.string().optional(),
      pinned: z.boolean().optional(),
      expiresAt: z.string().nullable().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const [existing] = await db
        .select()
        .from(announcementsTable)
        .where(eq(announcementsTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "Annonce introuvable" });
        return;
      }
      if (!isSameSyndicate(req, existing.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const { expiresAt, ...rest } = result.data;
      const [updated] = await db
        .update(announcementsTable)
        .set({
          ...rest,
          ...(expiresAt !== undefined
            ? { expiresAt: expiresAt ? new Date(expiresAt) : null }
            : {}),
        })
        .where(eq(announcementsTable.id, id))
        .returning();
      res.json({ data: updated, message: "Annonce mise à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.delete(
  "/announcements/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    try {
      const [existing] = await db
        .select()
        .from(announcementsTable)
        .where(eq(announcementsTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "Annonce introuvable" });
        return;
      }
      if (!isSameSyndicate(req, existing.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
      await serverAuditLog(req, {
        action: "delete",
        entity: "announcement",
        entityId: id,
        details: `Annonce supprimée: ${existing.title}`,
        syndicateId: existing.syndicateId ?? undefined,
      });
      res.json({ message: "Annonce supprimée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
