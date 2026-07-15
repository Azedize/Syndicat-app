/**
 * routes/documents.ts
 *
 * Document module — Enterprise-grade implementation:
 *  • RBAC with syndicate isolation
 *  • Soft delete with legal retention (is_deleted / deleted_at / deleted_by)
 *  • Full syndicate branding in PDF generation
 *  • Direct templateId override in POST body
 *  • Workflow state machine: draft → generated → pending_review → validated → signed → published → archived
 *  • Signed download URL (1h TTL)
 *  • Multi-signature tracking
 *  • Push + alert notifications on key lifecycle events
 *  • Full audit trail on every write
 */
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  documentsTable,
  documentSignaturesTable,
  documentCommentsTable,
  documentSequencesTable,
  documentVersionsTable,
  syndicatesTable,
  usersTable,
  buildingsTable,
  lotsTable,
  conseilSyndicalTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import {
  generateAndUploadDocument,
  signDocumentDownloadUrl,
  deleteDocumentFromGcs,
  appendSignaturesToPdf,
  roleLabel,
  CATEGORY_TO_TEMPLATE,
  TEMPLATE_NUMBER_PREFIX,
  type DocumentTemplate,
  type DocumentLanguage,
  type SyndicateInfo,
  type PropertyInfo,
  type OfficeHolders,
} from "../lib/documentPdf.js";
import { createAlert, sendEmail, sendEmailToMany } from "../lib/notify.js";
import { computeRetentionUntil, expiryBucket } from "../lib/retention.js";

const router = Router();

// ─── Workflow state machine ────────────────────────────────────────────────────
// "rejected" and "expired" added on top of the original 7-state machine.
// Spec's "Approved" state maps onto the pre-existing "validated" status —
// kept as-is (not renamed) to avoid breaking existing consumers; approvedAt/
// approvedBy are populated whenever a document transitions into "validated".

const VALID_STATUSES = ["draft", "generated", "pending_review", "validated", "signed", "published", "archived", "rejected", "expired"] as const;
type DocStatus = typeof VALID_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft:          ["generated", "pending_review", "published"],
  generated:      ["pending_review", "validated", "rejected"],
  pending_review: ["generated", "validated", "draft", "rejected"],
  validated:      ["signed", "published", "rejected"],
  signed:         ["published", "expired"],
  published:      ["archived", "expired"],
  archived:       [],
  rejected:       ["draft", "pending_review"],
  expired:        ["archived"],
};

