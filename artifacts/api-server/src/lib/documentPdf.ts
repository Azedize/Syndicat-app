/**
 * documentPdf.ts — Generation 2 Enterprise Document Engine
 *
 * Architecture:
 *  • Single-source BRAND token system — zero raw hex outside the BRAND block
 *  • 10 document families × distinct visual identity (theme system)
 *  • Design System (DS) components: Header, Seal, Frames, InfoGrid, Section,
 *    Financial (KPI/Progress/Dashboard/BudgetTable), Signature, Footer
 *  • 32 templates rebuilt around their business domain
 *  • DejaVu Sans TrueType + Amiri Arabic fallback
 *  • Multi-tenant: accent color, logo, registration, contact per syndicate
 *  • QR verification code + watermark for draft/specimen status
 */
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import { objectStorageClient } from "./objectStorage.js";
import { logger } from "./logger.js";

// ─── Local-disk temp storage (fallback when GCS not configured) ───────────────
const LOCAL_DOCS_TMP = path.join(os.tmpdir(), "syndycat-docs");

/** Safely detect SVG content from SignaturePad — handles optional XML declaration prefix. */
function isSvgData(data: string | null | undefined): boolean {
  if (!data) return false;
  return /^\s*(?:<\?xml[^>]*>\s*)?<svg/i.test(data.trim());
}

