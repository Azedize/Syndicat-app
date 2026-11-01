// documents: verify endpoints (mounted by documents.routes.ts, in order).
import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, documentSignaturesTable, syndicatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { buildVerificationHtml, buildVerificationNotFoundHtml } from "./documents.html.js";

const router = Router();

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
        version: documentsTable.version,
      })
      .from(documentsTable)
      .where(eq(documentsTable.verificationToken, token));

    if (!doc) {
      if (req.accepts(["html", "json"]) === "html") {
        res.status(404).send(buildVerificationNotFoundHtml());
      } else {
        res
          .status(404)
          .json({ error: "Document introuvable", verified: false });
      }
      return;
    }

    const now = new Date();
    let verificationStatus:
      | "valid"
      | "pending"
      | "revoked"
      | "expired"
      | "replaced";
    if (doc.isDeleted || doc.status === "rejected")
      verificationStatus = "revoked";
    else if (doc.status === "expired" || (doc.expiresAt && doc.expiresAt < now))
      verificationStatus = "expired";
    else if (doc.supersededByDocumentId) verificationStatus = "replaced";
    else if (
      doc.status === "signed" ||
      doc.status === "published" ||
      doc.status === "archived"
    )
      verificationStatus = "valid";
    else verificationStatus = "pending";

    const [syndInfo] = await db
      .select({
        name: syndicatesTable.name,
        logoColor: syndicatesTable.logoColor,
      })
      .from(syndicatesTable)
      .where(eq(syndicatesTable.id, doc.syndicateId ?? ""));
    const sigs = await db
      .select({
        signerName: documentSignaturesTable.signerName,
        signerRole: documentSignaturesTable.signerRole,
        signedAt: documentSignaturesTable.signedAt,
        isValid: documentSignaturesTable.isValid,
      })
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
      rejectionReason:
        verificationStatus === "revoked" ? doc.rejectionReason : undefined,
      signatures: sigs.map((s) => ({
        signerName: s.signerName,
        signerRole: s.signerRole,
        signedAt: s.signedAt,
        isValid: s.isValid,
      })),
    };

    if (req.accepts(["html", "json"]) === "html") {
      res.status(200).send(
        buildVerificationHtml({
          status: verificationStatus,
          title: payload.title,
          documentNumber: payload.documentNumber,
          issuedBy: payload.issuedBy,
          issuedAt: doc.createdAt,
          signatures: sigs,
          rejectionReason: payload.rejectionReason,
          token,
          accentColor: syndInfo?.logoColor ?? undefined,
          docVersion: (doc as any).version ?? undefined,
        }),
      );
    } else {
      res.json(payload);
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur", verified: false });
  }
});

export default router;
