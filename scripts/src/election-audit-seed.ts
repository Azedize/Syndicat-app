// Seeds a realistic Moroccan condominium test environment for the Election
// module production audit ("Residence Al Andalous", Casablanca).
//
// Usage: pnpm --filter @workspace/scripts run election-audit:seed
//
// NOT idempotent by design for this audit run — deletes any prior run's data
// (matched by fixed syndicate abbreviation) before re-seeding, so it can be
// safely re-run while iterating on the audit.

import bcrypt from "bcryptjs";
import { db, pool } from "@workspace/db";
import {
  syndicatesTable,
  usersTable,
  membersTable,
  buildingsTable,
  lotsTable,
  tenantsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const PASSWORD_HASH = await bcrypt.hash("password123", 10);

const OWNER_NAMES = [
  "Ahmed Benali", "Sara Tazi", "Karim El Mansouri", "Fatima Zahra Idrissi", "Youssef Bennani",
  "Khadija Ouazzani", "Omar Fassi", "Nadia Chraibi", "Hamza Berrada", "Leila Alami",
  "Mehdi Sekkat", "Amina Kettani", "Rachid Lahlou", "Zineb Tahiri", "Adil Cherkaoui",
  "Souad Belghiti", "Yassine Benjelloun", "Malika Squalli", "Nabil Guessous", "Youssef Alaoui",
];

// 2 towers (A, B), 10 apartments each — 20 total, matching the spec's A101..A110 / B201..B210 pattern.
function apartmentFor(i: number): string {
  if (i < 10) return `A${101 + i}`;
  return `B${201 + (i - 10)}`;
}

const TENANT_NAMES = ["Rania Sabri", "Anas Idrissi", "Salma Benaissa", "Othmane Rifai", "Ikram Toumi"];

async function run() {
  console.log("── Election Audit Seed: Résidence Al Andalous ──");

  // Clean previous run of this exact test syndicate (idempotent-ish re-run support)
  const [existing] = await db.select().from(syndicatesTable).where(eq(syndicatesTable.abbreviation, "RAA-AUDIT"));
  if (existing) {
    console.log(`Removing previous run (syndicate ${existing.id})…`);
    const oldUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.syndicateId, existing.id));
    // Cascade deletes (FK onDelete cascade) handle members/tenants/lots/buildings/elections/etc.
    for (const u of oldUsers) await db.delete(usersTable).where(eq(usersTable.id, u.id));
    await db.delete(syndicatesTable).where(eq(syndicatesTable.id, existing.id));
  }

  const [syndicate] = await db
    .insert(syndicatesTable)
    .values({
      name: "Résidence Al Andalous",
      abbreviation: "RAA-AUDIT",
      sector: "résidentiel",
      region: "Casablanca-Settat",
      city: "Casablanca",
      country: "Maroc",
      legalForm: "Syndicat de copropriétaires",
      status: "active",
      membersCount: OWNER_NAMES.length,
    } as any)
    .returning();
  console.log(`Syndicate: ${syndicate.id}`);

  // ── Syndicate Admin ──
  const [adminUser] = await db
    .insert(usersTable)
    .values({
      name: "Nawal Idrissi (Admin Syndic)",
      email: "admin@alandalous-audit.ma",
      passwordHash: PASSWORD_HASH,
      role: "syndicate_admin",
      status: "active",
      syndicateId: syndicate.id,
    } as any)
    .returning();
  await db.update(syndicatesTable).set({ adminId: adminUser.id }).where(eq(syndicatesTable.id, syndicate.id));
  console.log(`Admin: ${adminUser.email} / password123`);

  // ── Building ──
  const [building] = await db
    .insert(buildingsTable)
    .values({
      name: "Résidence Al Andalous",
      address: "12 Boulevard Ibn Tachfine, Casablanca",
      city: "Casablanca",
      type: "residential",
      totalFloors: 5,
      totalLots: OWNER_NAMES.length,
      constructionYear: 2015,
      syndicateId: syndicate.id,
      adminId: adminUser.id,
      status: "active",
    } as any)
    .returning();
  console.log(`Building: ${building.id}`);

  // ── 20 Owners (members + user accounts) + their lots ──
  const owners: { memberId: string; userId: string; name: string; email: string; apartment: string }[] = [];
  for (let i = 0; i < OWNER_NAMES.length; i++) {
    const name = OWNER_NAMES[i];
    const slug = name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    const email = `${slug}@alandalous-audit.ma`;
    const apartment = apartmentFor(i);

    const [member] = await db
      .insert(membersTable)
      .values({
        name,
        email,
        phone: `06${String(10000000 + i * 137).slice(0, 8)}`,
        syndicateId: syndicate.id,
        status: "active",
        cotisationStatus: "paid",
        joinDate: "2015-06-01",
      } as any)
      .returning();

    const [user] = await db
      .insert(usersTable)
      .values({ name, email, passwordHash: PASSWORD_HASH, role: "member", status: "active", syndicateId: syndicate.id } as any)
      .returning();

    const [lot] = await db
      .insert(lotsTable)
      .values({
        number: apartment,
        type: "appartement",
        floor: i < 10 ? Math.floor(i / 2) + 1 : Math.floor((i - 10) / 2) + 1,
        surfaceM2: "85",
        tantiemes: 50,
        buildingId: building.id,
        ownerId: member.id,
        status: "occupied",
      } as any)
      .returning();

    owners.push({ memberId: member.id, userId: user.id, name, email, apartment: lot.number });
  }
  console.log(`Owners seeded: ${owners.length} (members + user accounts + lots)`);

  // ── 5 Tenants renting 5 of the owners' apartments (last 5 lots) ──
  const lotsForTenants = await db.select().from(lotsTable).where(eq(lotsTable.buildingId, building.id));
  const tenantLots = lotsForTenants.slice(0, TENANT_NAMES.length);
  const tenants: { userId: string; name: string; email: string }[] = [];
  for (let i = 0; i < TENANT_NAMES.length; i++) {
    const name = TENANT_NAMES[i];
    const slug = name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    const email = `${slug}@tenant-audit.ma`;

    await db.insert(tenantsTable).values({
      name,
      email,
      phone: `07${String(20000000 + i * 211).slice(0, 8)}`,
      lotId: tenantLots[i].id,
      buildingId: building.id,
      syndicateId: syndicate.id,
      leaseStart: "2024-01-01",
      leaseEnd: "2027-01-01",
      monthlyRent: "4500",
      depositAmount: "9000",
      status: "active",
    } as any);

    const [user] = await db
      .insert(usersTable)
      .values({ name, email, passwordHash: PASSWORD_HASH, role: "tenant", status: "active", syndicateId: syndicate.id } as any)
      .returning();
    tenants.push({ userId: user.id, name, email });
  }
  console.log(`Tenants seeded: ${tenants.length} (tenant records + user accounts)`);

  // ── Second syndicate + admin + member, for cross-syndicate isolation testing (Scenario 8) ──
  const [existingOther] = await db.select().from(syndicatesTable).where(eq(syndicatesTable.abbreviation, "OTHER-AUDIT"));
  if (existingOther) {
    const oldUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.syndicateId, existingOther.id));
    for (const u of oldUsers) await db.delete(usersTable).where(eq(usersTable.id, u.id));
    await db.delete(syndicatesTable).where(eq(syndicatesTable.id, existingOther.id));
  }
  const [otherSyndicate] = await db
    .insert(syndicatesTable)
    .values({ name: "Résidence Zaytoune (Autre Syndicat)", abbreviation: "OTHER-AUDIT", city: "Rabat", country: "Maroc", status: "active" } as any)
    .returning();
  const [otherAdmin] = await db
    .insert(usersTable)
    .values({ name: "Autre Admin", email: "admin@zaytoune-audit.ma", passwordHash: PASSWORD_HASH, role: "syndicate_admin", status: "active", syndicateId: otherSyndicate.id } as any)
    .returning();
  const [otherMemberUser] = await db
    .insert(usersTable)
    .values({ name: "Intrus Externe", email: "intrus@zaytoune-audit.ma", passwordHash: PASSWORD_HASH, role: "member", status: "active", syndicateId: otherSyndicate.id } as any)
    .returning();
  await db.insert(membersTable).values({ name: "Intrus Externe", email: "intrus@zaytoune-audit.ma", syndicateId: otherSyndicate.id, status: "active", cotisationStatus: "paid" } as any);
  console.log(`Second syndicate (cross-tenant test): ${otherSyndicate.id}, admin=${otherAdmin.email}, member=${otherMemberUser.email}`);

  console.log("\n=== SEED SUMMARY (write down for the test run) ===");
  console.log(JSON.stringify({
    syndicateId: syndicate.id,
    buildingId: building.id,
    admin: { email: adminUser.email, password: "password123" },
    owners: owners.map((o) => ({ name: o.name, email: o.email, apartment: o.apartment })),
    tenants: tenants.map((t) => ({ name: t.name, email: t.email })),
    otherSyndicate: { id: otherSyndicate.id, adminEmail: otherAdmin.email, memberEmail: otherMemberUser.email },
  }, null, 2));

  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
