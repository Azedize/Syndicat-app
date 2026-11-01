import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { db } from "@workspace/db";
import {
  appelPaymentsTable,
  conseilSyndicalTable,
  otpTokensTable,
  syndicateMembershipsTable,
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
  termsAcceptancesTable,
  transactionsTable,
  usersTable,
  voteReceiptsTable,
} from "@workspace/db/schema";
import { requireAuth } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { getUserLotIds } from "../../lib/scope.js";
import { z } from "zod";
import { isReservedEmail, RESERVED_EMAIL_ERROR } from "../../lib/email/deliverability.js";
import { sendTransactionalEmail } from "../../lib/email/emailService.js";
import { emailChangedNoticeTemplate, emailLang, verificationCodeTemplate } from "../../lib/email/templates.js";
/**
 * Data-subject rights (Loi 09-08 / CNDP): the right of access.
 *
 * GET /me/data-export returns, as a downloadable JSON file, the personal data
 * the platform holds about the requesting user. It never includes secrets
 * (password hash, tokens, push token) nor ballot choices — votes are
 * anonymous by design and only participation receipts are linked to a voter.
 */

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
    sendRouteError(req, res, err);
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
      claims,
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
      // Claims reported by the person, with their public history (internal team notes excluded).
      db.execute(sql`
        SELECT c.reference, c.title, c.description, c.category, c.location, c.status, c.created_at, c.resolved_at, c.resolution,
               COALESCE(json_agg(json_build_object('type', e.type, 'body', e.body, 'at', e.created_at) ORDER BY e.created_at)
                        FILTER (WHERE e.id IS NOT NULL), '[]') AS history
        FROM claims c LEFT JOIN claim_events e ON e.claim_id = c.id AND NOT e.internal
        WHERE c.reporter_user_id = ${user.id}
        GROUP BY c.id ORDER BY c.created_at DESC
      `),
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
      claims,
      supportTickets,
      // Participation receipts only — ballot content is anonymous by design.
      voteParticipation: voteReceipts,
      messagesSent,
      uploads,
      notificationPreferences,
      ownActions,
    });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

// ─── Acceptance of legal texts (CGU, privacy policy) ───────────────────────────
// Proof of consent: which version of which text the user accepted, when and
// from where. Re-accepting the same version is a no-op (unique index).
const LEGAL_DOCUMENTS = ["cgu", "privacy"] as const;

