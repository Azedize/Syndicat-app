import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Precise monetary type — numeric(12,2) avoids floating-point errors in financial calculations
const money = (col: string) => numeric(col, { precision: 12, scale: 2 });

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

const createdAt = () => timestamp("created_at").defaultNow();

// ─── Syndicates ─────────────────────────────────────────────────────────────

export const syndicatesTable = pgTable("syndicates", {
  id: id(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
  sector: text("sector"),
  region: text("region"),
  adminId: text("admin_id"),
  status: text("status").default("active"),
  membersCount: integer("members_count").default(0),
  // Contact
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  country: text("country").default("Maroc"),
  // Legal (Dahir 1-57-119)
  legalForm: text("legal_form"),
  registrationNumber: text("registration_number"),
  iceNumber: text("ice_number"),
  rcNumber: text("rc_number"),
  foundingDate: text("founding_date"),
  mission: text("mission"),
  // Branding
  logoColor: text("logo_color").default("#7c3aed"),
  logoUrl: text("logo_url"),
  // Finance defaults
  cotisationAmount: money("cotisation_amount"),
  cotisationCycle: text("cotisation_cycle").default("monthly"),
  // Legal escalation threshold (months of non-payment before legal action)
  legalThresholdMonths: integer("legal_threshold_months").default(18),
  createdAt: createdAt(),
});

// ─── Users & Auth ───────────────────────────────────────────────────────────

export const usersTable = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    cin: text("cin"),                    // Moroccan CIN (Carte d'Identité Nationale)
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "set null" }),
    pushToken: text("push_token"),
    profession: text("profession"),
    avatar: text("avatar"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("users_syndicate_id_idx").on(t.syndicateId)],
);

export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("refresh_tokens_user_id_idx").on(t.userId)],
);

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_tokens_user_id_idx").on(t.userId)],
);

// ─── Members ────────────────────────────────────────────────────────────────

export const membersTable = pgTable(
  "members",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").default(""),
    profession: text("profession").default(""),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    status: text("status").default("active"),
    cotisationStatus: text("cotisation_status").default("pending"),
    joinDate: text("join_date"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("members_email_unique_idx").on(t.email),
    index("members_syndicate_id_idx").on(t.syndicateId),
    index("members_status_idx").on(t.status),
  ],
);

// ─── Real Estate: Buildings, Lots, Tenants ──────────────────────────────────

