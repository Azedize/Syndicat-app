// Comprehensive test-data seed for SYNDYCAT GLOBAL CPS.
// Populates every table in lib/db/src/schema.ts with realistic Moroccan
// condominium-management data, covering all user roles:
//   super_admin | syndicate_admin | member | tenant  (+ employees via salary_records)
//
// Usage: pnpm --filter @workspace/scripts run seed
//
// IDEMPOTENT: every insert uses a fixed id and .onConflictDoNothing(), so this
// script can safely be run multiple times against the same database.

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
  auditLogsTable,
  ideasTable,
  ideaVotesTable,
  debtEscalationsTable,
  expenseJustificationsTable,
  expenseVotesTable,
  nationalRankingsTable,
} from "@workspace/db/schema";

const PASSWORD_HASH = await bcrypt.hash("password123", 10);

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
  console.log("Seeding SYNDYCAT GLOBAL CPS test data…");

  // ─── Syndicates ─────────────────────────────────────────────────────────
  await db
    .insert(syndicatesTable)
    .values([
      {
        id: "syn_residence_atlas",
        name: "Syndicat Résidence Atlas",
        abbreviation: "SRA",
        sector: "résidentiel",
        region: "Casablanca-Settat",
        status: "active",
        membersCount: 4,
        email: "contact@residence-atlas.ma",
        phone: "+212522000001",
        address: "12 Bd Anfa, Casablanca",
        legalForm: "Syndicat de copropriété",
        registrationNumber: "SC-2015-4521",
        foundingDate: "2015-03-01",
        mission: "Gestion et entretien de la copropriété Résidence Atlas",
        cotisationAmount: "450.00",
        cotisationCycle: "monthly",
        createdAt: daysAgo(1500),
      },
      {
        id: "syn_jardins_agdal",
        name: "Syndicat Les Jardins d'Agdal",
        abbreviation: "SJA",
        sector: "résidentiel",
        region: "Rabat-Salé-Kénitra",
        status: "active",
        membersCount: 3,
        email: "contact@jardins-agdal.ma",
        phone: "+212537000002",
        address: "45 Av. Ibn Sina, Agdal, Rabat",
        legalForm: "Syndicat de copropriété",
        registrationNumber: "SC-2018-7788",
        foundingDate: "2018-09-15",
        mission: "Gestion de la résidence Les Jardins d'Agdal",
        cotisationAmount: "600.00",
        cotisationCycle: "monthly",
        createdAt: daysAgo(900),
      },
    ])
    .onConflictDoNothing();

  // ─── Users (all 4 roles) ────────────────────────────────────────────────
  await db
    .insert(usersTable)
    .values([
      {
        id: "user_super_admin",
        name: "Karim Bensouda",
        email: "superadmin@syndycat.ma",
        phone: "+212600000001",
        cin: "BE123456",
        passwordHash: PASSWORD_HASH,
        role: "super_admin",
        status: "active",
        profession: "Administrateur plateforme",
        createdAt: daysAgo(1500),
      },
      {
        id: "user_admin_atlas",
        name: "Nadia Ouahbi",
        email: "syndic@andalous.ma",
        phone: "+212600000002",
        cin: "A123456",
        passwordHash: PASSWORD_HASH,
        role: "syndicate_admin",
        status: "active",
        syndicateId: "syn_residence_atlas",
        profession: "Syndic bénévole",
        createdAt: daysAgo(1400),
      },
      {
        id: "user_admin_agdal",
        name: "Youssef Idrissi",
        email: "syndic@jardins-agdal.ma",
        phone: "+212600000003",
        cin: "R778899",
        passwordHash: PASSWORD_HASH,
        role: "syndicate_admin",
        status: "active",
        syndicateId: "syn_jardins_agdal",
        profession: "Syndic professionnel",
        createdAt: daysAgo(880),
      },
      {
        id: "user_member_1",
        name: "Mohammed Alaoui",
        email: "mohammed.alaoui@residence-atlas.ma",
        phone: "+212600000004",
        cin: "BE234567",
        passwordHash: PASSWORD_HASH,
        role: "member",
        status: "active",
        syndicateId: "syn_residence_atlas",
        profession: "Ingénieur",
        createdAt: daysAgo(1300),
      },
      {
        id: "user_member_2",
        name: "Khadija Tahiri",
        email: "khadija.tahiri@residence-atlas.ma",
        phone: "+212600000005",
        cin: "BE345678",
        passwordHash: PASSWORD_HASH,
        role: "member",
        status: "active",
        syndicateId: "syn_residence_atlas",
        profession: "Médecin",
        createdAt: daysAgo(1250),
      },
      {
        id: "user_member_3",
        name: "Rachid El Amrani",
        email: "rachid.elamrani@jardins-agdal.ma",
        phone: "+212600000006",
        cin: "R889900",
        passwordHash: PASSWORD_HASH,
        role: "member",
        status: "active",
        syndicateId: "syn_jardins_agdal",
        profession: "Avocat",
        createdAt: daysAgo(850),
      },
      {
        id: "user_tenant_1",
        name: "Sara Bouzid",
        email: "sara.bouzid@gmail.com",
        phone: "+212600000007",
        cin: "BE456789",
        passwordHash: PASSWORD_HASH,
        role: "tenant",
        status: "active",
        syndicateId: "syn_residence_atlas",
        profession: "Comptable",
        createdAt: daysAgo(400),
      },
      {
        id: "user_tenant_2",
        name: "Omar Zaki",
        email: "omar.zaki@gmail.com",
        phone: "+212600000008",
        cin: "R990011",
        passwordHash: PASSWORD_HASH,
        role: "tenant",
        status: "active",
        syndicateId: "syn_jardins_agdal",
        profession: "Designer",
        createdAt: daysAgo(200),
      },
    ])
    .onConflictDoNothing();

  // ─── Members (property owners) ─────────────────────────────────────────
  await db
    .insert(membersTable)
    .values([
      { id: "member_1", name: "Mohammed Alaoui", email: "mohammed.alaoui@residence-atlas.ma", phone: "+212600000004", profession: "Ingénieur", syndicateId: "syn_residence_atlas", status: "active", cotisationStatus: "paid", joinDate: "2021-01-15", createdAt: daysAgo(1300) },
      { id: "member_2", name: "Khadija Tahiri", email: "khadija.tahiri@residence-atlas.ma", phone: "+212600000005", profession: "Médecin", syndicateId: "syn_residence_atlas", status: "active", cotisationStatus: "paid", joinDate: "2021-03-01", createdAt: daysAgo(1250) },
      { id: "member_3", name: "Hassan Cherkaoui", email: "hassan.cherkaoui@residence-atlas.ma", phone: "+212600000009", profession: "Retraité", syndicateId: "syn_residence_atlas", status: "active", cotisationStatus: "overdue", joinDate: "2019-06-01", createdAt: daysAgo(1600) },
      { id: "member_4", name: "Rachid El Amrani", email: "rachid.elamrani@jardins-agdal.ma", phone: "+212600000006", profession: "Avocat", syndicateId: "syn_jardins_agdal", status: "active", cotisationStatus: "paid", joinDate: "2019-09-15", createdAt: daysAgo(850) },
    ])
    .onConflictDoNothing();

  // ─── Buildings, Lots, Tenants ───────────────────────────────────────────
  await db
    .insert(buildingsTable)
    .values([
      { id: "building_atlas_a", name: "Résidence Atlas — Bâtiment A", address: "12 Bd Anfa, Casablanca", city: "Casablanca", type: "residential", totalFloors: 6, totalLots: 24, constructionYear: 2014, syndicateId: "syn_residence_atlas", adminId: "user_admin_atlas", bankAccount: "MA0011 2233 4455 6677", registrationNumber: "IM-2014-887", status: "active", createdAt: daysAgo(1500) },
      { id: "building_agdal_1", name: "Les Jardins d'Agdal — Immeuble 1", address: "45 Av. Ibn Sina, Agdal, Rabat", city: "Rabat", type: "residential", totalFloors: 4, totalLots: 16, constructionYear: 2017, syndicateId: "syn_jardins_agdal", adminId: "user_admin_agdal", bankAccount: "MA0099 8877 6655 4433", registrationNumber: "IM-2017-334", status: "active", createdAt: daysAgo(900) },
    ])
    .onConflictDoNothing();

  await db
    .insert(lotsTable)
    .values([
      { id: "lot_a101", number: "A101", type: "appartement", floor: 1, surfaceM2: "85.00", tantiemes: 120, buildingId: "building_atlas_a", ownerId: "member_1", status: "occupied", createdAt: daysAgo(1300) },
      { id: "lot_a102", number: "A102", type: "appartement", floor: 1, surfaceM2: "72.00", tantiemes: 100, buildingId: "building_atlas_a", ownerId: "member_2", status: "occupied", createdAt: daysAgo(1250) },
      { id: "lot_a205", number: "A205", type: "appartement", floor: 2, surfaceM2: "95.00", tantiemes: 135, buildingId: "building_atlas_a", ownerId: "member_3", status: "rented", createdAt: daysAgo(1200) },
      { id: "lot_a301", number: "A301", type: "appartement", floor: 3, surfaceM2: "110.00", tantiemes: 150, buildingId: "building_atlas_a", ownerId: "member_1", status: "occupied", createdAt: daysAgo(1100) },
      { id: "lot_ag01", number: "Ag-01", type: "appartement", floor: 0, surfaceM2: "78.00", tantiemes: 110, buildingId: "building_agdal_1", ownerId: "member_4", status: "rented", createdAt: daysAgo(850) },
      { id: "lot_ag12", number: "Ag-12", type: "duplex", floor: 3, surfaceM2: "140.00", tantiemes: 200, buildingId: "building_agdal_1", ownerId: "member_4", status: "occupied", createdAt: daysAgo(800) },
    ])
    .onConflictDoNothing();

  await db.insert(tenantsTable).values([
    { id: "tenant_1", name: "Sara Bouzid", email: "sara.bouzid@gmail.com", phone: "+212600000007", lotId: "lot_a205", buildingId: "building_atlas_a", syndicateId: "syn_residence_atlas", leaseStart: "2024-01-01", leaseEnd: "2026-12-31", monthlyRent: "5500.00", depositAmount: "11000.00", status: "active", emergencyContact: "Fatima Bouzid", emergencyPhone: "+212661000000", createdAt: daysAgo(400) },
    { id: "tenant_2", name: "Omar Zaki", email: "omar.zaki@gmail.com", phone: "+212600000008", lotId: "lot_ag01", buildingId: "building_agdal_1", syndicateId: "syn_jardins_agdal", leaseStart: "2025-01-01", leaseEnd: "2027-12-31", monthlyRent: "4800.00", depositAmount: "9600.00", status: "active", emergencyContact: "Nadia Zaki", emergencyPhone: "+212662000000", createdAt: daysAgo(200) },
  ]).onConflictDoNothing();

  // ─── Budgets, Budget Lines, Appels de fonds ─────────────────────────────
  await db
    .insert(budgetsTable)
    .values([
      { id: "budget_atlas_2026", year: 2026, buildingId: "building_atlas_a", totalAmount: "129600.00", chargesAmount: "108000.00", fondsReserve: "21600.00", status: "approved", createdBy: "user_admin_atlas", votedAt: daysAgo(180), createdAt: daysAgo(200) },
      { id: "budget_agdal_2026", year: 2026, buildingId: "building_agdal_1", totalAmount: "86400.00", chargesAmount: "72000.00", fondsReserve: "14400.00", status: "approved", createdBy: "user_admin_agdal", votedAt: daysAgo(150), createdAt: daysAgo(170) },
    ])
    .onConflictDoNothing();

  await db.insert(budgetLinesTable).values([
    { id: "bl_1", budgetId: "budget_atlas_2026", category: "entretien", label: "Nettoyage & entretien courant", amountAnnual: "36000.00" },
    { id: "bl_2", budgetId: "budget_atlas_2026", category: "gardiennage", label: "Gardiennage & sécurité", amountAnnual: "48000.00" },
    { id: "bl_3", budgetId: "budget_atlas_2026", category: "ascenseur", label: "Maintenance ascenseurs", amountAnnual: "24000.00" },
    { id: "bl_4", budgetId: "budget_agdal_2026", category: "entretien", label: "Nettoyage & espaces verts", amountAnnual: "30000.00" },
    { id: "bl_5", budgetId: "budget_agdal_2026", category: "gardiennage", label: "Gardiennage", amountAnnual: "42000.00" },
  ]).onConflictDoNothing();

  await db.insert(appelsDeFondsTable).values([
    { id: "adf_1", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a101", ownerId: "member_1", period: "2026-07", type: "charges_courantes", amount: "450.00", dueDate: "2026-07-10", status: "paid", paymentMethod: "virement", paidDate: "2026-07-05", receiptNumber: "REC-2026-0701", createdAt: daysAgo(30) },
    { id: "adf_2", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a102", ownerId: "member_2", period: "2026-07", type: "charges_courantes", amount: "450.00", dueDate: "2026-07-10", status: "pending_validation", paymentMethod: "cheque", proofUrl: "/uploads/proofs/adf_2.jpg", createdAt: daysAgo(10) },
    { id: "adf_3", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a205", ownerId: "member_3", period: "2026-06", type: "charges_courantes", amount: "450.00", dueDate: "2026-06-10", status: "overdue", createdAt: daysAgo(60) },
    { id: "adf_4", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a301", ownerId: "member_1", period: "2026-07", type: "fonds_travaux", amount: "800.00", dueDate: "2026-07-15", status: "pending", createdAt: daysAgo(5) },
    { id: "adf_5", buildingId: "building_agdal_1", budgetId: "budget_agdal_2026", lotId: "lot_ag12", ownerId: "member_4", period: "2026-07", type: "charges_courantes", amount: "600.00", dueDate: "2026-07-10", status: "paid", paymentMethod: "virement", paidDate: "2026-07-02", receiptNumber: "REC-2026-0812", createdAt: daysAgo(28) },
  ]).onConflictDoNothing();

  // ─── Finance: transactions, salaries, caisse, invoices, bons ────────────
  await db.insert(transactionsTable).values([
    { id: "tx_1", type: "revenue", amount: "450.00", label: "Cotisation juillet — Lot A101", date: "2026-07-05", status: "paid", memberId: "member_1", syndicateId: "syn_residence_atlas", createdAt: daysAgo(30) },
    { id: "tx_2", type: "expense", amount: "8000.00", label: "Maintenance ascenseur — juillet", date: "2026-07-03", status: "paid", syndicateId: "syn_residence_atlas", createdAt: daysAgo(32) },
    { id: "tx_3", type: "expense", amount: "12000.00", label: "Salaire gardien — juillet", date: "2026-07-01", status: "paid", syndicateId: "syn_residence_atlas", createdAt: daysAgo(35) },
    { id: "tx_4", type: "revenue", amount: "600.00", label: "Cotisation juillet — Lot Ag-12", date: "2026-07-02", status: "paid", memberId: "member_4", syndicateId: "syn_jardins_agdal", createdAt: daysAgo(28) },
  ]).onConflictDoNothing();

  await db.insert(salaryRecordsTable).values([
    { id: "salary_1", employee: "Abdelali Mansouri", role: "Gardien", amount: "3500.00", month: "2026-07", status: "paid", paidDate: "2026-07-01", syndicateId: "syn_residence_atlas", createdAt: daysAgo(35) },
    { id: "salary_2", employee: "Fatiha Znati", role: "Femme de ménage", amount: "2800.00", month: "2026-07", status: "paid", paidDate: "2026-07-01", syndicateId: "syn_residence_atlas", createdAt: daysAgo(35) },
    { id: "salary_3", employee: "Said Bouhaddi", role: "Gardien", amount: "3200.00", month: "2026-07", status: "pending", syndicateId: "syn_jardins_agdal", createdAt: daysAgo(5) },
  ]).onConflictDoNothing();

  await db.insert(caisseEntriesTable).values([
    { id: "caisse_1", label: "Solde initial", amount: "50000.00", type: "credit", date: "2026-01-01", category: "ouverture", syndicateId: "syn_residence_atlas", balance: "50000.00", createdAt: daysAgo(190) },
    { id: "caisse_2", label: "Cotisations juillet", amount: "450.00", type: "credit", date: "2026-07-05", category: "cotisations", syndicateId: "syn_residence_atlas", balance: "50450.00", createdAt: daysAgo(30) },
    { id: "caisse_3", label: "Maintenance ascenseur", amount: "8000.00", type: "debit", date: "2026-07-03", category: "entretien", syndicateId: "syn_residence_atlas", balance: "42450.00", createdAt: daysAgo(32) },
  ]).onConflictDoNothing();

  await db.insert(invoicesTable).values([
    { id: "inv_1", reference: "FAC-2026-001", type: "facture", recipient: "Résidence Atlas", date: "2026-07-01", dueDate: "2026-07-31", status: "sent", amount: "8000.00", syndicateId: "syn_residence_atlas", createdAt: daysAgo(35) },
    { id: "inv_2", reference: "FAC-2026-002", type: "facture", recipient: "Les Jardins d'Agdal", date: "2026-07-05", dueDate: "2026-08-05", status: "draft", amount: "4200.00", syndicateId: "syn_jardins_agdal", createdAt: daysAgo(10) },
  ]).onConflictDoNothing();
  await db.insert(invoiceItemsTable).values([
    { id: "invitem_1", invoiceId: "inv_1", label: "Maintenance ascenseur (juillet)", quantity: "1", unitPrice: "8000.00" },
    { id: "invitem_2", invoiceId: "inv_2", label: "Entretien espaces verts", quantity: "1", unitPrice: "4200.00" },
  ]).onConflictDoNothing();

  await db.insert(bonsLivraisonTable).values([
    { id: "bon_1", reference: "BL-2026-001", recipient: "Résidence Atlas", date: "2026-07-02", type: "entree", total: "1200.00", status: "validated", syndicateId: "syn_residence_atlas", createdAt: daysAgo(33) },
  ]).onConflictDoNothing();
  await db.insert(bonItemsTable).values([
    { id: "bonitem_1", bonId: "bon_1", label: "Ampoules LED (lot de 20)", quantity: "20", unitPrice: "60.00" },
  ]).onConflictDoNothing();

  // ─── Prestataires, Contrats, Travaux, Sinistres ─────────────────────────
  await db.insert(prestatairesTable).values([
    { id: "prest_1", name: "Ascenseurs Maroc SARL", type: "ascenseur", contactName: "Ali Nasri", phone: "+212522111111", email: "contact@ascenseursmaroc.ma", ice: "001234567000045", buildingId: "building_atlas_a", syndicateId: "syn_residence_atlas", status: "active", rating: "4.50", createdAt: daysAgo(1000) },
    { id: "prest_2", name: "GreenClean Services", type: "nettoyage", contactName: "Samira Kabbaj", phone: "+212537222222", email: "contact@greenclean.ma", ice: "001234567000099", buildingId: "building_agdal_1", syndicateId: "syn_jardins_agdal", status: "active", rating: "4.20", createdAt: daysAgo(600) },
  ]).onConflictDoNothing();
  await db.insert(contratsPrestatairesTable).values([
    { id: "contrat_1", prestataireId: "prest_1", buildingId: "building_atlas_a", title: "Maintenance ascenseurs 2026", startDate: "2026-01-01", endDate: "2026-12-31", monthlyAmount: "8000.00", annualAmount: "96000.00", status: "active", autoRenew: true, createdAt: daysAgo(190) },
  ]).onConflictDoNothing();
  await db.insert(travauxTable).values([
    { id: "travaux_1", title: "Réparation fuite toiture", description: "Infiltration d'eau détectée au dernier étage", type: "reparation", priority: "high", status: "in_progress", buildingId: "building_atlas_a", lotId: "lot_a301", prestataireId: "prest_1", reportedById: "user_member_1", reportedByName: "Mohammed Alaoui", estimatedAmount: "5000.00", startDate: "2026-07-01", createdAt: daysAgo(7) },
    { id: "travaux_2", title: "Peinture cage d'escalier", description: "Rafraîchissement peinture bâtiment A", type: "entretien", priority: "normal", status: "reported", buildingId: "building_atlas_a", reportedById: "user_admin_atlas", reportedByName: "Nadia Ouahbi", estimatedAmount: "12000.00", createdAt: daysAgo(3) },
  ]).onConflictDoNothing();
  await db.insert(sinistresTable).values([
    { id: "sinistre_1", buildingId: "building_atlas_a", lotId: "lot_a205", type: "degat_eaux", description: "Dégât des eaux suite à une fuite de canalisation", date: "2026-06-20", estimatedAmount: "15000.00", claimNumber: "SIN-2026-0045", status: "in_progress", urgency: "high", reportedById: "user_member_2", reportedByName: "Khadija Tahiri", createdAt: daysAgo(18) },
    { id: "sinistre_2", buildingId: "building_agdal_1", lotId: "lot_ag01", type: "incendie", description: "Départ de feu maîtrisé au tableau électrique", date: "2026-07-01", estimatedAmount: "8000.00", claimNumber: "SIN-2026-0052", status: "declared", urgency: "critical", reportedById: "user_tenant_2", reportedByName: "Omar Zaki", createdAt: daysAgo(7) },
  ]).onConflictDoNothing();

  // ─── Elections, Candidates, Votes ────────────────────────────────────────
  await db.insert(electionsTable).values([
    { id: "election_1", syndicateId: "syn_residence_atlas", title: "Élection du conseil syndical 2026", description: "Renouvellement du conseil syndical pour le mandat 2026-2028", status: "active", startDate: "2026-07-01", endDate: "2026-07-31", createdBy: "user_admin_atlas", createdAt: daysAgo(7) },
  ]).onConflictDoNothing();
  await db.insert(candidatesTable).values([
    { id: "cand_1", electionId: "election_1", name: "Mohammed Alaoui", post: "Président du conseil syndical", bio: "Membre depuis 2021, ingénieur", votes: 1 },
    { id: "cand_2", electionId: "election_1", name: "Khadija Tahiri", post: "Trésorière", bio: "Membre depuis 2021, médecin", votes: 0 },
  ]).onConflictDoNothing();
  await db.insert(votesTable).values([
    { id: "vote_1", electionId: "election_1", voterId: "user_member_1", candidateId: "cand_1", createdAt: daysAgo(2) },
  ]).onConflictDoNothing();

  // ─── Meetings, Attendees, AG Resolutions ────────────────────────────────
  await db.insert(meetingsTable).values([
    { id: "meeting_1", syndicateId: "syn_residence_atlas", title: "Assemblée Générale Ordinaire 2026", date: "2026-07-20", time: "10:00", location: "Salle commune, Résidence Atlas", type: "general", description: "Bilan financier annuel et vote du budget 2027", agenda: "1. Bilan 2026\n2. Vote budget 2027\n3. Élection conseil syndical", status: "scheduled", createdBy: "user_admin_atlas", createdAt: daysAgo(20) },
  ]).onConflictDoNothing();
  await db.insert(meetingAttendeesTable).values([
    { id: "attendee_1", meetingId: "meeting_1", userId: "user_member_1" },
    { id: "attendee_2", meetingId: "meeting_1", userId: "user_member_2" },
  ]).onConflictDoNothing();
  await db.insert(agResolutionsTable).values([
    { id: "resolution_1", meetingId: "meeting_1", buildingId: "building_atlas_a", number: 1, title: "Approbation du budget 2027", description: "Vote pour l'approbation du budget prévisionnel 2027", requiredMajority: "simple", tantiemesFor: 220, tantiemesAgainst: 30, tantiemesAbstain: 10, result: "pending" },
  ]).onConflictDoNothing();

  // ─── Union Actions ──────────────────────────────────────────────────────
  await db.insert(unionActionsTable).values([
    { id: "action_1", title: "Campagne d'entretien des espaces verts", description: "Mobilisation des résidents pour l'entretien collectif", type: "campagne", status: "planned", date: "2026-08-01", location: "Résidence Atlas", organizer: "Nadia Ouahbi", participantsTarget: 20, syndicateId: "syn_residence_atlas", createdBy: "user_admin_atlas", createdAt: daysAgo(5) },
  ]).onConflictDoNothing();
  await db.insert(actionSupportsTable).values([{ id: "support_1", actionId: "action_1", userId: "user_member_1" }]).onConflictDoNothing();
  await db.insert(actionParticipantsTable).values([{ id: "participant_1", actionId: "action_1", userId: "user_member_1", userName: "Mohammed Alaoui" }]).onConflictDoNothing();

  // ─── Publications, Announcements, Documents ─────────────────────────────
  await db
    .insert(publicationsTable)
    .values([
      { id: "pub_1", title: "Travaux de peinture — Planning", content: "Les travaux de peinture de la cage d'escalier débuteront le 15 juillet.", category: "travaux", syndicateId: "syn_residence_atlas", authorId: "user_admin_atlas", authorName: "Nadia Ouahbi", likes: 1, comments: 1, createdAt: daysAgo(4) },
    ])
    .onConflictDoNothing();
  await db.insert(publicationLikesTable).values([{ publicationId: "pub_1", userId: "user_member_1" }]).onConflictDoNothing();
  await db.insert(publicationCommentsTable).values([{ id: "pubcomment_1", publicationId: "pub_1", authorId: "user_member_2", authorName: "Khadija Tahiri", text: "Merci pour l'info, quel prestataire ?" }]).onConflictDoNothing();

  await db.insert(announcementsTable).values([
    { id: "announcement_1", title: "Coupure d'eau programmée", body: "Une coupure d'eau est prévue le 12 juillet de 9h à 13h pour maintenance.", priority: "high", audience: "all", pinned: true, syndicateId: "syn_residence_atlas", authorId: "user_admin_atlas", author: "Nadia Ouahbi", createdAt: daysAgo(2) },
  ]).onConflictDoNothing();

  await db.insert(documentsTable).values([
    { id: "doc_1", title: "Règlement de copropriété", category: "légal", content: "Texte du règlement de copropriété...", status: "published", syndicateId: "syn_residence_atlas", size: "1.2 MB", createdBy: "user_admin_atlas", createdAt: daysAgo(1400) },
    { id: "doc_2", title: "PV Assemblée Générale 2025", category: "compte-rendu", status: "published", syndicateId: "syn_residence_atlas", size: "340 KB", createdBy: "user_admin_atlas", createdAt: daysAgo(300) },
  ]).onConflictDoNothing();

  // ─── Chat: conversations, messages, reads ───────────────────────────────
  await db
    .insert(conversationsTable)
    .values([
      { id: "conv_general_atlas", syndicateId: "syn_residence_atlas", buildingId: "building_atlas_a", convType: "building", isGroup: true, name: "Résidence Atlas — Discussion générale", createdAt: daysAgo(300) },
      { id: "conv_direct_1", syndicateId: "syn_residence_atlas", convType: "direct", participant1Id: "user_admin_atlas", participant2Id: "user_member_1", createdAt: daysAgo(60) },
    ])
    .onConflictDoNothing();
  await db.insert(messagesTable).values([
    { id: "message_1", conversationId: "conv_general_atlas", senderId: "user_admin_atlas", senderName: "Nadia Ouahbi", text: "Bonjour à tous, rappel de l'AG du 20 juillet.", createdAt: daysAgo(2) },
    { id: "message_2", conversationId: "conv_general_atlas", senderId: "user_member_1", senderName: "Mohammed Alaoui", text: "Bien reçu, merci !", createdAt: daysAgo(2) },
    { id: "message_3", conversationId: "conv_direct_1", senderId: "user_member_1", senderName: "Mohammed Alaoui", text: "Bonjour, pouvez-vous valider mon paiement de charges ?", createdAt: daysAgo(10) },
  ]).onConflictDoNothing();
  await db.insert(messageReadsTable).values([
    { id: "read_1", conversationId: "conv_general_atlas", userId: "user_member_1" },
  ]).onConflictDoNothing();

  // ─── P1: Marketplace ─────────────────────────────────────────────────────
  await db
    .insert(productsTable)
    .values([
      { id: "product_1", name: "Table de jardin en teck", description: "Table 6 places, très bon état", price: "1200.00", category: "mobilier", condition: "bon", location: "Résidence Atlas", stock: 1, syndicateId: "syn_residence_atlas", sellerId: "user_member_1", sellerName: "Mohammed Alaoui", status: "approved", featured: true, viewCount: 34, createdAt: daysAgo(15) },
      { id: "product_2", name: "Vélo enfant 20 pouces", description: "Peu servi, comme neuf", price: "450.00", category: "loisirs", condition: "neuf", location: "Résidence Atlas", stock: 1, syndicateId: "syn_residence_atlas", sellerId: "user_member_2", sellerName: "Khadija Tahiri", status: "pending_review", createdAt: daysAgo(2) },
      { id: "product_3", name: "Machine à café Nespresso", description: "Fonctionne parfaitement", price: "600.00", category: "électroménager", condition: "bon", location: "Les Jardins d'Agdal", stock: 1, syndicateId: "syn_jardins_agdal", sellerId: "user_member_3", sellerName: "Rachid El Amrani", status: "approved", createdAt: daysAgo(8) },
    ])
    .onConflictDoNothing();
  await db.insert(cartItemsTable).values([
    { id: "cartitem_1", userId: "user_tenant_1", productId: "product_1", productName: "Table de jardin en teck", price: "1200.00", sellerName: "Mohammed Alaoui", quantity: 1 },
  ]).onConflictDoNothing();
  await db
    .insert(ordersTable)
    .values([
      { id: "order_1", productId: "product_3", productName: "Machine à café Nespresso", buyerId: "user_member_1", buyerName: "Mohammed Alaoui", sellerId: "user_member_3", sellerName: "Rachid El Amrani", amount: "600.00", status: "delivered", type: "purchase", date: "2026-06-25", createdAt: daysAgo(13) },
    ])
    .onConflictDoNothing();
  await db.insert(reviewsTable).values([
    { id: "review_1", productId: "product_3", productName: "Machine à café Nespresso", orderId: "order_1", rating: 5, comment: "Vendeur sérieux, article conforme.", reviewerId: "user_member_1", reviewerName: "Mohammed Alaoui", date: "2026-06-26" },
  ]).onConflictDoNothing();
  await db.insert(productFavoritesTable).values([{ id: "fav_1", productId: "product_1", userId: "user_tenant_1" }]).onConflictDoNothing();
  await db.insert(productReportsTable).values([{ id: "report_1", productId: "product_2", reporterId: "user_member_1", reporterName: "Mohammed Alaoui", reason: "mauvaise_info", details: "Prix incohérent avec la description", status: "pending" }]).onConflictDoNothing();
  await db.insert(productCommentsTable).values([{ id: "prodcomment_1", productId: "product_1", userId: "user_tenant_1", userName: "Sara Bouzid", userRole: "tenant", content: "Toujours disponible ?" }]).onConflictDoNothing();
  await db.insert(marketplacePromotionsTable).values([
    { id: "promo_1", productId: "product_1", sellerId: "user_member_1", type: "featured", startDate: daysAgo(15), endDate: daysAgo(-15), amount: "50.00", status: "active", approvedBy: "user_admin_atlas" },
  ]).onConflictDoNothing();

  // ─── Legal alerts, Support tickets ───────────────────────────────────────
  await db.insert(legalAlertsTable).values([
    { id: "legal_1", title: "Mise à jour Loi 18-00 sur la copropriété", description: "Nouvelles obligations de tenue des AG annuelles", level: "info", category: "réglementation", date: "2026-06-01", status: "open", syndicateId: "syn_residence_atlas", createdAt: daysAgo(37) },
  ]).onConflictDoNothing();
  await db.insert(supportTicketsTable).values([
    { id: "ticket_1", title: "Problème d'accès à l'application", description: "Impossible de me connecter depuis hier", priority: "high", category: "technique", status: "open", syndicateId: "syn_residence_atlas", submittedById: "user_member_2", submittedByName: "Khadija Tahiri", createdAt: daysAgo(1) },
  ]).onConflictDoNothing();
  await db.insert(ticketRepliesTable).values([
    { id: "reply_1", ticketId: "ticket_1", authorId: "user_super_admin", authorName: "Karim Bensouda", text: "Bonjour, pouvez-vous préciser le message d'erreur ?" },
  ]).onConflictDoNothing();

  // ─── Cotisations, Payment proofs ────────────────────────────────────────
  await db.insert(cotisationsTable).values([
    { id: "cotisation_1", memberId: "member_1", label: "Cotisation juillet 2026", period: "2026-07", amount: "450.00", dueDate: "2026-07-10", status: "paid", syndicateId: "syn_residence_atlas", paidDate: "2026-07-05", receipt: "REC-2026-0701", createdAt: daysAgo(30) },
    { id: "cotisation_2", memberId: "member_3", label: "Cotisation juin 2026", period: "2026-06", amount: "450.00", dueDate: "2026-06-10", status: "overdue", syndicateId: "syn_residence_atlas", createdAt: daysAgo(60) },
  ]).onConflictDoNothing();
  await db.insert(paymentProofsTable).values([
    { id: "proof_1", cotisationId: "cotisation_1", userId: "user_member_1", fileUrl: "/uploads/proofs/proof_1.jpg", proofUrl: "/uploads/proofs/proof_1.jpg", amount: "450.00", status: "approved", uploadedById: "user_member_1", reviewedById: "user_admin_atlas", reviewedAt: daysAgo(28) },
  ]).onConflictDoNothing();

  // ─── Alerts, preferences, partners, payslips ────────────────────────────
  await db.insert(alertsTable).values([
    { id: "alert_1", title: "Solde de trésorerie faible", message: "Le solde de la caisse est descendu sous le seuil d'alerte (10 000 MAD).", type: "warning", date: "2026-07-06", target: "admin", syndicateId: "syn_residence_atlas", createdAt: daysAgo(2) },
  ]).onConflictDoNothing();
  await db.insert(alertReadsTable).values([{ alertId: "alert_1", userId: "user_admin_atlas" }]).onConflictDoNothing();
  await db.insert(notificationPreferencesTable).values([
    { id: "pref_1", userId: "user_member_1", push: true, email: true, inApp: true },
    { id: "pref_2", userId: "user_tenant_1", push: true, email: false, inApp: true },
  ]).onConflictDoNothing();
  await db.insert(partnersTable).values([
    { id: "partner_1", name: "Clinique Al Amal", type: "santé", sector: "médical", contact: "Dr. Fadili", phone: "+212522333333", benefit: "Réduction consultations", discount: "15%", syndicateId: "syn_residence_atlas", createdAt: daysAgo(200) },
  ]).onConflictDoNothing();
  await db.insert(payslipsTable).values([
    { id: "payslip_1", userId: "user_admin_atlas", month: "2026-06", amount: "3500.00", fileUrl: "/uploads/payslips/payslip_1.pdf", syndicateId: "syn_residence_atlas", createdAt: daysAgo(38) },
  ]).onConflictDoNothing();

  // ─── P9: Subscriptions ───────────────────────────────────────────────────
  await db.insert(subscriptionPlansTable).values([
    { id: "plan_basic", name: "Basique", price: "299.00", interval: "monthly", features: JSON.stringify(["Gestion des charges", "1 bâtiment", "Support email"]) },
    { id: "plan_pro", name: "Pro", price: "699.00", interval: "monthly", features: JSON.stringify(["Multi-bâtiments", "Marketplace", "Support prioritaire", "Transparence financière"]) },
  ]).onConflictDoNothing();
  await db.insert(syndicateSubscriptionsTable).values([
    { id: "sub_1", syndicateId: "syn_residence_atlas", planId: "plan_pro", status: "active", autoRenew: true, createdAt: daysAgo(190) },
    { id: "sub_2", syndicateId: "syn_jardins_agdal", planId: "plan_basic", status: "active", autoRenew: true, createdAt: daysAgo(170) },
  ]).onConflictDoNothing();

  // ─── Audit logs ──────────────────────────────────────────────────────────
  await db.insert(auditLogsTable).values([
    { id: "audit_1", userId: "user_admin_atlas", userName: "Nadia Ouahbi", syndicateId: "syn_residence_atlas", action: "validate_payment", entity: "appels_de_fonds", entityId: "adf_1", details: "Validation du paiement charges juillet", createdAt: daysAgo(28) },
    { id: "audit_2", userId: "user_super_admin", userName: "Karim Bensouda", action: "approve_product", entity: "products", entityId: "product_1", details: "Approbation annonce marketplace", createdAt: daysAgo(14) },
  ]).onConflictDoNothing();

  // ─── P6: Ideas & Voting ──────────────────────────────────────────────────
  await db.insert(ideasTable).values([
    { id: "idea_1", syndicateId: "syn_residence_atlas", userId: "user_member_1", userName: "Mohammed Alaoui", title: "Installer des bornes de recharge électrique", description: "Ajouter 2 bornes de recharge pour véhicules électriques au parking", category: "infrastructure", status: "under_review", voteCount: 2, voteDeadline: "2026-08-01", createdAt: daysAgo(20) },
    { id: "idea_2", syndicateId: "syn_residence_atlas", userId: "user_member_2", userName: "Khadija Tahiri", title: "Tri sélectif des déchets", description: "Mettre en place des poubelles de tri sélectif dans chaque étage", category: "environment", status: "approved", voteCount: 3, adminNote: "Approuvé, mise en œuvre prévue en septembre", createdAt: daysAgo(45) },
  ]).onConflictDoNothing();
  await db.insert(ideaVotesTable).values([
    { id: "ideavote_1", ideaId: "idea_1", userId: "user_member_1" },
    { id: "ideavote_2", ideaId: "idea_1", userId: "user_member_2" },
  ]).onConflictDoNothing();

  // ─── P7: Debt Escalation ─────────────────────────────────────────────────
  await db.insert(debtEscalationsTable).values([
    { id: "escalation_1", syndicateId: "syn_residence_atlas", memberId: "member_3", memberName: "Hassan Cherkaoui", totalOverdue: "2700.00", overdueMonths: 6, level: "serious", status: "meeting_scheduled", alertSentAt: daysAgo(10), meetingId: "meeting_1", createdAt: daysAgo(15) },
  ]).onConflictDoNothing();

  // ─── P10: Financial Transparency ─────────────────────────────────────────
  await db.insert(expenseJustificationsTable).values([
    { id: "justification_1", syndicateId: "syn_residence_atlas", transactionId: "tx_2", title: "Maintenance ascenseur — juillet 2026", description: "Intervention trimestrielle contractuelle sur les 2 ascenseurs", amount: "8000.00", category: "entretien", receiptUrl: "/uploads/receipts/justification_1.pdf", status: "approved", submittedBy: "user_admin_atlas", submitterName: "Nadia Ouahbi", voteCount: 2, votesFor: 2, votesAgainst: 0, createdAt: daysAgo(32) },
  ]).onConflictDoNothing();
  await db.insert(expenseVotesTable).values([
    { id: "expensevote_1", justificationId: "justification_1", userId: "user_member_1", vote: "for" },
    { id: "expensevote_2", justificationId: "justification_1", userId: "user_member_2", vote: "for" },
  ]).onConflictDoNothing();

  // ─── P12: National Ranking ───────────────────────────────────────────────
  await db.insert(nationalRankingsTable).values([
    { id: "ranking_1", syndicateId: "syn_residence_atlas", month: 6, year: 2026, collectionRate: "92.00", incidentResolutionRate: "85.00", documentationScore: "90.00", meetingComplianceScore: "100.00", memberSatisfaction: "88.00", totalScore: "91.00", rank: 3, regionRank: 1, region: "Casablanca-Settat", createdAt: daysAgo(20) },
    { id: "ranking_2", syndicateId: "syn_jardins_agdal", month: 6, year: 2026, collectionRate: "97.00", incidentResolutionRate: "90.00", documentationScore: "80.00", meetingComplianceScore: "100.00", memberSatisfaction: "93.00", totalScore: "93.00", rank: 1, regionRank: 1, region: "Rabat-Salé-Kénitra", createdAt: daysAgo(20) },
  ]).onConflictDoNothing();

  // ─── Auth: refresh tokens, password reset tokens ────────────────────────
  await db.insert(refreshTokensTable).values([
    { id: "refresh_1", userId: "user_admin_atlas", token: "seed-refresh-token-admin-atlas", expiresAt: daysAgo(-30) },
    { id: "refresh_2", userId: "user_member_1", token: "seed-refresh-token-member-1", expiresAt: daysAgo(-30) },
  ]).onConflictDoNothing();
  await db.insert(passwordResetTokensTable).values([
    { id: "reset_1", userId: "user_tenant_1", token: "seed-reset-token-tenant-1", expiresAt: daysAgo(-1), usedAt: null },
  ]).onConflictDoNothing();

  console.log("✅ Seed complete.");
  console.log("");
  console.log("Test accounts (password: password123):");
  console.log("  super_admin      superadmin@syndycat.ma");
  console.log("  syndicate_admin  syndic@andalous.ma        (Résidence Atlas)");
  console.log("  syndicate_admin  syndic@jardins-agdal.ma   (Les Jardins d'Agdal)");
  console.log("  member           mohammed.alaoui@residence-atlas.ma");
  console.log("  member           khadija.tahiri@residence-atlas.ma");
  console.log("  member           rachid.elamrani@jardins-agdal.ma");
  console.log("  tenant           sara.bouzid@gmail.com");
  console.log("  tenant           omar.zaki@gmail.com");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
