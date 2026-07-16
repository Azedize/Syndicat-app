/**
 * routes/documents.ts
 *
 * Document module — Enterprise-grade implementation:
 *  • RBAC with syndicate isolation
 *  • Soft delete with legal retention (is_deleted / deleted_at / deleted_by)
 *  • Full syndicate branding in PDF generation
 *  • Direct templateId override in POST body
 *  • Workflow state machine: draft → generated → pending_review → validated → signed → published → archived
 *  • Signed download URL (1h TTL)
 *  • Multi-signature tracking
 *  • Push + alert notifications on key lifecycle events
 *  • Full audit trail on every write
 */
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  documentsTable,
  documentSignaturesTable,
  documentCommentsTable,
  documentSequencesTable,
  documentVersionsTable,
  syndicatesTable,
  usersTable,
  buildingsTable,
  lotsTable,
  conseilSyndicalTable,
  membersTable,
  templateRequestsTable,
  appelsDeFondsTable,
  invoicesTable,
  invoiceItemsTable,
  budgetsTable,
  budgetLinesTable,
  electionsTable,
  candidatesTable,
  meetingsTable,
  meetingAttendeesTable,
  agResolutionsTable,
  caisseEntriesTable,
  transactionsTable,
  fondsTravauxTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import {
  generateAndUploadDocument,
  signDocumentDownloadUrl,
  deleteDocumentFromGcs,
  appendSignaturesToPdf,
  readLocalDocFile,
  roleLabel,
  CATEGORY_TO_TEMPLATE,
  TEMPLATE_NUMBER_PREFIX,
  type DocumentTemplate,
  type DocumentLanguage,
  type SyndicateInfo,
  type PropertyInfo,
  type OfficeHolders,
} from "../lib/documentPdf.js";
import { createAlert, sendEmail, sendEmailToMany } from "../lib/notify.js";
import { computeRetentionUntil, expiryBucket } from "../lib/retention.js";

const router = Router();

// ─── Workflow state machine ────────────────────────────────────────────────────
// "rejected" and "expired" added on top of the original 7-state machine.
// Spec's "Approved" state maps onto the pre-existing "validated" status —
// kept as-is (not renamed) to avoid breaking existing consumers; approvedAt/
// approvedBy are populated whenever a document transitions into "validated".

const VALID_STATUSES = ["draft", "generated", "pending_review", "validated", "signed", "published", "archived", "rejected", "expired"] as const;
type DocStatus = typeof VALID_STATUSES[number];

const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft:          ["generated", "pending_review", "published"],
  generated:      ["pending_review", "validated", "rejected"],
  pending_review: ["generated", "validated", "draft", "rejected"],
  validated:      ["signed", "published", "rejected"],
  signed:         ["published", "expired"],
  published:      ["archived", "expired"],
  archived:       [],
  rejected:       ["draft", "pending_review"],
  expired:        ["archived"],
};

