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

export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: id(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: createdAt(),
});

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
    prestataireId: text("prestataire_id"),
  },
  (t) => [index("budget_lines_budget_id_idx").on(t.budgetId)],
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
    status: text("status").default("upcoming"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("elections_syndicate_id_idx").on(t.syndicateId),
    index("elections_status_idx").on(t.status),
  ],
);

export const candidatesTable = pgTable("candidates", {
  id: id(),
  electionId: text("election_id").notNull().references(() => electionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  post: text("post").notNull(),
  bio: text("bio").default(""),
  votes: integer("votes").default(0),
});

export const votesTable = pgTable(
  "votes",
  {
    id: id(),
    electionId: text("election_id").notNull().references(() => electionsTable.id, { onDelete: "cascade" }),
    voterId: text("voter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id").notNull().references(() => candidatesTable.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    // Prevent duplicate votes: one voter per election
    uniqueIndex("votes_election_voter_unique_idx").on(t.electionId, t.voterId),
    index("votes_election_id_idx").on(t.electionId),
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

export const agResolutionsTable = pgTable("ag_resolutions", {
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
});

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

export const unionActionsTable = pgTable("union_actions", {
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
  syndicateId: text("syndicate_id"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

export const actionSupportsTable = pgTable(
  "action_supports",
  {
    id: id(),
    actionId: text("action_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: createdAt(),
  },
);

export const actionParticipantsTable = pgTable("action_participants", {
  id: id(),
  actionId: text("action_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name"),
  createdAt: createdAt(),
});

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
    status: text("status").default("published"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    size: text("size"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("documents_syndicate_id_idx").on(t.syndicateId),
    index("documents_category_idx").on(t.category),
  ],
);

// ─── Chat ───────────────────────────────────────────────────────────────────

export const conversationsTable = pgTable(
  "conversations",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    // "direct" | "group" | "announcement" | "support" | "building"
    convType: text("conv_type").notNull().default("direct"),
    participant1Id: text("participant1_id").references(() => usersTable.id, { onDelete: "cascade" }),
    participant2Id: text("participant2_id").references(() => usersTable.id, { onDelete: "cascade" }),
    // JSON array of participant user IDs for group conversations
    participantIds: text("participant_ids"),
    isGroup: boolean("is_group").default(false),
    name: text("name"),
    lastMessage: text("last_message"),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("conversations_participant1_id_idx").on(t.participant1Id),
    index("conversations_participant2_id_idx").on(t.participant2Id),
    index("conversations_syndicate_id_idx").on(t.syndicateId),
    index("conversations_conv_type_idx").on(t.convType),
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
    // "text" | "image" | "document" | "announcement"
    messageType: text("message_type").notNull().default("text"),
    attachmentUrl: text("attachment_url"),
    attachmentType: text("attachment_type"),   // MIME type e.g. "image/jpeg"
    attachmentName: text("attachment_name"),   // original filename
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_conversation_id_idx").on(t.conversationId),
    index("messages_created_at_idx").on(t.createdAt),
    // Composite for paginated chat history (conversation × time)
    index("messages_conv_created_at_idx").on(t.conversationId, t.createdAt),
  ],
);

// Tracks the last message each user has read in each conversation (for unread counts)
export const messageReadsTable = pgTable(
  "message_reads",
  {
    id: id(),
    conversationId: text("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at").defaultNow(),
  },
  (t) => [
    index("message_reads_conv_user_idx").on(t.conversationId, t.userId),
    index("message_reads_user_id_idx").on(t.userId),
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
    status: text("status").default("active"), // active | expired | cancelled
    approvedBy: text("approved_by"),
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
    // role: president | secretary | treasurer | member
    role: text("role").notNull().default("member"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    mandateStart: text("mandate_start"),
    mandateEnd: text("mandate_end"),
    // status: active | expired | resigned | revoked
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("conseil_syndical_syndicate_id_idx").on(t.syndicateId),
    index("conseil_syndical_user_id_idx").on(t.userId),
    index("conseil_syndical_status_idx").on(t.status),
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
