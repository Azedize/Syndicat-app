import path from "path";
import multer from "multer";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  documentsTable,
  documentVersionsTable,
  lotsTable,
  storageObjectsTable,
  usersTable,
} from "@workspace/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  requireAuth,
  signDocumentLink,
  verifyDocumentLink,
  DOCUMENT_LINK_TTL_SECONDS,
  type JwtPayload,
} from "../../middleware/auth.js";
import { verifyFileSignature } from "../../lib/file-signature.js";
import { serverAuditLog } from "../../lib/audit.js";
import { getPagination, buildPagedResponse } from "../../lib/paginate.js";
import { computeRetentionUntil } from "../../lib/retention.js";
import { FinanceError, sendFinanceError } from "../../lib/treasury.js";
import {
  DOCUMENT_MANAGERS,
  ENTITY_TYPES,
  UPLOAD_CATEGORIES,
  VISIBILITIES,
  canSeeDocument,
  currentViewer,
  documentView,
  documentVisibilityWhere,
  effectiveVisibilitySql,
  entityBelongsTo,
  type EntityType,
} from "../../lib/document-access.js";
import {
  StorageUnavailableError,
  discardStoredFile,
  sendStoredObject,
  sha256,
  storeVerifiedFile,
} from "../../lib/file-store.js";

/**
 * Document library: files the team adds to the condominium (minutes,
 * contracts, insurance, notices, financial documents…), each with ONE
 * audience and an optional link to a record. Generated documents live in the
 * same table and share the listing, the audiences and the secure download.
 *
 *   POST /documents/upload              add a file (published only once stored)
 *   GET  /documents                     search, filters, sort, pagination
 *   GET  /documents/:id/download-url    5-minute link for one person & version
 *   GET  /documents/:id/file            the file (header session or link)
 *   POST /documents/:id/file            replace the file (old version kept)
 *   GET  /documents/:id/versions        history (team)
 *   POST /documents/:id/archive|unarchive
 */
const router = Router();

const MAX_LIBRARY_FILE = 25 * 1024 * 1024;
/** Formats accepted in the library: documents and photos — no archives, no video, no HTML/SVG. */
const LIBRARY_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);
const INLINE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "text/plain"]);
const UPLOADERS = new Set([...DOCUMENT_MANAGERS, "treasurer"]);

// File names are UTF-8 (accents, Arabic): busboy's default (latin1) would garble them.
const memory = multer({ storage: multer.memoryStorage(), defParamCharset: "utf8", limits: { fileSize: MAX_LIBRARY_FILE, files: 1, fields: 20 } });

/** Multipart parsing with useful errors (too large, interrupted, several files). */
function receiveFile(req: Request, res: Response, next: NextFunction) {
  memory.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as any)?.code;
    if (code === "LIMIT_FILE_SIZE") {
      return void res.status(413).json({ error: `Fichier trop volumineux (25 Mo maximum)`, code: "FILE_TOO_LARGE" });
    }
    if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") {
      return void res.status(400).json({ error: "Un seul fichier, dans le champ « file »", code: "ONE_FILE_EXPECTED" });
    }
    return void res.status(400).json({ error: "Envoi interrompu ou incomplet : réessayez", code: "UPLOAD_INCOMPLETE" });
  });
}

const textField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), { message: "Caractères de contrôle interdits" });

const metaSchema = z
  .object({
    title: textField(200).pipe(z.string().min(2, "Le titre est obligatoire")),
    category: z.enum(UPLOAD_CATEGORIES, { errorMap: () => ({ message: "Catégorie inconnue" }) }),
    description: textField(2000).optional(),
    visibility: z.enum(VISIBILITIES, { errorMap: () => ({ message: "Niveau d'accès inconnu" }) }),
    entityType: z.enum(ENTITY_TYPES as [EntityType, ...EntityType[]]).optional(),
    entityId: z.string().trim().min(1).max(100).optional(),
    lotId: z.string().trim().min(1).max(100).optional(),
    subjectUserId: z.string().trim().min(1).max(100).optional(),
    publish: z.enum(["true", "false"]).default("true"),
    allowDuplicate: z.enum(["true", "false"]).default("false"),
  })
  .strict()
  .refine((d) => !!d.entityType === !!d.entityId, { message: "Type et identifiant de la fiche liée vont ensemble", path: ["entityId"] });

