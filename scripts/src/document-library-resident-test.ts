/**
 * Resident document library — real HTTP API, PostgreSQL and the real local
 * storage of the test API. Complements documents-library:test (links,
 * expiry, revocation, replacement, archiving, storage outage) with the
 * resident-facing rules the mobile library relies on.
 *
 * A dedicated condominium (syndic, two co-owners — one with two units —, a
 * tenant) and a second condominium are created; every action goes through
 * the API. Everything is removed at the end (rows and files).
 *
 * Usage: API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run document-library-resident:test
 */
import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  buildingsTable,
  lotOwnershipsTable,
  lotsTable,
  membersTable,
  organizationsTable,
  storageObjectsTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
  tenantsTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
const UPLOADS = path.resolve("../artifacts/api-server", process.env.LOCAL_UPLOADS_DIR ?? "uploads");
const RUN = Date.now();
const SID = `syn_dr_${RUN}`;
const SID2 = `syn_dr2_${RUN}`;
const ORG = `org_dr_${RUN}`;
const BLD = `bld_dr_${RUN}`;
const BLD2 = `bld_dr2_${RUN}`;

type U = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const tokenFor = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicateId ?? undefined, name: u.name }, JWT_SECRET, { expiresIn: "15m" });
async function api(u: U, p: string) {
  const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${tokenFor(u)}` } });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
async function upload(u: U, fields: Record<string, string>, file: { bytes: Buffer; name: string; type: string }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  const res = await fetch(`${BASE}/documents/upload`, { method: "POST", headers: { Authorization: `Bearer ${tokenFor(u)}` }, body: form });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
async function fileVia(u: U, id: string, inline = false) {
  const link = await api(u, `/documents/${id}/download-url`);
  if (link.status !== 200) return { status: link.status, code: link.json?.code, buf: Buffer.alloc(0), headers: new Headers() };
  const res = await fetch(`${link.json.url}${inline ? "&inline=1" : ""}`);
  return { status: res.status, code: undefined as string | undefined, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}

const pdf = (marker: string, padBytes = 0) =>
  Buffer.concat([Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj << /Type /Catalog >> endobj\n`), Buffer.alloc(padBytes, 0x20), Buffer.from("trailer << /Root 1 0 R >>\n%%EOF\n")]);
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
// Minimal DOCX = ZIP with [Content_Types].xml + word/document.xml signature check relies on the zip header.
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function fixture() {
  await db.insert(organizationsTable).values({ id: ORG, name: `Syndic DR ${RUN}` });
  await db.insert(syndicatesTable).values([
    { id: SID, name: `Résidence Lecture ${RUN}`, status: "active", organizationId: ORG },
    { id: SID2, name: `Résidence Voisine ${RUN}`, status: "active", organizationId: ORG },
  ] as any);
  for (const s of [SID, SID2]) await db.insert(syndicateSubscriptionsTable).values({ syndicateId: s, status: "trial", trialStartDate: new Date(), trialEndDate: new Date(Date.now() + 30 * 86_400_000), autoRenew: false } as any);
  const mk = (id: string, name: string, role: string, sid = SID) => ({ id: `${id}_${RUN}`, name, email: `${id}-${RUN}@example.invalid`, passwordHash: "x", role, status: "active", syndicateId: sid });
  const [A, O1, O2, TN, A2] = await db
    .insert(usersTable)
    .values([mk("dr_admin", "Salma Syndic", "syndicate_admin"), mk("dr_owner1", "Omar Deux-Lots", "member"), mk("dr_owner2", "Ouafae Un-Lot", "member"), mk("dr_tenant", "Tarik Locataire", "tenant"), mk("dr_admin2", "Samir Voisin", "syndicate_admin", SID2)] as any)
    .returning();
  await db.insert(buildingsTable).values([
    { id: BLD, name: "Bât. DR", address: "3 rue des Lectures", city: "Rabat", syndicateId: SID },
    { id: BLD2, name: "Bât. Voisin", address: "5 rue d'à côté", city: "Rabat", syndicateId: SID2 },
  ] as any);
  const [m1, m2] = await db.insert(membersTable).values([{ name: O1.name, email: O1.email, syndicateId: SID }, { name: O2.name, email: O2.email, syndicateId: SID }]).returning();
  const lots = await db
    .insert(lotsTable)
    .values([
      { number: "DR-1", buildingId: BLD, ownerId: m1.id, type: "appartement", floor: 1, tantiemes: 100, status: "occupied" },
      { number: "DR-2", buildingId: BLD, ownerId: m1.id, type: "appartement", floor: 2, tantiemes: 100, status: "rented" },
      { number: "DR-3", buildingId: BLD, ownerId: m2.id, type: "appartement", floor: 3, tantiemes: 100, status: "occupied" },
    ] as any)
    .returning();
  const L = Object.fromEntries(lots.map((l) => [l.number, l.id])) as Record<string, string>;
  await db.insert(lotOwnershipsTable).values([
    { syndicateId: SID, lotId: L["DR-1"], memberId: m1.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: L["DR-2"], memberId: m1.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: L["DR-3"], memberId: m2.id, sharePercent: "100", startDate: "2020-01-01" },
  ] as any);
  await db.insert(tenantsTable).values({ name: TN.name, email: TN.email, lotId: L["DR-2"], syndicateId: SID, status: "active" } as any);
  return { A, O1, O2, TN, A2, L };
}

