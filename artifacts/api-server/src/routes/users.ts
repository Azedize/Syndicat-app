import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, syndicatesTable } from "@workspace/db/schema";
import { eq, ilike, or, and, count, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";

const router = Router();

router.get(
  "/users",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const { search, role, status } = req.query as Record<string, string>;
    const pagination = getPagination(req);
    try {
      const conditions: any[] = [];

      if (req.user!.role === "syndicate_admin" && req.user!.syndicateId) {
        conditions.push(eq(usersTable.syndicateId, req.user!.syndicateId));
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
          .leftJoin(syndicatesTable, eq(usersTable.syndicateId, syndicatesTable.id))
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

router.put(
  "/users/:id/status",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({ status: z.enum(["active", "inactive", "suspended", "pending"]) });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }
    try {
      await db
        .update(usersTable)
        .set({ status: result.data.status })
        .where(eq(usersTable.id, req.params.id));
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
    const schema = z.object({ role: z.enum(["super_admin", "syndicate_admin", "member"]) });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Rôle invalide" });
      return;
    }
    try {
      await db
        .update(usersTable)
        .set({ role: result.data.role })
        .where(eq(usersTable.id, req.params.id));
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
      await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
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
