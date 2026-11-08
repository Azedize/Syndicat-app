import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import { initialEmailStatus, reservedEmailRefused, RESERVED_EMAIL_ERROR } from "../../lib/email/deliverability.js";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { membersTable, syndicatesTable, usersTable } from "@workspace/db/schema";
import {
  eq,
  and,
  ilike,
  or,
  sql,
  count,
  inArray,
} from "drizzle-orm";
import { requireAuth, requireRole, requireOperationalAccess, BCRYPT_COST } from "../../middleware/auth.js";
import { sendTransactionalEmail } from "../../lib/email/emailService.js";
import { emailLang, welcomeTemplate } from "../../lib/email/templates.js";
import { serverAuditLog } from "../../lib/audit.js";
import { getPagination, buildPagedResponse } from "../../lib/paginate.js";
import { createAlert } from "../../lib/notify.js";
import { localToday } from "../../lib/charge-time.js";

const router = Router();

function isSameSyndicate(req: any, syndicateId: string): boolean {
  return (
    req.user.role === "super_admin" || req.user.syndicateId === syndicateId
  );
}

function assertSupervisedMemberTarget(
  req: any,
  syndicateId: string | null | undefined,
): void {
  if (req.user?.role !== "super_admin") return;
  const targetSyndicateId =
    typeof req.query.syndicateId === "string" ? req.query.syndicateId : "";
  if (req.query.supervision !== "true" || !targetSyndicateId) {
    throw Object.assign(
      new Error("La supervision et un syndicat cible sont requis."),
      { status: 403, code: "SUPERVISION_REQUIRED" },
    );
  }
  if (!syndicateId || syndicateId !== targetSyndicateId) {
    throw Object.assign(new Error("Accès refusé"), { status: 403 });
  }
}

