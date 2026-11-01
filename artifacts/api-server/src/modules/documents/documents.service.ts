import { logger } from "../../lib/logger.js";
import { nextSequenceNumber } from "../../lib/sequences.js";
import { syndicateFlows, moneySum } from "../../lib/treasury.js";
import { db } from "@workspace/db";
import {
  syndicatesTable,
  treasuryAccountsTable,
  usersTable,
  buildingsTable,
  lotsTable,
  conseilSyndicalTable,
  membersTable,
  appelsDeFondsTable,
  invoicesTable,
  invoiceItemsTable,
  budgetsTable,
  budgetLinesTable,
  meetingsTable,
  meetingAttendeesTable,
  agResolutionsTable,
  fondsTravauxTable,
} from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  generateAndUploadDocument,
  TEMPLATE_NUMBER_PREFIX,
  type DocumentTemplate,
  type DocumentLanguage,
  type SyndicateInfo,
  type PropertyInfo,
  type OfficeHolders,
  type InlineSignatureInfo,
} from "../../lib/documentPdf.js";

// ─── Workflow state machine ────────────────────────────────────────────────────
// "rejected" and "expired" added on top of the original 7-state machine.
// Spec's "Approved" state maps onto the pre-existing "validated" status —
// kept as-is (not renamed) to avoid breaking existing consumers; approvedAt/
// approvedBy are populated whenever a document transitions into "validated".
export const VALID_STATUSES = [
  "draft",
  "generated",
  "pending_review",
  "validated",
  "signed",
  "published",
  "archived",
  "rejected",
  "expired",
] as const;

export type DocStatus = (typeof VALID_STATUSES)[number];

export const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft: ["generated", "pending_review", "published"],
  generated: ["pending_review", "validated", "rejected"],
  pending_review: ["generated", "validated", "draft", "rejected"],
  validated: ["signed", "published", "rejected"],
  signed: ["published", "expired"],
  published: ["archived", "expired"],
  archived: [],
  rejected: ["draft", "pending_review"],
  expired: ["archived"],
};

