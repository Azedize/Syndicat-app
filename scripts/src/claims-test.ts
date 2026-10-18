/**
 * Claims & incidents — real HTTP API against PostgreSQL.
 *
 * A dedicated condominium (syndic, president, secretary, treasurer, council
 * member, two co-owners, a tenant, a provider) is created in the database;
 * everything else goes through the API. A notification failure is produced
 * with a temporary PostgreSQL trigger (real failed insert), then retried.
 * Everything is removed at the end.
 *
 * Usage: API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run claims:test
 */
import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  buildingsTable,
  claimEventsTable,
  claimNotificationsTable,
  claimsTable,
  lotOwnershipsTable,
  lotsTable,
  membersTable,
  organizationMembersTable,
  organizationsTable,
  prestatairesTable,
  storageObjectsTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
  tenantsTable,
  travauxTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
const UPLOADS = path.resolve("../artifacts/api-server", process.env.LOCAL_UPLOADS_DIR ?? "uploads");
const RUN = Date.now();
const SID = `syn_cl_${RUN}`;
const ORG = `org_cl_${RUN}`;
const BLD = `bld_cl_${RUN}`;
const YEAR = new Date().getFullYear();

type U = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const tokenFor = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicateId ?? undefined, name: u.name }, JWT_SECRET, { expiresIn: "15m" });
async function api(u: U, p: string, method = "GET", body?: unknown, key?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${tokenFor(u)}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
async function uploadAs(u: U, name: string) {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a7e5d8150000000049454e44ae426082", "hex");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), name);
  const r = await fetch(`${BASE}/storage/uploads`, { method: "POST", headers: { Authorization: `Bearer ${tokenFor(u)}` }, body: form });
  return ((await r.json()) as any)?.objectPath as string;
}
const fileStatus = async (u: U, objectPath: string) => (await fetch(`${BASE}/storage${objectPath}`, { headers: { Authorization: `Bearer ${tokenFor(u)}` } })).status;
const notifs = async (claimId: string) => db.select().from(claimNotificationsTable).where(eq(claimNotificationsTable.claimId, claimId));
const k = (s: string) => `cl-${RUN}-${s}`;

async function fixture() {
  await db.insert(organizationsTable).values({ id: ORG, name: `Syndic CL ${RUN}` });
  await db.insert(syndicatesTable).values({ id: SID, name: `Résidence Incidents ${RUN}`, status: "active", organizationId: ORG } as any);
  await db.insert(syndicateSubscriptionsTable).values({ syndicateId: SID, status: "trial", trialStartDate: new Date(), trialEndDate: new Date(Date.now() + 30 * 86_400_000), autoRenew: false } as any);
  const mk = (id: string, name: string, role: string) => ({ id: `${id}_${RUN}`, name, email: `${id}-${RUN}@example.invalid`, passwordHash: "x", role, status: "active", syndicateId: SID });
  const [A, P, SEC, T, C, O, O2, TN] = await db
    .insert(usersTable)
    .values([
      mk("cl_admin", "Samia Syndic", "syndicate_admin"),
      mk("cl_president", "Pierre Président", "president"),
      mk("cl_secretary", "Sonia Secrétaire", "secretary"),
      mk("cl_treasurer", "Tarek Trésorier", "treasurer"),
      mk("cl_council", "Chakib Technicien", "committee_member"),
      mk("cl_owner", "Omar Lot1", "member"),
      mk("cl_owner2", "Oumaima Lot2", "member"),
      mk("cl_tenant", "Tariq Locataire", "tenant"),
    ] as any)
    .returning();
  await db.insert(organizationMembersTable).values({ organizationId: ORG, userId: A.id, role: "org_admin" });
  await db.insert(buildingsTable).values({ id: BLD, name: "Bât. CL", address: "3 rue des Ascenseurs", city: "Tanger", syndicateId: SID } as any);
  const [m1, m2] = await db.insert(membersTable).values([{ name: O.name, email: O.email, syndicateId: SID }, { name: O2.name, email: O2.email, syndicateId: SID }]).returning();
  const [l1, l2] = await db
    .insert(lotsTable)
    .values([
      { number: "CL-1", buildingId: BLD, ownerId: m1.id, type: "appartement", floor: 1, tantiemes: 100, status: "rented" },
      { number: "CL-2", buildingId: BLD, ownerId: m2.id, type: "appartement", floor: 2, tantiemes: 100, status: "occupied" },
    ] as any)
    .returning();
  await db.insert(lotOwnershipsTable).values([
    { syndicateId: SID, lotId: l1.id, memberId: m1.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: l2.id, memberId: m2.id, sharePercent: "100", startDate: "2020-01-01" },
  ] as any);
  await db.insert(tenantsTable).values({ name: TN.name, email: TN.email, lotId: l1.id, syndicateId: SID, status: "active" } as any);
  const [PR] = await db.insert(prestatairesTable).values({ name: "Ascenseurs du Nord", type: "ascenseur", syndicateId: SID, buildingId: BLD, status: "active" } as any).returning();
  return { A, P, SEC, T, C, O, O2, TN, L1: l1.id, L2: l2.id, PR: PR.id };
}

async function purge() {
  const objects = await db.select({ p: storageObjectsTable.objectPath }).from(storageObjectsTable).where(eq(storageObjectsTable.syndicateId, SID));
  await db.transaction(async (tx) => {
    for (const t of ["claim_notifications", "claim_attachments", "claim_events"]) await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE syndicate_id = ${SID}`);
    await tx.execute(sql`DELETE FROM claims WHERE syndicate_id = ${SID}`);
    await tx.execute(sql`DELETE FROM travaux WHERE building_id = ${BLD}`);
    for (const t of ["tenants", "lot_ownerships", "audit_logs", "alerts", "syndicate_subscriptions", "document_sequences", "prestataires"]) await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE syndicate_id = ${SID}`);
    await tx.delete(storageObjectsTable).where(eq(storageObjectsTable.syndicateId, SID));
    await tx.execute(sql`DELETE FROM organization_members WHERE organization_id = ${ORG}`);
    await tx.delete(usersTable).where(eq(usersTable.syndicateId, SID));
    await tx.delete(syndicatesTable).where(eq(syndicatesTable.id, SID));
    await tx.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
  });
  for (const o of objects) await fs.unlink(path.join(UPLOADS, path.basename(o.p))).catch(() => {});
}

