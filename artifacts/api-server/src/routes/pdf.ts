/**
 * PDF Generation routes — server-side PDF using pdfmake with standard fonts.
 * Supports French/Latin content. Arabic PDF support requires additional font setup.
 *
 * Endpoints:
 *   GET /pdf/invoice/:id        — Invoice PDF
 *   GET /pdf/receipt/:id        — Payment receipt PDF
 *   GET /pdf/budget/:id         — Budget report PDF
 *   GET /pdf/ag/:id             — AG meeting minutes PDF
 *   GET /pdf/membership/:userId — Membership certificate PDF
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable,
  invoiceItemsTable,
  transactionsTable,
  budgetsTable,
  budgetLinesTable,
  meetingsTable,
  meetingAttendeesTable,
  membersTable,
  syndicatesTable,
  usersTable,
  lotsTable,
  debtEscalationsTable,
  buildingsTable,
  appelsDeFondsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, count } from "drizzle-orm";
import QRCode from "qrcode";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d?: Date | string | null): string {
  if (!d) return "—";
  try {
    return new Date(d as string).toLocaleDateString("fr-MA", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

function formatMoney(v?: number | string | null): string {
  if (v == null) return "0,00 MAD";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `${n.toFixed(2).replace(".", ",")} MAD`;
}

function getSyndicate(syndicateId?: string | null) {
  if (!syndicateId) return null;
  return db.select().from(syndicatesTable).where(eq(syndicatesTable.id, syndicateId)).then((r) => r[0] ?? null);
}

/**
 * Create and stream a PDF using pdfmake with standard built-in PDF fonts.
 * Standard fonts (Helvetica, Times, Courier) need no external font files.
 */
