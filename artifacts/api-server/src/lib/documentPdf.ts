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
    // ── Contracts & Legal — deep app foreground (authoritative) ─────────────────
    contrat:               { primary: BRAND.contractIndigo, secondary: BRAND.primaryDeeper, light: BRAND.primaryLight,   icon: "⚖", categoryLabel: "CONTRAT" },
    convention_partenariat:{ primary: BRAND.contractIndigo, secondary: BRAND.primaryDeeper, light: BRAND.primaryLight,   icon: "⚖", categoryLabel: "CONVENTION DE PARTENARIAT" },
    accord_collectif:      { primary: BRAND.contractIndigo, secondary: BRAND.primaryDeeper, light: BRAND.primaryLight,   icon: "⚖", categoryLabel: "ACCORD COLLECTIF" },

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

    // ── Regulatory & Statutory — violet-900 ──────────────────────────────────────
    reglement:             { primary: BRAND.primaryDeep,  secondary: BRAND.primaryDeeper, light: BRAND.primaryLighter, icon: "§", categoryLabel: "RÈGLEMENT DE COPROPRIÉTÉ" },

    // ── Certification Family — emerald-600 (verified / official) ─────────────────
    attestation:           { primary: BRAND.successDark,  secondary: BRAND.successDeep,  light: BRAND.successLight,  icon: "✓", categoryLabel: "ATTESTATION" },
    attestation_residence: { primary: BRAND.successDark,  secondary: BRAND.successDeep,  light: BRAND.successLight,  icon: "✓", categoryLabel: "ATTESTATION DE RÉSIDENCE" },
    attestation_propriete: { primary: BRAND.successDark,  secondary: BRAND.successDeep,  light: BRAND.successLight,  icon: "✓", categoryLabel: "ATTESTATION DE PROPRIÉTÉ" },
    attestation_paiement:  { primary: BRAND.successDark,  secondary: BRAND.successDeep,  light: BRAND.successLight,  icon: "✓", categoryLabel: "ATTESTATION DE PAIEMENT" },
    recu_paiement:         { primary: BRAND.successDark,  secondary: BRAND.successDeep,  light: BRAND.successLight,  icon: "✓", categoryLabel: "REÇU DE PAIEMENT" },
    certificat:            { primary: BRAND.successDark,  secondary: BRAND.successDeep,  light: BRAND.successLight,  icon: "✓", categoryLabel: "CERTIFICAT OFFICIEL" },

    // ── Legal Enforcement — brand destructive (red-700) ──────────────────────────
    mise_en_demeure:       { primary: BRAND.legalRed,     secondary: BRAND.destructiveDeep, light: BRAND.destructiveLight, icon: "!", categoryLabel: "MISE EN DEMEURE" },
    lettre_officielle:     { primary: BRAND.legalRed,     secondary: BRAND.destructiveDeep, light: BRAND.destructiveLight, icon: "!", categoryLabel: "LETTRE OFFICIELLE" },

    // ── Administrative Family — slate-700 (neutral authority) ────────────────────
    demande_administrative:{ primary: BRAND.slateAdmin,   secondary: BRAND.ink,          light: BRAND.surfaceAlt,    icon: "→", categoryLabel: "DEMANDE ADMINISTRATIVE" },
    autorisation:          { primary: BRAND.slateAdmin,   secondary: BRAND.ink,          light: BRAND.surfaceAlt,    icon: "→", categoryLabel: "AUTORISATION" },
    ordre_de_mission:      { primary: BRAND.slateAdmin,   secondary: BRAND.ink,          light: BRAND.surfaceAlt,    icon: "→", categoryLabel: "ORDRE DE MISSION" },

    // ── Operational — specialized tones ──────────────────────────────────────────
    contrat_bail:          { primary: BRAND.bailDark,     secondary: BRAND.ink,          light: BRAND.primaryLighter, icon: "⌂", categoryLabel: "CONTRAT DE BAIL" },
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
  return {
    // ── Header band ────────────────────────────────────────────────────────────
    headerOrgName:    { font: PRIMARY_FONT, fontSize: 12,   bold: true,  color: BRAND.surfaceCard, characterSpacing: 0.3 },
    headerBuilding:   { font: PRIMARY_FONT, fontSize: 7.5,  bold: false, color: BRAND.surfaceCard, opacity: 0.82 },
    headerMeta:       { font: PRIMARY_FONT, fontSize: 7,    color: BRAND.surfaceCard, opacity: 0.72 },
    headerContact:    { font: PRIMARY_FONT, fontSize: 6.5,  color: BRAND.surfaceCard, opacity: 0.60 },
    headerDocNum:     { font: PRIMARY_FONT, fontSize: 9,    bold: true,  color: BRAND.ink },
    headerDocDate:    { font: PRIMARY_FONT, fontSize: 7,    color: BRAND.inkLight },
    docTypeLabel:     { font: PRIMARY_FONT, fontSize: 6.5,  bold: true,  color: BRAND.surfaceCard, characterSpacing: 1.0 },
    docCategoryBadge: { font: PRIMARY_FONT, fontSize: 6,    bold: true,  color: BRAND.surfaceCard, characterSpacing: 0.6 },

    // ── Document titles — clear 5-level hierarchy ───────────────────────────────
    // display: certificate/attestation hero title (white on dark band)
    // docTitle: primary document title (ink, top of body)
    // docSubtitle: subtitle / subject line
    // docRef: reference number / document code
    // subsectionTitle: second-level section within a section
    displayTitle:     { font: PRIMARY_FONT, fontSize: 23,   bold: true,  color: BRAND.surfaceCard },
    docTitle:         { font: PRIMARY_FONT, fontSize: 19,   bold: true,  color: BRAND.ink,         characterSpacing: 0.2 },
    docSubtitle:      { font: PRIMARY_FONT, fontSize: 10,   color: BRAND.muted, italics: true },
    docRef:           { font: PRIMARY_FONT, fontSize: 8.5,  color: BRAND.muted },
    subsectionTitle:  { font: PRIMARY_FONT, fontSize: 9.5,  bold: true,  color: BRAND.ink },

    // ── Section headings ────────────────────────────────────────────────────────
    // Increased from 7.5 → 9pt for SAP/Oracle-grade legibility at the section level.
    sectionTitle:     { font: PRIMARY_FONT, fontSize: 9,    bold: true,  color: BRAND.ink, characterSpacing: 0.5 },

    // ── Metadata cards ─────────────────────────────────────────────────────────
    // Label raised from 6 → 6.5pt; value raised from 9.5 → 11pt for stronger data presence.
    metaKey:          { font: PRIMARY_FONT, fontSize: 6.5,  color: BRAND.muted,     bold: true,  characterSpacing: 0.5 },
    metaVal:          { font: PRIMARY_FONT, fontSize: 11,   bold: true,  color: BRAND.ink },

    // ── Body text ─────────────────────────────────────────────────────────────
    // Raised from 9.5 → 10.5pt; lineHeight 1.6 → 1.7 for more breathing room.
    body:             { font: PRIMARY_FONT, fontSize: 10.5, color: BRAND.inkMid,    lineHeight: 1.7 },
    bodyArabic:       { font: ARABIC_FONT,  fontSize: 12,   color: BRAND.inkMid,    lineHeight: 1.9, alignment: "right" as const },

    // ── Signature area ─────────────────────────────────────────────────────────
    signLabel:        { font: PRIMARY_FONT, fontSize: 8,    color: BRAND.muted,     italics: true },
    signName:         { font: PRIMARY_FONT, fontSize: 11,   bold: true,  color: BRAND.ink },
    stampText:        { font: PRIMARY_FONT, fontSize: 5.5,  bold: true,  color: BRAND.surfaceCard },

    // ── Status / notice ───────────────────────────────────────────────────────
    notice:           { font: PRIMARY_FONT, fontSize: 8.5,  color: BRAND.mutedLight, italics: true },

    // ── Data tables ───────────────────────────────────────────────────────────
    // Header raised from 8 → 9pt; cell from 8.5 → 9.5pt for enterprise density.
    tableHeader:      { font: PRIMARY_FONT, fontSize: 9,    bold: true,  color: BRAND.surfaceCard },
    tableCell:        { font: PRIMARY_FONT, fontSize: 9.5,  color: BRAND.inkMid },
    financialTotal:   { font: PRIMARY_FONT, fontSize: 11,   bold: true,  color: BRAND.ink },

    // ── Footer ───────────────────────────────────────────────────────────────
    footer:           { font: PRIMARY_FONT, fontSize: 6.5,  color: BRAND.mutedLight },
    footerBrand:      { font: PRIMARY_FONT, fontSize: 6.5,  color: accentColor, bold: true },

    // ── Watermark ─────────────────────────────────────────────────────────────
    watermark:        { font: PRIMARY_FONT, fontSize: 80,   bold: true,  color: BRAND.border, opacity: 0.04 },
    pageNumber:       { font: PRIMARY_FONT, fontSize: 9.5,  bold: true,  color: BRAND.ink },

    // ── Legal / security ──────────────────────────────────────────────────────
    legalNote:        { font: PRIMARY_FONT, fontSize: 7,    color: BRAND.muted,     lineHeight: 1.5 },
    securityBadge:    { font: PRIMARY_FONT, fontSize: 6,    bold: true,  color: BRAND.ink },
    certTitle:        { font: PRIMARY_FONT, fontSize: 24,   bold: true,  color: BRAND.surfaceCard },
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
  // Deep shade for center identity column — consistent with app primaryDark
  const centerBg = adjustColorBrightness(accentColor, -32);

  const acronym = (syndInfo.abbreviation ||
    syndInfo.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 3)
  ).toUpperCase();

  // Status chip map — brand colors only
  const statusChipMap: Record<string, { label: string; color: string }> = {
    published:     { label: "PUBLIÉ",    color: BRAND.success },
    signed:        { label: "SIGNÉ",     color: BRAND.primary },
    validated:     { label: "VALIDÉ",    color: BRAND.primaryDark },
    archived:      { label: "ARCHIVÉ",   color: BRAND.mutedLight },
    generated:     { label: "GÉNÉRÉ",    color: BRAND.warning },
    draft:         { label: "BROUILLON", color: BRAND.mutedLight },
    pending_review:{ label: "EN RÉVISION",color: BRAND.warning },
    rejected:      { label: "REJETÉ",    color: BRAND.destructive },
  };
  const statusChip = docStatus ? (statusChipMap[docStatus] ?? null) : null;

  // ── COL 1: Logo / monogram — 58pt wide, full accent background ────────────
  const logoContent: unknown = logoDataUrl
    ? { image: logoDataUrl, width: 42, height: 42, fit: [42, 42] as [number, number], alignment: "center" as const }
    : {
        stack: [
          {
            canvas: [
              { type: "ellipse", x: 20, y: 20, r1: 20, r2: 20, color: `${BRAND.surfaceCard}22` },
            ],
            margin: [0, 0, 0, -40],
          },
          {
            text: acronym,
            fontSize: 16, bold: true,
            color: BRAND.surfaceCard,
            alignment: "center" as const,
            margin: [0, 12, 0, 0],
          },
        ],
      };

  // ── 4px top stripe — full bleed accent, no margin ─────────────────────────
  const topStripe: unknown = {
    canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }],
    margin: [0, 0, 0, 0],
  };

  // ── COL 3 stack — doc reference + status chip + QR ───────────────────────
  const col3Stack: unknown[] = [
    // Doc number — 9pt bold for stronger presence
    {
      text: `N°  ${docNumber}`,
      fontSize: 9, bold: true,
      color: BRAND.ink,
      characterSpacing: 0.3,
      margin: [0, 0, 0, 2],
    },
    // Date
    {
      text: today,
      fontSize: 6.5, color: BRAND.inkLight,
      margin: [0, 0, 0, 4],
    },
    // Status chip
    ...(statusChip ? [{
      table: {
        widths: ["auto"],
        body: [[{
          text: `● ${statusChip.label}`,
          fontSize: 5.5, bold: true,
          color: statusChip.color,
          fillColor: `${statusChip.color}1a`,
          margin: [5, 3, 5, 3],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        }]],
      },
      layout: {
        hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 0.5 : 0,
        vLineWidth: (i: number, n: { table: { widths: unknown[] } }) => i === 0 || i === n.table.widths.length ? 0.5 : 0,
        hLineColor: () => `${statusChip.color}55`,
        vLineColor: () => `${statusChip.color}55`,
        paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 6] as [number, number, number, number],
    }] : [{ text: "", margin: [0, 0, 0, 6] as [number, number, number, number] }]),
    // QR code — 34×34: slightly larger for easier mobile scanning
    ...(qrDataUrl
      ? [{ image: qrDataUrl, width: 34, height: 34, alignment: "center" as const }]
      : [{ canvas: [{ type: "rect", x: 0, y: 0, w: 34, h: 34, r: 4, color: BRAND.border }], alignment: "center" as const }]
    ),
    // "Scan pour vérifier" micro-label
    {
      text: "SCAN · VÉRIFIER",
      fontSize: 5, bold: true,
      color: BRAND.mutedLight,
      characterSpacing: 0.6,
      alignment: "center" as const,
      margin: [0, 3, 0, 0],
    },
  ];

  // Proper 3-column band using a real table without closure issues
  // Widths: [64: logo | *: identity | 92: ref+QR] — logo/ref cols widened for premium balance
  const bandFinal: unknown = {
    table: {
      widths: [64, "*", 92],
      body: [[
        // COL 1 — Logo on accent bg, extra padding for visual weight
        {
          stack: [logoContent],
          fillColor: accentColor,
          alignment: "center" as const,
          margin: [10, 12, 10, 12],
          border: [false, false, false, false] as [boolean, boolean, boolean, false],
        },
        // COL 2 — Syndicate identity on deep accent bg
        {
          stack: [
            // Org name — 11pt bold, slightly more tracked for authority
            {
              text: syndInfo.name.toUpperCase(),
              fontSize: 11, bold: true,
              color: BRAND.surfaceCard,
              characterSpacing: 0.5,
              lineHeight: 1.15,
              margin: [0, 0, 0, 5],
            },
            // Building sub-label (if available)
            ...(buildingName ? [{
              text: buildingName,
              fontSize: 7,
              color: BRAND.surfaceCard,
              opacity: 0.76,
              margin: [0, 0, 0, 5] as [number, number, number, number],
            }] : []),
            // Category pill — more opaque, slightly larger, more prominent
            {
              table: {
                widths: ["auto"],
                body: [[{
                  text: `${categoryIcon}  ${docTypeLabel.toUpperCase()}`,
                  fontSize: 6, bold: true,
                  color: BRAND.surfaceCard,
                  characterSpacing: 0.9,
                  fillColor: `${BRAND.surfaceCard}2a`,
                  margin: [9, 4, 9, 4],
                  border: [false, false, false, false] as [boolean, boolean, boolean, false],
                }]],
              },
              layout: {
                hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 0.6 : 0,
                vLineWidth: (i: number, n: { table: { widths: unknown[] } }) => i === 0 || i === n.table.widths.length ? 0.6 : 0,
                hLineColor: () => `${BRAND.surfaceCard}55`,
                vLineColor: () => `${BRAND.surfaceCard}55`,
                paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
              },
            },
            // Registration / contact micro-line
            ...(syndInfo.registrationNumber || syndInfo.phone ? [{
              text: [
                ...(syndInfo.registrationNumber ? [`Imm. ${syndInfo.registrationNumber}`] : []),
                ...(syndInfo.phone ? [`  ·  ${syndInfo.phone}`] : []),
              ].join(""),
              fontSize: 6,
              color: BRAND.surfaceCard,
              opacity: 0.52,
              margin: [0, 5, 0, 0] as [number, number, number, number],
            }] : []),
          ],
          fillColor: centerBg,
          margin: [14, 12, 12, 12],
          border: [false, false, false, false] as [boolean, boolean, boolean, false],
        },
        // COL 3 — Reference + QR — clean surface, stronger doc number
        {
          stack: col3Stack,
          fillColor: BRAND.surfaceAlt,
          margin: [10, 10, 10, 10],
          border: [false, false, false, false] as [boolean, boolean, boolean, false],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0, vLineWidth: () => 0,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 12],
  };

  return [topStripe, bandFinal] as object[];
}

// ─── Official Seal ─────────────────────────────────────────────────────────────
// Rectangular institutional stamp. Replaces the decorative circular stamp.

function buildOfficialSeal(
  syndName: string,
  accentColor: string,
  signerName?: string,
  stampDate?: string,
  status?: "VALID" | "PENDING" | "REVOKED" | "EXPIRED",
): unknown {
  // Institutional rectangular stamp — resembles a real administrative cachet.
  // Desaturated, compact, professional. Not decorative.
  const truncate = (s: string, n: number) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;

  const borderColor = adjustColorBrightness(accentColor, -18);
  const acronym = truncate(syndName.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 4).toUpperCase(), 4);

  // Status config — brand tokens only
  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    VALID:   { label: "✓  VALIDÉ ET CERTIFIÉ",  color: BRAND.successDeep,     bg: BRAND.successLight },
    PENDING: { label: "◉  EN ATTENTE",           color: BRAND.warningDark,     bg: BRAND.warningLight },
    REVOKED: { label: "✗  ANNULÉ",               color: BRAND.destructiveDark, bg: BRAND.destructiveLight },
    EXPIRED: { label: "⊘  EXPIRÉ",               color: BRAND.muted,           bg: BRAND.surfaceAlt },
  };
  const resolvedStatus = status ?? (signerName ? "VALID" : "PENDING");
  const si = statusConfig[resolvedStatus];

  // Enterprise institutional stamp — premium redesign.
  // Outer double border (1.6pt outer + 0.5pt inner inset) for institutional authority.
  // Taller body (84pt vs 72pt) gives acronym more visual prominence.
  // Header bar: deep accent fill, tracked all-caps.
  // Center body: 24pt acronym (was 18pt), hairline rule, org name, date.
  // Status bar: taller (was 4pt margin → 6pt) with matched semantic colors.
  return {
    stack: [
      // Outer border canvas (128×84pt) — double rule for institutional depth
      {
        canvas: [
          // Outer rectangle — 1.6pt solid accent
          { type: "rect", x: 0, y: 0, w: 128, h: 84, r: 2, color: BRAND.surfaceCard, lineWidth: 1.6, lineColor: borderColor },
          // Inner inset rectangle — 0.5pt at 8% opacity
          { type: "rect", x: 4, y: 4, w: 120, h: 76, r: 1, color: BRAND.surfaceCard, lineWidth: 0.5, lineColor: `${accentColor}45` },
        ],
        margin: [0, 0, 0, -84],
      },
      // Content table overlaying the canvas
      {
        table: {
          widths: [128],
          body: [
            // Header bar — deep accent fill, tight tracked caps
            [{
              text: "CACHET OFFICIEL NUMÉRIQUE",
              fontSize: 5, bold: true,
              color: BRAND.surfaceCard,
              characterSpacing: 1.0,
              alignment: "center" as const,
              fillColor: borderColor,
              margin: [0, 6, 0, 6],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }],
            // Center body — acronym (24pt) + divider + org name + date
            [{
              stack: [
                // Acronym: 24pt bold — the dominant visual element of the stamp
                { text: acronym, fontSize: 24, bold: true, color: accentColor, alignment: "center" as const, characterSpacing: 2, margin: [0, 6, 0, 3] },
                // Hairline rule under acronym
                { canvas: [{ type: "line", x1: 16, y1: 0, x2: 112, y2: 0, lineWidth: 0.5, lineColor: `${accentColor}35` }] },
                // Organization name — 5.5pt, more tracking
                {
                  text: truncate(syndName.toUpperCase(), 26),
                  fontSize: 5.5, bold: true, color: BRAND.inkMid,
                  alignment: "center" as const, characterSpacing: 0.5,
                  lineHeight: 1.35, margin: [6, 5, 6, 2],
                },
                // Date — 5.5pt muted
                {
                  text: stampDate ?? new Date().toLocaleDateString("fr-FR"),
                  fontSize: 5.5, color: BRAND.muted,
                  alignment: "center" as const, margin: [0, 2, 0, 5],
                },
              ],
              fillColor: BRAND.surfaceCard,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }],
            // Status bar — taller, stronger semantic contrast
            [{
              text: si.label,
              fontSize: 6, bold: true, color: si.color,
              alignment: "center" as const, characterSpacing: 0.4,
              fillColor: si.bg,
              margin: [0, 6, 0, 6],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            }],
          ],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
    ],
    width: 128,
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
  // Certification identity strip: double rule framing the category label.
  // Signals "official certified document" without decorative noise.
  const certLabel = lang === "ar" ? "وثيقة رسمية معتمدة" : lang === "en" ? "OFFICIAL CERTIFIED DOCUMENT" : "DOCUMENT OFFICIEL CERTIFIÉ";
  return {
    stack: [
      // Heavy top rule
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: accentColor }],
        margin: [0, 0, 0, 0],
      },
      // Thin tint rule offset by 3pt
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: `${accentColor}44` }],
        margin: [0, 3, 0, 8],
      },
      // Category label — centered, tracked, accent
      {
        text: `⊕  ${certLabel}  ⊕`,
        fontSize: 6, bold: true, color: accentColor,
        alignment: "center" as const, characterSpacing: 1.2,
        margin: [0, 0, 0, 8],
      },
      // Bottom tint + heavy rule
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: `${accentColor}44` }],
        margin: [0, 0, 0, 3],
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: accentColor }],
        margin: [0, 0, 0, 14],
      },
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
  // Governance identity strip: light tinted panel with 3px accent left bar.
  // The left bar anchors the eye; the pale tint signals authority without noise.
  const dark = adjustColorBrightness(accentColor, -20);
  return {
    stack: [
      {
        table: {
          widths: [3, "*"],
          body: [[
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: entityRef ? 34 : 22, color: accentColor }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            {
              stack: [
                { text: categoryLabel.toUpperCase(), fontSize: 9, bold: true, color: dark, characterSpacing: 0.5, margin: [0, 0, 0, entityRef ? 3 : 0] },
                ...(entityRef ? [{ text: entityRef, fontSize: 6.5, color: BRAND.inkLight, lineHeight: 1.3 }] : []),
              ],
              fillColor: `${accentColor}0d`,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [12, 6, 12, 6],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }],
        margin: [0, 4, 0, 14],
      },
    ],
  };
}