function isTransitionAllowed(from: DocStatus, to: DocStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Builds the real, environment-portable public verification URL for a document's
 * QR code and footer note — read from $REPLIT_DOMAINS at runtime (never a
 * hardcoded domain). Falls back to PUBLIC_APP_URL if explicitly configured, and
 * to undefined (caller then falls back to a bare documentNumber QR) if neither
 * is available, e.g. in an environment with no public domain at all.
 */
function buildVerifyUrl(token: string): string | undefined {
  const base = process.env.PUBLIC_APP_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : undefined);
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/api/documents/verify/${token}`;
}

// ─── Helper: fetch full syndicate branding for PDF ────────────────────────────

async function getSyndicateInfo(syndicateId?: string | null): Promise<SyndicateInfo> {
  const defaults: SyndicateInfo = {
    name: "SYNDYCAT",
    address: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    registrationNumber: "",
    logoColor: "#7c3aed",
    logoUrl: null,
    abbreviation: null,
  };
  if (!syndicateId) return defaults;

  const [s] = await db
    .select({
      name:               syndicatesTable.name,
      address:            syndicatesTable.address,
      city:               syndicatesTable.city,
      phone:              syndicatesTable.phone,
      email:              syndicatesTable.email,
      website:            syndicatesTable.website,
      registrationNumber: syndicatesTable.registrationNumber,
      logoColor:          syndicatesTable.logoColor,
      logoUrl:            syndicatesTable.logoUrl,
      abbreviation:       syndicatesTable.abbreviation,
    })
    .from(syndicatesTable)
    .where(eq(syndicatesTable.id, syndicateId));

  return {
    name:               s?.name               ?? defaults.name,
    address:            s?.address            ?? defaults.address,
    city:               s?.city               ?? defaults.city,
    phone:              s?.phone              ?? defaults.phone,
    email:              s?.email              ?? defaults.email,
    website:            s?.website            ?? defaults.website,
    registrationNumber: s?.registrationNumber ?? defaults.registrationNumber,
    logoColor:          s?.logoColor          ?? defaults.logoColor,
    logoUrl:            s?.logoUrl            ?? defaults.logoUrl,
    abbreviation:       s?.abbreviation       ?? defaults.abbreviation,
  };
}

// ─── Helper: fetch real property/residence data for PDF injection ────────────
// Pulls the syndicate's building(s) + lots to populate {{property.*}} variables
// (name, address, city, totalBuildings, totalFloors, totalLots, totalSurfaceM2,
// landRegistryReference). When buildingId is given, scopes to that building only;
// otherwise aggregates across all buildings of the syndicate.

async function getPropertyInfo(syndicateId?: string | null, buildingId?: string | null): Promise<PropertyInfo | undefined> {
  if (!syndicateId && !buildingId) return undefined;

  const buildingConditions = buildingId
    ? [eq(buildingsTable.id, buildingId)]
    : syndicateId
    ? [eq(buildingsTable.syndicateId, syndicateId)]
    : [];
  if (buildingConditions.length === 0) return undefined;

  const buildings = await db
    .select({
      id: buildingsTable.id,
      name: buildingsTable.name,
      address: buildingsTable.address,
      city: buildingsTable.city,
      totalFloors: buildingsTable.totalFloors,
      totalLots: buildingsTable.totalLots,
      registrationNumber: buildingsTable.registrationNumber,
      createdAt: buildingsTable.createdAt,
    })
    .from(buildingsTable)
    .where(and(...buildingConditions));

  if (buildings.length === 0) return undefined;

  const buildingIds = buildings.map((b) => b.id);
  const lots = buildingIds.length
    ? await db
        .select({ surfaceM2: lotsTable.surfaceM2, titreFoncier: lotsTable.titreFoncier })
        .from(lotsTable)
        .where(inArray(lotsTable.buildingId, buildingIds))
    : [];

  const totalSurfaceM2 = lots.reduce((sum, l) => sum + (l.surfaceM2 ? Number(l.surfaceM2) : 0), 0);
  const landRegistryReference = lots.find((l) => l.titreFoncier)?.titreFoncier ?? buildings[0].registrationNumber ?? null;

  const primary = buildings[0];
  return {
    name: buildings.length > 1 ? (primary.name ?? "") : (primary.name ?? ""),
    address: primary.address ?? "",
    city: primary.city ?? "",
    totalBuildings: buildings.length,
    totalFloors: buildings.reduce((sum, b) => sum + (b.totalFloors ?? 0), 0),
    totalLots: buildings.reduce((sum, b) => sum + (b.totalLots ?? 0), 0),
    totalSurfaceM2: totalSurfaceM2 > 0 ? totalSurfaceM2 : null,
    landRegistryReference,
    createdAt: primary.createdAt ? primary.createdAt.toISOString() : null,
  };
}

// ─── Helper: fetch real office-holder identities for PDF injection ───────────
// Pulls active conseil syndical members (président, vice-président, secrétaire,
// trésorier) plus the syndicate_admin acting as gestionnaire, for
// {{president.fullName}}, {{manager.phone}}, etc.

async function getOfficeHolders(syndicateId?: string | null): Promise<OfficeHolders | undefined> {
  if (!syndicateId) return undefined;

  const [council, [manager]] = await Promise.all([
    db
      .select({ role: conseilSyndicalTable.role, name: conseilSyndicalTable.name, email: conseilSyndicalTable.email, phone: conseilSyndicalTable.phone })
      .from(conseilSyndicalTable)
      .where(and(eq(conseilSyndicalTable.syndicateId, syndicateId), eq(conseilSyndicalTable.status, "active"))),
    db
      .select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
      .from(usersTable)
      .where(and(eq(usersTable.syndicateId, syndicateId), eq(usersTable.role, "syndicate_admin")))
      .limit(1),
  ]);

  const byRole = (role: string) => {
    const row = council.find((c) => c.role === role);
    return row ? { fullName: row.name, email: row.email ?? null, phone: row.phone ?? null } : undefined;
  };

  const holders: OfficeHolders = {
    president: byRole("president"),
    vicePresident: byRole("vice_president"),
    secretary: byRole("secretary"),
    treasurer: byRole("treasurer"),
    manager: manager ? { fullName: manager.name, email: manager.email ?? null, phone: manager.phone ?? null } : undefined,
  };
  return Object.values(holders).some(Boolean) ? holders : undefined;
}

// ─── Helper: atomic sequential document numbering (REG-2026-0001, PV-2026-0001…) ──
// One counter row per (syndicateId, prefix, year); increments atomically via
// INSERT ... ON CONFLICT DO UPDATE so concurrent generations never collide.

async function generateSequentialDocumentNumber(syndicateId: string | null | undefined, template: DocumentTemplate): Promise<string> {
  const prefix = TEMPLATE_NUMBER_PREFIX[template] ?? template.toUpperCase();
  const year = new Date().getFullYear();
  const scopeId = syndicateId || "global";

  const [row] = await db
    .insert(documentSequencesTable)
    .values({ syndicateId: scopeId, prefix, year, currentValue: 1 } as any)
    .onConflictDoUpdate({
      target: [documentSequencesTable.syndicateId, documentSequencesTable.prefix, documentSequencesTable.year],
      set: { currentValue: sql`${documentSequencesTable.currentValue} + 1` },
    })
    .returning({ currentValue: documentSequencesTable.currentValue });

  return `${prefix}-${year}-${String(row.currentValue).padStart(4, "0")}`;
}

// ─── GET /documents ────────────────────────────────────────────────────────────

router.get("/documents", requireAuth, async (req, res) => {
  const { category, status } = req.query as Record<string, string>;
  try {
    const syndicateId = req.user!.syndicateId;
    const conditions: ReturnType<typeof eq>[] = [];

    // Never return soft-deleted documents to API consumers
    conditions.push(eq(documentsTable.isDeleted, false));

    if (req.user!.role !== "super_admin" || syndicateId) {
      if (syndicateId) conditions.push(eq(documentsTable.syndicateId, syndicateId));
    }
    if (category) conditions.push(eq(documentsTable.category, category as any));
    if (status)   conditions.push(eq(documentsTable.status, status));

    // Members and tenants only see published documents
    if (req.user!.role === "member" || req.user!.role === "tenant") {
      conditions.push(eq(documentsTable.status, "published"));
    }

    // Tenants are not co-owners — restrict to documents relevant to their lease only
    if (req.user!.role === "tenant") {
      conditions.push(
        sql`${documentsTable.category} IN ('bail', 'reglement', 'reglement_interieur')`,
      );
    }

    const rows = await db
      .select()
      .from(documentsTable)
      .where(and(...conditions))
      .orderBy(desc(documentsTable.createdAt));

    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/deleted — RECYCLE BIN ─────────────────────────────────────
// Lists soft-deleted documents (super_admin / syndicate_admin only), with
// search + category filter. Registered before "/:id" so it isn't shadowed.

router.get(
  "/documents/deleted",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const { search, category } = req.query as Record<string, string>;
    try {
      const conditions = [eq(documentsTable.isDeleted, true)];
      const syndicateId = req.user!.syndicateId;
      if (req.user!.role !== "super_admin") {
        if (!syndicateId) { res.status(403).json({ error: "Accès refusé : syndicateId manquant" }); return; }
        conditions.push(eq(documentsTable.syndicateId, syndicateId));
      } else if (syndicateId) {
        conditions.push(eq(documentsTable.syndicateId, syndicateId));
      }
      if (category) conditions.push(eq(documentsTable.category, category as any));
      if (search) conditions.push(sql`${documentsTable.title} ILIKE ${"%" + search + "%"}`);

      const rows = await db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          category: documentsTable.category,
          status: documentsTable.status,
          size: documentsTable.size,
          documentNumber: documentsTable.documentNumber,
          deletedAt: documentsTable.deletedAt,
          deletedBy: documentsTable.deletedBy,
          deletedByName: usersTable.name,
          retentionUntil: documentsTable.retentionUntil,
        })
        .from(documentsTable)
        .leftJoin(usersTable, eq(documentsTable.deletedBy, usersTable.id))
        .where(and(...conditions))
        .orderBy(desc(documentsTable.deletedAt));

      res.json({ data: rows });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /documents/summary — dashboard aggregate ─────────────────────────────
// Real backend-computed counts by status + expiring-soon buckets (30/60/90 days),
// replacing the client-side heuristic previously used by the mobile dashboard.

router.get("/documents/summary", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    const conditions = [eq(documentsTable.isDeleted, false)];
    if (syndicateId) conditions.push(eq(documentsTable.syndicateId, syndicateId));
    if (req.user!.role === "member" || req.user!.role === "tenant") {
      conditions.push(eq(documentsTable.status, "published"));
    }

    const rows = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        status: documentsTable.status,
        retentionUntil: documentsTable.retentionUntil,
      })
      .from(documentsTable)
      .where(and(...conditions));

    const byStatus: Record<string, number> = {};
    const expiring: { in30: typeof rows; in60: typeof rows; in90: typeof rows } = { in30: [], in60: [], in90: [] };
    const now = new Date();

    for (const row of rows) {
      const st = row.status ?? "draft";
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      const bucket = expiryBucket(row.retentionUntil, now);
      if (bucket === 30) expiring.in30.push(row);
      else if (bucket === 60) expiring.in60.push(row);
      else if (bucket === 90) expiring.in90.push(row);
    }

    res.json({
      data: {
        total: rows.length,
        byStatus,
        expiring: {
          in30: expiring.in30.length,
          in60: expiring.in60.length,
          in90: expiring.in90.length,
          documents30: expiring.in30.slice(0, 10),
        },
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/verify/:token — PUBLIC QR verification endpoint ──────────
// No auth required — this is the destination of the QR code printed on every
// generated PDF. Registered before "/documents/:id" so "verify" is never
// swallowed by the :id param (see memory: express route order shadowing).
// Never leaks document content — only the minimal authenticity signal a
// verifier needs: title, reference, status, syndicate name, and signature list.

router.get("/documents/verify/:token", async (req, res) => {
  const token = String(req.params.token);
  try {
    const [doc] = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        documentNumber: documentsTable.documentNumber,
        status: documentsTable.status,
        isDeleted: documentsTable.isDeleted,
        expiresAt: documentsTable.expiresAt,
        supersededByDocumentId: documentsTable.supersededByDocumentId,
        syndicateId: documentsTable.syndicateId,
        createdAt: documentsTable.createdAt,
        rejectionReason: documentsTable.rejectionReason,
      })
      .from(documentsTable)
      .where(eq(documentsTable.verificationToken, token));

    if (!doc) {
      if (req.accepts(["html", "json"]) === "html") {
        res.status(404).send("<html><body><h1>Document introuvable</h1><p>Ce code de vérification ne correspond à aucun document connu.</p></body></html>");
      } else {
        res.status(404).json({ error: "Document introuvable", verified: false });
      }
      return;
    }

    const now = new Date();
    let verificationStatus: "valid" | "pending" | "revoked" | "expired" | "replaced";
    if (doc.isDeleted || doc.status === "rejected") verificationStatus = "revoked";
    else if (doc.status === "expired" || (doc.expiresAt && doc.expiresAt < now)) verificationStatus = "expired";
    else if (doc.supersededByDocumentId) verificationStatus = "replaced";
    else if (doc.status === "signed" || doc.status === "published" || doc.status === "archived") verificationStatus = "valid";
    else verificationStatus = "pending";

    const [syndInfo] = await db.select({ name: syndicatesTable.name }).from(syndicatesTable).where(eq(syndicatesTable.id, doc.syndicateId ?? ""));
    const sigs = await db
      .select({ signerName: documentSignaturesTable.signerName, signerRole: documentSignaturesTable.signerRole, signedAt: documentSignaturesTable.signedAt, isValid: documentSignaturesTable.isValid })
      .from(documentSignaturesTable)
      .where(eq(documentSignaturesTable.documentId, doc.id))
      .orderBy(documentSignaturesTable.signatureOrder);

    const payload = {
      verified: verificationStatus === "valid",
      status: verificationStatus,
      title: doc.title,
      documentNumber: doc.documentNumber,
      issuedBy: syndInfo?.name ?? null,
      issuedAt: doc.createdAt,
      rejectionReason: verificationStatus === "revoked" ? doc.rejectionReason : undefined,
      signatures: sigs.map((s) => ({ signerName: s.signerName, signerRole: s.signerRole, signedAt: s.signedAt, isValid: s.isValid })),
    };

    if (req.accepts(["html", "json"]) === "html") {
      const statusLabel: Record<typeof verificationStatus, string> = {
        valid: "✅ Document authentique et valide",
        pending: "⏳ Document en attente de validation finale",
        revoked: "❌ Document révoqué ou rejeté",
        expired: "⚠️ Document expiré",
        replaced: "🔄 Document remplacé par une version plus récente",
      };
      res.status(200).send(`<html><head><meta charset="utf-8"><title>Vérification de document</title></head><body style="font-family:sans-serif;max-width:480px;margin:40px auto;">
        <h2>${statusLabel[verificationStatus]}</h2>
        <p><strong>${payload.title}</strong></p>
        <p>Réf. : ${payload.documentNumber}</p>
        <p>Émis par : ${payload.issuedBy ?? "N/A"}</p>
        ${payload.signatures.length ? `<p>Signatures : ${payload.signatures.map((s) => `${s.signerName} (${s.isValid ? "valide" : "invalidée"})`).join(", ")}</p>` : ""}
      </body></html>`);
    } else {
      res.json(payload);
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur", verified: false });
  }
});

// ─── GET /documents/:id ────────────────────────────────────────────────────────

router.get("/documents/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc || doc.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
    if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    if ((req.user!.role === "member" || req.user!.role === "tenant") && doc.status !== "published") {
      res.status(403).json({ error: "Document non publié" }); return;
    }
    res.json({ data: doc });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/:id/download-url ──────────────────────────────────────────

router.get("/documents/:id/download-url", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc || doc.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
    if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    if ((req.user!.role === "member" || req.user!.role === "tenant") && doc.status !== "published") {
      res.status(403).json({ error: "Document non publié" }); return;
    }
    if (!doc.fileUrl) {
      res.status(404).json({ error: "Aucun fichier PDF généré pour ce document" }); return;
    }
    const url = await signDocumentDownloadUrl(doc.fileUrl, 3600);
    await serverAuditLog(req, { action: "DOCUMENT_DOWNLOAD", entity: "document", entityId: id, details: doc.title });
    res.json({ url, expiresIn: 3600, filename: `${doc.documentNumber ?? doc.id}.pdf` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur lors de la génération du lien de téléchargement" });
  }
});

// ─── POST /documents ───────────────────────────────────────────────────────────

router.post(
  "/documents",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    if (req.user!.role === "syndicate_admin" && !req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé : syndicateId manquant dans le jeton" }); return;
    }
    const schema = z.object({
      title:      z.string().min(1).max(500),
      category:   z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]),
      content:    z.string().max(500_000).optional(),
      memberName: z.string().optional(),
      // Scopes {{property.*}} injection to a specific residence; otherwise
      // aggregates across all buildings of the syndicate.
      buildingId: z.string().optional(),
      // Optional direct template override — bypasses CATEGORY_TO_TEMPLATE lookup
      templateId: z.enum([
        "attestation", "pv", "convocation", "contrat", "rapport",
        "decision", "certificat", "circulaire", "mise_en_demeure", "reglement",
      ] as const).optional(),
      // Output language — the mobile UI always presents an explicit choice; "fr" is
      // only used as a server-side fallback for callers that omit it entirely.
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
      // Business expiration date (distinct from legal retentionUntil) — e.g. a
      // contract/mandate/authorization validity end date. ISO date/datetime string.
      expiresAt: z.string().optional(),
      // Extra fields passed through to the template
      lieu:              z.string().optional(),
      meetingDate:       z.string().optional(),
      heure:             z.string().optional(),
      agendaText:        z.string().optional(),
      deliberationsText: z.string().optional(),
      resolutionsText:   z.string().optional(),
      periode:           z.string().optional(),
      organe:            z.string().optional(),
      objet:             z.string().optional(),
      delai:             z.string().optional(),
      priorite:          z.string().optional(),
      modeEnvoi:         z.string().optional(),
      preamble:          z.string().optional(),
      consequences:      z.string().optional(),
      activites:         z.string().optional(),
      indicateurs:       z.string().optional(),
      perspectives:      z.string().optional(),
      synthese:          z.string().optional(),
      president:         z.string().optional(),
      secretaire:        z.string().optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides", details: result.error.flatten() }); return;
    }

    try {
      const { title, category, content, memberName, templateId, buildingId, language, expiresAt, ...extraFields } = result.data;
      const syndicateId = req.user!.syndicateId || "";
      const docLanguage: DocumentLanguage = (language as DocumentLanguage) ?? "fr";

      // 1. Fetch full syndicate branding + real residence/office-holder data
      const [syndInfo, property, officeHolders] = await Promise.all([
        getSyndicateInfo(syndicateId),
        getPropertyInfo(syndicateId, buildingId),
        getOfficeHolders(syndicateId),
      ]);

      // 2. Determine template (direct override > category mapping > fallback)
      const template: DocumentTemplate = templateId ?? CATEGORY_TO_TEMPLATE[category] ?? "certificat";

      // 3. Mint a real sequential document number (REG-2026-0001, PV-2026-0001, …)
      const documentNumber = await generateSequentialDocumentNumber(syndicateId, template);

      // 3b. Mint the QR verification token + its real, environment-portable public URL
      const verificationToken = randomUUID();
      const verificationUrl = buildVerifyUrl(verificationToken);

      // 4. Generate PDF + upload to GCS
      const generated = await generateAndUploadDocument(template, {
        title,
        content,
        syndicate: syndInfo,
        property,
        officeHolders,
        memberName,
        documentNumber,
        docStatus: "generated",
        language: docLanguage,
        verificationUrl,
        ...extraFields,
      });

      // 5. Insert document record
      const createdAt = new Date();
      const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
      const [doc] = await db
        .insert(documentsTable)
        .values({
          title,
          category,
          content,
          status: "generated",
          syndicateId,
          size: generated.fileSizeKo,
          fileUrl: generated.fileUrl || null,
          documentNumber: generated.documentNumber,
          templateId: template,
          version: 1,
          isDeleted: false,
          createdBy: req.user!.userId,
          updatedAt: createdAt,
          language: docLanguage,
          verificationToken,
          expiresAt: parsedExpiresAt && !Number.isNaN(parsedExpiresAt.getTime()) ? parsedExpiresAt : null,
          // Legal retention — computed from category/template, see lib/retention.ts
          retentionUntil: computeRetentionUntil(category, template, createdAt),
        } as any)
        .returning();

      // 6. Audit log
      await serverAuditLog(req, {
        action: "DOCUMENT_GENERATED",
        entity: "document",
        entityId: doc.id,
        details: `Titre: ${doc.title}, Modèle: ${template}, Réf: ${doc.documentNumber}, Catégorie: ${doc.category}, Langue: ${docLanguage}`,
      });

      // 7. Push + email notification (fire-and-forget)
      if (syndicateId) {
        createAlert({
          title: "Nouveau document généré",
          message: `"${title}" a été généré dans la catégorie ${category}.`,
          type: "info",
          syndicateId,
          target: "admin",
        }).catch(() => {});

        db.select({ email: usersTable.email })
          .from(usersTable)
          .where(and(eq(usersTable.syndicateId, syndicateId), eq(usersTable.role, "syndicate_admin")))
          .then((admins) =>
            sendEmailToMany(
              admins.map((a) => a.email),
              "Nouveau document généré",
              `<p>Le document <strong>${title}</strong> (réf. ${doc.documentNumber}) vient d'être généré.</p>`,
              "document_created",
              syndicateId,
            ),
          )
          .catch(() => {});
      }

      res.status(201).json({ data: doc, message: "Document généré avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur lors de la génération du document" });
    }
  },
);

