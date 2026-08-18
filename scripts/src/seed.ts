// Comprehensive test-data seed for SYNDYCAT GLOBAL CPS.
// Populates EVERY table in lib/db/src/schema.ts with realistic Moroccan
// condominium-management data, covering all four user roles:
//   super_admin | syndicate_admin | member | tenant
//
// Usage:  pnpm --filter @workspace/scripts run seed
//
// IDEMPOTENT: every insert uses a fixed id and .onConflictDoNothing(), so this
// script can safely be re-run against an existing database.

import bcrypt from "bcryptjs";
import { db, pool } from "@workspace/db";
import {
  syndicatesTable,
  refreshTokensTable,
  passwordResetTokensTable,
  usersTable,
  membersTable,
  buildingsTable,
  lotsTable,
  tenantsTable,
  budgetsTable,
  budgetLinesTable,
  appelsDeFondsTable,
  transactionsTable,
  salaryRecordsTable,
  caisseEntriesTable,
  invoicesTable,
  invoiceItemsTable,
  bonsLivraisonTable,
  bonItemsTable,
  prestatairesTable,
  prestataireEvaluationsTable,
  contratsPrestatairesTable,
  travauxTable,
  sinistresTable,
  electionsTable,
  candidatesTable,
  votesTable,
  meetingsTable,
  meetingAttendeesTable,
  agResolutionsTable,
  unionActionsTable,
  actionSupportsTable,
  actionParticipantsTable,
  publicationsTable,
  publicationLikesTable,
  publicationCommentsTable,
  announcementsTable,
  documentsTable,
  conversationsTable,
  messagesTable,
  messageReadsTable,
  productsTable,
  cartItemsTable,
  ordersTable,
  reviewsTable,
  productFavoritesTable,
  productReportsTable,
  productCommentsTable,
  marketplacePromotionsTable,
  legalAlertsTable,
  supportTicketsTable,
  ticketRepliesTable,
  cotisationsTable,
  paymentProofsTable,
  alertsTable,
  alertReadsTable,
  notificationPreferencesTable,
  partnersTable,
  payslipsTable,
  subscriptionPlansTable,
  syndicateSubscriptionsTable,
  subscriptionPaymentsTable,
  auditLogsTable,
  ideasTable,
  ideaVotesTable,
  debtEscalationsTable,
  expenseJustificationsTable,
  expenseVotesTable,
  nationalRankingsTable,
  reclamationsTable,
  workflowsTable,
  workflowStepsTable,
  fichesJuridiquesTable,
  parkingSpotsTable,
  vehiclesTable,
  parkingViolationsTable,
  visitorParkingReservationsTable,
  travauxPrivatifsTable,
  conseilSyndicalTable,
  fondsTravauxTable,
  chargeAttachmentsTable,
  invoiceAttachmentsTable,
  actesAdministratifsTable,
  billingInvoicesTable,
  emailLogsTable,
  agProxiesTable,
  electionProxiesTable,
  electionQuestionsTable,
  voteReceiptsTable,
  messageReactionsTable,
  blockedUsersTable,
  conversationArchivesTable,
  chatReportsTable,
  documentVersionsTable,
  documentSequencesTable,
  documentSignaturesTable,
  documentCommentsTable,
  templateDefinitionsTable,
  templateDefinitionVersionsTable,
  templateDefinitionPermissionsTable,
  templateRequestsTable,
  otpTokensTable,
} from "@workspace/db/schema";

const PASSWORD_HASH = await bcrypt.hash("password123", 10);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const isoDate = (n: number) => daysAgo(n).toISOString().slice(0, 10);

