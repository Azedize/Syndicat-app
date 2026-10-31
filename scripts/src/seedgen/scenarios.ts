/**
 * Edge-case scenarios for a generated run (additive, idempotent).
 *
 * The main generator gives every condominium documents and every account a
 * residence. Two real situations were therefore missing:
 *   - a residence that has no document at all yet (new condominium: empty
 *     library, empty statutes, empty market) — with a very long name;
 *   - accounts without a residence: a syndic who signed up and has not yet
 *     created their condominium (the self-registration flow creates exactly
 *     that: role syndicate_admin, no syndicate).
 *
 * Fixed ids (`scn-s<seed>-…`): a second run adds nothing. Everything hangs off
 * the run's markers (creation_key `seedgen:s<seed>:…`, e-mails of the run's
 * domain), so `cleanup --seed N` and `reset` remove it.
 */
import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
import { insertRows, type Row } from "./db.js";
import { runDomain, TEST_PASSWORD } from "./generate.js";

export async function seedScenarios(seed: number, log: (s: string) => void) {
  const p = `scn-s${seed}`;
  const domain = runDomain(seed);
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const now = new Date();
  const sid = `${p}-nodocs`;
  const already = ((await pool.unsafe(`SELECT id FROM syndicates WHERE id = $1`, [sid])) as unknown as unknown[]).length > 0;

  const rows: Record<string, Row[]> = {
    syndicates: [{
      id: sid,
      name: "Résidence Les Jardins Suspendus de l'Atlas — Tranche 2, Immeubles C, D et E (copropriété nouvellement créée)",
      status: "active",
      city: "Marrakech",
      address: "Route de l'Ourika, km 7",
      creation_key: `seedgen:s${seed}:scn-nodocs`,
      created_at: now,
    }],
    syndicate_subscriptions: [{ id: `${p}-nodocs-sub`, syndicate_id: sid, status: "trial", trial_end_date: new Date(now.getTime() + 60 * 86_400_000), created_at: now }],
    buildings: [{ id: `${p}-nodocs-b1`, syndicate_id: sid, name: "Immeuble C", address: "Route de l'Ourika, km 7" }],
    lots: ["C01", "C02", "C03"].map((n, i) => ({ id: `${p}-nodocs-lot${i + 1}`, building_id: `${p}-nodocs-b1`, number: n, type: "appartement", status: "occupied" })),
    users: [
      { id: `${p}-nodocs-syndic`, name: "Salma Berrada", email: `salma.berrada.nodocs@${domain}`, password_hash: hash, role: "syndicate_admin", status: "active", syndicate_id: sid, email_status: "undeliverable", created_at: now },
      { id: `${p}-nodocs-m1`, name: "Youssef Amrani", email: `youssef.amrani.nodocs@${domain}`, password_hash: hash, role: "member", status: "active", syndicate_id: sid, email_status: "undeliverable", created_at: now },
      { id: `${p}-nodocs-m2`, name: "Nadia El Fassi", email: `nadia.elfassi.nodocs@${domain}`, password_hash: hash, role: "member", status: "active", syndicate_id: sid, email_status: "undeliverable", created_at: now },
      // Signed up, condominium not created yet.
      { id: `${p}-noresidence-1`, name: "Karim Lahlou", email: `karim.lahlou.noresidence@${domain}`, password_hash: hash, role: "syndicate_admin", status: "active", syndicate_id: null, email_status: "undeliverable", created_at: now },
      { id: `${p}-noresidence-2`, name: "Imane Tazi", email: `imane.tazi.noresidence@${domain}`, password_hash: hash, role: "syndicate_admin", status: "active", syndicate_id: null, email_status: "undeliverable", created_at: now },
    ],
    members: [
      { id: `${p}-nodocs-mem1`, syndicate_id: sid, name: "Youssef Amrani", email: `youssef.amrani.nodocs@${domain}`, status: "active", created_at: now },
      { id: `${p}-nodocs-mem2`, syndicate_id: sid, name: "Nadia El Fassi", email: `nadia.elfassi.nodocs@${domain}`, status: "active", created_at: now },
    ],
  };
  if (already) {
    log(`Scénarios : déjà présents (${sid}) — rien d'ajouté`);
    return { added: 0 };
  }
  let added = 0;
  await pool.begin(async (tx: any) => {
    for (const table of ["syndicates", "syndicate_subscriptions", "buildings", "lots", "users", "members"]) added += await insertRows(tx, table, rows[table]);
  });
  log(`Scénarios : résidence sans document (${sid}, 3 lots, syndic + 2 copropriétaires) et 2 syndics sans résidence — ${added} lignes`);
  return { added };
}
