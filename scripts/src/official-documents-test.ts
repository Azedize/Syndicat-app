/**
 * Generated official documents — renders every template through the real PDF
 * engine (pdfmake, bundled fonts) without storage, and checks the output:
 * no "under reconstruction" placeholder, no invented VAT / nationality /
 * certification, multi-page tables, Arabic font embedded.
 * PDFs are written to OUT_DIR (default: OS temp dir) for visual review.
 *
 * Usage: pnpm --filter @workspace/scripts run official-documents:test
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { apiLib } from "./api-lib.js";

type DocumentTemplate = string;
const { buildDocumentDefinition, buildPdfBuffer } = await apiLib("lib/documentPdf.ts");

const OUT = process.env.OUT_DIR ?? path.join(os.tmpdir(), "mizan-official-documents");
mkdirSync(OUT, { recursive: true });
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const syndicate = { name: "Résidence Les Orangers", address: "12 rue Ibn Sina", city: "Rabat", phone: "+212 5 37 00 00 00", email: "syndic@orangers.ma", website: "", registrationNumber: "", logoColor: "#0B1F3A", bankName: "Banque Test", bankIban: "011780000012345678901234" };
const base = { syndicate, memberName: "Omar Benali", documentNumber: "DOC-TEST-000123", date: "19 octobre 2026", content: "Texte rédigé par le syndic.\n\nSecond paragraphe." };
const cases: Array<[string, DocumentTemplate, Record<string, unknown>]> = [
  ["convocation", "convocation", { title: "Convocation à l'assemblée générale ordinaire" }],
  ["convocation-ar", "convocation", { title: "استدعاء للجمعية العامة العادية", language: "ar", memberName: "عمر بنعلي", content: "يتشرف السنديك بدعوتكم لحضور الجمعية العامة العادية." }],
  ["decision", "decision", { title: "Décision — ravalement", votePour: "12", voteContre: "3", voteAbstention: "1" }],
  ["mise_en_demeure", "mise_en_demeure", { title: "Mise en demeure" }],
  ["rapport_financier", "rapport_financier", { exercice: "2025", _kpiBudgetTotal: "120 000,00 MAD", _kpiTotalPaid: "98 500,00 MAD" }],
  ["attestation_residence", "attestation_residence", { _lotNumber: "B-12", _buildingName: "Bâtiment B" }],
  ["attestation_propriete", "attestation_propriete", { _lotNumber: "B-12", _lotTantiemes: "250", _lotSurface: "96" }],
  ["appel_de_fonds", "appel_de_fonds", { amount: "1250.50", dueDate: "30 novembre 2026", periode: "2026-T4" }],
  ["facture", "facture", { _invoiceRef: "FAC-2026-0042", _invoiceLines: Array.from({ length: 45 }, (_, i) => ({ label: `Prestation ${i + 1}`, qty: 1, unitPrice: 350, total: 350 })) }],
  ["sinistre", "sinistre" as DocumentTemplate, { _sinistreType: "dégât_des_eaux", _sinistreDescription: "Infiltration." }],
  ["travaux", "travaux" as DocumentTemplate, { _travauxTitle: "Ascenseur", _travauxDescription: "Câble." }],
];

for (const [name, tpl, extra] of cases) {
  try {
    const def = await buildDocumentDefinition(tpl, { title: "", ...base, ...extra } as any);
    const json = JSON.stringify(def);
    const buf = await buildPdfBuffer(def);
    writeFileSync(path.join(OUT, `${name}.pdf`), buf);
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const problems = [
      /reconstruction|Phase 3/i.test(json) && "placeholder",
      /TVA/.test(json) && "invented VAT",
      /Marocaine|Pleine propriété/.test(json) && "invented default facts",
      /certifié — MIZAN|Aucune signature manuscrite/.test(json) && "unverified certification claim",
    ].filter(Boolean);
    step(`${name}: generated (${pages} page(s)) without invented content`, buf.length > 1000 && buf.subarray(0, 5).toString() === "%PDF-" && problems.length === 0, problems.join(", "));
    if (name === "facture") step("long invoice table paginates (2 pages, header repeated)", pages === 2 && /"headerRows":1/.test(json) && /"dontBreakRows":true/.test(json), `${pages} pages`);
    if (name === "convocation-ar") step("Arabic document embeds the Arabic font (Amiri)", buf.toString("latin1").includes("Amiri"), "");
  } catch (e: any) {
    step(`${name}: generated`, false, e?.message);
  }
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed — PDFs in ${OUT}`);
process.exit(failed.length ? 1 : 0);
