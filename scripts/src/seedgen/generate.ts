/**
 * Business data generator. Each condominium (syndicate) is generated as a
 * self-contained, consistent tenant:
 *
 *   phase 1  structure and activity (one transaction): users, buildings,
 *            lots, owners (current + past), tenants, council, treasury
 *            accounts, budgets, suppliers, contracts, works, expenses,
 *            documents (real files), claims, governance, communication,
 *            marketplace, parking, notifications, audit trail
 *   phase 2  calls for funds issued by the PROJECT'S allocation engine
 *            (loadSources → computeAllocation → finalizeAllocation), as the
 *            generate-appels route does
 *   phase 3  payments, journal entries, receipts, reminders, adjustments and
 *            a bank statement reconciliation (one transaction), following the
 *            validation route's rules (validated payments only count; a
 *            declared payment stays pending; receipts per validated payment)
 *
 * Traceability: syndicates carry `creation_key = <runKey>:<n>`, the syndic
 * companies `created_by = <runKey>`, users the reserved e-mail domain
 * `seedgen.mizan.test`. Cleanup only removes what hangs from these.
 */
import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
import { Batch, flush, insertRows, type Row, type Tx } from "./db.js";
import * as D from "./data.js";
import { makePng, renderPdf, writeUpload, type PdfSpec, type StoredFile } from "./files.js";
import { libraryDocument, supplierInvoice } from "./pdfdocs.js";
import { documentsPhase } from "./documents.js";
import { addDays, Rng, ymd } from "./rng.js";
import { TEST_EMAIL_ROOT } from "../test-domain.js";

/** Reserved test domain (TEST_EMAIL_ROOT); each run uses its own sub-domain (s<seed>.<root>). */
export const EMAIL_ROOT = TEST_EMAIL_ROOT; // configured in ../test-domain.ts
export const runDomain = (seed: number) => `s${seed}.${EMAIL_ROOT}`;
export const TEST_PASSWORD = "MizanTest#2026";

export interface GenOptions {
  seed: number;
  scale: number;
  /** Number of syndic companies (default: 12 × scale, at least 3). */
  companies?: number;
  runKey: string;
  order: string[];
  now: Date;
  log: (msg: string) => void;
}

type Role = "syndicate_admin" | "president" | "treasurer" | "secretary" | "committee_member" | "member" | "tenant";
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role | "super_admin";
  syndicate_id: string | null;
  status: string;
}
interface Lot {
  id: string;
  number: string;
  buildingId: string;
  type: string;
  tantiemes: number;
  status: string;
  floor: number;
}
export interface Ctx {
  sid: string;
  name: string;
  city: (typeof D.CITIES)[number];
  district: string;
  status: string;
  admin: UserRow;
  team: UserRow[];
  owners: UserRow[];
  tenantUsers: UserRow[];
  allUsers: UserRow[];
  buildings: { id: string; name: string; address: string }[];
  lots: Lot[];
  memberByEmail: Map<string, string>;
  memberIds: string[];
  /** current owners per lot: member ids */
  lotOwners: Map<string, string[]>;
  ownerUserByMember: Map<string, UserRow>;
  bankAccountId: string;
  cashAccountId: string;
  budgets: { id: string; buildingId: string; year: number; total: number; charges: number; lines: { id: string; category: string; annual: number }[] }[];
  prestataires: { id: string; name: string; type: string }[];
  travaux: { id: string; buildingId: string; title: string; status: string; amount: number | null }[];
  meetings: { id: string; date: string; status: string; type: string }[];
  seq: Map<string, number>;
  files: string[];
}

/** Reserved numbering per (prefix, year), applied to document_sequences at the end. */
function nextNumber(c: Ctx, prefix: string, year: number, pad: number) {
  const k = `${prefix}|${year}`;
  const n = (c.seq.get(k) ?? 0) + 1;
  c.seq.set(k, n);
  return `${prefix}-${year}-${String(n).padStart(pad, "0")}`;
}

function ribFor(rng: Rng): string {
  const body = `0117800${String(rng.int(1, 999_999_999)).padStart(9, "0")}${String(rng.int(0, 999_999)).padStart(6, "0")}`.slice(0, 22);
  const key = (97n - ((BigInt(body) * 100n) % 97n)) % 97n;
  return body + String(key).padStart(2, "0");
}

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");

export class Generator {
  rng: Rng;
  counts = new Map<string, number>();
  private emailN = 0;
  private plateN = 0;
  private hashes = new Map<string, string>();
  private prefsDone = new Set<string>();
  readonly domain: string;
  constructor(private o: GenOptions) {
    this.rng = new Rng(o.seed);
    this.domain = runDomain(o.seed);
  }

  private async hash(): Promise<string> {
    // One bcrypt hash (project cost 10) of the documented test password.
    if (!this.hashes.has("pw")) this.hashes.set("pw", await bcrypt.hash(TEST_PASSWORD, 10));
    return this.hashes.get("pw")!;
  }

  private person(arabic = false) {
    const female = this.rng.chance(0.48);
    if (arabic) return `${this.rng.pick(D.FIRST_NAMES_AR)} ${this.rng.pick(D.LAST_NAMES_AR)}`;
    return `${this.rng.pick(female ? D.FIRST_NAMES_F : D.FIRST_NAMES_M)} ${this.rng.pick(D.LAST_NAMES)}`;
  }
  private email(name: string) {
    this.emailN++;
    const base = slug(name) || "resident";
    return `${base}.${this.emailN}@${this.domain}`;
  }
  private phone() {
    return `+212 6${this.rng.int(10, 99)} ${this.rng.int(10, 99)} ${this.rng.int(10, 99)} ${this.rng.int(10, 99)}`;
  }
  private past(daysMin: number, daysMax: number) {
    return addDays(this.o.now, -this.rng.int(daysMin, daysMax));
  }

  // ─── Global: syndic companies and platform administrators ────────────────
  async global(tx: Tx, plans: { id: string; name: string; price: string | null }[]) {
    const b = new Batch();
    const nCompanies = this.o.companies ?? Math.max(3, Math.round(12 * this.o.scale));
    // Beyond the 12 base names: « <base name> <city> » — distinct and reproducible.
    const base = D.SYNDIC_COMPANIES;
    const companyNames = Array.from({ length: nCompanies }, (_, i) =>
      i < base.length ? base[i] : `${base[i % base.length]} ${D.CITIES[Math.floor(i / base.length - 1) % D.CITIES.length].city}${i >= base.length * (D.CITIES.length + 1) ? ` ${i}` : ""}`,
    );
    const orgs = companyNames.map((name, i) => {
      const city = this.rng.pick(D.CITIES);
      return b.add("organizations", {
        id: this.rng.uuid(),
        name: `${name} (test ${this.o.seed})`,
        legal_name: `${name} SARL`,
        ice_number: String(this.rng.int(1e14, 9e14)),
        email: `contact.${slug(name)}@${this.domain}`,
        phone: this.phone(),
        address: `${this.rng.int(1, 120)} ${this.rng.pick(D.STREETS)}`,
        city: city.city,
        status: i === 0 && this.rng.chance(0.5) ? "suspended" : "active",
        created_by: this.o.runKey,
        created_at: this.past(400, 900),
      });
    });
    const hash = await this.hash();
    const platform: UserRow[] = [];
    for (let i = 0; i < 2; i++) {
      const name = this.person();
      platform.push(
        b.add("users", { id: this.rng.uuid(), name, email: this.email(name), password_hash: hash, role: "super_admin", status: "active", syndicate_id: null, phone: this.phone(), email_status: "undeliverable", created_at: this.past(500, 900) }) as unknown as UserRow,
      );
    }
    await flush(tx, b, this.o.order, this.counts);
    return { orgs: orgs.map((o) => o.id as string), platform, plans };
  }

