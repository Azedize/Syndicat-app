// documents: signing endpoints (mounted by documents.routes.ts, in order).
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  documentsTable,
  documentSignaturesTable,
  documentCommentsTable,
  syndicatesTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { appendSignaturesToPdf, roleLabel, type DocumentLanguage, type InlineSignatureInfo } from "../../lib/documentPdf.js";
import { createAlert, sendEmail } from "../../lib/notify.js";
import { canSeeDocument } from "../../lib/document-access.js";
import { DocStatus, regenerateDocumentWithSignatures, GenerationParams, TEMPLATE_SIGNING_ORDER } from "./documents.service.js";

const router = Router();

// ─── POST /documents/:id/sign ──────────────────────────────────────────────────

// FIX [W3]: President must sign PVs and AG minutes (Loi 18-00 requirement).
// Secretary countersigns administrative documents. Previously only super_admin
// and syndicate_admin could sign — breaking the AG → PV signature workflow.
router.post(
  "/documents/:id/sign",
  requireAuth,
  requireRole("super_admin", "syndicate_admin", "president", "secretary"),
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      signatureData: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }

    // Reject non-SVG signature data up-front — empty/missing is allowed (text-only signature)
    const rawSig = result.data.signatureData;
    if (rawSig && rawSig.trim().length > 0) {
      const looksLikeSvg = /^\s*(?:<\?xml[^>]*>\s*)?<svg/i.test(rawSig.trim());
      if (!looksLikeSvg) {
        res.status(422).json({
          error: "Les données de signature ne sont pas un SVG valide",
        });
        return;
      }
    }

    try {
      const [doc] = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!doc || doc.isDeleted) {
        res.status(404).json({ error: "Document introuvable" });
        return;
      }
      if (
        req.user!.role !== "super_admin" &&
        doc.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      if (
        req.user!.role === "super_admin" &&
        req.query.supervision !== "true"
      ) {
        res.status(403).json({
          error: "La supervision est requise pour signer ce document.",
          code: "SUPERVISION_REQUIRED",
        });
        return;
      }
      // generated, pending_review, validated, AND signed documents may be signed
      // "signed" must be included so multi-signature workflows allow a second/third signer
      // after the first signer has already changed the status to "signed".
      const signable: DocStatus[] = [
        "generated",
        "pending_review",
        "validated",
        "signed",
      ];
      if (!signable.includes((doc.status ?? "draft") as DocStatus)) {
        res.status(422).json({
          error: `Le document au statut "${doc.status}" ne peut pas être signé`,
        });
        return;
      }

      // Prevent the same user signing the same document twice (also enforced by
      // a unique index at the DB level as defense-in-depth).
      const [alreadySigned] = await db
        .select({ id: documentSignaturesTable.id })
        .from(documentSignaturesTable)
        .where(
          and(
            eq(documentSignaturesTable.documentId, id),
            eq(documentSignaturesTable.signedBy, req.user!.userId),
          ),
        );
      if (alreadySigned) {
        res.status(409).json({ error: "Vous avez déjà signé ce document" });
        return;
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
          documentId: id,
          signedBy: req.user!.userId,
          signerRole: req.user!.role,
          signerName,
          syndicateId: req.user!.syndicateId,
          ipAddress: req.ip ?? req.socket?.remoteAddress,
          signatureData: result.data.signatureData,
          signatureOrder: nextOrder,
          isValid: true,
        } as any)
        .returning();

      await db
        .update(documentsTable)
        .set({
          status: "signed",
          signedAt: now,
          signedBy: req.user!.userId,
          updatedAt: now,
        } as any)
        .where(eq(documentsTable.id, id));

      // Embed signatures in the PDF body — awaited synchronously so the response
      // reflects the true PDF state. Full regeneration when generationParams is available;
      // replace-append signature page otherwise.
      let pdfReady = false;
      if (doc.fileUrl) {
        // Load ALL recorded signatures (including the one just inserted above)
        const allSigRows = await db
          .select()
          .from(documentSignaturesTable)
          .where(eq(documentSignaturesTable.documentId, id))
          .orderBy(documentSignaturesTable.signatureOrder);

        const allInlineSigs: InlineSignatureInfo[] = allSigRows
          .filter((s) => s.signedAt && s.signerName)
          .map((s) => ({
            signerName: s.signerName ?? "",
            signerRole: s.signerRole ?? "syndicate_admin",
            signedAt: new Date(s.signedAt!),
            isValid: s.isValid ?? true,
            signatureData: s.signatureData ?? undefined,
          }));

        const storedParams = (doc as any)
          .generationParams as GenerationParams | null;

        try {
          if (storedParams) {
            // Full regeneration — SVG traces appear inline in the document body
            const newFileUrl = await regenerateDocumentWithSignatures(
              doc,
              storedParams,
              allInlineSigs,
            );
            if (newFileUrl) {
              await db
                .update(documentsTable)
                .set({
                  fileUrl: newFileUrl,
                  appendedSignaturePages: 0,
                  regenerationFailed: false,
                  updatedAt: new Date(),
                } as any)
                .where(eq(documentsTable.id, id));
              pdfReady = true;
            }
          } else {
            // Legacy fallback: strip old sig page then append fresh one with all sigs
            const prevCount =
              ((doc as any).appendedSignaturePages as number | null) ?? 0;
            const syndBranding = doc.syndicateId
              ? await db
                  .select({
                    name: syndicatesTable.name,
                    logoColor: syndicatesTable.logoColor,
                  })
                  .from(syndicatesTable)
                  .where(eq(syndicatesTable.id, doc.syndicateId))
                  .limit(1)
                  .then((r) => r[0] ?? null)
                  .catch(() => null)
              : null;
            await appendSignaturesToPdf(
              doc.fileUrl,
              allInlineSigs.map((s) => ({
                signerName: s.signerName,
                signerRole: s.signerRole,
                signedAt: s.signedAt,
                signatureSvg: s.signatureData,
                isValid: s.isValid,
              })),
              (doc.language as DocumentLanguage) ?? "fr",
              (syndBranding?.logoColor as string | undefined) ?? "#2563EB",
              syndBranding?.name ?? "",
              doc.documentNumber ?? "",
              prevCount,
            );
            await db
              .update(documentsTable)
              .set({
                appendedSignaturePages: 1,
                regenerationFailed: false,
                updatedAt: new Date(),
              } as any)
              .where(eq(documentsTable.id, id));
            pdfReady = true;
          }
        } catch (err) {
          req.log.error(
            { err, docId: id },
            "PDF signature embedding failed — document signed but PDF not updated",
          );
          // Mark the document so admins can identify stale PDFs needing manual regeneration
          await db
            .update(documentsTable)
            .set({ regenerationFailed: true, updatedAt: new Date() } as any)
            .where(eq(documentsTable.id, id));
        }
      }

      await serverAuditLog(req, {
        action: "DOCUMENT_SIGNED",
        entity: "document",
        entityId: id,
        details: `Signataire: ${signerName}, Rôle: ${req.user!.role}`,
      });

      if (doc.syndicateId) {
        createAlert({
          key: "document.signed",
          params: { title: doc.title, signer: signerName },
          type: "success",
          syndicateId: doc.syndicateId,
          target: "admin",
        }).catch(() => {});

        if (doc.createdBy && doc.createdBy !== req.user!.userId) {
          db.select({ email: usersTable.email })
            .from(usersTable)
            .where(eq(usersTable.id, doc.createdBy))
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

      res
        .status(201)
        .json({ data: sig, pdfReady, message: "Document signé avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /documents/:id/signers — Signing order status ───────────────────────
// Returns:
//  - completedSignatures: sigs already recorded (ordered by signatureOrder)
//  - requiredSigners:     template-default signing chain
//  - nextSigner:          next required signer not yet completed (null if all done)
//  - isMyTurn:            whether the calling user is the next expected signer
//  - allSigned:           true when every required step is complete

router.get("/documents/:id/signers", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [doc] = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        status: documentsTable.status,
        syndicateId: documentsTable.syndicateId,
        templateId: documentsTable.templateId,
        category: documentsTable.category,
        subjectUserId: documentsTable.subjectUserId,
        visibility: documentsTable.visibility,
        lotId: documentsTable.lotId,
        createdBy: documentsTable.createdBy,
        isDeleted: documentsTable.isDeleted,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, id));

    if (!doc) {
      res.status(404).json({ error: "Document introuvable" });
      return;
    }
    if (
      (req.user!.role !== "super_admin" &&
        doc.syndicateId !== req.user!.syndicateId) ||
      !(await canSeeDocument(req.user!, doc as any))
    ) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const completedSigs = await db
      .select({
        id: documentSignaturesTable.id,
        signedBy: documentSignaturesTable.signedBy,
        signerName: documentSignaturesTable.signerName,
        signerRole: documentSignaturesTable.signerRole,
        signedAt: documentSignaturesTable.signedAt,
        signatureOrder: documentSignaturesTable.signatureOrder,
        isValid: documentSignaturesTable.isValid,
      })
      .from(documentSignaturesTable)
      .where(eq(documentSignaturesTable.documentId, id))
      .orderBy(documentSignaturesTable.signatureOrder);

    // Look up template-default signing chain
    const templateKey = (doc.templateId ?? "").replace(/-/g, "_");
    const requiredSigners: Array<{
      order: number;
      role: string;
      label: string;
    }> = TEMPLATE_SIGNING_ORDER[templateKey] ?? [];

    // Which orders have been completed?
    const completedOrders = new Set(
      completedSigs.map((s) => s.signatureOrder ?? 0),
    );
    const nextSigner =
      requiredSigners.find((r) => !completedOrders.has(r.order)) ?? null;

    // Is it the calling user's turn?
    const isMyTurn =
      nextSigner != null
        ? nextSigner.role === req.user!.role ||
          (nextSigner.role === "syndicate_admin" &&
            req.user!.role === "syndicate_admin")
        : false;

    const allSigned =
      requiredSigners.length > 0
        ? requiredSigners.every((r) => completedOrders.has(r.order))
        : false;

    res.json({
      data: {
        documentId: id,
        title: doc.title,
        status: doc.status,
        requiredSigners,
        completedSignatures: completedSigs,
        nextSigner,
        isMyTurn,
        allSigned,
        totalRequired: requiredSigners.length,
        totalCompleted: completedSigs.length,
        percentage:
          requiredSigners.length > 0
            ? Math.round((completedSigs.length / requiredSigners.length) * 100)
            : completedSigs.length > 0
              ? 100
              : 0,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/:id/signatures ────────────────────────────────────────────

router.get(
  "/documents/:id/signatures",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [doc] = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!doc) {
        res.status(404).json({ error: "Document introuvable" });
        return;
      }
      if (
        req.user!.role !== "super_admin" &&
        doc.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
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

router.get("/documents/:id/comments", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [doc] = await db
      .select({
        id: documentsTable.id,
        syndicateId: documentsTable.syndicateId,
        status: documentsTable.status,
        category: documentsTable.category,
        subjectUserId: documentsTable.subjectUserId,
        visibility: documentsTable.visibility,
        lotId: documentsTable.lotId,
        createdBy: documentsTable.createdBy,
        isDeleted: documentsTable.isDeleted,
      })
      .from(documentsTable)
      .where(
        and(eq(documentsTable.id, id), eq(documentsTable.isDeleted, false)),
      );
    if (!doc) {
      res.status(404).json({ error: "Document introuvable" });
      return;
    }

    const user = req.user!;
    const isSuperAdmin = user.role === "super_admin";
    const isAdminOfSyndicate =
      user.role === "syndicate_admin" && doc.syndicateId === user.syndicateId;
    const isMemberOfSyndicate =
      user.role === "member" &&
      doc.syndicateId === user.syndicateId &&
      (await canSeeDocument(user, doc as any));
    if (!isSuperAdmin && !isAdminOfSyndicate && !isMemberOfSyndicate) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const comments = await db
      .select({
        id: documentCommentsTable.id,
        content: documentCommentsTable.content,
        parentId: documentCommentsTable.parentId,
        isDeleted: documentCommentsTable.isDeleted,
        editedAt: documentCommentsTable.editedAt,
        createdAt: documentCommentsTable.createdAt,
        authorId: documentCommentsTable.authorId,
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
});

// ─── Comments: POST /documents/:id/comments ──────────────────────────────────

const CommentCreateSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().optional(),
});

router.post("/documents/:id/comments", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const parsed = CommentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const [doc] = await db
      .select({
        id: documentsTable.id,
        syndicateId: documentsTable.syndicateId,
        status: documentsTable.status,
        category: documentsTable.category,
        subjectUserId: documentsTable.subjectUserId,
        visibility: documentsTable.visibility,
        lotId: documentsTable.lotId,
        createdBy: documentsTable.createdBy,
        isDeleted: documentsTable.isDeleted,
      })
      .from(documentsTable)
      .where(
        and(eq(documentsTable.id, id), eq(documentsTable.isDeleted, false)),
      );
    if (!doc) {
      res.status(404).json({ error: "Document introuvable" });
      return;
    }

    const user = req.user!;
    const isSuperAdmin = user.role === "super_admin";
    const isAdminOfSyndicate =
      user.role === "syndicate_admin" && doc.syndicateId === user.syndicateId;
    const isMemberOfSyndicate =
      user.role === "member" &&
      doc.syndicateId === user.syndicateId &&
      (await canSeeDocument(user, doc as any));
    if (!isSuperAdmin && !isAdminOfSyndicate && !isMemberOfSyndicate) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const [comment] = await db
      .insert(documentCommentsTable)
      .values({
        documentId: id,
        authorId: user.userId,
        content: parsed.data.content,
        parentId: parsed.data.parentId ?? null,
      } as any)
      .returning();

    serverAuditLog(req, {
      action: "document_comment_added",
      entity: "document",
      entityId: id,
      details: `commentId: ${comment.id}`,
    });
    res.status(201).json({ data: comment });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Comments: DELETE /documents/:id/comments/:commentId ─────────────────────

router.delete("/documents/:id/comments/:commentId", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const commentId = String(req.params.commentId);
  try {
    const [comment] = await db
      .select()
      .from(documentCommentsTable)
      .where(
        and(
          eq(documentCommentsTable.id, commentId),
          eq(documentCommentsTable.documentId, id),
        ),
      );
    if (!comment) {
      res.status(404).json({ error: "Commentaire introuvable" });
      return;
    }

    const [doc] = await db
      .select({ syndicateId: documentsTable.syndicateId })
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    if (!doc) {
      res.status(404).json({ error: "Document introuvable" });
      return;
    }

    const user = req.user!;
    const isOwner = comment.authorId === user.userId;
    const isSuperAdmin = user.role === "super_admin";
    // IDOR fix: a syndicate_admin may only moderate comments on documents
    // belonging to THEIR OWN syndicate, never a global "any syndicate_admin" bypass.
    const isSyndicateAdminOfDoc =
      user.role === "syndicate_admin" && doc.syndicateId === user.syndicateId;
    if (!isOwner && !isSuperAdmin && !isSyndicateAdminOfDoc) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    await db
      .update(documentCommentsTable)
      .set({ isDeleted: true })
      .where(eq(documentCommentsTable.id, commentId));

    serverAuditLog(req, {
      action: "document_comment_deleted",
      entity: "document",
      entityId: id,
      details: `commentId: ${commentId}`,
    });
    res.json({ message: "Commentaire supprimé" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
