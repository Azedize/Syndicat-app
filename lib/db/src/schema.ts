import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

const createdAt = () => timestamp("created_at").defaultNow();

// ─── Syndicates ─────────────────────────────────────────────────────────────

export const syndicatesTable = pgTable("syndicates", {
  id: id(),
  name: text("name").notNull(),
  sector: text("sector"),
  region: text("region"),
  adminId: text("admin_id"),
  status: text("status").default("active"),
  membersCount: integer("members_count").default(0),
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
    surfaceM2: doublePrecision("surface_m2"),
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
    monthlyRent: doublePrecision("monthly_rent"),
    depositAmount: doublePrecision("deposit_amount"),
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
    totalAmount: doublePrecision("total_amount").default(0),
    chargesAmount: doublePrecision("charges_amount").default(0),
    fondsReserve: doublePrecision("fonds_reserve").default(0),
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
    amountAnnual: doublePrecision("amount_annual").default(0),
    amountQ1: doublePrecision("amount_q1"),
    amountQ2: doublePrecision("amount_q2"),
    amountQ3: doublePrecision("amount_q3"),
    amountQ4: doublePrecision("amount_q4"),
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
    amount: doublePrecision("amount").notNull(),
    dueDate: text("due_date"),
    status: text("status").default("pending"),
    paymentMethod: text("payment_method"),
    proofUrl: text("proof_url"),
    notes: text("notes"),
    paidDate: text("paid_date"),
    receiptNumber: text("receipt_number"),
    createdAt: createdAt(),
  },
  (t) => [
    index("appels_building_id_idx").on(t.buildingId),
    index("appels_owner_id_idx").on(t.ownerId),
    index("appels_status_idx").on(t.status),
    index("appels_due_date_idx").on(t.dueDate),
  ],
);

// ─── Finance ────────────────────────────────────────────────────────────────

export const transactionsTable = pgTable(
  "transactions",
  {
    id: id(),
    type: text("type").notNull(),
    amount: doublePrecision("amount").notNull(),
    label: text("label").notNull(),
    date: text("date").notNull(),
    status: text("status").default("paid"),
    memberId: text("member_id"),
    syndicateId: text("syndicate_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_syndicate_id_idx").on(t.syndicateId),
    index("transactions_member_id_idx").on(t.memberId),
    index("transactions_status_idx").on(t.status),
  ],
);

export const salaryRecordsTable = pgTable(
  "salary_records",
  {
    id: id(),
    employee: text("employee").notNull(),
    role: text("role").notNull(),
    amount: doublePrecision("amount").notNull(),
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
    amount: doublePrecision("amount").notNull(),
    type: text("type").notNull(),
    date: text("date").notNull(),
    category: text("category").default(""),
    syndicateId: text("syndicate_id").references(() => syndicatesTable.id, { onDelete: "cascade" }),
    balance: doublePrecision("balance"),
    createdAt: createdAt(),
  },
  (t) => [index("caisse_entries_syndicate_id_idx").on(t.syndicateId)],
);

