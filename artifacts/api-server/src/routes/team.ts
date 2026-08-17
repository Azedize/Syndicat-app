/**
 * P11 — Syndic Team Directory
 * - Lists admins + committee members with their roles, contacts, office hours
 * - Syndicate admins can update team member profiles
 * - All authenticated users in the syndicate can view
 */
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import {
  usersTable,
  membersTable,
  syndicatesTable,
  refreshTokensTable,
} from "@workspace/db/schema";
import { eq, and, or } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  signToken,
  signRefreshToken,
} from "../middleware/auth.js";
import { sendTransactionalEmail } from "../lib/email/emailService.js";
import { teamInvitationTemplate } from "../lib/email/templates.js";

const router = Router();

// GET /team — directory of syndicate admin team + committee
router.get("/team", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }

    // Admins in this syndicate
    const admins = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        role: usersTable.role,
        avatar: usersTable.avatar,
        syndicateId: usersTable.syndicateId,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.syndicateId, user.syndicateId),
          or(
            eq(usersTable.role, "syndicate_admin"),
            eq(usersTable.role, "super_admin"),
          ),
        ),
      );

    // Committee members (members with status "committee", "president" etc.)
    const committee = await db
      .select({
        id: membersTable.id,
        name: membersTable.name,
        email: membersTable.email,
        phone: membersTable.phone,
        role: membersTable.status,
        syndicateId: membersTable.syndicateId,
      })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.syndicateId, user.syndicateId),
          or(
            eq(membersTable.status, "committee"),
            eq(membersTable.status, "president"),
            eq(membersTable.status, "treasurer"),
            eq(membersTable.status, "secretary"),
          ),
        ),
      );

    // Syndicate info
    const [syndicate] = await db
      .select()
      .from(syndicatesTable)
      .where(eq(syndicatesTable.id, user.syndicateId));

    res.json({
      data: {
        syndicate: syndicate ?? null,
        admins: admins.map((a) => ({ ...a, type: "admin" })),
        committee: committee.map((c) => ({ ...c, type: "committee" })),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /team/syndicate — admin updates syndicate contact info
router.put("/team/syndicate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.syndicateId)
      return void res.status(400).json({ error: "Pas de syndicat associé" });

    const allowed = [
      "email",
      "phone",
      "address",
      "officeHours",
      "website",
      "bankName",
      "bankIban",
      "bankBic",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(syndicatesTable)
      .set(updates)
      .where(eq(syndicatesTable.id, user.syndicateId))
      .returning();

    res.json({ data: updated, message: "Informations mises à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /team/members/:id — admin updates a committee member's role
router.put("/team/members/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { role } = req.body;
    const validRoles = [
      "member",
      "committee",
      "president",
      "treasurer",
      "secretary",
    ];
    if (!validRoles.includes(role)) {
      return void res
        .status(400)
        .json({
          error: `Rôle invalide. Valeurs acceptées: ${validRoles.join(", ")}`,
        });
    }

    if (user.role === "super_admin" && req.query.supervision !== "true") {
      return void res.status(403).json({
        error: "La supervision est requise pour modifier un membre de syndicat",
        code: "SUPERVISION_REQUIRED",
      });
    }

    const [target] = await db
      .select({ syndicateId: membersTable.syndicateId })
      .from(membersTable)
      .where(eq(membersTable.id, String(req.params.id) as string));
    if (!target)
      return void res.status(404).json({ error: "Membre introuvable" });

    if (user.role === "super_admin") {
      if (!target.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat cible non défini" });
      }
    } else {
      if (!user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      if (target.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    // Store committee role in the profession field (membersTable has no dedicated role column)
    const [updated] = await db
      .update(membersTable)
      .set({ profession: role })
      .where(
        and(
          eq(membersTable.id, String(req.params.id) as string),
          user.role === "super_admin"
            ? eq(membersTable.syndicateId, target.syndicateId!)
            : eq(membersTable.syndicateId, user.syndicateId!),
        ),
      )
      .returning();

    if (!updated)
      return void res.status(404).json({ error: "Membre introuvable" });
    res.json({ data: updated, message: "Rôle mis à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /team/invite — create and invite a management team member ───────────

const inviteSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  role: z.enum([
    "president",
    "treasurer",
    "secretary",
    "committee_member",
    "syndicate_admin",
  ]),
});

router.post("/team/invite", requireAuth, requireAdmin, async (req, res) => {
  const result = inviteSchema.safeParse(req.body);
  if (!result.success) {
    return void res
      .status(400)
      .json({ error: result.error.issues[0]?.message ?? "Données invalides" });
  }

  const { name, email, phone, role } = result.data;
  const syndicateId = req.user!.syndicateId;

  if (!syndicateId) {
    return void res
      .status(400)
      .json({ error: "Aucun syndicat associé à votre compte" });
  }

  try {
    const emailLower = email.trim().toLowerCase();

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, emailLower));
    if (existing) {
      return void res
        .status(409)
        .json({ error: `L'email ${emailLower} est déjà utilisé` });
    }

    // Generate a temporary password: 8 random chars (memorable format)
    const tempPassword =
      randomBytes(3).toString("hex").toUpperCase() +
      "-" +
      randomBytes(2).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        name: name.trim(),
        email: emailLower,
        phone: phone?.trim() ?? null,
        passwordHash,
        role,
        syndicateId,
        status: "active",
      } as any)
      .returning();

    // Issue tokens so the invited user can log in immediately
    const accessToken = signToken({
      userId: newUser.id,
      email: newUser.email,
      role: role as any,
      syndicateId,
      name: newUser.name,
    });

    const refreshTokenValue = signRefreshToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokensTable).values({
      userId: newUser.id,
      token: refreshTokenValue,
      expiresAt,
    });

    // Get syndicate info for email
    const [syndicate] = await db
      .select({ name: syndicatesTable.name })
      .from(syndicatesTable)
      .where(eq(syndicatesTable.id, syndicateId));

    // Send invitation email (best-effort)
    try {
      const { subject, html } = teamInvitationTemplate(
        name,
        role,
        syndicate?.name ?? "votre syndicat",
        tempPassword,
      );
      await sendTransactionalEmail({
        to: emailLower,
        subject,
        html,
        template: "team_invitation",
      });
    } catch (emailErr) {
      req.log.warn(emailErr, "Failed to send team invitation email");
    }

    const { passwordHash: _, ...safeUser } = newUser;
    res.status(201).json({
      data: { ...safeUser, tempPassword },
      message: "Invitation envoyée",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
