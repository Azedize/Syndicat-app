/**
 * Organizational structure, end to end through the API on the isolated test base:
 *   pnpm --filter @workspace/scripts run testdb -- exec env API_BASE_URL=http://localhost:5056/api node --import=tsx ./src/org-structure-test.ts
 *
 * Scenarios 1-9, 11, 12 of the brief (10 — Arabic RTL and dark mode — is a
 * screen matter, covered by i18n / design-tokens tests and manual review).
 * Everything created here is removed at the end.
 */
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("org-structure: run it against the isolated test base (testdb exec).");
type U = { id: string; email: string; role: string; syndicate_id: string | null; name: string };
const token = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicate_id ?? undefined, name: u.name }, process.env.JWT_SECRET!, { expiresIn: "15m" });
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function api(u: U, method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token(u)}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
const q = <T = any>(text: string, params: unknown[] = []) => pool.unsafe(text, params as any[]) as unknown as Promise<T[]>;
const started = new Date().toISOString();
const condos: string[] = [];
const meetings: string[] = [];

async function main() {
  const picked = await q<{ id: string }>(`
    SELECT s.id FROM syndicates s WHERE s.creation_key LIKE 'seedgen:%' AND s.status = 'active' AND ${writableSubscriptionSql("s")}
      AND (SELECT count(*) FROM users u WHERE u.syndicate_id = s.id AND u.role = 'member' AND u.status = 'active') >= 4
      AND NOT EXISTS (SELECT 1 FROM org_structures o WHERE o.syndicate_id = s.id)
    ORDER BY s.id LIMIT 3`);
  if (picked.length < 3) throw new Error("fixture: 3 writable condominiums needed");
  condos.push(...picked.map((p) => p.id));
  const adminOf = async (sid: string): Promise<U> => ({ ...(await q<U>(`SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND (u.syndicate_id = $1 OR EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = $1 AND m.status = 'active')) LIMIT 1`, [sid]))[0], syndicate_id: sid });
  const membersOf = (sid: string) => q<U>(`SELECT id, email, role, syndicate_id, name FROM users WHERE syndicate_id = $1 AND role = 'member' AND status = 'active' ORDER BY email LIMIT 6`, [sid]);
  const [S1, S2, S3] = condos;
  const [a1, a2, a3] = [await adminOf(S1), await adminOf(S2), await adminOf(S3)];
  const [m1, m2, m3, m4] = await membersOf(S2);
  const structure = async (u: U) => (await api(u, "GET", "/org/structure")).json;
  const comp = (st: any, type: string) => st?.data?.components?.find((c: any) => c.type === type);

  // ── 1-3. Recommendations and templates by size ──
  const small = (await api(a1, "POST", "/org/recommendations", { lots: 10, buildings: 1, residents: 25 })).json?.data;
  check("S1 small residence (10 lots): small template, statutory bodies only", small?.template === "small" && small.items.every((i: any) => i.strength === "statutory"), small?.template);
  const medium = (await api(a2, "POST", "/org/recommendations", { lots: 60, buildings: 1, residents: 150, elevators: 2, employees: 2 })).json?.data;
  check("S2 medium residence (60 lots): medium template, every suggestion explained", medium?.template === "medium" && medium.items.filter((i: any) => i.strength === "consider").every((i: any) => i.reasons.length > 0), medium?.items?.filter((i: any) => i.strength === "consider").map((i: any) => i.type).join(","));
  const large = (await api(a3, "POST", "/org/recommendations", { lots: 400, buildings: 5, residents: 1200, elevators: 10, gardens: true, securityStaff: true, parking: true, pool: true, employees: 12, professionalSyndic: true })).json?.data;
  check("S3 large complex (5 buildings): large template, building referents suggested", large?.template === "large" && large.items.some((i: any) => i.type === "building"));
  check("no internal committee is ever presented as mandatory", [small, medium, large].every((r) => r.items.filter((i: any) => !["general_assembly", "syndic", "vice_syndic", "syndicate_council"].includes(i.type)).every((i: any) => i.strength === "consider")));

  const c1 = await api(a1, "POST", "/org/structure", { template: "small", profile: { lots: 10 } });
  const st1 = await structure(a1);
  check("S1 structure created: general assembly, syndic, adjoint", c1.status === 201 && ["general_assembly", "syndic", "vice_syndic"].every((t) => comp(st1, t)) && st1.data.components.length === 3);
  const act1 = await api(a1, "POST", "/org/structure/activate", {});
  check("S1 activated as version 1", act1.json?.data?.version === 1, `${act1.status}`);
  check("a second structure for the same condominium is refused", (await api(a1, "POST", "/org/structure", { template: "medium" })).status === 409);

  await api(a2, "POST", "/org/structure", { template: "medium", profile: { lots: 60 } });
  const st2 = await structure(a2);
  check("S2 medium: financial, maintenance and communication committees with positions", ["financial", "maintenance", "communication"].every((t) => comp(st2, t)?.positions?.length > 0));
  await api(a3, "POST", "/org/structure", { template: "large", profile: { lots: 400 } });
  const st3 = await structure(a3);
  check("S3 large: six committees", st3.data.components.filter((c: any) => c.category === "committee").length === 6);
  check("draft structure hidden from residents", (await structure(m1)).data === null);

  // ── 4. Custom component and positions ──
  const pool_ = await api(a2, "POST", "/org/components", { type: "custom", name: "Comité piscine", objectives: "Suivi de la piscine", visibility: "team", reportingFrequency: "monthly" });
  check("S4 custom committee created (custom name, objectives, visibility)", pool_.status === 201 && pool_.json?.data?.category === "custom");
  const reserved = await api(a2, "POST", `/org/components/${pool_.json?.data?.id}/positions`, { title: "Trésorier piscine", permissions: ["payments.execute"] });
  check("S4 a reserved power (payments.execute) cannot be given to a committee position", reserved.status === 422 && reserved.json?.code === "RESERVED_POWER");
  const legalTitle = await api(a2, "POST", `/org/components/${pool_.json?.data?.id}/positions`, { title: "Syndic adjoint", permissions: [] });
  check("S4 a committee position cannot take the title of a legal function", legalTitle.status === 422 && legalTitle.json?.code === "LEGAL_TITLE");
  const lifeguard = await api(a2, "POST", `/org/components/${pool_.json?.data?.id}/positions`, { title: "Coordinateur baignade", permissions: ["tasks.view", "tasks.manage", "maintenance.view"], isLeader: true, maxHolders: 1 });
  check("S4 custom position with allowed capabilities", lifeguard.status === 201);

  // ── 5. One member in several committees ──
  const fin = comp(st2, "financial");
  const finMember = fin.positions.find((p: any) => !p.isLeader);
  const finLead = fin.positions.find((p: any) => p.isLeader);
  const maint = comp(st2, "maintenance");
  const maintMember = maint.positions.find((p: any) => !p.isLeader);
  const asg1 = await api(a2, "POST", `/org/positions/${finMember.id}/assignments`, { userId: m1.id });
  const asg2 = await api(a2, "POST", `/org/positions/${maintMember.id}/assignments`, { userId: m1.id });
  check("S5 the same member sits on the financial and maintenance committees", asg1.status === 201 && asg2.status === 201);
  check("S5 …but not twice on the same position", (await api(a2, "POST", `/org/positions/${finMember.id}/assignments`, { userId: m1.id })).status === 409);
  const lead = await api(a2, "POST", `/org/positions/${finLead.id}/assignments`, { userId: m2.id });
  await api(a2, "POST", `/org/positions/${lifeguard.json?.data?.id}/assignments`, { userId: m3.id });
  check("S4 max holders respected (1)", (await api(a2, "POST", `/org/positions/${lifeguard.json?.data?.id}/assignments`, { userId: m4.id })).json?.code === "POSITION_FULL");
  const outsider = (await q<U>(`SELECT id, email, role, syndicate_id, name FROM users WHERE syndicate_id = $1 AND role = 'member' AND status = 'active' LIMIT 1`, [S3]))[0];
  check("a person of another condominium cannot be assigned", (await api(a2, "POST", `/org/positions/${finMember.id}/assignments`, { userId: outsider.id })).json?.code === "USER_OUTSIDE_CONDOMINIUM");
  const [notif] = await q(`SELECT count(*)::int AS n FROM alerts WHERE recipient_user_id = $1 AND key = 'org.assigned' AND created_at >= $2`, [m1.id, started]);
  check("assigned members are notified", notif.n >= 2);
  const [role] = await q(`SELECT role FROM users WHERE id = $1`, [m1.id]);
  check("an assignment never changes the user's role (no privilege escalation)", role.role === "member");

  // ── 6. Replacement without losing history ──
  const rep = await api(a2, "POST", `/org/assignments/${lead.json?.data?.id}/replace`, { userId: m4.id, reason: "Déménagement (test)" });
  const [old] = await q(`SELECT status, end_date, replaced_by FROM org_assignments WHERE id = $1`, [lead.json?.data?.id]);
  check("S6 replaced: previous assignment ended and linked to its replacement", rep.status === 201 && old.status === "ended" && old.replaced_by === rep.json?.data?.id && !!old.end_date);
  const histView = (await structure(a2)).data.components.find((c: any) => c.id === fin.id).positions.find((p: any) => p.id === finLead.id).assignments;
  check("S6 the manager still sees the former holder", histView.some((x: any) => x.status === "ended" && x.userId === m2.id) && histView.some((x: any) => x.status === "active" && x.userId === m4.id));

  // ── 7. Unauthorized changes ──
  check("S7 a member cannot create a committee (403)", (await api(m1, "POST", "/org/components", { type: "social" })).status === 403);
  check("S7 a member cannot assign anyone (403)", (await api(m1, "POST", `/org/positions/${finMember.id}/assignments`, { userId: m2.id })).status === 403);
  check("S7 a committee leader cannot change the structure either (403)", (await api(m4, "PUT", `/org/components/${fin.id}`, { name: "Renommé" })).status === 403);
  check("S7 another condominium's syndic cannot read or change this committee", (await api(a3, "PUT", `/org/components/${fin.id}`, { description: "x" })).status === 404);

  // ── 8. Statutory bodies are protected ──
  const syn = comp(st2, "syndic");
  check("S8 the syndic body cannot be deleted", (await api(a2, "DELETE", `/org/components/${syn.id}`)).json?.code === "STATUTORY_PROTECTED");
  check("S8 …nor renamed", (await api(a2, "PUT", `/org/components/${syn.id}`, { name: "Gérant" })).json?.code === "STATUTORY_PROTECTED");
  check("S8 …nor closed", (await api(a2, "POST", `/org/components/${syn.id}/close`, { reason: "test" })).json?.code === "STATUTORY_PROTECTED");
  check("S8 …and its holder is not appointed here (elections)", (await api(a2, "POST", `/org/components/${syn.id}/positions`, { title: "Titulaire" })).json?.code === "STATUTORY_PROTECTED");
  check("S8 a description can still be added to a statutory body", (await api(a2, "PUT", `/org/components/${syn.id}`, { description: "Désigné par l'AG du …" })).status === 200);

  // ── 9. A committee member cannot approve a payment ──
  // A submitted expense of this condominium; generated data may have none: the
  // test then adds its own (no ledger entry, no payment) and removes it after.
  let [expense] = await q(`SELECT id FROM expenses WHERE syndicate_id = $1 AND status = 'submitted' LIMIT 1`, [S2]);
  let ownExpense = false;
  if (!expense) {
    [expense] = await q(
      `INSERT INTO expenses (syndicate_id, reference, label, category, amount, proof_url, status, created_by)
       VALUES ($1, 'TEST-ORG-S9-' || floor(extract(epoch FROM now()))::text, 'Dépense de test (org-structure S9)', 'entretien', 120.00, '/objects/uploads/test-org-s9.pdf', 'submitted', $2)
       RETURNING id`,
      [S2, a2.id],
    );
    ownExpense = true;
  }
  if (expense) {
    const approve = await api(m1, "POST", `/expenses/${expense.id}/approve`, {});
    check("S9 a financial committee member cannot approve an expense (403)", approve.status === 403, `${approve.status}`);
    if (ownExpense) await q(`DELETE FROM expenses WHERE id = $1 AND status = 'submitted' AND ledger_entry_id IS NULL`, [expense.id]);
  } else check("S9 fixture: a submitted expense", false, "none");
  const ws = await api(m1, "GET", `/org/components/${fin.id}/workspace`);
  check("S9 …but sees the finances read-only in the committee workspace", ws.status === 200 && Array.isArray(ws.json?.data?.finance?.expenses) && !ws.json.data.capabilities.includes("expenses.approve"));
  check("S9 a plain member cannot create committee tasks (tasks.manage)", (await api(m1, "POST", `/org/components/${fin.id}/tasks`, { title: "Revoir les factures" })).json?.code === "CAPABILITY_REQUIRED");
  const reco = await api(m1, "POST", `/org/components/${fin.id}/tasks`, { kind: "recommendation", title: "Renégocier le contrat de nettoyage" });
  check("S9 …but can send a recommendation to the syndic", reco.status === 201);
  check("S9 the member cannot decide on it (syndic only)", (await api(m1, "POST", `/org/tasks/${reco.json?.data?.id}/respond`, { response: "accepted" })).status === 403);
  const answer = await api(a2, "POST", `/org/tasks/${reco.json?.data?.id}/respond`, { response: "declined", note: "Contrat en cours jusqu'en juin" });
  check("S9 the syndic records his decision", answer.json?.data?.syndicResponse === "declined");
  const task = await api(m4, "POST", `/org/components/${fin.id}/tasks`, { title: "Comparer trois devis", assigneeUserId: m1.id });
  check("the committee leader creates and assigns a task to a member", task.status === 201);
  check("the assignee updates its progress", (await api(m1, "PUT", `/org/tasks/${task.json?.data?.id}`, { status: "in_progress" })).status === 200);
  check("a non-member cannot open the workspace (403)", (await api(m3, "GET", `/org/components/${fin.id}/workspace`)).status === 403);

  // ── 11. Change after a general assembly decision ──
  const meetingId = `test-org-ag-${Date.now()}`;
  meetings.push(meetingId);
  await q(`INSERT INTO meetings (id, syndicate_id, title, date, type, status) VALUES ($1, $2, 'AG — création du comité sécurité (test)', $3, 'ag_ordinaire', 'completed')`, [meetingId, S2, new Date().toISOString().slice(0, 10)]);
  const sec = await api(a2, "POST", "/org/components", { type: "security", decisionMeetingId: meetingId });
  check("S11 committee created with the general assembly decision attached", sec.status === 201 && sec.json?.data?.decisionMeetingId === meetingId);
  const [foreignMeeting] = await q(`SELECT id FROM meetings WHERE syndicate_id = $1 LIMIT 1`, [S3]);
  if (foreignMeeting) check("S11 another condominium's assembly is refused", (await api(a2, "POST", "/org/components", { type: "social", decisionMeetingId: foreignMeeting.id })).json?.code === "MEETING_NOT_FOUND");
  const v1 = await api(a2, "POST", "/org/structure/activate", { reason: "Mise en place" });
  const v2 = await api(a2, "POST", "/org/structure/activate", { reason: "Décision de l'AG", decisionMeetingId: meetingId });
  const hist = (await api(a2, "GET", "/org/structure/history")).json?.data;
  check("S11 each activation is a version with its snapshot and decision", v1.json?.data?.version === 1 && v2.json?.data?.version === 2 && hist?.versions?.[0]?.decisionMeetingId === meetingId);
  const [snap] = await q(`SELECT jsonb_array_length(snapshot->'components') AS n FROM org_structure_versions WHERE structure_id = (SELECT id FROM org_structures WHERE syndicate_id = $1) AND version = 2`, [S2]);
  check("S11 the snapshot holds the components", snap.n >= 7);
  check("S11 history lists the audit events", hist?.events?.some((e: any) => e.action === "ORG_MEMBER_REPLACED"));
  check("residents see the active structure", (await structure(m3)).data?.status === "active");
  const poolId = pool_.json?.data?.id;
  check("a committee visible to the team only is hidden from residents who are not in it", !(await structure(m2)).data.components.some((c: any) => c.id === poolId));
  check("…but visible to its own members", (await structure(m3)).data.components.some((c: any) => c.id === poolId));

  // ── 12. Closing a committee keeps its history ──
  const close = await api(a2, "POST", `/org/components/${fin.id}/close`, { reason: "Fusion avec le comité audit (test)", decisionMeetingId: meetingId });
  const [after] = await q(`SELECT status FROM org_components WHERE id = $1`, [fin.id]);
  const [kept] = await q(`SELECT (SELECT count(*)::int FROM org_tasks WHERE component_id = $1) AS tasks, (SELECT count(*)::int FROM org_assignments WHERE component_id = $1) AS assignments, (SELECT count(*)::int FROM org_assignments WHERE component_id = $1 AND status = 'active') AS active`, [fin.id]);
  check("S12 closed: tasks and assignments kept, no active member left", close.status === 200 && after.status === "closed" && kept.tasks >= 2 && kept.assignments >= 3 && kept.active === 0, JSON.stringify(kept));
  check("S12 former members lose access to the workspace", (await api(m1, "GET", `/org/components/${fin.id}/workspace`)).status === 403);
  check("S12 a closed committee cannot be deleted (history)", (await api(a2, "DELETE", `/org/components/${fin.id}`)).json?.code === "HAS_HISTORY");
  const unused = await api(a2, "POST", "/org/components", { type: "social" });
  check("an unused committee can be deleted", (await api(a2, "DELETE", `/org/components/${unused.json?.data?.id}`)).status === 200);

  // Cleanup: only what this test created.
  await q(`DELETE FROM org_structures WHERE syndicate_id = ANY($1)`, [condos]);
  await q(`DELETE FROM meetings WHERE id = ANY($1)`, [meetings]);
  await q(`DELETE FROM alerts WHERE syndicate_id = ANY($1) AND created_at >= $2 AND key LIKE 'org.%'`, [condos, started]);
  const [left] = await q(`SELECT count(*)::int AS n FROM org_structures WHERE syndicate_id = ANY($1)`, [condos]);
  check("test data removed", left.n === 0);

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} organization checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await q(`DELETE FROM org_structures WHERE syndicate_id = ANY($1)`, [condos]).catch(() => {});
  await q(`DELETE FROM meetings WHERE id = ANY($1)`, [meetings]).catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