// FIX [R12]: President, treasurer, and secretary need the member directory for
// operational work: president for quorum, treasurer for charge notices, secretary
// for convocation letters. All are scoped to their syndicateId — no PII leak.
// Members and tenants are still correctly blocked (they cannot browse other residents).
router.get(
  "/members",
  requireAuth,
  requireRole(
    "super_admin",
    "syndicate_admin",
    "president",
    "treasurer",
    "secretary",
    "committee_member",
  ),
  async (req, res) => {
    const { search, status, syndicateId } = req.query as Record<string, string>;
    const pagination = getPagination(req);
    try {
      const conditions: any[] = [];
      if (req.user!.role === "super_admin") {
        if (syndicateId) {
          // super_admin filtering by specific syndicate
          conditions.push(eq(membersTable.syndicateId, syndicateId));
        }
        // super_admin with no syndicateId filter sees all members (platform view)
      } else {
        // Non-super_admin MUST have syndicateId in JWT — never return unscoped results
        if (!req.user!.syndicateId) {
          return void res
            .status(403)
            .json({ error: "Syndicat non défini dans le token" });
        }
        conditions.push(eq(membersTable.syndicateId, req.user!.syndicateId));
      }
      if (status) conditions.push(eq(membersTable.status, status as any));
      if (search) {
        conditions.push(
          or(
            ilike(membersTable.name, `%${search}%`),
            ilike(membersTable.email, `%${search}%`),
            ilike(membersTable.profession, `%${search}%`),
          ),
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, [{ value: total }]] = await Promise.all([
        db
          .select()
          .from(membersTable)
          .where(where)
          .limit(pagination.limit)
          .offset(pagination.offset),
        db.select({ value: count() }).from(membersTable).where(where),
      ]);

      // Enrich with userId from usersTable (matched by email) for chat/conversations
      const emails = rows.map((r) => r.email).filter(Boolean);
      const usersByEmail =
        emails.length > 0
          ? await db
              .select({
                id: usersTable.id,
                email: usersTable.email,
                role: usersTable.role,
                syndicateId: usersTable.syndicateId,
              })
              .from(usersTable)
              .where(inArray(usersTable.email, emails))
          : [];
      const userEmailMap = Object.fromEntries(
        usersByEmail.map((u) => [`${u.email}:${u.syndicateId ?? ""}`, u]),
      );

      const enriched = rows.map((r) => ({
        ...r,
        userId: userEmailMap[`${r.email}:${r.syndicateId ?? ""}`]?.id ?? null,
        role: userEmailMap[`${r.email}:${r.syndicateId ?? ""}`]?.role ?? null,
      }));

      res.json(buildPagedResponse(enriched, Number(total), pagination));
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

router.post(
  "/members",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().default(""),
      profession: z.string().default(""),
      syndicateId: z.string().optional(),
      joinDate: z.string().default(localToday()),
      // Also create the co-owner's login (member role, temporary password
      // that must be changed at first login) and email the invitation.
      inviteToApp: z.boolean().default(false),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res
        .status(400)
        .json({ error: "Données invalides", details: result.error.issues });
      return;
    }
    try {
      const syndicateId =
        req.user!.role === "super_admin"
          ? typeof req.query.syndicateId === "string"
            ? req.query.syndicateId
            : undefined
          : req.user!.syndicateId;

      if (!syndicateId) {
        return void res
          .status(req.user!.role === "super_admin" ? 400 : 403)
          .json({
            error:
              req.user!.role === "super_admin"
                ? "Un syndicat cible est requis"
                : "Syndicat non défini dans le token",
          });
      }
      try {
        assertSupervisedMemberTarget(req, syndicateId);
      } catch (error: any) {
        return void res.status(error.status ?? 403).json({
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
      }

      const [syndicate] = await db
        .select({ id: syndicatesTable.id })
        .from(syndicatesTable)
        .where(eq(syndicatesTable.id, syndicateId))
        .limit(1);
      if (!syndicate) {
        return void res.status(404).json({ error: "Syndicat introuvable" });
      }

      const { inviteToApp, ...memberData } = result.data;
      const email = memberData.email.trim().toLowerCase();
      // Notices, calls for funds and receipts go to this address.
      if (reservedEmailRefused(email)) return void res.status(400).json(RESERVED_EMAIL_ERROR);

      // One member record per person and syndicate: the same person may own
      // lots in several syndicates, but not be registered twice in one.
      const [existingMember] = await db
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(and(sql`lower(${membersTable.email}) = ${email}`, eq(membersTable.syndicateId, syndicateId)))
        .limit(1);
      if (existingMember) {
        return void res
          .status(409)
          .json({ error: "Un copropriétaire avec cet email existe déjà dans ce syndicat", code: "MEMBER_EMAIL_EXISTS" });
      }
      // A login account belongs to one syndicate. If this person already has
      // one (here or elsewhere), the member is registered without a second
      // account and the syndic is told why no invitation was sent.
      let accountNotice: string | null = null;
      if (inviteToApp) {
        const [existingUser] = await db
          .select({ id: usersTable.id, syndicateId: usersTable.syndicateId })
          .from(usersTable)
          .where(sql`lower(${usersTable.email}) = ${email}`)
          .limit(1);
        if (existingUser) {
          accountNotice =
            existingUser.syndicateId === syndicateId
              ? "Cette personne a déjà un compte MIZAN dans ce syndicat : aucune nouvelle invitation."
              : "Cette personne a déjà un compte MIZAN rattaché à un autre syndicat : enregistrée comme copropriétaire, sans accès à l'application ici.";
        }
      }

      let member: typeof membersTable.$inferSelect;
      let temporaryPassword: string | null = null;
      await db.transaction(async (tx) => {
        const [m] = await tx
          .insert(membersTable)
          .values({
            ...memberData,
            email,
            syndicateId,
            status: "active",
            cotisationStatus: "pending",
          })
          .returning();
        member = m;

        if (inviteToApp && !accountNotice) {
          temporaryPassword = randomBytes(12).toString("base64url");
          await tx.insert(usersTable).values({
            name: memberData.name,
            email,
            phone: memberData.phone || null,
            passwordHash: await bcrypt.hash(temporaryPassword, BCRYPT_COST),
            mustChangePassword: true,
            role: "member",
            status: "active",
            syndicateId,
            emailStatus: initialEmailStatus(email),
          });
        }

        if (syndicateId) {
          await tx
            .update(syndicatesTable)
            .set({ membersCount: sql`${syndicatesTable.membersCount} + 1` })
            .where(eq(syndicatesTable.id, syndicateId));
        }
      });

      await serverAuditLog(req, {
        action: "CREATE",
        entity: "member",
        entityId: member!.id,
        details: `Membre ajouté: ${member!.name}`,
      });

      createAlert({
        key: "member.joined",
        params: { name: member!.name },
        type: "success",
        syndicateId: syndicateId || null,
        target: "admin",
      }).catch(() => {});

      // The answer says whether the invitation really left: never a success it cannot prove.
      let invitationEmail: "sent" | "not_sent" | undefined;
      if (temporaryPassword) {
        const loginUrl = process.env.APP_URL ? `${process.env.APP_URL}/login` : undefined;
        const lang = emailLang(req.headers["accept-language"]);
        const { subject, html } = welcomeTemplate(member!.name, "member", loginUrl, temporaryPassword, lang);
        const sent = await sendTransactionalEmail({ to: email, subject, html, lang, template: "welcome", syndicateId, req });
        invitationEmail = sent.ok ? "sent" : "not_sent";
      }

      res
        .status(201)
        .json({
          data: member!,
          invited: !!temporaryPassword,
          ...(invitationEmail ? { invitationEmail } : {}),
          ...(accountNotice ? { accountNotice } : {}),
          message: temporaryPassword
            ? invitationEmail === "sent"
              ? "Membre ajouté — invitation envoyée par email"
              : "Membre ajouté — l'e-mail d'invitation n'a pas pu être envoyé. La personne peut choisir son mot de passe avec « Mot de passe oublié »."
            : accountNotice ?? "Membre ajouté avec succès",
        });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

// Governance roles need individual member profiles (e.g. secretary invites members to AG,
// president reviews member status). The row-level isSameSyndicate check enforces isolation.
router.get(
  "/members/:id",
  requireAuth,
  requireRole(
    "super_admin",
    "syndicate_admin",
    "president",
    "treasurer",
    "secretary",
    "committee_member",
  ),
  async (req, res) => {
    const id = String(req.params.id) as string;
    try {
      const [member] = await db
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, id));
      if (!member) {
        res.status(404).json({ error: "Membre introuvable" });
        return;
      }
      try {
        assertSupervisedMemberTarget(req, member.syndicateId);
      } catch (error: any) {
        return void res.status(error.status ?? 403).json({
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
      }
      if (!isSameSyndicate(req, member.syndicateId ?? "")) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      res.json({ data: member });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

router.put(
  "/members/:id",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      profession: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const [member] = await db
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, id));
      if (!member) {
        res.status(404).json({ error: "Membre introuvable" });
        return;
      }
      try {
        assertSupervisedMemberTarget(req, member.syndicateId);
      } catch (error: any) {
        return void res.status(error.status ?? 403).json({
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
      }
      if (!isSameSyndicate(req, member.syndicateId ?? "")) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const ownershipCondition =
        req.user!.role === "super_admin"
          ? eq(membersTable.id, id)
          : and(
              eq(membersTable.id, id),
              eq(membersTable.syndicateId, req.user!.syndicateId!),
            );
      const [updated] = await db
        .update(membersTable)
        .set(result.data)
        .where(ownershipCondition)
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Membre introuvable" });
        return;
      }
      res.json({ data: updated, message: "Membre mis à jour" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

router.put(
  "/members/:id/status",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      status: z.enum(["active", "inactive", "pending"]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }
    try {
      const [member] = await db
        .select()
        .from(membersTable)
        .where(eq(membersTable.id, id));
      if (!member) {
        res.status(404).json({ error: "Membre introuvable" });
        return;
      }
      try {
        assertSupervisedMemberTarget(req, member.syndicateId);
      } catch (error: any) {
        return void res.status(error.status ?? 403).json({
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
      }
      if (!isSameSyndicate(req, member.syndicateId ?? "")) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      let updated: typeof membersTable.$inferSelect;
      await db.transaction(async (tx) => {
        const [u] = await tx
          .update(membersTable)
          .set({ status: result.data.status })
          .where(
            req.user!.role === "super_admin"
              ? eq(membersTable.id, id)
              : and(
                  eq(membersTable.id, id),
                  eq(membersTable.syndicateId, req.user!.syndicateId!),
                ),
          )
          .returning();
        updated = u;

        const wasActive = member.status === "active";
        const goingInactive = result.data.status === "inactive";
        const wasInactive = member.status === "inactive";
        const goingActive = result.data.status === "active";

        if (member.syndicateId) {
          if (wasActive && goingInactive) {
            await tx
              .update(syndicatesTable)
              .set({
                membersCount: sql`GREATEST(${syndicatesTable.membersCount} - 1, 0)`,
              })
              .where(eq(syndicatesTable.id, member.syndicateId));
          } else if (wasInactive && goingActive) {
            await tx
              .update(syndicatesTable)
              .set({ membersCount: sql`${syndicatesTable.membersCount} + 1` })
              .where(eq(syndicatesTable.id, member.syndicateId));
          }
        }
      });

      await serverAuditLog(req, {
        action: "UPDATE_STATUS",
        entity: "member",
        entityId: id,
        details: `Statut ${member.status} → ${result.data.status}`,
      });

      res.json({ data: updated!, message: "Statut mis à jour" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

export default router;