function isTransitionAllowed(from: DocStatus, to: DocStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Builds the real, environment-portable public verification URL for a document's
 * QR code and footer note — read from $REPLIT_DOMAINS at runtime (never a
 * hardcoded domain). Falls back to PUBLIC_APP_URL if explicitly configured, and
 * to undefined (caller then falls back to a bare documentNumber QR) if neither
 * is available, e.g. in an environment with no public domain at all.
 */
function buildVerifyUrl(token: string): string | undefined {
  const base = process.env.PUBLIC_APP_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : undefined);
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/api/documents/verify/${token}`;
}

// ─── Helper: fetch full syndicate branding for PDF ────────────────────────────

async function getSyndicateInfo(syndicateId?: string | null): Promise<SyndicateInfo> {
  const defaults: SyndicateInfo = {
    name: "SYNDYCAT",
    address: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    registrationNumber: "",
    logoColor: "#7c3aed",
    logoUrl: null,
    abbreviation: null,
  };
  if (!syndicateId) return defaults;

  const [s] = await db
    .select({
      name:               syndicatesTable.name,
      address:            syndicatesTable.address,
      city:               syndicatesTable.city,
      phone:              syndicatesTable.phone,
      email:              syndicatesTable.email,
      website:            syndicatesTable.website,
      registrationNumber: syndicatesTable.registrationNumber,
      logoColor:          syndicatesTable.logoColor,
      logoUrl:            syndicatesTable.logoUrl,
      abbreviation:       syndicatesTable.abbreviation,
    })
    .from(syndicatesTable)
    .where(eq(syndicatesTable.id, syndicateId));

  return {
    name:               s?.name               ?? defaults.name,
    address:            s?.address            ?? defaults.address,
    city:               s?.city               ?? defaults.city,
    phone:              s?.phone              ?? defaults.phone,
    email:              s?.email              ?? defaults.email,
    website:            s?.website            ?? defaults.website,
    registrationNumber: s?.registrationNumber ?? defaults.registrationNumber,
    logoColor:          s?.logoColor          ?? defaults.logoColor,
    logoUrl:            s?.logoUrl            ?? defaults.logoUrl,
    abbreviation:       s?.abbreviation       ?? defaults.abbreviation,
  };
}

// ─── Helper: fetch real property/residence data for PDF injection ────────────
// Pulls the syndicate's building(s) + lots to populate {{property.*}} variables
// (name, address, city, totalBuildings, totalFloors, totalLots, totalSurfaceM2,
// landRegistryReference). When buildingId is given, scopes to that building only;
// otherwise aggregates across all buildings of the syndicate.

async function getPropertyInfo(syndicateId?: string | null, buildingId?: string | null): Promise<PropertyInfo | undefined> {
  if (!syndicateId && !buildingId) return undefined;

  const buildingConditions = buildingId
    ? [eq(buildingsTable.id, buildingId)]
    : syndicateId
    ? [eq(buildingsTable.syndicateId, syndicateId)]
    : [];
  if (buildingConditions.length === 0) return undefined;

  const buildings = await db
    .select({
      id: buildingsTable.id,
      name: buildingsTable.name,
      address: buildingsTable.address,
      city: buildingsTable.city,
      totalFloors: buildingsTable.totalFloors,
      totalLots: buildingsTable.totalLots,
      registrationNumber: buildingsTable.registrationNumber,
      createdAt: buildingsTable.createdAt,
    })
    .from(buildingsTable)
    .where(and(...buildingConditions));

  if (buildings.length === 0) return undefined;

  const buildingIds = buildings.map((b) => b.id);
  const lots = buildingIds.length
    ? await db
        .select({ surfaceM2: lotsTable.surfaceM2, titreFoncier: lotsTable.titreFoncier })
        .from(lotsTable)
        .where(inArray(lotsTable.buildingId, buildingIds))
    : [];

  const totalSurfaceM2 = lots.reduce((sum, l) => sum + (l.surfaceM2 ? Number(l.surfaceM2) : 0), 0);
  const landRegistryReference = lots.find((l) => l.titreFoncier)?.titreFoncier ?? buildings[0].registrationNumber ?? null;

  const primary = buildings[0];
  return {
    name: buildings.length > 1 ? (primary.name ?? "") : (primary.name ?? ""),
    address: primary.address ?? "",
    city: primary.city ?? "",
    totalBuildings: buildings.length,
    totalFloors: buildings.reduce((sum, b) => sum + (b.totalFloors ?? 0), 0),
    totalLots: buildings.reduce((sum, b) => sum + (b.totalLots ?? 0), 0),
    totalSurfaceM2: totalSurfaceM2 > 0 ? totalSurfaceM2 : null,
    landRegistryReference,
    createdAt: primary.createdAt ? primary.createdAt.toISOString() : null,
  };
}

// ─── Helper: fetch real office-holder identities for PDF injection ───────────
// Pulls active conseil syndical members (président, vice-président, secrétaire,
// trésorier) plus the syndicate_admin acting as gestionnaire, for
// {{president.fullName}}, {{manager.phone}}, etc.

async function getOfficeHolders(syndicateId?: string | null): Promise<OfficeHolders | undefined> {
  if (!syndicateId) return undefined;

  const [council, [manager]] = await Promise.all([
    db
      .select({ role: conseilSyndicalTable.role, name: conseilSyndicalTable.name, email: conseilSyndicalTable.email, phone: conseilSyndicalTable.phone })
      .from(conseilSyndicalTable)
      .where(and(eq(conseilSyndicalTable.syndicateId, syndicateId), eq(conseilSyndicalTable.status, "active"))),
    db
      .select({ name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
      .from(usersTable)
      .where(and(eq(usersTable.syndicateId, syndicateId), eq(usersTable.role, "syndicate_admin")))
      .limit(1),
  ]);

  const byRole = (role: string) => {
    const row = council.find((c) => c.role === role);
    return row ? { fullName: row.name, email: row.email ?? null, phone: row.phone ?? null } : undefined;
  };

  const holders: OfficeHolders = {
    president: byRole("president"),
    vicePresident: byRole("vice_president"),
    secretary: byRole("secretary"),
    treasurer: byRole("treasurer"),
    manager: manager ? { fullName: manager.name, email: manager.email ?? null, phone: manager.phone ?? null } : undefined,
  };
  return Object.values(holders).some(Boolean) ? holders : undefined;
}

// ─── Entity loaders — load real DB data for entity-driven templates ────────────

async function getMeetingData(meetingId: string): Promise<Record<string, string>> {
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId));
  if (!meeting) return {};
  const attendees = await db
    .select({ name: usersTable.name })
    .from(meetingAttendeesTable)
    .leftJoin(usersTable, eq(meetingAttendeesTable.userId, usersTable.id))
    .where(eq(meetingAttendeesTable.meetingId, meetingId));
  const resolutions = await db
    .select()
    .from(agResolutionsTable)
    .where(eq(agResolutionsTable.meetingId, meetingId))
    .orderBy(agResolutionsTable.number);
  const resolutionsText = resolutions.map((r) =>
    `${r.number}. ${r.title}\n   ${r.description ?? ""}\n   ${r.result === "approved" ? "✓ ADOPTÉ" : r.result === "rejected" ? "✗ REJETÉ" : "EN ATTENTE"}` +
    (r.tantiemesFor ? ` — Pour: ${r.tantiemesFor} / Contre: ${r.tantiemesAgainst} / Abs.: ${r.tantiemesAbstain}` : "")
  ).join("\n\n");
  return {
    meetingDate:        meeting.date,
    heure:              meeting.time ?? "",
    lieu:               meeting.location ?? "",
    agendaText:         meeting.agenda ?? "",
    deliberationsText:  meeting.description ?? "",
    resolutionsText,
    participants:       attendees.map((a) => a.name ?? "—").filter(Boolean).join(", "),
    dateMeeting:        meeting.date,
    _meetingTitle:      meeting.title,
    _meetingType:       meeting.type ?? "general",
  };
}

async function getLotMemberData(lotId?: string, memberId?: string): Promise<Record<string, string>> {
  let lot: typeof lotsTable.$inferSelect | null = null;
  let building: typeof buildingsTable.$inferSelect | null = null;
  let member: typeof membersTable.$inferSelect | null = null;
  if (lotId) {
    const [row] = await db
      .select()
      .from(lotsTable)
      .leftJoin(buildingsTable, eq(lotsTable.buildingId, buildingsTable.id))
      .where(eq(lotsTable.id, lotId));
    if (row) { lot = row.lots; building = row.buildings ?? null; }
  }
  if (memberId) {
    const [m] = await db.select().from(membersTable).where(eq(membersTable.id, memberId));
    member = m ?? null;
  }
  if (lot?.ownerId && !member) {
    const [m] = await db.select().from(membersTable).where(eq(membersTable.id, lot.ownerId));
    member = m ?? null;
  }
  return {
    memberName:         member?.name ?? "",
    _lotNumber:         lot?.number ?? "",
    _lotFloor:          lot?.floor != null ? String(lot.floor) : "",
    _lotSurface:        lot?.surfaceM2 ? `${Number(lot.surfaceM2)} m²` : "",
    _lotTantiemes:      lot?.tantiemes ? `${Number(lot.tantiemes)} / 10 000` : "",
    _lotTitreFoncier:   lot?.titreFoncier ?? "",
    _lotType:           lot?.type ?? "",
    _buildingName:      building?.name ?? "",
    _buildingAddress:   [building?.address, building?.city].filter(Boolean).join(", "),
  };
}

async function getAppelDeFondsData(appelId: string): Promise<Record<string, string>> {
  const [row] = await db
    .select()
    .from(appelsDeFondsTable)
    .leftJoin(lotsTable, eq(appelsDeFondsTable.lotId, lotsTable.id))
    .leftJoin(buildingsTable, eq(appelsDeFondsTable.buildingId, buildingsTable.id))
    .leftJoin(membersTable, eq(appelsDeFondsTable.ownerId, membersTable.id))
    .where(eq(appelsDeFondsTable.id, appelId));
  if (!row) return {};
  const a = row.appels_de_fonds; const lot = row.lots; const building = row.buildings; const member = row.members;
  return {
    memberName:       member?.name ?? "",
    _lotNumber:       lot?.number ?? "",
    _lotFloor:        lot?.floor != null ? String(lot.floor) : "",
    _lotSurface:      lot?.surfaceM2 ? `${Number(lot.surfaceM2)} m²` : "",
    _lotTantiemes:    lot?.tantiemes ? `${Number(lot.tantiemes)} / 10 000` : "",
    _lotTitreFoncier: lot?.titreFoncier ?? "",
    _buildingName:    building?.name ?? "",
    _buildingAddress: [building?.address, building?.city].filter(Boolean).join(", "),
    periode:          a.period,
    _chargeType:      a.type ?? "charges_courantes",
    amount:           String(Number(a.amount ?? 0)),
    dueDate:          a.dueDate ?? "",
    _status:          a.status ?? "pending",
    _receiptNumber:   a.receiptNumber ?? "",
    _paidDate:        a.paidDate ?? "",
    _paymentMethod:   a.paymentMethod ?? "",
    _appelId:         appelId,
  };
}

async function getBudgetData(budgetId: string): Promise<Record<string, string>> {
  const [row] = await db
    .select()
    .from(budgetsTable)
    .leftJoin(buildingsTable, eq(budgetsTable.buildingId, buildingsTable.id))
    .where(eq(budgetsTable.id, budgetId));
  if (!row) return {};
  const b = row.budgets; const building = row.buildings;
  const lines = await db.select().from(budgetLinesTable).where(eq(budgetLinesTable.budgetId, budgetId));
  const linesText = lines.map((l) =>
    `${l.category.padEnd(20)} ${l.label.padEnd(28)} ${Number(l.amountAnnual ?? 0).toLocaleString("fr-MA")} MAD`
  ).join("\n");
  return {
    exercice:         String(b.year),
    _totalAmount:     Number(b.totalAmount ?? 0).toLocaleString("fr-MA"),
    _chargesAmount:   Number(b.chargesAmount ?? 0).toLocaleString("fr-MA"),
    _fondsReserve:    Number(b.fondsReserve ?? 0).toLocaleString("fr-MA"),
    _budgetStatus:    b.status ?? "draft",
    _buildingName:    building?.name ?? "",
    _budgetLines:     linesText,
    _linesCount:      String(lines.length),
    _budgetId:        budgetId,
  };
}

async function getElectionData(electionId: string): Promise<Record<string, string>> {
  const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, electionId));
  if (!election) return {};
  const candidates = await db.select().from(candidatesTable).where(eq(candidatesTable.electionId, electionId));
  const quorumOk = election.quorumReached ??
    ((election.participantCount ?? 0) >= ((election.eligibleCount ?? 0) * (election.quorumPercent ?? 50) / 100));
  const participationRate = election.eligibleCount
    ? Math.round(((election.participantCount ?? 0) / election.eligibleCount) * 100) : 0;
  const candidatesText = candidates.map((c: any) =>
    `• ${c.name ?? c.userId ?? "—"} — ${c.voteCount ?? 0} vote(s)${c.isWinner ? " ✓ ÉLU" : ""}`
  ).join("\n");
  return {
    _electionTitle:      election.title,
    _electionType:       election.electionType ?? "special",
    _startDate:          election.startDate ?? "",
    _endDate:            election.endDate ?? "",
    _eligibleCount:      String(election.eligibleCount ?? 0),
    _participantCount:   String(election.participantCount ?? 0),
    _quorumPercent:      String(election.quorumPercent ?? 50),
    _quorumReached:      quorumOk ? "OUI" : "NON",
    _participationRate:  `${participationRate}%`,
    _invalidVotes:       String(election.invalidVotesCount ?? 0),
    _mandateDuration:    election.mandateDurationMonths ? `${election.mandateDurationMonths} mois` : "Indéfini",
    _candidates:         candidatesText,
    _candidatesCount:    String(candidates.length),
    _electionStatus:     election.status ?? "draft",
    _electionId:         electionId,
  };
}

// ─── Financial dashboard KPI aggregator ────────────────────────────────────────
// Pulls live aggregated metrics from appelsDeFondsTable, caisseEntriesTable,
// budgetsTable and transactionsTable and returns them as _kpi* keys so the PDF
// template can render a real enterprise financial dashboard.

async function getFinancialDashboardData(
  syndicateId: string | null | undefined,
  buildingId?: string | null,
  year?: number | null,
): Promise<Record<string, string>> {
  if (!syndicateId && !buildingId) return {};
  const currentYear = year || new Date().getFullYear();
  try {
    // ── 1. Appels de fonds ────────────────────────────────────────────────────
    const appels = buildingId
      ? await db.select({
          amount: appelsDeFondsTable.amount,
          status: appelsDeFondsTable.status,
          period: appelsDeFondsTable.period,
        }).from(appelsDeFondsTable)
          .where(eq(appelsDeFondsTable.buildingId, buildingId))
      : [];

    const totalCharged = appels.reduce((s, a) => s + Number(a.amount ?? 0), 0);
    const totalPaid    = appels.filter((a) => a.status === "paid").reduce((s, a) => s + Number(a.amount ?? 0), 0);
    const outstanding  = totalCharged - totalPaid;
    const collectionRate = totalCharged > 0 ? Math.round((totalPaid / totalCharged) * 100) : 0;

    // Year-scoped subsets for monthly / annual breakdown
    const yearAppels = appels.filter((a) => a.period?.startsWith(String(currentYear)));
    const yearCharged = yearAppels.reduce((s, a) => s + Number(a.amount ?? 0), 0);
    const yearPaid    = yearAppels.filter((a) => a.status === "paid").reduce((s, a) => s + Number(a.amount ?? 0), 0);

    // ── 2. Caisse entries (revenue / expenses / cash balance) ─────────────────
    let totalRevenue = 0;
    let totalExpenses = 0;
    if (syndicateId) {
      const caisse = await db.select({
        amount: caisseEntriesTable.amount,
        type:   caisseEntriesTable.type,
      }).from(caisseEntriesTable).where(eq(caisseEntriesTable.syndicateId, syndicateId));

      totalRevenue  = caisse.filter((e) => e.type === "credit").reduce((s, e) => s + Number(e.amount ?? 0), 0);
      totalExpenses = caisse.filter((e) => e.type === "debit").reduce((s, e) => s + Number(e.amount ?? 0), 0);
    }
    const cashBalance = totalRevenue - totalExpenses;
    const netBalance  = totalPaid + totalRevenue - totalExpenses;

    // ── 3. Budget consumption ─────────────────────────────────────────────────
    let budgetTotal = 0;
    let budgetStatusVal = "draft";
    let budgetCharges = 0;
    let budgetReserve = 0;
    if (buildingId) {
      const budgets = await db.select({
        totalAmount:   budgetsTable.totalAmount,
        chargesAmount: budgetsTable.chargesAmount,
        fondsReserve:  budgetsTable.fondsReserve,
        status:        budgetsTable.status,
      }).from(budgetsTable)
        .where(and(eq(budgetsTable.buildingId, buildingId), eq(budgetsTable.year, currentYear)));
      if (budgets[0]) {
        budgetTotal   = Number(budgets[0].totalAmount   ?? 0);
        budgetCharges = Number(budgets[0].chargesAmount ?? 0);
        budgetReserve = Number(budgets[0].fondsReserve  ?? 0);
        budgetStatusVal = budgets[0].status ?? "draft";
      }
    }
    const budgetConsumed = budgetTotal > 0 ? Math.round((yearCharged / budgetTotal) * 100) : 0;

    // ── 4. Fonds de travaux balance ───────────────────────────────────────────
    let fondsTravauxBalance = 0;
    let fondsTravauxTarget  = 0;
    if (syndicateId) {
      const ft = await db.select({
        currentBalance: fondsTravauxTable.currentBalance,
        targetAmount:   fondsTravauxTable.targetAmount,
      }).from(fondsTravauxTable)
        .where(and(eq(fondsTravauxTable.syndicateId, syndicateId), eq(fondsTravauxTable.year, currentYear)));
      if (ft[0]) {
        fondsTravauxBalance = Number(ft[0].currentBalance ?? 0);
        fondsTravauxTarget  = Number(ft[0].targetAmount   ?? 0);
      }
    }

    const fmt = (n: number) => n.toLocaleString("fr-MA");
    return {
      _kpiTotalCharged:     fmt(totalCharged),
      _kpiTotalPaid:        fmt(totalPaid),
      _kpiOutstanding:      fmt(outstanding),
      _kpiCollectionRate:   String(collectionRate),
      _kpiCashBalance:      fmt(cashBalance),
      _kpiBudgetTotal:      fmt(budgetTotal),
      _kpiBudgetCharges:    fmt(budgetCharges),
      _kpiBudgetReserve:    fmt(budgetReserve),
      _kpiBudgetConsumed:   String(budgetConsumed),
      _kpiBudgetStatus:     budgetStatusVal,
      _kpiTotalRevenue:     fmt(totalRevenue),
      _kpiTotalExpenses:    fmt(totalExpenses),
      _kpiNetBalance:       fmt(netBalance),
      _kpiYearCharged:      fmt(yearCharged),
      _kpiYearPaid:         fmt(yearPaid),
      _kpiFondsTravauxBal:  fmt(fondsTravauxBalance),
      _kpiFondsTravauxTgt:  fmt(fondsTravauxTarget),
      _kpiYear:             String(currentYear),
    };
  } catch (err) {
    return {};
  }
}

// ─── Per-lot charge aggregation for décompte des charges ──────────────────────
// Sums actual appels de fonds for a specific lot (provisions versées) and
// computes a per-lot share of building expenses from caisseEntriesTable using
// the lot's tantièmes ratio.

async function getDecompteChargesData(
  lotId: string,
  year?: string | null,
  syndicateId?: string | null,
): Promise<Record<string, string>> {
  const targetYear = year || String(new Date().getFullYear());
  try {
    // All appels for this lot
    const appels = await db.select({
      amount:  appelsDeFondsTable.amount,
      status:  appelsDeFondsTable.status,
      period:  appelsDeFondsTable.period,
      type:    appelsDeFondsTable.type,
      buildingId: appelsDeFondsTable.buildingId,
    }).from(appelsDeFondsTable).where(eq(appelsDeFondsTable.lotId, lotId));

    // Prefer year-scoped; fall back to all
    const scopedAppels = appels.filter((a) => a.period?.startsWith(targetYear));
    const useAppels = scopedAppels.length > 0 ? scopedAppels : appels;

    const totalProvisioned = useAppels.reduce((s, a) => s + Number(a.amount ?? 0), 0);
    const totalPaid        = useAppels.filter((a) => a.status === "paid").reduce((s, a) => s + Number(a.amount ?? 0), 0);
    const totalOverdue     = useAppels.filter((a) => a.status === "overdue").reduce((s, a) => s + Number(a.amount ?? 0), 0);

    // Group by type for breakdown
    const byType: Record<string, number> = {};
    useAppels.forEach((a) => {
      const key = a.type ?? "charges_courantes";
      byType[key] = (byType[key] ?? 0) + Number(a.amount ?? 0);
    });

    const typeLabels: Record<string, string> = {
      charges_courantes: "Charges courantes",
      fonds_de_reserve: "Fonds de réserve",
      travaux: "Travaux",
      charges_exceptionnelles: "Charges exceptionnelles",
      eau: "Eau",
      electricite: "Électricité",
      ascenseur: "Ascenseur",
    };
    const breakdownLines = Object.entries(byType)
      .map(([type, amount]) => `${typeLabels[type] ?? type}: ${amount.toLocaleString("fr-MA")} MAD`)
      .join("\n");

    // Lot info for tantièmes ratio → estimated real charges
    const buildingId = useAppels[0]?.buildingId;
    let estimatedRealCharges = totalProvisioned;
    if (buildingId) {
      const [lotRow] = await db.select({ tantiemes: lotsTable.tantiemes })
        .from(lotsTable)
        .where(eq(lotsTable.id, lotId));
      const tantiemes = Number(lotRow?.tantiemes ?? 0);

      if (syndicateId && tantiemes > 0) {
        const caisse = await db.select({
          amount: caisseEntriesTable.amount,
          type:   caisseEntriesTable.type,
        }).from(caisseEntriesTable).where(eq(caisseEntriesTable.syndicateId, syndicateId));
        const totalBldgExpenses = caisse
          .filter((e) => e.type === "debit")
          .reduce((s, e) => s + Number(e.amount ?? 0), 0);
        estimatedRealCharges = Math.round(totalBldgExpenses * (tantiemes / 10000));
      }
    }

    const fmt = (n: number) => n.toLocaleString("fr-MA");
    return {
      totalPrevu:           String(totalProvisioned),
      totalRealise:         String(estimatedRealCharges),
      _decompteYear:        targetYear,
      _decompteTotalPaid:   fmt(totalPaid),
      _decompteTotalOverdue: fmt(totalOverdue),
      _decompteBreakdown:   breakdownLines,
      _decompteAppelCount:  String(useAppels.length),
    };
  } catch (err) {
    return {};
  }
}

// ─── Real invoice loader for facture template ──────────────────────────────────

async function getInvoiceData(invoiceId: string): Promise<Record<string, string>> {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice) return {};

  const items = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
  const invoiceLines = items.map((item) => ({
    label:     item.label,
    qty:       Number(item.quantity ?? 1),
    unitPrice: Number(item.unitPrice ?? 0),
    total:     Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0),
  }));

  const totalHT = invoiceLines.reduce((s, l) => s + l.total, 0) || Number(invoice.amount ?? 0);
  if (invoiceLines.length === 0) {
    invoiceLines.push({ label: "Prestation de service", qty: 1, unitPrice: totalHT, total: totalHT });
  }

  return {
    _invoiceRef:    invoice.reference,
    _recipient:     invoice.recipient,
    amount:         String(Number(invoice.amount ?? 0)),
    dueDate:        invoice.dueDate,
    _invoiceDate:   invoice.date,
    _invoiceStatus: invoice.status ?? "draft",
    _invoiceLines:  JSON.stringify(invoiceLines),
  };
}

// ─── Helper: atomic sequential document numbering (REG-2026-0001, PV-2026-0001…) ──
// One counter row per (syndicateId, prefix, year); increments atomically via
// INSERT ... ON CONFLICT DO UPDATE so concurrent generations never collide.

async function generateSequentialDocumentNumber(syndicateId: string | null | undefined, template: DocumentTemplate): Promise<string> {
  const prefix = TEMPLATE_NUMBER_PREFIX[template] ?? template.toUpperCase();
  const year = new Date().getFullYear();
  const scopeId = syndicateId || "global";

  const [row] = await db
    .insert(documentSequencesTable)
    .values({ syndicateId: scopeId, prefix, year, currentValue: 1 } as any)
    .onConflictDoUpdate({
      target: [documentSequencesTable.syndicateId, documentSequencesTable.prefix, documentSequencesTable.year],
      set: { currentValue: sql`${documentSequencesTable.currentValue} + 1` },
    })
    .returning({ currentValue: documentSequencesTable.currentValue });

  return `${prefix}-${year}-${String(row.currentValue).padStart(4, "0")}`;
}

// ─── GET /documents ────────────────────────────────────────────────────────────

router.get("/documents", requireAuth, async (req, res) => {
  const { category, status } = req.query as Record<string, string>;
  try {
    const syndicateId = req.user!.syndicateId;
    const conditions: ReturnType<typeof eq>[] = [];

    // Never return soft-deleted documents to API consumers
    conditions.push(eq(documentsTable.isDeleted, false));

    if (req.user!.role !== "super_admin" || syndicateId) {
      if (syndicateId) conditions.push(eq(documentsTable.syndicateId, syndicateId));
    }
    if (category) conditions.push(eq(documentsTable.category, category as any));
    if (status)   conditions.push(eq(documentsTable.status, status));

    // Members and tenants only see published documents
    if (req.user!.role === "member" || req.user!.role === "tenant") {
      conditions.push(eq(documentsTable.status, "published"));
    }

    // Tenants are not co-owners — restrict to documents relevant to their lease only
    if (req.user!.role === "tenant") {
      conditions.push(
        sql`${documentsTable.category} IN ('bail', 'reglement', 'reglement_interieur')`,
      );
    }

    const rows = await db
      .select()
      .from(documentsTable)
      .where(and(...conditions))
      .orderBy(desc(documentsTable.createdAt));

    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/deleted — RECYCLE BIN ─────────────────────────────────────
// Lists soft-deleted documents (super_admin / syndicate_admin only), with
// search + category filter. Registered before "/:id" so it isn't shadowed.

router.get(
  "/documents/deleted",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const { search, category } = req.query as Record<string, string>;
    try {
      const conditions = [eq(documentsTable.isDeleted, true)];
      const syndicateId = req.user!.syndicateId;
      if (req.user!.role !== "super_admin") {
        if (!syndicateId) { res.status(403).json({ error: "Accès refusé : syndicateId manquant" }); return; }
        conditions.push(eq(documentsTable.syndicateId, syndicateId));
      } else if (syndicateId) {
        conditions.push(eq(documentsTable.syndicateId, syndicateId));
      }
      if (category) conditions.push(eq(documentsTable.category, category as any));
      if (search) conditions.push(sql`${documentsTable.title} ILIKE ${"%" + search + "%"}`);

      const rows = await db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          category: documentsTable.category,
          status: documentsTable.status,
          size: documentsTable.size,
          documentNumber: documentsTable.documentNumber,
          deletedAt: documentsTable.deletedAt,
          deletedBy: documentsTable.deletedBy,
          deletedByName: usersTable.name,
          retentionUntil: documentsTable.retentionUntil,
        })
        .from(documentsTable)
        .leftJoin(usersTable, eq(documentsTable.deletedBy, usersTable.id))
        .where(and(...conditions))
        .orderBy(desc(documentsTable.deletedAt));

      res.json({ data: rows });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /documents/summary — dashboard aggregate ─────────────────────────────
// Real backend-computed counts by status + expiring-soon buckets (30/60/90 days),
// replacing the client-side heuristic previously used by the mobile dashboard.

router.get("/documents/summary", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    const conditions = [eq(documentsTable.isDeleted, false)];
    if (syndicateId) conditions.push(eq(documentsTable.syndicateId, syndicateId));
    if (req.user!.role === "member" || req.user!.role === "tenant") {
      conditions.push(eq(documentsTable.status, "published"));
    }

    const rows = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        status: documentsTable.status,
        retentionUntil: documentsTable.retentionUntil,
      })
      .from(documentsTable)
      .where(and(...conditions));

    const byStatus: Record<string, number> = {};
    const expiring: { in30: typeof rows; in60: typeof rows; in90: typeof rows } = { in30: [], in60: [], in90: [] };
    const now = new Date();

    for (const row of rows) {
      const st = row.status ?? "draft";
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      const bucket = expiryBucket(row.retentionUntil, now);
      if (bucket === 30) expiring.in30.push(row);
      else if (bucket === 60) expiring.in60.push(row);
      else if (bucket === 90) expiring.in90.push(row);
    }

    res.json({
      data: {
        total: rows.length,
        byStatus,
        expiring: {
          in30: expiring.in30.length,
          in60: expiring.in60.length,
          in90: expiring.in90.length,
          documents30: expiring.in30.slice(0, 10),
        },
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/templates — Static template catalog ─────────────────────
// Returns all 21 enterprise templates with full metadata: sections, variables,
// data sources. No auth required for super_admin; requireAuth for others.

router.get("/documents/templates", requireAuth, async (_req, res) => {
  const catalog = [
    {
      id: "attestation", name: "Attestation d'adhésion", category: "attestation",
      description: "Certifie officiellement qu'un membre est en règle auprès du syndicat.",
      icon: "award", color: "#8b5cf6", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo, coordonnées et accréditation du syndicat", source: "syndicatesTable" },
        { title: "Informations du syndicat", description: "Nom, adresse, N° d'enregistrement", source: "syndicatesTable" },
        { title: "Attestation", description: "Corps du document avec nom du membre et date", source: "usersTable + input" },
        { title: "Signatures", description: "Bloc de signature officielle du président", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité avec URL publique", source: "documents (généré)" },
        { title: "Pied de page légal", description: "Référence légale et note de non-altération", source: "documents (généré)" },
      ],
      variables: [
        { name: "syndicateName",      label: "Nom du syndicat",        source: "syndicatesTable.name",               required: true  },
        { name: "syndicateAddress",   label: "Adresse du syndicat",    source: "syndicatesTable.address",             required: false },
        { name: "registrationNumber", label: "N° d'enregistrement",   source: "syndicatesTable.registrationNumber", required: false },
        { name: "memberName",         label: "Nom du membre",          source: "input utilisateur",                   required: true  },
        { name: "documentDate",       label: "Date d'émission",        source: "généré automatiquement",             required: true  },
        { name: "presidentName",      label: "Nom du président",       source: "conseilSyndicalTable.name",           required: false },
        { name: "documentNumber",     label: "N° de document",         source: "documentSequencesTable (atomique)",  required: true  },
        { name: "verificationQR",     label: "QR de vérification",     source: "généré automatiquement",             required: true  },
      ],
      requiredInputs: ["memberName"],
    },
    {
      id: "pv", name: "Procès-verbal de réunion", category: "pv",
      description: "Procès-verbal officiel enregistrant les délibérations et résolutions d'une réunion.",
      icon: "clipboard", color: "#10b981", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et coordonnées du syndicat", source: "syndicatesTable" },
        { title: "Informations de la réunion", description: "Date, lieu, heure, président de séance", source: "input" },
        { title: "Ordre du jour", description: "Points inscrits à l'ordre du jour", source: "input" },
        { title: "Délibérations", description: "Discussion et décisions de la réunion", source: "input" },
        { title: "Résolutions", description: "Résolutions officiellement adoptées", source: "input" },
        { title: "Signatures", description: "Président et secrétaire de séance", source: "conseilSyndicalTable + input" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",      label: "Nom du syndicat",        source: "syndicatesTable.name",     required: true  },
        { name: "meetingDate",        label: "Date de réunion",        source: "input utilisateur",         required: true  },
        { name: "lieu",               label: "Lieu de la réunion",     source: "input utilisateur",         required: false },
        { name: "heure",              label: "Heure",                  source: "input utilisateur",         required: false },
        { name: "presidentSeance",    label: "Président de séance",    source: "input / conseilSyndical",   required: false },
        { name: "agendaText",         label: "Ordre du jour",          source: "input utilisateur",         required: false },
        { name: "deliberationsText",  label: "Délibérations",          source: "input utilisateur",         required: false },
        { name: "resolutionsText",    label: "Résolutions",            source: "input utilisateur",         required: false },
        { name: "documentNumber",     label: "N° de document",         source: "documentSequencesTable",    required: true  },
      ],
      requiredInputs: ["meetingDate"],
    },
    {
      id: "convocation", name: "Convocation officielle", category: "pv",
      description: "Convocation officielle adressée aux membres pour une réunion.",
      icon: "calendar", color: "#3b82f6", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Destinataire", description: "Nom du ou des destinataires", source: "input / usersTable" },
        { title: "Objet de la convocation", description: "Raison de la convocation", source: "input" },
        { title: "Corps", description: "Texte officiel de convocation avec date, lieu, heure", source: "syndicatesTable + input" },
        { title: "Signatures", description: "Signature officielle du président", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Nom du syndicat",   source: "syndicatesTable.name", required: true  },
        { name: "memberName",     label: "Destinataire",       source: "input / usersTable",   required: false },
        { name: "meetingDate",    label: "Date de la réunion", source: "input utilisateur",    required: true  },
        { name: "lieu",           label: "Lieu",               source: "input utilisateur",    required: false },
        { name: "heure",          label: "Heure",              source: "input utilisateur",    required: false },
        { name: "objet",          label: "Objet",              source: "input utilisateur",    required: false },
        { name: "documentNumber", label: "N° de document",     source: "documentSequencesTable", required: true },
      ],
      requiredInputs: ["meetingDate"],
    },
    {
      id: "contrat", name: "Contrat", category: "juridique",
      description: "Contrat formel entre le syndicat et un tiers (prestataire, partenaire…).",
      icon: "file-text", color: "#0891b2", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Parties contractantes", description: "Syndicat (Partie 1) et Tiers (Partie 2)", source: "syndicatesTable + input" },
        { title: "Objet du contrat", description: "Description de l'objet et des prestations", source: "input" },
        { title: "Contenu du contrat", description: "Clauses et conditions générales", source: "input" },
        { title: "Signatures", description: "Signatures des deux parties", source: "conseilSyndicalTable + input" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Partie 1 (Syndicat)", source: "syndicatesTable.name", required: true  },
        { name: "partieB",        label: "Partie 2",            source: "input utilisateur",    required: true  },
        { name: "objet",          label: "Objet du contrat",    source: "input utilisateur",    required: false },
        { name: "content",        label: "Corps du contrat",    source: "input utilisateur",    required: false },
        { name: "documentNumber", label: "N° de document",      source: "documentSequencesTable", required: true },
      ],
      requiredInputs: ["partieB"],
    },
    {
      id: "circulaire", name: "Circulaire interne", category: "reglements",
      description: "Communication officielle adressée à tous les membres du syndicat.",
      icon: "mail", color: "#f59e0b", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Expéditeur / Destinataire", description: "Bureau syndical → Membres", source: "syndicatesTable" },
        { title: "Objet", description: "Sujet de la circulaire", source: "input" },
        { title: "Corps du message", description: "Contenu de la communication", source: "input" },
        { title: "Signatures", description: "Signature du président", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Émetteur",          source: "syndicatesTable.name", required: true  },
        { name: "objet",          label: "Objet",             source: "input utilisateur",    required: false },
        { name: "content",        label: "Corps du message",  source: "input utilisateur",    required: false },
        { name: "modeEnvoi",      label: "Mode d'envoi",      source: "input utilisateur",    required: false },
        { name: "priorite",       label: "Priorité",          source: "input utilisateur",    required: false },
        { name: "documentNumber", label: "N° de document",    source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    {
      id: "rapport_activite", name: "Rapport d'activité", category: "finances",
      description: "Rapport mensuel ou annuel présentant les activités et réalisations du syndicat.",
      icon: "bar-chart-2", color: "#06b6d4", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Informations de l'immeuble", description: "Nom, adresse, bâtiments, lots", source: "buildingsTable + lotsTable" },
        { title: "Période couverte", description: "Période du rapport", source: "input" },
        { title: "Activités réalisées", description: "Liste des activités de la période", source: "input" },
        { title: "Indicateurs de performance", description: "Indicateurs clés", source: "input" },
        { title: "Perspectives", description: "Objectifs pour la prochaine période", source: "input" },
        { title: "Synthèse", description: "Conclusion et résumé exécutif", source: "input" },
        { title: "Signatures", description: "Président et gestionnaire", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Syndicat",          source: "syndicatesTable.name",   required: true  },
        { name: "propertyName",   label: "Résidence",         source: "buildingsTable.name",    required: false },
        { name: "periode",        label: "Période couverte",  source: "input utilisateur",      required: false },
        { name: "activites",      label: "Activités",         source: "input utilisateur",      required: false },
        { name: "indicateurs",    label: "Indicateurs",       source: "input utilisateur",      required: false },
        { name: "perspectives",   label: "Perspectives",      source: "input utilisateur",      required: false },
        { name: "synthese",       label: "Synthèse",          source: "input utilisateur",      required: false },
        { name: "documentNumber", label: "N° de document",    source: "documentSequencesTable", required: true  },
      ],
      requiredInputs: [],
    },
    {
      id: "decision", name: "Décision syndicale", category: "juridique",
      description: "Décision officielle prise par le bureau syndical.",
      icon: "check-circle", color: "#16a34a", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Informations de la décision", description: "Organe décisionnel, date, objet", source: "input" },
        { title: "Corps de la décision", description: "Texte officiel de la décision", source: "input" },
        { title: "Signatures", description: "Président et bureau syndical", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Syndicat",            source: "syndicatesTable.name",   required: true  },
        { name: "organe",         label: "Organe décisionnel",  source: "input utilisateur",      required: false },
        { name: "objet",          label: "Objet de la décision",source: "input utilisateur",      required: false },
        { name: "content",        label: "Corps de la décision",source: "input utilisateur",      required: false },
        { name: "documentNumber", label: "N° de document",      source: "documentSequencesTable", required: true  },
      ],
      requiredInputs: [],
    },
    {
      id: "certificat", name: "Certificat officiel", category: "statuts",
      description: "Certificat officiel délivré à un membre ou partenaire.",
      icon: "star", color: "#7c3aed", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Destinataire", description: "Bénéficiaire du certificat", source: "input / usersTable" },
        { title: "Corps du certificat", description: "Texte officiel de certification", source: "syndicatesTable + input" },
        { title: "Signatures", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Syndicat émetteur",  source: "syndicatesTable.name",   required: true  },
        { name: "memberName",     label: "Bénéficiaire",       source: "input / usersTable",      required: false },
        { name: "content",        label: "Objet du certificat",source: "input utilisateur",      required: false },
        { name: "documentNumber", label: "N° de document",     source: "documentSequencesTable", required: true  },
      ],
      requiredInputs: [],
    },
    {
      id: "mise_en_demeure", name: "Mise en demeure", category: "juridique",
      description: "Document légal de mise en demeure adressé à un débiteur ou contrevenant.",
      icon: "alert-circle", color: "#ef4444", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Identité du destinataire", description: "Nom et coordonnées du mis en demeure", source: "input" },
        { title: "Objet de la mise en demeure", description: "Manquements constatés", source: "input" },
        { title: "Délai et conséquences", description: "Délai imparti et mesures en cas d'inexécution", source: "input" },
        { title: "Préambule", description: "Contexte juridique et factuel", source: "input" },
        { title: "Signatures", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Syndicat émetteur",  source: "syndicatesTable.name",   required: true  },
        { name: "memberName",     label: "Mis en demeure",     source: "input utilisateur",      required: true  },
        { name: "objet",          label: "Objet",              source: "input utilisateur",      required: false },
        { name: "delai",          label: "Délai imparti",      source: "input utilisateur",      required: false },
        { name: "consequences",   label: "Conséquences",       source: "input utilisateur",      required: false },
        { name: "preamble",       label: "Préambule",          source: "input utilisateur",      required: false },
        { name: "documentNumber", label: "N° de document",     source: "documentSequencesTable", required: true  },
      ],
      requiredInputs: ["memberName"],
    },
    {
      id: "reglement", name: "Règlement de copropriété", category: "reglements",
      description: "Règlement intérieur fixant les règles de jouissance et d'administration de la copropriété.",
      icon: "book", color: "#3b82f6", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Informations de l'immeuble", description: "Nom, adresse, N° de bâtiments, d'étages, de lots, surface totale", source: "buildingsTable + lotsTable" },
        { title: "Objet du règlement", description: "Cadre légal (Loi 18-00)", source: "généré automatiquement" },
        { title: "Description de l'immeuble", description: "Composition détaillée de la résidence", source: "buildingsTable + lotsTable" },
        { title: "Répartition des charges", description: "Proportions de copropriété par lot", source: "lotsTable" },
        { title: "Administration du syndicat", description: "Gouvernance et responsables", source: "conseilSyndicalTable + usersTable" },
        { title: "Contenu personnalisé", description: "Clauses additionnelles saisies par l'admin", source: "input" },
        { title: "Signatures", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "propertyName",           label: "Nom de la résidence",         source: "buildingsTable.name",                  required: true  },
        { name: "propertyAddress",        label: "Adresse",                     source: "buildingsTable.address",               required: false },
        { name: "totalBuildings",         label: "Nombre de bâtiments",         source: "buildingsTable (COUNT)",               required: false },
        { name: "totalFloors",            label: "Nombre d'étages",             source: "buildingsTable.totalFloors (SUM)",     required: false },
        { name: "totalLots",              label: "Nombre de lots",              source: "buildingsTable.totalLots (SUM)",       required: false },
        { name: "totalSurfaceM2",         label: "Surface totale (m²)",         source: "lotsTable.surfaceM2 (SUM)",            required: false },
        { name: "landRegistryReference",  label: "Référence foncière",          source: "lotsTable.titreFoncier",               required: false },
        { name: "presidentName",          label: "Président du syndicat",       source: "conseilSyndicalTable.name",            required: false },
        { name: "managerName",            label: "Gestionnaire",                source: "usersTable.name (syndicate_admin)",    required: false },
        { name: "syndicateName",          label: "Nom du syndicat",             source: "syndicatesTable.name",                 required: true  },
        { name: "documentNumber",         label: "N° de document",              source: "documentSequencesTable",               required: true  },
      ],
      requiredInputs: [],
    },
    {
      id: "demande_administrative", name: "Demande administrative", category: "reglements",
      description: "Demande formelle adressée au syndicat pour une autorisation ou une démarche administrative.",
      icon: "send", color: "#0284c7", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Demandeur", description: "Identité du demandeur", source: "input" },
        { title: "Objet de la demande", description: "Description de la demande", source: "input" },
        { title: "Exposé des motifs", description: "Justification et contexte de la demande", source: "input" },
        { title: "Justificatifs et pièces jointes", description: "Liste des documents joints", source: "input" },
        { title: "Signatures", description: "Président et demandeur", source: "conseilSyndicalTable + input" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Syndicat destinataire",  source: "syndicatesTable.name", required: true  },
        { name: "memberName",     label: "Demandeur",              source: "input utilisateur",    required: false },
        { name: "objet",          label: "Objet de la demande",    source: "input utilisateur",    required: false },
        { name: "expose",         label: "Exposé des motifs",      source: "input utilisateur",    required: false },
        { name: "justificatifs",  label: "Justificatifs",          source: "input utilisateur",    required: false },
        { name: "piecesJointes",  label: "Pièces jointes",         source: "input utilisateur",    required: false },
        { name: "documentNumber", label: "N° de document",         source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    {
      id: "autorisation", name: "Autorisation officielle", category: "juridique",
      description: "Autorisation officielle délivrée par le bureau syndical pour une action spécifique.",
      icon: "unlock", color: "#16a34a", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Bénéficiaire", description: "Personne ou entité autorisée", source: "input" },
        { title: "Texte d'autorisation", description: "Description de l'autorisation accordée", source: "input" },
        { title: "Conditions et durée", description: "Conditions d'application et validité", source: "input" },
        { title: "Signatures", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",     label: "Syndicat émetteur",        source: "syndicatesTable.name", required: true  },
        { name: "memberName",        label: "Bénéficiaire",             source: "input utilisateur",    required: false },
        { name: "texteAutorisation", label: "Texte d'autorisation",     source: "input utilisateur",    required: false },
        { name: "conditions",        label: "Conditions",               source: "input utilisateur",    required: false },
        { name: "dateDebut",         label: "Date de début",            source: "input utilisateur",    required: false },
        { name: "dateFin",           label: "Date de fin",              source: "input utilisateur",    required: false },
        { name: "documentNumber",    label: "N° de document",           source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    {
      id: "ordre_de_mission", name: "Ordre de mission", category: "reglements",
      description: "Mandat officiel autorisant un agent à effectuer une mission externe.",
      icon: "navigation", color: "#7c3aed", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Agent missionnaire", description: "Identité et poste de l'agent", source: "input" },
        { title: "Objet de la mission", description: "Description et lieu de la mission", source: "input" },
        { title: "Période et frais", description: "Dates de départ/retour et frais pris en charge", source: "input" },
        { title: "Signatures", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Syndicat",               source: "syndicatesTable.name", required: true  },
        { name: "memberName",     label: "Agent",                  source: "input utilisateur",    required: false },
        { name: "poste",          label: "Poste",                  source: "input utilisateur",    required: false },
        { name: "destination",    label: "Destination",            source: "input utilisateur",    required: false },
        { name: "dateDepart",     label: "Date de départ",         source: "input utilisateur",    required: false },
        { name: "dateRetour",     label: "Date de retour",         source: "input utilisateur",    required: false },
        { name: "objetMission",   label: "Objet de la mission",    source: "input utilisateur",    required: false },
        { name: "frais",          label: "Frais pris en charge",   source: "input utilisateur",    required: false },
        { name: "documentNumber", label: "N° de document",         source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    {
      id: "lettre_officielle", name: "Lettre officielle", category: "juridique",
      description: "Courrier officiel adressé à un tiers, partenaire ou institution.",
      icon: "mail", color: "#0891b2", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Expéditeur / Destinataire", description: "Coordonnées des deux parties", source: "syndicatesTable + input" },
        { title: "Objet", description: "Sujet de la lettre", source: "input" },
        { title: "Corps de la lettre", description: "Contenu principal de la correspondance", source: "input" },
        { title: "Signatures", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Expéditeur",        source: "syndicatesTable.name", required: true  },
        { name: "memberName",     label: "Destinataire",      source: "input utilisateur",    required: false },
        { name: "objet",          label: "Objet",             source: "input utilisateur",    required: false },
        { name: "corps",          label: "Corps de la lettre",source: "input utilisateur",    required: false },
        { name: "documentNumber", label: "N° de document",    source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    {
      id: "note_interne", name: "Note interne", category: "reglements",
      description: "Communication interne confidentielle entre membres du bureau syndical.",
      icon: "message-square", color: "#64748b", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "À / De", description: "Émetteur et destinataire internes", source: "input" },
        { title: "Objet et priorité", description: "Sujet et niveau de priorité", source: "input" },
        { title: "Corps de la note", description: "Contenu de la note interne", source: "input" },
        { title: "Action requise", description: "Actions attendues du destinataire", source: "input" },
        { title: "Signatures", description: "Auteur de la note", source: "input" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Syndicat",          source: "syndicatesTable.name", required: true  },
        { name: "memberName",     label: "À (destinataire)",  source: "input utilisateur",    required: false },
        { name: "de",             label: "De (émetteur)",     source: "input utilisateur",    required: false },
        { name: "objet",          label: "Objet",             source: "input utilisateur",    required: false },
        { name: "priorite",       label: "Priorité",          source: "input utilisateur",    required: false },
        { name: "corps",          label: "Corps de la note",  source: "input utilisateur",    required: false },
        { name: "actionRequise",  label: "Action requise",    source: "input utilisateur",    required: false },
        { name: "documentNumber", label: "N° de document",    source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    {
      id: "rapport_financier", name: "Rapport financier", category: "finances",
      description: "Bilan financier de la période avec prévisions et réalisations.",
      icon: "dollar-sign", color: "#f59e0b", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Informations de l'immeuble", description: "Résidence, adresse, N° de lots", source: "buildingsTable + lotsTable" },
        { title: "Exercice couvert", description: "Période financière analysée", source: "input" },
        { title: "Prévisions vs Réalisations", description: "Budget prévu vs réalisé", source: "input" },
        { title: "Observations", description: "Analyse et commentaires financiers", source: "input" },
        { title: "Approbation", description: "Établi et approuvé par", source: "input + conseilSyndicalTable" },
        { title: "Signatures", description: "Trésorier et président", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Syndicat",              source: "syndicatesTable.name",  required: true  },
        { name: "propertyName",   label: "Résidence",             source: "buildingsTable.name",   required: false },
        { name: "exercice",       label: "Exercice comptable",    source: "input utilisateur",     required: false },
        { name: "totalPrevu",     label: "Budget prévu",          source: "input utilisateur",     required: false },
        { name: "totalRealise",   label: "Réalisé",               source: "input utilisateur",     required: false },
        { name: "observations",   label: "Observations",          source: "input utilisateur",     required: false },
        { name: "etabliPar",      label: "Établi par",            source: "input utilisateur",     required: false },
        { name: "approuvePar",    label: "Approuvé par",          source: "input utilisateur",     required: false },
        { name: "documentNumber", label: "N° de document",        source: "documentSequencesTable",required: true  },
      ],
      requiredInputs: [],
    },
    {
      id: "rapport_audit", name: "Rapport d'audit", category: "finances",
      description: "Résultats d'un audit interne ou externe de la gestion du syndicat.",
      icon: "search", color: "#dc2626", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Informations de l'audit", description: "Auditeurs, périmètre, période auditée", source: "input" },
        { title: "Opinion d'audit", description: "Conclusion générale de l'audit", source: "input" },
        { title: "Contexte et objectifs", description: "Cadre et périmètre de l'intervention", source: "input" },
        { title: "Constats", description: "Observations et anomalies détectées", source: "input" },
        { title: "Recommandations", description: "Actions correctives préconisées", source: "input" },
        { title: "Conclusion", description: "Synthèse et clôture de l'audit", source: "input" },
        { title: "Signatures", description: "Auditeurs et président", source: "input + conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",    label: "Syndicat",            source: "syndicatesTable.name", required: true  },
        { name: "auditeurs",        label: "Auditeurs",           source: "input utilisateur",    required: false },
        { name: "perimetre",        label: "Périmètre",           source: "input utilisateur",    required: false },
        { name: "periodeAuditee",   label: "Période auditée",     source: "input utilisateur",    required: false },
        { name: "opinion",          label: "Opinion d'audit",     source: "input utilisateur",    required: false },
        { name: "contexte",         label: "Contexte",            source: "input utilisateur",    required: false },
        { name: "constats",         label: "Constats",            source: "input utilisateur",    required: false },
        { name: "recommandations",  label: "Recommandations",     source: "input utilisateur",    required: false },
        { name: "conclusion",       label: "Conclusion",          source: "input utilisateur",    required: false },
        { name: "documentNumber",   label: "N° de document",      source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    {
      id: "convention_partenariat", name: "Convention de partenariat", category: "juridique",
      description: "Convention formelle établissant un partenariat entre le syndicat et une entité tierce.",
      icon: "link", color: "#2563eb", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Parties à la convention", description: "Syndicat (Partie A) et Partenaire (Partie B)", source: "syndicatesTable + input" },
        { title: "Préambule", description: "Contexte et objectifs du partenariat", source: "input" },
        { title: "Article 1 — Objet", description: "Objet de la convention", source: "input" },
        { title: "Article 2 — Engagements", description: "Obligations des deux parties", source: "input" },
        { title: "Article 3 — Durée", description: "Durée et conditions de renouvellement", source: "input" },
        { title: "Signatures", description: "Représentants des deux parties", source: "conseilSyndicalTable + input" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",  label: "Partie A (Syndicat)",   source: "syndicatesTable.name", required: true  },
        { name: "partieB",        label: "Partie B (Partenaire)", source: "input utilisateur",    required: true  },
        { name: "preambule",      label: "Préambule",             source: "input utilisateur",    required: false },
        { name: "article1",       label: "Article 1 — Objet",     source: "input utilisateur",    required: false },
        { name: "article2",       label: "Article 2 — Engagements",source: "input utilisateur",  required: false },
        { name: "article3",       label: "Article 3 — Durée",     source: "input utilisateur",   required: false },
        { name: "duree",          label: "Durée",                 source: "input utilisateur",    required: false },
        { name: "documentNumber", label: "N° de document",        source: "documentSequencesTable", required: true },
      ],
      requiredInputs: ["partieB"],
    },
    {
      id: "accord_collectif", name: "Accord collectif", category: "juridique",
      description: "Accord signé entre le syndicat et les membres ou l'employeur.",
      icon: "users", color: "#059669", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Parties à l'accord", description: "Syndicat et employeur/membres", source: "syndicatesTable + input" },
        { title: "Champ d'application", description: "Périmètre de l'accord", source: "input" },
        { title: "Dispositions", description: "Clauses et termes de l'accord", source: "input" },
        { title: "Entrée en vigueur", description: "Date d'application et durée", source: "input" },
        { title: "Signatures", description: "Représentants des parties", source: "conseilSyndicalTable + input" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",    label: "Syndicat",              source: "syndicatesTable.name", required: true  },
        { name: "employeur",        label: "Employeur / Partie B",  source: "input utilisateur",    required: false },
        { name: "champApplication", label: "Champ d'application",  source: "input utilisateur",    required: false },
        { name: "dispositions",     label: "Dispositions",          source: "input utilisateur",    required: false },
        { name: "entreeVigueur",    label: "Entrée en vigueur",     source: "input utilisateur",    required: false },
        { name: "dateApplication",  label: "Date d'application",    source: "input utilisateur",    required: false },
        { name: "documentNumber",   label: "N° de document",        source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    {
      id: "compte_rendu", name: "Compte-rendu de réunion", category: "pv",
      description: "Résumé détaillé des délibérations et décisions prises lors d'une réunion.",
      icon: "list", color: "#7c3aed", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête", description: "Logo et identité du syndicat", source: "syndicatesTable" },
        { title: "Informations de la réunion", description: "Date, lieu, président de séance, participants", source: "input" },
        { title: "Ordre du jour", description: "Points abordés", source: "input" },
        { title: "Déroulement", description: "Résumé chronologique des échanges", source: "input" },
        { title: "Décisions prises", description: "Résolutions et actions décidées", source: "input" },
        { title: "Prochaine réunion", description: "Date et lieu de la prochaine réunion", source: "input" },
        { title: "Signatures", description: "Président et secrétaire", source: "conseilSyndicalTable + input" },
        { title: "QR de vérification", description: "Code QR d'authenticité", source: "généré" },
      ],
      variables: [
        { name: "syndicateName",     label: "Syndicat",             source: "syndicatesTable.name", required: true  },
        { name: "dateMeeting",       label: "Date de la réunion",   source: "input utilisateur",    required: false },
        { name: "lieu",              label: "Lieu",                  source: "input utilisateur",   required: false },
        { name: "presidentSeance",   label: "Président de séance",  source: "input utilisateur",    required: false },
        { name: "participants",      label: "Participants",          source: "input utilisateur",    required: false },
        { name: "ordreJour",         label: "Ordre du jour",        source: "input utilisateur",    required: false },
        { name: "deroulement",       label: "Déroulement",          source: "input utilisateur",    required: false },
        { name: "decisions",         label: "Décisions prises",     source: "input utilisateur",    required: false },
        { name: "prochaineReunion",  label: "Prochaine réunion",    source: "input utilisateur",    required: false },
        { name: "documentNumber",    label: "N° de document",       source: "documentSequencesTable", required: true },
      ],
      requiredInputs: [],
    },
    // ── 3 new smart certificate templates (auto-fills member + lot + building) ──
    {
      id: "attestation_residence", name: "Attestation de résidence", category: "attestation",
      description: "Certifie officiellement la résidence d'un copropriétaire dans l'immeuble. Le nom, le bâtiment et le numéro d'appartement sont injectés automatiquement.",
      icon: "home", color: "#0891b2", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête professionnel", description: "Logo, coordonnées et accréditation du syndicat", source: "syndicatesTable" },
        { title: "Identité du résident", description: "Nom complet du copropriétaire / locataire", source: "usersTable + membersTable" },
        { title: "Détails de la résidence", description: "N° d'appartement, résidence, adresse, étage", source: "buildingsTable + lotsTable" },
        { title: "Corps de l'attestation", description: "Texte certifiant la résidence", source: "généré automatiquement" },
        { title: "Signature officielle", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité avec URL publique", source: "documents (généré)" },
      ],
      variables: [
        { name: "syndicateName",   label: "Nom du syndicat",         source: "syndicatesTable.name",             required: true  },
        { name: "memberName",      label: "Nom du résident",         source: "membersTable.name (auto-rempli)",  required: true  },
        { name: "lotNumber",       label: "N° d'appartement",        source: "lotsTable.number (auto-rempli)",   required: false },
        { name: "lotFloor",        label: "Étage",                   source: "lotsTable.floor (auto-rempli)",    required: false },
        { name: "buildingName",    label: "Résidence / Immeuble",    source: "buildingsTable.name (auto-rempli)",required: false },
        { name: "documentDate",    label: "Date d'émission",         source: "généré automatiquement",           required: true  },
        { name: "documentNumber",  label: "N° de document",          source: "documentSequencesTable (ATT-RES)", required: true  },
        { name: "verificationQR",  label: "QR de vérification",      source: "généré automatiquement",           required: true  },
      ],
      requiredInputs: ["memberName"],
    },
    {
      id: "attestation_propriete", name: "Attestation de propriété", category: "attestation",
      description: "Certifie officiellement la propriété d'un lot de copropriété. Le titre foncier et les tantiièmes sont injectés depuis la base de données.",
      icon: "key", color: "#7c3aed", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête professionnel", description: "Logo, coordonnées et accréditation du syndicat", source: "syndicatesTable" },
        { title: "Identité du propriétaire", description: "Nom complet du copropriétaire", source: "membersTable" },
        { title: "Détails du lot", description: "N° de lot, titre foncier, tantiièmes", source: "lotsTable" },
        { title: "Corps de l'attestation", description: "Texte certifiant la propriété", source: "généré automatiquement" },
        { title: "Avertissement légal", description: "Note : ne constitue pas un titre de propriété", source: "généré" },
        { title: "Signature officielle", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité avec URL publique", source: "documents (généré)" },
      ],
      variables: [
        { name: "syndicateName",   label: "Nom du syndicat",         source: "syndicatesTable.name",                   required: true  },
        { name: "memberName",      label: "Nom du propriétaire",     source: "membersTable.name (auto-rempli)",        required: true  },
        { name: "lotNumber",       label: "N° de lot",               source: "lotsTable.number (auto-rempli)",         required: false },
        { name: "titreFoncier",    label: "Titre Foncier",           source: "lotsTable.titreFoncier (auto-rempli)",   required: false },
        { name: "tantiemes",       label: "Quote-part / Tantiièmes", source: "lotsTable.tantiemes (auto-rempli)",      required: false },
        { name: "documentDate",    label: "Date d'émission",         source: "généré automatiquement",                 required: true  },
        { name: "documentNumber",  label: "N° de document",          source: "documentSequencesTable (ATT-PRO)",       required: true  },
        { name: "verificationQR",  label: "QR de vérification",      source: "généré automatiquement",                 required: true  },
      ],
      requiredInputs: ["memberName"],
    },
    {
      id: "attestation_paiement", name: "Attestation de paiement des charges", category: "attestation",
      description: "Certifie que le copropriétaire est en règle de paiement de ses charges pour la période indiquée.",
      icon: "check-circle", color: "#16a34a", version: "2.0", author: "SYNDYCAT", updatedAt: "2026-01-01",
      sections: [
        { title: "En-tête professionnel", description: "Logo, coordonnées et accréditation du syndicat", source: "syndicatesTable" },
        { title: "Identité du payeur", description: "Nom et N° de lot du copropriétaire", source: "membersTable + lotsTable" },
        { title: "Période et montant", description: "Période couverte et total des charges réglées", source: "input" },
        { title: "Corps de l'attestation", description: "Texte certifiant le paiement", source: "généré automatiquement" },
        { title: "Confirmation comptable", description: "Note de vérification comptable à la date de délivrance", source: "généré" },
        { title: "Signature officielle", description: "Président du syndicat", source: "conseilSyndicalTable" },
        { title: "QR de vérification", description: "Code QR d'authenticité avec URL publique", source: "documents (généré)" },
      ],
      variables: [
        { name: "syndicateName",  label: "Nom du syndicat",         source: "syndicatesTable.name",           required: true  },
        { name: "memberName",     label: "Nom du copropriétaire",   source: "membersTable.name (auto-rempli)",required: true  },
        { name: "lotNumber",      label: "N° de lot",               source: "lotsTable.number (auto-rempli)", required: false },
        { name: "periode",        label: "Période couverte",        source: "input utilisateur",              required: true  },
        { name: "montant",        label: "Montant total réglé (MAD)", source: "input utilisateur",            required: false },
        { name: "documentDate",   label: "Date d'émission",         source: "généré automatiquement",         required: true  },
        { name: "documentNumber", label: "N° de document",          source: "documentSequencesTable (ATT-PAI)", required: true  },
        { name: "verificationQR", label: "QR de vérification",      source: "généré automatiquement",         required: true  },
      ],
      requiredInputs: ["memberName", "periode"],
    },
  ];

  res.json({ data: catalog });
});

// ─── POST /documents/preview — Resolve variable values without generating PDF ─
// Takes same body as POST /documents but returns resolved variable values from
// the DB plus the template structure, so the mobile wizard can show a live preview.

router.post(
  "/documents/preview",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    if (req.user!.role === "syndicate_admin" && !req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé : syndicateId manquant" }); return;
    }
    const schema = z.object({
      templateId: z.string(),
      buildingId: z.string().optional(),
      memberName: z.string().optional(),
      language:   z.enum(["fr", "ar", "en", "es"] as const).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides", details: result.error.flatten() }); return;
    }

    try {
      const { templateId, buildingId, memberName } = result.data;
      const syndicateId = req.user!.syndicateId || "";

      const [syndInfo, property, officeHolders] = await Promise.all([
        getSyndicateInfo(syndicateId),
        getPropertyInfo(syndicateId, buildingId),
        getOfficeHolders(syndicateId),
      ]);

      const today = new Date().toLocaleDateString("fr-FR");
      const year  = new Date().getFullYear();

      const resolvedVariables: Record<string, string | null> = {
        syndicateName:          syndInfo.name            || null,
        syndicateAddress:       syndInfo.address         || null,
        syndicateCity:          syndInfo.city            || null,
        syndicatePhone:         syndInfo.phone           || null,
        syndicateEmail:         syndInfo.email           || null,
        registrationNumber:     syndInfo.registrationNumber || null,
        syndicateColor:         syndInfo.logoColor       || null,
        propertyName:           property?.name           || null,
        propertyAddress:        property?.address        || null,
        propertyCity:           property?.city           || null,
        totalBuildings:         property ? String(property.totalBuildings) : null,
        totalFloors:            property ? String(property.totalFloors)    : null,
        totalLots:              property ? String(property.totalLots)      : null,
        totalSurfaceM2:         property?.totalSurfaceM2 ? `${property.totalSurfaceM2} m²` : null,
        landRegistryReference:  property?.landRegistryReference ?? null,
        presidentName:          officeHolders?.president?.fullName   ?? null,
        presidentEmail:         officeHolders?.president?.email      ?? null,
        vicePresidentName:      officeHolders?.vicePresident?.fullName ?? null,
        secretaryName:          officeHolders?.secretary?.fullName   ?? null,
        treasurerName:          officeHolders?.treasurer?.fullName   ?? null,
        managerName:            officeHolders?.manager?.fullName     ?? null,
        managerPhone:           officeHolders?.manager?.phone        ?? null,
        memberName:             memberName || null,
        documentDate:           today,
        documentYear:           String(year),
        documentNumber:         `[GÉNÉRÉ — ex: ATT-${year}-0001]`,
        verificationQR:         "[QR généré automatiquement à la création]",
      };

      res.json({
        data: {
          templateId,
          syndicateInfo: syndInfo,
          propertyInfo: property ?? null,
          officeHolders: officeHolders ?? null,
          resolvedVariables,
          resolvedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur lors de la résolution des variables" });
    }
  },
);

// ─── GET /documents/verify/:token — PUBLIC QR verification endpoint ──────────
// No auth required — this is the destination of the QR code printed on every
// generated PDF. Registered before "/documents/:id" so "verify" is never
// swallowed by the :id param (see memory: express route order shadowing).
// Never leaks document content — only the minimal authenticity signal a
// verifier needs: title, reference, status, syndicate name, and signature list.

router.get("/documents/verify/:token", async (req, res) => {
  const token = String(req.params.token);
  try {
    const [doc] = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        documentNumber: documentsTable.documentNumber,
        status: documentsTable.status,
        isDeleted: documentsTable.isDeleted,
        expiresAt: documentsTable.expiresAt,
        supersededByDocumentId: documentsTable.supersededByDocumentId,
        syndicateId: documentsTable.syndicateId,
        createdAt: documentsTable.createdAt,
        rejectionReason: documentsTable.rejectionReason,
      })
      .from(documentsTable)
      .where(eq(documentsTable.verificationToken, token));

    if (!doc) {
      if (req.accepts(["html", "json"]) === "html") {
        res.status(404).send("<html><body><h1>Document introuvable</h1><p>Ce code de vérification ne correspond à aucun document connu.</p></body></html>");
      } else {
        res.status(404).json({ error: "Document introuvable", verified: false });
      }
      return;
    }

    const now = new Date();
    let verificationStatus: "valid" | "pending" | "revoked" | "expired" | "replaced";
    if (doc.isDeleted || doc.status === "rejected") verificationStatus = "revoked";
    else if (doc.status === "expired" || (doc.expiresAt && doc.expiresAt < now)) verificationStatus = "expired";
    else if (doc.supersededByDocumentId) verificationStatus = "replaced";
    else if (doc.status === "signed" || doc.status === "published" || doc.status === "archived") verificationStatus = "valid";
    else verificationStatus = "pending";

    const [syndInfo] = await db.select({ name: syndicatesTable.name }).from(syndicatesTable).where(eq(syndicatesTable.id, doc.syndicateId ?? ""));
    const sigs = await db
      .select({ signerName: documentSignaturesTable.signerName, signerRole: documentSignaturesTable.signerRole, signedAt: documentSignaturesTable.signedAt, isValid: documentSignaturesTable.isValid })
      .from(documentSignaturesTable)
      .where(eq(documentSignaturesTable.documentId, doc.id))
      .orderBy(documentSignaturesTable.signatureOrder);

    const payload = {
      verified: verificationStatus === "valid",
      status: verificationStatus,
      title: doc.title,
      documentNumber: doc.documentNumber,
      issuedBy: syndInfo?.name ?? null,
      issuedAt: doc.createdAt,
      rejectionReason: verificationStatus === "revoked" ? doc.rejectionReason : undefined,
      signatures: sigs.map((s) => ({ signerName: s.signerName, signerRole: s.signerRole, signedAt: s.signedAt, isValid: s.isValid })),
    };

    if (req.accepts(["html", "json"]) === "html") {
      const statusLabel: Record<typeof verificationStatus, string> = {
        valid: "✅ Document authentique et valide",
        pending: "⏳ Document en attente de validation finale",
        revoked: "❌ Document révoqué ou rejeté",
        expired: "⚠️ Document expiré",
        replaced: "🔄 Document remplacé par une version plus récente",
      };
      res.status(200).send(`<html><head><meta charset="utf-8"><title>Vérification de document</title></head><body style="font-family:sans-serif;max-width:480px;margin:40px auto;">
        <h2>${statusLabel[verificationStatus]}</h2>
        <p><strong>${payload.title}</strong></p>
        <p>Réf. : ${payload.documentNumber}</p>
        <p>Émis par : ${payload.issuedBy ?? "N/A"}</p>
        ${payload.signatures.length ? `<p>Signatures : ${payload.signatures.map((s) => `${s.signerName} (${s.isValid ? "valide" : "invalidée"})`).join(", ")}</p>` : ""}
      </body></html>`);
    } else {
      res.json(payload);
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur", verified: false });
  }
});

// ─── GET /documents/autofill ──────────────────────────────────────────────────
// Returns pre-resolved DB variable values for the authenticated user.
// Registered before /:id so the literal "autofill" path is not captured by the param.

router.get("/documents/autofill", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const syndicateId = user.syndicateId || "";

    const [syndInfo, property, officeHolders] = await Promise.all([
      getSyndicateInfo(syndicateId),
      getPropertyInfo(syndicateId),
      getOfficeHolders(syndicateId),
    ]);

    // Fetch the first lot owned by a member matching this user's email
    // (members table has no direct userId FK — match by email)
    const lotRows = syndicateId
      ? await db
          .select({ number: lotsTable.number, floor: lotsTable.floor })
          .from(lotsTable)
          .innerJoin(membersTable, eq(lotsTable.ownerId, membersTable.id))
          .where(and(eq(membersTable.syndicateId, syndicateId), eq(membersTable.email, user.email ?? "")))
          .limit(1)
      : [];
    const memberRow = lotRows[0];

    const today = new Date().toLocaleDateString("fr-FR");
    const year  = new Date().getFullYear();

    res.json({
      data: {
        syndicateInfo: {
          syndicate_name:       syndInfo.name            || null,
          syndicate_address:    syndInfo.address         || null,
          syndicate_city:       syndInfo.city            || null,
          syndicate_phone:      syndInfo.phone           || null,
          syndicate_email:      syndInfo.email           || null,
          registration_number:  syndInfo.registrationNumber || null,
          syndicate_color:      syndInfo.logoColor       || null,
        },
        propertyInfo: property ? {
          building_name:    property.name    || null,
          building_address: property.address || null,
          building_city:    property.city    || null,
          total_lots:       property.totalLots    != null ? String(property.totalLots)    : null,
          total_floors:     property.totalFloors  != null ? String(property.totalFloors)  : null,
          total_buildings:  String(property.totalBuildings),
        } : null,
        officeHolders: officeHolders ? {
          president_name:      officeHolders.president?.fullName   ?? null,
          president_email:     officeHolders.president?.email      ?? null,
          vice_president_name: officeHolders.vicePresident?.fullName ?? null,
          secretary_name:      officeHolders.secretary?.fullName   ?? null,
          treasurer_name:      officeHolders.treasurer?.fullName   ?? null,
          manager_name:        officeHolders.manager?.fullName     ?? null,
          manager_phone:       officeHolders.manager?.phone        ?? null,
        } : null,
        memberInfo: {
          member_name:  user.name  || null,
          member_email: user.email || null,
          lot_number:   (memberRow as any)?.number ?? null,
          floor:        (memberRow as any)?.floor != null ? String((memberRow as any).floor) : null,
        },
        generated: {
          issue_date:      today,
          document_year:   String(year),
          document_number: `[Généré automatiquement]`,
        },
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur lors de la résolution des variables" });
  }
});

// ─── GET /documents/:id ────────────────────────────────────────────────────────

router.get("/documents/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc || doc.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
    if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    if ((req.user!.role === "member" || req.user!.role === "tenant") && doc.status !== "published") {
      res.status(403).json({ error: "Document non publié" }); return;
    }
    res.json({ data: doc });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/local-docs/:uuid/:filename — serve local-disk fallback PDFs

router.get("/documents/local-docs/:uuid/:filename", requireAuth, async (req, res) => {
  const uuid     = String(req.params.uuid);
  const filename = String(req.params.filename);
  if (!uuid || !filename || /[/\\]/.test(uuid) || /[/\\]/.test(filename)) {
    res.status(400).json({ error: "Chemin invalide" }); return;
  }
  try {
    const buffer = await readLocalDocFile(uuid, filename);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch {
    res.status(404).json({ error: "Fichier introuvable — il a peut-être expiré après un redémarrage du serveur." });
  }
});

// ─── GET /documents/:id/download-url ──────────────────────────────────────────

router.get("/documents/:id/download-url", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
    if (!doc || doc.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
    if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    if ((req.user!.role === "member" || req.user!.role === "tenant") && doc.status !== "published") {
      res.status(403).json({ error: "Document non publié" }); return;
    }
    if (!doc.fileUrl) {
      res.status(404).json({ error: "Aucun fichier PDF généré pour ce document" }); return;
    }
    const url = await signDocumentDownloadUrl(doc.fileUrl, 3600);
    await serverAuditLog(req, { action: "DOCUMENT_DOWNLOAD", entity: "document", entityId: id, details: doc.title });
    res.json({ url, expiresIn: 3600, filename: `${doc.documentNumber ?? doc.id}.pdf` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur lors de la génération du lien de téléchargement" });
  }
});

// ─── POST /documents ───────────────────────────────────────────────────────────

router.post(
  "/documents",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    if (req.user!.role === "syndicate_admin" && !req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé : syndicateId manquant dans le jeton" }); return;
    }
    const schema = z.object({
      title:      z.string().min(1).max(500),
      category:   z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]),
      content:    z.string().max(500_000).optional(),
      memberName: z.string().optional(),
      // Scopes {{property.*}} injection to a specific residence; otherwise
      // aggregates across all buildings of the syndicate.
      buildingId: z.string().optional(),
      // Optional direct template override — bypasses CATEGORY_TO_TEMPLATE lookup
      // Includes all 21 templates: 9 original + 11 new enterprise + reglement
      templateId: z.enum([
        "attestation", "pv", "convocation", "contrat", "rapport",
        "decision", "certificat", "circulaire", "mise_en_demeure", "reglement",
        "demande_administrative", "autorisation", "ordre_de_mission", "lettre_officielle",
        "note_interne", "rapport_financier", "rapport_audit", "convention_partenariat",
        "accord_collectif", "compte_rendu", "rapport_activite",
        "attestation_residence", "attestation_propriete", "attestation_paiement",
        "appel_de_fonds", "recu_paiement", "facture", "budget_previsionnel",
        "decompte_charges", "rapport_election",
      ] as const).optional(),
      // ── Entity IDs — auto-load data from DB instead of manual entry ───────────
      meetingId:        z.string().optional(),
      lotId:            z.string().optional(),
      memberId:         z.string().optional(),
      appelDeFondsId:   z.string().optional(),
      budgetId:         z.string().optional(),
      electionId:       z.string().optional(),
      invoiceId:        z.string().optional(),
      // Output language — the mobile UI always presents an explicit choice; "fr" is
      // only used as a server-side fallback for callers that omit it entirely.
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
      // Business expiration date (distinct from legal retentionUntil) — e.g. a
      // contract/mandate/authorization validity end date. ISO date/datetime string.
      expiresAt: z.string().optional(),
      // Extra fields passed through to the template
      lieu:              z.string().optional(),
      meetingDate:       z.string().optional(),
      heure:             z.string().optional(),
      agendaText:        z.string().optional(),
      deliberationsText: z.string().optional(),
      resolutionsText:   z.string().optional(),
      periode:           z.string().optional(),
      organe:            z.string().optional(),
      objet:             z.string().optional(),
      delai:             z.string().optional(),
      priorite:          z.string().optional(),
      modeEnvoi:         z.string().optional(),
      preamble:          z.string().optional(),
      consequences:      z.string().optional(),
      activites:         z.string().optional(),
      indicateurs:       z.string().optional(),
      perspectives:      z.string().optional(),
      synthese:          z.string().optional(),
      president:         z.string().optional(),
      secretaire:        z.string().optional(),
      // ── New enterprise template fields ──────────────────────────────────────
      // demande_administrative
      expose:            z.string().optional(),
      justificatifs:     z.string().optional(),
      piecesJointes:     z.string().optional(),
      // autorisation
      texteAutorisation: z.string().optional(),
      conditions:        z.string().optional(),
      dateDebut:         z.string().optional(),
      dateFin:           z.string().optional(),
      // ordre_de_mission
      poste:             z.string().optional(),
      destination:       z.string().optional(),
      dateDepart:        z.string().optional(),
      dateRetour:        z.string().optional(),
      objetMission:      z.string().optional(),
      frais:             z.string().optional(),
      // lettre_officielle / note_interne
      corps:             z.string().optional(),
      de:                z.string().optional(),
      actionRequise:     z.string().optional(),
      // rapport_financier
      etabliPar:         z.string().optional(),
      approuvePar:       z.string().optional(),
      exercice:          z.string().optional(),
      observations:      z.string().optional(),
      totalPrevu:        z.string().optional(),
      totalRealise:      z.string().optional(),
      // rapport_audit
      auditeurs:         z.string().optional(),
      perimetre:         z.string().optional(),
      periodeAuditee:    z.string().optional(),
      opinion:           z.string().optional(),
      contexte:          z.string().optional(),
      constats:          z.string().optional(),
      recommandations:   z.string().optional(),
      conclusion:        z.string().optional(),
      // convention_partenariat / accord_collectif
      partieB:           z.string().optional(),
      duree:             z.string().optional(),
      preambule:         z.string().optional(),
      article1:          z.string().optional(),
      article2:          z.string().optional(),
      article3:          z.string().optional(),
      employeur:         z.string().optional(),
      dispositions:      z.string().optional(),
      champApplication:  z.string().optional(),
      entreeVigueur:     z.string().optional(),
      dateApplication:   z.string().optional(),
      // compte_rendu
      dateMeeting:       z.string().optional(),
      presidentSeance:   z.string().optional(),
      participants:      z.string().optional(),
      ordreJour:         z.string().optional(),
      deroulement:       z.string().optional(),
      decisions:         z.string().optional(),
      prochaineReunion:  z.string().optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides", details: result.error.flatten() }); return;
    }

    try {
      const { title, category, content, memberName, templateId, buildingId, language, expiresAt, ...extraFields } = result.data;
      const syndicateId = req.user!.syndicateId || null;
      const docLanguage: DocumentLanguage = (language as DocumentLanguage) ?? "fr";

      // 1. Fetch full syndicate branding + real residence/office-holder data
      const [syndInfo, property, officeHolders] = await Promise.all([
        getSyndicateInfo(syndicateId),
        getPropertyInfo(syndicateId, buildingId),
        getOfficeHolders(syndicateId),
      ]);

      // 2. Determine template (direct override > category mapping > fallback)
      const template: DocumentTemplate = templateId ?? CATEGORY_TO_TEMPLATE[category] ?? "certificat";

      // 3. Mint a real sequential document number (REG-2026-0001, PV-2026-0001, …)
      const documentNumber = await generateSequentialDocumentNumber(syndicateId, template);

      // 3b. Mint the QR verification token + its real, environment-portable public URL
      const verificationToken = randomUUID();
      const verificationUrl = buildVerifyUrl(verificationToken);

      // 4. Load entity-specific data from DB (entity-driven generation)
      const entityLoads: Promise<Record<string, string>>[] = [];
      if (extraFields.meetingId)      entityLoads.push(getMeetingData(extraFields.meetingId as string));
      if (extraFields.appelDeFondsId) entityLoads.push(getAppelDeFondsData(extraFields.appelDeFondsId as string));
      if (extraFields.budgetId)       entityLoads.push(getBudgetData(extraFields.budgetId as string));
      if (extraFields.electionId)     entityLoads.push(getElectionData(extraFields.electionId as string));
      if (extraFields.lotId || extraFields.memberId) {
        entityLoads.push(getLotMemberData(extraFields.lotId as string | undefined, extraFields.memberId as string | undefined));
      }
      // ── NEW: real financial data loaders ────────────────────────────────────
      if (extraFields.invoiceId) {
        entityLoads.push(getInvoiceData(extraFields.invoiceId as string));
      }
      // Financial KPI dashboard — loaded for all financial templates
      const isFinancialTemplate = ["appel_de_fonds","recu_paiement","facture","budget_previsionnel","decompte_charges"].includes(template);
      if (isFinancialTemplate) {
        const kpiBuildingId = buildingId ?? null;
        const kpiYear = extraFields.exercice ? parseInt(extraFields.exercice as string) : null;
        entityLoads.push(getFinancialDashboardData(syndicateId, kpiBuildingId, kpiYear));
      }
      // Décompte des charges — real per-lot aggregation
      if (template === "decompte_charges" && extraFields.lotId) {
        entityLoads.push(getDecompteChargesData(
          extraFields.lotId as string,
          extraFields.exercice as string | undefined ?? null,
          syndicateId,
        ));
      }
      const entityResults = await Promise.all(entityLoads);
      const entityData: Record<string, string> = Object.assign({}, ...entityResults);

      // Also load existing signatures for documents being regenerated after signing
      const existingDocId = extraFields._existingDocumentId as string | undefined;
      let loadedSignatures: import("../lib/documentPdf.js").InlineSignatureInfo[] = [];
      if (existingDocId) {
        const sigRows = await db
          .select()
          .from(documentSignaturesTable)
          .where(eq(documentSignaturesTable.documentId, existingDocId))
          .orderBy(documentSignaturesTable.signatureOrder);
        loadedSignatures = sigRows
          .filter((s) => s.signedAt && s.signerName)
          .map((s) => ({
            signerName: s.signerName ?? "",
            signerRole: s.signerRole ?? "syndicate_admin",
            signedAt: new Date(s.signedAt!),
            isValid: s.isValid ?? true,
          }));
      }

      // 5. Generate PDF + upload to GCS
      const generated = await generateAndUploadDocument(template, {
        title,
        content,
        syndicate: syndInfo,
        property,
        officeHolders,
        memberName: entityData.memberName || memberName,
        documentNumber,
        docStatus: "generated",
        version: "v1.0",
        language: docLanguage,
        verificationUrl,
        signatures: loadedSignatures,
        ...entityData,   // entity DB data first (auto-populated)
        ...extraFields,  // user-provided fields override auto-populated ones
      });

      // 5. Insert document record
      const createdAt = new Date();
      const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null;
      const [doc] = await db
        .insert(documentsTable)
        .values({
          title,
          category,
          content,
          status: "generated",
          syndicateId,
          size: generated.fileSizeKo,
          fileUrl: generated.fileUrl || null,
          documentNumber: generated.documentNumber,
          templateId: template,
          version: 1,
          isDeleted: false,
          createdBy: req.user!.userId,
          updatedAt: createdAt,
          language: docLanguage,
          verificationToken,
          expiresAt: parsedExpiresAt && !Number.isNaN(parsedExpiresAt.getTime()) ? parsedExpiresAt : null,
          // Legal retention — computed from category/template, see lib/retention.ts
          retentionUntil: computeRetentionUntil(category, template, createdAt),
        } as any)
        .returning();

      // 6. Audit log
      await serverAuditLog(req, {
        action: "DOCUMENT_GENERATED",
        entity: "document",
        entityId: doc.id,
        details: `Titre: ${doc.title}, Modèle: ${template}, Réf: ${doc.documentNumber}, Catégorie: ${doc.category}, Langue: ${docLanguage}`,
      });

      // 7. Push + email notification (fire-and-forget)
      if (syndicateId) {
        createAlert({
          title: "Nouveau document généré",
          message: `"${title}" a été généré dans la catégorie ${category}.`,
          type: "info",
          syndicateId,
          target: "admin",
        }).catch(() => {});

        db.select({ email: usersTable.email })
          .from(usersTable)
          .where(and(eq(usersTable.syndicateId, syndicateId), eq(usersTable.role, "syndicate_admin")))
          .then((admins) =>
            sendEmailToMany(
              admins.map((a) => a.email),
              "Nouveau document généré",
              `<p>Le document <strong>${title}</strong> (réf. ${doc.documentNumber}) vient d'être généré.</p>`,
              "document_created",
              syndicateId,
            ),
          )
          .catch(() => {});
      }

      res.status(201).json({ data: doc, message: "Document généré avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur lors de la génération du document" });
    }
  },
);