export const invoicesTable = pgTable("invoices", {
  id: id(),
  reference: text("reference").notNull(),
  type: text("type").default("facture"),
  recipient: text("recipient").notNull(),
  date: text("date").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").default("draft"),
  amount: doublePrecision("amount").default(0),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const invoiceItemsTable = pgTable(
  "invoice_items",
  {
    id: id(),
    invoiceId: text("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
  },
  (t) => [index("invoice_items_invoice_id_idx").on(t.invoiceId)],
);

export const bonsLivraisonTable = pgTable("bons_livraison", {
  id: id(),
  reference: text("reference").notNull(),
  recipient: text("recipient").notNull(),
  date: text("date").notNull(),
  type: text("type").default("sortie"),
  total: doublePrecision("total").default(0),
  status: text("status").default("draft"),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const bonItemsTable = pgTable(
  "bon_items",
  {
    id: id(),
    bonId: text("bon_id").notNull().references(() => bonsLivraisonTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    unitPrice: doublePrecision("unit_price").notNull(),
  },
  (t) => [index("bon_items_bon_id_idx").on(t.bonId)],
);

// ─── Prestataires, Contrats, Travaux, Sinistres ────────────────────────────

export const prestatairesTable = pgTable("prestataires", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  ice: text("ice"),
  rc: text("rc"),
  buildingId: text("building_id"),
  syndicateId: text("syndicate_id"),
  status: text("status").default("active"),
  rating: doublePrecision("rating"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const contratsPrestatairesTable = pgTable("contrats_prestataires", {
  id: id(),
  prestataireId: text("prestataire_id").notNull(),
  buildingId: text("building_id").notNull(),
  title: text("title").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  monthlyAmount: doublePrecision("monthly_amount"),
  annualAmount: doublePrecision("annual_amount"),
  status: text("status").default("active"),
  autoRenew: boolean("auto_renew").default(false),
  documentUrl: text("document_url"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const travauxTable = pgTable(
  "travaux",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").default("entretien"),
    priority: text("priority").default("normal"),
    status: text("status").default("reported"),
    buildingId: text("building_id").notNull(),
    lotId: text("lot_id"),
    prestataireId: text("prestataire_id"),
    reportedById: text("reported_by_id"),
    reportedByName: text("reported_by_name"),
    assignedById: text("assigned_by_id"),
    estimatedAmount: doublePrecision("estimated_amount"),
    actualAmount: doublePrecision("actual_amount"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    completedAt: timestamp("completed_at"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("travaux_building_id_idx").on(t.buildingId),
    index("travaux_status_idx").on(t.status),
    index("travaux_priority_idx").on(t.priority),
  ],
);

export const sinistresTable = pgTable(
  "sinistres",
  {
    id: id(),
    buildingId: text("building_id").notNull(),
    lotId: text("lot_id"),
    type: text("type").notNull(),
    description: text("description").notNull(),
    date: text("date").notNull(),
    estimatedAmount: doublePrecision("estimated_amount"),
    indemnisedAmount: doublePrecision("indemnised_amount"),
    claimNumber: text("claim_number"),
    status: text("status").default("declared"),
    reportedById: text("reported_by_id"),
    reportedByName: text("reported_by_name"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sinistres_building_id_idx").on(t.buildingId),
    index("sinistres_status_idx").on(t.status),
  ],
);

// ─── Elections ──────────────────────────────────────────────────────────────

export const electionsTable = pgTable("elections", {
  id: id(),
  syndicateId: text("syndicate_id"),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: text("status").default("upcoming"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

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

export const meetingsTable = pgTable("meetings", {
  id: id(),
  syndicateId: text("syndicate_id"),
  title: text("title").notNull(),
  date: text("date").notNull(),
  time: text("time"),
  location: text("location"),
  type: text("type").default("general"),
  description: text("description"),
  agenda: text("agenda"),
  status: text("status").default("scheduled"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

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

export const publicationsTable = pgTable("publications", {
  id: id(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").default(""),
  pinned: boolean("pinned").default(false),
  syndicateId: text("syndicate_id"),
  authorId: text("author_id"),
  authorName: text("author_name"),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  createdAt: createdAt(),
});

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
  publicationId: text("publication_id").notNull(),
  authorId: text("author_id"),
  authorName: text("author_name"),
  userId: text("user_id"),
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

export const documentsTable = pgTable("documents", {
  id: id(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  content: text("content"),
  status: text("status").default("published"),
  syndicateId: text("syndicate_id"),
  size: text("size"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

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

export const productsTable = pgTable("products", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").default(""),
  price: doublePrecision("price").notNull(),
  category: text("category").notNull(),
  stock: integer("stock").default(0),
  syndicateId: text("syndicate_id"),
  sellerId: text("seller_id"),
  sellerName: text("seller_name"),
  status: text("status").default("available"),
  createdAt: createdAt(),
});

export const cartItemsTable = pgTable("cart_items", {
  id: id(),
  userId: text("user_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name"),
  price: doublePrecision("price"),
  sellerName: text("seller_name"),
  quantity: integer("quantity").default(1),
  createdAt: createdAt(),
});

export const ordersTable = pgTable("orders", {
  id: id(),
  productId: text("product_id"),
  productName: text("product_name"),
  buyerId: text("buyer_id"),
  buyerName: text("buyer_name"),
  sellerId: text("seller_id"),
  sellerName: text("seller_name"),
  amount: doublePrecision("amount"),
  status: text("status").default("pending"),
  type: text("type").default("purchase"),
  date: text("date"),
  createdAt: createdAt(),
});

export const reviewsTable = pgTable("reviews", {
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
});

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
    amount: doublePrecision("amount").notNull(),
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
    amount: doublePrecision("amount"),
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
  amount: doublePrecision("amount"),
  fileUrl: text("file_url"),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: id(),
  name: text("name").notNull(),
  price: doublePrecision("price"),
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
  syndicateId: text("syndicate_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: createdAt(),
});
