/**
 * PHASE 1 — Full PDF Engine Cleanup
 * Strips all legacy visual content = [...] blocks from every template case.
 * Then removes the legacy visual helper functions (buildHeaderBand…legalFooterNote).
 * Inserts Phase 2 engine scaffolding + reconstructionPlaceholder().
 *
 * Must be run from workspace root:
 *   node artifacts/api-server/scripts/phase1-cleanup.mjs
 */

import { readFileSync, writeFileSync } from "fs";

const FILE = "artifacts/api-server/src/lib/documentPdf.ts";
let lines = readFileSync(FILE, "utf8").split("\n");

// ── replaceRange: replace lines [start..end] inclusive (1-indexed) ─────────────
function replaceRange(start1, end1, replacementStr) {
  const newLines = replacementStr === "" ? [] : replacementStr.split("\n");
  lines.splice(start1 - 1, end1 - start1 + 1, ...newLines);
}

// ── Template case ranges (contentStartLine, caseEndLine, hasBrace) ─────────────
// hasBrace=true  → case ends with "      break;\n    }" — we include the "}" in replacement
// hasBrace=false → case ends with "      break;"        — braceless, no closing "}"
// isDefault      → default case: no break, switch closes with "  }" at line 8148
//
// IMPORTANT: sorted HIGH → LOW so bottom-up processing doesn't shift subsequent lines.
const CASES = [
  { name: "default",               cL: 8141, eL: 8147, hasBrace: false, isDefault: true  },
  { name: "travaux",               cL: 8065, eL: 8138, hasBrace: true                    },
  { name: "sinistre",              cL: 7967, eL: 8022, hasBrace: true                    },
  { name: "contrat_bail",          cL: 7807, eL: 7927, hasBrace: true                    },
  { name: "rapport_election",      cL: 7665, eL: 7787, hasBrace: true                    },
  { name: "decompte_charges",      cL: 7563, eL: 7640, hasBrace: true                    },
  { name: "budget_previsionnel",   cL: 7456, eL: 7546, hasBrace: true                    },
  { name: "facture",               cL: 7419, eL: 7424, hasBrace: true                    },
  { name: "recu_paiement",         cL: 7237, eL: 7285, hasBrace: true                    },
  { name: "appel_de_fonds",        cL: 7221, eL: 7226, hasBrace: true                    },
  { name: "attestation_paiement",  cL: 7122, eL: 7130, hasBrace: true                    },
  { name: "attestation_propriete", cL: 5931, eL: 6511, hasBrace: true                    },
  { name: "attestation_residence", cL: 5596, eL: 5761, hasBrace: true                    },
  { name: "reglement",             cL: 5521, eL: 5581, hasBrace: true                    },
  { name: "rapport_activite",      cL: 5490, eL: 5509, hasBrace: false                   },
  { name: "compte_rendu",          cL: 5416, eL: 5486, hasBrace: false                   },
  { name: "accord_collectif",      cL: 5389, eL: 5412, hasBrace: false                   },
  { name: "convention_partenariat",cL: 5362, eL: 5385, hasBrace: false                   },
  { name: "rapport_audit",         cL: 5326, eL: 5358, hasBrace: false                   },
  { name: "rapport_financier",     cL: 5179, eL: 5322, hasBrace: true                    },
  { name: "note_interne",          cL: 5125, eL: 5152, hasBrace: false                   },
  { name: "lettre_officielle",     cL: 5083, eL: 5121, hasBrace: false                   },
  { name: "ordre_de_mission",      cL: 5050, eL: 5079, hasBrace: false                   },
  { name: "autorisation",          cL: 5003, eL: 5046, hasBrace: false                   },
  { name: "demande_administrative",cL: 4965, eL: 4999, hasBrace: false                   },
  { name: "mise_en_demeure",       cL: 4901, eL: 4961, hasBrace: false                   },
  { name: "circulaire",            cL: 4877, eL: 4898, hasBrace: false                   },
  { name: "certificat",            cL: 4764, eL: 4874, hasBrace: true                    },
  { name: "decision",              cL: 4710, eL: 4754, hasBrace: true                    },
  { name: "rapport",               cL: 4680, eL: 4702, hasBrace: true                    },
  { name: "contrat",               cL: 4654, eL: 4674, hasBrace: true                    },
  { name: "convocation",           cL: 4131, eL: 4243, hasBrace: false                   },
  { name: "pv",                    cL: 4102, eL: 4128, hasBrace: true                    },
  { name: "attestation",           cL: 4014, eL: 4029, hasBrace: true                    },
];

