/**
 * Real files for documents, invoices, proofs and attachments, written where
 * the API's local storage reads them (`artifacts/api-server/uploads`, or
 * LOCAL_UPLOADS_DIR), so that previews and downloads actually work.
 *
 *   renderPdf   A4 business document rendered with pdfmake, the API's own
 *               PDF library (header band, reference, parties, key/value
 *               block, tables with totals, page breaks, page numbers,
 *               "DOCUMENT FICTIF — TEST" watermark and footer). Helvetica,
 *               Amiri for Arabic text; text is selectable and searchable.
 *   makePng     RGB image encoded with zlib (decodable by any viewer).
 *   inspectPdf / inspectPng  structural validation used by `files-check`
 *               (cross-reference table, page tree, CRCs, pixel data size).
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

export const UPLOADS_DIR = path.resolve(process.cwd(), "../artifacts/api-server", process.env.LOCAL_UPLOADS_DIR ?? "uploads");
export const FICTIF = "DOCUMENT FICTIF — TEST";

// ─── Document model ───────────────────────────────────────────────────────────

export interface PdfTable {
  columns: { label: string; width: number; align?: "left" | "right" }[];
  rows: string[][];
  totals?: [string, string][];
}
export interface PdfSection {
  heading?: string;
  paragraphs?: string[];
  keyValues?: [string, string][];
  table?: PdfTable;
  bullets?: string[];
}
export interface PdfSpec {
  /** Short kind shown in the header band (FACTURE, REÇU, PROCÈS-VERBAL…). */
  kind: string;
  title: string;
  reference?: string;
  date?: string;
  issuer: { name: string; lines: string[] };
  recipient?: { label: string; name: string; lines: string[] };
  keyValues?: [string, string][];
  sections: PdfSection[];
  signature?: string;
  footerNote?: string;
}

// ─── Rendering (pdfmake, as the API's official documents) ─────────────────────
//
// The project's own PDF stack: pdfmake (dependency of the API) with the
// standard Helvetica fonts and the bundled Amiri font for Arabic text
// (fontkit shapes the letters). Loaded from the API package, like apiLib().

const API_DIR = path.resolve(process.cwd(), "../artifacts/api-server");
const FONTS_DIR = path.join(API_DIR, "fonts");
let printer: any = null;
function getPrinter() {
  if (printer) return printer;
  const req = createRequire(realpathSync(path.join(API_DIR, "node_modules/pdfmake/package.json")));
  const PdfPrinter = req("pdfmake");
  printer = new PdfPrinter({
    Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" },
    Amiri: {
      normal: path.join(FONTS_DIR, "Amiri-Regular.ttf"),
      bold: path.join(FONTS_DIR, "Amiri-Bold.ttf"),
      italics: path.join(FONTS_DIR, "Amiri-Italic.ttf"),
      bolditalics: path.join(FONTS_DIR, "Amiri-BoldItalic.ttf"),
    },
  });
  return printer;
}

const NAVY = "#0B1D3E";
const GOLD = "#C69D41";
const GREY = "#727A87";
const LIGHT = "#F3F4F6";
const RED = "#B3261E";
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/**
 * Text node; Arabic text is set in Amiri (Helvetica has no Arabic glyphs) and
 * kept as one shaping run (no-break spaces): otherwise pdfmake splits the
 * words and the gap between them is lost.
 */
const tx = (text: string, o: Record<string, unknown> = {}) => (ARABIC.test(text) ? { text: segments(text), ...o } : { text, ...o });

/**
 * Mixed or Arabic text as inline segments. fontkit shapes an Arabic run only
 * when the run is entirely Arabic, and lays its words out left to right: each
 * group of consecutive Arabic words becomes its own Amiri segment, words in
 * display order (reversed) joined by no-break spaces; Latin words stay in the
 * default font, in reading order.
 */
function segments(text: string): { text: string; font?: string }[] {
  const out: { text: string; font?: string }[] = [];
  let arabic: string[] = [];
  let latin: string[] = [];
  const flushArabic = () => {
    if (arabic.length) out.push({ text: arabic.reverse().join(" "), font: "Amiri" });
    arabic = [];
  };
  const flushLatin = () => {
    if (latin.length) out.push({ text: latin.join(" ") });
    latin = [];
  };
  for (const w of text.split(" ")) {
    if (ARABIC.test(w)) {
      if (latin.length) {
        latin.push("");
        flushLatin();
      }
      arabic.push(w);
    } else {
      if (arabic.length) {
        flushArabic();
        latin.push("");
      }
      latin.push(w);
    }
  }
  flushArabic();
  flushLatin();
  return out;
}

