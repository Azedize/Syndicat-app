// elections: voting endpoints (mounted by elections.routes.ts, in order).
import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import { z } from "zod";
import { sql, inArray, eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  electionsTable,
  candidatesTable,
  votesTable,
  voteReceiptsTable,
  electionProxiesTable,
  usersTable,
} from "@workspace/db/schema";
import { requireAuth } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { sendPushToUsers } from "../../lib/notify.js";
import { getEligibleVoterIds, isUserEligible, MAX_PROXIES_PER_GRANTEE } from "./elections.service.js";
import { assertAccess } from "./elections.access.js";

const router = Router();

// ─── Phase 4 — Voting ─────────────────────────────────────────────────────────

router.post("/elections/:id/vote", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({
    // One candidate (single-choice ballot), kept for older clients…
    candidateId: z.string().min(1).optional(),
    // …or the selections of a ballot (up to the number of seats when several are elected).
    candidateIds: z.array(z.string().min(1)).max(50).optional(),
    abstain: z.boolean().default(false),
    // Present when the caller is casting a delegated (proxy) vote on behalf of a grantor,
    // instead of voting for themselves.
    onBehalfOfUserId: z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  const selection = result.success ? (result.data.candidateIds ?? (result.data.candidateId ? [result.data.candidateId] : [])) : [];
  if (!result.success || (!selection.length && !result.data.abstain)) {
    res.status(400).json({ error: "Candidat ou abstention requis" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      // Locked: the closing of the vote cannot interleave with a ballot.
      const [election] = await tx
        .select()
        .from(electionsTable)
        .where(eq(electionsTable.id, id))
        .for("update");
      if (!election)
        throw Object.assign(new Error("NOT_FOUND"), {
          status: 404,
          msg: "Élection introuvable",
        });
      if (election.status !== "open")
        throw Object.assign(new Error("NOT_OPEN"), {
          status: 400,
          msg: "Cette élection n'est pas ouverte au vote",
        });
      if (
        req.user!.role !== "super_admin" &&
        (!req.user!.syndicateId ||
          election.syndicateId !== req.user!.syndicateId)
      ) {
        throw Object.assign(new Error("FORBIDDEN"), {
          status: 403,
          msg: "Accès refusé",
        });
      }

      // The voter of record — either the caller, or (for a proxy vote) the person who delegated to them.
      let voterId = req.user!.userId;
      let castByProxyId: string | null = null;

      if (result.data.onBehalfOfUserId) {
        const [proxy] = await tx
          .select()
          .from(electionProxiesTable)
          .where(
            and(
              eq(electionProxiesTable.electionId, id),
              eq(electionProxiesTable.grantorId, result.data.onBehalfOfUserId),
              eq(electionProxiesTable.granteeId, req.user!.userId),
              eq(electionProxiesTable.status, "active"),
            ),
          );
        if (!proxy)
          throw Object.assign(new Error("NO_PROXY"), {
            status: 403,
            msg: "Vous ne détenez pas de pouvoir actif pour ce copropriétaire",
          });
        voterId = result.data.onBehalfOfUserId;
        castByProxyId = req.user!.userId;
      }

      const eligible = await isUserEligible(
        voterId,
        election.syndicateId,
        election.buildingId,
        !!election.tenantsCanVote,
      );
      if (!eligible)
        throw Object.assign(new Error("NOT_ELIGIBLE"), {
          status: 403,
          msg: "Vous n'êtes pas éligible pour voter à cette élection",
        });

      const invalid = validateSelection(
        { ballotMode: (election.ballotMode ?? "single") as "single", seatsCount: election.seatsCount ?? 1 },
        result.data.abstain ? [] : selection,
        result.data.abstain,
      );
      if (invalid)
        throw Object.assign(new Error(invalid.code), { status: 400, msg: invalid.message, code: invalid.code });
      const candidateIds: string[] = [];
      if (!result.data.abstain) {
        const found = await tx
          .select({ id: candidatesTable.id })
          .from(candidatesTable)
          .where(
            and(
              inArray(candidatesTable.id, selection),
              eq(candidatesTable.electionId, id),
              eq(candidatesTable.status, "approved"),
            ),
          );
        if (found.length !== selection.length)
          throw Object.assign(new Error("BAD_CANDIDATE"), {
            status: 400,
            msg: "Ce candidat n'appartient pas à cette élection",
          });
        candidateIds.push(...selection);
      }
      // Voices of the voter of record (his own, or the grantor's for a proxy vote).
      let weight = "1.0000";
      if (election.weighting === "quote_part") {
        weight = (await voicesOf(election.syndicateId!, election.buildingId, [voterId])).get(voterId) ?? "0.0000";
        if (toUnits(weight) <= 0)
          throw Object.assign(new Error("NO_VOICES"), {
            status: 403,
            msg: "Aucune quote-part n'est enregistrée pour ce copropriétaire : il ne dispose d'aucune voix pour ce scrutin",
            code: "NO_VOICES",
          });
      }

      const existing = await tx
        .select()
        .from(voteReceiptsTable)
        .where(
          and(
            eq(voteReceiptsTable.electionId, id),
            eq(voteReceiptsTable.voterId, voterId),
          ),
        );
      if (existing.length > 0)
        throw Object.assign(new Error("ALREADY_VOTED"), {
          status: 400,
          msg: castByProxyId
            ? "Ce copropriétaire a déjà voté"
            : "Vous avez déjà voté pour cette élection",
        });

      // Receipt proves participation (ties to voterId) — the ballot itself never does.
      await tx
        .insert(voteReceiptsTable)
        .values({ electionId: id, voterId, castByProxyId } as any);
      await tx.insert(votesTable).values({
        electionId: id,
        candidateId,
        isAbstention: result.data.abstain,
        device: req.headers["user-agent"]?.toString().slice(0, 200) ?? null,
        ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
      } as any);

      if (candidateId) {
        await tx
          .update(candidatesTable)
          .set({ votes: sql`${candidatesTable.votes} + 1` })
          .where(eq(candidatesTable.id, candidateId));
      }
      await tx
        .update(electionsTable)
        .set({ participantCount: sql`${electionsTable.participantCount} + 1` })
        .where(eq(electionsTable.id, id));

      if (castByProxyId) {
        await tx
          .update(electionProxiesTable)
          .set({ status: "used" } as any)
          .where(
            and(
              eq(electionProxiesTable.electionId, id),
              eq(electionProxiesTable.grantorId, voterId),
              eq(electionProxiesTable.granteeId, castByProxyId),
            ),
          );
      }
    });

    if (result.data.onBehalfOfUserId) {
      await sendPushToUsers(
        [result.data.onBehalfOfUserId],
        "Vote par pouvoir",
        "Votre mandataire a voté en votre nom pour cette élection.",
        { electionId: id },
      );
    }
    await serverAuditLog(req, {
      action: "VOTE",
      entity: "election",
      entityId: id,
      details: result.data.onBehalfOfUserId
        ? `Vote par pouvoir pour ${result.data.onBehalfOfUserId}`
        : "Vote enregistré (bulletin anonyme)",
    });
    res.json({ message: "Vote enregistré avec succès" });
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.msg });
      return;
    }
    if (err.code === "23505") {
      res
        .status(400)
        .json({ error: "Vous avez déjà voté pour cette élection" });
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Proxy voting (pouvoirs) ──────────────────────────────────────────────────

router.get("/elections/:id/eligible-voters", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [election] = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, id));
    if (!election || !assertAccess(req, election)) {
      res.status(404).json({ error: "Élection introuvable" });
      return;
    }
    const ids = await getEligibleVoterIds(
      election.syndicateId,
      election.buildingId,
      !!election.tenantsCanVote,
    );
    if (ids.length === 0) {
      res.json({ data: [] });
      return;
    }
    const rows = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, ids));
    res.json({ data: rows.filter((u) => u.id !== req.user!.userId) });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.post("/elections/:id/delegate", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({
    granteeId: z.string().min(1),
    documentUrl: z.string().nullable().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Mandataire requis" });
    return;
  }
  try {
    const [election] = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, id));
    if (!election) {
      res.status(404).json({ error: "Élection introuvable" });
      return;
    }
    if (!assertAccess(req, election)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    if (
      !["candidacy_open", "campaign", "open"].includes(election.status ?? "")
    ) {
      res
        .status(400)
        .json({
          error:
            "Les pouvoirs ne peuvent être donnés qu'avant la clôture du vote",
        });
      return;
    }
    if (result.data.granteeId === req.user!.userId) {
      res
        .status(400)
        .json({
          error: "Vous ne pouvez pas vous donner un pouvoir à vous-même",
        });
      return;
    }

    const eligible = await getEligibleVoterIds(
      election.syndicateId,
      election.buildingId,
      !!election.tenantsCanVote,
    );
    if (
      !eligible.includes(req.user!.userId) ||
      !eligible.includes(result.data.granteeId)
    ) {
      res
        .status(403)
        .json({
          error:
            "Le mandant et le mandataire doivent tous deux être éligibles pour cette élection",
        });
      return;
    }

    const [[alreadyVoted], activeProxyCount, [grantee]] = await Promise.all([
      db
        .select()
        .from(voteReceiptsTable)
        .where(
          and(
            eq(voteReceiptsTable.electionId, id),
            eq(voteReceiptsTable.voterId, req.user!.userId),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(electionProxiesTable)
        .where(
          and(
            eq(electionProxiesTable.electionId, id),
            eq(electionProxiesTable.granteeId, result.data.granteeId),
            eq(electionProxiesTable.status, "active"),
          ),
        ),
      db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, result.data.granteeId)),
    ]);
    if (alreadyVoted) {
      res
        .status(400)
        .json({
          error: "Vous avez déjà voté — un pouvoir ne peut plus être donné",
        });
      return;
    }
    if ((activeProxyCount[0]?.count ?? 0) >= MAX_PROXIES_PER_GRANTEE) {
      res
        .status(400)
        .json({
          error: `Ce mandataire détient déjà le nombre maximal de pouvoirs (${MAX_PROXIES_PER_GRANTEE})`,
        });
      return;
    }
    if (!grantee) {
      res.status(404).json({ error: "Mandataire introuvable" });
      return;
    }

    const [proxy] = await db
      .insert(electionProxiesTable)
      .values({
        electionId: id,
        syndicateId: election.syndicateId,
        grantorId: req.user!.userId,
        grantorName: req.user!.name,
        granteeId: result.data.granteeId,
        granteeName: grantee.name,
        documentUrl: result.data.documentUrl ?? null,
        status: "active",
      } as any)
      .returning();

    await sendPushToUsers(
      [result.data.granteeId],
      "Pouvoir reçu",
      `${req.user!.name} vous a donné pouvoir pour voter à sa place à "${election.title}".`,
      { electionId: id },
    );
    await serverAuditLog(req, {
      action: "DELEGATE_VOTE",
      entity: "election",
      entityId: id,
      details: `${req.user!.name} → ${grantee.name}`,
    });
    res.status(201).json({ data: proxy, message: "Pouvoir donné avec succès" });
  } catch (err: any) {
    if (err.code === "23505") {
      res
        .status(409)
        .json({ error: "Vous avez déjà donné un pouvoir pour cette élection" });
      return;
    }
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/elections/:id/delegate", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [election] = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, id));
    if (!election) {
      res.status(404).json({ error: "Élection introuvable" });
      return;
    }
    if (!assertAccess(req, election)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const [proxy] = await db
      .select()
      .from(electionProxiesTable)
      .where(
        and(
          eq(electionProxiesTable.electionId, id),
          eq(electionProxiesTable.grantorId, req.user!.userId),
          eq(electionProxiesTable.status, "active"),
        ),
      );
    if (!proxy) {
      res.status(404).json({ error: "Aucun pouvoir actif à révoquer" });
      return;
    }

    const [updated] = await db
      .update(electionProxiesTable)
      .set({ status: "revoked" } as any)
      .where(eq(electionProxiesTable.id, proxy.id))
      .returning();
    await sendPushToUsers(
      [proxy.granteeId],
      "Pouvoir révoqué",
      `${req.user!.name} a révoqué le pouvoir qu'il/elle vous avait donné pour une élection.`,
      { electionId: id },
    );
    await serverAuditLog(req, {
      action: "REVOKE_DELEGATION",
      entity: "election",
      entityId: id,
      details: `${req.user!.name} a révoqué le pouvoir donné à ${proxy.granteeName}`,
    });
    res.json({ data: updated, message: "Pouvoir révoqué" });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

export default router;
