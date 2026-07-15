/**
 * documentPdf.ts — Enterprise-Grade Document Generation Engine
 *
 * Features:
 *  • Full multi-tenant syndicate branding (name, registration, contact, accent color)
 *  • QR code verification embedded in every document
 *  • Professional A4 layout with colored header band, meta table, signature block
 *  • Watermark for draft / non-published documents
 *  • 9 fully redesigned templates
 *  • DejaVu Sans TrueType font (system) for superior glyph rendering
 *  • Arabic font infrastructure: place Amiri-Regular.ttf + Amiri-Bold.ttf in
 *    artifacts/api-server/fonts/ to enable Arabic/RTL support
 */
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { objectStorageClient } from "./objectStorage.js";
import { logger } from "./logger.js";

const SIDECAR = "http://127.0.0.1:1106";

// ─── Font Registration ─────────────────────────────────────────────────────────
// Node.js pdfmake accepts raw filesystem paths for custom TTF fonts.

const DEJAVU_DIR = "/usr/share/fonts/truetype/dejavu";
const FONTS_DIR = new URL("../../fonts", import.meta.url).pathname;

const FONTS: Record<string, unknown> = {
  // Built-in Type 1 fallback (always available)
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

// DejaVu Sans — better Latin/extended coverage than built-in Helvetica
if (existsSync(`${DEJAVU_DIR}/DejaVuSans.ttf`)) {
  FONTS.DejaVu = {
    normal: `${DEJAVU_DIR}/DejaVuSans.ttf`,
    bold: existsSync(`${DEJAVU_DIR}/DejaVuSans-Bold.ttf`)
      ? `${DEJAVU_DIR}/DejaVuSans-Bold.ttf`
      : `${DEJAVU_DIR}/DejaVuSans.ttf`,
    italics: `${DEJAVU_DIR}/DejaVuSans.ttf`,
    bolditalics: `${DEJAVU_DIR}/DejaVuSans-Bold.ttf`,
  };
}

// Arabic (Amiri) — place TTF files in artifacts/api-server/fonts/ to enable
if (existsSync(`${FONTS_DIR}/Amiri-Regular.ttf`)) {
  FONTS.Amiri = {
    normal: `${FONTS_DIR}/Amiri-Regular.ttf`,
    bold: existsSync(`${FONTS_DIR}/Amiri-Bold.ttf`)
      ? `${FONTS_DIR}/Amiri-Bold.ttf`
      : `${FONTS_DIR}/Amiri-Regular.ttf`,
    italics: `${FONTS_DIR}/Amiri-Regular.ttf`,
    bolditalics: `${FONTS_DIR}/Amiri-Regular.ttf`,
  };
}

// Primary font: DejaVu if available, else Helvetica
const PRIMARY_FONT = FONTS.DejaVu ? "DejaVu" : "Helvetica";
// Arabic font: Amiri if available, else fall back to primary
const ARABIC_FONT = FONTS.Amiri ? "Amiri" : PRIMARY_FONT;

// ─── Styles ───────────────────────────────────────────────────────────────────

function buildStyles(accentColor: string) {
  return {
    headerOrgName: { font: PRIMARY_FONT, fontSize: 15, bold: true, color: "#ffffff" },
    headerMeta:    { font: PRIMARY_FONT, fontSize: 7.5, color: "#ffffffcc" },
    headerContact: { font: PRIMARY_FONT, fontSize: 7.5, color: "#ffffffaa" },
    docTypeLabel:  { font: PRIMARY_FONT, fontSize: 14, bold: true, color: "#ffffff" },
    docTitle:      { font: PRIMARY_FONT, fontSize: 13, bold: true, color: "#1e293b" },
    docRef:        { font: PRIMARY_FONT, fontSize: 9,  color: "#64748b"  },
    sectionTitle:  { font: PRIMARY_FONT, fontSize: 10, bold: true, color: accentColor, margin: [0, 12, 0, 5] },
    metaKey:       { font: PRIMARY_FONT, fontSize: 9,  color: "#64748b" },
    metaVal:       { font: PRIMARY_FONT, fontSize: 9.5, color: "#1e293b", bold: true },
    body:          { font: PRIMARY_FONT, fontSize: 10, color: "#334155", lineHeight: 1.55 },
    bodyArabic:    { font: ARABIC_FONT,  fontSize: 11, color: "#334155", lineHeight: 1.6, alignment: "right" as const },
    signLabel:     { font: PRIMARY_FONT, fontSize: 9,  color: "#64748b", italics: true },
    signName:      { font: PRIMARY_FONT, fontSize: 9,  bold: true, color: "#1e293b" },
    notice:        { font: PRIMARY_FONT, fontSize: 8,  color: "#94a3b8", italics: true },
    footer:        { font: PRIMARY_FONT, fontSize: 7.5, color: "#94a3b8" },
    watermark:     { font: PRIMARY_FONT, fontSize: 72, bold: true, color: "#e2e8f0", opacity: 0.12 },
    pageNumber:    { font: PRIMARY_FONT, fontSize: 8,  color: "#94a3b8" },
    tableHeader:   { font: PRIMARY_FONT, fontSize: 9,  bold: true, color: "#ffffff", fillColor: accentColor },
    tableCell:     { font: PRIMARY_FONT, fontSize: 9,  color: "#334155" },
  };
}

// ─── QR Code ──────────────────────────────────────────────────────────────────

async function generateQrDataUrl(documentNumber: string): Promise<string> {
  try {
    return await QRCode.toDataURL(`https://syndycat.ma/verify/${encodeURIComponent(documentNumber)}`, {
      errorCorrectionLevel: "M",
      width: 160,
      margin: 1,
      color: { dark: "#1e293b", light: "#ffffff" },
    });
  } catch {
    // QR generation failure is non-fatal — return empty placeholder
    return "";
  }
}

// ─── Page Header Band ─────────────────────────────────────────────────────────

function buildHeaderBand(
  syndInfo: SyndicateInfo,
  docTypeLabel: string,
  docNumber: string,
  qrDataUrl: string,
  accentColor: string,
  today: string,
): object[] {
  const contactParts: string[] = [];
  if (syndInfo.phone)   contactParts.push(`Tél : ${syndInfo.phone}`);
  if (syndInfo.email)   contactParts.push(syndInfo.email);
  if (syndInfo.website) contactParts.push(syndInfo.website);
  const contactLine = contactParts.join("   •   ");

  const regParts: string[] = [];
  if (syndInfo.registrationNumber) regParts.push(`N° Syndicale : ${syndInfo.registrationNumber}`);

  const qrCell = qrDataUrl
    ? { image: qrDataUrl, width: 58, alignment: "center" as const, margin: [4, 6, 6, 6] }
    : { text: "", margin: [4, 6, 6, 6] };

  return [
    // ── Syndicate identity band (colored)
    {
      table: {
        widths: ["*", 70],
        body: [
          [
            {
              stack: [
                { text: syndInfo.name.toUpperCase(), style: "headerOrgName", margin: [0, 0, 0, 3] },
                regParts.length
                  ? { text: regParts.join("   |   "), style: "headerMeta", margin: [0, 0, 0, 2] }
                  : null,
                syndInfo.address
                  ? { text: [syndInfo.address, syndInfo.city].filter(Boolean).join(", "), style: "headerMeta", margin: [0, 0, 0, 2] }
                  : null,
                contactLine
                  ? { text: contactLine, style: "headerContact" }
                  : null,
              ].filter(Boolean),
              fillColor: accentColor,
              margin: [14, 12, 8, 12],
            },
            { ...qrCell, fillColor: "#ffffff" },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    },
    // ── Document type label (colored band, slimmer)
    {
      table: {
        widths: ["*", "auto"],
        body: [
          [
            {
              text: docTypeLabel,
              style: "docTypeLabel",
              fillColor: adjustColorBrightness(accentColor, -18),
              margin: [14, 8, 8, 8],
            },
            {
              stack: [
                { text: `Réf : ${docNumber}`, style: "docRef", color: "#ffffffcc", margin: [0, 0, 0, 2] },
                { text: today,                style: "docRef", color: "#ffffffaa" },
              ],
              fillColor: adjustColorBrightness(accentColor, -18),
              alignment: "right" as const,
              margin: [8, 8, 14, 8],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 18],
    },
  ];
}

// Adjust a hex color's brightness (delta: positive = lighter, negative = darker)
function adjustColorBrightness(hex: string, delta: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + delta));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + delta));
  const b = Math.min(255, Math.max(0, (n & 0xff) + delta));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ─── Shared building blocks ───────────────────────────────────────────────────

function metaTable(rows: Array<[string, string]>, accentColor: string): unknown {
  return {
    table: {
      widths: [140, "*"],
      body: rows.map(([k, v]) => [
        { text: k, style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] },
        { text: v, style: "metaVal", margin: [8, 6, 8, 6] },
      ]),
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 1 : 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#e2e8f0",
      vLineColor: () => "#e2e8f0",
    },
    margin: [0, 0, 0, 16],
  };
}

function sectionHeader(label: string, accentColor: string): unknown {
  return {
    canvas: [
      { type: "rect", x: 0, y: 0, w: 4, h: 16, r: 2, color: accentColor },
    ],
    absolutePosition: { x: 40, y: 0 },  // positioned relatively via stack
  };
}

function contentSection(title: string, text: string, accentColor: string, isRtl = false): unknown {
  return {
    stack: [
      {
        columns: [
          { canvas: [{ type: "rect", x: 0, y: 2, w: 3, h: 13, r: 1, color: accentColor }], width: 10 },
          { text: title.toUpperCase(), fontSize: 9, bold: true, color: accentColor, margin: [2, 0, 0, 0] },
        ],
        margin: [0, 0, 0, 6],
      },
      isRtl
        ? { text, style: "bodyArabic", margin: [0, 0, 0, 16] }
        : { text, style: "body", margin: [0, 0, 0, 16] },
    ],
  };
}

function signatureBlock(
  signatoryTitle: string,
  syndName: string,
  accentColor: string,
  showStampCircle = true,
): unknown {
  return {
    columns: [
      {
        stack: [
          { text: "Signature et cachet :", style: "metaKey", margin: [0, 0, 0, 40] },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
          { text: signatoryTitle, style: "signLabel", margin: [0, 4, 0, 2] },
          { text: syndName, style: "signName" },
        ],
        width: "*",
      },
      showStampCircle
        ? {
            stack: [
              {
                canvas: [
                  { type: "ellipse", x: 45, y: 35, r1: 40, r2: 40, lineColor: accentColor, lineWidth: 1.2, dash: { length: 4 } },
                  { type: "ellipse", x: 45, y: 35, r1: 32, r2: 32, lineColor: accentColor, lineWidth: 0.5, dash: { length: 2 } },
                ],
                margin: [0, 0, 0, 4],
              },
              { text: "CACHET OFFICIEL", style: "notice", alignment: "center" as const, margin: [0, 0, 0, 0] },
            ],
            width: 100,
            alignment: "center" as const,
          }
        : { text: "", width: 100 },
    ],
    margin: [0, 30, 0, 0],
  };
}

function legalFooterNote(docNumber: string): unknown {
  return {
    text: `Ce document officiel porte la référence ${docNumber}. Toute modification non autorisée est passible de poursuites. Vérification : syndycat.ma/verify/${encodeURIComponent(docNumber)}`,
    style: "notice",
    margin: [0, 20, 0, 0],
    alignment: "center" as const,
  };
}

// ─── PDF Buffer ───────────────────────────────────────────────────────────────

async function buildPdfBuffer(docDef: unknown): Promise<Buffer> {
  const PdfPrinter = (await import("pdfmake")).default as any;
  const printer = new PdfPrinter(FONTS);
  const pdfDoc = printer.createPdfKitDocument({
    defaultStyle: { font: PRIMARY_FONT, fontSize: 10, lineHeight: 1.4 },
    ...(docDef as object),
  });
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (c: Buffer) => chunks.push(c));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}

// ─── GCS Upload ───────────────────────────────────────────────────────────────

function parseGcsPath(fullPath: string): { bucketName: string; objectName: string } {
  let clean = fullPath;
  if (clean.startsWith("gs://")) {
    clean = clean.slice(5);
    const idx = clean.indexOf("/");
    return { bucketName: clean.slice(0, idx), objectName: clean.slice(idx + 1) };
  }
  if (clean.startsWith("/")) clean = clean.slice(1);
  const parts = clean.split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function uploadBufferToGcs(buffer: Buffer, filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set — configure Replit Object Storage");
  const objectId = randomUUID();
  const sep = privateDir.endsWith("/") ? "" : "/";
  const fullPath = `${privateDir}${sep}documents/${objectId}/${filename}`;
  const { bucketName, objectName } = parseGcsPath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  await bucket.file(objectName).save(buffer, {
    contentType: "application/pdf",
    metadata: { cacheControl: "private, max-age=3600" },
  });
  return `/objects/documents/${objectId}/${filename}`;
}

export async function signDocumentDownloadUrl(internalPath: string, ttlSec = 3600): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const entityId = internalPath.replace(/^\/objects\//, "");
  const sep = privateDir.endsWith("/") ? "" : "/";
  const fullPath = `${privateDir}${sep}${entityId}`;
  const { bucketName, objectName } = parseGcsPath(fullPath);
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "GET",
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`signDocumentDownloadUrl failed: ${response.status}`);
  const { signed_url } = (await response.json()) as { signed_url: string };
  return signed_url;
}

export async function deleteDocumentFromGcs(internalPath: string): Promise<void> {
  try {
    const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!privateDir) return;
    const entityId = internalPath.replace(/^\/objects\//, "");
    const sep = privateDir.endsWith("/") ? "" : "/";
    const fullPath = `${privateDir}${sep}${entityId}`;
    const { bucketName, objectName } = parseGcsPath(fullPath);
    await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
  } catch (err) {
    logger.warn({ err }, "deleteDocumentFromGcs: non-fatal failure");
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentTemplate =
  | "attestation"
  | "pv"
  | "convocation"
  | "contrat"
  | "rapport"
  | "decision"
  | "certificat"
  | "circulaire"
  | "mise_en_demeure";

export interface SyndicateInfo {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  registrationNumber: string;
  logoColor: string;
}

export interface DocumentInput {
  title: string;
  content?: string;
  syndicate?: SyndicateInfo;
  /** Legacy compat — used if syndicate is not provided */
  syndicateName?: string;
  syndicateAddress?: string;
  memberName?: string;
  documentNumber?: string;
  date?: string;
  /** Document lifecycle status — used to add watermark for non-final docs */
  docStatus?: string;
  [key: string]: unknown;
}

// ─── Template Definitions ─────────────────────────────────────────────────────

async function buildDocDef(template: DocumentTemplate, input: DocumentInput): Promise<unknown> {
  const today = input.date ?? new Date().toLocaleDateString("fr-MA", { dateStyle: "long" });
  const syndInfo: SyndicateInfo = input.syndicate ?? {
    name: input.syndicateName ?? "SYNDYCAT",
    address: input.syndicateAddress ?? "",
    city: "",
    phone: "",
    email: "",
    website: "",
    registrationNumber: "",
    logoColor: "#7c3aed",
  };
  const accentColor = syndInfo.logoColor || "#7c3aed";
  const docNum = input.documentNumber ?? `${template.toUpperCase()}-${Date.now()}`;
  const member = input.memberName ?? "";
  const body = input.content ?? "";
  const styles = buildStyles(accentColor);

  // QR code — non-blocking
  const qrDataUrl = await generateQrDataUrl(docNum);

  // Watermark for draft/generated documents
  const watermark =
    !input.docStatus || input.docStatus === "draft"
      ? { text: "BROUILLON", opacity: 0.05, bold: true, color: accentColor }
      : input.docStatus === "generated"
      ? { text: "EN COURS", opacity: 0.05, bold: true, color: accentColor }
      : undefined;

  // Standard page setup (A4)
  const pageSetup = {
    pageSize: "A4" as const,
    pageMargins: [40, 40, 40, 55] as [number, number, number, number],
  };

  // Footer function
  const footer = (page: number, pages: number) => ({
    columns: [
      { text: `${syndInfo.name}  •  Réf : ${docNum}`, style: "footer", margin: [40, 0, 0, 0] },
      { text: `Page ${page} / ${pages}  •  ${today}`, style: "footer", alignment: "right" as const, margin: [0, 0, 40, 0] },
    ],
    margin: [0, 10, 0, 0],
  });

  const header = buildHeaderBand(syndInfo, getDocTypeLabel(template), docNum, qrDataUrl, accentColor, today);

  // ── Template content ────────────────────────────────────────────────────────

  let content: unknown[];

  switch (template) {
    case "attestation":
      content = [
        ...header,
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Délivré à :", member || "N/A"],
          ["Date d'émission :", today],
          ["Organisme émetteur :", syndInfo.name],
          ...(syndInfo.registrationNumber ? [["N° d'enregistrement :", syndInfo.registrationNumber] as [string, string]] : []),
        ], accentColor),
        contentSection(
          "Attestation",
          body ||
            `Le syndicat ${syndInfo.name} atteste par la présente que ${member || "[NOM DU MEMBRE]"} est membre en règle de notre organisation à la date du ${today}. ` +
            `Cette attestation est délivrée à l'intéressé(e) pour faire valoir ce que de droit.`,
          accentColor,
        ),
        { text: "\n" },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    case "pv":
      content = [
        ...header,
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Date de réunion :", today],
          ["Syndicat :", syndInfo.name],
          ["Lieu :", input.lieu as string || "Siège du syndicat"],
          ["Président de séance :", input.president as string || syndInfo.name],
          ["Secrétaire de séance :", input.secretaire as string || "—"],
        ], accentColor),
        contentSection("Ordre du jour", input.agendaText as string || body || "Points inscrits à l'ordre du jour de la réunion.", accentColor),
        contentSection(
          "Délibérations",
          input.deliberationsText as string ||
            "Les membres présents ont délibéré sur les points inscrits à l'ordre du jour. Les décisions adoptées font l'objet d'un enregistrement dans le registre officiel du syndicat.",
          accentColor,
        ),
        contentSection("Résolutions", input.resolutionsText as string || "Les résolutions adoptées ont été consignées.", accentColor),
        { text: "\n" },
        {
          columns: [
            {
              stack: [
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
                { text: "Le Président", style: "signLabel", margin: [0, 4, 0, 0] },
              ],
            },
            {
              stack: [
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
                { text: "Le Secrétaire", style: "signLabel", margin: [0, 4, 0, 0] },
              ],
            },
            {
              stack: [
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
                { text: "Cachet du Syndicat", style: "signLabel", margin: [0, 4, 0, 0] },
              ],
            },
          ],
          margin: [0, 30, 0, 0],
          columnGap: 10,
        },
        legalFooterNote(docNum),
      ];
      break;

    case "convocation":
      content = [
        ...header,
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Destinataire :", member || "[DESTINATAIRE]"],
          ["Expéditeur :", syndInfo.name],
          ["Date d'envoi :", today],
          ["Objet :", input.title],
          ["Date de réunion :", input.meetingDate as string || "—"],
          ["Lieu :", input.lieu as string || "Siège du syndicat"],
          ["Heure :", input.heure as string || "—"],
        ], accentColor),
        contentSection("Objet de la convocation", body || `Vous êtes convoqué(e) à assister à la réunion organisée par ${syndInfo.name}.`, accentColor),
        {
          table: {
            widths: ["*"],
            body: [[{
              text: "Votre présence est obligatoire. En cas d'impossibilité, veuillez en informer le secrétariat avant la date de la réunion.",
              style: "notice",
              fillColor: "#fff7ed",
              margin: [10, 8, 10, 8],
            }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#fed7aa",
            vLineColor: () => "#fed7aa",
          },
          margin: [0, 0, 0, 16],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    case "contrat":
      content = [
        ...header,
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Référence du contrat :", docNum],
          ["Date :", today],
          ["Partie 1 :", syndInfo.name],
          ["Partie 2 :", member || "[COCONTRACTANT]"],
          ["Objet :", input.objet as string || input.title],
        ], accentColor),
        contentSection("Préambule", input.preamble as string || `Le présent contrat est conclu entre ${syndInfo.name} et ${member || "[COCONTRACTANT]"}.`, accentColor),
        contentSection(
          "Clauses et conditions",
          body || "Les parties conviennent des clauses et conditions détaillées ci-après. Tout différend relatif à l'interprétation ou à l'exécution du présent contrat sera soumis à la juridiction compétente.",
          accentColor,
        ),
        {
          columns: [
            {
              stack: [
                { text: "Pour le Syndicat :", style: "metaKey", margin: [0, 0, 0, 30] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
                { text: syndInfo.name, style: "signName", margin: [0, 4, 0, 0] },
              ],
            },
            {
              stack: [
                { text: "Pour le Cocontractant :", style: "metaKey", margin: [0, 0, 0, 30] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
                { text: member || "[COCONTRACTANT]", style: "signName", margin: [0, 4, 0, 0] },
              ],
            },
          ],
          margin: [0, 24, 0, 0],
          columnGap: 20,
        },
        legalFooterNote(docNum),
      ];
      break;

    case "rapport":
      content = [
        ...header,
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Période couverte :", input.periode as string || today],
          ["Auteur :", member || syndInfo.name],
          ["Date de rédaction :", today],
          ["Syndicat :", syndInfo.name],
        ], accentColor),
        contentSection("Synthèse exécutive", input.synthese as string || body || "Ce rapport présente les activités et résultats du syndicat pour la période indiquée.", accentColor),
        contentSection("Activités réalisées", input.activites as string || "Voir détails en annexe.", accentColor),
        contentSection("Indicateurs clés", input.indicateurs as string || "—", accentColor),
        contentSection("Perspectives et recommandations", input.perspectives as string || "—", accentColor),
        signatureBlock("L'Auteur du rapport", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    case "decision":
      content = [
        ...header,
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Référence :", docNum],
          ["Date de la décision :", today],
          ["Organe décisionnel :", input.organe as string || "Bureau Syndical"],
          ["Syndicat :", syndInfo.name],
        ], accentColor),
        contentSection(
          "Vu et considérant",
          input.preamble as string ||
            `Vu les statuts du syndicat ${syndInfo.name}, et considérant les délibérations de l'organe compétent en date du ${today} ;`,
          accentColor,
        ),
        contentSection("Décide", body || "La présente décision est adoptée à l'unanimité des membres présents.", accentColor),
        {
          table: {
            widths: ["*"],
            body: [[{
              text: "La présente décision entre en vigueur à compter de la date de sa signature et est opposable à tous les membres.",
              style: "notice",
              fillColor: "#f0fdf4",
              margin: [10, 8, 10, 8],
            }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#bbf7d0",
            vLineColor: () => "#bbf7d0",
          },
          margin: [0, 0, 0, 16],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    case "certificat":
      content = [
        ...header,
        // Decorative border
        {
          canvas: [
            { type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor },
          ],
          margin: [0, 0, 0, 16],
        },
        { text: "CERTIFICAT", fontSize: 22, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 20] },
        metaTable([
          ["Délivré à :", member || "[BÉNÉFICIAIRE]"],
          ["Date de délivrance :", today],
          ["Organisme émetteur :", syndInfo.name],
          ...(syndInfo.registrationNumber ? [["Réf. d'enregistrement :", syndInfo.registrationNumber] as [string, string]] : []),
        ], accentColor),
        contentSection(
          "Certifie et atteste",
          body || `Le syndicat ${syndInfo.name} certifie par la présente que ${member || "[BÉNÉFICIAIRE]"} satisfait à l'ensemble des conditions requises pour l'obtention du présent certificat.`,
          accentColor,
        ),
        {
          canvas: [
            { type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor },
          ],
          margin: [0, 8, 0, 16],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    case "circulaire":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["À :", "Tous les membres du syndicat"],
          ["De :", syndInfo.name],
          ["Date :", today],
          ["Référence :", docNum],
          ["Objet :", input.title],
          ["Priorité :", input.priorite as string || "Normale"],
        ], accentColor),
        contentSection("Message", body || `Chers membres,\n\nVeuillez trouver ci-après les informations importantes communiquées par la direction de ${syndInfo.name}.\n\nCordialement,\n${syndInfo.name}`, accentColor),
        {
          text: "Cette circulaire doit être portée à la connaissance de tous les membres concernés dans les meilleurs délais.",
          style: "notice",
          margin: [0, 0, 0, 16],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, false),
        legalFooterNote(docNum),
      ];
      break;

    case "mise_en_demeure":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Destinataire :", member || "[DESTINATAIRE]"],
          ["Émetteur :", syndInfo.name],
          ["Date d'émission :", today],
          ["Référence :", docNum],
          ["Mode d'envoi :", input.modeEnvoi as string || "Recommandé avec accusé de réception"],
        ], accentColor),
        contentSection(
          "Objet de la mise en demeure",
          body ||
            `Par la présente lettre recommandée, ${syndInfo.name} met formellement en demeure ${member || "[DESTINATAIRE]"} de ` +
            "s'acquitter de ses obligations dans le délai imparti ci-dessous.",
          accentColor,
        ),
        {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: "⚠  DÉLAI DE RÉPONSE IMPÉRATIF", fontSize: 10, bold: true, color: "#dc2626", margin: [0, 0, 0, 4] },
                { text: input.delai as string || "15 (QUINZE) JOURS à compter de la réception de la présente", fontSize: 10, color: "#dc2626" },
              ],
              fillColor: "#fef2f2",
              margin: [12, 10, 12, 10],
            }]],
          },
          layout: {
            hLineWidth: () => 1.5,
            vLineWidth: () => 1.5,
            hLineColor: () => "#fca5a5",
            vLineColor: () => "#fca5a5",
          },
          margin: [0, 0, 0, 16],
        },
        contentSection(
          "Conséquences en cas de non-réponse",
          input.consequences as string ||
            "À défaut de réponse dans le délai imparti, nous nous réservons le droit d'engager toutes les procédures légales et judiciaires appropriées sans autre préavis.",
          accentColor,
        ),
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    default:
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        contentSection("Contenu", body || "—", accentColor),
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
  }

  return {
    ...pageSetup,
    content,
    styles,
    footer,
    ...(watermark ? { watermark } : {}),
  };
}

