/**
 * documentPdf.ts
 * Server-side PDF generation + GCS upload for the Documents module.
 *
 * Generates a real PDF buffer for a given document template, uploads it
 * to GCS using the Replit object storage sidecar, and returns a signed
 * 7-day GET URL (or internal /objects/… path for later signing).
 */
import { randomUUID } from "crypto";
import { objectStorageClient } from "./objectStorage.js";
import { logger } from "./logger.js";

const SIDECAR = "http://127.0.0.1:1106";

// ─── pdfmake helpers ──────────────────────────────────────────────────────────

const FONTS = {
  Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" },
  Times: { normal: "Times-Roman", bold: "Times-Bold", italics: "Times-Italic", bolditalics: "Times-BoldItalic" },
  Courier: { normal: "Courier", bold: "Courier-Bold", italics: "Courier-Oblique", bolditalics: "Courier-BoldOblique" },
};

const DOC_STYLES = {
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

function pageHeader(title: string, subtitle?: string): unknown[] {
  return [
    { text: "SYNDYCAT", style: "brand", margin: [0, 0, 0, 2] },
    { text: title, style: "header" },
    ...(subtitle ? [{ text: subtitle, style: "subheader" }] : []),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#7c3aed" }], margin: [0, 8, 0, 16] },
  ];
}

function stdFooter() {
  return (page: number, pages: number) => ({
    text: `Page ${page} / ${pages}  —  Document officiel SYNDYCAT — ${new Date().toLocaleDateString("fr-MA")}`,
    style: "footer",
    alignment: "center",
    margin: [0, 0, 0, 10],
  });
}

function infoRow(label: string, value: string): unknown[] {
  return [
    { text: label, style: "label" },
    { text: value, style: "value", margin: [0, 0, 0, 8] },
  ];
}

function signatureBlock(syndName: string, syndAddr: string): unknown {
  return {
    columns: [
      [
        { text: "\n\n_____________________________", style: "label" },
        { text: "Le Président du Syndicat", style: "label" },
      ],
      [
        { text: syndName, style: "value", bold: true, alignment: "right" as const },
        { text: syndAddr, style: "label", alignment: "right" as const },
      ],
    ],
    margin: [0, 30, 0, 0],
  };
}

// ─── Buffer generation ────────────────────────────────────────────────────────

async function buildPdfBuffer(docDef: unknown): Promise<Buffer> {
  const PdfPrinter = (await import("pdfmake")).default as any;
  const printer = new PdfPrinter(FONTS);
  const pdfDoc = printer.createPdfKitDocument({ defaultStyle: { font: "Helvetica", fontSize: 10 }, ...(docDef as object) });

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}

// ─── GCS direct server-side upload ───────────────────────────────────────────

function parseGcsPath(fullPath: string): { bucketName: string; objectName: string } {
  let clean = fullPath;
  if (clean.startsWith("gs://")) {
    clean = clean.slice(5);
    const slashIdx = clean.indexOf("/");
    return { bucketName: clean.slice(0, slashIdx), objectName: clean.slice(slashIdx + 1) };
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
  const file = bucket.file(objectName);

  await file.save(buffer, {
    contentType: "application/pdf",
    metadata: { cacheControl: "private, max-age=3600" },
  });

  // Internal path — use signDocumentDownloadUrl() to get a signed GET URL
  return `/objects/documents/${objectId}/${filename}`;
}

// ─── Signed download URL (GET, configurable TTL) ─────────────────────────────

export async function signDocumentDownloadUrl(internalPath: string, ttlSec = 3600): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");

  // internalPath: /objects/documents/<uuid>/<file>
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

// ─── Delete object from GCS ───────────────────────────────────────────────────

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

// ─── Template doc definitions ─────────────────────────────────────────────────

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

export interface DocumentInput {
  title: string;
  content?: string;
  syndicateName?: string;
  syndicateAddress?: string;
  memberName?: string;
  documentNumber?: string;
  date?: string;
  [key: string]: unknown;
}

function buildDocDef(template: DocumentTemplate, input: DocumentInput): unknown {
  const today = input.date ?? new Date().toLocaleDateString("fr-MA");
  const syndName = input.syndicateName ?? "SYNDYCAT";
  const syndAddr = input.syndicateAddress ?? "";
  const docNum = input.documentNumber ?? `${template.toUpperCase()}-${Date.now()}`;
  const member = input.memberName ?? "";
  const body = input.content ?? "";
  const sig = signatureBlock(syndName, syndAddr);

  const templateMap: Record<DocumentTemplate, unknown> = {
    attestation: {
      content: [
        ...pageHeader("ATTESTATION D'ADHÉSION", `Réf: ${docNum}`),
        ...infoRow("Date d'émission :", today),
        ...infoRow("Syndicat :", syndName),
        ...infoRow("Membre :", member),
        { text: "ATTESTATION", style: "sectionTitle" },
        { text: body || `Le syndicat ${syndName} atteste que ${member || "[NOM DU MEMBRE]"} est membre en règle à la date du ${today}.`, style: "value", margin: [0, 0, 0, 20] },
        sig,
      ],
    },
    pv: {
      content: [
        ...pageHeader("PROCÈS-VERBAL DE RÉUNION", `Réf: ${docNum} — ${today}`),
        ...infoRow("Date :", today),
        ...infoRow("Syndicat :", syndName),
        { text: "ORDRE DU JOUR", style: "sectionTitle" },
        { text: body || "Voir ordre du jour en annexe.", style: "value", margin: [0, 0, 0, 16] },
        { text: "DÉLIBÉRATIONS", style: "sectionTitle" },
        { text: "Les membres présents ont délibéré sur les points inscrits.", style: "value", margin: [0, 0, 0, 20] },
        sig,
      ],
    },
    convocation: {
      content: [
        ...pageHeader("CONVOCATION À RÉUNION", `Réf: ${docNum}`),
        ...infoRow("À :", member || "[DESTINATAIRE]"),
        ...infoRow("De :", syndName),
        ...infoRow("Date d'envoi :", today),
        { text: "OBJET", style: "sectionTitle" },
        { text: input.title, style: "value", bold: true, margin: [0, 0, 0, 8] },
        { text: body || "Vous êtes convoqué(e) à la réunion.", style: "value", margin: [0, 0, 0, 20] },
        sig,
      ],
    },
    contrat: {
      content: [
        ...pageHeader("CONTRAT", `Réf: ${docNum}`),
        ...infoRow("Date :", today),
        ...infoRow("Parties :", `${syndName} / ${member || "[COCONTRACTANT]"}`),
        { text: "CLAUSES ET CONDITIONS", style: "sectionTitle" },
        { text: body || "Voir clauses contractuelles ci-jointes.", style: "value", margin: [0, 0, 0, 20] },
        sig,
      ],
    },
    rapport: {
      content: [
        ...pageHeader("RAPPORT D'ACTIVITÉ", `${syndName} — ${today}`),
        ...infoRow("Période :", today),
        ...infoRow("Auteur :", member || syndName),
        { text: "SYNTHÈSE", style: "sectionTitle" },
        { text: body || "Ce rapport présente les activités du syndicat pour la période.", style: "value", margin: [0, 0, 0, 20] },
        sig,
      ],
    },
    decision: {
      content: [
        ...pageHeader("DÉCISION SYNDICALE", `Réf: ${docNum}`),
        ...infoRow("Date :", today),
        ...infoRow("Syndicat :", syndName),
        { text: "DÉCISION", style: "sectionTitle" },
        { text: body || "Décision adoptée par le bureau syndical.", style: "value", margin: [0, 0, 0, 20] },
        sig,
      ],
    },
    certificat: {
      content: [
        ...pageHeader("CERTIFICAT", `Réf: ${docNum}`),
        ...infoRow("Délivré à :", member || "[BÉNÉFICIAIRE]"),
        ...infoRow("Date :", today),
        ...infoRow("Syndicat :", syndName),
        { text: "CERTIFICATION", style: "sectionTitle" },
        { text: body || `Le présent certificat est délivré à ${member || "[BÉNÉFICIAIRE]"} par le syndicat ${syndName}.`, style: "value", margin: [0, 0, 0, 20] },
        sig,
      ],
    },
    circulaire: {
      content: [
        ...pageHeader("CIRCULAIRE INTERNE", `Réf: ${docNum}`),
        ...infoRow("À :", "Tous les membres du syndicat"),
        ...infoRow("De :", syndName),
        ...infoRow("Date :", today),
        { text: "OBJET :", style: "sectionTitle" },
        { text: input.title, style: "value", bold: true, margin: [0, 0, 0, 8] },
        { text: body || "Veuillez trouver ci-dessous les informations communiquées.", style: "value", margin: [0, 0, 0, 20] },
        sig,
      ],
    },
    mise_en_demeure: {
      content: [
        ...pageHeader("MISE EN DEMEURE OFFICIELLE", `Réf: ${docNum}`),
        ...infoRow("Destinataire :", member || "[DESTINATAIRE]"),
        ...infoRow("Émetteur :", syndName),
        ...infoRow("Date :", today),
        { text: "OBJET DE LA MISE EN DEMEURE", style: "sectionTitle" },
        { text: body || "Par la présente, nous vous mettons en demeure de vous conformer à vos obligations.", style: "value", margin: [0, 0, 0, 20] },
        { text: "DÉLAI DE RÉPONSE : 15 JOURS À COMPTER DE LA RÉCEPTION", style: "label", color: "#ef4444", bold: true, margin: [0, 0, 0, 20] },
        sig,
      ],
    },
  };

  return {
    ...(templateMap[template] as object),
    styles: DOC_STYLES,
    footer: stdFooter(),
  };
}

// ─── Main public API ──────────────────────────────────────────────────────────

export interface GeneratedDocument {
  /** Internal GCS path: /objects/documents/<uuid>/<file> */
  fileUrl: string;
  fileSizeKo: string;
  documentNumber: string;
}

/**
 * Generates a PDF for the given template + input, uploads to GCS, and returns
 * the internal path + metadata. Call signDocumentDownloadUrl(fileUrl) to get
 * a time-limited signed URL for the client.
 *
 * Never throws on storage failure — returns fileUrl="" and logs the error
 * so the document record can still be created without a PDF attachment.
 */
export async function generateAndUploadDocument(
  template: DocumentTemplate,
  input: DocumentInput,
): Promise<GeneratedDocument> {
  const docNumber = input.documentNumber ?? `${template.toUpperCase()}-${Date.now()}`;
  const enriched: DocumentInput = { ...input, documentNumber: docNumber };

  const docDef = buildDocDef(template, enriched);
  const buffer = await buildPdfBuffer(docDef);
  const filename = `${template}-${docNumber.replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
  const fileSizeKo = `${Math.round(buffer.length / 1024)}Ko`;

  try {
    const fileUrl = await uploadBufferToGcs(buffer, filename);
    return { fileUrl, fileSizeKo, documentNumber: docNumber };
  } catch (err) {
    logger.warn({ err }, "generateAndUploadDocument: GCS upload failed — document saved without PDF");
    return { fileUrl: "", fileSizeKo, documentNumber: docNumber };
  }
}

// ─── Category → template mapping ─────────────────────────────────────────────

export const CATEGORY_TO_TEMPLATE: Record<string, DocumentTemplate> = {
  attestation: "attestation",
  pv: "pv",
  juridique: "mise_en_demeure",
  reglements: "circulaire",
  finances: "rapport",
  statuts: "certificat",
};
