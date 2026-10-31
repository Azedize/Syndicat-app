/**
 * Document library and file access — real HTTP API against PostgreSQL and
 * the real storage (local uploads directory of the test API).
 *
 * A dedicated condominium is created in the database (syndic, president,
 * treasurer, council member, two co-owners, a tenant, two lots, a call for
 * funds); every action then goes through the API. A second API instance is
 * started with an unwritable storage directory to test a storage outage.
 * Everything is removed at the end (rows and files).
 *
 * Usage (API running on API_BASE_URL, built in artifacts/api-server/dist):
 *   API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run documents-library:test
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import jwt from "jsonwebtoken";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  appelsDeFondsTable,
  auditLogsTable,
  buildingsTable,
  conversationsTable,
  documentsTable,
  lotOwnershipsTable,
  lotsTable,
  membersTable,
  messagesTable,
  organizationsTable,
  payslipsTable,
  storageObjectsTable,
  syndicateMembershipsTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
  tenantsTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
const API_DIR = path.resolve("../artifacts/api-server");
const UPLOADS = path.resolve(API_DIR, process.env.LOCAL_UPLOADS_DIR ?? "uploads");
const RUN = Date.now();
const SID = `syn_dl_${RUN}`;
const ORG = `org_dl_${RUN}`;
const BLD = `bld_dl_${RUN}`;

type U = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const tokenFor = (u: { id: string; email: string; role: string; syndicateId: string | null; name: string }, ctx?: { role: string; syndicateId: string }) =>
  jwt.sign({ userId: u.id, email: u.email, role: ctx?.role ?? u.role, syndicateId: ctx?.syndicateId ?? u.syndicateId ?? undefined, name: u.name }, JWT_SECRET, { expiresIn: "15m" });
async function api(u: U | string | null, p: string, method = "GET", body?: unknown, base = BASE) {
  const headers: Record<string, string> = {};
  if (u) headers.Authorization = `Bearer ${typeof u === "string" ? u : tokenFor(u)}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
async function upload(u: U, fields: Record<string, string>, file?: { bytes: Buffer; name: string; type: string }, p = "/documents/upload", base = BASE) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  const res = await fetch(`${base}${p}`, { method: "POST", headers: { Authorization: `Bearer ${tokenFor(u)}` }, body: form });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const fileGet = async (url: string, token?: string) => {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: any = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {}
  return { status: res.status, buf, json, headers: res.headers };
};

const pdf = (marker: string) => Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const HTML = Buffer.from("<html><script>alert(document.cookie)</script></html>");
const ZIP = Buffer.from("504b0304140000000000", "hex");

async function fixture() {
  await db.insert(organizationsTable).values({ id: ORG, name: `Syndic DL ${RUN}` });
  await db.insert(syndicatesTable).values({ id: SID, name: `Résidence Documents ${RUN}`, status: "active", organizationId: ORG } as any);
  await db.insert(syndicateSubscriptionsTable).values({ syndicateId: SID, status: "trial", trialStartDate: new Date(), trialEndDate: new Date(Date.now() + 30 * 86_400_000), autoRenew: false } as any);
  const mk = (id: string, name: string, role: string) => ({ id: `${id}_${RUN}`, name, email: `${id}-${RUN}@example.invalid`, passwordHash: "x", role, status: "active", syndicateId: SID });
  const [A, P, T, C, O, O2, TN] = await db
    .insert(usersTable)
    .values([
      mk("dl_admin", "Sara Syndic", "syndicate_admin"),
      mk("dl_president", "Paul Président", "president"),
      mk("dl_treasurer", "Tina Trésorière", "treasurer"),
      mk("dl_council", "Carl Conseil", "committee_member"),
      mk("dl_owner", "Olga Lot1", "member"),
      mk("dl_owner2", "Oscar Lot2", "member"),
      mk("dl_tenant", "Tom Locataire", "tenant"),
    ] as any)
    .returning();
  await db.insert(buildingsTable).values({ id: BLD, name: "Bât. DL", address: "2 rue des Archives", city: "Fès", syndicateId: SID } as any);
  const [m1, m2] = await db.insert(membersTable).values([{ name: O.name, email: O.email, syndicateId: SID }, { name: O2.name, email: O2.email, syndicateId: SID }]).returning();
  const [l1, l2] = await db
    .insert(lotsTable)
    .values([
      { number: "DL-1", buildingId: BLD, ownerId: m1.id, type: "appartement", floor: 1, tantiemes: 100, status: "rented" },
      { number: "DL-2", buildingId: BLD, ownerId: m2.id, type: "appartement", floor: 2, tantiemes: 100, status: "occupied" },
    ] as any)
    .returning();
  await db.insert(lotOwnershipsTable).values([
    { syndicateId: SID, lotId: l1.id, memberId: m1.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: l2.id, memberId: m2.id, sharePercent: "100", startDate: "2020-01-01" },
  ] as any);
  await db.insert(tenantsTable).values({ name: TN.name, email: TN.email, lotId: l1.id, syndicateId: SID, status: "active" } as any);
  const [call] = await db
    .insert(appelsDeFondsTable)
    .values({ buildingId: BLD, lotId: l1.id, ownerId: m1.id, debtorMemberIds: [m1.id], period: "2099-04", amount: "800.00", dueDate: "2099-04-30", status: "pending" } as any)
    .returning();
  return { A, P, T, C, O, O2, TN, L1: l1.id, L2: l2.id, CALL: call.id };
}

async function purge() {
  const objects = await db.select({ p: storageObjectsTable.objectPath }).from(storageObjectsTable).where(eq(storageObjectsTable.syndicateId, SID));
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE syndicate_id = ${SID})`);
    for (const t of ["conversations", "payslips", "documents", "tenants", "lot_ownerships", "syndicate_memberships", "audit_logs", "alerts", "syndicate_subscriptions", "document_sequences"]) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE syndicate_id = ${SID}`);
    }
    await tx.execute(sql`DELETE FROM appel_reminders WHERE appel_id IN (SELECT id FROM appels_de_fonds WHERE building_id = ${BLD})`);
    await tx.execute(sql`DELETE FROM appels_de_fonds WHERE building_id = ${BLD}`);
    await tx.delete(storageObjectsTable).where(eq(storageObjectsTable.syndicateId, SID));
    await tx.execute(sql`DELETE FROM organization_members WHERE organization_id = ${ORG}`);
    await tx.delete(usersTable).where(eq(usersTable.syndicateId, SID));
    await tx.delete(syndicatesTable).where(eq(syndicatesTable.id, SID));
    await tx.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
  });
  for (const o of objects) await fs.unlink(path.join(UPLOADS, path.basename(o.p))).catch(() => {});
}

// Its own port: 5056 is the permanent API of the isolated test base.
const BROKEN_PORT = process.env.BROKEN_STORAGE_PORT ?? "5059";

/** A second API instance whose storage directory cannot be created (a file is in the way). */
async function startBrokenStorageApi(): Promise<{ proc: ChildProcess; base: string } | null> {
  const blocker = path.join(UPLOADS, `..`, `dl-blocker-${RUN}`);
  await fs.writeFile(blocker, "not a directory");
  const proc = spawn(process.execPath, ["--env-file=../../.env", "./dist/index.mjs"], {
    cwd: API_DIR,
    env: { ...process.env, PORT: BROKEN_PORT, SMTP_HOST: "", LOCAL_UPLOADS_DIR: path.join(blocker, "uploads") },
    stdio: "ignore",
  });
  const base = `http://localhost:${BROKEN_PORT}/api`;
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return { proc, base };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  return null;
}

