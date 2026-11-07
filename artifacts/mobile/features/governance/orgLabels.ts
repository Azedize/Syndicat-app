// Translation keys of the organization screens (capabilities and component types).
export const CAPABILITY_KEYS: Record<string, string> = {
  "tasks.view": "orgCapTasksView",
  "tasks.manage": "orgCapTasksManage",
  "recommendations.create": "orgCapRecommend",
  "reports.create": "orgCapReports",
  "finance.view": "orgCapFinanceView",
  "maintenance.view": "orgCapMaintenanceView",
  "announcements.draft": "orgCapAnnouncements",
};
export const TYPE_KEYS: Record<string, string> = {
  general_assembly: "orgTypeGeneralAssembly",
  syndic: "orgTypeSyndic",
  vice_syndic: "orgTypeViceSyndic",
  syndicate_council: "orgTypeCouncil",
  financial: "orgTypeFinancial",
  maintenance: "orgTypeMaintenance",
  security: "orgTypeSecurity",
  communication: "orgTypeCommunication",
  social: "orgTypeSocial",
  environment: "orgTypeEnvironment",
  legal: "orgTypeLegal",
  audit: "orgTypeAudit",
  parking: "orgTypeParking",
  building: "orgTypeBuilding",
  custom: "orgTypeCustom",
};

/** Names the API gives by default (French): shown translated while unchanged. */
const DEFAULT_COMPONENT_NAMES: Record<string, string> = {
  "Conseil syndical (ensemble immobilier)": "syndicate_council",
  "Comité financier": "financial",
  "Comité technique et maintenance": "maintenance",
  "Comité sécurité": "security",
  "Comité communication": "communication",
  "Comité vie sociale": "social",
  "Comité espaces verts et environnement": "environment",
  "Comité juridique et conformité": "legal",
  "Comité audit et transparence": "audit",
  "Comité stationnement et équipements": "parking",
  "Référents d'immeuble": "building",
};
const DEFAULT_POSITION_TITLES: Record<string, string> = {
  Responsable: "orgPosLeader",
  Membre: "orgPosMember",
  "Coordinateur technique": "orgPosTechCoord",
  "Coordinateur sécurité": "orgPosSecurityCoord",
  "Référent d'immeuble": "orgPosBuildingReferent",
};
type T = (key: string) => string;
/** A component's name: translated while it is the API's default, as typed otherwise. */
export const componentName = (t: T, c: { name: string; type: string }) =>
  DEFAULT_COMPONENT_NAMES[c.name] === c.type && TYPE_KEYS[c.type] ? t(TYPE_KEYS[c.type]) : c.name;
/** A position title: translated while it is a default one, as typed otherwise. */
export const positionTitle = (t: T, title: string) => (DEFAULT_POSITION_TITLES[title] ? t(DEFAULT_POSITION_TITLES[title]) : title);

/** Default responsibilities (French, from the API catalogue): shown translated while unchanged. */
const DEFAULT_RESPONSIBILITIES: Record<string, string> = {
  "Décide de la gestion de l'immeuble": "orgResp01",
  "Désigne et révoque le syndic et son adjoint": "orgResp02",
  "Vote le budget": "orgResp03",
  "Exécute les décisions de l'assemblée": "orgResp04",
  "Tient la comptabilité et les archives": "orgResp05",
  "Représente le syndicat en justice": "orgResp06",
  "Exerce les attributions du syndic en cas de démission, révocation, décès, refus ou absence": "orgResp07",
  "Gestion des parties communes de l'ensemble immobilier (s'il existe)": "orgResp08",
  "Suivi du budget": "orgResp09",
  "Revue des dépenses": "orgResp10",
  "Recommandations budgétaires": "orgResp11",
  "Inspections": "orgResp12",
  "Suivi des ascenseurs, de la plomberie et de l'électricité": "orgResp13",
  "Suivi des prestataires": "orgResp14",
  "Contrôle d'accès": "orgResp15",
  "Procédures d'urgence et sécurité incendie": "orgResp16",
  "Coordination avec le personnel de sécurité": "orgResp17",
  "Préparer les annonces": "orgResp18",
  "Informer les résidents": "orgResp19",
  "Événements": "orgResp20",
  "Initiatives des résidents": "orgResp21",
  "Espaces verts": "orgResp22",
  "Propreté et déchets": "orgResp23",
  "Consommation d'eau": "orgResp24",
  "Relecture des documents": "orgResp25",
  "Suivi du règlement de copropriété": "orgResp26",
  "Revue des pièces financières": "orgResp27",
  "Rapports de transparence": "orgResp28",
  "Stationnement": "orgResp29",
  "Équipements partagés": "orgResp30",
  "Badges d'accès": "orgResp31",
  "Relais entre un immeuble et le syndic": "orgResp32",
};
export const responsibilityText = (t: T, text: string) => (DEFAULT_RESPONSIBILITIES[text] ? t(DEFAULT_RESPONSIBILITIES[text]) : text);

/** Statuses shown in the committee workspace (read-only views). */
export const statusLabel = (t: T, status: string) => { const key = `orgStatus_${status}`; return t(key) === key ? status : t(key); };
/** Amount in the reader's locale, 2 decimals, MAD. */
export const formatMad = (lang: string, v: string | number) => {
  const n = Number(v) || 0;
  try { return `${new Intl.NumberFormat(lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} MAD`; } catch { return `${n.toFixed(2)} MAD`; }
};
/** A date (YYYY-MM-DD) in the reader's language: « 7 novembre 2026 », « 7 نونبر 2026 »… */
export const formatDay = (lang: string, ymd: string | null | undefined) => {
  if (!ymd) return "";
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  try { return d.toLocaleDateString(lang === "ar" ? "ar-MA" : lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch { return ymd.slice(0, 10); }
};
