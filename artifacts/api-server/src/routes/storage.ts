/**
 * Storage routes — JWT-auth-protected file upload/serve via GCS presigned URLs.
 * Adapted for JWT (req.user) rather than session-based auth.
 */
import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { db } from "@workspace/db";
import { documentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();
const storage = new ObjectStorageService();

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/webp",
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ─── POST /storage/uploads/request-url ───────────────────────────────────────
// Request a presigned URL. Client sends JSON metadata (NOT the file itself).
// File is uploaded directly to GCS via the returned presigned URL.

const requestUrlSchema = z.object({
  name: z.string().min(1).max(500),
  size: z.number().positive().max(MAX_FILE_SIZE, "File too large (max 20 MB)"),
  contentType: z.string().min(1).max(200).refine(
    (ct) => ALLOWED_CONTENT_TYPES.has(ct),
    { message: "Content type not allowed. Supported: PDF, JPG, PNG, DOCX" }
  ),
  // Optional: link to a document record upon upload
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

    // Optionally create a document record immediately so the caller has the doc ID
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
// Serve private uploaded objects (JWT auth required).
// Syndicate members can only access documents belonging to their syndicate.

router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // Verify the document belongs to the user's syndicate
    if (req.user!.role !== "super_admin") {
      const docs = await db
        .select({ syndicateId: documentsTable.syndicateId })
        .from(documentsTable)
        .where(eq(documentsTable.content, objectPath));
      if (docs.length > 0 && docs[0].syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
    }

    const objectFile = await storage.getObjectEntityFile(objectPath);
    const response = await storage.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else { res.end(); }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Fichier introuvable" }); return;
    }
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
