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
  jsonb,
  date,
  check,
  type AnyPgColumn,
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
  // Syndic company managing this condominium (one company, many condominiums).
  organizationId: text("organization_id").references((): AnyPgColumn => organizationsTable.id, { onDelete: "restrict" }),
  // Lifecycle: draft (being configured) | active | suspended (read-only) | archived
  status: text("status").default("active"),
  statusReason: text("status_reason"),
  statusChangedAt: timestamp("status_changed_at"),
  archivedAt: timestamp("archived_at"),
  // Management settings
  currency: text("currency").notNull().default("MAD"),
  defaultLanguage: text("default_language").notNull().default("fr"),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  // Retry-safe creation (Idempotency-Key of the creating request)
  creationKey: text("creation_key"),
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
  // Banking — used by payment-demand (appel de fonds), invoices, and legal enforcement letters
  bankName: text("bank_name"),
  bankIban: text("bank_iban"),
  bankBic: text("bank_bic"),
  // Finance defaults
  cotisationAmount: money("cotisation_amount"),
  cotisationCycle: text("cotisation_cycle").default("monthly"),
  // Legal escalation threshold (months of non-payment before legal action)
  legalThresholdMonths: integer("legal_threshold_months").default(18),
  createdAt: createdAt(),
}, (t) => [
  index("syndicates_organization_id_idx").on(t.organizationId),
  // No two live condominiums with the same name in one syndic company.
  uniqueIndex("syndicates_org_name_uq").on(t.organizationId, sql`lower(${t.name})`).where(sql`${t.status} <> 'archived'`),
  uniqueIndex("syndicates_creation_key_uq").on(t.organizationId, t.creationKey).where(sql`${t.creationKey} IS NOT NULL`),
  check("syndicates_status_chk", sql`${t.status} IN ('draft', 'active', 'suspended', 'archived')`),
  check("syndicates_currency_chk", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  check("syndicates_language_chk", sql`${t.defaultLanguage} IN ('fr', 'ar', 'en', 'es')`),
  check("syndicates_fiscal_month_chk", sql`${t.fiscalYearStartMonth} BETWEEN 1 AND 12`),
]);

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
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /** Last password change: access tokens issued before it are refused (lib/access.ts). */
    passwordChangedAt: timestamp("password_changed_at"),
    /**
     * unverified (default) | verified (confirmed by a code sent to it) |
     * undeliverable (reserved domain, or known not to receive mail). Mail is
     * never sent to an undeliverable address; the account itself keeps working.
     */
    emailStatus: text("email_status").notNull().default("unverified"),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("active"),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "set null" }),
    pushToken: text("push_token"),
    // Language of push notifications (fr | ar | en | es); null = French.
    language: text("language"),
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
    // Condominium selected for this session (null = the account's home context).
    contextSyndicateId: text("context_syndicate_id"),
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

// ─── Storage object ownership ───────────────────────────────────────────────
// Every private upload gets a durable authorization record. Object paths are
// deliberately not treated as bearer capabilities: the serving route resolves
// access from this table and the authenticated request context.

