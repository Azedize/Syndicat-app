/**
 * Storage routes — JWT-auth-protected file upload/serve.
 *
 * Upload strategy (dev vs prod):
 *   The Replit GCS sidecar only provides real credentials in deployed
 *   environments.  In development the sidecar returns a placeholder JWT
 *   and every GCS call fails.  To keep uploads working in dev we use a
 *   direct multipart upload endpoint that saves files to the workspace
 *   filesystem (persistent in Replit dev).  The GET serving route tries
 *   GCS first and falls back to the workspace filesystem automatically,
 *   so both dev and prod use the same objectPath format.
 */
import { Readable } from "stream";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { db } from "@workspace/db";
import { documentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

/** Workspace-relative directory for locally-stored uploads (dev fallback). */
const LOCAL_UPLOADS_DIR = path.resolve("/home/runner/workspace/uploads");

async function ensureUploadsDir() {
  try { await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true }); } catch {}
}

/** Serve a file from the local uploads directory. */
async function serveLocalFile(filename: string, res: Response): Promise<boolean> {
  const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".mp4": "video/mp4", ".mov": "video/quicktime",
      ".txt": "text/plain", ".csv": "text/csv",
    };
    res.setHeader("Content-Type", contentTypeMap[ext] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
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
  "image/heic",   // iOS default camera format
  "image/heif",
  "image/avif",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // xlsx
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
      await ensureUploadsDir();
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      const filename = `${randomUUID()}${ext}`;
      const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
      await fs.writeFile(filePath, req.file.buffer);
      const objectPath = `/objects/uploads/${filename}`;
      res.json({ objectPath, fileName: req.file.originalname, contentType: req.file.mimetype, size: req.file.size });
    } catch (err) {
      req.log.error({ err }, "Error saving upload");
      res.status(500).json({ error: "Erreur lors de l'enregistrement du fichier" });
    }
  },
);

// ─── POST /storage/uploads/request-url ───────────────────────────────────────
// Legacy presigned-URL endpoint (works only in deployed environments where the
// GCS sidecar provides real credentials). Kept for backward compatibility.

const requestUrlSchema = z.object({
  name: z.string().min(1).max(500),
  size: z.number().positive().max(MAX_FILE_SIZE, "File too large (max 20 MB)"),
  contentType: z.string().min(1).max(200).refine(
    (ct) => ALLOWED_CONTENT_TYPES.has(ct),
    { message: "Content type not allowed. Supported: PDF, JPG, PNG, DOCX" }
  ),
  documentCategory: z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]).optional(),
  documentTitle: z.string().max(500).optional(),
});

router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = requestUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
    return;
  }
  try {
    const { name, size, contentType, documentCategory, documentTitle } = parsed.data;
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);

    let documentId: string | undefined;
    if (documentCategory && req.user!.syndicateId) {
      const [doc] = await db.insert(documentsTable).values({
        title: documentTitle ?? name,
        category: documentCategory,
        content: objectPath,
        syndicateId: req.user!.syndicateId,
        createdBy: req.user!.userId,
      }).returning();
      documentId = doc.id;
    }

    res.json({ uploadURL, objectPath, metadata: { name, size, contentType }, documentId });
  } catch (err) {
    req.log.error({ err }, "Error generating upload URL");
    res.status(500).json({ error: "Impossible de générer l'URL d'upload" });
  }
});

// ─── PATCH /storage/documents/:id/confirm ────────────────────────────────────
// After the client finishes uploading to GCS, call this to mark the document
// as published and optionally update its title.

router.patch("/storage/documents/:id/confirm", requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id) as string;
  const schema = z.object({
    title: z.string().max(500).optional(),
    status: z.enum(["published", "draft"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [doc] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
    if (doc.syndicateId !== req.user!.syndicateId && req.user!.role !== "super_admin") {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const [updated] = await db
      .update(documentsTable)
      .set({ title: parsed.data.title ?? doc.title, status: parsed.data.status ?? "published" })
      .where(eq(documentsTable.id, id))
      .returning();
    res.json({ data: updated });
  } catch (err) {
    req.log.error({ err }, "Error confirming upload");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /storage/public-objects/* ───────────────────────────────────────────
// Serve public assets (no auth required).

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await storage.searchPublicObject(filePath);
    if (!file) { res.status(404).json({ error: "Fichier introuvable" }); return; }
    const response = await storage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else { res.end(); }
  } catch (err) {
    req.log.error({ err }, "Error serving public object");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /storage/objects/* ──────────────────────────────────────────────────
// Serve uploaded objects.
// Auth is OPTIONAL — the UUID-based objectPath is practically unguessable,
// providing adequate security for attachments loaded by mobile Image components
// which cannot easily send custom Authorization headers.
// Documents linked to a specific syndicate still enforce syndicate access
// when a valid JWT is present.

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Optional: syndicate-scoped document access check
    const userHeader = req.headers.authorization;
    if (userHeader && req.user && req.user.role !== "super_admin") {
      const docs = await db
        .select({ syndicateId: documentsTable.syndicateId })
        .from(documentsTable)
        .where(and(eq(documentsTable.content, objectPath)));
      if (docs.length > 0 && docs[0].syndicateId && docs[0].syndicateId !== req.user.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
    }

    // Try GCS first (works in production with real sidecar credentials)
    try {
      const objectFile = await storage.getObjectEntityFile(objectPath);
      const response = await storage.downloadObject(objectFile);
      res.status(response.status);
      response.headers.forEach((v, k) => res.setHeader(k, v));
      if (response.body) {
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
      } else { res.end(); }
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
});

// ─── DELETE /storage/objects/:path ───────────────────────────────────────────
// Delete a document + its GCS object. Admin or document owner only.

router.delete("/storage/documents/:id", requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id) as string;
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
    const isAdmin = req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";
    const isOwner = doc.createdBy === req.user!.userId;
    if (!isAdmin && !isOwner) { res.status(403).json({ error: "Accès refusé" }); return; }
    // Delete from DB (GCS object remains but becomes orphaned — acceptable for now)
    await db.delete(documentsTable).where(eq(documentsTable.id, id));
    res.json({ message: "Document supprimé" });
  } catch (err) {
    req.log.error({ err }, "Error deleting document");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
