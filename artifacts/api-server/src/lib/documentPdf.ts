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

// ─── Styles ───────────────────────────────────────────────────────────────────

// ─── Document Category Theme System ───────────────────────────────────────────
// 7 distinct visual identities mapped by document template category.
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
  const themes: Record<string, DocumentTheme> = {
    // ── Contracts & Partnerships ──────────────────────────────────────────────
    contrat:               { primary: "#0f2d52", secondary: "#091e3a", light: "#eff6ff", icon: "⚖", categoryLabel: "CONTRAT" },
    convention_partenariat:{ primary: "#0f2d52", secondary: "#091e3a", light: "#eff6ff", icon: "⚖", categoryLabel: "CONVENTION DE PARTENARIAT" },
    accord_collectif:      { primary: "#0f2d52", secondary: "#091e3a", light: "#eff6ff", icon: "⚖", categoryLabel: "ACCORD COLLECTIF" },

    // ── Financial Documents ───────────────────────────────────────────────────
    rapport_financier:     { primary: "#064e3b", secondary: "#043a2c", light: "#ecfdf5", icon: "₪", categoryLabel: "RAPPORT FINANCIER" },
    rapport_audit:         { primary: "#064e3b", secondary: "#043a2c", light: "#ecfdf5", icon: "₪", categoryLabel: "RAPPORT D'AUDIT" },
    rapport_activite:      { primary: "#064e3b", secondary: "#043a2c", light: "#ecfdf5", icon: "₪", categoryLabel: "RAPPORT D'ACTIVITÉ" },
    rapport:               { primary: "#064e3b", secondary: "#043a2c", light: "#ecfdf5", icon: "₪", categoryLabel: "RAPPORT" },

    // ── Meeting & Deliberation ────────────────────────────────────────────────
    pv:                    { primary: "#1e3a8a", secondary: "#152b6e", light: "#eff6ff", icon: "◆", categoryLabel: "PROCÈS-VERBAL" },
    compte_rendu:          { primary: "#1e3a8a", secondary: "#152b6e", light: "#eff6ff", icon: "◆", categoryLabel: "COMPTE-RENDU" },
    convocation:           { primary: "#1e3a8a", secondary: "#152b6e", light: "#eff6ff", icon: "◆", categoryLabel: "CONVOCATION" },
    circulaire:            { primary: "#1e3a8a", secondary: "#152b6e", light: "#eff6ff", icon: "◆", categoryLabel: "CIRCULAIRE" },
    note_interne:          { primary: "#1e3a8a", secondary: "#152b6e", light: "#eff6ff", icon: "◆", categoryLabel: "NOTE INTERNE" },

    // ── Electoral & Governance ────────────────────────────────────────────────
    decision:              { primary: "#881337", secondary: "#6b0f2c", light: "#fff1f2", icon: "★", categoryLabel: "DÉCISION OFFICIELLE" },

    // ── Regulatory & Statutory ────────────────────────────────────────────────
    reglement:             { primary: "#312e81", secondary: "#25236a", light: "#eef2ff", icon: "§", categoryLabel: "RÈGLEMENT DE COPROPRIÉTÉ" },

    // ── Certificates & Attestations ───────────────────────────────────────────
    attestation:           { primary: "#065f46", secondary: "#044b38", light: "#f0fdf4", icon: "✓", categoryLabel: "ATTESTATION" },
    attestation_residence: { primary: "#065f46", secondary: "#044b38", light: "#f0fdf4", icon: "✓", categoryLabel: "ATTESTATION DE RÉSIDENCE" },
    attestation_propriete: { primary: "#065f46", secondary: "#044b38", light: "#f0fdf4", icon: "✓", categoryLabel: "ATTESTATION DE PROPRIÉTÉ" },
    attestation_paiement:  { primary: "#065f46", secondary: "#044b38", light: "#f0fdf4", icon: "✓", categoryLabel: "ATTESTATION DE PAIEMENT" },
    certificat:            { primary: "#065f46", secondary: "#044b38", light: "#f0fdf4", icon: "✓", categoryLabel: "CERTIFICAT OFFICIEL" },

    // ── Legal & Enforcement ───────────────────────────────────────────────────
    mise_en_demeure:       { primary: "#7c2d12", secondary: "#5e2009", light: "#fff7ed", icon: "!", categoryLabel: "MISE EN DEMEURE" },
    lettre_officielle:     { primary: "#7c2d12", secondary: "#5e2009", light: "#fff7ed", icon: "!", categoryLabel: "LETTRE OFFICIELLE" },

    // ── Administrative ────────────────────────────────────────────────────────
    demande_administrative:{ primary: "#374151", secondary: "#1f2937", light: "#f9fafb", icon: "→", categoryLabel: "DEMANDE ADMINISTRATIVE" },
    autorisation:          { primary: "#374151", secondary: "#1f2937", light: "#f9fafb", icon: "→", categoryLabel: "AUTORISATION" },
    ordre_de_mission:      { primary: "#374151", secondary: "#1f2937", light: "#f9fafb", icon: "→", categoryLabel: "ORDRE DE MISSION" },
  };

  const found = themes[template];
  if (found) return found;
  const primary = fallbackColor || "#1e3a5f";
  return {
    primary,
    secondary: adjustColorBrightness(primary, -20),
    light: adjustColorBrightness(primary, 90),
    icon: "■",
    categoryLabel: "DOCUMENT OFFICIEL",
  };
}

