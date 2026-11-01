// documents: requests endpoints (mounted by documents.routes.ts, in order).
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  documentsTable,
  syndicatesTable,
  usersTable,
  buildingsTable,
  lotsTable,
  membersTable,
  templateRequestsTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { generateAndUploadDocument, type DocumentTemplate, type DocumentLanguage } from "../../lib/documentPdf.js";
import { createAlert, sendEmail, sendEmailToMany } from "../../lib/notify.js";
import { computeRetentionUntil } from "../../lib/retention.js";
import {
  buildVerifyUrl,
  generateSequentialDocumentNumber,
  getSyndicateInfo,
  getPropertyInfo,
  getOfficeHolders,
  getLotMemberData,
} from "./documents.service.js";

const router = Router();

// ─── GET /documents/autofill ──────────────────────────────────────────────────
// Returns pre-resolved DB variable values for the authenticated user.
// Registered before /:id so the literal "autofill" path is not captured by the param.

router.get("/documents/autofill", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "super_admin" && !user.syndicateId) {
      res.status(403).json({ error: "Accès refusé : syndicateId manquant" });
      return;
    }
    const syndicateId = user.syndicateId;

    const [syndInfo, property, officeHolders] = await Promise.all([
      getSyndicateInfo(syndicateId),
      getPropertyInfo(syndicateId),
      getOfficeHolders(syndicateId),
    ]);

    // Fetch the first lot owned by a member matching this user's email
    // (members table has no direct userId FK — match by email)
    const lotRows = syndicateId
      ? await db
          .select({ number: lotsTable.number, floor: lotsTable.floor })
          .from(lotsTable)
          .innerJoin(membersTable, eq(lotsTable.ownerId, membersTable.id))
          .where(
            and(
              eq(membersTable.syndicateId, syndicateId),
              eq(membersTable.email, user.email ?? ""),
            ),
          )
          .limit(1)
      : [];
    const memberRow = lotRows[0];

    const today = new Date().toLocaleDateString("fr-FR");
    const year = new Date().getFullYear();

    res.json({
      data: {
        syndicateInfo: {
          syndicate_name: syndInfo.name || null,
          syndicate_address: syndInfo.address || null,
          syndicate_city: syndInfo.city || null,
          syndicate_phone: syndInfo.phone || null,
          syndicate_email: syndInfo.email || null,
          registration_number: syndInfo.registrationNumber || null,
          syndicate_color: syndInfo.logoColor || null,
          bank_name: syndInfo.bankName || null,
          bank_iban: syndInfo.bankIban || null,
          bank_bic: syndInfo.bankBic || null,
        },
        propertyInfo: property
          ? {
              building_name: property.name || null,
              building_address: property.address || null,
              building_city: property.city || null,
              total_lots:
                property.totalLots != null ? String(property.totalLots) : null,
              total_floors:
                property.totalFloors != null
                  ? String(property.totalFloors)
                  : null,
              total_buildings: String(property.totalBuildings),
            }
          : null,
        officeHolders: officeHolders
          ? {
              president_name: officeHolders.president?.fullName ?? null,
              president_email: officeHolders.president?.email ?? null,
              vice_president_name:
                officeHolders.vicePresident?.fullName ?? null,
              secretary_name: officeHolders.secretary?.fullName ?? null,
              treasurer_name: officeHolders.treasurer?.fullName ?? null,
              manager_name: officeHolders.manager?.fullName ?? null,
              manager_phone: officeHolders.manager?.phone ?? null,
            }
          : null,
        memberInfo: {
          member_name: user.name || null,
          member_email: user.email || null,
          lot_number: (memberRow as any)?.number ?? null,
          floor:
            (memberRow as any)?.floor != null
              ? String((memberRow as any).floor)
              : null,
        },
        generated: {
          issue_date: today,
          document_year: String(year),
          document_number: `[Généré automatiquement]`,
        },
      },
    });
  } catch (err) {
    req.log.error(err);
    res
      .status(500)
      .json({ error: "Erreur lors de la résolution des variables" });
  }
});

