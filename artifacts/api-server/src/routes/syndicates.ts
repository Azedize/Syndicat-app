import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { syndicatesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, requireAdmin } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import { sendTransactionalEmail } from "../lib/email/emailService.js";
import { syndicateCreatedTemplate } from "../lib/email/templates.js";
import { bustLogoCache } from "../lib/documentPdf.js";
import { assignTrial } from "./subscriptions.js";

const router = Router();

// ─── GET /syndicates ───────────────────────────────────────────────────────────

router.get("/syndicates", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
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
    const id = String(req.params.id) as string;
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

// Legal form allowed values (UI display values stored as free text in DB)
const LEGAL_FORM_VALUES = [
  "Syndicat de Copropriété",
  "Association",
  "Coopérative",
  "Syndicat Professionnel",
  "Fédération",
  "Union",
  "Autre",
] as const;

// Moroccan phone: +212XXXXXXXXX or 0XXXXXXXXX (10 digits local)
const MOROCCAN_PHONE_RE = /^(\+212|0)[0-9]{9}$/;

// Registration number: flexible alphanumeric with dashes
const REG_NUMBER_RE = /^[A-Za-z0-9\-\/\.]{3,50}$/;

// ICE: 15 digits
const ICE_RE = /^[0-9]{15}$/;

// RC: alphanumeric 3-20 chars
const RC_RE = /^[A-Za-z0-9\-\/\.]{3,20}$/;

export const createSyndicateSchema = z.object({
  // Identity
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  abbreviation: z.string().min(1).max(20).optional(),
  sector: z.string().min(1),
  region: z.string().default(""),
  mission: z.string().max(1000).optional(),
  // Contact
  email: z.string().email("Format email invalide").optional().or(z.literal("")),
  phone: z
    .string()
    .max(30)
    .refine((v) => !v || MOROCCAN_PHONE_RE.test(v.replace(/\s/g, "")), {
      message: "Format téléphone invalide (ex: +212600000000 ou 0600000000)",
    })
    .optional()
    .or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).default("Maroc"),
  // Legal
  legalForm: z.string().optional(),
  registrationNumber: z
    .string()
    .refine((v) => !v || REG_NUMBER_RE.test(v), {
      message: "Format numéro d'enregistrement invalide",
    })
    .optional()
    .or(z.literal("")),
  iceNumber: z
    .string()
    .refine((v) => !v || ICE_RE.test(v), {
      message: "Le numéro ICE doit comporter 15 chiffres",
    })
    .optional()
    .or(z.literal("")),
  rcNumber: z
    .string()
    .refine((v) => !v || RC_RE.test(v), {
      message: "Format numéro RC invalide",
    })
    .optional()
    .or(z.literal("")),
  foundingDate: z.string().optional(),
  // Finance
  cotisationAmount: z.string().optional(),
  cotisationCycle: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  // Branding
  logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c3aed"),
  logoUrl: z.string().optional().or(z.literal("")),
  // Banking
  bankName: z.string().max(100).optional(),
  bankIban: z.string().max(50).optional(),
  bankBic:  z.string().max(20).optional(),
  // Optional: initial member count
  membersCount: z.number().int().min(0).default(0),
  // Optional: designate an existing user as admin
  adminId: z.string().optional(),
});

router.post("/syndicates", requireAuth, requireRole("super_admin"), async (req, res) => {
  const result = createSyndicateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.flatten() });
    return;
  }
  try {
    const data = result.data;

    const [syndicate] = await db.transaction(async (tx) => {
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

      const insertValues: Record<string, unknown> = {
        name: data.name,
        abbreviation: data.abbreviation,
        sector: data.sector,
        region: data.region,
        mission: data.mission,
        email: data.email || undefined,
        phone: data.phone || undefined,
        website: data.website || undefined,
        address: data.address,
        city: data.city,
        legalForm: data.legalForm,
        registrationNumber: data.registrationNumber || undefined,
        iceNumber: data.iceNumber || undefined,
        rcNumber: data.rcNumber || undefined,
        foundingDate: data.foundingDate,
        cotisationAmount: data.cotisationAmount,
        cotisationCycle: data.cotisationCycle,
        logoColor: data.logoColor,
        logoUrl: data.logoUrl || undefined,
        bankName: data.bankName || undefined,
        bankIban: data.bankIban || undefined,
        bankBic:  data.bankBic  || undefined,
        membersCount: data.membersCount,
        adminId: data.adminId,
        status: "active",
      };
      const [s] = await tx.insert(syndicatesTable).values(insertValues as any).returning();

      if (data.adminId) {
        const linkResult = await tx
          .update(usersTable)
          .set({ syndicateId: s.id, role: "syndicate_admin" })
          .where(eq(usersTable.id, data.adminId))
          .returning({ id: usersTable.id });
        if (linkResult.length === 0) {
          throw Object.assign(new Error("Impossible de lier l'administrateur"), { status: 500 });
        }
      }

      return [s];
    });

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "syndicate",
      entityId: syndicate.id,
      details: syndicate.name,
      platformAction: true,
    });

    if (data.adminId) {
      const [adminUser] = await db
        .select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, data.adminId));
      if (adminUser) {
        const { subject, html } = syndicateCreatedTemplate(syndicate.name, adminUser.name);
        sendTransactionalEmail({
          to: adminUser.email,
          subject,
          html,
          template: "syndicate_created",
          syndicateId: syndicate.id,
          req,
        }).catch(() => {});
      }
    }

    // Auto-assign 30-day free trial
    assignTrial(syndicate.id).catch((e) => req.log.warn({ err: e }, "Trial auto-assign failed"));

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
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  legalForm: z.string().optional(),
  registrationNumber: z.string().optional(),
  iceNumber: z.string().optional(),
  rcNumber: z.string().optional(),
  foundingDate: z.string().optional(),
  cotisationAmount: z.string().optional(),
  cotisationCycle: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  logoColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoUrl: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).optional(),
  adminId: z.string().optional(),
  // Banking — used on payment demands, invoices, and legal enforcement letters
  bankName: z.string().max(100).optional(),
  bankIban: z.string().max(50).optional(),
  bankBic:  z.string().max(20).optional(),
});

router.put("/syndicates/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id) as string;
  const user = req.user!;

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
    // Bust logo cache so next PDF generation picks up the new logo immediately
    if (result.data.logoUrl !== undefined && updated.logoUrl) {
      bustLogoCache(updated.logoUrl);
    }
    // Managing syndicate settings/lifecycle is a normal Super Admin platform duty,
    // not supervision of a syndicate_admin's day-to-day operations.
    await serverAuditLog(req, { action: "UPDATE", entity: "syndicate", entityId: id, syndicateId: id, platformAction: user.role === "super_admin" });
    res.json({ data: updated, message: "Syndicat mis à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