// ─── PUT /documents/:id ────────────────────────────────────────────────────────

router.put(
  "/documents/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      title:    z.string().min(1).max(500).optional(),
      category: z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]).optional(),
      content:  z.string().max(500_000).optional(),
      status:   z.enum(VALID_STATUSES).optional(),
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
      expiresAt: z.string().optional(),
      // Required when status is set to "rejected" — legal traceability of why.
      rejectionReason: z.string().min(1).max(2000).optional(),
      // Free-text audit note for the version snapshot (optional).
      changeReason: z.string().max(500).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }

    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      // Enforce workflow state machine
      if (result.data.status && result.data.status !== existing.status) {
        const from = (existing.status ?? "draft") as DocStatus;
        const to   = result.data.status as DocStatus;
        if (!isTransitionAllowed(from, to)) {
          res.status(422).json({
            error: `Transition invalide : "${from}" → "${to}"`,
            allowed: ALLOWED_TRANSITIONS[from],
          }); return;
        }
        if (to === "rejected" && !result.data.rejectionReason) {
          res.status(400).json({ error: "Un motif de rejet est requis" }); return;
        }
      }

      // Snapshot the pre-update state into version history BEFORE applying any
      // content/status change — never lost, even if this specific PUT fails partway.
      const { changeReason, rejectionReason, ...fieldUpdates } = result.data;
      const isMeaningfulChange = fieldUpdates.content !== undefined || fieldUpdates.title !== undefined || fieldUpdates.status !== undefined;
      if (isMeaningfulChange) {
        await db.insert(documentVersionsTable).values({
          documentId: id,
          versionNumber: existing.version ?? 1,
          title: existing.title,
          content: existing.content,
          status: existing.status,
          fileUrl: existing.fileUrl,
          language: existing.language,
          modifiedBy: req.user!.userId,
          changeReason: changeReason ?? (fieldUpdates.status ? `Transition ${existing.status} → ${fieldUpdates.status}` : "Modification du contenu"),
        } as any);
      }

      const updates: Record<string, unknown> = { ...fieldUpdates, updatedAt: new Date() };
      if (result.data.expiresAt !== undefined) {
        const parsed = new Date(result.data.expiresAt);
        updates.expiresAt = Number.isNaN(parsed.getTime()) ? null : parsed;
        updates.expiryNotifiedBucket = null; // reset reminder tracking if the date changed
      }
      if (result.data.content !== undefined) {
        updates.size = `${Math.round(result.data.content.length / 1024)}Ko`;
      }
      // Only increment version on content changes (not status-only changes)
      if (result.data.content !== undefined) {
        updates.version = sql`COALESCE(${documentsTable.version}, 1) + 1`;
      }
      // Lifecycle timestamps
      if (result.data.status === "published") updates.publishedAt = new Date();
      if (result.data.status === "archived")  updates.archivedAt  = new Date();
      if (result.data.status === "signed")    updates.signedAt    = new Date();
      if (result.data.status === "validated") {
        updates.approvedAt = new Date();
        updates.approvedBy = req.user!.userId;
      }
      if (result.data.status === "rejected") {
        updates.rejectedAt = new Date();
        updates.rejectedBy = req.user!.userId;
        updates.rejectionReason = rejectionReason;
      }

      const [doc] = await db
        .update(documentsTable)
        .set(updates)
        .where(eq(documentsTable.id, id))
        .returning();

      // A rejected document's existing signatures no longer certify anything valid.
      if (result.data.status === "rejected") {
        await db.update(documentSignaturesTable).set({ isValid: false } as any).where(eq(documentSignaturesTable.documentId, id));
      }

      await serverAuditLog(req, {
        action: "DOCUMENT_UPDATED",
        entity: "document",
        entityId: id,
        details: `Champs: ${Object.keys(result.data).join(", ")}, Version: ${doc.version}`,
      });

      // Notify members when published
      if (result.data.status === "published" && existing.syndicateId) {
        createAlert({
          title: "Nouveau document publié",
          message: `"${doc.title}" est maintenant disponible dans l'espace Documents.`,
          type: "success",
          syndicateId: existing.syndicateId,
          target: "all",
        }).catch(() => {});
      }

      // Approval / rejection email + in-app notifications to the document's author
      if ((result.data.status === "validated" || result.data.status === "rejected") && existing.createdBy) {
        const [author] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, existing.createdBy));
        const approved = result.data.status === "validated";
        createAlert({
          title: approved ? "Document approuvé" : "Document rejeté",
          message: approved
            ? `"${doc.title}" a été approuvé.`
            : `"${doc.title}" a été rejeté. Motif : ${rejectionReason}`,
          type: approved ? "success" : "error",
          syndicateId: existing.syndicateId,
          target: "admin",
        }).catch(() => {});
        if (author?.email) {
          sendEmail(
            author.email,
            approved ? "Votre document a été approuvé" : "Votre document a été rejeté",
            approved
              ? `<p>Le document <strong>${doc.title}</strong> a été approuvé.</p>`
              : `<p>Le document <strong>${doc.title}</strong> a été rejeté.</p><p>Motif : ${rejectionReason}</p>`,
            approved ? "document_approved" : "document_rejected",
            existing.syndicateId,
          ).catch(() => {});
        }
      }

      res.json({ data: doc, message: "Document mis à jour avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /documents/:id/versions — version history ────────────────────────────

router.get(
  "/documents/:id/versions",
  requireAuth,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [doc] = await db.select({ syndicateId: documentsTable.syndicateId }).from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const versions = await db
        .select({
          id: documentVersionsTable.id,
          versionNumber: documentVersionsTable.versionNumber,
          title: documentVersionsTable.title,
          status: documentVersionsTable.status,
          language: documentVersionsTable.language,
          modifiedBy: documentVersionsTable.modifiedBy,
          modifiedByName: usersTable.name,
          modifiedAt: documentVersionsTable.modifiedAt,
          changeReason: documentVersionsTable.changeReason,
        })
        .from(documentVersionsTable)
        .leftJoin(usersTable, eq(documentVersionsTable.modifiedBy, usersTable.id))
        .where(eq(documentVersionsTable.documentId, id))
        .orderBy(desc(documentVersionsTable.versionNumber));
      res.json({ data: versions });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/versions/:versionId/restore ──────────────────────────
// Restores a document's title/content/status/language from a past snapshot.
// The CURRENT state is itself snapshotted first, so a restore is never a
// one-way, irreversible action.

router.post(
  "/documents/:id/versions/:versionId/restore",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const versionId = String(req.params.versionId);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const [version] = await db.select().from(documentVersionsTable).where(and(eq(documentVersionsTable.id, versionId), eq(documentVersionsTable.documentId, id)));
      if (!version) { res.status(404).json({ error: "Version introuvable" }); return; }

      // Snapshot the current state before overwriting it, so restoring is reversible.
      await db.insert(documentVersionsTable).values({
        documentId: id,
        versionNumber: existing.version ?? 1,
        title: existing.title,
        content: existing.content,
        status: existing.status,
        fileUrl: existing.fileUrl,
        language: existing.language,
        modifiedBy: req.user!.userId,
        changeReason: `Snapshot automatique avant restauration de la version ${version.versionNumber}`,
      } as any);

      const [doc] = await db
        .update(documentsTable)
        .set({
          title: version.title,
          content: version.content,
          status: version.status ?? existing.status,
          language: version.language ?? existing.language,
          version: sql`COALESCE(${documentsTable.version}, 1) + 1`,
          updatedAt: new Date(),
        } as any)
        .where(eq(documentsTable.id, id))
        .returning();

      await serverAuditLog(req, {
        action: "DOCUMENT_VERSION_RESTORED",
        entity: "document",
        entityId: id,
        details: `Restauré depuis la version ${version.versionNumber}`,
      });

      res.json({ data: doc, message: "Version restaurée avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── DELETE /documents/:id — SOFT DELETE ─────────────────────────────────────
// Documents are never physically deleted for legal retention.
// super_admin can use /purge to permanently remove after legal retention period.

router.delete(
  "/documents/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) {
        res.status(404).json({ error: "Document introuvable" }); return;
      }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      // Soft delete — preserve PDF file, audit trail, and signatures
      await db
        .update(documentsTable)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.user!.userId,
          updatedAt: new Date(),
        } as any)
        .where(eq(documentsTable.id, id));

      await serverAuditLog(req, {
        action: "DOCUMENT_DELETED",
        entity: "document",
        entityId: id,
        details: `Titre: ${existing.title}, Catégorie: ${existing.category} — suppression logique`,
      });

      res.json({ message: "Document supprimé (conservé pour archivage légal)" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/restore ──────────────────────────────────────────────
// Restore a soft-deleted document (super_admin only).

router.post(
  "/documents/:id/restore",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (!existing.isDeleted) { res.status(409).json({ error: "Ce document n'est pas supprimé" }); return; }

      const [doc] = await db
        .update(documentsTable)
        .set({
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date(),
        } as any)
        .where(eq(documentsTable.id, id))
        .returning();

      await serverAuditLog(req, {
        action: "DOCUMENT_RESTORED",
        entity: "document",
        entityId: id,
        details: `Titre: ${existing.title} — restauré depuis la corbeille`,
      });

      res.json({ data: doc, message: "Document restauré avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/purge ────────────────────────────────────────────────
// Permanently delete a soft-deleted document (super_admin only, after retention).

router.post(
  "/documents/:id/purge",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (!existing.isDeleted) {
        res.status(409).json({ error: "Effectuez d'abord une suppression logique avant de purger" }); return;
      }

      // Delete PDF from GCS
      if (existing.fileUrl) {
        deleteDocumentFromGcs(existing.fileUrl).catch(() => {});
      }

      await db.delete(documentsTable).where(eq(documentsTable.id, id));

      await serverAuditLog(req, {
        action: "DOCUMENT_PURGED",
        entity: "document",
        entityId: id,
        details: `Titre: ${existing.title} — suppression permanente (purge)`,
      });

      res.json({ message: "Document définitivement supprimé" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/sign ──────────────────────────────────────────────────

router.post(
  "/documents/:id/sign",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      signatureData: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }

    try {
      const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc || doc.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      // Only generated or validated documents can be signed — NOT published
      const signable: DocStatus[] = ["generated", "validated"];
      if (!signable.includes((doc.status ?? "draft") as DocStatus)) {
        res.status(422).json({ error: `Le document au statut "${doc.status}" ne peut pas être signé` }); return;
      }

      // Prevent the same user signing the same document twice (also enforced by
      // a unique index at the DB level as defense-in-depth).
      const [alreadySigned] = await db
        .select({ id: documentSignaturesTable.id })
        .from(documentSignaturesTable)
        .where(and(eq(documentSignaturesTable.documentId, id), eq(documentSignaturesTable.signedBy, req.user!.userId)));
      if (alreadySigned) {
        res.status(409).json({ error: "Vous avez déjà signé ce document" }); return;
      }

      // Next signature order = count of existing signatures + 1
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(documentSignaturesTable)
        .where(eq(documentSignaturesTable.documentId, id));
      const nextOrder = (count ?? 0) + 1;

      const signerName = req.user!.name ?? req.user!.userId;
      const now = new Date();

      const [sig] = await db
        .insert(documentSignaturesTable)
        .values({
          documentId:    id,
          signedBy:      req.user!.userId,
          signerRole:    req.user!.role,
          signerName,
          syndicateId:   req.user!.syndicateId,
          ipAddress:     req.ip ?? req.socket?.remoteAddress,
          signatureData: result.data.signatureData,
          signatureOrder: nextOrder,
          isValid: true,
        } as any)
        .returning();

      await db.update(documentsTable).set({
        status:    "signed",
        signedAt:  now,
        signedBy:  req.user!.userId,
        updatedAt: now,
      } as any).where(eq(documentsTable.id, id));

      // Append the real signature (name/role/date/handwritten trace/validity) to
      // the PDF as an authoritative signature page — best-effort, never blocks
      // the already-durable DB signature record if PDF embedding fails.
      if (doc.fileUrl) {
        appendSignaturesToPdf(
          doc.fileUrl,
          [{
            signerName,
            signerRole: req.user!.role,
            signedAt: now,
            signatureSvg: result.data.signatureData,
            isValid: true,
          }],
          (doc.language as DocumentLanguage) ?? "fr",
        ).catch((err) => req.log.error({ err, docId: id }, "Signature PDF embed failed"));
      }

      await serverAuditLog(req, {
        action: "DOCUMENT_SIGNED",
        entity: "document",
        entityId: id,
        details: `Signataire: ${signerName}, Rôle: ${req.user!.role}`,
      });

      if (doc.syndicateId) {
        createAlert({
          title: "Document signé",
          message: `"${doc.title}" a été signé électroniquement par ${signerName}.`,
          type: "success",
          syndicateId: doc.syndicateId,
          target: "admin",
        }).catch(() => {});

        if (doc.createdBy && doc.createdBy !== req.user!.userId) {
          db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, doc.createdBy))
            .then(([author]) => {
              if (author?.email) {
                sendEmail(
                  author.email,
                  "Document signé",
                  `<p>Le document <strong>${doc.title}</strong> a été signé par ${roleLabel(req.user!.role, (doc.language as DocumentLanguage) ?? "fr")} ${signerName}.</p>`,
                  "document_signed",
                  doc.syndicateId,
                );
              }
            })
            .catch(() => {});
        }
      }

      res.status(201).json({ data: sig, message: "Document signé avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /documents/:id/signatures ────────────────────────────────────────────

router.get(
  "/documents/:id/signatures",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const sigs = await db
        .select()
        .from(documentSignaturesTable)
        .where(eq(documentSignaturesTable.documentId, id))
        .orderBy(desc(documentSignaturesTable.signedAt));
      res.json({ data: sigs });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Comments: GET /documents/:id/comments ───────────────────────────────────

router.get(
  "/:id/comments",
  requireAuth,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [doc] = await db.select({ id: documentsTable.id, syndicateId: documentsTable.syndicateId, status: documentsTable.status })
        .from(documentsTable)
        .where(and(eq(documentsTable.id, id), eq(documentsTable.isDeleted, false)));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }

      const user = req.user!;
      const isSuperAdmin = user.role === "super_admin";
      const isAdminOfSyndicate = (user.role === "syndicate_admin") && doc.syndicateId === user.syndicateId;
      const isMemberOfSyndicate = (user.role === "member") && doc.syndicateId === user.syndicateId;
      if (!isSuperAdmin && !isAdminOfSyndicate && !isMemberOfSyndicate) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      const comments = await db
        .select({
          id:        documentCommentsTable.id,
          content:   documentCommentsTable.content,
          parentId:  documentCommentsTable.parentId,
          isDeleted: documentCommentsTable.isDeleted,
          editedAt:  documentCommentsTable.editedAt,
          createdAt: documentCommentsTable.createdAt,
          authorId:  documentCommentsTable.authorId,
          authorName: usersTable.name,
          authorRole: usersTable.role,
        })
        .from(documentCommentsTable)
        .leftJoin(usersTable, eq(documentCommentsTable.authorId, usersTable.id))
        .where(eq(documentCommentsTable.documentId, id))
        .orderBy(documentCommentsTable.createdAt);

      res.json({ data: comments });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Comments: POST /documents/:id/comments ──────────────────────────────────

const CommentCreateSchema = z.object({
  content:  z.string().min(1).max(2000),
  parentId: z.string().optional(),
});

router.post(
  "/:id/comments",
  requireAuth,
  async (req, res) => {
    const id = String(req.params.id);
    const parsed = CommentCreateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    try {
      const [doc] = await db.select({ id: documentsTable.id, syndicateId: documentsTable.syndicateId })
        .from(documentsTable)
        .where(and(eq(documentsTable.id, id), eq(documentsTable.isDeleted, false)));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }

      const user = req.user!;
      const isSuperAdmin = user.role === "super_admin";
      const isAdminOfSyndicate = (user.role === "syndicate_admin") && doc.syndicateId === user.syndicateId;
      const isMemberOfSyndicate = (user.role === "member") && doc.syndicateId === user.syndicateId;
      if (!isSuperAdmin && !isAdminOfSyndicate && !isMemberOfSyndicate) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      const [comment] = await db.insert(documentCommentsTable).values({
        documentId: id,
        authorId:   user.userId,
        content:    parsed.data.content,
        parentId:   parsed.data.parentId ?? null,
      } as any).returning();

      serverAuditLog(req, { action: "document_comment_added", entity: "document", entityId: id, details: `commentId: ${comment.id}` });
      res.status(201).json({ data: comment });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Comments: DELETE /documents/:id/comments/:commentId ─────────────────────

router.delete(
  "/:id/comments/:commentId",
  requireAuth,
  async (req, res) => {
    const id = String(req.params.id);
    const commentId = String(req.params.commentId);
    try {
      const [comment] = await db.select().from(documentCommentsTable)
        .where(and(eq(documentCommentsTable.id, commentId), eq(documentCommentsTable.documentId, id)));
      if (!comment) { res.status(404).json({ error: "Commentaire introuvable" }); return; }

      const [doc] = await db.select({ syndicateId: documentsTable.syndicateId })
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }

      const user = req.user!;
      const isOwner = comment.authorId === user.userId;
      const isSuperAdmin = user.role === "super_admin";
      // IDOR fix: a syndicate_admin may only moderate comments on documents
      // belonging to THEIR OWN syndicate, never a global "any syndicate_admin" bypass.
      const isSyndicateAdminOfDoc = user.role === "syndicate_admin" && doc.syndicateId === user.syndicateId;
      if (!isOwner && !isSuperAdmin && !isSyndicateAdminOfDoc) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      await db.update(documentCommentsTable)
        .set({ isDeleted: true })
        .where(eq(documentCommentsTable.id, commentId));

      serverAuditLog(req, { action: "document_comment_deleted", entity: "document", entityId: id, details: `commentId: ${commentId}` });
      res.json({ message: "Commentaire supprimé" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
