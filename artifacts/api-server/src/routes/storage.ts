/**
 * Storage routes — JWT-auth-protected file upload/serve.
 *
 * Upload strategy (local vs cloud):
 *   Multipart uploads are saved to the local filesystem. The GET serving route
 *   tries configured Google Cloud Storage first and falls back to local files.
 */
import { Readable } from "stream";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage.js";
import { requireAuth, softAuth } from "../middleware/auth.js";
import { verifyFileSignature } from "../lib/file-signature.js";
import { canSeeDocument } from "../lib/document-access.js";
import { canReadSharedObject } from "../lib/file-access.js";
import { db } from "@workspace/db";
import {
  documentsTable,
  storageObjectsTable,
} from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";

/** Workspace-relative directory for locally-stored uploads (dev fallback). */
const LOCAL_UPLOADS_DIR = path.resolve(process.env.LOCAL_UPLOADS_DIR ?? "uploads");

async function ensureUploadsDir() {
  try {
    await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
  } catch {}
}

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
  ".avif",
]);

const CONTENT_TYPE_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

/**
 * Detect image content-type from file magic bytes.
 * Called when the filename has no recognised extension (e.g. files uploaded
 * from Expo Web where the blob URI produces no usable extension).
 */
function detectImageContentType(buf: Buffer): string | null {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  // PNG: 89 50 4E 47
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "image/png";
  // GIF: 47 49 46 38 (GIF8)
  if (
    buf.length >= 4 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  )
    return "image/gif";
  // WEBP: RIFF????WEBP
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  // HEIC/HEIF: ftyp box at offset 4 with "heic" or "hei" brand
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12).toLowerCase();
    if (brand.startsWith("hei") || brand === "mif1" || brand === "avif")
      return "image/heic";
  }
  return null;
}

/** Serve a file from the local uploads directory. */
async function serveLocalFile(
  filename: string,
  res: Response,
): Promise<boolean> {
  const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    let contentType = CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";
    let isImage = IMAGE_EXTENSIONS.has(ext);

    // Files uploaded from Expo Web often have no extension because blob URIs
    // yield no usable suffix. Peek at magic bytes to recover the real type.
    if (contentType === "application/octet-stream") {
      const detected = detectImageContentType(data);
      if (detected) {
        contentType = detected;
        isImage = true;
      }
    }

    res.setHeader("Content-Type", contentType);
    // Images: long cache + inline display. Non-images: prompt download.
    if (isImage) {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", "inline");
    } else {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(filename)}"`,
      );
    }
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Length", String(data.byteLength));
    res.send(data);
    return true;
  } catch {
    return false;
  }
}

const router: IRouter = Router();
const storage = new ObjectStorageService();

const ALLOWED_CONTENT_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic", // iOS default camera format
  "image/heif",
  "image/avif",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  // Archives & misc
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  // Video (short clips)
  "video/mp4",
  "video/quicktime",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — matches mobile upload.ts

// ─── POST /storage/uploads ────────────────────────────────────────────────────
// Direct multipart upload (development-safe fallback).
// Client sends the file as multipart/form-data with field name "file".
// Server saves to workspace filesystem and returns objectPath in the same
// format as the GCS presigned-URL flow: "/objects/uploads/<uuid><ext>"

const upload = multer({
  // UTF-8 file names (accents, Arabic) instead of busboy's latin1 default.
  defParamCharset: "utf8",
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_CONTENT_TYPES.has(file.mimetype));
  },
});

router.post(
  "/storage/uploads",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Aucun fichier reçu" });
        return;
      }
      // The declared MIME type passed the allow-list, but it is client
      // controlled: the bytes must match it, and the stored extension/type
      // come from the verified content, never from the client's file name.
      const verified = verifyFileSignature(req.file.buffer, req.file.mimetype);
      if (!verified) {
        res.status(415).json({
          error: "Le contenu du fichier ne correspond pas à un format autorisé.",
          code: "FILE_TYPE_MISMATCH",
        });
        return;
      }
      await ensureUploadsDir();
      const filename = `${randomUUID()}${verified.ext}`;
      const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
      await fs.writeFile(filePath, req.file.buffer);
      const objectPath = `/objects/uploads/${filename}`;
      // Keep the display name only (no path), bounded in length.
      const originalName =
        path.basename(req.file.originalname || "").slice(0, 200) || null;
      try {
        await db.insert(storageObjectsTable).values({
          objectPath,
          ownerId: req.user!.userId,
          syndicateId: req.user!.syndicateId ?? null,
          originalName,
          contentType: verified.mime,
          size: req.file.size,
        });
      } catch (err) {
        await fs.unlink(filePath).catch(() => {});
        throw err;
      }
      res.json({
        objectPath,
        fileName: originalName,
        contentType: verified.mime,
        size: req.file.size,
      });
    } catch (err) {
      req.log.error({ err }, "Error saving upload");
      res
        .status(500)
        .json({ error: "Erreur lors de l'enregistrement du fichier" });
    }
  },
);

