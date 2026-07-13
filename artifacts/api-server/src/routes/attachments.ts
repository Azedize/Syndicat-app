/**
 * Attachment routes for financial records:
 *   POST   /charge-attachments          — upload proof for an appel de fonds
 *   GET    /charge-attachments/:appelId — list proofs for an appel
 *   DELETE /charge-attachments/:id      — remove a proof (own or admin)
 *
 *   POST   /invoice-attachments          — attach file to an invoice
 *   GET    /invoice-attachments/:invoiceId — list attachments for an invoice
 *   DELETE /invoice-attachments/:id       — remove an attachment
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  chargeAttachmentsTable,
  invoiceAttachmentsTable,
  appelsDeFondsTable,
  invoicesTable,
  buildingsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAppelSyndicateId(appelId: string): Promise<string | null> {
  const [appel] = await db.select({ buildingId: appelsDeFondsTable.buildingId }).from(appelsDeFondsTable).where(eq(appelsDeFondsTable.id, appelId));
  if (!appel) return null;
  const [b] = await db.select({ syndicateId: buildingsTable.syndicateId }).from(buildingsTable).where(eq(buildingsTable.id, appel.buildingId));
  return b?.syndicateId ?? null;
}

async function getInvoiceSyndicateId(invoiceId: string): Promise<string | null> {
  const [inv] = await db.select({ syndicateId: invoicesTable.syndicateId }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  return inv?.syndicateId ?? null;
}

// ─── Charge (Appel de Fonds) Attachments ─────────────────────────────────────

// POST /charge-attachments — add a proof document to an appel de fonds
router.post("/charge-attachments", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { appelDeFondsId, url, filename, mimeType } = req.body as {
      appelDeFondsId: string;
      url: string;
      filename: string;
      mimeType?: string;
    };

    if (!appelDeFondsId || !url || !filename) {
      return void res.status(400).json({ error: "appelDeFondsId, url et filename sont obligatoires" });
    }

    // Validate the appel exists and user has access
    const [appel] = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.id, appelDeFondsId));
    if (!appel) return void res.status(404).json({ error: "Appel de fonds introuvable" });

    const syndicateId = await getAppelSyndicateId(appelDeFondsId);
    if (user.role === "syndicate_admin" && syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    // Members/tenants can only attach to their own appels
    if (user.role === "member" || user.role === "tenant") {
      if (appel.ownerId !== user.userId) {
        return void res.status(403).json({ error: "Vous ne pouvez ajouter des pièces que pour vos propres charges" });
      }
    }

    const [row] = await db.insert(chargeAttachmentsTable).values({
      appelDeFondsId,
      url,
      filename,
      mimeType: mimeType ?? null,
      uploadedBy: user.userId,
    }).returning();

    // Auto-update proofUrl on the appel so the validator sees it immediately
    await db.update(appelsDeFondsTable).set({ proofUrl: url }).where(
      and(eq(appelsDeFondsTable.id, appelDeFondsId), eq(appelsDeFondsTable.proofUrl, ""))
    );

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "charge_attachment",
      entityId: row.id,
      syndicateId: syndicateId ?? undefined,
      details: filename,
    });

    return void res.status(201).json({ data: row });
  } catch (e) {
    req.log.error(e);
    return void res.status(500).json({ error: "Server error" });
  }
});

// GET /charge-attachments/:appelId — list all attachments for a charge
router.get("/charge-attachments/:appelId", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const appelId = String(req.params.appelId);

    const syndicateId = await getAppelSyndicateId(appelId);
    if (user.role === "syndicate_admin" && syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const rows = await db
      .select()
      .from(chargeAttachmentsTable)
      .where(eq(chargeAttachmentsTable.appelDeFondsId, appelId));

    return void res.json({ data: rows });
  } catch (e) {
    req.log.error(e);
    return void res.status(500).json({ error: "Server error" });
  }
});

// DELETE /charge-attachments/:id — remove a charge attachment
router.delete("/charge-attachments/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const attId = String(String(req.params.id));
    const [att] = await db.select().from(chargeAttachmentsTable).where(eq(chargeAttachmentsTable.id, attId));
    if (!att) return void res.status(404).json({ error: "Not found" });

    // Only uploader, syndicate_admin, or super_admin can delete
    if (user.role !== "super_admin" && user.role !== "syndicate_admin" && att.uploadedBy !== user.userId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    const syndicateId = await getAppelSyndicateId(att.appelDeFondsId);
    if (user.role === "syndicate_admin" && syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    await db.delete(chargeAttachmentsTable).where(eq(chargeAttachmentsTable.id, attId));

    await serverAuditLog(req, {
      action: "DELETE",
      entity: "charge_attachment",
      entityId: attId,
      syndicateId: syndicateId ?? undefined,
      details: att.filename,
    });

    return void res.json({ message: "Pièce justificative supprimée" });
  } catch (e) {
    req.log.error(e);
    return void res.status(500).json({ error: "Server error" });
  }
});

// ─── Invoice Attachments ──────────────────────────────────────────────────────

// POST /invoice-attachments — attach a file to an invoice
router.post("/invoice-attachments", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { invoiceId, url, filename, mimeType } = req.body as {
      invoiceId: string;
      url: string;
      filename: string;
      mimeType?: string;
    };

    if (!invoiceId || !url || !filename) {
      return void res.status(400).json({ error: "invoiceId, url et filename sont obligatoires" });
    }

    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!invoice) return void res.status(404).json({ error: "Facture introuvable" });

    const syndicateId = await getInvoiceSyndicateId(invoiceId);
    if (user.role === "syndicate_admin" && syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const [row] = await db.insert(invoiceAttachmentsTable).values({
      invoiceId,
      url,
      filename,
      mimeType: mimeType ?? null,
      uploadedBy: user.userId,
    }).returning();

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "invoice_attachment",
      entityId: row.id,
      syndicateId: syndicateId ?? undefined,
      details: filename,
    });

    return void res.status(201).json({ data: row });
  } catch (e) {
    req.log.error(e);
    return void res.status(500).json({ error: "Server error" });
  }
});

// GET /invoice-attachments/:invoiceId — list all attachments for an invoice
router.get("/invoice-attachments/:invoiceId", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const invoiceId = String(req.params.invoiceId);

    const syndicateId = await getInvoiceSyndicateId(invoiceId);
    if (user.role === "syndicate_admin" && syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const rows = await db
      .select()
      .from(invoiceAttachmentsTable)
      .where(eq(invoiceAttachmentsTable.invoiceId, invoiceId));

    return void res.json({ data: rows });
  } catch (e) {
    req.log.error(e);
    return void res.status(500).json({ error: "Server error" });
  }
});

// DELETE /invoice-attachments/:id — remove an invoice attachment
router.delete("/invoice-attachments/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const invAttId = String(String(req.params.id));
    const [att] = await db.select().from(invoiceAttachmentsTable).where(eq(invoiceAttachmentsTable.id, invAttId));
    if (!att) return void res.status(404).json({ error: "Not found" });

    const syndicateId = await getInvoiceSyndicateId(att.invoiceId);
    if (user.role === "syndicate_admin" && syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    await db.delete(invoiceAttachmentsTable).where(eq(invoiceAttachmentsTable.id, invAttId));

    await serverAuditLog(req, {
      action: "DELETE",
      entity: "invoice_attachment",
      entityId: invAttId,
      syndicateId: syndicateId ?? undefined,
      details: att.filename,
    });

    return void res.json({ message: "Pièce jointe supprimée" });
  } catch (e) {
    req.log.error(e);
    return void res.status(500).json({ error: "Server error" });
  }
});

export default router;
