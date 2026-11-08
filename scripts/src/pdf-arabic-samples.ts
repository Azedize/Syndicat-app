/**
 * Arabic PDF samples for visual inspection (mission 4, 2026-11-08).
 *
 *   node --env-file=../.env --import=tsx src/pdf-arabic-samples.ts [lang]   (default: ar)
 *
 * Builds the MIZAN document templates with a real condominium and co-owner
 * of the test database and Arabic prose mixing numbers, MAD amounts, dates
 * and Latin names, writes the PDFs to scripts/.seedgen/pdf-samples/ and
 * renders each first page to PNG with Ghostscript when it is installed.
 * Reads the database only; nothing is uploaded or stored.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { pool } from "@workspace/db";

if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("pdf-arabic-samples: syndycat_test only");
const lang = (process.argv[2] ?? "ar") as "ar" | "fr" | "en";
const OUT = path.resolve(".seedgen/pdf-samples");
mkdirSync(OUT, { recursive: true });
const lib = (await import(pathToFileURL(path.resolve("../artifacts/api-server/src/lib/documentPdf.ts")).href)) as any;

const [s] = (await pool.unsafe(`
  SELECT s.id, s.name, s.address, s.city, s.phone, s.email, b.name AS building, b.address AS building_address,
         (SELECT count(*)::int FROM lots l WHERE l.building_id = b.id) AS lots,
         m.name AS member, l.number AS lot
    FROM syndicates s JOIN buildings b ON b.syndicate_id = s.id
    JOIN lots l ON l.building_id = b.id
    JOIN members m ON m.syndicate_id = s.id
   WHERE s.status = 'active' ORDER BY s.created_at LIMIT 1`)) as any[];
console.log(`data: ${s.name} — ${s.building} — lot ${s.lot} — ${s.member}`);

const syndicate = { name: s.name, address: s.address ?? "", city: s.city ?? "الدار البيضاء", phone: s.phone ?? "", email: s.email ?? "", website: "", registrationNumber: "RC 123456", logoColor: "#4F46E5" };
const property = { buildingName: s.building, address: s.building_address ?? s.address ?? "", city: s.city ?? "", totalLots: s.lots, lotNumber: s.lot };
const content =
  `يُشهد بأن السيد(ة) ${s.member}، مالك(ة) الوحدة رقم ${s.lot} بعمارة ${s.building}، قد أدى مبلغ 1 250,50 درهم ` +
  `برسم طلب الأداء للفترة 2026-T1 بتاريخ 15 مارس 2026، وفقًا للقانون رقم 18.00 المتعلق بنظام الملكية المشتركة للعقارات المبنية.\n` +
  `يبلغ الرصيد المتبقي 0,00 درهم. المرجع: REC-2026-000191.`;

const TEMPLATES = ["attestation_paiement", "convocation", "pv", "appel_de_fonds", "rapport_financier", "mise_en_demeure", "facture"] as const;
for (const template of TEMPLATES) {
  const docDef = await lib.buildDocumentDefinition(template, {
    title: lang === "ar" ? "وثيقة اختبار ميزان" : "Document de test MIZAN",
    content,
    syndicate,
    property,
    memberName: s.member,
    documentNumber: `TEST-${template.toUpperCase()}-0001`,
    date: "2026-11-08",
    docStatus: "validated",
    version: "v1.0",
    language: lang,
  });
  const pdf: Buffer = await lib.buildPdfBuffer(docDef);
  const file = path.join(OUT, `${template}-${lang}.pdf`);
  writeFileSync(file, pdf);
  console.log(`${template}: ${pdf.length} bytes`);
}

const gs = ["C:/Program Files/gs/gs10.07.1/bin/gswin64c.exe", "gs"].find((g) => g === "gs" || existsSync(g));
if (gs) {
  for (const template of TEMPLATES) {
    const file = path.join(OUT, `${template}-${lang}.pdf`);
    try {
      execFileSync(gs, ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m", "-r110", "-dFirstPage=1", "-dLastPage=1", `-sOutputFile=${file.replace(/\.pdf$/, ".png")}`, file]);
    } catch (e) {
      console.log(`render failed for ${template}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  console.log(`PNG previews in ${OUT}`);
}
await pool.end();
