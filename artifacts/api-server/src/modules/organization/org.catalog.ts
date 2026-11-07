/**
 * Catalogue of the organizational structure: component types, what each is
 * under Moroccan law, the capabilities a committee position may receive,
 * templates, and the explainable recommendation engine. Pure: no database.
 *
 * Legal basis (Loi 18-00 as amended by Loi 106-12, consolidated text of the
 * ANCFCC; see docs/research/SYNDICATE_STRUCTURE_BENCHMARK.md):
 *   - general assembly, syndic and syndic adjoint are statutory (art. 15-28);
 *   - the syndicate council is created by law only for a real-estate complex
 *     managed by several syndicates, made of their syndics and adjoints (art. 29);
 *   - the president and the secretary of a general assembly are designated at
 *     each meeting (art. 17): meeting roles, not permanent positions.
 * Every other committee is an internal, optional body: it advises, prepares
 * and follows up; it never holds a legal power of the assembly or the syndic.
 */

export type LegalStatus = "statutory" | "conditional" | "internal";
export type Category = "statutory" | "committee" | "custom";

export interface ComponentType {
  type: string;
  category: Category;
  legalStatus: LegalStatus;
  /** article(s) of Loi 18-00 for statutory / conditional bodies */
  legalBasis?: string;
  responsibilities: string[];
  /** default positions created with the component */
  positions: { title: string; isLeader?: boolean; permissions: string[]; responsibilities?: string[] }[];
}

/**
 * Capabilities a committee position may hold. They open the committee's own
 * workspace: tasks, recommendations to the syndic (who alone decides), reports
 * and read-only views. None of them is a legal power.
 */