/** Validates the bytes: allowed format, matching content, not empty. */
function checkFile(file: Express.Multer.File | undefined) {
  if (!file) throw new FinanceError(400, "FILE_REQUIRED", "Aucun fichier reçu");
  if (file.size === 0) throw new FinanceError(400, "FILE_EMPTY", "Le fichier est vide");
  const verified = verifyFileSignature(file.buffer, file.mimetype || "");
  if (!verified) {
    throw new FinanceError(415, "FILE_TYPE_MISMATCH", "Le contenu du fichier ne correspond pas à un format autorisé (PDF, image, Word, Excel, texte).");
  }
  if (!LIBRARY_TYPES.has(verified.mime)) {
    throw new FinanceError(415, "FILE_TYPE_NOT_ALLOWED", "Format non accepté dans la bibliothèque (archives et vidéos exclues)");
  }
  const original = path.basename(file.originalname || "").replace(/[\u0000-\u001f]/g, "").slice(0, 200);
  // The stored name keeps the client's base name but the VERIFIED extension.
  const base = original.replace(/\.[^.]*$/, "") || "document";
  return { verified, fileName: `${base}${verified.ext}` };
}

function syndicateOf(req: Request): string {
  const sid = req.user!.syndicateId;
  if (!sid || req.user!.role === "super_admin") throw new FinanceError(403, "FORBIDDEN", "Action réservée à l'équipe de la copropriété");
  return sid;
}

async function loadDocument(id: string, sid: string) {
  const [doc] = await db.select().from(documentsTable).where(and(eq(documentsTable.id, id), eq(documentsTable.syndicateId, sid)));
  if (!doc || doc.isDeleted) throw new FinanceError(404, "DOCUMENT_NOT_FOUND", "Document introuvable");
  return doc;
}

/** Path of the current file of a document (generated PDF, or upload). */
function fileOf(doc: typeof documentsTable.$inferSelect): string | null {
  if (doc.fileUrl) return doc.fileUrl;
  if (doc.source === "upload" && doc.content?.startsWith("/objects/")) return doc.content;
  return null;
}

// ─── Upload ─────────────────────────────────────────────────────────────────