async function sendPdf(res: any, docDef: any, filename: string) {
  // Dynamic import to handle CJS/ESM interop
  const PdfPrinter = (await import("pdfmake")).default as any;

  const fonts = {
    Helvetica: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
    Times: {
      normal: "Times-Roman",
      bold: "Times-Bold",
      italics: "Times-Italic",
      bolditalics: "Times-BoldItalic",
    },
    Courier: {
      normal: "Courier",
      bold: "Courier-Bold",
      italics: "Courier-Oblique",
      bolditalics: "Courier-BoldOblique",
    },
  };

  const printer = new PdfPrinter(fonts);
  const pdfDoc = printer.createPdfKitDocument({
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    ...docDef,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  pdfDoc.pipe(res);
  pdfDoc.end();
}

function pageHeader(title: string, subtitle?: string) {
  return [
    { text: "SYNDYCAT", style: "brand", margin: [0, 0, 0, 2] },
    { text: title, style: "header" },
    ...(subtitle ? [{ text: subtitle, style: "subheader" }] : []),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#7c3aed" }], margin: [0, 8, 0, 16] },
  ];
}

const styles = {
  brand: { fontSize: 18, bold: true, color: "#7c3aed" },
  header: { fontSize: 14, bold: true, color: "#1e293b" },
  subheader: { fontSize: 11, color: "#64748b", margin: [0, 2, 0, 0] },
  sectionTitle: { fontSize: 11, bold: true, color: "#1e293b", margin: [0, 12, 0, 6] },
  label: { fontSize: 9, color: "#64748b" },
  value: { fontSize: 10, color: "#1e293b" },
  tableHeader: { fontSize: 9, bold: true, color: "#fff", fillColor: "#7c3aed" },
  total: { fontSize: 11, bold: true, color: "#7c3aed" },
  footer: { fontSize: 8, color: "#94a3b8", italics: true },
};

// ─── GET /pdf/invoice/:id ─────────────────────────────────────────────────────

router.get("/pdf/invoice/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  try {
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!invoice) { res.status(404).json({ error: "Facture introuvable" }); return; }
    if (req.user!.role !== "super_admin" && invoice.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
    const syndicate = await getSyndicate(invoice.syndicateId);

    const tableBody = [
      [
        { text: "Description", style: "tableHeader" },
        { text: "Qté", style: "tableHeader", alignment: "center" },
        { text: "Prix unitaire", style: "tableHeader", alignment: "right" },
        { text: "Total", style: "tableHeader", alignment: "right" },
      ],
      ...items.map((item) => [
        { text: item.label ?? "—", style: "value" },
        { text: String(item.quantity ?? 1), alignment: "center", style: "value" },
        { text: formatMoney(item.unitPrice), alignment: "right", style: "value" },
        { text: formatMoney(parseFloat(String(item.unitPrice ?? 0)) * parseFloat(String(item.quantity ?? 1))), alignment: "right", style: "value" },
      ]),
    ];

    const docDef = {
      content: [
        ...pageHeader(
          invoice.type === "devis" ? "DEVIS" : "FACTURE",
          `Référence: ${invoice.reference ?? id}`
        ),
        {
          columns: [
            [
              { text: "ÉMETTEUR", style: "sectionTitle" },
              { text: syndicate?.name ?? "—", style: "value" },
              { text: syndicate?.address ?? "", style: "label" },
              { text: syndicate?.email ?? "", style: "label" },
            ],
            [
              { text: "DESTINATAIRE", style: "sectionTitle" },
              { text: invoice.recipient ?? "—", style: "value" },
            ],
          ],
        },
        {
          columns: [
            [{ text: `Date: ${formatDate(invoice.date as any)}`, style: "label", margin: [0, 12, 0, 0] }],
            [{ text: `Échéance: ${formatDate(invoice.dueDate as any)}`, style: "label", margin: [0, 12, 0, 0] }],
          ],
        },
        { text: "DÉTAIL", style: "sectionTitle" },
        {
          table: { headerRows: 1, widths: ["*", 40, 80, 80], body: tableBody },
          layout: "lightHorizontalLines",
        },
        {
          columns: [
            { text: "", width: "*" },
            {
              width: "auto",
              table: {
                body: [
                  [{ text: "TOTAL TTC", style: "total" }, { text: formatMoney(invoice.amount), style: "total", alignment: "right" }],
                ],
              },
              layout: "noBorders",
              margin: [0, 12, 0, 0],
            },
          ],
        },
        invoice.proofUrl ? { text: `Pièce justificative: ${invoice.proofUrl}`, style: "label", margin: [0, 16, 0, 0] } : {},
      ],
      styles,
      footer: (page: number, pages: number) => ({
        text: `Page ${page} / ${pages}  —  Document généré par SYNDYCAT le ${new Date().toLocaleDateString("fr-MA")}`,
        style: "footer",
        alignment: "center",
        margin: [0, 0, 0, 10],
      }),
    };

    await sendPdf(res, docDef, `facture-${invoice.reference ?? id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "PDF invoice error");
    res.status(500).json({ error: "Erreur de génération PDF" });
  }
});

// ─── GET /pdf/receipt/:id ─────────────────────────────────────────────────────

router.get("/pdf/receipt/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  try {
    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
    if (!tx) { res.status(404).json({ error: "Transaction introuvable" }); return; }
    if (req.user!.role !== "super_admin" && tx.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const syndicate = await getSyndicate(tx.syndicateId);

    const docDef = {
      content: [
        ...pageHeader("REÇU DE PAIEMENT", `N° ${tx.id}`),
        {
          table: {
            widths: ["*", "*"],
            body: [
              [{ text: "Date", style: "label" }, { text: formatDate(tx.date as any), style: "value" }],
              [{ text: "Syndicat", style: "label" }, { text: syndicate?.name ?? "—", style: "value" }],
              [{ text: "Libellé", style: "label" }, { text: tx.label ?? "—", style: "value" }],
              [{ text: "Type", style: "label" }, { text: tx.type ?? "—", style: "value" }],
              [{ text: "Statut", style: "label" }, { text: tx.status === "paid" ? "PAYÉ" : tx.status ?? "—", style: "value" }],
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 20],
        },
        {
          table: {
            widths: ["*", "auto"],
            body: [
              [{ text: "MONTANT TOTAL", style: "total" }, { text: formatMoney(tx.amount), style: "total", alignment: "right" }],
            ],
          },
          layout: "noBorders",
        },
        {
          text: "Ce reçu confirme réception du paiement susmentionné.",
          style: "footer",
          margin: [0, 30, 0, 0],
        },
        {
          columns: [
            [
              { text: "\n\n_____________________________", style: "label" },
              { text: "Signature du trésorier", style: "label" },
            ],
            [
              { text: `\n\n${syndicate?.name ?? ""}`, style: "label" },
              { text: syndicate?.address ?? "", style: "label" },
            ],
          ],
          margin: [0, 40, 0, 0],
        },
      ],
      styles,
      footer: (page: number, pages: number) => ({
        text: `Document généré par SYNDYCAT le ${new Date().toLocaleDateString("fr-MA")}`,
        style: "footer",
        alignment: "center",
        margin: [0, 0, 0, 10],
      }),
    };

    await sendPdf(res, docDef, `recu-${tx.id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "PDF receipt error");
    res.status(500).json({ error: "Erreur de génération PDF" });
  }
});

// ─── GET /pdf/budget/:id ──────────────────────────────────────────────────────

router.get("/pdf/budget/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  try {
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
    if (!budget) { res.status(404).json({ error: "Budget introuvable" }); return; }
    const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, budget.buildingId));
    const syndicateId = building?.syndicateId ?? null;
    if (req.user!.role !== "super_admin" && syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const lines = await db.select().from(budgetLinesTable).where(eq(budgetLinesTable.budgetId, id));
    const syndicate = await getSyndicate(syndicateId);

    const linesBody = [
      [
        { text: "Poste", style: "tableHeader" },
        { text: "Catégorie", style: "tableHeader" },
        { text: "Annuel", style: "tableHeader", alignment: "right" },
        { text: "T1", style: "tableHeader", alignment: "right" },
        { text: "T2", style: "tableHeader", alignment: "right" },
        { text: "T3", style: "tableHeader", alignment: "right" },
        { text: "T4", style: "tableHeader", alignment: "right" },
      ],
      ...lines.map((l) => [
        { text: l.label ?? "—", style: "value" },
        { text: l.category ?? "—", style: "label" },
        { text: formatMoney(l.amountAnnual), alignment: "right", style: "value" },
        { text: formatMoney(l.amountQ1), alignment: "right", style: "label" },
        { text: formatMoney(l.amountQ2), alignment: "right", style: "label" },
        { text: formatMoney(l.amountQ3), alignment: "right", style: "label" },
        { text: formatMoney(l.amountQ4), alignment: "right", style: "label" },
      ]),
    ];

    const docDef = {
      pageOrientation: "landscape",
      content: [
        ...pageHeader(`BUDGET PRÉVISIONNEL ${budget.year ?? ""}`, syndicate?.name ?? ""),
        {
          columns: [
            [
              { text: `Immeuble: ${budget.buildingId ?? "—"}`, style: "label" },
              { text: `Statut: ${budget.status ?? "—"}`, style: "label" },
            ],
            [
              { text: `Budget total: ${formatMoney(budget.totalAmount)}`, style: "value", bold: true },
              { text: `Charges: ${formatMoney(budget.chargesAmount)}`, style: "value" },
              { text: `Fonds de réserve: ${formatMoney(budget.fondsReserve)}`, style: "value" },
            ],
          ],
          margin: [0, 0, 0, 16],
        },
        {
          table: {
            headerRows: 1,
            widths: ["*", 70, 70, 55, 55, 55, 55],
            body: linesBody,
          },
          layout: "lightHorizontalLines",
        },
      ],
      styles,
      footer: (page: number, pages: number) => ({
        text: `Page ${page} / ${pages}  —  SYNDYCAT — ${new Date().toLocaleDateString("fr-MA")}`,
        style: "footer",
        alignment: "center",
        margin: [0, 0, 0, 10],
      }),
    };

    await sendPdf(res, docDef, `budget-${budget.year ?? id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "PDF budget error");
    res.status(500).json({ error: "Erreur de génération PDF" });
  }
});

// ─── GET /pdf/ag/:id ──────────────────────────────────────────────────────────
// AG meeting minutes (PV)

router.get("/pdf/ag/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  try {
    const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable" }); return; }
    if (req.user!.role !== "super_admin" && meeting.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const [{ attendeeCount }] = await db
      .select({ attendeeCount: count() })
      .from(meetingAttendeesTable)
      .where(eq(meetingAttendeesTable.meetingId, id));
    const syndicate = await getSyndicate(meeting.syndicateId);

    const docDef = {
      content: [
        ...pageHeader(
          "PROCÈS-VERBAL D'ASSEMBLÉE GÉNÉRALE",
          `${meeting.title ?? "Assemblée Générale"} — ${formatDate(meeting.date as any)}`
        ),
        { text: "INFORMATIONS GÉNÉRALES", style: "sectionTitle" },
        {
          table: {
            widths: ["*", "*"],
            body: [
              [{ text: "Date", style: "label" }, { text: formatDate(meeting.date as any), style: "value" }],
              [{ text: "Heure", style: "label" }, { text: meeting.time ?? "—", style: "value" }],
              [{ text: "Lieu", style: "label" }, { text: meeting.location ?? "—", style: "value" }],
              [{ text: "Type", style: "label" }, { text: meeting.type ?? "—", style: "value" }],
              [{ text: "Syndicat", style: "label" }, { text: syndicate?.name ?? "—", style: "value" }],
              [{ text: "Membres présents", style: "label" }, { text: String(Number(attendeeCount) ?? 0), style: "value" }],
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 16],
        },
        meeting.description ? [
          { text: "DESCRIPTION", style: "sectionTitle" },
          { text: meeting.description, style: "value", margin: [0, 0, 0, 16] },
        ] : [],
        meeting.agenda ? [
          { text: "ORDRE DU JOUR", style: "sectionTitle" },
          ...(Array.isArray(meeting.agenda) ? meeting.agenda : [meeting.agenda]).map((item: string, i: number) => ({
            text: `${i + 1}. ${item}`,
            style: "value",
            margin: [0, 2, 0, 2],
          })),
        ] : [],
        { text: "\n\n", },
        {
          columns: [
            [
              { text: "_____________________________", style: "label" },
              { text: "Signature du Président", style: "label" },
            ],
            [
              { text: "_____________________________", style: "label" },
              { text: "Signature du Secrétaire", style: "label" },
            ],
          ],
          margin: [0, 40, 0, 0],
        },
      ],
      styles,
      footer: (page: number, pages: number) => ({
        text: `Page ${page} / ${pages}  —  SYNDYCAT — ${new Date().toLocaleDateString("fr-MA")}`,
        style: "footer",
        alignment: "center",
        margin: [0, 0, 0, 10],
      }),
    };

    await sendPdf(res, docDef, `pv-ag-${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "PDF AG error");
    res.status(500).json({ error: "Erreur de génération PDF" });
  }
});

