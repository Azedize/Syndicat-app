import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { membersTable, syndicatesTable, usersTable } from "@workspace/db/schema";
import { eq, and, ilike, or, sql, count, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { createAlert } from "../lib/notify.js";

const router = Router();

function isSameSyndicate(req: any, syndicateId: string): boolean {
  return req.user.role === "super_admin" || req.user.syndicateId === syndicateId;
}

router.get("/members", requireAuth, async (req, res) => {
  const { search, status, syndicateId } = req.query as Record<string, string>;
  const pagination = getPagination(req);
  try {
    const conditions: any[] = [];
    if (req.user!.role === "super_admin" && syndicateId) {
      // super_admin filtering by specific syndicate
      conditions.push(eq(membersTable.syndicateId, syndicateId));
    } else if (req.user!.role !== "super_admin" && req.user!.syndicateId) {
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
      db.select().from(membersTable)
        .where(where)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(membersTable).where(where),
    ]);

    // Enrich with userId from usersTable (matched by email) for chat/conversations
    const emails = rows.map((r) => r.email).filter(Boolean);
    const usersByEmail = emails.length > 0
      ? await db.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(inArray(usersTable.email, emails))
      : [];
    const userEmailMap = Object.fromEntries(usersByEmail.map((u) => [u.email, u]));

    const enriched = rows.map((r) => ({
      ...r,
      userId: userEmailMap[r.email]?.id ?? null,
      role: userEmailMap[r.email]?.role ?? null,
    }));

    res.json(buildPagedResponse(enriched, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/members",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().default(""),
      profession: z.string().default(""),
      syndicateId: z.string().optional(),
      joinDate: z.string().default(new Date().toISOString().split("T")[0]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides", details: result.error.issues });
      return;
    }
    try {
      const syndicateId =
        req.user!.role === "super_admin"
          ? result.data.syndicateId || ""
          : req.user!.syndicateId || "";

      let member: typeof membersTable.$inferSelect;
      await db.transaction(async (tx) => {
        const [m] = await tx
          .insert(membersTable)
          .values({ ...result.data, syndicateId, status: "active", cotisationStatus: "pending" })
          .returning();
        member = m;

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
        title: "Nouveau membre",
        message: `${member!.name} vient de rejoindre le syndicat.`,
        type: "success",
        syndicateId: syndicateId || null,
        target: "admin",
      }).catch(() => {});

      res.status(201).json({ data: member!, message: "Membre ajouté avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.get("/members/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id));
    if (!member) { res.status(404).json({ error: "Membre introuvable" }); return; }
    if (!isSameSyndicate(req, member.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    res.json({ data: member });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put(
  "/members/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = req.params.id as string;
    const schema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      profession: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
    try {
      const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id));
      if (!member) { res.status(404).json({ error: "Membre introuvable" }); return; }
      if (!isSameSyndicate(req, member.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const [updated] = await db.update(membersTable).set(result.data).where(eq(membersTable.id, id)).returning();
      res.json({ data: updated, message: "Membre mis à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/members/:id/status",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = req.params.id as string;
    const schema = z.object({ status: z.enum(["active", "inactive", "pending"]) });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Statut invalide" }); return; }
    try {
      const [member] = await db.select().from(membersTable).where(eq(membersTable.id, id));
      if (!member) { res.status(404).json({ error: "Membre introuvable" }); return; }
      if (!isSameSyndicate(req, member.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      let updated: typeof membersTable.$inferSelect;
      await db.transaction(async (tx) => {
        const [u] = await tx
          .update(membersTable)
          .set({ status: result.data.status })
          .where(eq(membersTable.id, id))
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
              .set({ membersCount: sql`GREATEST(${syndicatesTable.membersCount} - 1, 0)` })
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
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
