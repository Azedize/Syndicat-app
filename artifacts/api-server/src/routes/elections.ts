import { Router } from "express";
import { z } from "zod";
import { sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { electionsTable, candidatesTable, votesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

router.get("/elections", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    const elections = syndicateId
      ? await db.select().from(electionsTable).where(eq(electionsTable.syndicateId, syndicateId))
      : await db.select().from(electionsTable);

    if (elections.length === 0) {
      res.json({ data: [] });
      return;
    }

    const electionIds = elections.map((e) => e.id);

    // Batch-fetch all candidates and user votes in exactly 2 queries (no N+1)
    const [allCandidates, allUserVotes] = await Promise.all([
      db.select().from(candidatesTable).where(inArray(candidatesTable.electionId, electionIds)),
      db.select().from(votesTable).where(
        and(
          inArray(votesTable.electionId, electionIds),
          eq(votesTable.voterId, req.user!.userId),
        ),
      ),
    ]);

    const candidatesByElection = new Map<string, typeof allCandidates>();
    for (const c of allCandidates) {
      if (!candidatesByElection.has(c.electionId)) {
        candidatesByElection.set(c.electionId, []);
      }
      candidatesByElection.get(c.electionId)!.push(c);
    }

    const votedElectionMap = new Map(allUserVotes.map((v) => [v.electionId, v.candidateId]));

    const withCandidates = elections.map((e) => ({
      ...e,
      candidates: candidatesByElection.get(e.id) ?? [],
      userVotedCandidateId: votedElectionMap.get(e.id) ?? null,
    }));

    res.json({ data: withCandidates });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/elections",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().default(""),
      status: z.enum(["open", "closed", "upcoming"]).default("upcoming"),
      startDate: z.string(),
      endDate: z.string(),
      candidates: z
        .array(
          z.object({ name: z.string().min(1), post: z.string().min(1), bio: z.string().default("") }),
        )
        .default([]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const syndicateId = req.user!.syndicateId || "";
      const [election] = await db
        .insert(electionsTable)
        .values({
          syndicateId,
          title: result.data.title,
          description: result.data.description,
          status: result.data.status,
          startDate: result.data.startDate,
          endDate: result.data.endDate,
          createdBy: req.user!.userId,
        })
        .returning();
      if (result.data.candidates.length > 0) {
        await db
          .insert(candidatesTable)
          .values(result.data.candidates.map((c) => ({ ...c, electionId: election.id })));
      }
      await serverAuditLog(req, {
        action: "CREATE",
        entity: "election",
        entityId: election.id,
        details: `Élection créée: ${election.title}`,
      });
      res.status(201).json({ data: election, message: "Élection créée avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/elections/:id/status",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = req.params.id as string;
    const schema = z.object({ status: z.enum(["open", "closed", "upcoming"]) });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Statut invalide" }); return; }
    try {
      const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
      if (!election) { res.status(404).json({ error: "Élection introuvable" }); return; }
      if (
        req.user!.role !== "super_admin" &&
        election.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const [updated] = await db
        .update(electionsTable)
        .set({ status: result.data.status })
        .where(eq(electionsTable.id, id))
        .returning();
      await serverAuditLog(req, {
        action: "UPDATE_STATUS",
        entity: "election",
        entityId: id,
        details: `Statut → ${result.data.status}`,
      });
      res.json({ data: updated, message: "Statut mis à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.post("/elections/:id/vote", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const schema = z.object({ candidateId: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Candidat requis" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [election] = await tx
        .select()
        .from(electionsTable)
        .where(eq(electionsTable.id, id));

      if (!election) {
        throw Object.assign(new Error("NOT_FOUND"), { status: 404, msg: "Élection introuvable" });
      }
      if (election.status !== "open") {
        throw Object.assign(new Error("NOT_OPEN"), {
          status: 400,
          msg: "Cette élection n'est pas ouverte au vote",
        });
      }
      if (req.user!.syndicateId && election.syndicateId !== req.user!.syndicateId) {
        throw Object.assign(new Error("FORBIDDEN"), {
          status: 403,
          msg: "Accès refusé",
        });
      }

      const [candidate] = await tx
        .select()
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.id, result.data.candidateId),
            eq(candidatesTable.electionId, id),
          ),
        );
      if (!candidate) {
        throw Object.assign(new Error("BAD_CANDIDATE"), {
          status: 400,
          msg: "Ce candidat n'appartient pas à cette élection",
        });
      }

      const existing = await tx
        .select()
        .from(votesTable)
        .where(and(eq(votesTable.electionId, id), eq(votesTable.voterId, req.user!.userId)));

      if (existing.length > 0) {
        throw Object.assign(new Error("ALREADY_VOTED"), {
          status: 400,
          msg: "Vous avez déjà voté pour cette élection",
        });
      }

      await tx.insert(votesTable).values({
        electionId: id,
        candidateId: result.data.candidateId,
        voterId: req.user!.userId,
      });

      await tx
        .update(candidatesTable)
        .set({ votes: sql`${candidatesTable.votes} + 1` })
        .where(eq(candidatesTable.id, result.data.candidateId));
    });

    await serverAuditLog(req, {
      action: "VOTE",
      entity: "election",
      entityId: id,
      details: `Vote pour candidat ${result.data.candidateId}`,
    });

    res.json({ message: "Vote enregistré avec succès" });
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.msg });
      return;
    }
    if (err.code === "23505") {
      res.status(400).json({ error: "Vous avez déjà voté pour cette élection" });
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