  // ─── Phase 1: one condominium ─────────────────────────────────────────────
  async structure(tx: Tx, i: number, orgId: string, plans: { id: string; name: string; price: string | null }[], adminPool: UserRow[]): Promise<Ctx> {
    const r = this.rng;
    const b = new Batch();
    const city = r.weighted(D.CITIES.map((c) => [c, c.weight] as const));
    const district = r.pick(city.districts);
    const resName = `Résidence ${r.pick(D.RESIDENCE_WORDS)} ${district}`;
    const status = r.weighted([["active", 52], ["suspended", 3], ["draft", 2], ["archived", 2]] as const);
    const sid = r.uuid();
    const created = this.past(380, 1100);
    b.add("syndicates", {
      id: sid,
      name: `${resName} ${i + 1}`,
      abbreviation: resName.split(/\s+/).map((w) => w[0]).join("").slice(0, 4).toUpperCase(),
      sector: "Copropriété",
      region: city.region,
      status,
      email: `syndic.${i + 1}@${this.domain}`,
      phone: this.phone(),
      address: `${r.int(1, 220)} ${r.pick(D.STREETS)}, ${district}`,
      city: city.city,
      country: "Maroc",
      legal_form: "Syndicat des copropriétaires",
      registration_number: `RC-${r.int(10000, 99999)}`,
      bank_name: r.pick(["Banque Test A", "Banque Test B", "Banque Test C"]),
      bank_iban: ribFor(r),
      cotisation_amount: r.money(250, 1500, 50),
      cotisation_cycle: r.pick(["trimestriel", "mensuel"]),
      organization_id: orgId,
      currency: "MAD",
      default_language: r.weighted([["fr", 70], ["ar", 25], ["en", 5]] as const),
      fiscal_year_start_month: 1,
      creation_key: `${this.o.runKey}:${i}`,
      archived_at: status === "archived" ? this.past(10, 120) : null,
      status_reason: status === "suspended" ? "Abonnement impayé (données de test)" : null,
      created_at: created,
    });
    const plan = r.pick(plans);
    const subStatus = status === "active" ? r.weighted([["active", 80], ["trial", 15], ["expired", 5]] as const) : status === "suspended" ? "suspended" : status === "archived" ? "cancelled" : "trial";
    b.add("syndicate_subscriptions", {
      syndicate_id: sid,
      plan_id: plan.id,
      status: subStatus,
      auto_renew: r.chance(0.8),
      trial_start_date: created,
      trial_end_date: addDays(created, 30),
      current_period_start: addDays(this.o.now, -r.int(1, 300)),
      current_period_end: addDays(this.o.now, r.int(5, 330)),
      activated_at: subStatus === "trial" ? null : addDays(created, 30),
    });
    // SaaS billing history: monthly invoices and payments
    const months = r.int(3, 12);
    for (let m = months; m >= 1; m--) {
      const start = addDays(this.o.now, -30 * m);
      const amount = plan.price ? Number(plan.price) : 299;
      const paid = m > 1 || r.chance(0.7);
      const payId = r.uuid();
      const failed = !paid && r.chance(0.4);
      b.add("subscription_payments", {
        id: payId,
        syndicate_id: sid,
        plan_id: plan.id,
        idempotency_key: `${this.o.runKey}:${sid}:${m}`,
        amount: amount.toFixed(2),
        currency: "MAD",
        billing_interval: "monthly",
        payment_method: r.pick(["card", "bank_transfer"]),
        provider: "test-sandbox",
        status: paid ? "succeeded" : failed ? "failed" : "pending",
        failure_code: failed ? "card_declined" : null,
        processed_at: paid ? start : null,
        created_at: start,
      });
      b.add("billing_invoices", {
        syndicate_id: sid,
        amount: amount.toFixed(2),
        status: paid ? "paid" : "open",
        due_date: addDays(start, 10),
        paid_at: paid ? addDays(start, r.int(0, 9)) : null,
        description: `Abonnement ${plan.name}`,
        period_start: start,
        period_end: addDays(start, 30),
        payment_id: payId,
        invoice_number: `FAC-SAAS-${start.getUTCFullYear()}-${String(i + 1).padStart(3, "0")}${String(m).padStart(2, "0")}`,
        created_at: start,
      });
    }

    // ── Buildings and lots ──
    const nBuildings = r.weighted([[1, 25], [2, 35], [3, 25], [4, 15]] as const);
    const buildings: Ctx["buildings"] = [];
    const lots: Lot[] = [];
    for (let bi = 0; bi < nBuildings; bi++) {
      const id = r.uuid();
      const floors = r.int(3, 12);
      const name = nBuildings === 1 ? resName : `${resName} — Bâtiment ${D.BUILDING_WORDS[bi]}`;
      const address = `${r.int(1, 220)} ${r.pick(D.STREETS)}, ${district}, ${city.city}`;
      buildings.push({ id, name, address });
      const perFloor = r.int(2, 4);
      let nLots = 0;
      const lotRows: Lot[] = [];
      // ground floor: shops / offices, then apartments, then parking and cellars
      const shops = r.int(0, 3);
      for (let s = 0; s < shops; s++) lotRows.push({ id: r.uuid(), number: `C${bi + 1}${s + 1}`, buildingId: id, type: r.pick(["commerce", "bureau", "local"]), tantiemes: r.int(15, 60), status: "occupied", floor: 0 });
      for (let f = 1; f <= floors; f++) {
        for (let k = 1; k <= perFloor; k++) {
          const surface = r.int(55, 180);
          lotRows.push({
            id: r.uuid(),
            number: `${D.BUILDING_WORDS[bi]}${f}${String(k).padStart(2, "0")}`,
            buildingId: id,
            type: surface > 150 && r.chance(0.3) ? "duplex" : surface < 65 && r.chance(0.4) ? "studio" : "appartement",
            tantiemes: Math.round(surface * r.int(9, 11) / 10),
            status: r.weighted([["occupied", 62], ["rented", 28], ["vacant", 10]] as const),
            floor: f,
          });
        }
      }
      const parkings = r.int(0, Math.round(perFloor * floors * 0.6));
      for (let p = 0; p < parkings; p++) lotRows.push({ id: r.uuid(), number: `P${bi + 1}-${String(p + 1).padStart(2, "0")}`, buildingId: id, type: "parking", tantiemes: r.chance(0.3) ? 0 : r.int(3, 8), status: "occupied", floor: -1 });
      const caves = r.int(0, 6);
      for (let p = 0; p < caves; p++) lotRows.push({ id: r.uuid(), number: `K${bi + 1}-${String(p + 1).padStart(2, "0")}`, buildingId: id, type: "cave", tantiemes: r.int(1, 4), status: "occupied", floor: -1 });
      nLots = lotRows.length;
      lots.push(...lotRows);
      b.add("buildings", {
        id,
        name,
        address,
        city: city.city,
        type: shops > 0 ? "mixed" : "residential",
        total_floors: floors,
        total_lots: nLots,
        construction_year: r.int(1975, 2023),
        syndicate_id: sid,
        registration_number: `TF-${r.int(10000, 99999)}/${r.pick(["C", "R", "T", "M"])}`,
        status: "active",
        created_at: addDays(created, r.int(0, 20)),
      });
    }

    // ── Users of the condominium ──
    const hash = await this.hash();
    const lang = (u: number) => (u % 4 === 0 ? "ar" : "fr");
    const userStatus = () => r.weighted([["active", 86], ["pending", 8], ["inactive", 4], ["suspended", 2]] as const);
    const mkUser = (role: Role, n: number, statusOverride?: string): UserRow => {
      const arabic = lang(n) === "ar" && r.chance(0.35);
      const name = this.person(arabic);
      const st = statusOverride ?? (role === "syndicate_admin" ? "active" : userStatus());
      const u = b.add("users", {
        id: r.uuid(),
        name,
        email: this.email(arabic ? `${role}${n}` : name),
        password_hash: hash,
        role,
        status: st,
        syndicate_id: sid,
        phone: r.chance(0.85) ? this.phone() : null,
        cin: r.chance(0.6) ? `${r.pick(["A", "B", "BE", "BK", "C", "D", "EE", "G", "J", "K", "L"])}${r.int(100000, 999999)}` : null,
        profession: r.chance(0.7) ? r.pick(D.PROFESSIONS) : null,
        must_change_password: st === "pending",
        // Generated addresses use a reserved domain (*.test): they can never
        // receive mail, and the API never tries to write to them.
        email_status: "undeliverable",
        created_at: addDays(created, r.int(0, 300)),
      }) as unknown as UserRow;
      return u;
    };
    // a syndic administrator manages one or more condominiums of the company
    const reuse = adminPool.length > 0 && r.chance(0.3);
    const admin = reuse ? r.pick(adminPool) : mkUser("syndicate_admin", 0, "active");
    if (!reuse) adminPool.push(admin);
    else b.add("syndicate_memberships", { syndicate_id: sid, user_id: admin.id, role: "syndicate_admin", status: "active", granted_by: admin.id });
    if (!reuse) b.add("organization_members", { organization_id: orgId, user_id: admin.id, role: r.chance(0.7) ? "org_admin" : "org_staff", status: "active" });

    const size = lots.filter((l) => !["parking", "cave"].includes(l.type)).length;
    const k = Math.max(0.5, this.o.scale);
    const team: UserRow[] = [mkUser("president", 1), mkUser("treasurer", 2)];
    if (r.chance(0.8)) team.push(mkUser("secretary", 3));
    const nCommittee = Math.max(1, Math.round(r.int(1, 3) * k));
    for (let c = 0; c < nCommittee; c++) team.push(mkUser("committee_member", 4 + c));
    const nOwners = Math.max(3, Math.round(Math.min(size * 0.45, r.int(5, 10)) * k));
    const owners = Array.from({ length: nOwners }, (_, n) => mkUser("member", 10 + n));

    // ── Co-owners (members) and ownerships ──
    const apartments = lots.filter((l) => l.tantiemes >= 0);
    const memberIds: string[] = [];
    const memberByEmail = new Map<string, string>();
    const ownerUserByMember = new Map<string, UserRow>();
    const addMember = (name: string, email: string, user?: UserRow) => {
      const id = r.uuid();
      b.add("members", {
        id,
        name,
        email,
        phone: r.chance(0.8) ? this.phone() : null,
        profession: r.chance(0.6) ? r.pick(D.PROFESSIONS) : null,
        syndicate_id: sid,
        status: user ? (user.status === "pending" ? "pending" : user.status === "active" ? "active" : "inactive") : r.weighted([["active", 90], ["pending", 6], ["inactive", 4]] as const),
        cotisation_status: "pending",
        join_date: ymd(addDays(created, r.int(0, 200))),
      });
      memberIds.push(id);
      memberByEmail.set(email.toLowerCase(), id);
      if (user) ownerUserByMember.set(id, user);
      return id;
    };
    // the council and app owners are co-owners too
    const accountOwners = [...team, ...owners];
    const accountMemberIds = accountOwners.map((u) => addMember(u.name, u.email, u));
    const lotOwners = new Map<string, string[]>();
    const ownedLots = apartments.filter((l) => !["parking", "cave"].includes(l.type));
    let ai = 0;
    for (const lot of ownedLots) {
      let owner: string;
      if (ai < accountMemberIds.length) owner = accountMemberIds[ai++];
      else if (r.chance(0.18) && memberIds.length > 3) owner = r.pick(memberIds); // owns several lots
      else {
        const name = this.person(r.chance(0.2));
        owner = addMember(name, this.email(name));
      }
      const ownersOf = [owner];
      if (r.chance(0.1)) {
        const name = this.person();
        ownersOf.push(addMember(name, this.email(name)));
      }
      lotOwners.set(lot.id, ownersOf);
    }
    // parkings / cellars belong to apartment owners
    for (const lot of apartments.filter((l) => ["parking", "cave"].includes(l.type))) lotOwners.set(lot.id, [r.pick([...lotOwners.values()])[0]]);
    for (const lot of lots) {
      const ownersOf = lotOwners.get(lot.id) ?? [];
      b.add("lots", {
        id: lot.id,
        number: lot.number,
        type: lot.type,
        floor: lot.floor,
        surface_m2: lot.type === "parking" ? r.money(11, 15) : lot.type === "cave" ? r.money(4, 9) : r.money(Math.max(30, lot.tantiemes - 10), lot.tantiemes + 15),
        titre_foncier: r.chance(0.7) ? `${r.int(10000, 99999)}/${r.pick(["C", "R", "T", "M"])}` : null,
        tantiemes: lot.tantiemes,
        building_id: lot.buildingId,
        owner_id: ownersOf[0] ?? null,
        status: lot.status,
      });
      const start = ymd(addDays(created, -r.int(30, 3000)));
      // a past owner for some lots (sold), kept as history
      if (r.chance(0.12) && ownersOf.length === 1) {
        const prevName = this.person();
        const prev = addMember(prevName, this.email(prevName));
        const prevStart = ymd(addDays(new Date(start), -r.int(400, 3000)));
        b.add("lot_ownerships", { syndicate_id: sid, lot_id: lot.id, member_id: prev, share_percent: "100", start_date: prevStart, end_date: start, end_reason: r.pick(["vente", "succession", "donation"]), created_by: admin.id });
      }
      const share = ownersOf.length === 2 ? "50" : "100";
      for (const m of ownersOf) b.add("lot_ownerships", { syndicate_id: sid, lot_id: lot.id, member_id: m, share_percent: share, start_date: start, created_by: admin.id });
    }

    // ── Tenants (rented lots); some have an app account ──
    const tenantUsers: UserRow[] = [];
    const rented = lots.filter((l) => l.status === "rented");
    const tenantAccounts = Math.max(1, Math.round(r.int(3, 7) * k));
    for (const lot of rented) {
      const withAccount = tenantUsers.length < tenantAccounts && r.chance(0.7);
      const user = withAccount ? mkUser("tenant", 100 + tenantUsers.length) : null;
      if (user) tenantUsers.push(user);
      const name = user?.name ?? this.person();
      const leaseStart = addDays(this.o.now, -r.int(30, 1400));
      const expired = r.chance(0.1);
      b.add("tenants", {
        name,
        email: user?.email ?? (r.chance(0.7) ? this.email(name) : null),
        phone: this.phone(),
        lot_id: lot.id,
        building_id: lot.buildingId,
        syndicate_id: sid,
        lease_start: ymd(leaseStart),
        // an expired lease ends between its start (+1 month) and yesterday
        lease_end: ymd(expired ? addDays(leaseStart, Math.max(30, Math.floor((this.o.now.getTime() - leaseStart.getTime()) / 86_400_000) - r.int(1, 25))) : addDays(leaseStart, 365 * r.int(1, 3))),
        monthly_rent: r.money(2500, 12000, 100),
        deposit_amount: r.money(5000, 24000, 500),
        status: expired ? "expired" : user?.status === "pending" ? "pending" : "active",
      });
      if (expired && r.chance(0.5)) {
        // a former tenant, lease ended
        const prev = this.person();
        b.add("tenants", { name: prev, email: null, phone: this.phone(), lot_id: lot.id, building_id: lot.buildingId, syndicate_id: sid, lease_start: ymd(addDays(this.o.now, -r.int(900, 2000))), lease_end: ymd(addDays(this.o.now, -r.int(400, 800))), monthly_rent: r.money(2500, 9000, 100), status: "expired" });
      }
    }

    // ── Council (conseil syndical) ──
    for (const u of team) {
      b.add("conseil_syndical", {
        syndicate_id: sid,
        user_id: u.id,
        member_id: memberByEmail.get(u.email.toLowerCase()),
        role: u.role === "committee_member" ? "member" : u.role,
        name: u.name,
        email: u.email,
        phone: this.phone(),
        mandate_start: ymd(addDays(this.o.now, -r.int(60, 700))),
        mandate_end: ymd(addDays(this.o.now, r.int(30, 700))),
        status: "active",
      });
    }

    // ── Treasury accounts with opening balance ──
    const bankAccountId = r.uuid();
    const cashAccountId = r.uuid();
    const openingDate = ymd(addDays(new Date(`${this.o.now.getUTCFullYear() - 1}-01-01T00:00:00Z`), 0));
    const c: Ctx = {
      sid, name: resName, city, district, status, admin, team, owners, tenantUsers,
      allUsers: [admin, ...team, ...owners, ...tenantUsers],
      buildings, lots, memberByEmail, memberIds, lotOwners, ownerUserByMember,
      bankAccountId, cashAccountId, budgets: [], prestataires: [], travaux: [], meetings: [], seq: new Map(), files: [],
    };
    const opening = r.money(20000, 250000, 100);
    b.add("treasury_accounts", { id: bankAccountId, syndicate_id: sid, kind: "bank", label: "Compte courant", bank_name: "Banque Test A", account_holder: resName, rib: ribFor(r), currency: "MAD", opening_balance: opening, opening_date: openingDate, status: "active", is_default: true, created_by: admin.id });
    b.add("treasury_accounts", { id: cashAccountId, syndicate_id: sid, kind: "cash", label: "Caisse", currency: "MAD", opening_balance: "0", opening_date: openingDate, status: "active", is_default: true, created_by: admin.id });
    b.add("ledger_entries", {
      syndicate_id: sid, account_id: bankAccountId, entry_number: nextNumber(c, "JRN", Number(openingDate.slice(0, 4)), 6), entry_date: openingDate, direction: "in", amount: opening, currency: "MAD",
      category: "reprise_solde", label: "Solde d'ouverture — Compte courant", source_type: "opening", source_id: bankAccountId, created_by: admin.id,
    });

    // ── Budgets (two years) ──
    const year = this.o.now.getUTCFullYear();
    for (const bld of buildings) {
      const bLots = lots.filter((l) => l.buildingId === bld.id);
      const base = bLots.reduce((s, l) => s + l.tantiemes, 0) * r.int(28, 55);
      for (const y of [year - 1, year]) {
        const total = Math.round(base * (y === year ? 1.04 : 1) / 100) * 100;
        const charges = Math.round(total * 0.9);
        const id = r.uuid();
        const lines = D.BUDGET_CATEGORIES.map(([category, label, w]) => {
          const annual = Math.round(charges * w);
          return { id: r.uuid(), category, label, annual };
        });
        // keep Σ lines = charges exactly
        const diff = charges - lines.reduce((s, l) => s + l.annual, 0);
        lines[0].annual += diff;
        b.add("budgets", {
          id, year: y, building_id: bld.id, total_amount: total.toFixed(2), charges_amount: charges.toFixed(2), fonds_reserve: (total - charges).toFixed(2),
          status: "approved", notes: `Budget ${y} voté en assemblée générale`, created_by: admin.id, voted_at: new Date(`${y - 1}-12-${r.int(10, 20)}T10:00:00Z`),
          created_at: new Date(`${y - 1}-11-${r.int(10, 28)}T10:00:00Z`),
        });
        for (const l of lines) b.add("budget_lines", { id: l.id, budget_id: id, category: l.category, label: l.label, amount_annual: l.annual.toFixed(2), amount_q1: (l.annual / 4).toFixed(2), amount_q2: (l.annual / 4).toFixed(2), amount_q3: (l.annual / 4).toFixed(2), amount_q4: (l.annual - 3 * Math.round((l.annual / 4) * 100) / 100).toFixed(2) });
        c.budgets.push({ id, buildingId: bld.id, year: y, total, charges, lines: lines.map((l) => ({ id: l.id, category: l.category, annual: l.annual })) });
      }
      // a draft budget for next year on some buildings
      if (r.chance(0.3)) b.add("budgets", { year: year + 1, building_id: bld.id, total_amount: (Math.round(base * 1.08 / 100) * 100).toFixed(2), status: "draft", notes: "Projet de budget", created_by: admin.id });
      b.add("fonds_travaux", { syndicate_id: sid, building_id: bld.id, year, budget_base: (base * 0.9).toFixed(2), rate_percent: "5", target_amount: (base * 0.9 * 0.05).toFixed(2), current_balance: r.money(0, base * 0.05), status: "active" });
    }

    await flush(tx, b, this.o.order, this.counts);
    return c;
  }

