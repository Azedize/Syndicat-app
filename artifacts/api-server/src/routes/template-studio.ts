/**
 * template-studio.ts — Template Management Studio API
 *
 * Full CRUD + lifecycle management for document template definitions.
 * All mutating endpoints are restricted to super_admin.
 * Read-only endpoints (list, get, stats) allow syndicate_admin to see published templates.
 * The public /verify/:token endpoint requires no auth.
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  templateDefinitionsTable,
  templateDefinitionVersionsTable,
  templateDefinitionPermissionsTable,
  templateRequestsTable,
  documentsTable,
  usersTable,
  syndicatesTable,
} from "@workspace/db/schema";
import { eq, and, desc, count, sql, or, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

const TEMPLATE_CATEGORIES = [
  "meeting_minutes", "financial", "legal", "elections", "contracts",
  "certificates", "regulations", "administrative", "maintenance", "insurance",
] as const;

const TEMPLATE_STATUSES = ["draft", "published", "archived", "disabled"] as const;
const LANGUAGES = ["fr", "ar", "en", "es"] as const;

const variableDefSchema = z.object({
  name: z.string().min(1),                  // e.g. "syndicate_name"
  label: z.record(z.string(), z.string()),  // { fr: "Nom du syndicat", ar: "...", en: "..." }
  source: z.enum(["db_syndicate", "db_property", "db_office_holders", "db_member", "user_input", "generated"]),
  type: z.enum(["text", "date", "number", "boolean", "list"]).default("text"),
  required: z.boolean().default(false),
  defaultValue: z.string().optional(),
  dbPath: z.string().optional(),            // e.g. "syndicatesTable.name"
  example: z.string().optional(),           // preview value for the variable explorer
});

const sectionDefSchema = z.object({
  id: z.string().min(1),
  title: z.record(z.string(), z.string()),  // { fr, ar, en, es }
  content: z.record(z.string(), z.string()).optional(), // default body text per language
  type: z.enum(["text", "table", "signature", "stamp", "qr", "image", "chart", "page_break"]).default("text"),
  required: z.boolean().default(true),
  order: z.number().int().min(0),
  config: z.record(z.string(), z.unknown()).optional(), // type-specific config (columns for tables, etc.)
});

const layoutConfigSchema = z.object({
  accentColor: z.string().default("#2563EB"),
  headerStyle: z.enum(["branded", "minimal", "none"]).default("branded"),
  footerStyle: z.enum(["full", "minimal", "none"]).default("full"),
  watermark: z.boolean().default(false),
  pageSize: z.enum(["A4", "A3", "Letter"]).default("A4"),
  fontFamily: z.enum(["DejaVu", "Helvetica", "Amiri"]).default("DejaVu"),
  showQr: z.boolean().default(true),
  showStamp: z.boolean().default(true),
}).partial();

const createTemplateSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9_]+$/),
  category: z.enum(TEMPLATE_CATEGORIES),
  name: z.record(z.string(), z.string()),        // { fr, ar, en, es }
  description: z.record(z.string(), z.string()).optional(),
  variables: z.array(variableDefSchema).default([]),
  sections: z.array(sectionDefSchema).default([]),
  layoutConfig: layoutConfigSchema.optional(),
  languages: z.array(z.enum(LANGUAGES)).min(1).default(["fr"]),
  syndicateId: z.string().uuid().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial().extend({
  changeDescription: z.string().optional(),
});

const permissionsSchema = z.array(z.object({
  role: z.enum(["super_admin", "syndicate_admin", "member", "tenant", "all"]),
  canUse: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canPublish: z.boolean().default(false),
}));

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getTemplateOrFail(id: string, res: import("express").Response) {
  const [tmpl] = await db
    .select()
    .from(templateDefinitionsTable)
    .where(eq(templateDefinitionsTable.id, id));
  if (!tmpl) { res.status(404).json({ error: "Template introuvable" }); return null; }
  return tmpl;
}

// ─── GET /template-studio/stats ───────────────────────────────────────────────

router.get(
  "/template-studio/stats",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    try {
      const [totals] = await db
        .select({
          total:     count(),
          published: sql<number>`count(*) filter (where ${templateDefinitionsTable.status} = 'published')`,
          draft:     sql<number>`count(*) filter (where ${templateDefinitionsTable.status} = 'draft')`,
          archived:  sql<number>`count(*) filter (where ${templateDefinitionsTable.status} = 'archived')`,
          disabled:  sql<number>`count(*) filter (where ${templateDefinitionsTable.status} = 'disabled')`,
        })
        .from(templateDefinitionsTable);

      const [usage] = await db
        .select({ totalUsage: sql<number>`coalesce(sum(${templateDefinitionsTable.usageCount}), 0)` })
        .from(templateDefinitionsTable);

      // Count by category
      const byCategory = await db
        .select({
          category: templateDefinitionsTable.category,
          cnt: count(),
        })
        .from(templateDefinitionsTable)
        .groupBy(templateDefinitionsTable.category);

      res.json({
        data: {
          total:      Number(totals.total),
          published:  Number(totals.published),
          draft:      Number(totals.draft),
          archived:   Number(totals.archived),
          disabled:   Number(totals.disabled),
          totalUsage: Number(usage.totalUsage),
          byCategory: Object.fromEntries(byCategory.map((r) => [r.category, Number(r.cnt)])),
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /template-studio/templates ──────────────────────────────────────────

router.get(
  "/template-studio/templates",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    try {
      const { category, status, syndicateId, search } = req.query as Record<string, string>;
      const conditions = [];

      if (category) conditions.push(eq(templateDefinitionsTable.category, category));
      if (status)   conditions.push(eq(templateDefinitionsTable.status, status));

      // Super admin sees all; syndicate_admin sees published platform-wide + their syndicate's
      if (req.user!.role !== "super_admin") {
        const sid = req.user!.syndicateId;
        conditions.push(
          eq(templateDefinitionsTable.status, "published"),
        );
        if (sid) {
          conditions.push(
            or(isNull(templateDefinitionsTable.syndicateId), eq(templateDefinitionsTable.syndicateId, sid))!
          );
        }
      } else if (syndicateId) {
        conditions.push(eq(templateDefinitionsTable.syndicateId, syndicateId));
      }

      const templates = await db
        .select({
          id:             templateDefinitionsTable.id,
          slug:           templateDefinitionsTable.slug,
          category:       templateDefinitionsTable.category,
          name:           templateDefinitionsTable.name,
          description:    templateDefinitionsTable.description,
          status:         templateDefinitionsTable.status,
          languages:      templateDefinitionsTable.languages,
          currentVersion: templateDefinitionsTable.currentVersion,
          usageCount:     templateDefinitionsTable.usageCount,
          syndicateId:    templateDefinitionsTable.syndicateId,
          createdBy:      templateDefinitionsTable.createdBy,
          publishedAt:    templateDefinitionsTable.publishedAt,
          archivedAt:     templateDefinitionsTable.archivedAt,
          createdAt:      templateDefinitionsTable.createdAt,
          updatedAt:      templateDefinitionsTable.updatedAt,
        })
        .from(templateDefinitionsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(templateDefinitionsTable.updatedAt));

      res.json({ data: templates });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /template-studio/templates ─────────────────────────────────────────

router.post(
  "/template-studio/templates",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const result = createTemplateSchema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: result.error.issues }); return; }
    const data = result.data;

    try {
      const [template] = await db
        .insert(templateDefinitionsTable)
        .values({
          slug:         data.slug,
          category:     data.category,
          name:         JSON.stringify(data.name),
          description:  data.description ? JSON.stringify(data.description) : null,
          variables:    JSON.stringify(data.variables),
          sections:     JSON.stringify(data.sections),
          layoutConfig: JSON.stringify(data.layoutConfig ?? {}),
          status:       "draft",
          syndicateId:  data.syndicateId ?? null,
          languages:    JSON.stringify(data.languages),
          currentVersion: 1,
          createdBy:    req.user!.userId,
          updatedBy:    req.user!.userId,
        } as any)
        .returning();

      // Save initial version snapshot
      await db.insert(templateDefinitionVersionsTable).values({
        templateId:        template.id,
        version:           1,
        snapshot:          JSON.stringify({ ...data, status: "draft", version: 1 }),
        changeDescription: "Version initiale",
        createdBy:         req.user!.userId,
      } as any);

      await serverAuditLog(req, {
        action: "template_created",
        entity: "template_definition",
        entityId: template.id,
        details: JSON.stringify({ slug: data.slug, category: data.category }),
      });

      res.status(201).json({ data: template });
    } catch (err: any) {
      if (err?.message?.includes("unique")) {
        res.status(409).json({ error: "Un template avec ce slug existe déjà" });
      } else {
        res.status(500).json({ error: "Erreur serveur" });
      }
    }
  },
);

// ─── GET /template-studio/templates/:id ──────────────────────────────────────

router.get(
  "/template-studio/templates/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const tmpl = await getTemplateOrFail(routeParam(req.params.id), res);
    if (!tmpl) return;

    // Fetch permissions
    const permissions = await db
      .select()
      .from(templateDefinitionPermissionsTable)
      .where(eq(templateDefinitionPermissionsTable.templateId, tmpl.id));

    res.json({
      data: {
        ...tmpl,
        name:         safeJson(tmpl.name),
        description:  safeJson(tmpl.description),
        variables:    safeJson(tmpl.variables, []),
        sections:     safeJson(tmpl.sections, []),
        layoutConfig: safeJson(tmpl.layoutConfig, {}),
        languages:    safeJson(tmpl.languages, ["fr"]),
        permissions,
      },
    });
  },
);

// ─── PUT /template-studio/templates/:id ──────────────────────────────────────

router.put(
  "/template-studio/templates/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const tmpl = await getTemplateOrFail(routeParam(req.params.id), res);
    if (!tmpl) return;

    if (tmpl.status === "archived" || tmpl.status === "disabled") {
      res.status(409).json({ error: "Impossible de modifier un template archivé ou désactivé" });
      return;
    }

    const result = updateTemplateSchema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: result.error.issues }); return; }
    const data = result.data;

    const newVersion = (tmpl.currentVersion ?? 1) + 1;

    try {
      const [updated] = await db
        .update(templateDefinitionsTable)
        .set({
          ...(data.slug        ? { slug: data.slug } : {}),
          ...(data.category    ? { category: data.category } : {}),
          ...(data.name        ? { name: JSON.stringify(data.name) } : {}),
          ...(data.description !== undefined ? { description: data.description ? JSON.stringify(data.description) : null } : {}),
          ...(data.variables   ? { variables: JSON.stringify(data.variables) } : {}),
          ...(data.sections    ? { sections: JSON.stringify(data.sections) } : {}),
          ...(data.layoutConfig ? { layoutConfig: JSON.stringify(data.layoutConfig) } : {}),
          ...(data.languages   ? { languages: JSON.stringify(data.languages) } : {}),
          ...(data.syndicateId !== undefined ? { syndicateId: data.syndicateId ?? null } : {}),
          currentVersion: newVersion,
          updatedBy: req.user!.userId,
          updatedAt: new Date(),
        } as any)
        .where(eq(templateDefinitionsTable.id, tmpl.id))
        .returning();

      // Snapshot this version
      const snapshot = {
        ...safeJson(tmpl.name),
        ...data,
        version: newVersion,
        status: tmpl.status,
      };
      await db.insert(templateDefinitionVersionsTable).values({
        templateId:        tmpl.id,
        version:           newVersion,
        snapshot:          JSON.stringify(snapshot),
        changeDescription: data.changeDescription ?? `Mise à jour v${newVersion}`,
        createdBy:         req.user!.userId,
      } as any);

      await serverAuditLog(req, {
        action: "template_updated",
        entity: "template_definition",
        entityId: tmpl.id,
        details: JSON.stringify({ newVersion, changeDescription: data.changeDescription }),
      });

      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Lifecycle Actions ────────────────────────────────────────────────────────

async function setTemplateStatus(
  req: import("express").Request,
  res: import("express").Response,
  newStatus: typeof TEMPLATE_STATUSES[number],
  action: string,
  guard?: (tmpl: Record<string, unknown>) => string | null,
) {
  const tmpl = await getTemplateOrFail(routeParam(req.params.id), res);
  if (!tmpl) return;
  if (guard) {
    const err = guard(tmpl as any);
    if (err) { res.status(409).json({ error: err }); return; }
  }
  const patch: Record<string, unknown> = {
    status: newStatus,
    updatedAt: new Date(),
    updatedBy: req.user!.userId,
  };
  if (newStatus === "published") patch.publishedAt = new Date();
  if (newStatus === "archived")  patch.archivedAt  = new Date();
  if (newStatus === "disabled")  patch.disabledAt  = new Date();

  const [updated] = await db
    .update(templateDefinitionsTable)
    .set(patch as any)
    .where(eq(templateDefinitionsTable.id, tmpl.id))
    .returning();

  await serverAuditLog(req, { action, entity: "template_definition", entityId: tmpl.id, details: JSON.stringify({ newStatus }) });
  res.json({ data: updated });
}

router.post("/template-studio/templates/:id/publish",
  requireAuth, requireRole("super_admin"),
  (req, res) => setTemplateStatus(req, res, "published", "template_published",
    (t) => t.status === "published" ? "Déjà publié" : null));

router.post("/template-studio/templates/:id/archive",
  requireAuth, requireRole("super_admin"),
  (req, res) => setTemplateStatus(req, res, "archived", "template_archived",
    (t) => t.status === "archived" ? "Déjà archivé" : null));

router.post("/template-studio/templates/:id/restore",
  requireAuth, requireRole("super_admin"),
  (req, res) => setTemplateStatus(req, res, "draft", "template_restored",
    (t) => t.status === "draft" ? "Déjà en brouillon" : null));

router.post("/template-studio/templates/:id/disable",
  requireAuth, requireRole("super_admin"),
  (req, res) => setTemplateStatus(req, res, "disabled", "template_disabled",
    (t) => t.status === "disabled" ? "Déjà désactivé" : null));

// ─── POST /template-studio/templates/:id/duplicate ───────────────────────────

router.post(
  "/template-studio/templates/:id/duplicate",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const tmpl = await getTemplateOrFail(routeParam(req.params.id), res);
    if (!tmpl) return;

    const { newSlug } = req.body;
    if (!newSlug || !/^[a-z0-9_]+$/.test(newSlug)) {
      res.status(400).json({ error: "newSlug requis (lettres minuscules, chiffres, _)" }); return;
    }

    try {
      const [clone] = await db
        .insert(templateDefinitionsTable)
        .values({
          slug:         newSlug,
          category:     tmpl.category,
          name:         (() => {
            const n = safeJson(tmpl.name, {}) as Record<string, string>;
            const suffix = " (copie)";
            return JSON.stringify(Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v + suffix])));
          })(),
          description:  tmpl.description,
          variables:    tmpl.variables,
          sections:     tmpl.sections,
          layoutConfig: tmpl.layoutConfig,
          status:       "draft",
          syndicateId:  tmpl.syndicateId,
          languages:    tmpl.languages,
          currentVersion: 1,
          createdBy:    req.user!.userId,
          updatedBy:    req.user!.userId,
        } as any)
        .returning();

      await db.insert(templateDefinitionVersionsTable).values({
        templateId:        clone.id,
        version:           1,
        snapshot:          JSON.stringify({ clonedFrom: tmpl.id }),
        changeDescription: `Dupliqué depuis ${tmpl.slug}`,
        createdBy:         req.user!.userId,
      } as any);

      res.status(201).json({ data: clone });
    } catch (err: any) {
      if (err?.message?.includes("unique")) {
        res.status(409).json({ error: "Ce slug existe déjà" });
      } else {
        res.status(500).json({ error: "Erreur serveur" });
      }
    }
  },
);

// ─── GET /template-studio/templates/:id/versions ─────────────────────────────

router.get(
  "/template-studio/templates/:id/versions",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const tmpl = await getTemplateOrFail(routeParam(req.params.id), res);
    if (!tmpl) return;

    const versions = await db
      .select({
        id:                templateDefinitionVersionsTable.id,
        version:           templateDefinitionVersionsTable.version,
        changeDescription: templateDefinitionVersionsTable.changeDescription,
        createdBy:         templateDefinitionVersionsTable.createdBy,
        createdAt:         templateDefinitionVersionsTable.createdAt,
        authorName:        usersTable.name,
      })
      .from(templateDefinitionVersionsTable)
      .leftJoin(usersTable, eq(templateDefinitionVersionsTable.createdBy, usersTable.id))
      .where(eq(templateDefinitionVersionsTable.templateId, tmpl.id))
      .orderBy(desc(templateDefinitionVersionsTable.version));

    res.json({ data: versions });
  },
);

// ─── GET /template-studio/templates/:id/versions/:vid ────────────────────────

router.get(
  "/template-studio/templates/:id/versions/:vid",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const [version] = await db
      .select()
      .from(templateDefinitionVersionsTable)
      .where(
        and(
          eq(templateDefinitionVersionsTable.templateId, routeParam(req.params.id)),
          eq(templateDefinitionVersionsTable.id, routeParam(req.params.vid)),
        ),
      );
    if (!version) { res.status(404).json({ error: "Version introuvable" }); return; }
    res.json({ data: { ...version, snapshot: safeJson(version.snapshot, {}) } });
  },
);

// ─── POST /template-studio/templates/:id/versions/:vid/restore ───────────────

router.post(
  "/template-studio/templates/:id/versions/:vid/restore",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const tmpl = await getTemplateOrFail(routeParam(req.params.id), res);
    if (!tmpl) return;

    const [version] = await db
      .select()
      .from(templateDefinitionVersionsTable)
      .where(
        and(
          eq(templateDefinitionVersionsTable.templateId, tmpl.id),
          eq(templateDefinitionVersionsTable.id, routeParam(req.params.vid)),
        ),
      );
    if (!version) { res.status(404).json({ error: "Version introuvable" }); return; }

    const snap = safeJson(version.snapshot, {}) as Record<string, unknown>;
    const newVersion = (tmpl.currentVersion ?? 1) + 1;

    const [updated] = await db
      .update(templateDefinitionsTable)
      .set({
        ...(snap.name        ? { name:        JSON.stringify(snap.name) } : {}),
        ...(snap.description ? { description: JSON.stringify(snap.description) } : {}),
        ...(snap.variables   ? { variables:   JSON.stringify(snap.variables) } : {}),
        ...(snap.sections    ? { sections:    JSON.stringify(snap.sections) } : {}),
        ...(snap.layoutConfig ? { layoutConfig: JSON.stringify(snap.layoutConfig) } : {}),
        ...(snap.languages   ? { languages:   JSON.stringify(snap.languages) } : {}),
        currentVersion: newVersion,
        updatedAt: new Date(),
        updatedBy: req.user!.userId,
      } as any)
      .where(eq(templateDefinitionsTable.id, tmpl.id))
      .returning();

    await db.insert(templateDefinitionVersionsTable).values({
      templateId:        tmpl.id,
      version:           newVersion,
      snapshot:          version.snapshot,
      changeDescription: `Restauré depuis v${version.version}`,
      createdBy:         req.user!.userId,
    } as any);

    await serverAuditLog(req, {
      action: "template_version_restored",
      entity: "template_definition_version",
      entityId: tmpl.id,
      details: JSON.stringify({ restoredFromVersion: version.version, newVersion }),
    });

    res.json({ data: updated });
  },
);

// ─── GET /template-studio/templates/:id/permissions ──────────────────────────

router.get(
  "/template-studio/templates/:id/permissions",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const perms = await db
      .select()
      .from(templateDefinitionPermissionsTable)
      .where(eq(templateDefinitionPermissionsTable.templateId, routeParam(req.params.id)));
    res.json({ data: perms });
  },
);

// ─── PUT /template-studio/templates/:id/permissions ──────────────────────────

router.put(
  "/template-studio/templates/:id/permissions",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const tmpl = await getTemplateOrFail(routeParam(req.params.id), res);
    if (!tmpl) return;

    const result = permissionsSchema.safeParse(req.body.permissions);
    if (!result.success) { res.status(400).json({ error: result.error.issues }); return; }

    // Replace all permissions for this template
    await db
      .delete(templateDefinitionPermissionsTable)
      .where(eq(templateDefinitionPermissionsTable.templateId, tmpl.id));

    if (result.data.length > 0) {
      await db.insert(templateDefinitionPermissionsTable).values(
        result.data.map((p) => ({
          templateId: tmpl.id,
          role:       p.role,
          canUse:     p.canUse,
          canEdit:    p.canEdit,
          canPublish: p.canPublish,
        }) as any),
      );
    }

    const perms = await db
      .select()
      .from(templateDefinitionPermissionsTable)
      .where(eq(templateDefinitionPermissionsTable.templateId, tmpl.id));

    res.json({ data: perms });
  },
);

// ─── GET /verify/:token — Public QR verification page ────────────────────────
// No auth required — accessible to anyone who scans a document's QR code.

router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const [doc] = await db
      .select({
        id:              documentsTable.id,
        title:           documentsTable.title,
        category:        documentsTable.category,
        status:          documentsTable.status,
        documentNumber:  documentsTable.documentNumber,
        templateId:      documentsTable.templateId,
        createdAt:       documentsTable.createdAt,
        publishedAt:     documentsTable.publishedAt,
        expiresAt:       documentsTable.expiresAt,
        isDeleted:       documentsTable.isDeleted,
        signedAt:        documentsTable.signedAt,
        rejectedAt:      documentsTable.rejectedAt,
        verificationToken: documentsTable.verificationToken,
      })
      .from(documentsTable)
      .where(eq(documentsTable.verificationToken, token));

    const now = new Date();
    let verificationStatus: string;
    let statusColor: string;
    let statusIcon: string;

    if (!doc || doc.isDeleted) {
      verificationStatus = "ANNULÉ";
      statusColor = "#dc2626";
      statusIcon = "✗";
    } else if (doc.rejectedAt) {
      verificationStatus = "REJETÉ";
      statusColor = "#dc2626";
      statusIcon = "✗";
    } else if (doc.expiresAt && new Date(doc.expiresAt) < now) {
      verificationStatus = "EXPIRÉ";
      statusColor = "#f59e0b";
      statusIcon = "⚠";
    } else if (doc.status === "archived") {
      verificationStatus = "ARCHIVÉ";
      statusColor = "#6b7280";
      statusIcon = "📦";
    } else if (doc.signedAt) {
      verificationStatus = "SIGNÉ & VALIDE";
      statusColor = "#16a34a";
      statusIcon = "✓";
    } else if (doc.status === "published") {
      verificationStatus = "VALIDE";
      statusColor = "#16a34a";
      statusIcon = "✓";
    } else if (doc.status === "generated" || doc.status === "draft") {
      verificationStatus = "EN ATTENTE DE SIGNATURE";
      statusColor = "#f59e0b";
      statusIcon = "⏳";
    } else {
      verificationStatus = "INCONNU";
      statusColor = "#6b7280";
      statusIcon = "?";
    }

    const categoryLabels: Record<string, string> = {
      pv: "Procès-verbal", attestation: "Attestation", juridique: "Document juridique",
      reglements: "Règlement", finances: "Document financier", statuts: "Statuts",
      meeting_minutes: "Procès-verbal", financial: "Financier", legal: "Juridique",
    };

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vérification de document — MIZAN</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1); border-radius: 24px;
            max-width: 480px; width: 100%; padding: 40px 36px; color: #fff; }
    .logo { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
    .logo-mark { width: 44px; height: 44px; background: linear-gradient(135deg, #2563EB, #4f46e5);
                 border-radius: 12px; display: flex; align-items: center; justify-content: center;
                 font-size: 22px; font-weight: 900; }
    .logo-text { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; }
    .logo-sub { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 1px; }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px;
                    border-radius: 100px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;
                    background: ${statusColor}22; border: 1.5px solid ${statusColor}66;
                    color: ${statusColor}; margin-bottom: 28px; }
    .doc-title { font-size: 22px; font-weight: 700; line-height: 1.3; margin-bottom: 8px; }
    .doc-ref { font-size: 13px; color: rgba(255,255,255,0.5); font-family: monospace; margin-bottom: 28px; }
    .fields { display: grid; gap: 1px; border-radius: 16px; overflow: hidden; background: rgba(255,255,255,0.05); margin-bottom: 28px; }
    .field { display: flex; justify-content: space-between; align-items: flex-start;
             padding: 14px 18px; background: rgba(255,255,255,0.03); gap: 16px; }
    .field-label { font-size: 12px; color: rgba(255,255,255,0.45); text-transform: uppercase;
                   letter-spacing: 0.5px; white-space: nowrap; padding-top: 1px; }
    .field-value { font-size: 13px; color: #e2e8f0; font-weight: 500; text-align: right; }
    .footer { font-size: 11px; color: rgba(255,255,255,0.3); text-align: center; line-height: 1.7; }
    .footer a { color: rgba(255,255,255,0.5); }
    .not-found { text-align: center; }
    .not-found .icon { font-size: 56px; margin-bottom: 20px; }
    .not-found h2 { font-size: 20px; margin-bottom: 10px; }
    .not-found p { font-size: 14px; color: rgba(255,255,255,0.5); line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-mark">S</div>
      <div>
        <div class="logo-text">MIZAN</div>
        <div class="logo-sub">Vérification de document officiel</div>
      </div>
    </div>
    ${!doc || doc.isDeleted ? `
    <div class="not-found">
      <div class="icon">🔍</div>
      <h2>Document introuvable</h2>
      <p>Le jeton de vérification fourni ne correspond à aucun document enregistré dans notre système ou le document a été supprimé.</p>
    </div>
    ` : `
    <div class="status-badge">${statusIcon} ${verificationStatus}</div>
    <div class="doc-title">${escapeHtml(doc.title ?? "Document officiel")}</div>
    <div class="doc-ref">Réf : ${escapeHtml(doc.documentNumber ?? token.slice(0, 8).toUpperCase())}</div>
    <div class="fields">
      <div class="field">
        <span class="field-label">Type</span>
        <span class="field-value">${escapeHtml(categoryLabels[doc.category ?? ""] ?? doc.category ?? "—")}</span>
      </div>
      <div class="field">
        <span class="field-label">Statut</span>
        <span class="field-value">${escapeHtml(doc.status ?? "—")}</span>
      </div>
      <div class="field">
        <span class="field-label">Créé le</span>
        <span class="field-value">${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("fr-MA", { dateStyle: "long" }) : "—"}</span>
      </div>
      ${doc.signedAt ? `<div class="field">
        <span class="field-label">Signé le</span>
        <span class="field-value">${new Date(doc.signedAt).toLocaleDateString("fr-MA", { dateStyle: "long" })}</span>
      </div>` : ""}
      ${doc.expiresAt ? `<div class="field">
        <span class="field-label">Expire le</span>
        <span class="field-value">${new Date(doc.expiresAt).toLocaleDateString("fr-MA", { dateStyle: "long" })}</span>
      </div>` : ""}
    </div>
    `}
    <div class="footer">
      Ce service de vérification est fourni par la plateforme MIZAN.<br>
      Pour toute question : <a href="mailto:support@mizan.ma">support@mizan.ma</a>
    </div>
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  } catch (err) {
    res.status(500).send("<h1>Erreur serveur</h1>");
  }
});

// ─── Template Requests ────────────────────────────────────────────────────────
// Workflow: syndicate_admin submits → super_admin reviews → approved/rejected.

const REQUEST_CATEGORIES = [
  "meeting_minutes", "financial", "legal", "elections", "contracts",
  "certificates", "regulations", "administrative", "maintenance", "insurance",
] as const;

const requestCreateSchema = z.object({
  title:           z.string().min(3),
  category:        z.enum(REQUEST_CATEGORIES),
  description:     z.string().optional(),
  businessPurpose: z.string().optional(),
  requiredFields:  z.string().optional(), // JSON array of {name, type, required}
  legalNotes:      z.string().optional(),
  priority:        z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  publishScope:    z.enum(["global", "private"]).default("private"),
});

const requestReviewSchema = z.object({
  status:           z.enum(["pending", "in_review", "approved", "rejected", "need_more_info"]),
  reviewNotes:      z.string().optional(),
  rejectionReason:  z.string().optional(),
});

// GET /template-studio/requests — super_admin sees all, syndicate_admin sees own
router.get(
  "/template-studio/requests",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    try {
      const user = req.user!;
      const isSuperAdmin = user.role === "super_admin";

      const rows = await db
        .select({
          id:               templateRequestsTable.id,
          title:            templateRequestsTable.title,
          category:         templateRequestsTable.category,
          description:      templateRequestsTable.description,
          businessPurpose:  templateRequestsTable.businessPurpose,
          requiredFields:   templateRequestsTable.requiredFields,
          legalNotes:       templateRequestsTable.legalNotes,
          status:           templateRequestsTable.status,
          priority:         templateRequestsTable.priority,
          publishScope:     templateRequestsTable.publishScope,
          reviewNotes:      templateRequestsTable.reviewNotes,
          rejectionReason:  templateRequestsTable.rejectionReason,
          reviewedAt:       templateRequestsTable.reviewedAt,
          createdAt:        templateRequestsTable.createdAt,
          updatedAt:        templateRequestsTable.updatedAt,
          requestedBy:      templateRequestsTable.requestedBy,
          syndicateId:      templateRequestsTable.syndicateId,
          requesterName:    usersTable.name,
          syndicateName:    syndicatesTable.name,
        })
        .from(templateRequestsTable)
        .leftJoin(usersTable,     eq(templateRequestsTable.requestedBy, usersTable.id))
        .leftJoin(syndicatesTable, eq(templateRequestsTable.syndicateId, syndicatesTable.id))
        .where(
          isSuperAdmin
            ? undefined
            : eq(templateRequestsTable.syndicateId, user.syndicateId ?? "")
        )
        .orderBy(desc(templateRequestsTable.createdAt));

      res.json({ data: rows });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// POST /template-studio/requests — syndicate admin submits a new request
router.post(
  "/template-studio/requests",
  requireAuth,
  requireRole("syndicate_admin"),
  async (req, res) => {
    if (!req.user!.syndicateId) {
      res.status(403).json({ error: "Syndicat introuvable dans votre compte" }); return;
    }
    const parsed = requestCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() }); return;
    }
    try {
      const [row] = await db
        .insert(templateRequestsTable)
        .values({
          ...parsed.data,
          requestedBy: req.user!.userId,
          syndicateId: req.user!.syndicateId,
          status: "pending",
        } as any)
        .returning();
      res.status(201).json({ data: row, message: "Demande soumise avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// PUT /template-studio/requests/:id — super admin reviews (status change + notes)
router.put(
  "/template-studio/requests/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const parsed = requestReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", details: parsed.error.flatten() }); return;
    }
    try {
      const [updated] = await db
        .update(templateRequestsTable)
        .set({
          status:          parsed.data.status,
          reviewNotes:     parsed.data.reviewNotes    ?? null,
          rejectionReason: parsed.data.rejectionReason ?? null,
          reviewedBy:      req.user!.userId,
          reviewedAt:      new Date(),
          updatedAt:       new Date(),
        })
        .where(eq(templateRequestsTable.id, routeParam(req.params.id)))
        .returning();
      if (!updated) { res.status(404).json({ error: "Demande introuvable" }); return; }
      res.json({ data: updated, message: "Demande mise à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJson(val: unknown, fallback?: unknown) {
  if (!val) return fallback ?? null;
  if (typeof val !== "string") return val;
  try { return JSON.parse(val); } catch { return fallback ?? null; }
}

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export default router;
