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
  membersTable,
  syndicatesTable,
  usersTable,
  lotsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
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
  const id = req.params.id as string;
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
        { text: item.description ?? "—", style: "value" },
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
        invoice.notes ? { text: invoice.notes, style: "label", margin: [0, 16, 0, 0] } : {},
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
  const id = req.params.id as string;
  try {
    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
    if (!tx) { res.status(404).json({ error: "Transaction introuvable" }); return; }
    if (req.user!.role !== "super_admin" && tx.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const syndicate = await getSyndicate(tx.syndicateId);

    const docDef = {
      content: [
        ...pageHeader("REÇU DE PAIEMENT", `N° ${tx.reference ?? id}`),
        {
          table: {
            widths: ["*", "*"],
            body: [
              [{ text: "Date", style: "label" }, { text: formatDate(tx.date as any), style: "value" }],
              [{ text: "Syndicat", style: "label" }, { text: syndicate?.name ?? "—", style: "value" }],
              [{ text: "Description", style: "label" }, { text: tx.description ?? "—", style: "value" }],
              [{ text: "Catégorie", style: "label" }, { text: tx.category ?? "—", style: "value" }],
              [{ text: "Mode de paiement", style: "label" }, { text: tx.paymentMethod ?? "—", style: "value" }],
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

    await sendPdf(res, docDef, `recu-${tx.reference ?? id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "PDF receipt error");
    res.status(500).json({ error: "Erreur de génération PDF" });
  }
});

// ─── GET /pdf/budget/:id ──────────────────────────────────────────────────────

router.get("/pdf/budget/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
    if (!budget) { res.status(404).json({ error: "Budget introuvable" }); return; }
    if (req.user!.role !== "super_admin" && budget.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const lines = await db.select().from(budgetLinesTable).where(eq(budgetLinesTable.budgetId, id));
    const syndicate = await getSyndicate(budget.syndicateId);

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
  const id = req.params.id as string;
  try {
    const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
    if (!meeting) { res.status(404).json({ error: "Réunion introuvable" }); return; }
    if (req.user!.role !== "super_admin" && meeting.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
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
              [{ text: "Membres présents", style: "label" }, { text: String(meeting.attendees ?? 0), style: "value" }],
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
  const userId = req.params.userId as string;
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
    res.json({
      valid: true,
      name: user.name,
      email: user.email,
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

export default router;
