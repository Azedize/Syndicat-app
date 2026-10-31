/**
 * Data behind the screens connected on 2026-10-25 (agenda, document
 * tracking) and the workflows closed to condominiums — on the isolated test
 * base:
 *
 *   pnpm --filter @workspace/scripts run screens-access:test
 *
 * - workflows (platform-wide rows describing one condominium's affairs) are
 *   read by the platform only; co-owners, syndics and tenants get 403;
 * - document tracking: the summary counts the syndic's own condominium only,
 *   with retention buckets; a co-owner's summary is limited to what they may see;
 * - agenda: a co-owner's due dates are their own calls for funds; a tenant
 *   cannot register for a general meeting; attending one meeting is recorded
 *   once and only in one's own condominium.
 */
import { pool } from "@workspace/db";
import { TEST_EMAIL_LIKE, writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const q = <T = any>(text: string, params: unknown[] = []) => (pool as any).unsafe(text, params) as Promise<T[]>;
async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "MizanTest#2026" }) });
  const t = ((await r.json()) as any)?.data?.token;
  if (!t) throw new Error(`login ${email}: ${r.status}`);
  return t as string;
}
const get = async (token: string, p: string, method = "GET") => {
  const r = await fetch(`${BASE}${p}`, { method, headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
};
let attendedMeeting: { meetingId: string; userId: string } | null = null;

async function main() {
  const [{ d }] = await q<{ d: string }>("SELECT current_database() AS d");
  if (d !== "syndycat_test") throw new Error(`Base de test attendue (syndycat_test), pas ${d}`);
  const [home] = await q<{ id: string }>(`SELECT s.id FROM syndicates s WHERE s.status = 'active' AND s.creation_key LIKE 'seedgen:%' AND ${writableSubscriptionSql("s")}
      AND EXISTS (SELECT 1 FROM meetings m WHERE m.syndicate_id = s.id AND m.date >= to_char(now(), 'YYYY-MM-DD'))
      AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.role = 'tenant' AND u.status = 'active')
      AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.role = 'syndicate_admin' AND u.status = 'active')
      AND EXISTS (SELECT 1 FROM users u JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
                  WHERE u.syndicate_id = s.id AND u.role = 'member' AND u.status = 'active') ORDER BY s.id LIMIT 1`);
  if (!home) throw new Error("fixture: no residence with an upcoming meeting, a syndic, a co-owner and a tenant");
  const pick = async (role: string) => (await q<{ id: string; email: string }>(`SELECT u.id, u.email FROM users u
      LEFT JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
      WHERE u.syndicate_id = $1 AND u.role = $2 AND u.status = 'active' AND u.email LIKE $3 AND ($2 <> 'member' OR m.id IS NOT NULL) ORDER BY u.email LIMIT 1`, [home.id, role, TEST_EMAIL_LIKE]))[0];
  const member = await pick("member");
  const syndic = await pick("syndicate_admin");
  const tenant = await pick("tenant");
  const [sa] = await q<{ email: string }>(`SELECT email FROM users WHERE role = 'super_admin' AND status = 'active' AND email LIKE $1 LIMIT 1`, [TEST_EMAIL_LIKE]);
  const tMember = await login(member.email);
  const tSyndic = await login(syndic.email);
  const tTenant = await login(tenant.email);
  const tSa = await login(sa.email);

  // Workflows
  for (const [label, token] of [["co-owner", tMember], ["syndic", tSyndic], ["tenant", tTenant]] as const) {
    check(`workflows are not readable by a ${label} (403)`, (await get(token, "/workflows")).status === 403);
  }
  const [wf] = await q<{ id: string }>(`SELECT id FROM workflows LIMIT 1`);
  if (wf) check("…nor one workflow by id (403)", (await get(tMember, `/workflows/${wf.id}`)).status === 403);
  check("the platform still reads them", (await get(tSa, "/workflows")).status === 200);

  // Document tracking
  const sum = await get(tSyndic, "/documents/summary");
  const [{ n: own }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM documents WHERE syndicate_id = $1 AND is_deleted = false`, [home.id]);
  check("document tracking: the syndic's summary counts their condominium only", sum.status === 200 && sum.json?.data?.total === own, `${sum.json?.data?.total} / ${own}`);
  check("…with its retention buckets", typeof sum.json?.data?.expiring?.in30 === "number" && Array.isArray(sum.json?.data?.expiring?.documents30));
  const gen = await get(tSyndic, "/documents/summary?source=generated");
  const up = await get(tSyndic, "/documents/summary?source=upload");
  check("tracking counts split exactly: generated + library = total", gen.status === 200 && up.status === 200 && gen.json?.data?.total + up.json?.data?.total === sum.json?.data?.total, `${gen.json?.data?.total} + ${up.json?.data?.total} = ${sum.json?.data?.total}`);
  check("an unknown source is refused (400)", (await get(tSyndic, "/documents/summary?source=autre")).status === 400);
  const sumMember = await get(tMember, "/documents/summary");
  check("a co-owner's summary is limited to what they may see", sumMember.status === 200 && sumMember.json?.data?.total <= own, `${sumMember.json?.data?.total} ≤ ${own}`);

  // Agenda
  const calls = await get(tMember, "/appels-de-fonds");
  const ids: string[] = (calls.json?.data ?? []).map((c: any) => c.id);
  const [{ n: foreign }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM appels_de_fonds a JOIN members m ON m.id = ANY(a.debtor_member_ids) OR m.id = a.owner_id
      WHERE a.id = ANY($1) AND lower(m.email) <> lower($2)`, [ids, member.email]);
  check("agenda: a co-owner's due dates are their own calls only", calls.status === 200 && ids.length > 0 && foreign === 0, `${ids.length} call(s)`);
  const [meeting] = await q<{ id: string }>(`SELECT id FROM meetings WHERE syndicate_id = $1 AND date >= to_char(now(), 'YYYY-MM-DD') ORDER BY date LIMIT 1`, [home.id]);
  check("agenda: a tenant cannot register for a general meeting (403)", (await get(tTenant, `/meetings/${meeting.id}/attend`, "POST")).status === 403);
  const [already] = await q(`SELECT 1 FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2`, [meeting.id, member.id]);
  const first = await get(tMember, `/meetings/${meeting.id}/attend`, "POST");
  if (!already && (first.status === 200 || first.status === 201)) attendedMeeting = { meetingId: meeting.id, userId: member.id };
  const second = await get(tMember, `/meetings/${meeting.id}/attend`, "POST");
  const [{ n: rows }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2`, [meeting.id, member.id]);
  check("agenda: registering twice records one attendance", rows === 1 && second.status !== 500, `${first.status}/${second.status}, ${rows} row`);
  const [other] = await q<{ id: string }>(`SELECT id FROM meetings WHERE syndicate_id <> $1 LIMIT 1`, [home.id]);
  check("agenda: another condominium's meeting does not exist (404)", (await get(tMember, `/meetings/${other.id}/attend`, "POST")).status === 404);
}

main()
  .catch((e) => { console.error(e); checks.push({ name: "run", ok: false }); })
  .finally(async () => {
    if (attendedMeeting) await q(`DELETE FROM meeting_attendees WHERE meeting_id = $1 AND user_id = $2`, [attendedMeeting.meetingId, attendedMeeting.userId]);
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} screen access checks passed`);
    await pool.end();
    if (failed) process.exit(1);
  });