  // ─── Phase 1b: activity of the condominium ────────────────────────────────
  async activity(tx: Tx, c: Ctx) {
    const r = this.rng;
    const b = new Batch();
    const year = this.o.now.getUTCFullYear();
    const residents = [...c.owners, ...c.tenantUsers];
    const activeUsers = c.allUsers.filter((u) => u.status === "active");
    const store = async (title: string, owner: UserRow, content: PdfSpec | "png") => {
      const id = r.uuid();
      const f: StoredFile = content === "png" ? await writeUpload(id, makePng(r.int(1, 2 ** 31)), ".png", `${slug(title) || "photo"}.png`) : await writeUpload(id, await renderPdf(content), ".pdf", `${slug(title) || "document"}.pdf`);
      c.files.push(f.objectPath);
      b.add("storage_objects", { object_path: f.objectPath, owner_id: owner.id, syndicate_id: c.sid, original_name: f.fileName, content_type: f.mime, size: f.size });
      return f;
    };

    // ── Suppliers, contracts, evaluations ──
    const nPrest = Math.max(2, Math.round(r.int(2, 5) * this.o.scale));
    for (let p = 0; p < nPrest; p++) {
      const [type, label] = r.pick(D.PRESTATAIRE_TYPES);
      const id = r.uuid();
      const name = `${label} ${r.pick(D.LAST_NAMES)} ${r.pick(["SARL", "& Fils", "Services", "Maroc"])}`;
      c.prestataires.push({ id, name, type });
      b.add("prestataires", { id, name, type, contact_name: this.person(), phone: this.phone(), email: `${slug(name)}.${p}@${this.domain}`, address: `${r.int(1, 99)} ${r.pick(D.STREETS)}, ${c.city.city}`, ice: String(r.int(1e14, 9e14)), rc: String(r.int(10000, 99999)), syndicate_id: c.sid, status: r.weighted([["active", 90], ["suspended", 10]] as const), rating: r.money(2.5, 5, 0.1), evaluations_count: r.int(0, 12) });
      for (const bld of r.sample(c.buildings, r.int(1, c.buildings.length))) {
        const start = addDays(this.o.now, -r.int(60, 900));
        const monthly = Number(r.money(800, 9000, 50));
        const ended = r.chance(0.15);
        // Same random draws, in the same order, as before; an ended contract
        // stops on its termination day (never an end date still to come).
        const plannedEnd = addDays(start, 365 * r.int(1, 3));
        const endStatus = ended ? r.pick(["expired", "terminated"]) : "active";
        const autoRenew = r.chance(0.6);
        const terminatedAt = ended ? addDays(this.o.now, -r.int(1, 50)) : null;
        b.add("contrats_prestataires", { prestataire_id: id, building_id: bld.id, title: `Contrat ${label.toLowerCase()} — ${bld.name}`, start_date: ymd(start), end_date: ymd(terminatedAt && terminatedAt < plannedEnd ? terminatedAt : plannedEnd), monthly_amount: monthly.toFixed(2), annual_amount: (monthly * 12).toFixed(2), status: endStatus, auto_renew: autoRenew, terminated_at: terminatedAt });
      }
      for (let e = 0; e < r.int(0, 3); e++) {
        const q = [r.int(2, 5), r.int(2, 5), r.int(2, 5), r.int(2, 5)];
        b.add("prestataire_evaluations", { prestataire_id: id, syndicate_id: c.sid, quality: q[0], speed: q[1], communication: q[2], price: q[3], average: (q.reduce((s, x) => s + x, 0) / 4).toFixed(2), comment: r.pick(["Intervention rapide", "Travail soigné", "Retard au démarrage", "Bon rapport qualité-prix"]), rated_by_id: c.admin.id, rated_by_name: c.admin.name });
      }
    }

    // ── Works (travaux) ──
    const nTravaux = Math.round(r.int(5, 14) * this.o.scale);
    for (let t = 0; t < nTravaux; t++) {
      const bld = r.pick(c.buildings);
      const prest = r.pick(c.prestataires);
      const st = r.weighted([["reported", 12], ["assigned", 15], ["in_progress", 15], ["pending_validation", 8], ["completed", 45], ["cancelled", 5]] as const);
      const reported = this.past(5, 420);
      const est = Number(r.money(800, 60000, 100));
      const done = st === "completed";
      const id = r.uuid();
      const title = r.pick(["Réparation de l'interphone", "Remplacement de pompe", "Peinture de la cage d'escalier", "Réfection de l'étanchéité", "Maintenance de l'ascenseur", "Changement des luminaires", "Réparation du portail", "Curage des canalisations"]);
      c.travaux.push({ id, buildingId: bld.id, title, status: st, amount: done ? est : null });
      b.add("travaux", {
        id, title, description: `${title} — ${bld.name}`, type: r.pick(["entretien", "reparation", "amelioration", "gros_travaux", "urgence"]), priority: r.pick(["urgent", "high", "normal", "low"]), status: st, building_id: bld.id,
        prestataire_id: st === "reported" ? null : prest.id, reported_by_id: r.pick(c.team).id, reported_by_name: c.admin.name, assigned_by_id: st === "reported" ? null : c.admin.id, assigned_at: st === "reported" ? null : addDays(reported, r.int(0, 5)),
        estimated_amount: est.toFixed(2), actual_amount: done ? (est * r.int(85, 115) / 100).toFixed(2) : null, start_date: ymd(addDays(reported, r.int(1, 10))), end_date: done ? ymd(addDays(reported, r.int(11, 60))) : null,
        completed_at: done ? addDays(reported, r.int(11, 60)) : null, validated_by_id: done ? c.admin.id : null, validated_by_name: done ? c.admin.name : null, validated_at: done ? addDays(reported, r.int(12, 65)) : null,
        response_time_minutes: r.int(30, 4000), resolution_time_minutes: done ? r.int(600, 80000) : null, created_at: reported,
      });
    }

    // ── Expenses with invoice proof; paid ones are posted to the journal ──
    const nExpenses = Math.round(r.int(14, 32) * this.o.scale);
    const budgetsNow = c.budgets.filter((x) => x.year >= year - 1);
    let expN = 0;
    for (let e = 0; e < nExpenses; e++) {
      const bud = r.pick(budgetsNow);
      const line = r.pick(bud.lines);
      const prest = r.pick(c.prestataires);
      const amount = r.money(300, Math.max(400, line.annual / 6), 10);
      const st = r.weighted([["draft", 4], ["submitted", 10], ["approved", 10], ["rejected", 5], ["paid", 68], ["cancelled", 3]] as const);
      const d = this.past(2, 650);
      const invoiceDate = addDays(d, -r.int(0, 10));
      const invoiceNumber = `F-${invoiceDate.getUTCFullYear()}-${r.int(1000, 9999)}`;
      const proof = await store(`Facture ${prest.name} ${invoiceNumber}`, c.team[1] ?? c.admin, supplierInvoice(c, prest.name, invoiceNumber, invoiceDate, [[`${line.category.replace(/_/g, " ")} — ${bud.year}`, "1", amount, amount]]));
      const id = r.uuid();
      const ref = nextNumber(c, "DEP", d.getUTCFullYear(), 4);
      expN++;
      let ledgerId: string | null = null;
      const paidAt = st === "paid" ? addDays(d, r.int(1, 25)) : null;
      if (paidAt && paidAt > this.o.now) paidAt.setTime(this.o.now.getTime() - 86_400_000);
      if (st === "paid") {
        ledgerId = r.uuid();
        b.add("ledger_entries", {
          id: ledgerId, syndicate_id: c.sid, account_id: c.bankAccountId, entry_number: nextNumber(c, "JRN", paidAt!.getUTCFullYear(), 6), entry_date: ymd(paidAt!), direction: "out", amount, currency: "MAD",
          category: line.category, label: `${ref} — Prestation ${line.category} (${prest.name})`, source_type: "expense", source_id: id, building_id: bud.buildingId, proof_url: proof.objectPath, created_by: (c.team[1] ?? c.admin).id, created_at: paidAt!,
        });
      }
      b.add("expenses", {
        id, syndicate_id: c.sid, building_id: bud.buildingId, reference: ref, label: `Prestation ${line.category.replace(/_/g, " ")} — ${prest.name}`, category: line.category, amount, currency: "MAD", supplier_name: prest.name, prestataire_id: prest.id,
        invoice_number: invoiceNumber, invoice_date: ymd(invoiceDate), proof_url: proof.objectPath, budget_line_id: line.id, status: st, created_by: (c.team[1] ?? c.admin).id,
        approved_by: ["approved", "paid"].includes(st) ? c.admin.id : null, approved_at: ["approved", "paid"].includes(st) ? addDays(d, 1) : null,
        rejected_by: st === "rejected" ? c.admin.id : null, rejected_at: st === "rejected" ? addDays(d, 1) : null, rejection_reason: st === "rejected" ? "Devis non conforme" : null,
        paid_by: st === "paid" ? (c.team[1] ?? c.admin).id : null, paid_at: paidAt, payment_method: st === "paid" ? r.pick(["virement", "cheque", "prelevement"]) : null, payment_reference: st === "paid" ? `VIR-${r.int(100000, 999999)}` : null,
        account_id: st === "paid" ? c.bankAccountId : null, ledger_entry_id: ledgerId, created_at: d,
      });
    }

    // ── Supplier invoices, delivery notes ──
    for (let f = 0; f < Math.round(r.int(8, 22) * this.o.scale); f++) {
      const d = this.past(1, 500);
      const items = Array.from({ length: r.int(1, 4) }, () => ({ label: r.pick(["Main d'œuvre", "Fournitures", "Déplacement", "Pièces détachées", "Produits d'entretien"]), quantity: r.int(1, 10), unit_price: Number(r.money(50, 3000, 10)) }));
      const amount = items.reduce((s, x) => s + x.quantity * x.unit_price, 0);
      const id = r.uuid();
      const st = r.weighted([["paid", 60], ["pending", 25], ["overdue", 15]] as const);
      b.add("invoices", { id, reference: nextNumber(c, "FAC", d.getUTCFullYear(), 4), type: r.pick(["facture", "devis"]), recipient: r.pick(c.prestataires).name, date: ymd(d), due_date: ymd(addDays(d, 30)), status: st, amount: amount.toFixed(2), syndicate_id: c.sid, created_at: d });
      for (const it of items) b.add("invoice_items", { invoice_id: id, label: it.label, quantity: String(it.quantity), unit_price: it.unit_price.toFixed(2) });
    }
    for (let f = 0; f < r.int(1, 4); f++) {
      const id = r.uuid();
      const items = Array.from({ length: r.int(1, 3) }, () => ({ label: r.pick(["Sacs poubelle", "Ampoules LED", "Produits d'entretien", "Peinture"]), quantity: r.int(1, 20), unit_price: Number(r.money(10, 400, 5)) }));
      b.add("bons_livraison", { id, reference: `BL-${year}-${r.int(1000, 9999)}`, recipient: c.name, date: ymd(this.past(1, 300)), type: "entree", total: items.reduce((s, x) => s + x.quantity * x.unit_price, 0).toFixed(2), status: r.pick(["delivered", "sent"]), syndicate_id: c.sid });
      for (const it of items) b.add("bon_items", { bon_id: id, label: it.label, quantity: String(it.quantity), unit_price: it.unit_price.toFixed(2) });
    }

    // ── Staff salaries (concierge, guard), posted to the journal ──
    const staff = [{ employee: this.person(), role: "Concierge", amount: r.money(3200, 4200, 50) }, ...(r.chance(0.7) ? [{ employee: this.person(), role: "Gardien de nuit", amount: r.money(3000, 3800, 50) }] : [])];
    for (const s of staff) {
      for (let m = 1; m <= this.o.now.getUTCMonth() + 1; m++) {
        const month = `${year}-${String(m).padStart(2, "0")}`;
        const paid = m <= this.o.now.getUTCMonth();
        const payDate = new Date(Date.UTC(year, m - 1, 28));
        let ledgerId: string | null = null;
        if (paid) {
          ledgerId = r.uuid();
          b.add("ledger_entries", { id: ledgerId, syndicate_id: c.sid, account_id: c.bankAccountId, entry_number: nextNumber(c, "JRN", year, 6), entry_date: ymd(payDate), direction: "out", amount: s.amount, currency: "MAD", category: "salaires", label: `Salaire ${s.role} ${month}`, source_type: "salary", created_by: (c.team[1] ?? c.admin).id });
        }
        b.add("salary_records", { employee: s.employee, role: s.role, amount: s.amount, month, status: paid ? "paid" : "pending", paid_date: paid ? ymd(payDate) : null, syndicate_id: c.sid, ledger_entry_id: ledgerId });
      }
    }

    // ── Documents of the library (real files, audiences, versions) ──
    // Rules, minutes, budgets, call notices, receipts, contracts and work
    // reports are produced from the real records by the documents phase
    // (documents.ts). Here: the other categories of the library.
    const docCats: Array<[string, string, string]> = [
      ["avis", "Avis aux résidents", "residents"],
      ["assurance", "Attestation d'assurance de l'immeuble", "owners"],
      ["technique", "Diagnostic technique", "unit"],
      ["administratif", "Courrier administratif", "syndic"],
      ["juridique", "Note juridique", "council"],
      ["maintenance", "Carnet d'entretien de l'immeuble", "council"],
    ];
    const nDocs = Math.round(r.int(8, 20) * this.o.scale);
    const docIds: string[] = [];
    for (let dI = 0; dI < nDocs; dI++) {
      const [cat, label, aud0] = r.pick(docCats);
      const personal = r.chance(0.08) && residents.length;
      const aud = personal ? "personal" : aud0;
      const author = r.pick([c.admin, ...c.team.slice(0, 3)]);
      const d = this.past(1, 700);
      const lot = aud === "unit" ? r.pick(c.lots) : null;
      const subject = personal ? r.pick(residents) : null;
      const title = `${label}${lot ? ` — Lot ${lot.number}` : subject ? ` — ${subject.name}` : ""} ${d.getUTCFullYear()}${dI % 3 ? ` (${dI})` : ""}`;
      const f = await store(title, author, r.chance(0.15) ? "png" : libraryDocument(c, cat, title, d, lot?.number ?? null, subject?.name ?? null));
      const st = r.weighted([["published", 82], ["draft", 8], ["archived", 10]] as const);
      const id = r.uuid();
      docIds.push(id);
      const version = r.chance(0.12) ? 2 : 1;
      b.add("documents", {
        id, title, category: cat, status: st, syndicate_id: c.sid, size: String(f.size), created_by: author.id, file_url: f.objectPath, version,
        published_at: st !== "draft" ? d : null, archived_at: st === "archived" ? addDays(d, r.int(30, 200)) : null, is_deleted: false, language: "fr",
        subject_user_id: subject?.id ?? null, source: "upload", visibility: aud, description: r.chance(0.5) ? `${label} de la ${c.name}` : null,
        lot_id: lot?.id ?? null, file_name: f.fileName, mime_type: f.mime, size_bytes: f.size, checksum: f.checksum, created_at: d,
      });
      if (version === 2) {
        const old = await store(`${title} (v1)`, author, libraryDocument(c, cat, `${title} (version 1)`, d, lot?.number ?? null, subject?.name ?? null));
        b.add("document_versions", { document_id: id, version_number: 1, title, status: "published", file_url: old.objectPath, file_name: old.fileName, mime_type: old.mime, size_bytes: old.size, checksum: old.checksum, modified_by: author.id, change_reason: "Version corrigée", modified_at: addDays(d, 10) });
      }
      if (r.chance(0.15)) b.add("document_comments", { document_id: id, author_id: r.pick(c.team).id, content: r.pick(["Merci pour la diffusion", "Une erreur page 2 ?", "Validé par le conseil"]) });
    }

    // ── Announcements, publications, ideas ──
    for (let a = 0; a < Math.round(r.int(5, 14) * this.o.scale); a++) {
      const [title, body] = r.pick(D.ANNOUNCEMENT_SAMPLES);
      const d = this.past(0, 400);
      b.add("announcements", { title, body, priority: r.pick(["info", "important", "urgent"]), audience: r.pick(["Tous les membres", "Copropriétaires"]), pinned: r.chance(0.1), syndicate_id: c.sid, author_id: c.admin.id, author: c.admin.name, expires_at: r.chance(0.5) ? addDays(d, 30) : null, created_at: d });
    }
    for (let p = 0; p < Math.round(r.int(3, 9) * this.o.scale); p++) {
      const id = r.uuid();
      const author = r.pick(activeUsers);
      const likers = r.sample(activeUsers, r.int(0, Math.min(8, activeUsers.length)));
      const commenters = r.sample(activeUsers, r.int(0, 3));
      b.add("publications", { id, title: r.pick(D.PUBLICATION_SAMPLES), content: "Message publié par un résident (données de test).", category: r.pick(["communiqué", "actualité", "rapport"]), pinned: false, syndicate_id: c.sid, author_id: author.id, author_name: author.name, likes: likers.length, comments: commenters.length, created_at: this.past(0, 300) });
      for (const u of likers) b.add("publication_likes", { publication_id: id, user_id: u.id });
      for (const u of commenters) b.add("publication_comments", { publication_id: id, user_id: u.id, user_name: u.name, author_id: u.id, author_name: u.name, text: r.pick(["Bonne idée !", "Merci", "Je suis partant", "À discuter en réunion"]) });
    }
    for (let p = 0; p < r.int(1, 5); p++) {
      const id = r.uuid();
      const author = r.pick(residents.length ? residents : activeUsers);
      const voters = r.sample(activeUsers, r.int(0, Math.min(10, activeUsers.length)));
      b.add("ideas", { id, syndicate_id: c.sid, user_id: author.id, user_name: author.name, title: r.pick(["Installer des bornes de recharge", "Créer un local vélos", "Panneaux solaires sur le toit", "Composteur collectif", "Éclairage LED dans le parking"]), description: "Proposition d'un résident (données de test).", category: r.pick(["infrastructure", "environment", "security"]), status: r.pick(["submitted", "under_review", "approved", "rejected"]), vote_count: voters.length, created_at: this.past(0, 300) });
      for (const u of voters) b.add("idea_votes", { idea_id: id, user_id: u.id });
    }

    // ── Meetings / general assemblies, attendees, resolutions, proxies ──
    const nMeetings = Math.round(r.int(3, 8) * this.o.scale);
    const ownerMembers = [...c.ownerUserByMember.keys()];
    for (let m = 0; m < nMeetings; m++) {
      const past = r.chance(0.7);
      const d = past ? this.past(5, 600) : addDays(this.o.now, r.int(3, 90));
      const type = r.weighted([["ag_ordinaire", 40], ["ag_extraordinaire", 10], ["board", 40], ["emergency", 10]] as const);
      const status = past ? r.weighted([["completed", 90], ["cancelled", 10]] as const) : "scheduled";
      const id = r.uuid();
      c.meetings.push({ id, date: ymd(d), status, type });
      b.add("meetings", { id, syndicate_id: c.sid, title: type.startsWith("ag") ? `Assemblée générale ${type === "ag_ordinaire" ? "ordinaire" : "extraordinaire"} ${d.getUTCFullYear()}` : type === "emergency" ? "Réunion exceptionnelle du conseil syndical" : "Réunion du conseil syndical", date: ymd(d), time: `${r.int(17, 20)}:00`, location: r.pick(["Salle commune", "Hall du bâtiment A", "Visioconférence"]), type, description: "Réunion (données de test)", agenda: "1. Approbation des comptes\n2. Budget\n3. Travaux\n4. Questions diverses", status, created_by: c.admin.id, created_at: addDays(d, -r.int(15, 30)) });
      if (status === "completed") {
        for (const u of r.sample(c.allUsers.filter((x) => x.role !== "tenant"), Math.min(c.allUsers.length, r.int(3, 15)))) b.add("meeting_attendees", { meeting_id: id, user_id: u.id });
        if (type.startsWith("ag")) {
          // Shares voted come from the lots' real tantièmes; the outcome follows
          // the API's rule for each majority (modules/ag/ag.routes.ts).
          const totalT = c.lots.reduce((s, l) => s + l.tantiemes, 0);
          for (let n = 1; n <= r.int(2, 5); n++) {
            const present = Math.round((totalT * r.int(45, 85)) / 100);
            const forT = Math.round((present * r.int(30, 90)) / 100);
            const against = Math.round(((present - forT) * r.int(20, 90)) / 100);
            const abst = present - forT - against;
            const majority = r.pick(["simple", "absolute", "qualified"] as const);
            const pct = totalT ? forT / totalT : 0;
            const adopted = majority === "simple" ? forT > against : majority === "absolute" ? pct > 0.5 : pct >= 2 / 3;
            b.add("ag_resolutions", { meeting_id: id, number: n, title: r.pick(["Approbation des comptes", "Vote du budget", "Ravalement de façade", "Renouvellement du contrat d'entretien", "Désignation du syndic"]), required_majority: majority, tantiemes_for: forT, tantiemes_against: against, tantiemes_abstain: abst, result: adopted ? "adopted" : "rejected" });
          }
          const [grantor, grantee] = r.sample(ownerMembers, 2);
          if (grantor && grantee) b.add("ag_proxies", { meeting_id: id, syndicate_id: c.sid, grantor_id: grantor, grantor_name: c.ownerUserByMember.get(grantor)!.name, grantee_id: grantee, grantee_name: c.ownerUserByMember.get(grantee)!.name, status: "accepted" });
        }
      }
    }

    // ── Elections: candidates among co-owners, votes only by eligible users ──
    if (r.chance(0.6)) {
      const id = r.uuid();
      const closed = r.chance(0.6);
      const start = closed ? this.past(30, 300) : addDays(this.o.now, -r.int(0, 5));
      // voters: co-owners and council of THIS condominium (not tenants, not the syndic)
      const voters = c.allUsers.filter((u) => !["tenant", "syndicate_admin"].includes(u.role) && u.status === "active" && u.syndicate_id === c.sid);
      const candidates = r.sample(voters, Math.min(voters.length, r.int(2, 4)));
      const cIds = candidates.map(() => r.uuid());
      const ballots = closed ? r.sample(voters, Math.round(voters.length * r.int(40, 90) / 100)) : r.sample(voters, Math.round(voters.length * 0.3));
      const tally = new Map<string, number>();
      b.add("elections", { id, syndicate_id: c.sid, title: `Élection du conseil syndical ${start.getUTCFullYear()}`, election_type: "board", voting_method: "simple_majority", quorum_percent: 25, majority_percent: 50, seats_count: Math.min(3, candidates.length), tenants_can_vote: false, status: closed ? "closed" : "open", start_date: ymd(start), end_date: ymd(addDays(start, 14)), eligible_count: voters.length, participant_count: ballots.length, quorum_reached: ballots.length / Math.max(1, voters.length) >= 0.25, results_published_at: closed ? addDays(start, 15) : null, created_by: c.admin.id });
      candidates.forEach((u, n) => b.add("candidates", { id: cIds[n], election_id: id, user_id: u.id, name: u.name, post: "membre du conseil", status: "approved", bio: "Copropriétaire (données de test)", votes: 0 }));
      for (const v of ballots) {
        const abst = r.chance(0.05);
        const choice = abst ? null : r.pick(cIds);
        if (choice) tally.set(choice, (tally.get(choice) ?? 0) + 1);
        b.add("votes", { election_id: id, candidate_id: choice, is_abstention: abst, device: r.pick(["ios", "android"]) });
        b.add("vote_receipts", { election_id: id, voter_id: v.id });
      }
      for (const row of b.tables.get("candidates") ?? []) if (tally.has(row.id as string)) row.votes = tally.get(row.id as string);
      if (candidates[0] && voters[0] && r.chance(0.5)) b.add("election_questions", { election_id: id, candidate_id: cIds[0], asked_by: voters[voters.length - 1].id, asked_by_name: voters[voters.length - 1].name, question: "Quelles sont vos priorités pour l'immeuble ?", answer: closed ? "La sécurité et l'entretien." : null });
    }

    // ── Governance delegations, administrative acts ──
    if (c.team.length >= 2 && r.chance(0.5)) {
      // delegations reference conseil_syndical rows: insert them after flush (ids needed)
    }
    for (let a = 0; a < r.int(1, 4); a++) {
      b.add("actes_administratifs", { syndicate_id: c.sid, created_by_id: c.admin.id, type: r.pick(["pv", "decision", "courrier_officiel", "convocation"]), statut: r.pick(["brouillon", "valide", "archive"]), numero: `ACT-${year}-${String(a + 1).padStart(3, "0")}`, titre: r.pick(["Décision de travaux", "Courrier à la commune", "Convocation AG", "Note de service"]), objet: "Acte administratif (données de test)", date: ymd(this.past(1, 300)), auteur: c.admin.name });
    }

    // ── Claims with history (Kanban) ──
    const nClaims = Math.round(r.int(8, 25) * this.o.scale);
    const reporters = residents.filter((u) => u.status === "active");
    for (let k = 0; k < nClaims && reporters.length; k++) {
      const reporter = r.pick(reporters);
      const category = r.weighted([["fuite_eau", 18], ["ascenseur", 14], ["eclairage", 12], ["electricite", 8], ["bruit", 8], ["proprete", 12], ["securite", 10], ["parties_communes", 10], ["stationnement", 5], ["autre", 3]] as const);
      const status = r.weighted([["received", 12], ["qualified", 8], ["assigned", 12], ["in_progress", 14], ["awaiting_info", 6], ["resolved", 20], ["closed", 22], ["rejected", 6]] as const);
      const priority = r.weighted([["urgent", 8], ["high", 22], ["normal", 55], ["low", 15]] as const);
      const created = this.past(0, 365);
      const scope = r.chance(0.7) ? "common" : "unit";
      const lot = scope === "unit" ? r.pick(c.lots) : null;
      const bld = lot ? c.buildings.find((x) => x.id === lot.buildingId)! : r.pick(c.buildings);
      const assigned = !["received", "qualified", "rejected"].includes(status);
      const resolved = status === "resolved" || status === "closed";
      const id = r.uuid();
      const dueH = priority === "urgent" ? 24 : priority === "high" ? 72 : priority === "normal" ? 168 : 336;
      b.add("claims", {
        id, syndicate_id: c.sid, reference: nextNumber(c, "RCL", created.getUTCFullYear(), 6), title: r.pick(D.CLAIM_SAMPLES[category]), description: "Signalement d'un résident (données de test).", category, scope,
        building_id: bld.id, lot_id: lot?.id ?? null, location: lot ? `Lot ${lot.number}` : r.pick(["Hall", "Cage d'escalier", "Parking", "Terrasse", "Local poubelles"]), status, priority,
        due_at: new Date(created.getTime() + dueH * 3_600_000), reporter_user_id: reporter.id, reporter_name: reporter.name,
        assignee_user_id: assigned ? r.pick([c.admin, ...c.team]).id : null, prestataire_id: assigned && r.chance(0.6) ? r.pick(c.prestataires).id : null,
        assigned_at: assigned ? addDays(created, 1) : null, assigned_by: assigned ? c.admin.id : null,
        resolution: resolved ? "Intervention réalisée, problème résolu." : null, resolved_at: resolved ? addDays(created, r.int(1, 20)) : null, resolved_by: resolved ? c.admin.id : null,
        closed_at: status === "closed" ? addDays(created, r.int(21, 30)) : null, closed_by: status === "closed" ? c.admin.id : null,
        rejection_reason: status === "rejected" ? "Hors du périmètre de la copropriété" : null, version: 1, created_at: created,
      });
      const path: string[] = ["received"];
      if (status !== "received") path.push(status === "rejected" ? "rejected" : "qualified");
      if (assigned) path.push("assigned");
      if (["in_progress", "awaiting_info", "resolved", "closed"].includes(status)) path.push("in_progress");
      if (status === "awaiting_info") path.push("awaiting_info");
      if (resolved) path.push("resolved");
      if (status === "closed") path.push("closed");
      let prev: string | null = null;
      path.forEach((to, n) => {
        b.add("claim_events", { claim_id: id, syndicate_id: c.sid, type: n === 0 ? "created" : "status_changed", from_status: prev, to_status: to, author_id: n === 0 ? reporter.id : c.admin.id, author_name: n === 0 ? reporter.name : c.admin.name, created_at: addDays(created, n) });
        prev = to;
      });
      if (r.chance(0.25)) {
        const f = await store(`Photo ${category}`, reporter, "png");
        b.add("claim_attachments", { claim_id: id, syndicate_id: c.sid, object_path: f.objectPath, file_name: f.fileName, mime_type: f.mime, internal: false, uploaded_by: reporter.id });
      }
    }

    // ── Insurance claims (sinistres), private works, support tickets ──
    for (let s = 0; s < r.int(0, 4); s++) {
      const st = r.pick(["declared", "expert", "in_progress", "repair", "closed"]);
      b.add("sinistres", { building_id: r.pick(c.buildings).id, type: r.pick(["degat_eau", "incendie", "vol", "dommage_commun", "ascenseur", "autre"]), description: "Sinistre déclaré (données de test).", date: ymd(this.past(5, 500)), estimated_amount: r.money(1000, 80000, 100), indemnised_amount: ["repair", "closed"].includes(st) ? r.money(500, 50000, 100) : null, claim_number: `SIN-${r.int(10000, 99999)}`, status: st, urgency: r.pick(["low", "medium", "high", "critical"]), reported_by_id: c.admin.id, reported_by_name: c.admin.name });
    }
    for (let s = 0; s < r.int(0, 3) && c.owners.length; s++) {
      const u = r.pick(c.owners);
      b.add("travaux_privatifs", { building_id: r.pick(c.buildings).id, syndicate_id: c.sid, requested_by_id: u.id, requested_by_name: u.name, title: r.pick(["Fermeture de balcon", "Climatisation en façade", "Remplacement des fenêtres"]), description: "Demande de travaux privatifs (données de test).", work_type: r.pick(["facade", "structural", "ac_unit"]), status: r.pick(["submitted", "under_review", "committee_review", "vote_required", "approved", "rejected"]) });
    }
    for (let s = 0; s < r.int(1, 6); s++) {
      const u = r.pick(c.allUsers);
      const id = r.uuid();
      const st = r.pick(["open", "in_progress", "resolved", "closed"]);
      b.add("support_tickets", { id, title: r.pick(["Problème de connexion", "Question sur une facture", "Badge d'accès perdu", "Demande d'attestation"]), description: "Demande d'assistance (données de test).", priority: r.pick(["low", "medium", "high"]), category: r.pick(["maintenance", "paiement", "general"]), status: st, syndicate_id: c.sid, submitted_by_id: u.id, submitted_by_name: u.name, scope: "syndicate", created_at: this.past(0, 200) });
      if (st !== "open") b.add("ticket_replies", { ticket_id: id, author_id: c.admin.id, author_name: c.admin.name, text: "Nous traitons votre demande." });
    }

    // ── Conversations and messages between residents and the syndic ──
    for (let cv = 0; cv < Math.round(r.int(3, 9) * this.o.scale) && residents.length; cv++) {
      const u = r.pick(residents);
      const id = r.uuid();
      const n = r.int(2, 12);
      let t = this.past(1, 200);
      const msgs: Row[] = [];
      for (let m = 0; m < n; m++) {
        const from = m % 2 === 0 ? u : c.admin;
        t = new Date(t.getTime() + r.int(5, 600) * 60_000);
        msgs.push(b.add("messages", { id: r.uuid(), conversation_id: id, sender_id: from.id, sender_name: from.name, text: m % 2 === 0 ? r.pick(["Bonjour, j'ai une question sur mon appel de fonds.", "Merci pour votre retour.", "Quand passe le plombier ?"]) : r.pick(["Bonjour, je regarde et je reviens vers vous.", "C'est noté.", "Demain matin."]), message_type: "text", created_at: t }));
      }
      b.tables.set("conversations", [...(b.tables.get("conversations") ?? []), { id, syndicate_id: c.sid, conv_type: "direct", participant1_id: u.id, participant2_id: c.admin.id, participant_ids: JSON.stringify([u.id, c.admin.id]), is_group: false, last_message: msgs[msgs.length - 1].text, last_message_at: t, created_by: u.id, created_at: msgs[0].created_at }]);
      b.add("message_reads", { conversation_id: id, user_id: c.admin.id, last_read_at: t });
      if (r.chance(0.6)) b.add("message_reads", { conversation_id: id, user_id: u.id, last_read_at: addDays(t, -1) });
      if (r.chance(0.2)) b.add("message_reactions", { message_id: msgs[0].id, user_id: c.admin.id, emoji: "👍" });
    }

    // ── Parking, vehicles, visitor reservations, violations ──
    for (const bld of c.buildings) {
      const spots = c.lots.filter((l) => l.buildingId === bld.id && l.type === "parking");
      for (const s of spots) {
        const spotId = r.uuid();
        b.add("parking_spots", { id: spotId, building_id: bld.id, lot_id: s.id, spot_number: s.number, type: "resident", floor: "-1", status: "occupied" });
      }
      for (let v = 0; v < r.int(0, 2); v++) {
        const spotId = r.uuid();
        b.add("parking_spots", { id: spotId, building_id: bld.id, spot_number: `V${v + 1}`, type: "visitor", floor: "0", status: "available" });
        if (residents.length && r.chance(0.6)) {
          const u = r.pick(residents);
          const st = addDays(this.o.now, r.int(-20, 10));
          b.add("visitor_parking_reservations", { spot_id: spotId, requested_by_id: u.id, visitor_name: this.person(), visitor_plate: `${r.int(10000, 99999)}-${r.pick(["A", "B", "D", "H", "W"])}-${r.int(1, 89)}`, start_time: st, end_time: new Date(st.getTime() + 4 * 3_600_000), status: st < this.o.now ? "completed" : "approved" });
        }
      }
    }
    for (const u of residents) {
      if (!r.chance(0.55)) continue;
      this.plateN++;
      b.add("vehicles", { user_id: u.id, plate_number: `${10000 + (this.plateN % 89999)}-${r.pick(["A", "B", "D", "H", "W"])}-${(this.plateN % 89) + 1}-${this.o.seed % 1000}`, brand: r.pick(["Dacia", "Renault", "Peugeot", "Toyota", "Hyundai", "Kia", "Volkswagen"]), model: r.pick(["Logan", "Clio", "208", "Yaris", "i10", "Picanto", "Golf"]), color: r.pick(["Blanc", "Gris", "Noir", "Bleu", "Rouge"]), status: "active" });
    }

    // ── Marketplace (residents' ads), orders, reviews, favorites ──
    for (let p = 0; p < Math.round(r.int(1, 6) * this.o.scale) && residents.length; p++) {
      const seller = r.pick(residents);
      const id = r.uuid();
      const price = Number(r.money(100, 6000, 10));
      const st = r.weighted([["approved", 60], ["pending_review", 15], ["sold", 15], ["reserved", 5], ["rejected", 5]] as const);
      b.add("products", { id, name: r.pick(["Vélo enfant", "Canapé 3 places", "Table en bois", "Machine à laver", "Lot de livres", "Poussette"]), description: "Annonce entre résidents (données de test).", price: price.toFixed(2), category: r.pick(["Meubles", "Sport", "Livres", "Électroménager"]), condition: r.pick(["neuf", "bon", "acceptable"]), negotiable: r.chance(0.5), syndicate_id: c.sid, seller_id: seller.id, seller_name: seller.name, seller_email: seller.email, status: st, stock: 1, view_count: r.int(0, 120), sold_at: st === "sold" ? this.past(0, 60) : null, created_at: this.past(1, 200) });
      const buyer = r.pick(residents);
      if (st === "sold" && buyer.id !== seller.id) {
        const orderId = r.uuid();
        b.add("orders", { id: orderId, product_id: id, product_name: "Article", buyer_id: buyer.id, buyer_name: buyer.name, seller_id: seller.id, seller_name: seller.name, amount: price.toFixed(2), status: "completed", type: "direct", date: ymd(this.past(0, 60)) });
        if (r.chance(0.6)) b.add("reviews", { product_id: id, product_name: "Article", order_id: orderId, rating: r.int(3, 5), comment: "Transaction sans souci.", reviewer_id: buyer.id, reviewer_name: buyer.name, date: ymd(this.past(0, 50)) });
      }
      if (buyer.id !== seller.id && r.chance(0.4)) b.add("product_favorites", { product_id: id, user_id: buyer.id });
      if (r.chance(0.3)) b.add("product_comments", { product_id: id, user_id: buyer.id, user_name: buyer.name, content: "Toujours disponible ?" });
    }

    // ── Notification preferences, notifications (alerts) and reads ──
    for (const u of c.allUsers) {
      if (this.prefsDone.has(u.id)) continue;
      this.prefsDone.add(u.id);
      b.add("notification_preferences", { user_id: u.id, push: r.chance(0.85), email: r.chance(0.7), in_app: true });
    }
    const nAlerts = Math.round(c.allUsers.length * r.int(6, 14));
    for (let a = 0; a < nAlerts; a++) {
      const u = r.pick(c.allUsers);
      const type = r.weighted([["info", 50], ["warning", 25], ["success", 20], ["error", 5]] as const);
      const id = r.uuid();
      const d = this.past(0, 240);
      b.add("alerts", { id, title: r.pick(["Nouvel appel de fonds", "Paiement validé", "Nouveau document disponible", "Assemblée générale programmée", "Réclamation mise à jour", "Rappel : échéance"]), message: "Notification de test.", type, date: ymd(d), target: "all", syndicate_id: c.sid, recipient_user_id: u.id, created_at: d });
      if (r.chance(0.55)) b.add("alert_reads", { alert_id: id, user_id: u.id, read_at: addDays(d, r.int(0, 3)) });
    }

    // ── Partners, rankings, template requests, expense challenges ──
    if (r.chance(0.4)) b.add("partners", { name: `${r.pick(["Pressing", "Salle de sport", "Plombier", "Pharmacie"])} ${r.pick(D.LAST_NAMES)}`, type: "commerce", sector: "services", contact: this.person(), phone: this.phone(), benefit: "Remise résidents", discount: `${r.int(5, 20)}%`, syndicate_id: c.sid, start_date: ymd(this.past(0, 200)) });
    for (let m = 1; m <= 12; m++) {
      const col = r.int(55, 99);
      b.add("national_rankings", { syndicate_id: c.sid, month: m, year: year - (m > this.o.now.getUTCMonth() + 1 ? 1 : 0), collection_rate: String(col), incident_resolution_rate: String(r.int(50, 99)), documentation_score: String(r.int(40, 100)), meeting_compliance_score: String(r.int(40, 100)), member_satisfaction: String(r.int(50, 100)), total_score: String(r.int(50, 98)), region: c.city.region });
    }
    if (r.chance(0.3)) {
      const id = r.uuid();
      const voters = r.sample(c.allUsers.filter((u) => u.role !== "tenant"), 4);
      b.add("expense_justifications", { id, syndicate_id: c.sid, title: "Justification d'une dépense de nettoyage", description: "Un copropriétaire demande le détail (données de test).", amount: r.money(500, 8000, 10), category: "nettoyage", status: r.pick(["pending", "challenged", "resolved"]), submitted_by: c.admin.id, submitter_name: c.admin.name, vote_count: voters.length, votes_for: voters.length - 1, votes_against: 1 });
      voters.forEach((u, n) => b.add("expense_votes", { justification_id: id, user_id: u.id, vote: n === 0 ? "against" : "for" }));
    }

    // ── Audit trail of the generated activity ──
    const actions = [["LOGIN", "user"], ["DOCUMENT_UPLOADED", "document"], ["PAYMENT_SUBMITTED", "appel_de_fonds"], ["EXPENSE_APPROVED", "expense"], ["CLAIM_CREATED", "claim"], ["MEMBER_UPDATED", "member"], ["MEETING_CREATED", "meeting"]] as const;
    for (let a = 0; a < Math.round(c.allUsers.length * r.int(4, 8)); a++) {
      const u = r.pick(c.allUsers);
      const [action, entity] = r.pick(actions);
      b.add("audit_logs", { user_id: u.id, user_name: u.name, actor_role: u.role, syndicate_id: c.sid, is_supervision: false, action, entity, entity_id: entity === "document" ? r.pick(docIds) : null, details: "Généré par seedgen", ip_address: `10.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`, created_at: this.past(0, 365) });
    }

    await flush(tx, b, this.o.order, this.counts);

    // governance delegations need the council rows' ids
    const council = (await (tx as any)`SELECT id, name FROM conseil_syndical WHERE syndicate_id = ${c.sid} ORDER BY name`) as { id: string; name: string }[];
    if (council.length >= 2 && r.chance(0.5)) {
      const [a1, a2] = r.sample(council, 2);
      await insertRows(tx, "governance_delegations", [{ syndicate_id: c.sid, delegant_id: a1.id, delegant_name: a1.name, delegataire_id: a2.id, delegataire_name: a2.name, domaine: r.pick(["travaux", "finances", "communication"]), description: "Délégation (données de test)", start_date: ymd(this.past(10, 100)), end_date: ymd(addDays(this.o.now, r.int(30, 200))), status: "active", created_by: c.admin.id }]);
      this.counts.set("governance_delegations", (this.counts.get("governance_delegations") ?? 0) + 1);
    }
  }

