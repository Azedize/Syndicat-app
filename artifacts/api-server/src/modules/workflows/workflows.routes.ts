import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { workflowsTable, workflowStepsTable } from "@workspace/db/schema";
import { eq, asc, desc, count } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../../lib/paginate.js";
import { serverAuditLog } from "../../lib/audit.js";
import { localToday } from "../../lib/charge-time.js";
import { withSteps } from "./workflows.service.js";

import { optionalIsoDateSchema } from "../../lib/dateSchemas.js";
const router = Router();

// ─── GET /workflows ───────────────────────────────────────────────────────────
// Platform-wide governance processes. The table has no condominium column,
// yet its rows describe one condominium's affairs (a budget to validate, a
// formal notice for unpaid charges…): readable by everyone, they leaked from
// one condominium to all the others. Until the model is scoped to a
// condominium, only the platform reads them (it alone creates and decides).
router.get("/workflows", requireAuth, requireSuperAdmin, async (req, res) => {
  const { status } = req.query as Record<string, string>;
  const pagination = getPagination(req, 50);
  try {
    const where = status ? eq(workflowsTable.status, status) : undefined;
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(workflowsTable)
        .where(where)
        .orderBy(desc(workflowsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(workflowsTable).where(where),
    ]);
    const enriched = await withSteps(rows);
    res.json(buildPagedResponse(enriched, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /workflows/:id ───────────────────────────────────────────────────────
router.get("/workflows/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, String(req.params.id)));
    if (!row) {
      res.status(404).json({ error: "Workflow introuvable" });
      return;
    }
    const [enriched] = await withSteps([row]);
    res.json({ data: enriched });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /workflows — admin: create a new approval workflow ────────────────
router.post("/workflows", requireAuth, requireSuperAdmin, async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).max(200),
    category: z.string().min(1).max(100),
    description: z.string().max(5000).default(""),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    deadline: optionalIsoDateSchema,
    document: z.string().max(300).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ error: "Données invalides", details: result.error.flatten() });
    return;
  }

  try {
    const { title, category, description, priority, deadline, document } =
      result.data;
    const startDate = localToday();

    const [wf] = await db
      .insert(workflowsTable)
      .values({
        title,
        category,
        description,
        priority,
        startDate,
        deadline,
        document,
        status: "in_progress",
        currentStep: 0,
        initiatorId: req.user!.userId,
        initiatorName: req.user!.name,
      } as any)
      .returning();

    const template = [
      {
        title: "Validation initiale",
        assignee: req.user!.name,
        role: "Initiateur",
        status: "current",
      },
      {
        title: "Approbation direction",
        assignee: "Direction",
        role: "Direction",
        status: "waiting",
      },
      {
        title: "Publication",
        assignee: "Secrétariat Général",
        role: "Admin",
        status: "waiting",
      },
    ];
    const steps = await db
      .insert(workflowStepsTable)
      .values(
        template.map((s, i) => ({ ...s, workflowId: wf.id, stepOrder: i })),
      )
      .returning();

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "workflow",
      entityId: wf.id,
      details: title,
      platformAction: true,
    });
    res.status(201).json({ data: { ...wf, steps }, message: "Workflow créé" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /workflows/:id/decision — admin: approve/reject the current step ──
router.post(
  "/workflows/:id/decision",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      action: z.enum(["approve", "reject"]),
      comment: z.string().max(2000).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }

    try {
      const [wf] = await db
        .select()
        .from(workflowsTable)
        .where(eq(workflowsTable.id, id));
      if (!wf) {
        res.status(404).json({ error: "Workflow introuvable" });
        return;
      }
      if (wf.status !== "in_progress") {
        res
          .status(400)
          .json({ error: "Ce workflow n'accepte plus de décisions" });
        return;
      }

      const steps = await db
        .select()
        .from(workflowStepsTable)
        .where(eq(workflowStepsTable.workflowId, id))
        .orderBy(asc(workflowStepsTable.stepOrder));
      const currentIdx = wf.currentStep ?? 0;
      const currentStepRow = steps[currentIdx];
      if (!currentStepRow) {
        res.status(400).json({ error: "Aucune étape en attente" });
        return;
      }

      const isApprove = result.data.action === "approve";
      const today = localToday();

      await db
        .update(workflowStepsTable)
        .set({
          status: isApprove ? "done" : "rejected",
          comment: result.data.comment ?? "",
          date: today,
        })
        .where(eq(workflowStepsTable.id, currentStepRow.id));

      const nextIdx = currentIdx + 1;
      const allDone = nextIdx >= steps.length;
      if (isApprove && !allDone) {
        await db
          .update(workflowStepsTable)
          .set({ status: "current" })
          .where(eq(workflowStepsTable.id, steps[nextIdx].id));
      }

      const newStatus = !isApprove
        ? "rejected"
        : allDone
          ? "approved"
          : "in_progress";
      const [updatedWf] = await db
        .update(workflowsTable)
        .set({
          currentStep: isApprove
            ? allDone
              ? currentIdx
              : nextIdx
            : currentIdx,
          status: newStatus,
        })
        .where(eq(workflowsTable.id, id))
        .returning();

      await serverAuditLog(req, {
        action: isApprove ? "APPROVE" : "REJECT",
        entity: "workflow",
        entityId: id,
        details: wf.title,
        platformAction: true,
      });

      const [enriched] = await withSteps([updatedWf]);
      res.json({
        data: enriched,
        message: isApprove ? "Étape approuvée" : "Étape rejetée",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