/** Renders a business document to a PDF (A4, header band, footer with page numbers, watermark). */
export async function renderPdf(spec: PdfSpec): Promise<Buffer> {
  const content: any[] = [];
  content.push(tx(spec.title, { style: "title" }));

  const left = spec.recipient
    ? {
        table: {
          widths: ["*"],
          body: [[{ stack: [{ text: spec.recipient.label.toUpperCase(), style: "label" }, tx(spec.recipient.name, { bold: true, fontSize: 10.5, margin: [0, 3, 0, 2] }), ...spec.recipient.lines.filter(Boolean).map((l) => tx(l, { fontSize: 8.5 }))], fillColor: LIGHT, margin: [8, 6, 8, 6] }]],
        },
        layout: "noBorders",
      }
    : { text: "" };
  const kv = (pairs: [string, string][], size = 8.5) => ({
    table: { widths: ["*", "auto"], body: pairs.map(([k, v]) => [{ text: k, color: GREY, fontSize: size }, tx(v, { bold: true, alignment: "right", fontSize: size })]) },
    layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => "#D9DCE1", paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 0, paddingRight: () => 0 },
  });
  if (spec.recipient || spec.keyValues?.length) {
    content.push({ columns: [{ width: "50%", ...left }, { width: "50%", ...(spec.keyValues?.length ? kv(spec.keyValues) : { text: "" }) }], columnGap: 16, margin: [0, 4, 0, 14] });
  }

  for (const s of spec.sections) {
    if (s.heading) content.push({ stack: [{ text: s.heading.toUpperCase(), style: "heading" }, { canvas: [{ type: "line", x1: 0, y1: 2, x2: 499, y2: 2, lineWidth: 1, lineColor: GOLD }] }], margin: [0, 8, 0, 8] });
    for (const p of s.paragraphs ?? []) content.push(tx(p, { margin: [0, 0, 0, 6], lineHeight: 1.25 }));
    if (s.bullets?.length) content.push({ ul: s.bullets.map((b) => tx(b)), margin: [0, 0, 0, 6] });
    if (s.keyValues?.length) content.push({ ...kv(s.keyValues, 9), margin: [0, 0, 0, 8] });
    if (s.table) {
      const t = s.table;
      const total = t.columns.reduce((a, c) => a + c.width, 0);
      content.push({
        table: {
          headerRows: 1,
          widths: t.columns.map((c) => `${((c.width / total) * 100).toFixed(2)}%`),
          body: [
            t.columns.map((c) => ({ text: c.label, bold: true, color: "#FFFFFF", fillColor: NAVY, alignment: c.align ?? "left", fontSize: 8 })),
            ...t.rows.map((row) => row.map((v, i) => tx(v, { alignment: t.columns[i].align ?? "left", fontSize: 8.5 }))),
          ],
        },
        layout: { fillColor: (i: number) => (i > 0 && i % 2 === 0 ? LIGHT : null), hLineWidth: (i: number, node: any) => (i === node.table.body.length ? 0.8 : 0), vLineWidth: () => 0, hLineColor: () => "#B4B8C0", paddingTop: () => 4, paddingBottom: () => 4 },
        margin: [0, 0, 0, 4],
      });
      if (t.totals?.length) {
        content.push({ columns: [{ width: "*", text: "" }, { width: 230, ...kv(t.totals, 10) }], margin: [0, 2, 0, 10] });
      }
    }
  }
  if (spec.signature) {
    content.push({
      columns: [{ width: "*", text: "" }, { width: 210, stack: [tx(spec.signature, { bold: true, color: NAVY }), { canvas: [{ type: "line", x1: 0, y1: 40, x2: 210, y2: 40, lineWidth: 0.6, lineColor: "#9AA0A8" }] }, { text: "Signature et cachet", fontSize: 7.5, color: GREY, margin: [0, 4, 0, 0] }] }],
      margin: [0, 18, 0, 0],
      unbreakable: true,
    });
  }
  if (spec.footerNote) content.push(tx(spec.footerNote, { fontSize: 8, color: GREY, margin: [0, 10, 0, 0] }));

  const def = {
    pageSize: "A4",
    pageMargins: [48, 118, 48, 64],
    info: { title: spec.title, subject: FICTIF, producer: "seedgen MIZAN", creator: "seedgen" },
    watermark: { text: FICTIF, color: "#9AA3B2", opacity: 0.12, bold: true, fontSize: 40, angle: -45 },
    defaultStyle: { font: "Helvetica", fontSize: 9.5, color: "#21262D" },
    styles: {
      title: { fontSize: 16, bold: true, color: NAVY, margin: [0, 0, 0, 8] },
      heading: { fontSize: 9.5, bold: true, color: NAVY },
      label: { fontSize: 7.5, bold: true, color: GREY },
    },
    header: () => ({
      table: {
        widths: ["*", "auto"],
        body: [
          [
            { stack: [tx(spec.issuer.name, { fontSize: 14, bold: true, color: "#FFFFFF" }), ...spec.issuer.lines.slice(0, 2).map((l) => tx(l, { fontSize: 8.5, color: "#D9E0EC" }))], margin: [48, 20, 0, 16] },
            { stack: [{ text: spec.kind, fontSize: 14, bold: true, color: GOLD, alignment: "right" }, ...(spec.reference ? [{ text: `N° ${spec.reference}`, fontSize: 9, bold: true, color: "#FFFFFF", alignment: "right" }] : []), ...(spec.date ? [{ text: spec.date, fontSize: 8.5, color: "#D9E0EC", alignment: "right" }] : [])], margin: [0, 20, 48, 16] },
          ],
        ],
      },
      layout: { fillColor: () => NAVY, hLineWidth: (i: number) => (i === 1 ? 4 : 0), hLineColor: () => GOLD, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    }),
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${FICTIF} — données générées pour l'environnement de développement, sans valeur juridique ni comptable.`, fontSize: 7, bold: true, color: RED },
        { text: `Page ${page} / ${pages}`, fontSize: 7.5, color: GREY, alignment: "right", width: 70 },
      ],
      margin: [48, 22, 48, 0],
    }),
    content,
  };

  const doc = getPrinter().createPdfKitDocument(def);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// ─── Images ───────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * A "photo" for attachments: sky / wall gradient, a ground band and a few
 * shapes whose colours and positions come from `seed` (so every picture
 * differs). Real RGB PNG, deflate-compressed.
 */
