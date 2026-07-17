/**
 * P11 — Syndic Team Directory
 * - Lists admins + committee members with their roles, contacts, office hours
 * - Syndicate admins can update team member profiles
 * - All authenticated users in the syndicate can view
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  membersTable,
  syndicatesTable,
} from "@workspace/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// GET /team — directory of syndicate admin team + committee
router.get("/team", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.syndicateId) return void res.json({ data: [] });

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
            eq(usersTable.role, "super_admin")
          )
        )
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
            eq(membersTable.status, "secretary")
          )
        )
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
    if (!user.syndicateId) return void res.status(400).json({ error: "Pas de syndicat associé" });

    const allowed = ["email", "phone", "address", "officeHours", "website", "bankName", "bankIban", "bankBic"];
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
    const validRoles = ["member", "committee", "president", "treasurer", "secretary"];
    if (!validRoles.includes(role)) {
      return void res.status(400).json({ error: `Rôle invalide. Valeurs acceptées: ${validRoles.join(", ")}` });
    }

    if (user.role === "syndicate_admin") {
      const [target] = await db
        .select({ syndicateId: membersTable.syndicateId })
        .from(membersTable)
        .where(eq(membersTable.id, String(req.params.id) as string));
      if (!target) return void res.status(404).json({ error: "Membre introuvable" });
      if (target.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    // Store committee role in the profession field (membersTable has no dedicated role column)
    const [updated] = await db
      .update(membersTable)
      .set({ profession: role })
      .where(eq(membersTable.id, String(req.params.id) as string))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Membre introuvable" });
    res.json({ data: updated, message: "Rôle mis à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