export function isTransitionAllowed(from: DocStatus, to: DocStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Builds the real, environment-portable public verification URL for a document's
 * QR code and footer note — read from PUBLIC_APP_URL at runtime and omitted
 * when no public application URL is configured.
 */
export function buildVerifyUrl(token: string): string | undefined {
  const base = process.env.PUBLIC_APP_URL;
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/api/documents/verify/${token}`;
}

// ─── Helper: atomic sequential document numbering (REG-2026-0001, PV-2026-0001…) ──
// One counter row per (syndicateId, prefix, year); increments atomically via
// INSERT ... ON CONFLICT DO UPDATE so concurrent generations never collide.
export async function generateSequentialDocumentNumber(
  syndicateId: string | null | undefined,
  template: DocumentTemplate,
): Promise<string> {
  const prefix = TEMPLATE_NUMBER_PREFIX[template] ?? template.toUpperCase();
  return nextSequenceNumber(db, syndicateId || "global", prefix);
}

// ─── Helper: fetch full syndicate branding for PDF ────────────────────────────
export async function getSyndicateInfo(
  syndicateId?: string | null,
): Promise<SyndicateInfo> {
  const defaults: SyndicateInfo = {
    name: "MIZAN",
    address: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    registrationNumber: "",
    logoColor: "#2563EB",
    logoUrl: null,
    abbreviation: null,
    bankName: null,
    bankIban: null,
    bankBic: null,
  };
  if (!syndicateId) return defaults;

  const [s] = await db
    .select({
      name: syndicatesTable.name,
      address: syndicatesTable.address,
      city: syndicatesTable.city,
      phone: syndicatesTable.phone,
      email: syndicatesTable.email,
      website: syndicatesTable.website,
      registrationNumber: syndicatesTable.registrationNumber,
      logoColor: syndicatesTable.logoColor,
      logoUrl: syndicatesTable.logoUrl,
      abbreviation: syndicatesTable.abbreviation,
      bankName: syndicatesTable.bankName,
      bankIban: syndicatesTable.bankIban,
      bankBic: syndicatesTable.bankBic,
    })
    .from(syndicatesTable)
    .where(eq(syndicatesTable.id, syndicateId));
  // The account printed for payment is the one the app shows for the transfer
  // and the treasurer reconciles: the default active bank account. The free
  // fields of the condominium are used only when no such account exists.
  const [account] = await db
    .select({ bankName: treasuryAccountsTable.bankName, rib: treasuryAccountsTable.rib })
    .from(treasuryAccountsTable)
    .where(and(eq(treasuryAccountsTable.syndicateId, syndicateId), eq(treasuryAccountsTable.kind, "bank"), eq(treasuryAccountsTable.status, "active"), eq(treasuryAccountsTable.isDefault, true)))
    .limit(1);

  return {
    name: s?.name ?? defaults.name,
    address: s?.address ?? defaults.address,
    city: s?.city ?? defaults.city,
    phone: s?.phone ?? defaults.phone,
    email: s?.email ?? defaults.email,
    website: s?.website ?? defaults.website,
    registrationNumber: s?.registrationNumber ?? defaults.registrationNumber,
    logoColor: s?.logoColor ?? defaults.logoColor,
    logoUrl: s?.logoUrl ?? defaults.logoUrl,
    abbreviation: s?.abbreviation ?? defaults.abbreviation,
    bankName: (account?.rib ? account.bankName : null) ?? s?.bankName ?? defaults.bankName,
    bankIban: account?.rib ?? s?.bankIban ?? defaults.bankIban,
    bankBic: s?.bankBic ?? defaults.bankBic,
  };
}

// ─── Helper: fetch real property/residence data for PDF injection ────────────
// Pulls the syndicate's building(s) + lots to populate {{property.*}} variables
// (name, address, city, totalBuildings, totalFloors, totalLots, totalSurfaceM2,
// landRegistryReference). When buildingId is given, scopes to that building only;
// otherwise aggregates across all buildings of the syndicate.
export async function getPropertyInfo(
  syndicateId?: string | null,
  buildingId?: string | null,
): Promise<PropertyInfo | undefined> {
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
        .select({
          surfaceM2: lotsTable.surfaceM2,
          titreFoncier: lotsTable.titreFoncier,
        })
        .from(lotsTable)
        .where(inArray(lotsTable.buildingId, buildingIds))
    : [];

  const totalSurfaceM2 = lots.reduce(
    (sum, l) => sum + (l.surfaceM2 ? Number(l.surfaceM2) : 0),
    0,
  );
  const landRegistryReference =
    lots.find((l) => l.titreFoncier)?.titreFoncier ??
    buildings[0].registrationNumber ??
    null;

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
export async function getOfficeHolders(
  syndicateId?: string | null,
): Promise<OfficeHolders | undefined> {
  if (!syndicateId) return undefined;

  const [council, [manager]] = await Promise.all([
    db
      .select({
        role: conseilSyndicalTable.role,
        name: conseilSyndicalTable.name,
        email: conseilSyndicalTable.email,
        phone: conseilSyndicalTable.phone,
      })
      .from(conseilSyndicalTable)
      .where(
        and(
          eq(conseilSyndicalTable.syndicateId, syndicateId),
          eq(conseilSyndicalTable.status, "active"),
        ),
      ),
    db
      .select({
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.syndicateId, syndicateId),
          eq(usersTable.role, "syndicate_admin"),
        ),
      )
      .limit(1),
  ]);

  const byRole = (role: string) => {
    const row = council.find((c) => c.role === role);
    return row
      ? {
          fullName: row.name,
          email: row.email ?? null,
          phone: row.phone ?? null,
        }
      : undefined;
  };

  const holders: OfficeHolders = {
    president: byRole("president"),
    vicePresident: byRole("vice_president"),
    secretary: byRole("secretary"),
    treasurer: byRole("treasurer"),
    manager: manager
      ? {
          fullName: manager.name,
          email: manager.email ?? null,
          phone: manager.phone ?? null,
        }
      : undefined,
  };
  return Object.values(holders).some(Boolean) ? holders : undefined;
}

// ─── Entity loaders — load real DB data for entity-driven templates ────────────
export async function getMeetingData(
  meetingId: string,
): Promise<Record<string, string>> {
  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, meetingId));
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
  const resolutionsText = resolutions
    .map(
      (r) =>
        `${r.number}. ${r.title}\n   ${r.description ?? ""}\n   ${r.result === "approved" ? "✓ ADOPTÉ" : r.result === "rejected" ? "✗ REJETÉ" : "EN ATTENTE"}` +
        (r.tantiemesFor
          ? ` — Pour: ${r.tantiemesFor} / Contre: ${r.tantiemesAgainst} / Abs.: ${r.tantiemesAbstain}`
          : ""),
    )
    .join("\n\n");
  // Structured JSON for the PV template to render resolution cards with vote badges
  const resolutionsJson = JSON.stringify(
    resolutions.map((r) => ({
      number: r.number,
      title: r.title,
      description: r.description ?? "",
      result: r.result ?? "pending",
      pour: r.tantiemesFor ? Number(r.tantiemesFor) : null,
      contre: r.tantiemesAgainst ? Number(r.tantiemesAgainst) : null,
      abstention: r.tantiemesAbstain ? Number(r.tantiemesAbstain) : null,
    })),
  );
  const attendeeNames = attendees.map((a) => a.name ?? "—").filter(Boolean);
  return {
    meetingDate: meeting.date,
    heure: meeting.time ?? "",
    lieu: meeting.location ?? "",
    agendaText: meeting.agenda ?? "",
    deliberationsText: meeting.description ?? "",
    resolutionsText,
    _resolutionsJson: resolutionsJson,
    participants: attendeeNames.join(", "),
    _attendeesCount: String(attendeeNames.length),
    dateMeeting: meeting.date,
    _meetingTitle: meeting.title,
    _meetingType: meeting.type ?? "general",
  };
}

export async function getLotMemberData(
  lotId?: string,
  memberId?: string,
): Promise<Record<string, string>> {
  let lot: typeof lotsTable.$inferSelect | null = null;
  let building: typeof buildingsTable.$inferSelect | null = null;
  let member: typeof membersTable.$inferSelect | null = null;
  if (lotId) {
    const [row] = await db
      .select()
      .from(lotsTable)
      .leftJoin(buildingsTable, eq(lotsTable.buildingId, buildingsTable.id))
      .where(eq(lotsTable.id, lotId));
    if (row) {
      lot = row.lots;
      building = row.buildings ?? null;
    }
  }
  if (memberId) {
    const [m] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, memberId));
    member = m ?? null;
  }
  if (lot?.ownerId && !member) {
    const [m] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, lot.ownerId));
    member = m ?? null;
  }
  // When only memberId was supplied (no lotId), auto-resolve the member's lot as owner
  // so that _lotNumber / _buildingName are populated without requiring a separate lotId.
  if (member && !lot) {
    const [row] = await db
      .select()
      .from(lotsTable)
      .leftJoin(buildingsTable, eq(lotsTable.buildingId, buildingsTable.id))
      .where(eq(lotsTable.ownerId, member.id))
      .limit(1);
    if (row) {
      lot = row.lots;
      building = row.buildings ?? null;
    }
  }
  return {
    memberName: member?.name ?? "",
    _lotNumber: lot?.number ?? "",
    _lotFloor: lot?.floor != null ? String(lot.floor) : "",
    _lotSurface: lot?.surfaceM2 ? `${Number(lot.surfaceM2)} m²` : "",
    _lotTantiemes: lot?.tantiemes ? `${Number(lot.tantiemes)} / 10 000` : "",
    _lotTitreFoncier: lot?.titreFoncier ?? "",
    _lotType: lot?.type ?? "",
    _buildingName: building?.name ?? "",
    _buildingAddress: [building?.address, building?.city]
      .filter(Boolean)
      .join(", "),
    // ── Extended member fields for attestation + profile documents ────────────
    _memberEmail: member?.email ?? "",
    _memberPhone: member?.phone ?? "",
    _memberProfession: (member as any)?.profession ?? "",
    _memberJoinDate: member?.joinDate ?? "",
    _memberStatus: member?.status ?? "",
    _memberCotisation: member?.cotisationStatus ?? "",
    _memberRef: member ? `ADH-${member.id.slice(-8).toUpperCase()}` : "",
    // CIN + avatar — stored on usersTable (matched by email), not on membersTable directly
    ...(await (async () => {
      if (!member?.email) {
        logger.warn(
          { memberId: member?.id ?? null },
          "[getLotMemberData] member has no email — cannot resolve CIN/avatar from usersTable",
        );
        return { _memberCIN: "", _memberAvatarUrl: "" };
      }
      const [uRow] = await db
        .select({ cin: usersTable.cin, avatar: usersTable.avatar })
        .from(usersTable)
        .where(eq(usersTable.email, member.email));
      if (!uRow) {
        logger.warn(
          { memberEmail: member.email, memberId: member.id },
          "[getLotMemberData] no usersTable row found for member email — CIN/avatar will be empty",
        );
      } else {
        logger.info(
          {
            memberEmail: member.email,
            cinFound: !!uRow.cin,
            avatarFound: !!uRow.avatar,
            avatarValue: uRow.avatar ?? null,
          },
          "[getLotMemberData] usersTable row resolved",
        );
      }
      return {
        _memberCIN: uRow?.cin ?? "",
        _memberAvatarUrl: uRow?.avatar ?? "",
      };
    })()),
  };
}

export async function getAppelDeFondsData(
  appelId: string,
): Promise<Record<string, string>> {
  const [row] = await db
    .select()
    .from(appelsDeFondsTable)
    .leftJoin(lotsTable, eq(appelsDeFondsTable.lotId, lotsTable.id))
    .leftJoin(
      buildingsTable,
      eq(appelsDeFondsTable.buildingId, buildingsTable.id),
    )
    .leftJoin(membersTable, eq(appelsDeFondsTable.ownerId, membersTable.id))
    .where(eq(appelsDeFondsTable.id, appelId));
  if (!row) return {};
  const a = row.appels_de_fonds;
  const lot = row.lots;
  const building = row.buildings;
  const member = row.members;
  return {
    memberName: member?.name ?? "",
    _lotNumber: lot?.number ?? "",
    _lotFloor: lot?.floor != null ? String(lot.floor) : "",
    _lotSurface: lot?.surfaceM2 ? `${Number(lot.surfaceM2)} m²` : "",
    _lotTantiemes: lot?.tantiemes ? `${Number(lot.tantiemes)} / 10 000` : "",
    _lotTitreFoncier: lot?.titreFoncier ?? "",
    _buildingName: building?.name ?? "",
    _buildingAddress: [building?.address, building?.city]
      .filter(Boolean)
      .join(", "),
    periode: a.period,
    _chargeType: a.type ?? "charges_courantes",
    amount: String(Number(a.amount ?? 0)),
    dueDate: a.dueDate ?? "",
    _status: a.status ?? "pending",
    _receiptNumber: a.receiptNumber ?? "",
    _paidDate: a.paidDate ?? "",
    _paymentMethod: a.paymentMethod ?? "",
    _appelId: appelId,
  };
}

export async function getBudgetData(
  budgetId: string,
): Promise<Record<string, string>> {
  const [row] = await db
    .select()
    .from(budgetsTable)
    .leftJoin(buildingsTable, eq(budgetsTable.buildingId, buildingsTable.id))
    .where(eq(budgetsTable.id, budgetId));
  if (!row) return {};
  const b = row.budgets;
  const building = row.buildings;
  const lines = await db
    .select()
    .from(budgetLinesTable)
    .where(eq(budgetLinesTable.budgetId, budgetId));
  const linesText = lines
    .map(
      (l) =>
        `${l.category.padEnd(20)} ${l.label.padEnd(28)} ${Number(l.amountAnnual ?? 0).toLocaleString("fr-MA")} MAD`,
    )
    .join("\n");
  return {
    exercice: String(b.year),
    _totalAmount: Number(b.totalAmount ?? 0).toLocaleString("fr-MA"),
    _chargesAmount: Number(b.chargesAmount ?? 0).toLocaleString("fr-MA"),
    _fondsReserve: Number(b.fondsReserve ?? 0).toLocaleString("fr-MA"),
    _budgetStatus: b.status ?? "draft",
    _buildingName: building?.name ?? "",
    _budgetLines: linesText,
    _linesCount: String(lines.length),
    _budgetId: budgetId,
  };
}

// ─── Financial dashboard KPI aggregator ────────────────────────────────────────
// Pulls live aggregated metrics from appelsDeFondsTable, the journal (ledger_entries),
// budgetsTable and transactionsTable and returns them as _kpi* keys so the PDF
// template can render a real enterprise financial dashboard.
export async function getFinancialDashboardData(
  syndicateId: string | null | undefined,
  buildingId?: string | null,
  year?: number | null,
): Promise<Record<string, string>> {
  if (!syndicateId && !buildingId) return {};
  const currentYear = year || new Date().getFullYear();
  try {
    // ── 1. Appels de fonds ────────────────────────────────────────────────────
    //    Prefer building-scoped query; fall back to ALL buildings in the syndicate
    //    so KPI values are never silently zero when no buildingId is provided.
    let appels: Array<{
      amount: unknown;
      amountPaid: unknown;
      status: string | null;
      period: string | null;
    }> = [];
    if (buildingId) {
      appels = await db
        .select({
          amount: appelsDeFondsTable.amount,
          amountPaid: appelsDeFondsTable.amountPaid,
          status: appelsDeFondsTable.status,
          period: appelsDeFondsTable.period,
        })
        .from(appelsDeFondsTable)
        .where(eq(appelsDeFondsTable.buildingId, buildingId));
    } else if (syndicateId) {
      // Syndicate-wide: join through buildings to scope by syndicateId
      appels = await db
        .select({
          amount: appelsDeFondsTable.amount,
          amountPaid: appelsDeFondsTable.amountPaid,
          status: appelsDeFondsTable.status,
          period: appelsDeFondsTable.period,
        })
        .from(appelsDeFondsTable)
        .innerJoin(
          buildingsTable,
          eq(appelsDeFondsTable.buildingId, buildingsTable.id),
        )
        .where(eq(buildingsTable.syndicateId, syndicateId));
    }

    // Cancelled calls are not owed; paid = validated payments (partial included).
    appels = appels.filter((a) => a.status !== "cancelled");
    const totalCharged = moneySum(appels.map((a) => a.amount));
    const totalPaid = moneySum(appels.map((a) => a.amountPaid));
    const outstanding = totalCharged - totalPaid;
    const collectionRate =
      totalCharged > 0 ? Math.round((totalPaid / totalCharged) * 100) : 0;

    // Year-scoped subsets for monthly / annual breakdown
    const yearAppels = appels.filter((a) =>
      a.period?.startsWith(String(currentYear)),
    );
    const yearCharged = yearAppels.reduce(
      (s, a) => s + Number(a.amount ?? 0),
      0,
    );
    const yearPaid = moneySum(yearAppels.map((a) => a.amountPaid));

    // ── 2. Journal (revenue / expenses / treasury balance) ────────────────────
    let totalRevenue = 0;
    let totalExpenses = 0;
    let cashBalance = 0;
    if (syndicateId) {
      const flows = await syndicateFlows(syndicateId);
      totalRevenue = flows.revenue;
      totalExpenses = flows.expenses;
      cashBalance = flows.balance;
    }
    // Validated co-owner payments are already part of the journal revenue.
    const netBalance = totalRevenue - totalExpenses;

    // ── 3. Budget consumption ─────────────────────────────────────────────────
    let budgetTotal = 0;
    let budgetStatusVal = "draft";
    let budgetCharges = 0;
    let budgetReserve = 0;
    if (buildingId) {
      const budgets = await db
        .select({
          totalAmount: budgetsTable.totalAmount,
          chargesAmount: budgetsTable.chargesAmount,
          fondsReserve: budgetsTable.fondsReserve,
          status: budgetsTable.status,
        })
        .from(budgetsTable)
        .where(
          and(
            eq(budgetsTable.buildingId, buildingId),
            eq(budgetsTable.year, currentYear),
          ),
        );
      if (budgets[0]) {
        budgetTotal = Number(budgets[0].totalAmount ?? 0);
        budgetCharges = Number(budgets[0].chargesAmount ?? 0);
        budgetReserve = Number(budgets[0].fondsReserve ?? 0);
        budgetStatusVal = budgets[0].status ?? "draft";
      }
    }
    const budgetConsumed =
      budgetTotal > 0 ? Math.round((yearCharged / budgetTotal) * 100) : 0;

    // ── 4. Fonds de travaux balance ───────────────────────────────────────────
    let fondsTravauxBalance = 0;
    let fondsTravauxTarget = 0;
    if (syndicateId) {
      const ft = await db
        .select({
          currentBalance: fondsTravauxTable.currentBalance,
          targetAmount: fondsTravauxTable.targetAmount,
        })
        .from(fondsTravauxTable)
        .where(
          and(
            eq(fondsTravauxTable.syndicateId, syndicateId),
            eq(fondsTravauxTable.year, currentYear),
          ),
        );
      if (ft[0]) {
        fondsTravauxBalance = Number(ft[0].currentBalance ?? 0);
        fondsTravauxTarget = Number(ft[0].targetAmount ?? 0);
      }
    }

    const fmt = (n: number) => n.toLocaleString("fr-MA");
    return {
      _kpiTotalCharged: fmt(totalCharged),
      _kpiTotalPaid: fmt(totalPaid),
      _kpiOutstanding: fmt(outstanding),
      _kpiCollectionRate: String(collectionRate),
      _kpiCashBalance: fmt(cashBalance),
      _kpiBudgetTotal: fmt(budgetTotal),
      _kpiBudgetCharges: fmt(budgetCharges),
      _kpiBudgetReserve: fmt(budgetReserve),
      _kpiBudgetConsumed: String(budgetConsumed),
      _kpiBudgetStatus: budgetStatusVal,
      _kpiTotalRevenue: fmt(totalRevenue),
      _kpiTotalExpenses: fmt(totalExpenses),
      _kpiNetBalance: fmt(netBalance),
      _kpiYearCharged: fmt(yearCharged),
      _kpiYearPaid: fmt(yearPaid),
      _kpiFondsTravauxBal: fmt(fondsTravauxBalance),
      _kpiFondsTravauxTgt: fmt(fondsTravauxTarget),
      _kpiYear: String(currentYear),
    };
  } catch (err) {
    return {};
  }
}

// ─── Real invoice loader for facture template ──────────────────────────────────
export async function getInvoiceData(
  invoiceId: string,
): Promise<Record<string, string>> {
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, invoiceId));
  if (!invoice) return {};

  const items = await db
    .select()
    .from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoiceId));
  const invoiceLines = items.map((item) => ({
    label: item.label,
    qty: Number(item.quantity ?? 1),
    unitPrice: Number(item.unitPrice ?? 0),
    total: Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0),
  }));

  const totalHT =
    invoiceLines.reduce((s, l) => s + l.total, 0) ||
    Number(invoice.amount ?? 0);
  if (invoiceLines.length === 0) {
    invoiceLines.push({
      label: "Prestation de service",
      qty: 1,
      unitPrice: totalHT,
      total: totalHT,
    });
  }

  return {
    _invoiceRef: invoice.reference,
    _recipient: invoice.recipient,
    amount: String(Number(invoice.amount ?? 0)),
    dueDate: invoice.dueDate,
    _invoiceDate: invoice.date,
    _invoiceStatus: invoice.status ?? "draft",
    _invoiceLines: JSON.stringify(invoiceLines),
  };
}

// ─── Attestation de Paiement — auto-calculate paid charges for a lot ─────────────
export async function getAttestationPaiementData(
  lotId: string,
  periode?: string | null,
  syndicateId?: string | null,
): Promise<Record<string, string>> {
  try {
    const [lotRow] = await db
      .select({
        number: lotsTable.number,
        floor: lotsTable.floor,
        tantiemes: lotsTable.tantiemes,
        titreFoncier: lotsTable.titreFoncier,
        ownerId: lotsTable.ownerId,
      })
      .from(lotsTable)
      .where(eq(lotsTable.id, lotId));
    if (!lotRow) return {};

    let memberName = "";
    if (lotRow.ownerId) {
      const [m] = await db
        .select({ name: membersTable.name })
        .from(membersTable)
        .where(eq(membersTable.id, lotRow.ownerId));
      memberName = m?.name ?? "";
    }

    // All appels for this lot
    const allAppels = await db
      .select({
        amount: appelsDeFondsTable.amount,
        amountPaid: appelsDeFondsTable.amountPaid,
        status: appelsDeFondsTable.status,
        period: appelsDeFondsTable.period,
        paidDate: appelsDeFondsTable.paidDate,
      })
      .from(appelsDeFondsTable)
      .where(
        and(
          eq(appelsDeFondsTable.lotId, lotId),
          sql`${appelsDeFondsTable.status} <> 'cancelled'`,
        ),
      );

    const periodeAppels = periode
      ? allAppels.filter((a) => a.period?.includes(periode))
      : allAppels;
    const useAppels = periodeAppels.length > 0 ? periodeAppels : allAppels;

    const totalPaid = moneySum(useAppels.map((a) => a.amountPaid));
    const totalCharged = useAppels.reduce(
      (s, a) => s + Number(a.amount ?? 0),
      0,
    );
    const hasOverdue = useAppels.some((a) => a.status === "overdue");
    const inGoodStanding = !hasOverdue && totalCharged <= totalPaid;
    const lastPaid = useAppels
      .filter((a) => a.status === "paid" && a.paidDate)
      .sort((a, b) =>
        (b.paidDate ?? "").localeCompare(a.paidDate ?? ""),
      )[0]?.paidDate;

    const fmt = (n: number) => n.toLocaleString("fr-MA");
    // Structured payment history JSON — used by the attestation PDF template
    const paymentHistoryJson = JSON.stringify(
      useAppels
        .sort((a, b) => (a.period ?? "").localeCompare(b.period ?? ""))
        .map((a) => ({
          period: a.period ?? "—",
          amount: Number(a.amount ?? 0),
          amountPaid: Number(a.amountPaid ?? 0),
          status: a.status ?? "pending",
          paidDate: a.paidDate ?? null,
        })),
    );
    return {
      memberName,
      _lotNumber: lotRow.number ?? "",
      _lotFloor: lotRow.floor != null ? String(lotRow.floor) : "",
      _lotTantiemes: lotRow.tantiemes
        ? `${Number(lotRow.tantiemes)} / 10 000`
        : "",
      _lotTitreFoncier: lotRow.titreFoncier ?? "",
      montant: fmt(totalPaid),
      _totalCharged: fmt(totalCharged),
      _paiementStatus: inGoodStanding
        ? "EN RÈGLE"
        : "ATTENTION — CHARGES EN COURS",
      _lastPaidDate: lastPaid ?? "",
      _appelCount: String(useAppels.length),
      _paymentHistoryJson: paymentHistoryJson,
    };
  } catch {
    return {};
  }
}

export async function regenerateDocumentWithSignatures(
  doc: {
    title: string;
    content: string | null;
    templateId: string | null;
    syndicateId: string | null;
    documentNumber: string | null;
    language: string;
    version: number | null;
    verificationToken: string | null;
  },
  params: GenerationParams,
  signatures: InlineSignatureInfo[],
): Promise<string | null> {
  const template = doc.templateId as DocumentTemplate;
  if (!template) return null;

  const syndicateId = doc.syndicateId ?? null;
  const docLanguage = (doc.language as DocumentLanguage) ?? "fr";

  const [syndInfo, property, officeHolders] = await Promise.all([
    getSyndicateInfo(syndicateId),
    getPropertyInfo(syndicateId, params.buildingId ?? null),
    getOfficeHolders(syndicateId),
  ]);

  const entityLoads: Promise<Record<string, string>>[] = [];
  if (params.meetingId) entityLoads.push(getMeetingData(params.meetingId));
  if (params.appelDeFondsId)
    entityLoads.push(getAppelDeFondsData(params.appelDeFondsId));
  if (params.budgetId) entityLoads.push(getBudgetData(params.budgetId));
  if (params.lotId || params.memberId) {
    entityLoads.push(
      getLotMemberData(params.lotId ?? undefined, params.memberId ?? undefined),
    );
  }
  if (params.invoiceId) entityLoads.push(getInvoiceData(params.invoiceId));
  if (template === "attestation_paiement" && params.lotId) {
    entityLoads.push(
      getAttestationPaiementData(
        params.lotId,
        params.formFields?.periode ?? null,
        syndicateId,
      ),
    );
  }
  const isFinancialTemplate = [
    "appel_de_fonds",
    "facture",
    "rapport_financier",
  ].includes(template);
  if (isFinancialTemplate) {
    const kpiYear = params.formFields?.exercice
      ? parseInt(params.formFields.exercice)
      : null;
    entityLoads.push(
      getFinancialDashboardData(
        syndicateId,
        params.buildingId ?? null,
        kpiYear,
      ),
    );
  }

  const entityResults = await Promise.all(entityLoads);
  const entityData: Record<string, string> = Object.assign(
    {},
    ...entityResults,
  );

  if (officeHolders?.treasurer?.fullName && !entityData.etabliPar) {
    entityData.etabliPar = officeHolders.treasurer.fullName;
  }
  if (officeHolders?.president?.fullName && !entityData.approuvePar) {
    entityData.approuvePar = officeHolders.president.fullName;
  }

  const verificationUrl = doc.verificationToken
    ? buildVerifyUrl(doc.verificationToken)
    : undefined;

  const generated = await generateAndUploadDocument(template, {
    title: doc.title,
    content: doc.content ?? undefined,
    syndicate: syndInfo,
    property,
    officeHolders,
    memberName: entityData.memberName || params.memberName || undefined,
    documentNumber: doc.documentNumber ?? undefined,
    docStatus: "signed",
    version: `v${doc.version ?? 1}.0`,
    language: docLanguage,
    verificationUrl,
    signatures,
    ...entityData,
    ...(params.formFields ?? {}),
  });

  return generated.fileUrl ?? null;
}

// ─── Document regeneration with inline signatures ─────────────────────────────
// Called after signing so every signer's SVG trace appears inline in the document
// body — not just on an appended page. Requires generationParams saved at creation.
export interface GenerationParams {
  buildingId?: string | null;
  meetingId?: string | null;
  lotId?: string | null;
  memberId?: string | null;
  appelDeFondsId?: string | null;
  budgetId?: string | null;
  invoiceId?: string | null;
  memberName?: string | null;
  formFields?: Record<string, string>;
}

// Canonical signing order per template — defines who must sign and in
// which order. Used by both GET /documents/:id/signers and the sign endpoint
// to surface "who's turn is it?" without requiring a per-document config.
export const TEMPLATE_SIGNING_ORDER: Record<
  string,
  Array<{ order: number; role: string; label: string }>
> = {
  pv: [
    { order: 1, role: "syndicate_admin", label: "Secrétaire de séance" },
    { order: 2, role: "syndicate_admin", label: "Président" },
  ],
  convocation: [{ order: 1, role: "syndicate_admin", label: "Secrétaire" }],
  // ── V1 production templates ──────────────────────────────────────────────────
  attestation: [
    { order: 1, role: "syndicate_admin", label: "Président" },
    { order: 2, role: "syndicate_admin", label: "Secrétaire" },
  ],
  attestation_paiement: [
    { order: 1, role: "syndicate_admin", label: "Trésorier" },
    { order: 2, role: "syndicate_admin", label: "Président" },
  ],
  attestation_residence: [
    { order: 1, role: "syndicate_admin", label: "Président" },
  ],
  attestation_propriete: [
    { order: 1, role: "syndicate_admin", label: "Président" },
    { order: 2, role: "syndicate_admin", label: "Secrétaire" },
  ],
  mise_en_demeure: [
    { order: 1, role: "syndicate_admin", label: "Président" },
    { order: 2, role: "syndicate_admin", label: "Secrétaire" },
  ],
  appel_de_fonds: [
    { order: 1, role: "syndicate_admin", label: "Trésorier" },
    { order: 2, role: "syndicate_admin", label: "Président" },
  ],
  facture: [{ order: 1, role: "syndicate_admin", label: "Trésorier" }],
  rapport_financier: [
    { order: 1, role: "syndicate_admin", label: "Trésorier" },
    { order: 2, role: "syndicate_admin", label: "Président" },
  ],
  contrat: [
    { order: 1, role: "syndicate_admin", label: "Président" },
    { order: 2, role: "syndicate_admin", label: "Secrétaire" },
  ],
  decision: [{ order: 1, role: "syndicate_admin", label: "Président" }],
};