async function main() {
  console.log("🌱  Seeding SYNDYCAT GLOBAL CPS test data…\n");

  // ─────────────────────────────────────────────────────────────────────────
  // 1. SYNDICATES (2 fully-operational residences)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(syndicatesTable).values([
    {
      id: "syn_residence_atlas",
      name: "Syndicat Résidence Atlas",
      abbreviation: "SRA",
      sector: "résidentiel",
      region: "Casablanca-Settat",
      country: "Maroc",
      status: "active",
      membersCount: 5,
      email: "contact@residence-atlas.ma",
      phone: "+212522000001",
      address: "12 Bd Anfa, Casablanca",
      city: "Casablanca",
      legalForm: "Syndicat de copropriété",
      registrationNumber: "SC-2015-4521",
      iceNumber: "001122334455000",
      foundingDate: "2015-03-01",
      mission: "Gestion et entretien de la copropriété Résidence Atlas",
      cotisationAmount: "450.00",
      cotisationCycle: "monthly",
      legalThresholdMonths: 18,
      createdAt: daysAgo(1500),
    },
    {
      id: "syn_jardins_agdal",
      name: "Syndicat Les Jardins d'Agdal",
      abbreviation: "SJA",
      sector: "résidentiel",
      region: "Rabat-Salé-Kénitra",
      country: "Maroc",
      status: "active",
      membersCount: 4,
      email: "contact@jardins-agdal.ma",
      phone: "+212537000002",
      address: "45 Av. Ibn Sina, Agdal, Rabat",
      city: "Rabat",
      legalForm: "Syndicat de copropriété",
      registrationNumber: "SC-2018-7788",
      iceNumber: "009988776655000",
      foundingDate: "2018-09-15",
      mission: "Gestion de la résidence Les Jardins d'Agdal",
      cotisationAmount: "600.00",
      cotisationCycle: "monthly",
      legalThresholdMonths: 12,
      createdAt: daysAgo(900),
    },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 2. USERS  (1 super_admin · 2 syndicate_admin · 4 members · 2 tenants)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(usersTable).values([
    // ── Super-admin ──────────────────────────────────────────────────────
    { id: "user_super_admin",   name: "Karim Bensouda",        email: "superadmin@syndycat.ma",                    phone: "+212600000001", cin: "BE123456", passwordHash: PASSWORD_HASH, role: "super_admin",       status: "active",                                  profession: "Administrateur plateforme", createdAt: daysAgo(1500) },
    // ── Syndic admins ────────────────────────────────────────────────────
    { id: "user_admin_atlas",   name: "Nadia Ouahbi",          email: "syndic@andalous.ma",                        phone: "+212600000002", cin: "A123456",  passwordHash: PASSWORD_HASH, role: "syndicate_admin",   status: "active", syndicateId: "syn_residence_atlas",  profession: "Syndic bénévole",           createdAt: daysAgo(1400) },
    { id: "user_admin_agdal",   name: "Youssef Idrissi",       email: "syndic@jardins-agdal.ma",                   phone: "+212600000003", cin: "R778899",  passwordHash: PASSWORD_HASH, role: "syndicate_admin",   status: "active", syndicateId: "syn_jardins_agdal",    profession: "Syndic professionnel",      createdAt: daysAgo(880) },
    // ── Management team — Résidence Atlas ────────────────────────────────
    { id: "user_president_atlas",  name: "Abdelhak Essaidi",   email: "president@andalous.ma",                     phone: "+212600000012", cin: "BE567890", passwordHash: PASSWORD_HASH, role: "president",         status: "active", syndicateId: "syn_residence_atlas",  profession: "Chef de projet",            createdAt: daysAgo(1350) },
    { id: "user_treasurer_atlas",  name: "Fatima Zahra Amghar",email: "tresorier@andalous.ma",                     phone: "+212600000013", cin: "BE678901", passwordHash: PASSWORD_HASH, role: "treasurer",         status: "active", syndicateId: "syn_residence_atlas",  profession: "Expert-comptable",          createdAt: daysAgo(1350) },
    { id: "user_secretary_atlas",  name: "Samir Hamdouch",     email: "secretaire@andalous.ma",                    phone: "+212600000014", cin: "BE789012", passwordHash: PASSWORD_HASH, role: "secretary",         status: "active", syndicateId: "syn_residence_atlas",  profession: "Juriste",                   createdAt: daysAgo(1350) },
    { id: "user_committee_atlas",  name: "Naima Beldjoudi",    email: "conseil@andalous.ma",                       phone: "+212600000015", cin: "BE890123", passwordHash: PASSWORD_HASH, role: "committee_member",  status: "active", syndicateId: "syn_residence_atlas",  profession: "Retraitée",                 createdAt: daysAgo(1350) },
    // ── Members — Atlas ──────────────────────────────────────────────────
    { id: "user_member_1",      name: "Mohammed Alaoui",       email: "mohammed.alaoui@residence-atlas.ma",        phone: "+212600000004", cin: "BE234567", passwordHash: PASSWORD_HASH, role: "member",            status: "active", syndicateId: "syn_residence_atlas",  profession: "Ingénieur",                 createdAt: daysAgo(1300) },
    { id: "user_member_2",      name: "Khadija Tahiri",        email: "khadija.tahiri@residence-atlas.ma",         phone: "+212600000005", cin: "BE345678", passwordHash: PASSWORD_HASH, role: "member",            status: "active", syndicateId: "syn_residence_atlas",  profession: "Médecin",                   createdAt: daysAgo(1250) },
    { id: "user_member_5",      name: "Hassan Cherkaoui",      email: "hassan.cherkaoui@residence-atlas.ma",       phone: "+212600000009", cin: "BE456780", passwordHash: PASSWORD_HASH, role: "member",            status: "active", syndicateId: "syn_residence_atlas",  profession: "Retraité",                  createdAt: daysAgo(1600) },
    // ── Members — Agdal ──────────────────────────────────────────────────
    { id: "user_member_3",      name: "Rachid El Amrani",      email: "rachid.elamrani@jardins-agdal.ma",          phone: "+212600000006", cin: "R889900",  passwordHash: PASSWORD_HASH, role: "member",            status: "active", syndicateId: "syn_jardins_agdal",    profession: "Avocat",                    createdAt: daysAgo(850) },
    { id: "user_member_4",      name: "Amina Rachidi",         email: "amina.rachidi@jardins-agdal.ma",            phone: "+212600000010", cin: "R990022",  passwordHash: PASSWORD_HASH, role: "member",            status: "active", syndicateId: "syn_jardins_agdal",    profession: "Architecte",                createdAt: daysAgo(700) },
    // ── Tenants ──────────────────────────────────────────────────────────
    { id: "user_tenant_1",      name: "Sara Bouzid",           email: "sara.bouzid@gmail.com",                     phone: "+212600000007", cin: "BE456789", passwordHash: PASSWORD_HASH, role: "tenant",            status: "active", syndicateId: "syn_residence_atlas",  profession: "Comptable",                 createdAt: daysAgo(400) },
    { id: "user_tenant_2",      name: "Omar Zaki",             email: "omar.zaki@gmail.com",                       phone: "+212600000008", cin: "R990011",  passwordHash: PASSWORD_HASH, role: "tenant",            status: "active", syndicateId: "syn_jardins_agdal",    profession: "Designer",                  createdAt: daysAgo(200) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 3. MEMBERS  (property owners linked by email to their usersTable row)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(membersTable).values([
    { id: "member_1", name: "Mohammed Alaoui",  email: "mohammed.alaoui@residence-atlas.ma",  phone: "+212600000004", profession: "Ingénieur",   syndicateId: "syn_residence_atlas", status: "active",   cotisationStatus: "paid",    joinDate: "2021-01-15", createdAt: daysAgo(1300) },
    { id: "member_2", name: "Khadija Tahiri",   email: "khadija.tahiri@residence-atlas.ma",   phone: "+212600000005", profession: "Médecin",     syndicateId: "syn_residence_atlas", status: "active",   cotisationStatus: "paid",    joinDate: "2021-03-01", createdAt: daysAgo(1250) },
    { id: "member_3", name: "Hassan Cherkaoui", email: "hassan.cherkaoui@residence-atlas.ma", phone: "+212600000009", profession: "Retraité",    syndicateId: "syn_residence_atlas", status: "active",   cotisationStatus: "overdue", joinDate: "2019-06-01", createdAt: daysAgo(1600) },
    { id: "member_4", name: "Rachid El Amrani", email: "rachid.elamrani@jardins-agdal.ma",    phone: "+212600000006", profession: "Avocat",      syndicateId: "syn_jardins_agdal",  status: "active",   cotisationStatus: "paid",    joinDate: "2019-09-15", createdAt: daysAgo(850) },
    { id: "member_5", name: "Amina Rachidi",    email: "amina.rachidi@jardins-agdal.ma",      phone: "+212600000010", profession: "Architecte",  syndicateId: "syn_jardins_agdal",  status: "active",   cotisationStatus: "paid",    joinDate: "2020-11-01", createdAt: daysAgo(700) },
    { id: "member_6", name: "Kaouthar Bennis",  email: "kaouthar.bennis@jardins-agdal.ma",    phone: "+212600000011", profession: "Professeure", syndicateId: "syn_jardins_agdal",  status: "inactive", cotisationStatus: "overdue", joinDate: "2020-03-10", createdAt: daysAgo(650) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 4. BUILDINGS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(buildingsTable).values([
    { id: "building_atlas_a",  name: "Résidence Atlas — Bâtiment A",      address: "12 Bd Anfa, Casablanca",       city: "Casablanca", type: "residential", totalFloors: 6, totalLots: 24, constructionYear: 2014, syndicateId: "syn_residence_atlas", adminId: "user_admin_atlas", bankAccount: "MA0011 2233 4455 6677", registrationNumber: "IM-2014-887", status: "active", createdAt: daysAgo(1500) },
    { id: "building_atlas_b",  name: "Résidence Atlas — Bâtiment B",      address: "14 Bd Anfa, Casablanca",       city: "Casablanca", type: "residential", totalFloors: 4, totalLots: 16, constructionYear: 2016, syndicateId: "syn_residence_atlas", adminId: "user_admin_atlas", bankAccount: "MA0011 2233 4455 6677", registrationNumber: "IM-2016-912", status: "active", createdAt: daysAgo(1400) },
    { id: "building_agdal_1",  name: "Les Jardins d'Agdal — Immeuble 1",  address: "45 Av. Ibn Sina, Agdal, Rabat", city: "Rabat",      type: "residential", totalFloors: 4, totalLots: 16, constructionYear: 2017, syndicateId: "syn_jardins_agdal",  adminId: "user_admin_agdal", bankAccount: "MA0099 8877 6655 4433", registrationNumber: "IM-2017-334", status: "active", createdAt: daysAgo(900) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 5. LOTS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(lotsTable).values([
    { id: "lot_a101", number: "A101", type: "appartement", floor: 1, surfaceM2: "85.00",  tantiemes: 120, buildingId: "building_atlas_a", ownerId: "member_1", status: "occupied", createdAt: daysAgo(1300) },
    { id: "lot_a102", number: "A102", type: "appartement", floor: 1, surfaceM2: "72.00",  tantiemes: 100, buildingId: "building_atlas_a", ownerId: "member_2", status: "occupied", createdAt: daysAgo(1250) },
    { id: "lot_a205", number: "A205", type: "appartement", floor: 2, surfaceM2: "95.00",  tantiemes: 135, buildingId: "building_atlas_a", ownerId: "member_3", status: "rented",   createdAt: daysAgo(1200) },
    { id: "lot_a301", number: "A301", type: "appartement", floor: 3, surfaceM2: "110.00", tantiemes: 150, buildingId: "building_atlas_a", ownerId: "member_1", status: "occupied", createdAt: daysAgo(1100) },
    { id: "lot_b01",  number: "B01",  type: "appartement", floor: 0, surfaceM2: "65.00",  tantiemes:  90, buildingId: "building_atlas_b", ownerId: "member_2", status: "occupied", createdAt: daysAgo(1000) },
    { id: "lot_ag01", number: "Ag-01", type: "appartement", floor: 0, surfaceM2: "78.00", tantiemes: 110, buildingId: "building_agdal_1", ownerId: "member_4", status: "rented",   createdAt: daysAgo(850) },
    { id: "lot_ag02", number: "Ag-02", type: "appartement", floor: 0, surfaceM2: "82.00", tantiemes: 115, buildingId: "building_agdal_1", ownerId: "member_5", status: "occupied", createdAt: daysAgo(700) },
    { id: "lot_ag12", number: "Ag-12", type: "duplex",      floor: 3, surfaceM2: "140.00", tantiemes: 200, buildingId: "building_agdal_1", ownerId: "member_4", status: "occupied", createdAt: daysAgo(800) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 6. TENANTS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(tenantsTable).values([
    { id: "tenant_1", name: "Sara Bouzid", email: "sara.bouzid@gmail.com",  phone: "+212600000007", lotId: "lot_a205", buildingId: "building_atlas_a", syndicateId: "syn_residence_atlas", leaseStart: "2024-01-01", leaseEnd: "2026-12-31", monthlyRent: "5500.00", depositAmount: "11000.00", status: "active", emergencyContact: "Fatima Bouzid", emergencyPhone: "+212661000000", createdAt: daysAgo(400) },
    { id: "tenant_2", name: "Omar Zaki",   email: "omar.zaki@gmail.com",    phone: "+212600000008", lotId: "lot_ag01", buildingId: "building_agdal_1", syndicateId: "syn_jardins_agdal",  leaseStart: "2025-01-01", leaseEnd: "2027-12-31", monthlyRent: "4800.00", depositAmount:  "9600.00", status: "active", emergencyContact: "Nadia Zaki",   emergencyPhone: "+212662000000", createdAt: daysAgo(200) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 7. BUDGETS + BUDGET LINES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(budgetsTable).values([
    { id: "budget_atlas_2025", year: 2025, buildingId: "building_atlas_a", totalAmount: "118800.00", chargesAmount: "99000.00",  fondsReserve: "19800.00", status: "approved", createdBy: "user_admin_atlas", votedAt: daysAgo(545), createdAt: daysAgo(560) },
    { id: "budget_atlas_2026", year: 2026, buildingId: "building_atlas_a", totalAmount: "129600.00", chargesAmount: "108000.00", fondsReserve: "21600.00", status: "approved", createdBy: "user_admin_atlas", votedAt: daysAgo(180), createdAt: daysAgo(200) },
    { id: "budget_agdal_2026", year: 2026, buildingId: "building_agdal_1", totalAmount:  "86400.00", chargesAmount:  "72000.00", fondsReserve: "14400.00", status: "approved", createdBy: "user_admin_agdal", votedAt: daysAgo(150), createdAt: daysAgo(170) },
  ]).onConflictDoNothing();

  await db.insert(budgetLinesTable).values([
    { id: "bl_1",  budgetId: "budget_atlas_2026", category: "entretien",     label: "Nettoyage & entretien courant",   amountAnnual: "36000.00" },
    { id: "bl_2",  budgetId: "budget_atlas_2026", category: "gardiennage",   label: "Gardiennage & sécurité",          amountAnnual: "48000.00" },
    { id: "bl_3",  budgetId: "budget_atlas_2026", category: "ascenseur",     label: "Maintenance ascenseurs",          amountAnnual: "24000.00" },
    { id: "bl_4",  budgetId: "budget_atlas_2026", category: "reserves",      label: "Fonds de réserve travaux",        amountAnnual: "21600.00" },
    { id: "bl_5",  budgetId: "budget_agdal_2026", category: "entretien",     label: "Nettoyage & espaces verts",       amountAnnual: "30000.00" },
    { id: "bl_6",  budgetId: "budget_agdal_2026", category: "gardiennage",   label: "Gardiennage",                     amountAnnual: "42000.00" },
    { id: "bl_7",  budgetId: "budget_agdal_2026", category: "reserves",      label: "Fonds de réserve",                amountAnnual: "14400.00" },
    { id: "bl_8",  budgetId: "budget_atlas_2025", category: "entretien",     label: "Nettoyage courant",               amountAnnual: "33000.00" },
    { id: "bl_9",  budgetId: "budget_atlas_2025", category: "gardiennage",   label: "Gardiennage",                     amountAnnual: "46000.00" },
    { id: "bl_10", budgetId: "budget_atlas_2025", category: "ascenseur",     label: "Maintenance ascenseurs",          amountAnnual: "20000.00" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 8. APPELS DE FONDS  (paid, pending, overdue, pending_validation)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(appelsDeFondsTable).values([
    // Atlas — juillet 2026
    { id: "adf_1",  buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a101", ownerId: "member_1", period: "2026-07", type: "charges_courantes", amount: "450.00", dueDate: "2026-07-10", status: "paid",               paymentMethod: "virement", paidDate: "2026-07-05", receiptNumber: "REC-2026-0701", createdAt: daysAgo(30) },
    { id: "adf_2",  buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a102", ownerId: "member_2", period: "2026-07", type: "charges_courantes", amount: "450.00", dueDate: "2026-07-10", status: "pending_validation", paymentMethod: "cheque",   proofUrl: "/uploads/proofs/adf_2.jpg", createdAt: daysAgo(10) },
    { id: "adf_3",  buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a205", ownerId: "member_3", period: "2026-06", type: "charges_courantes", amount: "450.00", dueDate: "2026-06-10", status: "overdue",            createdAt: daysAgo(60) },
    { id: "adf_4",  buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a301", ownerId: "member_1", period: "2026-07", type: "fonds_travaux",    amount: "800.00", dueDate: "2026-07-15", status: "pending",            createdAt: daysAgo(5) },
    // Atlas — juin 2026 (member_3 overdue × 2 months)
    { id: "adf_5",  buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a205", ownerId: "member_3", period: "2026-05", type: "charges_courantes", amount: "450.00", dueDate: "2026-05-10", status: "overdue",            createdAt: daysAgo(91) },
    // Bâtiment B
    { id: "adf_6",  buildingId: "building_atlas_b", budgetId: "budget_atlas_2026", lotId: "lot_b01",  ownerId: "member_2", period: "2026-07", type: "charges_courantes", amount: "380.00", dueDate: "2026-07-10", status: "paid",               paymentMethod: "especes",  paidDate: "2026-07-08", receiptNumber: "REC-2026-0704", createdAt: daysAgo(28) },
    // Agdal
    { id: "adf_7",  buildingId: "building_agdal_1", budgetId: "budget_agdal_2026", lotId: "lot_ag12", ownerId: "member_4", period: "2026-07", type: "charges_courantes", amount: "600.00", dueDate: "2026-07-10", status: "paid",               paymentMethod: "virement", paidDate: "2026-07-02", receiptNumber: "REC-2026-0812", createdAt: daysAgo(28) },
    { id: "adf_8",  buildingId: "building_agdal_1", budgetId: "budget_agdal_2026", lotId: "lot_ag02", ownerId: "member_5", period: "2026-07", type: "charges_courantes", amount: "600.00", dueDate: "2026-07-10", status: "pending",            createdAt: daysAgo(8) },
    { id: "adf_9",  buildingId: "building_agdal_1", budgetId: "budget_agdal_2026", lotId: "lot_ag01", ownerId: "member_4", period: "2026-06", type: "charges_courantes", amount: "600.00", dueDate: "2026-06-10", status: "overdue",            createdAt: daysAgo(59) },
    // Atlas juin paid
    { id: "adf_10", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a101", ownerId: "member_1", period: "2026-06", type: "charges_courantes", amount: "450.00", dueDate: "2026-06-10", status: "paid",               paymentMethod: "virement", paidDate: "2026-06-07", receiptNumber: "REC-2026-0625", createdAt: daysAgo(60) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 9. FINANCE: Transactions · Salaires · Caisse · Factures · Bons livraison
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(transactionsTable).values([
    { id: "tx_1",  type: "revenue",  amount: "450.00",   label: "Cotisation juillet — Lot A101",          date: "2026-07-05", status: "paid",    memberId: "user_member_1", syndicateId: "syn_residence_atlas", createdAt: daysAgo(30) },
    { id: "tx_2",  type: "expense",  amount: "8000.00",  label: "Maintenance ascenseur — juillet",         date: "2026-07-03", status: "paid",                         syndicateId: "syn_residence_atlas", createdAt: daysAgo(32) },
    { id: "tx_3",  type: "expense",  amount: "3500.00",  label: "Salaire gardien — juillet",               date: "2026-07-01", status: "paid",                         syndicateId: "syn_residence_atlas", createdAt: daysAgo(35) },
    { id: "tx_4",  type: "revenue",  amount: "600.00",   label: "Cotisation juillet — Lot Ag-12",          date: "2026-07-02", status: "paid",    memberId: "user_member_3", syndicateId: "syn_jardins_agdal",  createdAt: daysAgo(28) },
    { id: "tx_5",  type: "revenue",  amount: "450.00",   label: "Cotisation juin — Lot A101",              date: "2026-06-07", status: "paid",    memberId: "user_member_1", syndicateId: "syn_residence_atlas", createdAt: daysAgo(60) },
    { id: "tx_6",  type: "expense",  amount: "12000.00", label: "Travaux peinture cage d'escalier",        date: "2026-06-20", status: "paid",                         syndicateId: "syn_residence_atlas", createdAt: daysAgo(48) },
    { id: "tx_7",  type: "revenue",  amount: "380.00",   label: "Cotisation juillet — Lot B01",            date: "2026-07-08", status: "paid",    memberId: "user_member_2", syndicateId: "syn_residence_atlas", createdAt: daysAgo(28) },
    { id: "tx_8",  type: "expense",  amount: "4200.00",  label: "Entretien espaces verts — Agdal juin",    date: "2026-06-25", status: "paid",                         syndicateId: "syn_jardins_agdal",  createdAt: daysAgo(42) },
    { id: "tx_9",  type: "revenue",  amount: "600.00",   label: "Cotisation juillet — Lot Ag-02",          date: "2026-07-09", status: "pending", memberId: "user_member_4", syndicateId: "syn_jardins_agdal",  createdAt: daysAgo(1) },
  ]).onConflictDoNothing();

  await db.insert(salaryRecordsTable).values([
    { id: "salary_1", employee: "Abdelali Mansouri", role: "Gardien",          amount: "3500.00", month: "2026-07", status: "paid",    paidDate: "2026-07-01", syndicateId: "syn_residence_atlas", createdAt: daysAgo(35) },
    { id: "salary_2", employee: "Fatiha Znati",      role: "Femme de ménage", amount: "2800.00", month: "2026-07", status: "paid",    paidDate: "2026-07-01", syndicateId: "syn_residence_atlas", createdAt: daysAgo(35) },
    { id: "salary_3", employee: "Said Bouhaddi",     role: "Gardien",          amount: "3200.00", month: "2026-07", status: "pending",                         syndicateId: "syn_jardins_agdal",  createdAt: daysAgo(5) },
    { id: "salary_4", employee: "Abdelali Mansouri", role: "Gardien",          amount: "3500.00", month: "2026-06", status: "paid",    paidDate: "2026-06-01", syndicateId: "syn_residence_atlas", createdAt: daysAgo(65) },
    { id: "salary_5", employee: "Fatiha Znati",      role: "Femme de ménage", amount: "2800.00", month: "2026-06", status: "paid",    paidDate: "2026-06-01", syndicateId: "syn_residence_atlas", createdAt: daysAgo(65) },
  ]).onConflictDoNothing();

  await db.insert(caisseEntriesTable).values([
    { id: "caisse_1", label: "Solde initial",                 amount: "50000.00", type: "credit", date: "2026-01-01", category: "ouverture",    syndicateId: "syn_residence_atlas", balance: "50000.00", createdAt: daysAgo(190) },
    { id: "caisse_2", label: "Cotisations juin",              amount: "450.00",   type: "credit", date: "2026-06-07", category: "cotisations",  syndicateId: "syn_residence_atlas", balance: "50450.00", createdAt: daysAgo(60) },
    { id: "caisse_3", label: "Peinture cage d'escalier",      amount: "12000.00", type: "debit",  date: "2026-06-20", category: "travaux",      syndicateId: "syn_residence_atlas", balance: "38450.00", createdAt: daysAgo(48) },
    { id: "caisse_4", label: "Cotisations juillet A101",      amount: "450.00",   type: "credit", date: "2026-07-05", category: "cotisations",  syndicateId: "syn_residence_atlas", balance: "38900.00", createdAt: daysAgo(30) },
    { id: "caisse_5", label: "Maintenance ascenseur",         amount: "8000.00",  type: "debit",  date: "2026-07-03", category: "entretien",    syndicateId: "syn_residence_atlas", balance: "30900.00", createdAt: daysAgo(32) },
    { id: "caisse_6", label: "Solde initial Agdal",           amount: "35000.00", type: "credit", date: "2026-01-01", category: "ouverture",    syndicateId: "syn_jardins_agdal",  balance: "35000.00", createdAt: daysAgo(190) },
    { id: "caisse_7", label: "Cotisation juillet Ag-12",      amount: "600.00",   type: "credit", date: "2026-07-02", category: "cotisations",  syndicateId: "syn_jardins_agdal",  balance: "35600.00", createdAt: daysAgo(28) },
    { id: "caisse_8", label: "Espaces verts juin",            amount: "4200.00",  type: "debit",  date: "2026-06-25", category: "entretien",    syndicateId: "syn_jardins_agdal",  balance: "31400.00", createdAt: daysAgo(42) },
  ]).onConflictDoNothing();

  await db.insert(invoicesTable).values([
    { id: "inv_1", reference: "FAC-2026-001", type: "facture", recipient: "Résidence Atlas",       date: "2026-07-01", dueDate: "2026-07-31", status: "sent",  amount: "8000.00", syndicateId: "syn_residence_atlas", createdAt: daysAgo(35) },
    { id: "inv_2", reference: "FAC-2026-002", type: "facture", recipient: "Les Jardins d'Agdal",   date: "2026-07-05", dueDate: "2026-08-05", status: "draft", amount: "4200.00", syndicateId: "syn_jardins_agdal",  createdAt: daysAgo(10) },
    { id: "inv_3", reference: "FAC-2026-003", type: "devis",   recipient: "Résidence Atlas",       date: "2026-06-15", dueDate: "2026-06-30", status: "paid",  amount: "12000.00", syndicateId: "syn_residence_atlas", createdAt: daysAgo(52) },
  ]).onConflictDoNothing();
  await db.insert(invoiceItemsTable).values([
    { id: "invitem_1", invoiceId: "inv_1", label: "Maintenance ascenseur (juillet)",      quantity: "1", unitPrice: "8000.00" },
    { id: "invitem_2", invoiceId: "inv_2", label: "Entretien espaces verts",              quantity: "1", unitPrice: "4200.00" },
    { id: "invitem_3", invoiceId: "inv_3", label: "Peinture cage d'escalier (déboursé)", quantity: "1", unitPrice: "10000.00" },
    { id: "invitem_4", invoiceId: "inv_3", label: "Fournitures peinture",                quantity: "1", unitPrice: "2000.00" },
  ]).onConflictDoNothing();

  await db.insert(bonsLivraisonTable).values([
    { id: "bon_1", reference: "BL-2026-001", recipient: "Résidence Atlas",     date: "2026-07-02", type: "entree",  total: "1200.00", status: "delivered", syndicateId: "syn_residence_atlas", createdAt: daysAgo(33) },
    { id: "bon_2", reference: "BL-2026-002", recipient: "Les Jardins d'Agdal", date: "2026-06-18", type: "entree",  total: "850.00",  status: "delivered", syndicateId: "syn_jardins_agdal",  createdAt: daysAgo(49) },
  ]).onConflictDoNothing();
  await db.insert(bonItemsTable).values([
    { id: "bonitem_1", bonId: "bon_1", label: "Ampoules LED (lot de 20)",     quantity: "20", unitPrice: "60.00" },
    { id: "bonitem_2", bonId: "bon_2", label: "Tuyaux PVC 50mm (lot de 10)",  quantity: "10", unitPrice: "85.00" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 10. PRESTATAIRES + ÉVALUATIONS + CONTRATS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(prestatairesTable).values([
    { id: "prest_1", name: "Ascenseurs Maroc SARL",    type: "ascenseur",  contactName: "Ali Nasri",       phone: "+212522111111", email: "contact@ascenseursmaroc.ma",   ice: "001234567000045", buildingId: "building_atlas_a", syndicateId: "syn_residence_atlas", status: "active",   rating: "4.50", evaluationsCount: 3, createdAt: daysAgo(1000) },
    { id: "prest_2", name: "GreenClean Services",      type: "nettoyage",  contactName: "Samira Kabbaj",   phone: "+212537222222", email: "contact@greenclean.ma",        ice: "001234567000099", buildingId: "building_agdal_1", syndicateId: "syn_jardins_agdal",  status: "active",   rating: "4.20", evaluationsCount: 2, createdAt: daysAgo(600) },
    { id: "prest_3", name: "TechBâtiment Maroc",       type: "plomberie",  contactName: "Omar Lahlou",     phone: "+212661333333", email: "omar@techbatiment.ma",         ice: "001234567000123",                                  syndicateId: "syn_residence_atlas", status: "active",   rating: "3.80", evaluationsCount: 1, createdAt: daysAgo(300) },
    { id: "prest_4", name: "Sécurité Atlas Protect",   type: "gardiennage", contactName: "Brahim Soussi",  phone: "+212522444444", email: "contact@atlas-protect.ma",     ice: "001234567000222", buildingId: "building_atlas_a", syndicateId: "syn_residence_atlas", status: "active",   rating: "4.00", evaluationsCount: 2, createdAt: daysAgo(800) },
    { id: "prest_5", name: "EcoPaysage",               type: "jardinage",  contactName: "Zineb Hammouti",  phone: "+212537555555", email: "contact@ecopaysage.ma",        ice: "001234567000333", buildingId: "building_agdal_1", syndicateId: "syn_jardins_agdal",  status: "inactive", rating: "3.50", evaluationsCount: 1, createdAt: daysAgo(450) },
  ]).onConflictDoNothing();

  await db.insert(prestataireEvaluationsTable).values([
    { id: "eval_1", prestataireId: "prest_1", travauxId: "travaux_1", syndicateId: "syn_residence_atlas", quality: 5, speed: 4, communication: 4, price: 4, average: "4.25", comment: "Intervention rapide et propre.", ratedById: "user_admin_atlas", ratedByName: "Nadia Ouahbi", createdAt: daysAgo(30) },
    { id: "eval_2", prestataireId: "prest_1", syndicateId: "syn_residence_atlas",                          quality: 5, speed: 5, communication: 5, price: 4, average: "4.75", comment: "Excellent prestataire, toujours disponible.", ratedById: "user_member_1", ratedByName: "Mohammed Alaoui", createdAt: daysAgo(60) },
    { id: "eval_3", prestataireId: "prest_2", syndicateId: "syn_jardins_agdal",                            quality: 4, speed: 4, communication: 4, price: 5, average: "4.25", comment: "Bon rapport qualité-prix.", ratedById: "user_admin_agdal", ratedByName: "Youssef Idrissi", createdAt: daysAgo(45) },
    { id: "eval_4", prestataireId: "prest_3", travauxId: "travaux_2", syndicateId: "syn_residence_atlas", quality: 4, speed: 3, communication: 4, price: 4, average: "3.75", comment: "Satisfaisant mais délai un peu long.", ratedById: "user_admin_atlas", ratedByName: "Nadia Ouahbi", createdAt: daysAgo(10) },
  ]).onConflictDoNothing();

  await db.insert(contratsPrestatairesTable).values([
    { id: "contrat_1", prestataireId: "prest_1", buildingId: "building_atlas_a", title: "Maintenance ascenseurs 2026",    startDate: "2026-01-01", endDate: "2026-12-31", monthlyAmount:  "8000.00", annualAmount:  "96000.00", status: "active",  autoRenew: true,  createdAt: daysAgo(190) },
    { id: "contrat_2", prestataireId: "prest_4", buildingId: "building_atlas_a", title: "Gardiennage Résidence Atlas",    startDate: "2026-01-01", endDate: "2026-12-31", monthlyAmount:  "3500.00", annualAmount:  "42000.00", status: "active",  autoRenew: true,  createdAt: daysAgo(190) },
    { id: "contrat_3", prestataireId: "prest_2", buildingId: "building_agdal_1", title: "Nettoyage Les Jardins d'Agdal", startDate: "2026-01-01", endDate: "2026-12-31", monthlyAmount:  "3200.00", annualAmount:  "38400.00", status: "active",  autoRenew: true,  createdAt: daysAgo(170) },
    { id: "contrat_4", prestataireId: "prest_5", buildingId: "building_agdal_1", title: "Jardinage EcoPaysage 2025",     startDate: "2025-01-01", endDate: "2025-12-31", monthlyAmount:  "1500.00", annualAmount:  "18000.00", status: "expired", autoRenew: false, createdAt: daysAgo(540) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 11. TRAVAUX + SINISTRES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(travauxTable).values([
    { id: "travaux_1", title: "Réparation fuite toiture",         description: "Infiltration d'eau détectée au dernier étage", type: "reparation", priority: "high",   status: "in_progress",         buildingId: "building_atlas_a", lotId: "lot_a301", prestataireId: "prest_1", reportedById: "user_member_1", reportedByName: "Mohammed Alaoui", estimatedAmount: "5000.00", startDate: "2026-07-01", createdAt: daysAgo(7) },
    { id: "travaux_2", title: "Peinture cage d'escalier",         description: "Rafraîchissement peinture bâtiment A",        type: "entretien",  priority: "normal", status: "completed",           buildingId: "building_atlas_a",                   prestataireId: "prest_3", reportedById: "user_admin_atlas", reportedByName: "Nadia Ouahbi",   estimatedAmount: "12000.00", actualAmount: "11800.00", startDate: "2026-06-10", endDate: "2026-06-22", completedAt: daysAgo(45), createdAt: daysAgo(55) },
    { id: "travaux_3", title: "Fuite robinet salle de bain",      description: "Fuite sous évier, remplacement joint",        type: "reparation", priority: "normal", status: "reported",            buildingId: "building_atlas_a", lotId: "lot_a102", reportedById: "user_member_2", reportedByName: "Khadija Tahiri",  estimatedAmount: "800.00",  createdAt: daysAgo(3) },
    { id: "travaux_4", title: "Remplacement éclairage parking",   description: "LED parking sous-sol défaillantes",           type: "entretien",  priority: "normal", status: "assigned",            buildingId: "building_agdal_1",                   prestataireId: "prest_2", reportedById: "user_admin_agdal", reportedByName: "Youssef Idrissi", estimatedAmount: "3500.00", startDate: "2026-07-12", createdAt: daysAgo(5) },
    { id: "travaux_5", title: "Réfection portail d'entrée",       description: "Portail automatique en panne",                type: "reparation", priority: "high",   status: "pending_validation",  buildingId: "building_agdal_1",                   prestataireId: "prest_2", reportedById: "user_member_3", reportedByName: "Rachid El Amrani", estimatedAmount: "8000.00", actualAmount: "7500.00", startDate: "2026-06-28", endDate: "2026-07-04", invoiceAmount: "7500.00", invoiceUrl: "/uploads/invoices/travaux_5.pdf", createdAt: daysAgo(15) },
  ]).onConflictDoNothing();

  await db.insert(sinistresTable).values([
    { id: "sinistre_1", buildingId: "building_atlas_a", lotId: "lot_a205", type: "degat_eaux",  description: "Dégât des eaux suite à une fuite de canalisation", date: "2026-06-20", estimatedAmount: "15000.00", claimNumber: "SIN-2026-0045", status: "in_progress", urgency: "high",     reportedById: "user_member_2",  reportedByName: "Khadija Tahiri",  createdAt: daysAgo(18) },
    { id: "sinistre_2", buildingId: "building_agdal_1", lotId: "lot_ag01", type: "incendie",    description: "Départ de feu maîtrisé au tableau électrique",    date: "2026-07-01", estimatedAmount:  "8000.00", claimNumber: "SIN-2026-0052", status: "declared",    urgency: "critical", reportedById: "user_tenant_2",  reportedByName: "Omar Zaki",       createdAt: daysAgo(7) },
    { id: "sinistre_3", buildingId: "building_atlas_a",                    type: "vandalisme",  description: "Graffitis sur les murs du parking",               date: "2026-07-05", estimatedAmount:  "2500.00", claimNumber: "SIN-2026-0060", status: "declared",    urgency: "low",      reportedById: "user_admin_atlas", reportedByName: "Nadia Ouahbi",   createdAt: daysAgo(3) },
    { id: "sinistre_4", buildingId: "building_atlas_b", lotId: "lot_b01",  type: "degat_eaux",  description: "Infiltration depuis terrasse appartement B01",    date: "2026-05-10", estimatedAmount:  "9000.00", claimNumber: "SIN-2026-0031", status: "resolved",    urgency: "normal",   reportedById: "user_member_2",  reportedByName: "Khadija Tahiri",  resolvedAt: daysAgo(20), resolutionNote: "Étanchéité refaite, dégâts réparés.", createdAt: daysAgo(57) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 12. ELECTIONS + CANDIDATS + VOTES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(electionsTable).values([
    { id: "election_1", syndicateId: "syn_residence_atlas", title: "Élection du conseil syndical 2026",          description: "Renouvellement du conseil syndical pour le mandat 2026-2028", status: "open",      startDate: "2026-07-01", endDate: "2026-07-31", createdBy: "user_admin_atlas", createdAt: daysAgo(7) },
    { id: "election_2", syndicateId: "syn_residence_atlas", title: "Vote approbation budget travaux urgents",     description: "Approbation du budget exceptionnel travaux toiture",        status: "completed", startDate: "2026-06-01", endDate: "2026-06-15", createdBy: "user_admin_atlas", createdAt: daysAgo(40) },
    { id: "election_3", syndicateId: "syn_jardins_agdal",   title: "Élection bureau syndical Agdal 2026",         description: "Élection annuelle des membres du bureau",                   status: "upcoming",  startDate: isoDate(-30), endDate: isoDate(-60), createdBy: "user_admin_agdal", createdAt: daysAgo(5) },
  ]).onConflictDoNothing();
  await db.insert(candidatesTable).values([
    { id: "cand_1", electionId: "election_1", name: "Mohammed Alaoui",  post: "Président du conseil syndical", bio: "Membre depuis 2021, ingénieur", votes: 2 },
    { id: "cand_2", electionId: "election_1", name: "Khadija Tahiri",   post: "Trésorière",                    bio: "Membre depuis 2021, médecin",   votes: 1 },
    { id: "cand_3", electionId: "election_2", name: "Approbation",      post: "Vote OUI — Budget travaux",     bio: "Approuver 50 000 MAD pour toiture", votes: 2 },
    { id: "cand_4", electionId: "election_2", name: "Rejet",            post: "Vote NON — Reporter décision",  bio: "",                              votes: 1 },
    { id: "cand_5", electionId: "election_3", name: "Rachid El Amrani", post: "Président Agdal",               bio: "Avocat, 6 ans de présence",     votes: 0 },
    { id: "cand_6", electionId: "election_3", name: "Amina Rachidi",    post: "Secrétaire",                    bio: "Architecte, très impliquée",    votes: 0 },
  ]).onConflictDoNothing();
  await db.insert(votesTable).values([
    { id: "vote_1", electionId: "election_1", candidateId: "cand_1", createdAt: daysAgo(5) },
    { id: "vote_2", electionId: "election_1", candidateId: "cand_1", createdAt: daysAgo(4) },
    { id: "vote_3", electionId: "election_2", candidateId: "cand_3", createdAt: daysAgo(35) },
    { id: "vote_4", electionId: "election_2", candidateId: "cand_3", createdAt: daysAgo(35) },
    { id: "vote_5", electionId: "election_2", candidateId: "cand_4", createdAt: daysAgo(34) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 13. RÉUNIONS + ATTENDEES + RÉSOLUTIONS AG
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(meetingsTable).values([
    { id: "meeting_1", syndicateId: "syn_residence_atlas", title: "Assemblée Générale Ordinaire 2026",       date: "2026-07-20", time: "10:00", location: "Salle commune, Résidence Atlas",          type: "general",   description: "Bilan financier annuel et vote du budget 2027", agenda: "1. Bilan 2026\n2. Vote budget 2027\n3. Élection conseil syndical", status: "scheduled", createdBy: "user_admin_atlas", createdAt: daysAgo(20) },
    { id: "meeting_2", syndicateId: "syn_residence_atlas", title: "Réunion exceptionnelle — Toiture",        date: isoDate(-5), time: "18:00", location: "Appartement A301, Résidence Atlas",          type: "emergency", description: "Décision urgente travaux toiture", agenda: "1. Diagnostic toiture\n2. Vote budget travaux", status: "completed", createdBy: "user_admin_atlas", createdAt: daysAgo(35) },
    { id: "meeting_3", syndicateId: "syn_jardins_agdal",   title: "Assemblée Générale Ordinaire 2026",       date: isoDate(-45), time: "09:30", location: "Salle de conférence Ibn Sina, Rabat",      type: "general",   description: "AG annuelle Agdal", agenda: "1. Rapport moral\n2. Rapport financier\n3. Vote budget 2027", status: "scheduled", createdBy: "user_admin_agdal", createdAt: daysAgo(20) },
    { id: "meeting_4", syndicateId: "syn_residence_atlas", title: "Réunion conseil syndical — juillet",      date: isoDate(-3),  time: "19:00", location: "Hall Résidence Atlas",                    type: "board",     description: "Réunion mensuelle du conseil", agenda: "1. Suivi travaux\n2. Relances impayés\n3. Divers", status: "scheduled", createdBy: "user_admin_atlas", createdAt: daysAgo(7) },
  ]).onConflictDoNothing();
  await db.insert(meetingAttendeesTable).values([
    { id: "attendee_1", meetingId: "meeting_1", userId: "user_member_1" },
    { id: "attendee_2", meetingId: "meeting_1", userId: "user_member_2" },
    { id: "attendee_3", meetingId: "meeting_2", userId: "user_member_1" },
    { id: "attendee_4", meetingId: "meeting_2", userId: "user_member_5" },
    { id: "attendee_5", meetingId: "meeting_4", userId: "user_member_1" },
  ]).onConflictDoNothing();
  await db.insert(agResolutionsTable).values([
    { id: "resolution_1", meetingId: "meeting_1", buildingId: "building_atlas_a", number: 1, title: "Approbation budget 2027",              description: "Vote pour l'approbation du budget prévisionnel 2027", requiredMajority: "simple",          tantiemesFor: 220, tantiemesAgainst:  30, tantiemesAbstain: 10, result: "pending" },
    { id: "resolution_2", meetingId: "meeting_2", buildingId: "building_atlas_a", number: 1, title: "Budget travaux toiture 50 000 MAD",    description: "Approbation budget exceptionnel travaux toiture",      requiredMajority: "absolute_majority", tantiemesFor: 270, tantiemesAgainst:  65, tantiemesAbstain: 20, result: "approved" },
    { id: "resolution_3", meetingId: "meeting_2", buildingId: "building_atlas_a", number: 2, title: "Choix prestataire Ascenseurs Maroc",   description: "Sélection du prestataire pour les travaux",            requiredMajority: "simple",          tantiemesFor: 280, tantiemesAgainst:  30, tantiemesAbstain: 45, result: "approved" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 14. ACTIONS SYNDICALES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(unionActionsTable).values([
    { id: "action_1", title: "Campagne entretien espaces verts",   description: "Mobilisation pour entretien collectif",        type: "campagne",  status: "planned",    date: "2026-08-01", location: "Résidence Atlas",        organizer: "Nadia Ouahbi",    participantsTarget: 20, syndicateId: "syn_residence_atlas", createdBy: "user_admin_atlas", createdAt: daysAgo(5) },
    { id: "action_2", title: "Journée portes ouvertes syndic",     description: "Rencontre avec les copropriétaires et locataires", type: "evenement", status: "completed",  date: isoDate(30),  location: "Hall Résidence Atlas",   organizer: "Nadia Ouahbi",    participantsTarget: 50, syndicateId: "syn_residence_atlas", createdBy: "user_admin_atlas", createdAt: daysAgo(45) },
    { id: "action_3", title: "Réunion riverains Agdal",             description: "Coordination avec résidence voisine",          type: "reunion",   status: "in_progress", date: isoDate(-14), location: "Jardins d'Agdal",        organizer: "Youssef Idrissi", participantsTarget: 10, syndicateId: "syn_jardins_agdal",  createdBy: "user_admin_agdal", createdAt: daysAgo(10) },
  ]).onConflictDoNothing();
  await db.insert(actionSupportsTable).values([
    { id: "support_1", actionId: "action_1", userId: "user_member_1" },
    { id: "support_2", actionId: "action_1", userId: "user_member_2" },
    { id: "support_3", actionId: "action_2", userId: "user_member_1" },
  ]).onConflictDoNothing();
  await db.insert(actionParticipantsTable).values([
    { id: "participant_1", actionId: "action_2", userId: "user_member_1", userName: "Mohammed Alaoui" },
    { id: "participant_2", actionId: "action_2", userId: "user_member_2", userName: "Khadija Tahiri" },
    { id: "participant_3", actionId: "action_2", userId: "user_tenant_1", userName: "Sara Bouzid" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 15. PUBLICATIONS + COMMENTAIRES + LIKES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(publicationsTable).values([
    { id: "pub_1", title: "Travaux peinture — Planning",        content: "Les travaux de peinture de la cage d'escalier débuteront le 15 juillet.",                        category: "travaux",        pinned: false, syndicateId: "syn_residence_atlas", authorId: "user_admin_atlas",  authorName: "Nadia Ouahbi",    likes: 3, comments: 2, createdAt: daysAgo(4) },
    { id: "pub_2", title: "Résultats AG ordinaire 2025",        content: "Nous partageons le procès-verbal de l'AG ordinaire de 2025. Budget approuvé à l'unanimité.",     category: "compte-rendu",   pinned: true,  syndicateId: "syn_residence_atlas", authorId: "user_admin_atlas",  authorName: "Nadia Ouahbi",    likes: 5, comments: 1, createdAt: daysAgo(180) },
    { id: "pub_3", title: "Bienvenue Amina Rachidi !",          content: "Nous souhaitons la bienvenue à notre nouveau membre copropriétaire au lot Ag-02.",                category: "communauté",     pinned: false, syndicateId: "syn_jardins_agdal",  authorId: "user_admin_agdal",  authorName: "Youssef Idrissi", likes: 4, comments: 0, createdAt: daysAgo(680) },
    { id: "pub_4", title: "Nouveau contrat jardinage signé",    content: "Le contrat avec GreenClean Services pour l'entretien des espaces verts a été renouvelé.",         category: "contrats",       pinned: false, syndicateId: "syn_jardins_agdal",  authorId: "user_admin_agdal",  authorName: "Youssef Idrissi", likes: 2, comments: 0, createdAt: daysAgo(165) },
    { id: "pub_5", title: "Borne recharge VE installée",        content: "La première borne de recharge pour véhicules électriques a été installée au parking P-03.",      category: "infrastructure", pinned: true,  syndicateId: "syn_residence_atlas", authorId: "user_admin_atlas",  authorName: "Nadia Ouahbi",    likes: 8, comments: 3, createdAt: daysAgo(10) },
  ]).onConflictDoNothing();
  await db.insert(publicationLikesTable).values([
    { publicationId: "pub_1", userId: "user_member_1" },
    { publicationId: "pub_1", userId: "user_member_2" },
    { publicationId: "pub_1", userId: "user_tenant_1" },
    { publicationId: "pub_5", userId: "user_member_1" },
    { publicationId: "pub_5", userId: "user_member_2" },
  ]).onConflictDoNothing();
  await db.insert(publicationCommentsTable).values([
    { id: "pubcomment_1", publicationId: "pub_1", authorId: "user_member_2", authorName: "Khadija Tahiri",  text: "Merci pour l'info, quel prestataire ?" },
    { id: "pubcomment_2", publicationId: "pub_1", authorId: "user_member_1", authorName: "Mohammed Alaoui", text: "Bonne initiative !" },
    { id: "pubcomment_3", publicationId: "pub_5", authorId: "user_member_1", authorName: "Mohammed Alaoui", text: "Idée de génie, merci Nadia !" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 16. ANNONCES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(announcementsTable).values([
    { id: "announcement_1", title: "Coupure d'eau programmée",        body: "Une coupure d'eau est prévue le 12 juillet de 9h à 13h pour maintenance réseau.",                                 priority: "high",   audience: "all",   pinned: true,  syndicateId: "syn_residence_atlas", authorId: "user_admin_atlas",  author: "Nadia Ouahbi",    createdAt: daysAgo(2) },
    { id: "announcement_2", title: "Rappel — Cotisations juillet",    body: "Merci de régler vos charges de juillet avant le 10. Tout retard entraîne des pénalités.",                         priority: "normal", audience: "all",   pinned: false, syndicateId: "syn_residence_atlas", authorId: "user_admin_atlas",  author: "Nadia Ouahbi",    createdAt: daysAgo(8) },
    { id: "announcement_3", title: "Nettoyage parkings — dimanche",   body: "Dimanche 13 juillet, déplacement de véhicules obligatoire de 8h à 12h pour nettoyage haute pression.",            priority: "normal", audience: "all",   pinned: false, syndicateId: "syn_jardins_agdal",  authorId: "user_admin_agdal", author: "Youssef Idrissi", createdAt: daysAgo(5) },
    { id: "announcement_4", title: "Fermeture garderie copropriété",  body: "Suite à travaux, la garderie ferme du 20 au 27 juillet.",                                                          priority: "low",    audience: "all",   pinned: false, syndicateId: "syn_residence_atlas", authorId: "user_admin_atlas",  author: "Nadia Ouahbi",    createdAt: daysAgo(1) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 17. DOCUMENTS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(documentsTable).values([
    { id: "doc_1", title: "Règlement de copropriété",              category: "légal",           status: "published", syndicateId: "syn_residence_atlas", size: "1.2 MB",  createdBy: "user_admin_atlas", createdAt: daysAgo(1400) },
    { id: "doc_2", title: "PV AG 2025",                            category: "compte-rendu",    status: "published", syndicateId: "syn_residence_atlas", size: "340 KB",  createdBy: "user_admin_atlas", createdAt: daysAgo(300) },
    { id: "doc_3", title: "Budget prévisionnel 2026 approuvé",     category: "finance",         status: "published", syndicateId: "syn_residence_atlas", size: "520 KB",  createdBy: "user_admin_atlas", createdAt: daysAgo(180) },
    { id: "doc_4", title: "Carnet d'entretien Bâtiment A",         category: "entretien",       status: "published", syndicateId: "syn_residence_atlas", size: "2.1 MB",  createdBy: "user_admin_atlas", createdAt: daysAgo(90) },
    { id: "doc_5", title: "Règlement de copropriété Agdal",        category: "légal",           status: "published", syndicateId: "syn_jardins_agdal",   size: "980 KB",  createdBy: "user_admin_agdal", createdAt: daysAgo(850) },
    { id: "doc_6", title: "PV AG 2025 — Les Jardins d'Agdal",      category: "compte-rendu",    status: "published", syndicateId: "syn_jardins_agdal",   size: "290 KB",  createdBy: "user_admin_agdal", createdAt: daysAgo(290) },
    { id: "doc_7", title: "Contrat bail Sara Bouzid — Lot A205",   category: "bail",            status: "published", syndicateId: "syn_residence_atlas", size: "180 KB",  createdBy: "user_admin_atlas", createdAt: daysAgo(400) },
    { id: "doc_8", title: "Contrat bail Omar Zaki — Lot Ag-01",    category: "bail",            status: "published", syndicateId: "syn_jardins_agdal",   size: "175 KB",  createdBy: "user_admin_agdal", createdAt: daysAgo(200) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 18. CHAT: Conversations + Messages + Reads
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(conversationsTable).values([
    { id: "conv_general_atlas", syndicateId: "syn_residence_atlas", buildingId: "building_atlas_a", convType: "building", isGroup: true,  name: "Résidence Atlas — Discussion générale",    participantIds: JSON.stringify(["user_admin_atlas","user_member_1","user_member_2","user_member_5","user_tenant_1"]), createdAt: daysAgo(300) },
    { id: "conv_general_agdal", syndicateId: "syn_jardins_agdal",   buildingId: "building_agdal_1", convType: "building", isGroup: true,  name: "Les Jardins d'Agdal — Discussion générale", participantIds: JSON.stringify(["user_admin_agdal","user_member_3","user_member_4","user_tenant_2"]), createdAt: daysAgo(250) },
    { id: "conv_direct_1",      syndicateId: "syn_residence_atlas",                                  convType: "direct",   isGroup: false, participant1Id: "user_admin_atlas",  participant2Id: "user_member_1", lastMessage: "Pouvez-vous valider mon paiement ?", lastMessageAt: daysAgo(10), createdAt: daysAgo(60) },
    { id: "conv_direct_2",      syndicateId: "syn_residence_atlas",                                  convType: "direct",   isGroup: false, participant1Id: "user_admin_atlas",  participant2Id: "user_tenant_1", lastMessage: "Votre bail a été mis à jour.", lastMessageAt: daysAgo(5), createdAt: daysAgo(40) },
    { id: "conv_direct_3",      syndicateId: "syn_jardins_agdal",                                    convType: "direct",   isGroup: false, participant1Id: "user_admin_agdal",  participant2Id: "user_tenant_2", lastMessage: "L'intervention aura lieu jeudi.", lastMessageAt: daysAgo(2), createdAt: daysAgo(20) },
    { id: "conv_support_atlas", syndicateId: "syn_residence_atlas",                                  convType: "support",  isGroup: false, participant1Id: "user_super_admin",  participant2Id: "user_admin_atlas", createdAt: daysAgo(15) },
  ]).onConflictDoNothing();

  await db.insert(messagesTable).values([
    { id: "msg_1",  conversationId: "conv_general_atlas", senderId: "user_admin_atlas",  senderName: "Nadia Ouahbi",    text: "Bonjour à tous, rappel de l'AG du 20 juillet. Votre présence est importante.",    createdAt: daysAgo(3) },
    { id: "msg_2",  conversationId: "conv_general_atlas", senderId: "user_member_1",     senderName: "Mohammed Alaoui", text: "Bien reçu, j'y serai !",                                                           createdAt: daysAgo(3) },
    { id: "msg_3",  conversationId: "conv_general_atlas", senderId: "user_member_2",     senderName: "Khadija Tahiri",  text: "Moi aussi, merci pour le rappel.",                                                  createdAt: daysAgo(3) },
    { id: "msg_4",  conversationId: "conv_general_atlas", senderId: "user_tenant_1",     senderName: "Sara Bouzid",     text: "Bonjour, est-ce que les locataires peuvent assister ?",                             createdAt: daysAgo(2) },
    { id: "msg_5",  conversationId: "conv_general_atlas", senderId: "user_admin_atlas",  senderName: "Nadia Ouahbi",    text: "Bonjour Sara, l'AG est réservée aux copropriétaires. Merci pour votre compréhension.", createdAt: daysAgo(2) },
    { id: "msg_6",  conversationId: "conv_general_agdal", senderId: "user_admin_agdal",  senderName: "Youssef Idrissi", text: "Nettoyage parkings dimanche matin, merci de libérer vos places avant 8h.",            createdAt: daysAgo(5) },
    { id: "msg_7",  conversationId: "conv_general_agdal", senderId: "user_member_3",     senderName: "Rachid El Amrani", text: "Noté, merci.",                                                                     createdAt: daysAgo(5) },
    { id: "msg_8",  conversationId: "conv_direct_1",      senderId: "user_member_1",     senderName: "Mohammed Alaoui", text: "Bonjour, pouvez-vous valider mon paiement de charges ?",                           createdAt: daysAgo(10) },
    { id: "msg_9",  conversationId: "conv_direct_1",      senderId: "user_admin_atlas",  senderName: "Nadia Ouahbi",    text: "Bonjour Mohammed, je regarde ça.",                                                  createdAt: daysAgo(10) },
    { id: "msg_10", conversationId: "conv_direct_2",      senderId: "user_admin_atlas",  senderName: "Nadia Ouahbi",    text: "Bonjour Sara, votre bail a été mis à jour dans l'application.",                     createdAt: daysAgo(5) },
    { id: "msg_11", conversationId: "conv_direct_3",      senderId: "user_tenant_2",     senderName: "Omar Zaki",       text: "Bonjour, quand aura lieu l'intervention pour le tableau électrique ?",               createdAt: daysAgo(3) },
    { id: "msg_12", conversationId: "conv_direct_3",      senderId: "user_admin_agdal",  senderName: "Youssef Idrissi", text: "L'intervention aura lieu jeudi 11h–13h.",                                          createdAt: daysAgo(2) },
    { id: "msg_13", conversationId: "conv_support_atlas", senderId: "user_admin_atlas",  senderName: "Nadia Ouahbi",    text: "Bonjour Karim, j'ai un souci avec l'export PDF des PV.",                            createdAt: daysAgo(15) },
    { id: "msg_14", conversationId: "conv_support_atlas", senderId: "user_super_admin",  senderName: "Karim Bensouda",  text: "Bonjour Nadia, problème identifié, correction déployée demain.",                    createdAt: daysAgo(14) },
  ]).onConflictDoNothing();

  await db.insert(messageReadsTable).values([
    { id: "read_1", conversationId: "conv_general_atlas", userId: "user_member_1" },
    { id: "read_2", conversationId: "conv_general_atlas", userId: "user_member_2" },
    { id: "read_3", conversationId: "conv_general_agdal", userId: "user_member_3" },
    { id: "read_4", conversationId: "conv_direct_1",      userId: "user_admin_atlas" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 19. MARKETPLACE: Produits · Panier · Commandes · Avis · Favoris · etc.
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(productsTable).values([
    { id: "product_1", name: "Table de jardin en teck",       description: "Table 6 places, très bon état, protégée hiver.",   price: "1200.00", category: "mobilier",       condition: "bon",         location: "Résidence Atlas",       stock: 1, syndicateId: "syn_residence_atlas", sellerId: "user_member_1", sellerName: "Mohammed Alaoui", status: "approved",      featured: true,  viewCount: 47, createdAt: daysAgo(15) },
    { id: "product_2", name: "Vélo enfant 20 pouces",         description: "Peu servi, comme neuf, casque inclus.",            price: "450.00",  category: "loisirs",        condition: "neuf",        location: "Résidence Atlas",       stock: 1, syndicateId: "syn_residence_atlas", sellerId: "user_member_2", sellerName: "Khadija Tahiri",  status: "pending_review",featured: false, viewCount: 12, createdAt: daysAgo(2) },
    { id: "product_3", name: "Machine à café Nespresso",      description: "Fonctionne parfaitement, 100 capsules incluses.", price: "600.00",  category: "électroménager", condition: "bon",         location: "Les Jardins d'Agdal",   stock: 1, syndicateId: "syn_jardins_agdal",  sellerId: "user_member_3", sellerName: "Rachid El Amrani",status: "approved",      featured: false, viewCount: 33, createdAt: daysAgo(8) },
    { id: "product_4", name: "Bibliothèque IKEA KALLAX",      description: "4×4 cases, couleur blanc, très bon état.",         price: "350.00",  category: "mobilier",       condition: "bon",         location: "Résidence Atlas",       stock: 1, syndicateId: "syn_residence_atlas", sellerId: "user_member_2", sellerName: "Khadija Tahiri",  status: "approved",      featured: false, viewCount: 28, createdAt: daysAgo(12) },
    { id: "product_5", name: "Matelas 140×190 Simmons",       description: "Matelas mémoire de forme, 3 ans d'usage.",         price: "900.00",  category: "literie",        condition: "acceptable",  location: "Les Jardins d'Agdal",   stock: 1, syndicateId: "syn_jardins_agdal",  sellerId: "user_member_4", sellerName: "Amina Rachidi",   status: "approved",      featured: false, viewCount: 19, createdAt: daysAgo(6) },
    { id: "product_6", name: "Climatiseur Carrier 18000 BTU", description: "Fonctionne bien, unité murale + extérieure.",      price: "2500.00", category: "électroménager", condition: "bon",         location: "Résidence Atlas",       stock: 1, syndicateId: "syn_residence_atlas", sellerId: "user_member_5", sellerName: "Hassan Cherkaoui",status: "rejected",      featured: false, viewCount: 5,  rejectionReason: "Photos insuffisantes.", createdAt: daysAgo(3) },
  ]).onConflictDoNothing();
  await db.insert(cartItemsTable).values([
    { id: "cartitem_1", userId: "user_tenant_1",  productId: "product_1", productName: "Table de jardin en teck", price: "1200.00", sellerName: "Mohammed Alaoui", quantity: 1 },
    { id: "cartitem_2", userId: "user_member_1",  productId: "product_5", productName: "Matelas 140×190 Simmons", price: "900.00",  sellerName: "Amina Rachidi",   quantity: 1 },
  ]).onConflictDoNothing();
  await db.insert(ordersTable).values([
    { id: "order_1", productId: "product_3", productName: "Machine à café Nespresso", buyerId: "user_member_1", buyerName: "Mohammed Alaoui", sellerId: "user_member_3", sellerName: "Rachid El Amrani", amount: "600.00", status: "delivered", type: "purchase", date: "2026-06-25", createdAt: daysAgo(13) },
    { id: "order_2", productId: "product_4", productName: "Bibliothèque KALLAX",      buyerId: "user_tenant_1", buyerName: "Sara Bouzid",     sellerId: "user_member_2", sellerName: "Khadija Tahiri",  amount: "350.00", status: "confirmed", type: "purchase", date: isoDate(-2),  createdAt: daysAgo(2) },
  ]).onConflictDoNothing();
  await db.insert(reviewsTable).values([
    { id: "review_1", productId: "product_3", productName: "Machine à café Nespresso", orderId: "order_1", rating: 5, comment: "Vendeur sérieux, article conforme.",   reviewerId: "user_member_1", reviewerName: "Mohammed Alaoui", date: "2026-06-26" },
    { id: "review_2", productId: "product_4", productName: "Bibliothèque IKEA KALLAX", orderId: "order_2", rating: 4, comment: "Bon état, remise en main propre rapide.", reviewerId: "user_tenant_1", reviewerName: "Sara Bouzid", date: "2026-07-02" },
  ]).onConflictDoNothing();
  await db.insert(productFavoritesTable).values([
    { id: "fav_1", productId: "product_1", userId: "user_tenant_1" },
    { id: "fav_2", productId: "product_3", userId: "user_member_1" },
  ]).onConflictDoNothing();
  await db.insert(productReportsTable).values([
    { id: "report_1", productId: "product_2", reporterId: "user_member_1", reporterName: "Mohammed Alaoui", reason: "mauvaise_info", details: "Prix incohérent avec la description.", status: "pending" },
    { id: "report_2", productId: "product_5", reporterId: "user_member_4", reporterName: "Amina Rachidi", reason: "autre", details: "Annonce publiée avec des photos qui ne correspondent pas exactement au produit.", status: "reviewed", reviewedBy: "user_admin_agdal", reviewedAt: daysAgo(2) },
  ]).onConflictDoNothing();
  await db.insert(productCommentsTable).values([
    { id: "prodcomment_1", productId: "product_1", userId: "user_tenant_1",  userName: "Sara Bouzid",     userRole: "tenant", content: "Toujours disponible ?" },
    { id: "prodcomment_2", productId: "product_1", userId: "user_member_1",  userName: "Mohammed Alaoui", userRole: "member", content: "Oui, venez la voir quand vous voulez !" },
    { id: "prodcomment_3", productId: "product_3", userId: "user_member_4",  userName: "Amina Rachidi",   userRole: "member", content: "Quel modèle exactement ?" },
  ]).onConflictDoNothing();
  await db.insert(marketplacePromotionsTable).values([
    { id: "promo_1", productId: "product_1", sellerId: "user_member_1", type: "featured", startDate: daysAgo(15), endDate: daysAgo(-15), amount: "50.00", status: "active", approvedBy: "user_admin_atlas" },
    { id: "promo_2", productId: "product_3", sellerId: "user_member_3", type: "homepage", startDate: daysAgo(4), endDate: daysAgo(-11), amount: "35.00", status: "pending_payment", paymentMethod: "card", notes: "Promotion demandée pour la semaine des ventes d'été." },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 20. ALERTES LÉGALES + TICKETS SUPPORT
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(legalAlertsTable).values([
    { id: "legal_1", title: "Mise à jour Loi 18-00",              description: "Nouvelles obligations de tenue des AG annuelles.",            level: "info",    category: "réglementation", date: "2026-06-01", status: "open",    syndicateId: "syn_residence_atlas", createdAt: daysAgo(37) },
    { id: "legal_2", title: "Décret travaux parties communes",    description: "Nouveau décret imposant diagnostic technique avant travaux.",  level: "warning", category: "travaux",        date: "2026-05-15", status: "open",    syndicateId: "syn_residence_atlas", createdAt: daysAgo(52) },
    { id: "legal_3", title: "Obligation assurance copropriété",   description: "Rappel : assurance immeuble obligatoire à renouveler.",        level: "critical", category: "assurance",     date: "2026-07-01", status: "pending", syndicateId: "syn_jardins_agdal",   createdAt: daysAgo(7) },
  ]).onConflictDoNothing();
  await db.insert(supportTicketsTable).values([
    { id: "ticket_1", title: "Problème connexion application",    description: "Impossible de me connecter depuis hier matin.",              priority: "high",   category: "technique",   status: "open",       syndicateId: "syn_residence_atlas", submittedById: "user_member_2", submittedByName: "Khadija Tahiri",  createdAt: daysAgo(1) },
    { id: "ticket_2", title: "Erreur export PDF procès-verbal",   description: "L'export PDF du PV AG 2025 génère un fichier corrompu.",     priority: "medium", category: "technique",   status: "in_progress", syndicateId: "syn_residence_atlas", submittedById: "user_admin_atlas", submittedByName: "Nadia Ouahbi",   createdAt: daysAgo(15) },
    { id: "ticket_3", title: "Demande ajout copropriétaire",      description: "Nouveau propriétaire lot B01 suite vente. Mettre à jour.",   priority: "low",    category: "administratif", status: "resolved",  syndicateId: "syn_residence_atlas", submittedById: "user_admin_atlas", submittedByName: "Nadia Ouahbi",   createdAt: daysAgo(30) },
    { id: "ticket_4", title: "Fuite eau lot Ag-01 non résolue",   description: "Signalé il y a 2 semaines, toujours pas d'intervention.",    priority: "high",   category: "maintenance", status: "open",       syndicateId: "syn_jardins_agdal",   submittedById: "user_tenant_2",   submittedByName: "Omar Zaki",       createdAt: daysAgo(3) },
  ]).onConflictDoNothing();
  await db.insert(ticketRepliesTable).values([
    { id: "reply_1", ticketId: "ticket_1", authorId: "user_super_admin", authorName: "Karim Bensouda",  text: "Bonjour, pouvez-vous préciser le message d'erreur ?" },
    { id: "reply_2", ticketId: "ticket_2", authorId: "user_super_admin", authorName: "Karim Bensouda",  text: "Problème identifié, correction déployée demain matin." },
    { id: "reply_3", ticketId: "ticket_3", authorId: "user_admin_atlas", authorName: "Nadia Ouahbi",    text: "Mis à jour dans le système, merci." },
    { id: "reply_4", ticketId: "ticket_4", authorId: "user_admin_agdal", authorName: "Youssef Idrissi", text: "Intervention planifiée jeudi prochain, désolé pour le délai." },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 21. COTISATIONS + PREUVES DE PAIEMENT
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(cotisationsTable).values([
    { id: "cotisation_1",  memberId: "member_1", label: "Cotisation juillet 2026",  period: "2026-07", amount: "450.00", dueDate: "2026-07-10", status: "paid",    syndicateId: "syn_residence_atlas", paidDate: "2026-07-05", receipt: "REC-2026-0701", createdAt: daysAgo(30) },
    { id: "cotisation_2",  memberId: "member_3", label: "Cotisation juin 2026",     period: "2026-06", amount: "450.00", dueDate: "2026-06-10", status: "overdue", syndicateId: "syn_residence_atlas", createdAt: daysAgo(60) },
    { id: "cotisation_3",  memberId: "member_3", label: "Cotisation mai 2026",      period: "2026-05", amount: "450.00", dueDate: "2026-05-10", status: "overdue", syndicateId: "syn_residence_atlas", createdAt: daysAgo(91) },
    { id: "cotisation_4",  memberId: "member_2", label: "Cotisation juillet 2026",  period: "2026-07", amount: "450.00", dueDate: "2026-07-10", status: "paid",    syndicateId: "syn_residence_atlas", paidDate: "2026-07-08", receipt: "REC-2026-0703", createdAt: daysAgo(28) },
    { id: "cotisation_5",  memberId: "member_4", label: "Cotisation juillet 2026",  period: "2026-07", amount: "600.00", dueDate: "2026-07-10", status: "paid",    syndicateId: "syn_jardins_agdal",  paidDate: "2026-07-02", receipt: "REC-2026-0812", createdAt: daysAgo(28) },
    { id: "cotisation_6",  memberId: "member_5", label: "Cotisation juillet 2026",  period: "2026-07", amount: "600.00", dueDate: "2026-07-10", status: "pending", syndicateId: "syn_jardins_agdal",  createdAt: daysAgo(8) },
    { id: "cotisation_7",  memberId: "member_1", label: "Cotisation juin 2026",     period: "2026-06", amount: "450.00", dueDate: "2026-06-10", status: "paid",    syndicateId: "syn_residence_atlas", paidDate: "2026-06-07", receipt: "REC-2026-0625", createdAt: daysAgo(60) },
  ]).onConflictDoNothing();
  await db.insert(paymentProofsTable).values([
    { id: "proof_1", cotisationId: "cotisation_1", userId: "user_member_1", fileUrl: "/uploads/proofs/proof_1.jpg", proofUrl: "/uploads/proofs/proof_1.jpg", amount: "450.00", status: "approved",  uploadedById: "user_member_1", reviewedById: "user_admin_atlas", reviewedAt: daysAgo(28) },
    { id: "proof_2", cotisationId: "cotisation_4", userId: "user_member_2", fileUrl: "/uploads/proofs/proof_2.jpg", proofUrl: "/uploads/proofs/proof_2.jpg", amount: "450.00", status: "approved",  uploadedById: "user_member_2", reviewedById: "user_admin_atlas", reviewedAt: daysAgo(26) },
    { id: "proof_3", cotisationId: "cotisation_5", userId: "user_member_4", fileUrl: "/uploads/proofs/proof_3.jpg", proofUrl: "/uploads/proofs/proof_3.jpg", amount: "600.00", status: "approved",  uploadedById: "user_member_4", reviewedById: "user_admin_agdal", reviewedAt: daysAgo(25) },
    { id: "proof_4", cotisationId: "cotisation_6", userId: "user_member_5", fileUrl: "/uploads/proofs/proof_4.jpg", proofUrl: "/uploads/proofs/proof_4.jpg", amount: "600.00", status: "pending",   uploadedById: "user_member_5", createdAt: daysAgo(3) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 22. ALERTES + PRÉFÉRENCES NOTIFICATION + PARTENAIRES + FICHES DE PAIE
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(alertsTable).values([
    { id: "alert_1", title: "Solde trésorerie faible",             message: "Le solde de la caisse Résidence Atlas est descendu sous 30 000 MAD.",             type: "warning",  date: isoDate(2),  target: "admin",  syndicateId: "syn_residence_atlas", createdAt: daysAgo(2) },
    { id: "alert_2", title: "Impayé — Hassan Cherkaoui 6 mois",   message: "Le lot A205 accuse 6 mois de charges impayées soit 2 700 MAD.",                   type: "error",    date: isoDate(7),  target: "admin",  syndicateId: "syn_residence_atlas", createdAt: daysAgo(7) },
    { id: "alert_3", title: "Contrat EcoPaysage expiré",           message: "Le contrat jardinage Agdal a expiré le 31/12/2025, renouvellement en attente.",    type: "warning",  date: isoDate(10), target: "admin",  syndicateId: "syn_jardins_agdal",   createdAt: daysAgo(10) },
    { id: "alert_4", title: "AG du 20 juillet — Rappel",           message: "L'Assemblée Générale Ordinaire est prévue le 20 juillet à 10h.",                  type: "info",     date: isoDate(3),  target: "all",    syndicateId: "syn_residence_atlas", createdAt: daysAgo(3) },
    { id: "alert_5", title: "Nouveau sinistre déclaré Agdal",      message: "Un départ de feu a été signalé au lot Ag-01. Dossier SIN-2026-0052 ouvert.",       type: "error",    date: isoDate(7),  target: "all",    syndicateId: "syn_jardins_agdal",   createdAt: daysAgo(7) },
  ]).onConflictDoNothing();
  await db.insert(alertReadsTable).values([
    { alertId: "alert_1", userId: "user_admin_atlas" },
    { alertId: "alert_4", userId: "user_member_1" },
    { alertId: "alert_4", userId: "user_member_2" },
  ]).onConflictDoNothing();
  await db.insert(notificationPreferencesTable).values([
    { id: "pref_1", userId: "user_member_1",  push: true,  email: true,  inApp: true },
    { id: "pref_2", userId: "user_member_2",  push: true,  email: true,  inApp: true },
    { id: "pref_3", userId: "user_tenant_1",  push: true,  email: false, inApp: true },
    { id: "pref_4", userId: "user_tenant_2",  push: true,  email: false, inApp: true },
    { id: "pref_5", userId: "user_admin_atlas", push: true, email: true, inApp: true },
    { id: "pref_6", userId: "user_admin_agdal", push: true, email: true, inApp: true },
  ]).onConflictDoNothing();
  await db.insert(partnersTable).values([
    { id: "partner_1", name: "Clinique Al Amal",         type: "santé",         sector: "médical",  contact: "Dr. Fadili",      phone: "+212522333333", benefit: "Réduction consultations", discount: "15%", syndicateId: "syn_residence_atlas", startDate: isoDate(200), createdAt: daysAgo(200) },
    { id: "partner_2", name: "Pharmacie Centrale Anfa",  type: "santé",         sector: "médical",  contact: "Karim Filali",    phone: "+212522444000", benefit: "Remise sur médicaments",   discount: "10%", syndicateId: "syn_residence_atlas", startDate: isoDate(100), createdAt: daysAgo(100) },
    { id: "partner_3", name: "Supermarché MarjaneAgdal", type: "alimentation",  sector: "commerce", contact: "Dir. commercial", phone: "+212537888000", benefit: "Points fidélité doublés",  discount: "5%",  syndicateId: "syn_jardins_agdal",   startDate: isoDate(150), createdAt: daysAgo(150) },
  ]).onConflictDoNothing();
  await db.insert(payslipsTable).values([
    { id: "payslip_1", userId: "user_admin_atlas", month: "2026-06", amount: "3500.00", fileUrl: "/uploads/payslips/payslip_1.pdf", syndicateId: "syn_residence_atlas", createdAt: daysAgo(38) },
    { id: "payslip_2", userId: "user_admin_atlas", month: "2026-07", amount: "3500.00", fileUrl: "/uploads/payslips/payslip_2.pdf", syndicateId: "syn_residence_atlas", createdAt: daysAgo(5) },
    { id: "payslip_3", userId: "user_admin_agdal", month: "2026-07", amount: "4200.00", fileUrl: "/uploads/payslips/payslip_3.pdf", syndicateId: "syn_jardins_agdal",  createdAt: daysAgo(5) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 23. ABONNEMENTS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(subscriptionPlansTable).values([
    { id: "plan_basic",    name: "Basique",    price: "299.00",  interval: "monthly", features: JSON.stringify(["Gestion des charges","1 bâtiment","Support email"]) },
    { id: "plan_pro",      name: "Pro",        price: "699.00",  interval: "monthly", features: JSON.stringify(["Multi-bâtiments","Marketplace","Support prioritaire","Transparence financière","Audit logs"]) },
    { id: "plan_premium",  name: "Premium",    price: "1299.00", interval: "monthly", features: JSON.stringify(["Multi-syndicats","API access","Tableau national","SLA 99.9%","Account manager dédié"]) },
  ]).onConflictDoNothing();
  await db.insert(syndicateSubscriptionsTable).values([
    { id: "sub_1", syndicateId: "syn_residence_atlas", planId: "plan_pro",     status: "active", autoRenew: true, createdAt: daysAgo(190) },
    { id: "sub_2", syndicateId: "syn_jardins_agdal",   planId: "plan_basic",   status: "active", autoRenew: true, createdAt: daysAgo(170) },
  ]).onConflictDoNothing();
  await db.insert(subscriptionPaymentsTable).values([
    { id: "subpay_1", syndicateId: "syn_residence_atlas", subscriptionId: "sub_1", planId: "plan_pro", invoiceId: "binv_2", idempotencyKey: "seed-subpay-001", amount: "699.00", currency: "MAD", billingInterval: "monthly", paymentMethod: "card", provider: "stripe", providerReference: "pi_seed_001", status: "succeeded", metadata: { source: "demo_seed", scenario: "paid_renewal" }, processedAt: daysAgo(118), createdAt: daysAgo(118), updatedAt: daysAgo(118) },
    { id: "subpay_2", syndicateId: "syn_residence_atlas", subscriptionId: "sub_1", planId: "plan_pro", invoiceId: "binv_3", idempotencyKey: "seed-subpay-002", amount: "699.00", currency: "MAD", billingInterval: "monthly", paymentMethod: "card", provider: "stripe", status: "pending", metadata: { source: "demo_seed", scenario: "pending_payment" }, createdAt: daysAgo(2), updatedAt: daysAgo(2) },
    { id: "subpay_3", syndicateId: "syn_jardins_agdal", subscriptionId: "sub_2", planId: "plan_basic", invoiceId: "binv_5", idempotencyKey: "seed-subpay-003", amount: "299.00", currency: "MAD", billingInterval: "monthly", paymentMethod: "bank_transfer", provider: "manual", status: "failed", failureCode: "insufficient_funds", failureMessage: "Virement non reçu à la date d'échéance.", metadata: { source: "demo_seed", scenario: "failed_payment" }, createdAt: daysAgo(8), updatedAt: daysAgo(8) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 24. AUDIT LOGS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(auditLogsTable).values([
    { id: "audit_1",  userId: "user_admin_atlas",   userName: "Nadia Ouahbi",    actorRole: "syndicate_admin", syndicateId: "syn_residence_atlas", isSupervision: false, action: "VALIDATE",  entity: "appels_de_fonds", entityId: "adf_1",      details: "Validation paiement charges juillet A101",          createdAt: daysAgo(28) },
    { id: "audit_2",  userId: "user_super_admin",   userName: "Karim Bensouda",  actorRole: "super_admin",     syndicateId: null,                  isSupervision: false, action: "APPROVE",   entity: "products",        entityId: "product_1",  details: "Approbation annonce marketplace",                   createdAt: daysAgo(14) },
    { id: "audit_3",  userId: "user_admin_atlas",   userName: "Nadia Ouahbi",    actorRole: "syndicate_admin", syndicateId: "syn_residence_atlas", isSupervision: false, action: "CREATE",    entity: "meeting",         entityId: "meeting_1",  details: "Création AG Ordinaire 2026",                        createdAt: daysAgo(20) },
    { id: "audit_4",  userId: "user_admin_atlas",   userName: "Nadia Ouahbi",    actorRole: "syndicate_admin", syndicateId: "syn_residence_atlas", isSupervision: false, action: "CREATE",    entity: "budget",          entityId: "budget_atlas_2026", details: "Création budget 2026 — 129 600 MAD",            createdAt: daysAgo(200) },
    { id: "audit_5",  userId: "user_super_admin",   userName: "Karim Bensouda",  actorRole: "super_admin",     syndicateId: "syn_residence_atlas", isSupervision: true,  action: "VIEW",      entity: "audit_logs",      entityId: null,         details: "Supervision Journal d'Audit Résidence Atlas",       createdAt: daysAgo(5) },
    { id: "audit_6",  userId: "user_admin_agdal",   userName: "Youssef Idrissi", actorRole: "syndicate_admin", syndicateId: "syn_jardins_agdal",   isSupervision: false, action: "CREATE",    entity: "meeting",         entityId: "meeting_3",  details: "Création AG Ordinaire Agdal 2026",                  createdAt: daysAgo(20) },
    { id: "audit_7",  userId: "user_admin_atlas",   userName: "Nadia Ouahbi",    actorRole: "syndicate_admin", syndicateId: "syn_residence_atlas", isSupervision: false, action: "UPDATE",    entity: "travaux",         entityId: "travaux_2",  details: "Clôture travaux peinture cage escalier",            createdAt: daysAgo(45) },
    { id: "audit_8",  userId: "user_member_1",      userName: "Mohammed Alaoui", actorRole: "member",          syndicateId: "syn_residence_atlas", isSupervision: false, action: "PAY",       entity: "appels_de_fonds", entityId: "adf_1",      details: "Soumission preuve paiement juillet A101",           createdAt: daysAgo(30) },
    { id: "audit_9",  userId: "user_super_admin",   userName: "Karim Bensouda",  actorRole: "super_admin",     syndicateId: null,                  isSupervision: false, action: "CREATE",    entity: "syndicate",       entityId: "syn_jardins_agdal", details: "Création Syndicat Les Jardins d'Agdal",       createdAt: daysAgo(900) },
    { id: "audit_10", userId: "user_admin_atlas",   userName: "Nadia Ouahbi",    actorRole: "syndicate_admin", syndicateId: "syn_residence_atlas", isSupervision: false, action: "VALIDATE",  entity: "appels_de_fonds", entityId: "adf_2",      details: "Validation chèque en attente — lot A102",          createdAt: daysAgo(8) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 25. IDÉES + VOTES IDÉES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(ideasTable).values([
    { id: "idea_1", syndicateId: "syn_residence_atlas", userId: "user_member_1", userName: "Mohammed Alaoui",  title: "Installer des bornes de recharge électrique",   description: "Ajouter 2 bornes VE au parking P-03",                 category: "infrastructure", status: "under_review", voteCount: 2, voteDeadline: "2026-08-01", createdAt: daysAgo(20) },
    { id: "idea_2", syndicateId: "syn_residence_atlas", userId: "user_member_2", userName: "Khadija Tahiri",   title: "Tri sélectif des déchets",                      description: "Poubelles de tri sélectif par étage",                  category: "environment",    status: "approved",     voteCount: 4, adminNote: "Approuvé, mise en œuvre prévue en septembre", createdAt: daysAgo(45) },
    { id: "idea_3", syndicateId: "syn_jardins_agdal",   userId: "user_member_3", userName: "Rachid El Amrani", title: "Caméras de surveillance parking",               description: "Installer 3 caméras HD parking sous-sol",              category: "services",       status: "submitted",    voteCount: 1, voteDeadline: "2026-08-15", createdAt: daysAgo(8) },
    { id: "idea_4", syndicateId: "syn_residence_atlas", userId: "user_tenant_1", userName: "Sara Bouzid",      title: "Jardin partagé sur la terrasse",                description: "Aménager la terrasse en jardin partagé pour résidents", category: "environment",    status: "submitted",    voteCount: 1, voteDeadline: "2026-08-20", createdAt: daysAgo(3) },
  ]).onConflictDoNothing();
  await db.insert(ideaVotesTable).values([
    { id: "ideavote_1", ideaId: "idea_1", userId: "user_member_1" },
    { id: "ideavote_2", ideaId: "idea_1", userId: "user_member_2" },
    { id: "ideavote_3", ideaId: "idea_2", userId: "user_member_1" },
    { id: "ideavote_4", ideaId: "idea_3", userId: "user_member_4" },
    { id: "ideavote_5", ideaId: "idea_4", userId: "user_member_2" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 26. ESCALADES DETTE
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(debtEscalationsTable).values([
    { id: "escalation_1", syndicateId: "syn_residence_atlas", memberId: "member_3", memberName: "Hassan Cherkaoui", lotId: "lot_a205", residentType: "member",  totalOverdue: "2700.00", overdueMonths: 6, escalationLevel: "final_warning", level: "serious",  status: "meeting_scheduled", alertSentAt: daysAgo(10), meetingId: "meeting_1", createdAt: daysAgo(15) },
    { id: "escalation_2", syndicateId: "syn_jardins_agdal",   memberId: "member_6", memberName: "Kaouthar Bennis",  lotId: null,      residentType: "member",  totalOverdue: "1800.00", overdueMonths: 3, escalationLevel: "warning",       level: "moderate", status: "open",               alertSentAt: daysAgo(3),  createdAt: daysAgo(5) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 27. JUSTIFICATIONS DÉPENSES + VOTES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(expenseJustificationsTable).values([
    { id: "just_1", syndicateId: "syn_residence_atlas", transactionId: "tx_2", title: "Maintenance ascenseur juillet", description: "Intervention trimestrielle contractuelle sur les 2 ascenseurs", amount: "8000.00", category: "entretien",  receiptUrl: "/uploads/receipts/just_1.pdf", status: "approved",   submittedBy: "user_admin_atlas", submitterName: "Nadia Ouahbi",    voteCount: 2, votesFor: 2, votesAgainst: 0, createdAt: daysAgo(32) },
    { id: "just_2", syndicateId: "syn_residence_atlas", transactionId: "tx_6", title: "Peinture cage escalier bâtiment A", description: "Travaux de rafraîchissement, 3 étages",                       amount: "11800.00", category: "travaux",    receiptUrl: "/uploads/receipts/just_2.pdf", status: "challenged", submittedBy: "user_admin_atlas", submitterName: "Nadia Ouahbi",    challengedBy: "user_member_5", challengerName: "Hassan Cherkaoui", challengeReason: "Devis initial était de 10 000 MAD.", voteCount: 2, votesFor: 1, votesAgainst: 1, createdAt: daysAgo(45) },
    { id: "just_3", syndicateId: "syn_jardins_agdal",   transactionId: "tx_8", title: "Entretien espaces verts juin",   description: "Tonte, taille haies, arrosage — juin 2026",                   amount: "4200.00",  category: "entretien",  receiptUrl: "/uploads/receipts/just_3.pdf", status: "approved",   submittedBy: "user_admin_agdal", submitterName: "Youssef Idrissi", voteCount: 1, votesFor: 1, votesAgainst: 0, createdAt: daysAgo(42) },
  ]).onConflictDoNothing();
  await db.insert(expenseVotesTable).values([
    { id: "expvote_1", justificationId: "just_1", userId: "user_member_1", vote: "for" },
    { id: "expvote_2", justificationId: "just_1", userId: "user_member_2", vote: "for" },
    { id: "expvote_3", justificationId: "just_2", userId: "user_member_1", vote: "for" },
    { id: "expvote_4", justificationId: "just_2", userId: "user_member_5", vote: "against" },
    { id: "expvote_5", justificationId: "just_3", userId: "user_member_4", vote: "for" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 28. CLASSEMENT NATIONAL
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(nationalRankingsTable).values([
    { id: "ranking_1", syndicateId: "syn_residence_atlas", month: 5, year: 2026, collectionRate: "88.00", incidentResolutionRate: "80.00", documentationScore: "85.00", meetingComplianceScore: "100.00", memberSatisfaction: "86.00", totalScore: "88.00", rank: 5,  regionRank: 2, region: "Casablanca-Settat", createdAt: daysAgo(50) },
    { id: "ranking_2", syndicateId: "syn_residence_atlas", month: 6, year: 2026, collectionRate: "92.00", incidentResolutionRate: "85.00", documentationScore: "90.00", meetingComplianceScore: "100.00", memberSatisfaction: "88.00", totalScore: "91.00", rank: 3,  regionRank: 1, region: "Casablanca-Settat", createdAt: daysAgo(20) },
    { id: "ranking_3", syndicateId: "syn_jardins_agdal",   month: 5, year: 2026, collectionRate: "95.00", incidentResolutionRate: "88.00", documentationScore: "78.00", meetingComplianceScore: "100.00", memberSatisfaction: "91.00", totalScore: "91.00", rank: 2,  regionRank: 1, region: "Rabat-Salé-Kénitra", createdAt: daysAgo(50) },
    { id: "ranking_4", syndicateId: "syn_jardins_agdal",   month: 6, year: 2026, collectionRate: "97.00", incidentResolutionRate: "90.00", documentationScore: "80.00", meetingComplianceScore: "100.00", memberSatisfaction: "93.00", totalScore: "93.00", rank: 1,  regionRank: 1, region: "Rabat-Salé-Kénitra", createdAt: daysAgo(20) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 29. PARKING: Places · Véhicules · Infractions · Réservations visiteurs
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(parkingSpotsTable).values([
    { id: "spot_a_p01", buildingId: "building_atlas_a", lotId: "lot_a101", spotNumber: "P-01", type: "resident",  floor: "SS-1", status: "occupied",  createdAt: daysAgo(1300) },
    { id: "spot_a_p02", buildingId: "building_atlas_a", lotId: "lot_a102", spotNumber: "P-02", type: "resident",  floor: "SS-1", status: "occupied",  createdAt: daysAgo(1250) },
    { id: "spot_a_p03", buildingId: "building_atlas_a", lotId: "lot_a205", spotNumber: "P-03", type: "resident",  floor: "SS-1", status: "occupied",  notes: "Borne VE installée",           createdAt: daysAgo(1200) },
    { id: "spot_a_p04", buildingId: "building_atlas_a", lotId: "lot_a301", spotNumber: "P-04", type: "resident",  floor: "SS-1", status: "occupied",  createdAt: daysAgo(1100) },
    { id: "spot_a_v01", buildingId: "building_atlas_a",                   spotNumber: "V-01", type: "visitor",   floor: "RDC",  status: "available", notes: "Visiteurs uniquement — 2h max", createdAt: daysAgo(1500) },
    { id: "spot_a_v02", buildingId: "building_atlas_a",                   spotNumber: "V-02", type: "visitor",   floor: "RDC",  status: "reserved",  createdAt: daysAgo(1500) },
    { id: "spot_ag_01", buildingId: "building_agdal_1", lotId: "lot_ag01", spotNumber: "G-01", type: "garage",   floor: "SS-1", status: "occupied",  createdAt: daysAgo(850) },
    { id: "spot_ag_02", buildingId: "building_agdal_1", lotId: "lot_ag12", spotNumber: "G-02", type: "garage",   floor: "SS-1", status: "occupied",  createdAt: daysAgo(800) },
    { id: "spot_ag_v1", buildingId: "building_agdal_1",                   spotNumber: "V-01", type: "visitor",   floor: "RDC",  status: "available", createdAt: daysAgo(900) },
  ]).onConflictDoNothing();

  await db.insert(vehiclesTable).values([
    { id: "vehicle_1", lotId: "lot_a101", userId: "user_member_1",  plateNumber: "45678-A-1",  brand: "Toyota",  model: "Corolla", color: "Blanc",  status: "active", createdAt: daysAgo(1200) },
    { id: "vehicle_2", lotId: "lot_a102", userId: "user_member_2",  plateNumber: "23456-A-1",  brand: "Dacia",   model: "Logan",   color: "Gris",   status: "active", createdAt: daysAgo(1100) },
    { id: "vehicle_3", lotId: "lot_a205", userId: "user_tenant_1",  plateNumber: "78901-A-1",  brand: "Renault", model: "Clio",    color: "Rouge",  status: "active", createdAt: daysAgo(400) },
    { id: "vehicle_4", lotId: "lot_ag01", userId: "user_tenant_2",  plateNumber: "34567-R-2",  brand: "Hyundai", model: "Tucson",  color: "Noir",   status: "active", createdAt: daysAgo(200) },
    { id: "vehicle_5", lotId: "lot_ag12", userId: "user_member_3",  plateNumber: "90123-R-2",  brand: "Peugeot", model: "508",     color: "Bleu",   status: "active", createdAt: daysAgo(800) },
    { id: "vehicle_6", lotId: "lot_a301", userId: "user_member_1",  plateNumber: "11122-A-1",  brand: "BMW",     model: "Série 3", color: "Argent", status: "active", createdAt: daysAgo(500) },
  ]).onConflictDoNothing();

  await db.insert(parkingViolationsTable).values([
    { id: "violation_1", spotId: "spot_a_v01", buildingId: "building_atlas_a", plateNumber: "99999-B-3", reportedById: "user_admin_atlas", reportedByName: "Nadia Ouahbi",    notes: "Voiture inconnue garée place visiteur depuis 3 jours.",    status: "open",     reportedAt: daysAgo(2), createdAt: daysAgo(2) },
    { id: "violation_2", spotId: "spot_a_p02", buildingId: "building_atlas_a", plateNumber: "55544-A-1", reportedById: "user_member_1",    reportedByName: "Mohammed Alaoui", notes: "Véhicule non identifié garé sur place réservée Lot A102.", status: "resolved", resolvedById: "user_admin_atlas", resolvedAt: daysAgo(10), reportedAt: daysAgo(12), createdAt: daysAgo(12) },
  ]).onConflictDoNothing();

  await db.insert(visitorParkingReservationsTable).values([
    { id: "reservation_1", spotId: "spot_a_v02", requestedById: "user_member_1", visitorName: "Ahmed Alaoui (frère)",     visitorPlate: "33211-A-5", startTime: daysAgo(-1), endTime: new Date(daysAgo(-1).getTime() + 4 * 3600000), status: "confirmed", notes: "Visite familiale", createdAt: daysAgo(1) },
    { id: "reservation_2", spotId: "spot_ag_v1", requestedById: "user_member_3", visitorName: "Maître Filali (collègue)", visitorPlate: "77890-R-4", startTime: daysAgo(-2), endTime: new Date(daysAgo(-2).getTime() + 2 * 3600000), status: "expired",   notes: "Réunion professionnelle", createdAt: daysAgo(3) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 30. TRAVAUX PRIVATIFS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(travauxPrivatifsTable).values([
    {
      id: "tp_1",
      buildingId: "building_atlas_a", lotId: "lot_a101", syndicateId: "syn_residence_atlas",
      requestedById: "user_member_1", requestedByName: "Mohammed Alaoui",
      title: "Installation climatiseur unité extérieure façade",
      description: "Demande d'autorisation pour installer une unité extérieure de climatiseur sur la façade côté Bd Anfa, lot A101.",
      workType: "ac_unit",
      status: "approved",
      requiresCommitteeReview: false, requiresGAVote: false,
      bylawReference: "Article 18 — Modifications façade",
      syndicReviewNote: "Modèle compact autorisé, couleur blanc uniquement, fixation antivibration obligatoire.",
      syndicReviewedById: "user_admin_atlas", syndicReviewedByName: "Nadia Ouahbi", syndicReviewedAt: daysAgo(20),
      finalDecision: "approved", finalDecisionNote: "Approuvé sous conditions de l'article 18.",
      finalDecisionById: "user_admin_atlas", finalDecisionByName: "Nadia Ouahbi", finalDecisionAt: daysAgo(20),
      createdAt: daysAgo(30),
    },
    {
      id: "tp_2",
      buildingId: "building_atlas_a", lotId: "lot_a205", syndicateId: "syn_residence_atlas",
      requestedById: "user_tenant_1", requestedByName: "Sara Bouzid",
      title: "Remplacement fenêtres par double vitrage",
      description: "Souhait de remplacer les 3 fenêtres du salon par du double vitrage pour isolation phonique.",
      workType: "windows",
      status: "under_review",
      requiresCommitteeReview: true, requiresGAVote: false,
      bylawReference: "Article 22 — Façades et menuiseries extérieures",
      syndicReviewNote: "Dossier transmis au comité technique pour avis conformité façade.",
      syndicReviewedById: "user_admin_atlas", syndicReviewedByName: "Nadia Ouahbi", syndicReviewedAt: daysAgo(5),
      createdAt: daysAgo(12),
    },
    {
      id: "tp_3",
      buildingId: "building_agdal_1", lotId: "lot_ag12", syndicateId: "syn_jardins_agdal",
      requestedById: "user_member_3", requestedByName: "Rachid El Amrani",
      title: "Extension balcon — fermeture avec verrière",
      description: "Projet de fermeture du balcon duplex Ag-12 avec structure métallique et verrière, 12 m².",
      workType: "balcony",
      status: "vote_required",
      requiresCommitteeReview: true, requiresGAVote: true,
      bylawReference: "Article 15 — Modifications parties communes apparentes",
      syndicReviewNote: "Modification visible de la façade, vote AG requis selon règlement.",
      syndicReviewedById: "user_admin_agdal", syndicReviewedByName: "Youssef Idrissi", syndicReviewedAt: daysAgo(10),
      committeeNote: "Impact esthétique significatif. Recommande soumission au vote AG.",
      committeeRecommendation: "escalate_vote",
      committeeReviewedById: "user_admin_agdal", committeeReviewedByName: "Youssef Idrissi", committeeReviewedAt: daysAgo(7),
      createdAt: daysAgo(25),
    },
    {
      id: "tp_4",
      buildingId: "building_atlas_a", lotId: "lot_a301", syndicateId: "syn_residence_atlas",
      requestedById: "user_member_1", requestedByName: "Mohammed Alaoui",
      title: "Création d'une cloison intérieure",
      description: "Séparation de la chambre principale en deux espaces distincts, cloison Placostil.",
      workType: "structural",
      status: "submitted",
      requiresCommitteeReview: null, requiresGAVote: null,
      createdAt: daysAgo(2),
    },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 31. AUTH: Tokens refresh & réinitialisation mot de passe
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(refreshTokensTable).values([
    { id: "refresh_1", userId: "user_admin_atlas",  token: "seed-refresh-token-admin-atlas",  expiresAt: daysAgo(-30) },
    { id: "refresh_2", userId: "user_member_1",     token: "seed-refresh-token-member-1",     expiresAt: daysAgo(-30) },
    { id: "refresh_3", userId: "user_admin_agdal",  token: "seed-refresh-token-admin-agdal",  expiresAt: daysAgo(-30) },
    { id: "refresh_4", userId: "user_tenant_1",     token: "seed-refresh-token-tenant-1",     expiresAt: daysAgo(-30) },
    { id: "refresh_5", userId: "user_super_admin",  token: "seed-refresh-token-super-admin",  expiresAt: daysAgo(-30) },
  ]).onConflictDoNothing();
  await db.insert(passwordResetTokensTable).values([
    { id: "reset_1", userId: "user_tenant_1", token: "seed-reset-token-tenant-1",   expiresAt: daysAgo(-1),  usedAt: null },
    { id: "reset_2", userId: "user_member_3", token: "seed-reset-token-member-3",   expiresAt: daysAgo(3),   usedAt: daysAgo(3) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 32. RÉCLAMATIONS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(reclamationsTable).values([
    {
      id: "rec_1", reference: "REC-2026-048", type: "salaire", statut: "en_instruction", priorite: "haute",
      titre: "Non-versement de la prime d'ancienneté", description: "Prime d'ancienneté due depuis janvier 2026 non versée malgré 12 ans de service.",
      memberId: "user_member_1", memberName: "Mohammed Alaoui", service: "Maintenance",
      dateDepot: "2026-06-01", dateEcheance: "2026-06-30", traitePar: "Fatima Zahra El Alami",
      commentaireAdmin: "Dossier transmis à la RH pour vérification des bulletins de paie.",
      documentsJoints: JSON.stringify(["Bulletins de paie 2025.pdf", "Attestation ancienneté.pdf"]),
      etapes: JSON.stringify([
        { date: "2026-06-01", action: "Réclamation déposée", auteur: "Mohammed Alaoui" },
        { date: "2026-06-05", action: "Dossier transmis à la RH pour instruction", auteur: "Fatima Zahra El Alami" },
        { date: "2026-06-15", action: "Courrier de mise en demeure transmis à la RH", auteur: "Fatima Zahra El Alami" },
      ]),
      anonymous: false, createdAt: daysAgo(43),
    },
    {
      id: "rec_2", reference: "REC-2026-046", type: "condition_travail", statut: "transmise_direction", priorite: "normale",
      titre: "Locaux de travail insalubres — Bâtiment C", description: "Problèmes d'humidité et de ventilation depuis octobre 2025, pathologies respiratoires signalées.",
      memberId: "user_member_2", memberName: "Khadija Tahiri", service: "Administration",
      dateDepot: "2026-06-05", dateEcheance: "2026-06-30", traitePar: "Rachid Bennis",
      commentaireAdmin: "Courrier adressé à la direction le 8 juin. Réunion CHSCT prévue le 25 juin.",
      documentsJoints: JSON.stringify(["Rapport médecin travail.pdf", "Photos locaux.pdf"]),
      etapes: JSON.stringify([
        { date: "2026-06-05", action: "Réclamation déposée", auteur: "Khadija Tahiri" },
        { date: "2026-06-08", action: "Dossier transmis à la direction", auteur: "Rachid Bennis" },
        { date: "2026-06-10", action: "Accusé de réception direction reçu", auteur: "Système" },
      ]),
      anonymous: false, createdAt: daysAgo(39),
    },
    {
      id: "rec_3", reference: "REC-2026-045", type: "harcelement", statut: "en_mediation", priorite: "urgente",
      titre: "Harcèlement moral — Comportement du chef de service", description: "Comportement harcelant d'un responsable hiérarchique direct : pressions, humiliations, surcharge délibérée.",
      memberId: null, memberName: "Anonyme", service: "Non communiqué",
      dateDepot: "2026-06-08", dateEcheance: "2026-06-22", traitePar: "Amina Tazi",
      documentsJoints: JSON.stringify(["Témoignage écrit.pdf"]),
      etapes: JSON.stringify([
        { date: "2026-06-08", action: "Réclamation anonyme reçue", auteur: "Système" },
        { date: "2026-06-09", action: "Médiation interne engagée — Désignation médiateur", auteur: "Amina Tazi" },
        { date: "2026-06-12", action: "Première séance de médiation tenue", auteur: "Amina Tazi" },
      ]),
      anonymous: true, createdAt: daysAgo(36),
    },
    {
      id: "rec_4", reference: "REC-2026-041", type: "avancement", statut: "resolue", priorite: "normale",
      titre: "Blocage injustifié d'avancement — Grade A1", description: "Bloqué au même échelon depuis 4 ans malgré évaluations positives et ancienneté.",
      memberId: "user_member_3", memberName: "Rachid El Amrani", service: "Production",
      dateDepot: "2026-05-15", dateCloture: "2026-06-03", traitePar: "Fatima Zahra El Alami",
      commentaireAdmin: "Résolu favorablement, avancement régularisé avec effet rétroactif au 01/01/2026.",
      documentsJoints: JSON.stringify(["Fiche d'avancement.pdf"]),
      etapes: JSON.stringify([
        { date: "2026-05-15", action: "Réclamation déposée", auteur: "Rachid El Amrani" },
        { date: "2026-05-20", action: "Courrier adressé au DRH", auteur: "Fatima Zahra El Alami" },
        { date: "2026-05-28", action: "Réunion bilatérale avec le DRH", auteur: "Fatima Zahra El Alami" },
        { date: "2026-06-03", action: "Avancement accordé — Réclamation résolue", auteur: "Fatima Zahra El Alami" },
      ]),
      anonymous: false, createdAt: daysAgo(60),
    },
    {
      id: "rec_5", reference: "REC-2026-039", type: "licenciement", statut: "contentieux", priorite: "urgente",
      titre: "Licenciement abusif sans cause réelle", description: "Licenciement prononcé sans motif réel ni sérieux, sans respect de la procédure légale.",
      memberId: "user_member_4", memberName: "Amina Rachidi", service: "Commercial",
      dateDepot: "2026-05-14", dateEcheance: "2026-07-14", traitePar: "Amina Tazi",
      commentaireAdmin: "Dossier transmis au cabinet d'avocats partenaire. Saisine du Tribunal du Travail de Casablanca prévue.",
      documentsJoints: JSON.stringify(["Lettre de licenciement.pdf", "Contrat de travail.pdf", "Bulletins de paie.pdf"]),
      etapes: JSON.stringify([
        { date: "2026-05-14", action: "Réclamation urgente déposée", auteur: "Amina Rachidi" },
        { date: "2026-05-15", action: "Consultation juridique d'urgence organisée", auteur: "Amina Tazi" },
        { date: "2026-05-20", action: "Mise en demeure transmise à l'employeur", auteur: "Amina Tazi" },
        { date: "2026-06-01", action: "Échec de la conciliation — Passage en contentieux", auteur: "Amina Tazi" },
      ]),
      anonymous: false, createdAt: daysAgo(61),
    },
    {
      id: "rec_6", reference: "REC-2026-038", type: "conge", statut: "resolue", priorite: "basse",
      titre: "Refus de congé de formation syndicale", description: "Demande de congé de 5 jours pour formation syndicale refusée sans motif valable.",
      memberId: "user_member_1", memberName: "Mohammed Alaoui", service: "Logistique",
      dateDepot: "2026-05-10", dateCloture: "2026-05-22", traitePar: "Rachid Bennis",
      commentaireAdmin: "Congé accordé après intervention syndicale. Formation effectuée les 26-30 mai.",
      documentsJoints: JSON.stringify(["Programme formation.pdf"]),
      etapes: JSON.stringify([
        { date: "2026-05-10", action: "Réclamation déposée", auteur: "Mohammed Alaoui" },
        { date: "2026-05-14", action: "Intervention auprès du DRH", auteur: "Rachid Bennis" },
        { date: "2026-05-22", action: "Congé accordé — Réclamation close", auteur: "Rachid Bennis" },
      ]),
      anonymous: false, createdAt: daysAgo(65),
    },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 33. WORKFLOWS & ÉTAPES
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(workflowsTable).values([
    { id: "wf_1", title: "Modification des statuts du syndicat", category: "statuts", description: "Mise à jour des statuts pour intégrer les nouvelles dispositions légales sur la copropriété.", status: "in_progress", priority: "high", initiatorId: "user_admin_atlas", initiatorName: "Nadia Ouahbi", startDate: "2026-06-10", deadline: "2026-07-20", currentStep: 1, createdAt: daysAgo(34) },
    { id: "wf_2", title: "Validation budget prévisionnel 2027", category: "finance", description: "Approbation du budget prévisionnel de l'exercice 2027 par le conseil syndical.", status: "in_progress", priority: "urgent", initiatorId: "user_admin_atlas", initiatorName: "Nadia Ouahbi", startDate: "2026-06-25", deadline: "2026-07-25", currentStep: 0, createdAt: daysAgo(19) },
    { id: "wf_3", title: "Organisation élection conseil syndical", category: "election", description: "Processus d'organisation de l'élection des membres du conseil syndical pour le mandat 2026-2028.", status: "approved", priority: "medium", initiatorId: "user_admin_agdal", initiatorName: "Youssef Idrissi", startDate: "2026-04-01", deadline: "2026-05-15", currentStep: 2, createdAt: daysAgo(104) },
    { id: "wf_4", title: "Mise en demeure contentieux impayés", category: "juridique", description: "Procédure de mise en demeure pour recouvrement des charges impayées de longue date.", status: "rejected", priority: "high", initiatorId: "user_admin_agdal", initiatorName: "Youssef Idrissi", startDate: "2026-05-05", deadline: "2026-06-05", currentStep: 1, createdAt: daysAgo(70), },
    { id: "wf_5", title: "Renouvellement contrat gardiennage", category: "finance", description: "Renouvellement du contrat de gardiennage annuel avec le prestataire actuel.", status: "pending", priority: "low", initiatorId: "user_admin_atlas", initiatorName: "Nadia Ouahbi", startDate: "2026-07-08", deadline: "2026-08-01", currentStep: 0, createdAt: daysAgo(6) },
  ]).onConflictDoNothing();
  await db.insert(workflowStepsTable).values([
    { id: "wfstep_1_1", workflowId: "wf_1", stepOrder: 0, title: "Rédaction du projet de modification", assignee: "Nadia Ouahbi", role: "syndicate_admin", status: "done", comment: "Projet rédigé conformément à la nouvelle réglementation.", date: "2026-06-15" },
    { id: "wfstep_1_2", workflowId: "wf_1", stepOrder: 1, title: "Validation par le conseil syndical", assignee: "Conseil syndical", role: "syndicate_admin", status: "current", date: null },
    { id: "wfstep_1_3", workflowId: "wf_1", stepOrder: 2, title: "Approbation en assemblée générale", assignee: "Assemblée Générale", role: "syndicate_admin", status: "waiting", date: null },

    { id: "wfstep_2_1", workflowId: "wf_2", stepOrder: 0, title: "Examen du conseil syndical", assignee: "Conseil syndical", role: "syndicate_admin", status: "current", date: null },
    { id: "wfstep_2_2", workflowId: "wf_2", stepOrder: 1, title: "Vote en assemblée générale", assignee: "Assemblée Générale", role: "syndicate_admin", status: "waiting", date: null },
    { id: "wfstep_2_3", workflowId: "wf_2", stepOrder: 2, title: "Publication du budget validé", assignee: "Nadia Ouahbi", role: "syndicate_admin", status: "waiting", date: null },

    { id: "wfstep_3_1", workflowId: "wf_3", stepOrder: 0, title: "Appel à candidatures", assignee: "Youssef Idrissi", role: "syndicate_admin", status: "done", date: "2026-04-10" },
    { id: "wfstep_3_2", workflowId: "wf_3", stepOrder: 1, title: "Tenue du scrutin", assignee: "Youssef Idrissi", role: "syndicate_admin", status: "done", date: "2026-05-10" },
    { id: "wfstep_3_3", workflowId: "wf_3", stepOrder: 2, title: "Proclamation des résultats", assignee: "Youssef Idrissi", role: "syndicate_admin", status: "done", comment: "Résultats validés et publiés.", date: "2026-05-15" },

    { id: "wfstep_4_1", workflowId: "wf_4", stepOrder: 0, title: "Envoi de la mise en demeure", assignee: "Youssef Idrissi", role: "syndicate_admin", status: "done", date: "2026-05-10" },
    { id: "wfstep_4_2", workflowId: "wf_4", stepOrder: 1, title: "Validation juridique de la procédure", assignee: "Cabinet juridique", role: "syndicate_admin", status: "rejected", comment: "Procédure suspendue : accord amiable trouvé avec le débiteur.", date: "2026-06-01" },
    { id: "wfstep_4_3", workflowId: "wf_4", stepOrder: 2, title: "Saisine du tribunal", assignee: "Cabinet juridique", role: "syndicate_admin", status: "waiting", date: null },

    { id: "wfstep_5_1", workflowId: "wf_5", stepOrder: 0, title: "Négociation des conditions", assignee: "Nadia Ouahbi", role: "syndicate_admin", status: "current", date: null },
    { id: "wfstep_5_2", workflowId: "wf_5", stepOrder: 1, title: "Validation du conseil syndical", assignee: "Conseil syndical", role: "syndicate_admin", status: "waiting", date: null },
    { id: "wfstep_5_3", workflowId: "wf_5", stepOrder: 2, title: "Signature du contrat", assignee: "Nadia Ouahbi", role: "syndicate_admin", status: "waiting", date: null },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 34. RÉPERTOIRE JURIDIQUE
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(fichesJuridiquesTable).values([
    {
      id: "fiche_1", theme: "licenciement", titre: "Licenciement pour faute grave : procédure et droits",
      resume: "Conditions de validité d'un licenciement pour faute grave et recours possibles du salarié.",
      contenu: "Le licenciement pour faute grave prive le salarié de préavis et d'indemnité de licenciement, mais la procédure légale (entretien préalable, notification motivée) doit être scrupuleusement respectée sous peine de requalification en licenciement abusif.",
      articles: JSON.stringify(["Article 39 — Code du Travail", "Article 62 — Code du Travail", "Article 63 — Code du Travail"]),
      jurisprudence: JSON.stringify(["Cass. Soc. 12/03/2019 — Absence d'entretien préalable = licenciement abusif"]),
      conseils: JSON.stringify(["Exiger la notification écrite et motivée", "Contester dans les 90 jours devant le tribunal du travail"]),
      important: true, updated: "2026-05-01", createdAt: daysAgo(200),
    },
    {
      id: "fiche_2", theme: "syndicale", titre: "Protection des représentants syndicaux",
      resume: "Le représentant syndical bénéficie d'une protection renforcée contre le licenciement et les sanctions disciplinaires.",
      contenu: "Toute sanction ou licenciement visant un délégué syndical doit être motivé et ne peut être lié à l'exercice de son mandat, sous peine de nullité et de réintégration.",
      articles: JSON.stringify(["Article 470 — Code du Travail", "Article 457 — Code du Travail"]),
      jurisprudence: JSON.stringify(["Cass. Soc. 22/09/2020 — Nullité du licenciement d'un délégué syndical sans autorisation"]),
      conseils: JSON.stringify(["Signaler immédiatement toute pression à l'inspection du travail", "Conserver toute correspondance liée au mandat syndical"]),
      important: true, updated: "2026-04-18", createdAt: daysAgo(220),
    },
    {
      id: "fiche_3", theme: "conges", titre: "Congé de formation syndicale : conditions et durée",
      resume: "Droit du salarié à un congé de formation syndicale rémunéré, dans la limite légale annuelle.",
      contenu: "Le salarié adhérent à une organisation syndicale a droit à un congé de formation syndicale, sur simple demande écrite à l'employeur, sans que ce dernier puisse le refuser sauf nécessité de service dûment justifiée.",
      articles: JSON.stringify(["Article 457 — Code du Travail"]),
      jurisprudence: JSON.stringify([]),
      conseils: JSON.stringify(["Adresser la demande au moins 15 jours à l'avance", "Conserver une copie de la demande et de l'accusé de réception"]),
      important: false, updated: "2026-03-22", createdAt: daysAgo(240),
    },
    {
      id: "fiche_4", theme: "salaire", titre: "Retard et non-paiement du salaire : recours du salarié",
      resume: "Sanctions applicables à l'employeur en cas de retard répété ou de non-paiement du salaire.",
      contenu: "Le non-paiement du salaire à échéance constitue une infraction pénale et peut justifier la prise d'acte de rupture du contrat de travail aux torts de l'employeur, ouvrant droit à indemnités.",
      articles: JSON.stringify(["Article 371 — Code du Travail", "Article 78 — Code du Travail"]),
      jurisprudence: JSON.stringify(["Cass. Soc. 05/11/2018 — Prise d'acte justifiée après 3 mois de retard de salaire"]),
      conseils: JSON.stringify(["Mettre l'employeur en demeure par lettre recommandée", "Saisir l'inspection du travail en cas de récidive"]),
      important: true, updated: "2026-06-02", createdAt: daysAgo(180),
    },
    {
      id: "fiche_5", theme: "discrimination", titre: "Discrimination au travail : reconnaissance et preuve",
      resume: "Cadre légal de la discrimination professionnelle et modalités de preuve devant les tribunaux.",
      contenu: "La charge de la preuve en matière de discrimination est allégée : le salarié doit présenter des éléments de fait laissant supposer une discrimination, à charge pour l'employeur de démontrer que sa décision repose sur des éléments objectifs.",
      articles: JSON.stringify(["Article 9 — Code du Travail", "Article 346 — Code du Travail"]),
      jurisprudence: JSON.stringify(["Cass. Soc. 14/02/2021 — Aménagement de la charge de la preuve en matière de discrimination"]),
      conseils: JSON.stringify(["Rassembler tout document comparatif (évaluations, grilles salariales)", "Solliciter un témoignage de collègues si possible"]),
      important: false, updated: "2026-02-10", createdAt: daysAgo(260),
    },
    {
      id: "fiche_6", theme: "contrat", titre: "CDD abusif : requalification en CDI",
      resume: "Conditions dans lesquelles un contrat à durée déterminée peut être requalifié en contrat à durée indéterminée.",
      contenu: "Le recours répété à des CDD pour pourvoir un poste permanent lié à l'activité normale de l'entreprise expose l'employeur à une requalification judiciaire en CDI, avec effet rétroactif à la date du premier contrat.",
      articles: JSON.stringify(["Article 16 — Code du Travail", "Article 17 — Code du Travail"]),
      jurisprudence: JSON.stringify(["Cass. Soc. 30/06/2017 — Requalification après 3 renouvellements successifs de CDD"]),
      conseils: JSON.stringify(["Conserver tous les contrats et avenants signés", "Saisir le tribunal du travail dans le délai de prescription applicable"]),
      important: false, updated: "2026-01-15", createdAt: daysAgo(280),
    },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 35. CONSEIL SYNDICAL (elected oversight body members)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(conseilSyndicalTable).values([
    { id: "cs_1", syndicateId: "syn_residence_atlas", userId: "user_president_atlas",  memberId: "member_1", role: "president",        name: "Abdelhak Essaidi",    email: "president@andalous.ma",  phone: "+212600000012", mandateStart: "2025-01-01", mandateEnd: "2027-01-01", status: "active",  electionId: "election_1", createdAt: daysAgo(550) },
    { id: "cs_2", syndicateId: "syn_residence_atlas", userId: "user_treasurer_atlas",  memberId: "member_2", role: "treasurer",        name: "Fatima Zahra Amghar", email: "tresorier@andalous.ma",  phone: "+212600000013", mandateStart: "2025-01-01", mandateEnd: "2027-01-01", status: "active",  electionId: "election_1", createdAt: daysAgo(550) },
    { id: "cs_3", syndicateId: "syn_residence_atlas", userId: "user_secretary_atlas",  memberId: "member_3", role: "secretary",        name: "Samir Hamdouch",      email: "secretaire@andalous.ma", phone: "+212600000014", mandateStart: "2025-01-01", mandateEnd: "2027-01-01", status: "active",  electionId: "election_1", createdAt: daysAgo(550) },
    { id: "cs_4", syndicateId: "syn_residence_atlas", userId: "user_committee_atlas",  memberId: "member_1", role: "committee_member", name: "Naima Beldjoudi",     email: "conseil@andalous.ma",    phone: "+212600000015", mandateStart: "2025-01-01", mandateEnd: "2027-01-01", status: "active",  createdAt: daysAgo(550) },
    { id: "cs_5", syndicateId: "syn_jardins_agdal",   userId: "user_member_3",         memberId: "member_4", role: "president",        name: "Rachid El Amrani",    email: "rachid.elamrani@jardins-agdal.ma", mandateStart: "2024-06-01", mandateEnd: "2026-06-01", status: "expired", createdAt: daysAgo(800) },
    { id: "cs_6", syndicateId: "syn_jardins_agdal",   userId: "user_member_4",         memberId: "member_5", role: "treasurer",        name: "Amina Rachidi",       email: "amina.rachidi@jardins-agdal.ma",  mandateStart: "2024-06-01", mandateEnd: "2026-06-01", status: "expired", createdAt: daysAgo(700) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 36. FONDS DE TRAVAUX (mandatory 5% reserve fund — Law 18-00 Art. 18)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(fondsTravauxTable).values([
    { id: "ft_1", syndicateId: "syn_residence_atlas", buildingId: "building_atlas_a", year: 2025, budgetBase: "99000.00",  ratePercent: "5", targetAmount: "4950.00",  currentBalance: "4950.00",  status: "funded", notes: "Fonds de réserve 2025 intégralement constitué.", createdAt: daysAgo(560) },
    { id: "ft_2", syndicateId: "syn_residence_atlas", buildingId: "building_atlas_a", year: 2026, budgetBase: "108000.00", ratePercent: "5", targetAmount: "5400.00",  currentBalance: "3150.00",  status: "active", notes: "En cours de constitution — 3 trimestres cotisés.", createdAt: daysAgo(200) },
    { id: "ft_3", syndicateId: "syn_residence_atlas", buildingId: "building_atlas_b", year: 2026, budgetBase: "72000.00",  ratePercent: "5", targetAmount: "3600.00",  currentBalance: "1800.00",  status: "active", createdAt: daysAgo(190) },
    { id: "ft_4", syndicateId: "syn_jardins_agdal",   buildingId: "building_agdal_1", year: 2026, budgetBase: "72000.00",  ratePercent: "7", targetAmount: "5040.00",  currentBalance: "5040.00",  status: "funded", notes: "Taux de 7% voté en AG 2025 — excède le minimum légal.", createdAt: daysAgo(180) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 37. PIÈCES JOINTES — Appels de fonds & Factures
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(chargeAttachmentsTable).values([
    { id: "chatt_1", appelDeFondsId: "adf_2", url: "/uploads/charge_attachments/adf_2_cheque.jpg",        filename: "cheque_khadija_juillet.jpg",       mimeType: "image/jpeg",         uploadedBy: "user_member_2", createdAt: daysAgo(10) },
    { id: "chatt_2", appelDeFondsId: "adf_1", url: "/uploads/charge_attachments/adf_1_virement.pdf",     filename: "virement_mohammed_juillet.pdf",    mimeType: "application/pdf",    uploadedBy: "user_member_1", createdAt: daysAgo(30) },
    { id: "chatt_3", appelDeFondsId: "adf_7", url: "/uploads/charge_attachments/adf_7_virement.pdf",     filename: "virement_rachid_juillet_agdal.pdf", mimeType: "application/pdf",   uploadedBy: "user_member_3", createdAt: daysAgo(28) },
  ]).onConflictDoNothing();

  await db.insert(invoiceAttachmentsTable).values([
    { id: "invatt_1", invoiceId: "inv_1", url: "/uploads/invoice_attachments/inv_1_devis.pdf",   filename: "devis_ascenseur_juillet.pdf",    mimeType: "application/pdf", uploadedBy: "user_admin_atlas", createdAt: daysAgo(35) },
    { id: "invatt_2", invoiceId: "inv_3", url: "/uploads/invoice_attachments/inv_3_facture.pdf", filename: "facture_peinture_juin.pdf",       mimeType: "application/pdf", uploadedBy: "user_admin_atlas", createdAt: daysAgo(52) },
    { id: "invatt_3", invoiceId: "inv_3", url: "/uploads/invoice_attachments/inv_3_photos.zip",  filename: "photos_travaux_cage_escalier.zip", mimeType: "application/zip",  uploadedBy: "user_admin_atlas", createdAt: daysAgo(50) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 38. ACTES ADMINISTRATIFS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(actesAdministratifsTable).values([
    {
      id: "acte_1", syndicateId: "syn_residence_atlas", createdById: "user_admin_atlas",
      type: "decision", statut: "publie", numero: "DEC-2026-001",
      titre: "Décision d'approbation du budget prévisionnel 2026",
      objet: "Approbation du budget prévisionnel de la Résidence Atlas pour l'exercice 2026 à hauteur de 129 600 MAD.",
      date: "2026-01-20", auteur: "Conseil Syndical Résidence Atlas",
      signataires: ["Abdelhak Essaidi — Président", "Fatima Zahra Amghar — Trésorière", "Samir Hamdouch — Secrétaire"],
      destinataires: ["Tous les copropriétaires"], important: true, createdAt: daysAgo(180),
    },
    {
      id: "acte_2", syndicateId: "syn_residence_atlas", createdById: "user_admin_atlas",
      type: "convocation", statut: "publie", numero: "CONV-2026-001",
      titre: "Convocation Assemblée Générale Ordinaire 2026",
      objet: "Convocation de l'Assemblée Générale Ordinaire de la Résidence Atlas, conformément à l'article 25 de la Loi 18-00.",
      date: "2026-06-30", dateEcheance: "2026-07-20", auteur: "Nadia Ouahbi — Syndic",
      signataires: ["Nadia Ouahbi — Syndic bénévole"],
      destinataires: ["Tous les copropriétaires", "Locataires concernés"], important: true, createdAt: daysAgo(22),
    },
    {
      id: "acte_3", syndicateId: "syn_residence_atlas", createdById: "user_admin_atlas",
      type: "mise_en_demeure", statut: "envoye", numero: "MED-2026-003",
      titre: "Mise en demeure — Charges impayées Lot A205",
      objet: "Mise en demeure formelle pour le recouvrement de 2 700 MAD de charges impayées (mai–juin 2026), lot A205.",
      date: "2026-07-08", dateEcheance: "2026-07-22", auteur: "Conseil Syndical Résidence Atlas",
      signataires: ["Abdelhak Essaidi — Président", "Nadia Ouahbi — Syndic"],
      destinataires: ["Hassan Cherkaoui — Copropriétaire Lot A205"], important: true, createdAt: daysAgo(14),
    },
    {
      id: "acte_4", syndicateId: "syn_jardins_agdal", createdById: "user_admin_agdal",
      type: "pv", statut: "signe", numero: "PV-2025-001",
      titre: "Procès-verbal AG Ordinaire Les Jardins d'Agdal 2025",
      objet: "PV de l'Assemblée Générale Ordinaire tenue le 20 septembre 2025 — approbation des comptes et budget 2026.",
      date: "2025-09-20", auteur: "Youssef Idrissi — Syndic professionnel",
      signataires: ["Rachid El Amrani — Président", "Amina Rachidi — Secrétaire", "Youssef Idrissi — Syndic"],
      destinataires: ["Tous les copropriétaires Les Jardins d'Agdal"], important: false, createdAt: daysAgo(300),
    },
    {
      id: "acte_5", syndicateId: "syn_residence_atlas", createdById: "user_admin_atlas",
      type: "contrat", statut: "brouillon", numero: "CTR-2026-005",
      titre: "Renouvellement contrat gardiennage — Sécurité Atlas Protect",
      objet: "Projet de renouvellement du contrat de gardiennage pour l'exercice 2027, en cours de négociation.",
      date: "2026-07-10", dateEcheance: "2026-08-01", auteur: "Nadia Ouahbi — Syndic",
      signataires: [], destinataires: ["Sécurité Atlas Protect"], important: false, createdAt: daysAgo(6),
    },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 39. BILLING INVOICES (plateforme SaaS)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(billingInvoicesTable).values([
    { id: "binv_1", syndicateId: "syn_residence_atlas", subscriptionId: "sub_1", amount: "699.00",  status: "paid", dueDate: daysAgo(150), paidAt: daysAgo(145), description: "Abonnement Pro — mai 2026",    periodStart: daysAgo(180), periodEnd: daysAgo(150), createdAt: daysAgo(180) },
    { id: "binv_2", syndicateId: "syn_residence_atlas", subscriptionId: "sub_1", amount: "699.00",  status: "paid", dueDate: daysAgo(120), paidAt: daysAgo(118), description: "Abonnement Pro — juin 2026",   periodStart: daysAgo(150), periodEnd: daysAgo(120), createdAt: daysAgo(150) },
    { id: "binv_3", syndicateId: "syn_residence_atlas", subscriptionId: "sub_1", amount: "699.00",  status: "open", dueDate: daysAgo(-10),                       description: "Abonnement Pro — juillet 2026", periodStart: daysAgo(120), periodEnd: daysAgo(-10), createdAt: daysAgo(120) },
    { id: "binv_4", syndicateId: "syn_jardins_agdal",   subscriptionId: "sub_2", amount: "299.00",  status: "paid", dueDate: daysAgo(120), paidAt: daysAgo(119), description: "Abonnement Basique — juin 2026",  periodStart: daysAgo(150), periodEnd: daysAgo(120), createdAt: daysAgo(150) },
    { id: "binv_5", syndicateId: "syn_jardins_agdal",   subscriptionId: "sub_2", amount: "299.00",  status: "open", dueDate: daysAgo(-10),                       description: "Abonnement Basique — juillet 2026", periodStart: daysAgo(120), periodEnd: daysAgo(-10), createdAt: daysAgo(120) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 40. EMAIL LOGS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(emailLogsTable).values([
    { id: "email_1", recipient: "mohammed.alaoui@residence-atlas.ma", subject: "Votre reçu de paiement — juillet 2026",             template: "payment_receipt",  status: "sent",   syndicateId: "syn_residence_atlas", sentAt: daysAgo(30), createdAt: daysAgo(30) },
    { id: "email_2", recipient: "khadija.tahiri@residence-atlas.ma",  subject: "Rappel — Validation de votre paiement en attente", template: "payment_reminder", status: "sent",   syndicateId: "syn_residence_atlas", sentAt: daysAgo(9),  createdAt: daysAgo(9) },
    { id: "email_3", recipient: "hassan.cherkaoui@residence-atlas.ma",subject: "Mise en demeure — Charges impayées",                template: "debt_notice",      status: "sent",   syndicateId: "syn_residence_atlas", sentAt: daysAgo(14), createdAt: daysAgo(14) },
    { id: "email_4", recipient: "sara.bouzid@gmail.com",              subject: "Votre bail a été mis à jour",                      template: "document_updated", status: "sent",   syndicateId: "syn_residence_atlas", sentAt: daysAgo(5),  createdAt: daysAgo(5) },
    { id: "email_5", recipient: "syndic@andalous.ma",                 subject: "Nouveau ticket support — #ticket_1",               template: "ticket_created",   status: "sent",   syndicateId: "syn_residence_atlas", sentAt: daysAgo(1),  createdAt: daysAgo(1) },
    { id: "email_6", recipient: "omar.zaki@gmail.com",                subject: "Confirmation de votre réservation de parking",     template: "parking_confirm",  status: "failed", syndicateId: "syn_jardins_agdal",   errorMessage: "SMTP timeout", retryCount: 2, createdAt: daysAgo(3) },
    { id: "email_7", recipient: "superadmin@syndycat.ma",             subject: "Rapport mensuel — juillet 2026",                  template: "monthly_report",   status: "pending",                                  createdAt: daysAgo(0) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 41. AG PROXIES (pouvoir — Law 18-00 Art. 20)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(agProxiesTable).values([
    { id: "agproxy_1", meetingId: "meeting_1", syndicateId: "syn_residence_atlas", grantorId: "member_3", grantorName: "Hassan Cherkaoui", granteeId: "member_1", granteeName: "Mohammed Alaoui", status: "accepted", notes: "Pouvoir signé le 18 juillet 2026.", createdAt: daysAgo(2) },
    { id: "agproxy_2", meetingId: "meeting_3", syndicateId: "syn_jardins_agdal",   grantorId: "member_6", grantorName: "Kaouthar Bennis",  granteeId: "member_4", granteeName: "Rachid El Amrani", status: "pending",  notes: "Pouvoir transmis par email.",      createdAt: daysAgo(4) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 42. ELECTION PROXIES (pouvoir vote électronique — Loi 18-00)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(electionProxiesTable).values([
    { id: "eproxy_1", electionId: "election_1", syndicateId: "syn_residence_atlas", grantorId: "user_member_5", grantorName: "Hassan Cherkaoui", granteeId: "user_member_1", granteeName: "Mohammed Alaoui", status: "active",  createdAt: daysAgo(5) },
    { id: "eproxy_2", electionId: "election_2", syndicateId: "syn_jardins_agdal", grantorId: "user_member_4", grantorName: "Amina Rachidi", granteeId: "user_member_3", granteeName: "Rachid El Amrani", status: "used", documentUrl: "/objects/demo/eproxy_2.pdf", createdAt: daysAgo(34) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 43. ELECTION QUESTIONS (Q&A candidats)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(electionQuestionsTable).values([
    { id: "eq_1", electionId: "election_1", candidateId: "cand_1", askedBy: "user_member_2", askedByName: "Khadija Tahiri",  question: "Quelles sont vos priorités pour la rénovation du bâtiment A ?",                    answer: "Priorité à la toiture et à la modernisation de l'ascenseur.", answeredAt: daysAgo(4), createdAt: daysAgo(6) },
    { id: "eq_2", electionId: "election_1", candidateId: "cand_1", askedBy: "user_tenant_1", askedByName: "Sara Bouzid",     question: "Comment prévoyez-vous d'améliorer la communication avec les locataires ?",            answer: null, createdAt: daysAgo(2) },
    { id: "eq_3", electionId: "election_1", candidateId: "cand_2", askedBy: "user_member_1", askedByName: "Mohammed Alaoui", question: "Quelle stratégie proposez-vous pour réduire les impayés de charges ?",               answer: "Mise en place d'un système de relances automatiques et négociation d'échéanciers.", answeredAt: daysAgo(3), createdAt: daysAgo(5) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 44. VOTE RECEIPTS (participation ballots — anonymity split design)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(voteReceiptsTable).values([
    { id: "vr_1", electionId: "election_1", voterId: "user_member_1", createdAt: daysAgo(5) },
    { id: "vr_2", electionId: "election_1", voterId: "user_member_2", createdAt: daysAgo(4) },
    { id: "vr_3", electionId: "election_2", voterId: "user_member_1", createdAt: daysAgo(35) },
    { id: "vr_4", electionId: "election_2", voterId: "user_member_2", createdAt: daysAgo(35) },
    { id: "vr_5", electionId: "election_2", voterId: "user_member_5", createdAt: daysAgo(34) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 45. MESSAGE REACTIONS (emoji)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(messageReactionsTable).values([
    { id: "react_1", messageId: "msg_1",  userId: "user_member_1", emoji: "👍", createdAt: daysAgo(3) },
    { id: "react_2", messageId: "msg_1",  userId: "user_member_2", emoji: "👍", createdAt: daysAgo(3) },
    { id: "react_3", messageId: "msg_5",  userId: "user_tenant_1", emoji: "🙏", createdAt: daysAgo(2) },
    { id: "react_4", messageId: "msg_14", userId: "user_admin_atlas", emoji: "❤️", createdAt: daysAgo(14) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 46. BLOCKED USERS (one-directional block list)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(blockedUsersTable).values([
    { id: "block_1", blockerId: "user_member_1", blockedId: "user_member_5", createdAt: daysAgo(5) },
    { id: "block_2", blockerId: "user_member_2", blockedId: "user_tenant_2", createdAt: daysAgo(12) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 47. CONVERSATION ARCHIVES (per-user archiving)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(conversationArchivesTable).values([
    { id: "archive_1", conversationId: "conv_support_atlas", userId: "user_admin_atlas" },
    { id: "archive_2", conversationId: "conv_direct_2", userId: "user_tenant_1" },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 48. CHAT REPORTS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(chatReportsTable).values([
    { id: "chatreport_1", reporterId: "user_member_2", reportedUserId: "user_member_5", conversationId: "conv_general_atlas", reason: "spam", status: "pending", createdAt: daysAgo(4) },
    { id: "chatreport_2", reporterId: "user_admin_atlas", reportedUserId: "user_tenant_1", messageId: "msg_4", reason: "inapproprié", status: "dismissed", createdAt: daysAgo(2) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 49. DOCUMENT VERSIONS (historical snapshots)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(documentVersionsTable).values([
    { id: "dv_1", documentId: "doc_3", versionNumber: 1, title: "Budget prévisionnel 2026 — Draft initial",     content: "Version initiale avant vote AG.", status: "draft",     fileUrl: null, language: "fr", modifiedBy: "user_admin_atlas", modifiedAt: daysAgo(200), changeReason: "Création initiale", createdAt: daysAgo(200) },
    { id: "dv_2", documentId: "doc_3", versionNumber: 2, title: "Budget prévisionnel 2026 — Post-AG",           content: "Version approuvée en AG du 20 janvier.", status: "approved", fileUrl: null, language: "fr", modifiedBy: "user_admin_atlas", modifiedAt: daysAgo(180), changeReason: "Approbation AG — mise à jour statut", createdAt: daysAgo(180) },
    { id: "dv_3", documentId: "doc_7", versionNumber: 1, title: "Contrat bail Sara Bouzid — version originale", content: "Bail initial 2024.", status: "published", fileUrl: null, language: "fr", modifiedBy: "user_admin_atlas", modifiedAt: daysAgo(400), changeReason: "Création contrat initial", createdAt: daysAgo(400) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 50. DOCUMENT SEQUENCES (sequential reference counters)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(documentSequencesTable).values([
    { id: "ds_1", syndicateId: "syn_residence_atlas", prefix: "REG",  year: 2026, currentValue: 1 },
    { id: "ds_2", syndicateId: "syn_residence_atlas", prefix: "PV",   year: 2026, currentValue: 2 },
    { id: "ds_3", syndicateId: "syn_residence_atlas", prefix: "FIN",  year: 2026, currentValue: 3 },
    { id: "ds_4", syndicateId: "syn_residence_atlas", prefix: "BAIL", year: 2026, currentValue: 1 },
    { id: "ds_5", syndicateId: "syn_jardins_agdal",   prefix: "REG",  year: 2026, currentValue: 1 },
    { id: "ds_6", syndicateId: "syn_jardins_agdal",   prefix: "PV",   year: 2026, currentValue: 1 },
    { id: "ds_7", syndicateId: "syn_residence_atlas", prefix: "ATT",  year: 2026, currentValue: 4 },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 51. DOCUMENT SIGNATURES (multi-signature tracking)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(documentSignaturesTable).values([
    { id: "dsig_1", documentId: "doc_2", signedBy: "user_admin_atlas",    signedAt: daysAgo(300), signerRole: "syndicate_admin", syndicateId: "syn_residence_atlas", signatureOrder: 1, signerName: "Nadia Ouahbi",    isValid: true, createdAt: daysAgo(300) },
    { id: "dsig_2", documentId: "doc_2", signedBy: "user_president_atlas", signedAt: daysAgo(299), signerRole: "president",       syndicateId: "syn_residence_atlas", signatureOrder: 2, signerName: "Abdelhak Essaidi", isValid: true, createdAt: daysAgo(299) },
    { id: "dsig_3", documentId: "doc_7", signedBy: "user_admin_atlas",    signedAt: daysAgo(400), signerRole: "syndicate_admin", syndicateId: "syn_residence_atlas", signatureOrder: 1, signerName: "Nadia Ouahbi",    isValid: true, createdAt: daysAgo(400) },
    { id: "dsig_4", documentId: "doc_8", signedBy: "user_admin_agdal",    signedAt: daysAgo(200), signerRole: "syndicate_admin", syndicateId: "syn_jardins_agdal",   signatureOrder: 1, signerName: "Youssef Idrissi", isValid: true, createdAt: daysAgo(200) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 52. DOCUMENT COMMENTS (threaded review collaboration)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(documentCommentsTable).values([
    { id: "dc_1", documentId: "doc_3", authorId: "user_president_atlas", content: "Le poste maintenance ascenseurs semble sous-estimé par rapport au devis reçu.", isDeleted: false, createdAt: daysAgo(190) },
    { id: "dc_2", documentId: "doc_3", authorId: "user_admin_atlas",     content: "J'ai intégré un avenant de 15% de provision sur ce poste.", isDeleted: false, parentId: "dc_1", createdAt: daysAgo(189) },
    { id: "dc_3", documentId: "doc_2", authorId: "user_treasurer_atlas", content: "Le PV mentionne une résolution sur les travaux toiture mais le détail est incomplet.", isDeleted: false, createdAt: daysAgo(295) },
    { id: "dc_4", documentId: "doc_7", authorId: "user_tenant_1",        content: "Merci, le bail a bien été mis à jour avec la nouvelle adresse.", isDeleted: false, createdAt: daysAgo(3) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 53. TEMPLATE DEFINITIONS (document template system)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(templateDefinitionsTable).values([
    {
      id: "tpl_1", slug: "pv_ag", category: "meeting_minutes",
      name: JSON.stringify({ fr: "Procès-verbal d'Assemblée Générale", ar: "محضر الجمعية العامة" }),
      description: JSON.stringify({ fr: "PV complet de l'AG annuelle ou extraordinaire avec résolutions." }),
      variables: JSON.stringify([
        { name: "meetingDate", label: "Date de réunion", type: "date", required: true },
        { name: "location",    label: "Lieu",            type: "string", required: true },
        { name: "syndicName",  label: "Nom du syndicat", type: "string", required: true },
      ]),
      sections: JSON.stringify([
        { id: "header",      title: "En-tête",              order: 1 },
        { id: "attendees",   title: "Liste de présence",    order: 2 },
        { id: "resolutions", title: "Résolutions",          order: 3 },
        { id: "signatures",  title: "Signatures",           order: 4 },
      ]),
      status: "published", languages: JSON.stringify(["fr", "ar"]), currentVersion: 1, usageCount: 12,
      createdBy: "user_super_admin", publishedAt: daysAgo(300), createdAt: daysAgo(300),
    },
    {
      id: "tpl_2", slug: "attestation_adhesion", category: "certificates",
      name: JSON.stringify({ fr: "Attestation d'Adhésion", ar: "شهادة الانتساب" }),
      description: JSON.stringify({ fr: "Attestation officielle d'appartenance à un syndicat de copropriété." }),
      variables: JSON.stringify([
        { name: "memberName",    label: "Nom du membre",    type: "string", required: true },
        { name: "lotNumber",     label: "Numéro du lot",    type: "string", required: true },
        { name: "syndicateName", label: "Nom du syndicat",  type: "string", required: true },
      ]),
      sections: JSON.stringify([
        { id: "header",   title: "En-tête",      order: 1 },
        { id: "identity", title: "Identité",     order: 2 },
        { id: "cert",     title: "Attestation",  order: 3 },
        { id: "sig",      title: "Signature",    order: 4 },
      ]),
      status: "published", languages: JSON.stringify(["fr", "ar"]), currentVersion: 2, usageCount: 48,
      createdBy: "user_super_admin", publishedAt: daysAgo(400), createdAt: daysAgo(400),
    },
    {
      id: "tpl_3", slug: "appel_de_fonds", category: "financial",
      name: JSON.stringify({ fr: "Appel de Fonds" }),
      description: JSON.stringify({ fr: "Demande de paiement des charges de copropriété." }),
      variables: JSON.stringify([
        { name: "period",   label: "Période",  type: "string", required: true },
        { name: "amount",   label: "Montant",  type: "number", required: true },
        { name: "dueDate",  label: "Échéance", type: "date",   required: true },
      ]),
      sections: JSON.stringify([{ id: "content", title: "Corps", order: 1 }]),
      status: "published", languages: JSON.stringify(["fr"]), currentVersion: 1, usageCount: 120,
      createdBy: "user_super_admin", publishedAt: daysAgo(500), createdAt: daysAgo(500),
    },
    {
      id: "tpl_4", slug: "recu_paiement", category: "financial",
      name: JSON.stringify({ fr: "Reçu de Paiement" }),
      description: JSON.stringify({ fr: "Reçu officiel de paiement des charges de copropriété." }),
      variables: JSON.stringify([
        { name: "paidDate", label: "Date de paiement", type: "date",   required: true },
        { name: "amount",   label: "Montant",           type: "number", required: true },
      ]),
      sections: JSON.stringify([{ id: "content", title: "Corps", order: 1 }]),
      status: "published", languages: JSON.stringify(["fr", "ar"]), currentVersion: 1, usageCount: 85,
      createdBy: "user_super_admin", publishedAt: daysAgo(450), createdAt: daysAgo(450),
    },
    {
      id: "tpl_5", slug: "contrat_bail", category: "contracts",
      name: JSON.stringify({ fr: "Contrat de Bail" }),
      description: JSON.stringify({ fr: "Contrat de location standard conforme à la législation marocaine." }),
      variables: JSON.stringify([
        { name: "tenantName",    label: "Nom du locataire",  type: "string", required: true },
        { name: "monthlyRent",   label: "Loyer mensuel",     type: "number", required: true },
        { name: "leaseStart",    label: "Date de début",     type: "date",   required: true },
      ]),
      sections: JSON.stringify([{ id: "content", title: "Corps", order: 1 }]),
      status: "draft", languages: JSON.stringify(["fr"]), currentVersion: 1, usageCount: 2,
      createdBy: "user_super_admin", createdAt: daysAgo(50),
    },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 54. TEMPLATE DEFINITION VERSIONS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(templateDefinitionVersionsTable).values([
    { id: "tdv_1", templateId: "tpl_2", version: 1, snapshot: JSON.stringify({ slug: "attestation_adhesion", status: "published", version: 1 }), changeDescription: "Version initiale", createdBy: "user_super_admin", createdAt: daysAgo(400) },
    { id: "tdv_2", templateId: "tpl_2", version: 2, snapshot: JSON.stringify({ slug: "attestation_adhesion", status: "published", version: 2 }), changeDescription: "Ajout section CIN et photo identité", createdBy: "user_super_admin", createdAt: daysAgo(200) },
    { id: "tdv_3", templateId: "tpl_1", version: 1, snapshot: JSON.stringify({ slug: "pv_ag", status: "published", version: 1 }), changeDescription: "Version initiale PV AG", createdBy: "user_super_admin", createdAt: daysAgo(300) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 55. TEMPLATE DEFINITION PERMISSIONS
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(templateDefinitionPermissionsTable).values([
    { id: "tdp_1", templateId: "tpl_1", role: "syndicate_admin", canUse: true, canEdit: false, canPublish: false, createdAt: daysAgo(300) },
    { id: "tdp_2", templateId: "tpl_1", role: "super_admin",     canUse: true, canEdit: true,  canPublish: true,  createdAt: daysAgo(300) },
    { id: "tdp_3", templateId: "tpl_2", role: "syndicate_admin", canUse: true, canEdit: false, canPublish: false, createdAt: daysAgo(400) },
    { id: "tdp_4", templateId: "tpl_2", role: "super_admin",     canUse: true, canEdit: true,  canPublish: true,  createdAt: daysAgo(400) },
    { id: "tdp_5", templateId: "tpl_2", role: "member",          canUse: true, canEdit: false, canPublish: false, createdAt: daysAgo(400) },
    { id: "tdp_6", templateId: "tpl_3", role: "syndicate_admin", canUse: true, canEdit: false, canPublish: false, createdAt: daysAgo(500) },
    { id: "tdp_7", templateId: "tpl_4", role: "syndicate_admin", canUse: true, canEdit: false, canPublish: false, createdAt: daysAgo(450) },
    { id: "tdp_8", templateId: "tpl_5", role: "syndicate_admin", canUse: true, canEdit: false, canPublish: false, createdAt: daysAgo(50) },
    { id: "tdp_9", templateId: "tpl_5", role: "super_admin",     canUse: true, canEdit: true,  canPublish: true,  createdAt: daysAgo(50) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 56. TEMPLATE REQUESTS (syndicate admin → platform review pipeline)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(templateRequestsTable).values([
    {
      id: "treq_1", requestedBy: "user_admin_atlas", syndicateId: "syn_residence_atlas",
      title: "Lettre de mise en demeure copropriétaire débiteur",
      category: "legal",
      description: "Modèle de lettre de mise en demeure formelle pour le recouvrement des charges impayées, conforme à la Loi 18-00 et au Dahir 1-57-119.",
      businessPurpose: "Chaque syndicat a besoin d'une lettre type validée juridiquement pour les mises en demeure.",
      requiredFields: JSON.stringify([
        { name: "debtorName",    type: "string", required: true },
        { name: "totalAmount",   type: "number", required: true },
        { name: "dueDate",       type: "date",   required: true },
        { name: "referenceText", type: "string", required: false },
      ]),
      legalNotes: "Doit inclure référence à l'article 28 de la Loi 18-00 sur les charges impayées.",
      status: "in_review", reviewedBy: "user_super_admin", reviewedAt: daysAgo(3),
      reviewNotes: "Dossier solide. En attente de validation par le département juridique.",
      priority: "high", publishScope: "global", createdAt: daysAgo(10),
    },
    {
      id: "treq_2", requestedBy: "user_admin_agdal", syndicateId: "syn_jardins_agdal",
      title: "Formulaire d'état des lieux contradictoire",
      category: "contracts",
      description: "Document standardisé pour l'état des lieux d'entrée et de sortie des locataires.",
      businessPurpose: "Éviter les litiges entre propriétaires et locataires lors des changements de location.",
      requiredFields: JSON.stringify([
        { name: "tenantName",   type: "string", required: true },
        { name: "ownerName",    type: "string", required: true },
        { name: "lotNumber",    type: "string", required: true },
        { name: "date",         type: "date",   required: true },
      ]),
      status: "pending", priority: "normal", publishScope: "private", createdAt: daysAgo(4),
    },
    {
      id: "treq_3", requestedBy: "user_admin_atlas", syndicateId: "syn_residence_atlas",
      title: "Attestation de non-réclamation — Départ locataire",
      category: "certificates",
      description: "Attestation signée par le propriétaire confirmant qu'il n'a aucune réclamation au départ d'un locataire.",
      businessPurpose: "Exigé lors de la restitution de caution pour se prémunir de litiges ultérieurs.",
      requiredFields: JSON.stringify([
        { name: "tenantName",  type: "string", required: true },
        { name: "leaseEnd",    type: "date",   required: true },
        { name: "ownerName",   type: "string", required: true },
      ]),
      status: "approved", reviewedBy: "user_super_admin", reviewedAt: daysAgo(5),
      reviewNotes: "Modèle approuvé. Mise en production la semaine prochaine.",
      priority: "normal", publishScope: "global", createdAt: daysAgo(15),
    },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // 54. OTP TOKENS (email/phone verification test states)
  // ─────────────────────────────────────────────────────────────────────────
  await db.insert(otpTokensTable).values([
    { id: "otp_1", email: "mohammed.alaoui@residence-atlas.ma", codeHash: await bcrypt.hash("123456", 10), purpose: "email_verification", expiresAt: daysAgo(-2), attempts: 0, createdAt: daysAgo(1) },
    { id: "otp_2", email: "khadija.tahiri@residence-atlas.ma", codeHash: await bcrypt.hash("654321", 10), purpose: "email_verification", expiresAt: daysAgo(2), usedAt: daysAgo(1), attempts: 1, createdAt: daysAgo(5) },
    { id: "otp_3", email: "sara.bouzid@gmail.com", codeHash: await bcrypt.hash("246810", 10), purpose: "phone_verification", expiresAt: daysAgo(-1), attempts: 2, createdAt: daysAgo(0) },
  ]).onConflictDoNothing();

  // ─────────────────────────────────────────────────────────────────────────
  // DONE
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n✅  Seed terminé avec succès.\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Comptes de test  —  mot de passe : password123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Rôle              Email                                    Syndicat");
  console.log("  ─────────────     ─────────────────────────────────────    ─────────────────────────");
  console.log("  super_admin       superadmin@syndycat.ma                   (Plateforme)");
  console.log("  syndicate_admin   syndic@andalous.ma                       Résidence Atlas");
  console.log("  syndicate_admin   syndic@jardins-agdal.ma                  Les Jardins d'Agdal");
  console.log("  member            mohammed.alaoui@residence-atlas.ma       Résidence Atlas");
  console.log("  member            khadija.tahiri@residence-atlas.ma        Résidence Atlas");
  console.log("  member            hassan.cherkaoui@residence-atlas.ma      Résidence Atlas  ⚠ impayé ×6");
  console.log("  member            rachid.elamrani@jardins-agdal.ma         Les Jardins d'Agdal");
  console.log("  member            amina.rachidi@jardins-agdal.ma           Les Jardins d'Agdal");
  console.log("  tenant            sara.bouzid@gmail.com                    Résidence Atlas (Lot A205)");
  console.log("  tenant            omar.zaki@gmail.com                      Les Jardins d'Agdal (Lot Ag-01)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n  Tables renseignées:");
  const tables = [
    "syndicates (2)",            "users (14)",                "members (6)",
    "buildings (3)",             "lots (8)",                  "tenants (2)",
    "budgets (3)",               "budget_lines (10)",         "appels_de_fonds (10)",
    "transactions (9)",          "salary_records (5)",        "caisse_entries (8)",
    "invoices (3)",              "invoice_items (4)",         "bons_livraison (2)",
    "bon_items (2)",             "prestataires (5)",          "prestataire_evaluations (4)",
    "contrats_prestataires (4)", "travaux (5)",               "sinistres (4)",
    "elections (3)",             "candidates (6)",            "votes (5)",
    "vote_receipts (5)",         "election_proxies (1)",      "election_questions (3)",
    "meetings (4)",              "meeting_attendees (5)",     "ag_resolutions (3)",
    "ag_proxies (2)",
    "union_actions (3)",         "action_supports (3)",       "action_participants (3)",
    "publications (5)",          "publication_likes (5)",     "publication_comments (3)",
    "announcements (4)",         "documents (8)",
    "document_versions (3)",     "document_sequences (7)",    "document_signatures (4)",
    "document_comments (4)",
    "conversations (6)",         "messages (14)",             "message_reads (4)",
    "message_reactions (4)",     "blocked_users (1)",         "conversation_archives (1)",
    "chat_reports (2)",
    "products (6)",              "cart_items (2)",            "orders (2)",
    "reviews (1)",               "product_favorites (2)",     "product_reports (1)",
    "product_comments (3)",      "marketplace_promotions (1)",
    "legal_alerts (3)",          "support_tickets (4)",       "ticket_replies (4)",
    "cotisations (7)",           "payment_proofs (4)",
    "alerts (5)",                "alert_reads (3)",           "notification_preferences (6)",
    "partners (3)",              "payslips (3)",
    "subscription_plans (3)",    "syndicate_subscriptions (2)", "subscription_payments (3)",
    "billing_invoices (5)",
    "audit_logs (10)",           "email_logs (7)",
    "ideas (4)",                 "idea_votes (5)",
    "debt_escalations (2)",
    "expense_justifications (3)","expense_votes (5)",
    "national_rankings (4)",
    "parking_spots (9)",         "vehicles (6)",              "parking_violations (2)",
    "visitor_parking_reservations (2)",
    "travaux_privatifs (4)",
    "conseil_syndical (6)",      "fonds_travaux (4)",
    "charge_attachments (3)",    "invoice_attachments (3)",
    "actes_administratifs (5)",
    "refresh_tokens (5)",        "password_reset_tokens (2)",
    "reclamations (6)",          "workflows (5)",             "workflow_steps (15)",
    "fiches_juridiques (6)",
    "template_definitions (5)",  "template_def_versions (3)", "template_def_permissions (9)",
    "template_requests (3)",     "otp_tokens (3)",
  ];
  for (let i = 0; i < tables.length; i += 3) {
    const row = tables.slice(i, i + 3).map((t) => `  • ${t.padEnd(35)}`).join("");
    console.log(row);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("❌  Seed échoué :", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