export const storageObjectsTable = pgTable(
  "storage_objects",
  {
    id: id(),
    objectPath: text("object_path").notNull(),
    ownerId: text("owner_id").references(() => usersTable.id, { onDelete: "set null" }),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    originalName: text("original_name"),
    contentType: text("content_type").notNull(),
    size: integer("size"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("storage_objects_object_path_uq").on(t.objectPath),
    index("storage_objects_owner_id_idx").on(t.ownerId),
    index("storage_objects_syndicate_id_idx").on(t.syndicateId),
  ],
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
    // One record per person and syndicate: the same person may own lots in
    // several syndicates (each syndicate keeps its own register).
    uniqueIndex("members_syndicate_email_uq").on(t.syndicateId, sql`lower(${t.email})`),
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
    // Main owner (largest current share), kept in sync with lot_ownerships
    // by the ownership workflow — read by charge generation and legacy code.
    ownerId: text("owner_id").references(() => membersTable.id, { onDelete: "set null" }),
    // Current tenancy (tenants.id), kept in sync by the tenancy workflow.
    tenantId: text("tenant_id"),
    // Occupancy: occupied (by the owner) | rented | vacant
    status: text("status").default("occupied"),
    description: text("description"),
    // Lifecycle: an archived lot keeps its whole history but receives no new
    // calls for funds and leaves the active lists.
    archivedAt: timestamp("archived_at"),
    archivedBy: text("archived_by"),
    archiveReason: text("archive_reason"),
    // Optimistic concurrency: every update must present the version it read.
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("lots_building_id_idx").on(t.buildingId),
    index("lots_owner_id_idx").on(t.ownerId),
    // A reference is unique within its building among active lots.
    uniqueIndex("lots_building_number_active_uq")
      .on(t.buildingId, sql`lower(${t.number})`)
      .where(sql`${t.archivedAt} IS NULL`),
    check("lots_tantiemes_chk", sql`${t.tantiemes} >= 0`),
    check("lots_status_chk", sql`${t.status} IN ('occupied', 'rented', 'vacant')`),
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
    // restrict: a lot with calls for funds is archived, never deleted.
    lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "restrict" }),
    // Owner at issue time — never rewritten when the lot changes hands.
    ownerId: text("owner_id").references(() => membersTable.id, { onDelete: "set null" }),
    // Every co-owner of the lot when the call was issued (snapshot): they are
    // its debtors. Never rewritten when ownership changes later.
    debtorMemberIds: text("debtor_member_ids").array().notNull().default(sql`'{}'::text[]`),
    period: text("period").notNull(),
    type: text("type").default("charges_courantes"),
    amount: money("amount").notNull(),
    dueDate: text("due_date"),
    // status: pending (issued) | pending_validation | partially_paid | paid
    //         | overdue | rejected | cancelled
    status: text("status").default("pending"),
    // Sum of validated payments (appel_payments). Never above `amount`.
    amountPaid: money("amount_paid").notNull().default("0"),
    cancelledAt: timestamp("cancelled_at"),
    cancelledBy: text("cancelled_by"),
    cancellationReason: text("cancellation_reason"),
    paymentMethod: text("payment_method"),
    proofUrl: text("proof_url"),
    notes: text("notes"),
    // Allocation that computed this call (null for calls issued before it)
    allocationId: text("allocation_id"),
    // Date the obligation was issued (YYYY-MM-DD, condominium time zone)
    issueDate: text("issue_date"),
    // Amount at issue; "amount" changes only through appel_adjustments rows
    originalAmount: money("original_amount"),
    paidDate: text("paid_date"),
    receiptNumber: text("receipt_number"),
    /** What the co-owner writes in the bank transfer (e.g. A203-2026Q4-CC-7F3A9B). Unique. */
    paymentReference: text("payment_reference"),
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
    // One live call per lot, period and charge type — makes generation
    // idempotent; a cancelled call (correction) no longer blocks its successor.
    uniqueIndex("appels_lot_period_type_uq").on(t.lotId, t.period, t.type).where(sql`${t.status} IS DISTINCT FROM 'cancelled'`),
    uniqueIndex("appels_payment_reference_uq").on(t.paymentReference).where(sql`${t.paymentReference} IS NOT NULL`),
    index("appels_allocation_idx").on(t.allocationId),
    check(
      "appels_amount_paid_range",
      sql`${t.amountPaid} >= 0 AND ${t.amountPaid} <= ${t.amount}`,
    ),
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
    // Journal entry this operation was posted as (null = not a cash movement,
    // e.g. a pending item, or a record predating the journal).
    ledgerEntryId: text("ledger_entry_id").references((): AnyPgColumn => ledgerEntriesTable.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_syndicate_id_idx").on(t.syndicateId),
    index("transactions_ledger_entry_id_idx").on(t.ledgerEntryId),
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
    ledgerEntryId: text("ledger_entry_id").references((): AnyPgColumn => ledgerEntriesTable.id),
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
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
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
    index("prestataire_evaluations_syndicate_id_idx").on(t.syndicateId),
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
    // single: one candidate per ballot | multiple: up to seatsCount distinct candidates
    ballotMode: text("ballot_mode").notNull().default("single"),
    // per_voter: one voice per ballot | quote_part: the voter's voices (Loi 18-00, art. 16 decies)
    weighting: text("weighting").notNull().default("per_voter"),
    // votes_cast | all_voices: what a percentage majority is measured against
    majorityBase: text("majority_base").notNull().default("votes_cast"),
    // 1 = first round; a second round is a new election linked by parentElectionId
    round: integer("round").notNull().default(1),
    parentElectionId: text("parent_election_id"),
    // elected | runoff_required | deliberation_required | no_majority (set when results are published)
    outcome: text("outcome"),
    outcomeDetails: jsonb("outcome_details"),
    voicesCast: numeric("voices_cast", { precision: 14, scale: 4 }).notNull().default("0"),
    eligibleVoices: numeric("eligible_voices", { precision: 14, scale: 4 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("elections_syndicate_id_idx").on(t.syndicateId),
    index("elections_parent_election_id_idx").on(t.parentElectionId),
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
    // Weighted total (quotes-parts) next to the ballot count; never stored per ballot.
    voices: numeric("voices", { precision: 14, scale: 4 }).notNull().default("0"),
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
    // Selections of one ballot share it (multiple-seat ballots). Null on older ballots.
    ballotId: text("ballot_id"),
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
  priority: text("priority").default("info"),
  audience: text("audience").default("Tous les membres"),
  pinned: boolean("pinned").default(false),
  syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
  authorId: text("author_id"),
  author: text("author"),
  expiresAt: timestamp("expires_at"),
  createdAt: createdAt(),
},
  (t) => [index("announcements_syndicate_id_idx").on(t.syndicateId)],
);

/** "Lu et compris": one acknowledgement per person and announcement. */
export const announcementAcknowledgementsTable = pgTable(
  "announcement_acknowledgements",
  {
    id: id(),
    announcementId: text("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    acknowledgedAt: timestamp("acknowledged_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("announcement_ack_unique").on(t.announcementId, t.userId),
    index("announcement_ack_announcement_idx").on(t.announcementId),
  ],
);

/**
 * Proof that a user accepted a given version of a legal text (CGU, privacy
 * policy): who, which version, when, from where. One row per version.
 */
export const termsAcceptancesTable = pgTable(
  "terms_acceptances",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    /** "cgu" | "privacy" */
    document: text("document").notNull(),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [uniqueIndex("terms_acceptance_unique").on(t.userId, t.document, t.version)],
);

// ─── Documents ──────────────────────────────────────────────────────────────

export const documentsTable = pgTable(
  "documents",
  {
    // Person a personal document concerns (attestation, formal notice, sale
    // file…). Residents only see general documents and their own personal
    // ones. Deliberately no FK: deleting the user must never turn a personal
    // document into a syndicate-wide one (it stays hidden from residents).
    subjectUserId: text("subject_user_id"),
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
    // Stored generation parameters (entity IDs + form fields) — enables full PDF
    // regeneration with inline signatures after signing without losing entity data.
    generationParams: jsonb("generation_params"),
    // Count of signature pages previously appended — used to strip+replace on re-sign.
    appendedSignaturePages: integer("appended_signature_pages").default(0).notNull(),
    // Set to true when PDF embedding after signing fails (GCS unavailable, etc.)
    // so admins can identify documents whose PDF still shows "En attente de signature".
    regenerationFailed: boolean("regeneration_failed").default(false).notNull(),
    // ── Document library (uploaded files) ───────────────────────────────────
    // generated = PDF produced from a template · upload = file added by the team
    source: text("source").notNull().default("generated"),
    // Audience (see lib/document-access.ts): syndic | council | owners |
    // residents | unit | personal. NULL on generated documents = derived from
    // the category and subject (legacy rule), never wider than before.
    visibility: text("visibility"),
    description: text("description"),
    // Record the document belongs to (meeting, lot, expense, claim…). The
    // document keeps its own visibility: linking never widens access.
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    // Unit a "unit" document is visible to (its owners and tenants)
    lotId: text("lot_id").references(() => lotsTable.id, { onDelete: "restrict" }),
    // Verified file metadata (never the client's claims)
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    checksum: text("checksum"),
  },
  (t) => [
    index("documents_syndicate_id_idx").on(t.syndicateId),
    index("documents_entity_idx").on(t.entityType, t.entityId),
    index("documents_lot_id_idx").on(t.lotId),
    index("documents_syndicate_checksum_idx").on(t.syndicateId, t.checksum),
    check("documents_source_chk", sql`${t.source} IN ('generated', 'upload')`),
    check(
      "documents_visibility_chk",
      sql`${t.visibility} IS NULL OR ${t.visibility} IN ('syndic', 'council', 'owners', 'residents', 'unit', 'personal')`,
    ),
    check("documents_unit_lot_chk", sql`${t.visibility} IS DISTINCT FROM 'unit' OR ${t.lotId} IS NOT NULL`),
    check("documents_personal_subject_chk", sql`${t.visibility} IS DISTINCT FROM 'personal' OR ${t.subjectUserId} IS NOT NULL`),
    index("documents_category_idx").on(t.category),
    index("documents_subject_user_id_idx").on(t.subjectUserId),
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
    // File of that version (kept when the file is replaced)
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    checksum: text("checksum"),
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
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
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
    index("document_signatures_syndicate_id_idx").on(t.syndicateId),
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
// status: pending_review | approved | rejected | modification_requested | sold_out | reserved | sold

export const productsTable = pgTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").default(""),
    price: money("price").notNull(),
    originalPrice: money("original_price"),
    category: text("category").notNull(),
    condition: text("condition").default("bon"), // neuf | bon | acceptable | mauvais
    brand: text("brand"),
    model: text("model"),
    purchaseYear: text("purchase_year"),
    sellingReason: text("selling_reason"),
    negotiable: boolean("negotiable").default(false),
    contactPreferences: text("contact_preferences").default('["chat"]'), // JSON array: chat | phone | email
    location: text("location").default(""),
    building: text("building"),
    block: text("block"),
    floor: text("floor"),
    imageUrls: text("image_urls").default("[]"), // JSON array of image URLs
    videoUrl: text("video_url"),
    stock: integer("stock").default(1),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    sellerId: text("seller_id"),
    sellerName: text("seller_name"),
    sellerPhone: text("seller_phone"),
    sellerEmail: text("seller_email"),
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
    reservedBy: text("reserved_by"),
    reservedByName: text("reserved_by_name"),
    reservedAt: timestamp("reserved_at"),
    soldAt: timestamp("sold_at"),
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
  syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
},
  (t) => [index("legal_alerts_syndicate_id_idx").on(t.syndicateId)],
);

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
    // "syndicate" = Level-1 ticket handled by syndicate admin
    // "platform"  = Level-2 ticket sent to super_admin / technical team
    scope: text("scope").default("syndicate"),
    // ID of the Level-1 ticket that was escalated to produce this Level-2 ticket
    escalatedFrom: text("escalated_from"),
    createdAt: createdAt(),
  },
  (t) => [
    index("support_tickets_submitted_by_id_idx").on(t.submittedById),
    index("support_tickets_syndicate_id_idx").on(t.syndicateId),
    index("support_tickets_status_idx").on(t.status),
    index("support_tickets_scope_idx").on(t.scope),
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
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "restrict" }),
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
  // Audience of a broadcast alert: all | admin (management team) | member
  target: text("target").default("all"),
  syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
  // Personal notification: when set, only this user sees the alert
  // (payment validated/rejected, reply to their ticket…), whatever `target`.
  recipientUserId: text("recipient_user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  // Template (lib/notification-texts.ts) and its values: the notification is
  // rendered in the reader's language. title/message keep the French text.
  key: text("key"),
  params: jsonb("params").$type<Record<string, string | number>>(),
  // App screen the notification opens, given only to roles allowed there.
  link: text("link"),
  createdAt: createdAt(),
},
  (t) => [
    index("alerts_syndicate_id_idx").on(t.syndicateId),
    index("alerts_recipient_user_id_idx").on(t.recipientUserId),
  ],
);

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
  syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
},
  (t) => [index("partners_syndicate_id_idx").on(t.syndicateId)],
);

