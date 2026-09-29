/**
 * Regression suite for the 2026-09-29 production-readiness audit fixes.
 *
 * Usage (API must be running, SMTP disabled):
 *   API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run audit-regression:test
 *
 * Covers: grievance (réclamation) tenant isolation, residence-structure write
 * RBAC (lots, buildings, members, tenants), document comments routing and
 * access, admin-only SMTP test endpoint, notification-preference ownership and
 * client-error status propagation. Rows created here are removed in `finally`.
 */
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  documentCommentsTable,
  lotsTable,
  notificationPreferencesTable,
  reclamationsTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

type User = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`);
}
function expectStatus(name: string, actual: number, expected: number) {
  record(name, actual === expected, `expected ${expected}, received ${actual}`);
}

function tokenFor(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, syndicateId: user.syndicateId ?? undefined, name: user.name },
    JWT_SECRET!,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

async function user(id: string): Promise<User> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!row) throw new Error(`Fixture user ${id} missing — run pnpm db:seed`);
  return row;
}

async function api(token: string | null, path: string, method = "GET", body?: unknown, rawBody?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined || rawBody !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  const superAdmin = tokenFor(await user("user_super_admin"));
  const adminAtlas = tokenFor(await user("user_admin_atlas"));
  const adminAgdal = tokenFor(await user("user_admin_agdal"));
  const president = tokenFor(await user("user_president_atlas"));
  const treasurer = tokenFor(await user("user_treasurer_atlas"));
  const secretary = tokenFor(await user("user_secretary_atlas"));
  const committee = tokenFor(await user("user_committee_atlas"));
  const member1 = tokenFor(await user("user_member_1"));
  const memberAgdal = tokenFor(await user("user_member_3"));

  const createdReclamations: string[] = [];
  const createdComments: string[] = [];
  const [lotBefore] = await db.select().from(lotsTable).where(eq(lotsTable.id, "lot_b01"));
  const [recBefore] = await db.select().from(reclamationsTable).where(eq(reclamationsTable.id, "rec_1"));
  const [prefBefore] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.id, "pref_3"));
  if (!lotBefore || !recBefore || !prefBefore) throw new Error("Seed fixtures missing — run pnpm db:seed");

  try {
    // ── Réclamations: tenant isolation ────────────────────────────────────
    const listAgdal = await api(adminAgdal, "/reclamations?limit=100");
    const agdalIds: string[] = (listAgdal.json?.data ?? []).map((r: any) => r.id);
    record(
      "another syndicate's grievances are not listed",
      listAgdal.status === 200 && !agdalIds.includes("rec_1") && (listAgdal.json?.data ?? []).every((r: any) => r.syndicateId === "syn_jardins_agdal"),
      `status=${listAgdal.status} ids=${agdalIds.join(",")}`,
    );
    expectStatus("another syndicate's grievance cannot be read (IDOR)", (await api(adminAgdal, "/reclamations/rec_1")).status, 404);
    const foreignUpdate = await api(adminAgdal, "/reclamations/rec_1", "PUT", { statut: "classee", commentaireAdmin: "cross-tenant" });
    const [recAfter] = await db.select().from(reclamationsTable).where(eq(reclamationsTable.id, "rec_1"));
    record(
      "another syndicate's grievance cannot be modified",
      foreignUpdate.status === 404 && recAfter.statut === recBefore.statut && recAfter.commentaireAdmin === recBefore.commentaireAdmin,
      `status=${foreignUpdate.status} statut=${recAfter.statut}`,
    );
    expectStatus("own syndicate admin still reads its grievance", (await api(adminAtlas, "/reclamations/rec_1")).status, 200);
    const created = await api(memberAgdal, "/reclamations", "POST", {
      titre: "Audit — fuite parking",
      description: "Réclamation créée par la suite de régression d'audit.",
      type: "autre",
    });
    if (created.json?.data?.id) createdReclamations.push(created.json.data.id);
    record(
      "a new grievance is stamped with the author's syndicate",
      created.status === 201 && created.json?.data?.syndicateId === "syn_jardins_agdal",
      `status=${created.status} syndicateId=${created.json?.data?.syndicateId}`,
    );
    expectStatus(
      "super_admin must enable supervision to target one syndicate",
      (await api(superAdmin, "/reclamations?syndicateId=syn_residence_atlas")).status,
      403,
    );

    // ── Residence structure: write RBAC ───────────────────────────────────
    expectStatus("committee_member cannot modify a lot (tantièmes)", (await api(committee, "/lots/lot_b01", "PUT", { tantiemes: 999 })).status, 403);
    expectStatus("treasurer cannot create a lot", (await api(treasurer, "/lots", "POST", { number: "X-1", buildingId: lotBefore.buildingId })).status, 403);
    expectStatus("secretary cannot delete a lot", (await api(secretary, "/lots/lot_b01", "DELETE")).status, 403);
    const [lotAfter] = await db.select().from(lotsTable).where(eq(lotsTable.id, "lot_b01"));
    record("the lot is untouched after refused writes", !!lotAfter && lotAfter.tantiemes === lotBefore.tantiemes, `tantiemes=${lotAfter?.tantiemes}`);
    expectStatus("president keeps read access to lots", (await api(president, "/lots")).status, 200);
    expectStatus(
      "syndicate_admin can still update a lot",
      (await api(adminAtlas, "/lots/lot_b01", "PUT", { tantiemes: lotBefore.tantiemes })).status,
      200,
    );
    expectStatus("syndicate_admin cannot update another syndicate's lot", (await api(adminAgdal, "/lots/lot_b01", "PUT", { tantiemes: 1 })).status, 403);
    expectStatus("treasurer cannot add a co-owner", (await api(treasurer, "/members", "POST", { name: "Audit", email: "audit-rbac@example.invalid" })).status, 403);
    expectStatus("committee_member cannot create a building", (await api(committee, "/buildings", "POST", { name: "Audit", address: "x", city: "y" })).status, 403);
    expectStatus("president cannot register a tenant", (await api(president, "/locataires", "POST", { name: "Audit" })).status, 403);

    // ── Document comments ─────────────────────────────────────────────────
    const posted = await api(member1, "/documents/doc_1/comments", "POST", { content: "Commentaire d'audit" });
    if (posted.json?.data?.id) createdComments.push(posted.json.data.id);
    expectStatus("resident comments a published document at /documents/:id/comments", posted.status, 201);
    const teamRead = await api(president, "/documents/doc_1/comments");
    record(
      "team role (president) can read document comments",
      teamRead.status === 200 && (teamRead.json?.data ?? []).some((c: any) => c.id === posted.json?.data?.id),
      `status=${teamRead.status}`,
    );
    expectStatus("another syndicate cannot read the comments", (await api(memberAgdal, "/documents/doc_1/comments")).status, 403);
    expectStatus("another syndicate cannot comment", (await api(memberAgdal, "/documents/doc_1/comments", "POST", { content: "x" })).status, 403);
    const crossParent = await api(member1, "/documents/doc_2/comments", "POST", { content: "réponse", parentId: posted.json?.data?.id });
    if (crossParent.json?.data?.id) createdComments.push(crossParent.json.data.id);
    expectStatus("reply to a comment of another document is rejected", crossParent.status, 400);
    const del = await api(member1, `/documents/doc_1/comments/${posted.json?.data?.id}`, "DELETE");
    const afterDelete = await api(adminAtlas, "/documents/doc_1/comments");
    const deleted = (afterDelete.json?.data ?? []).find((c: any) => c.id === posted.json?.data?.id);
    record("deleted comment content is no longer returned", del.status === 200 && !!deleted && deleted.content === "", `delete=${del.status} content=${JSON.stringify(deleted?.content)}`);
    expectStatus("legacy root path /:id/comments is gone", (await api(member1, "/doc_1/comments")).status, 404);

    // ── Misc hardening ────────────────────────────────────────────────────
    expectStatus("residents cannot trigger SMTP test emails", (await api(member1, "/test-email", "POST")).status, 403);
    const foreignPref = await api(member1, "/notifications/preferences/pref_3", "PUT", { push: false });
    const [prefAfter] = await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.id, "pref_3"));
    record(
      "another user's notification preference cannot be changed",
      foreignPref.status === 404 && prefAfter.push === prefBefore.push,
      `status=${foreignPref.status} push=${prefAfter.push}`,
    );
    const malformed = await api(null, "/auth/login", "POST", undefined, "{not json");
    record(
      "malformed JSON is a 400 without parser details",
      malformed.status === 400 && malformed.json?.error === "Requête invalide",
      `status=${malformed.status} body=${JSON.stringify(malformed.json)}`,
    );
  } finally {
    if (createdComments.length) await db.delete(documentCommentsTable).where(inArray(documentCommentsTable.id, createdComments));
    if (createdReclamations.length) await db.delete(reclamationsTable).where(inArray(reclamationsTable.id, createdReclamations));
    await db.update(lotsTable).set({ tantiemes: lotBefore.tantiemes }).where(eq(lotsTable.id, "lot_b01"));
    await db
      .update(reclamationsTable)
      .set({ statut: recBefore.statut, commentaireAdmin: recBefore.commentaireAdmin, etapes: recBefore.etapes })
      .where(eq(reclamationsTable.id, "rec_1"));
    await db.update(notificationPreferencesTable).set({ push: prefBefore.push }).where(eq(notificationPreferencesTable.id, "pref_3"));
    await pool.end();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