async function main() {
  const atlasAdmin = (await db.select().from(usersTable).where(eq(usersTable.id, "user_admin_atlas")))[0];
  const atlasResident = (await db.select().from(usersTable).where(eq(usersTable.id, "user_member_1")))[0];
  const [atlasProvider] = (await db.execute(sql`SELECT id FROM prestataires WHERE syndicate_id = 'syn_residence_atlas' LIMIT 1`)) as unknown as { id: string }[];
  const f = await fixture();
  const { A, P, SEC, T, C, O, O2, TN, L1, L2, PR } = f;
  let triggerInstalled = false;

  try {
    // ═══ A. Resident reports ══════════════════════════════════════════════
    const photo = await uploadAs(O, "fuite-hall.png");
    const body = { title: "Fuite au plafond du hall", description: "De l'eau coule du plafond près de l'ascenseur depuis ce matin.", category: "fuite_eau", location: "Hall B, rez-de-chaussée", attachments: [photo], priority: "urgent" };
    const [c1a, c1b] = await Promise.all([api(O, "/claims", "POST", body, k("create-1")), api(O, "/claims", "POST", body, k("create-1"))]);
    const created = c1a.status === 201 ? c1a : c1b;
    const C1 = created.json?.data;
    const sameClaim = c1a.json?.data?.id === c1b.json?.data?.id;
    step("the resident's claim is saved with a sequential reference, status and timestamp", !!C1?.id && C1.reference === `RCL-${YEAR}-000001` && C1.status === "received" && !!C1.createdAt, `${created.status} ${C1?.reference}`);
    step("the same submission sent twice at once creates one claim", sameClaim && [c1a.status, c1b.status].sort().join() === "200,201", `${c1a.status}/${c1b.status}`);
    step("a later retry returns the saved claim (replay)", (await api(O, "/claims", "POST", body, k("create-1"))).json?.replayed === true);
    step("a resident cannot set the priority (the team qualifies it)", C1?.priority === "normal");
    const saved = await api(O, `/claims/${C1?.id}`);
    step("what the app shows is the record read back from the database", saved.json?.data?.reference === C1?.reference && saved.json?.data?.attachments?.length === 1 && saved.json?.data?.events?.[0]?.type === "created");
    step("missing location refused", (await api(O, "/claims", "POST", { ...body, location: "", attachments: [] })).json?.field === "location");
    step("too short description refused", (await api(O, "/claims", "POST", { ...body, description: "fuite", attachments: [] })).status === 400);
    step("unknown category refused", (await api(O, "/claims", "POST", { ...body, category: "magie", attachments: [] })).status === 400);
    step("a resident cannot report for a unit that is not theirs", (await api(O, "/claims", "POST", { ...body, scope: "unit", lotId: L2, attachments: [] })).json?.code === "LOT_NOT_YOURS");
    const notMine = await uploadAs(O2, "autre.png");
    step("a photo uploaded by someone else cannot be attached", (await api(O, "/claims", "POST", { ...body, attachments: [notMine] })).json?.code === "ATTACHMENT_NOT_OWNED");
    step("the same photo cannot be attached twice", (await api(O, "/claims", "POST", { ...body, attachments: [photo] }, k("dup-photo"))).json?.code === "ATTACHMENT_ALREADY_USED");
    const tenantClaim = await api(TN, "/claims", "POST", { title: "Interphone muet", description: "L'interphone de mon appartement ne sonne plus.", category: "electricite", location: "Appartement CL-1", scope: "unit", lotId: L1 });
    step("the tenant reports for the unit they rent", tenantClaim.status === 201 && tenantClaim.json?.data?.reference === `RCL-${YEAR}-000002`);
    const n1 = await notifs(C1?.id);
    step("submission notifies the managers once each (syndic, president, secretary)", n1.length === 3 && n1.every((n) => n.status === "sent") && [A.id, P.id, SEC.id].every((id) => n1.some((n) => n.userId === id)), `${n1.length}`);

    // ═══ B. Visibility ═══════════════════════════════════════════════════
    step("a neighbour cannot open the claim", (await api(O2, `/claims/${C1?.id}`)).status === 404);
    step("a neighbour's list does not contain it", !((await api(O2, "/claims")).json?.data ?? []).some((c: any) => c.id === C1?.id));
    step("another condominium cannot open it", (await api(atlasAdmin, `/claims/${C1?.id}`)).status === 404 && !((await api(atlasResident, "/claims")).json?.data ?? []).some((c: any) => c.id === C1?.id));
    step("residents have no board", (await api(O, "/claims/board")).status === 403);
    step("the treasurer reads the board but cannot move or assign", (await api(T, "/claims/board")).status === 200 && (await api(T, `/claims/${C1?.id}/transition`, "POST", { to: "qualified", expectedVersion: 1 })).status === 403 && (await api(T, `/claims/${C1?.id}/assign`, "POST", { expectedVersion: 1, assigneeUserId: C.id })).status === 403);
    step("photo of the claim: reporter and team; not a neighbour", (await fileStatus(O, photo)) === 200 && (await fileStatus(A, photo)) === 200 && (await fileStatus(C, photo)) === 200 && (await fileStatus(O2, photo)) === 403);

    // ═══ C. Workflow & Kanban ════════════════════════════════════════════
    const q = await api(A, `/claims/${C1.id}/transition`, "POST", { to: "qualified", expectedVersion: 1 });
    step("syndic qualifies the claim (version 1 → 2)", q.status === 200 && q.json?.data?.status === "qualified" && q.json?.data?.version === 2);
    step("an invalid move is refused (qualified → resolved)", (await api(A, `/claims/${C1.id}/transition`, "POST", { to: "resolved", expectedVersion: 2, resolution: "x".repeat(20) })).json?.code === "INVALID_TRANSITION");
    const stale = await api(A, `/claims/${C1.id}/transition`, "POST", { to: "rejected", expectedVersion: 1, reason: "doublon" });
    step("a stale card (old version) is refused with the current claim", stale.status === 409 && stale.json?.code === "CLAIM_STALE" && stale.json?.current?.version === 2 && stale.json?.current?.status === "qualified");
    step("moving to « assigned » needs a responsible party", (await api(A, `/claims/${C1.id}/transition`, "POST", { to: "assigned", expectedVersion: 2 })).json?.code === "ASSIGNMENT_REQUIRED");
    step("cannot assign a resident", (await api(A, `/claims/${C1.id}/assign`, "POST", { expectedVersion: 2, assigneeUserId: O.id })).json?.code === "ASSIGNEE_NOT_ALLOWED");
    step("cannot assign another condominium's syndic", (await api(A, `/claims/${C1.id}/assign`, "POST", { expectedVersion: 2, assigneeUserId: atlasAdmin.id })).json?.code === "ASSIGNEE_NOT_ALLOWED");
    if (atlasProvider) step("cannot assign another condominium's provider", (await api(A, `/claims/${C1.id}/assign`, "POST", { expectedVersion: 2, prestataireId: atlasProvider.id })).json?.code === "PROVIDER_NOT_ALLOWED");
    const pr = await api(A, `/claims/${C1.id}/priority`, "POST", { priority: "urgent", expectedVersion: 2 });
    step("syndic raises the priority: the deadline follows (24 h)", pr.status === 200 && Math.abs(new Date(pr.json?.data?.dueAt).getTime() - new Date(C1.createdAt).getTime() - 24 * 3_600_000) < 5000);
    const asg = await api(A, `/claims/${C1.id}/assign`, "POST", { expectedVersion: 3, assigneeUserId: C.id, prestataireId: PR, instructions: "Code du local technique : CODE-ZK7Q. Devis plafond DEVIS-XQ9 MAD." }, k("assign-1"));
    step("syndic assigns the technician and the lift company", asg.status === 200 && asg.json?.data?.status === "assigned" && asg.json?.data?.assigneeName === C.name && asg.json?.data?.providerName === "Ascenseurs du Nord");
    const resView = (await api(O, `/claims/${C1.id}`)).json?.data;
    step("the resident sees who is in charge, not the internal instructions", resView?.assigneeName === C.name && !JSON.stringify(resView).includes("CODE-ZK7Q") && !JSON.stringify(resView).includes("DEVIS-XQ9") && resView?.assigneeUserId === undefined);
    const nAssign = (await notifs(C1.id)).filter((n) => n.userId === C.id || n.userId === O.id);
    step("assignment notifies the technician and the resident", nAssign.some((n) => n.userId === C.id) && nAssign.some((n) => n.userId === O.id));
    const before = (await notifs(C1.id)).length;
    const replay = await api(A, `/claims/${C1.id}/assign`, "POST", { expectedVersion: 3, assigneeUserId: C.id, prestataireId: PR }, k("assign-1"));
    step("a retried assignment (same key) changes nothing and notifies nobody", replay.status === 200 && (await notifs(C1.id)).length === before);
    const v4 = asg.json?.data?.version;
    const [m1, m2] = await Promise.all([
      api(C, `/claims/${C1.id}/transition`, "POST", { to: "in_progress", expectedVersion: v4 }),
      api(C, `/claims/${C1.id}/transition`, "POST", { to: "in_progress", expectedVersion: v4 }),
    ]);
    const inProgressEvents = (await db.select().from(claimEventsTable).where(and(eq(claimEventsTable.claimId, C1.id), eq(claimEventsTable.toStatus, "in_progress"), eq(claimEventsTable.type, "status")))).length;
    step("the same drag sent twice: one move, the repeat is acknowledged", m1.status === 200 && m2.status === 200 && inProgressEvents === 1, `${m1.status}/${m2.status} events=${inProgressEvents}`);
    step("the technician cannot reassign; a team member not in charge cannot move it", (await api(C, `/claims/${C1.id}/assign`, "POST", { expectedVersion: v4 + 1, assigneeUserId: T.id })).status === 403 && (await api(T, `/claims/${C1.id}/transition`, "POST", { to: "awaiting_info", expectedVersion: v4 + 1, question: "Qui êtes-vous ?" })).status === 403);
    step("asking information needs a question", (await api(C, `/claims/${C1.id}/transition`, "POST", { to: "awaiting_info", expectedVersion: v4 + 1 })).json?.code === "QUESTION_REQUIRED");
    const ask = await api(C, `/claims/${C1.id}/transition`, "POST", { to: "awaiting_info", expectedVersion: v4 + 1, question: "La fuite est-elle toujours active ce soir ?" });
    step("the technician asks the resident (awaiting information)", ask.status === 200 && ask.json?.data?.status === "awaiting_info");
    const ans = await api(O, `/claims/${C1.id}/comments`, "POST", { text: "Oui, toujours, plus fort près de la porte." }, k("answer-1"));
    const afterAns = (await api(A, `/claims/${C1.id}`)).json?.data;
    step("the resident's answer puts the claim back in progress", ans.status === 201 && afterAns?.status === "in_progress" && afterAns?.events?.some((e: any) => e.type === "info_provided"));
    step("a resident cannot write internal notes", (await api(O, `/claims/${C1.id}/comments`, "POST", { text: "note", internal: true })).status === 403);
    await api(A, `/claims/${C1.id}/comments`, "POST", { text: "Prévoir peut-être le remplacement du joint, devis à demander.", internal: true });
    const sch = await api(A, `/claims/${C1.id}/schedule`, "POST", { expectedVersion: afterAns.version + 1, scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), instructions: "Couper l'eau colonne B", createWorkOrder: true }, k("sched-1"));
    const [wo] = sch.json?.data?.travauxId ? await db.select().from(travauxTable).where(eq(travauxTable.id, sch.json.data.travauxId)) : [];
    step("intervention scheduled, with the provider's work order (existing workflow)", sch.status === 200 && !!sch.json?.data?.scheduledFor && wo?.prestataireId === PR && wo?.status === "assigned", `${sch.status} ${sch.json?.error ?? ""}`);
    const work = await api(C, `/claims/${C1.id}/work`, "POST", { description: "Joint de canalisation remplacé, plafond séché.", materials: "Joint PVC 40 mm", cost: "4321.99", durationMinutes: 90 });
    const resAfterWork = (await api(O, `/claims/${C1.id}`)).json?.data;
    step("work recorded; the resident sees what was done, not materials or cost", work.status === 201 && resAfterWork?.events?.some((e: any) => e.type === "work" && e.body?.includes("Joint")) && !JSON.stringify(resAfterWork).includes("4321") && !JSON.stringify(resAfterWork).includes("Joint PVC") && !JSON.stringify(resAfterWork).includes("remplacement du joint, devis"));
    const staffPublic = await uploadAs(C, "apres.png");
    const staffInternal = await uploadAs(C, "devis.png");
    await api(C, `/claims/${C1.id}/attachments`, "POST", { objectPath: staffPublic });
    await api(C, `/claims/${C1.id}/attachments`, "POST", { objectPath: staffInternal, internal: true });
    step("evidence photos: the resident opens the shared one, not the internal one", (await fileStatus(O, staffPublic)) === 200 && (await fileStatus(O, staffInternal)) === 403 && (await fileStatus(A, staffInternal)) === 200);

    // ═══ D. Resolution & reopening ═══════════════════════════════════════
    const v = (await api(A, `/claims/${C1.id}`)).json?.data?.version;
    step("resolving needs the explanation", (await api(C, `/claims/${C1.id}/transition`, "POST", { to: "resolved", expectedVersion: v })).json?.code === "RESOLUTION_REQUIRED");
    const res1 = await api(C, `/claims/${C1.id}/transition`, "POST", { to: "resolved", expectedVersion: v, resolution: "Joint remplacé, plus aucune fuite constatée." });
    const [row1] = await db.select().from(claimsTable).where(eq(claimsTable.id, C1.id));
    step("resolved: who, when and why are recorded", res1.status === 200 && row1.resolvedBy === C.id && !!row1.resolvedAt && row1.resolution?.startsWith("Joint") === true);
    const [resolvedEv] = await db.select().from(claimEventsTable).where(and(eq(claimEventsTable.claimId, C1.id), eq(claimEventsTable.type, "resolved")));
    step("the resident is notified of the resolution", (await notifs(C1.id)).some((n) => n.userId === O.id && n.status === "sent" && n.eventId === resolvedEv?.id));
    const eventsBefore = (await db.select().from(claimEventsTable).where(eq(claimEventsTable.claimId, C1.id))).length;
    step("reopening needs a reason", (await api(O, `/claims/${C1.id}/reopen`, "POST", { reason: "encore" })).status === 400);
    const ro = await api(O, `/claims/${C1.id}/reopen`, "POST", { reason: "La fuite est revenue ce matin au même endroit." }, k("reopen-1"));
    const eventsAfter = await db.select().from(claimEventsTable).where(eq(claimEventsTable.claimId, C1.id));
    const reopenedEvent = eventsAfter.find((e) => e.type === "reopened");
    step("the resident reopens: back in progress, count 1", ro.status === 200 && ro.json?.data?.status === "in_progress" && ro.json?.data?.reopenCount === 1);
    step("history preserved: nothing removed, previous resolution kept in the reopen event", eventsAfter.length === eventsBefore + 1 && (reopenedEvent?.data as any)?.previousResolution?.startsWith("Joint") && eventsAfter.some((e) => e.type === "resolved"));
    step("reopen notifies the technician and the managers", (await notifs(C1.id)).some((n) => n.userId === C.id && n.eventId === reopenedEvent?.id) && (await notifs(C1.id)).some((n) => n.userId === A.id && n.eventId === reopenedEvent?.id));
    const v2 = ro.json?.data?.version;
    await api(C, `/claims/${C1.id}/transition`, "POST", { to: "resolved", expectedVersion: v2, resolution: "Canalisation remplacée sur 2 mètres." });
    const conf = await api(O, `/claims/${C1.id}/confirm`, "POST", {});
    step("the resident confirms the fix: closed", conf.status === 200 && conf.json?.data?.status === "closed");
    await db.update(claimsTable).set({ closedAt: new Date(Date.now() - 40 * 86_400_000) }).where(eq(claimsTable.id, C1.id));
    step("after 30 days the resident can no longer reopen", (await api(O, `/claims/${C1.id}/reopen`, "POST", { reason: "Encore une fuite au même endroit." })).json?.code === "REOPEN_WINDOW_PASSED");
    step("a manager still can", (await api(A, `/claims/${C1.id}/reopen`, "POST", { reason: "Contrôle demandé par le conseil syndical." })).status === 200);
    await db.update(claimsTable).set({ status: "resolved", resolution: "OK", resolvedAt: new Date(), reopenCount: 3 }).where(eq(claimsTable.id, C1.id));
    step("reopening is limited for residents (3 times)", (await api(O, `/claims/${C1.id}/reopen`, "POST", { reason: "Toujours pas réglé chez moi." })).json?.code === "REOPEN_LIMIT");

    // ═══ E. Concurrency between two staff members ════════════════════════
    const c2 = (await api(O2, "/claims", "POST", { title: "Ampoule grillée escalier", description: "L'éclairage de l'escalier du 2e étage ne fonctionne plus.", category: "eclairage", location: "Escalier, 2e étage" })).json?.data;
    const [x1, x2] = await Promise.all([
      api(A, `/claims/${c2.id}/transition`, "POST", { to: "qualified", expectedVersion: 1 }),
      api(P, `/claims/${c2.id}/transition`, "POST", { to: "rejected", expectedVersion: 1, reason: "Doublon d'une autre demande" }),
    ]);
    const [c2row] = await db.select().from(claimsTable).where(eq(claimsTable.id, c2.id));
    step("two staff members move the same card at once: one wins, the other gets the saved state", [x1.status, x2.status].sort().join() === "200,409" && c2row.version === 2 && [x1, x2].find((x) => x.status === 409)?.json?.current?.version === 2, `${x1.status}/${x2.status}`);
    step("a move on a claim that does not exist", (await api(A, "/claims/00000000-0000-0000-0000-000000000000/transition", "POST", { to: "qualified", expectedVersion: 1 })).json?.code === "CLAIM_NOT_FOUND");

    // ═══ F. Notification failure and retry ═══════════════════════════════
    await db.execute(sql.raw(`CREATE OR REPLACE FUNCTION cl_fail_${RUN}() RETURNS trigger AS $$ BEGIN IF NEW.recipient_user_id = '${O2.id}' THEN RAISE EXCEPTION 'push gateway down (test)'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`));
    await db.execute(sql.raw(`CREATE TRIGGER cl_fail_${RUN} BEFORE INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION cl_fail_${RUN}()`));
    triggerInstalled = true;
    const c2v = c2row.version;
    const c2target = c2row.status === "qualified" ? { to: "awaiting_info", question: "Quel palier exactement ?" } : null;
    let failedRow: any = null;
    if (c2target) {
      const r = await api(A, `/claims/${c2.id}/transition`, "POST", { ...c2target, expectedVersion: c2v });
      failedRow = (await notifs(c2.id)).find((n) => n.userId === O2.id && n.status === "failed");
      step("a notification failure does not cancel the operation; it is recorded as failed", r.status === 200 && !!failedRow, `${r.status} ${failedRow?.error ?? ""}`);
    } else {
      // The concurrent test above rejected the claim: use a new one.
      const c3 = (await api(O2, "/claims", "POST", { title: "Odeur de gaz cave", description: "Odeur suspecte dans le couloir des caves depuis hier.", category: "securite", location: "Sous-sol, couloir des caves" })).json?.data;
      const r = await api(A, `/claims/${c3.id}/transition`, "POST", { to: "awaiting_info", expectedVersion: 1, question: "Quelle cave exactement ?" });
      failedRow = (await notifs(c3.id)).find((n) => n.userId === O2.id && n.status === "failed");
      step("a notification failure does not cancel the operation; it is recorded as failed", r.status === 200 && !!failedRow, `${r.status} ${failedRow?.error ?? ""}`);
    }
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS cl_fail_${RUN} ON alerts`));
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS cl_fail_${RUN}()`));
    triggerInstalled = false;
    const retry = await api(A, "/claims/notifications/retry", "POST", {});
    const [after] = failedRow ? await db.select().from(claimNotificationsTable).where(eq(claimNotificationsTable.id, failedRow.id)) : [];
    step("failed notifications are re-delivered once, sent ones are not re-sent", retry.json?.data?.sent >= 1 && after?.status === "sent" && after?.attempts === 2 && (await api(A, "/claims/notifications/retry", "POST", {})).json?.data?.retried === 0);

    // ═══ G. Board, counters, metrics ═════════════════════════════════════
    const overdueClaim = (await api(A, "/claims", "POST", { title: "Ascenseur bloqué au 3e", description: "L'ascenseur est bloqué au 3e étage, portes fermées.", category: "ascenseur", location: "Ascenseur principal", priority: "urgent" })).json?.data;
    await db.update(claimsTable).set({ createdAt: new Date(Date.now() - 3 * 86_400_000), dueAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(claimsTable.id, overdueClaim.id));
    const board = (await api(A, "/claims/board")).json?.data;
    const dbCounts = (await db.execute(sql`SELECT status, COUNT(*)::int AS n FROM claims WHERE syndicate_id = ${SID} GROUP BY status`)) as unknown as { status: string; n: number }[];
    const colOk = board.columns.every((col: any) => col.total === (dbCounts.find((d) => d.status === col.status)?.n ?? 0) && col.cards.every((c: any) => c.status === col.status));
    step("board columns = workflow states, totals = database counts, each card in its column", colOk, JSON.stringify(board.columns.map((c: any) => [c.status, c.total])));
    const urgentCard = board.columns.find((c: any) => c.status === "received")?.cards?.[0];
    step("cards: reference, title, category, location, priority, date, overdue flag", urgentCard?.id === overdueClaim.id && urgentCard.overdue === true && !!urgentCard.reference && !!urgentCard.location && urgentCard.priority === "urgent");
    const metrics = (await api(A, "/claims/metrics")).json?.data;
    const [dbm] = (await db.execute(sql`SELECT COUNT(*) FILTER (WHERE status IN ('received','qualified','assigned','in_progress','awaiting_info'))::int AS open, COUNT(*) FILTER (WHERE status IN ('received','qualified','assigned','in_progress','awaiting_info') AND due_at < now())::int AS overdue FROM claims WHERE syndicate_id = ${SID}`)) as unknown as { open: number; overdue: number }[];
    step("metrics computed from the records (open, overdue) with definitions", metrics?.open === dbm.open && metrics?.overdue === dbm.overdue && metrics.overdue >= 1 && typeof metrics?.definitions?.overdue === "string", `${metrics?.open}/${dbm.open} ${metrics?.overdue}/${dbm.overdue}`);
    const filtered = (await api(A, "/claims?overdue=true")).json;
    step("the « overdue » filter uses the same definition", filtered?.total === dbm.overdue);
    step("average resolution time from resolved claims", typeof metrics?.avg_resolution_hours === "number");
    step("search by reference", ((await api(A, `/claims?q=${encodeURIComponent(C1.reference)}`)).json?.data ?? []).some((c: any) => c.id === C1.id));

    // ═══ H. Same claim everywhere, legacy routes, lifecycle ══════════════
    const asResident = (await api(O, `/claims/${C1.id}`)).json?.data;
    const asSyndic = (await api(A, `/claims/${C1.id}`)).json?.data;
    const onBoard = (await api(A, "/claims/board?includeArchived=true")).json?.data?.columns?.flatMap((c: any) => c.cards)?.find((c: any) => c.id === C1.id);
    step("the same claim reads the same for the resident, the record and the board", asResident?.status === asSyndic?.status && asSyndic?.status === onBoard?.status && asResident?.version === onBoard?.version && asResident?.reference === onBoard?.reference);
    step("the former unscoped grievance routes are closed", (await api(A, "/reclamations")).status === 410 && (await api(A, "/conversations/incident", "POST", { incidentId: "x" })).status === 410);
    await db.update(syndicatesTable).set({ status: "suspended" }).where(eq(syndicatesTable.id, SID));
    const susp = await api(O, "/claims", "POST", { title: "Test suspension", description: "Copropriété suspendue, écriture refusée.", category: "autre", location: "Hall" });
    await db.update(syndicatesTable).set({ status: "active" }).where(eq(syndicatesTable.id, SID));
    step("a suspended condominium accepts no new claim", susp.status === 423, `${susp.status}`);
  } finally {
    if (triggerInstalled) {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS cl_fail_${RUN} ON alerts`)).catch(() => {});
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS cl_fail_${RUN}()`)).catch(() => {});
    }
    await purge();
    const left = ((await db.execute(sql`SELECT (SELECT COUNT(*) FROM claims WHERE syndicate_id = ${SID}) + (SELECT COUNT(*) FROM syndicates WHERE id = ${SID}) + (SELECT COUNT(*) FROM claim_events WHERE syndicate_id = ${SID}) AS n`)) as unknown as { n: string }[])[0].n;
    step("everything created by the suite is removed", Number(left) === 0, `left=${left}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} claims checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Claims suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