async function purge() {
  const objects = await db.select({ p: storageObjectsTable.objectPath }).from(storageObjectsTable).where(sql`${storageObjectsTable.syndicateId} IN (${SID}, ${SID2})`);
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM document_versions WHERE document_id IN (SELECT id FROM documents WHERE syndicate_id IN (${SID}, ${SID2}))`);
    for (const t of ["documents", "tenants", "lot_ownerships", "audit_logs", "alerts", "syndicate_subscriptions", "document_sequences"]) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE syndicate_id IN (${SID}, ${SID2})`);
    }
    await tx.execute(sql`DELETE FROM storage_objects WHERE syndicate_id IN (${SID}, ${SID2})`);
    await tx.execute(sql`DELETE FROM lots WHERE building_id IN (${BLD}, ${BLD2})`);
    await tx.execute(sql`DELETE FROM buildings WHERE id IN (${BLD}, ${BLD2})`);
    await tx.execute(sql`DELETE FROM members WHERE syndicate_id IN (${SID}, ${SID2})`);
    await tx.execute(sql`DELETE FROM users WHERE syndicate_id IN (${SID}, ${SID2})`);
    await tx.execute(sql`DELETE FROM syndicates WHERE id IN (${SID}, ${SID2})`);
    await tx.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
  });
  for (const o of objects) await fs.unlink(path.join(UPLOADS, path.basename(o.p))).catch(() => {});
}

