/**
 * Arabic text in pdfmake: isolated cases rendered side by side (mission 4).
 *
 *   node --import=tsx src/pdf-bidi-probe.ts
 *
 * Writes scripts/.seedgen/pdf-samples/bidi-probe.pdf (+ .png with Ghostscript)
 * showing how each kind of mixed text comes out: Arabic only, Arabic with a
 * Latin name, with an amount, with parentheses, a wrapped paragraph — raw and
 * after lib/pdf-bidi.ts. No database.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(path.resolve("../artifacts/api-server/package.json"));
const PdfPrinter = require("pdfmake");
const FONTS = path.resolve("../artifacts/api-server/fonts");
const OUT = path.resolve(".seedgen/pdf-samples");
mkdirSync(OUT, { recursive: true });
const bidiPath = path.resolve("../artifacts/api-server/src/lib/pdf-bidi.ts");
const bidi = existsSync(bidiPath) ? ((await import(pathToFileURL(bidiPath).href)) as typeof import("../../artifacts/api-server/src/lib/pdf-bidi.js")) : null;

const CASES = [
  "مرحبا بكم في ميزان",
  "السيد Hassan Cherkaoui مالك الوحدة A101",
  "أدى مبلغ 1 250,50 درهم بتاريخ 2026-03-15",
  "السيد(ة) مالك(ة) الوحدة",
  "الفترة 2026-T1 والمرجع REC-2026-000191.",
  "يُشهد بأن السيد(ة) Hassan Cherkaoui، مالك(ة) الوحدة رقم A101 بعمارة Résidence Atlas — Bâtiment A، قد أدى مبلغ 1 250,50 درهم برسم طلب الأداء للفترة 2026-T1 بتاريخ 15 مارس 2026، وفقًا للقانون رقم 18.00 المتعلق بنظام الملكية المشتركة للعقارات المبنية.",
];

const printer = new PdfPrinter({ Amiri: { normal: `${FONTS}/Amiri-Regular.ttf`, bold: `${FONTS}/Amiri-Bold.ttf`, italics: `${FONTS}/Amiri-Italic.ttf`, bolditalics: `${FONTS}/Amiri-BoldItalic.ttf` } });
const content: unknown[] = [];
for (const [i, c] of CASES.entries()) {
  content.push({ text: `${i + 1}. brut`, fontSize: 8, color: "#888", margin: [0, 10, 0, 2] });
  content.push({ text: c, alignment: "right", fontSize: 12 });
  if (bidi) {
    content.push({ text: `${i + 1}. corrigé`, fontSize: 8, color: "#080", margin: [0, 4, 0, 2] });
    content.push(bidi.rtlParagraph(c, { fontSize: 12 }, 360, { normal: `${FONTS}/Amiri-Regular.ttf`, bold: `${FONTS}/Amiri-Bold.ttf` }));
  }
}
const doc = printer.createPdfKitDocument({ pageSize: "A5", pageMargins: [30, 30, 30, 30], defaultStyle: { font: "Amiri" }, content });
const chunks: Buffer[] = [];
doc.on("data", (c: Buffer) => chunks.push(c));
await new Promise<void>((r) => { doc.on("end", () => r()); doc.end(); });
const file = path.join(OUT, "bidi-probe.pdf");
writeFileSync(file, Buffer.concat(chunks));
const gs = "C:/Program Files/gs/gs10.07.1/bin/gswin64c.exe";
if (existsSync(gs)) execFileSync(gs, ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m", "-r130", `-sOutputFile=${file.replace(/\.pdf$/, "-%d.png")}`, file]);
console.log(`written ${file}`);