// ─── POST /documents/request — Self-service document request ─────────────────
// ANY authenticated user (member, tenant, syndicate_admin, super_admin) can
// submit a document request. Syndicate / property / member data is resolved
// automatically from the DB — the requester only provides: templateId,
// category, and an optional note. The document lands in "pending_review"
// and notifies the syndicate admin(s).

router.post("/documents/request", requireAuth, async (req, res) => {
  const schema = z.object({
    templateId: z.string().min(1),
    category: z.enum([
      "reglements",
      "statuts",
      "pv",
      "juridique",
      "finances",
      "attestation",
    ]),
    title: z.string().min(1).max(500).optional(),
    note: z.string().max(2000).optional(),
    language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
    // Free-text context fields the requester can optionally add
    objet: z.string().max(500).optional(),
    periode: z.string().max(200).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ error: "Données invalides", details: result.error.flatten() });
    return;
  }

  try {
    const user = req.user!;
    const syndicateId = user.syndicateId ?? null;
    const { templateId, category, note, language, ...extras } = result.data;
    const docLanguage: DocumentLanguage =
      (language as DocumentLanguage) ?? "fr";

    // 1. Load syndicate/property/office-holders + member's own lot in parallel
    const [syndInfo, property, officeHolders, memberRows] = await Promise.all([
      getSyndicateInfo(syndicateId),
      getPropertyInfo(syndicateId),
      getOfficeHolders(syndicateId),
      syndicateId && user.email
        ? db
            .select({
              memberId: membersTable.id,
              name: membersTable.name,
              email: membersTable.email,
              phone: membersTable.phone,
              lotNumber: lotsTable.number,
              lotId: lotsTable.id,
              floor: lotsTable.floor,
              buildingName: buildingsTable.name,
            })
            .from(membersTable)
            .leftJoin(lotsTable, eq(lotsTable.ownerId, membersTable.id))
            .leftJoin(
              buildingsTable,
              eq(lotsTable.buildingId, buildingsTable.id),
            )
            .where(
              and(
                eq(membersTable.syndicateId, syndicateId),
                eq(membersTable.email, user.email),
              ),
            )
            .limit(1)
        : Promise.resolve([] as any[]),
    ]);

    const member = memberRows?.[0] ?? null;
    const memberName = member?.name ?? user.name ?? null;
    const docTitle =
      result.data.title ??
      `${templateId.replace(/_/g, " ")} — ${memberName ?? user.email ?? "Membre"}`;

    // 2. Sequential number + QR token
    const template = templateId as DocumentTemplate;
    const documentNumber = await generateSequentialDocumentNumber(
      syndicateId,
      template,
    );
    const verificationToken = randomUUID();
    const verificationUrl = buildVerifyUrl(verificationToken);

    // 3. Auto-load lot/member entity data
    let entityData: Record<string, string> = {};
    if (member?.lotId) {
      const lotData = await getLotMemberData(member.lotId, undefined);
      entityData = { ...entityData, ...lotData };
    }
    if (member?.name) entityData.memberName = member.name;
    if (member?.phone) entityData.memberPhone = member.phone;
    if (member?.lotNumber != null)
      entityData.lotNumber = String(member.lotNumber);
    if (member?.buildingName) entityData.buildingName = member.buildingName;

    // 4. Generate PDF in pending_review status
    const generated = await generateAndUploadDocument(template, {
      title: docTitle,
      syndicate: syndInfo,
      property,
      officeHolders,
      memberName: entityData.memberName ?? memberName ?? "",
      documentNumber,
      docStatus: "pending_review",
      version: "v1.0",
      language: docLanguage,
      verificationUrl,
      signatures: [],
      ...entityData,
      ...extras,
      ...(note ? { observations: note } : {}),
    });

    // 5. Insert document record in pending_review
    const createdAt = new Date();
    const [doc] = await db
      .insert(documentsTable)
      .values({
        title: docTitle,
        category,
        status: "pending_review",
        syndicateId,
        // Self-service request: the requester is the person concerned.
        subjectUserId: user.userId,
        size: generated.fileSizeKo,
        fileUrl: generated.fileUrl || null,
        documentNumber: generated.documentNumber,
        templateId: template,
        version: 1,
        isDeleted: false,
        createdBy: user.userId,
        updatedAt: createdAt,
        language: docLanguage,
        verificationToken,
        retentionUntil: computeRetentionUntil(category, template, createdAt),
      } as any)
      .returning();

    // 6. Audit + notify admins
    await serverAuditLog(req, {
      action: "DOCUMENT_REQUESTED",
      entity: "document",
      entityId: doc.id,
      details: `Demande de ${memberName ?? user.email} : ${docTitle} (${template})`,
    });

    if (syndicateId) {
      createAlert({
        key: "document.requested",
        params: { member: memberName ?? user.email, title: docTitle },
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
            "Nouvelle demande de document",
            `<p><strong>${memberName ?? user.email}</strong> a soumis une demande de document :</p><p><strong>${docTitle}</strong></p><p>Veuillez valider depuis l'espace Documents → En attente de validation.</p>`,
            "document_requested",
            syndicateId,
          ),
        )
        .catch(() => {});
    }

    res.status(201).json({
      data: doc,
      message:
        "Votre demande a été soumise. L'administrateur du syndicat en sera informé.",
    });
  } catch (err) {
    req.log.error(err);
    res
      .status(500)
      .json({ error: "Erreur serveur lors de la soumission de la demande" });
  }
});