router.post("/documents/upload", requireAuth, receiveFile, async (req, res) => {
  try {
    const sid = syndicateOf(req);
    if (!UPLOADERS.has(req.user!.role)) throw new FinanceError(403, "FORBIDDEN", "Seuls le syndic, le président, le secrétaire et le trésorier ajoutent des documents");
    const parsed = metaSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return void res.status(400).json({ error: i?.message ?? "Données invalides", field: i?.path.join("."), code: "INVALID_DOCUMENT" });
    }
    const m = parsed.data;
    if (req.user!.role === "treasurer" && m.category !== "financier") {
      throw new FinanceError(403, "FORBIDDEN", "Le trésorier ajoute des documents financiers uniquement");
    }
    const { verified, fileName } = checkFile(req.file);

    // Every reference must belong to this condominium.
    if (m.entityType && !(await entityBelongsTo(m.entityType, m.entityId!, sid))) {
      throw new FinanceError(400, "FOREIGN_REFERENCE", "Fiche liée introuvable dans cette copropriété");
    }
    let lotId = m.lotId ?? (m.entityType === "lot" ? m.entityId : undefined);
    if (m.visibility === "unit") {
      if (!lotId) throw new FinanceError(400, "LOT_REQUIRED", "Choisissez le lot concerné");
      if (!(await entityBelongsTo("lot", lotId, sid))) throw new FinanceError(400, "FOREIGN_REFERENCE", "Lot introuvable dans cette copropriété");
    } else {
      lotId = m.lotId && (await entityBelongsTo("lot", m.lotId, sid)) ? m.lotId : undefined;
      if (m.lotId && !lotId) throw new FinanceError(400, "FOREIGN_REFERENCE", "Lot introuvable dans cette copropriété");
    }
    if (m.visibility === "personal") {
      if (!m.subjectUserId) throw new FinanceError(400, "SUBJECT_REQUIRED", "Choisissez la personne concernée");
      const [subject] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, m.subjectUserId), eq(usersTable.syndicateId, sid)));
      if (!subject) throw new FinanceError(400, "FOREIGN_REFERENCE", "Personne introuvable dans cette copropriété");
    } else if (m.subjectUserId) {
      throw new FinanceError(400, "SUBJECT_ONLY_PERSONAL", "Une personne concernée implique l'accès « personnel »");
    }

    const checksum = sha256(req.file!.buffer);
    if (m.allowDuplicate !== "true") {
      const [dup] = await db
        .select({ id: documentsTable.id, title: documentsTable.title })
        .from(documentsTable)
        .where(and(eq(documentsTable.syndicateId, sid), eq(documentsTable.checksum, checksum), eq(documentsTable.isDeleted, false)))
        .limit(1);
      if (dup) {
        return void res.status(409).json({ error: `Ce fichier est déjà dans la bibliothèque (« ${dup.title} »)`, code: "DOCUMENT_DUPLICATE", existingId: dup.id });
      }
    }

    // 1. bytes  2. metadata. The document exists (and is listed) only when both succeeded.
    let stored: { objectPath: string; diskPath: string };
    try {
      stored = await storeVerifiedFile(req.file!.buffer, verified);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        req.log.error({ err: err.cause }, "document storage write failed");
        return void res.status(503).json({ error: "Le stockage des fichiers est indisponible : rien n'a été enregistré, réessayez plus tard.", code: "STORAGE_UNAVAILABLE" });
      }
      throw err;
    }
    let doc: typeof documentsTable.$inferSelect;
    try {
      doc = await db.transaction(async (tx) => {
        await tx.insert(storageObjectsTable).values({
          objectPath: stored.objectPath,
          ownerId: req.user!.userId,
          syndicateId: sid,
          originalName: fileName,
          contentType: verified.mime,
          size: req.file!.size,
        });
        const [row] = await tx
          .insert(documentsTable)
          .values({
            syndicateId: sid,
            source: "upload",
            title: m.title,
            category: m.category,
            description: m.description || null,
            visibility: m.visibility,
            entityType: m.entityType ?? null,
            entityId: m.entityId ?? null,
            lotId: lotId ?? null,
            subjectUserId: m.subjectUserId ?? null,
            status: m.publish === "true" ? "published" : "draft",
            publishedAt: m.publish === "true" ? new Date() : null,
            fileUrl: stored.objectPath,
            fileName,
            mimeType: verified.mime,
            sizeBytes: req.file!.size,
            size: String(req.file!.size),
            checksum,
            createdBy: req.user!.userId,
            retentionUntil: computeRetentionUntil(m.category, null),
          })
          .returning();
        return row;
      });
    } catch (err) {
      await discardStoredFile(stored.diskPath);
      throw err;
    }
    await serverAuditLog(req, {
      action: "DOCUMENT_UPLOADED",
      entity: "document",
      entityId: doc.id,
      syndicateId: sid,
      details: `${doc.title} — ${doc.category} — ${doc.visibility} — ${fileName} (${req.file!.size} o)${doc.entityType ? ` — ${doc.entityType}:${doc.entityId}` : ""}`,
    });
    res.status(201).json({ data: documentView(doc, req.user!) });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Search ─────────────────────────────────────────────────────────────────

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  status: z.string().trim().max(30).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  source: z.enum(["generated", "upload"]).optional(),
  entityType: z.enum(ENTITY_TYPES as [EntityType, ...EntityType[]]).optional(),
  entityId: z.string().trim().max(100).optional(),
  lotId: z.string().trim().max(100).optional(),
  // Documents generated for a meeting (its minutes, its notice): stored in generation_params.
  meetingId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["recent", "oldest", "title", "-title", "largest"]).default("recent"),
  includeArchived: z.enum(["true", "false"]).default("false"),
});