/**
 * Legal alert banner — prominent visual warning for enforcement documents.
 * The red-background band makes the document's urgency unambiguous.
 * Used for: mise_en_demeure, lettre_officielle (enforcement context).
 */
function buildLegalAlertBanner(accentColor: string, lang: DocumentLanguage = "fr"): unknown {
  // Legal enforcement alert: 3px red left bar + alert label on destructive-tinted bg.
  // Top and bottom hairlines in destructive tint signal urgency without screaming.
  const alertLabel = lang === "ar" ? "وثيقة قانونية رسمية — الرد الإلزامي" : "⚠  ACTE JURIDIQUE OFFICIEL — RÉPONSE OBLIGATOIRE";
  const sublabel   = lang === "ar" ? "يجب الرد خلال المهلة المحددة أدناه" : "Toute inaction dans le délai imparti engage la responsabilité du destinataire de plein droit.";
  return {
    stack: [
      {
        table: {
          widths: [3, "*"],
          body: [[
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 36, color: BRAND.destructiveDark }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            {
              stack: [
                { text: alertLabel, fontSize: 8, bold: true, color: BRAND.destructiveDark, characterSpacing: 0.3, margin: [0, 0, 0, 3] },
                { text: sublabel, fontSize: 6.5, color: BRAND.inkLight, lineHeight: 1.4 },
              ],
              fillColor: BRAND.destructiveLight,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [12, 8, 12, 8],
            },
          ]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === node.table.body.length ? 0.5 : 0,
          vLineWidth: () => 0,
          hLineColor: () => `${BRAND.destructive}55`,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }],
        margin: [0, 6, 0, 0],
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
  // Meeting session identity: 2-column pill strip [session type chip | location · date]
  // Tinted bg with accent left bar makes the session identity instantly scannable.
  const dark = adjustColorBrightness(accentColor, -20);
  const typeLabel = meetingType || (lang === "ar" ? "جمعية عامة" : "ASSEMBLÉE GÉNÉRALE");
  const hasDetails = !!(location || date);
  return {
    stack: [
      {
        table: {
          widths: [3, "auto", "*"],
          body: [[
            // Left accent bar
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: hasDetails ? 36 : 24, color: accentColor }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            // Session type chip
            {
              text: typeLabel.toUpperCase(),
              fontSize: 8.5, bold: true, color: dark,
              characterSpacing: 0.5,
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [12, hasDetails ? 6 : 8, 0, hasDetails ? 4 : 8],
            },
            // Location + date (right-aligned)
            ...(hasDetails ? [{
              stack: [
                ...(location ? [{ text: `◆  ${location}`, fontSize: 6.5, color: BRAND.inkLight, margin: [0, 0, 0, 2] as [number,number,number,number] }] : []),
                ...(date    ? [{ text: `⏱  ${date}`,       fontSize: 6.5, color: BRAND.inkLight }] : []),
              ],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              alignment: "right" as const,
              margin: [0, 6, 12, 6] as [number, number, number, number],
            }] : [{ text: "", border: [false, false, false, false] as [boolean, boolean, boolean, boolean] }]),
          ]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        fillColor: `${accentColor}0d`,
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }],
        margin: [0, 4, 0, 12],
      },
    ],
    margin: [0, 0, 0, 4],
  };
}


// ─── Professional Information Cards ──────────────────────────────────────────
// Replaces the old Excel-style table with a 2-column card grid.
// Each card has a labelled key in small caps and a bold value — clean,
// spacious, and visually distinct from body text.

function metaTable(rows: Array<[string, string]>, accentColor: string): unknown {
  // Enterprise information card grid — DocuSign/SAP grade.
  // Layout: 2pt top accent rule + hairline → 2-column card pairs → bottom hairline.
  // Each card: 4px accent left bar | 6.5pt tracked ALL-CAPS label | 11pt bold value.
  // Alternating row background uses brand surface / surfaceAlt tokens.
  // Card height raised to 40pt (was 30pt) for premium feel with more breathing room.
  const pairs: Array<[[string, string], [string, string] | null]> = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push([rows[i], rows[i + 1] ?? null]);
  }

  const makeCard = (row: [string, string] | null, isEven: boolean): unknown => {
    const bg = isEven ? BRAND.surface : BRAND.surfaceCard;
    if (!row) return {
      text: "", fillColor: bg,
      border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    };
    return {
      table: {
        // 4px accent bar (was 3px) + content column
        widths: [4, "*"],
        body: [[
          {
            // Taller bar (40pt) to fill the increased card height
            canvas: [{ type: "rect", x: 0, y: 0, w: 4, h: 40, color: accentColor }],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          },
          {
            stack: [
              // Label: 6.5pt bold tracked caps (was 5pt) — more legible in enterprise context
              { text: row[0].toUpperCase(), fontSize: 6.5, bold: true, color: BRAND.muted, characterSpacing: 0.6, margin: [0, 0, 0, 3] },
              // Value: 11pt bold (was 9.5pt) — stands out as a data point
              { text: row[1] || "—", fontSize: 11, bold: true, color: BRAND.ink, lineHeight: 1.25 },
            ],
            fillColor: bg,
            margin: [10, 8, 10, 8],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          },
        ]],
      },
      layout: {
        hLineWidth: () => 0, vLineWidth: () => 0,
        paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
      },
      fillColor: bg,
      border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    };
  };

  const cardRows = pairs.map((pair, i) => ({
    table: {
      widths: ["*", "*"],
      body: [[makeCard(pair[0], i % 2 === 0), makeCard(pair[1], i % 2 !== 0)]],
    },
    layout: {
      hLineWidth: (j: number, node: { table: { body: unknown[] } }) =>
        j === 0 || j === node.table.body.length ? 0.4 : 0,
      vLineWidth: (j: number) => j === 1 ? 0.4 : 0,
      hLineColor: () => BRAND.border,
      vLineColor: () => BRAND.border,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 0],
  }));

  return {
    stack: [
      // Top accent rule (2pt solid) + hairline (0.3pt) offset — stronger visual anchor
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: accentColor }] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.3, lineColor: `${accentColor}44` }], margin: [0, 2, 0, 0] },
      ...cardRows,
      // Bottom hairline
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }] },
    ],
    margin: [0, 0, 0, 16],
  };
}

