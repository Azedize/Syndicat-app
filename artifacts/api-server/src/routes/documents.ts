/**
 * routes/documents.ts
 *
 * Full Document module — PRODUCTION READY implementation:
 *  • RBAC (super_admin / syndicate_admin) with syndicate isolation
 *  • Real PDF generation via documentPdf.ts + GCS upload
 *  • Workflow state machine: draft → generated → pending_review → validated → signed → published → archived
 *  • Signed download URL (1h TTL)
 *  • Multi-signature tracking (documentSignaturesTable)
 *  • Push + alert notifications on key lifecycle events
 *  • Full audit trail on every write operation
 */
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { documentsTable, documentSignaturesTable, syndicatesTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import {
  generateAndUploadDocument,
  signDocumentDownloadUrl,
  deleteDocumentFromGcs,
  CATEGORY_TO_TEMPLATE,
  type DocumentTemplate,
} from "../lib/documentPdf.js";
import { createAlert, sendPushToSyndicate } from "../lib/notify.js";

const router = Router();

// ─── Workflow state machine ────────────────────────────────────────────────────
// Valid status values and the transitions allowed from each state.

const VALID_STATUSES = ["draft", "generated", "pending_review", "validated", "signed", "published", "archived"] as const;
type DocStatus = typeof VALID_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft: ["generated", "pending_review", "published"],
  generated: ["pending_review", "validated", "published"],
  pending_review: ["validated", "draft"],
  validated: ["signed", "published"],
  signed: ["published"],
  published: ["archived"],
  archived: [],
};