export function makePng(seed: number, width = 480, height = 320): Buffer {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const hue = rnd();
  const base = [120 + Math.round(hue * 100), 130 + Math.round(rnd() * 80), 150 + Math.round(rnd() * 70)];
  const shapes = Array.from({ length: 3 + Math.floor(rnd() * 4) }, () => ({
    cx: rnd() * width,
    cy: height * (0.3 + rnd() * 0.5),
    r: 18 + rnd() * 60,
    col: [Math.round(rnd() * 200), Math.round(rnd() * 160), Math.round(rnd() * 120)],
  }));
  const ground = height * (0.68 + rnd() * 0.12);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let yy = 0; yy < height; yy++) {
    const row = yy * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      let r: number, g: number, b: number;
      const t = yy / height;
      if (yy < ground) {
        r = base[0] * (1 - t * 0.4);
        g = base[1] * (1 - t * 0.3);
        b = base[2];
      } else {
        r = 90 + ((x * 7 + yy * 3) % 23);
        g = 80 + ((x * 5) % 19);
        b = 70;
      }
      for (const sh of shapes) {
        const dx = x - sh.cx;
        const dy = yy - sh.cy;
        if (dx * dx + dy * dy < sh.r * sh.r) {
          [r, g, b] = sh.col;
          break;
        }
      }
      const o = row + 1 + x * 3;
      raw[o] = Math.max(0, Math.min(255, Math.round(r)));
      raw[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      raw[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

// ─── Validation (files-check) ─────────────────────────────────────────────────

export interface FileCheck {
  ok: boolean;
  detail: string;
}

/** Decodes a PNG: signature, chunk CRCs, IHDR, inflated pixel data size, IEND. */
export function inspectPng(buf: Buffer): FileCheck {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ok: false, detail: "signature PNG absente" };
  let off = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
  let depth = 0;
  const idat: Buffer[] = [];
  let end = false;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== crc) return { ok: false, detail: `CRC invalide (${type})` };
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") {
      end = true;
      break;
    }
    off += 12 + len;
  }
  if (!end || !w || !h) return { ok: false, detail: "structure PNG incomplète" };
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType as 0 | 2 | 3 | 4 | 6] ?? 0;
  let pixels: Buffer;
  try {
    pixels = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return { ok: false, detail: "données d'image non décompressables" };
  }
  const expected = h * (1 + Math.ceil((w * channels * depth) / 8));
  if (pixels.length !== expected) return { ok: false, detail: `taille des pixels ${pixels.length} ≠ ${expected}` };
  return { ok: true, detail: `${w}×${h}` };
}

