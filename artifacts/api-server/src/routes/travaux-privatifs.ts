/**
 * Travaux Privatifs — Resident Structural/Exterior Modification Requests
 *
 * Approval workflow (strict state machine):
 *
 *   submitted
 *     └─→ committee_review  (when requiresCommitteeReview)
 *     └─→ vote_required     (when requiresGAVote and !requiresCommitteeReview)
 *     └─→ under_review      (neither committee nor GA vote required)
 *
 *   committee_review
 *     └─→ vote_required     (recommendation === "escalate_vote")
 *     └─→ under_review      (recommendation === "approve" | "reject")
 *
 *   vote_required
 *     └─→ under_review      (after vote outcome is recorded)
 *
 *   under_review
 *     └─→ approved | rejected  (final decision — permanent legal record)
 *
 *   Any pre-final state → withdrawn  (requester only)
 *
 * Security: all /:id routes re-validate via assertUserCanAccessBuilding(user, row.buildingId)
 * so scoping never relies on nullable syndicateId.
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { travauxPrivatifsTable, buildingsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { assertUserCanAccessBuilding } from "../lib/scope.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// Helper: load a row and assert the caller has access to its building.
async function loadAndScope(id: string, user: any) {
  const [row] = await db
    .select()
    .from(travauxPrivatifsTable)
    .where(eq(travauxPrivatifsTable.id, id));
  if (!row) return null;
  // Re-validate via building — works for super_admin, syndicate_admin, member, tenant.
  await assertUserCanAccessBuilding(user, row.buildingId);
  return row;
}

// ─── GET /travaux-privatifs ───────────────────────────────────────────────────
router.get("/travaux-privatifs", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { status, buildingId } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (user.role !== "super_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    } else if (user.role === "super_admin") {
      // unrestricted
    } else if (user.role === "syndicate_admin") {
      conditions.push(eq(travauxPrivatifsTable.syndicateId, user.syndicateId!));
    } else {
      // member / tenant: only own requests
      conditions.push(eq(travauxPrivatifsTable.requestedById, user.userId));
    }

    if (buildingId) {
      try { await assertUserCanAccessBuilding(user, buildingId); } catch {
        return void res.status(403).json({ error: "Accès refusé à cet immeuble" });
      }
      conditions.push(eq(travauxPrivatifsTable.buildingId, buildingId));
    }

    if (status) conditions.push(eq(travauxPrivatifsTable.status, status));

    const rows = await db
      .select()
      .from(travauxPrivatifsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(travauxPrivatifsTable.createdAt));

    res.json({ data: rows, total: rows.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /travaux-privatifs/:id ───────────────────────────────────────────────
router.get("/travaux-privatifs/:id", requireAuth, async (req, res) => {
  try {
    const row = await loadAndScope(String(String(req.params.id)), req.user!).catch(() => null);
    if (!row) return void res.status(404).json({ error: "Demande introuvable ou accès refusé" });
    res.json({ data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /travaux-privatifs ──────────────────────────────────────────────────
const submitSchema = z.object({
  buildingId: z.string().min(1),
  lotId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  workType: z.enum(["ac_unit", "balcony", "windows", "facade", "structural", "plumbing", "electrical", "other"]),
  currentPhotoUrls: z.array(z.string()).default([]),
  proposedPhotoUrls: z.array(z.string()).default([]),
  planUrls: z.array(z.string()).default([]),
});

router.post("/travaux-privatifs", requireAuth, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    const { buildingId, lotId, title, description, workType,
            currentPhotoUrls, proposedPhotoUrls, planUrls } = parsed.data;

    try { await assertUserCanAccessBuilding(user, buildingId); } catch {
      return void res.status(403).json({ error: "Accès refusé à cet immeuble" });
    }

    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId));

    const [row] = await db
      .insert(travauxPrivatifsTable)
      .values({
        buildingId,
        lotId,
        syndicateId: building?.syndicateId ?? user.syndicateId ?? null,
        requestedById: user.userId,
        requestedByName: user.name,
        title: title.trim(),
        description: description.trim(),
        workType,
        currentPhotoUrls: JSON.stringify(currentPhotoUrls),
        proposedPhotoUrls: JSON.stringify(proposedPhotoUrls),
        planUrls: JSON.stringify(planUrls),
        status: "submitted",
      })
      .returning();

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "travaux_privatifs",
      entityId: row.id,
      details: `Demande de travaux privatifs soumise: ${title}`,
    });

    res.status(201).json({ data: row, message: "Demande soumise avec succès" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /travaux-privatifs/:id/syndic-review ────────────────────────────────
const syndicReviewSchema = z.object({
  reviewNote: z.string().min(1).max(3000),
  bylawReference: z.string().max(500).optional(),
  requiresCommitteeReview: z.boolean(),
  requiresGAVote: z.boolean(),
});

router.post("/travaux-privatifs/:id/syndic-review", requireAuth, requireAdmin, async (req, res) => {
  const parsed = syndicReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    let row: any;
    try { row = await loadAndScope(String(String(req.params.id)), user); } catch {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    if (!row) return void res.status(404).json({ error: "Demande introuvable" });
    if (row.status !== "submitted") {
      return void res.status(400).json({ error: "La revue initiale ne peut être effectuée que sur une demande soumise" });
    }

    const { reviewNote, bylawReference, requiresCommitteeReview, requiresGAVote } = parsed.data;

    // Strict next-state: committee before vote if both required
    let nextStatus: string;
    if (requiresCommitteeReview) {
      nextStatus = "committee_review"; // committee goes first; it can then escalate to vote
    } else if (requiresGAVote) {
      nextStatus = "vote_required";
    } else {
      nextStatus = "under_review"; // syndic decides directly
    }

    const [updated] = await db
      .update(travauxPrivatifsTable)
      .set({
        status: nextStatus,
        syndicReviewNote: reviewNote,
        bylawReference: bylawReference ?? null,
        requiresCommitteeReview,
        requiresGAVote,
        syndicReviewedById: user.userId,
        syndicReviewedByName: user.name,
        syndicReviewedAt: new Date(),
      })
      .where(eq(travauxPrivatifsTable.id, String(String(req.params.id))))
      .returning();

    await serverAuditLog(req, {
      action: "SYNDIC_REVIEW",
      entity: "travaux_privatifs",
      entityId: row.id,
      details: `Revue syndicale → ${nextStatus} (committee:${requiresCommitteeReview} vote:${requiresGAVote})`,
    });

    res.json({ data: updated, message: "Revue initiale enregistrée" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /travaux-privatifs/:id/committee-review ─────────────────────────────
const committeeReviewSchema = z.object({
  committeeNote: z.string().min(1).max(5000),
  recommendation: z.enum(["approve", "reject", "escalate_vote"]),
});

router.post("/travaux-privatifs/:id/committee-review", requireAuth, requireAdmin, async (req, res) => {
  const parsed = committeeReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    let row: any;
    try { row = await loadAndScope(String(String(req.params.id)), user); } catch {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    if (!row) return void res.status(404).json({ error: "Demande introuvable" });
    if (row.status !== "committee_review") {
      return void res.status(400).json({ error: "Cette demande n'est pas en phase de revue par comité" });
    }

    const { committeeNote, recommendation } = parsed.data;

    // escalate_vote → vote_required; approve or reject → under_review for final syndic decision
    const nextStatus = recommendation === "escalate_vote" ? "vote_required" : "under_review";

    const [updated] = await db
      .update(travauxPrivatifsTable)
      .set({
        status: nextStatus,
        committeeNote,
        committeeRecommendation: recommendation,
        committeeReviewedById: user.userId,
        committeeReviewedByName: user.name,
        committeeReviewedAt: new Date(),
      })
      .where(eq(travauxPrivatifsTable.id, String(String(req.params.id))))
      .returning();

    await serverAuditLog(req, {
      action: "COMMITTEE_REVIEW",
      entity: "travaux_privatifs",
      entityId: row.id,
      details: `Avis comité: ${recommendation} → ${nextStatus}`,
    });

    res.json({ data: updated, message: "Avis du comité enregistré" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /travaux-privatifs/:id/vote ─────────────────────────────────────────
const voteSchema = z.object({
  voteOutcome: z.enum(["approved", "rejected", "inconclusive"]),
  voteDate: z.string().min(1),
  voteSummary: z.string().min(1).max(3000),
  voteItemId: z.string().optional(),
});

router.post("/travaux-privatifs/:id/vote", requireAuth, requireAdmin, async (req, res) => {
  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    let row: any;
    try { row = await loadAndScope(String(String(req.params.id)), user); } catch {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    if (!row) return void res.status(404).json({ error: "Demande introuvable" });
    if (row.status !== "vote_required") {
      return void res.status(400).json({ error: "Cette demande n'est pas en phase de vote" });
    }

    const { voteOutcome, voteDate, voteSummary, voteItemId } = parsed.data;

    const [updated] = await db
      .update(travauxPrivatifsTable)
      .set({
        status: "under_review", // syndic issues the formal final decision after vote
        voteOutcome,
        voteDate,
        voteSummary,
        voteItemId: voteItemId ?? null,
      })
      .where(eq(travauxPrivatifsTable.id, String(String(req.params.id))))
      .returning();

    await serverAuditLog(req, {
      action: "VOTE_RECORDED",
      entity: "travaux_privatifs",
      entityId: row.id,
      details: `Résultat vote AG: ${voteOutcome}`,
    });

    res.json({ data: updated, message: "Résultat du vote enregistré" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /travaux-privatifs/:id/decision ────────────────────────────────────
// Permanent legal record — only from under_review, never skipping stages.
const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  justification: z.string().min(10, "La justification doit comporter au moins 10 caractères").max(5000),
});

router.post("/travaux-privatifs/:id/decision", requireAuth, requireAdmin, async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    let row: any;
    try { row = await loadAndScope(String(String(req.params.id)), user); } catch {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    if (!row) return void res.status(404).json({ error: "Demande introuvable" });

    // Strict: final decision only from under_review (all review/vote steps must be complete first)
    if (row.status !== "under_review") {
      return void res.status(400).json({
        error: "La décision finale ne peut être rendue qu'après revue complète du dossier (statut : en examen)",
      });
    }

    const { decision, justification } = parsed.data;

    const [updated] = await db
      .update(travauxPrivatifsTable)
      .set({
        status: decision,
        finalDecision: decision,
        finalDecisionNote: justification,
        finalDecisionById: user.userId,
        finalDecisionByName: user.name,
        finalDecisionAt: new Date(),
      })
      .where(eq(travauxPrivatifsTable.id, String(String(req.params.id))))
      .returning();

    await serverAuditLog(req, {
      action: "FINAL_DECISION",
      entity: "travaux_privatifs",
      entityId: row.id,
      details: `Décision finale: ${decision}`,
    });

    res.json({
      data: updated,
      message: `Demande ${decision === "approved" ? "approuvée" : "refusée"} et archivée`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /travaux-privatifs/:id/withdraw ─────────────────────────────────────
router.put("/travaux-privatifs/:id/withdraw", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const [row] = await db
      .select()
      .from(travauxPrivatifsTable)
      .where(eq(travauxPrivatifsTable.id, String(String(req.params.id))));
    if (!row) return void res.status(404).json({ error: "Demande introuvable" });
    if (row.requestedById !== user.userId) {
      return void res.status(403).json({ error: "Seul le demandeur peut retirer sa demande" });
    }
    if (["approved", "rejected", "withdrawn"].includes(row.status ?? "")) {
      return void res.status(400).json({ error: "Cette demande ne peut plus être retirée" });
    }

    const [updated] = await db
      .update(travauxPrivatifsTable)
      .set({ status: "withdrawn" })
      .where(eq(travauxPrivatifsTable.id, String(String(req.params.id))))
      .returning();

    res.json({ data: updated, message: "Demande retirée" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