// ─── GET /documents/template-requests — List template requests ────────────────
// super_admin sees ALL requests; syndicate_admin sees their syndicate's;
// member/tenant sees only their own submissions.

router.get("/documents/template-requests", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    let rows: unknown[];

    if (user.role === "super_admin") {
      rows = await db
        .select({
          id: templateRequestsTable.id,
          title: templateRequestsTable.title,
          category: templateRequestsTable.category,
          description: templateRequestsTable.description,
          businessPurpose: templateRequestsTable.businessPurpose,
          requiredFields: templateRequestsTable.requiredFields,
          legalNotes: templateRequestsTable.legalNotes,
          status: templateRequestsTable.status,
          priority: templateRequestsTable.priority,
          publishScope: templateRequestsTable.publishScope,
          reviewNotes: templateRequestsTable.reviewNotes,
          rejectionReason: templateRequestsTable.rejectionReason,
          reviewedAt: templateRequestsTable.reviewedAt,
          createdAt: templateRequestsTable.createdAt,
          updatedAt: templateRequestsTable.updatedAt,
          requestedByName: usersTable.name,
          requestedByEmail: usersTable.email,
          syndicateName: syndicatesTable.name,
        })
        .from(templateRequestsTable)
        .leftJoin(
          usersTable,
          eq(templateRequestsTable.requestedBy, usersTable.id),
        )
        .leftJoin(
          syndicatesTable,
          eq(templateRequestsTable.syndicateId, syndicatesTable.id),
        )
        .orderBy(desc(templateRequestsTable.createdAt))
        .limit(200);
    } else {
      const where =
        user.role === "syndicate_admin" && user.syndicateId
          ? eq(templateRequestsTable.syndicateId, user.syndicateId)
          : eq(templateRequestsTable.requestedBy, user.userId);

      rows = await db
        .select({
          id: templateRequestsTable.id,
          title: templateRequestsTable.title,
          category: templateRequestsTable.category,
          description: templateRequestsTable.description,
          businessPurpose: templateRequestsTable.businessPurpose,
          status: templateRequestsTable.status,
          priority: templateRequestsTable.priority,
          reviewNotes: templateRequestsTable.reviewNotes,
          rejectionReason: templateRequestsTable.rejectionReason,
          createdAt: templateRequestsTable.createdAt,
          updatedAt: templateRequestsTable.updatedAt,
        })
        .from(templateRequestsTable)
        .where(where)
        .orderBy(desc(templateRequestsTable.createdAt))
        .limit(100);
    }

    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /documents/template-requests — Submit template request ──────────────

router.post("/documents/template-requests", requireAuth, async (req, res) => {
  const schema = z.object({
    title: z.string().min(2).max(300),
    category: z.string().min(1).max(100),
    description: z.string().max(2000).optional(),
    businessPurpose: z.string().max(2000).optional(),
    requiredFields: z
      .array(
        z.object({
          name: z.string(),
          type: z.enum([
            "text",
            "date",
            "number",
            "boolean",
            "select",
          ] as const),
          required: z.boolean().default(false),
        }),
      )
      .optional(),
    legalNotes: z.string().max(2000).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"] as const).optional(),
    publishScope: z.enum(["global", "private"] as const).optional(),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ error: "Données invalides", details: result.error.flatten() });
    return;
  }

  try {
    const user = req.user!;
    const { requiredFields, ...rest } = result.data;

    const [newReq] = await db
      .insert(templateRequestsTable)
      .values({
        requestedBy: user.userId,
        syndicateId: user.syndicateId ?? null,
        requiredFields: JSON.stringify(requiredFields ?? []),
        status: "pending",
        ...rest,
      } as any)
      .returning();

    await serverAuditLog(req, {
      action: "TEMPLATE_REQUEST_SUBMITTED",
      entity: "template_request",
      entityId: newReq.id,
      details: `Titre : ${result.data.title}, Catégorie : ${result.data.category}`,
    });

    // Notify super_admin(s) (fire-and-forget)
    db.select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.role, "super_admin"))
      .then((admins) =>
        sendEmailToMany(
          admins.map((a) => a.email),
          "Nouvelle demande de modèle de document",
          `<p><strong>${user.name ?? user.email}</strong> a soumis une demande de nouveau modèle :</p><p><strong>${result.data.title}</strong> — ${result.data.category}</p>`,
          "template_request_submitted",
          user.syndicateId ?? undefined,
        ),
      )
      .catch(() => {});

    res
      .status(201)
      .json({ data: newReq, message: "Demande de modèle soumise avec succès" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /documents/template-requests/:trId — Admin review ───────────────────
// super_admin only — approves, rejects, or updates a template request.

router.put(
  "/documents/template-requests/:trId",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const trId = String(req.params.trId);
    const schema = z.object({
      status: z
        .enum([
          "pending",
          "in_review",
          "approved",
          "rejected",
          "published",
        ] as const)
        .optional(),
      reviewNotes: z.string().max(2000).optional(),
      rejectionReason: z.string().max(2000).optional(),
      publishScope: z.enum(["global", "private"] as const).optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }

    try {
      const [existing] = await db
        .select()
        .from(templateRequestsTable)
        .where(eq(templateRequestsTable.id, trId));
      if (!existing) {
        res.status(404).json({ error: "Demande introuvable" });
        return;
      }

      const updates: Record<string, unknown> = {
        ...result.data,
        updatedAt: new Date(),
      };
      if (
        result.data.status &&
        ["approved", "rejected", "in_review"].includes(result.data.status)
      ) {
        updates.reviewedBy = req.user!.userId;
        updates.reviewedAt = new Date();
      }

      const [updated] = await db
        .update(templateRequestsTable)
        .set(updates)
        .where(eq(templateRequestsTable.id, trId))
        .returning();

      await serverAuditLog(req, {
        action: "TEMPLATE_REQUEST_REVIEWED",
        entity: "template_request",
        entityId: trId,
        details: `Nouveau statut : ${result.data.status}, Motif : ${result.data.rejectionReason ?? "—"}`,
      });

      // Email the requester on final decision
      if (
        result.data.status === "approved" ||
        result.data.status === "rejected"
      ) {
        const [requester] = await db
          .select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, existing.requestedBy));
        const approved = result.data.status === "approved";
        if (requester?.email) {
          sendEmail(
            requester.email,
            approved
              ? "Votre demande de modèle a été approuvée"
              : "Votre demande de modèle a été rejetée",
            approved
              ? `<p>Bonne nouvelle ! Votre demande de modèle <strong>${existing.title}</strong> a été approuvée et sera prochainement disponible dans la bibliothèque de documents.</p>${result.data.reviewNotes ? `<p>Note de l'équipe : ${result.data.reviewNotes}</p>` : ""}`
              : `<p>Votre demande de modèle <strong>${existing.title}</strong> n'a pas pu être approuvée.</p><p>Motif : ${result.data.rejectionReason ?? "—"}</p>`,
            approved
              ? "template_request_approved"
              : "template_request_rejected",
            existing.syndicateId ?? undefined,
          ).catch(() => {});
        }
      }

      res.json({ data: updated, message: "Demande mise à jour avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