function contentSection(title: string, text: string, accentColor: string, isRtl = false): unknown {
  // SAP/Oracle enterprise section header:
  //   4px solid accent left bar | light tinted band (accent ~8% opacity) | 9pt tracked bold title
  //   Hairline separator | body text with proper line-height
  // This is a full-width tinted band, not just a thin side rule.
  // The filled band gives each section clear visual weight and instant scannability.
  return {
    stack: [
      // ── Section header: tinted band with 4px left accent bar ─────────────────
      {
        table: {
          widths: [4, "*"],
          body: [[
            // 4px accent bar — slightly taller (20pt) to fill the tinted band
            {
              canvas: [{ type: "rect", x: 0, y: 0, w: 4, h: 20, color: accentColor }],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              margin: [0, 0, 0, 0],
            },
            // Title text on light tinted background
            {
              text: title.toUpperCase(),
              fontSize: 9, bold: true,
              color: adjustColorBrightness(accentColor, -22),
              characterSpacing: 0.5,
              fillColor: `${accentColor}12`,
              margin: [12, 4, 12, 4],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 14, 0, 0],
      },
      // Hairline below tinted header — thin separator before body content
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: `${accentColor}30` }],
        margin: [0, 0, 0, 8],
      },
      // Section body text
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
 * Renders a 3-column row of KPI metric cards.
 * Each card: small label on top, large bold value, optional sub-label.
 */
function kpiRow(
  cards: Array<{ label: string; value: string; sublabel?: string; valueColor?: string; bgColor?: string }>,
  accentColor: string,
): unknown {
  // SAP/Oracle enterprise KPI card — premium redesign:
  // • Label: 6.5pt tracked caps (was 5.5pt) — instantly readable category identifier
  // • Value: 22pt bold (was 18pt) — dominant metric, cannot be missed
  // • Sublabel: 7pt (was 6.5pt)
  // • Padding: 14pt all sides (was 12pt) — more generous breathing room
  // • Border: 1pt (was 0.6pt) — stronger card edge for printed documents
  const makeCard = (c: (typeof cards)[0]) => ({
    table: {
      widths: ["*"],
      body: [[{
        stack: [
          { text: c.label.toUpperCase(), fontSize: 6.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.9, margin: [0, 0, 0, 5] },
          { text: c.value, fontSize: 22, bold: true, color: c.valueColor || accentColor, lineHeight: 1, margin: [0, 0, 0, 4] },
          ...(c.sublabel ? [{ text: c.sublabel, fontSize: 7, color: BRAND.muted }] : []),
        ],
        fillColor: c.bgColor || BRAND.surface,
        margin: [14, 14, 14, 14],
      }]],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 1 : 0,
      vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i === 0 || i === node.table.widths.length ? 1 : 0,
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
  // Premium progress bar — 12pt tall (was 10pt), 9pt label, better value display.
  // Semantic color: ≥90% green, 60-89% accent, <60% red — same as before.
  // Bar width 430pt (uses full page width, was 370pt — more imposing for financial docs).
  const clamped = Math.min(100, Math.max(0, percent));
  const barW = 430;
  const fillW = Math.round((clamped / 100) * barW);
  const barColor = percent >= 90 ? BRAND.successDark : percent >= 60 ? accentColor : BRAND.destructiveDark;

  return {
    stack: [
      {
        columns: [
          { text: label, fontSize: 9, bold: true, color: BRAND.ink, width: "*" },
          { text: `${clamped}%`, fontSize: 9, bold: true, color: barColor, width: "auto" },
          { text: `   ${value} / ${total}`, fontSize: 7.5, color: BRAND.muted, width: "auto", margin: [0, 1, 0, 0] },
        ],
        margin: [0, 0, 0, 5],
      },
      {
        canvas: [
          // Track
          { type: "rect", x: 0, y: 0, w: barW, h: 12, r: 4, color: BRAND.border },
          // Fill — 12pt tall with rounded ends
          ...(fillW > 0 ? [{ type: "rect" as const, x: 0, y: 0, w: fillW, h: 12, r: 4, color: barColor }] : []),
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

  return [
    // Section header — lean left-bar style, no full-width color band
    {
      table: {
        widths: [3, "*"],
        body: [[
          {
            canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 18, color: accentColor }],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            margin: [0, 0, 0, 0],
          },
          {
            columns: [
              { text: "TABLEAU DE BORD FINANCIER", fontSize: 8.5, bold: true, color: BRAND.ink, width: "*", margin: [0, 2, 0, 0] },
              { text: `Exercice ${kpiYear}`, fontSize: 7, color: BRAND.muted, width: "auto", alignment: "right" as const, margin: [0, 3, 0, 0] },
            ],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            margin: [10, 3, 0, 3],
          },
        ]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      margin: [0, 12, 0, 6],
    },
    // Row 1 — Revenue / Expenses / Net Balance
    kpiRow([
      { label: "Total Revenus",   value: `${kpiRevenue} MAD`,    valueColor: BRAND.successDark,     bgColor: BRAND.successLight },
      { label: "Total Dépenses",  value: `${kpiExpenses} MAD`,   valueColor: BRAND.destructiveDark, bgColor: BRAND.destructiveLight },
      { label: "Solde Net",       value: `${kpiNetBalance} MAD`, valueColor: BRAND.info,            bgColor: BRAND.infoLight },
    ], accentColor),
    // Row 2 — Charged / Paid / Outstanding
    kpiRow([
      { label: "Total Appelé",   value: `${kpiTotalCharged} MAD`, bgColor: BRAND.surface },
      { label: "Total Encaissé", value: `${kpiTotalPaid} MAD`,    valueColor: BRAND.successDark,     bgColor: BRAND.successLight },
      { label: "Impayés",        value: `${kpiOutstanding} MAD`,  valueColor: outstandingColor, bgColor: outstandingNum > 0 ? BRAND.destructiveLight : BRAND.successLight },
    ], accentColor),
    // Row 3 — Cash Balance / Budget Total
    kpiRow([
      { label: "Trésorerie",           value: `${kpiCashBalance} MAD`, valueColor: BRAND.successDeep, bgColor: BRAND.successLight },
      { label: "Budget Prévisionnel",  value: `${kpiBudgetTotal} MAD`, bgColor: BRAND.surface },
      { label: "Taux de Recouvrement", value: `${kpiCollRate}%`,       valueColor: kpiCollRate >= 90 ? BRAND.successDark : kpiCollRate >= 60 ? BRAND.warningDark : BRAND.destructiveDark, bgColor: BRAND.surface },
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
    const hasTrace = hasSig && sig.signatureData?.trim().startsWith("<svg");
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
            fillColor: isValid ? BRAND.successDeep : BRAND.destructiveDark,
            margin: [4, 4, 4, 4],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        margin: [0, 0, 0, 6],
      });

      // SVG trace in a framed tinted box, or empty trace area
      if (hasTrace) {
        signerCardContents.push({
          table: {
            widths: ["*"],
            body: [[{
              stack: [{ svg: sig.signatureData, width: 110, height: 46, alignment: "center" as const }],
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
        // Trace area — solid accent line (handwriting not available)
        signerCardContents.push({
          canvas: [
            { type: "rect", x: 4, y: 0, w: 120, h: 44, r: 3, color: BRAND.primaryLighter, lineWidth: 0.5, lineColor: `${accentColor}44` },
            { type: "line", x1: 16, y1: 30, x2: 116, y2: 30, lineWidth: 1.2, lineColor: `${accentColor}55` },
          ],
          margin: [0, 0, 0, 5],
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

  return {
    stack: [
      // Thin rule separator — no colored decorative block
      {
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: BRAND.border },
        ],
        margin: [0, 0, 0, 12],
      },
      // Section header
      {
        columns: [
          {
            text: sigSectionLabel,
            fontSize: 7, bold: true, color: accentColor,
            characterSpacing: 0.6,
            width: "*",
          },
          {
            stack: [officialSeal],
            width: 114,
            alignment: "right" as const,
          },
        ],
        margin: [0, 0, 0, 10],
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
    margin: [0, 24, 0, 0],
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
        const hasTrace = sig.signatureData?.trim().startsWith("<svg");
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
                      fillColor: isValid ? BRAND.successDeep : BRAND.destructiveDark,
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
                // SVG trace in framed tinted box, or solid line placeholder
                hasTrace
                  ? {
                      table: {
                        widths: ["*"],
                        body: [[{
                          stack: [{ svg: sig.signatureData, width: 180, height: 60, alignment: "center" as const }],
                          fillColor: BRAND.primaryLighter,
                          margin: [8, 6, 8, 6],
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
                      canvas: [
                        { type: "rect" as const, x: 0, y: 0, w: 240, h: 56, r: 3, color: BRAND.primaryLighter, lineWidth: 0.5, lineColor: `${accentColor}44` },
                        { type: "line" as const, x1: 20, y1: 40, x2: 220, y2: 40, lineWidth: 1.2, lineColor: `${accentColor}55` },
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

  return {
    stack: [
      // Section separator — 1.2pt rule + hairline below
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: `${accentColor}55` }], margin: [0, 0, 0, 2] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.3, lineColor: BRAND.border }], margin: [0, 0, 0, 12] },
      // Header row: section label + seal
      {
        columns: [
          { text: sigSectionLabel, fontSize: 7.5, bold: true, color: accentColor, characterSpacing: 0.7, width: "*" },
          ...(showStampCircle ? [{ stack: [officialSealFinal], width: 118, alignment: "right" as const }] : []),
        ],
        margin: [0, 0, 0, 12],
      },
      // Signer content
      ...signerRows as object[],
    ],
    margin: [0, 28, 0, 0],
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

  // Premium legal footer: 4px bar (was 3px), 7pt label/text (was 6.5pt),
  // deeper padding [10, 10, 14, 10] (was [8, 8, 12, 8]) for a less cramped feel.
  return {
    table: {
      widths: [4, "*"],
      body: [[
        {
          canvas: [{ type: "rect", x: 0, y: 0, w: 4, h: 38, color: BRAND.mutedLight }],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          margin: [0, 0, 0, 0],
        },
        {
          stack: [
            {
              columns: [
                { text: titleLabel, fontSize: 7, bold: true, color: BRAND.inkLight, characterSpacing: 0.4, width: "*" },
                { text: docNumber,  fontSize: 6.5, bold: true, color: BRAND.muted, width: "auto", alignment: "right" as const },
              ],
              margin: [0, 0, 0, 4],
            },
            { text, fontSize: 7, color: BRAND.mutedLight, lineHeight: 1.5 },
          ],
          fillColor: BRAND.surface,
          margin: [10, 10, 14, 10],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
      ]],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 0.7 : 0,
      vLineWidth: () => 0,
      hLineColor: () => BRAND.border,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 22, 0, 0],
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

      // ── Section divider ─────────────────────────────────────────────────────
      // Thin left accent bar + small-caps label + hairline. No filled bands.
      const attDiv = (label: string): unknown => ({
        stack: [
          {
            table: {
              widths: [3, "*"],
              body: [[
                {
                  canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 16, color: accentColor }],
                  border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                  margin: [0, 0, 0, 0],
                },
                {
                  text: label,
                  fontSize: 7, bold: true, color: attDark, characterSpacing: 0.8,
                  margin: [10, 3, 0, 3],
                  border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                },
              ]],
            },
            layout: {
              hLineWidth: () => 0, vLineWidth: () => 0,
              paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
            },
          },
          {
            canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }],
            margin: [0, 3, 0, 0],
          },
        ],
        margin: [0, 14, 0, 10],
      });

      // ── Document Identity Strip — 4 cells ──────────────────────────────────
      const attIdentCell = (label: string, value: string, vc?: string): unknown => ({
        table: {
          widths: ["*"],
          body: [[{
            stack: [
              { text: label, fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.5, margin: [0, 0, 0, 3] },
              { text: value || "—", fontSize: 9, bold: true, color: vc || BRAND.ink, lineHeight: 1.2 },
            ],
            fillColor: BRAND.surface,
            margin: [12, 9, 12, 9],
            border: [true, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
          vLineColor: () => vc || accentColor,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
      });

      const identityStrip = {
        table: {
          widths: ["*", "*", "*", "*"],
          body: [[
            attIdentCell("TYPE DE DOCUMENT",  "Attestation d'Adhésion",    accentColor),
            attIdentCell("N° DE RÉFÉRENCE",   docNum),
            attIdentCell("DATE D'ÉMISSION",   today),
            attIdentCell("STATUT",            attDocStatusInfo.label,      attDocStatusInfo.color),
          ]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.6 : 0,
          vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => i > 0 && i < node.table.widths.length ? 0.4 : 0,
          hLineColor: () => BRAND.border,
          vLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 4, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 18],
      };

      // ── Grand Title Block ──────────────────────────────────────────────────
      // Centered display — single top rule (1pt) + document type + subtitle + thin bottom rule.
      const titleBlock = {
        stack: [
          {
            canvas: [{ type: "line", x1: 56, y1: 0, x2: 459, y2: 0, lineWidth: 1, lineColor: accentColor }],
            margin: [0, 0, 0, 0],
          },
          {
            text: "ATTESTATION D'ADHÉSION",
            fontSize: 20, bold: true, alignment: "center" as const,
            color: attDark, characterSpacing: 2,
            margin: [0, 10, 0, 4],
          },
          {
            text: "Syndicat de Copropriété  ·  Délivrée à l'intéressé(e) pour valoir ce que de droit",
            fontSize: 7.5, italics: true, alignment: "center" as const, color: BRAND.muted,
            margin: [0, 0, 0, 10],
          },
          {
            canvas: [{ type: "line", x1: 56, y1: 0, x2: 459, y2: 0, lineWidth: 0.5, lineColor: `${accentColor}66` }],
            margin: [0, 0, 0, 0],
          },
        ],
        margin: [0, 2, 0, 18],
      };

      // ── Member Avatar — circular initials badge ────────────────────────────
      const attNameParts = attMemberName.trim().split(/\s+/).filter(Boolean);
      const attInitials  = ((attNameParts[0]?.[0] ?? "M") + (attNameParts[1]?.[0] ?? "")).toUpperCase();
      const AV_R = 30; // 60px diameter

      const memberAvatar = {
        stack: [
          {
            canvas: [{ type: "ellipse", x: AV_R, y: AV_R, r1: AV_R, r2: AV_R, color: accentColor }],
            margin: [0, 0, 0, -(AV_R * 2)],
          },
          {
            text: attInitials,
            fontSize: 19, bold: true, color: BRAND.surfaceCard,
            alignment: "center" as const,
            margin: [0, AV_R - 8, 0, 0],
          },
        ],
        width: AV_R * 2,
        alignment: "center" as const,
        margin: [0, 0, 0, 12],
      };

      // ── Membership number pill ─────────────────────────────────────────────
      const membershipPill: unknown = attMemberRef ? {
        table: {
          widths: ["auto"],
          body: [[{
            text: attMemberRef,
            fontSize: 7.5, bold: true, color: accentColor, fillColor: attLite,
            margin: [10, 3, 10, 3],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 0.5 : 0,
          vLineWidth: (i: number, n: { table: { widths: unknown[] } }) => i === 0 || i === n.table.widths.length ? 0.5 : 0,
          hLineColor: () => `${accentColor}55`,
          vLineColor: () => `${accentColor}55`,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        alignment: "center" as const,
        margin: [0, 3, 0, 0],
      } : { text: "" };

      // ── Member status badge ────────────────────────────────────────────────
      const attStatusBadge: unknown = {
        table: {
          widths: ["auto"],
          body: [[{
            text: `● ${attStatusLabel}`,
            fontSize: 6.5, bold: true, color: attStatusColor, fillColor: attStatusBg,
            margin: [9, 3, 9, 3],
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 0.5 : 0,
          vLineWidth: (i: number, n: { table: { widths: unknown[] } }) => i === 0 || i === n.table.widths.length ? 0.5 : 0,
          hLineColor: () => attStatusBorder,
          vLineColor: () => attStatusBorder,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        alignment: "center" as const,
        margin: [0, 6, 0, 0],
      };

      // ── LEFT column — avatar + identity + contact ─────────────────────────
      const leftStack: unknown[] = [
        memberAvatar,
        {
          text: attMemberName,
          fontSize: 12.5, bold: true, color: attDark,
          alignment: "center" as const, lineHeight: 1.2,
          margin: [0, 0, 0, 2],
        },
        membershipPill,
        attStatusBadge,
        {
          canvas: [{ type: "line", x1: 6, y1: 0, x2: 158, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }],
          margin: [0, 12, 0, 10],
        },
      ];
      if (attMemberEmail) leftStack.push({ text: `✉  ${attMemberEmail}`, fontSize: 7.5, color: BRAND.inkLight, margin: [0, 0, 0, 5] });
      if (attMemberPhone) leftStack.push({ text: `☎  ${attMemberPhone}`, fontSize: 7.5, color: BRAND.inkLight, margin: [0, 0, 0, 5] });
      if (attMemberCIN)   leftStack.push({
        stack: [
          { text: "CARTE D'IDENTITÉ (CIN)", fontSize: 5.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.3, margin: [0, 6, 0, 1] },
          { text: attMemberCIN, fontSize: 10, bold: true, color: BRAND.ink },
        ],
      });

      // ── RIGHT column — property data grid ────────────────────────────────
      const rCell = (label: string, value: string, color?: string): unknown => ({
        stack: [
          { text: label, fontSize: 5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.5, margin: [0, 0, 0, 1] },
          { text: value || "—", fontSize: 9.5, bold: true, color: color || BRAND.ink, lineHeight: 1.2 },
        ],
      });

      const rSep = (): unknown => ({
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 350, y2: 0, lineWidth: 0.4, lineColor: BRAND.borderLight }],
      });

      const rightStack: unknown[] = [
        // Row 1: N° Lot  |  CIN
        {
          columns: [
            { ...rCell("N° DE LOT", attLotNum, accentColor) as object, width: 70 },
            {
              canvas: [{ type: "line", x1: 0, y1: 0, x2: 0, y2: 32, lineWidth: 0.4, lineColor: BRAND.border }],
              width: 1, margin: [0, 0, 0, 0],
            },
            { ...rCell("CARTE D'IDENTITÉ NATIONALE (CIN)", attMemberCIN || "—") as object, width: "*", margin: [10, 0, 0, 0] as [number, number, number, number] },
          ],
          margin: [14, 12, 14, 10],
        },
        rSep(),
        // Row 2: Résidence / Immeuble (full width)
        {
          stack: [
            { text: "RÉSIDENCE / IMMEUBLE", fontSize: 5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.5, margin: [0, 0, 0, 1] },
            { text: attBuilding || syndInfo.name || "—", fontSize: 9.5, bold: true, color: BRAND.ink, lineHeight: 1.2 },
            ...(attBuildAddr ? [{ text: attBuildAddr, fontSize: 7, color: BRAND.muted, margin: [0, 2, 0, 0] }] : []),
          ],
          margin: [14, 10, 14, 10],
        },
        rSep(),
        // Row 3: Surface  |  Étage
        {
          columns: [
            { ...rCell("SURFACE PRIVATIVE", attLotSurface || "—") as object, width: "*" },
            {
              canvas: [{ type: "line", x1: 0, y1: 0, x2: 0, y2: 32, lineWidth: 0.4, lineColor: BRAND.border }],
              width: 1,
            },
            { ...rCell("ÉTAGE", attFloorLabel) as object, width: 90, margin: [10, 0, 0, 0] as [number, number, number, number] },
          ],
          margin: [14, 10, 14, 10],
        },
        rSep(),
        // Row 4: Date d'adhésion (full width)
        {
          ...rCell("DATE D'ADHÉSION AU SYNDICAT", attJoinDate || today) as object,
          margin: [14, 10, 14, 16],
        },
      ];

      // ── Member Profile Card ────────────────────────────────────────────────
      const memberProfileCard = {
        table: {
          widths: ["37%", "*"],
          body: [[
            {
              stack: leftStack,
              fillColor: BRAND.surface,
              margin: [14, 16, 14, 18],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
            },
            {
              stack: rightStack,
              fillColor: BRAND.surfaceCard,
              margin: [0, 0, 0, 0],
              border: [false, true, true, true] as [boolean, boolean, boolean, boolean],
            },
          ]],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.7 : 0,
          vLineWidth: (i: number) => i === 0 || i === 2 ? 0.7 : (i === 1 ? 0.7 : 0),
          hLineColor: () => BRAND.border,
          vLineColor: () => BRAND.border,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 6],
      };

      // ── Certification Legal Paragraph ──────────────────────────────────────
      const certPreamble =
        `Le syndicat de copropriété ${syndInfo.name}` +
        (syndInfo.registrationNumber ? `, immatriculé sous le N° ${syndInfo.registrationNumber},` : `,`) +
        ` régulièrement constitué conformément à la Loi 18-00 relative à la copropriété des immeubles bâtis au Maroc,`;

      const certMain =
        `que ${attMemberName}` +
        (attMemberCIN  ? `, titulaire de la CIN N° ${attMemberCIN},` : "") +
        (attLotNum     ? ` propriétaire du lot N° ${attLotNum}` : "") +
        (attBuilding   ? ` au sein de la résidence ${attBuilding}` : "") +
        `, est membre en règle du syndicat de copropriété à la date du ${today}.`;

      const certJoin = attJoinDate
        ? `L'intéressé(e) est enregistré(e) en qualité de copropriétaire depuis le ${attJoinDate}.` +
          (attCotisation === "paid"
            ? " À ce jour, l'ensemble des obligations financières vis-à-vis du syndicat sont intégralement honorées."
            : attCotisation === "overdue"
            ? " Note : des charges demeurent impayées au syndicat à la date de délivrance."
            : "")
        : "";

      const certDisclaimer =
        `La présente attestation est délivrée à la demande de l'intéressé(e) pour servir et valoir ce que de droit. ` +
        `Elle est établie sur la base des informations figurant au registre du syndicat à la date d'émission ` +
        `ci-dessus et ne saurait être utilisée à des fins autres que celles pour lesquelles elle a été produite.`;

      const certificationBlock: unknown = {
        stack: [
          // Preamble text
          { text: body || certPreamble, style: "body", margin: [0, 0, 0, 12] },
          // "ATTESTE ET CERTIFIE" — centered, prominent, with hairlines
          {
            canvas: [{ type: "line", x1: 80, y1: 0, x2: 435, y2: 0, lineWidth: 0.5, lineColor: `${accentColor}44` }],
            margin: [0, 0, 0, 8],
          },
          {
            text: "ATTESTE  ET  CERTIFIE",
            fontSize: 11, bold: true, alignment: "center" as const,
            color: accentColor, characterSpacing: 2.5,
            margin: [0, 0, 0, 8],
          },
          {
            canvas: [{ type: "line", x1: 80, y1: 0, x2: 435, y2: 0, lineWidth: 0.5, lineColor: `${accentColor}44` }],
            margin: [0, 0, 0, 12],
          },
          // Main certification statement (only when body not overridden)
          ...(!body ? [
            { text: certMain, style: "body", margin: [0, 0, 0, 8] },
            ...(certJoin ? [{ text: certJoin, style: "body", margin: [0, 0, 0, 8] }] : []),
          ] : []),
          // Legal disclaimer
          { text: certDisclaimer, fontSize: 8, color: BRAND.muted, lineHeight: 1.5, italics: true },
        ],
      };

      // ── Signature Area ─────────────────────────────────────────────────────
      const findAttSig = (roles: string[]) => signatures.find((s) => roles.some((r) => s.signerRole === r));
      const attPresidentSig = findAttSig(["president", "syndicate_admin", "super_admin"]);
      const attSecretarySig = findAttSig(["secretary"]);

      const attSealDate   = attPresidentSig?.signedAt.toLocaleDateString("fr-FR") ?? today;
      const attSealStatus = attPresidentSig ? (attPresidentSig.isValid ? "VALID" : "REVOKED") : "PENDING";
      const attSeal = buildOfficialSeal(syndInfo.name, accentColor, attPresidentSig?.signerName, attSealDate, attSealStatus);

      // DocuSign-style column builder — never shows "En attente" when a real sig exists
      const makeAttCol = (
        colLabel: string,
        holderName: string | undefined,
        sig: InlineSignatureInfo | undefined,
      ): unknown => {
        const hasSig  = !!sig;
        const hasTrace = sig?.signatureData?.trim().startsWith("<svg");
        const sigDateStr = sig?.signedAt.toLocaleString("fr-FR") ?? "";

        const cs: unknown[] = [
          // Role label
          { text: colLabel.toUpperCase(), fontSize: 6.5, bold: true, color: BRAND.mutedLight, characterSpacing: 0.6, margin: [0, 0, 0, 4] },
          // Name
          { text: holderName || "—", fontSize: 10.5, bold: true, color: BRAND.ink, margin: [0, 0, 0, 10] },
        ];

        if (hasSig) {
          // DocuSign validation badge with ✓/✗ prefix
          cs.push({
            table: {
              widths: ["auto", "*"],
              body: [[
                {
                  text: sig!.isValid ? "✓" : "✗",
                  fontSize: 7, bold: true,
                  color: sig!.isValid ? BRAND.successDark : BRAND.destructiveDark,
                  fillColor: sig!.isValid ? BRAND.successLight : BRAND.destructiveLight,
                  margin: [5, 2, 4, 2],
                  border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                },
                {
                  text: "SIGNÉ ÉLECTRONIQUEMENT",
                  fontSize: 5.5, bold: true,
                  color: sig!.isValid ? BRAND.successDark : BRAND.destructiveDark,
                  characterSpacing: 0.4, margin: [2, 3, 8, 3],
                  border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                },
              ]],
            },
            layout: {
              hLineWidth: (ii: number, n: { table: { body: unknown[] } }) => ii === 0 || ii === n.table.body.length ? 0.5 : 0,
              vLineWidth: (ii: number, n: { table: { widths: unknown[] } }) => ii === 0 || ii === n.table.widths.length ? 0.5 : 0,
              hLineColor: () => sig!.isValid ? BRAND.success : BRAND.destructive,
              vLineColor: () => sig!.isValid ? BRAND.success : BRAND.destructive,
              paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
            },
            margin: [0, 0, 0, 8],
          });

          // Handwritten SVG trace — always shown when available (legal evidence)
          if (hasTrace) {
            cs.push({
              stack: [
                { svg: sig!.signatureData!, width: 185, height: 60, alignment: "center" as const },
                { canvas: [{ type: "line", x1: 0, y1: 0, x2: 215, y2: 0, lineWidth: 0.4, lineColor: BRAND.border }], margin: [0, 2, 0, 0] },
              ],
              margin: [0, 2, 0, 6],
            });
          } else {
            cs.push({
              canvas: [{ type: "line", x1: 0, y1: 0, x2: 215, y2: 0, lineWidth: 0.5, lineColor: BRAND.mutedLight }],
              margin: [0, 30, 0, 8],
            });
          }

          cs.push({ text: sigDateStr, fontSize: 7, color: BRAND.muted, margin: [0, 0, 0, 4] });

          // Validity badge
          cs.push({
            table: {
              widths: ["*"],
              body: [[{
                text: sig!.isValid ? "✓  Signature cryptographiquement valide" : "✗  Signature invalide",
                fontSize: 6.5, bold: true,
                color: sig!.isValid ? BRAND.successDark : BRAND.destructiveDark,
                fillColor: sig!.isValid ? BRAND.successLight : BRAND.destructiveLight,
                alignment: "center" as const, margin: [4, 3, 4, 3],
              }]],
            },
            layout: {
              hLineWidth: (ii: number, n: { table: { body: unknown[] } }) => ii === 0 || ii === n.table.body.length ? 0.5 : 0,
              vLineWidth: (ii: number, n: { table: { widths: unknown[] } }) => ii === 0 || ii === n.table.widths.length ? 0.5 : 0,
              hLineColor: () => sig!.isValid ? BRAND.success : BRAND.destructive,
              vLineColor: () => sig!.isValid ? BRAND.success : BRAND.destructive,
              paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
            },
          });
        } else {
          // Placeholder — ONLY rendered when no real signature exists
          cs.push({
            canvas: [{ type: "line", x1: 0, y1: 0, x2: 215, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }],
            margin: [0, 34, 0, 8],
          });
          cs.push({ text: t("awaitingSignature", lang), fontSize: 7, color: BRAND.mutedLight, italics: true });
        }

        return { stack: cs };
      };

      const signatureArea = {
        stack: [
          // Thin separator rule
          {
            canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }],
            margin: [0, 0, 0, 12],
          },
          // Header row: section label + institutional stamp (right-aligned)
          {
            columns: [
              {
                text: "SIGNATURES OFFICIELLES",
                fontSize: 7, bold: true, color: accentColor, characterSpacing: 0.6,
                width: "*",
              },
              { stack: [attSeal], width: 114, alignment: "right" as const },
            ],
            margin: [0, 0, 0, 16],
          },
          // Two-column signer grid
          {
            columns: [
              { ...makeAttCol(t("rolePresident", lang), attOffice?.president?.fullName, attPresidentSig) as object, width: "*" },
              { width: 24, text: "" },
              { ...makeAttCol(t("roleSecretary", lang), attOffice?.secretary?.fullName, attSecretarySig) as object, width: "*" },
            ],
          },
        ],
        margin: [0, 28, 0, 0],
      };

      content = [
        ...header,
        identityStrip,
        titleBlock,
        attDiv("PROFIL DU MEMBRE"),
        memberProfileCard,
        attDiv("CERTIFICATION OFFICIELLE"),
        certificationBlock,
        signatureArea,
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    case "pv":
      content = [
        ...header,
        buildMeetingBanner(accentColor, input.meetingType as string || "ASSEMBLÉE GÉNÉRALE", input.lieu as string, today, lang),
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaMeetingDate", lang), today],
          [t("metaSyndicate", lang), syndInfo.name],
          [t("metaLocation", lang), input.lieu as string || t("metaSeatOfSyndicate", lang)],
          [t("metaChairperson", lang), input.president as string || (input.officeHolders as OfficeHolders | undefined)?.president?.fullName || syndInfo.name],
          [t("metaSecretarySession", lang), input.secretaire as string || (input.officeHolders as OfficeHolders | undefined)?.secretary?.fullName || "—"],
        ], accentColor),
        contentSection(t("pvAgendaTitle", lang), input.agendaText as string || body || t("pvAgendaText", lang), accentColor, isArabic),
        contentSection(t("pvDeliberationsTitle", lang), input.deliberationsText as string || t("pvDeliberationsText", lang), accentColor, isArabic),
        contentSection(t("pvResolutionsTitle", lang), input.resolutionsText as string || t("pvResolutionsText", lang), accentColor, isArabic),
        { text: "\n" },
        multiSignatoryBlock(input.officeHolders as OfficeHolders | undefined, accentColor, lang, signatures, syndInfo.name),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

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
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
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
        signatureBlock("L'Auteur du rapport", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    case "decision":
      content = [
        ...header,
        buildGovernanceBanner(accentColor, theme.categoryLabel, `Réf. ${docNum} — ${today}`),
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
              fillColor: BRAND.successLight,
              margin: [10, 8, 10, 8],
            }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => BRAND.success,
            vLineColor: () => BRAND.success,
          },
          margin: [0, 0, 0, 16],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    case "certificat":
      content = [
        ...header,
        buildCertificateFrame(accentColor, lang),
        { text: t("certificateWord", lang), fontSize: 26, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 8, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 20] },
        metaTable([
          [t("metaDeliveredTo", lang), member || t("certificatBeneficiaryFallback", lang)],
          [t("certificatDeliveryDate", lang), today],
          [t("metaIssuer", lang), syndInfo.name],
          ...(syndInfo.registrationNumber ? [[t("metaRegRef", lang), syndInfo.registrationNumber] as [string, string]] : []),
        ], accentColor),
        contentSection(
          t("certificatSectionTitle", lang),
          body || fmt(t("certificatBody", lang), { syndicate: syndInfo.name, member: member || t("certificatBeneficiaryFallback", lang) }),
          accentColor,
          isArabic,
        ),
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
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
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    // ── Template 10: Demande Administrative ─────────────────────────────────────
    case "demande_administrative":
      content = [
        ...header,
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
        ...header,
        // Premium title band
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 0, 0, 12] },
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
        ...header,
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

    // ── Template 22: Attestation de Résidence (auto-fills lot/building from DB) ──
    case "attestation_residence": {
      // Entity-backed: prefer data from getLotMemberData (_lotNumber, _lotFloor, _buildingName)
      // over manual entry so no re-typing is needed when lotId is provided.
      const lot          = (input.lotNumber as string) || (input._lotNumber as string) || "—";
      const propertyName = (input._buildingName as string) || (input.property as PropertyInfo | undefined)?.name || syndInfo.name;
      const propertyAddress = (input._buildingAddress as string) || (input.property as PropertyInfo | undefined)?.address || syndInfo.address;
      const propertyCity = (input.property as PropertyInfo | undefined)?.city || syndInfo.city;
      const lotFloor = (input.lotFloor as string | undefined) || (input._lotFloor as string | undefined);
      content = [
        ...header,
        // Accent bar
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 0, 0, 12] },
        { text: "ATTESTATION DE RÉSIDENCE", fontSize: 20, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaDeliveredTo", lang), member || t("notRenseigne", lang)],
          [t("metaIssueDate", lang), today],
          [t("metaIssuer", lang), syndInfo.name],
          ...(syndInfo.registrationNumber ? [[t("metaRegRef", lang), syndInfo.registrationNumber] as [string, string]] : []),
          ["Résidence / Immeuble :", propertyName],
          ["Adresse :", [propertyAddress, propertyCity].filter(Boolean).join(", ") || "—"],
          ...(lot !== "—" ? [["N° d'appartement :", lot] as [string, string]] : []),
          ...(lotFloor ? [["Étage :", lotFloor] as [string, string]] : []),
        ], accentColor),
        contentSection(
          t("attestationSectionTitle", lang),
          body || (
            `Le Syndicat de Copropriété ${syndInfo.name}, dont le siège social est situé à ` +
            `${[syndInfo.address, syndInfo.city].filter(Boolean).join(", ") || "l'adresse du syndicat"}, ` +
            `certifie par la présente attestation que :\n\n` +
            `${member || "[NOM DU MEMBRE]"}\n\n` +
            `réside à l'appartement N° ${lot} de la résidence ${propertyName}` +
            `${lotFloor ? `, ${lotFloor}` : ""}` +
            `, sise à ${[propertyAddress, propertyCity].filter(Boolean).join(", ") || "l'adresse de la résidence"}.\n\n` +
            `Cette attestation est délivrée à la demande de l'intéressé(e) pour servir et valoir ce que de droit.`
          ),
          accentColor,
          isArabic,
        ),
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 8, 0, 16] },
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Template 23: Attestation de Propriété (auto-fills TF / tantiemes) ────────
    case "attestation_propriete": {
      const prop = input.property as PropertyInfo | undefined;
      // Auto-filled from getLotMemberData when lotId is provided
      const titreFoncier = (input.titreFoncier as string) || (input._lotTitreFoncier as string) || prop?.landRegistryReference || "—";
      const tantiemes    = (input.tantiemes as string) || (input._lotTantiemes as string) || "—";
      const lotNum       = (input.lotNumber as string) || (input._lotNumber as string) || "—";
      const propName     = (input._buildingName as string) || prop?.name || syndInfo.name;
      content = [
        ...header,
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 0, 0, 12] },
        { text: "ATTESTATION DE PROPRIÉTÉ", fontSize: 20, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaDeliveredTo", lang), member || t("notRenseigne", lang)],
          [t("metaIssueDate", lang), today],
          [t("metaIssuer", lang), syndInfo.name],
          ["Titre Foncier :", titreFoncier],
          ["N° de lot / appartement :", lotNum],
          ["Quote-part / Tantiièmes :", tantiemes],
          ["Résidence :", propName],
          ...(syndInfo.registrationNumber ? [[t("metaRegRef", lang), syndInfo.registrationNumber] as [string, string]] : []),
        ], accentColor),
        contentSection(
          "Attestation de Propriété Immobilière",
          body || (
            `Le Syndicat de Copropriété ${syndInfo.name} atteste par la présente que :\n\n` +
            `${member || "[NOM DU PROPRIÉTAIRE]"}\n\n` +
            `est propriétaire du lot N° ${lotNum} (appartement/local) ` +
            `de la résidence ${propName}, inscrit sous le Titre Foncier N° ${titreFoncier}, ` +
            `avec une quote-part de ${tantiemes} tantiièmes.\n\n` +
            `Cette attestation est délivrée sur la base des documents détenus par le syndicat et est valable uniquement pour la situation connue à ce jour.`
          ),
          accentColor,
          isArabic,
        ),
        {
          table: {
            widths: ["*"],
            body: [[{
              text: "⚠  Ce document ne constitue pas un titre de propriété au sens du droit foncier. Pour tout acte juridique, veuillez vous référer au registre foncier compétent.",
              style: "notice",
              fillColor: BRAND.warningLight,
              margin: [10, 8, 10, 8],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => BRAND.warning, vLineColor: () => BRAND.warning },
          margin: [0, 0, 0, 16],
        },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 8, 0, 16] },
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    // ── Template 24: Attestation de Paiement des Charges ─────────────────────────
    case "attestation_paiement": {
      const periode = (input.periode as string) || `Exercice ${new Date().getFullYear()}`;
      // Auto-calculated by getAttestationPaiementData when lotId provided
      const montant = (input.montant as string) || "—";
      const statusPaiement = (input._paiementStatus as string) || "";
      const lotNum = (input.lotNumber as string) || (input._lotNumber as string) || "—";
      const lastPaid = (input._lastPaidDate as string) || "";
      content = [
        ...header,
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 0, 0, 12] },
        { text: "ATTESTATION DE PAIEMENT DES CHARGES", fontSize: 18, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaDeliveredTo", lang), member || t("notRenseigne", lang)],
          [t("metaIssueDate", lang), today],
          [t("metaIssuer", lang), syndInfo.name],
          ["Période couverte :", periode],
          ...(lotNum !== "—" ? [["N° de lot :", lotNum] as [string, string]] : []),
          ...(montant !== "—" ? [["Montant total réglé :", `${montant} MAD`] as [string, string]] : []),
          ...(syndInfo.registrationNumber ? [[t("metaRegRef", lang), syndInfo.registrationNumber] as [string, string]] : []),
        ], accentColor),
        contentSection(
          "Attestation de Bonne Foi de Paiement",
          body || (
            `Le Syndicat de Copropriété ${syndInfo.name} certifie que :\n\n` +
            `${member || "[NOM DU MEMBRE]"}, copropriétaire du lot N° ${lotNum},\n\n` +
            (statusPaiement && statusPaiement !== "EN RÈGLE"
              ? `est en cours de régularisation de ses charges de copropriété pour la période : ${periode}.\n\n` +
                `Montant total réglé à ce jour : ${montant !== "—" ? montant + " MAD" : "[montant]"}.\n\n` +
                `Veuillez régulariser votre situation dans les plus brefs délais.`
              : `est en règle de paiement de ses charges de copropriété pour la période : ${periode}.\n\n` +
                `Montant total réglé : ${montant !== "—" ? montant + " MAD" : "[montant]"}.\n\n` +
                `À la date de délivrance de la présente attestation, aucune somme n'est due au titre des charges communes exigibles pour la période mentionnée ci-dessus.`) +
            `\n\nCette attestation est établie sur la base des écritures comptables du syndicat et est délivrée ` +
            `à la demande de l'intéressé(e) pour servir et valoir ce que de droit.`
          ),
          accentColor,
          isArabic,
        ),
        {
          table: {
            widths: ["*"],
            body: [[{
              stack: [
                {
                  text: statusPaiement && statusPaiement !== "EN RÈGLE"
                    ? `⚠  ${statusPaiement}`
                    : "✓  Situation comptable vérifiée à la date de délivrance",
                  fontSize: 9,
                  color: statusPaiement && statusPaiement !== "EN RÈGLE" ? BRAND.warningDark : BRAND.successDeep,
                  bold: true,
                  margin: [0, 0, 0, 2],
                },
                {
                  text: lastPaid
                    ? `Dernier paiement enregistré le : ${lastPaid}`
                    : "Cette attestation n'engage pas le syndicat pour les charges futures.",
                  fontSize: 8,
                  color: statusPaiement && statusPaiement !== "EN RÈGLE" ? BRAND.warningDark : BRAND.successDeep,
                },
              ],
              fillColor: statusPaiement && statusPaiement !== "EN RÈGLE" ? BRAND.warningLight : BRAND.successLight,
              margin: [12, 8, 12, 8],
            }]],
          },
          layout: {
            hLineWidth: () => 1, vLineWidth: () => 1,
            hLineColor: () => statusPaiement && statusPaiement !== "EN RÈGLE" ? BRAND.warning : BRAND.success,
            vLineColor: () => statusPaiement && statusPaiement !== "EN RÈGLE" ? BRAND.warning : BRAND.success,
          },
          margin: [0, 0, 0, 16],
        },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 8, 0, 16] },
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

      content = [
        ...header,
        { text: input.title || "APPEL DE FONDS", style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: `Période : ${periode}  •  Réf. : ${receiptNum}`, fontSize: 8, color: BRAND.muted, alignment: "center" as const, margin: [0, 0, 0, 20] },
        // Copropriétaire info card
        metaTable([
          ["COPROPRIÉTAIRE", (input.memberName as string) || member || "—"],
          ["IMMEUBLE", buildingName2],
          ["N° LOT / APPARTEMENT", `Lot ${lotNumber} — Étage ${floor}`],
          ["SURFACE", surface],
          ["TITRE FONCIER", titreFoncier],
          ["TANTIEMES", tantiemes],
        ], accentColor),
        // ── Building-level financial context (from _kpi* keys) ──────────────
        ...(() => {
          const outstanding = (input._kpiOutstanding as string) || "";
          const collRate    = (input._kpiCollectionRate as string) || "";
          if (!outstanding && !collRate) return [];
          return [kpiRow([
            { label: "Taux de Recouvrement (Immeuble)", value: collRate ? `${collRate}%` : "—",
              valueColor: parseInt(collRate || "0") >= 90 ? BRAND.successDark : BRAND.destructiveDark, bgColor: BRAND.surface },
            { label: "Impayés Totaux (Immeuble)",       value: outstanding ? `${outstanding} MAD` : "—",
              valueColor: outstanding && outstanding !== "0" ? BRAND.destructiveDark : BRAND.successDark, bgColor: BRAND.surface },
            { label: "Trésorerie",                      value: (input._kpiCashBalance as string) ? `${input._kpiCashBalance} MAD` : "—",
              bgColor: BRAND.successLight },
          ], accentColor)];
        })(),

        // Charge details
        contentSection("DÉTAILS DE L'APPEL DE FONDS", [
          `Nature des charges : ${chargeType}`,
          `Période : ${periode}`,
          `Montant appelé : ${amount.toLocaleString("fr-MA", { style: "currency", currency: "MAD" })}`,
          `Date d'échéance : ${dueDate}`,
          `Numéro de référence : ${receiptNum}`,
        ].join("\n"), accentColor),
        // Payment instructions
        contentSection("MODALITÉS DE PAIEMENT", [
          "Modes de paiement acceptés :",
          "  • Virement bancaire au compte du syndicat",
          "  • Chèque libellé à l'ordre du syndicat de copropriété",
          "  • Remise en espèces au bureau syndical (contre reçu)",
          "",
          `Veuillez mentionner la référence ${receiptNum} sur tout virement.`,
          "",
          "Passé la date d'échéance, des pénalités de retard pourront être appliquées conformément au règlement de copropriété.",
        ].join("\n"), accentColor),
        // Amount box
        {
          table: {
            widths: ["*", "auto"],
            body: [[
              { text: "MONTANT DÛ", fontSize: 11, bold: true, color: BRAND.inkMid, margin: [16, 14, 8, 14], border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
              {
                text: amount.toLocaleString("fr-MA") + " MAD",
                fontSize: 18, bold: true, color: BRAND.surfaceCard,
                fillColor: accentColor,
                alignment: "right" as const,
                margin: [16, 10, 16, 10],
                border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
              },
            ]],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => i === 0 || i === node.table.body.length ? 0.8 : 0,
            vLineWidth: () => 0,
            hLineColor: () => BRAND.border,
            fillColor: (_: number, __: unknown, col: number) => col === 0 ? BRAND.surface : null,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 16, 0, 24],
        },
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
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

    // ── Facture ──────────────────────────────────────────────────────────────
    case "facture": {
      const invoiceAmount = Number(input.amount as string ?? 0);
      const invoiceDue = (input.dueDate as string) || "—";
      const recipient = (input.memberName as string) || member || (input._recipient as string) || "—";
      const invoiceRef = (input._invoiceRef as string) || docNum;
      const invoiceStatus = (input._invoiceStatus as string) || "draft";
      const invoiceStatusLabel = ({ draft: "BROUILLON", sent: "ENVOYÉE", paid: "PAYÉE", overdue: "EN RETARD", cancelled: "ANNULÉE" } as Record<string, string>)[invoiceStatus] || invoiceStatus.toUpperCase();

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

      content = [
        ...header,
        { text: `FACTURE N° ${invoiceRef}`, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 4] },
        { text: `Date : ${today}  •  Échéance : ${invoiceDue}`, fontSize: 8, color: BRAND.muted, alignment: "center" as const, margin: [0, 0, 0, 20] },
        metaTable([
          ["FACTURÉ À",       recipient],
          ["RÉFÉRENCE",       invoiceRef],
          ["ICE SYNDICAT",    syndInfo.registrationNumber || "—"],
          ["STATUT",          invoiceStatusLabel],
          ["DATE FACTURE",    (input._invoiceDate as string) || today],
          ["DATE ÉCHÉANCE",   invoiceDue],
        ], accentColor),
        // Lines table header
        {
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
            vLineWidth: () => 0,
            hLineColor: () => BRAND.border,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          },
          margin: [0, 0, 0, 0],
        },
        // Totals
        {
          table: {
            widths: ["*", 150],
            body: [
              [
                { text: "", border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
                {
                  stack: [
                    { columns: [{ text: "Total HT", fontSize: 9, color: BRAND.muted, width: "*" }, { text: `${totalHT.toLocaleString("fr-MA")} MAD`, fontSize: 9, width: "auto", alignment: "right" as const }], margin: [12, 8, 12, 2] },
                    { columns: [{ text: "TVA (20%)", fontSize: 9, color: BRAND.muted, width: "*" }, { text: `${tva.toLocaleString("fr-MA")} MAD`, fontSize: 9, width: "auto", alignment: "right" as const }], margin: [12, 2, 12, 6] },
                    { canvas: [{ type: "line", x1: 12, y1: 0, x2: 138, y2: 0, lineWidth: 0.5, lineColor: BRAND.border }] },
                    {
                      columns: [
                        { text: "TOTAL TTC", fontSize: 11, bold: true, color: BRAND.ink, width: "*" },
                        { text: `${totalTTC.toLocaleString("fr-MA")} MAD`, fontSize: 11, bold: true, color: accentColor, width: "auto", alignment: "right" as const },
                      ],
                      margin: [12, 8, 12, 10],
                    },
                  ],
                  fillColor: BRAND.surface,
                  border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
                  borderColor: [BRAND.border, BRAND.border, BRAND.border, BRAND.border],
                },
              ],
            ],
          },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
          margin: [0, 0, 0, 24],
        },
        signatureBlock("Le Trésorier du Syndicat", syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
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
        contentSection("RÉSULTATS PAR CANDIDAT", candidatesText, accentColor),
        ...(mandateDuration !== "—" ? [contentSection("MANDATS", `Durée des mandats des candidats élus : ${mandateDuration}\n\nLes membres élus entrent en fonction à la date de publication du présent procès-verbal.`, accentColor)] : []),
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
        ...header,
        // Premium title block
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 0, 0, 12] },
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
    ...pageSetup,
    content,
    styles,
    footer,
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