// ─── GET /pdf/membership/:userId ─────────────────────────────────────────────

router.get("/pdf/membership/:userId", requireAuth, async (req, res) => {
  const userId = String(req.params.userId) as string;
  if (req.user!.role !== "super_admin" && req.user!.role !== "syndicate_admin" && req.user!.userId !== userId) {
    res.status(403).json({ error: "Accès refusé" }); return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }
    const syndicate = await getSyndicate(user.syndicateId);
    const [member] = await db.select().from(membersTable).where(eq(membersTable.email, user.email));

    // Fetch member's lot
    const lot = member
      ? await db.select().from(lotsTable).where(eq(lotsTable.ownerId, member.id)).then((r) => r[0] ?? null)
      : null;

    // Generate QR code pointing to public badge verification endpoint
    const verifyUrl = `${process.env.APP_URL ?? "https://syndycat.app"}/verify/badge/${userId}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 });

    const docDef = {
      content: [
        ...pageHeader("CERTIFICAT D'ADHÉSION", syndicate?.name ?? ""),
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "Nous soussignés, certifions que :", style: "value", margin: [0, 20, 0, 20] },
                {
                  table: {
                    widths: ["*", "*"],
                    body: [
                      [{ text: "Nom complet", style: "label" }, { text: user.name, style: "value" }],
                      [{ text: "Email", style: "label" }, { text: user.email, style: "value" }],
                      [{ text: "CIN", style: "label" }, { text: user.cin ?? "—", style: "value" }],
                      [{ text: "Téléphone", style: "label" }, { text: user.phone ?? "—", style: "value" }],
                      [{ text: "Lot / Appartement", style: "label" }, { text: lot ? `N° ${lot.number} (Étage ${lot.floor ?? 0})` : "—", style: "value" }],
                      [{ text: "Date d'adhésion", style: "label" }, { text: formatDate(member?.joinDate) ?? formatDate(user.createdAt?.toString()), style: "value" }],
                      [{ text: "Statut", style: "label" }, { text: "MEMBRE ACTIF", bold: true, color: "#059669", style: "value" }],
                    ],
                  },
                  layout: "lightHorizontalLines",
                  margin: [0, 0, 0, 20],
                },
              ],
            },
            {
              width: "auto",
              stack: [
                { image: qrDataUrl, width: 110, margin: [16, 20, 0, 4] },
                { text: "Vérifier ce badge", style: "label", alignment: "center", margin: [16, 0, 0, 0] },
              ],
            },
          ],
        },
        {
          text: `est bien membre en règle du syndicat ${syndicate?.name ?? ""} depuis la date mentionnée ci-dessus, conformément aux dispositions du Dahir n° 1-57-119 du 16 juillet 1957 relatif aux syndicats professionnels.`,
          style: "value",
          margin: [0, 0, 0, 40],
        },
        {
          columns: [
            [
              { text: `Fait à ${syndicate?.address?.split(",").pop()?.trim() ?? ""}`, style: "label" },
              { text: `Le ${new Date().toLocaleDateString("fr-MA")}`, style: "label" },
            ],
            [
              { text: "\n\n_____________________________", style: "label" },
              { text: "Signature et cachet du syndicat", style: "label" },
            ],
          ],
        },
      ],
      styles,
    };

    await sendPdf(res, docDef, `certificat-adhesion-${user.name.replace(/\s+/g, "-")}.pdf`);
  } catch (err) {
    req.log.error({ err }, "PDF membership error");
    res.status(500).json({ error: "Erreur de génération PDF" });
  }
});

// ─── GET /verify/badge/:userId ─────────────────────────────────────────────────
// Public endpoint — no auth required — for QR code verification

router.get("/verify/badge/:userId", async (req, res) => {
  const { userId } = req.params as { userId: string };
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ valid: false, error: "Badge introuvable" }); return; }
    const syndicate = await getSyndicate(user.syndicateId);
    const [member] = await db.select().from(membersTable).where(eq(membersTable.email, user.email));
    const lot = member
      ? await db.select().from(lotsTable).where(eq(lotsTable.ownerId, member.id)).then((r) => r[0] ?? null)
      : null;
    // Public endpoint (anyone scanning the QR badge) — must not leak contact PII
    // such as email; only what's needed to confirm the badge is legitimate.
    res.json({
      valid: true,
      name: user.name,
      syndicateName: syndicate?.name ?? null,
      lot: lot ? `N° ${lot.number} — Étage ${lot.floor ?? 0}` : null,
      status: "MEMBRE ACTIF",
      joinDate: member?.joinDate ?? (user.createdAt ? new Date(user.createdAt as any).toISOString().split("T")[0] : null),
      verifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Badge verify error");
    res.status(500).json({ valid: false, error: "Erreur serveur" });
  }
});

// ─── GET /pdf/escalation/:id ─────────────────────────────────────────────────
// Generates a formal escalation letter (rappel / mise en demeure / etc.)
// Access: Syndic Admin + Super Admin only.
// Mobile clients may pass token as ?token= query param when Linking.openURL
// cannot attach Authorization headers.

router.get("/pdf/escalation/:id", async (req, res) => {
  try {
    // Support both Authorization header and ?token= query param (for mobile openURL)
    let bearerToken: string | undefined =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : typeof req.query.token === "string"
          ? req.query.token
          : undefined;

    if (!bearerToken) {
      res.status(401).json({ error: "Non authentifié" });
      return;
    }

    // Verify token manually (same logic as requireAuth middleware)
    const jwt = await import("jsonwebtoken");
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) { res.status(500).json({ error: "Configuration serveur invalide" }); return; }

    let userPayload: any;
    try {
      userPayload = jwt.default.verify(bearerToken, jwtSecret);
    } catch {
      res.status(401).json({ error: "Token invalide ou expiré" });
      return;
    }

    // Require admin role — formal debt letters are not visible to members/tenants
    if (userPayload.role !== "super_admin" && userPayload.role !== "syndicate_admin") {
      res.status(403).json({ error: "Accès réservé aux administrateurs" });
      return;
    }

    const user = userPayload;
    const id = String(req.params.id) as string;

    const [escalation] = await db
      .select()
      .from(debtEscalationsTable)
      .where(eq(debtEscalationsTable.id, id));

    if (!escalation) {
      res.status(404).json({ error: "Escalade introuvable" });
      return;
    }

    if (user.role !== "super_admin" && escalation.syndicateId !== user.syndicateId) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const [syndicate, lot, member, unpaidAppels] = await Promise.all([
      escalation.syndicateId ? getSyndicate(escalation.syndicateId) : Promise.resolve(null),
      escalation.lotId
        ? db.select().from(lotsTable).where(eq(lotsTable.id, escalation.lotId)).then((r) => r[0] ?? null)
        : Promise.resolve(null),
      escalation.memberId
        ? db.select().from(membersTable).where(eq(membersTable.id, escalation.memberId)).then((r) => r[0] ?? null)
        : Promise.resolve(null),
      escalation.lotId
        ? db
            .select()
            .from(appelsDeFondsTable)
            .where(
              and(
                eq(appelsDeFondsTable.lotId, escalation.lotId),
                inArray(appelsDeFondsTable.status, ["pending", "overdue"]),
              ),
            )
        : Promise.resolve([]),
    ]);

    let building = null;
    if (lot?.buildingId) {
      const rows = await db.select().from(buildingsTable).where(eq(buildingsTable.id, lot.buildingId));
      building = rows[0] ?? null;
    }

    const level = escalation.escalationLevel ?? escalation.level;
    const levelTitles: Record<string, string> = {
      reminder: "LETTRE DE RAPPEL",
      warning: "MISE EN DEMEURE",
      final_warning: "DERNIÈRE MISE EN DEMEURE",
      agm_proposal: "AVIS DE CONVOCATION D'AG EXTRAORDINAIRE",
      legal_action: "AVIS DE TRANSMISSION AU CONTENTIEUX",
    };
    const levelSubtitles: Record<string, string> = {
      reminder: "Rappel de paiement — Charges impayées",
      warning: "Mise en demeure de payer",
      final_warning: "Dernière mise en demeure avant action judiciaire",
      agm_proposal: "Proposition de convocation d'une Assemblée Générale Extraordinaire",
      legal_action: "Transmission du dossier au conseil juridique",
    };
    // NOTE: `amount` is already formatted with currency (e.g. "1 250,00 MAD") via formatMoney().
    // Do NOT append "MAD" again in these template strings.
    const letterBodies: Record<string, (amount: string, months: number) => string[]> = {
      reminder: (amount, months) => [
        `Nous avons constaté que votre compte présente un solde impayé de ${amount} correspondant à ${months} mois de charges non réglées.`,
        "Nous vous rappelons que le règlement de vos charges de copropriété est une obligation légale en vertu du Dahir 1-57-119 relatif à la copropriété des immeubles bâtis.",
        "Nous vous invitons à régulariser votre situation dans un délai de 15 jours à compter de la réception de la présente lettre.",
        "À défaut de règlement dans ce délai, nous serons contraints d'engager les procédures prévues par notre règlement de copropriété.",
        "Pour tout renseignement ou accord de paiement, veuillez contacter le syndic aux coordonnées mentionnées ci-dessus.",
      ],
      warning: (amount, months) => [
        `Malgré notre rappel du mois précédent, votre compte présente toujours un solde impayé de ${amount} représentant ${months} mois de charges non réglées.`,
        "Par la présente, nous vous adressons une mise en demeure formelle de régler l'intégralité des sommes dues dans un délai de 30 jours.",
        "En application de l'article 37 du Dahir 1-57-119 et du règlement de copropriété, le syndic est habilité à engager des poursuites judiciaires pour le recouvrement des charges impayées.",
        "Des frais de mise en demeure ainsi que les intérêts légaux commenceront à courir à compter de la présente notification.",
        "Nous vous exhortons à prendre contact avec nous dans les meilleurs délais pour éviter toute procédure judiciaire.",
      ],
      final_warning: (amount, months) => [
        `Après deux tentatives amiables infructueuses, votre solde impayé s'élève désormais à ${amount} pour une période de ${months} mois de charges non réglées.`,
        "La présente constitue votre DERNIÈRE MISE EN DEMEURE amiable avant l'engagement de toute procédure judiciaire de recouvrement.",
        "Conformément aux dispositions légales en vigueur et au règlement de copropriété, vous disposez d'un délai de 15 jours à compter de la présente pour régulariser intégralement votre situation.",
        "À l'issue de ce délai, et sans réponse de votre part, le dossier sera transmis à notre conseil juridique pour engagement de poursuites judiciaires à vos frais et risques.",
        "Seul le règlement intégral de la somme due ou la conclusion d'un plan d'apurement formalisé permettra d'éviter cette procédure.",
      ],
      agm_proposal: (amount, months) => [
        `Après ${months} mois d'impayés s'élevant à ${amount}, et en l'absence de régularisation suite à nos mises en demeure successives, le Conseil Syndical envisage la convocation d'une Assemblée Générale Extraordinaire.`,
        "Conformément à l'article 22 du Dahir 1-57-119, une Assemblée Générale Extraordinaire peut être convoquée pour statuer sur les mesures à prendre à l'encontre des copropriétaires défaillants.",
        "Cette assemblée sera notamment saisie pour délibérer sur: l'autorisation d'ester en justice pour recouvrement forcé des charges, la constitution d'une provision spéciale, et toute autre mesure conservatoire.",
        "Vous êtes une dernière fois invité à vous rapprocher du syndic pour convenir d'un plan de règlement avant la tenue de cette assemblée.",
        "La présente vous est adressée à titre d'information et de dernier recours amiable.",
      ],
      legal_action: (amount, months) => [
        `Suite à ${months} mois d'impayés s'élevant à ${amount}, et en l'absence de tout règlement ou contact de votre part malgré nos multiples relances, nous avons l'obligation de vous informer que votre dossier est transmis à notre conseil juridique.`,
        "Un avocat mandaté par le syndicat des copropriétaires engagera dans les prochains jours une procédure judiciaire de recouvrement conformément aux dispositions du Code de procédure civile.",
        "Les frais judiciaires, honoraires d'avocat, frais d'huissier et intérêts de retard seront intégralement mis à votre charge.",
        "Pour éviter toute procédure judiciaire, vous disposez d'un délai de 7 jours ouvrables à compter de la réception de la présente pour régler intégralement le montant dû ou convenir d'un plan de règlement approuvé par le syndic.",
        "Passé ce délai, aucune intervention amiable ne sera plus possible.",
      ],
    };

    const bodyParagraphs = letterBodies[level]?.(
      formatMoney(escalation.totalOverdue),
      escalation.overdueMonths,
    ) ?? ["Veuillez régulariser votre situation."];

    // Build unpaid charges table
    const chargesTableBody = [
      [
        { text: "Période", style: "tableHeader" },
        { text: "Type", style: "tableHeader" },
        { text: "Échéance", style: "tableHeader" },
        { text: "Montant", style: "tableHeader", alignment: "right" },
        { text: "Statut", style: "tableHeader", alignment: "center" },
      ],
      ...unpaidAppels.map((a) => [
        { text: a.period ?? "—", style: "value" },
        { text: a.type === "charges_courantes" ? "Charges courantes" : a.type === "fonds_reserve" ? "Fonds réserve" : a.type ?? "—", style: "value" },
        { text: formatDate(a.dueDate), style: "value" },
        { text: formatMoney(a.amount), style: "value", alignment: "right" },
        { text: a.status === "overdue" ? "En retard" : "En attente", style: "label", alignment: "center" },
      ]),
    ];

    const today = new Date();
    const refNum = `ESC-${escalation.id.slice(0, 8).toUpperCase()}-${today.getFullYear()}`;

    const docDef = {
      content: [
        ...pageHeader(
          levelTitles[level] ?? "AVIS DE RECOUVREMENT",
          levelSubtitles[level] ?? "",
        ),
        // Reference + date
        {
          columns: [
            { text: `Réf.: ${refNum}`, style: "label" },
            { text: `Casablanca, le ${formatDate(today.toISOString())}`, style: "label", alignment: "right" },
          ],
          margin: [0, 0, 0, 16],
        },
        // Parties
        {
          columns: [
            [
              { text: "ÉMETTEUR", style: "sectionTitle" },
              { text: syndicate?.name ?? "Syndicat des copropriétaires", style: "value", bold: true },
              { text: syndicate?.address ?? (building?.address ?? ""), style: "label" },
              { text: syndicate?.email ?? "", style: "label" },
              { text: syndicate?.phone ?? "", style: "label" },
            ],
            [
              { text: "DESTINATAIRE", style: "sectionTitle" },
              { text: member?.name ?? escalation.memberName ?? "Le copropriétaire", style: "value", bold: true },
              { text: member?.email ?? "", style: "label" },
              { text: member?.phone ?? "", style: "label" },
              { text: lot ? `Lot N° ${lot.number}${building ? ` — ${building.name}` : ""}` : "", style: "label" },
            ],
          ],
          margin: [0, 0, 0, 16],
        },
        // Objet
        {
          text: `OBJET : ${levelTitles[level] ?? "AVIS DE RECOUVREMENT"} — Charges impayées`,
          style: "sectionTitle",
          margin: [0, 0, 0, 8],
        },
        { text: "Madame, Monsieur,", style: "value", margin: [0, 0, 0, 8] },
        // Body paragraphs
        ...bodyParagraphs.map((p) => ({
          text: p,
          style: "value",
          margin: [0, 0, 0, 8],
          alignment: "justify",
        })),
        // Unpaid charges table
        { text: "DÉTAIL DES CHARGES IMPAYÉES", style: "sectionTitle", margin: [0, 12, 0, 6] },
        unpaidAppels.length > 0
          ? {
              table: {
                headerRows: 1,
                widths: ["auto", "*", "auto", "auto", "auto"],
                body: chargesTableBody,
              },
              layout: "lightHorizontalLines",
            }
          : { text: `Montant total impayé: ${formatMoney(escalation.totalOverdue)}`, style: "value" },
        // Total
        {
          columns: [
            { text: "", width: "*" },
            {
              width: "auto",
              margin: [0, 12, 0, 0],
              table: {
                body: [
                  [
                    { text: "TOTAL IMPAYÉ", style: "total" },
                    { text: formatMoney(escalation.totalOverdue), style: "total", alignment: "right" },
                  ],
                ],
              },
              layout: "noBorders",
            },
          ],
        },
        // Closing
        {
          text: "\nNous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.",
          style: "value",
          margin: [0, 16, 0, 8],
        },
        {
          columns: [
            { text: "", width: "*" },
            [
              { text: "Le Syndic", style: "value", bold: true, alignment: "right" },
              { text: syndicate?.name ?? "", style: "label", alignment: "right" },
            ],
          ],
          margin: [0, 0, 0, 0],
        },
        // Footer note
        {
          text: `Document généré automatiquement le ${formatDate(today.toISOString())} | Réf. ${refNum} | SYNDYCAT Platform`,
          style: "footer",
          margin: [0, 24, 0, 0],
          alignment: "center",
        },
      ],
      styles,
      pageMargins: [40, 40, 40, 60] as [number, number, number, number],
    };

    const filename = `escalation-${level}-${refNum}.pdf`;
    await sendPdf(res, docDef, filename);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur génération PDF" });
  }
});

