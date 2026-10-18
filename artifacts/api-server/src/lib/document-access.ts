import { db } from "@workspace/db";
import { documentsTable, usersTable } from "@workspace/db/schema";
import { eq, sql, type SQL } from "drizzle-orm";
import type { JwtPayload } from "../middleware/auth.js";
import { getUserLotIds } from "./scope.js";
import { resolveContextRole } from "./access.js";

/**
 * Who may see a document. Each document has ONE audience; linking it to a
 * record (meeting, lot, expense, claim…) never widens it, and two documents
 * attached to the same record can have different audiences.
 *
 *   syndic     the syndic (administrator of the condominium) only
 *   council    syndic + council (president, treasurer, secretary, members)
 *   owners     council + every co-owner                (published only)
 *   residents  owners + tenants                        (published only)
 *   unit       council + owners / tenants of one lot   (published only)
 *   personal   syndic + the person it concerns         (published only)
 *
 * Generated documents created before audiences existed have no explicit
 * visibility: their audience is derived exactly as before (personal when they
 * concern someone, residents for lease / rules, owners otherwise).
 */
export const VISIBILITIES = ["syndic", "council", "owners", "residents", "unit", "personal"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Categories of the document library (uploaded files). */
export const UPLOAD_CATEGORIES = [
  "administratif",
  "proces_verbal",
  "financier",
  "contrat",
  "maintenance",
  "reglement",
  "avis",
  "assurance",
  "juridique",
  "technique",
  "autre",
] as const;

/**
 * Records whose attached documents are evidence (accounting, claims): such a
 * document can be archived or replaced (old version kept), never deleted.
 */
export const EVIDENCE_ENTITY_TYPES: ReadonlySet<string> = new Set(["appel_de_fonds", "ledger_entry", "expense", "sinistre", "reclamation", "claim"]);

/** Records a document can be attached to, and how each belongs to a syndicate. */
const ENTITY_SQL = {
  syndicate: (id: string, sid: string) => sql`SELECT id FROM syndicates WHERE id = ${id} AND id = ${sid}`,
  building: (id: string, sid: string) => sql`SELECT id FROM buildings WHERE id = ${id} AND syndicate_id = ${sid}`,
  lot: (id: string, sid: string) => sql`SELECT l.id FROM lots l JOIN buildings b ON b.id = l.building_id WHERE l.id = ${id} AND b.syndicate_id = ${sid}`,
  meeting: (id: string, sid: string) => sql`SELECT id FROM meetings WHERE id = ${id} AND syndicate_id = ${sid}`,
  appel_de_fonds: (id: string, sid: string) => sql`SELECT a.id FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id WHERE a.id = ${id} AND b.syndicate_id = ${sid}`,
  ledger_entry: (id: string, sid: string) => sql`SELECT id FROM ledger_entries WHERE id = ${id} AND syndicate_id = ${sid}`,
  expense: (id: string, sid: string) => sql`SELECT id FROM expenses WHERE id = ${id} AND syndicate_id = ${sid}`,
  sinistre: (id: string, sid: string) => sql`SELECT x.id FROM sinistres x JOIN buildings b ON b.id = x.building_id WHERE x.id = ${id} AND b.syndicate_id = ${sid}`,
  claim: (id: string, sid: string) => sql`SELECT id FROM claims WHERE id = ${id} AND syndicate_id = ${sid}`,
  reclamation: (id: string, sid: string) => sql`SELECT r.id FROM reclamations r JOIN members m ON m.id = r.member_id WHERE r.id = ${id} AND m.syndicate_id = ${sid}`,
  travaux: (id: string, sid: string) => sql`SELECT w.id FROM travaux w JOIN buildings b ON b.id = w.building_id WHERE w.id = ${id} AND b.syndicate_id = ${sid}`,
  support_ticket: (id: string, sid: string) => sql`SELECT id FROM support_tickets WHERE id = ${id} AND syndicate_id = ${sid}`,
  contrat: (id: string, sid: string) => sql`SELECT c.id FROM contrats_prestataires c JOIN buildings b ON b.id = c.building_id WHERE c.id = ${id} AND b.syndicate_id = ${sid}`,
} satisfies Record<string, (id: string, sid: string) => SQL>;
export type EntityType = keyof typeof ENTITY_SQL;
export const ENTITY_TYPES = Object.keys(ENTITY_SQL) as EntityType[];

/** True when the record exists and belongs to the syndicate. */
export async function entityBelongsTo(type: EntityType, id: string, syndicateId: string): Promise<boolean> {
  const rows = (await db.execute(ENTITY_SQL[type](id, syndicateId))) as unknown as unknown[];
  return rows.length > 0;
}

const TEAM = new Set(["syndicate_admin", "president", "treasurer", "secretary", "committee_member"]);
const RESIDENT = new Set(["member", "tenant"]);
const TENANT_CATEGORIES = new Set(["bail", "reglement", "reglement_interieur"]);
/** Roles that run the library (upload any category, archive, replace). */
export const DOCUMENT_MANAGERS = new Set(["syndicate_admin", "secretary", "president"]);

export interface DocumentLike {
  syndicateId: string | null;
  status: string | null;
  category: string;
  subjectUserId: string | null;
  visibility?: string | null;
  lotId?: string | null;
  createdBy?: string | null;
  isDeleted?: boolean | null;
}

/** Audience of a document (explicit, or derived for legacy generated documents). */
export function effectiveVisibility(doc: Pick<DocumentLike, "visibility" | "subjectUserId" | "category">): Visibility {
  if (doc.subjectUserId) return "personal";
  if (doc.visibility && (VISIBILITIES as readonly string[]).includes(doc.visibility)) return doc.visibility as Visibility;
  return TENANT_CATEGORIES.has(doc.category) ? "residents" : "owners";
}

/** SQL twin of effectiveVisibility (for list queries). */
export const effectiveVisibilitySql = sql<string>`CASE
  WHEN ${documentsTable.subjectUserId} IS NOT NULL THEN 'personal'
  WHEN ${documentsTable.visibility} IS NOT NULL THEN ${documentsTable.visibility}
  WHEN ${documentsTable.category} IN ('bail', 'reglement', 'reglement_interieur') THEN 'residents'
  ELSE 'owners' END`;

/**
 * Decides with the lots already known (`lotIds`: the units the person owns or
 * rents today). Super admins are handled by the callers (supervision mode).
 */
export function canSeeDocumentWith(user: JwtPayload, doc: DocumentLike, lotIds: string[]): boolean {
  if (doc.isDeleted) return false;
  if (user.role === "super_admin") return true;
  if (!user.syndicateId || doc.syndicateId !== user.syndicateId) return false;
  const team = TEAM.has(user.role);
  if (team && doc.createdBy && doc.createdBy === user.userId) return true;
  const published = doc.status === "published";
  switch (effectiveVisibility(doc)) {
    case "syndic":
      return user.role === "syndicate_admin";
    case "council":
      return team;
    case "owners":
      return team || (user.role === "member" && published);
    case "residents":
      return team || (RESIDENT.has(user.role) && published);
    case "unit":
      return team || (RESIDENT.has(user.role) && published && !!doc.lotId && lotIds.includes(doc.lotId));
    case "personal":
      return user.role === "syndicate_admin" || (doc.subjectUserId === user.userId && published);
  }
}

/** Full check (loads the person's current units only when needed). */
export async function canSeeDocument(user: JwtPayload, doc: DocumentLike): Promise<boolean> {
  const needsLots = RESIDENT.has(user.role) && effectiveVisibility(doc) === "unit";
  return canSeeDocumentWith(user, doc, needsLots ? await getUserLotIds(user) : []);
}

/** WHERE clause of every document list for this person (super admin: none). */
export async function documentVisibilityWhere(user: JwtPayload): Promise<SQL> {
  if (user.role === "super_admin") return sql`TRUE`;
  const v = effectiveVisibilitySql;
  const published = sql`${documentsTable.status} = 'published'`;
  const mine = sql`${documentsTable.createdBy} = ${user.userId}`;
  if (user.role === "syndicate_admin") return sql`TRUE`;
  if (TEAM.has(user.role)) {
    return sql`(${mine} OR ${v} IN ('council', 'owners', 'residents', 'unit'))`;
  }
  const lots = await getUserLotIds(user);
  const unit = lots.length
    ? sql`(${v} = 'unit' AND ${documentsTable.lotId} IN (${sql.join(lots.map((l) => sql`${l}`), sql`, `)}))`
    : sql`FALSE`;
  const audiences = user.role === "member" ? sql`${v} IN ('owners', 'residents')` : sql`${v} = 'residents'`;
  return sql`(${published} AND (${audiences} OR ${unit} OR (${v} = 'personal' AND ${documentsTable.subjectUserId} = ${user.userId})))`;
}

/**
 * The person behind a download link, re-checked now: the account must be
 * active and still hold a role in the document's condominium. A link is
 * therefore useless as soon as access is revoked, even before it expires.
 */
export async function currentViewer(userId: string, syndicateId: string | null): Promise<JwtPayload | null> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u || u.status !== "active") return null;
  if (u.role === "super_admin") return null; // platform access goes through supervision, never through links
  if (!syndicateId) return null;
  const ctx = await resolveContextRole(u.id, syndicateId);
  if (!ctx) return null;
  return { userId: u.id, email: u.email, name: u.name, role: ctx.role as JwtPayload["role"], syndicateId };
}

/** Metadata a resident may read (no generation inputs, no internal workflow data). */
export function documentView(doc: typeof documentsTable.$inferSelect, user: JwtPayload) {
  const base = {
    ...doc,
    visibility: effectiveVisibility(doc),
    // Storage paths are internal: files are reached through /documents/:id/file only.
    fileUrl: undefined,
    hasFile: !!doc.fileUrl || (doc.source === "upload" && !!doc.content?.startsWith("/objects/")),
    content: doc.source === "upload" ? undefined : doc.content,
  };
  if (TEAM.has(user.role) || user.role === "super_admin") return base;
  return {
    ...base,
    generationParams: undefined,
    verificationToken: undefined,
    rejectionReason: undefined,
    rejectedBy: undefined,
    createdBy: undefined,
    checksum: undefined,
    regenerationFailed: undefined,
    appendedSignaturePages: undefined,
    entityId: undefined,
    entityType: undefined,
  };
}