async function saveToLocalDisk(buffer: Buffer, filename: string): Promise<string> {
  const objectId = randomUUID();
  const dir = path.join(LOCAL_DOCS_TMP, objectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/local-docs/${objectId}/${filename}`;
}

/** Read a file that was saved by saveToLocalDisk. */
export async function readLocalDocFile(uuid: string, filename: string): Promise<Buffer> {
  const filepath = path.join(LOCAL_DOCS_TMP, uuid, filename);
  return fs.readFile(filepath);
}

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

// ─── Brand Token System ────────────────────────────────────────────────────────
// Single source of truth derived from artifacts/mobile/constants/colors.ts
// ALL color references in the PDF engine must use these tokens.
// No raw hex strings are allowed outside this block.

const BRAND = {
  // ── Core palette (colors.ts light) ───────────────────────────────────────
  primary:        "#7c3aed",   // violet-700  — app primary
  primaryMid:     "#6d28d9",   // violet-800
  primaryDark:    "#5b21b6",   // violet-800 deep
  primaryDeep:    "#4c1d95",   // violet-900
  primaryDeeper:  "#3b0764",   // violet-950
  primaryLight:   "#ede9fe",   // violet-100 tint
  primaryLighter: "#f5f3ff",   // violet-50

  success:        "#10b981",   // emerald-500
  successDark:    "#059669",   // emerald-600
  successDeep:    "#047857",   // emerald-700
  successLight:   "#ecfdf5",   // emerald-50

  warning:        "#f59e0b",   // amber-500
  warningDark:    "#d97706",   // amber-600
  warningLight:   "#fffbeb",   // amber-50

  destructive:    "#ef4444",   // red-500
  destructiveDark:"#dc2626",   // red-600
  destructiveDeep:"#b91c1c",   // red-700
  destructiveLight:"#fef2f2",  // red-50

  info:           "#3b82f6",   // blue-500
  infoLight:      "#eff6ff",   // blue-50

  // ── Neutrals ─────────────────────────────────────────────────────────────
  ink:            "#1e1b4b",   // app foreground — deep violet-indigo
  inkMid:         "#374151",   // gray-700
  inkLight:       "#475569",   // slate-600
  muted:          "#6b7280",   // gray-500
  mutedLight:     "#9ca3af",   // gray-400
  border:         "#e5e7eb",   // gray-200
  borderLight:    "#f3f4f6",   // gray-100
  surface:        "#f8f7ff",   // app background (violet-tinted white)
  surfaceCard:    "#ffffff",   // card white
  surfaceAlt:     "#f9fafb",   // gray-50

  // ── Legacy helpers ────────────────────────────────────────────────────────
  // Used by document families that share colors with the system palette.
  legalRed:       "#b91c1c",   // red-700 — enforcement docs
  contractIndigo: "#1e1b4b",   // app foreground — contracts
  slateAdmin:     "#374151",   // gray-700 — admin docs
  bailDark:       "#2d2540",   // deep secondary — lease

  // ── Reference design family tokens (matched to 4 uploaded reference images) ──
  navyHeader:     "#0E2240",   // Image 1 Nexora: deep navy header band
  navyHeaderMid:  "#122B52",   // Image 1: reference panel (slightly lighter)
  corpBlue:       "#1A3A5F",   // Image 3: corporate purchase order header
  corpBlueDark:   "#0F2A48",   // Image 3: dark right reference panel
  legalDark:      "#111827",   // Image 4 Veritas: dark left cover panel
  legalGold:      "#C9A84C",   // Image 4: gold accent color
  certNavy:       "#1B3A7A",   // Image 2 SYNDICARE: deep navy for certificates
  certGold:       "#C4963A",   // Image 2: gold accent for certificate documents
  emeraldStripe:  "#059669",   // Image 1: green accent stripe (= successDark)
} as const;

// Family accent picker — all values from BRAND tokens.
// 8 distinct document families, each with its own visual identity.
const FAMILY: Record<string, { accent: string; deep: string; light: string; icon: string; label: string }> = {
  financial:     { accent: BRAND.successDeep,    deep: BRAND.successDark,   light: BRAND.successLight,   icon: "◈", label: "FINANCES" },
  legal:         { accent: BRAND.legalRed,        deep: BRAND.destructiveDeep, light: BRAND.destructiveLight, icon: "§", label: "JURIDIQUE" },
  administrative:{ accent: BRAND.slateAdmin,      deep: BRAND.ink,           light: BRAND.surfaceAlt,     icon: "→", label: "ADMINISTRATIF" },
  electoral:     { accent: BRAND.primary,         deep: BRAND.primaryDark,   light: BRAND.primaryLight,   icon: "★", label: "GOUVERNANCE" },
  meeting:       { accent: BRAND.primaryDark,     deep: BRAND.primaryDeep,   light: BRAND.primaryLighter, icon: "◆", label: "RÉUNION" },
  works:         { accent: BRAND.successDeep,     deep: BRAND.successDark,   light: BRAND.successLight,   icon: "⚙", label: "TRAVAUX" },
  incident:      { accent: BRAND.legalRed,        deep: BRAND.destructiveDeep, light: BRAND.destructiveLight, icon: "⚡", label: "SINISTRE" },
  certification: { accent: BRAND.successDark,     deep: BRAND.successDeep,   light: BRAND.successLight,   icon: "✓", label: "CERTIFICATION" },
  contract:      { accent: BRAND.contractIndigo,  deep: BRAND.primaryDeeper, light: BRAND.primaryLight,   icon: "⚖", label: "CONTRAT" },
  regulatory:    { accent: BRAND.primaryDeep,     deep: BRAND.primaryDeeper, light: BRAND.primaryLighter, icon: "§", label: "RÉGLEMENTATION" },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

// ─── Document Category Theme System ───────────────────────────────────────────
// 8 distinct visual identities mapped by document template category.
// Each has a unique primary color, darker secondary for sub-bands, light tint
// for card backgrounds, a unicode category icon, and a category badge label.

interface DocumentTheme {
  primary: string;
  secondary: string;
  light: string;
  icon: string;
  categoryLabel: string;
}

function getDocumentTheme(template: string, fallbackColor?: string): DocumentTheme {
  // All colors sourced from BRAND tokens — zero hardcoded hex outside that block.
  const themes: Record<string, DocumentTheme> = {
    // ── Contracts & Legal — Image 4 dark cover / gold accents ─────────────────
    contrat:               { primary: BRAND.legalGold,     secondary: BRAND.legalDark,     light: BRAND.primaryLighter,  icon: "⚖", categoryLabel: "CONTRAT" },
    convention_partenariat:{ primary: BRAND.legalGold,     secondary: BRAND.legalDark,     light: BRAND.primaryLighter,  icon: "⚖", categoryLabel: "CONVENTION DE PARTENARIAT" },
    accord_collectif:      { primary: BRAND.legalGold,     secondary: BRAND.legalDark,     light: BRAND.primaryLighter,  icon: "⚖", categoryLabel: "ACCORD COLLECTIF" },

    // ── Financial Family — brand success (emerald) ───────────────────────────────
    rapport_financier:     { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "◈", categoryLabel: "RAPPORT FINANCIER" },
    rapport_audit:         { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "◈", categoryLabel: "RAPPORT D'AUDIT" },
    rapport_activite:      { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "◈", categoryLabel: "RAPPORT D'ACTIVITÉ" },
    rapport:               { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "◈", categoryLabel: "RAPPORT" },
    appel_de_fonds:        { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "◈", categoryLabel: "APPEL DE FONDS" },
    facture:               { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "◈", categoryLabel: "FACTURE" },
    budget_previsionnel:   { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "◈", categoryLabel: "BUDGET PRÉVISIONNEL" },
    decompte_charges:      { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "◈", categoryLabel: "DÉCOMPTE DES CHARGES" },

    // ── Meeting Family — brand primary dark (violet-800) ─────────────────────────
    pv:                    { primary: BRAND.primaryDark,  secondary: BRAND.primaryDeep,  light: BRAND.primaryLighter, icon: "◆", categoryLabel: "PROCÈS-VERBAL" },
    compte_rendu:          { primary: BRAND.primaryDark,  secondary: BRAND.primaryDeep,  light: BRAND.primaryLighter, icon: "◆", categoryLabel: "COMPTE-RENDU" },
    convocation:           { primary: BRAND.primaryDark,  secondary: BRAND.primaryDeep,  light: BRAND.primaryLighter, icon: "◆", categoryLabel: "CONVOCATION" },
    circulaire:            { primary: BRAND.primaryDark,  secondary: BRAND.primaryDeep,  light: BRAND.primaryLighter, icon: "◆", categoryLabel: "CIRCULAIRE" },
    note_interne:          { primary: BRAND.primaryDark,  secondary: BRAND.primaryDeep,  light: BRAND.primaryLighter, icon: "◆", categoryLabel: "NOTE INTERNE" },

    // ── Electoral & Governance — brand primary (violet-700) ─────────────────────
    decision:              { primary: BRAND.primary,      secondary: BRAND.primaryMid,   light: BRAND.primaryLight,   icon: "★", categoryLabel: "DÉCISION OFFICIELLE" },
    rapport_election:      { primary: BRAND.primary,      secondary: BRAND.primaryMid,   light: BRAND.primaryLight,   icon: "★", categoryLabel: "RAPPORT D'ÉLECTION" },

    // ── Regulatory & Statutory — Image 4 legal dark / gold ───────────────────────
    reglement:             { primary: BRAND.legalGold,    secondary: BRAND.legalDark,     light: BRAND.primaryLighter, icon: "§", categoryLabel: "RÈGLEMENT DE COPROPRIÉTÉ" },

    // ── Certification Family — Image 2 navy / gold (SYNDICARE reference) ─────────
    attestation:           { primary: BRAND.certNavy,    secondary: BRAND.certGold,      light: BRAND.primaryLighter, icon: "✓", categoryLabel: "ATTESTATION" },
    attestation_residence: { primary: BRAND.certNavy,    secondary: BRAND.certGold,      light: BRAND.primaryLighter, icon: "✓", categoryLabel: "ATTESTATION DE RÉSIDENCE" },
    attestation_propriete: { primary: BRAND.certNavy,    secondary: BRAND.certGold,      light: BRAND.primaryLighter, icon: "✓", categoryLabel: "ATTESTATION DE PROPRIÉTÉ" },
    attestation_paiement:  { primary: BRAND.certNavy,    secondary: BRAND.certGold,      light: BRAND.primaryLighter, icon: "✓", categoryLabel: "ATTESTATION DE PAIEMENT" },
    recu_paiement:         { primary: BRAND.certNavy,    secondary: BRAND.certGold,      light: BRAND.primaryLighter, icon: "✓", categoryLabel: "REÇU DE PAIEMENT" },
    certificat:            { primary: BRAND.certNavy,    secondary: BRAND.certGold,      light: BRAND.primaryLighter, icon: "✓", categoryLabel: "CERTIFICAT OFFICIEL" },

    // ── Legal Enforcement — brand destructive (red-700) ──────────────────────────
    mise_en_demeure:       { primary: BRAND.legalRed,     secondary: BRAND.destructiveDeep, light: BRAND.destructiveLight, icon: "!", categoryLabel: "MISE EN DEMEURE" },
    lettre_officielle:     { primary: BRAND.legalRed,     secondary: BRAND.destructiveDeep, light: BRAND.destructiveLight, icon: "!", categoryLabel: "LETTRE OFFICIELLE" },

    // ── Administrative Family — slate-700 (neutral authority) ────────────────────
    demande_administrative:{ primary: BRAND.slateAdmin,   secondary: BRAND.ink,          light: BRAND.surfaceAlt,    icon: "→", categoryLabel: "DEMANDE ADMINISTRATIVE" },
    autorisation:          { primary: BRAND.slateAdmin,   secondary: BRAND.ink,          light: BRAND.surfaceAlt,    icon: "→", categoryLabel: "AUTORISATION" },
    ordre_de_mission:      { primary: BRAND.slateAdmin,   secondary: BRAND.ink,          light: BRAND.surfaceAlt,    icon: "→", categoryLabel: "ORDRE DE MISSION" },

    // ── Operational — specialized tones ──────────────────────────────────────────
    contrat_bail:          { primary: BRAND.legalGold,    secondary: BRAND.legalDark,    light: BRAND.primaryLighter, icon: "⌂", categoryLabel: "CONTRAT DE BAIL" },
    sinistre:              { primary: BRAND.legalRed,     secondary: BRAND.destructiveDeep, light: BRAND.destructiveLight, icon: "⚡", categoryLabel: "DÉCLARATION DE SINISTRE" },
    travaux:               { primary: BRAND.successDeep,  secondary: BRAND.successDark,  light: BRAND.successLight,  icon: "⚙", categoryLabel: "ORDRE DE TRAVAUX" },
  };

  const found = themes[template];
  if (found) return found;
  const primary = fallbackColor || BRAND.primary;
  return {
    primary,
    secondary: adjustColorBrightness(primary, -20),
    light: BRAND.primaryLight,
    icon: "■",
    categoryLabel: "DOCUMENT OFFICIEL",
  };
}

// ─── Typography & Style System ────────────────────────────────────────────────

function buildStyles(accentColor: string) {
  // ── Generation 3 Enterprise Typography System ─────────────────────────────────
  // Designed around a 5-level hierarchy with maximum contrast between levels.
  // Every jump between levels is meaningful: 5.5pt label → 11pt value is a 2× gap.
  // Inspired by Adobe Sign, Oracle ERP, and SAP Fiori design systems.
  return {
    // ── Header — clean, minimal, no competition with document title ───────────
    headerOrgName:    { font: PRIMARY_FONT, fontSize: 10,   bold: true,  color: BRAND.ink, characterSpacing: 0.2 },
    headerBuilding:   { font: PRIMARY_FONT, fontSize: 6.5,  bold: false, color: BRAND.muted },
    headerMeta:       { font: PRIMARY_FONT, fontSize: 6.5,  color: BRAND.muted },
    headerContact:    { font: PRIMARY_FONT, fontSize: 6,    color: BRAND.mutedLight },
    headerDocNum:     { font: PRIMARY_FONT, fontSize: 8.5,  bold: true,  color: BRAND.ink },
    headerDocDate:    { font: PRIMARY_FONT, fontSize: 6,    color: BRAND.muted },
    docTypeLabel:     { font: PRIMARY_FONT, fontSize: 5.5,  bold: true,  color: accentColor, characterSpacing: 0.8 },
    docCategoryBadge: { font: PRIMARY_FONT, fontSize: 5.5,  bold: true,  color: BRAND.muted, characterSpacing: 0.5 },

    // ── Document titles — 5-level hierarchy, strong visual jumps ────────────────
    // L1: displayTitle (28pt) — hero credential title, white on dark
    // L2: docTitle (22pt)     — primary document title, max ink
    // L3: sectionTitle (8.5pt)— section labels, tracked caps
    // L4: metaKey (5.5pt)     — data labels, pure label
    // L5: body (10pt)         — content text
    displayTitle:     { font: PRIMARY_FONT, fontSize: 28,   bold: true,  color: BRAND.surfaceCard },
    docTitle:         { font: PRIMARY_FONT, fontSize: 22,   bold: true,  color: BRAND.ink,  characterSpacing: 0.3 },
    docSubtitle:      { font: PRIMARY_FONT, fontSize: 9.5,  color: BRAND.muted, italics: true },
    docRef:           { font: PRIMARY_FONT, fontSize: 7.5,  color: BRAND.muted },
    subsectionTitle:  { font: PRIMARY_FONT, fontSize: 9.5,  bold: true,  color: BRAND.ink },

    // ── Section headings — tracked caps, accent-derived color ─────────────────
    sectionTitle:     { font: PRIMARY_FONT, fontSize: 8.5,  bold: true,  color: BRAND.ink, characterSpacing: 0.8 },

    // ── Metadata grid — maximum label/value contrast ──────────────────────────
    // Label: 5.5pt tracked all-caps → visually recedes, purely functional
    // Value: 12pt bold            → stands out as a data point at a glance
    metaKey:          { font: PRIMARY_FONT, fontSize: 5.5,  color: BRAND.muted, bold: true, characterSpacing: 0.7 },
    metaVal:          { font: PRIMARY_FONT, fontSize: 12,   bold: true,  color: BRAND.ink },

    // ── Body text — comfortable reading at 10pt ────────────────────────────────
    body:             { font: PRIMARY_FONT, fontSize: 10,   color: BRAND.inkMid, lineHeight: 1.75 },
    bodyArabic:       { font: ARABIC_FONT,  fontSize: 12,   color: BRAND.inkMid, lineHeight: 1.9, alignment: "right" as const },

    // ── Signature area ──────────────────────────────────────────────────────────
    signLabel:        { font: PRIMARY_FONT, fontSize: 7.5,  color: BRAND.muted,  italics: true },
    signName:         { font: PRIMARY_FONT, fontSize: 11,   bold: true,  color: BRAND.ink },
    stampText:        { font: PRIMARY_FONT, fontSize: 5,    bold: true,  color: BRAND.surfaceCard },

    // ── Status / notice ─────────────────────────────────────────────────────────
    notice:           { font: PRIMARY_FONT, fontSize: 8.5,  color: BRAND.mutedLight, italics: true },

    // ── Data tables ─────────────────────────────────────────────────────────────
    tableHeader:      { font: PRIMARY_FONT, fontSize: 8.5,  bold: true,  color: BRAND.surfaceCard },
    tableCell:        { font: PRIMARY_FONT, fontSize: 9.5,  color: BRAND.inkMid },
    financialTotal:   { font: PRIMARY_FONT, fontSize: 11,   bold: true,  color: BRAND.ink },

    // ── Footer ─────────────────────────────────────────────────────────────────
    footer:           { font: PRIMARY_FONT, fontSize: 6.5,  color: BRAND.mutedLight },
    footerBrand:      { font: PRIMARY_FONT, fontSize: 6.5,  color: accentColor, bold: true },

    // ── Watermark ───────────────────────────────────────────────────────────────
    watermark:        { font: PRIMARY_FONT, fontSize: 80,   bold: true,  color: BRAND.border, opacity: 0.04 },
    pageNumber:       { font: PRIMARY_FONT, fontSize: 9.5,  bold: true,  color: BRAND.ink },

    // ── Legal / security ────────────────────────────────────────────────────────
    legalNote:        { font: PRIMARY_FONT, fontSize: 6.5,  color: BRAND.muted, lineHeight: 1.5 },
    securityBadge:    { font: PRIMARY_FONT, fontSize: 6,    bold: true,  color: BRAND.ink },
    certTitle:        { font: PRIMARY_FONT, fontSize: 26,   bold: true,  color: BRAND.surfaceCard },
  };
}

// ─── i18n (FR / AR / EN / ES) ──────────────────────────────────────────────────
// Multilingual support covers the shared document chrome (header, meta labels,
// signature block, footer/legal note) plus the flagship "reglement" template's
// section content. Other templates' body content remains French-only for now —
// a known, disclosed gap, not a silent omission.

export type DocumentLanguage = "fr" | "ar" | "en" | "es";

const I18N: Record<string, Record<DocumentLanguage, string>> = {
  docTypeLabel_reglement: {
    fr: "RÈGLEMENT DE COPROPRIÉTÉ",
    ar: "نظام الملكية المشتركة",
    en: "CONDOMINIUM BYLAWS",
    es: "REGLAMENTO DE COPROPIEDAD",
  },
  docTypeLabel_default: { fr: "DOCUMENT OFFICIEL", ar: "وثيقة رسمية", en: "OFFICIAL DOCUMENT", es: "DOCUMENTO OFICIAL" },
  metaResidence: { fr: "Résidence :", ar: ":العقار", en: "Residence:", es: "Residencia:" },
  metaAddress: { fr: "Adresse :", ar: ":العنوان", en: "Address:", es: "Dirección:" },
  metaLandRegistry: { fr: "Référence foncière :", ar: ":المرجع العقاري", en: "Land registry ref.:", es: "Referencia catastral:" },
  metaBuildings: { fr: "Nombre de bâtiments :", ar: ":عدد المباني", en: "Number of buildings:", es: "Número de edificios:" },
  metaFloors: { fr: "Nombre d'étages :", ar: ":عدد الطوابق", en: "Number of floors:", es: "Número de plantas:" },
  metaLots: { fr: "Nombre de lots :", ar: ":عدد الوحدات", en: "Number of units:", es: "Número de unidades:" },
  metaSurface: { fr: "Surface totale :", ar: ":المساحة الإجمالية", en: "Total surface:", es: "Superficie total:" },
  metaPresident: { fr: "Président du syndicat :", ar: ":رئيس النقابة", en: "Syndicate president:", es: "Presidente del sindicato:" },
  metaDate: { fr: "Date de génération :", ar: ":تاريخ الإنشاء", en: "Generated on:", es: "Fecha de generación:" },
  metaDocNumber: { fr: "N° de document :", ar: ":رقم الوثيقة", en: "Document no.:", es: "N.º de documento:" },
  sectionObjet: { fr: "Objet du règlement", ar: "موضوع النظام", en: "Purpose of the bylaws", es: "Objeto del reglamento" },
  sectionDescription: { fr: "Description de l'immeuble", ar: "وصف العقار", en: "Building description", es: "Descripción del inmueble" },
  sectionCharges: { fr: "Répartition des charges", ar: "توزيع التكاليف", en: "Charge allocation", es: "Distribución de gastos" },
  sectionAdministration: { fr: "Administration du syndicat", ar: "إدارة النقابة", en: "Syndicate administration", es: "Administración del sindicato" },
  sectionContent: { fr: "Contenu", ar: "المحتوى", en: "Content", es: "Contenido" },
  signAndStamp: { fr: "Signature et cachet :", ar: ":التوقيع والختم", en: "Signature and stamp:", es: "Firma y sello:" },
  officialStamp: { fr: "CACHET OFFICIEL", ar: "ختم رسمي", en: "OFFICIAL STAMP", es: "SELLO OFICIAL" },
  presidentTitle: { fr: "Le Président du Syndicat", ar: "رئيس النقابة", en: "The Syndicate President", es: "El Presidente del Sindicato" },
  legalFooterNote: {
    fr: "Ce document officiel porte la référence {ref}. Toute modification non autorisée est passible de poursuites. Vérification : syndycat.ma/verify/{ref}",
    ar: "تحمل هذه الوثيقة الرسمية المرجع {ref}. كل تعديل غير مصرح به يعرض صاحبه للمتابعة القانونية. التحقق: syndycat.ma/verify/{ref}",
    en: "This official document bears reference {ref}. Any unauthorized alteration may lead to legal action. Verify at: syndycat.ma/verify/{ref}",
    es: "Este documento oficial lleva la referencia {ref}. Toda modificación no autorizada puede dar lugar a acciones legales. Verificación: syndycat.ma/verify/{ref}",
  },
  notRenseigne: { fr: "non renseignée", ar: "غير محدد", en: "not provided", es: "no especificada" },
  reglementObjetText: {
    fr: `Le présent règlement de copropriété fixe les règles de jouissance, d'usage et d'administration des parties privatives et communes de la résidence "{name}", conformément à la loi 18-00 relative au statut de la copropriété des immeubles bâtis.`,
    ar: `يحدد هذا النظام قواعد التمتع والاستخدام والإدارة للأجزاء الخاصة والمشتركة لعقار "{name}"، وفقًا للقانون 18.00 المتعلق بنظام الملكية المشتركة للعقارات المبنية.`,
    en: `These bylaws establish the rules of use, enjoyment, and administration of the private and common areas of the "{name}" residence, in accordance with Law 18-00 on condominium ownership of built properties.`,
    es: `El presente reglamento de copropiedad establece las reglas de uso, goce y administración de las partes privativas y comunes de la residencia "{name}", conforme a la Ley 18-00 relativa al estatuto de la copropiedad de inmuebles construidos.`,
  },
  reglementDescriptionText: {
    fr: `La résidence "{name}" comprend {buildings} bâtiment(s), {floors} étage(s) et {lots} lot(s), pour une surface totale de {surface}. Référence foncière : {landRef}.`,
    ar: `يتكون عقار "{name}" من {buildings} مبنى/مباني، {floors} طابق/طوابق و {lots} وحدة/وحدات، بمساحة إجمالية تبلغ {surface}. المرجع العقاري: {landRef}.`,
    en: `The "{name}" residence comprises {buildings} building(s), {floors} floor(s) and {lots} unit(s), for a total surface of {surface}. Land registry ref.: {landRef}.`,
    es: `La residencia "{name}" comprende {buildings} edificio(s), {floors} planta(s) y {lots} unidad(es), con una superficie total de {surface}. Referencia catastral: {landRef}.`,
  },
  reglementChargesText: {
    fr: "La répartition des charges communes est établie proportionnellement aux tantièmes de copropriété attribués à chaque lot, conformément au tableau de répartition annexé au présent règlement.",
    ar: "يتم توزيع التكاليف المشتركة بشكل يتناسب مع الحصص التناسبية المخصصة لكل وحدة، وفقًا لجدول التوزيع المرفق بهذا النظام.",
    en: "Common charges are allocated proportionally to the co-ownership shares assigned to each unit, in accordance with the allocation table appended to these bylaws.",
    es: "El reparto de los gastos comunes se establece proporcionalmente a las cuotas de copropiedad atribuidas a cada unidad, conforme a la tabla de reparto anexa al presente reglamento.",
  },
  reglementAdminText: {
    fr: "Le syndicat de la résidence est administré par {president}{managerPart}.",
    ar: "تدار نقابة العقار من طرف {president}{managerPart}.",
    en: "The residence's syndicate is administered by {president}{managerPart}.",
    es: "El sindicato de la residencia está administrado por {president}{managerPart}.",
  },
  reglementAdminManagerPart: {
    fr: " et géré par {manager}",
    ar: " وتديره {manager}",
    en: " and managed by {manager}",
    es: " y gestionado por {manager}",
  },
  reglementPresidentFallback: { fr: "le Président du conseil syndical", ar: "رئيس مجلس النقابة", en: "the syndical board president", es: "el Presidente del consejo sindical" },
  reglementPresidentSignPrefix: { fr: "Le Président — {name}", ar: "الرئيس — {name}", en: "The President — {name}", es: "El Presidente — {name}" },

  // ── Shared meta labels reused across every template's meta table ──────────
  metaDeliveredTo: { fr: "Délivré à :", ar: ":سُلمت إلى", en: "Delivered to:", es: "Entregado a:" },
  metaIssueDate: { fr: "Date d'émission :", ar: ":تاريخ الإصدار", en: "Issue date:", es: "Fecha de emisión:" },
  metaIssuer: { fr: "Organisme émetteur :", ar: ":الجهة المصدرة", en: "Issuing body:", es: "Organismo emisor:" },
  metaRegRef: { fr: "N° d'enregistrement :", ar: ":رقم التسجيل", en: "Registration no.:", es: "N.º de registro:" },
  metaMeetingDate: { fr: "Date de réunion :", ar: ":تاريخ الاجتماع", en: "Meeting date:", es: "Fecha de la reunión:" },
  metaSyndicate: { fr: "Syndicat :", ar: ":النقابة", en: "Syndicate:", es: "Sindicato:" },
  metaLocation: { fr: "Lieu :", ar: ":المكان", en: "Location:", es: "Lugar:" },
  metaSeatOfSyndicate: { fr: "Siège du syndicat", ar: "مقر النقابة", en: "Syndicate headquarters", es: "Sede del sindicato" },
  metaChairperson: { fr: "Président de séance :", ar: ":رئيس الجلسة", en: "Meeting chair:", es: "Presidente de la sesión:" },
  metaSecretarySession: { fr: "Secrétaire de séance :", ar: ":كاتب الجلسة", en: "Meeting secretary:", es: "Secretario de la sesión:" },
  metaRecipient: { fr: "Destinataire :", ar: ":المرسل إليه", en: "Recipient:", es: "Destinatario:" },
  metaSender: { fr: "Expéditeur :", ar: ":المرسل", en: "Sender:", es: "Remitente:" },
  metaSendDate: { fr: "Date d'envoi :", ar: ":تاريخ الإرسال", en: "Send date:", es: "Fecha de envío:" },
  metaObjet: { fr: "Objet :", ar: ":الموضوع", en: "Subject:", es: "Asunto:" },
  metaTime: { fr: "Heure :", ar: ":الوقت", en: "Time:", es: "Hora:" },
  metaContractRef: { fr: "Référence du contrat :", ar: ":مرجع العقد", en: "Contract ref.:", es: "Referencia del contrato:" },
  metaParty1: { fr: "Partie 1 :", ar: ":الطرف الأول", en: "Party 1:", es: "Parte 1:" },
  metaParty2: { fr: "Partie 2 :", ar: ":الطرف الثاني", en: "Party 2:", es: "Parte 2:" },
  metaPeriod: { fr: "Période couverte :", ar: ":الفترة المشمولة", en: "Period covered:", es: "Período cubierto:" },
  metaAuthor: { fr: "Auteur :", ar: ":المُعِدّ", en: "Author:", es: "Autor:" },
  metaDraftDate: { fr: "Date de rédaction :", ar: ":تاريخ التحرير", en: "Drafting date:", es: "Fecha de redacción:" },
  metaReference: { fr: "Référence :", ar: ":المرجع", en: "Reference:", es: "Referencia:" },
  metaDecisionDate: { fr: "Date de la décision :", ar: ":تاريخ القرار", en: "Decision date:", es: "Fecha de la decisión:" },
  metaDecisionBody: { fr: "Organe décisionnel :", ar: ":الجهة المقررة", en: "Decision-making body:", es: "Órgano decisorio:" },
  metaTo: { fr: "À :", ar: ":إلى", en: "To:", es: "Para:" },
  metaFrom: { fr: "De :", ar: ":من", en: "From:", es: "De:" },
  metaDateLabel: { fr: "Date :", ar: ":التاريخ", en: "Date:", es: "Fecha:" },
  metaPriority: { fr: "Priorité :", ar: ":الأولوية", en: "Priority:", es: "Prioridad:" },
  metaSendMode: { fr: "Mode d'envoi :", ar: ":طريقة الإرسال", en: "Delivery method:", es: "Modo de envío:" },
  allMembers: { fr: "Tous les membres du syndicat", ar: "جميع أعضاء النقابة", en: "All syndicate members", es: "Todos los miembros del sindicato" },
  syndicateOffice: { fr: "Bureau Syndical", ar: "المكتب النقابي", en: "Syndicate Board", es: "Junta Sindical" },
  registeredMailNotice: { fr: "Recommandé avec accusé de réception", ar: "بريد مضمون مع إشعار بالاستلام", en: "Registered mail with acknowledgment of receipt", es: "Correo certificado con acuse de recibo" },
  normalPriority: { fr: "Normale", ar: "عادية", en: "Normal", es: "Normal" },
  awaitingSignature: { fr: "En attente de signature", ar: "في انتظار التوقيع", en: "Awaiting signature", es: "Pendiente de firma" },
  signedByLabel: { fr: "Signé par :", ar: ":وقّع عليه", en: "Signed by:", es: "Firmado por:" },
  signedOnLabel: { fr: "Le :", ar: ":بتاريخ", en: "On:", es: "El:" },
  signatureValidLabel: { fr: "✓ Signature valide et vérifiée", ar: "✓ توقيع صالح وموثّق", en: "✓ Valid, verified signature", es: "✓ Firma válida y verificada" },
  signatureInvalidLabel: { fr: "✗ Signature invalidée (document rejeté ou remplacé)", ar: "✗ توقيع ملغى (تم رفض الوثيقة أو استبدالها)", en: "✗ Invalidated signature (document rejected or replaced)", es: "✗ Firma invalidada (documento rechazado o reemplazado)" },
  electronicSignaturesTitle: { fr: "Signatures électroniques", ar: "التوقيعات الإلكترونية", en: "Electronic signatures", es: "Firmas electrónicas" },
  noHandwrittenTrace: { fr: "(signature électronique enregistrée sans tracé manuscrit)", ar: "(توقيع إلكتروني مسجل دون خط يدوي)", en: "(electronic signature recorded without a handwritten trace)", es: "(firma electrónica registrada sin trazo manuscrito)" },
  roleSuperAdmin: { fr: "Super Administrateur", ar: "المسؤول العام", en: "Super Admin", es: "Superadministrador" },
  roleSyndicateAdmin: { fr: "Administrateur du Syndicat", ar: "مسؤول النقابة", en: "Syndicate Admin", es: "Administrador del Sindicato" },
  rolePresident: { fr: "Président", ar: "الرئيس", en: "President", es: "Presidente" },
  roleVicePresident: { fr: "Vice-Président", ar: "نائب الرئيس", en: "Vice President", es: "Vicepresidente" },
  roleTreasurer: { fr: "Trésorier", ar: "أمين المال", en: "Treasurer", es: "Tesorero" },
  roleSecretary: { fr: "Secrétaire", ar: "كاتب الضبط", en: "Secretary", es: "Secretario" },
  roleCommitteeMember: { fr: "Membre du Conseil Syndical", ar: "عضو المجلس النقابي", en: "Committee Member", es: "Miembro del Consejo Sindical" },
  roleBuildingRep: { fr: "Représentant d'immeuble", ar: "ممثل العمارة", en: "Building Representative", es: "Representante del edificio" },
  roleMember: { fr: "Membre", ar: "عضو", en: "Member", es: "Miembro" },
  roleTenant: { fr: "Locataire", ar: "مستأجر", en: "Tenant", es: "Inquilino" },

  // ── Attestation ─────────────────────────────────────────────────────────
  attestationSectionTitle: { fr: "Attestation", ar: "شهادة", en: "Attestation", es: "Certificación" },
  attestationBody: {
    fr: "Le syndicat {syndicate} atteste par la présente que {member} est membre en règle de notre organisation à la date du {date}. Cette attestation est délivrée à l'intéressé(e) pour faire valoir ce que de droit.",
    ar: "تشهد النقابة {syndicate} بموجب هذه الوثيقة أن {member} عضو في وضعية قانونية سليمة في منظمتنا بتاريخ {date}. تُسلَّم هذه الشهادة للمعني بالأمر لإثبات ما يلزم إثباته.",
    en: "The syndicate {syndicate} hereby attests that {member} is a member in good standing of our organization as of {date}. This attestation is issued to the party concerned for whatever purpose it may serve.",
    es: "El sindicato {syndicate} certifica por la presente que {member} es miembro en regla de nuestra organización a fecha de {date}. Esta certificación se entrega al interesado para los fines que estime oportunos.",
  },
  attestationMemberFallback: { fr: "[NOM DU MEMBRE]", ar: "[اسم العضو]", en: "[MEMBER NAME]", es: "[NOMBRE DEL MIEMBRO]" },

  // ── Procès-verbal ────────────────────────────────────────────────────────
  pvAgendaTitle: { fr: "Ordre du jour", ar: "جدول الأعمال", en: "Agenda", es: "Orden del día" },
  pvAgendaText: { fr: "Points inscrits à l'ordre du jour de la réunion.", ar: "النقاط المدرجة في جدول أعمال الاجتماع.", en: "Items listed on the meeting agenda.", es: "Puntos incluidos en el orden del día de la reunión." },
  pvDeliberationsTitle: { fr: "Délibérations", ar: "المداولات", en: "Deliberations", es: "Deliberaciones" },
  pvDeliberationsText: {
    fr: "Les membres présents ont délibéré sur les points inscrits à l'ordre du jour. Les décisions adoptées font l'objet d'un enregistrement dans le registre officiel du syndicat.",
    ar: "تداول الأعضاء الحاضرون في النقاط المدرجة في جدول الأعمال. تُسجَّل القرارات المعتمدة في السجل الرسمي للنقابة.",
    en: "The members present deliberated on the items listed on the agenda. Decisions adopted are recorded in the syndicate's official register.",
    es: "Los miembros presentes deliberaron sobre los puntos del orden del día. Las decisiones adoptadas se registran en el registro oficial del sindicato.",
  },
  pvResolutionsTitle: { fr: "Résolutions", ar: "القرارات", en: "Resolutions", es: "Resoluciones" },
  pvResolutionsText: { fr: "Les résolutions adoptées ont été consignées.", ar: "تم تدوين القرارات المعتمدة.", en: "The resolutions adopted have been recorded.", es: "Las resoluciones adoptadas quedaron registradas." },

  // ── Convocation ──────────────────────────────────────────────────────────
  convocationRecipientFallback: { fr: "[DESTINATAIRE]", ar: "[المرسل إليه]", en: "[RECIPIENT]", es: "[DESTINATARIO]" },
  convocationObjetTitle: { fr: "Objet de la convocation", ar: "موضوع الاستدعاء", en: "Purpose of the summons", es: "Objeto de la convocatoria" },
  convocationBody: {
    fr: "Vous êtes convoqué(e) à assister à la réunion organisée par {syndicate}.",
    ar: "أنتم مدعوون لحضور الاجتماع الذي تنظمه {syndicate}.",
    en: "You are summoned to attend the meeting organized by {syndicate}.",
    es: "Se le convoca a asistir a la reunión organizada por {syndicate}.",
  },
  convocationNotice: {
    fr: "Votre présence est obligatoire. En cas d'impossibilité, veuillez en informer le secrétariat avant la date de la réunion.",
    ar: "حضوركم إلزامي. في حال تعذّر ذلك، يرجى إخبار الكتابة قبل تاريخ الاجتماع.",
    en: "Your attendance is mandatory. If you are unable to attend, please inform the secretariat before the meeting date.",
    es: "Su asistencia es obligatoria. En caso de no poder asistir, informe a la secretaría antes de la fecha de la reunión.",
  },

  // ── Certificat ───────────────────────────────────────────────────────────
  certificateWord: { fr: "CERTIFICAT", ar: "شهادة", en: "CERTIFICATE", es: "CERTIFICADO" },
  certificatDeliveryDate: { fr: "Date de délivrance :", ar: ":تاريخ الإصدار", en: "Issue date:", es: "Fecha de expedición:" },
  certificatSectionTitle: { fr: "Certifie et atteste", ar: "يشهد ويؤكد", en: "Certifies and attests", es: "Certifica y atestigua" },
  certificatBody: {
    fr: "Le syndicat {syndicate} certifie par la présente que {member} satisfait à l'ensemble des conditions requises pour l'obtention du présent certificat.",
    ar: "تشهد النقابة {syndicate} بموجب هذه الوثيقة أن {member} يستوفي جميع الشروط المطلوبة للحصول على هذه الشهادة.",
    en: "The syndicate {syndicate} hereby certifies that {member} satisfies all the conditions required for the issuance of this certificate.",
    es: "El sindicato {syndicate} certifica por la presente que {member} cumple todas las condiciones requeridas para la obtención de este certificado.",
  },
  certificatBeneficiaryFallback: { fr: "[BÉNÉFICIAIRE]", ar: "[المستفيد]", en: "[BENEFICIARY]", es: "[BENEFICIARIO]" },

  // ── Mise en demeure ──────────────────────────────────────────────────────
  miseEnDemeureObjetTitle: { fr: "Objet de la mise en demeure", ar: "موضوع الإعذار", en: "Purpose of the formal notice", es: "Objeto del requerimiento" },
  miseEnDemeureBody: {
    fr: "Par la présente lettre recommandée, {syndicate} met formellement en demeure {recipient} de s'acquitter de ses obligations dans le délai imparti ci-dessous.",
    ar: "بموجب هذه الرسالة المضمونة، تُعذر {syndicate} رسمياً {recipient} للوفاء بالتزاماته في غضون المدة المحددة أدناه.",
    en: "By this registered letter, {syndicate} formally gives notice to {recipient} to fulfill its obligations within the deadline set out below.",
    es: "Mediante la presente carta certificada, {syndicate} requiere formalmente a {recipient} para que cumpla sus obligaciones en el plazo indicado a continuación.",
  },
  mandatoryDeadlineTitle: { fr: "DÉLAI DE RÉPONSE IMPÉRATIF", ar: "أجل الرد الإلزامي", en: "MANDATORY RESPONSE DEADLINE", es: "PLAZO DE RESPUESTA OBLIGATORIO" },
  defaultDeadline: {
    fr: "15 (QUINZE) JOURS à compter de la réception de la présente",
    ar: "15 (خمسة عشر) يوماً من تاريخ استلام هذه الوثيقة",
    en: "15 (FIFTEEN) DAYS from receipt of this notice",
    es: "15 (QUINCE) DÍAS a partir de la recepción de la presente",
  },
  miseEnDemeureConsequencesTitle: { fr: "Conséquences en cas de non-réponse", ar: "العواقب في حال عدم الرد", en: "Consequences of non-response", es: "Consecuencias en caso de no respuesta" },
  miseEnDemeureConsequencesText: {
    fr: "À défaut de réponse dans le délai imparti, nous nous réservons le droit d'engager toutes les procédures légales et judiciaires appropriées sans autre préavis.",
    ar: "في حال عدم الرد ضمن المدة المحددة، نحتفظ بحقنا في اتخاذ كل الإجراءات القانونية والقضائية المناسبة دون سابق إنذار آخر.",
    en: "Failing a response within the allotted time, we reserve the right to initiate all appropriate legal and judicial proceedings without further notice.",
    es: "En caso de no obtener respuesta en el plazo indicado, nos reservamos el derecho de iniciar todos los procedimientos legales y judiciales pertinentes sin previo aviso adicional.",
  },
};

/** Human-readable, translated label for any signer/office-holder role in the system. */
export function roleLabel(role: string | null | undefined, lang: DocumentLanguage = "fr"): string {
  const map: Record<string, string> = {
    super_admin: t("roleSuperAdmin", lang),
    syndicate_admin: t("roleSyndicateAdmin", lang),
    president: t("rolePresident", lang),
    vice_president: t("roleVicePresident", lang),
    treasurer: t("roleTreasurer", lang),
    secretary: t("roleSecretary", lang),
    committee_member: t("roleCommitteeMember", lang),
    building_representative: t("roleBuildingRep", lang),
    member: t("roleMember", lang),
    tenant: t("roleTenant", lang),
  };
  return map[role ?? ""] ?? (role || "—");
}

function fmt(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), v), text);
}

function t(key: string, lang: DocumentLanguage): string {
  return I18N[key]?.[lang] ?? I18N[key]?.fr ?? key;
}

// ─── QR Code ──────────────────────────────────────────────────────────────────

/**
 * Encodes a QR pointing at the real, environment-portable public verification URL
 * built by the caller (routes/documents.ts) from the document's verificationToken —
 * never a hardcoded domain. Falls back to a bare documentNumber-based marker only
 * when no verification URL could be constructed (e.g. no domain available at all),
 * so the QR still communicates the reference rather than silently disappearing.
 */
async function generateQrDataUrl(verifyUrlOrDocNumber: string): Promise<string> {
  try {
    return await QRCode.toDataURL(verifyUrlOrDocNumber, {
      errorCorrectionLevel: "M",
      width: 160,
      margin: 1,
      color: { dark: BRAND.ink, light: BRAND.surfaceCard },
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
  buildingName: string | null = null,
  version: string | null = null,
  docStatus: string | null = null,
  categoryIcon = "■",
): object[] {
  // ── Generation 3 compact header ───────────────────────────────────────────
  // Adobe Sign / DocuSign approach: single white row, no heavy color fills.
  // Only the 2pt accent top stripe carries color — everything else is ink on white.
  // Total height: ~44pt (was ~70pt). Leaves maximum vertical space for content.

  const acronym = (syndInfo.abbreviation ||
    syndInfo.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 3)
  ).toUpperCase();

  const statusChipMap: Record<string, { label: string; color: string }> = {
    published:     { label: "PUBLIÉ",      color: BRAND.success },
    signed:        { label: "SIGNÉ",       color: BRAND.primary },
    validated:     { label: "VALIDÉ",      color: BRAND.primaryDark },
    archived:      { label: "ARCHIVÉ",     color: BRAND.mutedLight },
    generated:     { label: "GÉNÉRÉ",      color: BRAND.warning },
    draft:         { label: "BROUILLON",   color: BRAND.mutedLight },
    pending_review:{ label: "EN RÉVISION", color: BRAND.warning },
    rejected:      { label: "REJETÉ",      color: BRAND.destructive },
  };
  const statusChip = docStatus ? (statusChipMap[docStatus] ?? null) : null;

  // ── Monogram / logo — 40pt, accent-filled circle on white background ──────
  const monoFontSize = acronym.length === 1 ? 16 : acronym.length === 2 ? 13 : 11;
  const logoContent: unknown = logoDataUrl
    ? {
        image: logoDataUrl, width: 34, height: 34,
        fit: [34, 34] as [number, number],
        alignment: "center" as const,
        margin: [0, 4, 0, 4],
      }
    : {
        stack: [
          // Solid accent circle
          { canvas: [{ type: "ellipse", x: 18, y: 18, r1: 18, r2: 18, color: accentColor }], margin: [0, 0, 0, -36] },
          {
            text: acronym,
            fontSize: monoFontSize, bold: true,
            color: BRAND.surfaceCard,
            characterSpacing: acronym.length > 1 ? 1.2 : 0,
            alignment: "center" as const,
            margin: [0, monoFontSize === 16 ? 11 : monoFontSize === 13 ? 12 : 13, 0, 0],
          },
        ],
        margin: [0, 5, 0, 5],
      };

  // ── 2pt accent top stripe — only color in the header ─────────────────────
  const topStripe: unknown = {
    canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 2, color: accentColor }],
    margin: [0, 0, 0, 0],
  };

  // ── COL 3: doc reference + large QR (Gen4 — 50pt) ───────────────────────
  const col3Stack: unknown[] = [
    { text: "DOCUMENT NO.", fontSize: 4.5, bold: true, color: BRAND.muted, characterSpacing: 0.8, margin: [0, 0, 0, 1] },
    { text: `N° ${docNumber}`, fontSize: 7.5, bold: true, color: BRAND.ink, characterSpacing: 0.2, margin: [0, 0, 0, 3] },
    { text: "ISSUE DATE", fontSize: 4.5, bold: true, color: BRAND.muted, characterSpacing: 0.8, margin: [0, 0, 0, 1] },
    { text: today, fontSize: 6, color: BRAND.muted, margin: [0, 0, 0, 4] },
    ...(statusChip
      ? [{ text: `● ${statusChip.label}`, fontSize: 5.5, bold: true, color: statusChip.color, margin: [0, 0, 0, 4] as [number, number, number, number] }]
      : []),
    ...(qrDataUrl
      ? [{ image: qrDataUrl, width: 50, height: 50, alignment: "center" as const }]
      : [{ canvas: [{ type: "rect", x: 0, y: 0, w: 50, h: 50, r: 2, color: BRAND.border }], alignment: "center" as const }]
    ),
    { text: "SCAN · VÉRIFIER", fontSize: 4.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.4, alignment: "center" as const, margin: [0, 2, 0, 0] },
  ];

  // ── Single-row band — white background throughout ────────────────────────
  const bandRow: unknown = {
    table: {
      widths: [42, "*", 108],
      body: [[
        // COL 1 — Monogram on white
        {
          stack: [logoContent],
          alignment: "center" as const,
          margin: [4, 5, 4, 5],
          border: [false, false, true, false] as [boolean, boolean, boolean, boolean],
          borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border],
        },
        // COL 2 — Syndicate identity, white
        {
          stack: [
            { text: syndInfo.name, fontSize: 10, bold: true, color: BRAND.ink, lineHeight: 1.2, margin: [0, 0, 0, 2] },
            ...(buildingName ? [{ text: buildingName, fontSize: 6.5, color: BRAND.muted, margin: [0, 0, 0, 2] as [number, number, number, number] }] : []),
            {
              text: `${categoryIcon}  ${docTypeLabel.toUpperCase()}`,
              fontSize: 5.5, bold: true, color: accentColor, characterSpacing: 0.7,
              margin: [0, 2, 0, 0] as [number, number, number, number],
            },
            ...(syndInfo.registrationNumber || syndInfo.phone ? [{
              text: [
                ...(syndInfo.registrationNumber ? [`Imm. ${syndInfo.registrationNumber}`] : []),
                ...(syndInfo.phone ? [`  ·  ${syndInfo.phone}`] : []),
              ].join(""),
              fontSize: 5.5, color: BRAND.mutedLight,
              margin: [0, 2, 0, 0] as [number, number, number, number],
            }] : []),
          ],
          fillColor: BRAND.surfaceCard,
          margin: [10, 6, 10, 6],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        // COL 3 — Reference + QR, light surface
        {
          stack: col3Stack,
          fillColor: BRAND.surface,
          margin: [8, 7, 8, 7],
          border: [true, false, false, false] as [boolean, boolean, boolean, boolean],
          borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0, vLineWidth: () => 0,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 0],
  };

  // Bottom separator hairline
  const bottomRule: unknown = {
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }],
    margin: [0, 0, 0, 14],
  };

  return [topStripe, bandRow, bottomRule] as object[];
}

// ─── Official Seal ─────────────────────────────────────────────────────────────
// Institutional stamp. Premium redesign: circular emblem + status bar.

function buildOfficialSeal(
  syndName: string,
  accentColor: string,
  signerName?: string,
  stampDate?: string,
  status?: "VALID" | "PENDING" | "REVOKED" | "EXPIRED",
): unknown {
  const truncate = (s: string, n: number) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;

  const acronym = syndName.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 4).toUpperCase();
  const resolvedStatus = status ?? (signerName ? "VALID" : "PENDING");
  const dark = adjustColorBrightness(accentColor, -22);

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    VALID:   { label: "✓  CERTIFIÉ",   color: BRAND.successDeep,     bg: BRAND.successLight },
    PENDING: { label: "◉  EN ATTENTE", color: BRAND.warningDark,     bg: BRAND.warningLight },
    REVOKED: { label: "✗  ANNULÉ",     color: BRAND.destructiveDark, bg: BRAND.destructiveLight },
    EXPIRED: { label: "⊘  EXPIRÉ",     color: BRAND.muted,           bg: BRAND.surfaceAlt },
  };
  const si = statusConfig[resolvedStatus];

  // Premium institutional stamp: double outer border + inner inset ring.
  // Acronym at 22pt is the visual anchor; org name at 5pt below hairline.
  return {
    stack: [
      {
        table: {
          widths: [120],
          body: [
            // Header bar
            [{
              text: "CACHET OFFICIEL",
              fontSize: 4.5, bold: true, color: BRAND.surfaceCard,
              characterSpacing: 1.2, alignment: "center" as const,
              fillColor: dark,
              margin: [0, 5, 0, 5],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }],
            // Center — emblem circle + acronym + org name + date
            [{
              stack: [
                // Outer ring behind acronym
                { canvas: [{ type: "ellipse", x: 58, y: 20, r1: 20, r2: 20, lineWidth: 0.8, lineColor: `${accentColor}40`, color: BRAND.surfaceCard }], margin: [0, 4, 0, -44] },
                { text: acronym, fontSize: 22, bold: true, color: accentColor, alignment: "center" as const, characterSpacing: 2, margin: [0, 6, 0, 2] },
                { canvas: [{ type: "line", x1: 18, y1: 0, x2: 102, y2: 0, lineWidth: 0.4, lineColor: `${accentColor}30` }] },
                {
                  text: truncate(syndName.toUpperCase(), 24),
                  fontSize: 5, bold: true, color: BRAND.inkMid,
                  alignment: "center" as const, characterSpacing: 0.4,
                  lineHeight: 1.3, margin: [4, 4, 4, 1],
                },
                {
                  text: stampDate ?? new Date().toLocaleDateString("fr-FR"),
                  fontSize: 5, color: BRAND.muted,
                  alignment: "center" as const, margin: [0, 0, 0, 4],
                },
              ],
              fillColor: BRAND.surfaceCard,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }],
            // Status bar
            [{
              text: si.label,
              fontSize: 5.5, bold: true, color: si.color,
              alignment: "center" as const, characterSpacing: 0.3,
              fillColor: si.bg,
              margin: [0, 5, 0, 5],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }],
          ],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 1.4 : 0,
          vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i === 0 || i === node.table.widths.length ? 1.4 : 0,
          hLineColor: () => dark, vLineColor: () => dark,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    width: 120,
    alignment: "center" as const,
  };
}

// Adjust a hex color's brightness (delta: positive = lighter, negative = darker)
function adjustColorBrightness(hex: string, delta: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + delta));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + delta));
  const b = Math.min(255, Math.max(0, (n & 0xff) + delta));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ─── Gen4 Sidebar Info Panel ─────────────────────────────────────────────────
/**
 * buildSidebarInfoPanel — bordered info panel matching "SUPPLIER INFORMATION" in Image 1.
 * Header row: accent bg + white bold title left + icon circle right.
 * Body: each row has label (5.5pt muted caps) + value (9pt bold ink).
 * Alternating row backgrounds. Border: 1pt accent on top and sides.
 */
function buildSidebarInfoPanel(
  title: string,
  iconLabel: string,
  rows: Array<[string, string]>,
  accentColor: string,
): unknown {
  const bodyRows = rows.map((row, i) => {
    const bg = i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard;
    return [
      {
        stack: [
          { text: (row[0] || "").toUpperCase(), fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.7, margin: [0, 0, 0, 2] },
          { text: row[1] || "—", fontSize: 9, bold: true, color: BRAND.ink, lineHeight: 1.2 },
        ],
        fillColor: bg,
        margin: [10, 7, 10, 7],
        border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        colSpan: 1,
      },
    ];
  });

  return {
    stack: [
      // Header
      {
        table: {
          widths: ["*", 26],
          body: [[
            {
              text: title.toUpperCase(),
              fontSize: 7, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.6,
              fillColor: accentColor,
              margin: [10, 8, 6, 8],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
            {
              stack: [
                { canvas: [{ type: "ellipse", x: 10, y: 10, r1: 10, r2: 10, color: `${BRAND.surfaceCard}33` }], margin: [0, 0, 0, -22] },
                { text: iconLabel, fontSize: 10, bold: true, color: BRAND.surfaceCard, alignment: "center" as const, margin: [0, 4, 0, 0] },
              ],
              fillColor: accentColor,
              margin: [0, 4, 4, 4],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
          ]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
      // Body rows
      {
        table: {
          widths: ["*"],
          body: bodyRows.map(r => r),
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0 : 0.4,
          vLineWidth: () => 0,
          hLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 0, 0, 10],
  };
}

// ─── Gen4 Validation Status Panel ────────────────────────────────────────────
/**
 * buildValidationStatusPanel — matches the "VALIDATION STATUS" panel in Image 1.
 * Status badge with icon + label + sublabel.
 */
function buildValidationStatusPanel(
  status: string,
  accentColor: string,
  _lang: DocumentLanguage,
): unknown {
  type StatusConfig = { icon: string; label: string; sublabel: string; color: string; bg: string };
  const statusMap: Record<string, StatusConfig> = {
    validated:      { icon: "✓", label: "VALIDÉ",                    sublabel: "Document approuvé",         color: BRAND.successDeep, bg: BRAND.successLight },
    published:      { icon: "✓", label: "PUBLIÉ",                    sublabel: "Document publié",            color: BRAND.successDeep, bg: BRAND.successLight },
    signed:         { icon: "✓", label: "SIGNÉ",                     sublabel: "Signature enregistrée",      color: BRAND.primary,     bg: BRAND.primaryLighter },
    pending_review: { icon: "▲", label: "EN ATTENTE D'APPROBATION",  sublabel: "Approbation requise",        color: BRAND.warningDark, bg: BRAND.warningLight },
    generated:      { icon: "▲", label: "EN ATTENTE D'APPROBATION",  sublabel: "Approbation requise",        color: BRAND.warningDark, bg: BRAND.warningLight },
    draft:          { icon: "▲", label: "BROUILLON",                  sublabel: "Non finalisé",               color: BRAND.muted,       bg: BRAND.surfaceAlt },
    rejected:       { icon: "✗", label: "REJETÉ",                    sublabel: "Document rejeté",            color: BRAND.destructiveDark, bg: BRAND.destructiveLight },
    archived:       { icon: "◉", label: "ARCHIVÉ",                   sublabel: "Archivé",                    color: BRAND.muted,       bg: BRAND.surfaceAlt },
  };
  const cfg = statusMap[status] ?? statusMap["generated"];

  return {
    stack: [
      // Header
      {
        table: {
          widths: ["*"],
          body: [[{
            text: "STATUT DE VALIDATION",
            fontSize: 6.5, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.8,
            fillColor: BRAND.ink,
            margin: [10, 7, 10, 7],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
      // Status body
      {
        table: {
          widths: ["*"],
          body: [[{
            stack: [
              {
                columns: [
                  { text: cfg.icon, fontSize: 14, bold: true, color: cfg.color, width: 20, margin: [0, 2, 0, 0] },
                  {
                    stack: [
                      { text: cfg.label, fontSize: 7.5, bold: true, color: cfg.color, characterSpacing: 0.3, margin: [0, 0, 0, 2] },
                      { text: cfg.sublabel, fontSize: 6, color: BRAND.muted },
                    ],
                    width: "*",
                  },
                ],
              },
            ],
            fillColor: cfg.bg,
            margin: [10, 10, 10, 10],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.5 : 0,
          vLineWidth: () => 0,
          hLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 0, 0, 10],
  };
}

// ─── Gen4 Digital Verification Panel ─────────────────────────────────────────
/**
 * buildDigitalVerificationPanel — "VÉRIFICATION NUMÉRIQUE" sidebar panel from Image 1.
 * QR code (40pt) left + descriptive text right + verification ID + URL.
 */
function buildDigitalVerificationPanel(
  qrDataUrl: string,
  docNumber: string,
  verifyUrl: string | undefined,
  accentColor: string,
  _lang: DocumentLanguage,
): unknown {
  const displayUrl = verifyUrl || `syndycat.ma/verify/${docNumber}`;
  const shortUrl = displayUrl.length > 40 ? displayUrl.slice(0, 37) + "..." : displayUrl;
  const verId = `VER-${docNumber.replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase()}`;

  return {
    stack: [
      // Header
      {
        table: {
          widths: ["*"],
          body: [[{
            text: "VÉRIFICATION NUMÉRIQUE",
            fontSize: 6.5, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.8,
            fillColor: accentColor,
            margin: [10, 7, 10, 7],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
      // QR + text body
      {
        table: {
          widths: ["*"],
          body: [[{
            stack: [
              {
                columns: [
                  qrDataUrl
                    ? { image: qrDataUrl, width: 40, height: 40, margin: [0, 0, 8, 0] }
                    : { canvas: [{ type: "rect", x: 0, y: 0, w: 40, h: 40, r: 2, color: BRAND.border }], width: 40, margin: [0, 0, 8, 0] },
                  {
                    stack: [
                      { text: "Scannez ce QR code pour vérifier l'authenticité du document.", fontSize: 6.5, color: BRAND.inkLight, lineHeight: 1.4, margin: [0, 0, 0, 6] },
                      { text: `ID de vérification : ${verId}`, fontSize: 6.5, bold: true, color: accentColor, margin: [0, 0, 0, 3] },
                      { text: `Vérifiez sur : ${shortUrl}`, fontSize: 5.5, color: BRAND.muted, lineHeight: 1.3 },
                    ],
                    width: "*",
                  },
                ],
              },
            ],
            fillColor: BRAND.surface,
            margin: [10, 10, 10, 10],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.5 : 0,
          vLineWidth: () => 0,
          hLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 0, 0, 10],
  };
}

// ─── Gen4 Two-Column Layout Helper ───────────────────────────────────────────
/**
 * buildTwoColumnLayout — financial doc two-column layout: 62% main + 38% sidebar.
 */
function buildTwoColumnLayout(mainContent: unknown[], sidebarContent: unknown[]): unknown {
  return {
    columns: [
      { stack: mainContent, width: "62%" },
      { stack: sidebarContent, width: "38%" },
    ],
    columnGap: 14,
    margin: [0, 0, 0, 0],
  };
}

// ─── Gen4 Document Overview Grid ─────────────────────────────────────────────
/**
 * buildDocumentOverviewGrid — "APERÇU DU DOCUMENT" bordered grid from Image 1.
 * Header: accent-tinted row + accent bold label.
 * Body: 4-column grid of label/value cells.
 */
function buildDocumentOverviewGrid(fields: Array<[string, string]>, accentColor: string): unknown {
  const accentLight = `${accentColor}14`;
  const rows: unknown[][] = [];
  for (let i = 0; i < fields.length; i += 4) {
    const chunk = fields.slice(i, i + 4);
    while (chunk.length < 4) chunk.push(["", ""]);
    rows.push(chunk.map(([label, value], j) => ({
      stack: [
        { text: label.toUpperCase(), fontSize: 5, bold: true, color: BRAND.muted, characterSpacing: 0.6, margin: [0, 0, 0, 3] },
        { text: value || "—", fontSize: 9, bold: true, color: BRAND.ink, lineHeight: 1.2 },
      ],
      fillColor: j % 2 === 0 ? BRAND.surface : BRAND.surfaceCard,
      margin: [10, 8, 10, 8],
      border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    })));
  }
  return {
    stack: [
      {
        table: {
          widths: ["*"],
          body: [[{
            text: "APERÇU DU DOCUMENT",
            fontSize: 7, bold: true, color: accentColor, characterSpacing: 0.8,
            fillColor: accentLight,
            margin: [10, 6, 10, 6],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
      {
        table: { widths: ["*", "*", "*", "*"], body: rows },
        layout: {
          hLineWidth: (i: number, node: any) => i === 0 || i === node.table.body.length ? 0.6 : 0.4,
          vLineWidth: (j: number, node: any) => j === 0 || j === node.table.widths.length ? 0.6 : 0.4,
          hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 0, 0, 14],
  };
}

// ─── Reference Design Family Headers ─────────────────────────────────────────
// Three purpose-built header builders that replace buildHeaderBand() for
// specific document families, matching the 4 uploaded reference images at
// 95%+ visual fidelity.

/**
 * buildFinancialFamilyHeader — Image 1 (Nexora Financial Report) style.
 * Full-bleed dark navy band: logo | org name (white) + emerald doc-type label |
 * reference panel (lighter navy) with doc number + period + QR.
 * Finished with a 3pt emerald accent stripe below.
 */
function buildFinancialFamilyHeader(
  syndInfo: SyndicateInfo,
  docTypeLabel: string,
  docNumber: string,
  qrDataUrl: string,
  _accentColor: string,
  today: string,
  logoDataUrl: string | null,
  buildingName: string | null,
  period: string,
): object[] {
  const acronym  = syndInfo.name.split(/\s+/).map((w: string) => w[0] ?? "").join("").slice(0, 3).toUpperCase();
  const monoSize = acronym.length <= 1 ? 14 : acronym.length === 2 ? 12 : 10;
  const monoPad  = monoSize === 14 ? 11 : monoSize === 12 ? 12 : 13;

  const logoEl: unknown = logoDataUrl
    ? { image: logoDataUrl, width: 32, height: 32, fit: [32, 32] as [number, number], alignment: "center" as const }
    : {
        stack: [
          { canvas: [{ type: "ellipse", x: 18, y: 18, r1: 18, r2: 18, color: `${BRAND.surfaceCard}1f` }], margin: [0, 0, 0, -36] },
          { text: acronym, fontSize: monoSize, bold: true, color: BRAND.surfaceCard, characterSpacing: acronym.length > 1 ? 0.8 : 0, alignment: "center" as const, margin: [0, monoPad, 0, 0] },
        ],
      };

  const headerTable: unknown = {
    table: {
      widths: [54, "*", 122],
      body: [[
        // COL 1 — logo on deep navy
        { stack: [logoEl], alignment: "center" as const, fillColor: BRAND.navyHeader, margin: [6, 10, 6, 10], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
        // COL 2 — org identity
        {
          stack: [
            { text: syndInfo.name.toUpperCase(), fontSize: 10.5, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.3, lineHeight: 1.2, margin: [0, 0, 0, 2] },
            ...(buildingName ? [{ text: buildingName, fontSize: 6.5, color: `${BRAND.surfaceCard}88`, margin: [0, 0, 0, 4] as [number, number, number, number] }] : []),
            { text: docTypeLabel.toUpperCase(), fontSize: 5.5, bold: true, color: BRAND.emeraldStripe, characterSpacing: 1.1 },
            ...([syndInfo.registrationNumber, syndInfo.phone].filter(Boolean).length > 0
              ? [{ text: [syndInfo.registrationNumber ? `ICE: ${syndInfo.registrationNumber}` : "", syndInfo.phone || ""].filter(Boolean).join("  ·  "), fontSize: 5.5, color: `${BRAND.surfaceCard}66`, margin: [0, 3, 0, 0] as [number, number, number, number] }]
              : []),
          ],
          fillColor: BRAND.navyHeader,
          margin: [4, 10, 4, 10],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        // COL 3 — reference panel (lighter navy)
        {
          stack: [
            { text: "DOCUMENT N°", fontSize: 4.5, bold: true, color: `${BRAND.surfaceCard}77`, characterSpacing: 0.8, margin: [0, 0, 0, 1] },
            { text: docNumber, fontSize: 8.5, bold: true, color: BRAND.surfaceCard, margin: [0, 0, 0, 5] },
            { text: "DATE D'ÉMISSION", fontSize: 4.5, bold: true, color: `${BRAND.surfaceCard}77`, characterSpacing: 0.8, margin: [0, 0, 0, 1] },
            { text: today, fontSize: 7, color: `${BRAND.surfaceCard}cc`, margin: [0, 0, 0, 5] },
            ...(period ? [
              { text: "PÉRIODE", fontSize: 4.5, bold: true, color: `${BRAND.surfaceCard}77`, characterSpacing: 0.8, margin: [0, 0, 0, 1] },
              { text: period, fontSize: 7, color: `${BRAND.surfaceCard}cc`, margin: [0, 0, 0, 4] as [number, number, number, number] },
            ] : []),
            ...(qrDataUrl ? [{ image: qrDataUrl, width: 36, height: 36, alignment: "center" as const, margin: [0, 2, 0, 0] }] : []),
            { text: "SCAN · VÉRIFIER", fontSize: 4, bold: true, color: `${BRAND.surfaceCard}55`, characterSpacing: 0.4, alignment: "center" as const, margin: [0, 1, 0, 0] },
          ],
          fillColor: BRAND.navyHeaderMid,
          margin: [10, 8, 10, 8],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 0, 0, 0],
  };

  const accentStripe: unknown = { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 3, color: BRAND.emeraldStripe }], margin: [0, 0, 0, 14] };
  return [headerTable, accentStripe] as object[];
}

/**
 * buildCorporateDocHeader — Image 3 (Global Enterprise Purchase Order) style.
 * Dark corporate blue full-width band: LARGE document type (white 30pt bold)
 * on the left with org name above and building below; right panel darker with
 * doc number, date, optional status badge, and QR. 2pt accent stripe below.
 */
function buildCorporateDocHeader(
  syndInfo: SyndicateInfo,
  docTypeLabel: string,
  docNumber: string,
  qrDataUrl: string,
  accentColor: string,
  today: string,
  logoDataUrl: string | null,
  buildingName: string | null,
  docStatus: string | null,
): object[] {
  const statusMap: Record<string, { label: string; color: string }> = {
    published:      { label: "PUBLIÉ",      color: BRAND.successDark },
    signed:         { label: "SIGNÉ",       color: BRAND.primary },
    validated:      { label: "VALIDÉ",      color: BRAND.primary },
    generated:      { label: "GÉNÉRÉ",      color: "#F59E0B" },
    draft:          { label: "BROUILLON",   color: BRAND.mutedLight },
    pending_review: { label: "EN RÉVISION", color: "#F59E0B" },
  };
  const statusChip = docStatus ? (statusMap[docStatus] ?? null) : null;

  const acronym = syndInfo.name.split(/\s+/).map((w: string) => w[0] ?? "").join("").slice(0, 3).toUpperCase();
  const logoEl: unknown = logoDataUrl
    ? { image: logoDataUrl, width: 26, height: 26, fit: [26, 26] as [number, number], alignment: "center" as const }
    : {
        stack: [
          { canvas: [{ type: "ellipse", x: 13, y: 13, r1: 13, r2: 13, color: `${BRAND.surfaceCard}22` }], margin: [0, 0, 0, -26] },
          { text: acronym, fontSize: 8, bold: true, color: BRAND.surfaceCard, alignment: "center" as const, margin: [0, 9, 0, 0] },
        ],
      };

  const headerTable: unknown = {
    table: {
      widths: ["*", 138],
      body: [[
        // LEFT — large document title zone
        {
          stack: [
            {
              columns: [
                { stack: [logoEl], width: 30, margin: [0, 0, 8, 0] },
                { text: (syndInfo.name || "SYNDICAT DE COPROPRIÉTÉ").toUpperCase(), fontSize: 7, bold: true, color: `${BRAND.surfaceCard}99`, characterSpacing: 0.4, margin: [0, 4, 0, 0], width: "*" },
              ],
              margin: [0, 0, 0, 6],
            },
            { text: docTypeLabel.toUpperCase(), fontSize: 30, bold: true, color: BRAND.surfaceCard, lineHeight: 1, margin: [0, 0, 0, 4] },
            ...(buildingName ? [{ text: buildingName, fontSize: 7, color: `${BRAND.surfaceCard}77` }] : []),
          ],
          fillColor: BRAND.corpBlue,
          margin: [16, 14, 12, 14],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        // RIGHT — reference panel (darker blue)
        {
          stack: [
            { text: "N° DOCUMENT", fontSize: 4.5, bold: true, color: `${BRAND.surfaceCard}77`, characterSpacing: 0.8, margin: [0, 0, 0, 1] },
            { text: docNumber, fontSize: 9, bold: true, color: BRAND.surfaceCard, margin: [0, 0, 0, 6] },
            { text: "DATE D'ÉMISSION", fontSize: 4.5, bold: true, color: `${BRAND.surfaceCard}77`, characterSpacing: 0.8, margin: [0, 0, 0, 1] },
            { text: today, fontSize: 7.5, color: `${BRAND.surfaceCard}cc`, margin: [0, 0, 0, 6] },
            ...(statusChip ? [{ text: `● ${statusChip.label}`, fontSize: 6.5, bold: true, color: statusChip.color, margin: [0, 0, 0, 6] as [number, number, number, number] }] : []),
            ...(qrDataUrl ? [{ image: qrDataUrl, width: 44, height: 44, alignment: "center" as const, margin: [0, 2, 0, 0] }] : []),
            { text: "SCAN · VÉRIFIER", fontSize: 4, bold: true, color: `${BRAND.surfaceCard}55`, characterSpacing: 0.4, alignment: "center" as const, margin: [0, 2, 0, 0] },
          ],
          fillColor: BRAND.corpBlueDark,
          margin: [10, 10, 10, 10],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 0, 0, 0],
  };

  const accentStripe: unknown = { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 2, color: accentColor }], margin: [0, 0, 0, 14] };
  return [headerTable, accentStripe] as object[];
}

/**
 * buildLegalContractCover — Image 4 (Veritas Legal Contract) style.
 * Two-zone cover: left 44% very dark (legalDark) with gold hairlines, org
 * identity and gold doc-type label; right 56% light with 2×2 reference grid
 * and QR verification block. 2pt gold stripe finishes the element.
 */
function buildLegalContractCover(
  syndInfo: SyndicateInfo,
  docTypeLabel: string,
  docNumber: string,
  qrDataUrl: string,
  _accentColor: string,
  today: string,
  logoDataUrl: string | null,
  buildingName: string | null,
  version: string | null,
): object[] {
  const goldColor = BRAND.legalGold;
  const darkBg    = BRAND.legalDark;
  const acronym   = syndInfo.name.split(/\s+/).map((w: string) => w[0] ?? "").join("").slice(0, 3).toUpperCase();
  const monoSize  = acronym.length <= 2 ? 12 : 10;
  const monoPad   = monoSize === 12 ? 13 : 15;

  const logoEl: unknown = logoDataUrl
    ? { image: logoDataUrl, width: 34, height: 34, fit: [34, 34] as [number, number], alignment: "center" as const }
    : {
        stack: [
          { canvas: [{ type: "ellipse", x: 19, y: 19, r1: 19, r2: 19, color: goldColor }], margin: [0, 0, 0, -38] },
          { text: acronym, fontSize: monoSize, bold: true, color: darkBg, alignment: "center" as const, margin: [0, monoPad, 0, 0] },
        ],
      };

  const coverTable: unknown = {
    table: {
      widths: ["44%", "*"],
      body: [[
        // LEFT — dark cover zone with gold accents
        {
          stack: [
            { ...logoEl as object, margin: [0, 0, 0, 10] },
            { canvas: [{ type: "line", x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 1.2, lineColor: goldColor }], margin: [0, 0, 0, 10] },
            { text: syndInfo.name.toUpperCase(), fontSize: 9, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.3, lineHeight: 1.3, margin: [0, 0, 0, 3] },
            ...(buildingName ? [{ text: buildingName.toUpperCase(), fontSize: 6, color: `${BRAND.surfaceCard}77`, characterSpacing: 0.3, margin: [0, 0, 0, 6] as [number, number, number, number] }] : []),
            { canvas: [{ type: "line", x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 0.4, lineColor: `${goldColor}66` }], margin: [0, 6, 0, 10] },
            { text: docTypeLabel.toUpperCase(), fontSize: 7, bold: true, color: goldColor, characterSpacing: 1.1, margin: [0, 0, 0, 5] },
            { text: docNumber, fontSize: 8, bold: true, color: `${goldColor}cc` },
          ],
          fillColor: darkBg,
          margin: [16, 18, 14, 18],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        // RIGHT — reference grid zone
        {
          stack: [
            { text: "DOCUMENT JURIDIQUE OFFICIEL", fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.7, margin: [0, 0, 0, 10] },
            {
              table: {
                widths: ["*", "*"],
                body: [
                  [
                    { stack: [{ text: "N° DOCUMENT", fontSize: 4.5, bold: true, color: BRAND.muted, characterSpacing: 0.6, margin: [0, 0, 0, 2] }, { text: docNumber, fontSize: 9, bold: true, color: BRAND.ink }], fillColor: BRAND.surface, margin: [10, 8, 10, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                    { stack: [{ text: "DATE D'ÉMISSION", fontSize: 4.5, bold: true, color: BRAND.muted, characterSpacing: 0.6, margin: [0, 0, 0, 2] }, { text: today, fontSize: 9, bold: true, color: BRAND.ink }], fillColor: BRAND.surface, margin: [10, 8, 10, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                  ],
                  [
                    { stack: [{ text: "SYNDICAT", fontSize: 4.5, bold: true, color: BRAND.muted, characterSpacing: 0.6, margin: [0, 0, 0, 2] }, { text: syndInfo.name, fontSize: 7.5, bold: true, color: BRAND.ink, lineHeight: 1.2 }], fillColor: BRAND.surfaceCard, margin: [10, 8, 10, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                    { stack: [{ text: "VERSION", fontSize: 4.5, bold: true, color: BRAND.muted, characterSpacing: 0.6, margin: [0, 0, 0, 2] }, { text: version || "v1.0", fontSize: 9, bold: true, color: BRAND.ink }], fillColor: BRAND.surfaceCard, margin: [10, 8, 10, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                  ],
                ],
              },
              layout: {
                hLineWidth: (i: number, node: any) => i === 0 || i === node.table.body.length ? 0.5 : 0.3,
                vLineWidth: (i: number, node: any) => i === 0 || i === node.table.widths.length ? 0.5 : 0.3,
                hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
                paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
              },
              margin: [0, 0, 0, 10],
            },
            ...(qrDataUrl ? [{
              columns: [
                { image: qrDataUrl, width: 42, height: 42 },
                { stack: [{ text: "VÉRIFICATION NUMÉRIQUE", fontSize: 5, bold: true, color: BRAND.muted, characterSpacing: 0.5, margin: [0, 0, 0, 2] }, { text: "Scannez pour vérifier l'authenticité de ce document officiel.", fontSize: 6.5, color: BRAND.muted, lineHeight: 1.4 }], margin: [8, 2, 0, 0], width: "*" },
              ],
            }] : []),
          ],
          fillColor: BRAND.surfaceCard,
          margin: [14, 16, 14, 16],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 0, 0, 0],
  };

  const goldStripe: unknown = { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 2, color: goldColor }], margin: [0, 0, 0, 14] };
  return [coverTable, goldStripe] as object[];
}

/**
 * buildFinancialBarChart — Image 1 (Nexora) simulated horizontal bar chart.
 * Renders with pdfmake canvas rects: grey track + coloured fill for actuals +
 * a thin vertical line marking the budget target.
 */
function buildFinancialBarChart(
  categories: Array<{ label: string; budgetValue: number; actualValue: number; color?: string }>,
  accentColor: string,
  title: string,
): unknown {
  if (categories.length === 0) return { text: "" };
  const maxVal = Math.max(...categories.flatMap((c) => [c.budgetValue, c.actualValue]), 1);

  const chartTable: unknown = {
    table: {
      widths: [110, "*", 50],
      body: categories.map((cat, i) => {
        const actualW  = Math.max(2, Math.round((cat.actualValue  / maxVal) * 330));
        const budgetX  = Math.min(Math.max(2, Math.round((cat.budgetValue / maxVal) * 330)), 330);
        const barColor = cat.color || accentColor;
        const bg       = i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard;
        return [
          { text: cat.label, fontSize: 7.5, color: BRAND.inkMid, fillColor: bg, margin: [10, 9, 6, 9], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
          {
            stack: [{ canvas: [
              { type: "rect" as const, x: 0, y: 2, w: 330, h: 9, r: 3, color: BRAND.border },
              ...(actualW > 0 ? [{ type: "rect" as const, x: 0, y: 2, w: Math.min(actualW, 330), h: 9, r: 3, color: barColor }] : []),
              ...(budgetX > 0 ? [{ type: "rect" as const, x: Math.min(budgetX, 329), y: 0, w: 2, h: 13, r: 0, color: `${BRAND.ink}55` }] : []),
            ] }],
            fillColor: bg, margin: [6, 6, 6, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          },
          { text: cat.actualValue.toLocaleString("fr-MA"), fontSize: 7.5, bold: true, color: barColor, alignment: "right" as const, fillColor: bg, margin: [4, 9, 10, 9], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
        ];
      }),
    },
    layout: {
      hLineWidth: (i: number, node: any) => i === 0 || i === node.table.body.length ? 0.5 : 0,
      vLineWidth: () => 0,
      hLineColor: () => BRAND.border,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 0],
  };

  return {
    stack: [
      {
        columns: [
          { canvas: [{ type: "rect" as const, x: 0, y: 2, w: 3, h: 12, color: accentColor }], width: 3 },
          { text: title.toUpperCase(), fontSize: 8, bold: true, color: BRAND.ink, characterSpacing: 0.7, margin: [10, 0, 0, 0], width: "*" },
          {
            columns: [
              { canvas: [{ type: "rect" as const, x: 0, y: 3, w: 16, h: 7, r: 2, color: accentColor }], width: 16 },
              { text: "Réalisé", fontSize: 6.5, color: BRAND.muted, margin: [3, 1, 10, 0] },
              { canvas: [{ type: "rect" as const, x: 0, y: 3, w: 2, h: 7, r: 0, color: `${BRAND.ink}55` }], width: 2 },
              { text: "Budget", fontSize: 6.5, color: BRAND.muted, margin: [3, 1, 0, 0] },
            ],
            width: "auto", margin: [0, 1, 0, 0],
          },
        ],
        margin: [0, 12, 0, 8],
      },
      chartTable,
    ],
    margin: [0, 0, 0, 16],
  };
}

// ─── Shared building blocks ───────────────────────────────────────────────────

// ─── Document-Family Visual Openers ──────────────────────────────────────────
// Each document family has a distinct visual treatment that appears between
// the header and the document title — making the category immediately obvious
// at a glance and distinguishing financial reports from certificates, PVs, etc.

/**
 * Certificate / Attestation frame — ornate double-border with emblem.
 * Wraps the title in a formal official-document visual container.
 * Used for: certificat, attestation*, recu_paiement.
 */
function buildCertificateFrame(accentColor: string, lang: DocumentLanguage = "fr"): unknown {
  // Premium credential frame: double rule + emblem dots + tracked label.
  // The ornate double-rule signals "official certified document" at a glance —
  // the same visual grammar used on official civil and commercial certificates.
  const certLabel = lang === "ar" ? "وثيقة رسمية معتمدة" : lang === "en" ? "OFFICIAL CERTIFIED DOCUMENT" : "DOCUMENT OFFICIEL CERTIFIÉ";
  const dark = adjustColorBrightness(accentColor, -18);
  return {
    stack: [
      // Outer rule — 2pt solid accent
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: accentColor }] },
      // Inner rule — 0.5pt tinted inset
      { canvas: [{ type: "line", x1: 10, y1: 0, x2: 505, y2: 0, lineWidth: 0.5, lineColor: `${accentColor}40` }], margin: [0, 3, 0, 0] },
      // Emblem dots + label
      {
        columns: [
          { canvas: [{ type: "ellipse", x: 6, y: 4, r1: 4, r2: 4, color: accentColor }], width: 16 },
          {
            text: certLabel,
            fontSize: 6.5, bold: true, color: dark,
            alignment: "center" as const, characterSpacing: 1.6, width: "*", margin: [0, 1, 0, 0],
          },
          { canvas: [{ type: "ellipse", x: 2, y: 4, r1: 4, r2: 4, color: accentColor }], width: 16 },
        ],
        margin: [0, 8, 0, 8],
      },
      // Inner inset rule
      { canvas: [{ type: "line", x1: 10, y1: 0, x2: 505, y2: 0, lineWidth: 0.5, lineColor: `${accentColor}40` }] },
      // Outer rule — 2pt solid accent, with bottom margin before title
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: accentColor }], margin: [0, 3, 0, 16] },
    ],
  };
}

/**
 * Governance authority banner — shown on election and decision documents.
 * Establishes the legal/governing nature of the document immediately.
 * Used for: rapport_election, decision.
 */
function buildGovernanceBanner(
  accentColor: string,
  categoryLabel: string,
  entityRef?: string,
): unknown {
  // Authority panel — 5pt solid left bar + tinted surface + concentric emblem circles.
  // The left bar is intentionally thicker (5pt vs 3pt) to project institutional weight.
  // Emblem circles on the right echo the official seal motif.
  const dark = adjustColorBrightness(accentColor, -18);
  const ht = entityRef ? 36 : 24;
  return {
    stack: [
      {
        table: {
          widths: [5, "*", 28],
          body: [[
            // Heavy left bar
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 5, h: ht, color: accentColor }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            // Identity text
            {
              stack: [
                { text: categoryLabel.toUpperCase(), fontSize: 9, bold: true, color: dark, characterSpacing: 0.6, margin: [0, 0, 0, entityRef ? 3 : 0] },
                ...(entityRef ? [{ text: entityRef, fontSize: 6.5, color: BRAND.inkLight, lineHeight: 1.3 }] : []),
              ],
              fillColor: `${accentColor}0e`,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [12, entityRef ? 7 : 5, 0, entityRef ? 7 : 5],
            },
            // Emblem circles
            {
              canvas: [
                { type: "ellipse", x: 12, y: ht / 2, r1: 11, r2: 11, color: `${accentColor}14` },
                { type: "ellipse", x: 12, y: ht / 2, r1: 7,  r2: 7,  color: `${accentColor}28` },
                { type: "ellipse", x: 12, y: ht / 2, r1: 3,  r2: 3,  color: accentColor },
              ],
              fillColor: `${accentColor}0e`,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 8, 0],
            },
          ]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.5 : 0,
          vLineWidth: () => 0,
          hLineColor: () => `${accentColor}30`,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 0, 0, 14],
  };
}

/**
 * Legal alert banner — prominent visual warning for enforcement documents.
 * The red-background band makes the document's urgency unambiguous.
 * Used for: mise_en_demeure, lettre_officielle (enforcement context).
 */
function buildLegalAlertBanner(accentColor: string, lang: DocumentLanguage = "fr"): unknown {
  // Full-bleed enforcement panel: thick red left bar + destructive-tinted surface.
  // The 7pt bar signals urgency in the strongest possible way without using all-red.
  // This is how DocuSign and Adobe Sign render "action required" notices.
  const alertLabel = lang === "ar" ? "وثيقة قانونية رسمية — الرد الإلزامي" : "⚠  ACTE JURIDIQUE OFFICIEL — RÉPONSE OBLIGATOIRE";
  const sublabel   = lang === "ar" ? "يجب الرد خلال المهلة المحددة أدناه" : "Toute inaction dans le délai imparti engage la responsabilité du destinataire de plein droit.";
  return {
    stack: [
      {
        table: {
          widths: [7, "*"],
          body: [[
            // Heavy red bar — 7pt (was 3pt) for strong enforcement signal
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 7, h: 44, color: BRAND.destructiveDark }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            {
              stack: [
                { text: alertLabel, fontSize: 8.5, bold: true, color: BRAND.destructiveDark, characterSpacing: 0.3, margin: [0, 0, 0, 4] },
                { text: sublabel, fontSize: 6.5, color: BRAND.inkLight, lineHeight: 1.5 },
              ],
              fillColor: BRAND.destructiveLight,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [12, 10, 12, 10],
            },
          ]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === node.table.body.length ? 0.8 : 0,
          vLineWidth: () => 0,
          hLineColor: () => BRAND.destructive,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 0, 0, 14],
  };
}

/**
 * Meeting session identity banner — shown on PV, convocation, compte_rendu.
 * Provides a visual "meeting room" identity: meeting type, quorum, participants.
 * Used for: pv, convocation, compte_rendu.
 */
function buildMeetingBanner(
  accentColor: string,
  meetingType?: string,
  location?: string,
  date?: string,
  lang: DocumentLanguage = "fr",
): unknown {
  // Meeting session strip: type pill on the left + location/date on the right.
  // Top+bottom rules enclose the strip giving it a "session header" feel.
  // The accent-tinted background ties it visually to the document family.
  const dark = adjustColorBrightness(accentColor, -18);
  const typeLabel = meetingType || (lang === "ar" ? "جمعية عامة" : "ASSEMBLÉE GÉNÉRALE");
  const hasDetails = !!(location || date);
  return {
    stack: [
      // Top rule in accent — gives the strip a strong top anchor
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: accentColor }] },
      {
        table: {
          widths: [5, "auto", "*"],
          body: [[
            // Left accent bar — 5pt matches governance banner for family consistency
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 5, h: hasDetails ? 38 : 26, color: accentColor }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            // Session type label — 9pt bold
            {
              stack: [
                { text: "SESSION", fontSize: 5, bold: true, color: BRAND.muted, characterSpacing: 0.8, margin: [0, 0, 0, 2] },
                { text: typeLabel.toUpperCase(), fontSize: 9, bold: true, color: dark, characterSpacing: 0.4 },
              ],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [12, hasDetails ? 6 : 7, 20, hasDetails ? 6 : 7],
            },
            // Location + date (right-aligned)
            ...(hasDetails ? [{
              stack: [
                ...(location ? [{ text: `📍  ${location}`, fontSize: 6.5, color: BRAND.inkLight, margin: [0, 0, 0, 3] as [number,number,number,number] }] : []),
                ...(date    ? [{ text: `📅  ${date}`,      fontSize: 6.5, color: BRAND.inkLight }] : []),
              ],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              alignment: "right" as const,
              margin: [0, 7, 12, 7] as [number, number, number, number],
            }] : [{ text: "", border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }]),
          ]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        fillColor: `${accentColor}0d`,
      },
      // Bottom rule in border — closes the strip
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }], margin: [0, 0, 0, 14] },
    ],
  };
}


// ─── Professional Information Cards ──────────────────────────────────────────
// Replaces the old Excel-style table with a 2-column card grid.
// Each card has a labelled key in small caps and a bold value — clean,
// spacious, and visually distinct from body text.

function metaTable(rows: Array<[string, string]>, accentColor: string): unknown {
  // Generation 3 enterprise data grid — clean 2-column label | value list.
  // Replaces the 2-column card-pair grid with a simpler, more scalable layout.
  // Design principles (from SAP Fiori and Oracle ERP data grids):
  //   • Label: 5.5pt tracked all-caps, muted — purely functional, doesn't compete
  //   • Value: 12pt bold, ink — the dominant data point at a glance
  //   • Alternating row tints for scannability without card overhead
  //   • Top 2pt accent bar + bottom hairline as the only structural rules
  //   • Vertical mid-rule separates label from value column

  const bodyRows = rows.map((row, i) => {
    const bg = i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard;
    return [
      {
        text: (row[0] || "").toUpperCase(),
        fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.7,
        fillColor: bg,
        margin: [12, 8, 10, 8],
        border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
      },
      {
        text: row[1] || "—",
        fontSize: 12, bold: true, color: BRAND.ink, lineHeight: 1.2,
        fillColor: bg,
        margin: [10, 5, 12, 5],
        border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
      },
    ];
  });

  return {
    stack: [
      // Top 2pt accent rule — strong visual anchor
      { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 2, color: accentColor }] },
      {
        table: {
          widths: ["32%", "*"],
          body: bodyRows,
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0 : 0.4,
          vLineWidth: (j: number) => j === 1 ? 0.4 : 0,
          hLineColor: () => BRAND.border,
          vLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 0],
      },
      // Bottom hairline — closes the grid
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }] },
    ],
    margin: [0, 0, 0, 16],
  };
}

function contentSection(title: string, text: string, accentColor: string, isRtl = false): unknown {
  // Generation 3 section — 3pt left bar only, NO filled color band.
  // This mirrors Workday/Odoo Enterprise section dividers:
  //   • 3pt solid accent left bar — the eye anchor
  //   • 8.5pt tracked bold label — clean, no background fill
  //   • 0.4pt hairline — thin, non-competing separator before body
  // The absence of a tinted band means body content has maximum visual weight.
  const dark = adjustColorBrightness(accentColor, -14);
  return {
    stack: [
      // Section heading — left bar + tracked label
      {
        columns: [
          {
            canvas: [{ type: "rect", x: 0, y: 2, w: 3, h: 14, color: accentColor }],
            width: 3,
          },
          {
            text: title.toUpperCase(),
            fontSize: 8.5, bold: true,
            color: dark,
            characterSpacing: 0.9,
            width: "*",
            margin: [10, 0, 0, 0],
          },
        ],
        margin: [0, 14, 0, 6],
      },
      // Hairline separator
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }],
        margin: [0, 0, 0, 8],
      },
      // Body text
      {
        ...(isRtl
          ? { text, style: "bodyArabic", margin: [0, 0, 0, 10] }
          : { text, style: "body", margin: [0, 0, 0, 10] }),
      },
    ],
  };
}

// ─── Financial Dashboard Helpers ──────────────────────────────────────────────
// Enterprise-grade SAP/Oracle-style KPI cards, progress bars, and data tables
// for financial PDF templates.

/**
 * Renders a row of KPI metric cards (Gen4 design).
 * Each card: optional icon circle + label (5.5pt caps) + value (26pt bold) + sublabel.
 * All 4 sides bordered (0.5pt), supports any number of cards.
 */
function kpiRow(
  cards: Array<{ label: string; value: string; sublabel?: string; valueColor?: string; bgColor?: string; icon?: string }>,
  accentColor: string,
): unknown {
  // Generation 4 KPI card — icon circle above label + 4-side border.
  // Design mirrors Image 1: colored circle icon + small label + 26pt bold value + sublabel.
  const cardColor = (c: (typeof cards)[0]) => c.valueColor || accentColor;
  const makeCard = (c: (typeof cards)[0]) => ({
    table: {
      widths: ["*"],
      body: [[{
        stack: [
          // Icon circle (if icon provided)
          ...(c.icon ? [
            {
              columns: [
                {
                  stack: [
                    { canvas: [{ type: "ellipse", x: 9, y: 9, r1: 9, r2: 9, color: cardColor(c) }], margin: [0, 0, 0, -20] },
                    { text: c.icon, fontSize: 9, bold: true, color: BRAND.surfaceCard, alignment: "center" as const, margin: [0, 3, 0, 0] },
                  ],
                  width: 18,
                  margin: [0, 0, 6, 0],
                },
                { text: "", width: "*" },
              ],
              margin: [0, 0, 0, 6],
            },
          ] : []),
          { text: c.label.toUpperCase(), fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.9, margin: [0, 0, 0, 4] },
          { text: c.value, fontSize: 26, bold: true, color: cardColor(c), lineHeight: 1, margin: [0, 0, 0, 4] },
          ...(c.sublabel ? [{ text: c.sublabel, fontSize: 6.5, color: BRAND.muted }] : []),
        ],
        fillColor: c.bgColor || BRAND.surface,
        margin: [12, 12, 12, 12],
        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
      }]],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.5 : 0,
      vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i === 0 || i === node.table.widths.length ? 0.5 : 0,
      hLineColor: () => BRAND.border,
      vLineColor: () => BRAND.border,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
  });
  return {
    columns: cards.map(makeCard),
    columnGap: 10,
    margin: [0, 0, 0, 10],
  };
}

/**
 * Renders a horizontal progress bar with label, percentage fill, and value text.
 * Used for Collection Rate, Budget Consumption, etc.
 */
function progressBar(
  label: string,
  percent: number,        // 0-100
  value: string,
  total: string,
  accentColor: string,
): unknown {
  // Enterprise progress bar — full-width (515pt), 8pt tall pill shape.
  // Semantic color: ≥90% green, 60-89% accent, <60% red.
  // Label row: 8.5pt bold label + percentage badge right-aligned + value context.
  const clamped = Math.min(100, Math.max(0, percent));
  const barW = 515;
  const fillW = Math.round((clamped / 100) * barW);
  const barColor = percent >= 90 ? BRAND.successDark : percent >= 60 ? accentColor : BRAND.destructiveDark;

  return {
    stack: [
      {
        columns: [
          { text: label, fontSize: 8.5, bold: true, color: BRAND.ink, width: "*" },
          { text: `${clamped}%`, fontSize: 8.5, bold: true, color: barColor, width: "auto" },
          { text: `  ${value} / ${total}`, fontSize: 7, color: BRAND.muted, width: "auto", margin: [0, 1, 0, 0] },
        ],
        margin: [0, 0, 0, 4],
      },
      {
        canvas: [
          // Track — full page width, 8pt tall pill
          { type: "rect", x: 0, y: 0, w: barW, h: 8, r: 4, color: BRAND.border },
          // Fill
          ...(fillW > 0 ? [{ type: "rect" as const, x: 0, y: 0, w: fillW, h: 8, r: 4, color: barColor }] : []),
        ],
        margin: [0, 0, 0, 10],
      },
    ],
  };
}

/**
 * Renders an enterprise-grade financial summary dashboard section.
 * Shows 6 KPI cards (2 rows of 3) + 2 progress bars.
 * All values come from _kpi* keys populated by getFinancialDashboardData().
 */
function financialDashboard(input: Record<string, unknown>, accentColor: string): unknown[] {
  const kpiTotalCharged  = (input._kpiTotalCharged  as string) || "0";
  const kpiTotalPaid     = (input._kpiTotalPaid     as string) || "0";
  const kpiOutstanding   = (input._kpiOutstanding   as string) || "0";
  const kpiCollRate      = parseInt((input._kpiCollectionRate as string) || "0");
  const kpiCashBalance   = (input._kpiCashBalance   as string) || "0";
  const kpiBudgetTotal   = (input._kpiBudgetTotal   as string) || "0";
  const kpiBudgetConsumed = parseInt((input._kpiBudgetConsumed as string) || "0");
  const kpiRevenue       = (input._kpiTotalRevenue  as string) || "0";
  const kpiExpenses      = (input._kpiTotalExpenses as string) || "0";
  const kpiNetBalance    = (input._kpiNetBalance    as string) || "0";
  const kpiYear          = (input._kpiYear          as string) || String(new Date().getFullYear());

  // Always render — zero values are valid and informative (empty DB is better than invisible dashboard)

  const outstandingNum = parseFloat((input._kpiOutstanding as string || "0").replace(/\s/g, "").replace(",", "."));
  const outstandingColor = outstandingNum > 0 ? BRAND.destructiveDark : BRAND.successDark;

  // ── Dashboard section header — full-width accent band ───────────────────────
  // More prominent than a left-bar style: the financial dashboard IS the document.
  // Dark fill with white text signals "this is the executive summary panel."
  const dashboardDark = adjustColorBrightness(accentColor, -18);
  // Net balance semantic color: positive → accent, negative → destructive
  const netBalanceNum = parseFloat((input._kpiNetBalance as string || "0").replace(/\s/g, "").replace(",", "."));
  const netBalanceColor = netBalanceNum >= 0 ? accentColor : BRAND.destructiveDark;

  return [
    {
      table: {
        widths: ["*"],
        body: [[{
          columns: [
            { text: "TABLEAU DE BORD FINANCIER", fontSize: 8.5, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.4, width: "*", margin: [0, 2, 0, 0] },
            { text: `Exercice ${kpiYear}`, fontSize: 7, bold: true, color: `${BRAND.surfaceCard}aa`, width: "auto", alignment: "right" as const, margin: [0, 3, 0, 0] },
          ],
          fillColor: BRAND.ink,
          margin: [12, 9, 12, 9],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      margin: [0, 14, 0, 10],
    },
    // Row 1 — Revenue / Expenses / Net Balance
    // All cards share the same neutral background — numbers lead, not color chaos.
    // Semantic color applies ONLY to text: accent for income, red for expenses.
    kpiRow([
      { label: "Total Revenus",   value: `${kpiRevenue} MAD`,    valueColor: accentColor,           bgColor: BRAND.surface },
      { label: "Total Dépenses",  value: `${kpiExpenses} MAD`,   valueColor: BRAND.destructiveDark, bgColor: BRAND.surface },
      { label: "Solde Net",       value: `${kpiNetBalance} MAD`, valueColor: netBalanceColor,       bgColor: BRAND.surface },
    ], accentColor),
    // Row 2 — Charged / Paid / Outstanding
    kpiRow([
      { label: "Total Appelé",   value: `${kpiTotalCharged} MAD`, valueColor: BRAND.inkLight,  bgColor: BRAND.surface },
      { label: "Total Encaissé", value: `${kpiTotalPaid} MAD`,    valueColor: accentColor,     bgColor: BRAND.surface },
      { label: "Impayés",        value: `${kpiOutstanding} MAD`,  valueColor: outstandingColor, bgColor: BRAND.surface },
    ], accentColor),
    // Row 3 — Cash Balance / Budget Total / Collection Rate
    kpiRow([
      { label: "Trésorerie",           value: `${kpiCashBalance} MAD`, valueColor: accentColor,    bgColor: BRAND.surface },
      { label: "Budget Prévisionnel",  value: `${kpiBudgetTotal} MAD`, valueColor: BRAND.inkLight, bgColor: BRAND.surface },
      { label: "Taux de Recouvrement", value: `${kpiCollRate}%`,       valueColor: kpiCollRate >= 90 ? BRAND.successDark : kpiCollRate >= 60 ? accentColor : BRAND.destructiveDark, bgColor: BRAND.surface },
    ], accentColor),
    // Progress bars
    {
      stack: [
        progressBar("Taux de Recouvrement des Charges", kpiCollRate, `${kpiTotalPaid} MAD`, `${kpiTotalCharged} MAD`, accentColor),
        progressBar("Consommation Budgétaire", kpiBudgetConsumed, `${kpiTotalCharged} MAD`, `${kpiBudgetTotal} MAD`, accentColor),
      ],
      margin: [0, 4, 0, 16],
    },
  ];
}

/**
 * Renders a professional alternating-row data table for budget lines.
 * Parses the text-formatted budget lines from getBudgetData() and renders them
 * as a proper ERP-style table with category grouping and highlighted totals.
 */
function budgetLinesTable(
  lines: Array<{ category: string; label: string; amountAnnual: number }>,
  accentColor: string,
): unknown {
  if (lines.length === 0) return { text: "Aucune ligne budgétaire disponible.", fontSize: 9, color: BRAND.mutedLight, margin: [0, 8, 0, 8] };

  const categoryTotals: Record<string, number> = {};
  lines.forEach((l) => { categoryTotals[l.category] = (categoryTotals[l.category] ?? 0) + l.amountAnnual; });

  let lastCategory = "";
  let rowIdx = 0;
  const bodyRows: unknown[] = [
    [
      { text: "CATÉGORIE",    fontSize: 9, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [10, 8, 5, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
      { text: "DÉSIGNATION",  fontSize: 9, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [5, 8, 5, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
      { text: "ANNUEL (MAD)", fontSize: 9, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [5, 8, 10, 8], alignment: "right" as const, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
    ],
  ];

  lines.forEach((line) => {
    const isNewCategory = line.category !== lastCategory;
    lastCategory = line.category;
    const bg = rowIdx % 2 === 0 ? BRAND.surface : BRAND.surfaceCard;
    rowIdx++;

    bodyRows.push([
      {
        text: isNewCategory ? line.category : "",
        fontSize: 8.5, bold: true, color: isNewCategory ? accentColor : "transparent",
        fillColor: bg, margin: [10, 6, 5, 6],
        border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
      },
      { text: line.label, fontSize: 9.5, color: BRAND.inkMid, fillColor: bg, margin: [5, 6, 5, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
      { text: line.amountAnnual.toLocaleString("fr-MA"), fontSize: 9.5, bold: true, color: BRAND.ink, fillColor: bg, alignment: "right" as const, margin: [5, 6, 10, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
    ]);
  });

  // Category subtotals
  Object.entries(categoryTotals).forEach(([cat, total]) => {
    bodyRows.push([
      { text: `Sous-total ${cat}`, fontSize: 8.5, bold: true, color: BRAND.inkMid, fillColor: BRAND.borderLight, margin: [10, 5, 5, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
      { text: "", fillColor: BRAND.borderLight, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
      { text: total.toLocaleString("fr-MA"), fontSize: 8.5, bold: true, color: accentColor, fillColor: BRAND.borderLight, alignment: "right" as const, margin: [5, 5, 10, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
    ]);
  });

  // Grand total
  const grandTotal = lines.reduce((s, l) => s + l.amountAnnual, 0);
  bodyRows.push([
    { text: "TOTAL GÉNÉRAL", fontSize: 10, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [10, 9, 5, 9], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
    { text: "", fillColor: accentColor, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
    { text: `${grandTotal.toLocaleString("fr-MA")} MAD`, fontSize: 10, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "right" as const, margin: [5, 9, 10, 9], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
  ]);

  return {
    table: {
      widths: [110, "*", 110],
      body: bodyRows,
    },
    layout: {
      // Top/bottom rules: 1pt; internal hairlines: 0.4pt (was 0.3pt)
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 1 : 0.4,
      vLineWidth: () => 0,
      hLineColor: () => BRAND.border,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 20],
  };
}

/** Real signer info threaded into the primary signature block from `documentSignaturesTable`. */
export interface InlineSignatureInfo {
  signerName: string;
  signerRole: string;
  signedAt: Date;
  isValid: boolean;
  /** Raw SVG markup from the signature pad (signatureData column). When present
   *  this is rendered inline in the PDF so the handwritten trace is visible
   *  directly in the document body — not only on the appended signature page. */
  signatureData?: string;
}

/**
 * multiSignatoryBlock — 3-column professional signature block.
 * Always shows named slots for Président / Trésorier / Secrétaire, each with
 * the person's real name (from conseilSyndicalTable) and either the actual
 * recorded signature or an "En attente de signature" placeholder with a blank line.
 * The stamp circle appears below the Secretary column.
 */
function multiSignatoryBlock(
  officeHolders: OfficeHolders | undefined,
  accentColor: string,
  lang: DocumentLanguage,
  signatures: InlineSignatureInfo[],
  syndName: string = "SYNDICAT DE COPROPRIÉTÉ",
): unknown {
  const dateLocale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";
  const secondary = adjustColorBrightness(accentColor, -20);

  const findSig = (roles: string[]) =>
    signatures.find((s) => roles.some((r) => s.signerRole === r));

  const makeSignerCol = (
    titleLabel: string,
    personName: string | null | undefined,
    sig: InlineSignatureInfo | undefined,
  ): unknown => {
    const hasSig   = !!sig;
    const hasTrace = hasSig && isSvgData(sig.signatureData);
    const isValid  = hasSig && sig.isValid;

    // ── Signed state card ─────────────────────────────────────────────────
    const signerCardContents: unknown[] = [];

    // Role label — always at top, tracked small caps
    signerCardContents.push({
      text: titleLabel.toUpperCase(),
      fontSize: 6, bold: true,
      color: BRAND.mutedLight,
      characterSpacing: 0.6,
      alignment: "center" as const,
      margin: [0, 0, 0, 3],
    });

    if (personName) {
      signerCardContents.push({
        text: personName,
        fontSize: 10.5, bold: true,
        color: BRAND.ink,
        alignment: "center" as const,
        margin: [0, 0, 0, 6],
      });
    }

    if (hasSig) {
      // DocuSign-style status badge — filled solid background
      signerCardContents.push({
        table: {
          widths: ["*"],
          body: [[{
            text: isValid ? `✓  SIGNÉ ÉLECTRONIQUEMENT` : `✗  SIGNATURE INVALIDE`,
            fontSize: 6.5, bold: true,
            color: BRAND.surfaceCard,
            alignment: "center" as const,
            fillColor: isValid ? accentColor : BRAND.destructiveDark,
            margin: [4, 4, 4, 4],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 0, 0, 6],
      });

      // SVG trace in a framed tinted box, or empty trace area — Gen4: 60pt tall + DocuSign label
      if (hasTrace) {
        signerCardContents.push({
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: "DocuSigned par :", fontSize: 7, italics: true, color: BRAND.muted, margin: [4, 4, 0, 2] },
                { svg: sig.signatureData, width: 110, height: 48, alignment: "center" as const },
              ],
              fillColor: BRAND.primaryLighter,
              margin: [6, 4, 6, 4],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
            }]],
          },
          layout: {
            hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 0.5 : 0,
            vLineWidth: (i: number, n: { table: { widths: unknown[] } }) => i === 0 || i === n.table.widths.length ? 0.5 : 0,
            hLineColor: () => `${accentColor}44`,
            vLineColor: () => `${accentColor}44`,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 5],
        });
      } else {
        // Trace area — DocuSign-style 60pt tall box with label + dash line
        signerCardContents.push({
          canvas: [
            { type: "rect", x: 4, y: 0, w: 120, h: 60, r: 3, color: BRAND.primaryLighter, lineWidth: 0.5, lineColor: `${accentColor}44` },
            { type: "line", x1: 16, y1: 46, x2: 116, y2: 46, lineWidth: 1.2, lineColor: `${accentColor}55` },
          ],
          margin: [0, 0, 0, 0],
        });
        signerCardContents.push({
          text: "DocuSigned par :",
          fontSize: 7, italics: true, color: BRAND.muted,
          margin: [8, -55, 0, 38],
        });
      }

      signerCardContents.push({
        text: sig.signedAt.toLocaleString(dateLocale),
        fontSize: 6.5, color: BRAND.muted, italics: true,
        alignment: "center" as const,
        margin: [0, 0, 0, 3],
      });
      // Validity confirmation chip
      signerCardContents.push({
        table: {
          widths: ["*"],
          body: [[{
            text: isValid ? `● ${t("signatureValidLabel", lang)}` : `● ${t("signatureInvalidLabel", lang)}`,
            fontSize: 6, bold: true,
            color: isValid ? BRAND.successDeep : BRAND.destructiveDark,
            fillColor: isValid ? BRAND.successLight : BRAND.destructiveLight,
            alignment: "center" as const,
            margin: [4, 3, 4, 3],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 0.4 : 0,
          vLineWidth: (i: number, n: { table: { widths: unknown[] } }) => i === 0 || i === n.table.widths.length ? 0.4 : 0,
          hLineColor: () => isValid ? `${BRAND.success}44` : `${BRAND.destructive}44`,
          vLineColor: () => isValid ? `${BRAND.success}44` : `${BRAND.destructive}44`,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      });
    } else {
      // ── Unsigned placeholder ────────────────────────────────────────────
      // Prominent dashed-border box (not just a horizontal line)
      signerCardContents.push({
        canvas: [
          // Outer dashed rectangle simulated via thin rect + inner dashed rect
          {
            type: "rect" as const,
            x: 4, y: 0, w: 120, h: 52, r: 3,
            color: BRAND.surfaceAlt,
            lineWidth: 0.6, lineColor: BRAND.border,
          },
        ],
        margin: [0, 2, 0, 0],
      });
      signerCardContents.push({
        text: t("awaitingSignature", lang),
        fontSize: 7.5, color: BRAND.mutedLight, italics: true,
        alignment: "center" as const,
        margin: [0, -44, 0, 28],  // visually center inside the 52pt box
      });
    }

    // Wrap in a card container: subtle outer border, light bg tint
    return {
      table: {
        widths: ["*"],
        body: [[{
          stack: signerCardContents,
          fillColor: hasSig ? BRAND.surfaceCard : BRAND.surfaceAlt,
          margin: [8, 10, 8, 10],
          border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
        }]],
      },
      layout: {
        hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 0.6 : 0,
        vLineWidth: (i: number, n: { table: { widths: unknown[] } }) => i === 0 || i === n.table.widths.length ? 0.6 : 0,
        hLineColor: () => hasSig ? `${accentColor}44` : BRAND.border,
        vLineColor: () => hasSig ? `${accentColor}44` : BRAND.border,
        paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
      },
    };
  };

  // Official institutional seal — placed below the Secretary column
  const presidentSigForStamp = findSig(["president", "syndicate_admin", "super_admin"]);
  const stampDate = presidentSigForStamp
    ? presidentSigForStamp.signedAt.toLocaleDateString(dateLocale)
    : new Date().toLocaleDateString(dateLocale);
  const stampStatus = presidentSigForStamp
    ? (presidentSigForStamp.isValid ? "VALID" : "REVOKED")
    : "PENDING";
  const officialSeal = buildOfficialSeal(
    syndName,
    accentColor,
    presidentSigForStamp?.signerName,
    stampDate,
    stampStatus,
  );

  const presidentSig = findSig(["president", "syndicate_admin", "super_admin"]);
  const treasurerSig = findSig(["treasurer"]);
  const secretarySig = findSig(["secretary"]);

  // Section label
  const sigSectionLabel = lang === "ar" ? "التوقيعات الرسمية" : lang === "en" ? "OFFICIAL SIGNATURES" : "SIGNATURES OFFICIELLES";

  const panelLabel = lang === "ar" ? "لوحة التحقق الرقمي" : lang === "en" ? "DIGITAL VALIDATION PANEL" : "PANNEAU DE VALIDATION NUMÉRIQUE";
  // Use app ink (#1e1b4b) — consistent authoritative dark across all document families.
  // avoids a garish darkened-accent (e.g. near-black forest green for financial docs).
  const validationDark = BRAND.ink;

  return {
    stack: [
      // ── PANNEAU DE VALIDATION NUMÉRIQUE ─────────────────────────────────────
      // Full-width dark header band — DocuSign/Adobe Sign grade validation panel.
      // Replaces the thin separator + small label with an executive-weight header.
      {
        table: {
          widths: ["*", 128],
          body: [[
            // Left: validation panel label + signature count context
            {
              stack: [
                { text: "● " + panelLabel, fontSize: 8.5, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.4, margin: [0, 0, 0, 3] },
                { text: sigSectionLabel.toUpperCase(), fontSize: 5.5, color: `${BRAND.surfaceCard}88`, characterSpacing: 0.8 },
              ],
              fillColor: validationDark,
              margin: [14, 10, 14, 10],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
            // Right: official seal
            {
              stack: [officialSeal],
              fillColor: validationDark,
              alignment: "center" as const,
              margin: [4, 6, 4, 6],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
          ]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 24, 0, 12],
      },
      // 3-column signer grid
      {
        columns: [
          { ...makeSignerCol(t("rolePresident", lang), officeHolders?.president?.fullName, presidentSig) as object, width: "*" },
          { width: 8, text: "" },
          { ...makeSignerCol(t("roleTreasurer", lang), officeHolders?.treasurer?.fullName, treasurerSig) as object, width: "*" },
          { width: 8, text: "" },
          { ...makeSignerCol(t("roleSecretary", lang), officeHolders?.secretary?.fullName, secretarySig) as object, width: "*" },
        ],
      },
    ],
  };
}

function signatureBlock(
  signatoryTitle: string,
  syndName: string,
  accentColor: string,
  showStampCircle = true,
  lang: DocumentLanguage = "fr",
  signatures: InlineSignatureInfo[] = [],
): unknown {
  const dateLocale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";

  const sigSectionLabel = lang === "ar" ? "التوقيع الرسمي" : lang === "en" ? "OFFICIAL SIGNATURE" : "SIGNATURE OFFICIELLE";

  // ── Institutional seal ─────────────────────────────────────────────────────
  const firstSig = signatures[0] ?? null;
  const sealDate = firstSig ? firstSig.signedAt.toLocaleDateString(dateLocale) : new Date().toLocaleDateString(dateLocale);
  const sealStatus = firstSig ? (firstSig.isValid ? "VALID" : "REVOKED") : "PENDING";
  const officialSealFinal = buildOfficialSeal(syndName, accentColor, firstSig?.signerName, sealDate, sealStatus);

  // ── Signer rows — one card per real signature, or a placeholder ────────────
  const signerRows: unknown[] = signatures.length > 0
    ? signatures.map((sig, i) => {
        const isValid  = sig.isValid;
        const hasTrace = isSvgData(sig.signatureData);
        return {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                // Solid status badge (full width, filled background)
                {
                  table: {
                    widths: ["*"],
                    body: [[{
                      text: isValid ? `✓  SIGNÉ ÉLECTRONIQUEMENT` : `✗  SIGNATURE INVALIDE`,
                      fontSize: 7, bold: true,
                      color: BRAND.surfaceCard,
                      alignment: "center" as const,
                      fillColor: isValid ? accentColor : BRAND.destructiveDark,
                      margin: [6, 5, 6, 5],
                      border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                    }]],
                  },
                  layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: (): number => 0, paddingRight: (): number => 0, paddingTop: (): number => 0, paddingBottom: (): number => 0 },
                  margin: [0, 0, 0, 8],
                },
                // Name + role
                { text: sig.signerName, fontSize: 11, bold: true, color: BRAND.ink, alignment: "center" as const, margin: [0, 0, 0, 2] },
                { text: roleLabel(sig.signerRole, lang), fontSize: 7.5, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 8] },
                // SVG trace — Gen4: DocuSign-style label + 60pt tall trace box
                hasTrace
                  ? {
                      table: {
                        widths: ["*"],
                        body: [[{
                          stack: [
                            { text: "DocuSigned par :", fontSize: 7, italics: true, color: BRAND.muted, margin: [6, 4, 0, 2] },
                            { svg: sig.signatureData, width: 180, height: 50, alignment: "center" as const },
                          ],
                          fillColor: BRAND.primaryLighter,
                          margin: [8, 4, 8, 6],
                          border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                        }]],
                      },
                      layout: {
                        hLineWidth: (ii: number, n: { table: { body: unknown[] } }) => ii === 0 || ii === n.table.body.length ? 0.5 : 0,
                        vLineWidth: (ii: number, n: { table: { widths: unknown[] } }) => ii === 0 || ii === n.table.widths.length ? 0.5 : 0,
                        hLineColor: () => `${accentColor}44`, vLineColor: () => `${accentColor}44`,
                        paddingLeft: (): number => 0, paddingRight: (): number => 0, paddingTop: (): number => 0, paddingBottom: (): number => 0,
                      },
                      margin: [0, 0, 0, 6],
                    }
                  : {
                      stack: [
                        {
                          canvas: [
                            { type: "rect" as const, x: 0, y: 0, w: 240, h: 60, r: 3, color: BRAND.primaryLighter, lineWidth: 0.5, lineColor: `${accentColor}44` },
                            { type: "line" as const, x1: 20, y1: 46, x2: 220, y2: 46, lineWidth: 1.2, lineColor: `${accentColor}55` },
                          ],
                          margin: [0, 0, 0, 0],
                        },
                        { text: "DocuSigned par :", fontSize: 7, italics: true, color: BRAND.muted, margin: [6, -56, 0, 38] },
                        { text: "—", fontSize: 14, color: `${accentColor}44`, margin: [80, 0, 0, 0] },
                      ],
                      margin: [0, 0, 0, 6],
                    },
                // Date + validity chip
                { text: `${t("signedOnLabel", lang)} ${sig.signedAt.toLocaleString(dateLocale)}`, fontSize: 6.5, color: BRAND.muted, italics: true, alignment: "center" as const, margin: [0, 0, 0, 4] },
                {
                  table: {
                    widths: ["*"],
                    body: [[{
                      text: isValid ? `● ${t("signatureValidLabel", lang)}` : `● ${t("signatureInvalidLabel", lang)}`,
                      fontSize: 6, bold: true,
                      color: isValid ? BRAND.successDeep : BRAND.destructiveDark,
                      fillColor: isValid ? BRAND.successLight : BRAND.destructiveLight,
                      alignment: "center" as const,
                      margin: [6, 3, 6, 3],
                      border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                    }]],
                  },
                  layout: {
                    hLineWidth: (ii: number, n: { table: { body: unknown[] } }) => ii === 0 || ii === n.table.body.length ? 0.4 : 0,
                    vLineWidth: (ii: number, n: { table: { widths: unknown[] } }) => ii === 0 || ii === n.table.widths.length ? 0.4 : 0,
                    hLineColor: () => isValid ? `${BRAND.success}44` : `${BRAND.destructive}44`,
                    vLineColor: () => isValid ? `${BRAND.success}44` : `${BRAND.destructive}44`,
                    paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
                  },
                },
              ],
              fillColor: BRAND.surfaceCard,
              margin: [12, 12, 12, 12],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
            }]],
          },
          layout: {
            hLineWidth: (ii: number, n: { table: { body: unknown[] } }) => ii === 0 || ii === n.table.body.length ? 0.6 : 0,
            vLineWidth: (ii: number, n: { table: { widths: unknown[] } }) => ii === 0 || ii === n.table.widths.length ? 0.6 : 0,
            hLineColor: () => `${accentColor}44`, vLineColor: () => `${accentColor}44`,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, i > 0 ? 10 : 0, 0, 0] as [number, number, number, number],
        };
      })
    : [
        // Unsigned placeholder card — dashed border, centered awaiting text
        {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: signatoryTitle.toUpperCase(), fontSize: 6, bold: true, color: BRAND.mutedLight, characterSpacing: 0.5, alignment: "center" as const, margin: [0, 0, 0, 4] },
                { text: syndName, fontSize: 10, bold: true, color: BRAND.ink, alignment: "center" as const, margin: [0, 0, 0, 8] },
                {
                  canvas: [
                    { type: "rect" as const, x: 0, y: 0, w: 200, h: 52, r: 3, color: BRAND.surfaceAlt, lineWidth: 0.6, lineColor: BRAND.border },
                  ],
                  alignment: "center" as const,
                  margin: [0, 0, 0, 0],
                },
                {
                  text: t("awaitingSignature", lang),
                  fontSize: 7.5, color: BRAND.mutedLight, italics: true,
                  alignment: "center" as const,
                  margin: [0, -38, 0, 22],
                },
              ],
              fillColor: BRAND.surfaceAlt,
              margin: [12, 12, 12, 12],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
            }]],
          },
          layout: {
            hLineWidth: (ii: number, n: { table: { body: unknown[] } }) => ii === 0 || ii === n.table.body.length ? 0.5 : 0,
            vLineWidth: (ii: number, n: { table: { widths: unknown[] } }) => ii === 0 || ii === n.table.widths.length ? 0.5 : 0,
            hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
        },
      ];

  const panelLabelSingle = lang === "ar" ? "لوحة التحقق الرقمي" : lang === "en" ? "DIGITAL VALIDATION PANEL" : "PANNEAU DE VALIDATION NUMÉRIQUE";
  // Same ink-dark approach as multiSignatoryBlock — consistent across all families.
  const validationDarkSingle = BRAND.ink;

  return {
    stack: [
      // ── PANNEAU DE VALIDATION — single signer edition ──────────────────────
      {
        table: {
          widths: ["*", ...(showStampCircle ? [128] : [])],
          body: [[
            {
              stack: [
                { text: "● " + panelLabelSingle, fontSize: 8.5, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.4, margin: [0, 0, 0, 3] },
                { text: sigSectionLabel.toUpperCase(), fontSize: 5.5, color: `${BRAND.surfaceCard}88`, characterSpacing: 0.8 },
              ],
              fillColor: validationDarkSingle,
              margin: [14, 10, 14, 10],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
            ...(showStampCircle ? [{
              stack: [officialSealFinal],
              fillColor: validationDarkSingle,
              alignment: "center" as const,
              margin: [4, 6, 4, 6],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }] : []),
          ]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 28, 0, 12],
      },
      // Signer content
      ...signerRows as object[],
    ],
  };
}

function legalFooterNote(docNumber: string, lang: DocumentLanguage = "fr", verifyUrl?: string): unknown {
  const tmpl = verifyUrl
    ? t("legalFooterNote", lang).replace(/syndycat\.ma\/verify\/\{ref\}/g, verifyUrl)
    : t("legalFooterNote", lang);
  const text = tmpl.replace(/\{ref\}/g, docNumber);
  const titleLabel =
    lang === "ar" ? "ملاحظة قانونية"
    : lang === "en" ? "LEGAL NOTICE"
    : lang === "es" ? "NOTA LEGAL"
    : "NOTE LÉGALE";

  // Minimal legal footer: 3pt grey bar + flat surface, no decorative rules.
  // 6.5pt label/text keeps it clearly secondary to document content.
  return {
    stack: [
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }], margin: [0, 0, 0, 0] },
      {
        table: {
          widths: [3, "*"],
          body: [[
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 34, color: BRAND.border }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            {
              stack: [
                {
                  columns: [
                    { text: titleLabel.toUpperCase(), fontSize: 6, bold: true, color: BRAND.muted, characterSpacing: 0.6, width: "*" },
                    { text: docNumber, fontSize: 6, bold: true, color: BRAND.mutedLight, width: "auto", alignment: "right" as const },
                  ],
                  margin: [0, 0, 0, 3],
                },
                { text, fontSize: 6.5, color: BRAND.mutedLight, lineHeight: 1.5 },
              ],
              fillColor: BRAND.surface,
              margin: [10, 8, 12, 8],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 20, 0, 0],
  };
}

// ─── PDF Buffer ───────────────────────────────────────────────────────────────

async function buildPdfBuffer(docDef: unknown): Promise<Buffer> {
  const PdfPrinter = (await import("pdfmake")).default as any;
  const printer = new PdfPrinter(FONTS);
  const pdfDoc = printer.createPdfKitDocument({
    defaultStyle: { font: PRIMARY_FONT, fontSize: 10.5, lineHeight: 1.6 },
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
  if (!privateDir) {
    // GCS not configured — fall back to local temp disk so generation still works.
    logger.warn("PRIVATE_OBJECT_DIR not set — saving PDF to local temp disk (development fallback)");
    return saveToLocalDisk(buffer, filename);
  }
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
  // Local-disk fallback: return a direct API route instead of a signed GCS URL
  if (internalPath.startsWith("/local-docs/")) {
    const rest = internalPath.replace(/^\/local-docs\//, "");
    const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "";
    const base = devDomain
      ? `https://${devDomain}`
      : `http://localhost:${process.env.PORT ?? 8080}`;
    return `${base}/api/documents/local-docs/${rest}`;
  }
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
// Fetches the syndicate logo (PNG/JPG/WebP uploaded via /objects/... internal path,
// or a plain https URL) and returns a base64 data URI pdfmake can embed as an `image`
// node. SVG logos are not supported by pdfmake/PDFKit — reject silently and fall back
// to the initials header, logging a WARN so admins can re-upload in PNG/JPG format.

const LOGO_CACHE_TTL_MS     = 5 * 60 * 1000;  // 5 min — success cache
const LOGO_FAIL_CACHE_TTL_MS = 60 * 1000;      // 1 min — failure cache (retry sooner)
const logoCache = new Map<string, { dataUrl: string | null; expires: number }>();

/** Bust the cache for a specific logo URL (call after upload/update). */
export function bustLogoCache(logoUrl: string): void {
  logoCache.delete(logoUrl);
}

function detectImageMime(buf: Buffer): string | null {
  // PNG: 89 50 4E 47
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // WebP: RIFF????WEBP
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  // SVG or any other unsupported format
  return null;
}

export async function fetchLogoDataUrl(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;

  const cached = logoCache.get(logoUrl);
  if (cached && cached.expires > Date.now()) return cached.dataUrl;

  try {
    let buf: Buffer;
    if (/^https?:\/\//i.test(logoUrl)) {
      const resp = await fetch(logoUrl, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) throw new Error(`logo fetch failed: HTTP ${resp.status}`);
      buf = Buffer.from(await resp.arrayBuffer());
    } else {
      // Internal object-storage path, e.g. "/objects/uploads/<uuid>"
      const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
      if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR env var not set — cannot resolve logo path");
      const entityId = logoUrl.replace(/^\/objects\//, "");
      // Local filesystem fallback — PRIVATE_OBJECT_DIR is a local path in dev (not gs://)
      if (!privateDir.startsWith("gs://")) {
        const fullPath = path.join(privateDir, entityId);
        buf = await fs.readFile(fullPath);
      } else {
        const sep = privateDir.endsWith("/") ? "" : "/";
        const fullPath = `${privateDir}${sep}${entityId}`;
        const { bucketName, objectName } = parseGcsPath(fullPath);
        [buf] = await objectStorageClient.bucket(bucketName).file(objectName).download();
      }
    }

    const mime = detectImageMime(buf);
    if (!mime) {
      // Likely an SVG — pdfmake cannot embed it; log so admin knows to re-upload as PNG
      logger.warn(
        { logoUrl, bufferHead: buf.slice(0, 16).toString("hex") },
        "fetchLogoDataUrl: unsupported image format (SVG/GIF?), falling back to initials — re-upload logo as PNG or JPEG",
      );
      logoCache.set(logoUrl, { dataUrl: null, expires: Date.now() + LOGO_FAIL_CACHE_TTL_MS });
      return null;
    }

    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    logoCache.set(logoUrl, { dataUrl, expires: Date.now() + LOGO_CACHE_TTL_MS });
    return dataUrl;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, logoUrl },
      "fetchLogoDataUrl: fetch/read failure, falling back to initials header",
    );
    logoCache.set(logoUrl, { dataUrl: null, expires: Date.now() + LOGO_FAIL_CACHE_TTL_MS });
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
  /** Legal validation status of this signature — false once the document is rejected/superseded. */
  isValid?: boolean;
}

/** Extracts `d="..."` path data from simple single-color <path> elements (our SignaturePad output). */
function extractSvgPaths(svg: string): string[] {
  const matches = [...svg.matchAll(/<path\s+d="([^"]+)"/g)];
  return matches.map((m) => m[1]);
}

// ─── Local-disk PDF read/write (dev fallback) ─────────────────────────────────

async function downloadPdfBuffer(internalPath: string): Promise<Buffer> {
  if (internalPath.startsWith("/local-docs/")) {
    const rest  = internalPath.replace("/local-docs/", "");
    const slash = rest.indexOf("/");
    const uuid  = rest.slice(0, slash);
    const file  = rest.slice(slash + 1);
    return readLocalDocFile(uuid, file);
  }
  return downloadPdfFromGcs(internalPath);
}

async function overwritePdfBuffer(internalPath: string, buffer: Buffer): Promise<void> {
  if (internalPath.startsWith("/local-docs/")) {
    const rest  = internalPath.replace("/local-docs/", "");
    const slash = rest.indexOf("/");
    const uuid  = rest.slice(0, slash);
    const file  = rest.slice(slash + 1);
    const dir   = path.join(LOCAL_DOCS_TMP, uuid);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), buffer);
    return;
  }
  return overwritePdfInGcs(internalPath, buffer);
}