/**
 * Validates a PDF the way a reader opens it: header, trailer, startxref
 * pointing at the cross-reference table, every in-use entry pointing at its
 * object, the page tree and the declared page count, and inflatable content
 * streams.
 */
export function inspectPdf(buf: Buffer): FileCheck {
  const s = buf.toString("latin1");
  if (!s.startsWith("%PDF-1.")) return { ok: false, detail: "en-tête PDF absent" };
  if (!/%%EOF\s*$/.test(s)) return { ok: false, detail: "fin de fichier %%EOF absente" };
  const m = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
  if (!m) return { ok: false, detail: "startxref absent" };
  const xrefAt = Number(m[1]);
  if (s.slice(xrefAt, xrefAt + 4) !== "xref") return { ok: false, detail: "startxref ne pointe pas vers la table xref" };
  const head = /^xref\s+0\s+(\d+)\s*?\r?\n/.exec(s.slice(xrefAt, xrefAt + 40));
  if (!head) return { ok: false, detail: "table xref illisible" };
  const count = Number(head[1]);
  const entriesStart = xrefAt + head[0].length;
  const objectAt = new Map<number, number>();
  for (let i = 1; i < count; i++) {
    const e = s.slice(entriesStart + i * 20, entriesStart + i * 20 + 20);
    if (e[17] !== "n") continue;
    const off = Number(e.slice(0, 10));
    if (!new RegExp(`^${i}\\s+0\\s+obj`).test(s.slice(off, off + 20))) return { ok: false, detail: `objet ${i} introuvable à l'offset ${off}` };
    objectAt.set(i, off);
  }
  const trailer = s.slice(xrefAt);
  const root = /\/Root\s+(\d+)\s+0\s+R/.exec(trailer);
  if (!root || !objectAt.has(Number(root[1]))) return { ok: false, detail: "catalogue (/Root) introuvable" };
  const declared = [...s.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((x) => Number(x[1]));
  const pageObjects = (s.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  if (!declared.length || pageObjects < 1 || Math.max(...declared) !== pageObjects) return { ok: false, detail: `pages incohérentes (${declared.join("/")} déclarées, ${pageObjects} objets page)` };
  // every Flate stream must inflate (content, fonts, images)
  let inflated = 0;
  for (const off of objectAt.values()) {
    const end = s.indexOf("endobj", off);
    const obj = s.slice(off, end);
    const st = /stream\r?\n/.exec(obj);
    if (!st || !/\/FlateDecode/.test(obj.slice(0, st.index))) continue;
    const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(obj.slice(0, st.index));
    if (!len) continue; // indirect length: skipped
    const start = off + st.index + st[0].length;
    try {
      inflated += zlib.inflateSync(buf.subarray(start, start + Number(len[1]))).length;
    } catch {
      return { ok: false, detail: "flux non décompressable" };
    }
  }
  if (inflated === 0) return { ok: false, detail: "aucun contenu lisible" };
  return { ok: true, detail: `${pageObjects} page(s)` };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export interface StoredFile {
  objectPath: string;
  fileName: string;
  mime: string;
  size: number;
  checksum: string;
}

/** Writes bytes under a fresh name and returns its storage path (/objects/uploads/…). */
export async function writeUpload(id: string, bytes: Buffer, ext: ".pdf" | ".png", fileName: string): Promise<StoredFile> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const name = `${id}${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, name), bytes);
  return {
    objectPath: `/objects/uploads/${name}`,
    fileName,
    mime: ext === ".pdf" ? "application/pdf" : "image/png",
    size: bytes.length,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function uploadPath(objectPath: string): string | null {
  if (!objectPath.startsWith("/objects/uploads/")) return null;
  return path.join(UPLOADS_DIR, path.basename(objectPath));
}

export async function removeUpload(objectPath: string) {
  const p = uploadPath(objectPath);
  if (p) await fs.unlink(p).catch(() => {});
}