// ── Build stub for each case ────────────────────────────────────────────────────
function buildStub(c) {
  if (c.isDefault) {
    // default: just one line; switch closing "  }" at line 8148 stays
    return `      content = reconstructionPlaceholder(template, docNum, syndInfo);`;
  }
  if (c.hasBrace) {
    return [
      `      content = reconstructionPlaceholder("${c.name}", docNum, syndInfo);`,
      `      break;`,
      `    }`,
    ].join("\n");
  }
  // braceless
  return [
    `      content = reconstructionPlaceholder("${c.name}", docNum, syndInfo);`,
    `      break;`,
  ].join("\n");
}

// ── STEP 1: Strip visual content blocks bottom-to-top ──────────────────────────
console.log("Phase 1 — Stripping visual content blocks...\n");
for (const c of CASES) {
  const before = lines.length;
  replaceRange(c.cL, c.eL, buildStub(c));
  const removed = before - lines.length;
  console.log(`  ✓ ${c.name.padEnd(25)} lines ${c.cL}–${c.eL} → stub  (−${removed + (buildStub(c).split("\n").length)} +${buildStub(c).split("\n").length} = −${removed} net)`);
}

console.log(`\n  Lines after case stripping: ${lines.length}`);

// ── STEP 2: Find the visual helpers block boundaries (still at original positions) ─
// The visual helpers block (lines 634–2592 in original) is ABOVE all case ranges,
// so its indices are unchanged after step 1.
// We search dynamically in case there was any minor shift.
const helperStartIdx = lines.findIndex((l, i) => i >= 630 && i <= 642 && l.includes("Page Header Band"));
if (helperStartIdx === -1) throw new Error("Could not find '// ─── Page Header Band' marker");

// Find end: the closing "}" of legalFooterNote (originally around line 2592)
// Search within a window after helperStartIdx
let helperEndIdx = -1;
// legalFooterNote ends with a standalone "}" at ~line 2592. Find it by looking for
// the next "}" after the "function legalFooterNote" definition.
const legalFnIdx = lines.findIndex((l, i) => i >= helperStartIdx && l.includes("function legalFooterNote("));
if (legalFnIdx === -1) throw new Error("Could not find legalFooterNote");
// Scan forward from legalFnIdx for the closing "}"
for (let i = legalFnIdx + 1; i < legalFnIdx + 200; i++) {
  if (lines[i] !== undefined && lines[i].trim() === "}" && (lines[i + 1] === "" || lines[i + 1] === undefined)) {
    helperEndIdx = i;
    break;
  }
}
if (helperEndIdx === -1) throw new Error("Could not find end of legalFooterNote");

const helperStart1 = helperStartIdx + 1; // 1-indexed
const helperEnd1   = helperEndIdx + 1;   // 1-indexed
console.log(`\nPhase 1 — Removing visual helper functions block: lines ${helperStart1}–${helperEnd1} (${helperEnd1 - helperStart1 + 1} lines)`);