export const payslipsTable = pgTable("payslips", {
  id: id(),
  userId: text("user_id"),
  month: text("month"),
  amount: money("amount"),
  fileUrl: text("file_url"),
  syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
},
  (t) => [index("payslips_syndicate_id_idx").on(t.syndicateId)],
);

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  price: money("price"),               // monthly price in MAD
  yearlyPrice: money("yearly_price"),  // yearly price in MAD (optional discount)
  interval: text("interval").default("monthly"),
  features: text("features").default("[]"),  // JSON string[]
  // Limits — null = unlimited
  maxBuildings: integer("max_buildings"),
  maxLots: integer("max_lots"),
  maxMembers: integer("max_members"),
  maxStorageGb: integer("max_storage_gb"),
  maxDocuments: integer("max_documents"),
  maxSignatures: integer("max_signatures"),
  maxApartments: integer("max_apartments"),
  maxUsers: integer("max_users"),
  supportLevel: text("support_level"),
  // Flags
  isActive: boolean("is_active").default(true),
  isTrial: boolean("is_trial").default(false),
  sortOrder: integer("sort_order").default(0),
  color: text("color").default("#7c3aed"),
  createdAt: createdAt(),
});

export const syndicateSubscriptionsTable = pgTable("syndicate_subscriptions", {
  id: id(),
  syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "restrict" }).notNull(),
  planId: text("plan_id"),
  status: text("status").default("trial"), // pending_payment | trial | active | grace | suspended | cancelled | expired
  autoRenew: boolean("auto_renew").default(true),
  // Trial period
  trialStartDate: timestamp("trial_start_date"),
  trialEndDate: timestamp("trial_end_date"),
  // Billing period
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  // Lifecycle
  canceledAt: timestamp("canceled_at"),
  gracePeriodEnd: timestamp("grace_period_end"),
  notes: text("notes"),
  activatedAt: timestamp("activated_at"),
  renewalDate: timestamp("renewal_date"),
  createdAt: createdAt(),
},
  (t) => [index("syndicate_subscriptions_syndicate_created_idx").on(t.syndicateId, t.createdAt)],
);

// ─── Billing Invoices ────────────────────────────────────────────────────────

export const billingInvoicesTable = pgTable("billing_invoices", {
  id: id(),
  syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "restrict" }).notNull(),
  subscriptionId: text("subscription_id"),
  amount: money("amount").notNull(),
  status: text("status").default("open"), // open | paid | void | uncollectible
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  description: text("description"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  paymentId: text("payment_id"),
  invoiceNumber: text("invoice_number"),
  createdAt: createdAt(),
},
  (t) => [index("billing_invoices_syndicate_id_idx").on(t.syndicateId)],
);

// ─── SaaS subscription payments ─────────────────────────────────────────────
// One row per payment attempt. This is deliberately separate from resident
// payment proofs and from billing invoices so provider retries/callbacks remain
// auditable without overwriting history.
export const subscriptionPaymentsTable = pgTable(
  "subscription_payments",
  {
    id: id(),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "restrict" }).notNull(),
    subscriptionId: text("subscription_id"),
    planId: text("plan_id").notNull(),
    invoiceId: text("invoice_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("MAD"),
    billingInterval: text("billing_interval").notNull().default("monthly"),
    paymentMethod: text("payment_method").notNull(),
    provider: text("provider"),
    providerReference: text("provider_reference"),
    // pending | processing | succeeded | failed | cancelled | refunded
    status: text("status").notNull().default("pending"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    metadata: jsonb("metadata"),
    processedAt: timestamp("processed_at"),
    cancelledAt: timestamp("cancelled_at"),
    refundedAt: timestamp("refunded_at"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("subscription_payments_idempotency_key_uq").on(t.idempotencyKey),
    index("subscription_payments_syndicate_id_idx").on(t.syndicateId),
    index("subscription_payments_status_idx").on(t.status),
    index("subscription_payments_subscription_id_idx").on(t.subscriptionId),
  ],
);

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
},
  (t) => [index("audit_logs_syndicate_created_idx").on(t.syndicateId, t.createdAt)],
);

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
    // status: pending | sent | failed | skipped (undeliverable address, not attempted)
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    syndicateId: text("syndicate_id"),
    // Rendered body, kept so a failed email can be retried without recomputing
    // the template (e.g. after a transient SMTP outage).
    bodyHtml: text("body_html"),
    // Provider's id when it accepted the message (proof of « sent »).
    providerMessageId: text("provider_message_id"),
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
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
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

// ─── Governance Delegations ─────────────────────────────────────────────────
// A council member may delegate a defined authority to another active council
// member for a bounded period. The copied names keep the historical record
// readable even if a council row is later resigned or removed.
// Official resignation of the syndic or the syndic adjoint (Loi 18-00, art. 26 ter,
// 27, 27 ter): notification date, 30-day general assembly, the adjoint's interim,
// handover of documents and funds. The mandate row stays (status resigned).
export const mandateResignationsTable = pgTable(
  "mandate_resignations",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    mandateId: text("mandate_id").notNull().references(() => conseilSyndicalTable.id, { onDelete: "restrict" }),
    // syndic | vice_syndic
    role: text("role").notNull(),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    reason: text("reason"),
    notifiedAt: date("notified_at").notNull(),
    agDeadline: date("ag_deadline").notNull(),
    agMeetingId: text("ag_meeting_id").references(() => meetingsTable.id, { onDelete: "set null" }),
    interimMandateId: text("interim_mandate_id").references(() => conseilSyndicalTable.id, { onDelete: "set null" }),
    handover: jsonb("handover").notNull().default({}),
    handoverCompletedAt: timestamp("handover_completed_at"),
    // none | no_deputy | no_successor
    escalation: text("escalation").notNull().default("none"),
    // open | closed
    status: text("status").notNull().default("open"),
    successorMandateId: text("successor_mandate_id").references(() => conseilSyndicalTable.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    closedAt: timestamp("closed_at"),
  },
  (t) => [index("mandate_resignations_syndicate_id_idx").on(t.syndicateId)],
);