// ─── POST /storage/uploads/request-url ───────────────────────────────────────
// Legacy presigned-URL endpoint (works only in deployed environments where the
// GCS sidecar provides real credentials). Kept for backward compatibility.

const requestUrlSchema = z.object({
  name: z.string().min(1).max(500),
  size: z.number().positive().max(MAX_FILE_SIZE, "File too large (max 20 MB)"),
  contentType: z
    .string()
    .min(1)
    .max(200)
    .refine((ct) => ALLOWED_CONTENT_TYPES.has(ct), {
      message: "Content type not allowed. Supported: PDF, JPG, PNG, DOCX",
    }),
  documentCategory: z
    .enum([
      "reglements",
      "statuts",
      "pv",
      "juridique",
      "finances",
      "attestation",
    ])
    .optional(),
  documentTitle: z.string().max(500).optional(),
});

router.post(
  "/storage/uploads/request-url",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = requestUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Données invalides",
      });
      return;
    }
    try {
      const { name, size, contentType, documentCategory } = parsed.data;
      // Creating the document before its file exists listed documents with
      // no file (and let any account create one): library files go through
      // POST /documents/upload, which stores the file first.
      if (documentCategory) {
        res.status(410).json({ error: "Utilisez POST /documents/upload pour ajouter un document", code: "USE_DOCUMENT_UPLOAD" });
        return;
      }
      const uploadURL = await storage.getObjectEntityUploadURL();
      const objectPath = storage.normalizeObjectEntityPath(uploadURL);

      await db.insert(storageObjectsTable).values({
        objectPath,
        ownerId: req.user!.userId,
        syndicateId: req.user!.syndicateId ?? null,
        originalName: name,
        contentType,
        size,
      });

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (err) {
      req.log.error({ err }, "Error generating upload URL");
      res.status(500).json({ error: "Impossible de générer l'URL d'upload" });
    }
  },
);

// ─── PATCH /storage/documents/:id/confirm ────────────────────────────────────
// After the client finishes uploading to GCS, call this to mark the document
// as published and optionally update its title.

router.patch("/storage/documents/:id/confirm", requireAuth, (_req: Request, res: Response) => {
  // Retired: it published a document without checking that its file existed,
  // and let a resident publish to the whole condominium.
  res.status(410).json({ error: "Utilisez POST /documents/upload", code: "USE_DOCUMENT_UPLOAD" });
});

/**
 * Files are displayed by the web app from another origin (<img>, <video>):
 * helmet's default Cross-Origin-Resource-Policy "same-origin" made the browser
 * drop them. Access is still decided by the handlers below (download ticket or
 * JWT, then the record that uses the file), never by the requesting origin.
 */
function allowCrossOriginEmbedding(_req: Request, res: Response, next: () => void) {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}

// ─── GET /storage/public-objects/* ───────────────────────────────────────────
// Serve public assets (no auth required).

