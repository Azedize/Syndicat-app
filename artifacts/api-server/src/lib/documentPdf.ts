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

// Arabic (Amiri) — TTF files live in artifacts/api-server/fonts/ (Amiri Regular/Bold/
// Italic/BoldItalic, from the Amiri Project — https://github.com/aliftype/amiri).
if (existsSync(`${FONTS_DIR}/Amiri-Regular.ttf`)) {
  FONTS.Amiri = {
    normal: `${FONTS_DIR}/Amiri-Regular.ttf`,
    bold: existsSync(`${FONTS_DIR}/Amiri-Bold.ttf`)
      ? `${FONTS_DIR}/Amiri-Bold.ttf`
      : `${FONTS_DIR}/Amiri-Regular.ttf`,
    italics: existsSync(`${FONTS_DIR}/Amiri-Italic.ttf`)
      ? `${FONTS_DIR}/Amiri-Italic.ttf`
      : `${FONTS_DIR}/Amiri-Regular.ttf`,
    bolditalics: existsSync(`${FONTS_DIR}/Amiri-BoldItalic.ttf`)
      ? `${FONTS_DIR}/Amiri-BoldItalic.ttf`
      : `${FONTS_DIR}/Amiri-Regular.ttf`,
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
  logoDataUrl: string | null = null,
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

  // Acronym fallback when no logo image is available (initials in a circle)
  const acronym = (syndInfo.abbreviation ||
    syndInfo.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)
  ).toUpperCase();

  const logoCell = logoDataUrl
    ? { image: logoDataUrl, width: 40, height: 40, fit: [40, 40] as [number, number] }
    : {
        table: {
          widths: [40],
          heights: [40],
          body: [[{ text: acronym, fontSize: 13, bold: true, color: "#ffffff", alignment: "center" as const, margin: [0, 13, 0, 0] }]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          fillColor: () => "#ffffff25",
        },
      };

  return [
    // ── Syndicate identity band (colored)
    {
      table: {
        widths: [44, "*", 70],
        body: [
          [
            { ...logoCell, fillColor: accentColor, margin: [12, 12, 0, 12] },
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
              margin: [10, 12, 8, 12],
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

// ─── Syndicate Logo ───────────────────────────────────────────────────────────
// Fetches the syndicate logo (PNG/JPG uploaded via /objects/... internal path, or a
// plain https URL) and returns a base64 data URI pdfmake can embed as an `image` node.
// SVG logos are not rasterized (pdfmake/PDFKit cannot embed raw SVG as an image node)
// — for those we skip embedding and fall back to the text/initial header.

const LOGO_CACHE_TTL_MS = 5 * 60 * 1000;
const logoCache = new Map<string, { dataUrl: string | null; expires: number }>();

function detectImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null; // covers SVG and any other unsupported format
}

export async function fetchLogoDataUrl(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;

  const cached = logoCache.get(logoUrl);
  if (cached && cached.expires > Date.now()) return cached.dataUrl;

  try {
    let buf: Buffer;
    if (/^https?:\/\//i.test(logoUrl)) {
      const resp = await fetch(logoUrl, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) throw new Error(`logo fetch failed: ${resp.status}`);
      buf = Buffer.from(await resp.arrayBuffer());
    } else {
      // Internal object-storage path, e.g. "/objects/uploads/<uuid>"
      const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
      if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
      const entityId = logoUrl.replace(/^\/objects\//, "");
      const sep = privateDir.endsWith("/") ? "" : "/";
      const fullPath = `${privateDir}${sep}${entityId}`;
      const { bucketName, objectName } = parseGcsPath(fullPath);
      [buf] = await objectStorageClient.bucket(bucketName).file(objectName).download();
    }

    const mime = detectImageMime(buf);
    const dataUrl = mime ? `data:${mime};base64,${buf.toString("base64")}` : null;
    logoCache.set(logoUrl, { dataUrl, expires: Date.now() + LOGO_CACHE_TTL_MS });
    return dataUrl;
  } catch (err) {
    logger.warn({ err, logoUrl }, "fetchLogoDataUrl: non-fatal failure, falling back to text header");
    logoCache.set(logoUrl, { dataUrl: null, expires: Date.now() + LOGO_CACHE_TTL_MS });
    return null;
  }
}

// ─── Signature Embedding (post-generation) ────────────────────────────────────
// Documents are generated once at creation time; signatures are captured later
// (mobile SignaturePad → SVG markup) and must be visually embedded into the
// already-uploaded PDF. Rather than regenerating the whole document (the
// original render inputs aren't persisted), we append a dedicated signature
// page to the existing PDF using pdf-lib, which can load/edit PDFs without the
// original pdfmake document definition.

async function downloadPdfFromGcs(internalPath: string): Promise<Buffer> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const entityId = internalPath.replace(/^\/objects\//, "");
  const sep = privateDir.endsWith("/") ? "" : "/";
  const fullPath = `${privateDir}${sep}${entityId}`;
  const { bucketName, objectName } = parseGcsPath(fullPath);
  const [buf] = await objectStorageClient.bucket(bucketName).file(objectName).download();
  return buf;
}

async function overwritePdfInGcs(internalPath: string, buffer: Buffer): Promise<void> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const entityId = internalPath.replace(/^\/objects\//, "");
  const sep = privateDir.endsWith("/") ? "" : "/";
  const fullPath = `${privateDir}${sep}${entityId}`;
  const { bucketName, objectName } = parseGcsPath(fullPath);
  await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, {
    contentType: "application/pdf",
    metadata: { cacheControl: "private, max-age=3600" },
  });
}

export interface SignatureToEmbed {
  signerName: string;
  signerRole: string;
  signedAt: Date;
  /** Raw SVG markup produced by the mobile SignaturePad component (may be empty for a stamp-only signature). */
  signatureSvg?: string | null;
}

/** Extracts `d="..."` path data from simple single-color <path> elements (our SignaturePad output). */
function extractSvgPaths(svg: string): string[] {
  const matches = [...svg.matchAll(/<path\s+d="([^"]+)"/g)];
  return matches.map((m) => m[1]);
}

/**
 * Appends a "Signatures électroniques" page to an existing generated document PDF,
 * rendering each signer's handwritten signature (from SVG path data) plus their
 * name, role, and timestamp. Overwrites the PDF in-place at `internalPath`.
 * Best-effort: throws on failure so the caller can log/audit without blocking
 * the underlying signature record, which is already durably stored in the DB.
 */
export async function appendSignaturesToPdf(internalPath: string, signatures: SignatureToEmbed[]): Promise<void> {
  if (signatures.length === 0) return;
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

  const existingBytes = await downloadPdfFromGcs(internalPath);
  const pdfDoc = await PDFDocument.load(existingBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4 pt
  const PAGE_H = 841.89;
  const ROW_H = 130;
  const MARGIN = 40;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cursorY = PAGE_H - MARGIN;

  page.drawText("Signatures électroniques", {
    x: MARGIN, y: cursorY, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.2),
  });
  cursorY -= 30;

  for (const sig of signatures) {
    if (cursorY - ROW_H < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      cursorY = PAGE_H - MARGIN;
    }

    const boxTop = cursorY;
    const boxBottom = cursorY - ROW_H + 20;
    page.drawRectangle({
      x: MARGIN, y: boxBottom, width: PAGE_W - 2 * MARGIN, height: boxTop - boxBottom,
      borderColor: rgb(0.85, 0.85, 0.88), borderWidth: 1,
    });

    page.drawText(sig.signerName, { x: MARGIN + 12, y: boxTop - 20, size: 12, font: boldFont, color: rgb(0.1, 0.1, 0.2) });
    page.drawText(
      `${sig.signerRole === "super_admin" ? "Super administrateur" : "Administrateur du syndicat"} — signé le ${sig.signedAt.toLocaleString("fr-FR")}`,
      { x: MARGIN + 12, y: boxTop - 36, size: 9, font, color: rgb(0.4, 0.4, 0.45) },
    );

    const paths = sig.signatureSvg ? extractSvgPaths(sig.signatureSvg) : [];
    if (paths.length > 0) {
      // SignaturePad canvas is 320x180 — scale/translate into the signature box
      const scale = 0.55;
      const originX = MARGIN + 12;
      const originY = boxBottom + 15 + 180 * scale; // flip Y (SVG y-down → PDF y-up)
      for (const d of paths) {
        try {
          page.drawSvgPath(d, {
            x: originX,
            y: originY,
            scale,
            borderColor: rgb(0.12, 0.16, 0.35),
            borderWidth: 1.5,
          });
        } catch {
          // Malformed path data — skip this stroke rather than failing the whole embed
        }
      }
    } else {
      page.drawText("(signature électronique enregistrée sans tracé manuscrit)", {
        x: MARGIN + 12, y: boxTop - 60, size: 9, font, color: rgb(0.55, 0.55, 0.6),
      });
    }

    cursorY -= ROW_H;
  }

  const outBytes = await pdfDoc.save();
  await overwritePdfInGcs(internalPath, Buffer.from(outBytes));
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
  | "mise_en_demeure"
  // ── 11 new enterprise templates ─────────────────────
  | "demande_administrative"
  | "autorisation"
  | "ordre_de_mission"
  | "lettre_officielle"
  | "note_interne"
  | "rapport_financier"
  | "rapport_audit"
  | "convention_partenariat"
  | "accord_collectif"
  | "compte_rendu"
  | "rapport_activite"
  | "reglement";

/** Sequential-numbering prefix per template — used by the API route to mint REG-2026-0001 style refs. */
export const TEMPLATE_NUMBER_PREFIX: Record<DocumentTemplate, string> = {
  attestation: "ATT",
  pv: "PV",
  convocation: "CONV",
  contrat: "CTR",
  rapport: "RAP",
  decision: "DEC",
  certificat: "CERT",
  circulaire: "CIRC",
  mise_en_demeure: "MED",
  demande_administrative: "DEM",
  autorisation: "AUT",
  ordre_de_mission: "OM",
  lettre_officielle: "LO",
  note_interne: "NI",
  rapport_financier: "FIN",
  rapport_audit: "AUD",
  convention_partenariat: "CONV-P",
  accord_collectif: "AC",
  compte_rendu: "CR",
  rapport_activite: "RA",
  reglement: "REG",
};

/** Real co-ownership property/residence data — fetched from `buildingsTable` + `lotsTable`. */
export interface PropertyInfo {
  name: string;
  address: string;
  city: string;
  totalBuildings: number;
  totalFloors: number;
  totalLots: number;
  totalSurfaceM2: number | null;
  /** Cadastral / land-registry reference (titre foncier), when available. */
  landRegistryReference: string | null;
  createdAt: string | null;
}

/** A syndicate office-holder (élu du conseil syndical) or staff role, for signature/identity blocks. */
export interface OfficeHolder {
  fullName: string;
  email: string | null;
  phone: string | null;
}

export interface OfficeHolders {
  president?: OfficeHolder;
  vicePresident?: OfficeHolder;
  secretary?: OfficeHolder;
  treasurer?: OfficeHolder;
  manager?: OfficeHolder;
}

export interface SyndicateInfo {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  registrationNumber: string;
  logoColor: string;
  /** Object-storage path ("/objects/...") or https URL to the syndicate's logo (PNG/JPG). */
  logoUrl?: string | null;
  /** Short acronym shown next to/instead of the logo (e.g. "SCA"). Falls back to initials. */
  abbreviation?: string | null;
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
  /** Real residence/co-ownership data, fetched from buildingsTable + lotsTable. */
  property?: PropertyInfo;
  /** Real office-holder identities, fetched from conseilSyndicalTable. */
  officeHolders?: OfficeHolders;
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

  // QR code + logo — both non-blocking / best-effort
  const [qrDataUrl, logoDataUrl] = await Promise.all([
    generateQrDataUrl(docNum),
    fetchLogoDataUrl(syndInfo.logoUrl),
  ]);

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

  const header = buildHeaderBand(syndInfo, getDocTypeLabel(template), docNum, qrDataUrl, accentColor, today, logoDataUrl);

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

    // ── Template 10: Demande Administrative ─────────────────────────────────────
    case "demande_administrative":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Demandeur :",       member || "[NOM DU DEMANDEUR]"],
          ["Objet de la demande :", input.objet as string || body || "—"],
          ["Date de la demande :", today],
          ["Pièces jointes :",  input.piecesJointes as string || "À préciser"],
          ["Référence :",       docNum],
        ], accentColor),
        contentSection(
          "Exposé de la demande",
          input.expose as string || body ||
            `Le soussigné(e), ${member || "[NOM]"}, soumet la présente demande auprès de ${syndInfo.name} ` +
            "et sollicite une réponse favorable dans les meilleurs délais.",
          accentColor,
        ),
        contentSection(
          "Pièces justificatives",
          input.justificatifs as string || "• Document d'identité\n• Tout document pertinent à la demande",
          accentColor,
        ),
        {
          text: `Fait à ${syndInfo.city || "—"}, le ${today}`,
          style: "body",
          alignment: "right" as const,
          margin: [0, 16, 0, 0],
        },
        signatureBlock("Le Demandeur", member || "[NOM DU DEMANDEUR]", accentColor),
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 11: Autorisation ────────────────────────────────────────────────
    case "autorisation":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Bénéficiaire :",    member || "[NOM DU BÉNÉFICIAIRE]"],
          ["Objet :",           input.objet as string || body || "—"],
          ["Valable du :",      input.dateDebut as string || today],
          ["Au :",              input.dateFin as string || "À préciser"],
          ["Référence :",       docNum],
        ], accentColor),
        contentSection(
          "Autorisation accordée",
          input.texteAutorisation as string || body ||
            `Par la présente, ${syndInfo.name} autorise ${member || "[NOM]"} à procéder à l'action décrite ci-dessous, ` +
            "sous réserve du respect des règles en vigueur au sein de la structure.",
          accentColor,
        ),
        contentSection(
          "Conditions et restrictions",
          input.conditions as string || "Cette autorisation est strictement personnelle et non transférable. Elle ne vaut que pour l'objet précisé ci-dessus.",
          accentColor,
        ),
        {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: "✓  AUTORISATION VALIDE", fontSize: 10, bold: true, color: "#16a34a", margin: [0, 0, 0, 4] },
                { text: `Délivrée par ${syndInfo.name} — ${today}`, fontSize: 9, color: "#16a34a" },
              ],
              fillColor: "#f0fdf4",
              margin: [12, 10, 12, 10],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => "#86efac", vLineColor: () => "#86efac" },
          margin: [0, 0, 0, 16],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 12: Ordre de Mission ────────────────────────────────────────────
    case "ordre_de_mission":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Missionnaire :",    member || "[NOM DU MISSIONNAIRE]"],
          ["Qualité / Poste :", input.poste as string || "—"],
          ["Destination :",     input.destination as string || "—"],
          ["Date de départ :",  input.dateDepart as string || today],
          ["Date de retour :",  input.dateRetour as string || "À préciser"],
          ["Objet de la mission :", input.objetMission as string || body || "—"],
          ["Référence :",       docNum],
        ], accentColor),
        contentSection(
          "Description de la mission",
          input.description as string || body ||
            `${member || "[NOM]"} est chargé(e) de la mission décrite ci-dessus au nom de ${syndInfo.name}. ` +
            "Il/Elle est habilité(e) à représenter l'organisation et à effectuer toutes les démarches nécessaires.",
          accentColor,
        ),
        contentSection(
          "Frais et remboursements",
          input.frais as string || "Les frais de déplacement et d'hébergement seront remboursés sur présentation de justificatifs originaux, conformément au barème en vigueur.",
          accentColor,
        ),
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 13: Lettre Officielle ───────────────────────────────────────────
    case "lettre_officielle":
      content = [
        ...header,
        {
          columns: [
            {
              stack: [
                { text: syndInfo.name, fontSize: 11, bold: true, color: "#1e293b" },
                { text: [syndInfo.address, syndInfo.city].filter(Boolean).join(", "), fontSize: 9, color: "#64748b" },
                { text: syndInfo.phone || "", fontSize: 9, color: "#64748b" },
                { text: syndInfo.email || "", fontSize: 9, color: "#64748b" },
              ],
            },
            {
              stack: [
                { text: `À l'attention de :`, fontSize: 9, color: "#64748b" },
                { text: member || "[DESTINATAIRE]", fontSize: 11, bold: true, color: "#1e293b", margin: [0, 4, 0, 0] },
                { text: `Le ${today}`, fontSize: 9, color: "#64748b", margin: [0, 16, 0, 0] },
                { text: `Réf : ${docNum}`, fontSize: 9, color: "#64748b" },
              ],
              alignment: "right" as const,
            },
          ],
          margin: [0, 0, 0, 24],
        },
        {
          text: `Objet : ${input.objet as string || body || input.title}`,
          fontSize: 10,
          bold: true,
          color: "#1e293b",
          margin: [0, 0, 0, 16],
          decoration: "underline" as const,
        },
        { text: `Monsieur / Madame,`, style: "body", margin: [0, 0, 0, 12] },
        { text: input.corps as string || body || "Nous vous prions de bien vouloir trouver ci-joint les éléments relatifs à l'objet mentionné en référence.", style: "body", margin: [0, 0, 0, 12] },
        { text: "Veuillez agréer, Monsieur / Madame, l'expression de nos salutations distinguées.", style: "body", margin: [0, 0, 0, 0] },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 14: Note Interne ────────────────────────────────────────────────
    case "note_interne":
      content = [
        ...header,
        {
          table: {
            widths: [120, "*"],
            body: [
              [{ text: "À :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: member || "Tous les membres du bureau", style: "metaVal", margin: [8, 6, 8, 6] }],
              [{ text: "De :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: input.de as string || "La Présidence", style: "metaVal", margin: [8, 6, 8, 6] }],
              [{ text: "Date :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: today, style: "metaVal", margin: [8, 6, 8, 6] }],
              [{ text: "Objet :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: input.objet as string || input.title, style: "metaVal", bold: true, margin: [8, 6, 8, 6] }],
              [{ text: "Priorité :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: input.priorite as string || "Normale", style: "metaVal", margin: [8, 6, 8, 6] }],
            ],
          },
          layout: { hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 1 : 0.5, vLineWidth: () => 0.5, hLineColor: () => "#e2e8f0", vLineColor: () => "#e2e8f0" },
          margin: [0, 0, 0, 20],
        },
        contentSection("Message", body || input.corps as string || "Veuillez prendre connaissance des informations ci-dessous et agir en conséquence.", accentColor),
        input.actionRequise
          ? {
              table: {
                widths: ["*"],
                body: [[{ stack: [
                  { text: "ACTION REQUISE", fontSize: 9, bold: true, color: accentColor, margin: [0, 0, 0, 4] },
                  { text: input.actionRequise as string, fontSize: 10, color: "#1e293b" },
                ], fillColor: accentColor + "12", margin: [12, 10, 12, 10] }]],
              },
              layout: { hLineWidth: () => 1, vLineWidth: () => 0, hLineColor: () => accentColor + "50" },
              margin: [0, 0, 0, 16],
            }
          : null,
        { text: `${syndInfo.name} — Note interne n° ${docNum}`, style: "notice", alignment: "center" as const, margin: [0, 30, 0, 0] },
        legalFooterNote(docNum),
      ].filter(Boolean);
      break;

    // ── Template 15: Rapport Financier ───────────────────────────────────────────
    case "rapport_financier":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 8] },
        { text: input.periode as string || `Période : ${today}`, style: "docRef", margin: [0, 0, 0, 16] },
        metaTable([
          ["Établi par :",     input.etabliPar as string || "Le Trésorier"],
          ["Approuvé par :",   input.approuvePar as string || "Le Président"],
          ["Exercice :",       input.exercice as string || new Date().getFullYear().toString()],
          ["Date :",           today],
          ["Référence :",      docNum],
        ], accentColor),
        contentSection(
          "Synthèse financière",
          body || input.synthese as string || "Voir tableaux ci-dessous pour le détail des recettes et dépenses de la période.",
          accentColor,
        ),
        {
          table: {
            widths: ["*", 120, 120],
            body: [
              [
                { text: "Rubrique", style: "tableHeader", fillColor: accentColor, margin: [8, 6, 8, 6] },
                { text: "Prévu (MAD)", style: "tableHeader", fillColor: accentColor, margin: [8, 6, 8, 6], alignment: "right" as const },
                { text: "Réalisé (MAD)", style: "tableHeader", fillColor: accentColor, margin: [8, 6, 8, 6], alignment: "right" as const },
              ],
              ...(input.lignesFinancieres as Array<[string, string, string]> || [
                ["Cotisations membres", "—", "—"],
                ["Charges communes", "—", "—"],
                ["Dépenses d'entretien", "—", "—"],
                ["Autres recettes", "—", "—"],
              ]).map(([label, prevu, realise]: [string, string, string], i: number) => [
                { text: label, style: "tableCell", fillColor: i % 2 === 0 ? "#f8fafc" : "#ffffff", margin: [8, 5, 8, 5] },
                { text: prevu, style: "tableCell", fillColor: i % 2 === 0 ? "#f8fafc" : "#ffffff", alignment: "right" as const, margin: [8, 5, 8, 5] },
                { text: realise, style: "tableCell", fillColor: i % 2 === 0 ? "#f8fafc" : "#ffffff", alignment: "right" as const, margin: [8, 5, 8, 5] },
              ]),
              [
                { text: "TOTAL", bold: true, fontSize: 10, fillColor: accentColor + "20", margin: [8, 6, 8, 6] },
                { text: input.totalPrevu as string || "—", bold: true, fontSize: 10, fillColor: accentColor + "20", alignment: "right" as const, margin: [8, 6, 8, 6] },
                { text: input.totalRealise as string || "—", bold: true, fontSize: 10, fillColor: accentColor + "20", alignment: "right" as const, margin: [8, 6, 8, 6] },
              ],
            ],
          },
          layout: { hLineWidth: (i: number) => i === 0 || i === 1 ? 1 : 0.3, vLineWidth: () => 0.3, hLineColor: () => "#e2e8f0", vLineColor: () => "#e2e8f0" },
          margin: [0, 0, 0, 16],
        },
        contentSection("Observations et recommandations", input.observations as string || "Aucune observation particulière pour la période.", accentColor),
        {
          columns: [
            signatureBlock("Le Trésorier", syndInfo.name, accentColor, false),
            signatureBlock("Le Président", syndInfo.name, accentColor, true),
          ],
        } as unknown,
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 16: Rapport d'Audit ─────────────────────────────────────────────
    case "rapport_audit":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 8] },
        metaTable([
          ["Auditeur(s) :",     input.auditeurs as string || "Commissaire aux comptes"],
          ["Périmètre :",       input.perimetre as string || syndInfo.name],
          ["Période auditée :", input.periodeAuditee as string || `Exercice ${new Date().getFullYear()}`],
          ["Date du rapport :", today],
          ["Opinion :",         input.opinion as string || "Sans réserve"],
          ["Référence :",       docNum],
        ], accentColor),
        contentSection("Contexte et objectifs", input.contexte as string || body || "Le présent rapport présente les conclusions de l'audit réalisé conformément aux normes d'audit applicables.", accentColor),
        contentSection("Constats et observations", input.constats as string || "Voir annexes détaillées.", accentColor),
        contentSection("Recommandations", input.recommandations as string || "Les recommandations issues de cet audit seront présentées lors de la prochaine réunion du bureau.", accentColor),
        {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: "CONCLUSION DE L'AUDIT", fontSize: 10, bold: true, color: accentColor, margin: [0, 0, 0, 6] },
                { text: input.conclusion as string || "Audit réalisé conformément aux standards professionnels. Aucune irrégularité majeure constatée.", fontSize: 10, color: "#334155" },
              ],
              fillColor: accentColor + "0a",
              margin: [14, 12, 14, 12],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => accentColor + "40", vLineColor: () => accentColor + "40" },
          margin: [0, 0, 0, 16],
        },
        signatureBlock("L'Auditeur", input.auditeurs as string || syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 17: Convention de Partenariat ───────────────────────────────────
    case "convention_partenariat":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Partie A :",        syndInfo.name],
          ["Partie B :",        input.partieB as string || member || "[PARTENAIRE]"],
          ["Objet :",           input.objet as string || body || "—"],
          ["Durée :",           input.duree as string || "1 an renouvelable"],
          ["Date d'effet :",    today],
          ["Référence :",       docNum],
        ], accentColor),
        contentSection("Préambule", input.preambule as string || `${syndInfo.name} et ${input.partieB as string || "[PARTENAIRE]"} souhaitent formaliser leur collaboration par la présente convention de partenariat.`, accentColor),
        contentSection("Article 1 — Objet de la convention", input.article1 as string || body || "La présente convention a pour objet de définir les modalités de coopération entre les deux parties.", accentColor),
        contentSection("Article 2 — Engagements des parties", input.article2 as string || "Chaque partie s'engage à respecter ses obligations telles que définies dans les annexes jointes.", accentColor),
        contentSection("Article 3 — Durée et résiliation", input.article3 as string || `La convention prend effet à la date de signature et est conclue pour une durée de ${input.duree as string || "12 mois"}.`, accentColor),
        {
          columns: [
            signatureBlock(`Pour ${syndInfo.name}`, "Le Président", accentColor, true),
            signatureBlock("Pour le partenaire", input.partieB as string || "[PARTENAIRE]", accentColor, false),
          ],
        } as unknown,
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 18: Accord Collectif ────────────────────────────────────────────
    case "accord_collectif":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Syndicat signataire :", syndInfo.name],
          ["Employeur / Org :",     input.employeur as string || "[EMPLOYEUR]"],
          ["Objet :",               input.objet as string || body || "—"],
          ["Date d'application :",  input.dateApplication as string || today],
          ["Durée :",               input.duree as string || "Accord à durée indéterminée"],
          ["Référence :",           docNum],
        ], accentColor),
        contentSection("Préambule", input.preambule as string || `Le présent accord collectif est conclu entre ${syndInfo.name} et ${input.employeur as string || "[EMPLOYEUR]"} dans le respect des dispositions légales.`, accentColor),
        contentSection("Dispositions générales", input.dispositions as string || body || "Les dispositions du présent accord s'appliquent à l'ensemble des membres couverts par son champ d'application.", accentColor),
        contentSection("Champ d'application", input.champApplication as string || "Le présent accord s'applique à tous les salariés de l'établissement concerné.", accentColor),
        contentSection("Modalités d'entrée en vigueur", input.entreeVigueur as string || `L'accord entre en vigueur le ${input.dateApplication as string || today} après dépôt auprès des autorités compétentes.`, accentColor),
        {
          columns: [
            signatureBlock(`Pour ${syndInfo.name}`, "Le Délégué Syndical", accentColor, true),
            signatureBlock("Pour l'employeur", input.employeur as string || "[EMPLOYEUR]", accentColor, false),
          ],
        } as unknown,
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 19: Compte-Rendu de Réunion ─────────────────────────────────────
    case "compte_rendu":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Date de la réunion :", input.dateMeeting as string || today],
          ["Lieu :",               input.lieu as string || syndInfo.city || "—"],
          ["Président de séance :", input.presidentSeance as string || "Le Président du Syndicat"],
          ["Secrétaire de séance :", input.secretaire as string || "—"],
          ["Participants :",        input.participants as string || "—"],
          ["Référence :",           docNum],
        ], accentColor),
        contentSection("Ordre du jour", input.ordreJour as string || "1. Approbation du précédent compte-rendu\n2. Points divers", accentColor),
        contentSection("Déroulement de la réunion", body || input.deroulement as string || "La séance est ouverte à l'heure convoquée. Les points de l'ordre du jour sont traités successivement.", accentColor),
        contentSection("Décisions prises", input.decisions as string || "Les décisions adoptées lors de cette séance feront l'objet d'un suivi lors de la prochaine réunion.", accentColor),
        contentSection("Prochaine réunion", input.prochaineReunion as string || "Date et lieu à définir.", accentColor),
        {
          table: {
            widths: ["*", "*", "*"],
            body: [
              [
                { text: "Le Président", style: "metaKey", alignment: "center" as const, margin: [0, 6, 0, 6] },
                { text: "Le Secrétaire", style: "metaKey", alignment: "center" as const, margin: [0, 6, 0, 6] },
                { text: "CACHET", style: "metaKey", alignment: "center" as const, margin: [0, 6, 0, 6] },
              ],
              [
                { text: "\n\n________________________\n" + (input.presidentSeance as string || ""), fontSize: 8, alignment: "center" as const, color: "#64748b", margin: [4, 8, 4, 8] },
                { text: "\n\n________________________\n" + (input.secretaire as string || ""), fontSize: 8, alignment: "center" as const, color: "#64748b", margin: [4, 8, 4, 8] },
                {
                  stack: [{
                    canvas: [
                      { type: "ellipse", x: 50, y: 30, r1: 28, r2: 28, lineColor: accentColor, lineWidth: 1, dash: { length: 3 } },
                    ],
                  }],
                  margin: [4, 8, 4, 8],
                  alignment: "center" as const,
                },
              ],
            ],
          },
          layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#e2e8f0", vLineColor: () => "#e2e8f0" },
          margin: [0, 30, 0, 0],
        },
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 20: Rapport d'Activité ──────────────────────────────────────────
    case "rapport_activite":
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 8] },
        { text: input.periode as string || `Rapport annuel ${new Date().getFullYear()}`, style: "docRef", margin: [0, 0, 0, 16] },
        metaTable([
          ["Établi par :",   input.etabliPar as string || "Le Secrétaire Général"],
          ["Approuvé par :", input.approuvePar as string || "L'Assemblée Générale"],
          ["Période :",      input.periode as string || `Exercice ${new Date().getFullYear()}`],
          ["Référence :",    docNum],
        ], accentColor),
        contentSection("Synthèse exécutive", input.synthese as string || body || "Le présent rapport dresse le bilan des activités menées au cours de la période et présente les perspectives à venir.", accentColor),
        contentSection("Activités réalisées", input.activites as string || "1. Actions menées\n2. Événements organisés\n3. Partenariats développés\n4. Formation et sensibilisation", accentColor),
        contentSection("Indicateurs clés", input.indicateurs as string || "Les indicateurs de performance seront détaillés en annexe au présent rapport.", accentColor),
        contentSection("Difficultés rencontrées", input.difficultes as string || "Les obstacles rencontrés ont été surmontés grâce à la mobilisation des équipes.", accentColor),
        contentSection("Perspectives et orientations", input.perspectives as string || "Les priorités pour la prochaine période seront définies lors de l'assemblée générale.", accentColor),
        signatureBlock("Le Secrétaire Général", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;

    // ── Template 21: Règlement de Copropriété (dynamic, DB-fed) ─────────────────
    case "reglement": {
      const prop = input.property as PropertyInfo | undefined;
      const officeHolders = input.officeHolders as OfficeHolders | undefined;
      const president = officeHolders?.president;
      content = [
        ...header,
        { text: input.title || "RÈGLEMENT DE COPROPRIÉTÉ", style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Résidence :", prop?.name || syndInfo.name],
          ["Adresse :", [prop?.address, prop?.city].filter(Boolean).join(", ") || [syndInfo.address, syndInfo.city].filter(Boolean).join(", ") || "—"],
          ["Référence foncière :", prop?.landRegistryReference || "—"],
          ["Nombre de bâtiments :", prop ? String(prop.totalBuildings) : "—"],
          ["Nombre d'étages :", prop ? String(prop.totalFloors) : "—"],
          ["Nombre de lots :", prop ? String(prop.totalLots) : "—"],
          ["Surface totale :", prop?.totalSurfaceM2 != null ? `${prop.totalSurfaceM2} m²` : "—"],
          ["Président du syndicat :", president?.fullName || input.president as string || "—"],
          ["Date de génération :", today],
          ["N° de document :", docNum],
        ], accentColor),
        contentSection(
          "Objet du règlement",
          body ||
            `Le présent règlement de copropriété fixe les règles de jouissance, d'usage et d'administration des parties privatives et communes ` +
            `de la résidence "${prop?.name || syndInfo.name}", conformément à la loi 18-00 relative au statut de la copropriété des immeubles bâtis.`,
          accentColor,
        ),
        contentSection(
          "Description de l'immeuble",
          `La résidence "${prop?.name || syndInfo.name}" comprend ${prop ? prop.totalBuildings : "—"} bâtiment(s), ${prop ? prop.totalFloors : "—"} étage(s) ` +
            `et ${prop ? prop.totalLots : "—"} lot(s), pour une surface totale de ${prop?.totalSurfaceM2 != null ? `${prop.totalSurfaceM2} m²` : "non renseignée"}. ` +
            `Référence foncière : ${prop?.landRegistryReference || "non renseignée"}.`,
          accentColor,
        ),
        contentSection(
          "Répartition des charges",
          input.chargesText as string ||
            "La répartition des charges communes est établie proportionnellement aux tantièmes de copropriété attribués à chaque lot, conformément au tableau de répartition annexé au présent règlement.",
          accentColor,
        ),
        contentSection(
          "Administration du syndicat",
          `Le syndicat de la résidence est administré par ${president?.fullName || "le Président du conseil syndical"}` +
            (officeHolders?.manager?.fullName ? ` et géré par ${officeHolders.manager.fullName}` : "") + `.`,
          accentColor,
        ),
        { text: "\n" },
        signatureBlock(president?.fullName ? `Le Président — ${president.fullName}` : "Le Président du Syndicat", syndInfo.name, accentColor),
        legalFooterNote(docNum),
      ];
      break;
    }

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
    attestation:              "ATTESTATION D'ADHÉSION",
    pv:                       "PROCÈS-VERBAL DE RÉUNION",
    convocation:              "CONVOCATION OFFICIELLE",
    contrat:                  "CONTRAT",
    rapport:                  "RAPPORT D'ACTIVITÉ",
    decision:                 "DÉCISION SYNDICALE",
    certificat:               "CERTIFICAT OFFICIEL",
    circulaire:               "CIRCULAIRE INTERNE",
    mise_en_demeure:          "MISE EN DEMEURE OFFICIELLE",
    demande_administrative:   "DEMANDE ADMINISTRATIVE",
    autorisation:             "AUTORISATION OFFICIELLE",
    ordre_de_mission:         "ORDRE DE MISSION",
    lettre_officielle:        "LETTRE OFFICIELLE",
    note_interne:             "NOTE INTERNE",
    rapport_financier:        "RAPPORT FINANCIER",
    rapport_audit:            "RAPPORT D'AUDIT",
    convention_partenariat:   "CONVENTION DE PARTENARIAT",
    accord_collectif:         "ACCORD COLLECTIF",
    compte_rendu:             "COMPTE-RENDU DE RÉUNION",
    rapport_activite:         "RAPPORT D'ACTIVITÉ",
    reglement:                "RÈGLEMENT DE COPROPRIÉTÉ",
  };
  return labels[template] ?? template.toUpperCase().replace(/_/g, " ");
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
  reglements:  "reglement",
  finances:    "rapport_financier",
  statuts:     "certificat",
};