// ── STEP 3: Build Phase 2 engine scaffolding ───────────────────────────────────
const SCAFFOLD = `
// ═══════════════════════════════════════════════════════════════════════════════
// PDF ENGINE V2 — DESIGN FOUNDATION (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 CLEANUP COMPLETE
//
// All legacy visual components removed:
//   ✗ buildHeaderBand         ✗ buildOfficialSeal
//   ✗ buildSidebarInfoPanel   ✗ buildValidationStatusPanel
//   ✗ buildDigitalVerificationPanel ✗ buildTwoColumnLayout
//   ✗ buildDocumentOverviewGrid     ✗ buildFinancialFamilyHeader
//   ✗ buildCorporateDocHeader       ✗ buildLegalContractCover
//   ✗ buildFinancialBarChart        ✗ buildCertificateFrame
//   ✗ buildGovernanceBanner         ✗ buildLegalAlertBanner
//   ✗ buildMeetingBanner            ✗ metaTable
//   ✗ contentSection                ✗ kpiRow
//   ✗ progressBar                   ✗ financialDashboard
//   ✗ budgetLinesTable              ✗ multiSignatoryBlock
//   ✗ signatureBlock                ✗ legalFooterNote
//
// What remains (kept intact):
//   ✓ Data loaders (syndInfo, member, prop, signatures, qr, logo)
//   ✓ Business rules (tantièmes, validity dates, status logic)
//   ✓ DB mappings (Drizzle → Zod → enriched input)
//   ✓ Entity loaders (getLotMemberData, getMeetingData, etc.)
//   ✓ Signature workflow (inline SVG regeneration)
//   ✓ Verification workflow (QR code, signed URL)
//   ✓ GCS upload / local disk fallback
//   ✓ buildPdfBuffer / pdfmake integration
//
// Phase 3: Templates rebuilt one-by-one from reference images.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Reconstruction Placeholder ─────────────────────────────────────────────────
// Rendered for ALL templates until their Phase 3 reference image is provided.
// Design: minimal, professional — signals "under active reconstruction" clearly.
function reconstructionPlaceholder(
  templateName: string,
  docNum: string,
  syndInfo: SyndicateInfo,
): unknown[] {
  const label = templateName.toUpperCase().replace(/_/g, " ");
  return [
    // Top accent bar — navy
    { canvas: [{ type: "rect" as const, x: 0, y: 0, w: 515, h: 4, color: "#0b1e30" }] },
    // Institution name
    {
      text: syndInfo.name.toUpperCase(),
      fontSize: 7.5, bold: true, color: "#687078", characterSpacing: 0.1,
      margin: [0, 14, 0, 4] as [number, number, number, number],
    },
    // Hairline divider
    { canvas: [{ type: "line" as const, x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: "#d9d2c5" }] },
    // Template name (large)
    {
      text: label,
      fontSize: 20, bold: true, color: "#0b1e30", alignment: "center" as const,
      margin: [0, 90, 0, 0] as [number, number, number, number],
    },
    // Gold accent rule (centered)
    { canvas: [{ type: "rect" as const, x: 197, y: 0, w: 120, h: 1.5, color: "#b89a61" }], margin: [0, 10, 0, 18] as [number, number, number, number] },
    // Status lines
    { text: "Ce template est en cours de reconstruction.", fontSize: 10.5, color: "#687078", alignment: "center" as const },
    { text: "Phase 3 — En attente de l\u2019image de référence.", fontSize: 9, color: "#8f713d", alignment: "center" as const, italics: true, margin: [0, 8, 0, 0] as [number, number, number, number] },
    // Footer divider + ref
    { canvas: [{ type: "line" as const, x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: "#d9d2c5" }], margin: [0, 48, 0, 0] as [number, number, number, number] },
    {
      columns: [
        { text: "Réf. " + docNum, fontSize: 7, color: "#687078", width: "*" },
        { text: syndInfo.name + " — MIZAN", fontSize: 7, color: "#687078", alignment: "right" as const, width: "auto" },
      ],
      margin: [0, 6, 0, 0] as [number, number, number, number],
    },
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE REGISTRY V2 (Phase 2 Scaffolding)
// ──────────────────────────────────────────────────────────────────────────────
// Each engine is an empty stub with a typed interface.
// Phase 3 implementations replace the throw with real pdfmake content nodes,
// driven exclusively by reference images — no legacy design code reused.
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. HEADER ENGINE ──────────────────────────────────────────────────────────
interface HeaderEngineV2Params {
  syndInfo: SyndicateInfo;
  docTypeLabel: string;
  docNumber: string;
  accentColor: string;
  today: string;
  logoDataUrl: string | null;
  qrDataUrl: string;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineHeader(_p: HeaderEngineV2Params): unknown {
  throw new Error("engineHeader: Phase 3 pending — provide reference image");
}

// ── 2. FOOTER ENGINE ──────────────────────────────────────────────────────────
interface FooterEngineV2Params {
  docNumber: string;
  lang: DocumentLanguage;
  verifyUrl?: string;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineFooter(_p: FooterEngineV2Params): (page: number, pages: number) => unknown {
  throw new Error("engineFooter: Phase 3 pending — provide reference image");
}

// ── 3. SIGNATURE ENGINE ───────────────────────────────────────────────────────
interface SignatureEngineV2Params {
  signers: Array<{ label: string; name: string; role: string; hasSigned?: boolean }>;
  accentColor: string;
  lang: DocumentLanguage;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineSignature(_p: SignatureEngineV2Params): unknown {
  throw new Error("engineSignature: Phase 3 pending — provide reference image");
}

// ── 4. VERIFICATION ENGINE ────────────────────────────────────────────────────
interface VerificationEngineV2Params {
  docNumber: string;
  qrDataUrl: string | null;
  verifyUrl?: string;
  lang: DocumentLanguage;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineVerification(_p: VerificationEngineV2Params): unknown {
  throw new Error("engineVerification: Phase 3 pending — provide reference image");
}

// ── 5. TABLE ENGINE ───────────────────────────────────────────────────────────
interface TableEngineV2Params {
  columns: Array<{ label: string; width: string | number }>;
  rows: string[][];
  accentColor: string;
  striped?: boolean;
  borderColor?: string;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineTable(_p: TableEngineV2Params): unknown {
  throw new Error("engineTable: Phase 3 pending — provide reference image");
}

// ── 6. INFO CARD ENGINE ───────────────────────────────────────────────────────
interface InfoCardEngineV2Params {
  fields: Array<{ label: string; value: string; icon?: string }>;
  columns?: 1 | 2 | 3;
  accentColor: string;
  background?: string;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineInfoCard(_p: InfoCardEngineV2Params): unknown {
  throw new Error("engineInfoCard: Phase 3 pending — provide reference image");
}

// ── 7. KPI ENGINE ─────────────────────────────────────────────────────────────
interface KpiEngineV2Params {
  items: Array<{ label: string; value: string; unit?: string; trend?: "up" | "down" | "neutral" }>;
  accentColor: string;
  columns?: 2 | 3 | 4;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineKpi(_p: KpiEngineV2Params): unknown {
  throw new Error("engineKpi: Phase 3 pending — provide reference image");
}

// ── 8. CERTIFICATE ENGINE ─────────────────────────────────────────────────────
// Two-page premium certificate layout (Attestation de Propriété, Adhésion, etc.)
interface CertificateEngineV2Params {
  variant: "property" | "membership" | "payment" | "residence";
  holderName: string;
  holderAvatarB64: string | null;
  holderFields: Array<{ label: string; value: string }>;
  propertyFields: Array<{ icon: string; label: string; value: string }>;
  declarationTitle: string;
  declarationText: string;
  registryFields: Array<{ label: string; value: string }>;
  valuationFields: Array<{ label: string; value: string }>;
  legalCertText: string;
  signers: Array<{ label: string; name: string; role: string }>;
  verificationParams: VerificationEngineV2Params;
  colors: { navy: string; navy2: string; gold: string; goldDark: string; goldSoft: string; paper: string };
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineCertificate(_p: CertificateEngineV2Params): unknown[] {
  throw new Error("engineCertificate: Phase 3 pending — provide reference image");
}

// ── 9. GOVERNANCE ENGINE ──────────────────────────────────────────────────────
// PV, convocation, décision, rapport d'assemblée, compte-rendu.
interface GovernanceEngineV2Params {
  variant: "pv" | "convocation" | "decision" | "rapport" | "compte_rendu" | "rapport_activite";
  meetingMeta: Record<string, string>;
  agendaItems?: string[];
  votingResults?: Array<{ resolution: string; pour: number; contre: number; abstention: number; adopted: boolean }>;
  body?: string;
  accentColor: string;
  lang: DocumentLanguage;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineGovernance(_p: GovernanceEngineV2Params): unknown {
  throw new Error("engineGovernance: Phase 3 pending — provide reference image");
}

// ── 10. FINANCIAL ENGINE ──────────────────────────────────────────────────────
// Facture, reçu de paiement, appel de fonds, budget prévisionnel,
// décompte des charges, rapport financier, rapport d'audit.
interface FinancialEngineV2Params {
  variant: "invoice" | "receipt" | "call-for-funds" | "budget" | "statement" | "financial-report" | "audit";
  lineItems: Array<{ description: string; quantity?: number; unitPrice?: number; total: number; category?: string }>;
  totals: { subtotal?: number; tax?: number; discount?: number; total: number };
  currency?: string;
  period?: string;
  accentColor: string;
  lang: DocumentLanguage;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function engineFinancial(_p: FinancialEngineV2Params): unknown {
  throw new Error("engineFinancial: Phase 3 pending — provide reference image");
}
`.trim();

replaceRange(helperStart1, helperEnd1, SCAFFOLD);
console.log(`✓ Replaced visual helpers with Phase 2 engine scaffolding`);
console.log(`  Final line count: ${lines.length}`);

// ── STEP 4: Write output ───────────────────────────────────────────────────────
writeFileSync(FILE, lines.join("\n"), "utf8");
console.log(`\n✅ Phase 1 complete → ${FILE}`);
