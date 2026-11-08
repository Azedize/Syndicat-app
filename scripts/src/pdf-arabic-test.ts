/**
 * Arabic in generated PDFs (mission 4, 2026-11-08) — no server, no database.
 *
 *   pnpm --filter @workspace/scripts run pdf-arabic:test
 *
 * - right-to-left order of the fragments of a line (lib/pdf-bidi.ts): Arabic
 *   words, Latin names, amounts, dates, references, brackets, final stop;
 * - a long paragraph is cut into lines in reading order;
 * - every document template builds and renders in Arabic, and no Arabic text
 *   is left for pdfmake to lay out by itself;
 * - French documents are not touched by the Arabic layout.
 * The visual check is done with src/pdf-arabic-samples.ts (PNG previews).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve("../artifacts/api-server/src/lib");
const bidi = (await import(pathToFileURL(path.join(SRC, "pdf-bidi.ts")).href)) as typeof import("../../artifacts/api-server/src/lib/pdf-bidi.js");
const doc = (await import(pathToFileURL(path.join(SRC, "documentPdf.ts")).href)) as any;

const checks: boolean[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const N = " ";
const show = (a: string[]) => a.map((f) => `[${f.replace(/ /g, "·")}]`).join("");

// What the page shows: fontkit reverses each fragment that contains Arabic;
// the glyphs are then read left to right and cut at the spaces.
const onPage = (frags: string[]) => {
  const glyphs = frags.map((f) => (bidi.hasArabic(f) ? [...f].reverse().join("") : f)).join("");
  // Each word read normally (an Arabic word is written right to left).
  const words = glyphs.split(N).map((w) => (bidi.hasArabic(w) ? [...w].reverse().join("") : w));
  return { glyphs, words };
};
// Words from the left edge to the right edge of the page.
const CASES: [string, string, string[]][] = [
  ["Arabic only", "مرحبا بكم في ميزان", ["ميزان", "في", "بكم", "مرحبا"]],
  ["Latin name inside Arabic", "السيد Hassan Cherkaoui مالك", ["مالك", "Hassan", "Cherkaoui", "السيد"]],
  ["amount with a thousands space", "مبلغ 1 250,50 درهم", ["درهم", "1", "250,50", "مبلغ"]],
  ["reference with dashes and final stop", "المرجع REC-2026-000191.", [".REC-2026-000191", "المرجع"]],
  ["line starting with a Latin word", "Hassan مالك", ["مالك", "Hassan"]],
];
for (const [name, input, expected] of CASES) {
  const { words, glyphs } = onPage(bidi.visualFragments(input));
  const ok = JSON.stringify(words) === JSON.stringify(expected);
  check(`line order: ${name}`, ok, `left to right: ${words.join(" | ")}${ok ? "" : ` ≠ ${expected.join(" | ")} (${show([glyphs])})`}`);
}
// « السيد(ة) »: on the page, from the left: « ( », « ة », « ) », then « السيد ».
const brackets = onPage(bidi.visualFragments("السيد(ة)")).glyphs;
check("brackets face the right way", brackets.startsWith("(ة)"), show([brackets]));

const long = "يُشهد بأن السيد(ة) Hassan Cherkaoui، مالك(ة) الوحدة رقم A101 بعمارة Résidence Atlas — Bâtiment A، قد أدى مبلغ 1 250,50 درهم برسم طلب الأداء للفترة 2026-T1 بتاريخ 15 مارس 2026.";
const lines = bidi.wrapLines(long, 200, 12, null);
check("a long paragraph is cut into lines in reading order", lines.length > 2 && lines.join(" ") === long.replace(/\s+/g, " ") && lines[0].startsWith("يُشهد"), `${lines.length} lines`);
const node = bidi.rtlParagraph(long, { fontSize: 12 }, 200) as any;
check("each line becomes one right-aligned row of fragments", node.alignment === "right" && Array.isArray(node.stack) && node.stack.every((l: any) => Array.isArray(l.text)), `${node.stack?.length} rows`);

// Every template, in Arabic: builds, renders, and leaves no raw Arabic text to pdfmake.
const rawArabic = (n: unknown): number => {
  if (typeof n === "string") return bidi.hasArabic(n) && /[A-Za-z0-9 ]/.test(n) ? 1 : 0;
  if (Array.isArray(n)) return n.reduce((a: number, x) => a + rawArabic(x), 0);
  if (n && typeof n === "object") {
    const o = n as Record<string, unknown>;
    if (typeof o.text === "string") return bidi.hasArabic(o.text) && /[A-Za-z0-9 ]/.test(o.text) ? 1 : 0;
    return Object.entries(o).reduce((a, [k, v]) => (k === "absolutePosition" ? a : a + rawArabic(v)), 0);
  }
  return 0;
};
const input = (language: string) => ({
  title: language === "ar" ? "وثيقة اختبار" : "Document de test",
  content: long,
  syndicate: { name: "Syndicat Résidence Atlas", address: "12 Bd Anfa", city: "Casablanca", phone: "", email: "", website: "", registrationNumber: "RC 1", logoColor: "#4F46E5" },
  memberName: "Hassan Cherkaoui",
  documentNumber: "TEST-0001",
  date: "2026-11-08",
  docStatus: "validated",
  version: "v1.0",
  language,
});
const TEMPLATES = ["attestation", "attestation_residence", "attestation_propriete", "attestation_paiement", "convocation", "pv", "decision", "rapport_financier", "appel_de_fonds", "facture", "contrat", "mise_en_demeure"];
const failures: string[] = [];
const skipped: string[] = [];
let raw = 0;
for (const t of TEMPLATES) {
  try {
    const def = await doc.buildDocumentDefinition(t, input("ar"));
    raw += rawArabic(def.content);
    const pdf: Buffer = await doc.buildPdfBuffer(def);
    if (pdf.length < 1000 || pdf.subarray(0, 4).toString() !== "%PDF") failures.push(`${t}: not a PDF`);
  } catch (e) {
    const msg = (e as Error).message;
    // The « attestation » template asks for DejaVu Serif, a system font of the Linux server
    // (fonts-dejavu): absent from this machine, it fails in French as well.
    if (/DejaVu/.test(msg) && !existsSync("/usr/share/fonts/truetype/dejavu")) skipped.push(t);
    else failures.push(`${t}: ${msg.slice(0, 80)}`);
  }
}
check(`every template builds and renders in Arabic (${TEMPLATES.length - failures.length - skipped.length}/${TEMPLATES.length}${skipped.length ? `, ${skipped.join(", ")} needs the DejaVu fonts of the server` : ""})`, failures.length === 0, failures.join(" | "));
check("no mixed Arabic text is left for pdfmake to lay out", raw === 0, `${raw} raw text(s)`);

const fr = await doc.buildDocumentDefinition("convocation", { ...input("fr"), content: "Vous êtes convoqué(e) à l'assemblée générale du 15 mars 2026 (1 250,50 MAD)." });
check("French documents keep their plain texts", rawArabic(fr.content) === 0 && JSON.stringify(fr.content).includes("Hassan Cherkaoui") && !JSON.stringify(fr.content).includes(N));

// A French receipt in Helvetica printing an Arabic name (« Payé par »).
const fonts: Record<string, unknown> = { Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" } };
const receipt = bidi.withArabicData({ pageMargins: [40, 40, 40, 60], content: [{ table: { widths: [180, "*"], body: [["Payé par", { text: "محمد الحجي" }], ["Lot", "Lot A602"]] } }] }, fonts, doc.ARABIC_FONT_FILES) as any;
const cell = receipt.content[0].table.body[0][1];
check("an Arabic name in a French receipt gets Amiri and keeps its alignment", Boolean(fonts.Amiri) && cell.font === "Amiri" && cell.alignment === "left" && receipt.content[0].table.body[1][1] === "Lot A602", JSON.stringify(cell).slice(0, 90));

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} Arabic PDF checks passed`);
process.exit(passed === checks.length ? 0 : 1);
