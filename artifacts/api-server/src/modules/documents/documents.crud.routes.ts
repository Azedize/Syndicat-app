// documents: crud endpoints (mounted by documents.routes.ts, in order).
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { findForeignReference, resolveDocumentSubject } from "../../lib/scope.js";
import { db } from "@workspace/db";
import {
  documentsTable,
  documentSignaturesTable,
  documentVersionsTable,
  usersTable,
  lotsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import {
  generateAndUploadDocument,
  deleteDocumentFromGcs,
  readLocalDocFile,
  CATEGORY_TO_TEMPLATE,
  type DocumentTemplate,
  type DocumentLanguage,
} from "../../lib/documentPdf.js";
import { createAlert, notifyUser, sendEmail, sendEmailToMany } from "../../lib/notify.js";
import { computeRetentionUntil } from "../../lib/retention.js";
import { canSeeDocument, documentView } from "../../lib/document-access.js";
import { assertDeletable } from "../../modules/document-library/document-library.service.js";
import {
  VALID_STATUSES,
  DocStatus,
  ALLOWED_TRANSITIONS,
  isTransitionAllowed,
  buildVerifyUrl,
  generateSequentialDocumentNumber,
  getSyndicateInfo,
  getPropertyInfo,
  getOfficeHolders,
  getMeetingData,
  getLotMemberData,
  getAppelDeFondsData,
  getBudgetData,
  getFinancialDashboardData,
  getInvoiceData,
  getAttestationPaiementData,
} from "./documents.service.js";

const router = Router();

// ─── GET /documents/:id ────────────────────────────────────────────────────────

router.get("/documents/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    if (!doc || doc.isDeleted) {
      res.status(404).json({ error: "Document introuvable" });
      return;
    }
    // Another condominium's document, or one outside the person's audience,
    // gets the same answer as a missing id: no hint that it exists.
    if (
      (req.user!.role !== "super_admin" &&
        doc.syndicateId !== req.user!.syndicateId) ||
      !(await canSeeDocument(req.user!, doc))
    ) {
      res.status(404).json({ error: "Document introuvable", code: "DOCUMENT_NOT_FOUND" });
      return;
    }
    const lotNumber = doc.lotId
      ? (await db.select({ n: lotsTable.number }).from(lotsTable).where(eq(lotsTable.id, doc.lotId)))[0]?.n ?? null
      : null;
    res.json({ data: { ...documentView(doc, req.user!), lotNumber } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/local-docs/:uuid/:filename — serve local-disk fallback PDFs

router.get(
  "/documents/local-docs/:uuid/:filename",
  requireAuth,
  async (req, res) => {
    const uuid = String(req.params.uuid);
    const filename = String(req.params.filename);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        uuid,
      ) ||
      !filename ||
      /[/\\]/.test(filename) ||
      filename === "." ||
      filename === ".." ||
      filename.includes("..")
    ) {
      res.status(400).json({ error: "Chemin invalide" });
      return;
    }
    try {
      const localPath = `/local-docs/${uuid}/${filename}`;
      const [doc] = await db
        .select({
          syndicateId: documentsTable.syndicateId,
          status: documentsTable.status,
          category: documentsTable.category,
          isDeleted: documentsTable.isDeleted,
          subjectUserId: documentsTable.subjectUserId,
          visibility: documentsTable.visibility,
          lotId: documentsTable.lotId,
          createdBy: documentsTable.createdBy,
        })
        .from(documentsTable)
        .where(eq(documentsTable.fileUrl, localPath))
        .limit(1);
      if (!doc || doc.isDeleted) {
        res.status(404).json({ error: "Fichier introuvable" });
        return;
      }
      if (req.user!.role === "super_admin") {
        if (req.query.supervision !== "true") {
          res.status(403).json({
            error: "La supervision est requise pour accéder à ce document.",
            code: "SUPERVISION_REQUIRED",
          });
          return;
        }
      } else if (
        !req.user!.syndicateId ||
        doc.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      if (!(await canSeeDocument(req.user!, doc))) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const buffer = await readLocalDocFile(uuid, filename);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.send(buffer);
    } catch {
      res.status(404).json({
        error:
          "Fichier introuvable — il a peut-être expiré après un redémarrage du serveur.",
      });
    }
  },
);

// GET /documents/:id/download-url and /file: see modules/document-library/document-library.routes.ts

// ─── POST /documents ───────────────────────────────────────────────────────────

router.post(
  "/documents",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    if (req.user!.role === "syndicate_admin" && !req.user!.syndicateId) {
      res
        .status(403)
        .json({ error: "Accès refusé : syndicateId manquant dans le jeton" });
      return;
    }
    const schema = z.object({
      title: z.string().min(1).max(500),
      category: z.enum([
        "reglements",
        "statuts",
        "pv",
        "juridique",
        "finances",
        "attestation",
      ]),
      content: z.string().max(500_000).optional(),
      memberName: z.string().optional(),
      // Scopes {{property.*}} injection to a specific residence; otherwise
      // aggregates across all buildings of the syndicate.
      buildingId: z.string().optional(),
      // Optional direct template override — bypasses CATEGORY_TO_TEMPLATE lookup
      // Includes all 21 templates: 9 original + 11 new enterprise + reglement
      // V1 — 12 essential production templates
      templateId: z
        .enum([
          "attestation",
          "attestation_residence",
          "attestation_propriete",
          "attestation_paiement",
          "convocation",
          "pv",
          "decision",
          "rapport_financier",
          "appel_de_fonds",
          "facture",
          "contrat",
          "mise_en_demeure",
        ] as const)
        .optional(),
      // ── Entity IDs — auto-load data from DB instead of manual entry ───────────
      meetingId: z.string().optional(),
      lotId: z.string().optional(),
      memberId: z.string().optional(),
      appelDeFondsId: z.string().optional(),
      budgetId: z.string().optional(),
      invoiceId: z.string().optional(),
      // Internal: pass when re-generating a signed document so existing signatures load
      _existingDocumentId: z.string().optional(),
      // Output language — the mobile UI always presents an explicit choice; "fr" is
      // only used as a server-side fallback for callers that omit it entirely.
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
      // Business expiration date (distinct from legal retentionUntil) — e.g. a
      // contract/mandate/authorization validity end date. ISO date/datetime string.
      expiresAt: z.string().optional(),
      // Extra fields passed through to the template
      lieu: z.string().optional(),
      meetingDate: z.string().optional(),
      heure: z.string().optional(),
      agendaText: z.string().optional(),
      deliberationsText: z.string().optional(),
      resolutionsText: z.string().optional(),
      periode: z.string().optional(),
      organe: z.string().optional(),
      objet: z.string().optional(),
      delai: z.string().optional(),
      priorite: z.string().optional(),
      modeEnvoi: z.string().optional(),
      preamble: z.string().optional(),
      consequences: z.string().optional(),
      activites: z.string().optional(),
      indicateurs: z.string().optional(),
      perspectives: z.string().optional(),
      synthese: z.string().optional(),
      president: z.string().optional(),
      secretaire: z.string().optional(),
      // ── Template-specific optional fields ───────────────────────────────────
      // rapport_financier / contrat / mise_en_demeure
      etabliPar: z.string().optional(),
      approuvePar: z.string().optional(),
      exercice: z.string().optional(),
      observations: z.string().optional(),
      totalPrevu: z.string().optional(),
      totalRealise: z.string().optional(),
      // contrat
      conditions: z.string().optional(),
      dateDebut: z.string().optional(),
      dateFin: z.string().optional(),
      // pv / convocation / decision
      dateMeeting: z.string().optional(),
      presidentSeance: z.string().optional(),
      participants: z.string().optional(),
      ordreJour: z.string().optional(),
      deroulement: z.string().optional(),
      decisions: z.string().optional(),
      prochaineReunion: z.string().optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res
        .status(400)
        .json({ error: "Données invalides", details: result.error.flatten() });
      return;
    }

    try {
      const {
        title,
        category,
        content,
        memberName,
        templateId,
        buildingId,
        language,
        expiresAt,
        ...extraFields
      } = result.data;
      const syndicateId = req.user!.syndicateId || null;
      const docLanguage: DocumentLanguage =
        (language as DocumentLanguage) ?? "fr";

      // Every entity whose data is merged into the document must belong to
      // the caller's syndicate — otherwise any ID from another syndicate
      // (lot, member, charge, budget, invoice…) would leak into the PDF.
      if (syndicateId) {
        const foreign = await findForeignReference(syndicateId, {
          buildingId,
          lotId: extraFields.lotId as string | undefined,
          memberId: extraFields.memberId as string | undefined,
          meetingId: extraFields.meetingId as string | undefined,
          appelDeFondsId: extraFields.appelDeFondsId as string | undefined,
          budgetId: extraFields.budgetId as string | undefined,
          invoiceId: extraFields.invoiceId as string | undefined,
          documentId: extraFields._existingDocumentId as string | undefined,
        });
        if (foreign) {
          res.status(404).json({
            error: "Ressource liée introuvable dans votre syndicat",
            code: "FOREIGN_REFERENCE",
            field: foreign,
          });
          return;
        }
      }
      // A document generated for a given member/lot is personal to that person.
      const generationSubject = await resolveDocumentSubject(syndicateId, {
        memberId: extraFields.memberId as string | undefined,
        lotId: extraFields.lotId as string | undefined,
      });

      // 1. Fetch full syndicate branding + real residence/office-holder data
      const [syndInfo, property, officeHolders] = await Promise.all([
        getSyndicateInfo(syndicateId),
        getPropertyInfo(syndicateId, buildingId),
        getOfficeHolders(syndicateId),
      ]);

      // 2. Determine template (direct override > category mapping > fallback)
      const template: DocumentTemplate =
        templateId ?? CATEGORY_TO_TEMPLATE[category] ?? "attestation";

      // 3. Mint a real sequential document number (REG-2026-0001, PV-2026-0001, …)
      const documentNumber = await generateSequentialDocumentNumber(
        syndicateId,
        template,
      );

      // 3b. Mint the QR verification token + its real, environment-portable public URL
      const verificationToken = randomUUID();
      const verificationUrl = buildVerifyUrl(verificationToken);

      // 4. Load entity-specific data from DB (entity-driven generation)
      const entityLoads: Promise<Record<string, string>>[] = [];
      if (extraFields.meetingId)
        entityLoads.push(getMeetingData(extraFields.meetingId as string));
      if (extraFields.appelDeFondsId)
        entityLoads.push(
          getAppelDeFondsData(extraFields.appelDeFondsId as string),
        );
      if (extraFields.budgetId)
        entityLoads.push(getBudgetData(extraFields.budgetId as string));
      if (extraFields.lotId || extraFields.memberId) {
        entityLoads.push(
          getLotMemberData(
            extraFields.lotId as string | undefined,
            extraFields.memberId as string | undefined,
          ),
        );
      }
      if (extraFields.invoiceId) {
        entityLoads.push(getInvoiceData(extraFields.invoiceId as string));
      }
      // Attestation paiement — auto-calculate paid charges for the lot
      if (template === "attestation_paiement" && extraFields.lotId) {
        entityLoads.push(
          getAttestationPaiementData(
            extraFields.lotId as string,
            (extraFields.periode as string | undefined) ?? null,
            syndicateId,
          ),
        );
      }
      // Financial KPI dashboard — loaded for all financial templates + rapport_financier
      const isFinancialTemplate = [
        "appel_de_fonds",
        "facture",
        "rapport_financier",
      ].includes(template);
      if (isFinancialTemplate) {
        const kpiBuildingId = buildingId ?? null;
        const kpiYear = extraFields.exercice
          ? parseInt(extraFields.exercice as string)
          : null;
        entityLoads.push(
          getFinancialDashboardData(syndicateId, kpiBuildingId, kpiYear),
        );
      }
      const entityResults = await Promise.all(entityLoads);
      const entityData: Record<string, string> = Object.assign(
        {},
        ...entityResults,
      );

      // ── Auto-inject établiPar / approuvePar from office-holders ────────────
      // Only set when not already supplied by the user or an entity loader,
      // so explicit user input always wins.
      if (
        officeHolders?.treasurer?.fullName &&
        !extraFields.etabliPar &&
        !entityData.etabliPar
      ) {
        entityData.etabliPar = officeHolders.treasurer.fullName;
      }
      if (
        officeHolders?.president?.fullName &&
        !extraFields.approuvePar &&
        !entityData.approuvePar
      ) {
        entityData.approuvePar = officeHolders.president.fullName;
      }

      // Also load existing signatures for documents being regenerated after signing
      const existingDocId = extraFields._existingDocumentId as
        | string
        | undefined;
      let loadedSignatures: import("../../lib/documentPdf.js").InlineSignatureInfo[] =
        [];
      if (existingDocId) {
        const sigRows = await db
          .select()
          .from(documentSignaturesTable)
          .where(eq(documentSignaturesTable.documentId, existingDocId))
          .orderBy(documentSignaturesTable.signatureOrder);
        loadedSignatures = sigRows
          .filter((s) => s.signedAt && s.signerName)
          .map((s) => ({
            signerName: s.signerName ?? "",
            signerRole: s.signerRole ?? "syndicate_admin",
            signedAt: new Date(s.signedAt!),
            isValid: s.isValid ?? true,
            // Include the handwritten SVG trace so it renders inline in the regenerated PDF
            signatureData: s.signatureData ?? undefined,
          }));
      }

      // 5. Generate PDF + upload to GCS
      const generated = await generateAndUploadDocument(template, {
        title,
        content,
        syndicate: syndInfo,
        property,
        officeHolders,
        memberName: entityData.memberName || memberName,
        documentNumber,
        docStatus: "generated",
        version: "v1.0",
        language: docLanguage,
        verificationUrl,
        signatures: loadedSignatures,
        ...entityData, // entity DB data first (auto-populated)
        ...extraFields, // user-provided fields override auto-populated ones
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
          subjectUserId: generationSubject,
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
          expiresAt:
            parsedExpiresAt && !Number.isNaN(parsedExpiresAt.getTime())
              ? parsedExpiresAt
              : null,
          // Legal retention — computed from category/template, see lib/retention.ts
          retentionUntil: computeRetentionUntil(category, template, createdAt),
          // Store entity IDs + form fields to enable full PDF regeneration with inline signatures
          generationParams: {
            buildingId: buildingId ?? null,
            meetingId: (extraFields.meetingId as string | undefined) ?? null,
            lotId: (extraFields.lotId as string | undefined) ?? null,
            memberId: (extraFields.memberId as string | undefined) ?? null,
            appelDeFondsId:
              (extraFields.appelDeFondsId as string | undefined) ?? null,
            budgetId: (extraFields.budgetId as string | undefined) ?? null,
            invoiceId: (extraFields.invoiceId as string | undefined) ?? null,
            memberName: memberName ?? null,
            formFields: Object.fromEntries(
              Object.entries(extraFields).filter(
                ([k]) =>
                  ![
                    "meetingId",
                    "lotId",
                    "memberId",
                    "appelDeFondsId",
                    "budgetId",
                    "invoiceId",
                    "_existingDocumentId",
                  ].includes(k),
              ),
            ),
          },
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
          key: "document.generated",
          params: { title, category },
          type: "info",
          syndicateId,
          target: "admin",
        }).catch(() => {});

        db.select({ email: usersTable.email })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.syndicateId, syndicateId),
              eq(usersTable.role, "syndicate_admin"),
            ),
          )
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

      res
        .status(201)
        .json({ data: doc, message: "Document généré avec succès" });
    } catch (err) {
      req.log.error(err);
      res
        .status(500)
        .json({ error: "Erreur serveur lors de la génération du document" });
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
      title: z.string().min(1).max(500).optional(),
      category: z
        .enum([
          "reglements",
          "statuts",
          "pv",
          "juridique",
          "finances",
          "attestation",
        ])
        .optional(),
      content: z.string().max(500_000).optional(),
      status: z.enum(VALID_STATUSES).optional(),
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
      expiresAt: z.string().optional(),
      // Required when status is set to "rejected" — legal traceability of why.
      rejectionReason: z.string().min(1).max(2000).optional(),
      // Free-text audit note for the version snapshot (optional).
      changeReason: z.string().max(500).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }

    try {
      const [existing] = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) {
        res.status(404).json({ error: "Document introuvable" });
        return;
      }
      if (
        req.user!.role !== "super_admin" &&
        existing.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      // Enforce workflow state machine
      if (result.data.status && result.data.status !== existing.status) {
        const from = (existing.status ?? "draft") as DocStatus;
        const to = result.data.status as DocStatus;
        if (!isTransitionAllowed(from, to)) {
          res.status(422).json({
            error: `Transition invalide : "${from}" → "${to}"`,
            allowed: ALLOWED_TRANSITIONS[from],
          });
          return;
        }
        if (to === "rejected" && !result.data.rejectionReason) {
          res.status(400).json({ error: "Un motif de rejet est requis" });
          return;
        }
      }

      // Snapshot the pre-update state into version history BEFORE applying any
      // content/status change — never lost, even if this specific PUT fails partway.
      const { changeReason, rejectionReason, ...fieldUpdates } = result.data;
      const isMeaningfulChange =
        fieldUpdates.content !== undefined ||
        fieldUpdates.title !== undefined ||
        fieldUpdates.status !== undefined;
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
          changeReason:
            changeReason ??
            (fieldUpdates.status
              ? `Transition ${existing.status} → ${fieldUpdates.status}`
              : "Modification du contenu"),
        } as any)
          // A status-only change keeps the same content version, whose
          // snapshot already exists: without this, the second transition
          // (e.g. validated → published) violated the unique
          // (document_id, version_number) and returned 500. The transition
          // itself is recorded in the audit log below.
          .onConflictDoNothing();
      }

      const updates: Record<string, unknown> = {
        ...fieldUpdates,
        updatedAt: new Date(),
      };
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
      if (result.data.status === "archived") updates.archivedAt = new Date();
      if (result.data.status === "signed") updates.signedAt = new Date();
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
        await db
          .update(documentSignaturesTable)
          .set({ isValid: false } as any)
          .where(eq(documentSignaturesTable.documentId, id));
      }

      await serverAuditLog(req, {
        action: "DOCUMENT_UPDATED",
        entity: "document",
        entityId: id,
        details: fieldUpdates.status
          ? `Transition ${existing.status} → ${fieldUpdates.status} (version ${doc.version})`
          : `Champs: ${Object.keys(result.data).join(", ")}, Version: ${doc.version}`,
      });

      // Notify members when published
      if (result.data.status === "published" && existing.syndicateId) {
        if (existing.subjectUserId) {
          // Personal document: only the person concerned is told (its title
          // usually carries their name and situation).
          void notifyUser(existing.subjectUserId, {
            key: "document.available",
            params: { title: doc.title },
            type: "success",
            syndicateId: existing.syndicateId,
          });
        } else {
          createAlert({
            key: "document.published",
            params: { title: doc.title },
            type: "success",
            syndicateId: existing.syndicateId,
            target: "all",
          }).catch(() => {});
        }
      }

      // Approval / rejection email + in-app notifications to the document's author
      if (
        (result.data.status === "validated" ||
          result.data.status === "rejected") &&
        existing.createdBy
      ) {
        const [author] = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, existing.createdBy));
        const approved = result.data.status === "validated";
        void notifyUser(existing.createdBy, {
          key: approved ? "document.approved" : "document.rejected",
          params: { title: doc.title, reason: rejectionReason ?? "" },
          type: approved ? "success" : "error",
          syndicateId: existing.syndicateId,
        });
        if (author?.email) {
          sendEmail(
            author.email,
            approved
              ? "Votre document a été approuvé"
              : "Votre document a été rejeté",
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

// GET /documents/:id/versions: see modules/document-library/document-library.routes.ts

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
      const [existing] = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) {
        res.status(404).json({ error: "Document introuvable" });
        return;
      }
      if (
        req.user!.role !== "super_admin" &&
        existing.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const [version] = await db
        .select()
        .from(documentVersionsTable)
        .where(
          and(
            eq(documentVersionsTable.id, versionId),
            eq(documentVersionsTable.documentId, id),
          ),
        );
      if (!version) {
        res.status(404).json({ error: "Version introuvable" });
        return;
      }

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
      const [existing] = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) {
        res.status(404).json({ error: "Document introuvable" });
        return;
      }
      if (
        req.user!.role !== "super_admin" &&
        existing.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      try {
        assertDeletable(existing);
      } catch (e: any) {
        res.status(e.status).json({ error: e.message, code: e.code });
        return;
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

      res.json({
        message: "Document supprimé (conservé pour archivage légal)",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/restore ──────────────────────────────────────────────
// Restore a soft-deleted document (super_admin or syndicate_admin).

router.post(
  "/documents/:id/restore",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      if (
        req.user!.role === "super_admin" &&
        req.query.supervision !== "true"
      ) {
        res.status(403).json({
          error: "La supervision est requise pour restaurer ce document.",
          code: "SUPERVISION_REQUIRED",
        });
        return;
      }
      const [existing] = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "Document introuvable" });
        return;
      }
      if (!existing.isDeleted) {
        res.status(409).json({ error: "Ce document n'est pas supprimé" });
        return;
      }
      if (
        req.user!.role !== "super_admin" &&
        (!req.user!.syndicateId ||
          existing.syndicateId !== req.user!.syndicateId)
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      const [doc] = await db
        .update(documentsTable)
        .set({
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date(),
        } as any)
        .where(
          req.user!.role === "super_admin"
            ? eq(documentsTable.id, id)
            : and(
                eq(documentsTable.id, id),
                eq(documentsTable.syndicateId, req.user!.syndicateId!),
              ),
        )
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
      if (req.query.supervision !== "true") {
        res.status(403).json({
          error: "La supervision est requise pour purger ce document.",
          code: "SUPERVISION_REQUIRED",
        });
        return;
      }
      const [existing] = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "Document introuvable" });
        return;
      }
      if (!existing.isDeleted) {
        res.status(409).json({
          error: "Effectuez d'abord une suppression logique avant de purger",
        });
        return;
      }
      // Nothing is purged before its retention date, nor while it is the
      // evidence of an accounting operation or a claim.
      if (existing.retentionUntil && existing.retentionUntil > new Date()) {
        res.status(409).json({
          error: `Conservation obligatoire jusqu'au ${existing.retentionUntil.toISOString().slice(0, 10)}`,
          code: "RETENTION_ACTIVE",
        });
        return;
      }
      try {
        assertDeletable(existing);
      } catch (e: any) {
        res.status(e.status).json({ error: e.message, code: e.code });
        return;
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

export default router;