function getDocTypeLabel(template: DocumentTemplate): string {
  const labels: Record<DocumentTemplate, string> = {
    attestation:    "ATTESTATION D'ADHÉSION",
    pv:             "PROCÈS-VERBAL DE RÉUNION",
    convocation:    "CONVOCATION OFFICIELLE",
    contrat:        "CONTRAT",
    rapport:        "RAPPORT D'ACTIVITÉ",
    decision:       "DÉCISION SYNDICALE",
    certificat:     "CERTIFICAT OFFICIEL",
    circulaire:     "CIRCULAIRE INTERNE",
    mise_en_demeure: "MISE EN DEMEURE OFFICIELLE",
  };
  return labels[template] ?? template.toUpperCase();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GeneratedDocument {
  /** Internal GCS path: /objects/documents/<uuid>/<file> */
  fileUrl: string;
  fileSizeKo: string;
  documentNumber: string;
}

/**
 * Generates a professional PDF for the given template + input,
 * uploads to GCS, and returns the internal path + metadata.
 *
 * Throws on storage failure — callers should return HTTP 503 if this fails,
 * not swallow the error and claim success.
 */
export async function generateAndUploadDocument(
  template: DocumentTemplate,
  input: DocumentInput,
): Promise<GeneratedDocument> {
  const docNumber = input.documentNumber ?? `${template.toUpperCase()}-${Date.now()}`;
  const enriched: DocumentInput = { ...input, documentNumber: docNumber };

  const docDef = await buildDocDef(template, enriched);
  const buffer = await buildPdfBuffer(docDef);
  const filename = `${template}-${docNumber.replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
  const fileSizeKo = `${Math.round(buffer.length / 1024)}Ko`;

  const fileUrl = await uploadBufferToGcs(buffer, filename);
  return { fileUrl, fileSizeKo, documentNumber: docNumber };
}

// ─── Category → Template mapping ─────────────────────────────────────────────

export const CATEGORY_TO_TEMPLATE: Record<string, DocumentTemplate> = {
  attestation: "attestation",
  pv:          "pv",
  juridique:   "mise_en_demeure",
  reglements:  "circulaire",
  finances:    "rapport",
  statuts:     "certificat",
};