router.get(
  "/storage/public-objects/*filePath",
  allowCrossOriginEmbedding,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await storage.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "Fichier introuvable" });
        return;
      }
      const response = await storage.downloadObject(file);
      res.status(response.status);
      response.headers.forEach((v, k) => res.setHeader(k, v));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("PUBLIC_OBJECT_SEARCH_PATHS not set")
      ) {
        // Public storage is an optional deployment resource. When no public
        // bucket is configured, fail closed as a missing asset rather than
        // turning every public-object request into a server error.
        res.status(404).json({ error: "Fichier introuvable" });
        return;
      }
      req.log.error({ err }, "Error serving public object");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /storage/objects/* ──────────────────────────────────────────────────
// Serve uploaded objects.
// Uploaded objects are private. A random UUID is not an authorization boundary:
// callers must present a valid JWT and match the durable owner/syndicate record.

router.get(
  "/storage/objects/*path",
  allowCrossOriginEmbedding,
  softAuth,
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;

      const [ownedObject] = await db
        .select()
        .from(storageObjectsTable)
        .where(eq(storageObjectsTable.objectPath, objectPath))
        .limit(1);

      // Document-linked objects may predate storage ownership records. Keep
      // their existing row-level authorization while legacy records are
      // gradually migrated through the upload/document workflows.
      const docs = await db
        .select({
          id: documentsTable.id,
          syndicateId: documentsTable.syndicateId,
          createdBy: documentsTable.createdBy,
          category: documentsTable.category,
          status: documentsTable.status,
          isDeleted: documentsTable.isDeleted,
          subjectUserId: documentsTable.subjectUserId,
          visibility: documentsTable.visibility,
          lotId: documentsTable.lotId,
        })
        .from(documentsTable)
        .where(
          or(
            eq(documentsTable.content, objectPath),
            eq(documentsTable.fileUrl, objectPath),
          ),
        );

      // Generic uploads use owner/syndicate authorization. Document objects
      // deliberately skip this branch because documents have their own
      // stricter resource-level policy below.
      if (ownedObject && docs.length === 0) {
        if (!req.user) {
          res
            .status(401)
            .json({ error: "Authentification requise pour ce fichier" });
          return;
        }

        const isOwner = ownedObject.ownerId === req.user.userId;
        const targetSyndicateId =
          typeof req.query.syndicateId === "string" &&
          req.query.syndicateId.trim()
            ? req.query.syndicateId.trim()
            : null;
        const isSupervisedPlatformAccess =
          req.user.role === "super_admin" &&
          req.query.supervision === "true" &&
          !!ownedObject.syndicateId &&
          targetSyndicateId === ownedObject.syndicateId;

        if (
          !isOwner &&
          !isSupervisedPlatformAccess &&
          !(await canReadSharedObject(req.user, ownedObject))
        ) {
          res.status(403).json({ error: "Accès refusé" });
          return;
        }
      }

      if (docs.length > 0) {
        if (!req.user) {
          res
            .status(401)
            .json({ error: "Authentification requise pour ce document" });
          return;
        }
        const targetSyndicateId =
          typeof req.query.syndicateId === "string" &&
          req.query.syndicateId.trim()
            ? req.query.syndicateId.trim()
            : null;
        const isSupervised =
          req.user.role === "super_admin" &&
          req.query.supervision === "true" &&
          !!targetSyndicateId;
        let canAccess = false;
        for (const doc of docs) {
          if (doc.isDeleted) continue;
          if (isSupervised && doc.syndicateId === targetSyndicateId) canAccess = true;
          else if (req.user.role !== "super_admin" && (await canSeeDocument(req.user, doc))) canAccess = true;
          if (canAccess) break;
        }
        if (!canAccess) {
          res.status(403).json({ error: "Accès refusé" });
          return;
        }
      }

      // Unknown private paths are not served. This closes the legacy bearer
      // fallback while still allowing document rows created before the
      // ownership table to be accessed through their existing authorization.
      if (!ownedObject && docs.length === 0) {
        res.status(404).json({ error: "Fichier introuvable" });
        return;
      }

      // Try GCS first (works in production with real sidecar credentials)
      try {
        const objectFile = await storage.getObjectEntityFile(objectPath);
        const response = await storage.downloadObject(objectFile);
        res.status(response.status);
        response.headers.forEach((v, k) => res.setHeader(k, v));
        // Ensure images display inline (GCS may not set this)
        const gcsContentType = response.headers.get("content-type") ?? "";
        if (gcsContentType.startsWith("image/")) {
          res.setHeader("Content-Disposition", "inline");
        }
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        if (response.body) {
          Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(
            res,
          );
        } else {
          res.end();
        }
        return;
      } catch (gcsErr) {
        // In development the GCS sidecar returns a placeholder credential —
        // fall through to the local filesystem fallback.
        if (!(gcsErr instanceof ObjectNotFoundError)) {
          // Only swallow GCS auth/network errors, not explicit "not found"
          // (ObjectNotFoundError means the file definitely isn't in GCS).
        }
      }

      // Filesystem fallback: file was uploaded via POST /storage/uploads
      // objectPath = "/objects/uploads/<filename>", filename is the last segment
      const filename = path.basename(wildcardPath);
      const served = await serveLocalFile(filename, res);
      if (!served) {
        res.status(404).json({ error: "Fichier introuvable" });
      }
    } catch (err) {
      req.log.error({ err }, "Error serving object");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── DELETE /storage/documents/:id ───────────────────────────────────────────
// Retired: it erased the document row and its file, bypassing legal retention
// and the evidence of payments / claims. Documents are deleted logically with
// DELETE /documents/:id (recycle bin, purge after retention only).

router.delete("/storage/documents/:id", requireAuth, (_req: Request, res: Response) => {
  res.status(410).json({ error: "Utilisez DELETE /documents/:id (suppression logique)", code: "USE_DOCUMENT_DELETE" });
});

export default router;