  // ─── Phase 3: payments of the calls for funds (issued by the engine) ──────
  /** Phase 4: real documents produced from the saved records (documents.ts). */
  async documents(tx: Tx, c: Ctx) {
    await documentsPhase({ rng: this.rng, now: this.o.now, order: this.o.order, counts: this.counts }, tx, c);
  }

  async payments(tx: Tx, c: Ctx) {
    const r = this.rng;
    const b = new Batch();
    const today = ymd(this.o.now);
    const calls = (await (tx as any)`
      SELECT a.id, a.lot_id, a.amount, a.due_date, a.issue_date, a.period, a.type, a.debtor_member_ids, a.allocation_id
      FROM appels_de_fonds a JOIN buildings bd ON bd.id = a.building_id
      WHERE bd.syndicate_id = ${c.sid} AND a.status = 'pending'`) as { id: string; lot_id: string; amount: string; due_date: string; issue_date: string; period: string; type: string; debtor_member_ids: string[]; allocation_id: string }[];
    // a stable payer profile per lot: how its owners pay
    const profile = new Map<string, "good" | "late" | "partial" | "bad">();
    const treasurer = c.team.find((u) => u.role === "treasurer") ?? c.admin;
    const updates: Row[] = [];
    for (const a of calls) {
      const prof = profile.get(a.lot_id) ?? r.weighted([["good", 64], ["late", 16], ["partial", 12], ["bad", 8]] as const);
      profile.set(a.lot_id, prof);
      const amountC = Math.round(Number(a.amount) * 100);
      const due = a.due_date;
      const pastDue = due < today;
      const issue = new Date(`${a.issue_date}T09:00:00Z`);
      const debtor = a.debtor_member_ids?.[0];
      const user = (debtor && c.ownerUserByMember.get(debtor)) || c.admin;
      let paidC = 0;
      const pays: { cents: number; date: Date; method: string; status: "validated" | "rejected" | "pending" }[] = [];
      const lastDay = addDays(this.o.now, -1);
      const when = (start: Date, minD: number, maxD: number) => {
        const d = addDays(start, r.int(minD, maxD));
        return d > lastDay ? lastDay : d;
      };
      if (pastDue) {
        if (prof === "good") pays.push({ cents: amountC, date: when(issue, 2, 28), method: r.pick(["virement", "virement", "cheque", "especes"]), status: "validated" });
        else if (prof === "late") {
          if (r.chance(0.75)) pays.push({ cents: amountC, date: when(new Date(`${due}T09:00:00Z`), 5, 70), method: r.pick(["virement", "cheque"]), status: "validated" });
        } else if (prof === "partial") {
          const part = Math.max(100, Math.round((amountC * r.int(30, 70)) / 100));
          pays.push({ cents: part, date: when(issue, 5, 40), method: "virement", status: "validated" });
          if (r.chance(0.3)) pays.push({ cents: amountC - part, date: when(issue, 45, 90), method: "virement", status: "validated" });
        }
        if (r.chance(0.06)) pays.unshift({ cents: amountC, date: when(issue, 1, 15), method: "cheque", status: "rejected" });
      } else {
        // current call, not yet due: some already paid, some declared and waiting for validation
        if (prof === "good" && r.chance(0.55)) pays.push({ cents: amountC, date: when(issue, 1, 18), method: "virement", status: "validated" });
      }
      // a declared payment awaiting validation (at most one per call)
      const remainingBefore = amountC - pays.filter((p) => p.status === "validated").reduce((s, p) => s + p.cents, 0);
      if (remainingBefore > 0 && r.chance(pastDue ? 0.04 : 0.1)) pays.push({ cents: remainingBefore, date: addDays(this.o.now, -r.int(0, 6)), method: "virement", status: "pending" });

      let lastPaidDate: string | null = null;
      let lastReceipt: string | null = null;
      let lastMethod: string | null = null;
      for (const p of pays) {
        const payId = r.uuid();
        const reviewed = p.status === "pending" ? null : addDays(p.date, r.int(0, 3) > 0 ? 1 : 0);
        if (reviewed && reviewed > this.o.now) reviewed.setTime(this.o.now.getTime() - 3_600_000);
        let ledgerId: string | null = null;
        let receipt: string | null = null;
        const amount = (p.cents / 100).toFixed(2);
        if (p.status === "validated") {
          ledgerId = r.uuid();
          receipt = nextNumber(c, "REC", reviewed!.getUTCFullYear(), 6);
          const account = p.method === "especes" ? c.cashAccountId : c.bankAccountId;
          b.add("ledger_entries", {
            id: ledgerId, syndicate_id: c.sid, account_id: account, entry_number: nextNumber(c, "JRN", reviewed!.getUTCFullYear(), 6), entry_date: ymd(reviewed!), direction: "in", amount, currency: "MAD",
            category: a.type === "fonds_reserve" ? "fonds_reserve" : a.type === "appel_special" ? "appel_special" : "charges_copropriete", label: `Appel de fonds ${a.period} — Reçu ${receipt}`, reference: receipt,
            source_type: "appel_payment", source_id: payId, created_by: treasurer.id, created_at: reviewed!,
          });
          paidC += p.cents;
          lastPaidDate = ymd(reviewed!);
          lastReceipt = receipt;
          lastMethod = p.method;
        }
        b.add("appel_payments", {
          id: payId, syndicate_id: c.sid, appel_id: a.id, amount, method: p.method, reference: p.method === "virement" ? `VIR-${r.int(100000, 999999)}` : p.method === "cheque" ? `CHQ-${r.int(1000000, 9999999)}` : null,
          status: p.status, declared_by: user.id, reviewed_by: reviewed ? treasurer.id : null, reviewed_at: reviewed, rejection_reason: p.status === "rejected" ? "Chèque revenu impayé" : null,
          account_id: p.status === "validated" ? (p.method === "especes" ? c.cashAccountId : c.bankAccountId) : null, ledger_entry_id: ledgerId, receipt_number: receipt, created_at: p.date,
        });
      }
      // final state of the call, exactly as settlementStatus() decides
      const pending = pays.some((p) => p.status === "pending");
      const status = pending ? "pending_validation" : paidC >= amountC ? "paid" : paidC > 0 ? "partially_paid" : pastDue ? "overdue" : "pending";
      updates.push({ id: a.id, amount_paid: (paidC / 100).toFixed(2), status, paid_date: status === "paid" ? lastPaidDate : null, receipt_number: lastReceipt, payment_method: lastMethod, validated_by: paidC > 0 ? treasurer.id : null, validated_at: lastPaidDate ? `${lastPaidDate}T10:00:00Z` : null });
      // one automatic reminder per overdue call (factual, no penalty)
      if (status === "overdue" && r.chance(0.7)) b.add("appel_reminders", { syndicate_id: c.sid, appel_id: a.id, kind: "overdue", remaining: ((amountC - paidC) / 100).toFixed(2), recipients: 1, created_at: addDays(new Date(`${due}T09:00:00Z`), 1) });
    }

    // payments first (with their ledger entries), then the calls' final state
    await flush(tx, b, this.o.order, this.counts);
    for (let i = 0; i < updates.length; i += 1000) {
      const chunk = updates.slice(i, i + 1000);
      await (tx as any)`
        UPDATE appels_de_fonds a SET amount_paid = v.amount_paid::numeric, status = v.status, paid_date = v.paid_date, receipt_number = v.receipt_number,
               payment_method = v.payment_method, validated_by = v.validated_by, validated_at = v.validated_at::timestamp
        FROM (SELECT * FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(id text, amount_paid text, status text, paid_date text, receipt_number text, payment_method text, validated_by text, validated_at text)) v
        WHERE a.id = v.id`;
    }
    // members' cotisation status follows their calls
    await (tx as any)`
      UPDATE members m SET cotisation_status = CASE
        WHEN EXISTS (SELECT 1 FROM appels_de_fonds a WHERE m.id = ANY(a.debtor_member_ids) AND a.status = 'overdue') THEN 'overdue'
        WHEN EXISTS (SELECT 1 FROM appels_de_fonds a WHERE m.id = ANY(a.debtor_member_ids) AND a.status IN ('pending','partially_paid','pending_validation')) THEN 'pending'
        ELSE 'paid' END
      WHERE m.syndicate_id = ${c.sid}`;

    // ── Bank statement of last month, reconciled with the journal ──
    const month = new Date(Date.UTC(this.o.now.getUTCFullYear(), this.o.now.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(this.o.now.getUTCFullYear(), this.o.now.getUTCMonth(), 0));
    const entries = (await (tx as any)`
      SELECT id, amount, direction, entry_date::text AS d, label FROM ledger_entries
      WHERE syndicate_id = ${c.sid} AND account_id = ${c.bankAccountId} AND entry_date BETWEEN ${ymd(month)} AND ${ymd(monthEnd)} ORDER BY entry_date`) as { id: string; amount: string; direction: string; d: string; label: string }[];
    if (entries.length) {
      const stId = r.uuid();
      await insertRows(tx, "bank_statements", [{ id: stId, syndicate_id: c.sid, account_id: c.bankAccountId, reference: `REL-${ymd(month).slice(0, 7)}`, period_start: ymd(month), period_end: ymd(monthEnd), opening_balance: "0", closing_balance: "0", status: "open", created_by: treasurer.id }]);
      const lines: Row[] = [];
      const matches: Row[] = [];
      entries.forEach((e, n) => {
        const lineId = r.uuid();
        const matched = r.chance(0.8);
        const signed = e.direction === "in" ? e.amount : `-${e.amount}`;
        lines.push({ id: lineId, syndicate_id: c.sid, account_id: c.bankAccountId, value_date: e.d, amount: signed, label: e.label.slice(0, 120), external_id: `${stId}-${n}`, status: matched ? "matched" : "unmatched", matched_amount: matched ? e.amount : "0", imported_by: treasurer.id, statement_id: stId });
        if (matched) matches.push({ syndicate_id: c.sid, statement_line_id: lineId, ledger_entry_id: e.id, amount: e.amount, matched_by: treasurer.id });
      });
      await insertRows(tx, "bank_statement_lines", lines);
      await insertRows(tx, "reconciliation_matches", matches);
      for (const [t, n] of [["bank_statements", 1], ["bank_statement_lines", lines.length], ["reconciliation_matches", matches.length]] as const) this.counts.set(t, (this.counts.get(t) ?? 0) + n);
    }

    // ── Document numbering continues after the generated numbers ──
    const seqRows = [...c.seq].map(([k, n]) => {
      const [prefix, y] = k.split("|");
      return { syndicate_id: c.sid, prefix, year: Number(y), current_value: n };
    });
    for (const s of seqRows) {
      await (tx as any)`
        INSERT INTO document_sequences (syndicate_id, prefix, year, current_value) VALUES (${s.syndicate_id}, ${s.prefix}, ${s.year}, ${s.current_value})
        ON CONFLICT (syndicate_id, prefix, year) DO UPDATE SET current_value = GREATEST(document_sequences.current_value, EXCLUDED.current_value)`;
    }
    this.counts.set("document_sequences", (this.counts.get("document_sequences") ?? 0) + seqRows.length);
  }
}

export { pool };
