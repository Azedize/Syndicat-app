// Comprehensive test-data seed for SYNDYCAT GLOBAL CPS.
// Populates every table in lib/db/src/schema.ts with realistic Moroccan
// condominium-management data, covering all user roles:
//   super_admin | syndicate_admin | member | tenant  (+ employees via salary_records)
//
// Usage: pnpm --filter @workspace/scripts run seed
//
// NOT idempotent: every insert uses a fixed id and will fail on unique/PK
// constraints if run twice against the same database. Run this only once
// against a freshly-pushed, empty database (`pnpm --filter @workspace/db
// run db:push` on a clean DB, then `pnpm --filter @workspace/scripts run
// seed`). To reseed, drop and recreate the schema first.

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
  const [synResidences, synJardins] = await db
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
    .returning();

  // ─── Users (all 4 roles) ────────────────────────────────────────────────
  const users = await db
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
        syndicateId: synResidences.id,
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
        syndicateId: synJardins.id,
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
        syndicateId: synResidences.id,
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
        syndicateId: synResidences.id,
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
        syndicateId: synJardins.id,
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
        syndicateId: synResidences.id,
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
        syndicateId: synJardins.id,
        profession: "Designer",
        createdAt: daysAgo(200),
      },
    ])
    .returning();

  const uSuperAdmin = users.find((u) => u.id === "user_super_admin")!;
  const uAdminAtlas = users.find((u) => u.id === "user_admin_atlas")!;
  const uAdminAgdal = users.find((u) => u.id === "user_admin_agdal")!;
  const uMember1 = users.find((u) => u.id === "user_member_1")!;
  const uMember2 = users.find((u) => u.id === "user_member_2")!;
  const uMember3 = users.find((u) => u.id === "user_member_3")!;
  const uTenant1 = users.find((u) => u.id === "user_tenant_1")!;
  const uTenant2 = users.find((u) => u.id === "user_tenant_2")!;

  // ─── Members (property owners) ─────────────────────────────────────────
  const members = await db
    .insert(membersTable)
    .values([
      { id: "member_1", name: "Mohammed Alaoui", email: "mohammed.alaoui@residence-atlas.ma", phone: "+212600000004", profession: "Ingénieur", syndicateId: synResidences.id, status: "active", cotisationStatus: "paid", joinDate: "2021-01-15", createdAt: daysAgo(1300) },
      { id: "member_2", name: "Khadija Tahiri", email: "khadija.tahiri@residence-atlas.ma", phone: "+212600000005", profession: "Médecin", syndicateId: synResidences.id, status: "active", cotisationStatus: "paid", joinDate: "2021-03-01", createdAt: daysAgo(1250) },
      { id: "member_3", name: "Hassan Cherkaoui", email: "hassan.cherkaoui@residence-atlas.ma", phone: "+212600000009", profession: "Retraité", syndicateId: synResidences.id, status: "active", cotisationStatus: "overdue", joinDate: "2019-06-01", createdAt: daysAgo(1600) },
      { id: "member_4", name: "Rachid El Amrani", email: "rachid.elamrani@jardins-agdal.ma", phone: "+212600000006", profession: "Avocat", syndicateId: synJardins.id, status: "active", cotisationStatus: "paid", joinDate: "2019-09-15", createdAt: daysAgo(850) },
    ])
    .returning();

  // ─── Buildings, Lots, Tenants ───────────────────────────────────────────
  const buildings = await db
    .insert(buildingsTable)
    .values([
      { id: "building_atlas_a", name: "Résidence Atlas — Bâtiment A", address: "12 Bd Anfa, Casablanca", city: "Casablanca", type: "residential", totalFloors: 6, totalLots: 24, constructionYear: 2014, syndicateId: synResidences.id, adminId: uAdminAtlas.id, bankAccount: "MA0011 2233 4455 6677", registrationNumber: "IM-2014-887", status: "active", createdAt: daysAgo(1500) },
      { id: "building_agdal_1", name: "Les Jardins d'Agdal — Immeuble 1", address: "45 Av. Ibn Sina, Agdal, Rabat", city: "Rabat", type: "residential", totalFloors: 4, totalLots: 16, constructionYear: 2017, syndicateId: synJardins.id, adminId: uAdminAgdal.id, bankAccount: "MA0099 8877 6655 4433", registrationNumber: "IM-2017-334", status: "active", createdAt: daysAgo(900) },
    ])
    .returning();

  const lots = await db
    .insert(lotsTable)
    .values([
      { id: "lot_a101", number: "A101", type: "appartement", floor: 1, surfaceM2: "85.00", tantiemes: 120, buildingId: "building_atlas_a", ownerId: "member_1", status: "occupied", createdAt: daysAgo(1300) },
      { id: "lot_a102", number: "A102", type: "appartement", floor: 1, surfaceM2: "72.00", tantiemes: 100, buildingId: "building_atlas_a", ownerId: "member_2", status: "occupied", createdAt: daysAgo(1250) },
      { id: "lot_a205", number: "A205", type: "appartement", floor: 2, surfaceM2: "95.00", tantiemes: 135, buildingId: "building_atlas_a", ownerId: "member_3", status: "rented", createdAt: daysAgo(1200) },
      { id: "lot_a301", number: "A301", type: "appartement", floor: 3, surfaceM2: "110.00", tantiemes: 150, buildingId: "building_atlas_a", ownerId: "member_1", status: "occupied", createdAt: daysAgo(1100) },
      { id: "lot_ag01", number: "Ag-01", type: "appartement", floor: 0, surfaceM2: "78.00", tantiemes: 110, buildingId: "building_agdal_1", ownerId: "member_4", status: "rented", createdAt: daysAgo(850) },
      { id: "lot_ag12", number: "Ag-12", type: "duplex", floor: 3, surfaceM2: "140.00", tantiemes: 200, buildingId: "building_agdal_1", ownerId: "member_4", status: "occupied", createdAt: daysAgo(800) },
    ])
    .returning();

  await db.insert(tenantsTable).values([
    { id: "tenant_1", name: "Sara Bouzid", email: "sara.bouzid@gmail.com", phone: "+212600000007", lotId: "lot_a205", buildingId: "building_atlas_a", syndicateId: synResidences.id, leaseStart: "2024-01-01", leaseEnd: "2026-12-31", monthlyRent: "5500.00", depositAmount: "11000.00", status: "active", emergencyContact: "Fatima Bouzid", emergencyPhone: "+212661000000", createdAt: daysAgo(400) },
    { id: "tenant_2", name: "Omar Zaki", email: "omar.zaki@gmail.com", phone: "+212600000008", lotId: "lot_ag01", buildingId: "building_agdal_1", syndicateId: synJardins.id, leaseStart: "2025-01-01", leaseEnd: "2027-12-31", monthlyRent: "4800.00", depositAmount: "9600.00", status: "active", emergencyContact: "Nadia Zaki", emergencyPhone: "+212662000000", createdAt: daysAgo(200) },
  ]);

  // ─── Budgets, Budget Lines, Appels de fonds ─────────────────────────────
  const budgets = await db
    .insert(budgetsTable)
    .values([
      { id: "budget_atlas_2026", year: 2026, buildingId: "building_atlas_a", totalAmount: "129600.00", chargesAmount: "108000.00", fondsReserve: "21600.00", status: "approved", createdBy: uAdminAtlas.id, votedAt: daysAgo(180), createdAt: daysAgo(200) },
      { id: "budget_agdal_2026", year: 2026, buildingId: "building_agdal_1", totalAmount: "86400.00", chargesAmount: "72000.00", fondsReserve: "14400.00", status: "approved", createdBy: uAdminAgdal.id, votedAt: daysAgo(150), createdAt: daysAgo(170) },
    ])
    .returning();

  await db.insert(budgetLinesTable).values([
    { id: "bl_1", budgetId: "budget_atlas_2026", category: "entretien", label: "Nettoyage & entretien courant", amountAnnual: "36000.00" },
    { id: "bl_2", budgetId: "budget_atlas_2026", category: "gardiennage", label: "Gardiennage & sécurité", amountAnnual: "48000.00" },
    { id: "bl_3", budgetId: "budget_atlas_2026", category: "ascenseur", label: "Maintenance ascenseurs", amountAnnual: "24000.00" },
    { id: "bl_4", budgetId: "budget_agdal_2026", category: "entretien", label: "Nettoyage & espaces verts", amountAnnual: "30000.00" },
    { id: "bl_5", budgetId: "budget_agdal_2026", category: "gardiennage", label: "Gardiennage", amountAnnual: "42000.00" },
  ]);

  await db.insert(appelsDeFondsTable).values([
    { id: "adf_1", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a101", ownerId: "member_1", period: "2026-07", type: "charges_courantes", amount: "450.00", dueDate: "2026-07-10", status: "paid", paymentMethod: "virement", paidDate: "2026-07-05", receiptNumber: "REC-2026-0701", createdAt: daysAgo(30) },
    { id: "adf_2", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a102", ownerId: "member_2", period: "2026-07", type: "charges_courantes", amount: "450.00", dueDate: "2026-07-10", status: "pending_validation", paymentMethod: "cheque", proofUrl: "/uploads/proofs/adf_2.jpg", createdAt: daysAgo(10) },
    { id: "adf_3", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a205", ownerId: "member_3", period: "2026-06", type: "charges_courantes", amount: "450.00", dueDate: "2026-06-10", status: "overdue", createdAt: daysAgo(60) },
    { id: "adf_4", buildingId: "building_atlas_a", budgetId: "budget_atlas_2026", lotId: "lot_a301", ownerId: "member_1", period: "2026-07", type: "fonds_travaux", amount: "800.00", dueDate: "2026-07-15", status: "pending", createdAt: daysAgo(5) },
    { id: "adf_5", buildingId: "building_agdal_1", budgetId: "budget_agdal_2026", lotId: "lot_ag12", ownerId: "member_4", period: "2026-07", type: "charges_courantes", amount: "600.00", dueDate: "2026-07-10", status: "paid", paymentMethod: "virement", paidDate: "2026-07-02", receiptNumber: "REC-2026-0812", createdAt: daysAgo(28) },
  ]);

  // ─── Finance: transactions, salaries, caisse, invoices, bons ────────────
  await db.insert(transactionsTable).values([
    { id: "tx_1", type: "revenue", amount: "450.00", label: "Cotisation juillet — Lot A101", date: "2026-07-05", status: "paid", memberId: "member_1", syndicateId: synResidences.id, createdAt: daysAgo(30) },
    { id: "tx_2", type: "expense", amount: "8000.00", label: "Maintenance ascenseur — juillet", date: "2026-07-03", status: "paid", syndicateId: synResidences.id, createdAt: daysAgo(32) },
    { id: "tx_3", type: "expense", amount: "12000.00", label: "Salaire gardien — juillet", date: "2026-07-01", status: "paid", syndicateId: synResidences.id, createdAt: daysAgo(35) },
    { id: "tx_4", type: "revenue", amount: "600.00", label: "Cotisation juillet — Lot Ag-12", date: "2026-07-02", status: "paid", memberId: "member_4", syndicateId: synJardins.id, createdAt: daysAgo(28) },
  ]);

  await db.insert(salaryRecordsTable).values([
    { id: "salary_1", employee: "Abdelali Mansouri", role: "Gardien", amount: "3500.00", month: "2026-07", status: "paid", paidDate: "2026-07-01", syndicateId: synResidences.id, createdAt: daysAgo(35) },
    { id: "salary_2", employee: "Fatiha Znati", role: "Femme de ménage", amount: "2800.00", month: "2026-07", status: "paid", paidDate: "2026-07-01", syndicateId: synResidences.id, createdAt: daysAgo(35) },
    { id: "salary_3", employee: "Said Bouhaddi", role: "Gardien", amount: "3200.00", month: "2026-07", status: "pending", syndicateId: synJardins.id, createdAt: daysAgo(5) },
  ]);

  await db.insert(caisseEntriesTable).values([
    { id: "caisse_1", label: "Solde initial", amount: "50000.00", type: "credit", date: "2026-01-01", category: "ouverture", syndicateId: synResidences.id, balance: "50000.00", createdAt: daysAgo(190) },
    { id: "caisse_2", label: "Cotisations juillet", amount: "450.00", type: "credit", date: "2026-07-05", category: "cotisations", syndicateId: synResidences.id, balance: "50450.00", createdAt: daysAgo(30) },
    { id: "caisse_3", label: "Maintenance ascenseur", amount: "8000.00", type: "debit", date: "2026-07-03", category: "entretien", syndicateId: synResidences.id, balance: "42450.00", createdAt: daysAgo(32) },
  ]);

  await db.insert(invoicesTable).values([
    { id: "inv_1", reference: "FAC-2026-001", type: "facture", recipient: "Résidence Atlas", date: "2026-07-01", dueDate: "2026-07-31", status: "sent", amount: "8000.00", syndicateId: synResidences.id, createdAt: daysAgo(35) },
    { id: "inv_2", reference: "FAC-2026-002", type: "facture", recipient: "Les Jardins d'Agdal", date: "2026-07-05", dueDate: "2026-08-05", status: "draft", amount: "4200.00", syndicateId: synJardins.id, createdAt: daysAgo(10) },
  ]);
  await db.insert(invoiceItemsTable).values([
    { id: "invitem_1", invoiceId: "inv_1", label: "Maintenance ascenseur (juillet)", quantity: "1", unitPrice: "8000.00" },
    { id: "invitem_2", invoiceId: "inv_2", label: "Entretien espaces verts", quantity: "1", unitPrice: "4200.00" },
  ]);

  await db.insert(bonsLivraisonTable).values([
    { id: "bon_1", reference: "BL-2026-001", recipient: "Résidence Atlas", date: "2026-07-02", type: "entree", total: "1200.00", status: "validated", syndicateId: synResidences.id, createdAt: daysAgo(33) },
  ]);
  await db.insert(bonItemsTable).values([
    { id: "bonitem_1", bonId: "bon_1", label: "Ampoules LED (lot de 20)", quantity: "20", unitPrice: "60.00" },
  ]);

  // ─── Prestataires, Contrats, Travaux, Sinistres ─────────────────────────
  await db.insert(prestatairesTable).values([
    { id: "prest_1", name: "Ascenseurs Maroc SARL", type: "ascenseur", contactName: "Ali Nasri", phone: "+212522111111", email: "contact@ascenseursmaroc.ma", ice: "001234567000045", buildingId: "building_atlas_a", syndicateId: synResidences.id, status: "active", rating: "4.50", createdAt: daysAgo(1000) },
    { id: "prest_2", name: "GreenClean Services", type: "nettoyage", contactName: "Samira Kabbaj", phone: "+212537222222", email: "contact@greenclean.ma", ice: "001234567000099", buildingId: "building_agdal_1", syndicateId: synJardins.id, status: "active", rating: "4.20", createdAt: daysAgo(600) },
  ]);
  await db.insert(contratsPrestatairesTable).values([
    { id: "contrat_1", prestataireId: "prest_1", buildingId: "building_atlas_a", title: "Maintenance ascenseurs 2026", startDate: "2026-01-01", endDate: "2026-12-31", monthlyAmount: "8000.00", annualAmount: "96000.00", status: "active", autoRenew: true, createdAt: daysAgo(190) },
  ]);
  await db.insert(travauxTable).values([
    { id: "travaux_1", title: "Réparation fuite toiture", description: "Infiltration d'eau détectée au dernier étage", type: "reparation", priority: "high", status: "in_progress", buildingId: "building_atlas_a", lotId: "lot_a301", prestataireId: "prest_1", reportedById: uMember1.id, reportedByName: uMember1.name, estimatedAmount: "5000.00", startDate: "2026-07-01", createdAt: daysAgo(7) },
    { id: "travaux_2", title: "Peinture cage d'escalier", description: "Rafraîchissement peinture bâtiment A", type: "entretien", priority: "normal", status: "reported", buildingId: "building_atlas_a", reportedById: uAdminAtlas.id, reportedByName: uAdminAtlas.name, estimatedAmount: "12000.00", createdAt: daysAgo(3) },
  ]);
  await db.insert(sinistresTable).values([
    { id: "sinistre_1", buildingId: "building_atlas_a", lotId: "lot_a205", type: "degat_eaux", description: "Dégât des eaux suite à une fuite de canalisation", date: "2026-06-20", estimatedAmount: "15000.00", claimNumber: "SIN-2026-0045", status: "in_progress", urgency: "high", reportedById: uMember2.id, reportedByName: uMember2.name, createdAt: daysAgo(18) },
    { id: "sinistre_2", buildingId: "building_agdal_1", lotId: "lot_ag01", type: "incendie", description: "Départ de feu maîtrisé au tableau électrique", date: "2026-07-01", estimatedAmount: "8000.00", claimNumber: "SIN-2026-0052", status: "declared", urgency: "critical", reportedById: uTenant2.id, reportedByName: uTenant2.name, createdAt: daysAgo(7) },
  ]);

  // ─── Elections, Candidates, Votes ────────────────────────────────────────
  await db.insert(electionsTable).values([
    { id: "election_1", syndicateId: synResidences.id, title: "Élection du conseil syndical 2026", description: "Renouvellement du conseil syndical pour le mandat 2026-2028", status: "active", startDate: "2026-07-01", endDate: "2026-07-31", createdBy: uAdminAtlas.id, createdAt: daysAgo(7) },
  ]);
  const candidates = await db
    .insert(candidatesTable)
    .values([
      { id: "cand_1", electionId: "election_1", name: "Mohammed Alaoui", post: "Président du conseil syndical", bio: "Membre depuis 2021, ingénieur", votes: 1 },
      { id: "cand_2", electionId: "election_1", name: "Khadija Tahiri", post: "Trésorière", bio: "Membre depuis 2021, médecin", votes: 0 },
    ])
    .returning();
  await db.insert(votesTable).values([
    { id: "vote_1", electionId: "election_1", voterId: uMember1.id, candidateId: candidates[0].id, createdAt: daysAgo(2) },
  ]);

  // ─── Meetings, Attendees, AG Resolutions ────────────────────────────────
  await db.insert(meetingsTable).values([
    { id: "meeting_1", syndicateId: synResidences.id, title: "Assemblée Générale Ordinaire 2026", date: "2026-07-20", time: "10:00", location: "Salle commune, Résidence Atlas", type: "general", description: "Bilan financier annuel et vote du budget 2027", agenda: "1. Bilan 2026\n2. Vote budget 2027\n3. Élection conseil syndical", status: "scheduled", createdBy: uAdminAtlas.id, createdAt: daysAgo(20) },
  ]);
  await db.insert(meetingAttendeesTable).values([
    { id: "attendee_1", meetingId: "meeting_1", userId: uMember1.id },
    { id: "attendee_2", meetingId: "meeting_1", userId: uMember2.id },
  ]);
  await db.insert(agResolutionsTable).values([
    { id: "resolution_1", meetingId: "meeting_1", buildingId: "building_atlas_a", number: 1, title: "Approbation du budget 2027", description: "Vote pour l'approbation du budget prévisionnel 2027", requiredMajority: "simple", tantiemesFor: 220, tantiemesAgainst: 30, tantiemesAbstain: 10, result: "pending" },
  ]);

  // ─── Union Actions (legacy) ──────────────────────────────────────────────
  await db.insert(unionActionsTable).values([
    { id: "action_1", title: "Campagne d'entretien des espaces verts", description: "Mobilisation des résidents pour l'entretien collectif", type: "campagne", status: "planned", date: "2026-08-01", location: "Résidence Atlas", organizer: uAdminAtlas.name, participantsTarget: 20, syndicateId: synResidences.id, createdBy: uAdminAtlas.id, createdAt: daysAgo(5) },
  ]);
  await db.insert(actionSupportsTable).values([{ id: "support_1", actionId: "action_1", userId: uMember1.id }]);
  await db.insert(actionParticipantsTable).values([{ id: "participant_1", actionId: "action_1", userId: uMember1.id, userName: uMember1.name }]);

  // ─── Publications, Announcements, Documents ─────────────────────────────
  const publications = await db
    .insert(publicationsTable)
    .values([
      { id: "pub_1", title: "Travaux de peinture — Planning", content: "Les travaux de peinture de la cage d'escalier débuteront le 15 juillet.", category: "travaux", syndicateId: synResidences.id, authorId: uAdminAtlas.id, authorName: uAdminAtlas.name, likes: 1, comments: 1, createdAt: daysAgo(4) },
    ])
    .returning();
  await db.insert(publicationLikesTable).values([{ publicationId: publications[0].id, userId: uMember1.id }]);
  await db.insert(publicationCommentsTable).values([{ id: "pubcomment_1", publicationId: publications[0].id, authorId: uMember2.id, authorName: uMember2.name, text: "Merci pour l'info, quel prestataire ?" }]);

  await db.insert(announcementsTable).values([
    { id: "announcement_1", title: "Coupure d'eau programmée", body: "Une coupure d'eau est prévue le 12 juillet de 9h à 13h pour maintenance.", priority: "high", audience: "all", pinned: true, syndicateId: synResidences.id, authorId: uAdminAtlas.id, author: uAdminAtlas.name, createdAt: daysAgo(2) },
  ]);

  await db.insert(documentsTable).values([
    { id: "doc_1", title: "Règlement de copropriété", category: "légal", content: "Texte du règlement de copropriété...", status: "published", syndicateId: synResidences.id, size: "1.2 MB", createdBy: uAdminAtlas.id, createdAt: daysAgo(1400) },
    { id: "doc_2", title: "PV Assemblée Générale 2025", category: "compte-rendu", status: "published", syndicateId: synResidences.id, size: "340 KB", createdBy: uAdminAtlas.id, createdAt: daysAgo(300) },
  ]);

  // ─── Chat: conversations, messages, reads ───────────────────────────────
  const conversations = await db
    .insert(conversationsTable)
    .values([
      { id: "conv_general_atlas", syndicateId: synResidences.id, buildingId: "building_atlas_a", convType: "building", isGroup: true, name: "Résidence Atlas — Discussion générale", createdAt: daysAgo(300) },
      { id: "conv_direct_1", syndicateId: synResidences.id, convType: "direct", participant1Id: uAdminAtlas.id, participant2Id: uMember1.id, createdAt: daysAgo(60) },
    ])
    .returning();
  await db.insert(messagesTable).values([
    { id: "message_1", conversationId: conversations[0].id, senderId: uAdminAtlas.id, senderName: uAdminAtlas.name, text: "Bonjour à tous, rappel de l'AG du 20 juillet.", createdAt: daysAgo(2) },
    { id: "message_2", conversationId: conversations[0].id, senderId: uMember1.id, senderName: uMember1.name, text: "Bien reçu, merci !", createdAt: daysAgo(2) },
    { id: "message_3", conversationId: conversations[1].id, senderId: uMember1.id, senderName: uMember1.name, text: "Bonjour, pouvez-vous valider mon paiement de charges ?", createdAt: daysAgo(10) },
  ]);
  await db.insert(messageReadsTable).values([
    { id: "read_1", conversationId: conversations[0].id, userId: uMember1.id },
  ]);

  // ─── P1: Marketplace ─────────────────────────────────────────────────────
  const products = await db
    .insert(productsTable)
    .values([
      { id: "product_1", name: "Table de jardin en teck", description: "Table 6 places, très bon état", price: "1200.00", category: "mobilier", condition: "bon", location: "Résidence Atlas", stock: 1, syndicateId: synResidences.id, sellerId: uMember1.id, sellerName: uMember1.name, status: "approved", featured: true, viewCount: 34, createdAt: daysAgo(15) },
      { id: "product_2", name: "Vélo enfant 20 pouces", description: "Peu servi, comme neuf", price: "450.00", category: "loisirs", condition: "neuf", location: "Résidence Atlas", stock: 1, syndicateId: synResidences.id, sellerId: uMember2.id, sellerName: uMember2.name, status: "pending_review", createdAt: daysAgo(2) },
      { id: "product_3", name: "Machine à café Nespresso", description: "Fonctionne parfaitement", price: "600.00", category: "électroménager", condition: "bon", location: "Les Jardins d'Agdal", stock: 1, syndicateId: synJardins.id, sellerId: uMember3.id, sellerName: uMember3.name, status: "approved", createdAt: daysAgo(8) },
    ])
    .returning();
  await db.insert(cartItemsTable).values([
    { id: "cartitem_1", userId: uTenant1.id, productId: products[0].id, productName: products[0].name, price: products[0].price, sellerName: products[0].sellerName!, quantity: 1 },
  ]);
  const orders = await db
    .insert(ordersTable)
    .values([
      { id: "order_1", productId: products[2].id, productName: products[2].name, buyerId: uMember1.id, buyerName: uMember1.name, sellerId: uMember3.id, sellerName: uMember3.name, amount: products[2].price, status: "delivered", type: "purchase", date: "2026-06-25", createdAt: daysAgo(13) },
    ])
    .returning();
  await db.insert(reviewsTable).values([
    { id: "review_1", productId: products[2].id, productName: products[2].name, orderId: orders[0].id, rating: 5, comment: "Vendeur sérieux, article conforme.", reviewerId: uMember1.id, reviewerName: uMember1.name, date: "2026-06-26" },
  ]);
  await db.insert(productFavoritesTable).values([{ id: "fav_1", productId: products[0].id, userId: uTenant1.id }]);
  await db.insert(productReportsTable).values([{ id: "report_1", productId: products[1].id, reporterId: uMember1.id, reporterName: uMember1.name, reason: "mauvaise_info", details: "Prix incohérent avec la description", status: "pending" }]);
  await db.insert(productCommentsTable).values([{ id: "prodcomment_1", productId: products[0].id, userId: uTenant1.id, userName: uTenant1.name, userRole: "tenant", content: "Toujours disponible ?" }]);
  await db.insert(marketplacePromotionsTable).values([
    { id: "promo_1", productId: products[0].id, sellerId: uMember1.id, type: "featured", startDate: daysAgo(15), endDate: daysAgo(-15), amount: "50.00", status: "active", approvedBy: uAdminAtlas.id },
  ]);

  // ─── Legal alerts, Support tickets ───────────────────────────────────────
  await db.insert(legalAlertsTable).values([
    { id: "legal_1", title: "Mise à jour Loi 18-00 sur la copropriété", description: "Nouvelles obligations de tenue des AG annuelles", level: "info", category: "réglementation", date: "2026-06-01", status: "open", syndicateId: synResidences.id, createdAt: daysAgo(37) },
  ]);
  const tickets = await db
    .insert(supportTicketsTable)
    .values([
      { id: "ticket_1", title: "Problème d'accès à l'application", description: "Impossible de me connecter depuis hier", priority: "high", category: "technique", status: "open", syndicateId: synResidences.id, submittedById: uMember2.id, submittedByName: uMember2.name, createdAt: daysAgo(1) },
    ])
    .returning();
  await db.insert(ticketRepliesTable).values([
    { id: "reply_1", ticketId: tickets[0].id, authorId: uSuperAdmin.id, authorName: uSuperAdmin.name, text: "Bonjour, pouvez-vous préciser le message d'erreur ?" },
  ]);

  // ─── Cotisations, Payment proofs ────────────────────────────────────────
  await db.insert(cotisationsTable).values([
    { id: "cotisation_1", memberId: "member_1", label: "Cotisation juillet 2026", period: "2026-07", amount: "450.00", dueDate: "2026-07-10", status: "paid", syndicateId: synResidences.id, paidDate: "2026-07-05", receipt: "REC-2026-0701", createdAt: daysAgo(30) },
    { id: "cotisation_2", memberId: "member_3", label: "Cotisation juin 2026", period: "2026-06", amount: "450.00", dueDate: "2026-06-10", status: "overdue", syndicateId: synResidences.id, createdAt: daysAgo(60) },
  ]);
  await db.insert(paymentProofsTable).values([
    { id: "proof_1", cotisationId: "cotisation_1", userId: uMember1.id, fileUrl: "/uploads/proofs/proof_1.jpg", proofUrl: "/uploads/proofs/proof_1.jpg", amount: "450.00", status: "approved", uploadedById: uMember1.id, reviewedById: uAdminAtlas.id, reviewedAt: daysAgo(28) },
  ]);

  // ─── Alerts, preferences, partners, payslips ────────────────────────────
  const alerts = await db
    .insert(alertsTable)
    .values([
      { id: "alert_1", title: "Solde de trésorerie faible", message: "Le solde de la caisse est descendu sous le seuil d'alerte (10 000 MAD).", type: "warning", date: "2026-07-06", target: "admin", syndicateId: synResidences.id, createdAt: daysAgo(2) },
    ])
    .returning();
  await db.insert(alertReadsTable).values([{ alertId: alerts[0].id, userId: uAdminAtlas.id }]);
  await db.insert(notificationPreferencesTable).values([
    { id: "pref_1", userId: uMember1.id, push: true, email: true, inApp: true },
    { id: "pref_2", userId: uTenant1.id, push: true, email: false, inApp: true },
  ]);
  await db.insert(partnersTable).values([
    { id: "partner_1", name: "Clinique Al Amal", type: "santé", sector: "médical", contact: "Dr. Fadili", phone: "+212522333333", benefit: "Réduction consultations", discount: "15%", syndicateId: synResidences.id, createdAt: daysAgo(200) },
  ]);
  await db.insert(payslipsTable).values([
    { id: "payslip_1", userId: uAdminAtlas.id, month: "2026-06", amount: "3500.00", fileUrl: "/uploads/payslips/payslip_1.pdf", syndicateId: synResidences.id, createdAt: daysAgo(38) },
  ]);

  // ─── P9: Subscriptions ───────────────────────────────────────────────────
  const plans = await db
    .insert(subscriptionPlansTable)
    .values([
      { id: "plan_basic", name: "Basique", price: "299.00", interval: "monthly", features: JSON.stringify(["Gestion des charges", "1 bâtiment", "Support email"]) },
      { id: "plan_pro", name: "Pro", price: "699.00", interval: "monthly", features: JSON.stringify(["Multi-bâtiments", "Marketplace", "Support prioritaire", "Transparence financière"]) },
    ])
    .returning();
  await db.insert(syndicateSubscriptionsTable).values([
    { id: "sub_1", syndicateId: synResidences.id, planId: plans[1].id, status: "active", autoRenew: true, createdAt: daysAgo(190) },
    { id: "sub_2", syndicateId: synJardins.id, planId: plans[0].id, status: "active", autoRenew: true, createdAt: daysAgo(170) },
  ]);

  // ─── Audit logs ──────────────────────────────────────────────────────────
  await db.insert(auditLogsTable).values([
    { id: "audit_1", userId: uAdminAtlas.id, userName: uAdminAtlas.name, syndicateId: synResidences.id, action: "validate_payment", entity: "appels_de_fonds", entityId: "adf_1", details: "Validation du paiement charges juillet", createdAt: daysAgo(28) },
    { id: "audit_2", userId: uSuperAdmin.id, userName: uSuperAdmin.name, action: "approve_product", entity: "products", entityId: products[0].id, details: "Approbation annonce marketplace", createdAt: daysAgo(14) },
  ]);

  // ─── P6: Ideas & Voting ──────────────────────────────────────────────────
  const ideas = await db
    .insert(ideasTable)
    .values([
      { id: "idea_1", syndicateId: synResidences.id, userId: uMember1.id, userName: uMember1.name, title: "Installer des bornes de recharge électrique", description: "Ajouter 2 bornes de recharge pour véhicules électriques au parking", category: "infrastructure", status: "under_review", voteCount: 2, voteDeadline: "2026-08-01", createdAt: daysAgo(20) },
      { id: "idea_2", syndicateId: synResidences.id, userId: uMember2.id, userName: uMember2.name, title: "Tri sélectif des déchets", description: "Mettre en place des poubelles de tri sélectif dans chaque étage", category: "environment", status: "approved", voteCount: 3, adminNote: "Approuvé, mise en œuvre prévue en septembre", createdAt: daysAgo(45) },
    ])
    .returning();
  await db.insert(ideaVotesTable).values([
    { id: "ideavote_1", ideaId: ideas[0].id, userId: uMember1.id },
    { id: "ideavote_2", ideaId: ideas[0].id, userId: uMember2.id },
  ]);

  // ─── P7: Debt Escalation ─────────────────────────────────────────────────
  await db.insert(debtEscalationsTable).values([
    { id: "escalation_1", syndicateId: synResidences.id, memberId: "member_3", memberName: "Hassan Cherkaoui", totalOverdue: "2700.00", overdueMonths: 6, level: "serious", status: "meeting_scheduled", alertSentAt: daysAgo(10), meetingId: "meeting_1", createdAt: daysAgo(15) },
  ]);

  // ─── P10: Financial Transparency ─────────────────────────────────────────
  const justifications = await db
    .insert(expenseJustificationsTable)
    .values([
      { id: "justification_1", syndicateId: synResidences.id, transactionId: "tx_2", title: "Maintenance ascenseur — juillet 2026", description: "Intervention trimestrielle contractuelle sur les 2 ascenseurs", amount: "8000.00", category: "entretien", receiptUrl: "/uploads/receipts/justification_1.pdf", status: "approved", submittedBy: uAdminAtlas.id, submitterName: uAdminAtlas.name, voteCount: 2, votesFor: 2, votesAgainst: 0, createdAt: daysAgo(32) },
    ])
    .returning();
  await db.insert(expenseVotesTable).values([
    { id: "expensevote_1", justificationId: justifications[0].id, userId: uMember1.id, vote: "for" },
    { id: "expensevote_2", justificationId: justifications[0].id, userId: uMember2.id, vote: "for" },
  ]);

  // ─── P12: National Ranking ───────────────────────────────────────────────
  await db.insert(nationalRankingsTable).values([
    { id: "ranking_1", syndicateId: synResidences.id, month: 6, year: 2026, collectionRate: "92.00", incidentResolutionRate: "85.00", documentationScore: "90.00", meetingComplianceScore: "100.00", memberSatisfaction: "88.00", totalScore: "91.00", rank: 3, regionRank: 1, region: "Casablanca-Settat", createdAt: daysAgo(20) },
    { id: "ranking_2", syndicateId: synJardins.id, month: 6, year: 2026, collectionRate: "97.00", incidentResolutionRate: "90.00", documentationScore: "80.00", meetingComplianceScore: "100.00", memberSatisfaction: "93.00", totalScore: "93.00", rank: 1, regionRank: 1, region: "Rabat-Salé-Kénitra", createdAt: daysAgo(20) },
  ]);

  // ─── Auth: refresh tokens, password reset tokens ────────────────────────
  await db.insert(refreshTokensTable).values([
    { id: "refresh_1", userId: uAdminAtlas.id, token: "seed-refresh-token-admin-atlas", expiresAt: daysAgo(-30) },
    { id: "refresh_2", userId: uMember1.id, token: "seed-refresh-token-member-1", expiresAt: daysAgo(-30) },
  ]);
  await db.insert(passwordResetTokensTable).values([
    { id: "reset_1", userId: uTenant1.id, token: "seed-reset-token-tenant-1", expiresAt: daysAgo(-1), usedAt: null },
  ]);

  console.log("✅ Seed complete.");
  console.log("");
  console.log("Test accounts (password: password123):");
  console.log("  super_admin      superadmin@syndycat.ma");
  console.log("  syndicate_admin  syndic@andalous.ma (Résidence Atlas)");
  console.log("  syndicate_admin  syndic@jardins-agdal.ma (Les Jardins d'Agdal)");
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