export const CAPABILITIES = [
  "tasks.view",
  "tasks.manage",
  "recommendations.create",
  "reports.create",
  "finance.view",
  "maintenance.view",
  "announcements.draft",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Powers that belong to the general assembly or the syndic: never grantable to a committee. */
export const RESERVED_POWERS = [
  "expenses.approve",
  "payments.execute",
  "payments.validate",
  "decisions.publish",
  "members.manage",
  "assembly.convene",
  "structure.manage",
] as const;

const READ = ["tasks.view"] as const;
const MEMBER: string[] = [...READ, "recommendations.create"];
const LEADER: string[] = ["tasks.view", "tasks.manage", "recommendations.create", "reports.create"];

export const COMPONENT_TYPES: ComponentType[] = [
  { type: "general_assembly", category: "statutory", legalStatus: "statutory", legalBasis: "art. 15 à 24", responsibilities: ["Décide de la gestion de l'immeuble", "Désigne et révoque le syndic et son adjoint", "Vote le budget"], positions: [] },
  { type: "syndic", category: "statutory", legalStatus: "statutory", legalBasis: "art. 19, 21, 26 à 28", responsibilities: ["Exécute les décisions de l'assemblée", "Tient la comptabilité et les archives", "Représente le syndicat en justice"], positions: [] },
  { type: "vice_syndic", category: "statutory", legalStatus: "statutory", legalBasis: "art. 19, 27, 27 ter", responsibilities: ["Exerce les attributions du syndic en cas de démission, révocation, décès, refus ou absence"], positions: [] },
  { type: "syndicate_council", category: "committee", legalStatus: "conditional", legalBasis: "art. 29 à 29 quater (ensemble immobilier à plusieurs syndicats)", responsibilities: ["Gestion des parties communes de l'ensemble immobilier (s'il existe)"], positions: [{ title: "Membre", permissions: MEMBER }] },
  { type: "financial", category: "committee", legalStatus: "internal", responsibilities: ["Suivi du budget", "Revue des dépenses", "Recommandations budgétaires"], positions: [{ title: "Responsable", isLeader: true, permissions: [...LEADER, "finance.view"] }, { title: "Membre", permissions: [...MEMBER, "finance.view"] }] },
  { type: "maintenance", category: "committee", legalStatus: "internal", responsibilities: ["Inspections", "Suivi des ascenseurs, de la plomberie et de l'électricité", "Suivi des prestataires"], positions: [{ title: "Coordinateur technique", isLeader: true, permissions: [...LEADER, "maintenance.view"] }, { title: "Membre", permissions: [...MEMBER, "maintenance.view"] }] },
  { type: "security", category: "committee", legalStatus: "internal", responsibilities: ["Contrôle d'accès", "Procédures d'urgence et sécurité incendie", "Coordination avec le personnel de sécurité"], positions: [{ title: "Coordinateur sécurité", isLeader: true, permissions: [...LEADER, "maintenance.view"] }, { title: "Membre", permissions: MEMBER }] },
  { type: "communication", category: "committee", legalStatus: "internal", responsibilities: ["Préparer les annonces", "Informer les résidents"], positions: [{ title: "Responsable", isLeader: true, permissions: [...LEADER, "announcements.draft"] }, { title: "Membre", permissions: [...MEMBER, "announcements.draft"] }] },
  { type: "social", category: "committee", legalStatus: "internal", responsibilities: ["Événements", "Initiatives des résidents"], positions: [{ title: "Responsable", isLeader: true, permissions: LEADER }, { title: "Membre", permissions: MEMBER }] },
  { type: "environment", category: "committee", legalStatus: "internal", responsibilities: ["Espaces verts", "Propreté et déchets", "Consommation d'eau"], positions: [{ title: "Responsable", isLeader: true, permissions: [...LEADER, "maintenance.view"] }, { title: "Membre", permissions: MEMBER }] },
  { type: "legal", category: "committee", legalStatus: "internal", responsibilities: ["Relecture des documents", "Suivi du règlement de copropriété"], positions: [{ title: "Responsable", isLeader: true, permissions: LEADER }, { title: "Membre", permissions: MEMBER }] },
  { type: "audit", category: "committee", legalStatus: "internal", responsibilities: ["Revue des pièces financières", "Rapports de transparence"], positions: [{ title: "Responsable", isLeader: true, permissions: [...LEADER, "finance.view"] }, { title: "Membre", permissions: [...MEMBER, "finance.view"] }] },
  { type: "parking", category: "committee", legalStatus: "internal", responsibilities: ["Stationnement", "Équipements partagés", "Badges d'accès"], positions: [{ title: "Responsable", isLeader: true, permissions: LEADER }, { title: "Membre", permissions: MEMBER }] },
  { type: "building", category: "committee", legalStatus: "internal", responsibilities: ["Relais entre un immeuble et le syndic"], positions: [{ title: "Référent d'immeuble", isLeader: true, permissions: [...LEADER, "maintenance.view"] }] },
  { type: "custom", category: "custom", legalStatus: "internal", responsibilities: [], positions: [{ title: "Responsable", isLeader: true, permissions: LEADER }, { title: "Membre", permissions: MEMBER }] },
];

export const typeOf = (type: string) => COMPONENT_TYPES.find((t) => t.type === type);
export const STATUTORY_TYPES = COMPONENT_TYPES.filter((t) => t.category === "statutory").map((t) => t.type);

/** A position's permissions: known capabilities only; a reserved power is refused by name. */
export function checkPermissions(perms: string[]): { ok: true } | { ok: false; code: string; message: string } {
  const reserved = perms.filter((p) => (RESERVED_POWERS as readonly string[]).includes(p));
  if (reserved.length) return { ok: false, code: "RESERVED_POWER", message: `Pouvoir réservé à l'assemblée générale ou au syndic : ${reserved.join(", ")}` };
  const unknown = perms.filter((p) => !(CAPABILITIES as readonly string[]).includes(p));
  if (unknown.length) return { ok: false, code: "UNKNOWN_PERMISSION", message: `Permission inconnue : ${unknown.join(", ")}` };
  return { ok: true };
}

// ─── Templates ────────────────────────────────────────────────────────────────

/** Recommended starting points — not legal definitions. Statutory bodies are always added. */
export const TEMPLATES: Record<string, string[]> = {
  small: [],
  medium: ["financial", "maintenance", "communication"],
  large: ["financial", "maintenance", "security", "communication", "environment", "parking"],
  custom: [],
};

// ─── Recommendations ──────────────────────────────────────────────────────────

export interface Profile {
  residenceType?: string;
  buildings?: number;
  floors?: number;
  lots?: number;
  residents?: number;
  employees?: number;
  professionalSyndic?: boolean;
  hasDeputy?: boolean;
  /** several syndicates manage a common complex (art. 29) */
  multiSyndicateComplex?: boolean;
  securityStaff?: boolean;
  maintenanceStaff?: boolean;
  elevators?: number;
  gardens?: boolean;
  parking?: boolean;
  pool?: boolean;
  otherFacilities?: boolean;
}

export interface Recommendation {
  type: string;
  /** "consider": worth discussing; never "mandatory" unless the law says so */
  strength: "statutory" | "consider";
  reasons: string[];
}

/**
 * Explainable suggestions: every item lists the facts that motivate it. No
 * committee is presented as mandatory except the statutory bodies (and the
 * council of a multi-syndicate complex, art. 29).
 */
export function recommend(p: Profile): { template: keyof typeof TEMPLATES; items: Recommendation[] } {
  const items: Recommendation[] = [
    { type: "general_assembly", strength: "statutory", reasons: ["Organe obligatoire de tout syndicat (loi 18-00, art. 15)"] },
    { type: "syndic", strength: "statutory", reasons: ["Désigné par l'assemblée générale (art. 19)"] },
    { type: "vice_syndic", strength: "statutory", reasons: ["Désigné avec le syndic (art. 19)"] },
  ];
  const add = (type: string, reasons: string[]) => reasons.length && items.push({ type, strength: "consider", reasons });
  if (p.multiSyndicateComplex) items.push({ type: "syndicate_council", strength: "statutory", reasons: ["Ensemble immobilier géré par plusieurs syndicats : conseil syndical de plein droit (art. 29)"] });
  const lots = p.lots ?? 0;
  const buildings = p.buildings ?? 1;
  add("maintenance", [
    ...(p.elevators && p.elevators > 1 ? [`${p.elevators} ascenseurs à entretenir`] : p.elevators === 1 ? ["Un ascenseur à suivre"] : []),
    ...(p.maintenanceStaff ? ["Personnel d'entretien à coordonner"] : []),
    ...(p.pool ? ["Piscine : entretien technique régulier"] : []),
  ]);
  add("environment", p.gardens ? ["Espaces verts à entretenir"] : []);
  add("security", p.securityStaff ? ["Personnel de sécurité à coordonner"] : []);
  add("parking", [...(p.parking ? ["Stationnement à organiser"] : []), ...(p.pool || p.otherFacilities ? ["Équipements partagés à réserver"] : [])]);
  add("financial", [...(p.employees && p.employees > 0 ? [`${p.employees} salarié(s) : paie et charges à suivre`] : []), ...(lots >= 50 ? [`${lots} lots : budget et appels de fonds plus nombreux`] : [])]);
  add("audit", p.professionalSyndic ? ["Syndic professionnel : un suivi des pièces par des copropriétaires facilite la transparence"] : []);
  add("building", buildings > 1 ? [`${buildings} immeubles : un référent par immeuble peut faire le relais`] : []);
  add("communication", (p.residents ?? 0) >= 100 || lots >= 80 ? ["Nombreux résidents : une information régulière est utile"] : []);
  const optional = items.filter((i) => i.strength === "consider").length;
  const template = optional === 0 ? "small" : optional <= 3 && buildings <= 1 ? "medium" : "large";
  return { template, items };
}