// ─── GET /pdf/acte/:id ────────────────────────────────────────────────────────
// Generate a formal PDF for an administrative act

router.get("/pdf/acte/:id", requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const { role, syndicateId } = req.user!;
  try {
    const { actesAdministratifsTable } = await import("@workspace/db/schema");
    const [acte] = await db.select().from(actesAdministratifsTable).where(eq(actesAdministratifsTable.id, id));
    if (!acte) { res.status(404).json({ error: "Acte introuvable" }); return; }
    if (role !== "super_admin" && acte.syndicateId !== syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const syndicate = await getSyndicate(acte.syndicateId);

    const TYPE_LABELS: Record<string, string> = {
      convocation: "CONVOCATION",
      decision: "DÉCISION",
      pv: "PROCÈS-VERBAL",
      proces_verbal_ag: "PROCÈS-VERBAL D'ASSEMBLÉE GÉNÉRALE",
      resolution: "RÉSOLUTION",
      mandat: "MANDAT",
      attestation: "ATTESTATION",
      courrier_officiel: "COURRIER OFFICIEL",
    };

    const STATUT_LABELS: Record<string, string> = {
      brouillon: "BROUILLON",
      valide: "VALIDÉ",
      diffuse: "DIFFUSÉ",
      archive: "ARCHIVÉ",
    };

    const sigRows = (acte.signataires ?? []).map((s) => [
      { text: s, style: "value" },
      { text: "✓ Signé", style: "value", color: "#10b981", alignment: "right" as const },
    ]);

    const destRows = (acte.destinataires ?? []).map((d) => [{ text: d, style: "value" }]);

    const docDef = {
      content: [
        ...pageHeader(
          TYPE_LABELS[acte.type] ?? acte.type.toUpperCase(),
          `Réf: ${acte.numero} — ${syndicate?.name ?? ""}`,
        ),
        {
          table: {
            widths: ["*", "*"],
            body: [
              [{ text: "N° de référence", style: "label" }, { text: acte.numero, style: "value" }],
              [{ text: "Date", style: "label" }, { text: formatDate(acte.date), style: "value" }],
              ...(acte.dateEcheance ? [[{ text: "Échéance", style: "label" }, { text: formatDate(acte.dateEcheance), style: "value" }]] : []),
              [{ text: "Statut", style: "label" }, { text: STATUT_LABELS[acte.statut] ?? acte.statut.toUpperCase(), style: "value" }],
              [{ text: "Auteur", style: "label" }, { text: acte.auteur, style: "value" }],
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 16],
        },
        { text: "OBJET", style: "sectionTitle" },
        { text: acte.objet, style: "value", margin: [0, 0, 0, 16] },
        ...(acte.resumeContenu ? [
          { text: "CONTENU", style: "sectionTitle" },
          { text: acte.resumeContenu, style: "value", margin: [0, 0, 0, 16] },
        ] : []),
        ...(sigRows.length > 0 ? [
          { text: "SIGNATAIRES", style: "sectionTitle" },
          {
            table: { widths: ["*", "auto"], body: sigRows },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 16],
          },
        ] : []),
        ...(destRows.length > 0 ? [
          { text: "DESTINATAIRES", style: "sectionTitle" },
          {
            table: { widths: ["*"], body: destRows },
            layout: "lightHorizontalLines",
            margin: [0, 0, 0, 16],
          },
        ] : []),
        {
          columns: [
            [
              { text: "\n\n_____________________________", style: "label" },
              { text: "Signature autorisée", style: "label" },
            ],
            [
              { text: syndicate?.name ?? "", style: "value", bold: true, alignment: "right" as const },
              { text: syndicate?.address ?? "", style: "label", alignment: "right" as const },
            ],
          ],
          margin: [0, 30, 0, 0],
        },
      ],
      styles,
      footer: (page: number, pages: number) => ({
        text: `Page ${page} / ${pages}  —  Document officiel SYNDYCAT — ${new Date().toLocaleDateString("fr-MA")}`,
        style: "footer",
        alignment: "center",
        margin: [0, 0, 0, 10],
      }),
    };

    const filename = `acte-${acte.type}-${acte.numero.replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
    await sendPdf(res, docDef, filename);
  } catch (err) {
    req.log.error({ err }, "PDF acte error");
    res.status(500).json({ error: "Erreur de génération PDF" });
  }
});

export default router;