router.get("/documents", requireAuth, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "Filtres invalides", code: "INVALID_FILTER" });
  const q = parsed.data;
  const user = req.user!;
  const pagination = getPagination(req, 100);
  try {
    if (user.role !== "super_admin" && !user.syndicateId) return void res.status(403).json({ error: "Accès refusé : syndicateId manquant" });
    const c: SQL[] = [eq(documentsTable.isDeleted, false), await documentVisibilityWhere(user)];
    if (user.syndicateId) c.push(eq(documentsTable.syndicateId, user.syndicateId));
    if (q.status) c.push(eq(documentsTable.status, q.status));
    else if (q.includeArchived !== "true") c.push(sql`${documentsTable.status} IS DISTINCT FROM 'archived'`);
    if (q.visibility) c.push(sql`${effectiveVisibilitySql} = ${q.visibility}`);
    if (q.source) c.push(eq(documentsTable.source, q.source));
    if (q.entityType) c.push(eq(documentsTable.entityType, q.entityType));
    if (q.entityId) c.push(eq(documentsTable.entityId, q.entityId));
    if (q.lotId) c.push(eq(documentsTable.lotId, q.lotId));
    if (q.meetingId) c.push(sql`${documentsTable.generationParams}->>'meetingId' = ${q.meetingId}`);
    if (q.from) c.push(gte(documentsTable.createdAt, new Date(`${q.from}T00:00:00Z`)));
    if (q.to) c.push(lte(documentsTable.createdAt, new Date(`${q.to}T23:59:59.999Z`)));
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      c.push(sql`(${documentsTable.title} ILIKE ${like} OR ${documentsTable.description} ILIKE ${like} OR ${documentsTable.fileName} ILIKE ${like} OR ${documentsTable.documentNumber} ILIKE ${like})`);
    }
    // Category counts ignore the category filter (to show the other tabs).
    const facetWhere = and(...c);
    if (q.category) c.push(eq(documentsTable.category, q.category));
    const where = and(...c);
    const order =
      q.sort === "oldest" ? [asc(documentsTable.createdAt)]
      : q.sort === "title" ? [asc(documentsTable.title)]
      : q.sort === "-title" ? [desc(documentsTable.title)]
      : q.sort === "largest" ? [sql`${documentsTable.sizeBytes} DESC NULLS LAST`]
      : [desc(documentsTable.createdAt)];
    const [rows, [{ value: total }], categories] = await Promise.all([
      db.select().from(documentsTable).where(where).orderBy(...order, desc(documentsTable.id)).limit(pagination.limit).offset(pagination.offset),
      db.select({ value: count() }).from(documentsTable).where(where),
      db
        .select({ category: documentsTable.category, n: sql<number>`COUNT(*)::int` })
        .from(documentsTable)
        .where(facetWhere)
        .groupBy(documentsTable.category),
    ]);
    // Unit number of unit-level documents (rows already filtered by audience).
    const lotIds = [...new Set(rows.map((r) => r.lotId).filter((x): x is string => !!x))];
    const lotNumbers = new Map(
      lotIds.length ? (await db.select({ id: lotsTable.id, n: lotsTable.number }).from(lotsTable).where(inArray(lotsTable.id, lotIds))).map((l) => [l.id, l.n]) : [],
    );
    res.json({
      ...buildPagedResponse(rows.map((r) => ({ ...documentView(r, user), lotNumber: r.lotId ? (lotNumbers.get(r.lotId) ?? null) : null })), Number(total), pagination),
      categories,
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Secure download ──────────────────────────────────────────────────────────

/** 5-minute link for this person and this version (team: an older version with ?versionId=). */
router.get("/documents/:id/download-url", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc || doc.isDeleted) throw new FinanceError(404, "DOCUMENT_NOT_FOUND", "Document introuvable");
    if (user.role === "super_admin") throw new FinanceError(403, "SUPERVISION_REQUIRED", "La consultation d'un document passe par la copropriété");
    if (!(await canSeeDocument(user, doc))) throw new FinanceError(404, "DOCUMENT_NOT_FOUND", "Document introuvable");
    let versionId: string | undefined;
    let fileName = doc.fileName ?? `${doc.documentNumber ?? doc.id}.pdf`;
    if (typeof req.query.versionId === "string") {
      if (!["syndicate_admin", "president", "treasurer", "secretary", "committee_member"].includes(user.role)) {
        throw new FinanceError(403, "FORBIDDEN", "L'historique des versions est réservé à l'équipe");
      }
      const [v] = await db.select().from(documentVersionsTable).where(and(eq(documentVersionsTable.id, req.query.versionId), eq(documentVersionsTable.documentId, id)));
      if (!v?.fileUrl) throw new FinanceError(404, "VERSION_NOT_FOUND", "Version introuvable ou sans fichier");
      versionId = v.id;
      fileName = v.fileName ?? fileName;
    } else if (!fileOf(doc)) {
      throw new FinanceError(404, "NO_FILE", "Aucun fichier pour ce document");
    }
    const link = signDocumentLink({ userId: user.userId, documentId: id, version: doc.version ?? 1, versionId });
    const base = process.env.PUBLIC_APP_URL ?? `${req.protocol}://${req.get("host")}`;
    res.json({
      url: `${base}/api/documents/${encodeURIComponent(id)}/file?link=${encodeURIComponent(link)}`,
      expiresIn: DOCUMENT_LINK_TTL_SECONDS,
      filename: fileName,
      mimeType: versionId ? undefined : doc.mimeType ?? "application/pdf",
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/**
 * The file itself. Authorized by the session (Authorization header / download
 * ticket) or by a document link; either way the person's CURRENT access is
 * checked against the document's audience before any byte is sent.
 */
router.get("/documents/:id/file", async (req, res) => {
  try {
    const id = String(req.params.id);
    let viewer: JwtPayload | null = req.user ?? null;
    let versionId = typeof req.query.versionId === "string" ? req.query.versionId : undefined;
    let linkVersion: number | undefined;
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (typeof req.query.link === "string") {
      const link = verifyDocumentLink(req.query.link);
      if (link === "expired") throw new FinanceError(410, "LINK_EXPIRED", "Ce lien a expiré : rouvrez le document depuis l'application");
      if (link === "invalid") throw new FinanceError(401, "LINK_INVALID", "Lien invalide");
      if (link.documentId !== id) throw new FinanceError(403, "LINK_MISMATCH", "Ce lien ne correspond pas à ce document");
      if (!doc || doc.isDeleted) throw new FinanceError(404, "DOCUMENT_NOT_FOUND", "Document introuvable");
      viewer = await currentViewer(link.userId, doc.syndicateId);
      if (!viewer) throw new FinanceError(403, "ACCESS_REVOKED", "Votre accès à cette copropriété a été retiré");
      versionId = link.versionId;
      linkVersion = link.version;
    }
    if (!viewer) throw new FinanceError(401, "AUTH_REQUIRED", "Authentification requise");
    if (!doc || doc.isDeleted) throw new FinanceError(404, "DOCUMENT_NOT_FOUND", "Document introuvable");
    if (viewer.role === "super_admin") {
      if (req.query.supervision !== "true" || req.query.syndicateId !== doc.syndicateId) {
        throw new FinanceError(403, "SUPERVISION_REQUIRED", "La supervision est requise pour accéder à ce document.");
      }
    } else if (!(await canSeeDocument(viewer, doc))) {
      // Same answer as a missing id: no hint that the document exists.
      throw new FinanceError(404, "DOCUMENT_NOT_FOUND", "Document introuvable");
    }
    let objectPath = fileOf(doc);
    let mime = doc.mimeType ?? "application/pdf";
    let fileName = doc.fileName ?? `${doc.documentNumber ?? doc.id}.pdf`;
    if (versionId) {
      if (!["syndicate_admin", "president", "treasurer", "secretary", "committee_member"].includes(viewer.role) && viewer.role !== "super_admin") {
        throw new FinanceError(403, "FORBIDDEN", "L'historique des versions est réservé à l'équipe");
      }
      const [v] = await db.select().from(documentVersionsTable).where(and(eq(documentVersionsTable.id, versionId), eq(documentVersionsTable.documentId, id)));
      if (!v?.fileUrl) throw new FinanceError(404, "VERSION_NOT_FOUND", "Version introuvable ou sans fichier");
      objectPath = v.fileUrl;
      mime = v.mimeType ?? mime;
      fileName = v.fileName ?? fileName;
    } else if (linkVersion !== undefined && linkVersion !== (doc.version ?? 1)) {
      throw new FinanceError(409, "LINK_OUTDATED", "Le document a été remplacé depuis : rouvrez-le pour obtenir la version à jour");
    }
    if (!objectPath) throw new FinanceError(404, "NO_FILE", "Aucun fichier pour ce document");
    const inline = req.query.inline === "1" && INLINE_TYPES.has(mime);
    const sent = await sendStoredObject(objectPath, res, { contentType: mime, fileName, inline });
    if (!sent) {
      req.log.error({ documentId: id, versionId }, "document file missing from storage");
      throw new FinanceError(404, "STORAGE_OBJECT_MISSING", "Le fichier de ce document est introuvable dans le stockage. Prévenez le syndic : il peut le remplacer.");
    }
    // Downloads through a link are attributed to the person the link was issued to.
    req.user ??= viewer;
    void serverAuditLog(req, {
      action: "DOCUMENT_DOWNLOAD",
      entity: "document",
      entityId: id,
      syndicateId: doc.syndicateId ?? undefined,
      details: `${doc.title}${versionId ? ` (version ${versionId})` : ""}`,
    }).catch(() => {});
  } catch (err) {
    if (res.headersSent) return void res.end();
    sendFinanceError(res, req, err);
  }
});

// ─── Replace / versions / archive ─────────────────────────────────────────────

router.post("/documents/:id/file", requireAuth, receiveFile, async (req, res) => {
  try {
    const sid = syndicateOf(req);
    const reason = typeof req.body?.changeReason === "string" ? req.body.changeReason.trim().slice(0, 300) : "";
    if (reason.length < 3) throw new FinanceError(400, "REASON_REQUIRED", "Indiquez pourquoi le fichier est remplacé");
    const current = await loadDocument(String(req.params.id), sid);
    const isManager = DOCUMENT_MANAGERS.has(req.user!.role);
    if (!isManager && current.createdBy !== req.user!.userId) throw new FinanceError(403, "FORBIDDEN", "Seuls le syndic, le président, le secrétaire ou l'auteur remplacent un fichier");
    if (current.source !== "upload") throw new FinanceError(409, "GENERATED_DOCUMENT", "Un document généré se modifie depuis son modèle");
    if (current.status === "archived") throw new FinanceError(409, "DOCUMENT_ARCHIVED", "Document archivé : désarchivez-le d'abord");
    const { verified, fileName } = checkFile(req.file);
    const checksum = sha256(req.file!.buffer);
    if (checksum === current.checksum) throw new FinanceError(409, "SAME_FILE", "C'est le même fichier que la version actuelle");
    let stored: { objectPath: string; diskPath: string };
    try {
      stored = await storeVerifiedFile(req.file!.buffer, verified);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        return void res.status(503).json({ error: "Le stockage des fichiers est indisponible : la version actuelle est inchangée.", code: "STORAGE_UNAVAILABLE" });
      }
      throw err;
    }
    let updated: typeof documentsTable.$inferSelect;
    try {
      updated = await db.transaction(async (tx) => {
        const [doc] = await tx.select().from(documentsTable).where(eq(documentsTable.id, current.id)).for("update");
        if ((doc.version ?? 1) !== (current.version ?? 1)) throw new FinanceError(409, "DOCUMENT_CHANGED", "Le document a changé entre-temps : rechargez-le");
        // The previous file is kept as a version (never deleted while retained).
        await tx.insert(documentVersionsTable).values({
          documentId: doc.id,
          versionNumber: doc.version ?? 1,
          title: doc.title,
          content: null,
          status: doc.status,
          fileUrl: doc.fileUrl,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          checksum: doc.checksum,
          modifiedBy: req.user!.userId,
          changeReason: reason,
        });
        await tx.insert(storageObjectsTable).values({
          objectPath: stored.objectPath,
          ownerId: req.user!.userId,
          syndicateId: sid,
          originalName: fileName,
          contentType: verified.mime,
          size: req.file!.size,
        });
        const [row] = await tx
          .update(documentsTable)
          .set({
            fileUrl: stored.objectPath,
            fileName,
            mimeType: verified.mime,
            sizeBytes: req.file!.size,
            size: String(req.file!.size),
            checksum,
            version: (doc.version ?? 1) + 1,
            updatedAt: new Date(),
          })
          .where(eq(documentsTable.id, doc.id))
          .returning();
        return row;
      });
    } catch (err) {
      await discardStoredFile(stored.diskPath);
      throw err;
    }
    await serverAuditLog(req, {
      action: "DOCUMENT_FILE_REPLACED",
      entity: "document",
      entityId: updated.id,
      syndicateId: sid,
      details: `v${(updated.version ?? 2) - 1} → v${updated.version} — ${reason} — ${current.fileName ?? "?"} → ${fileName}`,
    });
    res.json({ data: documentView(updated, req.user!) });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.get("/documents/:id/versions", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, String(req.params.id)));
    if (!doc || doc.isDeleted || (user.role !== "super_admin" && !(await canSeeDocument(user, doc)))) {
      throw new FinanceError(404, "DOCUMENT_NOT_FOUND", "Document introuvable");
    }
    if (!["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "super_admin"].includes(user.role)) {
      throw new FinanceError(403, "FORBIDDEN", "L'historique des versions est réservé à l'équipe");
    }
    const rows = await db
      .select({ v: documentVersionsTable, modifiedByName: usersTable.name })
      .from(documentVersionsTable)
      .leftJoin(usersTable, eq(usersTable.id, documentVersionsTable.modifiedBy))
      .where(eq(documentVersionsTable.documentId, doc.id))
      .orderBy(desc(documentVersionsTable.versionNumber));
    res.json({
      data: rows.map(({ v, modifiedByName }) => ({ ...v, modifiedByName, content: undefined, fileUrl: undefined, hasFile: !!v.fileUrl })),
      currentVersion: doc.version ?? 1,
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

router.post("/documents/:id/archive", requireAuth, async (req, res) => {
  try {
    const sid = syndicateOf(req);
    if (!DOCUMENT_MANAGERS.has(req.user!.role)) throw new FinanceError(403, "FORBIDDEN", "Réservé au syndic, au président et au secrétaire");
    const parsed = reasonSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new FinanceError(400, "REASON_REQUIRED", "Un motif d'archivage est obligatoire");
    await loadDocument(String(req.params.id), sid);
    // Archiving hides the document from residents; file, versions and links
    // to records (payments, claims…) stay untouched.
    const [row] = await db
      .update(documentsTable)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documentsTable.id, String(req.params.id)), eq(documentsTable.syndicateId, sid), sql`${documentsTable.status} IS DISTINCT FROM 'archived'`))
      .returning();
    if (!row) throw new FinanceError(409, "ALREADY_ARCHIVED", "Document déjà archivé");
    await serverAuditLog(req, { action: "DOCUMENT_ARCHIVED", entity: "document", entityId: row.id, syndicateId: sid, details: `${row.title} — ${parsed.data.reason}` });
    res.json({ data: documentView(row, req.user!) });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.post("/documents/:id/unarchive", requireAuth, async (req, res) => {
  try {
    const sid = syndicateOf(req);
    if (!DOCUMENT_MANAGERS.has(req.user!.role)) throw new FinanceError(403, "FORBIDDEN", "Réservé au syndic, au président et au secrétaire");
    await loadDocument(String(req.params.id), sid);
    const [row] = await db
      .update(documentsTable)
      .set({ status: "published", archivedAt: null, updatedAt: new Date() })
      .where(and(eq(documentsTable.id, String(req.params.id)), eq(documentsTable.status, "archived")))
      .returning();
    if (!row) throw new FinanceError(409, "NOT_ARCHIVED", "Ce document n'est pas archivé");
    await serverAuditLog(req, { action: "DOCUMENT_UNARCHIVED", entity: "document", entityId: row.id, syndicateId: sid, details: row.title });
    res.json({ data: documentView(row, req.user!) });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

export default router;