// ─── PUT /documents/:id ────────────────────────────────────────────────────────

router.put(
  "/documents/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      title:    z.string().min(1).max(500).optional(),
      category: z.enum(["reglements", "statuts", "pv", "juridique", "finances", "attestation"]).optional(),
      content:  z.string().max(500_000).optional(),
      status:   z.enum(VALID_STATUSES).optional(),
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
      expiresAt: z.string().optional(),
      // Required when status is set to "rejected" — legal traceability of why.
      rejectionReason: z.string().min(1).max(2000).optional(),
      // Free-text audit note for the version snapshot (optional).
      changeReason: z.string().max(500).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }

    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      // Enforce workflow state machine
      if (result.data.status && result.data.status !== existing.status) {
        const from = (existing.status ?? "draft") as DocStatus;
        const to   = result.data.status as DocStatus;
        if (!isTransitionAllowed(from, to)) {
          res.status(422).json({
            error: `Transition invalide : "${from}" → "${to}"`,
            allowed: ALLOWED_TRANSITIONS[from],
          }); return;
        }
        if (to === "rejected" && !result.data.rejectionReason) {
          res.status(400).json({ error: "Un motif de rejet est requis" }); return;
        }
      }

      // Snapshot the pre-update state into version history BEFORE applying any
      // content/status change — never lost, even if this specific PUT fails partway.
      const { changeReason, rejectionReason, ...fieldUpdates } = result.data;
      const isMeaningfulChange = fieldUpdates.content !== undefined || fieldUpdates.title !== undefined || fieldUpdates.status !== undefined;
      if (isMeaningfulChange) {
        await db.insert(documentVersionsTable).values({
          documentId: id,
          versionNumber: existing.version ?? 1,
          title: existing.title,
          content: existing.content,
          status: existing.status,
          fileUrl: existing.fileUrl,
          language: existing.language,
          modifiedBy: req.user!.userId,
          changeReason: changeReason ?? (fieldUpdates.status ? `Transition ${existing.status} → ${fieldUpdates.status}` : "Modification du contenu"),
        } as any);
      }

      const updates: Record<string, unknown> = { ...fieldUpdates, updatedAt: new Date() };
      if (result.data.expiresAt !== undefined) {
        const parsed = new Date(result.data.expiresAt);
        updates.expiresAt = Number.isNaN(parsed.getTime()) ? null : parsed;
        updates.expiryNotifiedBucket = null; // reset reminder tracking if the date changed
      }
      if (result.data.content !== undefined) {
        updates.size = `${Math.round(result.data.content.length / 1024)}Ko`;
      }
      // Only increment version on content changes (not status-only changes)
      if (result.data.content !== undefined) {
        updates.version = sql`COALESCE(${documentsTable.version}, 1) + 1`;
      }
      // Lifecycle timestamps
      if (result.data.status === "published") updates.publishedAt = new Date();
      if (result.data.status === "archived")  updates.archivedAt  = new Date();
      if (result.data.status === "signed")    updates.signedAt    = new Date();
      if (result.data.status === "validated") {
        updates.approvedAt = new Date();
        updates.approvedBy = req.user!.userId;
      }
      if (result.data.status === "rejected") {
        updates.rejectedAt = new Date();
        updates.rejectedBy = req.user!.userId;
        updates.rejectionReason = rejectionReason;
      }

      const [doc] = await db
        .update(documentsTable)
        .set(updates)
        .where(eq(documentsTable.id, id))
        .returning();

      // A rejected document's existing signatures no longer certify anything valid.
      if (result.data.status === "rejected") {
        await db.update(documentSignaturesTable).set({ isValid: false } as any).where(eq(documentSignaturesTable.documentId, id));
      }

      await serverAuditLog(req, {
        action: "DOCUMENT_UPDATED",
        entity: "document",
        entityId: id,
        details: `Champs: ${Object.keys(result.data).join(", ")}, Version: ${doc.version}`,
      });

      // Notify members when published
      if (result.data.status === "published" && existing.syndicateId) {
        createAlert({
          title: "Nouveau document publié",
          message: `"${doc.title}" est maintenant disponible dans l'espace Documents.`,
          type: "success",
          syndicateId: existing.syndicateId,
          target: "all",
        }).catch(() => {});
      }

      // Approval / rejection email + in-app notifications to the document's author
      if ((result.data.status === "validated" || result.data.status === "rejected") && existing.createdBy) {
        const [author] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, existing.createdBy));
        const approved = result.data.status === "validated";
        createAlert({
          title: approved ? "Document approuvé" : "Document rejeté",
          message: approved
            ? `"${doc.title}" a été approuvé.`
            : `"${doc.title}" a été rejeté. Motif : ${rejectionReason}`,
          type: approved ? "success" : "error",
          syndicateId: existing.syndicateId,
          target: "admin",
        }).catch(() => {});
        if (author?.email) {
          sendEmail(
            author.email,
            approved ? "Votre document a été approuvé" : "Votre document a été rejeté",
            approved
              ? `<p>Le document <strong>${doc.title}</strong> a été approuvé.</p>`
              : `<p>Le document <strong>${doc.title}</strong> a été rejeté.</p><p>Motif : ${rejectionReason}</p>`,
            approved ? "document_approved" : "document_rejected",
            existing.syndicateId,
          ).catch(() => {});
        }
      }

      res.json({ data: doc, message: "Document mis à jour avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /documents/:id/versions — version history ────────────────────────────

router.get(
  "/documents/:id/versions",
  requireAuth,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [doc] = await db.select({ syndicateId: documentsTable.syndicateId }).from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const versions = await db
        .select({
          id: documentVersionsTable.id,
          versionNumber: documentVersionsTable.versionNumber,
          title: documentVersionsTable.title,
          status: documentVersionsTable.status,
          language: documentVersionsTable.language,
          modifiedBy: documentVersionsTable.modifiedBy,
          modifiedByName: usersTable.name,
          modifiedAt: documentVersionsTable.modifiedAt,
          changeReason: documentVersionsTable.changeReason,
        })
        .from(documentVersionsTable)
        .leftJoin(usersTable, eq(documentVersionsTable.modifiedBy, usersTable.id))
        .where(eq(documentVersionsTable.documentId, id))
        .orderBy(desc(documentVersionsTable.versionNumber));
      res.json({ data: versions });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/versions/:versionId/restore ──────────────────────────
// Restores a document's title/content/status/language from a past snapshot.
// The CURRENT state is itself snapshotted first, so a restore is never a
// one-way, irreversible action.

router.post(
  "/documents/:id/versions/:versionId/restore",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const versionId = String(req.params.versionId);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const [version] = await db.select().from(documentVersionsTable).where(and(eq(documentVersionsTable.id, versionId), eq(documentVersionsTable.documentId, id)));
      if (!version) { res.status(404).json({ error: "Version introuvable" }); return; }

      // Snapshot the current state before overwriting it, so restoring is reversible.
      await db.insert(documentVersionsTable).values({
        documentId: id,
        versionNumber: existing.version ?? 1,
        title: existing.title,
        content: existing.content,
        status: existing.status,
        fileUrl: existing.fileUrl,
        language: existing.language,
        modifiedBy: req.user!.userId,
        changeReason: `Snapshot automatique avant restauration de la version ${version.versionNumber}`,
      } as any);

      const [doc] = await db
        .update(documentsTable)
        .set({
          title: version.title,
          content: version.content,
          status: version.status ?? existing.status,
          language: version.language ?? existing.language,
          version: sql`COALESCE(${documentsTable.version}, 1) + 1`,
          updatedAt: new Date(),
        } as any)
        .where(eq(documentsTable.id, id))
        .returning();

      await serverAuditLog(req, {
        action: "DOCUMENT_VERSION_RESTORED",
        entity: "document",
        entityId: id,
        details: `Restauré depuis la version ${version.versionNumber}`,
      });

      res.json({ data: doc, message: "Version restaurée avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── DELETE /documents/:id — SOFT DELETE ─────────────────────────────────────
// Documents are never physically deleted for legal retention.
// super_admin can use /purge to permanently remove after legal retention period.

router.delete(
  "/documents/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing || existing.isDeleted) {
        res.status(404).json({ error: "Document introuvable" }); return;
      }
      if (req.user!.role !== "super_admin" && existing.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      // Soft delete — preserve PDF file, audit trail, and signatures
      await db
        .update(documentsTable)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.user!.userId,
          updatedAt: new Date(),
        } as any)
        .where(eq(documentsTable.id, id));

      await serverAuditLog(req, {
        action: "DOCUMENT_DELETED",
        entity: "document",
        entityId: id,
        details: `Titre: ${existing.title}, Catégorie: ${existing.category} — suppression logique`,
      });

      res.json({ message: "Document supprimé (conservé pour archivage légal)" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/restore ──────────────────────────────────────────────
// Restore a soft-deleted document (super_admin or syndicate_admin).

router.post(
  "/documents/:id/restore",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (!existing.isDeleted) { res.status(409).json({ error: "Ce document n'est pas supprimé" }); return; }

      const [doc] = await db
        .update(documentsTable)
        .set({
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date(),
        } as any)
        .where(eq(documentsTable.id, id))
        .returning();

      await serverAuditLog(req, {
        action: "DOCUMENT_RESTORED",
        entity: "document",
        entityId: id,
        details: `Titre: ${existing.title} — restauré depuis la corbeille`,
      });

      res.json({ data: doc, message: "Document restauré avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/purge ────────────────────────────────────────────────
// Permanently delete a soft-deleted document (super_admin only, after retention).

router.post(
  "/documents/:id/purge",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!existing) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (!existing.isDeleted) {
        res.status(409).json({ error: "Effectuez d'abord une suppression logique avant de purger" }); return;
      }

      // Delete PDF from GCS
      if (existing.fileUrl) {
        deleteDocumentFromGcs(existing.fileUrl).catch(() => {});
      }

      await db.delete(documentsTable).where(eq(documentsTable.id, id));

      await serverAuditLog(req, {
        action: "DOCUMENT_PURGED",
        entity: "document",
        entityId: id,
        details: `Titre: ${existing.title} — suppression permanente (purge)`,
      });

      res.json({ message: "Document définitivement supprimé" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/:id/sign ──────────────────────────────────────────────────

router.post(
  "/documents/:id/sign",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      signatureData: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }

    try {
      const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc || doc.isDeleted) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      // Only generated or validated documents can be signed — NOT published
      const signable: DocStatus[] = ["generated", "validated"];
      if (!signable.includes((doc.status ?? "draft") as DocStatus)) {
        res.status(422).json({ error: `Le document au statut "${doc.status}" ne peut pas être signé` }); return;
      }

      // Prevent the same user signing the same document twice (also enforced by
      // a unique index at the DB level as defense-in-depth).
      const [alreadySigned] = await db
        .select({ id: documentSignaturesTable.id })
        .from(documentSignaturesTable)
        .where(and(eq(documentSignaturesTable.documentId, id), eq(documentSignaturesTable.signedBy, req.user!.userId)));
      if (alreadySigned) {
        res.status(409).json({ error: "Vous avez déjà signé ce document" }); return;
      }

      // Next signature order = count of existing signatures + 1
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(documentSignaturesTable)
        .where(eq(documentSignaturesTable.documentId, id));
      const nextOrder = (count ?? 0) + 1;

      const signerName = req.user!.name ?? req.user!.userId;
      const now = new Date();

      const [sig] = await db
        .insert(documentSignaturesTable)
        .values({
          documentId:    id,
          signedBy:      req.user!.userId,
          signerRole:    req.user!.role,
          signerName,
          syndicateId:   req.user!.syndicateId,
          ipAddress:     req.ip ?? req.socket?.remoteAddress,
          signatureData: result.data.signatureData,
          signatureOrder: nextOrder,
          isValid: true,
        } as any)
        .returning();

      await db.update(documentsTable).set({
        status:    "signed",
        signedAt:  now,
        signedBy:  req.user!.userId,
        updatedAt: now,
      } as any).where(eq(documentsTable.id, id));

      // Append the real signature (name/role/date/handwritten trace/validity) to
      // the PDF as an authoritative signature page — best-effort, never blocks
      // the already-durable DB signature record if PDF embedding fails.
      if (doc.fileUrl) {
        // Fetch syndicate branding for the signature page header (best-effort).
        const syndBranding = doc.syndicateId
          ? await db
              .select({ name: syndicatesTable.name, logoColor: syndicatesTable.logoColor })
              .from(syndicatesTable)
              .where(eq(syndicatesTable.id, doc.syndicateId))
              .limit(1)
              .then((r) => r[0] ?? null)
              .catch(() => null)
          : null;

        appendSignaturesToPdf(
          doc.fileUrl,
          [{
            signerName,
            signerRole: req.user!.role,
            signedAt: now,
            signatureSvg: result.data.signatureData,
            isValid: true,
          }],
          (doc.language as DocumentLanguage) ?? "fr",
          (syndBranding?.logoColor as string | undefined) ?? "#7c3aed",
          syndBranding?.name ?? "",
          doc.documentNumber ?? "",
        ).catch((err) => req.log.error({ err, docId: id }, "Signature PDF embed failed"));
      }

      await serverAuditLog(req, {
        action: "DOCUMENT_SIGNED",
        entity: "document",
        entityId: id,
        details: `Signataire: ${signerName}, Rôle: ${req.user!.role}`,
      });

      if (doc.syndicateId) {
        createAlert({
          title: "Document signé",
          message: `"${doc.title}" a été signé électroniquement par ${signerName}.`,
          type: "success",
          syndicateId: doc.syndicateId,
          target: "admin",
        }).catch(() => {});

        if (doc.createdBy && doc.createdBy !== req.user!.userId) {
          db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, doc.createdBy))
            .then(([author]) => {
              if (author?.email) {
                sendEmail(
                  author.email,
                  "Document signé",
                  `<p>Le document <strong>${doc.title}</strong> a été signé par ${roleLabel(req.user!.role, (doc.language as DocumentLanguage) ?? "fr")} ${signerName}.</p>`,
                  "document_signed",
                  doc.syndicateId,
                );
              }
            })
            .catch(() => {});
        }
      }

      res.status(201).json({ data: sig, message: "Document signé avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /documents/:id/signatures ────────────────────────────────────────────

router.get(
  "/documents/:id/signatures",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }
      if (req.user!.role !== "super_admin" && doc.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const sigs = await db
        .select()
        .from(documentSignaturesTable)
        .where(eq(documentSignaturesTable.documentId, id))
        .orderBy(desc(documentSignaturesTable.signedAt));
      res.json({ data: sigs });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Comments: GET /documents/:id/comments ───────────────────────────────────

router.get(
  "/:id/comments",
  requireAuth,
  async (req, res) => {
    const id = String(req.params.id);
    try {
      const [doc] = await db.select({ id: documentsTable.id, syndicateId: documentsTable.syndicateId, status: documentsTable.status })
        .from(documentsTable)
        .where(and(eq(documentsTable.id, id), eq(documentsTable.isDeleted, false)));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }

      const user = req.user!;
      const isSuperAdmin = user.role === "super_admin";
      const isAdminOfSyndicate = (user.role === "syndicate_admin") && doc.syndicateId === user.syndicateId;
      const isMemberOfSyndicate = (user.role === "member") && doc.syndicateId === user.syndicateId;
      if (!isSuperAdmin && !isAdminOfSyndicate && !isMemberOfSyndicate) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      const comments = await db
        .select({
          id:        documentCommentsTable.id,
          content:   documentCommentsTable.content,
          parentId:  documentCommentsTable.parentId,
          isDeleted: documentCommentsTable.isDeleted,
          editedAt:  documentCommentsTable.editedAt,
          createdAt: documentCommentsTable.createdAt,
          authorId:  documentCommentsTable.authorId,
          authorName: usersTable.name,
          authorRole: usersTable.role,
        })
        .from(documentCommentsTable)
        .leftJoin(usersTable, eq(documentCommentsTable.authorId, usersTable.id))
        .where(eq(documentCommentsTable.documentId, id))
        .orderBy(documentCommentsTable.createdAt);

      res.json({ data: comments });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Comments: POST /documents/:id/comments ──────────────────────────────────

const CommentCreateSchema = z.object({
  content:  z.string().min(1).max(2000),
  parentId: z.string().optional(),
});

router.post(
  "/:id/comments",
  requireAuth,
  async (req, res) => {
    const id = String(req.params.id);
    const parsed = CommentCreateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    try {
      const [doc] = await db.select({ id: documentsTable.id, syndicateId: documentsTable.syndicateId })
        .from(documentsTable)
        .where(and(eq(documentsTable.id, id), eq(documentsTable.isDeleted, false)));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }

      const user = req.user!;
      const isSuperAdmin = user.role === "super_admin";
      const isAdminOfSyndicate = (user.role === "syndicate_admin") && doc.syndicateId === user.syndicateId;
      const isMemberOfSyndicate = (user.role === "member") && doc.syndicateId === user.syndicateId;
      if (!isSuperAdmin && !isAdminOfSyndicate && !isMemberOfSyndicate) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      const [comment] = await db.insert(documentCommentsTable).values({
        documentId: id,
        authorId:   user.userId,
        content:    parsed.data.content,
        parentId:   parsed.data.parentId ?? null,
      } as any).returning();

      serverAuditLog(req, { action: "document_comment_added", entity: "document", entityId: id, details: `commentId: ${comment.id}` });
      res.status(201).json({ data: comment });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Comments: DELETE /documents/:id/comments/:commentId ─────────────────────

router.delete(
  "/:id/comments/:commentId",
  requireAuth,
  async (req, res) => {
    const id = String(req.params.id);
    const commentId = String(req.params.commentId);
    try {
      const [comment] = await db.select().from(documentCommentsTable)
        .where(and(eq(documentCommentsTable.id, commentId), eq(documentCommentsTable.documentId, id)));
      if (!comment) { res.status(404).json({ error: "Commentaire introuvable" }); return; }

      const [doc] = await db.select({ syndicateId: documentsTable.syndicateId })
        .from(documentsTable)
        .where(eq(documentsTable.id, id));
      if (!doc) { res.status(404).json({ error: "Document introuvable" }); return; }

      const user = req.user!;
      const isOwner = comment.authorId === user.userId;
      const isSuperAdmin = user.role === "super_admin";
      // IDOR fix: a syndicate_admin may only moderate comments on documents
      // belonging to THEIR OWN syndicate, never a global "any syndicate_admin" bypass.
      const isSyndicateAdminOfDoc = user.role === "syndicate_admin" && doc.syndicateId === user.syndicateId;
      if (!isOwner && !isSuperAdmin && !isSyndicateAdminOfDoc) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      await db.update(documentCommentsTable)
        .set({ isDeleted: true })
        .where(eq(documentCommentsTable.id, commentId));

      serverAuditLog(req, { action: "document_comment_deleted", entity: "document", entityId: id, details: `commentId: ${commentId}` });
      res.json({ message: "Commentaire supprimé" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
