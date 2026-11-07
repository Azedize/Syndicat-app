/**
 * Defects found while using the app on the emulator (2026-11-07) — isolated test base only:
 *   pnpm --filter @workspace/scripts run user-testing-fixes:test
 *
 * - A meeting date or time that does not exist is refused (it used to be stored as typed).
 * - The minutes screen lists every meeting type (?scope=minutes); the AG list keeps AGs only.
 * - The minutes PDF of a meeting can be found from the meeting (GET /documents?meetingId=).
 * - The minutes template no longer fills in invented participants, agenda or votes.
 * Everything created here is removed at the end.
 */
import { readFileSync } from "node:fs";
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("user-testing-fixes: run it against the isolated test base.");
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function call(token: string | null, method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

async function main() {
  const [admin] = await pool.unsafe(`
    SELECT u.id, u.email, u.syndicate_id FROM users u JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
     WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test'
       AND ${writableSubscriptionSql("s")}
       AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
     ORDER BY u.email LIMIT 1`);
  const login = await call(null, "POST", "/auth/login", { email: admin.email, password: "MizanTest#2026" });
  const token = login.body?.data?.token as string;
  if (!token) throw new Error(`login ${login.status}`);
  const created: string[] = [];
  const base = { title: "UTF réunion de test", time: "18:30", location: "Salle commune", type: "board", description: "" };

  try {
    // 1. Dates and times that do not exist.
    for (const date of ["2026-13-45", "2026-02-30", "15/11/2026", ""]) {
      const r = await call(token, "POST", "/meetings", { ...base, date });
      check(`meeting date « ${date} » is refused`, r.status === 400, String(r.status));
    }
    const badTime = await call(token, "POST", "/meetings", { ...base, date: "2026-12-01", time: "25:00" });
    check("meeting time « 25:00 » is refused", badTime.status === 400, String(badTime.status));
    const ok = await call(token, "POST", "/meetings", { ...base, date: "2026-12-01" });
    const id = ok.body?.data?.id as string | undefined;
    if (id) created.push(id);
    check("a real date and time are accepted", ok.status === 201 && !!id, String(ok.status));
    const badEdit = await call(token, "PUT", `/meetings/${id}`, { date: "2026-04-31" });
    check("editing to a non-existent date is refused", badEdit.status === 400, String(badEdit.status));
    const [stored] = await pool`SELECT date FROM meetings WHERE id = ${id ?? ""}`;
    check("the stored date is unchanged after the refused edit", stored?.date === "2026-12-01", stored?.date);

    // 2. Minutes list: every meeting type with ?scope=minutes, AGs only without it.
    const ag = await call(token, "GET", "/ag-meetings");
    const minutes = await call(token, "GET", "/ag-meetings?scope=minutes");
    check("the AG list does not show a board meeting", ag.status === 200 && !(ag.body?.data ?? []).some((m: any) => m.id === id));
    check("the minutes list shows the board meeting", minutes.status === 200 && (minutes.body?.data ?? []).some((m: any) => m.id === id && m.type === "board"));

    // 3. The minutes PDF of a meeting is found from the meeting.
    const gen = await call(token, "POST", "/documents", { title: base.title, category: "pv", templateId: "pv", meetingId: id, language: "fr" });
    const docId = gen.body?.data?.id as string | undefined;
    check("the minutes are generated from the meeting", gen.status === 201 && !!docId, String(gen.status));
    const found = await call(token, "GET", `/documents?meetingId=${id}&category=pv`);
    check("GET /documents?meetingId= returns them", found.status === 200 && (found.body?.data ?? []).some((d: any) => d.id === docId));
    const other = await call(token, "GET", `/documents?meetingId=00000000-0000-4000-8000-000000000000&category=pv`);
    check("another meeting returns none", other.status === 200 && (other.body?.data ?? []).length === 0);
    const bad = await call(token, "GET", `/documents?meetingId=not-a-uuid`);
    check("a malformed meeting id is refused", bad.status === 400, String(bad.status));

    // 4. No invented content left in the minutes template.
    const src = readFileSync(new URL("../../artifacts/api-server/src/lib/documentPdf.ts", import.meta.url), "utf8");
    const pv = src.slice(src.indexOf('case "pv": {'), src.indexOf('case "convocation":'));
    for (const invented of ["James Anderson", "CEO Strategic Update", "Board Room", "09:30 AM", "90.91", "shareholder"]) {
      check(`minutes template has no « ${invented} »`, pv.length > 0 && !pv.includes(invented));
    }
  } finally {
    if (created.length) {
      await pool`DELETE FROM documents WHERE generation_params->>'meetingId' = ANY(${created})`;
      await pool`DELETE FROM meeting_attendees WHERE meeting_id = ANY(${created})`;
      await pool`DELETE FROM meetings WHERE id = ANY(${created})`;
    }
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} user-testing checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