export const governanceDelegationsTable = pgTable(
  "governance_delegations",
  {
    id: id(),
    syndicateId: text("syndicate_id")
      .notNull()
      .references(() => syndicatesTable.id, { onDelete: "cascade" }),
    delegantId: text("delegant_id").references(() => conseilSyndicalTable.id, {
      onDelete: "set null",
    }),
    delegantName: text("delegant_name").notNull(),
    delegataireId: text("delegataire_id").references(
      () => conseilSyndicalTable.id,
      { onDelete: "set null" },
    ),
    delegataireName: text("delegataire_name").notNull(),
    domaine: text("domaine").notNull(),
    description: text("description").notNull().default(""),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    // active | expired | revoked
    status: text("status").notNull().default("active"),
    createdBy: text("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    revokeReason: text("revoke_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("governance_delegations_syndicate_id_idx").on(t.syndicateId),
    index("governance_delegations_status_idx").on(t.status),
    index("governance_delegations_delegant_id_idx").on(t.delegantId),
    index("governance_delegations_delegataire_id_idx").on(t.delegataireId),
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

// ─── Template Definition System ──────────────────────────────────────────────
// Stores document template metadata, variables, sections, and layout config.
// Platform-wide templates have syndicateId = null; tenant overrides are scoped.

export const templateDefinitionsTable = pgTable(
  "template_definitions",
  {
    id: id(),
    // Slug ties this record back to the pdfmake switch (e.g. "attestation", "pv")
    slug: text("slug").notNull(),
    // category: meeting_minutes | financial | legal | elections | contracts |
    //           certificates | regulations | administrative | maintenance | insurance
    category: text("category").notNull(),
    name: text("name").notNull(),               // JSON: { fr, ar, en, es }
    description: text("description"),           // JSON: { fr, ar, en, es }
    // Structured content (JSON arrays)
    variables: text("variables").default("[]"), // JSON: VariableDef[]
    sections: text("sections").default("[]"),   // JSON: SectionDef[]
    layoutConfig: text("layout_config").default("{}"), // JSON: LayoutConfig
    // status: draft | published | archived | disabled
    status: text("status").notNull().default("draft"),
    // null = platform-wide; set = tenant-specific override
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    languages: text("languages").default('["fr"]'), // JSON: string[]
    currentVersion: integer("current_version").default(1),
    usageCount: integer("usage_count").default(0),
    createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by"),
    publishedAt: timestamp("published_at"),
    archivedAt: timestamp("archived_at"),
    disabledAt: timestamp("disabled_at"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("template_definitions_category_idx").on(t.category),
    index("template_definitions_status_idx").on(t.status),
    index("template_definitions_syndicate_id_idx").on(t.syndicateId),
  ],
);

// Full snapshot of every template save — allows compare & restore
export const templateDefinitionVersionsTable = pgTable(
  "template_definition_versions",
  {
    id: id(),
    templateId: text("template_id").notNull().references(() => templateDefinitionsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: text("snapshot").notNull(),           // JSON: complete template at this version
    changeDescription: text("change_description"),
    createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("template_def_versions_template_id_idx").on(t.templateId),
  ],
);

// Per-role access control for each template
export const templateDefinitionPermissionsTable = pgTable(
  "template_definition_permissions",
  {
    id: id(),
    templateId: text("template_id").notNull().references(() => templateDefinitionsTable.id, { onDelete: "cascade" }),
    // role: super_admin | syndicate_admin | member | tenant | all
    role: text("role").notNull(),
    canUse: boolean("can_use").default(true),
    canEdit: boolean("can_edit").default(false),
    canPublish: boolean("can_publish").default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("template_def_perms_template_id_idx").on(t.templateId),
  ],
);

// ─── Template Request Workflow ────────────────────────────────────────────────
// A syndicate admin can request a new document template from the platform team.
// The request goes through a 5-step review pipeline: pending → in_review →
// approved (design phase) → published globally or per-syndicate, or rejected.

export const templateRequestsTable = pgTable(
  "template_requests",
  {
    id: id(),
    // Syndicate admin who submitted the request
    requestedBy: text("requested_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    // Template description
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    businessPurpose: text("business_purpose"),
    // JSON array of { name, type, required } objects describing each field
    requiredFields: text("required_fields").default("[]"),
    legalNotes: text("legal_notes"),
    // status: pending | in_review | approved | rejected | published
    status: text("status").notNull().default("pending"),
    // Platform admin review
    reviewedBy: text("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    rejectionReason: text("rejection_reason"),
    // "global" = available to all syndicates, "private" = requesting syndicate only
    publishScope: text("publish_scope").default("private"),
    // Priority: low | normal | high | urgent
    priority: text("priority").default("normal"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("template_requests_syndicate_id_idx").on(t.syndicateId),
    index("template_requests_status_idx").on(t.status),
    index("template_requests_requested_by_idx").on(t.requestedBy),
  ],
);

// ─── OTP Tokens ──────────────────────────────────────────────────────────────
// Short-lived 6-digit verification codes for email and phone verification.

export const otpTokensTable = pgTable(
  "otp_tokens",
  {
    id: id(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    purpose: text("purpose").default("email_verification"), // email_verification
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    attempts: integer("attempts").default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("otp_tokens_email_idx").on(t.email),
    index("otp_tokens_expires_at_idx").on(t.expiresAt),
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

// ─── Scheduled job runs ───────────────────────────────────────────────────────
// One row per background job. A run is claimed with an atomic conditional
// upsert on last_run_at, so with several API instances each job executes once
// per interval (and restarts do not re-trigger every job).

export const scheduledJobRunsTable = pgTable("scheduled_job_runs", {
  name: text("name").primaryKey(),
  lastRunAt: timestamp("last_run_at").notNull(),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  lastDurationMs: integer("last_duration_ms"),
});

// ─── Treasury: accounts, journal, payments, expenses, reconciliation ─────────
// Every syndicate owns its accounts; balances are never stored — they are the
// sum of the account's journal entries. Journal entries are append-only (a DB
// trigger refuses UPDATE/DELETE): corrections are posted as reversal entries.

export const treasuryAccountsTable = pgTable(
  "treasury_accounts",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    // Optional: an account dedicated to one building of the syndicate.
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    // bank = compte bancaire du syndicat, cash = caisse (espèces)
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    bankName: text("bank_name"),
    accountHolder: text("account_holder"),
    // Moroccan RIB, 24 digits, digits only. Printed on payment demands so that
    // co-owners can pay — not a secret, but never exposed to residents via API.
    rib: text("rib"),
    currency: text("currency").notNull().default("MAD"),
    // Informative copy of the opening journal entry (reprise de solde).
    openingBalance: money("opening_balance").notNull().default("0"),
    openingDate: date("opening_date").notNull(),
    // active | closed
    status: text("status").notNull().default("active"),
    isDefault: boolean("is_default").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by"),
  },
  (t) => [
    index("treasury_accounts_syndicate_id_idx").on(t.syndicateId),
    uniqueIndex("treasury_accounts_syndicate_rib_uq").on(t.syndicateId, t.rib).where(sql`${t.rib} IS NOT NULL`),
    // At most one default account per kind and syndicate.
    uniqueIndex("treasury_accounts_default_uq").on(t.syndicateId, t.kind).where(sql`${t.isDefault}`),
    check("treasury_accounts_kind_chk", sql`${t.kind} IN ('bank', 'cash')`),
    check("treasury_accounts_status_chk", sql`${t.status} IN ('active', 'closed')`),
    check("treasury_accounts_rib_chk", sql`${t.rib} IS NULL OR ${t.rib} ~ '^[0-9]{24}$'`),
    check("treasury_accounts_currency_chk", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const ledgerEntriesTable = pgTable(
  "ledger_entries",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    accountId: text("account_id").notNull().references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    // Continuous per-syndicate/year number, e.g. JRN-2026-000042.
    entryNumber: text("entry_number").notNull(),
    entryDate: date("entry_date").notNull(),
    // in = encaissement, out = décaissement
    direction: text("direction").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("MAD"),
    category: text("category").notNull(),
    label: text("label").notNull(),
    // Receipt / cheque / transfer / invoice reference
    reference: text("reference"),
    // opening | appel_payment | expense | salary | manual | transfer | reversal
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    reversesEntryId: text("reverses_entry_id").references((): AnyPgColumn => ledgerEntriesTable.id, { onDelete: "restrict" }),
    buildingId: text("building_id"),
    proofUrl: text("proof_url"),
    idempotencyKey: text("idempotency_key"),
    // No FK: the journal must outlive user accounts (same as audit_logs).
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ledger_entries_number_uq").on(t.syndicateId, t.entryNumber),
    index("ledger_entries_syndicate_date_idx").on(t.syndicateId, t.entryDate),
    index("ledger_entries_account_date_idx").on(t.accountId, t.entryDate),
    // A payment event / opening balance is posted at most once. Expenses and
    // salaries are protected by their conditional status transition instead
    // (they may be paid again after a reversal).
    uniqueIndex("ledger_entries_source_uq")
      .on(t.sourceType, t.sourceId)
      .where(sql`${t.sourceType} IN ('opening', 'appel_payment')`),
    // An entry is reversed at most once.
    uniqueIndex("ledger_entries_reverses_uq").on(t.reversesEntryId).where(sql`${t.reversesEntryId} IS NOT NULL`),
    uniqueIndex("ledger_entries_idempotency_uq").on(t.syndicateId, t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`),
    check("ledger_entries_direction_chk", sql`${t.direction} IN ('in', 'out')`),
    check("ledger_entries_amount_chk", sql`${t.amount} > 0`),
    check(
      "ledger_entries_source_type_chk",
      sql`${t.sourceType} IN ('opening', 'appel_payment', 'expense', 'salary', 'manual', 'transfer', 'reversal')`,
    ),
  ],
);

/** One row per payment declared on a call for funds (history is kept). */
export const appelPaymentsTable = pgTable(
  "appel_payments",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    appelId: text("appel_id").notNull().references(() => appelsDeFondsTable.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    // virement | cheque | especes
    method: text("method").notNull(),
    // Transfer reference or cheque number given by the payer
    reference: text("reference"),
    proofUrl: text("proof_url"),
    notes: text("notes"),
    // pending | validated | rejected | reversed
    status: text("status").notNull().default("pending"),
    declaredBy: text("declared_by").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    rejectionReason: text("rejection_reason"),
    accountId: text("account_id").references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    ledgerEntryId: text("ledger_entry_id").references(() => ledgerEntriesTable.id, { onDelete: "restrict" }),
    receiptNumber: text("receipt_number"),
    createdAt: createdAt(),
  },
  (t) => [
    index("appel_payments_syndicate_id_idx").on(t.syndicateId),
    index("appel_payments_appel_id_idx").on(t.appelId),
    // At most one payment under review per call for funds.
    uniqueIndex("appel_payments_one_pending_uq").on(t.appelId).where(sql`${t.status} = 'pending'`),
    uniqueIndex("appel_payments_receipt_uq").on(t.syndicateId, t.receiptNumber).where(sql`${t.receiptNumber} IS NOT NULL`),
    check("appel_payments_amount_chk", sql`${t.amount} > 0`),
    check("appel_payments_method_chk", sql`${t.method} IN ('virement', 'cheque', 'especes')`),
    check("appel_payments_status_chk", sql`${t.status} IN ('pending', 'validated', 'rejected', 'reversed')`),
  ],
);

/**
 * Syndicate expenses: draft → submitted → approved → paid (or rejected /
 * cancelled). "approved" is a commitment (engagement); "paid" means the
 * supplier was paid and the journal entry posted — the two are separate.
 */
export const expensesTable = pgTable(
  "expenses",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    // DEP-2026-0001
    reference: text("reference").notNull(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("MAD"),
    supplierName: text("supplier_name"),
    prestataireId: text("prestataire_id").references(() => prestatairesTable.id, { onDelete: "set null" }),
    invoiceNumber: text("invoice_number"),
    invoiceDate: date("invoice_date"),
    // Uploaded invoice / justification (/objects/… of this syndicate)
    proofUrl: text("proof_url").notNull(),
    budgetLineId: text("budget_line_id").references(() => budgetLinesTable.id, { onDelete: "set null" }),
    // Set when the expense comes from a validated work order (one per work order)
    travauxId: text("travaux_id").references(() => travauxTable.id, { onDelete: "set null" }),
    // draft | submitted | approved | rejected | paid | cancelled
    status: text("status").notNull().default("submitted"),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at"),
    rejectionReason: text("rejection_reason"),
    paidBy: text("paid_by"),
    paidAt: timestamp("paid_at"),
    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    accountId: text("account_id").references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    ledgerEntryId: text("ledger_entry_id").references(() => ledgerEntriesTable.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key"),
    createdAt: createdAt(),
  },
  (t) => [
    index("expenses_syndicate_status_idx").on(t.syndicateId, t.status),
    index("expenses_budget_line_id_idx").on(t.budgetLineId),
    uniqueIndex("expenses_reference_uq").on(t.syndicateId, t.reference),
    uniqueIndex("expenses_travaux_uq").on(t.travauxId).where(sql`${t.travauxId} IS NOT NULL`),
    uniqueIndex("expenses_idempotency_uq").on(t.syndicateId, t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`),
    check("expenses_amount_chk", sql`${t.amount} > 0`),
    check("expenses_status_chk", sql`${t.status} IN ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled')`),
    check(
      "expenses_payment_method_chk",
      sql`${t.paymentMethod} IS NULL OR ${t.paymentMethod} IN ('virement', 'cheque', 'especes', 'prelevement')`,
    ),
  ],
);

/**
 * A bank statement as issued by the bank: period and the opening / closing
 * balances printed on it. It is the source record a reconciliation is checked
 * against; it can only be closed when its lines add up and every line is
 * explained (see routes/treasury.ts).
 */
export const bankStatementsTable = pgTable(
  "bank_statements",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    accountId: text("account_id").notNull().references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    // Statement number printed by the bank (optional)
    reference: text("reference"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    // Signed balances as printed by the bank
    openingBalance: money("opening_balance").notNull(),
    closingBalance: money("closing_balance").notNull(),
    // open | closed
    status: text("status").notNull().default("open"),
    // Reconciliation report frozen at closing (figures and outstanding items)
    closingReport: jsonb("closing_report"),
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at"),
    reopenedBy: text("reopened_by"),
    reopenedAt: timestamp("reopened_at"),
    reopenReason: text("reopen_reason"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("bank_statements_account_period_idx").on(t.accountId, t.periodEnd),
    uniqueIndex("bank_statements_account_start_uq").on(t.accountId, t.periodStart),
    check("bank_statements_status_chk", sql`${t.status} IN ('open', 'closed')`),
    check("bank_statements_period_chk", sql`${t.periodEnd} >= ${t.periodStart}`),
  ],
);

/** Bank statement lines imported for reconciliation (signed amounts). */
export const bankStatementLinesTable = pgTable(
  "bank_statement_lines",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    accountId: text("account_id").notNull().references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    // Statement the line was printed on (null: imported without a statement)
    statementId: text("statement_id").references(() => bankStatementsTable.id, { onDelete: "restrict" }),
    valueDate: date("value_date").notNull(),
    // > 0 credit (money in), < 0 debit (money out)
    amount: money("amount").notNull(),
    label: text("label").notNull(),
    reference: text("reference"),
    // Stable identity of the line: re-importing the same statement is a no-op.
    externalId: text("external_id").notNull(),
    // unmatched | partial | matched | anomaly | ignored
    status: text("status").notNull().default("unmatched"),
    matchedAmount: money("matched_amount").notNull().default("0"),
    note: text("note"),
    importBatchId: text("import_batch_id"),
    importedBy: text("imported_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("bank_statement_lines_external_uq").on(t.accountId, t.externalId),
    index("bank_statement_lines_account_status_idx").on(t.accountId, t.status),
    index("bank_statement_lines_statement_idx").on(t.statementId),
    check("bank_statement_lines_amount_chk", sql`${t.amount} <> 0`),
    check(
      "bank_statement_lines_status_chk",
      sql`${t.status} IN ('unmatched', 'partial', 'matched', 'anomaly', 'ignored')`,
    ),
    check("bank_statement_lines_matched_chk", sql`${t.matchedAmount} >= 0 AND ${t.matchedAmount} <= abs(${t.amount})`),
  ],
);

/** Links a statement line to the journal entries it settles. */
export const reconciliationMatchesTable = pgTable(
  "reconciliation_matches",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    statementLineId: text("statement_line_id").notNull().references(() => bankStatementLinesTable.id, { onDelete: "restrict" }),
    ledgerEntryId: text("ledger_entry_id").notNull().references(() => ledgerEntriesTable.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    matchedBy: text("matched_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reconciliation_matches_pair_uq").on(t.statementLineId, t.ledgerEntryId),
    index("reconciliation_matches_ledger_entry_idx").on(t.ledgerEntryId),
    check("reconciliation_matches_amount_chk", sql`${t.amount} > 0`),
  ],
);

// ─── Lot ownership (co-ownership, shares, history) ──────────────────────────
// One row per owner and period. Current owners have no end_date; a transfer
// closes rows instead of rewriting them, so history (and the debts issued to
// the previous owner) stays intact.

export const lotOwnershipsTable = pgTable(
  "lot_ownerships",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "restrict" }),
    memberId: text("member_id").notNull().references(() => membersTable.id, { onDelete: "restrict" }),
    // Share of the lot, in percent (co-owners' current shares sum to 100).
    sharePercent: numeric("share_percent", { precision: 5, scale: 2 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    endReason: text("end_reason"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("lot_ownerships_lot_id_idx").on(t.lotId),
    index("lot_ownerships_member_id_idx").on(t.memberId),
    index("lot_ownerships_syndicate_id_idx").on(t.syndicateId),
    uniqueIndex("lot_ownerships_current_uq").on(t.lotId, t.memberId).where(sql`${t.endDate} IS NULL`),
    check("lot_ownerships_share_chk", sql`${t.sharePercent} > 0 AND ${t.sharePercent} <= 100`),
    check("lot_ownerships_dates_chk", sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
  ],
);

// ─── Syndic companies & per-condominium assignments ─────────────────────────
// A syndic company (organization) manages several condominiums (syndicates).
// org_admin: manages every condominium of the company (acts as
// syndicate_admin in each). org_staff: only the condominiums they are
// assigned to, with the role of each assignment.

export const organizationsTable = pgTable(
  "organizations",
  {
    id: id(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    iceNumber: text("ice_number"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    // active | suspended
    status: text("status").notNull().default("active"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [check("organizations_status_chk", sql`${t.status} IN ('active', 'suspended')`)],
);

export const organizationMembersTable = pgTable(
  "organization_members",
  {
    id: id(),
    organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    // org_admin | org_staff
    role: text("role").notNull(),
    // active | revoked (rows are kept for the audit trail)
    status: text("status").notNull().default("active"),
    grantedBy: text("granted_by"),
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("organization_members_user_idx").on(t.userId),
    uniqueIndex("organization_members_active_uq").on(t.organizationId, t.userId).where(sql`${t.status} = 'active'`),
    check("organization_members_role_chk", sql`${t.role} IN ('org_admin', 'org_staff')`),
    check("organization_members_status_chk", sql`${t.status} IN ('active', 'revoked')`),
  ],
);

/** A person's role in one condominium, in addition to their home context. */
export const syndicateMembershipsTable = pgTable(
  "syndicate_memberships",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    // syndicate_admin | president | treasurer | secretary | committee_member
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    grantedBy: text("granted_by"),
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by"),
    revokeReason: text("revoke_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("syndicate_memberships_user_idx").on(t.userId),
    index("syndicate_memberships_syndicate_idx").on(t.syndicateId),
    uniqueIndex("syndicate_memberships_active_uq").on(t.syndicateId, t.userId).where(sql`${t.status} = 'active'`),
    check(
      "syndicate_memberships_role_chk",
      sql`${t.role} IN ('syndicate_admin', 'president', 'treasurer', 'secretary', 'committee_member')`,
    ),
    check("syndicate_memberships_status_chk", sql`${t.status} IN ('active', 'revoked')`),
  ],
);

// ─── Claims & incidents (réclamations de copropriété) ────────────────────────
// A resident (or the team) reports a problem; the team qualifies, assigns,
// follows up and resolves it. Every action is an immutable claim_events row:
// reopening or reassigning never rewrites history. The legacy HR-style
// "reclamations" table is kept read-only for its history.

export const claimsTable = pgTable(
  "claims",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    // RCL-2026-000001, sequential per condominium
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // fuite_eau | ascenseur | eclairage | electricite | bruit | proprete |
    // securite | parties_communes | stationnement | autre
    category: text("category").notNull(),
    // common = common areas · unit = a lot the reporter owns / rents
    scope: text("scope").notNull().default("common"),
    buildingId: text("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    lotId: text("lot_id").references(() => lotsTable.id, { onDelete: "set null" }),
    location: text("location").notNull(),
    // received | qualified | assigned | in_progress | awaiting_info | resolved | closed | rejected
    status: text("status").notNull().default("received"),
    // Status before "awaiting_info" (the claim returns there once answered)
    statusBeforeInfo: text("status_before_info"),
    // urgent | high | normal | low
    priority: text("priority").notNull().default("normal"),
    // Deadline from the priority (see lib/claims.ts); open past it = overdue
    dueAt: timestamp("due_at").notNull(),
    reporterUserId: text("reporter_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    reporterName: text("reporter_name").notNull(),
    // Responsible party: a team member of the condominium and/or a provider
    assigneeUserId: text("assignee_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    prestataireId: text("prestataire_id").references(() => prestatairesTable.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at"),
    assignedBy: text("assigned_by"),
    // Intervention planned (date + instructions are internal; the date is shown)
    scheduledFor: timestamp("scheduled_for"),
    travauxId: text("travaux_id").references(() => travauxTable.id, { onDelete: "set null" }),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by"),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by"),
    rejectionReason: text("rejection_reason"),
    reopenCount: integer("reopen_count").notNull().default(0),
    // Optimistic concurrency: every change increments it
    version: integer("version").notNull().default(1),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("claims_reference_uq").on(t.syndicateId, t.reference),
    uniqueIndex("claims_idempotency_uq").on(t.syndicateId, t.reporterUserId, t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`),
    index("claims_syndicate_status_idx").on(t.syndicateId, t.status),
    index("claims_reporter_idx").on(t.reporterUserId),
    index("claims_assignee_idx").on(t.assigneeUserId),
    check("claims_status_chk", sql`${t.status} IN ('received', 'qualified', 'assigned', 'in_progress', 'awaiting_info', 'resolved', 'closed', 'rejected')`),
    check("claims_priority_chk", sql`${t.priority} IN ('urgent', 'high', 'normal', 'low')`),
    check("claims_scope_chk", sql`${t.scope} IN ('common', 'unit')`),
    check("claims_unit_lot_chk", sql`${t.scope} = 'common' OR ${t.lotId} IS NOT NULL`),
    check(
      "claims_category_chk",
      sql`${t.category} IN ('fuite_eau', 'ascenseur', 'eclairage', 'electricite', 'bruit', 'proprete', 'securite', 'parties_communes', 'stationnement', 'autre')`,
    ),
    check("claims_resolved_chk", sql`${t.status} NOT IN ('resolved', 'closed') OR (${t.resolution} IS NOT NULL AND ${t.resolvedAt} IS NOT NULL)`),
  ],
);

/** Immutable history of a claim (status changes, comments, assignments…). */
export const claimEventsTable = pgTable(
  "claim_events",
  {
    id: id(),
    claimId: text("claim_id").notNull().references(() => claimsTable.id, { onDelete: "restrict" }),
    syndicateId: text("syndicate_id").notNull(),
    // created | status | comment | assigned | priority | info_requested |
    // info_provided | scheduled | work | attachment | resolved | closed |
    // reopened | rejected | confirmed
    type: text("type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    body: text("body"),
    // Internal = team only (never sent to the resident)
    internal: boolean("internal").notNull().default(false),
    data: jsonb("data"),
    authorId: text("author_id"),
    authorName: text("author_name"),
    // Client request id (Idempotency-Key): a retried request adds nothing
    requestKey: text("request_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("claim_events_claim_idx").on(t.claimId, t.createdAt),
    uniqueIndex("claim_events_request_uq").on(t.claimId, t.requestKey).where(sql`${t.requestKey} IS NOT NULL`),
  ],
);

export const claimAttachmentsTable = pgTable(
  "claim_attachments",
  {
    id: id(),
    claimId: text("claim_id").notNull().references(() => claimsTable.id, { onDelete: "restrict" }),
    syndicateId: text("syndicate_id").notNull(),
    objectPath: text("object_path").notNull(),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    internal: boolean("internal").notNull().default(false),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("claim_attachments_claim_idx").on(t.claimId),
    uniqueIndex("claim_attachments_object_uq").on(t.objectPath),
  ],
);

/** One delivery per (event, recipient): retries never notify twice. */
export const claimNotificationsTable = pgTable(
  "claim_notifications",
  {
    id: id(),
    eventId: text("event_id").notNull().references(() => claimEventsTable.id, { onDelete: "restrict" }),
    claimId: text("claim_id").notNull(),
    syndicateId: text("syndicate_id").notNull(),
    // No FK: a failed delivery to a removed account stays visible as failed.
    userId: text("user_id").notNull(),
    // pending | sent | failed
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    alertId: text("alert_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (t) => [
    uniqueIndex("claim_notifications_event_user_uq").on(t.eventId, t.userId),
    index("claim_notifications_status_idx").on(t.syndicateId, t.status),
    check("claim_notifications_status_chk", sql`${t.status} IN ('pending', 'sent', 'failed')`),
  ],
);

// ─── Charge allocation (clés de répartition) ─────────────────────────────────
// A key says HOW an amount is shared between the lots of a building, for which
// expense / budget categories, from which date. Its content lives in immutable
// versions: a version used by a finalized allocation is never edited, a change
// is a new version from a later date. An allocation is the persisted result
// of one calculation (inputs, key versions, lines) and the calls for funds it
// issued through the existing workflow (appels_de_fonds.allocation_id).

export const allocationKeysTable = pgTable(
  "allocation_keys",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "restrict" }),
    // Short code, unique per building (e.g. GEN, ASC, ESC-B)
    code: text("code").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose"),
    // active | archived
    status: text("status").notNull().default("active"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("allocation_keys_code_uq").on(t.buildingId, sql`lower(${t.code})`),
    check("allocation_keys_status_chk", sql`${t.status} IN ('active', 'archived')`),
  ],
);

export const allocationKeyVersionsTable = pgTable(
  "allocation_key_versions",
  {
    id: id(),
    keyId: text("key_id").notNull().references(() => allocationKeysTable.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    // shares = each lot's explicit coefficient · equal = same share for each listed lot
    method: text("method").notNull(),
    // Budget-line / expense categories this key applies to
    categories: text("categories").array().notNull(),
    effectiveFrom: date("effective_from").notNull(),
    // Set when a later version takes over (day before its start)
    effectiveTo: date("effective_to"),
    // Where the rule comes from (règlement de copropriété, décision d'AG…)
    sourceReference: text("source_reference").notNull(),
    changeReason: text("change_reason"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("allocation_key_versions_uq").on(t.keyId, t.version),
    check("allocation_key_versions_method_chk", sql`${t.method} IN ('shares', 'equal')`),
    check("allocation_key_versions_dates_chk", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
  ],
);

/** One row per lot of the building: a coefficient, or an explicit exclusion with its reason. */
export const allocationKeySharesTable = pgTable(
  "allocation_key_shares",
  {
    id: id(),
    versionId: text("version_id").notNull().references(() => allocationKeyVersionsTable.id, { onDelete: "restrict" }),
    lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "restrict" }),
    // Up to 6 decimals; null when the lot is excluded
    coefficient: numeric("coefficient", { precision: 18, scale: 6 }),
    excluded: boolean("excluded").notNull().default(false),
    exclusionReason: text("exclusion_reason"),
  },
  (t) => [
    uniqueIndex("allocation_key_shares_uq").on(t.versionId, t.lotId),
    check("allocation_key_shares_coef_chk", sql`${t.coefficient} IS NULL OR ${t.coefficient} >= 0`),
    check(
      "allocation_key_shares_excluded_chk",
      sql`(${t.excluded} AND ${t.coefficient} IS NULL AND ${t.exclusionReason} IS NOT NULL) OR (NOT ${t.excluded} AND ${t.coefficient} IS NOT NULL)`,
    ),
  ],
);

export const allocationsTable = pgTable(
  "allocations",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    buildingId: text("building_id").notNull().references(() => buildingsTable.id, { onDelete: "restrict" }),
    // ALC-2026-000001
    reference: text("reference").notNull(),
    period: text("period").notNull(),
    // Type of the calls for funds issued (charges_courantes, fonds_reserve, appel_special)
    chargeType: text("charge_type").notNull(),
    // draft (saved preview, no obligation) | finalized (published) | corrected | reversed
    status: text("status").notNull().default("finalized"),
    totalAmount: money("total_amount").notNull(),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    publishedAt: timestamp("published_at"),
    publishedBy: text("published_by"),
    // Everything the calculation used (sources, key versions, coefficients,
    // rounding rule): enough to reproduce it without reading live data.
    inputs: jsonb("inputs").notNull(),
    inputsHash: text("inputs_hash").notNull(),
    idempotencyKey: text("idempotency_key"),
    // Correction: the allocation this one replaces
    correctionOf: text("correction_of").references((): AnyPgColumn => allocationsTable.id, { onDelete: "restrict" }),
    correctionReason: text("correction_reason"),
    endedAt: timestamp("ended_at"),
    endedBy: text("ended_by"),
    endReason: text("end_reason"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("allocations_reference_uq").on(t.syndicateId, t.reference),
    uniqueIndex("allocations_idempotency_uq").on(t.syndicateId, t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`),
    index("allocations_building_period_idx").on(t.buildingId, t.period),
    check("allocations_status_chk", sql`${t.status} IN ('draft', 'finalized', 'corrected', 'reversed')`),
    check("allocations_dates_chk", sql`${t.dueDate} IS NULL OR ${t.issueDate} IS NULL OR ${t.dueDate} >= ${t.issueDate}`),
  ],
);

/** A source (budget line for a period, or an expense) is allocated once while its allocation stands. */
export const allocationSourcesTable = pgTable(
  "allocation_sources",
  {
    id: id(),
    allocationId: text("allocation_id").notNull().references(() => allocationsTable.id, { onDelete: "restrict" }),
    // budget_line | budget_total | expense
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    // budget lines are allocated per period; expenses once ("-")
    period: text("period").notNull(),
    chargeType: text("charge_type").notNull(),
    label: text("label").notNull(),
    category: text("category"),
    amount: money("amount").notNull(),
    keyVersionId: text("key_version_id").references(() => allocationKeyVersionsTable.id, { onDelete: "restrict" }),
    // false once the allocation is corrected / reversed (the source is free again)
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("allocation_sources_active_uq").on(t.sourceType, t.sourceId, t.period, t.chargeType).where(sql`${t.active}`),
    index("allocation_sources_allocation_idx").on(t.allocationId),
  ],
);

export const allocationLinesTable = pgTable(
  "allocation_lines",
  {
    id: id(),
    allocationId: text("allocation_id").notNull().references(() => allocationsTable.id, { onDelete: "restrict" }),
    sourceId: text("source_id").notNull().references(() => allocationSourcesTable.id, { onDelete: "restrict" }),
    lotId: text("lot_id").notNull().references(() => lotsTable.id, { onDelete: "restrict" }),
    coefficient: numeric("coefficient", { precision: 18, scale: 6 }).notNull(),
    denominator: numeric("denominator", { precision: 24, scale: 6 }).notNull(),
    amount: money("amount").notNull(),
    // Cents added by the residual rule (0 or 0.01 per line)
    roundingAdjustment: money("rounding_adjustment").notNull().default("0"),
    explanation: text("explanation").notNull(),
  },
  (t) => [index("allocation_lines_allocation_lot_idx").on(t.allocationId, t.lotId)],
);

/**
 * Controlled change of one obligation's amount (wrong figure, unit situation
 * changed…). The obligation keeps its original amount and payments; the new
 * amount can never go below what was already paid.
 */
export const appelAdjustmentsTable = pgTable(
  "appel_adjustments",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    appelId: text("appel_id").notNull().references(() => appelsDeFondsTable.id, { onDelete: "restrict" }),
    previousAmount: money("previous_amount").notNull(),
    newAmount: money("new_amount").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("appel_adjustments_appel_idx").on(t.appelId),
    check("appel_adjustments_amount_chk", sql`${t.newAmount} > 0 AND ${t.newAmount} <> ${t.previousAmount}`),
  ],
);

/** Reminders actually sent for an obligation (one automatic overdue reminder at most). */
export const appelRemindersTable = pgTable(
  "appel_reminders",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "restrict" }),
    appelId: text("appel_id").notNull().references(() => appelsDeFondsTable.id, { onDelete: "restrict" }),
    // overdue (automatic, once) | manual (by the finance team)
    kind: text("kind").notNull(),
    remaining: money("remaining").notNull(),
    recipients: integer("recipients").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("appel_reminders_appel_idx").on(t.appelId, t.createdAt),
    uniqueIndex("appel_reminders_overdue_uq").on(t.appelId).where(sql`${t.kind} = 'overdue'`),
    check("appel_reminders_kind_chk", sql`${t.kind} IN ('overdue', 'manual')`),
  ],
);

// ─── Organizational structure (migration 0021) ───────────────────────────────
// Statutory bodies, optional internal committees and custom components of a
// condominium, their positions and assigned members. An assignment never
// changes users.role: committee permissions only open the committee workspace.

export const orgStructuresTable = pgTable(
  "org_structures",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    // draft | active
    status: text("status").notNull().default("draft"),
    template: text("template"),
    profile: jsonb("profile").notNull().default({}),
    version: integer("version").notNull().default(0),
    activatedAt: timestamp("activated_at"),
    activatedBy: text("activated_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_structures_syndicate_idx").on(t.syndicateId)],
);

export const orgStructureVersionsTable = pgTable("org_structure_versions", {
  id: id(),
  structureId: text("structure_id").notNull().references(() => orgStructuresTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  reason: text("reason"),
  decisionMeetingId: text("decision_meeting_id").references(() => meetingsTable.id, { onDelete: "set null" }),
  createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const orgComponentsTable = pgTable(
  "org_components",
  {
    id: id(),
    structureId: text("structure_id").notNull().references(() => orgStructuresTable.id, { onDelete: "cascade" }),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    // statutory | committee | custom
    category: text("category").notNull(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    objectives: text("objectives"),
    responsibilities: text("responsibilities").array().notNull().default(sql`'{}'::text[]`),
    // active | inactive | closed
    status: text("status").notNull().default("active"),
    reportingFrequency: text("reporting_frequency"),
    // members | team | component
    visibility: text("visibility").notNull().default("members"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    closeReason: text("close_reason"),
    closedAt: timestamp("closed_at"),
    decisionMeetingId: text("decision_meeting_id").references(() => meetingsTable.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("org_components_structure_idx").on(t.structureId), index("org_components_syndicate_idx").on(t.syndicateId)],
);

export const orgPositionsTable = pgTable(
  "org_positions",
  {
    id: id(),
    componentId: text("component_id").notNull().references(() => orgComponentsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    responsibilities: text("responsibilities").array().notNull().default(sql`'{}'::text[]`),
    permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
    scope: text("scope"),
    isLeader: boolean("is_leader").notNull().default(false),
    maxHolders: integer("max_holders"),
    // active | inactive
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("org_positions_component_idx").on(t.componentId)],
);

export const orgAssignmentsTable = pgTable(
  "org_assignments",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    componentId: text("component_id").notNull().references(() => orgComponentsTable.id, { onDelete: "cascade" }),
    positionId: text("position_id").notNull().references(() => orgPositionsTable.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
    // holder | substitute
    kind: text("kind").notNull().default("holder"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    // active | ended
    status: text("status").notNull().default("active"),
    endReason: text("end_reason"),
    replacedBy: text("replaced_by"),
    decisionMeetingId: text("decision_meeting_id").references(() => meetingsTable.id, { onDelete: "set null" }),
    decisionDocumentId: text("decision_document_id").references(() => documentsTable.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("org_assignments_component_idx").on(t.componentId), index("org_assignments_user_idx").on(t.userId)],
);

export const orgTasksTable = pgTable(
  "org_tasks",
  {
    id: id(),
    syndicateId: text("syndicate_id").notNull().references(() => syndicatesTable.id, { onDelete: "cascade" }),
    componentId: text("component_id").notNull().references(() => orgComponentsTable.id, { onDelete: "cascade" }),
    // task | recommendation | report
    kind: text("kind").notNull().default("task"),
    title: text("title").notNull(),
    description: text("description"),
    // open | in_progress | done | cancelled
    status: text("status").notNull().default("open"),
    assigneeUserId: text("assignee_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    // accepted | declined: the syndic's decision on a recommendation
    syndicResponse: text("syndic_response"),
    syndicResponseNote: text("syndic_response_note"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("org_tasks_component_idx").on(t.componentId)],
);
