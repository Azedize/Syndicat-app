import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { syndicatesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, requireAdmin } from "../middleware/auth.js";

const router = Router();

// ─── GET /syndicates ───────────────────────────────────────────────────────────

router.get("/syndicates", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    // super_admin sees all; other roles only see their own syndicate
    const rows =
      user.role === "super_admin"
        ? await db.select().from(syndicatesTable)
        : await db
            .select()
            .from(syndicatesTable)
            .where(eq(syndicatesTable.id, user.syndicateId ?? ""));
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /syndicates/:id ───────────────────────────────────────────────────────

router.get("/syndicates/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const id = req.params.id as string;
    // non-admins can only read their own syndicate
    if (user.role !== "super_admin" && user.syndicateId !== id) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    const [syndicate] = await db.select().from(syndicatesTable).where(eq(syndicatesTable.id, id));
    if (!syndicate) { res.status(404).json({ error: "Syndicat introuvable" }); return; }
    res.json({ data: syndicate });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /syndicates ──────────────────────────────────────────────────────────
// Full onboarding: creates syndicate + optionally links admin user + initial settings.

const createSchema = z.object({
  // Identity
  name: z.string().min(1).max(200),
  abbreviation: z.string().min(1).max(20).optional(),
  sector: z.string().min(1),
  region: z.string().default(""),
  mission: z.string().max(1000).optional(),
  // Contact
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional().or(z.literal("")),
  address: z.string().max(300).optional(),
  // Legal
  legalForm: z.string().optional(),
  registrationNumber: z.string().optional(),
  foundingDate: z.string().optional(),
  // Finance
  cotisationAmount: z.string().optional(),
  cotisationCycle: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  // Branding
  logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c3aed"),
  // Optional: initial member count
  membersCount: z.number().int().min(0).default(0),
  // Optional: designate an existing user as admin
  adminId: z.string().optional(),
});

router.post("/syndicates", requireAuth, requireRole("super_admin"), async (req, res) => {
  const result = createSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.flatten() });
    return;
  }
  try {
    const data = result.data;

    const [syndicate] = await db.transaction(async (tx) => {
      // 0. Validate adminId before creating the syndicate (fast-fail inside transaction)
      if (data.adminId) {
        const [admin] = await tx
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.id, data.adminId))
          .limit(1);
        if (!admin) {
          throw Object.assign(new Error("adminId introuvable"), { status: 400 });
        }
      }

      // 1. Create the syndicate
      const [s] = await tx.insert(syndicatesTable).values({
        name: data.name,
        abbreviation: data.abbreviation,
        sector: data.sector,
        region: data.region,
        mission: data.mission,
        email: data.email,
        phone: data.phone,
        website: data.website || undefined,
        address: data.address,
        legalForm: data.legalForm,
        registrationNumber: data.registrationNumber,
        foundingDate: data.foundingDate,
        cotisationAmount: data.cotisationAmount,
        cotisationCycle: data.cotisationCycle,
        logoColor: data.logoColor,
        membersCount: data.membersCount,
        adminId: data.adminId,
        status: "active",
      }).returning();

      // 2. Link admin user → syndicate (guaranteed to match since we pre-validated)
      if (data.adminId) {
        const result = await tx
          .update(usersTable)
          .set({ syndicateId: s.id, role: "syndicate_admin" })
          .where(eq(usersTable.id, data.adminId))
          .returning({ id: usersTable.id });
        if (result.length === 0) {
          throw Object.assign(new Error("Impossible de lier l'administrateur"), { status: 500 });
        }
      }

      return [s];
    });

    res.status(201).json({ data: syndicate, message: "Syndicat créé avec succès" });
  } catch (err: any) {
    req.log.error(err);
    const status = typeof err?.status === "number" ? err.status : 500;
    res.status(status).json({ error: err?.message ?? "Erreur serveur" });
  }
});

// ─── PUT /syndicates/:id ───────────────────────────────────────────────────────

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  abbreviation: z.string().max(20).optional(),
  sector: z.string().optional(),
  region: z.string().optional(),
  mission: z.string().max(1000).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional().or(z.literal("")),
  address: z.string().max(300).optional(),
  legalForm: z.string().optional(),
  registrationNumber: z.string().optional(),
  foundingDate: z.string().optional(),
  cotisationAmount: z.string().optional(),
  cotisationCycle: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  adminId: z.string().optional(),
});

router.put("/syndicates/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const user = req.user!;

  // syndicate_admin can only update their own syndicate
  if (user.role === "syndicate_admin" && user.syndicateId !== id) {
    res.status(403).json({ error: "Accès refusé" });
    return;
  }

  const result = updateSchema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [updated] = await db
      .update(syndicatesTable)
      .set(result.data)
      .where(eq(syndicatesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Syndicat introuvable" }); return; }
    res.json({ data: updated, message: "Syndicat mis à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