router.get("/me/terms-acceptances", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({ document: termsAcceptancesTable.document, version: termsAcceptancesTable.version, acceptedAt: termsAcceptancesTable.acceptedAt })
      .from(termsAcceptancesTable)
      .where(eq(termsAcceptancesTable.userId, req.user!.userId))
      .orderBy(desc(termsAcceptancesTable.acceptedAt));
    res.json({ data: rows });
  } catch (err) {
    req.log.error({ err }, "terms acceptances read failed");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/me/terms-acceptances", requireAuth, async (req, res) => {
  const parsed = z
    .object({ document: z.enum(LEGAL_DOCUMENTS), version: z.string().trim().min(1).max(40) })
    .safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Document ou version invalide" });
  try {
    const { document, version } = parsed.data;
    const [created] = await db
      .insert(termsAcceptancesTable)
      .values({
        userId: req.user!.userId,
        document,
        version,
        ip: req.ip ?? null,
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300) || null,
      })
      .onConflictDoNothing()
      .returning({ acceptedAt: termsAcceptancesTable.acceptedAt });
    const [row] = created
      ? [created]
      : await db
          .select({ acceptedAt: termsAcceptancesTable.acceptedAt })
          .from(termsAcceptancesTable)
          .where(and(eq(termsAcceptancesTable.userId, req.user!.userId), eq(termsAcceptancesTable.document, document), eq(termsAcceptancesTable.version, version)));
    res.status(created ? 201 : 200).json({ data: { document, version, acceptedAt: row?.acceptedAt ?? null, duplicate: !created } });
  } catch (err) {
    req.log.error({ err }, "terms acceptance write failed");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Change / confirm my e-mail address ─────────────────────────────────────
// For accounts whose address cannot receive mail (generated, mistyped, reserved
// domain) and anyone who wants to change it. Nothing is deleted and the account
// is never blocked: the new address is adopted only once a code sent to it is
// typed back. Member and tenant records are linked to the account by e-mail, so
// they move with it in the same transaction.
const EMAIL_CHANGE_PER_HOUR = 3;
const emailChangePurpose = (userId: string) => `email_change:${userId}`;

router.post("/me/email-change/request", requireAuth, async (req, res) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Adresse e-mail invalide", code: "EMAIL_INVALID" });
  const email = parsed.data.email;
  const user = req.user!;
  try {
    if (isReservedEmail(email)) return void res.status(400).json(RESERVED_EMAIL_ERROR);
    const [current] = await db.select({ email: usersTable.email, language: usersTable.language }).from(usersTable).where(eq(usersTable.id, user.userId));
    if (current && current.email.toLowerCase() === email) {
      return void res.status(400).json({ error: "C'est déjà votre adresse actuelle.", code: "EMAIL_UNCHANGED" });
    }
    const [taken] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`).limit(1);
    if (taken) return void res.status(409).json({ error: "Cette adresse est déjà utilisée par un autre compte.", code: "EMAIL_TAKEN" });

    const since = new Date(Date.now() - 3600_000);
    const [{ value: recent }] = await db
      .select({ value: count() })
      .from(otpTokensTable)
      .where(and(eq(otpTokensTable.purpose, emailChangePurpose(user.userId)), gt(otpTokensTable.createdAt, since)));
    if (Number(recent) >= EMAIL_CHANGE_PER_HOUR) {
      return void res.status(429).json({ error: "Trop de demandes. Réessayez dans une heure.", code: "EMAIL_CHANGE_RATE" });
    }

    const code = String(randomInt(100000, 1000000));
    await db.insert(otpTokensTable).values({
      email,
      codeHash: await bcrypt.hash(code, 8),
      purpose: emailChangePurpose(user.userId),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    } as any);
    const lang = emailLang(current?.language ?? req.headers["accept-language"]);
    const tpl = verificationCodeTemplate("email_change", code, 10, lang);
    const sent = await sendTransactionalEmail({
      to: email,
      subject: tpl.subject,
      template: "email_change",
      req,
      html: tpl.html,
      text: tpl.text,
      lang,
    });
    if (!sent.ok) {
      return void res.status(502).json({ error: "Le code n'a pas pu être envoyé. Réessayez plus tard.", code: "EMAIL_SEND_FAILED" });
    }
    res.json({ data: { email, expiresIn: 600 } });
  } catch (err) {
    req.log.error({ err }, "email change request failed");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/me/email-change/confirm", requireAuth, async (req, res) => {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email().max(254), code: z.string().trim().regex(/^\d{6}$/) })
    .safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Adresse ou code invalide", code: "EMAIL_CODE_INVALID" });
  const { email, code } = parsed.data;
  const user = req.user!;
  try {
    const [token] = await db
      .select()
      .from(otpTokensTable)
      .where(
        and(
          eq(otpTokensTable.email, email),
          eq(otpTokensTable.purpose, emailChangePurpose(user.userId)),
          isNull(otpTokensTable.usedAt),
          gt(otpTokensTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpTokensTable.createdAt))
      .limit(1);
    if (!token) return void res.status(400).json({ error: "Code expiré ou introuvable. Demandez un nouveau code.", code: "EMAIL_CODE_EXPIRED" });
    const attempts = (token.attempts ?? 0) + 1;
    await db.update(otpTokensTable).set({ attempts } as any).where(eq(otpTokensTable.id, token.id));
    if (attempts > 5) return void res.status(429).json({ error: "Trop de tentatives. Demandez un nouveau code.", code: "EMAIL_CODE_LOCKED" });
    if (!(await bcrypt.compare(code, token.codeHash))) {
      return void res.status(400).json({ error: `Code incorrect (${5 - attempts} tentative(s) restante(s)).`, code: "EMAIL_CODE_WRONG" });
    }

    const result = await db.transaction(async (tx) => {
      const [me] = await tx.select({ email: usersTable.email, syndicateId: usersTable.syndicateId, name: usersTable.name, language: usersTable.language }).from(usersTable).where(eq(usersTable.id, user.userId));
      if (!me) throw Object.assign(new Error("Compte introuvable"), { status: 404 });
      const [taken] = await tx.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.email}) = ${email}`).limit(1);
      if (taken) throw Object.assign(new Error("Cette adresse est déjà utilisée par un autre compte."), { status: 409, code: "EMAIL_TAKEN" });
      const old = me.email.toLowerCase();

      // Condominiums the account belongs to: its home one and its memberships.
      const memberships = await tx
        .select({ syndicateId: syndicateMembershipsTable.syndicateId })
        .from(syndicateMembershipsTable)
        .where(and(eq(syndicateMembershipsTable.userId, user.userId), eq(syndicateMembershipsTable.status, "active")));
      const syndicateIds = [...new Set([me.syndicateId, ...memberships.map((m) => m.syndicateId)].filter((x): x is string => !!x))];

      if (syndicateIds.length) {
        const [clash] = await tx
          .select({ id: membersTable.id })
          .from(membersTable)
          .where(and(inArray(membersTable.syndicateId, syndicateIds), sql`lower(${membersTable.email}) = ${email}`))
          .limit(1);
        if (clash) throw Object.assign(new Error("Cette adresse est déjà celle d'un autre copropriétaire de votre copropriété."), { status: 409, code: "EMAIL_TAKEN_MEMBER" });
      }

      await tx.update(usersTable).set({ email, emailStatus: "verified", updatedAt: new Date() }).where(eq(usersTable.id, user.userId));
      let members = 0, tenants = 0, council = 0;
      if (syndicateIds.length) {
        members = (await tx.update(membersTable).set({ email }).where(and(inArray(membersTable.syndicateId, syndicateIds), sql`lower(${membersTable.email}) = ${old}`)).returning({ id: membersTable.id })).length;
        tenants = (await tx.update(tenantsTable).set({ email }).where(and(inArray(tenantsTable.syndicateId, syndicateIds), sql`lower(${tenantsTable.email}) = ${old}`)).returning({ id: tenantsTable.id })).length;
        council = (await tx.update(conseilSyndicalTable).set({ email }).where(and(inArray(conseilSyndicalTable.syndicateId, syndicateIds), sql`lower(${conseilSyndicalTable.email}) = ${old}`)).returning({ id: conseilSyndicalTable.id })).length;
      }
      await tx.update(otpTokensTable).set({ usedAt: new Date() } as any).where(eq(otpTokensTable.id, token.id));
      return { old, members, tenants, council, name: me.name, language: me.language, syndicateId: me.syndicateId };
    });

    await serverAuditLog(req, {
      action: "EMAIL_CHANGED",
      entity: "user",
      entityId: user.userId,
      details: `Adresse confirmée par code ; fiches mises à jour : ${result.members} copropriétaire(s), ${result.tenants} locataire(s), ${result.council} conseil.`,
    });
    // After the commit: tell the former address, so a hijacked account does not go unnoticed.
    if (!isReservedEmail(result.old)) {
      const lang = emailLang(result.language);
      const notice = emailChangedNoticeTemplate(result.name, email, new Date(), lang);
      void sendTransactionalEmail({ to: result.old, subject: notice.subject, html: notice.html, text: notice.text, lang, template: "email_changed_notice", syndicateId: result.syndicateId, req });
    }
    // The access token still carries the old address: the client renews its
    // session (refresh re-reads the account) before going on.
    res.json({ data: { email, emailStatus: "verified", linked: { members: result.members, tenants: result.tenants, council: result.council } }, refreshRequired: true });
  } catch (err: any) {
    if (err?.status) return void res.status(err.status).json({ error: err.message, code: err.code });
    req.log.error({ err }, "email change confirm failed");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