export const buildingsTable = pgTable(
  "buildings",
  {
    id: id(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city").default("Casablanca"),
    type: text("type").default("residential"),
    totalFloors: integer("total_floors").default(0),
    totalLots: integer("total_lots").default(0),
    constructionYear: integer("construction_year"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    adminId: text("admin_id").references(() => usersTable.id, { onDelete: "set null" }),
    bankAccount: text("bank_account"),
    registrationNumber: text("registration_number"),
    description: text("description"),
    status: text("status").default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("buildings_syndicate_id_idx").on(t.syndicateId)],
);

export const lotsTable = pgTable(
  "lots",
  {
    id: id(),
    number: text("number").notNull(),
    type: text("type").default("appartement"),
    floor: integer("floor").default(0),
    surfaceM2: money("surface_m2"),
    // Titre foncier (cadastral reference — required for legal procedures, Art. 2 Law 18-00)
    titreFoncier: text("titre_foncier"),
    surfaceCadastrale: money("surface_cadastrale"),
    tantiemes: integer("tantiemes").default(0),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").references(() => membersTable.id, { onDelete: "set null" }),
    tenantId: text("tenant_id"),
    status: text("status").default("occupied"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [
    index("lots_building_id_idx").on(t.buildingId),
    index("lots_owner_id_idx").on(t.ownerId),
  ],
);

export const tenantsTable = pgTable(
  "tenants",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    lotId: text("lot_id").references(() => lotsTable.id, { onDelete: "set null" }),
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "cascade" }),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    leaseStart: text("lease_start"),
    leaseEnd: text("lease_end"),
    monthlyRent: money("monthly_rent"),
    depositAmount: money("deposit_amount"),
    status: text("status").default("active"),
    emergencyContact: text("emergency_contact"),
    emergencyPhone: text("emergency_phone"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("tenants_syndicate_id_idx").on(t.syndicateId),
    index("tenants_building_id_idx").on(t.buildingId),
    index("tenants_lot_id_idx").on(t.lotId),
    index("tenants_status_idx").on(t.status),
  ],
);

// ─── Budgets & Charges ──────────────────────────────────────────────────────

export const budgetsTable = pgTable(
  "budgets",
  {
    id: id(),
    year: integer("year").notNull(),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    totalAmount: money("total_amount").default("0"),
    chargesAmount: money("charges_amount").default("0"),
    fondsReserve: money("fonds_reserve").default("0"),
    status: text("status").default("draft"),
    notes: text("notes"),
    createdBy: text("created_by"),
    votedAt: timestamp("voted_at"),
    meetingId: text("meeting_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("budgets_building_id_idx").on(t.buildingId),
    index("budgets_status_idx").on(t.status),
  ],
);

export const budgetLinesTable = pgTable(
  "budget_lines",
  {
    id: id(),
    budgetId: text("budget_id").notNull().references(() => budgetsTable.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    label: text("label").notNull(),
    amountAnnual: money("amount_annual").default("0"),
    amountQ1: money("amount_q1"),
    amountQ2: money("amount_q2"),
    amountQ3: money("amount_q3"),
    amountQ4: money("amount_q4"),
    prestataireId: text("prestataire_id").references(() => prestatairesTable.id, { onDelete: "set null" }),
  },
  (t) => [
    index("budget_lines_budget_id_idx").on(t.budgetId),
    index("budget_lines_prestataire_id_idx").on(t.prestataireId),
  ],
);

export const appelsDeFondsTable = pgTable(
  "appels_de_fonds",
  {
    id: id(),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    budgetId: text("budget_id").references(() => budgetsTable.id, { onDelete: "set null" }),
    lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").references(() => membersTable.id, { onDelete: "set null" }),
    period: text("period").notNull(),
    type: text("type").default("charges_courantes"),
    amount: money("amount").notNull(),
    dueDate: text("due_date"),
    // status: pending | pending_validation | paid | overdue | rejected
    status: text("status").default("pending"),
    paymentMethod: text("payment_method"),
    proofUrl: text("proof_url"),
    notes: text("notes"),
    paidDate: text("paid_date"),
    receiptNumber: text("receipt_number"),
    rejectionReason: text("rejection_reason"),
    validatedBy: text("validated_by"),
    validatedAt: timestamp("validated_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("appels_building_id_idx").on(t.buildingId),
    index("appels_lot_id_idx").on(t.lotId),
    index("appels_owner_id_idx").on(t.ownerId),
    index("appels_status_idx").on(t.status),
    index("appels_due_date_idx").on(t.dueDate),
    // Composite for financial report queries (building × period)
    index("appels_building_period_idx").on(t.buildingId, t.period),
  ],
);

// ─── Finance ────────────────────────────────────────────────────────────────

export const transactionsTable = pgTable(
  "transactions",
  {
    id: id(),
    type: text("type").notNull(),
    amount: money("amount").notNull(),
    label: text("label").notNull(),
    date: text("date").notNull(),
    status: text("status").default("paid"),
    memberId: text("member_id").references(() => usersTable.id, { onDelete: "set null" }),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    proofUrl: text("proof_url"),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_syndicate_id_idx").on(t.syndicateId),
    index("transactions_member_id_idx").on(t.memberId),
    index("transactions_status_idx").on(t.status),
    // Composite for financial dashboard queries (syndicate × type × date)
    index("transactions_syndicate_type_date_idx").on(t.syndicateId, t.type, t.createdAt),
  ],
);

export const salaryRecordsTable = pgTable(
  "salary_records",
  {
    id: id(),
    employee: text("employee").notNull(),
    role: text("role").notNull(),
    amount: money("amount").notNull(),
    month: text("month").notNull(),
    status: text("status").default("pending"),
    paidDate: text("paid_date"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("salary_records_syndicate_id_idx").on(t.syndicateId)],
);

export const caisseEntriesTable = pgTable(
  "caisse_entries",
  {
    id: id(),
    label: text("label").notNull(),
    amount: money("amount").notNull(),
    type: text("type").notNull(),
    date: text("date").notNull(),
    category: text("category").default(""),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    balance: money("balance"),
    createdAt: createdAt(),
  },
  (t) => [index("caisse_entries_syndicate_id_idx").on(t.syndicateId)],
);

export const invoicesTable = pgTable(
  "invoices",
  {
    id: id(),
    reference: text("reference").notNull(),
    type: text("type").default("facture"),
    recipient: text("recipient").notNull(),
    date: text("date").notNull(),
    dueDate: text("due_date").notNull(),
    status: text("status").default("draft"),
    amount: money("amount").default("0"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "set null" }),
    proofUrl: text("proof_url"),
    createdAt: createdAt(),
  },
  (t) => [index("invoices_syndicate_id_idx").on(t.syndicateId)],
);

export const invoiceItemsTable = pgTable(
  "invoice_items",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    quantity: money("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
  },
  (t) => [index("invoice_items_invoice_id_idx").on(t.invoiceId)],
);

export const bonsLivraisonTable = pgTable(
  "bons_livraison",
  {
    id: id(),
    reference: text("reference").notNull(),
    recipient: text("recipient").notNull(),
    date: text("date").notNull(),
    type: text("type").default("sortie"),
    total: money("total").default("0"),
    status: text("status").default("draft"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("bons_livraison_syndicate_id_idx").on(t.syndicateId)],
);

export const bonItemsTable = pgTable(
  "bon_items",
  {
    id: id(),
    bonId: text("bon_id").notNull().references(() => bonsLivraisonTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    quantity: money("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
  },
  (t) => [index("bon_items_bon_id_idx").on(t.bonId)],
);

// ─── Prestataires, Contrats, Travaux, Sinistres ────────────────────────────

export const prestatairesTable = pgTable(
  "prestataires",
  {
    id: id(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    ice: text("ice"),
    rc: text("rc"),
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    status: text("status").default("active"),
    rating: money("rating"),
    evaluationsCount: integer("evaluations_count").default(0),
    notes: text("notes"),
    documentUrl: text("document_url"),
    createdAt: createdAt(),
  },
  (t) => [
    index("prestataires_syndicate_id_idx").on(t.syndicateId),
    index("prestataires_building_id_idx").on(t.buildingId),
    index("prestataires_status_idx").on(t.status),
  ],
);

export const contratsPrestatairesTable = pgTable(
  "contrats_prestataires",
  {
    id: id(),
    prestataireId: text("prestataire_id").notNull().references(() => prestatairesTable.id, { onDelete: "cascade" }),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    monthlyAmount: money("monthly_amount"),
    annualAmount: money("annual_amount"),
    // status: active | expired | suspended | terminated | renewed
    status: text("status").default("active"),
    autoRenew: boolean("auto_renew").default(false),
    documentUrl: text("document_url"),
    // JSON array of day-thresholds (60/30/7) already notified, e.g. "[60,30]"
    notifiedThresholds: text("notified_thresholds").default("[]"),
    renewedFromContractId: text("renewed_from_contract_id"),
    terminatedAt: timestamp("terminated_at"),
    terminationReason: text("termination_reason"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("contrats_prestataires_prestataire_id_idx").on(t.prestataireId),
    index("contrats_prestataires_building_id_idx").on(t.buildingId),
    index("contrats_prestataires_status_idx").on(t.status),
    index("contrats_prestataires_end_date_idx").on(t.endDate),
  ],
);

export const travauxTable = pgTable(
  "travaux",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").default("entretien"),
    priority: text("priority").default("normal"),
    // status: reported | assigned | in_progress | pending_validation | completed | cancelled
    status: text("status").default("reported"),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    lotId: text("lot_id"),
    prestataireId: text("prestataire_id").references(() => prestatairesTable.id, { onDelete: "set null" }),
    reportedById: text("reported_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    reportedByName: text("reported_by_name"),
    assignedById: text("assigned_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at"),
    estimatedAmount: money("estimated_amount"),
    actualAmount: money("actual_amount"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    completedAt: timestamp("completed_at"),
    // Intervention proof — required before validation/payment
    reportUrl: text("report_url"),
    photoUrls: text("photo_urls").default("[]"),
    invoiceUrl: text("invoice_url"),
    invoiceAmount: money("invoice_amount"),
    validatedById: text("validated_by_id"),
    validatedByName: text("validated_by_name"),
    validatedAt: timestamp("validated_at"),
    transactionId: text("transaction_id"),
    responseTimeMinutes: integer("response_time_minutes"),
    resolutionTimeMinutes: integer("resolution_time_minutes"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("travaux_building_id_idx").on(t.buildingId),
    index("travaux_status_idx").on(t.status),
    index("travaux_priority_idx").on(t.priority),
    index("travaux_prestataire_id_idx").on(t.prestataireId),
  ],
);

export const prestataireEvaluationsTable = pgTable(
  "prestataire_evaluations",
  {
    id: id(),
    prestataireId: text("prestataire_id")
      .notNull()
      .references(() => prestatairesTable.id, { onDelete: "cascade" }),
    travauxId: text("travaux_id"),
    syndicateId: text("syndicate_id"),
    quality: integer("quality").notNull(),
    speed: integer("speed").notNull(),
    communication: integer("communication").notNull(),
    price: integer("price").notNull(),
    average: money("average").notNull(),
    comment: text("comment"),
    ratedById: text("rated_by_id"),
    ratedByName: text("rated_by_name"),
    createdAt: createdAt(),
  },
  (t) => [
    index("prestataire_evaluations_prestataire_id_idx").on(t.prestataireId),
  ],
);

export const sinistresTable = pgTable(
  "sinistres",
  {
    id: id(),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    lotId: text("lot_id"),
    type: text("type").notNull(),
    description: text("description").notNull(),
    date: text("date").notNull(),
    estimatedAmount: money("estimated_amount"),
    indemnisedAmount: money("indemnised_amount"),
    claimNumber: text("claim_number"),
    // status: declared | under_review | assigned | in_progress | resolved | closed
    status: text("status").default("declared"),
    urgency: text("urgency").default("normal"), // low | normal | high | critical
    imageUrls: text("image_urls").default("[]"), // JSON array of photo URLs
    contractorId: text("contractor_id"),
    resolvedAt: timestamp("resolved_at"),
    resolutionNote: text("resolution_note"),
    invoiceUrl: text("invoice_url"),
    reportedById: text("reported_by_id"),
    reportedByName: text("reported_by_name"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sinistres_building_id_idx").on(t.buildingId),
    index("sinistres_status_idx").on(t.status),
    index("sinistres_urgency_idx").on(t.urgency),
  ],
);

// ─── Elections ──────────────────────────────────────────────────────────────

export const electionsTable = pgTable(
  "elections",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").default(""),
    // election_type: president | board | financial_committee | maintenance_committee | building_representative | special
    electionType: text("election_type").default("special"),
    // Scope: null = whole syndicate, set = single building
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    // voting_method: simple_majority | absolute_majority
    votingMethod: text("voting_method").default("simple_majority"),
    quorumPercent: integer("quorum_percent").default(50),
    majorityPercent: integer("majority_percent").default(50),
    // Number of seats to fill (board/committee elections can elect several winners)
    seatsCount: integer("seats_count").default(1),
    // Tenants normally cannot vote (Loi 18-00) unless explicitly authorized for this election
    tenantsCanVote: boolean("tenants_can_vote").default(false),
    // status: draft | candidacy_open | campaign | open | closed | quorum_failed | contested | cancelled | completed
    status: text("status").default("draft"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    candidacyStart: text("candidacy_start"),
    candidacyEnd: text("candidacy_end"),
    // Cached at close time — snapshot of eligible/participant counts used for the quorum calc
    eligibleCount: integer("eligible_count"),
    participantCount: integer("participant_count").default(0),
    quorumReached: boolean("quorum_reached"),
    resultsPublishedAt: timestamp("results_published_at"),
    cancelReason: text("cancel_reason"),
    contestReason: text("contest_reason"),
    isEmergency: boolean("is_emergency").default(false),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    // Fixed mandate length for winners of this election (months). Null = indefinite mandate
    // (no auto-expiry) — matches historical behavior for elections created before this field existed.
    mandateDurationMonths: integer("mandate_duration_months"),
    // Manually recorded spoiled/invalid ballots (e.g. from a hybrid paper-assisted tally).
    // Counted toward participation/quorum but never toward any candidate's vote count.
    invalidVotesCount: integer("invalid_votes_count").default(0),
    // Reminder thresholds (in days-before-close) already notified, e.g. ["3","1"] — prevents
    // the closing-soon scheduler from re-notifying voters on every run. Mirrors the
    // notifiedThresholds pattern used by contrats_prestataires expiry reminders.
    remindersSent: text("reminders_sent").default("[]"),
    createdAt: createdAt(),
  },
  (t) => [
    index("elections_syndicate_id_idx").on(t.syndicateId),
    index("elections_status_idx").on(t.status),
  ],
);

export const candidatesTable = pgTable(
  "candidates",
  {
    id: id(),
    electionId: text("election_id").notNull().references(() => electionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    post: text("post").notNull(),
    apartmentNumber: text("apartment_number"),
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    photo: text("photo"),
    bio: text("bio").default(""),
    motivationLetter: text("motivation_letter").default(""),
    program: text("program").default(""),
    // status: submitted | pending_validation | approved | rejected | withdrawn
    status: text("status").default("approved"),
    rejectionReason: text("rejection_reason"),
    withdrawnAt: timestamp("withdrawn_at"),
    votes: integer("votes").default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("candidates_election_id_idx").on(t.electionId),
    index("candidates_status_idx").on(t.status),
  ],
);

// Ballot secrecy: "who voted" and "what they voted for" are deliberately split across
// two tables with no shared key, so no query — not even one run directly against the
// database by a super_admin — can join a voter's identity to their choice of candidate.
//
//   voteReceiptsTable — proof of participation only (no candidateId at all).
//   votesTable        — the anonymous ballot itself (no voterId at all).
//
// Device/IP are kept on the anonymous ballot for fraud-pattern detection (e.g. many
// ballots from one IP) — this does not deanonymize anyone since it isn't linked to voterId.
export const voteReceiptsTable = pgTable(
  "vote_receipts",
  {
    id: id(),
    electionId: text("election_id").notNull().references(() => electionsTable.id, { onDelete: "cascade" }),
    voterId: text("voter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    // Set when a proxy holder cast this vote on the voter's behalf (Loi 18-00 pouvoir).
    // Still no link to which candidate was chosen — only that a ballot was cast.
    castByProxyId: text("cast_by_proxy_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    // Prevent duplicate participation: one receipt per voter per election
    uniqueIndex("vote_receipts_election_voter_unique_idx").on(t.electionId, t.voterId),
    index("vote_receipts_election_id_idx").on(t.electionId),
  ],
);

export const votesTable = pgTable(
  "votes",
  {
    id: id(),
    electionId: text("election_id").notNull().references(() => electionsTable.id, { onDelete: "cascade" }),
    // Null candidateId = abstention. Intentionally no voterId column — see comment above.
    candidateId: text("candidate_id").references(() => candidatesTable.id, { onDelete: "cascade" }),
    isAbstention: boolean("is_abstention").default(false),
    // Kept for anomaly detection only (e.g. ballot-stuffing patterns) — cannot be
    // joined back to a specific voter, so this does not compromise ballot secrecy.
    device: text("device"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [
    index("votes_election_id_idx").on(t.electionId),
  ],
);

// ─── Election Proxies (Loi 18-00 — a member may give a written "pouvoir" to
// another eligible voter for a given election, mirroring ag_proxies for AG meetings) ──

export const electionProxiesTable = pgTable(
  "election_proxies",
  {
    id: id(),
    electionId: text("election_id").notNull().references(() => electionsTable.id, { onDelete: "cascade" }),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    // Voter delegating their vote away
    grantorId: text("grantor_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    grantorName: text("grantor_name").notNull(),
    // Voter who will cast the delegated vote
    granteeId: text("grantee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    granteeName: text("grantee_name").notNull(),
    // status: active | revoked | used (used = the grantee has already cast the delegated vote)
    status: text("status").notNull().default("active"),
    documentUrl: text("document_url"),
    createdAt: createdAt(),
  },
  (t) => [
    index("election_proxies_election_id_idx").on(t.electionId),
    index("election_proxies_grantee_id_idx").on(t.granteeId),
    // One active proxy per grantor per election
    uniqueIndex("election_proxies_election_grantor_idx").on(t.electionId, t.grantorId),
  ],
);

export const electionQuestionsTable = pgTable(
  "election_questions",
  {
    id: id(),
    electionId: text("election_id").notNull().references(() => electionsTable.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id").notNull().references(() => candidatesTable.id, { onDelete: "cascade" }),
    askedBy: text("asked_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    askedByName: text("asked_by_name").notNull(),
    question: text("question").notNull(),
    answer: text("answer"),
    answeredAt: timestamp("answered_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("election_questions_election_id_idx").on(t.electionId),
    index("election_questions_candidate_id_idx").on(t.candidateId),
  ],
);

// ─── Meetings & AG ──────────────────────────────────────────────────────────

export const meetingsTable = pgTable(
  "meetings",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    date: text("date").notNull(),
    time: text("time"),
    location: text("location"),
    type: text("type").default("general"),
    description: text("description"),
    agenda: text("agenda"),
    status: text("status").default("scheduled"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("meetings_syndicate_id_idx").on(t.syndicateId),
    index("meetings_date_idx").on(t.date),
    index("meetings_status_idx").on(t.status),
  ],
);

export const meetingAttendeesTable = pgTable(
  "meeting_attendees",
  {
    id: id(),
    meetingId: text("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("meeting_attendees_meeting_id_idx").on(t.meetingId)],
);

export const agResolutionsTable = pgTable(
  "ag_resolutions",
  {
    id: id(),
    meetingId: text("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
    buildingId: text("building_id"),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    requiredMajority: text("required_majority").default("simple"),
    tantiemesFor: integer("tantiemes_for").default(0),
    tantiemesAgainst: integer("tantiemes_against").default(0),
    tantiemesAbstain: integer("tantiemes_abstain").default(0),
    result: text("result").default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("ag_resolutions_meeting_id_idx").on(t.meetingId)],
);

// ─── AG Proxies (Law 18-00 Art. 20 — written proxy / pouvoir) ────────────────
// A grantor delegates their vote to a grantee for a specific AG meeting.

export const agProxiesTable = pgTable(
  "ag_proxies",
  {
    id: id(),
    meetingId: text("meeting_id").notNull().references(() => meetingsTable.id, { onDelete: "cascade" }),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    // Member giving the proxy
    grantorId: text("grantor_id").references(() => membersTable.id, { onDelete: "cascade" }),
    grantorName: text("grantor_name").notNull(),
    // Member receiving the proxy
    granteeId: text("grantee_id").references(() => membersTable.id, { onDelete: "set null" }),
    granteeName: text("grantee_name").notNull(),
    // status: pending | accepted | revoked
    status: text("status").notNull().default("pending"),
    documentUrl: text("document_url"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ag_proxies_meeting_id_idx").on(t.meetingId),
    index("ag_proxies_grantor_id_idx").on(t.grantorId),
    index("ag_proxies_grantee_id_idx").on(t.granteeId),
    // One proxy per grantor per meeting
    uniqueIndex("ag_proxies_meeting_grantor_idx").on(t.meetingId, t.grantorId),
  ],
);

// ─── Union Actions ──────────────────────────────────────────────────────────

export const unionActionsTable = pgTable(
  "union_actions",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").default(""),
    type: text("type").notNull(),
    status: text("status").default("planned"),
    date: text("date").notNull(),
    location: text("location"),
    organizer: text("organizer").notNull(),
    participantsTarget: integer("participants_target").default(0),
    demands: text("demands").default("[]"),
    updates: text("updates").default("[]"),
    tags: text("tags").default("[]"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("union_actions_syndicate_id_idx").on(t.syndicateId),
    index("union_actions_status_idx").on(t.status),
    index("union_actions_type_idx").on(t.type),
  ],
);

export const actionSupportsTable = pgTable(
  "action_supports",
  {
    id: id(),
    actionId: text("action_id").notNull().references(() => unionActionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("action_supports_unique_idx").on(t.actionId, t.userId),
    index("action_supports_action_id_idx").on(t.actionId),
  ],
);

export const actionParticipantsTable = pgTable(
  "action_participants",
  {
    id: id(),
    actionId: text("action_id").notNull().references(() => unionActionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    userName: text("user_name"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("action_participants_unique_idx").on(t.actionId, t.userId),
    index("action_participants_action_id_idx").on(t.actionId),
  ],
);

// ─── Publications & Announcements ──────────────────────────────────────────

export const publicationsTable = pgTable(
  "publications",
  {
    id: id(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    category: text("category").default(""),
    pinned: boolean("pinned").default(false),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => usersTable.id, { onDelete: "set null" }),
    authorName: text("author_name"),
    likes: integer("likes").default(0),
    comments: integer("comments").default(0),
    createdAt: createdAt(),
  },
  (t) => [index("publications_syndicate_id_idx").on(t.syndicateId)],
);

export const publicationLikesTable = pgTable(
  "publication_likes",
  {
    publicationId: text("publication_id").notNull().references(() => publicationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.userId] })],
);

export const publicationCommentsTable = pgTable("publication_comments", {
  id: id(),
  publicationId: text("publication_id").notNull().references(() => publicationsTable.id, { onDelete: "cascade" }),
  authorId: text("author_id"),
  authorName: text("author_name"),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  userName: text("user_name"),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

export const announcementsTable = pgTable("announcements", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  priority: text("priority").default("normal"),
  audience: text("audience").default("all"),
  pinned: boolean("pinned").default(false),
  syndicateId: text("syndicate_id"),
  authorId: text("author_id"),
  author: text("author"),
  createdAt: createdAt(),
});

// ─── Documents ──────────────────────────────────────────────────────────────

export const documentsTable = pgTable(
  "documents",
  {
    id: id(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    content: text("content"),
    // Lifecycle status — must progress through the workflow state machine
    status: text("status").default("draft"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    size: text("size"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").defaultNow(),
    // Storage — path returned by GCS upload (/objects/documents/<uuid>/<file>)
    fileUrl: text("file_url"),
    // Sequential document reference number
    documentNumber: text("document_number"),
    // Which template was used to generate this doc
    templateId: text("template_id"),
    // Document version counter (incremented on each PUT update)
    version: integer("version").default(1),
    // Signature tracking
    signedAt: timestamp("signed_at"),
    signedBy: text("signed_by").references(() => usersTable.id, { onDelete: "set null" }),
    // Publication & archival timestamps
    publishedAt: timestamp("published_at"),
    archivedAt: timestamp("archived_at"),
    // Soft delete — documents are NEVER hard-deleted for legal retention
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => usersTable.id, { onDelete: "set null" }),
    // Legal retention — computed at creation from category/template (see lib/retention.ts).
    // Purge job never deletes a document before this date.
    retentionUntil: timestamp("retention_until"),
    // Set by the automatic purge job when it archives an expired-but-published document.
    autoArchived: boolean("auto_archived").default(false).notNull(),
    // ── Multilingual documents ──────────────────────────────────────────────
    // Language the PDF was generated in. Chosen explicitly by the requester —
    // never silently defaulted without a user choice at the API boundary.
    language: text("language").default("fr").notNull(),
    // ── Rejection workflow ──────────────────────────────────────────────────
    rejectedAt: timestamp("rejected_at"),
    rejectedBy: text("rejected_by").references(() => usersTable.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    // ── Approval workflow (spec's "Approved" state == internal "validated") ──
    approvedAt: timestamp("approved_at"),
    approvedBy: text("approved_by").references(() => usersTable.id, { onDelete: "set null" }),
    // ── Business expiration (distinct from legal retentionUntil) ────────────
    // e.g. contract/mandate validity end date. When passed, the expiry job
    // auto-transitions status to "expired" and fires notifications.
    expiresAt: timestamp("expires_at"),
    // Smallest reminder bucket (30/15/7/1) already notified for, so the expiry
    // job never re-sends the same threshold notification twice.
    expiryNotifiedBucket: integer("expiry_notified_bucket"),
    // ── QR verification ──────────────────────────────────────────────────────
    // Opaque public token embedded in the QR code — distinct from documentNumber
    // so the sequential ref isn't exposed/guessable via the public verify page.
    verificationToken: text("verification_token"),
    // When a new version supersedes this exact document (see documentVersionsTable
    // for full history), this points at the replacement so verification can report
    // status "replaced" instead of "valid".
    supersededByDocumentId: text("superseded_by_document_id"),
  },
  (t) => [
    index("documents_syndicate_id_idx").on(t.syndicateId),
    index("documents_category_idx").on(t.category),
    index("documents_status_idx").on(t.status),
    index("documents_document_number_idx").on(t.documentNumber),
    index("documents_retention_until_idx").on(t.retentionUntil),
    index("documents_is_deleted_idx").on(t.isDeleted),
    index("documents_expires_at_idx").on(t.expiresAt),
    uniqueIndex("documents_verification_token_uq").on(t.verificationToken),
  ],
);

// Full version history for documents — snapshotted BEFORE every content/status-changing
// update so old content/files are never lost. Enables version compare + restore + audit trail.
export const documentVersionsTable = pgTable(
  "document_versions",
  {
    id: id(),
    documentId: text("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    status: text("status"),
    fileUrl: text("file_url"),
    language: text("language"),
    modifiedBy: text("modified_by").references(() => usersTable.id, { onDelete: "set null" }),
    modifiedAt: timestamp("modified_at").defaultNow().notNull(),
    // Why this version was created (e.g. "Correction du montant", "Restauration v2")
    changeReason: text("change_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("document_versions_document_id_idx").on(t.documentId),
    uniqueIndex("document_versions_document_version_uq").on(t.documentId, t.versionNumber),
  ],
);

// Atomic per-syndicate/prefix/year counters backing sequential document numbers
// like REG-2026-0001, PV-2026-0001, FIN-2026-0001. One row per (syndicateId, prefix, year);
// `currentValue` is incremented via INSERT ... ON CONFLICT DO UPDATE for atomicity.
export const documentSequencesTable = pgTable(
  "document_sequences",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull(),
    prefix: text("prefix").notNull(),
    year: integer("year").notNull(),
    currentValue: integer("current_value").notNull().default(0),
  },
  (t) => [
    uniqueIndex("document_sequences_syndicate_prefix_year_uq").on(t.syndicateId, t.prefix, t.year),
  ],
);

export const documentSignaturesTable = pgTable(
  "document_signatures",
  {
    id: id(),
    documentId: text("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
    signedBy: text("signed_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    signedAt: timestamp("signed_at").notNull().defaultNow(),
    signerRole: text("signer_role").notNull(),
    syndicateId: text("syndicate_id"),
    ipAddress: text("ip_address"),
    // Raw signature pad data (SVG markup produced by the mobile signature pad,
    // embeddable directly in generated PDFs via pdfmake's `svg` node)
    signatureData: text("signature_data"),
    // Position in the multi-signature sequence for this document (1-based).
    signatureOrder: integer("signature_order").notNull().default(1),
    // Denormalized name snapshot at signing time — the PDF must keep showing who
    // signed even if the user's account is later renamed or deleted.
    signerName: text("signer_name"),
    // Legal validation status of this specific signature. Flipped to false if the
    // document is later rejected/superseded — the PDF must then show it as invalidated
    // rather than silently keep displaying a signature that no longer certifies anything.
    isValid: boolean("is_valid").default(true).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("doc_signatures_document_id_idx").on(t.documentId),
    index("doc_signatures_signed_by_idx").on(t.signedBy),
    // A given user can only sign a given document once — prevents duplicate signature rows.
    uniqueIndex("doc_signatures_document_signer_uq").on(t.documentId, t.signedBy),
  ],
);

// ─── Chat ───────────────────────────────────────────────────────────────────

export const conversationsTable = pgTable(
  "conversations",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    // "direct" | "group" | "announcement" | "support" | "building" | "marketplace" | "incident" | "emergency"
    convType: text("conv_type").notNull().default("direct"),
    participant1Id: text("participant1_id").references(() => usersTable.id, { onDelete: "cascade" }),
    participant2Id: text("participant2_id").references(() => usersTable.id, { onDelete: "cascade" }),
    // JSON array of participant user IDs for group conversations
    participantIds: text("participant_ids"),
    isGroup: boolean("is_group").default(false),
    name: text("name"),
    lastMessage: text("last_message"),
    lastMessageAt: timestamp("last_message_at"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    // Links a "marketplace" conversation back to the product being discussed
    productId: text("product_id"),
    // Links an "incident" conversation back to the reclamation/incident it was opened for
    incidentId: text("incident_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("conversations_participant1_id_idx").on(t.participant1Id),
    index("conversations_participant2_id_idx").on(t.participant2Id),
    index("conversations_syndicate_id_idx").on(t.syndicateId),
    index("conversations_conv_type_idx").on(t.convType),
    index("conversations_product_id_idx").on(t.productId),
    index("conversations_incident_id_idx").on(t.incidentId),
  ],
);

export const messagesTable = pgTable(
  "messages",
  {
    id: id(),
    conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
    senderId: text("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    senderName: text("sender_name"),
    text: text("text").notNull().default(""),
    // "text" | "image" | "document" | "announcement" | "voice"
    messageType: text("message_type").notNull().default("text"),
    attachmentUrl: text("attachment_url"),
    attachmentType: text("attachment_type"),   // MIME type e.g. "image/jpeg"
    attachmentName: text("attachment_name"),   // original filename
    attachmentSize: integer("attachment_size"), // bytes
    durationSeconds: integer("duration_seconds"), // for voice notes
    deletedAt: timestamp("deleted_at"),
    // Edit support — tracks when sender last modified the message text
    editedAt: timestamp("edited_at"),
    // Deletion modes
    // "Delete for everyone" — tombstone visible to all participants (content cleared)
    isDeletedForEveryone: boolean("is_deleted_for_everyone").default(false),
    // "Delete for me" — JSON array of user IDs who hid this message from their own view
    deletedForUserIds: text("deleted_for_user_ids"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_id_idx").on(t.conversationId),
    index("messages_created_at_idx").on(t.createdAt),
    // Composite for paginated chat history (conversation × time)
    index("messages_conv_created_at_idx").on(t.conversationId, t.createdAt),
  ],
);

// Tracks the last message each user has read in each conversation (for unread + read-receipt/delivered status)
export const messageReadsTable = pgTable(
  "message_reads",
  {
    id: id(),
    conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at").defaultNow(),
    lastDeliveredAt: timestamp("last_delivered_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("message_reads_conv_user_idx").on(t.conversationId, t.userId),
    index("message_reads_user_id_idx").on(t.userId),
  ],
);

// Emoji reactions on individual messages
export const messageReactionsTable = pgTable(
  "message_reactions",
  {
    id: id(),
    messageId: text("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("message_reactions_message_id_idx").on(t.messageId),
    uniqueIndex("message_reactions_message_user_emoji_uq").on(t.messageId, t.userId, t.emoji),
  ],
);

// Per-user block list — blocking is one-directional (blocker → blocked) and checked both ways for chat gating
export const blockedUsersTable = pgTable(
  "blocked_users",
  {
    id: id(),
    blockerId: text("blocker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("blocked_users_blocker_id_idx").on(t.blockerId),
    index("blocked_users_blocked_id_idx").on(t.blockedId),
    uniqueIndex("blocked_users_pair_uq").on(t.blockerId, t.blockedId),
  ],
);

// Per-user conversation archiving (does not affect other participants)
export const conversationArchivesTable = pgTable(
  "conversation_archives",
  {
    id: id(),
    conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    archivedAt: createdAt(),
  },
  (t) => [
    index("conversation_archives_user_id_idx").on(t.userId),
    uniqueIndex("conversation_archives_conv_user_uq").on(t.conversationId, t.userId),
  ],
);

// Abuse reports raised on a user, a conversation, or a specific message
export const chatReportsTable = pgTable(
  "chat_reports",
  {
    id: id(),
    reporterId: text("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    reportedUserId: text("reported_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    conversationId: text("conversation_id").references(() => conversationsTable.id, { onDelete: "set null" }),
    messageId: text("message_id").references(() => messagesTable.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    // status: pending | reviewed | dismissed
    status: text("status").default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    index("chat_reports_status_idx").on(t.status),
    index("chat_reports_reported_user_id_idx").on(t.reportedUserId),
  ],
);

// ─── Marketplace ────────────────────────────────────────────────────────────
// status: pending_review | approved | rejected | modification_requested | sold_out

export const productsTable = pgTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").default(""),
    price: money("price").notNull(),
    category: text("category").notNull(),
    condition: text("condition").default("bon"), // neuf | bon | acceptable | mauvais
    location: text("location").default(""),
    imageUrls: text("image_urls").default("[]"), // JSON array of image URLs
    stock: integer("stock").default(1),
    syndicateId: text("syndicate_id"),
    sellerId: text("seller_id"),
    sellerName: text("seller_name"),
    status: text("status").default("pending_review"),
    rejectionReason: text("rejection_reason"),
    moderationNote: text("moderation_note"),
    moderatedBy: text("moderated_by"),
    moderatedAt: timestamp("moderated_at"),
    featured: boolean("featured").default(false),
    boosted: boolean("boosted").default(false),
    boostType: text("boost_type"), // featured | top_search | homepage
    boostExpiresAt: timestamp("boost_expires_at"),
    viewCount: integer("view_count").default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("products_status_idx").on(t.status),
    index("products_seller_id_idx").on(t.sellerId),
    index("products_syndicate_id_idx").on(t.syndicateId),
    index("products_category_idx").on(t.category),
    index("products_featured_idx").on(t.featured),
    index("products_created_at_idx").on(t.createdAt),
  ],
);

export const cartItemsTable = pgTable(
  "cart_items",
  {
    id: id(),
    userId: text("user_id").notNull(),
    productId: text("product_id").notNull(),
    productName: text("product_name"),
    price: money("price"),
    sellerName: text("seller_name"),
    quantity: integer("quantity").default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index("cart_items_user_id_idx").on(t.userId),
    index("cart_items_product_id_idx").on(t.productId),
  ],
);

export const ordersTable = pgTable(
  "orders",
  {
    id: id(),
    productId: text("product_id"),
    productName: text("product_name"),
    buyerId: text("buyer_id"),
    buyerName: text("buyer_name"),
    sellerId: text("seller_id"),
    sellerName: text("seller_name"),
    amount: money("amount"),
    status: text("status").default("pending"), // pending | confirmed | shipped | delivered | cancelled
    type: text("type").default("purchase"),
    date: text("date"),
    createdAt: createdAt(),
  },
  (t) => [
    index("orders_buyer_id_idx").on(t.buyerId),
    index("orders_seller_id_idx").on(t.sellerId),
    index("orders_status_idx").on(t.status),
    index("orders_created_at_idx").on(t.createdAt),
  ],
);

export const reviewsTable = pgTable(
  "reviews",
  {
    id: id(),
    productId: text("product_id"),
    productName: text("product_name"),
    orderId: text("order_id"),
    rating: integer("rating").notNull(),
    comment: text("comment").default(""),
    reviewerId: text("reviewer_id"),
    reviewerName: text("reviewer_name"),
    date: text("date"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reviews_product_id_idx").on(t.productId),
    index("reviews_reviewer_id_idx").on(t.reviewerId),
  ],
);

export const productFavoritesTable = pgTable(
  "product_favorites",
  {
    id: id(),
    productId: text("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("product_favorites_product_id_idx").on(t.productId),
    index("product_favorites_user_id_idx").on(t.userId),
    uniqueIndex("product_favorites_unique_idx").on(t.productId, t.userId),
  ],
);

export const productReportsTable = pgTable(
  "product_reports",
  {
    id: id(),
    productId: text("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").notNull(),
    reporterName: text("reporter_name"),
    reason: text("reason").notNull(), // spam | inappropriate | fraude | mauvaise_info | autre
    details: text("details").default(""),
    status: text("status").default("pending"), // pending | reviewed | dismissed
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("product_reports_product_id_idx").on(t.productId),
    index("product_reports_reporter_id_idx").on(t.reporterId),
    index("product_reports_status_idx").on(t.status),
  ],
);

export const productCommentsTable = pgTable(
  "product_comments",
  {
    id: id(),
    productId: text("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: text("user_name"),
    userRole: text("user_role"),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("product_comments_product_id_idx").on(t.productId),
    index("product_comments_created_at_idx").on(t.createdAt),
  ],
);

export const marketplacePromotionsTable = pgTable(
  "marketplace_promotions",
  {
    id: id(),
    productId: text("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
    sellerId: text("seller_id").notNull(),
    type: text("type").notNull(), // featured | top_search | homepage
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    amount: money("amount").notNull(),
    status: text("status").default("pending_payment"), // pending_payment | active | rejected | expired | cancelled
    paymentMethod: text("payment_method"),
    proofUrl: text("proof_url"),
    rejectionReason: text("rejection_reason"),
    approvedBy: text("approved_by"),
    validatedAt: timestamp("validated_at"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("marketplace_promotions_product_id_idx").on(t.productId),
    index("marketplace_promotions_seller_id_idx").on(t.sellerId),
    index("marketplace_promotions_status_idx").on(t.status),
    index("marketplace_promotions_end_date_idx").on(t.endDate),
  ],
);

// ─── Legal Alerts, Support, System Alerts ──────────────────────────────────

export const legalAlertsTable = pgTable("legal_alerts", {
  id: id(),
  title: text("title").notNull(),
  description: text("description"),
  level: text("level").notNull(),
  category: text("category").notNull(),
  date: text("date"),
  action: text("action"),
  status: text("status").default("open"),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const supportTicketsTable = pgTable(
  "support_tickets",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priority: text("priority").default("medium"),
    category: text("category").default("general"),
    status: text("status").default("open"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    submittedById: text("submitted_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    submittedByName: text("submitted_by_name"),
    createdAt: createdAt(),
  },
  (t) => [
    index("support_tickets_submitted_by_id_idx").on(t.submittedById),
    index("support_tickets_syndicate_id_idx").on(t.syndicateId),
    index("support_tickets_status_idx").on(t.status),
  ],
);

export const ticketRepliesTable = pgTable("ticket_replies", {
  id: id(),
  ticketId: text("ticket_id").notNull().references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  authorId: text("author_id"),
  authorName: text("author_name"),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

export const cotisationsTable = pgTable(
  "cotisations",
  {
    id: id(),
    memberId: text("member_id").notNull(),
    label: text("label").notNull(),
    period: text("period").notNull(),
    amount: money("amount").notNull(),
    dueDate: text("due_date"),
    status: text("status").default("pending"),
    syndicateId: text("syndicate_id"),
    paidDate: text("paid_date"),
    receipt: text("receipt"),
    createdAt: createdAt(),
  },
  (t) => [
    index("cotisations_member_id_idx").on(t.memberId),
    index("cotisations_syndicate_id_idx").on(t.syndicateId),
    index("cotisations_status_idx").on(t.status),
  ],
);

export const paymentProofsTable = pgTable(
  "payment_proofs",
  {
    id: id(),
    cotisationId: text("cotisation_id").notNull().references(() => cotisationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    fileUrl: text("file_url"),
    proofUrl: text("proof_url"),
    amount: money("amount"),
    notes: text("notes"),
    status: text("status").default("pending"),
    uploadedById: text("uploaded_by_id"),
    reviewedById: text("reviewed_by_id"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payment_proofs_cotisation_id_idx").on(t.cotisationId),
    index("payment_proofs_status_idx").on(t.status),
  ],
);

export const alertsTable = pgTable("alerts", {
  id: id(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").default("info"),
  date: text("date"),
  target: text("target").default("all"),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const alertReadsTable = pgTable(
  "alert_reads",
  {
    alertId: text("alert_id").notNull().references(() => alertsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.alertId, t.userId] })],
);

export const notificationPreferencesTable = pgTable(
  "notification_preferences",
  {
    id: id(),
    userId: text("user_id").notNull(),
    push: boolean("push").default(true),
    email: boolean("email").default(true),
    inApp: boolean("in_app").default(true),
  },
);

export const partnersTable = pgTable("partners", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  sector: text("sector"),
  contact: text("contact"),
  phone: text("phone"),
  email: text("email"),
  benefit: text("benefit"),
  discount: text("discount"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  description: text("description").default(""),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const payslipsTable = pgTable("payslips", {
  id: id(),
  userId: text("user_id"),
  month: text("month"),
  amount: money("amount"),
  fileUrl: text("file_url"),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: id(),
  name: text("name").notNull(),
  price: money("price"),
  interval: text("interval").default("monthly"),
  features: text("features").default("[]"),
  createdAt: createdAt(),
});

export const syndicateSubscriptionsTable = pgTable("syndicate_subscriptions", {
  id: id(),
  syndicateId: text("syndicate_id").notNull(),
  planId: text("plan_id"),
  status: text("status").default("active"),
  autoRenew: boolean("auto_renew").default(true),
  createdAt: createdAt(),
});

// ─── Audit Log ──────────────────────────────────────────────────────────────

export const auditLogsTable = pgTable("audit_logs", {
  id: id(),
  userId: text("user_id"),
  userName: text("user_name"),
  // Role held by the actor at the time of the action — kept alongside userId so
  // history remains readable even if the user's role changes later.
  actorRole: text("actor_role"),
  syndicateId: text("syndicate_id"),
  // True when a super_admin performed this action inside a specific syndicate's
  // scope (supervision/support), as opposed to a syndicate_admin's normal,
  // in-scope action or a super_admin's platform-level action (no syndicateId).
  isSupervision: boolean("is_supervision").notNull().default(false),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: createdAt(),
});

// ─── Email Logs ─────────────────────────────────────────────────────────────
// Tracks every transactional email attempted by the EmailService (lib/email),
// including retries, so delivery can be audited and failed sends re-triggered
// from the admin Email Center.

export const emailLogsTable = pgTable(
  "email_logs",
  {
    id: id(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    // Template key used to render the email (e.g. "welcome", "password_reset") —
    // lets the Email Center group/filter by flow.
    template: text("template").notNull(),
    // status: pending | sent | failed
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    syndicateId: text("syndicate_id"),
    // Rendered body, kept so a failed email can be retried without recomputing
    // the template (e.g. after a transient SMTP outage).
    bodyHtml: text("body_html"),
    sentAt: timestamp("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("email_logs_status_idx").on(t.status),
    index("email_logs_recipient_idx").on(t.recipient),
    index("email_logs_created_at_idx").on(t.createdAt),
    index("email_logs_template_idx").on(t.template),
  ],
);

// ─── P6: Improvement Ideas & Voting ─────────────────────────────────────────

export const ideasTable = pgTable(
  "ideas",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    userName: text("user_name").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").default("general"), // infrastructure | environment | services | general | governance
    // status: submitted | under_review | approved | rejected | implemented
    status: text("status").default("submitted"),
    voteCount: integer("vote_count").default(0),
    voteDeadline: text("vote_deadline"),
    implementedAt: timestamp("implemented_at"),
    adminNote: text("admin_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ideas_syndicate_id_idx").on(t.syndicateId),
    index("ideas_status_idx").on(t.status),
    index("ideas_user_id_idx").on(t.userId),
  ],
);

export const ideaVotesTable = pgTable(
  "idea_votes",
  {
    id: id(),
    ideaId: text("idea_id").notNull().references(() => ideasTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("idea_votes_unique_idx").on(t.ideaId, t.userId),
    index("idea_votes_idea_id_idx").on(t.ideaId),
  ],
);

// ─── P7: Debt Escalation ─────────────────────────────────────────────────────

export const debtEscalationsTable = pgTable(
  "debt_escalations",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    memberId: text("member_id").references(() => membersTable.id, { onDelete: "set null" }),
    memberName: text("member_name"),
    // lot reference
    lotId: text("lot_id").references(() => lotsTable.id, { onDelete: "set null" }),
    residentType: text("resident_type").default("member"), // member | tenant
    totalOverdue: money("total_overdue").notNull(),
    overdueMonths: integer("overdue_months").notNull(),
    // escalation_level: reminder | warning | final_warning | agm_proposal | legal_action
    escalationLevel: text("escalation_level").notNull(),
    // legacy column kept for backward compatibility
    level: text("level").notNull(),
    status: text("status").default("open"), // open | meeting_scheduled | overridden | resolved
    // generated letter PDF URL
    letterUrl: text("letter_url"),
    // override tracking
    overriddenBy: text("overridden_by"),
    overrideReason: text("override_reason"),
    overriddenAt: timestamp("overridden_at"),
    alertSentAt: timestamp("alert_sent_at"),
    meetingId: text("meeting_id"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("debt_escalations_syndicate_id_idx").on(t.syndicateId),
    index("debt_escalations_member_id_idx").on(t.memberId),
    index("debt_escalations_lot_id_idx").on(t.lotId),
    index("debt_escalations_status_idx").on(t.status),
    index("debt_escalations_level_idx").on(t.escalationLevel),
  ],
);

// ─── P10: Financial Transparency ─────────────────────────────────────────────

export const expenseJustificationsTable = pgTable(
  "expense_justifications",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    category: text("category"),
    receiptUrl: text("receipt_url"),
    // status: pending | approved | challenged | resolved
    status: text("status").default("pending"),
    submittedBy: text("submitted_by"),
    submitterName: text("submitter_name"),
    challengedBy: text("challenged_by"),
    challengerName: text("challenger_name"),
    challengeReason: text("challenge_reason"),
    voteCount: integer("vote_count").default(0),
    votesFor: integer("votes_for").default(0),
    votesAgainst: integer("votes_against").default(0),
    resolvedAt: timestamp("resolved_at"),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("expense_justifications_syndicate_id_idx").on(t.syndicateId),
    index("expense_justifications_status_idx").on(t.status),
  ],
);

export const expenseVotesTable = pgTable(
  "expense_votes",
  {
    id: id(),
    justificationId: text("justification_id").notNull().references(() => expenseJustificationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    vote: text("vote").notNull(), // for | against
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("expense_votes_unique_idx").on(t.justificationId, t.userId),
  ],
);

// ─── Parking Management ─────────────────────────────────────────────────────

export const parkingSpotsTable = pgTable(
  "parking_spots",
  {
    id: id(),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    lotId: text("lot_id").references(() => lotsTable.id, { onDelete: "set null" }), // null for visitor/unassigned spots
    spotNumber: text("spot_number").notNull(), // e.g. "P-12", "G-3", "V-01"
    type: text("type").notNull().default("resident"), // resident | garage | visitor
    floor: text("floor"), // e.g. "SS-1", "RDC"
    status: text("status").notNull().default("available"), // available | occupied | reserved | maintenance
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("parking_spots_building_id_idx").on(t.buildingId),
    index("parking_spots_lot_id_idx").on(t.lotId),
    index("parking_spots_status_idx").on(t.status),
    uniqueIndex("parking_spots_building_number_idx").on(t.buildingId, t.spotNumber),
  ],
);

export const vehiclesTable = pgTable(
  "vehicles",
  {
    id: id(),
    lotId: text("lot_id").references(() => lotsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    plateNumber: text("plate_number").notNull(),
    brand: text("brand"),
    model: text("model"),
    color: text("color"),
    status: text("status").notNull().default("active"), // active | inactive
    createdAt: createdAt(),
  },
  (t) => [
    index("vehicles_lot_id_idx").on(t.lotId),
    index("vehicles_user_id_idx").on(t.userId),
    uniqueIndex("vehicles_plate_unique_idx").on(t.plateNumber),
  ],
);

export const parkingViolationsTable = pgTable(
  "parking_violations",
  {
    id: id(),
    spotId: text("spot_id").references(() => parkingSpotsTable.id, { onDelete: "set null" }),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    plateNumber: text("plate_number").notNull(),
    reportedById: text("reported_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    reportedByName: text("reported_by_name").notNull(),
    photoUrl: text("photo_url"),
    notes: text("notes"),
    status: text("status").notNull().default("open"), // open | resolved | dismissed
    resolvedById: text("resolved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    reportedAt: timestamp("reported_at").defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("parking_violations_building_id_idx").on(t.buildingId),
    index("parking_violations_spot_id_idx").on(t.spotId),
    index("parking_violations_status_idx").on(t.status),
    index("parking_violations_reported_at_idx").on(t.reportedAt),
  ],
);

export const visitorParkingReservationsTable = pgTable(
  "visitor_parking_reservations",
  {
    id: id(),
    spotId: text("spot_id").notNull().references(() => parkingSpotsTable.id, { onDelete: "cascade" }),
    requestedById: text("requested_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    visitorName: text("visitor_name").notNull(),
    visitorPlate: text("visitor_plate"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    status: text("status").notNull().default("confirmed"), // confirmed | cancelled | expired
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("visitor_reservations_spot_id_idx").on(t.spotId),
    index("visitor_reservations_requested_by_idx").on(t.requestedById),
    index("visitor_reservations_times_idx").on(t.startTime, t.endTime),
    index("visitor_reservations_status_idx").on(t.status),
  ],
);

// ─── P12: National Ranking ───────────────────────────────────────────────────

// ─── Travaux Privatifs (Resident Structural/Exterior Modification Requests) ───
// Full approval trail: submission → syndic review → optional committee → optional GA vote → final decision
// Every step is recorded permanently for legal reference (disputes often arise years later).

export const travauxPrivatifsTable = pgTable(
  "travaux_privatifs",
  {
    id: id(),
    buildingId: text("building_id").notNull(),
    lotId: text("lot_id"),
    syndicateId: text("syndicate_id"),
    // Requester
    requestedById: text("requested_by_id"),
    requestedByName: text("requested_by_name").notNull(),
    // Request details
    title: text("title").notNull(),
    description: text("description").notNull(),
    // workType: ac_unit | balcony | windows | facade | structural | plumbing | electrical | other
    workType: text("work_type").notNull(),
    // Supporting documents (JSON arrays of URLs)
    currentPhotoUrls: text("current_photo_urls").default("[]"),
    proposedPhotoUrls: text("proposed_photo_urls").default("[]"),
    planUrls: text("plan_urls").default("[]"),
    // status: submitted | under_review | committee_review | vote_required | approved | rejected | withdrawn
    status: text("status").default("submitted"),
    // ── Syndic initial review ───────────────────────────────────────────────
    requiresCommitteeReview: boolean("requires_committee_review"),
    requiresGAVote: boolean("requires_ga_vote"),
    bylawReference: text("bylaw_reference"),      // which article of the by-laws applies
    syndicReviewNote: text("syndic_review_note"),
    syndicReviewedById: text("syndic_reviewed_by_id"),
    syndicReviewedByName: text("syndic_reviewed_by_name"),
    syndicReviewedAt: timestamp("syndic_reviewed_at"),
    // ── Committee review ────────────────────────────────────────────────────
    committeeNote: text("committee_note"),
    // committeeRecommendation: approve | reject | escalate_vote
    committeeRecommendation: text("committee_recommendation"),
    committeeReviewedById: text("committee_reviewed_by_id"),
    committeeReviewedByName: text("committee_reviewed_by_name"),
    committeeReviewedAt: timestamp("committee_reviewed_at"),
    // ── GA Vote ─────────────────────────────────────────────────────────────
    voteItemId: text("vote_item_id"),             // optional link to elections/meetings record
    // voteOutcome: approved | rejected | inconclusive
    voteOutcome: text("vote_outcome"),
    voteDate: text("vote_date"),
    voteSummary: text("vote_summary"),
    // ── Final decision (permanent legal record) ─────────────────────────────
    // finalDecision: approved | rejected
    finalDecision: text("final_decision"),
    finalDecisionNote: text("final_decision_note"),
    finalDecisionById: text("final_decision_by_id"),
    finalDecisionByName: text("final_decision_by_name"),
    finalDecisionAt: timestamp("final_decision_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("travaux_privatifs_building_id_idx").on(t.buildingId),
    index("travaux_privatifs_status_idx").on(t.status),
    index("travaux_privatifs_requested_by_id_idx").on(t.requestedById),
    index("travaux_privatifs_syndicate_id_idx").on(t.syndicateId),
  ],
);

// ─── Conseil Syndical (Law 18-00 Art. 22 — elected oversight body) ───────────

export const conseilSyndicalTable = pgTable(
  "conseil_syndical",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    memberId: text("member_id").references(() => membersTable.id, { onDelete: "set null" }),
    // role: president | vice_president | secretary | treasurer | committee_member | building_representative | member
    role: text("role").notNull().default("member"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    mandateStart: text("mandate_start"),
    mandateEnd: text("mandate_end"),
    // status: active | expired | resigned | revoked
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    // Traceability to the election that produced this mandate (manual appointments leave these null)
    electionId: text("election_id").references(() => electionsTable.id, { onDelete: "set null" }),
    candidateId: text("candidate_id").references(() => candidatesTable.id, { onDelete: "set null" }),
    resignedAt: timestamp("resigned_at"),
    resignReason: text("resign_reason"),
    // Admin-initiated removal-for-cause — distinct from voluntary resignation above.
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by").references(() => usersTable.id, { onDelete: "set null" }),
    revokeReason: text("revoke_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("conseil_syndical_syndicate_id_idx").on(t.syndicateId),
    index("conseil_syndical_user_id_idx").on(t.userId),
    index("conseil_syndical_status_idx").on(t.status),
    index("conseil_syndical_election_id_idx").on(t.electionId),
  ],
);

// ─── Fonds de Travaux (Law 18-00 Art. 18 — mandatory 5% reserve fund) ────────

export const fondsTravauxTable = pgTable(
  "fonds_travaux",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    // Basis for the 5% calculation (total annual charges budget)
    budgetBase: money("budget_base").notNull(),
    // Rate as a percentage — minimum 5% by law, syndicate may vote higher
    ratePercent: money("rate_percent").notNull().default("5"),
    // Computed: budgetBase × ratePercent / 100
    targetAmount: money("target_amount").notNull(),
    // Running balance of contributions received into this fund
    currentBalance: money("current_balance").notNull().default("0"),
    // status: active | funded | closed
    status: text("status").notNull().default("active"),
    // Approved by AG resolution (optional reference)
    approvedByResolutionId: text("approved_by_resolution_id"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("fonds_travaux_unique_idx").on(t.syndicateId, t.buildingId, t.year),
    index("fonds_travaux_syndicate_id_idx").on(t.syndicateId),
    index("fonds_travaux_building_id_idx").on(t.buildingId),
  ],
);

// ─── Financial Attachment Tables ─────────────────────────────────────────────
// Every charge (appel de fonds), invoice, and quotation must have supporting
// documents. These tables allow multiple attachments per record.

export const chargeAttachmentsTable = pgTable(
  "charge_attachments",
  {
    id: id(),
    appelDeFondsId: text("appel_de_fonds_id").notNull().references(() => appelsDeFondsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    uploadedBy: text("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("charge_attachments_appel_id_idx").on(t.appelDeFondsId)],
);

export const invoiceAttachmentsTable = pgTable(
  "invoice_attachments",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    uploadedBy: text("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("invoice_attachments_invoice_id_idx").on(t.invoiceId)],
);

// ─── Actes Administratifs ────────────────────────────────────────────────────

export const actesAdministratifsTable = pgTable(
  "actes_administratifs",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
    type: text("type").notNull().default("decision"),
    statut: text("statut").notNull().default("brouillon"),
    numero: text("numero").notNull(),
    titre: text("titre").notNull(),
    objet: text("objet").notNull(),
    date: text("date").notNull(),
    dateEcheance: text("date_echeance"),
    auteur: text("auteur").notNull(),
    signataires: text("signataires").array().default([]),
    destinataires: text("destinataires").array().default([]),
    resumeContenu: text("resume_contenu"),
    important: boolean("important").default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("actes_administratifs_syndicate_id_idx").on(t.syndicateId),
    index("actes_administratifs_statut_idx").on(t.statut),
    index("actes_administratifs_type_idx").on(t.type),
  ],
);

export const nationalRankingsTable = pgTable(
  "national_rankings",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    month: integer("month").notNull(), // 1–12
    year: integer("year").notNull(),
    // Scoring components (0–100 each)
    collectionRate: money("collection_rate").default("0"),       // % cotisations paid
    incidentResolutionRate: money("incident_resolution_rate").default("0"), // % incidents closed
    documentationScore: money("documentation_score").default("0"), // % docs uploaded
    meetingComplianceScore: money("meeting_compliance_score").default("0"), // AGs held on time
    memberSatisfaction: money("member_satisfaction").default("0"), // avg review
    totalScore: money("total_score").default("0"),              // weighted aggregate
    rank: integer("rank").default(0),                          // national rank
    regionRank: integer("region_rank").default(0),
    region: text("region").default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("national_rankings_unique_idx").on(t.syndicateId, t.month, t.year),
    index("national_rankings_year_month_idx").on(t.year, t.month),
    index("national_rankings_score_idx").on(t.totalScore),
  ],
);

// ─── Réclamations & Griefs (union member grievances) ────────────────────────
// Platform-wide (not syndicate-scoped): members file personal grievances against
// their employer, handled by union delegates. Non-admins only ever see their own.

export const reclamationsTable = pgTable(
  "reclamations",
  {
    id: id(),
    reference: text("reference").notNull(),
    // type: salaire | condition_travail | discrimination | harcelement | licenciement | conge | avancement | securite | autre
    type: text("type").notNull(),
    // statut: deposee | en_instruction | transmise_direction | en_mediation | resolue | classee | contentieux
    statut: text("statut").default("deposee"),
    // priorite: urgente | haute | normale | basse
    priorite: text("priorite").default("normale"),
    titre: text("titre").notNull(),
    description: text("description").notNull(),
    // Not FK'd on purpose: anonymous submissions store null so identity is not
    // recoverable even from the DB, matching the "protected anonymity" promise.
    memberId: text("member_id"),
    memberName: text("member_name"),
    service: text("service").default(""),
    dateDepot: text("date_depot").notNull(),
    dateEcheance: text("date_echeance"),
    dateCloture: text("date_cloture"),
    traitePar: text("traite_par"),
    commentaireAdmin: text("commentaire_admin"),
    documentsJoints: text("documents_joints").default("[]"),
    etapes: text("etapes").default("[]"), // JSON array of { date, action, auteur }
    anonymous: boolean("anonymous").default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("reclamations_member_id_idx").on(t.memberId),
    index("reclamations_statut_idx").on(t.statut),
    index("reclamations_priorite_idx").on(t.priorite),
  ],
);

// ─── Approval Workflows (multi-step national governance processes) ─────────
// Platform-wide, read-visible to all authenticated users; only admins act on them.

export const workflowsTable = pgTable(
  "workflows",
  {
    id: id(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description").default(""),
    // status: pending | in_progress | approved | rejected | cancelled
    status: text("status").default("pending"),
    // priority: low | medium | high | urgent
    priority: text("priority").default("medium"),
    initiatorId: text("initiator_id"),
    initiatorName: text("initiator_name").notNull(),
    startDate: text("start_date").notNull(),
    deadline: text("deadline"),
    currentStep: integer("current_step").default(0),
    document: text("document"),
    createdAt: createdAt(),
  },
  (t) => [
    index("workflows_status_idx").on(t.status),
    index("workflows_category_idx").on(t.category),
  ],
);

export const workflowStepsTable = pgTable(
  "workflow_steps",
  {
    id: id(),
    workflowId: text("workflow_id").notNull().references(() => workflowsTable.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    title: text("title").notNull(),
    assignee: text("assignee").notNull(),
    role: text("role").default(""),
    // status: done | current | waiting | rejected
    status: text("status").default("waiting"),
    comment: text("comment"),
    date: text("date"),
  },
  (t) => [
    index("workflow_steps_workflow_id_idx").on(t.workflowId),
  ],
);

// ─── Répertoire Juridique (legal reference library) ─────────────────────────
// Platform-wide read-only reference content authored by partner legal counsel.

export const fichesJuridiquesTable = pgTable(
  "fiches_juridiques",
  {
    id: id(),
    // theme: licenciement | conges | salaire | syndicale | discrimination | contrat | sante | retraite
    theme: text("theme").notNull(),
    titre: text("titre").notNull(),
    resume: text("resume").notNull(),
    contenu: text("contenu").notNull(),
    articles: text("articles").default("[]"),
    jurisprudence: text("jurisprudence").default("[]"),
    conseils: text("conseils").default("[]"),
    important: boolean("important").default(false),
    updated: text("updated"),
    createdAt: createdAt(),
  },
  (t) => [
    index("fiches_juridiques_theme_idx").on(t.theme),
  ],
);

// ─── Document Comments ────────────────────────────────────────────────────────
// Threaded comments on documents for review collaboration and notes.

export const documentCommentsTable = pgTable(
  "document_comments",
  {
    id: id(),
    documentId: text("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    parentId: text("parent_id"),   // for threaded replies — no FK to avoid recursive constraint
    isDeleted: boolean("is_deleted").default(false).notNull(),
    editedAt: timestamp("edited_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("document_comments_document_id_idx").on(t.documentId),
    index("document_comments_author_id_idx").on(t.authorId),
  ],
);