/**
 * Appends a professional branded "Signatures électroniques" page to an existing
 * generated document PDF, rendering each signer's handwritten trace, name, role,
 * date, and validity badge using the syndicate accent color.
 *
 * Supports local-disk (dev) and GCS (prod) storage.
 * Best-effort: throws on failure so the caller can log/audit without blocking
 * the already-durable DB signature record.
 */
export async function appendSignaturesToPdf(
  internalPath: string,
  signatures: SignatureToEmbed[],
  lang: DocumentLanguage = "fr",
  accentColor: string = BRAND.primary,
  syndicateName = "",
  docRef = "",
  stripLastN = 0,
): Promise<void> {
  if (signatures.length === 0) return;
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const dateLocale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";

  // Hex string → pdf-lib rgb() (0-1 scale)
  const hexRgb = (hex: string, alpha?: number) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = (n >> 16) / 255;
    const g = ((n >> 8) & 0xff) / 255;
    const b = (n & 0xff) / 255;
    if (alpha !== undefined) return rgb(r * alpha + (1 - alpha), g * alpha + (1 - alpha), b * alpha + (1 - alpha));
    return rgb(r, g, b);
  };

  const accentRgb    = hexRgb(accentColor);
  const accentDimRgb = hexRgb(adjustColorBrightness(accentColor, -22));

  const existingBytes = await downloadPdfBuffer(internalPath);
  const pdfDoc   = await PDFDocument.load(existingBytes, { ignoreEncryption: true });

  // Strip previously-appended signature pages so re-signing replaces instead of accumulates
  if (stripLastN > 0) {
    const pageCount = pdfDoc.getPageCount();
    const toRemove = Math.min(stripLastN, pageCount - 1); // always preserve at least 1 original page
    for (let i = 0; i < toRemove; i++) {
      pdfDoc.removePage(pdfDoc.getPageCount() - 1);
    }
  }

  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ─── A4 layout constants ────────────────────────────────────────────────────
  const PAGE_W    = 595.28;
  const PAGE_H    = 841.89;
  const ML        = 36;                         // margin left
  const MR        = 36;                         // margin right
  const CW        = PAGE_W - ML - MR;           // content width
  const HEADER_H  = 66;
  const FOOTER_H  = 26;
  const CARD_PAD  = 12;
  const SIG_BOX_H = 70;                         // handwritten trace area height
  const CARD_TXT  = 74;                         // name + role + date + badge
  const CARD_GAP  = 12;

  const cardHeight = (sig: SignatureToEmbed) => {
    const hasPaths = (sig.signatureSvg ?? "").length > 0 && extractSvgPaths(sig.signatureSvg!).length > 0;
    return hasPaths
      ? CARD_PAD * 3 + CARD_TXT + SIG_BOX_H
      : CARD_PAD * 2 + CARD_TXT;
  };

  // ─── Translated labels ──────────────────────────────────────────────────────
  const sigTitle  = lang === "ar" ? "التوقيعات الإلكترونية" : lang === "en" ? "ELECTRONIC SIGNATURES" : lang === "es" ? "FIRMAS ELECTRÓNICAS" : "SIGNATURES ÉLECTRONIQUES";
  const countSuffix = signatures.length > 1
    ? (lang === "ar" ? "توقيعات" : lang === "en" ? "signatures" : "signatures")
    : (lang === "ar" ? "توقيع" : lang === "en" ? "signature" : "signature");
  const traceLabel = lang === "ar" ? "الخط اليدوي" : lang === "en" ? "Handwritten trace" : lang === "es" ? "Trazo manuscrito" : "Tracé manuscrit certifié";

  // ─── Page factory: draws header band + footer bar ───────────────────────────
  let page!: ReturnType<typeof pdfDoc.addPage>;

  const newPage = (): number => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);

    // ── Header band (full width)
    page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: accentRgb });
    // Darker lower strip for depth
    page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: 3, color: accentDimRgb });
    // Left vertical accent bar
    page.drawRectangle({ x: ML, y: PAGE_H - HEADER_H + 14, width: 3, height: HEADER_H - 28, color: rgb(1, 1, 1) });

    // Title
    page.drawText(sigTitle, { x: ML + 12, y: PAGE_H - HEADER_H + 36, size: 13, font: boldFont, color: rgb(1, 1, 1) });

    // Syndicate name (below title)
    if (syndicateName) {
      const sn = syndicateName.length > 55 ? syndicateName.slice(0, 52) + "..." : syndicateName;
      page.drawText(sn.toUpperCase(), { x: ML + 12, y: PAGE_H - HEADER_H + 18, size: 7.5, font, color: rgb(1, 1, 1) });
    }

    // Signature count badge (right side)
    const countText = `${signatures.length} ${countSuffix}`;
    const ctW = boldFont.widthOfTextAtSize(countText, 10);
    page.drawText(countText, { x: PAGE_W - MR - ctW, y: PAGE_H - HEADER_H + 36, size: 10, font: boldFont, color: rgb(1, 1, 1) });

    // Doc ref (right, below count)
    if (docRef) {
      const refText = `Réf : ${docRef}`;
      const rfW = font.widthOfTextAtSize(refText, 8);
      page.drawText(refText, { x: PAGE_W - MR - rfW, y: PAGE_H - HEADER_H + 18, size: 8, font, color: rgb(1, 1, 1) });
    }

    // ── Footer bar
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: FOOTER_H, color: rgb(0.970, 0.980, 0.992) });
    page.drawLine({ start: { x: 0, y: FOOTER_H }, end: { x: PAGE_W, y: FOOTER_H }, thickness: 0.5, color: rgb(0.878, 0.902, 0.925) });
    const footerLeft = lang === "ar" ? "موثّق بواسطة Syndycat.ma" : "Document certifié — Syndycat.ma";
    page.drawText(footerLeft, { x: ML, y: 8, size: 7.5, font, color: rgb(0.576, 0.620, 0.659) });
    if (docRef) {
      const refLabel = `Réf : ${docRef}`;
      const rlW = font.widthOfTextAtSize(refLabel, 7.5);
      page.drawText(refLabel, { x: PAGE_W - MR - rlW, y: 8, size: 7.5, font, color: rgb(0.576, 0.620, 0.659) });
    }

    // Return Y cursor starting just below the header band
    return PAGE_H - HEADER_H - CARD_GAP;
  };

  let cursorY = newPage();

  // ─── Render each signature card ─────────────────────────────────────────────
  for (const sig of signatures) {
    const ch = cardHeight(sig);

    if (cursorY - ch < FOOTER_H + CARD_GAP) {
      cursorY = newPage();
    }

    const cardTop = cursorY;
    const cardBot = cursorY - ch;
    const isValid = sig.isValid !== false;

    // Card background (light slate)
    page.drawRectangle({
      x: ML, y: cardBot, width: CW, height: ch,
      color: rgb(0.972, 0.980, 0.992),
      borderColor: rgb(0.882, 0.902, 0.929),
      borderWidth: 0.8,
    });

    // Left accent bar
    page.drawRectangle({ x: ML, y: cardBot, width: 4, height: ch, color: accentRgb });

    // ── Text block ─────────────────────────────────────────────────────────
    const textX   = ML + 16;
    const nameY   = cardTop - CARD_PAD - 14;

    // Signer name (bold)
    const displayName = sig.signerName.length > 52 ? sig.signerName.slice(0, 49) + "..." : sig.signerName;
    page.drawText(displayName, { x: textX, y: nameY, size: 12, font: boldFont, color: rgb(0.122, 0.157, 0.235) });

    // Role
    const role = roleLabel(sig.signerRole, lang);
    page.drawText(role, { x: textX, y: nameY - 16, size: 9, font, color: rgb(0.392, 0.455, 0.545) });

    // Date
    const dateTxt = `${t("signedOnLabel", lang)} ${sig.signedAt.toLocaleString(dateLocale)}`;
    page.drawText(dateTxt, { x: textX, y: nameY - 30, size: 9, font, color: rgb(0.392, 0.455, 0.545) });

    // Validity badge (colored rectangle + text)
    const isValidLabel  = isValid ? t("signatureValidLabel", lang) : t("signatureInvalidLabel", lang);
    const badgeFg       = isValid ? rgb(0.047, 0.635, 0.271) : rgb(0.863, 0.149, 0.149);
    const badgeBg       = isValid ? rgb(0.875, 0.980, 0.906) : rgb(0.988, 0.898, 0.898);
    const badgeBorder   = isValid ? rgb(0.188, 0.831, 0.451) : rgb(0.988, 0.600, 0.600);
    const badgeW        = boldFont.widthOfTextAtSize(isValidLabel, 8) + 14;
    page.drawRectangle({ x: textX, y: nameY - 58, width: badgeW, height: 15, color: badgeBg, borderColor: badgeBorder, borderWidth: 0.6 });
    page.drawText(isValidLabel, { x: textX + 7, y: nameY - 51, size: 8, font: boldFont, color: badgeFg });

    // ── Handwritten signature area ──────────────────────────────────────────
    const paths = sig.signatureSvg ? extractSvgPaths(sig.signatureSvg) : [];

    if (paths.length > 0) {
      const sigAreaY = cardBot + CARD_PAD;
      const sigAreaX = textX;
      const sigAreaW = CW - 32;

      // White drawing box
      page.drawRectangle({
        x: sigAreaX, y: sigAreaY, width: sigAreaW, height: SIG_BOX_H,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.851, 0.871, 0.902),
        borderWidth: 0.8,
      });

      // "Tracé manuscrit" watermark label in the box
      page.drawText(traceLabel, { x: sigAreaX + 6, y: sigAreaY + 5, size: 6.5, font, color: rgb(0.729, 0.761, 0.796) });

      // Draw SVG paths — SignaturePad canvas ~320×160 → scale to fit
      const drawW   = sigAreaW - 16;
      const drawH   = SIG_BOX_H - 18;
      const scale   = Math.min(drawW / 320, drawH / 160);
      const originX = sigAreaX + 8;
      const originY = sigAreaY + 8 + 160 * scale; // pdf-lib y-up: translate origin to top-left of drawing area

      for (const d of paths) {
        try {
          page.drawSvgPath(d, { x: originX, y: originY, scale, borderColor: rgb(0.078, 0.122, 0.275), borderWidth: 1.6 });
        } catch { /* malformed path — skip */ }
      }
    } else if (sig.signatureSvg !== undefined) {
      // SVG provided but no drawable paths (empty pad)
      const noTraceY = cardBot + CARD_PAD + SIG_BOX_H / 2 + 4;
      page.drawRectangle({
        x: textX, y: cardBot + CARD_PAD, width: CW - 32, height: SIG_BOX_H,
        color: rgb(0.984, 0.988, 0.996),
        borderColor: rgb(0.878, 0.902, 0.925),
        borderWidth: 0.5,
      });
      const noTrace = t("noHandwrittenTrace", lang);
      const ntW = font.widthOfTextAtSize(noTrace, 8.5);
      page.drawText(noTrace, { x: textX + (CW - 32) / 2 - ntW / 2, y: noTraceY, size: 8.5, font, color: rgb(0.6, 0.635, 0.671) });
    }

    // Thin separator line below card
    page.drawLine({
      start: { x: ML + 4, y: cardBot - 6 },
      end:   { x: ML + CW - 4, y: cardBot - 6 },
      thickness: 0.4,
      color: rgb(0.878, 0.902, 0.925),
    });

    cursorY = cardBot - CARD_GAP;
  }

  const outBytes = await pdfDoc.save();
  await overwritePdfBuffer(internalPath, Buffer.from(outBytes));
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
  // ── 11 enterprise templates ──────────────────────────
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
  | "reglement"
  // ── 3 smart certificate templates (auto-fills DB) ────
  | "attestation_residence"
  | "attestation_propriete"
  | "attestation_paiement"
  // ── 6 financial & election templates (entity-driven) ─
  | "appel_de_fonds"
  | "recu_paiement"
  | "facture"
  | "budget_previsionnel"
  | "decompte_charges"
  | "rapport_election"
  // ── 3 operational templates (entity-driven) ──────────────
  | "contrat_bail"
  | "sinistre"
  | "travaux";

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
  attestation_residence: "ATT-RES",
  attestation_propriete: "ATT-PRO",
  attestation_paiement:  "ATT-PAI",
  appel_de_fonds:        "ADF",
  recu_paiement:         "REC",
  facture:               "FAC",
  budget_previsionnel:   "BUD",
  decompte_charges:      "DEC-CH",
  rapport_election:      "ELEC",
  contrat_bail:          "BAIL",
  sinistre:              "SIN",
  travaux:               "TRX",
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
  /** Bank name for payment instructions (e.g. CIH, Attijariwafa). */
  bankName?: string | null;
  /** IBAN for wire transfers — shown on payment demands, invoices, and legal enforcement letters. */
  bankIban?: string | null;
  /** BIC/SWIFT code for the syndicate's bank account. */
  bankBic?: string | null;
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
  /** Document lifecycle status — used to add watermark and status badge */
  docStatus?: string;
  /** Document version string shown in the header band, e.g. "v1.0", "v2.3" */
  version?: string | null;
  /** Real residence/co-ownership data, fetched from buildingsTable + lotsTable. */
  property?: PropertyInfo;
  /** Real office-holder identities, fetched from conseilSyndicalTable. */
  officeHolders?: OfficeHolders;
  /** Output language — defaults to "fr". Full body-prose translation covers "reglement",
   *  "attestation", "pv", "convocation", "certificat" and "mise_en_demeure"; other templates'
   *  shared chrome (header/meta labels/signature/footer/QR) is translated, but body prose
   *  stays French — disclosed in DOCUMENT_MODULE_REVIEW. */
  language?: DocumentLanguage;
  /** Real, environment-portable public verification URL for the QR code + footer note,
   *  built by the caller from documentsTable.verificationToken. Falls back to a
   *  documentNumber-based QR payload when absent (no domain available). */
  verificationUrl?: string;
  /** Real signatures already recorded for this document (from documentSignaturesTable),
   *  used to render actual signer name/role/date/validity in the primary signature block. */
  signatures?: InlineSignatureInfo[];
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
    logoColor: BRAND.primary,
  };
  // ── Category-based visual identity — 7 distinct document themes ──────────────
  const theme = getDocumentTheme(template, syndInfo.logoColor || undefined);
  const accentColor = theme.primary;
  const docNum = input.documentNumber ?? `${template.toUpperCase()}-${Date.now()}`;
  const member = input.memberName ?? "";
  const body = input.content ?? "";
  const styles = buildStyles(accentColor);
  const lang: DocumentLanguage = (input.language as DocumentLanguage) ?? "fr";
  const isArabic = lang === "ar";
  const verifyUrl = input.verificationUrl as string | undefined;
  const signatures = (input.signatures as InlineSignatureInfo[] | undefined) ?? [];

  // QR code + logo — both non-blocking / best-effort. Points at the real public
  // verification URL when available; otherwise falls back to encoding the bare
  // document number so the QR still communicates a reference.
  const [qrDataUrl, logoDataUrl] = await Promise.all([
    generateQrDataUrl(verifyUrl || docNum),
    fetchLogoDataUrl(syndInfo.logoUrl),
  ]);

  // Building name for header — from property info (primary building)
  const buildingName = (input.property as PropertyInfo | undefined)?.name ?? null;

  // Document version — explicit field or default
  const version = (input.version as string | null | undefined) ?? "v1.0";

  // ── Elegant diagonal watermark — very low opacity, non-intrusive ────────────
  const watermark =
    !input.docStatus || input.docStatus === "draft"
      ? { text: "BROUILLON", opacity: 0.04, bold: true, color: accentColor, angle: 45 }
      : input.docStatus === "generated"
      ? { text: "SPECIMEN", opacity: 0.04, bold: true, color: accentColor, angle: 45 }
      : undefined;

  // ── A4 page layout — tighter margins maximize usable content area (P7) ──────
  const pageSetup = {
    pageSize: "A4" as const,
    pageMargins: [40, 22, 40, 58] as [number, number, number, number],
  };

  // ── Enterprise footer ────────────────────────────────────────────────────────
  // Layout: 3-column strip below a hairline rule.
  //   LEFT  — syndicate name (bold) + Réf. + date + verify URL
  //   CENTER — status chip (semantic color) + "Document certifié Syndycat.ma"
  //   RIGHT  — page N / M (prominent) + SYNDYCAT GLOBAL CPS brand mark
  // No duplicate QR — QR code lives in the header only.
  const docStatus = input.docStatus as string | null ?? null;
  const statusBadgeMap: Record<string, { label: string; color: string }> = {
    published:      { label: "PUBLIÉ",      color: BRAND.successDark },
    signed:         { label: "SIGNÉ",       color: BRAND.primaryDark },
    validated:      { label: "VALIDÉ",      color: BRAND.primary },
    archived:       { label: "ARCHIVÉ",     color: BRAND.muted },
    generated:      { label: "GÉNÉRÉ",      color: BRAND.warningDark },
    draft:          { label: "BROUILLON",   color: BRAND.mutedLight },
    pending_review: { label: "EN RÉVISION", color: BRAND.warning },
    rejected:       { label: "REJETÉ",      color: BRAND.destructiveDark },
  };
  const footerStatus = docStatus ? (statusBadgeMap[docStatus] ?? null) : null;

  const footer = (page: number, pages: number) => ({
    stack: [
      // Hairline rule (full bleed including margins)
      {
        canvas: [
          { type: "line", x1: 40, y1: 0, x2: 555, y2: 0, lineWidth: 0.4, lineColor: BRAND.border },
          // 28pt accent stripe — anchors the footer's left edge
          { type: "rect", x: 40, y: 0, w: 28, h: 1.5, color: accentColor },
        ],
        margin: [0, 0, 0, 0],
      },
      {
        columns: [
          // LEFT — document identity
          {
            stack: [
              { text: syndInfo.name, fontSize: 6.5, bold: true, color: BRAND.ink, margin: [0, 0, 0, 1] },
              { text: `Réf. ${docNum}   ·   ${today}`, fontSize: 5.5, color: BRAND.mutedLight },
              ...(verifyUrl ? [{ text: verifyUrl, fontSize: 5, color: accentColor, margin: [0, 1, 0, 0] }] : []),
            ],
            width: "*",
            margin: [40, 5, 0, 4],
          },
          // CENTER — certification status
          {
            stack: [
              ...(footerStatus ? [{
                text: `● ${footerStatus.label}`,
                fontSize: 6, bold: true,
                color: footerStatus.color,
                alignment: "center" as const,
                margin: [0, 0, 0, 2],
              }] : []),
              {
                text: "Document certifié — Syndycat.ma",
                fontSize: 5.5, color: BRAND.mutedLight,
                alignment: "center" as const,
              },
            ],
            width: 110,
            margin: [0, 5, 0, 4],
          },
          // RIGHT — page number + brand
          {
            stack: [
              { text: `${page}  /  ${pages}`, fontSize: 9, bold: true, color: BRAND.ink, alignment: "right" as const, margin: [0, 0, 0, 1] },
              { text: "SYNDYCAT GLOBAL CPS", fontSize: 5.5, bold: true, color: accentColor, alignment: "right" as const, characterSpacing: 0.3 },
            ],
            width: 130,
            margin: [0, 4, 40, 4],
          },
        ],
      },
    ],
  });

  const header = buildHeaderBand(syndInfo, getDocTypeLabel(template, lang), docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, version, input.docStatus as string | null ?? null, theme.icon);

  // ── Template content ────────────────────────────────────────────────────────

  let content: unknown[];

  // ── Page-layout overrides (set per-template for non-standard families) ───────
  let pageMarginOverride: [number, number, number, number] | null = null;
  let backgroundFn: ((currentPage: number, pageSize: { width: number; height: number }) => unknown) | null = null;
  let footerFn: ((page: number, pages: number) => unknown) | null = footer;

  switch (template) {
    case "attestation": {
      // ── DB-injected member + lot fields (from getLotMemberData) ───────────
      const attMemberName   = member || (input._memberRef ? "—" : t("notRenseigne", lang));
      const attMemberRef    = (input._memberRef        as string) || "";   // ADH-XXXXXXXX = membership number
      const attMemberEmail  = (input._memberEmail      as string) || "";
      const attMemberPhone  = (input._memberPhone      as string) || "";
      const attMemberCIN    = (input._memberCIN        as string) || "";
      const attJoinDate     = (input._memberJoinDate   as string) || "";
      const attStatus       = (input._memberStatus     as string) || "active";
      const attCotisation   = (input._memberCotisation as string) || "";
      const attLotNum       = (input._lotNumber        as string) || "";
      const attLotFloor     = (input._lotFloor         as string) || "";
      const attLotSurface   = (input._lotSurface       as string) || "";
      const attBuilding     = (input._buildingName     as string) || (input.property as PropertyInfo | undefined)?.name || "";
      const attBuildAddr    = (input._buildingAddress  as string) || [syndInfo.address, syndInfo.city].filter(Boolean).join(", ");
      const attOffice       = input.officeHolders as OfficeHolders | undefined;

      const attLite = adjustColorBrightness(accentColor, 92);
      const attDark = adjustColorBrightness(accentColor, -30);

      // ── Computed display values ─────────────────────────────────────────────
      const attFloorLabel = attLotFloor === "" ? "—"
        : attLotFloor === "0" ? "Rez-de-chaussée"
        : `Étage ${attLotFloor}`;

      const attDocStatus = (input.docStatus as string) || "generated";
      const attDocStatusMap: Record<string, { label: string; color: string }> = {
        signed:    { label: "SIGNÉ",     color: BRAND.primary },
        validated: { label: "VALIDÉ",    color: BRAND.info },
        published: { label: "PUBLIÉ",    color: BRAND.successDark },
        archived:  { label: "ARCHIVÉ",   color: BRAND.muted },
        generated: { label: "GÉNÉRÉ",    color: BRAND.warningDark },
        draft:     { label: "BROUILLON", color: BRAND.mutedLight },
      };
      const attDocStatusInfo = attDocStatusMap[attDocStatus] ?? { label: attDocStatus.toUpperCase(), color: BRAND.muted };

      const attStatusLabel = attStatus === "active"   ? "MEMBRE ACTIF"
                           : attStatus === "inactive" ? "INACTIF"
                           : attStatus.toUpperCase();
      const attStatusColor  = attStatus === "active"   ? BRAND.successDark
                            : attStatus === "inactive" ? BRAND.destructiveDark : BRAND.muted;
      const attStatusBg     = attStatus === "active"   ? BRAND.successLight
                            : attStatus === "inactive" ? BRAND.destructiveLight : BRAND.surface;
      const attStatusBorder = attStatus === "active"   ? BRAND.success
                            : attStatus === "inactive" ? BRAND.destructive : BRAND.border;

      // ── Extra property fields ──────────────────────────────────────────────
      const attLotQuotePart = (input._lotQuotePart   as string) || (input._lotShareValue as string) || "";
      const attLotUsage     = (input._lotUsage       as string) || "Habitation principale";

      // ── Signature helpers ──────────────────────────────────────────────────
      const findAttSig = (roles: string[]) => signatures.find((s) => roles.some((r) => s.signerRole === r));
      const attPresidentSig = findAttSig(["president", "syndicate_admin", "super_admin"]);
      // SVG circular gold stamp — matches reference ornate seal
      const attSealSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 95 95">
        <circle cx="47.5" cy="47.5" r="46"   fill="#FFF8E8"/>
        <circle cx="47.5" cy="47.5" r="45.5" fill="none" stroke="#C4963A" stroke-width="2.5"/>
        <circle cx="47.5" cy="47.5" r="41"   fill="none" stroke="#C4963A" stroke-width="0.4" stroke-dasharray="2 2"/>
        <circle cx="47.5" cy="47.5" r="37.5" fill="none" stroke="#C4963A" stroke-width="0.7"/>
        <defs>
          <path id="att_ta" d="M11.5,47.5 A36,36 0 0,1 83.5,47.5"/>
          <path id="att_ba" d="M9,53   A38.5,38.5 0 0,0 86,53"/>
        </defs>
        <text font-family="Helvetica,Arial,sans-serif" font-size="7.5" font-weight="bold" fill="#C4963A" letter-spacing="3">
          <textPath xlink:href="#att_ta" href="#att_ta" startOffset="50%" text-anchor="middle">SYNDICAT</textPath>
        </text>
        <text x="15"  y="53" font-family="Helvetica,Arial" font-size="8"   fill="#C4963A" text-anchor="middle">★</text>
        <text x="80"  y="53" font-family="Helvetica,Arial" font-size="8"   fill="#C4963A" text-anchor="middle">★</text>
        <text x="19"  y="63" font-family="Helvetica,Arial" font-size="5.5" fill="#C4963A" text-anchor="middle">★</text>
        <text x="76"  y="63" font-family="Helvetica,Arial" font-size="5.5" fill="#C4963A" text-anchor="middle">★</text>
        <polygon points="47.5,26 61,36 34,36" fill="#C4963A"/>
        <rect x="35" y="36" width="25" height="18" fill="none" stroke="#C4963A" stroke-width="1.3"/>
        <rect x="38" y="39" width="5"  height="4" fill="#C4963A" opacity="0.75"/>
        <rect x="45" y="39" width="5"  height="4" fill="#C4963A" opacity="0.75"/>
        <rect x="52" y="39" width="4"  height="4" fill="#C4963A" opacity="0.75"/>
        <rect x="43" y="45" width="10" height="9" fill="#C4963A" opacity="0.55"/>
        <text font-family="Helvetica,Arial,sans-serif" font-size="5.8" font-weight="bold" fill="#C4963A" letter-spacing="1.2">
          <textPath xlink:href="#att_ba" href="#att_ba" startOffset="50%" text-anchor="middle">COPROPRIÉTAIRE</textPath>
        </text>
      </svg>`;
      const attSeal = { svg: attSealSvg, width: 90, height: 90 };

      // ── 1. Certificate white header ─────────────────────────────────────────
      // Cap to 2 words max so the first column never wraps beyond 1 line
      const hdrSyndName = (syndInfo.name || "SYNDICARE")
        .trim().split(/\s+/).slice(0, 2).join(" ").toUpperCase();

      const certHdr: unknown = {
        table: {
          widths: [140, 1, "*", 108],
          body: [[
            // Logo block: icon + compact name (≤2 words) + sub-label
            {
              columns: [
                {
                  text: "⌂",
                  fontSize: 18, bold: true, color: BRAND.certNavy,
                  width: 22, margin: [0, 1, 0, 0],
                },
                {
                  stack: [
                    { text: hdrSyndName, fontSize: 9, bold: true, color: BRAND.certNavy, characterSpacing: 0.2, lineHeight: 1.15 },
                    { text: "SYNDICATE MANAGEMENT", fontSize: 5, bold: true, color: BRAND.certGold, characterSpacing: 0.8 },
                  ],
                  width: "*", margin: [4, 0, 0, 0],
                },
              ],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 8, 8, 8],
            },
            // Vertical separator
            {
              canvas: [{ type: "line", x1: 0.5, y1: 4, x2: 0.5, y2: 32, lineWidth: 0.7, lineColor: BRAND.border }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            // Center tagline
            {
              stack: [
                { text: "PLATEFORME DE GESTION", fontSize: 7.5, bold: true, color: BRAND.certNavy, characterSpacing: 0.3 },
                { text: "DE SYNDICAT EN LIGNE", fontSize: 7.5, bold: true, color: BRAND.certNavy, characterSpacing: 0.3 },
              ],
              alignment: "center" as const,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [12, 10, 12, 8],
            },
            // Right: security badge
            {
              stack: [
                { text: "◉  SÉCURISÉ. CERTIFIÉ.", fontSize: 6, bold: true, color: BRAND.certNavy, alignment: "right" as const },
                { text: "CONFORME.", fontSize: 6, bold: true, color: BRAND.certNavy, alignment: "right" as const },
              ],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 10, 0, 0],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 0],
      };

      // Navy rule under header
      const certHeaderRule: unknown = {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: BRAND.certNavy }],
        margin: [0, 0, 0, 12],
      };

      // ── 2. Big certificate title ────────────────────────────────────────────
      const bigCertTitle: unknown = {
        stack: [
          {
            text: "ATTESTATION D'ADHÉSION",
            fontSize: 25, bold: true, color: BRAND.certNavy,
            alignment: "center" as const, characterSpacing: 1.5,
            margin: [0, 0, 0, 8],
          },
          {
            columns: [
              {
                canvas: [{ type: "line", x1: 0, y1: 1, x2: 200, y2: 1, lineWidth: 0.9, lineColor: BRAND.certGold }],
                width: 208, margin: [0, 4, 0, 0],
              },
              { text: "⌂", fontSize: 11, bold: true, color: BRAND.certGold, width: "auto" as const, alignment: "center" as const },
              {
                canvas: [{ type: "line", x1: 0, y1: 1, x2: 200, y2: 1, lineWidth: 0.9, lineColor: BRAND.certGold }],
                width: 208, margin: [0, 4, 0, 0],
              },
            ],
            columnGap: 6,
            margin: [0, 0, 0, 6],
          },
          {
            text: "CERTIFICAT OFFICIEL DE MEMBRE DU SYNDICAT",
            fontSize: 8.5, bold: true, color: BRAND.certNavy,
            alignment: "center" as const, characterSpacing: 1.2,
          },
        ],
        margin: [0, 0, 0, 14],
      };

      // ── 3. Member profile card — 3 columns ─────────────────────────────────
      // [photo placeholder | name + contact rows | ref + status badge + date]
      const attNameParts = attMemberName.trim().split(/\s+/).filter(Boolean);
      const attInitials  = ((attNameParts[0]?.[0] ?? "M") + (attNameParts[1]?.[0] ?? "")).toUpperCase();

      // Photo area: grey rect + initials overlay (88×88, centred initials)
      const photoCell: unknown = {
        stack: [
          { canvas: [{ type: "rect", x: 0, y: 0, w: 86, h: 86, color: "#E5EAF3" }], margin: [0, 0, 0, -86] },
          {
            text: attInitials, fontSize: 26, bold: true, color: BRAND.certNavy,
            alignment: "center" as const,
            margin: [0, 28, 0, 0],
          },
        ],
      };

      // Icon + label + value contact row
      const attContactRow = (icon: string, label: string, value: string): unknown => ({
        columns: [
          { text: icon, fontSize: 9, color: BRAND.certNavy, width: 16, margin: [0, 1, 0, 0] },
          {
            stack: [
              { text: label, fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.4, margin: [0, 0, 0, 1] },
              { text: value || "—", fontSize: 8.5, color: BRAND.ink },
            ],
            width: "*",
          },
        ],
        margin: [0, 0, 0, 6],
      });

      // Green pill status badge: "✓ MEMBRE ACTIF"
      const attMemberStatusBadge: unknown = {
        table: {
          widths: ["auto"],
          body: [[{
            text: `✓ ${attStatusLabel}`,
            fontSize: 8, bold: true, color: attStatusColor,
            fillColor: attStatusBg,
            margin: [10, 4, 10, 4],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 1 : 0,
          vLineWidth: (i: number, n: { table: { widths: unknown[] } }) => i === 0 || i === n.table.widths.length ? 1 : 0,
          hLineColor: () => attStatusBorder,
          vLineColor: () => attStatusBorder,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 4, 0, 8],
      };

      const memberCard: unknown = {
        table: {
          widths: [108, "*", 152],
          body: [[
            // Col 1: Photo
            {
              stack: [photoCell],
              fillColor: BRAND.surface,
              border: [true, true, false, true] as [boolean, boolean, boolean, boolean],
              margin: [12, 12, 8, 12],
            },
            // Col 2: Name + contact rows
            {
              stack: [
                {
                  text: attMemberName,
                  fontSize: 14, bold: true, color: BRAND.certNavy,
                  margin: [0, 0, 0, 10],
                },
                ...(attStatus ? [attContactRow("◉", "STATUT", attStatusLabel)] : []),
                ...(attMemberEmail ? [attContactRow("✉", "EMAIL", attMemberEmail)] : []),
                ...(attMemberPhone ? [attContactRow("☎", "TÉLÉPHONE", attMemberPhone)] : []),
                ...(attMemberCIN   ? [attContactRow("▣", "CIN", attMemberCIN)] : []),
              ],
              fillColor: BRAND.surfaceCard,
              border: [false, true, false, true] as [boolean, boolean, boolean, boolean],
              margin: [12, 12, 12, 12],
            },
            // Col 3: Reference + status badge + join date
            {
              stack: [
                { text: "RÉFÉRENCE MEMBRE", fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.4, margin: [0, 0, 0, 2] },
                { text: attMemberRef || docNum, fontSize: 10.5, bold: true, color: BRAND.certNavy, margin: [0, 0, 0, 9] },
                { text: "STATUT D'ADHÉSION", fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.4, margin: [0, 0, 0, 2] },
                attMemberStatusBadge,
                { text: "DATE D'ADHÉSION", fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.4, margin: [0, 0, 0, 2] },
                { text: `⊞  ${attJoinDate || today}`, fontSize: 9.5, bold: true, color: BRAND.certNavy },
              ],
              fillColor: BRAND.surfaceCard,
              border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
              margin: [12, 12, 12, 12],
            },
          ]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.7 : 0,
          vLineWidth: (i: number) => i === 0 || i === 3 ? 0.7 : 0,
          hLineColor: () => BRAND.border,
          vLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 10],
      };

      // ── 4. Property info card — 2 columns ──────────────────────────────────
      // Left: gold circle icon + "RÉSIDENCE PRINCIPALE" + address
      // Right: gold circle icon + "INFORMATIONS DE LA PROPRIÉTÉ" + data rows
      // Gold circle icon: fixed-height canvas + text lifted into it via negative margin
      const goldCircleIcon = (inner: string): unknown => ({
        stack: [
          {
            canvas: [{ type: "ellipse", x: 16, y: 16, r1: 16, r2: 16, color: "#F5EDD6", lineColor: BRAND.certGold, lineWidth: 1.5 }],
            margin: [0, 0, 0, -32],   // canvas height = 2*r = 32; pull next element up
          },
          {
            text: inner, fontSize: 13, color: BRAND.certGold, bold: true,
            alignment: "center" as const, margin: [0, 10, 0, 0],
          },
        ],
        width: 34,
        margin: [0, 0, 0, 0],
      });

      const propInfoRow = (label: string, value: string): unknown => ({
        columns: [
          { text: label, fontSize: 7.5, color: BRAND.muted, width: 80 },
          { text: value || "—", fontSize: 7.5, bold: true, color: BRAND.ink, width: "*" },
        ],
        margin: [0, 0, 0, 3],
      });

      const propertyCard: unknown = {
        table: {
          widths: ["*", "*"],
          body: [[
            // Left: Résidence principale
            {
              columns: [
                goldCircleIcon("⌂") as object,
                {
                  stack: [
                    { text: "RÉSIDENCE PRINCIPALE", fontSize: 6.5, bold: true, color: BRAND.certNavy, characterSpacing: 0.4, margin: [0, 0, 0, 5] },
                    { text: attBuilding || syndInfo.name || "—", fontSize: 8.5, bold: true, color: BRAND.ink, margin: [0, 0, 0, 2] },
                    ...(attBuildAddr ? [{ text: attBuildAddr, fontSize: 7.5, color: BRAND.inkLight, lineHeight: 1.4 }] : []),
                  ],
                  width: "*", margin: [8, 0, 0, 0],
                },
              ],
              border: [true, true, false, true] as [boolean, boolean, boolean, boolean],
              margin: [14, 14, 14, 14],
            },
            // Right: property info
            {
              columns: [
                goldCircleIcon("≡") as object,
                {
                  stack: [
                    { text: "INFORMATIONS DE LA PROPRIÉTÉ", fontSize: 6.5, bold: true, color: BRAND.certNavy, characterSpacing: 0.4, margin: [0, 0, 0, 6] },
                    ...(attLotNum       ? [propInfoRow("Lots détenus", `Lot n° ${attLotNum}`) as object] : []),
                    ...(attLotQuotePart ? [propInfoRow("Quote-part",   attLotQuotePart) as object] : []),
                    propInfoRow("Usage", attLotUsage) as object,
                    ...(attLotSurface  ? [propInfoRow("Surface",       `${attLotSurface} m²`) as object] : []),
                  ],
                  width: "*", margin: [8, 0, 0, 0],
                },
              ],
              border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
              margin: [14, 14, 14, 14],
            },
          ]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.7 : 0,
          vLineWidth: (i: number) => i === 0 || i === 2 ? 0.7 : 0,
          hLineColor: () => BRAND.border,
          vLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 10],
      };

      // ── 5. Certification paragraph (centered, matches reference image) ──────
      const certParagraph: unknown = {
        text: [
          `Le présent document certifie que le bénéficiaire mentionné ci-dessus\n`,
          `est officiellement enregistré en tant que membre du syndicat de copropriétaires\n`,
          `de la résidence indiquée, conformément aux dispositions légales et réglementaires en vigueur.`,
        ],
        fontSize: 8.5, color: BRAND.inkMid,
        alignment: "center" as const, lineHeight: 1.65,
        margin: [20, 0, 20, 14],
      };

      // ── 6. Footer: signature | gold seal | QR + verify ─────────────────────
      const attHasSigTrace = isSvgData(attPresidentSig?.signatureData);
      const attSigDate     = attPresidentSig?.signedAt.toLocaleDateString("fr-FR") ?? today;
      const attSignerName  = attOffice?.president?.fullName || attPresidentSig?.signerName || syndInfo.name;

      const sigColumn: unknown = {
        stack: [
          // Signature trace or empty line
          ...(attHasSigTrace
            ? [{ svg: attPresidentSig!.signatureData!, width: 120, height: 44, alignment: "left" as const }]
            : [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 145, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }], margin: [0, 28, 0, 0] }]
          ),
          { text: "Le Syndic", fontSize: 8.5, bold: true, color: BRAND.ink, margin: [0, 6, 0, 1] },
          { text: attSignerName, fontSize: 7.5, color: BRAND.inkLight, margin: [0, 0, 0, 1] },
          { text: attSigDate,    fontSize: 7.5, color: BRAND.inkLight },
        ],
        width: "*",
      };

      const sealColumn: unknown = {
        stack: [attSeal],
        width: 95,
        alignment: "center" as const,
        margin: [0, 0, 0, 0],
      };

      const attVerifyId = `VER-${today.replace(/\//g, "")}-${(docNum || attMemberRef || "ABCD").split("-").pop()}`;
      const qrColumn: unknown = {
        stack: [
          { text: "VÉRIFICATION NUMÉRIQUE", fontSize: 7, bold: true, color: BRAND.certNavy, characterSpacing: 0.5, margin: [0, 0, 0, 6] },
          ...(qrDataUrl
            ? [{ image: qrDataUrl, width: 60, height: 60, margin: [0, 0, 0, 6] }]
            : [{ canvas: [{ type: "rect", x: 0, y: 0, w: 60, h: 60, color: BRAND.surface }], margin: [0, 0, 0, 6] }]
          ),
          { text: "Scannez ce QR code pour\nvérifier l'authenticité de\nce certificat.", fontSize: 6.5, color: BRAND.muted, lineHeight: 1.4, margin: [0, 0, 0, 4] },
          { text: "ID de vérification :", fontSize: 6, color: BRAND.muted, margin: [0, 0, 0, 2] },
          { text: attVerifyId, fontSize: 6.5, bold: true, color: BRAND.certNavy },
        ],
        width: 130,
      };

      const certFooterRow: unknown = {
        columns: [sigColumn, { text: "", width: 6 }, sealColumn, { text: "", width: 6 }, qrColumn],
        margin: [0, 0, 0, 10],
      };

      // ── 7. eIDAS disclaimer ────────────────────────────────────────────────
      const eidasNote: unknown = {
        stack: [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }], margin: [0, 0, 0, 6] },
          { text: "Ce certificat est émis électroniquement et est valable sans signature manuscrite.", fontSize: 6.5, color: BRAND.muted, alignment: "center" as const },
          { text: "Conformément au règlement européen eIDAS (UE) n°910/2014.", fontSize: 6.5, color: BRAND.muted, alignment: "center" as const },
        ],
      };

      content = [
        certHdr,
        certHeaderRule,
        bigCertTitle,
        memberCard,
        propertyCard,
        certParagraph,
        certFooterRow,
        eidasNote,
      ];
      break;
    }

    case "pv": {
      // ── Parse structured resolution data from DB ───────────────────────────
      type ResolutionCard = { number: number; title: string; description: string; result: string; pour: number | null; contre: number | null; abstention: number | null };
      let structuredResolutions: ResolutionCard[] = [];
      const rawResJson = input._resolutionsJson as string | undefined;
      if (rawResJson) {
        try { structuredResolutions = JSON.parse(rawResJson); } catch { /* fall back to text */ }
      }
      const attendeesCount = (input._attendeesCount as string) || "0";
      const attendeesList = (input.participants as string) || "";
      const hasResolutions = structuredResolutions.length > 0;

      const resolutionCards: unknown[] = hasResolutions ? structuredResolutions.map((r) => {
        const adopted  = r.result === "approved";
        const rejected = r.result === "rejected";
        const badgeColor = adopted ? BRAND.successDark : rejected ? BRAND.destructiveDark : BRAND.warningDark;
        const badgeBg    = adopted ? BRAND.successLight : rejected ? BRAND.destructiveLight : BRAND.warningLight;
        const badgeText  = adopted ? "✓ ADOPTÉ" : rejected ? "✗ REJETÉ" : "⏳ EN ATTENTE";
        const hasTally   = r.pour != null || r.contre != null || r.abstention != null;
        return {
          stack: [
            {
              columns: [
                { text: `Résolution ${r.number}`, fontSize: 8.5, bold: true, color: accentColor, width: "*", margin: [0, 0, 0, 2] },
                { text: badgeText, fontSize: 7.5, bold: true, color: badgeColor, fillColor: badgeBg, margin: [6, 1, 6, 1], alignment: "right" as const, width: "auto" },
              ],
              margin: [0, 0, 0, 3],
            },
            { text: r.title, fontSize: 9.5, bold: true, color: BRAND.ink, margin: [0, 0, 0, 2] },
            ...(r.description ? [{ text: r.description, fontSize: 9, color: BRAND.inkMid, lineHeight: 1.5, margin: [0, 0, 0, 3] }] : []),
            ...(hasTally ? [{
              text: [
                { text: `Pour : ${r.pour ?? "—"} `, fontSize: 8, color: BRAND.successDark, bold: true },
                { text: `  Contre : ${r.contre ?? "—"} `, fontSize: 8, color: BRAND.destructiveDark, bold: true },
                { text: `  Abstention : ${r.abstention ?? "—"}`, fontSize: 8, color: BRAND.muted, bold: true },
              ],
              margin: [0, 0, 0, 0],
            }] : []),
          ],
          fillColor: BRAND.surfaceAlt,
          margin: [0, 0, 0, 6],
          // pdfmake doesn't support per-stack border — render as table row
        };
      }) : [];

      const resolutionsContent: unknown = hasResolutions ? {
        stack: [
          {
            canvas: [
              { type: "rect", x: 0, y: 0, w: 515, h: 20, color: accentColor },
            ],
            margin: [0, 0, 0, 0],
          },
          { text: "RÉSOLUTIONS ADOPTÉES", fontSize: 8.5, bold: true, color: BRAND.surfaceCard, margin: [0, -17, 0, 10] },
          ...resolutionCards.map((card) => ({
            table: {
              widths: ["*"],
              body: [[{ ...(card as object), border: [true, true, true, true] as [boolean, boolean, boolean, boolean], borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border] }]],
            },
            layout: {
              hLineWidth: () => 0.6, vLineWidth: () => 0.6,
              hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
              fillColor: () => BRAND.surfaceAlt,
              paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 8, paddingBottom: () => 8,
            },
            margin: [0, 0, 0, 6],
          })),
        ],
        margin: [0, 0, 0, 16],
      } : contentSection(t("pvResolutionsTitle", lang), input.resolutionsText as string || t("pvResolutionsText", lang), accentColor, isArabic);

      content = [
        ...header,
        buildMeetingBanner(accentColor, input.meetingType as string || input._meetingType as string || "ASSEMBLÉE GÉNÉRALE", input.lieu as string, today, lang),
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaMeetingDate", lang), (input.meetingDate as string) || today],
          [t("metaSyndicate", lang), syndInfo.name],
          [t("metaLocation", lang), input.lieu as string || t("metaSeatOfSyndicate", lang)],
          [t("metaChairperson", lang), input.president as string || (input.officeHolders as OfficeHolders | undefined)?.president?.fullName || syndInfo.name],
          [t("metaSecretarySession", lang), input.secretaire as string || (input.officeHolders as OfficeHolders | undefined)?.secretary?.fullName || "—"],
        ], accentColor),
        // Attendance summary — shows count chip + names when available
        ...(attendeesCount !== "0" ? [kpiRow([
          { label: "Membres présents", value: attendeesCount, bgColor: BRAND.successLight, valueColor: BRAND.successDeep },
          { label: "Résolutions soumises", value: String(structuredResolutions.length || "—"), bgColor: BRAND.surface },
          { label: "Résolutions adoptées", value: String(structuredResolutions.filter(r => r.result === "approved").length || "—"), bgColor: BRAND.successLight, valueColor: BRAND.successDeep },
        ], accentColor)] : []),
        ...(attendeesList ? [contentSection("MEMBRES PRÉSENTS", attendeesList, accentColor, isArabic)] : []),
        contentSection(t("pvAgendaTitle", lang), input.agendaText as string || body || t("pvAgendaText", lang), accentColor, isArabic),
        contentSection(t("pvDeliberationsTitle", lang), input.deliberationsText as string || t("pvDeliberationsText", lang), accentColor, isArabic),
        resolutionsContent,
        { text: "\n" },
        multiSignatoryBlock(input.officeHolders as OfficeHolders | undefined, accentColor, lang, signatures, syndInfo.name),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    case "convocation":
      content = [
        ...header,
        buildMeetingBanner(accentColor, input.meetingType as string || "ASSEMBLÉE GÉNÉRALE", input.lieu as string, input.meetingDate as string || today, lang),
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaRecipient", lang), member || t("convocationRecipientFallback", lang)],
          ...(input._lotNumber    ? [["Lot N\u00b0 :",   input._lotNumber    as string] as [string, string]] : []),
          ...(input._buildingName ? [["R\u00e9sidence :", input._buildingName as string] as [string, string]] : []),
          [t("metaSender", lang), syndInfo.name],
          [t("metaSendDate", lang), today],
          [t("metaObjet", lang), input.title],
          [t("metaMeetingDate", lang), input.meetingDate as string || "—"],
          [t("metaLocation", lang), input.lieu as string || t("metaSeatOfSyndicate", lang)],
          [t("metaTime", lang), input.heure as string || "—"],
        ], accentColor),
        contentSection(t("convocationObjetTitle", lang), body || fmt(t("convocationBody", lang), { syndicate: syndInfo.name }), accentColor, isArabic),
        {
          table: {
            widths: ["*"],
            body: [[{
              text: t("convocationNotice", lang),
              style: "notice",
              fillColor: BRAND.warningLight,
              margin: [10, 8, 10, 8],
            }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => BRAND.warning,
            vLineColor: () => BRAND.warning,
          },
          margin: [0, 0, 0, 16],
        },
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
        // ── Détachable vote-proxy slip ──────────────────────────────────────────
        // Dashed cut line
        {
          canvas: [
            { type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.6, dash: { length: 3, space: 4 }, lineColor: BRAND.border },
          ],
          margin: [0, 24, 0, 8],
        },
        { text: "✂  COUPON-RÉPONSE / POUVOIR — À RETOURNER AU BUREAU DU SYNDICAT AVANT LA RÉUNION", fontSize: 7, color: BRAND.mutedLight, alignment: "center" as const, margin: [0, 0, 0, 10] },
        {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: "POUVOIR EN BLANC", fontSize: 9.5, bold: true, color: accentColor, margin: [0, 0, 0, 8] },
                {
                  columns: [
                    { text: "Je soussigné(e) :", fontSize: 8.5, color: BRAND.inkMid, width: 100 },
                    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 280, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }], width: "*", margin: [0, 5, 0, 0] },
                  ],
                  margin: [0, 0, 0, 6],
                },
                {
                  columns: [
                    { text: "Copropriétaire du Lot N° :", fontSize: 8.5, color: BRAND.inkMid, width: 140 },
                    { text: (input._lotNumber as string) || "________", fontSize: 8.5, bold: true, color: BRAND.ink, width: "auto" },
                    { text: "  Résidence :", fontSize: 8.5, color: BRAND.inkMid, width: "auto" },
                    { text: (input._buildingName as string) || "________", fontSize: 8.5, bold: true, color: BRAND.ink, width: "*" },
                  ],
                  margin: [0, 0, 0, 6],
                },
                {
                  text: "Déclare :  ☐ Être présent(e)   ☐ Donner pouvoir à :",
                  fontSize: 8.5, color: BRAND.inkMid, margin: [0, 0, 0, 6],
                },
                {
                  columns: [
                    { text: "Nom du mandataire :", fontSize: 8.5, color: BRAND.inkMid, width: 120 },
                    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 260, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }], width: "*", margin: [0, 5, 0, 0] },
                  ],
                  margin: [0, 0, 0, 14],
                },
                {
                  columns: [
                    {
                      stack: [
                        { text: "Date et Signature :", fontSize: 8, color: BRAND.muted, margin: [0, 0, 0, 2] },
                        { canvas: [{ type: "rect", x: 0, y: 0, w: 200, h: 36, color: BRAND.surfaceAlt }] },
                      ],
                      width: "50%",
                    },
                    {
                      stack: [
                        { text: `Réunion du : ${input.meetingDate as string || "—"}  •  ${syndInfo.name}`, fontSize: 7.5, color: BRAND.mutedLight, margin: [0, 0, 0, 2] },
                        { text: `Réf. convocation : ${docNum}`, fontSize: 7, color: BRAND.mutedLight },
                      ],
                      width: "50%",
                      alignment: "right" as const,
                    },
                  ],
                },
              ],
              fillColor: BRAND.surfaceAlt,
              margin: [20, 16, 20, 16],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
              borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border],
            }]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0,
            vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i === 0 || i === node.table.widths.length ? 0.8 : 0,
            hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
        },
      ];
      break;

    case "contrat":
      content = [
        ...buildLegalContractCover(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, version),
        { text: "CONTRAT", fontSize: 18, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: `Réf. ${docNum}  •  ${today}`, fontSize: 8, color: BRAND.muted, alignment: "center" as const, margin: [0, 0, 0, 16] },
        // Two-column party strip
        {
          columns: [
            {
              stack: [
                { text: "PARTIE 1 — SYNDICAT", fontSize: 8, bold: true, color: accentColor, margin: [0, 0, 0, 4] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: accentColor }], margin: [0, 0, 0, 8] },
                { text: syndInfo.name, fontSize: 11, bold: true, color: BRAND.ink, margin: [0, 0, 0, 3] },
                { text: [syndInfo.address, syndInfo.city].filter(Boolean).join(", ") || "—", fontSize: 8.5, color: BRAND.muted },
                { text: syndInfo.phone || "", fontSize: 8.5, color: BRAND.muted },
                { text: syndInfo.email || "", fontSize: 8.5, color: BRAND.muted },
                ...(syndInfo.registrationNumber ? [{ text: `N° Reg. : ${syndInfo.registrationNumber}`, fontSize: 8, color: BRAND.mutedLight, margin: [0, 4, 0, 0] }] : []),
              ],
              width: "50%",
            },
            {
              stack: [
                { text: "PARTIE 2 — COCONTRACTANT", fontSize: 8, bold: true, color: accentColor, margin: [0, 0, 0, 4] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: accentColor }], margin: [0, 0, 0, 8] },
                { text: member || (input.partie2 as string) || "[COCONTRACTANT]", fontSize: 11, bold: true, color: BRAND.ink, margin: [0, 0, 0, 3] },
                ...(input._memberEmail ? [{ text: input._memberEmail as string, fontSize: 8.5, color: BRAND.muted }] : []),
                ...(input._memberPhone ? [{ text: input._memberPhone as string, fontSize: 8.5, color: BRAND.muted }] : []),
                ...(input._lotNumber   ? [{ text: `Lot N° ${input._lotNumber as string}${input._buildingName ? ` — ${input._buildingName as string}` : ""}`, fontSize: 8, color: BRAND.mutedLight, margin: [0, 4, 0, 0] }] : []),
              ],
              width: "50%",
            },
          ],
          columnGap: 20,
          margin: [0, 0, 0, 16],
        },
        metaTable([
          ["Objet du contrat :", input.objet as string || input.title],
          ["Date d'entrée en vigueur :", input.dateDebut as string || today],
          ...(input.dateFin ? [["Date d'expiration :", input.dateFin as string] as [string, string]] : []),
        ], accentColor),
        contentSection("Préambule", input.preamble as string || `Le présent contrat est conclu entre ${syndInfo.name} (Partie 1) et ${member || "[COCONTRACTANT]"} (Partie 2) et définit les droits et obligations des parties pour la durée convenue.`, accentColor),
        contentSection(
          "Clauses et conditions",
          body || "Les parties conviennent des clauses et conditions détaillées ci-après. Tout différend relatif à l'interprétation ou à l'exécution du présent contrat sera soumis à la juridiction compétente de Casablanca.",
          accentColor,
        ),
        ...(input.modalitesResiliation as string ? [contentSection("Modalités de résiliation", input.modalitesResiliation as string, accentColor)] : []),
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    case "rapport": {
      const rapportPeriode = (input.periode as string) || today;
      const rapportAuteur  = member || syndInfo.name;
      const hasKpiData     = !!(input._kpiTotalPaid || input._kpiTotalCharged || input._kpiOutstanding || input._kpiCollectionRate);
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `Période : ${rapportPeriode}  •  Réf. ${docNum}`),
        { text: "RAPPORT D'ACTIVITÉ", fontSize: 18, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: `Syndicat : ${syndInfo.name}  •  ${today}`, fontSize: 8, color: BRAND.muted, alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Période couverte :", rapportPeriode],
          ["Établi par :", rapportAuteur],
          ["Date de rédaction :", today],
          ["Référence :", docNum],
        ], accentColor),
        // Financial KPI strip — only shown when real data is available
        ...(hasKpiData ? financialDashboard(input as Record<string, unknown>, accentColor) : []),
        contentSection("Synthèse exécutive", input.synthese as string || body || "Ce rapport présente les activités et résultats du syndicat pour la période indiquée.", accentColor),
        contentSection("Activités réalisées", input.activites as string || "Voir détails en annexe.", accentColor),
        contentSection("Indicateurs clés", input.indicateurs as string || "—", accentColor),
        contentSection("Perspectives et recommandations", input.perspectives as string || "—", accentColor),
        signatureBlock("L'Auteur du rapport", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    case "decision": {
      const voteFor      = (input._voteFor      as string) || (input.votePour     as string) || "";
      const voteAgainst  = (input._voteAgainst  as string) || (input.voteContre   as string) || "";
      const voteAbstain  = (input._voteAbstain  as string) || (input.voteAbstention as string) || "";
      const hasVoteData  = !!(voteFor || voteAgainst || voteAbstain);
      const effectDate   = (input.datePriseEffet as string) || today;
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `Réf. ${docNum} — ${today}`),
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          ["Référence :", docNum],
          ["Date de la décision :", today],
          ["Organe décisionnel :", input.organe as string || "Bureau Syndical"],
          ["Date de prise d'effet :", effectDate],
          ["Syndicat :", syndInfo.name],
        ], accentColor),
        contentSection(
          "Vu et considérant",
          input.preamble as string ||
            `Vu les statuts du syndicat ${syndInfo.name}, et considérant les délibérations de l'organe compétent en date du ${today} ;`,
          accentColor,
        ),
        contentSection("Décide", body || "La présente décision est adoptée à l'unanimité des membres présents.", accentColor),
        // Vote tally — shown when pour/contre/abstention data is provided
        ...(hasVoteData ? [kpiRow([
          { label: "Votes POUR",        value: voteFor      || "—", bgColor: BRAND.successLight, valueColor: BRAND.successDeep },
          { label: "Votes CONTRE",      value: voteAgainst  || "—", bgColor: BRAND.destructiveLight, valueColor: BRAND.destructiveDark },
          { label: "Abstentions",        value: voteAbstain  || "—", bgColor: BRAND.surface, valueColor: BRAND.muted },
        ], accentColor)] : []),
        {
          table: {
            widths: ["*"],
            body: [[{
              text: `La présente décision entre en vigueur à compter du ${effectDate} et est opposable à tous les membres du syndicat.`,
              style: "notice",
              fillColor: BRAND.successLight,
              margin: [10, 8, 10, 8],
            }]],
          },
          layout: {
            hLineWidth: () => 1, vLineWidth: () => 1,
            hLineColor: () => BRAND.success, vLineColor: () => BRAND.success,
          },
          margin: [0, 0, 0, 16],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    case "certificat": {
      // ── Enterprise credential certificate — authority issuer top, recipient hero center ──
      // Visual concept: DocuSign/Adobe Sign "Certificate of Completion" —
      // issuer band at top, ornamental title block, beneficiary name at 20pt,
      // certification panel with left accent bar, official seal + signature.
      // NO buildCertificateFrame — every element is purpose-built for this template.
      const certDark = adjustColorBrightness(accentColor, -22);
      const beneficiary = member || t("certificatBeneficiaryFallback", lang);
      content = [
        ...header,
        // ── Authority declaration band — issuer identity on accent bg ──────────
        {
          table: {
            widths: ["*", "auto"],
            body: [[
              {
                stack: [
                  { text: "CERTIFIÉ PAR", fontSize: 5.5, bold: true, color: `${BRAND.surfaceCard}88`, characterSpacing: 1.2, margin: [0, 0, 0, 3] },
                  { text: syndInfo.name.toUpperCase(), fontSize: 13, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.4, lineHeight: 1.2 },
                  ...(syndInfo.registrationNumber ? [{ text: `Réf. imm. ${syndInfo.registrationNumber}`, fontSize: 6.5, color: `${BRAND.surfaceCard}88`, margin: [0, 3, 0, 0] as [number, number, number, number] }] : []),
                ],
                fillColor: accentColor,
                margin: [16, 13, 12, 13],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "N° DE CERTIFICAT", fontSize: 5, bold: true, color: `${BRAND.surfaceCard}88`, characterSpacing: 0.8, alignment: "right" as const, margin: [0, 0, 0, 3] },
                  { text: docNum, fontSize: 10, bold: true, color: BRAND.surfaceCard, alignment: "right" as const },
                  { text: today, fontSize: 7, color: `${BRAND.surfaceCard}88`, alignment: "right" as const, margin: [0, 3, 0, 0] },
                ],
                fillColor: adjustColorBrightness(accentColor, -18),
                margin: [12, 13, 16, 13],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0, vLineWidth: () => 0,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 0],
        },
        // ── Title block — ornamental double-rule framing ──────────────────────
        {
          stack: [
            { canvas: [{ type: "line", x1: 36, y1: 0, x2: 479, y2: 0, lineWidth: 1.4, lineColor: accentColor }], margin: [0, 14, 0, 0] },
            { canvas: [{ type: "line", x1: 54, y1: 0, x2: 461, y2: 0, lineWidth: 0.4, lineColor: `${accentColor}55` }], margin: [0, 3, 0, 0] },
            { text: t("certificateWord", lang).toUpperCase(), fontSize: 28, bold: true, color: accentColor, alignment: "center" as const, characterSpacing: 4, margin: [0, 12, 0, 4] },
            { text: input.title, fontSize: 11, color: BRAND.inkLight, alignment: "center" as const, italics: true, margin: [0, 0, 0, 12] },
            { canvas: [{ type: "line", x1: 54, y1: 0, x2: 461, y2: 0, lineWidth: 0.4, lineColor: `${accentColor}55` }], margin: [0, 0, 0, 3] },
            { canvas: [{ type: "line", x1: 36, y1: 0, x2: 479, y2: 0, lineWidth: 1.4, lineColor: accentColor }], margin: [0, 0, 0, 0] },
          ],
          margin: [0, 0, 0, 18],
        },
        // ── Beneficiary hero — name at maximum prominence ─────────────────────
        // Flanked by ornamental hairlines + accent dot center. Makes the recipient
        // the visual focal point of the document — mandatory for a certificate.
        {
          stack: [
            { text: "DÉCERNÉ À", fontSize: 6.5, bold: true, color: BRAND.mutedLight, characterSpacing: 1.4, alignment: "center" as const, margin: [0, 0, 0, 10] },
            { text: beneficiary, fontSize: 22, bold: true, color: BRAND.ink, alignment: "center" as const, characterSpacing: 1.2, margin: [0, 0, 0, 10] },
            {
              columns: [
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 170, y2: 0, lineWidth: 0.5, lineColor: `${accentColor}55` }], width: "*", margin: [0, 5, 0, 0] },
                { canvas: [{ type: "ellipse", x: 5, y: 5, r1: 5, r2: 5, color: accentColor }], width: 10 },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 170, y2: 0, lineWidth: 0.5, lineColor: `${accentColor}55` }], width: "*", margin: [0, 5, 0, 0] },
              ],
              margin: [0, 0, 0, 18],
            },
          ],
        },
        // ── Certification content panel — left accent bar + tinted bg ─────────
        {
          table: {
            widths: [3, "*"],
            body: [[
              {
                canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 80, color: accentColor }],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: t("certificatSectionTitle", lang).toUpperCase(), fontSize: 6, bold: true, color: BRAND.muted, characterSpacing: 0.8, margin: [0, 0, 0, 8] },
                  {
                    text: body || fmt(t("certificatBody", lang), { syndicate: syndInfo.name, member: beneficiary }),
                    fontSize: 10, color: BRAND.inkMid, lineHeight: 1.75,
                  },
                ],
                fillColor: `${accentColor}09`,
                margin: [16, 14, 16, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0, vLineWidth: () => 0,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 20],
        },
        // ── Signature + official seal — side by side ──────────────────────────
        {
          columns: [
            { ...signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures) as object, width: "*" },
            {
              stack: [buildOfficialSeal(syndInfo.name, accentColor, syndInfo.name, today, signatures.length > 0 ? "VALID" : "PENDING") as object],
              width: 128,
              alignment: "center" as const,
              margin: [0, 24, 0, 0],
            },
          ],
          columnGap: 20,
          margin: [0, 0, 0, 0],
        },
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    case "circulaire":
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `Réf. ${docNum} — ${today}`),
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
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, false, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    case "mise_en_demeure":
      content = [
        ...header,
        buildLegalAlertBanner(accentColor, lang),
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaRecipient", lang), member || t("convocationRecipientFallback", lang)],
          [t("metaSender", lang), syndInfo.name],
          [t("metaIssueDate", lang), today],
          [t("metaReference", lang), docNum],
          [t("metaSendMode", lang), input.modeEnvoi as string || t("registeredMailNotice", lang)],
        ], accentColor),
        contentSection(
          t("miseEnDemeureObjetTitle", lang),
          body || fmt(t("miseEnDemeureBody", lang), { syndicate: syndInfo.name, recipient: member || t("convocationRecipientFallback", lang) }),
          accentColor,
          isArabic,
        ),
        {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: `⚠  ${t("mandatoryDeadlineTitle", lang)}`, fontSize: 10, bold: true, color: BRAND.destructiveDark, margin: [0, 0, 0, 4] },
                { text: input.delai as string || t("defaultDeadline", lang), fontSize: 10, color: BRAND.destructiveDark },
              ],
              fillColor: BRAND.destructiveLight,
              margin: [12, 10, 12, 10],
            }]],
          },
          layout: {
            hLineWidth: () => 1.5,
            vLineWidth: () => 1.5,
            hLineColor: () => BRAND.destructive,
            vLineColor: () => BRAND.destructive,
          },
          margin: [0, 0, 0, 16],
        },
        contentSection(
          t("miseEnDemeureConsequencesTitle", lang),
          input.consequences as string || t("miseEnDemeureConsequencesText", lang),
          accentColor,
          isArabic,
        ),
        // Bank payment coordinates — shown only when configured, to facilitate debt settlement
        ...(syndInfo.bankName || syndInfo.bankIban ? [
          contentSection(
            "COORDONNÉES BANCAIRES POUR RÈGLEMENT",
            [
              "Pour procéder au règlement de votre dette, vous pouvez effectuer un virement bancaire :",
              ...(syndInfo.bankName ? [`  • Banque : ${syndInfo.bankName}`] : []),
              ...(syndInfo.bankIban ? [`  • IBAN   : ${syndInfo.bankIban}`] : []),
              ...(syndInfo.bankBic  ? [`  • BIC    : ${syndInfo.bankBic}`]  : []),
              `  • Référence : ${docNum}`,
            ].join("\n"),
            accentColor,
          ),
        ] : []),
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 10: Demande Administrative ─────────────────────────────────────
    case "demande_administrative":
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `Demandeur : ${member || "[NOM DU DEMANDEUR]"}  •  Réf. ${docNum}`),
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Demandeur :",       member || "[NOM DU DEMANDEUR]"],
          ...(input._lotNumber    ? [["Lot N\u00b0 :",   input._lotNumber    as string] as [string, string]] : []),
          ...(input._buildingName ? [["R\u00e9sidence :", input._buildingName as string] as [string, string]] : []),
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
        signatureBlock("Le Demandeur", member || "[NOM DU DEMANDEUR]", accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 11: Autorisation ────────────────────────────────────────────────
    case "autorisation":
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `Bénéficiaire : ${member || "[NOM]"}  •  Réf. ${docNum}`),
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Bénéficiaire :",    member || "[NOM DU BÉNÉFICIAIRE]"],
          ...(input._lotNumber    ? [["Lot N\u00b0 :",   input._lotNumber    as string] as [string, string]] : []),
          ...(input._buildingName ? [["R\u00e9sidence :", input._buildingName as string] as [string, string]] : []),
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
                { text: "✓  AUTORISATION VALIDE", fontSize: 10, bold: true, color: BRAND.successDark, margin: [0, 0, 0, 4] },
                { text: `Délivrée par ${syndInfo.name} — ${today}`, fontSize: 9, color: BRAND.successDark },
              ],
              fillColor: BRAND.successLight,
              margin: [12, 10, 12, 10],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => BRAND.success, vLineColor: () => BRAND.success },
          margin: [0, 0, 0, 16],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 12: Ordre de Mission ────────────────────────────────────────────
    case "ordre_de_mission":
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `Mission : ${member || "[NOM]"}  •  Réf. ${docNum}`),
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        metaTable([
          ["Missionnaire :",    member || "[NOM DU MISSIONNAIRE]"],
          ...(input._buildingName ? [["R\u00e9sidence :", input._buildingName as string] as [string, string]] : []),
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
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
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
                { text: syndInfo.name, fontSize: 11, bold: true, color: BRAND.ink },
                { text: [syndInfo.address, syndInfo.city].filter(Boolean).join(", "), fontSize: 9, color: BRAND.muted },
                { text: syndInfo.phone || "", fontSize: 9, color: BRAND.muted },
                { text: syndInfo.email || "", fontSize: 9, color: BRAND.muted },
              ],
            },
            {
              stack: [
                { text: `À l'attention de :`, fontSize: 9, color: BRAND.muted },
                { text: member || "[DESTINATAIRE]", fontSize: 11, bold: true, color: BRAND.ink, margin: [0, 4, 0, 0] },
                { text: `Le ${today}`, fontSize: 9, color: BRAND.muted, margin: [0, 16, 0, 0] },
                { text: `Réf : ${docNum}`, fontSize: 9, color: BRAND.muted },
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
          color: BRAND.ink,
          margin: [0, 0, 0, 16],
          decoration: "underline" as const,
        },
        { text: `Monsieur / Madame,`, style: "body", margin: [0, 0, 0, 12] },
        { text: input.corps as string || body || "Nous vous prions de bien vouloir trouver ci-joint les éléments relatifs à l'objet mentionné en référence.", style: "body", margin: [0, 0, 0, 12] },
        { text: "Veuillez agréer, Monsieur / Madame, l'expression de nos salutations distinguées.", style: "body", margin: [0, 0, 0, 0] },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 14: Note Interne ────────────────────────────────────────────────
    case "note_interne":
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `De : ${input.de as string || "La Présidence"}  •  Réf. ${docNum}`),
        metaTable([
          ["À :",       member || "Tous les membres du bureau"],
          ["De :",      input.de as string || "La Présidence"],
          ["Date :",    today],
          ["Objet :",   input.objet as string || input.title],
          ["Priorité :", input.priorite as string || "Normale"],
        ], accentColor),
        contentSection("Message", body || input.corps as string || "Veuillez prendre connaissance des informations ci-dessous et agir en conséquence.", accentColor),
        input.actionRequise
          ? {
              table: {
                widths: ["*"],
                body: [[{ stack: [
                  { text: "ACTION REQUISE", fontSize: 9, bold: true, color: accentColor, margin: [0, 0, 0, 4] },
                  { text: input.actionRequise as string, fontSize: 10, color: BRAND.ink },
                ], fillColor: adjustColorBrightness(accentColor, 92), margin: [12, 10, 12, 10] }]],
              },
              layout: { hLineWidth: () => 1, vLineWidth: () => 0, hLineColor: () => adjustColorBrightness(accentColor, 55) },
              margin: [0, 0, 0, 16],
            }
          : null,
        { text: `${syndInfo.name} — Note interne n° ${docNum}`, style: "notice", alignment: "center" as const, margin: [0, 30, 0, 0] },
        legalFooterNote(docNum, lang, verifyUrl),
      ].filter(Boolean);
      break;

    // ── Template 15: Rapport Financier ───────────────────────────────────────────
    case "rapport_financier": {
      // Auto-derive names from officeHolders when user hasn't typed them
      const oh = input.officeHolders as OfficeHolders | undefined;
      const rapportEtabliPar   = (input.etabliPar   as string) || oh?.treasurer?.fullName  || "Le Trésorier";
      const rapportApprouvePar = (input.approuvePar  as string) || oh?.president?.fullName  || "Le Président";
      const rapportExercice    = (input.exercice     as string) || (input._kpiYear as string) || String(new Date().getFullYear());
      const rapportBuilding    = (input._buildingName as string) || buildingName || syndInfo.name;

      // Bind KPI totals for the summary row — prefer user-provided, fall back to DB values
      const rapportTotalPrevu    = (input.totalPrevu    as string)
        || (input._kpiBudgetTotal as string)
        || (input._kpiTotalCharged as string)
        || "—";
      const rapportTotalRealise  = (input.totalRealise  as string)
        || (input._kpiTotalPaid   as string)
        || "—";
      const rapportNetBalance    = (input._kpiNetBalance    as string) || "—";
      const rapportOutstanding   = (input._kpiOutstanding   as string) || "0";
      const rapportCollRate      = parseInt((input._kpiCollectionRate as string) || "0");
      const rapportCashBalance   = (input._kpiCashBalance   as string) || "—";
      const rapportRevenue       = (input._kpiTotalRevenue  as string) || "—";
      const rapportExpenses      = (input._kpiTotalExpenses as string) || "—";
      const outstandingNum       = parseFloat(rapportOutstanding.replace(/\s/g, "").replace(",", "."));

      content = [
        ...buildFinancialFamilyHeader(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, rapportExercice),
        { text: "RAPPORT FINANCIER", fontSize: 20, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },

        // ── Identification card ───────────────────────────────────────────────
        metaTable([
          ["EXERCICE",         rapportExercice],
          ["IMMEUBLE / SYNDICAT", rapportBuilding],
          ["PÉRIODE",          (input.periode as string) || `${rapportExercice}`],
          ["DATE D'ÉMISSION",  today],
          ["ÉTABLI PAR",       rapportEtabliPar],
          ["APPROUVÉ PAR",     rapportApprouvePar],
          ["RÉFÉRENCE",        docNum],
        ], accentColor),

        // ── Enterprise financial dashboard (KPI cards + progress bars) ────────
        ...financialDashboard(input as Record<string, unknown>, accentColor),

        // ── Image 1 "Nexora" simulated horizontal bar chart ───────────────────
        ...((() => {
          const _sn = (s: string) => { const n = parseFloat(s.replace(/\s/g, "").replace(",", ".")); return isNaN(n) || !isFinite(n) ? 0 : n; };
          const tPrev = _sn(rapportTotalPrevu);
          const tReal = _sn(rapportTotalRealise);
          if (tPrev === 0 && tReal === 0) return [] as unknown[];
          const cats = [
            ...(tPrev > 0 || tReal > 0 ? [{ label: "Charges appelées",   budgetValue: tPrev, actualValue: tReal }] : []),
            ...(outstandingNum > 0     ? [{ label: "Impayés en cours",    budgetValue: tPrev, actualValue: outstandingNum, color: BRAND.legalRed }] : []),
            ...(_sn(rapportRevenue) > 0  ? [{ label: "Revenus encaissés",  budgetValue: tPrev, actualValue: _sn(rapportRevenue), color: BRAND.successDark }] : []),
            ...(_sn(rapportExpenses) > 0 ? [{ label: "Dépenses totales",   budgetValue: tPrev, actualValue: _sn(rapportExpenses), color: BRAND.destructiveDark }] : []),
          ];
          return cats.length > 0 ? [buildFinancialBarChart(cats, accentColor, "ANALYSE BUDGÉTAIRE")] : [] as unknown[];
        })()),

        // ── Top-line financial summary ────────────────────────────────────────
        {
          table: {
            widths: ["*", "*", "*"],
            body: [[
              {
                stack: [
                  { text: "TOTAL REVENUS",    fontSize: 7, bold: true, color: BRAND.mutedLight, margin: [0, 0, 0, 4] },
                  { text: `${rapportRevenue} MAD`, fontSize: 15, bold: true, color: BRAND.successDark },
                  { text: "Encaissements caisse", fontSize: 6.5, color: BRAND.muted, margin: [0, 3, 0, 0] },
                ],
                fillColor: BRAND.successLight,
                margin: [12, 14, 12, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "TOTAL DÉPENSES",  fontSize: 7, bold: true, color: BRAND.mutedLight, margin: [0, 0, 0, 4] },
                  { text: `${rapportExpenses} MAD`, fontSize: 15, bold: true, color: BRAND.destructiveDark },
                  { text: "Décaissements caisse", fontSize: 6.5, color: BRAND.muted, margin: [0, 3, 0, 0] },
                ],
                fillColor: BRAND.destructiveLight,
                margin: [12, 14, 12, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "SOLDE NET",        fontSize: 7, bold: true, color: BRAND.mutedLight, margin: [0, 0, 0, 4] },
                  { text: `${rapportNetBalance} MAD`, fontSize: 15, bold: true, color: BRAND.info },
                  { text: "Trésorerie nette", fontSize: 6.5, color: BRAND.muted, margin: [0, 3, 0, 0] },
                ],
                fillColor: BRAND.infoLight,
                margin: [12, 14, 12, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.6 : 0,
            vLineWidth: () => 0,
            hLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 16],
        },

        // ── Charges vs Budget comparison table ───────────────────────────────
        {
          table: {
            widths: ["*", 130, 130],
            body: [
              [
                { text: "Rubrique", style: "tableHeader", fillColor: accentColor, color: BRAND.surfaceCard, bold: true, fontSize: 8.5, margin: [10, 6, 8, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: "Budget Prévu (MAD)", style: "tableHeader", fillColor: accentColor, color: BRAND.surfaceCard, bold: true, fontSize: 8.5, margin: [8, 6, 10, 6], alignment: "right" as const, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: "Réalisé (MAD)", style: "tableHeader", fillColor: accentColor, color: BRAND.surfaceCard, bold: true, fontSize: 8.5, margin: [8, 6, 10, 6], alignment: "right" as const, border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              ],
              ...(input.lignesFinancieres as Array<[string, string, string]> || [
                ["Appels de fonds émis",  (input._kpiTotalCharged as string) || "—", (input._kpiYearCharged as string) || "—"],
                ["Encaissements",         (input._kpiTotalPaid    as string) || "—", (input._kpiYearPaid    as string) || "—"],
                ["Dépenses d'entretien",  (input._kpiTotalExpenses as string) || "—", (input._kpiTotalExpenses as string) || "—"],
                ["Fonds de réserve",      (input._kpiFondsTravauxTgt as string) || "—", (input._kpiFondsTravauxBal as string) || "—"],
              ]).map(([label, prevu, realise]: [string, string, string], i: number) => [
                { text: label, fontSize: 8.5, color: BRAND.inkMid, fillColor: i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard, margin: [10, 5, 8, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: prevu, fontSize: 8.5, color: BRAND.inkMid, fillColor: i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard, alignment: "right" as const, margin: [8, 5, 10, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: realise, fontSize: 8.5, color: BRAND.inkMid, fillColor: i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard, alignment: "right" as const, margin: [8, 5, 10, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              ]),
              [
                { text: "TOTAL GÉNÉRAL", fontSize: 9, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [10, 8, 8, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: rapportTotalPrevu, fontSize: 9, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "right" as const, margin: [8, 8, 10, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: rapportTotalRealise, fontSize: 9, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "right" as const, margin: [8, 8, 10, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              ],
            ],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3,
            vLineWidth: () => 0,
            hLineColor: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === 1 || i === node.table.body.length ? accentColor : BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 16],
        },

        // ── Outstanding debt alert (if any) ─────────────────────────────────
        ...(outstandingNum > 0 ? [{
          table: {
            widths: ["*"],
            body: [[{
              columns: [
                { text: "⚠", fontSize: 16, color: BRAND.destructiveDark, width: 24, margin: [0, 2, 0, 0] },
                { stack: [
                  { text: "IMPAYÉS EN COURS", fontSize: 9, bold: true, color: BRAND.destructiveDeep, margin: [0, 0, 0, 2] },
                  { text: `Montant total des impayés : ${rapportOutstanding} MAD  •  Taux de recouvrement : ${rapportCollRate}%`, fontSize: 8.5, color: BRAND.destructiveDeep },
                ], width: "*" },
              ],
              fillColor: BRAND.destructiveLight,
              margin: [14, 10, 14, 10],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
              borderColor: [BRAND.destructive, BRAND.destructive, BRAND.destructive, BRAND.destructive],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => BRAND.destructive, vLineColor: () => BRAND.destructive, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
          margin: [0, 0, 0, 16],
        }] as unknown[] : []),

        contentSection("OBSERVATIONS ET RECOMMANDATIONS", input.observations as string || "Aucune observation particulière pour la période concernée.", accentColor),
        multiSignatoryBlock(oh, accentColor, lang, signatures, syndInfo.name),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Template 16: Rapport d'Audit ─────────────────────────────────────────────
    case "rapport_audit":
      content = [
        ...buildFinancialFamilyHeader(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, (input.periodeAuditee as string) || `Exercice ${new Date().getFullYear()}`),
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
                { text: input.conclusion as string || "Audit réalisé conformément aux standards professionnels. Aucune irrégularité majeure constatée.", fontSize: 10, color: BRAND.inkLight },
              ],
              fillColor: adjustColorBrightness(accentColor, 94),
              margin: [14, 12, 14, 12],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => adjustColorBrightness(accentColor, 60), vLineColor: () => adjustColorBrightness(accentColor, 60) },
          margin: [0, 0, 0, 16],
        },
        signatureBlock("L'Auditeur", input.auditeurs as string || syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 17: Convention de Partenariat ───────────────────────────────────
    case "convention_partenariat":
      content = [
        ...buildLegalContractCover(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, version),
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
            signatureBlock(`Pour ${syndInfo.name}`, "Le Président", accentColor, true, lang, signatures),
            signatureBlock("Pour le partenaire", input.partieB as string || "[PARTENAIRE]", accentColor, false, lang, signatures),
          ],
        } as unknown,
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 18: Accord Collectif ────────────────────────────────────────────
    case "accord_collectif":
      content = [
        ...buildLegalContractCover(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, version),
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
            signatureBlock(`Pour ${syndInfo.name}`, "Le Délégué Syndical", accentColor, true, lang, signatures),
            signatureBlock("Pour l'employeur", input.employeur as string || "[EMPLOYEUR]", accentColor, false, lang, signatures),
          ],
        } as unknown,
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 19: Compte-Rendu de Réunion ─────────────────────────────────────
    case "compte_rendu":
      content = [
        ...header,
        buildMeetingBanner(
          accentColor,
          input.meetingType as string | undefined,
          input.lieu as string | undefined,
          input.dateMeeting as string || today,
          lang,
        ),
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
                { text: "\n\n________________________\n" + (input.presidentSeance as string || ""), fontSize: 8, alignment: "center" as const, color: BRAND.muted, margin: [4, 8, 4, 8] },
                { text: "\n\n________________________\n" + (input.secretaire as string || ""), fontSize: 8, alignment: "center" as const, color: BRAND.muted, margin: [4, 8, 4, 8] },
                {
                  stack: [{
                    table: {
                      widths: [88],
                      body: [[{
                        stack: [
                          { text: "✦", fontSize: 11, color: BRAND.surfaceCard, alignment: "center" as const, margin: [0, 5, 0, 1] },
                          { canvas: [{ type: "line", x1: 6, y1: 0, x2: 78, y2: 0, lineWidth: 0.4, lineColor: "#ffffff55" }] },
                          { text: "CACHET OFFICIEL", fontSize: 5, bold: true, color: BRAND.surfaceCard, alignment: "center" as const, margin: [2, 2, 2, 0] },
                          { text: "SYNDICAT DE COPROPRIÉTÉ", fontSize: 4, color: "#ffffffaa", alignment: "center" as const, margin: [0, 1, 0, 0] },
                          { canvas: [{ type: "line", x1: 6, y1: 0, x2: 78, y2: 0, lineWidth: 0.4, lineColor: "#ffffff55" }], margin: [0, 1, 0, 1] },
                          { text: "OFFICIAL STAMP", fontSize: 4.5, color: "#ffffffcc", alignment: "center" as const, margin: [0, 0, 0, 5] },
                        ],
                        fillColor: accentColor,
                      }]],
                    },
                    layout: {
                      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 2 : 0,
                      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 2 : 0,
                      hLineColor: () => adjustColorBrightness(accentColor, -25),
                      vLineColor: () => adjustColorBrightness(accentColor, -25),
                      paddingLeft: () => 0, paddingRight: () => 0,
                      paddingTop: () => 0, paddingBottom: () => 0,
                    },
                    margin: [4, 4, 4, 4],
                  }],
                  alignment: "center" as const,
                },
              ],
            ],
          },
          layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => BRAND.border, vLineColor: () => BRAND.border },
          margin: [0, 30, 0, 0],
        },
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 20: Rapport d'Activité ──────────────────────────────────────────
    case "rapport_activite":
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `${input.periode as string || `Exercice ${new Date().getFullYear()}`}  •  Réf. ${docNum}`),
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
        signatureBlock("Le Secrétaire Général", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 21: Règlement de Copropriété (dynamic, DB-fed) ─────────────────
    case "reglement": {
      const prop = input.property as PropertyInfo | undefined;
      const officeHolders = input.officeHolders as OfficeHolders | undefined;
      const president = officeHolders?.president;
      const residenceName = prop?.name || syndInfo.name;
      const surfaceText = prop?.totalSurfaceM2 != null ? `${prop.totalSurfaceM2} m²` : t("notRenseigne", lang);
      const managerPart = officeHolders?.manager?.fullName
        ? fmt(t("reglementAdminManagerPart", lang), { manager: officeHolders.manager.fullName })
        : "";
      content = [
        ...buildLegalContractCover(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, version),
        { text: input.title || t("docTypeLabel_reglement", lang), style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaResidence", lang), residenceName],
          [t("metaAddress", lang), [prop?.address, prop?.city].filter(Boolean).join(", ") || [syndInfo.address, syndInfo.city].filter(Boolean).join(", ") || "—"],
          [t("metaLandRegistry", lang), prop?.landRegistryReference || "—"],
          [t("metaBuildings", lang), prop ? String(prop.totalBuildings) : "—"],
          [t("metaFloors", lang), prop ? String(prop.totalFloors) : "—"],
          [t("metaLots", lang), prop ? String(prop.totalLots) : "—"],
          [t("metaSurface", lang), surfaceText],
          [t("metaPresident", lang), president?.fullName || input.president as string || "—"],
          [t("metaDate", lang), today],
          [t("metaDocNumber", lang), docNum],
        ], accentColor),
        contentSection(
          t("sectionObjet", lang),
          body || fmt(t("reglementObjetText", lang), { name: residenceName }),
          accentColor,
          isArabic,
        ),
        contentSection(
          t("sectionDescription", lang),
          fmt(t("reglementDescriptionText", lang), {
            name: residenceName,
            buildings: prop ? String(prop.totalBuildings) : "—",
            floors: prop ? String(prop.totalFloors) : "—",
            lots: prop ? String(prop.totalLots) : "—",
            surface: surfaceText,
            landRef: prop?.landRegistryReference || t("notRenseigne", lang),
          }),
          accentColor,
          isArabic,
        ),
        contentSection(
          t("sectionCharges", lang),
          (input.chargesText as string) || t("reglementChargesText", lang),
          accentColor,
          isArabic,
        ),
        contentSection(
          t("sectionAdministration", lang),
          fmt(t("reglementAdminText", lang), {
            president: president?.fullName || t("reglementPresidentFallback", lang),
            managerPart,
          }),
          accentColor,
          isArabic,
        ),
        { text: "\n" },
        signatureBlock(
          president?.fullName ? fmt(t("reglementPresidentSignPrefix", lang), { name: president.fullName }) : t("presidentTitle", lang),
          syndInfo.name,
          accentColor,
          true,
          lang,
        ),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Template 22: Attestation de Résidence ────────────────────────────────────
    // Visual concept: Official address proof / domicile certificate.
    // The ADDRESS is the primary fact — it occupies the most prominent visual real estate.
    // Instantly distinguishable from attestation_propriete: residence = address hero,
    // propriete = land registry title strip. No shared layout elements.
    case "attestation_residence": {
      const lot          = (input.lotNumber as string) || (input._lotNumber as string) || "—";
      const propertyName = (input._buildingName as string) || (input.property as PropertyInfo | undefined)?.name || syndInfo.name;
      const propertyAddress = (input._buildingAddress as string) || (input.property as PropertyInfo | undefined)?.address || syndInfo.address;
      const propertyCity = (input.property as PropertyInfo | undefined)?.city || syndInfo.city;
      const lotFloor     = (input.lotFloor as string | undefined) || (input._lotFloor as string | undefined);
      const fullAddress  = [propertyAddress, propertyCity].filter(Boolean).join(", ") || "—";
      const resDark      = adjustColorBrightness(accentColor, -20);
      content = [
        ...header,
        // ── Identity bar — 3-segment: document type / ref / date ─────────────
        {
          table: {
            widths: ["*", "auto", "auto"],
            body: [[
              {
                text: "ATTESTATION DE RÉSIDENCE",
                fontSize: 10, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.5,
                fillColor: accentColor, margin: [14, 10, 8, 10],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "RÉFÉRENCE", fontSize: 4.5, bold: true, color: `${BRAND.surfaceCard}88`, characterSpacing: 0.6, margin: [0, 0, 0, 2] },
                  { text: docNum, fontSize: 8, bold: true, color: BRAND.surfaceCard },
                ],
                fillColor: adjustColorBrightness(accentColor, -14),
                margin: [12, 8, 12, 8],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "DATE", fontSize: 4.5, bold: true, color: `${BRAND.surfaceCard}88`, characterSpacing: 0.6, margin: [0, 0, 0, 2] },
                  { text: today, fontSize: 8, bold: true, color: BRAND.surfaceCard },
                ],
                fillColor: adjustColorBrightness(accentColor, -22),
                margin: [12, 8, 14, 8],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0, vLineWidth: () => 0,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 0],
        },
        // ── Address hero — the dominant visual block ──────────────────────────
        // A location pin motif (circle + inner circle) identifies this as an
        // address document before the reader has processed any text.
        {
          table: {
            widths: ["auto", "*"],
            body: [[
              {
                stack: [
                  {
                    canvas: [
                      { type: "ellipse", x: 18, y: 18, r1: 18, r2: 18, color: accentColor },
                      { type: "ellipse", x: 18, y: 18, r1: 9, r2: 9, color: BRAND.surfaceCard },
                    ],
                  },
                ],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                margin: [16, 17, 8, 17],
              },
              {
                stack: [
                  { text: "ADRESSE DE RÉSIDENCE CERTIFIÉE", fontSize: 5.5, bold: true, color: BRAND.muted, characterSpacing: 0.8, margin: [0, 0, 0, 5] },
                  { text: propertyName, fontSize: 15, bold: true, color: BRAND.ink, lineHeight: 1.2, margin: [0, 0, 0, 5] },
                  { text: fullAddress, fontSize: 10, color: BRAND.inkMid, margin: [0, 0, 0, 4] },
                  ...(lot !== "—"
                    ? [{ text: `Appartement N° ${lot}${lotFloor ? `  ·  Étage ${lotFloor === "0" ? "Rez-de-chaussée" : lotFloor}` : ""}`, fontSize: 9, color: BRAND.muted }]
                    : []),
                ],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                margin: [0, 15, 16, 15],
              },
            ]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0,
            vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i === 0 || i === node.table.widths.length ? 0.8 : 0,
            hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 8, 0, 16],
        },
        // ── Resident identity row — 3 equal cells ────────────────────────────
        {
          table: {
            widths: ["*", "*", "*"],
            body: [[
              {
                stack: [
                  { text: "RÉSIDENT(E)", fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.6, margin: [0, 0, 0, 5] },
                  { text: member || t("notRenseigne", lang), fontSize: 12, bold: true, color: BRAND.ink, lineHeight: 1.2 },
                ],
                fillColor: BRAND.surface,
                margin: [14, 12, 14, 12],
                border: [true, true, false, true] as [boolean, boolean, boolean, boolean],
                borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border],
              },
              {
                stack: [
                  { text: "ÉMETTEUR", fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.6, margin: [0, 0, 0, 5] },
                  { text: syndInfo.name, fontSize: 10, bold: true, color: BRAND.ink, lineHeight: 1.2 },
                ],
                fillColor: BRAND.surfaceCard,
                margin: [14, 12, 14, 12],
                border: [true, true, false, true] as [boolean, boolean, boolean, boolean],
                borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border],
              },
              {
                stack: [
                  { text: "VALIDE À CE JOUR", fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.6, margin: [0, 0, 0, 5] },
                  { text: today, fontSize: 10, bold: true, color: BRAND.ink },
                  { text: "Situation à la date d'émission", fontSize: 7, color: BRAND.muted, margin: [0, 3, 0, 0] },
                ],
                fillColor: BRAND.surface,
                margin: [14, 12, 14, 12],
                border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0.6, vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i === 0 || i === node.table.widths.length ? 0.6 : 0.4,
            hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 18],
        },
        // ── Certification statement — left accent bar + pale tinted bg ────────
        {
          table: {
            widths: [3, "*"],
            body: [[
              {
                canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 80, color: accentColor }],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "ATTESTATION OFFICIELLE DE RÉSIDENCE", fontSize: 6, bold: true, color: BRAND.muted, characterSpacing: 0.8, margin: [0, 0, 0, 8] },
                  {
                    text: body || (
                      `Le Syndicat de Copropriété ${syndInfo.name}` +
                      (syndInfo.registrationNumber ? `, immatriculé sous le N° ${syndInfo.registrationNumber},` : `,`) +
                      ` certifie que ${member || "[NOM DU MEMBRE]"} réside à l'appartement N° ${lot} de la résidence ${propertyName}` +
                      `${lotFloor ? `, Étage ${lotFloor === "0" ? "Rez-de-chaussée" : lotFloor}` : ""}` +
                      `, sise à ${fullAddress}.\n\n` +
                      `Cette attestation est délivrée à la demande de l'intéressé(e) et établie sur la base des informations figurant au registre du syndicat à la date indiquée. Elle est valable uniquement pour la situation connue à ce jour.`
                    ),
                    fontSize: 9.5, color: BRAND.inkMid, lineHeight: 1.75,
                  },
                ],
                fillColor: `${accentColor}08`,
                margin: [16, 14, 16, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0, vLineWidth: () => 0,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 20],
        },
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Template 23: Attestation de Propriété ────────────────────────────────────
    // Visual concept: Land registry title extract.
    // The TITRE FONCIER reference and OWNERSHIP FRACTION (tantiemes) are the primary facts.
    // Instantly distinguishable from attestation_residence: propriete = TF number strip + ownership
    // fraction cells. No shared layout with any other attestation template.
    case "attestation_propriete": {
      const prop         = input.property as PropertyInfo | undefined;
      const titreFoncier = (input.titreFoncier as string) || (input._lotTitreFoncier as string) || prop?.landRegistryReference || "—";
      const tantiemes    = (input.tantiemes as string) || (input._lotTantiemes as string) || "—";
      const lotNum       = (input.lotNumber as string) || (input._lotNumber as string) || "—";
      const propName     = (input._buildingName as string) || prop?.name || syndInfo.name;
      const propAddress  = (input._buildingAddress as string) || prop?.address || syndInfo.address;
      const propCity     = prop?.city || syndInfo.city;
      const attMemberCIN = (input._memberCIN as string) || "";
      const attLotSurface = (input._lotSurface as string) || "—";
      const attLotFloor  = (input._lotFloor as string) || "";
      const propDark     = adjustColorBrightness(accentColor, -20);
      content = [
        ...header,
        // ── Land-registry-style authority band ───────────────────────────────
        // Two segments: document title (accent bg) + TF reference (deep accent bg)
        // The TF number is the document's unique identifier — equivalent to a case number.
        {
          table: {
            widths: ["*", "auto"],
            body: [[
              {
                stack: [
                  { text: "ATTESTATION DE PROPRIÉTÉ IMMOBILIÈRE", fontSize: 9, bold: true, color: BRAND.surfaceCard, characterSpacing: 0.4, margin: [0, 0, 0, 4] },
                  { text: `${syndInfo.name}  ·  Syndicat de Copropriété`, fontSize: 7, color: `${BRAND.surfaceCard}99` },
                ],
                fillColor: accentColor,
                margin: [16, 12, 12, 12],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "TITRE FONCIER", fontSize: 5, bold: true, color: `${BRAND.surfaceCard}99`, characterSpacing: 0.8, alignment: "right" as const, margin: [0, 0, 0, 3] },
                  { text: titreFoncier !== "—" ? titreFoncier : docNum, fontSize: 11, bold: true, color: BRAND.surfaceCard, alignment: "right" as const },
                  { text: today, fontSize: 6.5, color: `${BRAND.surfaceCard}99`, alignment: "right" as const, margin: [0, 3, 0, 0] },
                ],
                fillColor: adjustColorBrightness(accentColor, -20),
                margin: [12, 12, 14, 12],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0, vLineWidth: () => 0,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 0],
        },
        // ── 4-cell ownership facts strip ─────────────────────────────────────
        // The lot number at 16pt is the visual anchor — this is the FIRST thing
        // an administrator's eye finds when scanning for ownership information.
        {
          table: {
            widths: ["*", "*", "*", "*"],
            body: [[
              {
                stack: [
                  { text: "N° DE LOT", fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.6, margin: [0, 0, 0, 5] },
                  { text: lotNum, fontSize: 18, bold: true, color: accentColor, characterSpacing: 1 },
                ],
                fillColor: BRAND.surface,
                margin: [14, 12, 14, 12],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "TITRE FONCIER", fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.6, margin: [0, 0, 0, 5] },
                  { text: titreFoncier, fontSize: 10, bold: true, color: BRAND.ink, lineHeight: 1.2 },
                ],
                fillColor: BRAND.surfaceCard,
                margin: [14, 12, 14, 12],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "QUOTE-PART (‰)", fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.6, margin: [0, 0, 0, 5] },
                  { text: tantiemes !== "—" ? `${tantiemes} ‰` : "—", fontSize: 10, bold: true, color: BRAND.ink },
                ],
                fillColor: BRAND.surface,
                margin: [14, 12, 14, 12],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "SURFACE PRIVATIVE", fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.6, margin: [0, 0, 0, 5] },
                  { text: attLotSurface !== "—" ? attLotSurface : "—", fontSize: 10, bold: true, color: BRAND.ink },
                  ...(attLotFloor ? [{ text: `Étage ${attLotFloor === "0" ? "RDC" : attLotFloor}`, fontSize: 7.5, color: BRAND.muted, margin: [0, 3, 0, 0] as [number, number, number, number] }] : []),
                ],
                fillColor: BRAND.surfaceCard,
                margin: [14, 12, 14, 12],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.7 : 0,
            vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i > 0 && i < node.table.widths.length ? 0.4 : 0.7,
            hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 8, 0, 18],
        },
        // ── Property + Owner 2-column identification ──────────────────────────
        {
          columns: [
            {
              stack: [
                { text: "BIEN IMMOBILIER", fontSize: 6, bold: true, color: propDark, characterSpacing: 0.8, margin: [0, 0, 0, 8] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 230, y2: 0, lineWidth: 1, lineColor: accentColor }], margin: [0, 0, 0, 10] },
                { text: propName, fontSize: 12, bold: true, color: BRAND.ink, margin: [0, 0, 0, 4] },
                { text: [propAddress, propCity].filter(Boolean).join(", ") || "—", fontSize: 9, color: BRAND.muted },
              ],
              width: "50%",
            },
            {
              stack: [
                { text: "PROPRIÉTAIRE ATTESTÉ(E)", fontSize: 6, bold: true, color: propDark, characterSpacing: 0.8, margin: [0, 0, 0, 8] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 230, y2: 0, lineWidth: 1, lineColor: accentColor }], margin: [0, 0, 0, 10] },
                { text: member || t("notRenseigne", lang), fontSize: 12, bold: true, color: BRAND.ink, margin: [0, 0, 0, 4] },
                ...(attMemberCIN ? [{ text: `CIN : ${attMemberCIN}`, fontSize: 9, color: BRAND.muted }] : []),
                { text: `Réf. doc. : ${docNum}`, fontSize: 8, color: BRAND.mutedLight, margin: [0, 6, 0, 0] },
              ],
              width: "50%",
            },
          ],
          columnGap: 28,
          margin: [0, 0, 0, 20],
        },
        // ── Ownership certification text ──────────────────────────────────────
        {
          table: {
            widths: [3, "*"],
            body: [[
              {
                canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 80, color: accentColor }],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "ATTESTATION DE PROPRIÉTÉ IMMOBILIÈRE", fontSize: 6, bold: true, color: BRAND.muted, characterSpacing: 0.8, margin: [0, 0, 0, 8] },
                  {
                    text: body || (
                      `Le Syndicat de Copropriété ${syndInfo.name} atteste que ${member || "[NOM DU PROPRIÉTAIRE]"}` +
                      (attMemberCIN ? `, titulaire de la CIN N° ${attMemberCIN},` : "") +
                      ` est propriétaire du lot N° ${lotNum} de la résidence ${propName}, inscrit au Titre Foncier N° ${titreFoncier}, ` +
                      `avec une quote-part de ${tantiemes !== "—" ? `${tantiemes} ‰` : "[tantiemes]"} tantiièmes.\n\n` +
                      `Cette attestation est établie sur la base des documents figurant au registre du syndicat et est valable pour la situation connue à ce jour.`
                    ),
                    fontSize: 9.5, color: BRAND.inkMid, lineHeight: 1.75,
                  },
                ],
                fillColor: `${accentColor}08`,
                margin: [16, 14, 16, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: () => 0, vLineWidth: () => 0,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 16],
        },
        // ── Legal disclaimer — regulatory notice style ────────────────────────
        {
          table: {
            widths: ["auto", "*"],
            body: [[
              {
                text: "⚠",
                fontSize: 13, color: BRAND.warningDark,
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                margin: [12, 10, 8, 10],
              },
              {
                text: "Ce document ne constitue pas un titre de propriété au sens du droit foncier marocain. Pour tout acte de disposition juridique (vente, hypothèque, donation), veuillez vous référer au registre foncier compétent.",
                fontSize: 8, color: BRAND.warningDark, lineHeight: 1.5,
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                margin: [0, 10, 14, 10],
              },
            ]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0,
            vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i === 0 || i === node.table.widths.length ? 0.8 : 0,
            hLineColor: () => BRAND.warning, vLineColor: () => BRAND.warning,
            fillColor: () => BRAND.warningLight,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 20],
        },
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Template 24: Attestation de Paiement des Charges ─────────────────────────
    case "attestation_paiement": {
      const periode = (input.periode as string) || `Exercice ${new Date().getFullYear()}`;
      const montant = (input.montant as string) || "—";
      const totalCharged = (input._totalCharged as string) || "—";
      const statusPaiement = (input._paiementStatus as string) || "";
      const inGoodStanding = !statusPaiement || statusPaiement === "EN RÈGLE";
      const lotNum = (input.lotNumber as string) || (input._lotNumber as string) || "—";
      const lastPaid = (input._lastPaidDate as string) || "";
      const appelCount = (input._appelCount as string) || "";

      // Parse payment history when coming from DB entity loader
      type AppelHistoryRow = { period: string; amount: number; status: string; paidDate: string | null };
      let paymentHistory: AppelHistoryRow[] = [];
      const rawHist = input._paymentHistoryJson as string | undefined;
      if (rawHist) { try { paymentHistory = JSON.parse(rawHist); } catch { /* ignore */ } }

      const statusColor = inGoodStanding ? BRAND.success : BRAND.warning;
      const statusBg    = inGoodStanding ? BRAND.successLight : BRAND.warningLight;
      const statusText  = inGoodStanding
        ? "✓  EN RÈGLE — Situation comptable vérifiée à la date de délivrance"
        : `⚠  ${statusPaiement || "ATTENTION — CHARGES EN COURS"}`;

      content = [
        ...header,
        buildCertificateFrame(accentColor, lang),
        { text: "ATTESTATION DE PAIEMENT DES CHARGES", fontSize: 18, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        // Status badge — shown prominently before the identity table
        {
          table: {
            widths: ["*"],
            body: [[{
              columns: [
                {
                  text: statusText,
                  fontSize: 10, bold: true, color: inGoodStanding ? BRAND.successDeep : BRAND.warningDark, width: "*",
                  margin: [0, 0, 0, 0],
                },
                ...(lastPaid ? [{
                  text: `Dernier paiement : ${lastPaid}`,
                  fontSize: 8, color: BRAND.muted, alignment: "right" as const, width: "auto",
                }] : []),
              ],
              fillColor: statusBg,
              margin: [14, 10, 14, 10],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 1.5 : 0,
            vLineWidth: () => 0,
            hLineColor: () => statusColor,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 16],
        },
        metaTable([
          [t("metaDeliveredTo", lang), member || t("notRenseigne", lang)],
          [t("metaIssueDate", lang), today],
          [t("metaIssuer", lang), syndInfo.name],
          ["Période couverte :", periode],
          ...(lotNum !== "—" ? [["N° de lot :", lotNum] as [string, string]] : []),
          ...(montant !== "—" ? [["Montant total réglé :", `${montant} MAD`] as [string, string]] : []),
          ...(totalCharged !== "—" ? [["Montant total appelé :", `${totalCharged} MAD`] as [string, string]] : []),
          ...(appelCount ? [["Nombre d'appels :", `${appelCount} appel(s) de fonds`] as [string, string]] : []),
          ...(syndInfo.registrationNumber ? [[t("metaRegRef", lang), syndInfo.registrationNumber] as [string, string]] : []),
        ], accentColor),
        contentSection(
          "Attestation de Bonne Foi de Paiement",
          body || (
            `Le Syndicat de Copropriété ${syndInfo.name} certifie que :\n\n` +
            `${member || "[NOM DU MEMBRE]"}, copropriétaire du lot N° ${lotNum},\n\n` +
            (inGoodStanding
              ? `est en règle de paiement de ses charges de copropriété pour la période : ${periode}.\n\n` +
                `Montant total réglé : ${montant !== "—" ? montant + " MAD" : "[montant]"}.\n\n` +
                `À la date de délivrance de la présente attestation, aucune somme n'est due au titre des charges communes exigibles pour la période mentionnée ci-dessus.`
              : `est en cours de régularisation de ses charges de copropriété pour la période : ${periode}.\n\n` +
                `Montant total réglé à ce jour : ${montant !== "—" ? montant + " MAD" : "[montant]"}.\n\n` +
                `Veuillez régulariser votre situation dans les plus brefs délais.`) +
            `\n\nCette attestation est établie sur la base des écritures comptables du syndicat et est délivrée ` +
            `à la demande de l'intéressé(e) pour servir et valoir ce que de droit.`
          ),
          accentColor,
          isArabic,
        ),
        // Payment history table — only rendered when real DB data is available
        ...(paymentHistory.length > 0 ? [{
          stack: [
            { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 20, color: accentColor }], margin: [0, 0, 0, 0] },
            { text: "HISTORIQUE DES APPELS DE FONDS", fontSize: 8.5, bold: true, color: BRAND.surfaceCard, margin: [0, -17, 0, 10] },
            {
              table: {
                widths: ["*", 80, 80, 70],
                body: [
                  [
                    { text: "PÉRIODE", fontSize: 7.5, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [8, 5, 8, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                    { text: "MONTANT", fontSize: 7.5, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "right" as const, margin: [4, 5, 8, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                    { text: "DATE PAIEMENT", fontSize: 7.5, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "center" as const, margin: [4, 5, 4, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                    { text: "STATUT", fontSize: 7.5, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "center" as const, margin: [4, 5, 8, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                  ],
                  ...paymentHistory.map((a, i) => {
                    const isPaid = a.status === "paid";
                    const isOverdue = a.status === "overdue";
                    const bg = i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard;
                    const statusLabel = isPaid ? "PAYÉ" : isOverdue ? "EN RETARD" : "EN ATTENTE";
                    const statusColor2 = isPaid ? BRAND.successDark : isOverdue ? BRAND.destructiveDark : BRAND.warningDark;
                    return [
                      { text: a.period, fontSize: 8, color: BRAND.inkMid, fillColor: bg, margin: [8, 5, 8, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                      { text: `${a.amount.toLocaleString("fr-MA")} MAD`, fontSize: 8, bold: true, color: BRAND.ink, fillColor: bg, alignment: "right" as const, margin: [4, 5, 8, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                      { text: a.paidDate || "—", fontSize: 8, color: BRAND.muted, fillColor: bg, alignment: "center" as const, margin: [4, 5, 4, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                      { text: statusLabel, fontSize: 7.5, bold: true, color: statusColor2, fillColor: bg, alignment: "center" as const, margin: [4, 5, 8, 5], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                    ];
                  }),
                ],
              },
              layout: {
                hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0.3,
                vLineWidth: () => 0,
                hLineColor: () => BRAND.border,
                paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
              },
            },
          ],
          margin: [0, 0, 0, 16],
        }] : []),
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Appel de Fonds ────────────────────────────────────────────────────────
    case "appel_de_fonds": {
      const chargeTypeMap: Record<string, string> = {
        charges_courantes: "Charges courantes",
        fonds_de_reserve: "Fonds de réserve",
        travaux: "Travaux",
        charges_exceptionnelles: "Charges exceptionnelles",
        eau: "Eau",
        electricite: "Électricité",
        ascenseur: "Ascenseur",
      };
      const chargeType = chargeTypeMap[(input._chargeType as string) ?? "charges_courantes"] ?? (input._chargeType as string) ?? "Charges courantes";
      const amount = Number(input.amount as string ?? 0);
      const dueDate = (input.dueDate as string) || (input._dueDate as string) || "—";
      const receiptNum = (input._receiptNumber as string) || docNum;
      const lotNumber = (input._lotNumber as string) || "—";
      const floor = (input._lotFloor as string) || "—";
      const surface = (input._lotSurface as string) || "—";
      const tantiemes = (input._lotTantiemes as string) || "—";
      const titreFoncier = (input._lotTitreFoncier as string) || "—";
      const buildingName2 = (input._buildingName as string) || (input.property as PropertyInfo | undefined)?.name || "—";
      const buildingAddress = (input._buildingAddress as string) || "";
      const periode = (input.periode as string) || today;

      // ── ENTERPRISE FAMILY: Image 1 — two-column layout with 155pt sidebar ──
      footerFn = (_p: number, _ps: number) => ({
        columns: [
          { text: "Ce document a été généré électroniquement. Aucune signature manuscrite n'est requise.", fontSize: 6.5, color: BRAND.muted, margin: [40, 12, 0, 0] },
          { text: `${_p} / ${_ps}`, fontSize: 8, bold: true, color: BRAND.ink, alignment: "right" as const, margin: [0, 12, 40, 0] },
        ],
      });

      const adfMainCol: unknown[] = [
        { text: "APPEL DE FONDS", fontSize: 36, bold: true, color: BRAND.ink, margin: [0, 6, 0, 2] },
        { text: `SYNDICAT DE COPROPRIÉTÉ — ${syndInfo.name.toUpperCase()}`, fontSize: 8, bold: true, color: BRAND.muted, characterSpacing: 0.3, margin: [0, 0, 0, 10] },
        buildDocumentOverviewGrid([
          ["COPROPRIÉTAIRE", (input.memberName as string) || member || "—"],
          ["IMMEUBLE", buildingName2],
          ["N° LOT", `Lot ${lotNumber} — Étage ${floor}`],
          ["SURFACE", surface],
          ["TITRE FONCIER", titreFoncier],
          ["TANTIEMES", tantiemes],
          ["PÉRIODE", periode],
          ["RÉFÉRENCE", receiptNum],
        ], accentColor) as object,
        kpiRow([
          { icon: "◈", label: "MONTANT DÛ", value: `${amount.toLocaleString("fr-MA")} MAD`, valueColor: accentColor },
          { icon: "📅", label: "ÉCHÉANCE", value: dueDate, valueColor: BRAND.warningDark },
          { icon: "●", label: "TYPE CHARGES", value: chargeType, valueColor: BRAND.ink },
        ], accentColor) as object,
        contentSection("DÉTAILS DE L'APPEL DE FONDS", [
          `Nature des charges : ${chargeType}`,
          `Période : ${periode}`,
          `Montant appelé : ${amount.toLocaleString("fr-MA")} MAD`,
          `Date d'échéance : ${dueDate}`,
          `Référence : ${receiptNum}`,
        ].join("\n"), accentColor) as object,
        contentSection("MODALITÉS DE PAIEMENT", [
          "• Virement bancaire au compte du syndicat",
          "• Chèque libellé à l'ordre du syndicat de copropriété",
          "• Remise en espèces au bureau syndical (contre reçu)",
          ...(syndInfo.bankName ? [`\nBanque : ${syndInfo.bankName}`] : []),
          ...(syndInfo.bankIban ? [`IBAN : ${syndInfo.bankIban}`] : []),
          ...(syndInfo.bankBic  ? [`BIC : ${syndInfo.bankBic}`]  : []),
          `\nRéférence à mentionner : ${receiptNum}`,
        ].join("\n"), accentColor) as object,
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures) as object,
        buildOfficialSeal(syndInfo.name, accentColor, undefined, today) as object,
      ];

      const adfSidebarCol: unknown[] = [
        buildSidebarInfoPanel("INFORMATIONS COPROPRIÉTAIRE", "◎", [
          ["NOM", (input.memberName as string) || member || "—"],
          ["IMMEUBLE", buildingName2],
          ["LOT", `Lot ${lotNumber}`],
          ["ÉTAGE", floor],
          ["SURFACE", surface],
          ["TANTIEMES", tantiemes],
        ], accentColor) as object,
        buildSidebarInfoPanel("RÉSUMÉ FINANCIER", "◈", [
          ["MONTANT DÛ", `${amount.toLocaleString("fr-MA")} MAD`],
          ["PÉRIODE", periode],
          ["ÉCHÉANCE", dueDate],
          ["TYPE", chargeType],
        ], accentColor) as object,
        buildValidationStatusPanel("generated", accentColor, lang) as object,
        buildDigitalVerificationPanel(qrDataUrl, docNum, verifyUrl, accentColor, lang) as object,
      ];

      content = [
        ...buildCorporateDocHeader(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, input.docStatus as string | null ?? null),
        { columns: [{ stack: adfMainCol, width: "*" }, { stack: adfSidebarCol, width: 155 }], columnGap: 14 },
      ];
      break;
    }

    // ── Reçu de Paiement ─────────────────────────────────────────────────────
    case "recu_paiement": {
      const paidAmount = Number(input.amount as string ?? 0);
      const paidDate = (input._paidDate as string) || today;
      const paymentMethod = (input._paymentMethod as string) || "—";
      const receiptRef = (input._receiptNumber as string) || docNum;
      const appelRef = (input._appelId as string) || "—";
      const periodeRec = (input.periode as string) || today;

      content = [
        ...header,
        { text: "REÇU DE PAIEMENT", style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: `N° ${receiptRef}`, fontSize: 10, bold: true, color: BRAND.muted, alignment: "center" as const, margin: [0, 0, 0, 20] },
        // Receipt box
        {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: "NOUS SOUSSIGNÉS", fontSize: 8, color: BRAND.mutedLight, margin: [0, 0, 0, 4] },
                { text: syndInfo.name.toUpperCase(), fontSize: 13, bold: true, color: BRAND.ink, margin: [0, 0, 0, 2] },
                { text: [syndInfo.address, syndInfo.city].filter(Boolean).join(", "), fontSize: 8.5, color: BRAND.muted, margin: [0, 0, 0, 10] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 467, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }] },
                { text: "DÉCLARONS AVOIR REÇU DE", fontSize: 8, color: BRAND.mutedLight, margin: [0, 10, 0, 4] },
                { text: (input.memberName as string) || member || "—", fontSize: 13, bold: true, color: BRAND.ink, margin: [0, 0, 0, 2] },
                { text: `Lot ${(input._lotNumber as string) || "—"} — ${(input._buildingName as string) || "—"}`, fontSize: 8.5, color: BRAND.muted, margin: [0, 0, 0, 10] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 467, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }] },
                { text: "LA SOMME DE", fontSize: 8, color: BRAND.mutedLight, margin: [0, 10, 0, 6] },
                { text: `${paidAmount.toLocaleString("fr-MA")} MAD`, fontSize: 22, bold: true, color: accentColor, margin: [0, 0, 0, 2] },
                {
                  columns: [
                    { text: `Période : ${periodeRec}`, fontSize: 8.5, color: BRAND.muted },
                    { text: `Mode : ${paymentMethod}`, fontSize: 8.5, color: BRAND.muted, alignment: "right" as const },
                  ],
                  margin: [0, 0, 0, 10],
                },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 467, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }] },
                { text: `Référence appel : ${appelRef}  •  Date de paiement : ${paidDate}`, fontSize: 7.5, color: BRAND.mutedLight, margin: [0, 8, 0, 0] },
              ],
              fillColor: BRAND.surfaceAlt,
              margin: [24, 20, 24, 20],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
              borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border],
            }]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0,
            vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i === 0 || i === node.table.widths.length ? 0.8 : 0,
            hLineColor: () => BRAND.border, vLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 24],
        },
        signatureBlock("Le Trésorier du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Facture (ENTERPRISE FAMILY — Image 1 layout) ─────────────────────────
    case "facture": {
      const invoiceAmount = Number(input.amount as string ?? 0);
      const invoiceDue = (input.dueDate as string) || "—";
      const recipient = (input.memberName as string) || member || (input._recipient as string) || "—";
      const invoiceRef = (input._invoiceRef as string) || docNum;
      const invoiceStatus = (input._invoiceStatus as string) || "draft";
      const invoiceStatusLabel = ({ draft: "BROUILLON", sent: "ENVOYÉE", paid: "PAYÉE", overdue: "EN RETARD", cancelled: "ANNULÉE" } as Record<string, string>)[invoiceStatus] || invoiceStatus.toUpperCase();

      // Enterprise footer
      footerFn = (_page: number, _pages: number) => ({
        columns: [
          { text: "Ce document a été généré électroniquement. Aucune signature manuscrite n'est requise.", fontSize: 6.5, color: BRAND.muted, margin: [40, 12, 0, 0] },
          { text: `${_page} / ${_pages}`, fontSize: 8, bold: true, color: BRAND.ink, alignment: "right" as const, margin: [0, 12, 40, 0] },
        ],
      });

      // Parse lines — may come from DB (JSON string) or be passed directly
      let invoiceLines: Array<{ label: string; qty: number; unitPrice: number; total: number }>;
      const rawLines = input._invoiceLines;
      if (typeof rawLines === "string" && rawLines.startsWith("[")) {
        try {
          invoiceLines = JSON.parse(rawLines);
        } catch {
          invoiceLines = [{ label: input.title || "Prestation", qty: 1, unitPrice: invoiceAmount, total: invoiceAmount }];
        }
      } else if (Array.isArray(rawLines)) {
        invoiceLines = rawLines as Array<{ label: string; qty: number; unitPrice: number; total: number }>;
      } else {
        invoiceLines = [{ label: input.title || "Prestation", qty: 1, unitPrice: invoiceAmount, total: invoiceAmount }];
      }
      const totalHT = invoiceLines.reduce((s, l) => s + l.total, 0);
      const tva = totalHT * 0.20;
      const totalTTC = totalHT + tva;

      const lineRows = invoiceLines.map((l, i) => [
        {
          text: l.label, fontSize: 9, margin: [8, 6, 4, 6],
          fillColor: i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard,
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        {
          text: l.qty.toLocaleString("fr-MA"), fontSize: 9, alignment: "center" as const, margin: [4, 6, 4, 6],
          fillColor: i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard,
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        {
          text: `${l.unitPrice.toLocaleString("fr-MA")} MAD`, fontSize: 9, alignment: "right" as const, margin: [4, 6, 8, 6],
          fillColor: i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard,
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        {
          text: `${l.total.toLocaleString("fr-MA")} MAD`, fontSize: 9, bold: true, alignment: "right" as const, margin: [4, 6, 8, 6],
          fillColor: i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard,
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
      ]);

      // ── ENTERPRISE FAMILY: Image 1 — two-column layout with 155pt sidebar ──
      const factureLinesTable = {
        table: {
          widths: ["*", 50, 80, 80],
          body: [
            [
              { text: "DÉSIGNATION", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [8, 6, 4, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              { text: "QTÉ", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "center" as const, margin: [4, 6, 4, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              { text: "P.U.", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "right" as const, margin: [4, 6, 8, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              { text: "TOTAL", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "right" as const, margin: [4, 6, 8, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
            ],
            ...lineRows,
          ],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0.4,
          vLineWidth: () => 0, hLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 10],
      };

      const factureMainCol: unknown[] = [
        { text: "FACTURE", fontSize: 36, bold: true, color: BRAND.ink, margin: [0, 6, 0, 2] },
        { text: `SYNDICAT DE COPROPRIÉTÉ — ${syndInfo.name.toUpperCase()}`, fontSize: 8, bold: true, color: BRAND.muted, characterSpacing: 0.3, margin: [0, 0, 0, 10] },
        buildDocumentOverviewGrid([
          ["N° FACTURE", invoiceRef],
          ["DATE", (input._invoiceDate as string) || today],
          ["ÉCHÉANCE", invoiceDue],
          ["STATUT", invoiceStatusLabel],
          ["FACTURÉ À", recipient],
          ["ICE SYNDICAT", syndInfo.registrationNumber || "—"],
          ["RÉFÉRENCE", docNum],
          ["VERSION", version || "v1.0"],
        ], accentColor) as object,
        kpiRow([
          { icon: "◈", label: "TOTAL HT", value: `${totalHT.toLocaleString("fr-MA")} MAD`, valueColor: accentColor },
          { icon: "%", label: "TVA 20%", value: `${tva.toLocaleString("fr-MA")} MAD`, valueColor: BRAND.warningDark },
          { icon: "✓", label: "TOTAL TTC", value: `${totalTTC.toLocaleString("fr-MA")} MAD`, valueColor: BRAND.successDark },
        ], accentColor) as object,
        factureLinesTable,
        {
          stack: [
            { columns: [{ text: "Total HT", fontSize: 9, color: BRAND.muted, width: "*" }, { text: `${totalHT.toLocaleString("fr-MA")} MAD`, fontSize: 9, width: "auto", alignment: "right" as const }], margin: [0, 4, 0, 2] },
            { columns: [{ text: "TVA (20%)", fontSize: 9, color: BRAND.muted, width: "*" }, { text: `${tva.toLocaleString("fr-MA")} MAD`, fontSize: 9, width: "auto", alignment: "right" as const }], margin: [0, 2, 0, 6] },
            { canvas: [{ type: "line", x1: 0, y1: 0, x2: 340, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }] },
            { columns: [{ text: "TOTAL TTC", fontSize: 11, bold: true, color: BRAND.ink, width: "*" }, { text: `${totalTTC.toLocaleString("fr-MA")} MAD`, fontSize: 11, bold: true, color: accentColor, width: "auto", alignment: "right" as const }], margin: [0, 8, 0, 0] },
          ],
          fillColor: BRAND.surface,
          margin: [0, 0, 0, 14],
        },
        signatureBlock("Le Trésorier du Syndicat", syndInfo.name, accentColor, true, lang, signatures) as object,
        buildOfficialSeal(syndInfo.name, accentColor, undefined, today) as object,
      ];

      const factureSidebarCol: unknown[] = [
        buildSidebarInfoPanel("INFORMATIONS CLIENT", "◎", [
          ["DESTINATAIRE", recipient],
          ["SYNDICAT", syndInfo.name],
          ["ADRESSE", syndInfo.address || "—"],
          ["CONTACT", syndInfo.phone || "—"],
          ...(syndInfo.bankName ? [["BANQUE", syndInfo.bankName] as [string, string]] : []),
          ...(syndInfo.bankIban ? [["IBAN", syndInfo.bankIban] as [string, string]] : []),
        ], accentColor) as object,
        buildSidebarInfoPanel("RÉSUMÉ FINANCIER", "◈", [
          ["SOUS-TOTAL HT", `${totalHT.toLocaleString("fr-MA")} MAD`],
          ["TVA 20%", `${tva.toLocaleString("fr-MA")} MAD`],
          ["TOTAL TTC", `${totalTTC.toLocaleString("fr-MA")} MAD`],
          ["MODE PAIEMENT", "Virement bancaire"],
        ], accentColor) as object,
        buildValidationStatusPanel(invoiceStatus || "draft", accentColor, lang) as object,
        buildDigitalVerificationPanel(qrDataUrl, docNum, verifyUrl, accentColor, lang) as object,
      ];

      content = [
        ...buildCorporateDocHeader(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, input.docStatus as string | null ?? null),
        { columns: [{ stack: factureMainCol, width: "*" }, { stack: factureSidebarCol, width: 155 }], columnGap: 14 },
      ];
      break;
    }

    // ── Budget Prévisionnel ───────────────────────────────────────────────────
    case "budget_previsionnel": {
      const budgetYear    = (input.exercice as string) || (input._kpiYear as string) || String(new Date().getFullYear());
      const totalAmount   = (input._totalAmount   as string) || (input._kpiBudgetTotal   as string) || "0";
      const chargesAmount = (input._chargesAmount as string) || (input._kpiBudgetCharges as string) || "0";
      const fondsReserve  = (input._fondsReserve  as string) || (input._kpiBudgetReserve as string) || "0";
      const budgetBuilding = (input._buildingName as string) || buildingName || "—";
      const rawBudgetLines = (input._budgetLines as string) || "";
      const budgetStatus  = (input._budgetStatus as string) || (input._kpiBudgetStatus as string) || "draft";
      const statusLabel   = ({ draft: "BROUILLON", voted: "VOTÉ", approved: "APPROUVÉ", archived: "ARCHIVÉ" } as Record<string, string>)[budgetStatus] || budgetStatus.toUpperCase();
      const statusColor   = ({ voted: BRAND.successDark, approved: BRAND.primary, archived: BRAND.muted, draft: BRAND.warningDark } as Record<string, string>)[budgetStatus] || BRAND.warningDark;

      // Parse budget lines from text format into structured data
      const parsedLines: Array<{ category: string; label: string; amountAnnual: number }> = rawBudgetLines
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          const parts = l.trim().split(/\s{2,}/);
          if (parts.length >= 3) {
            const amountStr = parts[parts.length - 1].replace(/\s|MAD/g, "").replace(",", ".");
            return {
              category: parts[0].trim(),
              label:    parts.slice(1, -1).join(" ").trim() || parts[0].trim(),
              amountAnnual: parseFloat(amountStr) || 0,
            };
          }
          return null;
        })
        .filter(Boolean) as Array<{ category: string; label: string; amountAnnual: number }>;

      content = [
        ...header,
        { text: "BUDGET PRÉVISIONNEL", style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 4] },
        {
          columns: [
            { text: `Exercice ${budgetYear}  •  ${budgetBuilding}`, fontSize: 8.5, color: BRAND.muted, width: "*" },
            { text: statusLabel, fontSize: 8, bold: true, color: BRAND.surfaceCard, background: statusColor, margin: [0, 0, 0, 0], width: "auto",
              // pdfmake doesn't have background on text; use inline table
            },
          ],
          alignment: "center" as const,
          margin: [0, 0, 0, 4],
        },
        { text: statusLabel, fontSize: 8, bold: true, color: statusColor, alignment: "center" as const, margin: [0, 0, 0, 20] },

        // ── Identification card ──────────────────────────────────────────────
        metaTable([
          ["EXERCICE BUDGÉTAIRE",  budgetYear],
          ["IMMEUBLE",             budgetBuilding],
          ["STATUT BUDGET",        statusLabel],
          ["ÉTABLI PAR",           (input.etabliPar as string) || (input.officeHolders as OfficeHolders | undefined)?.treasurer?.fullName || syndInfo.name],
          ["CHARGES COURANTES",    `${chargesAmount} MAD`],
          ["FONDS DE RÉSERVE",     `${fondsReserve} MAD`],
        ], accentColor),

        // ── Enterprise financial dashboard ──────────────────────────────────
        ...financialDashboard(input as Record<string, unknown>, accentColor),

        // ── Top-line budget summary ──────────────────────────────────────────
        {
          table: {
            widths: ["*", "*", "*"],
            body: [[
              {
                stack: [
                  { text: "CHARGES TOTALES",  fontSize: 7, bold: true, color: BRAND.mutedLight, margin: [0, 0, 0, 4] },
                  { text: `${chargesAmount} MAD`, fontSize: 15, bold: true, color: accentColor },
                  { text: "Charges communes + services", fontSize: 6.5, color: BRAND.muted, margin: [0, 3, 0, 0] },
                ],
                fillColor: BRAND.successLight,
                margin: [12, 14, 12, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "FONDS DE RÉSERVE",  fontSize: 7, bold: true, color: BRAND.mutedLight, margin: [0, 0, 0, 4] },
                  { text: `${fondsReserve} MAD`, fontSize: 15, bold: true, color: BRAND.info },
                  { text: "Fonds de travaux légal", fontSize: 6.5, color: BRAND.muted, margin: [0, 3, 0, 0] },
                ],
                fillColor: BRAND.infoLight,
                margin: [12, 14, 12, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
              {
                stack: [
                  { text: "BUDGET TOTAL",       fontSize: 7, bold: true, color: BRAND.mutedLight, margin: [0, 0, 0, 4] },
                  { text: `${totalAmount} MAD`, fontSize: 15, bold: true, color: BRAND.ink },
                  { text: `Statut : ${statusLabel}`, fontSize: 6.5, color: statusColor, bold: true, margin: [0, 3, 0, 0] },
                ],
                fillColor: BRAND.surface,
                margin: [12, 14, 12, 14],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.6 : 0,
            vLineWidth: () => 0,
            hLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 16],
        },

        // ── Budget lines table ───────────────────────────────────────────────
        ...(parsedLines.length > 0 ? [
          {
            table: { widths: ["*"], body: [[{ text: "DÉTAIL DES POSTES BUDGÉTAIRES", fontSize: 8.5, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [14, 6, 14, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }]] },
            layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
            margin: [0, 4, 0, 4],
          },
          budgetLinesTable(parsedLines, accentColor),
        ] : rawBudgetLines ? [contentSection("DÉTAIL DES POSTES BUDGÉTAIRES", rawBudgetLines, accentColor)] : []),

        contentSection("RÉPARTITION DES CHARGES", "La répartition des charges entre copropriétaires s'effectue selon les tantièmes définis dans le règlement de copropriété. Chaque lot contribue proportionnellement à sa quote-part.", accentColor),
        contentSection("MODALITÉS D'APPEL DE FONDS", (input.synthese as string) || "Les appels de fonds seront émis trimestriellement conformément au présent budget prévisionnel voté par l'Assemblée Générale.", accentColor),
        multiSignatoryBlock(input.officeHolders as OfficeHolders | undefined, accentColor, lang, signatures, syndInfo.name),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Décompte des Charges ──────────────────────────────────────────────────
    case "decompte_charges": {
      const decompteYear     = (input.exercice as string) || (input._decompteYear as string) || String(new Date().getFullYear());
      const totalProvisioned = Number((input.totalPrevu   as string) || "0");
      const totalActual      = Number((input.totalRealise as string) || "0");
      const totalPaid        = Number((input._decompteTotalPaid as string) || "0");
      const totalOverdue     = Number((input._decompteTotalOverdue as string) || "0");
      const difference       = totalActual - totalProvisioned;
      const appelCount       = (input._decompteAppelCount as string) || "0";
      const breakdownText    = (input._decompteBreakdown as string) || "";
      const collRate         = totalProvisioned > 0 ? Math.round((totalPaid / totalProvisioned) * 100) : 0;

      // Data validation — warn if no real data available
      const hasRealData = totalProvisioned > 0 || totalActual > 0;

      content = [
        ...header,
        { text: "DÉCOMPTE ANNUEL DES CHARGES", style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: `Exercice ${decompteYear}  •  Copropriétaire : ${(input.memberName as string) || member || "—"}`, fontSize: 8.5, color: BRAND.muted, alignment: "center" as const, margin: [0, 0, 0, 20] },

        // ── Identification ───────────────────────────────────────────────────
        metaTable([
          ["COPROPRIÉTAIRE",      (input.memberName as string) || member || "—"],
          ["LOT / APPARTEMENT",   `Lot ${(input._lotNumber as string) || "—"} — Étage ${(input._lotFloor as string) || "—"}`],
          ["TANTIEMES",           (input._lotTantiemes as string) || "—"],
          ["EXERCICE",            decompteYear],
          ["APPELS DE FONDS",     `${appelCount} appel(s) émis`],
          ["TITRE FONCIER",       (input._lotTitreFoncier as string) || "—"],
        ], accentColor),

        // ── Data warning if no real data ────────────────────────────────────
        ...(!hasRealData ? [{
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                { text: "⚠  DONNÉES INSUFFISANTES", fontSize: 9, bold: true, color: BRAND.warningDark, margin: [0, 0, 0, 3] },
                { text: "Aucun appel de fonds trouvé pour ce lot et cet exercice. Veuillez vérifier le lotId et l'exercice fournis.", fontSize: 8, color: BRAND.warningDark },
              ],
              fillColor: BRAND.warningLight,
              margin: [14, 10, 14, 10],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
              borderColor: [BRAND.warning, BRAND.warning, BRAND.warning, BRAND.warning],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => BRAND.warning, vLineColor: () => BRAND.warning, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
          margin: [0, 0, 0, 16],
        }] : []),

        // ── Financial dashboard ──────────────────────────────────────────────
        ...financialDashboard(input as Record<string, unknown>, accentColor),

        // ── Charge comparison KPIs ───────────────────────────────────────────
        kpiRow([
          { label: "Provisions Versées",  value: `${totalProvisioned.toLocaleString("fr-MA")} MAD`,  bgColor: BRAND.surface },
          { label: "Charges Réelles",     value: `${totalActual.toLocaleString("fr-MA")} MAD`,        bgColor: BRAND.surface },
          { label: difference >= 0 ? "Rappel Dû" : "Avoir", value: `${Math.abs(difference).toLocaleString("fr-MA")} MAD`,
            valueColor: difference >= 0 ? BRAND.destructiveDark : BRAND.successDark,
            bgColor: difference >= 0 ? BRAND.destructiveLight : BRAND.successLight },
        ], accentColor),
        kpiRow([
          { label: "Total Payé",          value: `${totalPaid.toLocaleString("fr-MA")} MAD`,         valueColor: BRAND.successDark, bgColor: BRAND.successLight },
          { label: "Impayés / Retard",    value: `${totalOverdue.toLocaleString("fr-MA")} MAD`,      valueColor: totalOverdue > 0 ? BRAND.destructiveDark : BRAND.successDark, bgColor: totalOverdue > 0 ? BRAND.destructiveLight : BRAND.successLight },
          { label: "Taux de Paiement",    value: `${collRate}%`,                                     valueColor: collRate >= 90 ? BRAND.successDark : BRAND.destructiveDark, bgColor: BRAND.surface },
        ], accentColor),

        // Progress bar — payment rate
        {
          stack: [
            progressBar("Taux de Paiement des Provisions", collRate,
              `${totalPaid.toLocaleString("fr-MA")} MAD payé`, `${totalProvisioned.toLocaleString("fr-MA")} MAD prévu`, accentColor),
          ],
          margin: [0, 4, 0, 16],
        },

        // ── Breakdown by charge type ─────────────────────────────────────────
        ...(breakdownText ? [contentSection("RÉPARTITION PAR NATURE DE CHARGE", breakdownText, accentColor)] : []),

        // ── Balance explanation ──────────────────────────────────────────────
        contentSection(
          difference >= 0 ? "SOLDE : RAPPEL DE CHARGES" : "SOLDE : AVOIR EN VOTRE FAVEUR",
          difference >= 0
            ? `Un rappel de charges d'un montant de ${Math.abs(difference).toLocaleString("fr-MA")} MAD vous sera facturé.\n\nCe rappel correspond à la différence entre les charges réelles supportées par le syndicat et les provisions versées au cours de l'exercice ${decompteYear}.\n\nNombre d'appels de fonds émis : ${appelCount}.`
            : `Un avoir de ${Math.abs(difference).toLocaleString("fr-MA")} MAD sera reporté sur votre prochain appel de fonds ou remboursé sur demande.\n\nCet avoir correspond à l'excédent de vos provisions par rapport aux charges réelles de l'exercice ${decompteYear}.`,
          accentColor,
        ),

        ...(input.observations as string ? [contentSection("OBSERVATIONS", input.observations as string, accentColor)] : []),
        signatureBlock("Le Trésorier du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Rapport d'Élection ────────────────────────────────────────────────────
    case "rapport_election": {
      const electionTitle = (input._electionTitle as string) || input.title || "Élection du Conseil Syndical";
      const electionType = (input._electionType as string) || "board";
      const electionTypeLabel: Record<string, string> = {
        president: "Président du Syndicat",
        board: "Conseil Syndical",
        financial_committee: "Comité Financier",
        maintenance_committee: "Comité d'Entretien",
        building_representative: "Représentant d'Immeuble",
        special: "Élection Spéciale",
      };
      const startDate = (input._startDate as string) || today;
      const endDate = (input._endDate as string) || today;
      const eligibleCount = (input._eligibleCount as string) || "—";
      const participantCount = (input._participantCount as string) || "—";
      const quorumPercent = (input._quorumPercent as string) || "50";
      const quorumReached = (input._quorumReached as string) || "NON";
      const participationRate = (input._participationRate as string) || "—";
      const mandateDuration = (input._mandateDuration as string) || "—";
      const candidatesText = (input._candidates as string) || "Aucun candidat enregistré.";
      const invalidVotes = (input._invalidVotes as string) || "0";

      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, electionTitle),
        { text: "PROCÈS-VERBAL D'ÉLECTION", style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: electionTitle, fontSize: 11, bold: true, color: BRAND.inkMid, alignment: "center" as const, margin: [0, 0, 0, 14] },
        metaTable([
          ["TYPE D'ÉLECTION", electionTypeLabel[electionType] || electionType],
          ["PÉRIODE DE VOTE", `Du ${startDate} au ${endDate}`],
          ["ÉLECTEURS INSCRITS", eligibleCount],
          ["VOTES EXPRIMÉS", participantCount],
          ["TAUX DE PARTICIPATION", participationRate],
          ["BULLETINS NULS", invalidVotes],
        ], accentColor),
        // Quorum status
        {
          table: {
            widths: ["*"],
            body: [[{
              columns: [
                {
                  text: quorumReached === "OUI" ? "✓" : "✗",
                  fontSize: 20, bold: true,
                  color: quorumReached === "OUI" ? BRAND.successDark : BRAND.destructiveDark,
                  width: 30, margin: [0, 4, 0, 0],
                },
                {
                  stack: [
                    {
                      text: quorumReached === "OUI" ? "QUORUM ATTEINT" : "QUORUM NON ATTEINT",
                      fontSize: 11, bold: true,
                      color: quorumReached === "OUI" ? BRAND.successDeep : BRAND.destructiveDark,
                      margin: [0, 0, 0, 2],
                    },
                    {
                      text: `Quorum requis : ${quorumPercent}%  •  Participation : ${participationRate}`,
                      fontSize: 8.5, color: BRAND.muted,
                    },
                  ],
                  width: "*",
                },
              ],
              fillColor: quorumReached === "OUI" ? BRAND.successLight : BRAND.destructiveLight,
              margin: [16, 14, 16, 14],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0,
            vLineWidth: () => 0,
            hLineColor: () => quorumReached === "OUI" ? BRAND.success : BRAND.destructive,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 16],
        },
        // ── Candidate results — structured table when JSON available, text fallback ──
        ...(() => {
          type CandidateRow = { rank: number; name: string; votes: number; pct: number; isWinner: boolean };
          let rows: CandidateRow[] = [];
          const rawJson = input._candidatesJson as string | undefined;
          if (rawJson) { try { rows = JSON.parse(rawJson); } catch { /* fall through to text */ } }

          if (rows.length === 0) {
            return [contentSection("RÉSULTATS PAR CANDIDAT", candidatesText, accentColor)];
          }

          const tableBody: unknown[][] = [
            [
              { text: "#", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [6, 6, 6, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              { text: "CANDIDAT", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, margin: [8, 6, 8, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              { text: "VOTES", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "center" as const, margin: [4, 6, 4, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              { text: "%", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "center" as const, margin: [4, 6, 4, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              { text: "STATUT", fontSize: 8, bold: true, color: BRAND.surfaceCard, fillColor: accentColor, alignment: "center" as const, margin: [8, 6, 8, 6], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
            ],
            ...rows.map((c, i) => {
              const bg = i % 2 === 0 ? BRAND.surface : BRAND.surfaceCard;
              return [
                { text: String(c.rank), fontSize: 9, bold: true, color: BRAND.muted, alignment: "center" as const, fillColor: bg, margin: [6, 7, 6, 7], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: c.name, fontSize: 9.5, bold: c.isWinner, color: c.isWinner ? BRAND.ink : BRAND.inkMid, fillColor: bg, margin: [8, 7, 8, 7], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: String(c.votes), fontSize: 9.5, bold: true, alignment: "center" as const, color: BRAND.ink, fillColor: bg, margin: [4, 7, 4, 7], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                { text: `${c.pct}%`, fontSize: 9, alignment: "center" as const, color: BRAND.inkMid, fillColor: bg, margin: [4, 7, 4, 7], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                {
                  text: c.isWinner ? "✓ ÉLU" : "—",
                  fontSize: 8.5, bold: c.isWinner,
                  color: c.isWinner ? BRAND.successDark : BRAND.muted,
                  fillColor: c.isWinner ? BRAND.successLight : bg,
                  alignment: "center" as const,
                  margin: [8, 7, 8, 7],
                  border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                },
              ];
            }),
          ];

          return [{
            stack: [
              {
                canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 20, color: accentColor }],
                margin: [0, 0, 0, 0],
              },
              { text: "RÉSULTATS PAR CANDIDAT", fontSize: 8.5, bold: true, color: BRAND.surfaceCard, margin: [0, -17, 0, 10] },
              {
                table: { widths: [24, "*", 50, 40, 70], body: tableBody },
                layout: {
                  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0.4,
                  vLineWidth: () => 0,
                  hLineColor: () => BRAND.border,
                  paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
                },
              },
            ],
            margin: [0, 0, 0, 16],
          }];
        })(),
        // ── Elected members summary ────────────────────────────────────────────
        ...((input._winnersText as string) && (input._winnersText as string) !== "—" ? [
          contentSection("MEMBRES ÉLUS AU CONSEIL SYNDICAL", `${input._winnersText as string}\n\nLes membres élus entrent en fonction à la date de publication du présent procès-verbal.${mandateDuration !== "—" ? `\nDurée des mandats : ${mandateDuration}.` : ""}`, accentColor),
        ] : mandateDuration !== "—" ? [contentSection("MANDATS", `Durée des mandats des candidats élus : ${mandateDuration}\n\nLes membres élus entrent en fonction à la date de publication du présent procès-verbal.`, accentColor)] : []),
        ...(input.observations as string ? [contentSection("OBSERVATIONS ET RÉSERVES", input.observations as string, accentColor)] : []),
        multiSignatoryBlock(input.officeHolders as OfficeHolders | undefined, accentColor, lang, signatures, syndInfo.name),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Contrat de Bail (Rental/Lease Contract — entity-driven from tenantsTable) ─
    case "contrat_bail": {
      const tenantName      = (input._tenantName as string)       || member || "[LOCATAIRE]";
      const tenantEmail     = (input._tenantEmail as string)      || "—";
      const tenantPhone     = (input._tenantPhone as string)      || "—";
      const lotNum          = (input._lotNumber as string)        || (input.lotNumber as string) || "—";
      const lotFloor        = (input._lotFloor as string)         || "—";
      const lotSurface      = (input._lotSurface as string)       || "—";
      const buildingName_   = (input._buildingName as string)     || (input.property as PropertyInfo | undefined)?.name || syndInfo.name;
      const buildingAddress_= (input._buildingAddress as string)  || syndInfo.address || "—";
      const leaseStart      = (input._leaseStart as string)       || (input.dateDebut as string) || today;
      const leaseEnd        = (input._leaseEnd as string)         || (input.dateFin as string)   || "À préciser";
      const monthlyRent     = (input._monthlyRent as string)      || (input.montant as string)   || "—";
      const depositAmount   = (input._depositAmount as string)    || "—";
      const leaseStatus     = (input._leaseStatus as string)      || "active";
      const statusLabel     = ({ active: "EN COURS", expired: "EXPIRÉ", terminated: "RÉSILIÉ" } as Record<string, string>)[leaseStatus] || leaseStatus.toUpperCase();
      const accentIsBlue    = BRAND.info;

      content = [
        ...buildLegalContractCover(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, version),
        // Premium title block
        { text: "CONTRAT DE BAIL RÉSIDENTIEL", fontSize: 20, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        // Status badge
        {
          table: {
            widths: ["*"],
            body: [[{
              columns: [
                { text: `Statut : ${statusLabel}`, fontSize: 9, bold: true, color: leaseStatus === "active" ? BRAND.successDark : BRAND.destructiveDark, width: "*" },
                { text: `Réf : ${docNum}  •  ${today}`, fontSize: 8, color: BRAND.muted, alignment: "right" as const, width: "auto" },
              ],
              fillColor: leaseStatus === "active" ? BRAND.successLight : BRAND.destructiveLight,
              margin: [14, 9, 14, 9],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }]],
          },
          layout: { hLineWidth: () => 0.8, vLineWidth: () => 0, hLineColor: () => leaseStatus === "active" ? BRAND.success : BRAND.destructive },
          margin: [0, 0, 0, 16],
        },
        // Two-column parties block
        {
          columns: [
            {
              stack: [
                { text: "LE BAILLEUR", fontSize: 8, bold: true, color: accentColor, margin: [0, 0, 0, 4] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: accentColor }], margin: [0, 0, 0, 8] },
                { text: syndInfo.name, fontSize: 11, bold: true, color: BRAND.ink, margin: [0, 0, 0, 3] },
                { text: [syndInfo.address, syndInfo.city].filter(Boolean).join(", ") || "—", fontSize: 8.5, color: BRAND.muted },
                { text: syndInfo.phone || "", fontSize: 8.5, color: BRAND.muted },
                { text: syndInfo.email || "", fontSize: 8.5, color: BRAND.muted },
                ...(syndInfo.registrationNumber ? [{ text: `N° Reg. : ${syndInfo.registrationNumber}`, fontSize: 8, color: BRAND.mutedLight, margin: [0, 4, 0, 0] }] : []),
              ],
              width: "50%",
            },
            {
              stack: [
                { text: "LE LOCATAIRE", fontSize: 8, bold: true, color: accentColor, margin: [0, 0, 0, 4] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: accentColor }], margin: [0, 0, 0, 8] },
                { text: tenantName, fontSize: 11, bold: true, color: BRAND.ink, margin: [0, 0, 0, 3] },
                { text: tenantEmail !== "—" ? tenantEmail : "", fontSize: 8.5, color: BRAND.muted },
                { text: tenantPhone !== "—" ? tenantPhone : "", fontSize: 8.5, color: BRAND.muted },
              ],
              width: "50%",
            },
          ],
          columnGap: 20,
          margin: [0, 0, 0, 16],
        },
        // Leased property details
        metaTable([
          ["BIEN LOUÉ — RÉSIDENCE",  buildingName_],
          ["ADRESSE",                buildingAddress_],
          ["N° APPARTEMENT / LOT",   `Lot ${lotNum}${lotFloor !== "—" ? ` — Étage ${lotFloor}` : ""}`],
          ["SURFACE HABITABLE",      lotSurface !== "—" ? `${lotSurface} m²` : "—"],
          ["LOYER MENSUEL",          `${monthlyRent} MAD`],
          ["DÉPÔT DE GARANTIE",      depositAmount !== "—" ? `${depositAmount} MAD` : "—"],
          ["DURÉE DU BAIL",          `Du ${leaseStart} au ${leaseEnd}`],
        ], accentColor),
        // Contract clauses
        contentSection(
          "Article 1 — Désignation des lieux",
          body || input.content as string ||
            `Le bailleur ${syndInfo.name} donne à bail au locataire ${tenantName} l'appartement ` +
            `N° ${lotNum} sis dans la résidence ${buildingName_}, sise à ${buildingAddress_}.`,
          accentColor,
        ),
        contentSection(
          "Article 2 — Durée et loyer",
          input.conditions as string ||
            `Le présent bail est conclu pour une durée déterminée du ${leaseStart} au ${leaseEnd}.\n\n` +
            `Le loyer mensuel est fixé à ${monthlyRent} MAD, payable le 1er de chaque mois.\n\n` +
            `Un dépôt de garantie de ${depositAmount !== "—" ? depositAmount + " MAD" : "[montant]"} est versé à la signature du présent contrat.`,
          accentColor,
        ),
        contentSection(
          "Article 3 — Obligations des parties",
          input.preamble as string ||
            `Le locataire s'engage à :\n• Payer régulièrement le loyer\n• Entretenir le bien loué\n• Respecter le règlement de copropriété\n• Ne pas sous-louer sans accord écrit du bailleur\n\n` +
            `Le bailleur s'engage à :\n• Garantir la jouissance paisible des lieux\n• Effectuer les réparations urgentes\n• Délivrer un logement en bon état`,
          accentColor,
        ),
        {
          table: {
            widths: ["*"],
            body: [[{
              text: "Ce contrat est établi conformément aux dispositions légales en vigueur. Toute modification doit faire l'objet d'un avenant signé des deux parties.",
              style: "notice",
              fillColor: BRAND.infoLight,
              margin: [12, 9, 12, 9],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => BRAND.info, vLineColor: () => BRAND.info },
          margin: [0, 0, 0, 16],
        },
        {
          columns: [
            {
              stack: [
                { text: "Pour le Bailleur :", style: "metaKey", margin: [0, 0, 0, 28] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: BRAND.mutedLight }] },
                { text: syndInfo.name, style: "signName", margin: [0, 4, 0, 0] },
              ],
            },
            {
              stack: [
                { text: "Pour le Locataire :", style: "metaKey", margin: [0, 0, 0, 28] },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: BRAND.mutedLight }] },
                { text: tenantName, style: "signName", margin: [0, 4, 0, 0] },
              ],
            },
          ],
          margin: [0, 24, 0, 0],
          columnGap: 20,
        },
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Déclaration de Sinistre (entity-driven from sinistresTable) ──────────────
    case "sinistre": {
      const sinistreType     = (input._sinistreType as string)      || "—";
      const sinistreDate     = (input._sinistreDate as string)      || today;
      const sinistreDesc     = (input._sinistreDescription as string) || body || "—";
      const sinistreStatus   = (input._sinistreStatus as string)    || "declared";
      const sinistreUrgency  = (input._sinistreUrgency as string)   || "normal";
      const claimNumber      = (input._claimNumber as string)       || docNum;
      const estimatedAmt     = (input._estimatedAmount as string)   || "—";
      const indemnisedAmt    = (input._indemnisedAmount as string)  || "—";
      const reportedBy       = (input._reportedByName as string)    || member || "—";
      const resolutionNote   = (input._resolutionNote as string)    || "—";
      const buildingName_    = (input._buildingName as string)      || (input.property as PropertyInfo | undefined)?.name || syndInfo.name;
      const lotNum           = (input._lotNumber as string)         || "—";

      const statusColors: Record<string, { bg: string; border: string; text: string; label: string }> = {
        declared:     { bg: BRAND.infoLight, border: BRAND.info, text: BRAND.info, label: "DÉCLARÉ" },
        under_review: { bg: BRAND.warningLight, border: BRAND.warning, text: BRAND.warningDark, label: "EN EXAMEN" },
        assigned:     { bg: BRAND.successLight, border: BRAND.success, text: BRAND.successDark, label: "ASSIGNÉ" },
        in_progress:  { bg: BRAND.warningLight, border: BRAND.warning, text: BRAND.warningDark, label: "EN COURS" },
        resolved:     { bg: BRAND.successLight, border: BRAND.success, text: BRAND.successDark, label: "RÉSOLU" },
        closed:       { bg: BRAND.surfaceAlt, border: BRAND.border, text: BRAND.muted, label: "CLÔTURÉ" },
      };
      const urgencyColors: Record<string, { color: string; label: string }> = {
        low:      { color: BRAND.muted, label: "FAIBLE" },
        normal:   { color: BRAND.info, label: "NORMALE" },
        high:     { color: BRAND.warningDark, label: "ÉLEVÉE" },
        critical: { color: BRAND.destructiveDark, label: "CRITIQUE" },
      };
      const sc = statusColors[sinistreStatus] || statusColors.declared;
      const uc = urgencyColors[sinistreUrgency] || urgencyColors.normal;

      const typeLabels: Record<string, string> = {
        dégât_des_eaux: "Dégât des eaux", incendie: "Incendie", effraction: "Effraction / Vol",
        vandalisme: "Vandalisme", catastrophe_naturelle: "Catastrophe naturelle",
        ascenseur: "Panne ascenseur", structure: "Problème structurel", autre: "Autre",
      };

      content = [
        ...header,
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 0, 0, 12] },
        { text: "DÉCLARATION DE SINISTRE", fontSize: 20, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: `N° de dossier : ${claimNumber}`, fontSize: 9, color: BRAND.muted, alignment: "center" as const, margin: [0, 0, 0, 16] },
        // Status + Urgency badges
        {
          columns: [
            {
              table: {
                widths: ["*"],
                body: [[{ text: `Statut : ${sc.label}`, fontSize: 9, bold: true, color: sc.text, fillColor: sc.bg, margin: [12, 8, 12, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }]],
              },
              layout: { hLineWidth: (i: number, n: any) => i === 0 || i === n.table.body.length ? 0.8 : 0, vLineWidth: () => 0, hLineColor: () => sc.border },
              width: "*",
            },
            { width: 12, text: "" },
            {
              table: {
                widths: ["*"],
                body: [[{ text: `⚡ Urgence : ${uc.label}`, fontSize: 9, bold: true, color: uc.color, fillColor: BRAND.surfaceAlt, margin: [12, 8, 12, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }]],
              },
              layout: { hLineWidth: (i: number, n: any) => i === 0 || i === n.table.body.length ? 0.8 : 0, vLineWidth: () => 0, hLineColor: () => BRAND.border },
              width: "*",
            },
          ],
          margin: [0, 0, 0, 16],
        },
        metaTable([
          ["TYPE DE SINISTRE",        typeLabels[sinistreType] || sinistreType],
          ["DATE DU SINISTRE",        sinistreDate],
          ["IMMEUBLE",                buildingName_],
          ["LOT / APPARTEMENT",       lotNum !== "—" ? `Lot ${lotNum}` : "—"],
          ["DÉCLARANT",               reportedBy],
          ["MONTANT ESTIMÉ",          estimatedAmt !== "—" ? `${estimatedAmt} MAD` : "Non évalué"],
          ["MONTANT INDEMNISÉ",       indemnisedAmt !== "—" ? `${indemnisedAmt} MAD` : "En attente"],
          ["N° DE DOSSIER ASSURANCE", claimNumber],
        ], accentColor),
        contentSection("DESCRIPTION DU SINISTRE", sinistreDesc, accentColor),
        ...(input.constats as string ? [contentSection("CONSTATS ET OBSERVATIONS", input.constats as string, accentColor)] : []),
        ...(resolutionNote !== "—" ? [contentSection("NOTE DE RÉSOLUTION", resolutionNote, accentColor)] : []),
        contentSection(
          "DÉMARCHES ET SUIVI",
          input.observations as string ||
            `1. Déclaration déposée auprès du bureau syndical le ${sinistreDate}\n` +
            `2. Inspection du sinistre par le prestataire mandaté\n` +
            `3. Transmission du dossier à la compagnie d'assurance\n` +
            `4. Suivi et réparation en cours selon priorité ${uc.label}`,
          accentColor,
        ),
        { text: "\n" },
        multiSignatoryBlock(input.officeHolders as OfficeHolders | undefined, accentColor, lang, signatures, syndInfo.name),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Ordre de Travaux (entity-driven from travauxTable) ───────────────────────
    case "travaux": {
      const travauxTitle     = (input._travauxTitle as string)      || input.title || "Travaux";
      const travauxType      = (input._travauxType as string)       || "entretien";
      const travauxPriority  = (input._travauxPriority as string)   || "normal";
      const travauxStatus    = (input._travauxStatus as string)     || "reported";
      const travauxDesc      = (input._travauxDescription as string) || body || "—";
      const prestataireNom   = (input._prestataireNom as string)    || "—";
      const prestatairePhone = (input._prestatairePhone as string)  || "—";
      const reportedBy_      = (input._reportedByName as string)    || "—";
      const validatedBy_     = (input._validatedByName as string)   || "—";
      const startDate_       = (input._startDate as string)         || (input.dateDebut as string) || "—";
      const endDate_         = (input._endDate as string)           || (input.dateFin as string) || "—";
      const estimatedAmt_    = (input._estimatedAmount as string)   || "—";
      const actualAmt        = (input._actualAmount as string)      || "—";
      const invoiceAmt       = (input._invoiceAmount as string)     || "—";
      const buildingName_    = (input._buildingName as string)      || (input.property as PropertyInfo | undefined)?.name || syndInfo.name;
      const lotNum_          = (input._lotNumber as string)         || "—";

      const typeLabels: Record<string, string> = {
        entretien: "Entretien courant", reparation: "Réparation", renovation: "Rénovation",
        installation: "Installation", inspection: "Inspection / Contrôle", urgence: "Urgence",
      };
      const priorityConfig: Record<string, { color: string; label: string }> = {
        low:      { color: BRAND.muted, label: "FAIBLE" },
        normal:   { color: BRAND.info, label: "NORMALE" },
        high:     { color: BRAND.warningDark, label: "ÉLEVÉE" },
        critical: { color: BRAND.destructiveDark, label: "CRITIQUE" },
      };
      const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
        reported:            { bg: BRAND.infoLight, text: BRAND.info, label: "SIGNALÉ" },
        assigned:            { bg: BRAND.warningLight, text: BRAND.warningDark, label: "ASSIGNÉ" },
        in_progress:         { bg: BRAND.warningLight, text: BRAND.warningDark, label: "EN COURS" },
        pending_validation:  { bg: BRAND.primaryLighter, text: BRAND.primary, label: "EN VALIDATION" },
        completed:           { bg: BRAND.successLight, text: BRAND.successDark, label: "TERMINÉ" },
        cancelled:           { bg: BRAND.destructiveLight, text: BRAND.destructiveDark, label: "ANNULÉ" },
      };
      const pc = priorityConfig[travauxPriority] || priorityConfig.normal;
      const sc = statusConfig[travauxStatus] || statusConfig.reported;
      const financialAmt = Number(invoiceAmt !== "—" ? invoiceAmt : actualAmt !== "—" ? actualAmt : estimatedAmt_ !== "—" ? estimatedAmt_ : "0");

      content = [
        ...header,
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 0, 0, 12] },
        { text: "ORDRE DE TRAVAUX", fontSize: 20, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: travauxTitle, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        // Status + Priority badges
        {
          columns: [
            {
              table: {
                widths: ["*"],
                body: [[{ text: `Statut : ${sc.label}`, fontSize: 9, bold: true, color: sc.text, fillColor: sc.bg, margin: [12, 8, 12, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }]],
              },
              layout: { hLineWidth: (i: number, n: any) => i === 0 || i === n.table.body.length ? 0.8 : 0, vLineWidth: () => 0, hLineColor: () => BRAND.border },
              width: "*",
            },
            { width: 12, text: "" },
            {
              table: {
                widths: ["*"],
                body: [[{ text: `Priorité : ${pc.label}`, fontSize: 9, bold: true, color: pc.color, fillColor: BRAND.surfaceAlt, margin: [12, 8, 12, 8], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }]],
              },
              layout: { hLineWidth: (i: number, n: any) => i === 0 || i === n.table.body.length ? 0.8 : 0, vLineWidth: () => 0, hLineColor: () => BRAND.border },
              width: "*",
            },
          ],
          margin: [0, 0, 0, 16],
        },
        metaTable([
          ["TYPE DE TRAVAUX",   typeLabels[travauxType] || travauxType],
          ["IMMEUBLE",          buildingName_],
          ["LOT CONCERNÉ",      lotNum_ !== "—" ? `Lot ${lotNum_}` : "Parties communes"],
          ["PRESTATAIRE",       prestataireNom],
          ["TÉL. PRESTATAIRE",  prestatairePhone !== "—" ? prestatairePhone : "—"],
          ["SIGNALÉ PAR",       reportedBy_],
          ["DATE DÉBUT",        startDate_],
          ["DATE FIN PRÉVUE",   endDate_],
          ["MONTANT ESTIMÉ",    estimatedAmt_ !== "—" ? `${estimatedAmt_} MAD` : "—"],
          ["MONTANT RÉEL",      actualAmt !== "—" ? `${actualAmt} MAD` : "—"],
          ["MONTANT FACTURÉ",   invoiceAmt !== "—" ? `${invoiceAmt} MAD` : "—"],
          ["VALIDÉ PAR",        validatedBy_ !== "—" ? validatedBy_ : "En attente"],
        ], accentColor),
        contentSection("DESCRIPTION DES TRAVAUX", travauxDesc, accentColor),
        ...(input.observations as string ? [contentSection("OBSERVATIONS ET NOTES", input.observations as string, accentColor)] : []),
        // Financial summary box
        ...(financialAmt > 0 ? [{
          table: {
            widths: ["*", "auto"],
            body: [[
              { text: "MONTANT TOTAL TRAVAUX", fontSize: 11, bold: true, color: BRAND.inkMid, margin: [16, 14, 8, 14], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              {
                text: `${financialAmt.toLocaleString("fr-MA")} MAD`,
                fontSize: 18, bold: true, color: BRAND.surfaceCard,
                fillColor: accentColor,
                alignment: "right" as const,
                margin: [16, 10, 16, 10],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: (i: number, node: any) => i === 0 || i === node.table.body.length ? 0.8 : 0,
            vLineWidth: () => 0,
            hLineColor: () => BRAND.border,
            fillColor: (_: number, __: unknown, col: number) => col === 0 ? BRAND.surface : null,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 16, 0, 24],
        }] : []),
        multiSignatoryBlock(input.officeHolders as OfficeHolders | undefined, accentColor, lang, signatures, syndInfo.name),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    default:
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        contentSection(t("sectionContent", lang), body || "—", accentColor, isArabic),
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
  }

  return {
    pageSize: "A4" as const,
    pageMargins: pageMarginOverride ?? ([40, 22, 40, 58] as [number, number, number, number]),
    content,
    styles,
    ...(footerFn ? { footer: footerFn } : {}),
    ...(backgroundFn ? { background: backgroundFn } : {}),
    ...(watermark ? { watermark } : {}),
  };
}

function getDocTypeLabel(template: DocumentTemplate, lang: DocumentLanguage = "fr"): string {
  if (template === "reglement") return t("docTypeLabel_reglement", lang);
  if (lang !== "fr") return t("docTypeLabel_default", lang);
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
    attestation_residence:    "ATTESTATION DE RÉSIDENCE",
    attestation_propriete:    "ATTESTATION DE PROPRIÉTÉ",
    attestation_paiement:     "ATTESTATION DE PAIEMENT",
    appel_de_fonds:           "APPEL DE FONDS",
    recu_paiement:            "REÇU DE PAIEMENT",
    facture:                  "FACTURE",
    budget_previsionnel:      "BUDGET PRÉVISIONNEL",
    decompte_charges:         "DÉCOMPTE DES CHARGES",
    rapport_election:         "RAPPORT D'ÉLECTION",
    contrat_bail:             "CONTRAT DE BAIL",
    sinistre:                 "DÉCLARATION DE SINISTRE",
    travaux:                  "ORDRE DE TRAVAUX",
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
