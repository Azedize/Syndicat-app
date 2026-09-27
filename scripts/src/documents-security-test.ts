/**
 * Upload & private-file access regression suite.
 *
 * Usage (API must be running):
 *   API_BASE_URL=http://localhost:5000/api pnpm --filter @workspace/scripts run documents-security:test
 *
 * Uploads real files through POST /storage/uploads, then checks content
 * verification (spoofed types rejected) and download authorization across
 * users, syndicates and download tickets. Uploaded files and their ownership
 * rows are removed in `finally`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { storageObjectsTable, usersTable } from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
// Must match the API process' LOCAL_UPLOADS_DIR (default: <api cwd>/uploads).
const UPLOADS_DIR = path.resolve(
  process.env.LOCAL_UPLOADS_DIR ?? path.join(import.meta.dirname, "../../artifacts/api-server/uploads"),
);

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
    { expiresIn: "15m" },
  );
}

async function user(id: string): Promise<User> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!row) throw new Error(`Fixture user ${id} missing — run pnpm db:seed`);
  return row;
}

// 1×1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const HTML = Buffer.from("<html><script>alert(document.cookie)</script></html>");

async function upload(token: string, content: Buffer, fileName: string, mime: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(content)], { type: mime }), fileName);
  const res = await fetch(`${BASE}/storage/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function get(pathAndQuery: string, token?: string) {
  const res = await fetch(`${BASE}${pathAndQuery}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  await res.arrayBuffer().catch(() => null);
  return { status: res.status, type: res.headers.get("content-type") ?? "" };
}

async function main() {
  const owner = await user("user_member_1"); // Atlas
  const sameSyndicate = await user("user_treasurer_atlas"); // Atlas
  const otherSyndicate = await user("user_member_3"); // Agdal
  const created: string[] = [];

  try {
    // ── Content verification ──────────────────────────────────────────────
    const png = await upload(tokenFor(owner), PNG, "photo.png", "image/png");
    expectStatus("genuine PNG accepted", png.status, 200);
    const objectPath = png.json?.objectPath as string;
    if (objectPath) created.push(objectPath);
    record("stored under a server-generated .png name", /^\/objects\/uploads\/[0-9a-f-]{36}\.png$/.test(objectPath ?? ""), objectPath);

    const renamed = await upload(tokenFor(owner), PNG, "evil.html", "image/png");
    if (renamed.json?.objectPath) created.push(renamed.json.objectPath);
    record(
      "client file name cannot choose the stored extension",
      renamed.status === 200 && String(renamed.json?.objectPath).endsWith(".png"),
      `status=${renamed.status} path=${renamed.json?.objectPath}`,
    );

    const spoofImage = await upload(tokenFor(owner), HTML, "photo.png", "image/png");
    if (spoofImage.json?.objectPath) created.push(spoofImage.json.objectPath);
    expectStatus("HTML disguised as PNG rejected", spoofImage.status, 415);

    const spoofPdf = await upload(tokenFor(owner), PNG, "facture.pdf", "application/pdf");
    if (spoofPdf.json?.objectPath) created.push(spoofPdf.json.objectPath);
    expectStatus("PNG declared as PDF rejected", spoofPdf.status, 415);

    const pdf = await upload(tokenFor(owner), PDF, "justificatif.pdf", "application/pdf");
    if (pdf.json?.objectPath) created.push(pdf.json.objectPath);
    expectStatus("genuine PDF accepted", pdf.status, 200);

    const html = await upload(tokenFor(owner), HTML, "page.html", "text/html");
    expectStatus("disallowed type (text/html) rejected", html.status, 400);

    const noAuth = await fetch(`${BASE}/storage/uploads`, { method: "POST", body: new FormData() });
    expectStatus("anonymous upload rejected", noAuth.status, 401);

    // ── Download authorization ────────────────────────────────────────────
    const file = `/storage${objectPath}`;
    const own = await get(file, tokenFor(owner));
    record("owner downloads own file with verified type", own.status === 200 && own.type.startsWith("image/png"), `status=${own.status} type=${own.type}`);
    expectStatus("same-syndicate user may download", (await get(file, tokenFor(sameSyndicate))).status, 200);
    expectStatus("other syndicate denied", (await get(file, tokenFor(otherSyndicate))).status, 403);
    expectStatus("anonymous download denied", (await get(file)).status, 401);
    expectStatus("session token in URL denied", (await get(`${file}?token=${encodeURIComponent(tokenFor(owner))}`)).status, 401);

    const ticketRes = await fetch(`${BASE}/auth/file-ticket`, { method: "POST", headers: { Authorization: `Bearer ${tokenFor(owner)}` } });
    const ticket = ((await ticketRes.json()) as any)?.data?.ticket as string;
    expectStatus("download ticket in URL allowed", (await get(`${file}?token=${encodeURIComponent(ticket)}`)).status, 200);

    const otherTicketRes = await fetch(`${BASE}/auth/file-ticket`, { method: "POST", headers: { Authorization: `Bearer ${tokenFor(otherSyndicate)}` } });
    const otherTicket = ((await otherTicketRes.json()) as any)?.data?.ticket as string;
    expectStatus("other syndicate's ticket still denied", (await get(`${file}?token=${encodeURIComponent(otherTicket)}`)).status, 403);

    expectStatus("unknown private path not served", (await get(`/storage/objects/uploads/00000000-0000-0000-0000-000000000000.png`, tokenFor(owner))).status, 404);

    // ── Cross-tenant references in write/generation payloads ──────────────
    const adminAtlas = await user("user_admin_atlas");
    const post = async (p: string, body: unknown, u: User) => {
      const r = await fetch(`${BASE}${p}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenFor(u)}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, json: (await r.json().catch(() => null)) as any };
    };
    for (const [field, value] of [
      ["lotId", "lot_ag01"],
      ["appelDeFondsId", "adf_9"],
      ["budgetId", "budget_agdal_2026"],
    ] as const) {
      const r = await post("/documents", { title: "Test", category: "attestation", templateId: "attestation", [field]: value }, adminAtlas);
      record(
        `document generation refuses another syndicate's ${field}`,
        r.status === 404 && r.json?.code === "FOREIGN_REFERENCE",
        `status=${r.status} code=${r.json?.code}`,
      );
    }
    const cot = await post("/cotisations", { memberId: "member_4", label: "x", period: "2026-09", amount: 10, dueDate: "2026-09-30" }, adminAtlas);
    // The legacy cotisations module is closed for writes (replaced by the
    // calls for funds): no cotisation can be created, for any member.
    expectStatus("cotisation creation refused (legacy module closed)", cot.status, 410);
    const tx = await post("/finance/transactions", { type: "recette", amount: 10, label: "x", date: "2026-09-26", memberId: "user_member_3" }, adminAtlas);
    expectStatus("transaction attributed to another syndicate's user refused", tx.status, 400);
    const txProof = await post("/finance/transactions", { type: "depense", amount: 10, label: "x", date: "2026-09-26", proofUrl: "/objects/uploads/not-ours.pdf" }, adminAtlas);
    expectStatus("expense justified by a foreign/unknown file refused", txProof.status, 400);
    const audit = await post("/audit", { action: "payment_approved", entity: "appel_de_fonds" }, owner);
    expectStatus("residents cannot write audit entries", audit.status, 403);

    // ── Right of access (Loi 09-08): personal data export ─────────────────
    const exportRes = await fetch(`${BASE}/me/data-export`, { headers: { Authorization: `Bearer ${tokenFor(owner)}` } });
    const exported = (await exportRes.json().catch(() => null)) as any;
    const raw = JSON.stringify(exported ?? {});
    record(
      "data export returns the requester's own profile and charges",
      exportRes.status === 200 &&
        exported?.profile?.email === owner.email &&
        Array.isArray(exported?.appelsDeFonds) &&
        exported.appelsDeFonds.length > 0,
      `status=${exportRes.status} appels=${exported?.appelsDeFonds?.length}`,
    );
    record(
      "data export contains no secrets (password hash, push token)",
      !raw.includes("passwordHash") && !raw.includes("pushToken") && !raw.includes(owner.passwordHash),
      "no secret fields",
    );
    record(
      "data export is scoped to the requester (no other syndicate's data)",
      !raw.includes("syn_jardins_agdal"),
      "no foreign syndicate reference",
    );
    record(
      "data export is served as a downloadable file",
      (exportRes.headers.get("content-disposition") ?? "").includes("attachment"),
      exportRes.headers.get("content-disposition") ?? "",
    );
    expectStatus("path traversal not served", (await get(`/storage/objects/..%2F..%2F.env`, tokenFor(owner))).status, 404);
  } finally {
    if (created.length) {
      await db.delete(storageObjectsTable).where(inArray(storageObjectsTable.objectPath, created));
      for (const p of created) {
        await fs.unlink(path.join(UPLOADS_DIR, path.basename(p))).catch(() => {});
      }
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Documents security suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
