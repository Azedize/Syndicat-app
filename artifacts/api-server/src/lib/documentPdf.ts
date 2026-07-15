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

function buildStyles(accentColor: string) {
  return {
    headerOrgName: { font: PRIMARY_FONT, fontSize: 15, bold: true, color: "#ffffff" },
    headerMeta:    { font: PRIMARY_FONT, fontSize: 7.5, color: "#ffffffcc" },
    headerContact: { font: PRIMARY_FONT, fontSize: 7.5, color: "#ffffffaa" },
    docTypeLabel:  { font: PRIMARY_FONT, fontSize: 14, bold: true, color: "#ffffff" },
    docTitle:      { font: PRIMARY_FONT, fontSize: 13, bold: true, color: "#1e293b" },
    docRef:        { font: PRIMARY_FONT, fontSize: 9,  color: "#64748b"  },
    sectionTitle:  { font: PRIMARY_FONT, fontSize: 10, bold: true, color: accentColor, margin: [0, 12, 0, 5] },
    metaKey:       { font: PRIMARY_FONT, fontSize: 9,  color: "#64748b" },
    metaVal:       { font: PRIMARY_FONT, fontSize: 9.5, color: "#1e293b", bold: true },
    body:          { font: PRIMARY_FONT, fontSize: 10, color: "#334155", lineHeight: 1.55 },
    bodyArabic:    { font: ARABIC_FONT,  fontSize: 11, color: "#334155", lineHeight: 1.6, alignment: "right" as const },
    signLabel:     { font: PRIMARY_FONT, fontSize: 9,  color: "#64748b", italics: true },
    signName:      { font: PRIMARY_FONT, fontSize: 9,  bold: true, color: "#1e293b" },
    notice:        { font: PRIMARY_FONT, fontSize: 8,  color: "#94a3b8", italics: true },
    footer:        { font: PRIMARY_FONT, fontSize: 7.5, color: "#94a3b8" },
    watermark:     { font: PRIMARY_FONT, fontSize: 72, bold: true, color: "#e2e8f0", opacity: 0.12 },
    pageNumber:    { font: PRIMARY_FONT, fontSize: 8,  color: "#94a3b8" },
    tableHeader:   { font: PRIMARY_FONT, fontSize: 9,  bold: true, color: "#ffffff", fillColor: accentColor },
    tableCell:     { font: PRIMARY_FONT, fontSize: 9,  color: "#334155" },
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
): object[] {
  const contactParts: string[] = [];
  if (syndInfo.phone)   contactParts.push(`Tél : ${syndInfo.phone}`);
  if (syndInfo.email)   contactParts.push(syndInfo.email);
  if (syndInfo.website) contactParts.push(syndInfo.website);
  const contactLine = contactParts.join("   •   ");

  const regParts: string[] = [];
  if (syndInfo.registrationNumber) regParts.push(`N° Syndicale : ${syndInfo.registrationNumber}`);

  const qrCell = qrDataUrl
    ? { image: qrDataUrl, width: 58, alignment: "center" as const, margin: [4, 6, 6, 6] }
    : { text: "", margin: [4, 6, 6, 6] };

  // Acronym fallback when no logo image is available (initials in a circle)
  const acronym = (syndInfo.abbreviation ||
    syndInfo.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)
  ).toUpperCase();

  const logoCell = logoDataUrl
    ? { image: logoDataUrl, width: 40, height: 40, fit: [40, 40] as [number, number] }
    : {
        table: {
          widths: [40],
          heights: [40],
          body: [[{ text: acronym, fontSize: 13, bold: true, color: "#ffffff", alignment: "center" as const, margin: [0, 13, 0, 0] }]],
        },
        layout: {
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
          fillColor: () => "#ffffff25",
        },
      };

  return [
    // ── Syndicate identity band (colored)
    {
      table: {
        widths: [44, "*", 70],
        body: [
          [
            { ...logoCell, fillColor: accentColor, margin: [12, 12, 0, 12] },
            {
              stack: [
                { text: syndInfo.name.toUpperCase(), style: "headerOrgName", margin: [0, 0, 0, 3] },
                regParts.length
                  ? { text: regParts.join("   |   "), style: "headerMeta", margin: [0, 0, 0, 2] }
                  : null,
                syndInfo.address
                  ? { text: [syndInfo.address, syndInfo.city].filter(Boolean).join(", "), style: "headerMeta", margin: [0, 0, 0, 2] }
                  : null,
                contactLine
                  ? { text: contactLine, style: "headerContact" }
                  : null,
              ].filter(Boolean),
              fillColor: accentColor,
              margin: [10, 12, 8, 12],
            },
            { ...qrCell, fillColor: "#ffffff" },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    },
    // ── Document type label (colored band, slimmer)
    {
      table: {
        widths: ["*", "auto"],
        body: [
          [
            {
              text: docTypeLabel,
              style: "docTypeLabel",
              fillColor: adjustColorBrightness(accentColor, -18),
              margin: [14, 8, 8, 8],
            },
            {
              stack: [
                { text: `Réf : ${docNumber}`, style: "docRef", color: "#ffffffcc", margin: [0, 0, 0, 2] },
                { text: today,                style: "docRef", color: "#ffffffaa" },
              ],
              fillColor: adjustColorBrightness(accentColor, -18),
              alignment: "right" as const,
              margin: [8, 8, 14, 8],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 18],
    },
  ];
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

function metaTable(rows: Array<[string, string]>, accentColor: string): unknown {
  return {
    table: {
      widths: [140, "*"],
      body: rows.map(([k, v]) => [
        { text: k, style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] },
        { text: v, style: "metaVal", margin: [8, 6, 8, 6] },
      ]),
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === node.table.body.length ? 1 : 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#e2e8f0",
      vLineColor: () => "#e2e8f0",
    },
    margin: [0, 0, 0, 16],
  };
}

function sectionHeader(label: string, accentColor: string): unknown {
  return {
    canvas: [
      { type: "rect", x: 0, y: 0, w: 4, h: 16, r: 2, color: accentColor },
    ],
    absolutePosition: { x: 40, y: 0 },  // positioned relatively via stack
  };
}

function contentSection(title: string, text: string, accentColor: string, isRtl = false): unknown {
  return {
    stack: [
      {
        columns: [
          { canvas: [{ type: "rect", x: 0, y: 2, w: 3, h: 13, r: 1, color: accentColor }], width: 10 },
          { text: title.toUpperCase(), fontSize: 9, bold: true, color: accentColor, margin: [2, 0, 0, 0] },
        ],
        margin: [0, 0, 0, 6],
      },
      isRtl
        ? { text, style: "bodyArabic", margin: [0, 0, 0, 16] }
        : { text, style: "body", margin: [0, 0, 0, 16] },
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

  return {
    columns: [
      {
        stack: [
          { text: t("signAndStamp", lang), style: "metaKey", margin: [0, 0, 0, signatures.length > 0 ? 8 : 40] },
          ...(signatures.length > 0 ? [] : [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] }]),
          ...(signatures.length > 0 ? signerStack : [{ text: signatoryTitle, style: "signLabel", margin: [0, 4, 0, 2] }, { text: syndName, style: "signName" }, ...signerStack]),
        ],
        width: "*",
      },
      showStampCircle
        ? {
            stack: [
              {
                canvas: [
                  { type: "ellipse", x: 45, y: 35, r1: 40, r2: 40, lineColor: accentColor, lineWidth: 1.2, dash: { length: 4 } },
                  { type: "ellipse", x: 45, y: 35, r1: 32, r2: 32, lineColor: accentColor, lineWidth: 0.5, dash: { length: 2 } },
                ],
                margin: [0, 0, 0, 4],
              },
              { text: t("officialStamp", lang), style: "notice", alignment: "center" as const, margin: [0, 0, 0, 0] },
            ],
            width: 100,
            alignment: "center" as const,
          }
        : { text: "", width: 100 },
    ],
    margin: [0, 30, 0, 0],
  };
}

function legalFooterNote(docNumber: string, lang: DocumentLanguage = "fr", verifyUrl?: string): unknown {
  // Swap in the real, environment-portable verify URL when available instead of the
  // static "syndycat.ma/verify/{ref}" wording baked into the translation string —
  // done BEFORE the {ref} substitution below so the domain placeholder is still intact.
  const template = verifyUrl ? t("legalFooterNote", lang).replace(/syndycat\.ma\/verify\/\{ref\}/g, verifyUrl) : t("legalFooterNote", lang);
  const text = template.replace(/\{ref\}/g, docNumber);
  return {
    text,
    style: "notice",
    margin: [0, 20, 0, 0],
    alignment: "center" as const,
  };
}

// ─── PDF Buffer ───────────────────────────────────────────────────────────────

async function buildPdfBuffer(docDef: unknown): Promise<Buffer> {
  const PdfPrinter = (await import("pdfmake")).default as any;
  const printer = new PdfPrinter(FONTS);
  const pdfDoc = printer.createPdfKitDocument({
    defaultStyle: { font: PRIMARY_FONT, fontSize: 10, lineHeight: 1.4 },
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

/**
 * Appends a "Signatures électroniques" page to an existing generated document PDF,
 * rendering each signer's handwritten signature (from SVG path data) plus their
 * name, role, and timestamp. Overwrites the PDF in-place at `internalPath`.
 * Best-effort: throws on failure so the caller can log/audit without blocking
 * the underlying signature record, which is already durably stored in the DB.
 */
export async function appendSignaturesToPdf(
  internalPath: string,
  signatures: SignatureToEmbed[],
  lang: DocumentLanguage = "fr",
): Promise<void> {
  if (signatures.length === 0) return;
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const dateLocale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";

  const existingBytes = await downloadPdfFromGcs(internalPath);
  const pdfDoc = await PDFDocument.load(existingBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4 pt
  const PAGE_H = 841.89;
  const ROW_H = 140;
  const MARGIN = 40;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let cursorY = PAGE_H - MARGIN;

  page.drawText(t("electronicSignaturesTitle", lang), {
    x: MARGIN, y: cursorY, size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.2),
  });
  cursorY -= 30;

  for (const sig of signatures) {
    if (cursorY - ROW_H < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      cursorY = PAGE_H - MARGIN;
    }

    const boxTop = cursorY;
    const boxBottom = cursorY - ROW_H + 20;
    const isValid = sig.isValid !== false;
    page.drawRectangle({
      x: MARGIN, y: boxBottom, width: PAGE_W - 2 * MARGIN, height: boxTop - boxBottom,
      borderColor: isValid ? rgb(0.85, 0.85, 0.88) : rgb(0.86, 0.2, 0.2), borderWidth: isValid ? 1 : 1.5,
    });

    page.drawText(sig.signerName, { x: MARGIN + 12, y: boxTop - 20, size: 12, font: boldFont, color: rgb(0.1, 0.1, 0.2) });
    page.drawText(
      `${roleLabel(sig.signerRole, lang)} — ${t("signedOnLabel", lang)} ${sig.signedAt.toLocaleString(dateLocale)}`,
      { x: MARGIN + 12, y: boxTop - 36, size: 9, font, color: rgb(0.4, 0.4, 0.45) },
    );
    page.drawText(isValid ? t("signatureValidLabel", lang) : t("signatureInvalidLabel", lang), {
      x: MARGIN + 12, y: boxTop - 50, size: 9, font: boldFont, color: isValid ? rgb(0.09, 0.64, 0.29) : rgb(0.86, 0.15, 0.15),
    });

    const paths = sig.signatureSvg ? extractSvgPaths(sig.signatureSvg) : [];
    if (paths.length > 0) {
      // SignaturePad canvas is 320x180 — scale/translate into the signature box
      const scale = 0.55;
      const originX = MARGIN + 12;
      const originY = boxBottom + 15 + 180 * scale; // flip Y (SVG y-down → PDF y-up)
      for (const d of paths) {
        try {
          page.drawSvgPath(d, {
            x: originX,
            y: originY,
            scale,
            borderColor: rgb(0.12, 0.16, 0.35),
            borderWidth: 1.5,
          });
        } catch {
          // Malformed path data — skip this stroke rather than failing the whole embed
        }
      }
    } else {
      page.drawText(t("noHandwrittenTrace", lang), {
        x: MARGIN + 12, y: boxTop - 70, size: 9, font, color: rgb(0.55, 0.55, 0.6),
      });
    }

    cursorY -= ROW_H;
  }

  const outBytes = await pdfDoc.save();
  await overwritePdfInGcs(internalPath, Buffer.from(outBytes));
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
  | "reglement";

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
  /** Document lifecycle status — used to add watermark for non-final docs */
  docStatus?: string;
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
  const accentColor = syndInfo.logoColor || "#7c3aed";
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

  // Watermark for draft/generated documents
  const watermark =
    !input.docStatus || input.docStatus === "draft"
      ? { text: "BROUILLON", opacity: 0.05, bold: true, color: accentColor }
      : input.docStatus === "generated"
      ? { text: "EN COURS", opacity: 0.05, bold: true, color: accentColor }
      : undefined;

  // Standard page setup (A4)
  const pageSetup = {
    pageSize: "A4" as const,
    pageMargins: [40, 40, 40, 55] as [number, number, number, number],
  };

  // Footer function
  const footer = (page: number, pages: number) => ({
    columns: [
      { text: `${syndInfo.name}  •  Réf : ${docNum}`, style: "footer", margin: [40, 0, 0, 0] },
      { text: `Page ${page} / ${pages}  •  ${today}`, style: "footer", alignment: "right" as const, margin: [0, 0, 40, 0] },
    ],
    margin: [0, 10, 0, 0],
  });

  const header = buildHeaderBand(syndInfo, getDocTypeLabel(template, lang), docNum, qrDataUrl, accentColor, today, logoDataUrl);

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
          [t("metaChairperson", lang), input.president as string || syndInfo.name],
          [t("metaSecretarySession", lang), input.secretaire as string || "—"],
        ], accentColor),
        contentSection(t("pvAgendaTitle", lang), input.agendaText as string || body || t("pvAgendaText", lang), accentColor, isArabic),
        contentSection(t("pvDeliberationsTitle", lang), input.deliberationsText as string || t("pvDeliberationsText", lang), accentColor, isArabic),
        contentSection(t("pvResolutionsTitle", lang), input.resolutionsText as string || t("pvResolutionsText", lang), accentColor, isArabic),
        { text: "\n" },
        signatures.length > 0
          ? signatureBlock(t("presidentTitle", lang), syndInfo.name, accentColor, true, lang, signatures)
          : {
              columns: [
                {
                  stack: [
                    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
                    { text: t("rolePresident", lang), style: "signLabel", margin: [0, 4, 0, 0] },
                  ],
                },
                {
                  stack: [
                    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
                    { text: t("roleSecretary", lang), style: "signLabel", margin: [0, 4, 0, 0] },
                  ],
                },
                {
                  stack: [
                    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.8, lineColor: "#cbd5e1" }] },
                    { text: t("officialStamp", lang), style: "signLabel", margin: [0, 4, 0, 0] },
                  ],
                },
              ],
              margin: [0, 30, 0, 0],
              columnGap: 10,
            },
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
        { text: t("certificateWord", lang), fontSize: 22, bold: true, color: accentColor, alignment: "center" as const, margin: [0, 0, 0, 4] },
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
        {
          table: {
            widths: [120, "*"],
            body: [
              [{ text: "À :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: member || "Tous les membres du bureau", style: "metaVal", margin: [8, 6, 8, 6] }],
              [{ text: "De :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: input.de as string || "La Présidence", style: "metaVal", margin: [8, 6, 8, 6] }],
              [{ text: "Date :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: today, style: "metaVal", margin: [8, 6, 8, 6] }],
              [{ text: "Objet :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: input.objet as string || input.title, style: "metaVal", bold: true, margin: [8, 6, 8, 6] }],
              [{ text: "Priorité :", style: "metaKey", fillColor: "#f8fafc", margin: [8, 6, 8, 6] }, { text: input.priorite as string || "Normale", style: "metaVal", margin: [8, 6, 8, 6] }],
            ],
          },
          layout: { hLineWidth: (i: number, n: { table: { body: unknown[] } }) => i === 0 || i === n.table.body.length ? 1 : 0.5, vLineWidth: () => 0.5, hLineColor: () => "#e2e8f0", vLineColor: () => "#e2e8f0" },
          margin: [0, 0, 0, 20],
        },
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
                { text: "TOTAL", bold: true, fontSize: 10, fillColor: accentColor + "20", margin: [8, 6, 8, 6] },
                { text: input.totalPrevu as string || "—", bold: true, fontSize: 10, fillColor: accentColor + "20", alignment: "right" as const, margin: [8, 6, 8, 6] },
                { text: input.totalRealise as string || "—", bold: true, fontSize: 10, fillColor: accentColor + "20", alignment: "right" as const, margin: [8, 6, 8, 6] },
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
                    canvas: [
                      { type: "ellipse", x: 50, y: 30, r1: 28, r2: 28, lineColor: accentColor, lineWidth: 1, dash: { length: 3 } },
                    ],
                  }],
                  margin: [4, 8, 4, 8],
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