function isTransitionAllowed(from: DocStatus, to: DocStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Helper: fetch syndicate name for PDF ─────────────────────────────────────

async function getSyndicateInfo(syndicateId?: string | null): Promise<{ name: string; address: string }> {
  if (!syndicateId) return { name: "SYNDYCAT", address: "" };
  const [s] = await db.select({ name: syndicatesTable.name, address: syndicatesTable.address })
    .from(syndicatesTable)
    .where(eq(syndicatesTable.id, syndicateId));
  return { name: s?.name ?? "SYNDYCAT", address: s?.address ?? "" };
}

// ─── GET /documents ────────────────────────────────────────────────────────────

router.get("/documents", requireAuth, async (req, res) => {
  const { category, status } = req.query as Record<string, string>;
  try {
    const syndicateId = req.user!.syndicateId;
    // super_admin without syndicateId sees all; all other roles are scoped
    const conditions: ReturnType<typeof eq>[] = [];
    if (req.user!.role !== "super_admin" || syndicateId) {
      if (syndicateId) conditions.push(eq(documentsTable.syndicateId, syndicateId));
    }
    if (category) conditions.push(eq(documentsTable.category, category as any));
    if (status) conditions.push(eq(documentsTable.status, status));
    // Members and tenants only see published documents
    if (req.user!.role === "member" || req.user!.role === "tenant") {
      conditions.push(eq(documentsTable.status, "published"));
    }
    const rows = await db
      .select()
      .from(documentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
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
    if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
    if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    // Members / tenants cannot access non-published docs
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
// Returns a signed 1-hour GCS GET URL for the document's PDF.

router.get("/documents/:id/download-url", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
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
    res.json({ url, expiresIn: 3600 });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur lors de la génération du lien de téléchargement" });
  }
});

// ─── POST /documents ───────────────────────────────────────────────────────────
// Generates a real PDF, uploads to GCS, stores fileUrl.

router.post(
  "/documents",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    if (req.user!.role === "syndicate_admin" && !req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé : syndicateId manquant dans le jeton" }); return;
    }
    const schema = z.object({
      title: z.string().min(1).max(500),
      category: z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]),
      content: z.string().max(500000).optional(),
      status: z.enum(VALID_STATUSES).default("draft"),
      memberName: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides", details: result.error.flatten() }); return; }

    try {
      const { title, category, content, status, memberName } = result.data;
      const syndicateId = req.user!.syndicateId || "";
      const syndInfo = await getSyndicateInfo(syndicateId);

      // 1. Generate real PDF + upload to GCS
      const template: DocumentTemplate = CATEGORY_TO_TEMPLATE[category] ?? "certificat";
      const generated = await generateAndUploadDocument(template, {
        title,
        content,
        syndicateName: syndInfo.name,
        syndicateAddress: syndInfo.address,
        memberName,
      });

      // 2. Insert document record
      const [doc] = await db
        .insert(documentsTable)
        .values({
          title,
          category,
          content,
          status: generated.fileUrl ? "generated" : status,
          syndicateId,
          size: generated.fileSizeKo,
          fileUrl: generated.fileUrl || null,
          documentNumber: generated.documentNumber,
          templateId: template,
          version: 1,
          createdBy: req.user!.userId,
          updatedAt: new Date(),
        } as any)
        .returning();

      // 3. Audit log
      await serverAuditLog(req, {
        action: "DOCUMENT_GENERATED",
        entity: "document",
        entityId: doc.id,
        details: `Titre: ${doc.title}, Catégorie: ${doc.category}, PDF: ${generated.fileUrl ? "oui" : "non"}`,
      });

      // 4. Push notification to syndicate admins (fire-and-forget)
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
// Updates content/metadata and enforces workflow state-machine transitions.

router.put(
  "/documents/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      title: z.string().min(1).max(500).optional(),
      category: z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]).optional(),
      content: z.string().max(500000).optional(),
      status: z.enum(VALID_STATUSES).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }

    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      // Enforce workflow state machine
      if (result.data.status && result.data.status !== existing.status) {
        const from = (existing.status ?? "draft") as DocStatus;
        const to = result.data.status as DocStatus;
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
      // Increment version on content or status change
      if (result.data.content !== undefined || result.data.status) {
        updates.version = sql`COALESCE(${documentsTable.version}, 1) + 1`;
      }
      // Track lifecycle timestamps
      if (result.data.status === "published") updates.publishedAt = new Date();
      if (result.data.status === "archived") updates.archivedAt = new Date();
      if (result.data.status === "signed") updates.signedAt = new Date();

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

      // Notify members when a document is published
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

// ─── DELETE /documents/:id ─────────────────────────────────────────────────────

router.delete(
  "/documents/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      // Delete from GCS first (non-blocking failure)
      if (existing.fileUrl) {
        deleteDocumentFromGcs(existing.fileUrl).catch(() => {});
      }
      await db.delete(documentsTable).where(eq(documentsTable.id, id));
      await serverAuditLog(req, {
        action: "DOCUMENT_DELETED",
        entity: "document",
        entityId: id,
        details: `Titre: ${existing.title}, Catégorie: ${existing.category}`,
      });
      res.json({ message: "Document supprimé avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/sign ──────────────────────────────────────────────────
// Records a signature from the authenticated user.

router.post(
  "/documents/:id/sign",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      signatureData: z.string().optional(), // base64 PNG of handwritten signature pad
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }

    try {
      const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      // Only documents that are validated (or generated/published) can be signed
      const signable: DocStatus[] = ["generated", "validated", "published"];
      if (!signable.includes((doc.status ?? "draft") as DocStatus)) {
        res.status(422).json({ error: `Le document au statut "${doc.status}" ne peut pas être signé` }); return;
      }

      // Insert signature record
      const [sig] = await db
        .insert(documentSignaturesTable)
        .values({
          documentId: id,
          signedBy: req.user!.userId,
          signerRole: req.user!.role,
          syndicateId: req.user!.syndicateId,
          ipAddress: req.ip ?? req.socket?.remoteAddress,
          signatureData: result.data.signatureData,
        } as any)
        .returning();

      // Update document status to signed + record signedBy
      const now = new Date();
      await db.update(documentsTable).set({
        status: "signed",
        signedAt: now,
        signedBy: req.user!.userId,
        updatedAt: now,
      } as any).where(eq(documentsTable.id, id));

      await serverAuditLog(req, {
        action: "DOCUMENT_SIGNED",
        entity: "document",
        entityId: id,
        details: `Signataire: ${req.user!.name ?? req.user!.userId}, Rôle: ${req.user!.role}`,
      });

      // Notify admins
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

router.get("/documents/:id/signatures", requireAuth, async (req, res) => {
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
});

export default router;