// ─── Typography & Style System ────────────────────────────────────────────────

function buildStyles(accentColor: string) {
  return {
    // ── Header band ────────────────────────────────────────────────────────────
    headerOrgName:    { font: PRIMARY_FONT, fontSize: 15,   bold: true,  color: "#ffffff" },
    headerBuilding:   { font: PRIMARY_FONT, fontSize: 9.5,  bold: true,  color: "#ffffffee" },
    headerMeta:       { font: PRIMARY_FONT, fontSize: 7.5,  color: "#ffffffcc" },
    headerContact:    { font: PRIMARY_FONT, fontSize: 7,    color: "#ffffffaa" },
    headerDocNum:     { font: PRIMARY_FONT, fontSize: 9,    bold: true,  color: "#ffffff" },
    headerDocDate:    { font: PRIMARY_FONT, fontSize: 7.5,  color: "#ffffffdd" },
    docTypeLabel:     { font: PRIMARY_FONT, fontSize: 13,   bold: true,  color: "#ffffff" },
    docCategoryBadge: { font: PRIMARY_FONT, fontSize: 7,    bold: true,  color: "#ffffff" },

    // ── Document titles ────────────────────────────────────────────────────────
    docTitle:         { font: PRIMARY_FONT, fontSize: 20,   bold: true,  color: "#0f172a" },
    docSubtitle:      { font: PRIMARY_FONT, fontSize: 12,   color: "#475569", italics: true },
    docRef:           { font: PRIMARY_FONT, fontSize: 9,    color: "#64748b" },

    // ── Section headings ────────────────────────────────────────────────────────
    sectionTitle:     { font: PRIMARY_FONT, fontSize: 10.5, bold: true,  color: "#ffffff" },

    // ── Metadata cards ─────────────────────────────────────────────────────────
    metaKey:          { font: PRIMARY_FONT, fontSize: 8,    color: "#6b7280", bold: true },
    metaVal:          { font: PRIMARY_FONT, fontSize: 10,   bold: true,  color: "#111827" },

    // ── Body text ──────────────────────────────────────────────────────────────
    body:             { font: PRIMARY_FONT, fontSize: 10.5, color: "#374151", lineHeight: 1.75 },
    bodyArabic:       { font: ARABIC_FONT,  fontSize: 12,   color: "#374151", lineHeight: 1.8, alignment: "right" as const },

    // ── Signature area ─────────────────────────────────────────────────────────
    signLabel:        { font: PRIMARY_FONT, fontSize: 8.5,  color: "#6b7280", italics: true },
    signName:         { font: PRIMARY_FONT, fontSize: 10,   bold: true,  color: "#111827" },
    stampText:        { font: PRIMARY_FONT, fontSize: 5.5,  bold: true,  color: "#ffffff" },

    // ── Status/notice badges ───────────────────────────────────────────────────
    notice:           { font: PRIMARY_FONT, fontSize: 8.5,  color: "#9ca3af", italics: true },

    // ── Data tables ────────────────────────────────────────────────────────────
    tableHeader:      { font: PRIMARY_FONT, fontSize: 9.5,  bold: true,  color: "#ffffff" },
    tableCell:        { font: PRIMARY_FONT, fontSize: 9.5,  color: "#374151" },
    financialTotal:   { font: PRIMARY_FONT, fontSize: 10.5, bold: true,  color: "#111827" },

    // ── Footer ────────────────────────────────────────────────────────────────
    footer:           { font: PRIMARY_FONT, fontSize: 7,    color: "#9ca3af" },
    footerBrand:      { font: PRIMARY_FONT, fontSize: 7,    color: accentColor, bold: true },

    // ── Watermark ─────────────────────────────────────────────────────────────
    watermark:        { font: PRIMARY_FONT, fontSize: 80,   bold: true,  color: "#d1d5db", opacity: 0.07 },
    pageNumber:       { font: PRIMARY_FONT, fontSize: 8,    color: "#9ca3af" },
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
  buildingName: string | null = null,
  version: string | null = null,
  docStatus: string | null = null,
): object[] {
  // Contact / registration lines
  const contactParts: string[] = [];
  if (syndInfo.phone)   contactParts.push(`Tél : ${syndInfo.phone}`);
  if (syndInfo.email)   contactParts.push(syndInfo.email);
  if (syndInfo.website) contactParts.push(syndInfo.website);
  const contactLine = contactParts.join("   ·   ");
  const regLine = syndInfo.registrationNumber ? `N° Syndical : ${syndInfo.registrationNumber}` : null;
  const addressLine = [syndInfo.address, syndInfo.city].filter(Boolean).join(", ");

  // Acronym fallback
  const acronym = (syndInfo.abbreviation ||
    syndInfo.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 3)
  ).toUpperCase();

  const secondary = adjustColorBrightness(accentColor, -20);

  // ── Logo / acronym tile ───────────────────────────────────────────────────────
  const logoInner: unknown = logoDataUrl
    ? {
        image: logoDataUrl,
        width: 54,
        height: 54,
        fit: [54, 54] as [number, number],
        alignment: "center" as const,
        margin: [4, 4, 4, 4],
      }
    : {
        stack: [
          { canvas: [{ type: "rect", x: 4, y: 4, w: 58, h: 58, color: "#ffffff18", r: 3 }] },
          { text: acronym, fontSize: 20, bold: true, color: "#ffffff", alignment: "center" as const, margin: [0, -56, 0, 0] },
          { text: "SYNDIC", fontSize: 5.5, color: "#ffffffaa", alignment: "center" as const, margin: [0, 8, 0, 0] },
        ],
      };

  // ── QR tile ───────────────────────────────────────────────────────────────────
  const qrStack: unknown = {
    stack: [
      qrDataUrl
        ? { image: qrDataUrl, width: 58, height: 58, alignment: "center" as const, margin: [6, 6, 6, 3] }
        : { text: "", margin: [6, 30, 6, 3] },
      { text: "VÉRIFIER", fontSize: 5, color: "#9ca3af", alignment: "center" as const, margin: [0, 0, 0, 4] },
    ],
  };

  // ── Status badge ──────────────────────────────────────────────────────────────
  const statusMap: Record<string, { label: string; bg: string }> = {
    published: { label: "PUBLIÉ",  bg: "#16a34a" },
    signed:    { label: "SIGNÉ",   bg: "#2563eb" },
    validated: { label: "VALIDÉ",  bg: "#7c3aed" },
    archived:  { label: "ARCHIVÉ", bg: "#6b7280" },
    generated: { label: "GÉNÉRÉ",  bg: "#d97706" },
  };
  const statusEntry = docStatus ? statusMap[docStatus] : null;
  const versionStr = version || "v1.0";

  // ── Band 1 — Identity (full-width deep color) ─────────────────────────────────
  const identityBand: unknown = {
    table: {
      widths: [74, "*", 76],
      body: [[
        // Logo cell
        {
          stack: [logoInner],
          fillColor: secondary,
          alignment: "center" as const,
          margin: [0, 10, 0, 10],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        // Identity info
        {
          stack: [
            {
              canvas: [
                { type: "line", x1: 0, y1: 0, x2: 0, y2: 64, lineWidth: 1.5, lineColor: "#ffffff22" },
              ],
              absolutePosition: { x: 0, y: 0 },
            },
            { text: syndInfo.name.toUpperCase(), style: "headerOrgName", margin: [0, 0, 0, 4] },
            ...(buildingName ? [{ text: buildingName, style: "headerBuilding", margin: [0, 0, 0, 3] }] : []),
            ...(regLine       ? [{ text: regLine,      style: "headerMeta",    margin: [0, 0, 0, 2] }] : []),
            ...(addressLine   ? [{ text: addressLine,  style: "headerMeta",    margin: [0, 0, 0, 2] }] : []),
            ...(contactLine   ? [{ text: contactLine,  style: "headerContact" }] : []),
          ],
          fillColor: accentColor,
          margin: [16, 12, 8, 12],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        // QR cell
        {
          stack: [qrStack],
          fillColor: "#ffffff",
          alignment: "center" as const,
          margin: [0, 6, 0, 6],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0, vLineWidth: () => 0,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 0],
  };

  // ── Band 2 — Document type sub-band ──────────────────────────────────────────
  const statusBlock: unknown = statusEntry
    ? {
        table: {
          widths: ["auto"],
          body: [[{
            text: statusEntry.label,
            fontSize: 7,
            bold: true,
            color: "#ffffff",
            fillColor: statusEntry.bg,
            margin: [8, 3, 8, 3],
          }]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      }
    : { text: versionStr, fontSize: 7, color: "#ffffffaa", margin: [0, 3, 0, 0] };

  const typeBand: unknown = {
    table: {
      widths: ["*", "auto", 108],
      body: [[
        {
          text: docTypeLabel,
          style: "docTypeLabel",
          margin: [16, 7, 8, 7],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          fillColor: secondary,
        },
        {
          stack: [statusBlock],
          fillColor: secondary,
          alignment: "center" as const,
          margin: [8, 5, 8, 5],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
        {
          stack: [
            { text: docNumber, style: "headerDocNum", alignment: "right" as const, margin: [0, 0, 0, 2] },
            { text: today,     style: "headerDocDate", alignment: "right" as const },
          ],
          fillColor: secondary,
          margin: [8, 6, 14, 6],
          border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0, vLineWidth: () => 0,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 0],
  };

  // ── Thin accent divider separating header from body ───────────────────────────
  const divider: unknown = {
    canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 2.5, color: accentColor }],
    margin: [0, 0, 0, 24],
  };

  return [identityBand, typeBand, divider] as object[];
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

// ─── Professional Information Cards ──────────────────────────────────────────
// Replaces the old Excel-style table with a 2-column card grid.
// Each card has a labelled key in small caps and a bold value — clean,
// spacious, and visually distinct from body text.

function metaTable(rows: Array<[string, string]>, accentColor: string): unknown {
  // Pair rows into 2-column card rows
  const pairs: Array<[[string, string], [string, string] | null]> = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push([rows[i], rows[i + 1] ?? null]);
  }

  const makeCard = (row: [string, string] | null, bg: string): unknown => {
    if (!row) {
      return {
        text: "",
        fillColor: "#f9fafb",
        border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
        margin: [6, 10, 0, 10],
      };
    }
    return {
      stack: [
        { text: row[0].toUpperCase(), fontSize: 7, bold: true, color: "#9ca3af", margin: [0, 0, 0, 4] },
        { text: row[1] || "—", fontSize: 10, bold: true, color: "#111827", lineHeight: 1.3 },
      ],
      fillColor: bg,
      margin: [14, 10, 14, 10],
      border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    };
  };

  const noPad = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 };

  const cardRows = pairs.map((pair, i) => {
    const bg0 = i % 2 === 0 ? "#f8fafc" : "#f1f5f9";
    const bg1 = i % 2 === 0 ? "#f1f5f9" : "#f8fafc";
    return {
      table: {
        widths: ["*", "*"],
        body: [[makeCard(pair[0], bg0), makeCard(pair[1], bg1)]],
      },
      layout: {
        hLineWidth: (j: number, node: { table: { body: unknown[] } }) =>
          j === 0 || j === node.table.body.length ? 0.6 : 0,
        vLineWidth: () => 0,
        hLineColor: () => "#e5e7eb",
        paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 3],
    };
  });

  // Top accent rule above the card grid
  const topRule: unknown = {
    canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 2, color: accentColor }],
    margin: [0, 0, 0, 0],
  };

  return {
    stack: [topRule, ...cardRows],
    margin: [0, 6, 0, 20],
  };
}

function contentSection(title: string, text: string, accentColor: string, isRtl = false): unknown {
  const lightBg = adjustColorBrightness(accentColor, 86);
  return {
    stack: [
      // ── Section header — full-width colored band ──────────────────────────────
      {
        table: {
          widths: ["*"],
          body: [[{
            columns: [
              {
                canvas: [{ type: "rect", x: 0, y: 0, w: 3, h: 18, color: "#ffffff50" }],
                width: 12,
                margin: [0, 0, 0, 0],
              },
              {
                text: title.toUpperCase(),
                fontSize: 9.5,
                bold: true,
                color: "#ffffff",
                width: "*",
                margin: [4, 5, 12, 5],
              },
            ],
            fillColor: accentColor,
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 16, 0, 0],
      },
      // ── Body text in a lightly tinted card ───────────────────────────────────
      {
        table: {
          widths: ["*"],
          body: [[{
            ...(isRtl
              ? { text, style: "bodyArabic", margin: [14, 14, 14, 14] }
              : { text, style: "body", margin: [14, 14, 14, 14] }),
            fillColor: lightBg,
            border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
          }]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 16],
      },
    ],
  };
}

/** Real signer info threaded into the primary signature block from `documentSignaturesTable`. */
export interface InlineSignatureInfo {
  signerName: string;
  signerRole: string;
  signedAt: Date;
  isValid: boolean;
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
): unknown {
  const dateLocale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";
  const secondary = adjustColorBrightness(accentColor, -20);

  const findSig = (roles: string[]) =>
    signatures.find((s) => roles.some((r) => s.signerRole === r));

  // ── Shared badge builder for valid/invalid status ──────────────────────────
  const validityBadge = (isValid: boolean): unknown => ({
    table: {
      widths: ["*"],
      body: [[{
        text: isValid ? `✓  ${t("signatureValidLabel", lang)}` : `✗  ${t("signatureInvalidLabel", lang)}`,
        fontSize: 7.5,
        bold: true,
        color: isValid ? "#15803d" : "#dc2626",
        fillColor: isValid ? "#f0fdf4" : "#fef2f2",
        alignment: "center" as const,
        margin: [4, 4, 4, 4],
      }]],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 0.6 : 0,
      vLineWidth: (i: number, node: { table: { widths: unknown[] } }) =>
        i === 0 || i === node.table.widths.length ? 0.6 : 0,
      hLineColor: () => isValid ? "#bbf7d0" : "#fecaca",
      vLineColor: () => isValid ? "#bbf7d0" : "#fecaca",
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 4, 0, 0],
  });

  const makeSignerCol = (
    titleLabel: string,
    personName: string | null | undefined,
    sig: InlineSignatureInfo | undefined,
  ): unknown => {
    const colStack: unknown[] = [
      // Column header tile
      {
        table: {
          widths: ["*"],
          body: [[{
            text: titleLabel.toUpperCase(),
            fontSize: 8,
            bold: true,
            color: "#ffffff",
            fillColor: accentColor,
            alignment: "center" as const,
            margin: [4, 5, 4, 5],
          }]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 8],
      },
    ];

    if (personName) {
      colStack.push({ text: personName, fontSize: 9.5, bold: true, color: "#111827", alignment: "center" as const, margin: [0, 0, 0, 4] });
    }

    if (sig) {
      colStack.push(
        { text: sig.signedAt.toLocaleString(dateLocale), style: "signLabel", alignment: "center" as const, margin: [0, 0, 0, 2] },
        validityBadge(sig.isValid),
      );
    } else {
      colStack.push(
        { canvas: [{ type: "line", x1: 8, y1: 0, x2: 120, y2: 0, lineWidth: 0.6, lineColor: "#d1d5db" }], margin: [0, 24, 0, 4] },
        { text: t("awaitingSignature", lang), fontSize: 7.5, color: "#9ca3af", italics: true, alignment: "center" as const },
      );
    }
    return { stack: colStack };
  };

  // ── Premium official stamp ─────────────────────────────────────────────────
  const premiumStamp: unknown = {
    table: {
      widths: [96],
      body: [[{
        stack: [
          { text: "✦", fontSize: 14, color: "#ffffff", alignment: "center" as const, margin: [0, 7, 0, 1] },
          { canvas: [{ type: "line", x1: 10, y1: 0, x2: 82, y2: 0, lineWidth: 0.4, lineColor: "#ffffff40" }] },
          { text: t("officialStamp", lang), fontSize: 5.5, bold: true, color: "#ffffff", alignment: "center" as const, margin: [2, 3, 2, 1] },
          { text: "SYNDICAT DE COPROPRIÉTÉ", fontSize: 4, color: "#ffffffbb", alignment: "center" as const, margin: [0, 0, 0, 1] },
          { canvas: [{ type: "line", x1: 10, y1: 0, x2: 82, y2: 0, lineWidth: 0.4, lineColor: "#ffffff40" }] },
          { text: "SYNDYCAT.MA", fontSize: 4.5, color: "#ffffffcc", alignment: "center" as const, margin: [0, 2, 0, 7] },
        ],
        fillColor: secondary,
      }]],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 2 : 0,
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 2 : 0,
      hLineColor: () => accentColor,
      vLineColor: () => accentColor,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
  };

  const presidentSig = findSig(["president", "syndicate_admin", "super_admin"]);
  const treasurerSig = findSig(["treasurer"]);
  const secretarySig = findSig(["secretary"]);

  return {
    stack: [
      // Decorative separator
      {
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#e5e7eb" },
          { type: "rect", x: 0, y: -0.5, w: 52, h: 2, color: accentColor },
        ],
        margin: [0, 0, 0, 16],
      },
      {
        columns: [
          { ...makeSignerCol(t("rolePresident", lang), officeHolders?.president?.fullName, presidentSig) as object, width: "*" },
          { width: 6, text: "" },
          { ...makeSignerCol(t("roleTreasurer", lang), officeHolders?.treasurer?.fullName, treasurerSig) as object, width: "*" },
          { width: 6, text: "" },
          {
            stack: [
              makeSignerCol(t("roleSecretary", lang), officeHolders?.secretary?.fullName, secretarySig),
              { stack: [premiumStamp], alignment: "center" as const, margin: [0, 14, 0, 0] },
            ],
            width: "*",
          },
        ],
      },
    ],
    margin: [0, 28, 0, 0],
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

  // When real signatures exist, show who actually signed — never a generic stamp.
  const signerStack =
    signatures.length > 0
      ? signatures.map((sig, i) => ({
          stack: [
            { text: `${t("signedByLabel", lang)} ${sig.signerName}`, style: "signName", margin: [0, i === 0 ? 0 : 10, 0, 1] },
            { text: roleLabel(sig.signerRole, lang), style: "signLabel", margin: [0, 0, 0, 1] },
            { text: `${t("signedOnLabel", lang)} ${sig.signedAt.toLocaleString(dateLocale)}`, style: "signLabel", margin: [0, 0, 0, 1] },
            {
              text: sig.isValid ? t("signatureValidLabel", lang) : t("signatureInvalidLabel", lang),
              style: "notice",
              color: sig.isValid ? "#16a34a" : "#dc2626",
              margin: [0, 0, 0, 0],
            },
          ],
        }))
      : [{ text: t("awaitingSignature", lang), style: "signLabel", italics: true }];

  // Premium official stamp block
  const premiumStampBlock: unknown = {
    table: {
      widths: [92],
      body: [[{
        stack: [
          { text: "✦", fontSize: 12, color: "#ffffff", alignment: "center" as const, margin: [0, 6, 0, 1] },
          { canvas: [{ type: "line", x1: 6, y1: 0, x2: 82, y2: 0, lineWidth: 0.4, lineColor: "#ffffff55" }] },
          { text: "CACHET OFFICIEL", fontSize: 5.5, bold: true, color: "#ffffff", alignment: "center" as const, margin: [2, 2, 2, 0] },
          { text: "SYNDICAT DE COPROPRIÉTÉ", fontSize: 4.5, color: "#ffffffaa", alignment: "center" as const, margin: [0, 1, 0, 0] },
          { canvas: [{ type: "line", x1: 6, y1: 0, x2: 82, y2: 0, lineWidth: 0.4, lineColor: "#ffffff55" }], margin: [0, 1, 0, 1] },
          { text: t("officialStamp", lang), fontSize: 4.5, color: "#ffffffcc", alignment: "center" as const, margin: [0, 0, 0, 6] },
        ],
        fillColor: accentColor,
      }]],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 2 : 0,
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 2 : 0,
      hLineColor: () => adjustColorBrightness(accentColor, -25),
      vLineColor: () => adjustColorBrightness(accentColor, -25),
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };

  // ── Validity badge ────────────────────────────────────────────────────────
  const makeValidityBadge = (isValid: boolean): unknown => ({
    table: {
      widths: ["auto"],
      body: [[{
        text: isValid ? `✓  ${t("signatureValidLabel", lang)}` : `✗  ${t("signatureInvalidLabel", lang)}`,
        fontSize: 8,
        bold: true,
        color: isValid ? "#15803d" : "#dc2626",
        fillColor: isValid ? "#f0fdf4" : "#fef2f2",
        margin: [8, 4, 8, 4],
      }]],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 0.7 : 0,
      vLineWidth: (i: number, node: { table: { widths: unknown[] } }) =>
        i === 0 || i === node.table.widths.length ? 0.7 : 0,
      hLineColor: () => isValid ? "#bbf7d0" : "#fecaca",
      vLineColor: () => isValid ? "#bbf7d0" : "#fecaca",
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 4, 0, 0],
  });

  const signerRows: unknown[] = signatures.length > 0
    ? signatures.map((sig, i) => ({
        stack: [
          { text: sig.signerName, style: "signName", margin: [0, i === 0 ? 0 : 10, 0, 1] },
          { text: roleLabel(sig.signerRole, lang), style: "signLabel", margin: [0, 0, 0, 1] },
          { text: `${t("signedOnLabel", lang)} ${sig.signedAt.toLocaleString(dateLocale)}`, style: "signLabel", margin: [0, 0, 0, 3] },
          makeValidityBadge(sig.isValid),
        ],
      }))
    : [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.7, lineColor: "#d1d5db" }], margin: [0, 28, 0, 4] },
        { text: signatoryTitle, style: "signLabel", margin: [0, 0, 0, 1] },
        { text: syndName, style: "signName", margin: [0, 0, 0, 2] },
        { text: t("awaitingSignature", lang), style: "notice", italics: true },
      ];

  // ── Premium stamp ─────────────────────────────────────────────────────────
  const secondary = adjustColorBrightness(accentColor, -20);
  const premiumStampFinal: unknown = {
    table: {
      widths: [98],
      body: [[{
        stack: [
          { text: "✦", fontSize: 14, color: "#ffffff", alignment: "center" as const, margin: [0, 7, 0, 1] },
          { canvas: [{ type: "line", x1: 10, y1: 0, x2: 84, y2: 0, lineWidth: 0.4, lineColor: "#ffffff40" }] },
          { text: t("officialStamp", lang), fontSize: 5.5, bold: true, color: "#ffffff", alignment: "center" as const, margin: [2, 3, 2, 1] },
          { text: "SYNDICAT DE COPROPRIÉTÉ", fontSize: 4, color: "#ffffffbb", alignment: "center" as const, margin: [0, 0, 0, 1] },
          { canvas: [{ type: "line", x1: 10, y1: 0, x2: 84, y2: 0, lineWidth: 0.4, lineColor: "#ffffff40" }] },
          { text: "SYNDYCAT.MA", fontSize: 4.5, color: "#ffffffcc", alignment: "center" as const, margin: [0, 2, 0, 7] },
        ],
        fillColor: secondary,
      }]],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 2 : 0,
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 2 : 0,
      hLineColor: () => accentColor,
      vLineColor: () => accentColor,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
  };

  return {
    stack: [
      // Decorative separator with accent rule
      {
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#e5e7eb" },
          { type: "rect", x: 0, y: -0.5, w: 52, h: 2, color: accentColor },
        ],
        margin: [0, 0, 0, 16],
      },
      {
        table: {
          widths: ["*", showStampCircle ? 114 : 0],
          body: [[
            {
              stack: [
                { text: t("signAndStamp", lang).toUpperCase(), fontSize: 7.5, bold: true, color: accentColor, margin: [0, 0, 0, 10] },
                ...signerRows,
              ],
              border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
            },
            showStampCircle
              ? {
                  stack: [premiumStampFinal],
                  border: [false, false, false, false] as [boolean, boolean, boolean, boolean],
                  alignment: "center" as const,
                  margin: [4, 0, 0, 0],
                }
              : { text: "", border: [false, false, false, false] as [boolean, boolean, boolean, boolean] },
          ]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      },
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
    lang === "ar" ? "ملاحظة قانونية رسمية"
    : lang === "en" ? "LEGAL CERTIFICATION NOTE"
    : lang === "es" ? "NOTA LEGAL DE CERTIFICACIÓN"
    : "NOTE LÉGALE DE CERTIFICATION";

  return {
    table: {
      widths: ["*"],
      body: [[{
        columns: [
          {
            stack: [
              { text: "🔒", fontSize: 11, color: "#374151", margin: [0, 2, 0, 0] },
            ],
            width: 20,
          },
          {
            stack: [
              { text: titleLabel, fontSize: 7, bold: true, color: "#374151", margin: [0, 0, 0, 4] },
              { text, fontSize: 7.5, color: "#6b7280", lineHeight: 1.45 },
            ],
            width: "*",
          },
        ],
        fillColor: "#f8fafc",
        margin: [12, 10, 12, 10],
        border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
        borderColor: ["#e5e7eb", "#e5e7eb", "#e5e7eb", "#e5e7eb"],
      }]],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 0.8 : 0,
      vLineWidth: (i: number, node: { table: { widths: unknown[] } }) =>
        i === 0 || i === node.table.widths.length ? 0.8 : 0,
      hLineColor: () => "#e5e7eb",
      vLineColor: () => "#e5e7eb",
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
  accentColor = "#7c3aed",
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
  | "reglement"
  // ── 3 new smart certificate templates (auto-fills DB data) ──
  | "attestation_residence"
  | "attestation_propriete"
  | "attestation_paiement";

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
  attestation_paiement: "ATT-PAI",
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
    logoColor: "#7c3aed",
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

  // ── A4 page layout with generous professional margins ─────────────────────
  const pageSetup = {
    pageSize: "A4" as const,
    pageMargins: [44, 36, 44, 70] as [number, number, number, number],
  };

  // ── Premium enterprise footer ─────────────────────────────────────────────
  // Layout: [Syndicate name + ref + verify URL] | [QR + status badge] | [Page N/N + brand]
  const docStatus = input.docStatus as string | null ?? null;
  const statusBadgeMap: Record<string, { label: string; color: string }> = {
    published:  { label: "PUBLIÉ",  color: "#16a34a" },
    signed:     { label: "SIGNÉ",   color: "#2563eb" },
    validated:  { label: "VALIDÉ",  color: "#7c3aed" },
    archived:   { label: "ARCHIVÉ", color: "#6b7280" },
    generated:  { label: "GÉNÉRÉ",  color: "#d97706" },
    draft:      { label: "BROUILLON", color: "#9ca3af" },
  };
  const footerStatus = docStatus ? statusBadgeMap[docStatus] : null;

  const footer = (page: number, pages: number) => ({
    stack: [
      // Top separator rule
      {
        canvas: [
          { type: "line", x1: 44, y1: 0, x2: 551, y2: 0, lineWidth: 0.5, lineColor: "#e5e7eb" },
          { type: "rect", x: 44, y: -0.5, w: 40, h: 1.5, color: accentColor },
        ],
      },
      {
        columns: [
          // Left: Syndicate identity + reference
          {
            stack: [
              { text: syndInfo.name.toUpperCase(), fontSize: 7, bold: true, color: "#374151", margin: [0, 0, 0, 1] },
              { text: `Réf. : ${docNum}   ·   ${today}`, fontSize: 6.5, color: "#9ca3af" },
              ...(verifyUrl ? [{ text: `Vérification : ${verifyUrl}`, fontSize: 6, color: "#9ca3af", margin: [0, 1, 0, 0] }] : []),
            ],
            width: "*",
            margin: [44, 5, 0, 4],
          },
          // Center: QR code + status badge
          {
            stack: [
              ...(qrDataUrl ? [{ image: qrDataUrl, width: 26, height: 26, alignment: "center" as const }] : []),
              ...(footerStatus
                ? [{
                    table: {
                      widths: ["*"],
                      body: [[{
                        text: footerStatus.label,
                        fontSize: 5.5,
                        bold: true,
                        color: "#ffffff",
                        fillColor: footerStatus.color,
                        alignment: "center" as const,
                        margin: [4, 2, 4, 2],
                      }]],
                    },
                    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
                    margin: [0, 2, 0, 0],
                  }]
                : []),
            ],
            width: 52,
            alignment: "center" as const,
            margin: [0, 3, 0, 0],
          },
          // Right: Page number + brand
          {
            stack: [
              { text: `${page} / ${pages}`, fontSize: 8, bold: true, color: "#374151", alignment: "right" as const, margin: [0, 0, 0, 2] },
              { text: "SYNDYCAT GLOBAL CPS", fontSize: 6, bold: true, color: accentColor, alignment: "right" as const },
            ],
            width: 120,
            margin: [0, 5, 44, 4],
          },
        ],
      },
    ],
  });

  const header = buildHeaderBand(syndInfo, getDocTypeLabel(template, lang), docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, version, input.docStatus as string | null ?? null);

  // ── Template content ────────────────────────────────────────────────────────

  let content: unknown[];

  switch (template) {
    case "attestation":
      content = [
        ...header,
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaDeliveredTo", lang), member || t("notRenseigne", lang)],
          [t("metaIssueDate", lang), today],
          [t("metaIssuer", lang), syndInfo.name],
          ...(syndInfo.registrationNumber ? [[t("metaRegRef", lang), syndInfo.registrationNumber] as [string, string]] : []),
        ], accentColor),
        contentSection(
          t("attestationSectionTitle", lang),
          body || fmt(t("attestationBody", lang), { syndicate: syndInfo.name, member: member || t("attestationMemberFallback", lang), date: today }),
          accentColor,
        ),
        { text: "\n" },
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    case "pv":
      content = [
        ...header,
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
        multiSignatoryBlock(input.officeHolders as OfficeHolders | undefined, accentColor, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    case "convocation":
      content = [
        ...header,
        { text: input.title, style: "docTitle", alignment: "center" as const, margin: [0, 0, 0, 16] },
        metaTable([
          [t("metaRecipient", lang), member || t("convocationRecipientFallback", lang)],
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
        signatureBlock("L'Auteur du rapport", syndInfo.name, accentColor),
        legalFooterNote(docNum, lang, verifyUrl),
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
        legalFooterNote(docNum, lang, verifyUrl),
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
        { text: t("certificateWord", lang), fontSize: 26, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
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
        {
          canvas: [
            { type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor },
          ],
          margin: [0, 8, 0, 16],
        },
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
        signatureBlock("Le Président du Syndicat", syndInfo.name, accentColor, false),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;

    case "mise_en_demeure":
      content = [
        ...header,
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
                { text: `⚠  ${t("mandatoryDeadlineTitle", lang)}`, fontSize: 10, bold: true, color: "#dc2626", margin: [0, 0, 0, 4] },
                { text: input.delai as string || t("defaultDeadline", lang), fontSize: 10, color: "#dc2626" },
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
                  { text: input.actionRequise as string, fontSize: 10, color: "#1e293b" },
                ], fillColor: accentColor + "12", margin: [12, 10, 12, 10] }]],
              },
              layout: { hLineWidth: () => 1, vLineWidth: () => 0, hLineColor: () => accentColor + "50" },
              margin: [0, 0, 0, 16],
            }
          : null,
        { text: `${syndInfo.name} — Note interne n° ${docNum}`, style: "notice", alignment: "center" as const, margin: [0, 30, 0, 0] },
        legalFooterNote(docNum, lang, verifyUrl),
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
                { text: "TOTAL", style: "financialTotal", fillColor: adjustColorBrightness(accentColor, 82), margin: [8, 8, 8, 8] },
                { text: input.totalPrevu as string || "—", style: "financialTotal", fillColor: adjustColorBrightness(accentColor, 82), alignment: "right" as const, margin: [8, 8, 8, 8] },
                { text: input.totalRealise as string || "—", style: "financialTotal", fillColor: adjustColorBrightness(accentColor, 82), alignment: "right" as const, margin: [8, 8, 8, 8] },
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
        legalFooterNote(docNum, lang, verifyUrl),
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
            signatureBlock(`Pour ${syndInfo.name}`, "Le Président", accentColor, true),
            signatureBlock("Pour le partenaire", input.partieB as string || "[PARTENAIRE]", accentColor, false),
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
            signatureBlock(`Pour ${syndInfo.name}`, "Le Délégué Syndical", accentColor, true),
            signatureBlock("Pour l'employeur", input.employeur as string || "[EMPLOYEUR]", accentColor, false),
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
                { text: "\n\n________________________\n" + (input.presidentSeance as string || ""), fontSize: 8, alignment: "center" as const, color: "#64748b", margin: [4, 8, 4, 8] },
                { text: "\n\n________________________\n" + (input.secretaire as string || ""), fontSize: 8, alignment: "center" as const, color: "#64748b", margin: [4, 8, 4, 8] },
                {
                  stack: [{
                    table: {
                      widths: [88],
                      body: [[{
                        stack: [
                          { text: "✦", fontSize: 11, color: "#ffffff", alignment: "center" as const, margin: [0, 5, 0, 1] },
                          { canvas: [{ type: "line", x1: 6, y1: 0, x2: 78, y2: 0, lineWidth: 0.4, lineColor: "#ffffff55" }] },
                          { text: "CACHET OFFICIEL", fontSize: 5, bold: true, color: "#ffffff", alignment: "center" as const, margin: [2, 2, 2, 0] },
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
          layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "#e2e8f0", vLineColor: () => "#e2e8f0" },
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
        signatureBlock("Le Secrétaire Général", syndInfo.name, accentColor),
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
      const lot = input.lotNumber as string || "—";
      const buildingName = (input.officeHolders as unknown as undefined) // officeHolders not used here
        ? undefined : undefined;
      const propertyName = (input.property as PropertyInfo | undefined)?.name || syndInfo.name;
      const propertyAddress = (input.property as PropertyInfo | undefined)?.address || syndInfo.address;
      const propertyCity = (input.property as PropertyInfo | undefined)?.city || syndInfo.city;
      const lotFloor = input.lotFloor as string | undefined;
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
      const titreFoncier = input.titreFoncier as string || prop?.landRegistryReference || "—";
      const tantiemes = input.tantiemes as string || "—";
      const lotNum = input.lotNumber as string || "—";
      const propName = prop?.name || syndInfo.name;
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
              fillColor: "#fffbeb",
              margin: [10, 8, 10, 8],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => "#fcd34d", vLineColor: () => "#fcd34d" },
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
      const periode = input.periode as string || `Exercice ${new Date().getFullYear()}`;
      const montant = input.montant as string || "—";
      const lotNum = input.lotNumber as string || "—";
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
            `est en règle de paiement de ses charges de copropriété pour la période : ${periode}.\n\n` +
            `À la date de délivrance de la présente attestation, aucune somme n'est due au titre des charges ` +
            `communes exigibles pour la période mentionnée ci-dessus.\n\n` +
            `Cette attestation est établie sur la base des écritures comptables du syndicat et est délivrée ` +
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
                { text: "✓  Situation comptable vérifiée à la date de délivrance", fontSize: 9, color: "#15803d", bold: true, margin: [0, 0, 0, 2] },
                { text: "Cette attestation n'engage pas le syndicat pour les charges futures.", fontSize: 8, color: "#166534" },
              ],
              fillColor: "#f0fdf4",
              margin: [12, 8, 12, 8],
            }]],
          },
          layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => "#86efac", vLineColor: () => "#86efac" },
          margin: [0, 0, 0, 16],
        },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: accentColor }], margin: [0, 8, 0, 16] },
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures),
        legalFooterNote(docNum, lang, verifyUrl),
      ];
      break;
    }

    default:
      content = [
        ...header,
        { text: input.title, style: "docTitle", margin: [0, 0, 0, 16] },
        contentSection(t("sectionContent", lang), body || "—", accentColor, isArabic),
        signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang),
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
