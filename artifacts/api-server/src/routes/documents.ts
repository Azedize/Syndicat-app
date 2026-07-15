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
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { documentsTable, documentSignaturesTable, documentCommentsTable, syndicatesTable, usersTable } from "@workspace/db/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import {
  generateAndUploadDocument,
  signDocumentDownloadUrl,
  deleteDocumentFromGcs,
  CATEGORY_TO_TEMPLATE,
  type DocumentTemplate,
  type SyndicateInfo,
} from "../lib/documentPdf.js";
import { createAlert } from "../lib/notify.js";

const router = Router();

// ─── Workflow state machine ────────────────────────────────────────────────────

const VALID_STATUSES = ["draft", "generated", "pending_review", "validated", "signed", "published", "archived"] as const;
type DocStatus = typeof VALID_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft:          ["generated", "pending_review", "published"],
  generated:      ["pending_review", "validated"],
  pending_review: ["generated", "validated", "draft"],
  validated:      ["signed", "published"],
  signed:         ["published"],
  published:      ["archived"],
  archived:       [],
};

function isTransitionAllowed(from: DocStatus, to: DocStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
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
  };
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
      // Optional direct template override — bypasses CATEGORY_TO_TEMPLATE lookup
      templateId: z.enum([
        "attestation", "pv", "convocation", "contrat", "rapport",
        "decision", "certificat", "circulaire", "mise_en_demeure",
      ] as const).optional(),
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
      const { title, category, content, memberName, templateId, ...extraFields } = result.data;
      const syndicateId = req.user!.syndicateId || "";

      // 1. Fetch full syndicate branding
      const syndInfo = await getSyndicateInfo(syndicateId);

      // 2. Determine template (direct override > category mapping > fallback)
      const template: DocumentTemplate = templateId ?? CATEGORY_TO_TEMPLATE[category] ?? "certificat";

      // 3. Generate PDF + upload to GCS
      const generated = await generateAndUploadDocument(template, {
        title,
        content,
        syndicate: syndInfo,
        memberName,
        docStatus: "generated",
        ...extraFields,
      });

      // 4. Insert document record
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
          updatedAt: new Date(),
        } as any)
        .returning();

      // 5. Audit log
      await serverAuditLog(req, {
        action: "DOCUMENT_GENERATED",
        entity: "document",
        entityId: doc.id,
        details: `Titre: ${doc.title}, Modèle: ${template}, Catégorie: ${doc.category}`,
      });

      // 6. Push notification (fire-and-forget)
      if (syndicateId) {
        createAlert({
          title: "Nouveau document généré",
          message: `"${title}" a été généré dans la catégorie ${category}.`,
          type: "info",
          syndicateId,
          target: "admin",
        }).catch(() => {});
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
      }

      const updates: Record<string, unknown> = { ...result.data, updatedAt: new Date() };
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

      const [doc] = await db
        .update(documentsTable)
        .set(updates)
        .where(eq(documentsTable.id, id))
        .returning();

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

      res.json({ data: doc, message: "Document mis à jour avec succès" });
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

      const [sig] = await db
        .insert(documentSignaturesTable)
        .values({
          documentId:    id,
          signedBy:      req.user!.userId,
          signerRole:    req.user!.role,
          syndicateId:   req.user!.syndicateId,
          ipAddress:     req.ip ?? req.socket?.remoteAddress,
          signatureData: result.data.signatureData,
        } as any)
        .returning();

      const now = new Date();
      await db.update(documentsTable).set({
        status:    "signed",
        signedAt:  now,
        signedBy:  req.user!.userId,
        updatedAt: now,
      } as any).where(eq(documentsTable.id, id));

      await serverAuditLog(req, {
        action: "DOCUMENT_SIGNED",
        entity: "document",
        entityId: id,
        details: `Signataire: ${req.user!.name ?? req.user!.userId}, Rôle: ${req.user!.role}`,
      });

      if (doc.syndicateId) {
        createAlert({
          title: "Document signé",
          message: `"${doc.title}" a été signé électroniquement.`,
          type: "success",
          syndicateId: doc.syndicateId,
          target: "admin",
        }).catch(() => {});
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
    const { id } = req.params;
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
    const { id } = req.params;
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

      serverAuditLog(req, "document_comment_added", { documentId: id, commentId: comment.id });
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
    const { id, commentId } = req.params;
    try {
      const [comment] = await db.select().from(documentCommentsTable)
        .where(and(eq(documentCommentsTable.id, commentId), eq(documentCommentsTable.documentId, id)));
      if (!comment) { res.status(404).json({ error: "Commentaire introuvable" }); return; }

      const user = req.user!;
      const isOwner = comment.authorId === user.userId;
      const isSuperAdmin = user.role === "super_admin";
      const isSyndicateAdmin = user.role === "syndicate_admin";
      if (!isOwner && !isSuperAdmin && !isSyndicateAdmin) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      await db.update(documentCommentsTable)
        .set({ isDeleted: true })
        .where(eq(documentCommentsTable.id, commentId));

      serverAuditLog(req, "document_comment_deleted", { documentId: id, commentId });
      res.json({ message: "Commentaire supprimé" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
