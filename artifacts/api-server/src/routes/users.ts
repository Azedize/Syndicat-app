import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, syndicatesTable } from "@workspace/db/schema";
import { eq, ilike, or, and, count, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { serverAuditLog } from "../lib/audit.js";
import { sendTransactionalEmail } from "../lib/email/emailService.js";
import { welcomeTemplate } from "../lib/email/templates.js";

const router = Router();

const ROLE_VALUES = [
  "super_admin",
  "syndicate_admin",
  "member",
  "tenant",
] as const;

function requireSupervisedUserScope(
  req: any,
  res: any,
): string | null | undefined {
  if (req.user?.role !== "super_admin") return undefined;
  const syndicateId =
    typeof req.query.syndicateId === "string" ? req.query.syndicateId : "";
  if (req.query.supervision !== "true" || !syndicateId) {
    res.status(403).json({
      error:
        "La supervision et un syndicat cible sont requis pour modifier ce compte.",
      code: "SUPERVISION_REQUIRED",
    });
    return null;
  }
  return syndicateId;
}

router.get(
  "/users",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const { search, role, status } = req.query as Record<string, string>;
    const pagination = getPagination(req);
    try {
      const syndicateId = req.user!.syndicateId;
      if (req.user!.role === "syndicate_admin" && !syndicateId) {
        res.status(403).json({ error: "Syndicat non défini dans le token" });
        return;
      }
      const conditions: any[] = [];

      if (req.user!.role === "syndicate_admin") {
        conditions.push(eq(usersTable.syndicateId, syndicateId!));
      }
      if (role) conditions.push(eq(usersTable.role, role as any));
      if (status) conditions.push(eq(usersTable.status, status as any));
      if (search) {
        conditions.push(
          or(
            ilike(usersTable.name, `%${search}%`),
            ilike(usersTable.email, `%${search}%`),
          ),
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, [{ value: total }]] = await Promise.all([
        db
          .select({
            id: usersTable.id,
            name: usersTable.name,
            email: usersTable.email,
            phone: usersTable.phone,
            role: usersTable.role,
            status: usersTable.status,
            syndicateId: usersTable.syndicateId,
            syndicateName: syndicatesTable.name,
            createdAt: usersTable.createdAt,
          })
          .from(usersTable)
          .leftJoin(
            syndicatesTable,
            eq(usersTable.syndicateId, syndicatesTable.id),
          )
          .where(where)
          .orderBy(desc(usersTable.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset),
        db.select({ value: count() }).from(usersTable).where(where),
      ]);

      const mapped = rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? "",
        role: u.role,
        status: u.status,
        syndicateId: u.syndicateId,
        syndicate: u.syndicateName ?? "Plateforme Globale",
        joinDate: u.createdAt?.toISOString().slice(0, 10) ?? "",
        avatar: (u.name ?? "?")
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((w: string) => w[0])
          .join("")
          .toUpperCase(),
      }));

      res.json(buildPagedResponse(mapped, Number(total), pagination));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.post(
  "/users",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      role: z.enum(ROLE_VALUES).default("member"),
      password: z
        .string()
        .min(8, "Le mot de passe doit contenir au moins 8 caractères")
        .optional(),
      syndicateId: z.string().min(1).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const { name, phone, role, password, syndicateId } = result.data;
      const normalizedEmail = result.data.email.trim().toLowerCase();

      if (req.user!.role === "syndicate_admin" && !req.user!.syndicateId) {
        res.status(403).json({ error: "Syndicat non défini dans le token" });
        return;
      }

      // syndicate_admin can only create users scoped to their own syndicate,
      // and cannot create other admins.
      if (
        req.user!.role === "syndicate_admin" &&
        (role === "super_admin" || role === "syndicate_admin")
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      let createdSyndicateId: string | null = req.user!.syndicateId ?? null;
      if (req.user!.role === "super_admin") {
        if (role !== "super_admin") {
          const supervisedSyndicateId = requireSupervisedUserScope(req, res);
          if (!supervisedSyndicateId) return;
          if (syndicateId && syndicateId !== supervisedSyndicateId) {
            res.status(400).json({
              error:
                "Le syndicat fourni ne correspond pas au syndicat supervisé",
            });
            return;
          }
          createdSyndicateId = supervisedSyndicateId;
        } else if (syndicateId) {
          res.status(400).json({
            error: "Un Super Admin ne peut pas être rattaché à un syndicat",
          });
          return;
        } else {
          createdSyndicateId = null;
        }
      }

      if (createdSyndicateId) {
        const [syndicate] = await db
          .select({ id: syndicatesTable.id })
          .from(syndicatesTable)
          .where(eq(syndicatesTable.id, createdSyndicateId))
          .limit(1);
        if (!syndicate) {
          res.status(400).json({ error: "Syndicat cible introuvable" });
          return;
        }
      }

      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail));
      if (existing) {
        res.status(400).json({ error: "Cet email est déjà utilisé" });
        return;
      }

      // Generate credentials server-side when an administrator creates an account.
      // The previous client-supplied shared password created a predictable credential
      // and made the invitation flow unsafe.
      const temporaryPassword =
        password ?? randomBytes(12).toString("base64url");
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const [created] = await db
        .insert(usersTable)
        .values({
          name,
          email: normalizedEmail,
          phone: phone || null,
          role,
          status: "pending",
          passwordHash,
          syndicateId: createdSyndicateId,
        } as any)
        .returning({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          phone: usersTable.phone,
          role: usersTable.role,
          status: usersTable.status,
          syndicateId: usersTable.syndicateId,
          createdAt: usersTable.createdAt,
        });

      await serverAuditLog(req, {
        action: "CREATE",
        entity: "user",
        entityId: created.id,
        details: `${created.email} (${created.role})`,
      });

      const loginUrl = process.env.APP_URL
        ? `${process.env.APP_URL}/login`
        : undefined;
      const { subject, html } = welcomeTemplate(
        created.name,
        created.role,
        loginUrl,
        temporaryPassword,
      );
      sendTransactionalEmail({
        to: created.email,
        subject,
        html,
        template: "welcome",
        syndicateId: created.syndicateId,
        req,
      }).catch(() => {});

      res.status(201).json({ data: created });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/users/:id/status",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      status: z.enum(["active", "inactive", "suspended", "pending"]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }
    try {
      const supervisedSyndicateId = requireSupervisedUserScope(req, res);
      if (req.user!.role === "super_admin" && !supervisedSyndicateId) return;
      if (req.user!.role === "syndicate_admin") {
        if (!req.user!.syndicateId) {
          res.status(403).json({ error: "Syndicat non défini dans le token" });
          return;
        }
        const [target] = await db
          .select({ syndicateId: usersTable.syndicateId })
          .from(usersTable)
          .where(eq(usersTable.id, String(req.params.id) as string));
        if (!target) {
          res.status(404).json({ error: "Utilisateur introuvable" });
          return;
        }
        if (target.syndicateId !== req.user!.syndicateId) {
          res.status(403).json({ error: "Accès refusé" });
          return;
        }
      }
      const ownershipCondition =
        req.user!.role === "super_admin"
          ? and(
              eq(usersTable.id, String(req.params.id) as string),
              eq(usersTable.syndicateId, supervisedSyndicateId!),
            )
          : and(
              eq(usersTable.id, String(req.params.id) as string),
              eq(usersTable.syndicateId, req.user!.syndicateId!),
            );
      const [updated] = await db
        .update(usersTable)
        .set({ status: result.data.status })
        .where(ownershipCondition)
        .returning({ id: usersTable.id });
      if (!updated) {
        res.status(404).json({ error: "Utilisateur introuvable" });
        return;
      }

      await serverAuditLog(req, {
        action: "UPDATE_STATUS",
        entity: "user",
        entityId: String(req.params.id),
        details: result.data.status,
      });

      res.json({ success: true });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/users/:id/role",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const schema = z.object({ role: z.enum(ROLE_VALUES) });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Rôle invalide" });
      return;
    }
    try {
      const supervisedSyndicateId = requireSupervisedUserScope(req, res);
      if (!supervisedSyndicateId) return;
      const [target] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, String(req.params.id) as string),
            eq(usersTable.syndicateId, supervisedSyndicateId),
          ),
        );
      if (!target) {
        res.status(404).json({ error: "Utilisateur introuvable" });
        return;
      }
      await db
        .update(usersTable)
        .set({ role: result.data.role })
        .where(
          and(
            eq(usersTable.id, String(req.params.id) as string),
            eq(usersTable.syndicateId, supervisedSyndicateId),
          ),
        );

      await serverAuditLog(req, {
        action: "UPDATE_ROLE",
        entity: "user",
        entityId: String(req.params.id),
        details: result.data.role,
        platformAction: true,
      });

      res.json({ success: true });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.delete(
  "/users/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const supervisedSyndicateId = requireSupervisedUserScope(req, res);
      if (!supervisedSyndicateId) return;
      const [target] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, String(req.params.id) as string),
            eq(usersTable.syndicateId, supervisedSyndicateId),
          ),
        );
      if (!target) {
        res.status(404).json({ error: "Utilisateur introuvable" });
        return;
      }
      await db
        .delete(usersTable)
        .where(
          and(
            eq(usersTable.id, String(req.params.id) as string),
            eq(usersTable.syndicateId, supervisedSyndicateId),
          ),
        );

      await serverAuditLog(req, {
        action: "DELETE",
        entity: "user",
        entityId: String(req.params.id),
        platformAction: true,
      });

      res.json({ success: true });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Push Token Registration ───────────────────────────────────────────────────

router.put("/users/push-token", requireAuth, async (req, res) => {
  const schema = z.object({ pushToken: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Token invalide" });
    return;
  }
  try {
    await db
      .update(usersTable)
      .set({ pushToken: result.data.pushToken })
      .where(eq(usersTable.id, req.user!.userId));
    res.json({ message: "Token enregistré" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