async function main() {
  const atlasAdmin = (await db.select().from(usersTable).where(eq(usersTable.id, "user_admin_atlas")))[0];
  const atlasTreasurer = (await db.select().from(usersTable).where(eq(usersTable.id, "user_treasurer_atlas")))[0];
  const superAdmin = (await db.select().from(usersTable).where(eq(usersTable.id, "user_super_admin")))[0];
  const [atlasLot] = (await db.execute(sql`SELECT l.id FROM lots l JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id = 'syn_residence_atlas' LIMIT 1`)) as unknown as { id: string }[];
  const f = await fixture();
  const { A, P, T, C, O, O2, TN, L1, CALL } = f;
  let broken: { proc: ChildProcess; base: string } | null = null;
  const docsOf = async () => (await db.select().from(documentsTable).where(eq(documentsTable.syndicateId, SID))).length;
  const objectsOf = async () => (await db.select().from(storageObjectsTable).where(eq(storageObjectsTable.syndicateId, SID))).length;

  try {
    // ═══ 1. Validation and failed uploads ════════════════════════════════
    const meta = (extra: Record<string, string> = {}) => ({ title: "Document test", category: "avis", visibility: "residents", ...extra });
    step("a co-owner cannot add to the library", (await upload(O, meta(), { bytes: pdf("x"), name: "a.pdf", type: "application/pdf" })).status === 403);
    const noFile = await upload(A, meta());
    step("no file → clear error", noFile.status === 400 && noFile.json?.code === "FILE_REQUIRED", `${noFile.status} ${noFile.json?.code}`);
    step("empty file refused", (await upload(A, meta(), { bytes: Buffer.alloc(0), name: "vide.pdf", type: "application/pdf" })).json?.code === "FILE_EMPTY");
    step("HTML disguised as PDF refused", (await upload(A, meta(), { bytes: HTML, name: "facture.pdf", type: "application/pdf" })).json?.code === "FILE_TYPE_MISMATCH");
    step("a ZIP archive is not accepted in the library", (await upload(A, meta(), { bytes: ZIP, name: "pieces.zip", type: "application/zip" })).json?.code === "FILE_TYPE_NOT_ALLOWED");
    const big = await upload(A, meta(), { bytes: Buffer.concat([pdf("big"), Buffer.alloc(26 * 1024 * 1024)]), name: "gros.pdf", type: "application/pdf" });
    step("a file over 25 MB is refused", big.status === 413 && big.json?.code === "FILE_TOO_LARGE", `${big.status}`);
    step("unknown category refused", (await upload(A, meta({ category: "secret" }), { bytes: pdf("c"), name: "c.pdf", type: "application/pdf" })).status === 400);
    step("a unit document needs its unit", (await upload(A, meta({ visibility: "unit" }), { bytes: pdf("u"), name: "u.pdf", type: "application/pdf" })).json?.code === "LOT_REQUIRED");
    step("another condominium's unit is refused", (await upload(A, meta({ visibility: "unit", lotId: atlasLot.id }), { bytes: pdf("u2"), name: "u.pdf", type: "application/pdf" })).json?.code === "FOREIGN_REFERENCE");
    step("another condominium's record is refused", (await upload(A, meta({ entityType: "lot", entityId: atlasLot.id }), { bytes: pdf("u3"), name: "u.pdf", type: "application/pdf" })).json?.code === "FOREIGN_REFERENCE");
    step("control characters in the title refused", (await upload(A, meta({ title: "Titre\u0007bip" }), { bytes: pdf("t"), name: "t.pdf", type: "application/pdf" })).status === 400);
    step("the treasurer adds financial documents only", (await upload(T, meta({ category: "contrat", visibility: "council" }), { bytes: pdf("tc"), name: "c.pdf", type: "application/pdf" })).status === 403);
    // Interrupted transfer: the multipart body stops in the middle of the file.
    const cut = await new Promise<{ status: number; body: string }>((resolve) => {
      const boundary = "----dlcut";
      const head = `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nCoupé\r\n--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\navis\r\n--${boundary}\r\nContent-Disposition: form-data; name="visibility"\r\n\r\nresidents\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="coupe.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 partial`;
      const u = new URL(`${BASE}/documents/upload`);
      const req = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: "POST", headers: { Authorization: `Bearer ${tokenFor(A)}`, "Content-Type": `multipart/form-data; boundary=${boundary}` } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", () => resolve({ status: 0, body: "" }));
      req.end(head);
    });
    step("an interrupted upload is refused with a clear message", cut.status === 400 && cut.body.includes("UPLOAD_INCOMPLETE"), `${cut.status} ${cut.body.slice(0, 80)}`);
    step("no failed attempt left a document or a file behind", (await docsOf()) === 0 && (await objectsOf()) === 0, `docs=${await docsOf()} objects=${await objectsOf()}`);

    // ═══ 2. Successful uploads ═══════════════════════════════════════════
    const add = async (u: U, title: string, extra: Record<string, string>, bytes: Buffer, name = `${title}.pdf`, type = "application/pdf") => {
      const r = await upload(u, { title, ...extra }, { bytes, name, type });
      if (r.status !== 201) step(`upload ${title}`, false, `${r.status} ${r.json?.error ?? ""}`);
      return r.json?.data;
    };
    const dRes = await add(A, "Avis coupure d'eau", { category: "avis", visibility: "residents", description: "Coupure le 12 de 9 h à 12 h" }, pdf("residents"));
    const dOwn = await add(P, "PV AG 2026", { category: "proces_verbal", visibility: "owners" }, pdf("owners"));
    const dCouncil = await add(T, "Rapprochement bancaire T3", { category: "financier", visibility: "council" }, pdf("council"));
    const dSyndic = await add(A, "Contrat gardiennage", { category: "contrat", visibility: "syndic" }, pdf("syndic"));
    const dUnit = await add(A, "Diagnostic lot DL-1", { category: "technique", visibility: "unit", lotId: L1 }, PNG, "../../etc/diagnostic.png", "image/png");
    const dEvidence = await add(T, "Justificatif appel 2099-04", { category: "financier", visibility: "council", entityType: "appel_de_fonds", entityId: CALL }, pdf("evidence"));
    const dDraft = await add(A, "Brouillon règlement", { category: "reglement", visibility: "residents", publish: "false" }, pdf("draft"));
    const dPersonal = (await upload(A, { title: "Attestation Olga", category: "administratif", visibility: "personal", subjectUserId: O.id }, { bytes: pdf("personal"), name: "attestation.pdf", type: "application/pdf" })).json?.data;
    step("documents uploaded with their audience", [dRes, dOwn, dCouncil, dSyndic, dUnit, dEvidence, dDraft, dPersonal].every((d) => !!d?.id));
    const [rowUnit] = await db.select().from(documentsTable).where(eq(documentsTable.id, dUnit?.id));
    step(
      "verified metadata: content type from the bytes, checksum, size, no path in the name",
      rowUnit?.mimeType === "image/png" && rowUnit?.fileName === "diagnostic.png" && /^[0-9a-f]{64}$/.test(rowUnit?.checksum ?? "") && rowUnit?.sizeBytes === PNG.length && /^\/objects\/uploads\/[0-9a-f-]{36}\.png$/.test(rowUnit?.fileUrl ?? ""),
      `${rowUnit?.mimeType} ${rowUnit?.fileName} ${rowUnit?.fileUrl}`,
    );
    const dup = await upload(A, { title: "Avis (bis)", category: "avis", visibility: "residents" }, { bytes: pdf("residents"), name: "x.pdf", type: "application/pdf" });
    step("the same file twice is detected", dup.status === 409 && dup.json?.code === "DOCUMENT_DUPLICATE" && dup.json?.existingId === dRes?.id);
    const listA = await api(A, "/documents?source=upload&limit=50");
    step("storage paths never appear in API answers", listA.status === 200 && !listA.text.includes("/objects/"), `status=${listA.status}`);

    // ═══ 3. Who sees what (list, metadata, file) ═════════════════════════
    const visibleTo = async (u: U | string) => new Set(((await api(u, "/documents?source=upload&limit=50")).json?.data ?? []).map((d: any) => d.id));
    const ids = { res: dRes?.id, own: dOwn?.id, council: dCouncil?.id, syndic: dSyndic?.id, unit: dUnit?.id, draft: dDraft?.id, personal: dPersonal?.id };
    const expect = async (label: string, u: U, yes: (keyof typeof ids)[]) => {
      const seen = await visibleTo(u);
      const wrong = (Object.keys(ids) as (keyof typeof ids)[]).filter((k) => yes.includes(k) !== seen.has(ids[k]));
      step(`${label} sees exactly: ${yes.join(", ")}`, wrong.length === 0, wrong.length ? `wrong: ${wrong.join(",")}` : "");
    };
    await expect("co-owner of lot DL-1", O, ["res", "own", "unit", "personal"]);
    await expect("co-owner of lot DL-2", O2, ["res", "own"]);
    await expect("tenant of lot DL-1", TN, ["res", "unit"]);
    await expect("council member", C, ["res", "own", "council", "unit", "draft"]);
    await expect("syndic", A, ["res", "own", "council", "syndic", "unit", "draft", "personal"]);
    const meO = await api(O, `/documents/${dRes?.id}`);
    step("a resident gets no internal metadata (author, checksum, linked record)", meO.status === 200 && meO.json?.data?.createdBy === undefined && meO.json?.data?.checksum === undefined && meO.json?.data?.fileUrl === undefined);
    for (const [who, u, docId] of [["co-owner DL-2 → unit document of DL-1", O2, dUnit?.id], ["tenant → owners' minutes", TN, dOwn?.id], ["council → syndic-only contract", C, dSyndic?.id], ["co-owner → draft", O, dDraft?.id], ["co-owner DL-2 → someone's attestation", O2, dPersonal?.id]] as [string, U, string][]) {
      const link = await api(u, `/documents/${docId}/download-url`);
      const direct = await fileGet(`${BASE}/documents/${docId}/file`, tokenFor(u));
      step(`denied: ${who} (no link, no file)`, link.status === 404 && direct.status === 404, `${link.status}/${direct.status}`);
    }

    // ═══ 4. Secure download ══════════════════════════════════════════════
    const linkO = await api(O, `/documents/${dRes?.id}/download-url`);
    const got = await fileGet(linkO.json?.url);
    step("a 5-minute personal link downloads the exact file", linkO.json?.expiresIn === 300 && got.status === 200 && got.buf.equals(pdf("residents")), `${got.status}`);
    step(
      "download headers: no caching, no sniffing, attachment with a safe name",
      got.headers.get("cache-control")?.includes("no-store") === true && got.headers.get("x-content-type-options") === "nosniff" && /^attachment; filename="/.test(got.headers.get("content-disposition") ?? ""),
      got.headers.get("content-disposition") ?? "",
    );
    const linkToken = new URL(linkO.json.url).searchParams.get("link")!;
    step("a link used for another document id is refused", (await fileGet(`${BASE}/documents/${dOwn?.id}/file?link=${encodeURIComponent(linkToken)}`)).json?.code === "LINK_MISMATCH");
    step("a tampered link is refused", (await fileGet(`${BASE}/documents/${dRes?.id}/file?link=${encodeURIComponent(linkToken.slice(0, -3) + "abc")}`)).json?.code === "LINK_INVALID");
    const expired = jwt.sign({ sub: O.id, doc: dRes?.id, v: 1 }, JWT_SECRET, { audience: "doc-link", expiresIn: -10 });
    const exp = await fileGet(`${BASE}/documents/${dRes?.id}/file?link=${encodeURIComponent(expired)}`);
    step("an expired link says so", exp.status === 410 && exp.json?.code === "LINK_EXPIRED");
    step("a link is not a session (cannot call the API with it)", (await api(linkToken, "/documents")).status === 401);
    const forged = jwt.sign({ sub: atlasAdmin.id, doc: dCouncil?.id, v: 1 }, JWT_SECRET, { audience: "doc-link", expiresIn: 60 });
    step("a link for someone with no role in the condominium gives nothing", (await fileGet(`${BASE}/documents/${dCouncil?.id}/file?link=${encodeURIComponent(forged)}`)).json?.code === "ACCESS_REVOKED");
    const linkTN = (await api(TN, `/documents/${dUnit?.id}/download-url`)).json?.url;
    await db.update(usersTable).set({ status: "inactive" }).where(eq(usersTable.id, TN.id));
    const afterDisable = await fileGet(linkTN);
    await db.update(usersTable).set({ status: "active" }).where(eq(usersTable.id, TN.id));
    step("a disabled account's link stops working at once", afterDisable.status === 403 && afterDisable.json?.code === "ACCESS_REVOKED", `${afterDisable.status}`);
    // Assignment revoked: an Atlas treasurer assigned to this condominium's council.
    const [assign] = await db.insert(syndicateMembershipsTable).values({ syndicateId: SID, userId: atlasTreasurer.id, role: "committee_member" }).returning();
    const asCouncil = tokenFor(atlasTreasurer, { role: "committee_member", syndicateId: SID });
    const linkX = (await api(asCouncil, `/documents/${dCouncil?.id}/download-url`)).json?.url;
    const beforeRevoke = await fileGet(linkX);
    await db.update(syndicateMembershipsTable).set({ status: "revoked", revokedAt: new Date() }).where(eq(syndicateMembershipsTable.id, assign.id));
    const afterRevoke = await fileGet(linkX);
    const sessionAfter = await fileGet(`${BASE}/documents/${dCouncil?.id}/file`, asCouncil);
    step("assignment revoked: the issued link and the session both stop", beforeRevoke.status === 200 && afterRevoke.json?.code === "ACCESS_REVOKED" && sessionAfter.status === 401, `${beforeRevoke.status}/${afterRevoke.status}/${sessionAfter.status}`);
    step("another condominium: invisible in lists, no link, no file", !(await visibleTo(atlasAdmin)).has(dRes?.id) && (await api(atlasAdmin, `/documents/${dRes?.id}/download-url`)).status === 404 && (await fileGet(`${BASE}/documents/${dRes?.id}/file`, tokenFor(atlasAdmin))).status === 404);
    step("anonymous access to a file is refused", (await fileGet(`${BASE}/documents/${dRes?.id}/file`)).status === 401);
    step("super admin needs supervision of this condominium", (await fileGet(`${BASE}/documents/${dRes?.id}/file`, tokenFor(superAdmin))).json?.code === "SUPERVISION_REQUIRED" && (await fileGet(`${BASE}/documents/${dRes?.id}/file?supervision=true&syndicateId=${SID}`, tokenFor(superAdmin))).status === 200);
    const [rowSyndic] = await db.select().from(documentsTable).where(eq(documentsTable.id, dSyndic?.id));
    step("the raw storage URL of a document is still guarded by its audience", (await fileGet(`${BASE}/storage${rowSyndic.fileUrl}`, tokenFor(O))).status === 403 && (await fileGet(`${BASE}/storage${rowSyndic.fileUrl}`, tokenFor(A))).status === 200);
    step("path traversal on the storage route finds nothing", [(await fileGet(`${BASE}/storage/objects/uploads/..%2F..%2F..%2F.env`, tokenFor(A))).status, (await fileGet(`${BASE}/storage/objects/../../.env`, tokenFor(A))).status].every((s) => s === 404 || s === 400), "");
    step("path traversal on generated PDFs refused", (await fileGet(`${BASE}/documents/local-docs/00000000-0000-4000-8000-000000000000/..%2F..%2Fx.pdf`, tokenFor(A))).status === 400);

    // ═══ 5. Replacement and versions ═════════════════════════════════════
    const oldLink = (await api(O, `/documents/${dRes?.id}/download-url`)).json?.url;
    step("replacing needs a reason", (await upload(A, {}, { bytes: pdf("v2"), name: "v2.pdf", type: "application/pdf" }, `/documents/${dRes?.id}/file`)).json?.code === "REASON_REQUIRED");
    step("replacing by the same file is refused", (await upload(A, { changeReason: "test" }, { bytes: pdf("residents"), name: "v1.pdf", type: "application/pdf" }, `/documents/${dRes?.id}/file`)).json?.code === "SAME_FILE");
    step("a co-owner cannot replace a file", (await upload(O, { changeReason: "moi" }, { bytes: pdf("o"), name: "o.pdf", type: "application/pdf" }, `/documents/${dRes?.id}/file`)).status === 403);
    const rep = await upload(A, { changeReason: "Horaires corrigés" }, { bytes: pdf("residents-v2"), name: "avis-v2.pdf", type: "application/pdf" }, `/documents/${dRes?.id}/file`);
    step("the syndic replaces the file: version 2", rep.status === 200 && rep.json?.data?.version === 2, `${rep.status} ${rep.json?.error ?? ""}`);
    step("a link issued before the replacement asks to reopen", (await fileGet(oldLink)).json?.code === "LINK_OUTDATED");
    step("a new link serves the new file", (await fileGet((await api(O, `/documents/${dRes?.id}/download-url`)).json?.url)).buf.equals(pdf("residents-v2")));
    const vers = await api(C, `/documents/${dRes?.id}/versions`);
    const v1 = vers.json?.data?.[0];
    step("version history: v1 kept with its file, reason and author", vers.status === 200 && v1?.versionNumber === 1 && v1?.hasFile === true && v1?.fileUrl === undefined && vers.json?.currentVersion === 2);
    const v1Link = (await api(C, `/documents/${dRes?.id}/download-url?versionId=${v1?.id}`)).json?.url;
    step("the team can still open v1 (old bytes)", (await fileGet(v1Link)).buf.equals(pdf("residents")));
    step("residents see the current version only", (await api(O, `/documents/${dRes?.id}/versions`)).status === 403 && (await api(O, `/documents/${dRes?.id}/download-url?versionId=${v1?.id}`)).status === 403);

    // ═══ 6. Archive, evidence, retention ═════════════════════════════════
    step("a document justifying a call for funds cannot be deleted", (await api(A, `/documents/${dEvidence?.id}`, "DELETE")).json?.code === "DOCUMENT_IS_EVIDENCE");
    step("archiving needs a reason", (await api(A, `/documents/${dEvidence?.id}/archive`, "POST", {})).status === 400);
    const arch = await api(A, `/documents/${dEvidence?.id}/archive`, "POST", { reason: "Exercice clos" });
    step("it can be archived; its file stays available to the team", arch.status === 200 && (await fileGet(`${BASE}/documents/${dEvidence?.id}/file`, tokenFor(T))).status === 200);
    step("its link to the call for funds is kept", (((await api(T, `/documents?entityType=appel_de_fonds&entityId=${CALL}&includeArchived=true`)).json?.data ?? []) as any[]).some((d) => d.id === dEvidence?.id));
    await api(P, `/documents/${dRes?.id}/archive`, "POST", { reason: "Travaux terminés" });
    const archivedHidden = !(await visibleTo(O)).has(dRes?.id);
    await api(P, `/documents/${dRes?.id}/unarchive`, "POST");
    step("an archived notice leaves the residents' library and comes back when unarchived", archivedHidden && (await visibleTo(O)).has(dRes?.id));
    const del = await api(A, `/documents/${dOwn?.id}`, "DELETE");
    const purgeEarly = await api(superAdmin, `/documents/${dOwn?.id}/purge?supervision=true`, "POST");
    step("a deleted document is not purged before its retention date", del.status === 200 && purgeEarly.status === 409 && purgeEarly.json?.code === "RETENTION_ACTIVE", `${del.status}/${purgeEarly.status}`);
    const [kept] = await db.select().from(documentsTable).where(eq(documentsTable.id, dOwn?.id));
    step("DB: the deleted document and its file are still there (recycle bin)", kept?.isDeleted === true && !!kept?.fileUrl && (await fs.stat(path.join(UPLOADS, path.basename(kept.fileUrl!))).then(() => true, () => false)));

    // ═══ 7. Search, filters, sorting, pagination ═════════════════════════
    const s1 = await api(A, "/documents?source=upload&q=coupure");
    step("full-text search on title / description", (s1.json?.data ?? []).length === 1 && s1.json?.data?.[0]?.id === dRes?.id);
    step("search is not an injection point", (await api(A, "/documents?q=%25'%20OR%201%3D1--")).status === 200);
    const byCat = await api(A, "/documents?source=upload&category=financier");
    step("category filter, with counts per category", (byCat.json?.data ?? []).every((d: any) => d.category === "financier") && (byCat.json?.categories ?? []).some((c: any) => c.category === "avis" && c.n >= 1));
    const sorted = ((await api(A, "/documents?source=upload&sort=title&limit=50")).json?.data ?? []).map((d: any) => d.title);
    const dbOrder = ((await db.execute(sql`SELECT title FROM documents WHERE syndicate_id = ${SID} AND source = 'upload' AND NOT is_deleted AND status IS DISTINCT FROM 'archived' ORDER BY title, id DESC`)) as unknown as { title: string }[]).map((r) => r.title);
    step("sort by title (database collation)", sorted.length > 2 && sorted.join("|") === dbOrder.join("|"), sorted.join(" | "));
    const p1 = await api(A, "/documents?source=upload&limit=2&page=1");
    const p2 = await api(A, "/documents?source=upload&limit=2&page=2");
    const pIds = [...(p1.json?.data ?? []), ...(p2.json?.data ?? [])].map((d: any) => d.id);
    step("pagination: pages are disjoint, total counted by the server", new Set(pIds).size === 4 && p1.json?.total === p2.json?.total && p1.json?.total >= 5, `total=${p1.json?.total}`);

    // ═══ 8. Missing storage object, storage outage ═══════════════════════
    await fs.unlink(path.join(UPLOADS, path.basename(rowUnit.fileUrl!)));
    const missing = await fileGet(`${BASE}/documents/${dUnit?.id}/file`, tokenFor(A));
    step("a file lost by the storage gives a clear error, not a crash", missing.status === 404 && missing.json?.code === "STORAGE_OBJECT_MISSING", `${missing.status} ${missing.json?.code}`);
    broken = await startBrokenStorageApi();
    if (!broken) {
      step("storage outage instance started", false, "second API did not start");
    } else {
      const before = await docsOf();
      const out = await upload(A, { title: "Pendant la panne", category: "avis", visibility: "residents" }, { bytes: pdf("outage"), name: "panne.pdf", type: "application/pdf" }, "/documents/upload", broken.base);
      step("storage down: upload refused (503), nothing recorded", out.status === 503 && out.json?.code === "STORAGE_UNAVAILABLE" && (await docsOf()) === before, `${out.status} ${out.json?.code}`);
      const outRep = await upload(A, { changeReason: "panne" }, { bytes: pdf("outage-v3"), name: "v3.pdf", type: "application/pdf" }, `/documents/${dRes?.id}/file`, broken.base);
      const [still] = await db.select().from(documentsTable).where(eq(documentsTable.id, dRes?.id));
      step("storage down: replacement refused, current version untouched", outRep.status === 503 && still.version === 2);
    }

    // ═══ 9. Other uploaded files: access by the record that uses them ════
    const raw = async (u: U, bytes: Buffer, name: string, type: string) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
      const r = await fetch(`${BASE}/storage/uploads`, { method: "POST", headers: { Authorization: `Bearer ${tokenFor(u)}` }, body: form });
      return ((await r.json()) as any)?.objectPath as string;
    };
    const mine = await raw(O, pdf("o-private"), "releve.pdf", "application/pdf");
    step("a file no record uses: its uploader only (not the neighbour, not the team)", (await fileGet(`${BASE}/storage${mine}`, tokenFor(O))).status === 200 && (await fileGet(`${BASE}/storage${mine}`, tokenFor(O2))).status === 403 && (await fileGet(`${BASE}/storage${mine}`, tokenFor(C))).status === 403);
    const slip = await raw(A, pdf("payslip"), "paie.pdf", "application/pdf");
    await db.insert(payslipsTable).values({ userId: O.id, month: "2099-01", amount: "1000", fileUrl: slip, syndicateId: SID });
    step("payslip: syndic and the employee; not a council member, not a neighbour", (await fileGet(`${BASE}/storage${slip}`, tokenFor(O))).status === 200 && (await fileGet(`${BASE}/storage${slip}`, tokenFor(C))).status === 403 && (await fileGet(`${BASE}/storage${slip}`, tokenFor(O2))).status === 403);
    const att = await raw(A, PNG, "photo.png", "image/png");
    const [conv] = await db.insert(conversationsTable).values({ syndicateId: SID, convType: "direct", participant1Id: A.id, participant2Id: O.id }).returning();
    await db.insert(messagesTable).values({ conversationId: conv.id, senderId: A.id, content: "photo", attachmentUrl: att } as any);
    step("chat attachment: the conversation's participants only", (await fileGet(`${BASE}/storage${att}`, tokenFor(O))).status === 200 && (await fileGet(`${BASE}/storage${att}`, tokenFor(O2))).status === 403 && (await fileGet(`${BASE}/storage${att}`, tokenFor(P))).status === 403);

    // ═══ 10. Retired routes, comments, audit ═════════════════════════════
    step("former two-step publish and hard delete are closed", (await api(O, `/storage/documents/${dRes?.id}/confirm`, "PATCH", {})).status === 410 && (await api(A, `/storage/documents/${dRes?.id}`, "DELETE")).status === 410);
    step("comments are reachable at /documents/:id/comments", (await api(A, `/documents/${dRes?.id}/comments`)).status === 200 && (await api(A, "/expenses/comments")).status !== 200);
    const actions = new Set((await db.select({ a: auditLogsTable.action }).from(auditLogsTable).where(eq(auditLogsTable.syndicateId, SID))).map((r) => r.a));
    const missingActions = ["DOCUMENT_UPLOADED", "DOCUMENT_FILE_REPLACED", "DOCUMENT_ARCHIVED", "DOCUMENT_UNARCHIVED", "DOCUMENT_DOWNLOAD"].filter((a) => !actions.has(a));
    step("uploads, replacements, archiving and downloads are audited", missingActions.length === 0, missingActions.join(","));
  } finally {
    broken?.proc.kill();
    await fs.unlink(path.join(UPLOADS, "..", `dl-blocker-${RUN}`)).catch(() => {});
    await purge();
    const left = ((await db.execute(sql`SELECT (SELECT COUNT(*) FROM syndicates WHERE id = ${SID}) + (SELECT COUNT(*) FROM documents WHERE syndicate_id = ${SID}) + (SELECT COUNT(*) FROM storage_objects WHERE syndicate_id = ${SID}) AS n`)) as unknown as { n: string }[])[0].n;
    step("everything created by the suite is removed (rows and files)", Number(left) === 0, `left=${left}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} document library checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Document library suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
