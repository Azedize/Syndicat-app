import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  primaryKey,
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

export const usersTable = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  syndicateId: text("syndicate_id"),
  pushToken: text("push_token"),
  profession: text("profession"),
  avatar: text("avatar"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const refreshTokensTable = pgTable("refresh_tokens", {
  id: id(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: createdAt(),
});

export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: id(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: createdAt(),
});

// ─── Members ────────────────────────────────────────────────────────────────

export const membersTable = pgTable("members", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").default(""),
  profession: text("profession").default(""),
  syndicateId: text("syndicate_id"),
  status: text("status").default("active"),
  cotisationStatus: text("cotisation_status").default("pending"),
  joinDate: text("join_date"),
  createdAt: createdAt(),
});

// ─── Real Estate: Buildings, Lots, Tenants ──────────────────────────────────

export const buildingsTable = pgTable("buildings", {
  id: id(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").default("Casablanca"),
  type: text("type").default("residential"),
  totalFloors: integer("total_floors").default(0),
  totalLots: integer("total_lots").default(0),
  constructionYear: integer("construction_year"),
  syndicateId: text("syndicate_id"),
  adminId: text("admin_id"),
  bankAccount: text("bank_account"),
  registrationNumber: text("registration_number"),
  description: text("description"),
  status: text("status").default("active"),
  createdAt: createdAt(),
});

export const lotsTable = pgTable("lots", {
  id: id(),
  number: text("number").notNull(),
  type: text("type").default("appartement"),
  floor: integer("floor").default(0),
  surfaceM2: doublePrecision("surface_m2"),
  tantiemes: integer("tantiemes").default(0),
  buildingId: text("building_id").notNull(),
  ownerId: text("owner_id"),
  tenantId: text("tenant_id"),
  status: text("status").default("occupied"),
  description: text("description"),
  createdAt: createdAt(),
});

export const tenantsTable = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  lotId: text("lot_id"),
  buildingId: text("building_id"),
  syndicateId: text("syndicate_id"),
  leaseStart: text("lease_start"),
  leaseEnd: text("lease_end"),
  monthlyRent: doublePrecision("monthly_rent"),
  depositAmount: doublePrecision("deposit_amount"),
  status: text("status").default("active"),
  emergencyContact: text("emergency_contact"),
  emergencyPhone: text("emergency_phone"),
  notes: text("notes"),
  createdAt: createdAt(),
});

// ─── Budgets & Charges ──────────────────────────────────────────────────────

export const budgetsTable = pgTable("budgets", {
  id: id(),
  year: integer("year").notNull(),
  buildingId: text("building_id").notNull(),
  totalAmount: doublePrecision("total_amount").default(0),
  chargesAmount: doublePrecision("charges_amount").default(0),
  fondsReserve: doublePrecision("fonds_reserve").default(0),
  status: text("status").default("draft"),
  notes: text("notes"),
  createdBy: text("created_by"),
  votedAt: timestamp("voted_at"),
  meetingId: text("meeting_id"),
  createdAt: createdAt(),
});

export const budgetLinesTable = pgTable("budget_lines", {
  id: id(),
  budgetId: text("budget_id").notNull(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  amountAnnual: doublePrecision("amount_annual").default(0),
  amountQ1: doublePrecision("amount_q1"),
  amountQ2: doublePrecision("amount_q2"),
  amountQ3: doublePrecision("amount_q3"),
  amountQ4: doublePrecision("amount_q4"),
  prestataireId: text("prestataire_id"),
});

export const appelsDeFondsTable = pgTable("appels_de_fonds", {
  id: id(),
  buildingId: text("building_id").notNull(),
  budgetId: text("budget_id"),
  lotId: text("lot_id").notNull(),
  ownerId: text("owner_id"),
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
});

// ─── Finance ────────────────────────────────────────────────────────────────

export const transactionsTable = pgTable("transactions", {
  id: id(),
  type: text("type").notNull(),
  amount: doublePrecision("amount").notNull(),
  label: text("label").notNull(),
  date: text("date").notNull(),
  status: text("status").default("paid"),
  memberId: text("member_id"),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const salaryRecordsTable = pgTable("salary_records", {
  id: id(),
  employee: text("employee").notNull(),
  role: text("role").notNull(),
  amount: doublePrecision("amount").notNull(),
  month: text("month").notNull(),
  status: text("status").default("pending"),
  paidDate: text("paid_date"),
  syndicateId: text("syndicate_id"),
  createdAt: createdAt(),
});

export const caisseEntriesTable = pgTable("caisse_entries", {
  id: id(),
  label: text("label").notNull(),
  amount: doublePrecision("amount").notNull(),
  type: text("type").notNull(),
  date: text("date").notNull(),
  category: text("category").default(""),
  syndicateId: text("syndicate_id"),
  balance: doublePrecision("balance"),
  createdAt: createdAt(),
});

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

export const invoiceItemsTable = pgTable("invoice_items", {
  id: id(),
  invoiceId: text("invoice_id").notNull(),
  label: text("label").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unitPrice: doublePrecision("unit_price").notNull(),
});

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

export const bonItemsTable = pgTable("bon_items", {
  id: id(),
  bonId: text("bon_id").notNull(),
  label: text("label").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unitPrice: doublePrecision("unit_price").notNull(),
});

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

export const travauxTable = pgTable("travaux", {
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
});

export const sinistresTable = pgTable("sinistres", {
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
});

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
  electionId: text("election_id").notNull(),
  name: text("name").notNull(),
  post: text("post").notNull(),
  bio: text("bio").default(""),
  votes: integer("votes").default(0),
});

export const votesTable = pgTable("votes", {
  id: id(),
  electionId: text("election_id").notNull(),
  voterId: text("voter_id").notNull(),
  candidateId: text("candidate_id").notNull(),
  createdAt: createdAt(),
});

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

export const meetingAttendeesTable = pgTable("meeting_attendees", {
  id: id(),
  meetingId: text("meeting_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: createdAt(),
});

export const agResolutionsTable = pgTable("ag_resolutions", {
  id: id(),
  meetingId: text("meeting_id").notNull(),
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
    publicationId: text("publication_id").notNull(),
    userId: text("user_id").notNull(),
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

export const conversationsTable = pgTable("conversations", {
  id: id(),
  syndicateId: text("syndicate_id"),
  participant1Id: text("participant1_id"),
  participant2Id: text("participant2_id"),
  isGroup: boolean("is_group").default(false),
  name: text("name"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: createdAt(),
});

export const messagesTable = pgTable("messages", {
  id: id(),
  conversationId: text("conversation_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name"),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

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

export const supportTicketsTable = pgTable("support_tickets", {
  id: id(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority").default("medium"),
  category: text("category").default("general"),
  status: text("status").default("open"),
  syndicateId: text("syndicate_id"),
  submittedById: text("submitted_by_id"),
  submittedByName: text("submitted_by_name"),
  createdAt: createdAt(),
});

export const ticketRepliesTable = pgTable("ticket_replies", {
  id: id(),
  ticketId: text("ticket_id").notNull(),
  authorId: text("author_id"),
  authorName: text("author_name"),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

export const cotisationsTable = pgTable("cotisations", {
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
});

export const paymentProofsTable = pgTable("payment_proofs", {
  id: id(),
  cotisationId: text("cotisation_id").notNull(),
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
});

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
    alertId: text("alert_id").notNull(),
    userId: text("user_id").notNull(),
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
