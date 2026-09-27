/**
 * Data-subject rights (Loi 09-08 / CNDP): the right of access.
 *
 * GET /me/data-export returns, as a downloadable JSON file, the personal data
 * the platform holds about the requesting user. It never includes secrets
 * (password hash, tokens, push token) nor ballot choices — votes are
 * anonymous by design and only participation receipts are linked to a voter.
 */
import { Router } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  appelPaymentsTable,
  appelsDeFondsTable,
  auditLogsTable,
  cotisationsTable,
  lotsTable,
  membersTable,
  messagesTable,
  notificationPreferencesTable,
  reclamationsTable,
  storageObjectsTable,
  supportTicketsTable,
  syndicatesTable,
  tenantsTable,
  transactionsTable,
  usersTable,
  voteReceiptsTable,
} from "@workspace/db/schema";
import { requireAuth } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import { getUserLotIds } from "../lib/scope.js";

const router = Router();

/**
 * The co-owner's own payment history: every payment declared on a call for
 * funds of their lots (validated, under review, rejected or reversed), with
 * the receipt number of validated ones. Server-scoped to the caller's lots in
 * their syndicate — never to ids sent by the client.
 */
router.get("/me/payments", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "member" || !user.syndicateId) {
      res.json({ data: [] });
      return;
    }
    const lotIds = await getUserLotIds(user);
    if (lotIds.length === 0) {
      res.json({ data: [] });
      return;
    }
    const rows = await db
      .select({
        id: appelPaymentsTable.id,
        appelId: appelPaymentsTable.appelId,
        amount: appelPaymentsTable.amount,
        method: appelPaymentsTable.method,
        reference: appelPaymentsTable.reference,
        status: appelPaymentsTable.status,
        rejectionReason: appelPaymentsTable.rejectionReason,
        receiptNumber: appelPaymentsTable.receiptNumber,
        declaredAt: appelPaymentsTable.createdAt,
        reviewedAt: appelPaymentsTable.reviewedAt,
        period: appelsDeFondsTable.period,
        type: appelsDeFondsTable.type,
        lotNumber: lotsTable.number,
      })
      .from(appelPaymentsTable)
      .innerJoin(appelsDeFondsTable, eq(appelsDeFondsTable.id, appelPaymentsTable.appelId))
      .innerJoin(lotsTable, eq(lotsTable.id, appelsDeFondsTable.lotId))
      .where(
        and(
          inArray(appelsDeFondsTable.lotId, lotIds),
          eq(appelPaymentsTable.syndicateId, user.syndicateId),
        ),
      )
      .orderBy(desc(appelPaymentsTable.createdAt))
      .limit(500);
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/me/data-export", requireAuth, async (req, res) => {
  try {
    const jwtUser = req.user!;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, jwtUser.userId));
    if (!user) {
      res.status(404).json({ error: "Utilisateur introuvable" });
      return;
    }
    const { passwordHash: _p, pushToken: _t, ...profile } = user;
    const syndicateId = user.syndicateId;

    // A person may be referenced by their users.id or by a members.id
    // (same email, same syndicate) depending on how records were created.
    const memberRecords = syndicateId
      ? await db
          .select()
          .from(membersTable)
          .where(and(eq(membersTable.email, user.email), eq(membersTable.syndicateId, syndicateId)))
      : [];
    const identityIds = [user.id, ...memberRecords.map((m) => m.id)];
    const lotIds = await getUserLotIds(jwtUser);

    const [
      syndicate,
      lots,
      tenancies,
      appels,
      transactions,
      cotisations,
      reclamations,
      supportTickets,
      voteReceipts,
      messagesSent,
      uploads,
      notificationPreferences,
      ownActions,
    ] = await Promise.all([
      syndicateId
        ? db.select({ id: syndicatesTable.id, name: syndicatesTable.name }).from(syndicatesTable).where(eq(syndicatesTable.id, syndicateId))
        : Promise.resolve([]),
      lotIds.length ? db.select().from(lotsTable).where(inArray(lotsTable.id, lotIds)) : Promise.resolve([]),
      syndicateId
        ? db.select().from(tenantsTable).where(and(eq(tenantsTable.email, user.email), eq(tenantsTable.syndicateId, syndicateId)))
        : Promise.resolve([]),
      db
        .select()
        .from(appelsDeFondsTable)
        .where(
          lotIds.length
            ? or(inArray(appelsDeFondsTable.ownerId, identityIds), inArray(appelsDeFondsTable.lotId, lotIds))
            : inArray(appelsDeFondsTable.ownerId, identityIds),
        )
        .orderBy(desc(appelsDeFondsTable.createdAt)),
      db.select().from(transactionsTable).where(eq(transactionsTable.memberId, user.id)).orderBy(desc(transactionsTable.createdAt)),
      db.select().from(cotisationsTable).where(inArray(cotisationsTable.memberId, identityIds)),
      db.select().from(reclamationsTable).where(inArray(reclamationsTable.memberId, identityIds)),
      db.select().from(supportTicketsTable).where(eq(supportTicketsTable.submittedById, user.id)),
      db
        .select({ electionId: voteReceiptsTable.electionId, votedAt: voteReceiptsTable.createdAt, castByProxyId: voteReceiptsTable.castByProxyId })
        .from(voteReceiptsTable)
        .where(eq(voteReceiptsTable.voterId, user.id)),
      db
        .select({ id: messagesTable.id, conversationId: messagesTable.conversationId, text: messagesTable.text, attachmentName: messagesTable.attachmentName, createdAt: messagesTable.createdAt })
        .from(messagesTable)
        .where(eq(messagesTable.senderId, user.id))
        .orderBy(desc(messagesTable.createdAt)),
      db
        .select({ objectPath: storageObjectsTable.objectPath, originalName: storageObjectsTable.originalName, contentType: storageObjectsTable.contentType, size: storageObjectsTable.size, createdAt: storageObjectsTable.createdAt })
        .from(storageObjectsTable)
        .where(eq(storageObjectsTable.ownerId, user.id)),
      db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, user.id)),
      db
        .select({ action: auditLogsTable.action, entity: auditLogsTable.entity, entityId: auditLogsTable.entityId, createdAt: auditLogsTable.createdAt })
        .from(auditLogsTable)
        .where(eq(auditLogsTable.userId, user.id))
        .orderBy(desc(auditLogsTable.createdAt)),
    ]);

    // Payments this person declared (amount, method, reference, proof path).
    const declaredPayments = await db
      .select({
        id: appelPaymentsTable.id,
        appelId: appelPaymentsTable.appelId,
        amount: appelPaymentsTable.amount,
        method: appelPaymentsTable.method,
        reference: appelPaymentsTable.reference,
        proofUrl: appelPaymentsTable.proofUrl,
        status: appelPaymentsTable.status,
        receiptNumber: appelPaymentsTable.receiptNumber,
        createdAt: appelPaymentsTable.createdAt,
      })
      .from(appelPaymentsTable)
      .where(eq(appelPaymentsTable.declaredBy, user.id))
      .orderBy(desc(appelPaymentsTable.createdAt));

    await serverAuditLog(req, {
      action: "DATA_EXPORT",
      entity: "user",
      entityId: user.id,
      details: "Export des données personnelles (droit d'accès, loi 09-08)",
    });

    const exportedAt = new Date().toISOString();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="mizan-donnees-personnelles-${exportedAt.slice(0, 10)}.json"`,
    );
    res.json({
      exportedAt,
      legalBasis: "Loi n° 09-08 — droit d'accès de la personne concernée",
      profile,
      syndicate: syndicate[0] ?? null,
      memberRecords,
      lots,
      tenancies,
      appelsDeFonds: appels,
      declaredPayments,
      transactions,
      cotisations,
      reclamations,
      supportTickets,
      // Participation receipts only — ballot content is anonymous by design.
      voteParticipation: voteReceipts,
      messagesSent,
      uploads,
      notificationPreferences,
      ownActions,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