async function main() {
  const f = await fixture();
  const { A, O1, O2, TN, A2, L } = f;
  const titles = (r: { json: any }) => ((r.json?.data ?? []) as any[]).map((d) => d.title).sort();
  try {
    // ═══ Set-up through the API: one document per audience ══════════════════
    const up = async (title: string, fields: Record<string, string>, file = { bytes: pdf(title), name: `${title}.pdf`, type: "application/pdf" }) => {
      const r = await upload(A, { title, ...fields }, file);
      if (r.status !== 201) console.log("upload failed", title, r.status, r.json);
      return r.json?.data?.id as string;
    };
    const dRules = await up("Règlement intérieur", { category: "reglement", visibility: "residents" });
    const dBudget = await up("Budget approuvé 2099", { category: "financier", visibility: "owners" });
    const dCouncil = await up("Note du conseil", { category: "administratif", visibility: "council" });
    const dSyndic = await up("Dossier contentieux", { category: "juridique", visibility: "syndic" });
    const dUnit1 = await up("Diagnostic DR-1", { category: "technique", visibility: "unit", lotId: L["DR-1"] });
    const dUnit2 = await up("Diagnostic DR-2", { category: "technique", visibility: "unit", lotId: L["DR-2"] });
    const dUnit3 = await up("Diagnostic DR-3", { category: "technique", visibility: "unit", lotId: L["DR-3"] });
    const dDraft = await up("Avis en préparation", { category: "avis", visibility: "residents", publish: "false" });
    const dPhoto = await up("Photo façade", { category: "maintenance", visibility: "residents" }, { bytes: PNG, name: "facade.png", type: "image/png" });
    const dLarge = await up("Procès-verbal volumineux", { category: "proces_verbal", visibility: "owners" }, { bytes: pdf("large", 8 * 1024 * 1024), name: "pv.pdf", type: "application/pdf" });
    const dOther = (await upload(A2, { title: "Document voisin", category: "avis", visibility: "residents" }, { bytes: pdf("other"), name: "voisin.pdf", type: "application/pdf" })).json?.data?.id as string;
    step("documents of every audience uploaded through the API", [dRules, dBudget, dCouncil, dSyndic, dUnit1, dUnit2, dUnit3, dDraft, dPhoto, dLarge, dOther].every(Boolean));

    // Personal document of co-owner 2 (e.g. a receipt): no upload API for "personal" by residents → set by the team API with subjectUserId.
    const dReceipt = await up("Reçu personnel O2", { category: "financier", visibility: "personal", subjectUserId: O2.id });

    // ═══ Authorization: what each resident's library contains ═══════════════
    const lib1 = await api(O1, "/documents?limit=100");
    const lib2 = await api(O2, "/documents?limit=100");
    const libT = await api(TN, "/documents?limit=100");
    step(
      "co-owner with two units: building documents + both unit documents, nothing else",
      JSON.stringify(titles(lib1)) === JSON.stringify(["Budget approuvé 2099", "Diagnostic DR-1", "Diagnostic DR-2", "Photo façade", "Procès-verbal volumineux", "Règlement intérieur"]),
      titles(lib1).join(" | "),
    );
    step(
      "co-owner with one unit: his unit document and his personal receipt only",
      titles(lib2).includes("Diagnostic DR-3") && titles(lib2).includes("Reçu personnel O2") && !titles(lib2).includes("Diagnostic DR-1") && !titles(lib2).includes("Diagnostic DR-2"),
      titles(lib2).join(" | "),
    );
    step(
      "tenant: residents' documents and the rented unit's document, not owners-only ones",
      titles(libT).includes("Règlement intérieur") && titles(libT).includes("Diagnostic DR-2") && !titles(libT).includes("Budget approuvé 2099") && !titles(libT).includes("Diagnostic DR-1"),
      titles(libT).join(" | "),
    );
    step("council, syndic-only and draft documents never reach residents", ![lib1, lib2, libT].some((l) => titles(l).some((x: string) => ["Note du conseil", "Dossier contentieux", "Avis en préparation"].includes(x))));
    step("another condominium's documents never appear", ![lib1, lib2, libT].some((l) => titles(l).includes("Document voisin")));
    const cats1 = ((lib1.json?.categories ?? []) as any[]).map((c) => c.category).sort();
    step("category counts only cover the resident's own documents", !cats1.includes("juridique") && !cats1.includes("administratif") && !cats1.includes("avis"), cats1.join(","));
    const u1 = (lib1.json?.data ?? []).find((d: any) => d.id === dUnit1);
    step("unit documents carry their unit number; no storage path, no author", u1?.lotNumber === "DR-1" && !("fileUrl" in u1 && u1.fileUrl) && u1?.createdBy === undefined, JSON.stringify({ n: u1?.lotNumber }));

    // ═══ Detail endpoint: same answer for "forbidden" and "missing" ═════════
    const det = await api(O1, `/documents/${dUnit2}`);
    step("document detail for an authorized resident (with unit number)", det.status === 200 && det.json?.data?.lotNumber === "DR-2" && det.json?.data?.hasFile === true);
    const forbidden = await api(O1, `/documents/${dUnit3}`);
    const missing = await api(O1, `/documents/doc_does_not_exist_${RUN}`);
    step("another resident's unit document: 404, indistinguishable from a missing id", forbidden.status === 404 && missing.status === 404 && forbidden.json?.code === "DOCUMENT_NOT_FOUND");
    step("another condominium's document id: 404", (await api(O1, `/documents/${dOther}`)).status === 404);
    step("another resident's personal receipt: 404 on detail and no link", (await api(O1, `/documents/${dReceipt}`)).status === 404 && (await api(O1, `/documents/${dReceipt}/download-url`)).status === 404);
    step("the owner of the receipt can open it", (await fileVia(O2, dReceipt)).status === 200);
    step("draft: 404 for residents, readable by the syndic", (await api(O1, `/documents/${dDraft}`)).status === 404 && (await api(A, `/documents/${dDraft}`)).status === 200);
    step("ID tampering on the file route (unit of another resident) gives nothing", (await fileVia(O2, dUnit1)).status === 404);

    // ═══ Preview and download ════════════════════════════════════════════════
    const pdfInline = await fileVia(O1, dRules, true);
    step(
      "PDF: served inline for the in-app preview, exact bytes, private caching",
      pdfInline.status === 200 && pdfInline.headers.get("content-type")?.includes("application/pdf") === true && /inline/.test(pdfInline.headers.get("content-disposition") ?? "") && pdfInline.buf.equals(pdf("Règlement intérieur")),
      `${pdfInline.status} ${pdfInline.headers.get("content-disposition")} ${pdfInline.headers.get("cache-control")}`,
    );
    const img = await fileVia(O1, dPhoto, true);
    step("image: served with its verified type", img.status === 200 && img.headers.get("content-type")?.includes("image/png") === true && img.buf.equals(PNG));
    const big = await fileVia(O1, dLarge);
    step("large document (8 MB): complete and intact", big.status === 200 && big.buf.length === pdf("large", 8 * 1024 * 1024).length);
    const [r1, r2, r3] = await Promise.all([fileVia(O1, dBudget), fileVia(O1, dBudget), fileVia(O1, dBudget)]);
    step("repeated simultaneous downloads: each one served, identical bytes", [r1, r2, r3].every((r) => r.status === 200 && r.buf.equals(r1.buf)));
    const head = await fileVia(O1, dBudget);
    step("download responses are not stored by shared caches", /no-store|private/.test(head.headers.get("cache-control") ?? ""), head.headers.get("cache-control") ?? "none");

    // ═══ Lifecycle seen by a resident ════════════════════════════════════════
    const oldLink = (await api(O1, `/documents/${dRules}/download-url`)).json?.url;
    const repl = await fetch(`${BASE}/documents/${dRules}/file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor(A)}` },
      body: (() => {
        const fd = new FormData();
        fd.append("changeReason", "Mise à jour de l'article 4");
        fd.append("file", new Blob([new Uint8Array(pdf("Règlement v2"))], { type: "application/pdf" }), "reglement.pdf");
        return fd;
      })(),
    });
    const afterRepl = await fetch(oldLink);
    const listed = (await api(O1, "/documents?limit=100")).json?.data?.find((d: any) => d.id === dRules);
    step("replacement: the old link asks to reopen (409), the list shows version 2", repl.status === 200 && afterRepl.status === 409 && listed?.version === 2, `${repl.status}/${afterRepl.status}/v${listed?.version}`);
    step("the reopened document is the new file", (await fileVia(O1, dRules)).buf.equals(pdf("Règlement v2")));
    await fetch(`${BASE}/documents/${dBudget}/archive`, { method: "POST", headers: { Authorization: `Bearer ${tokenFor(A)}`, "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Budget remplacé" }) });
    step("archived document leaves the resident's library and its detail", !titles(await api(O1, "/documents?limit=100")).includes("Budget approuvé 2099") && (await api(O1, `/documents/${dBudget}`)).status === 404);
    // Lot sold: the former owner loses the unit document at once.
    await db.execute(sql`UPDATE lot_ownerships SET end_date = current_date - 1 WHERE lot_id = ${L["DR-1"]}`);
    step("unit no longer owned: its document disappears and its link is refused", !titles(await api(O1, "/documents?limit=100")).includes("Diagnostic DR-1") && (await fileVia(O1, dUnit1)).status === 404);
    // Missing storage object
    const [obj] = (await db.execute(sql`SELECT file_url FROM documents WHERE id = ${dPhoto}`)) as unknown as { file_url: string }[];
    await fs.unlink(path.join(UPLOADS, path.basename(obj.file_url))).catch(() => {});
    const lost = await fileVia(O1, dPhoto);
    step("missing storage object: explicit code, no crash", lost.status === 404 && /STORAGE_OBJECT_MISSING/.test(lost.buf.toString("utf8")), `${lost.status}`);
    // UTF-8 file names (French accents, Arabic) survive the upload
    const named = await upload(A, { title: "Nom de fichier", category: "avis", visibility: "residents" }, { bytes: pdf("names"), name: "Procès-verbal محضر.pdf", type: "application/pdf" });
    const namedFile = await fileVia(O1, named.json?.data?.id);
    step(
      "accented and Arabic file names are stored and served intact",
      named.json?.data?.fileName === "Procès-verbal محضر.pdf" && (namedFile.headers.get("content-disposition") ?? "").includes(encodeURIComponent("Procès-verbal محضر.pdf")),
      `${named.json?.data?.fileName} | ${namedFile.headers.get("content-disposition")}`,
    );
    // Search hits authorized documents only
    const s1 = await api(O2, `/documents?q=${encodeURIComponent("Diagnostic")}`);
    step("search only returns the resident's authorized documents", JSON.stringify(titles(s1)) === JSON.stringify(["Diagnostic DR-3"]), titles(s1).join(" | "));
    void DOCX_MIME;
  } finally {
    await purge();
    await pool.end();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await purge();
  } catch {}
  process.exit(1);
});
