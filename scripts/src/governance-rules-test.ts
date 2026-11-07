/**
 * Elections and resignations of the syndic, end to end through the API on the
 * isolated test base (2026-11-06 rules):
 *   pnpm --filter @workspace/scripts run testdb -- exec env API_BASE_URL=http://localhost:5056/api node --import=tsx ./src/governance-rules-test.ts
 *
 * Syndic and adjoint elected with voices weighted by quotes-parts at 3/4 of all
 * voices; an election without the majority; several seats per ballot; the 10 %
 * proxy limit; the syndic cannot preside the assembly; resignation of the
 * syndic (interim of the adjoint, handover, assembly within 30 days,
 * successor), of the adjoint, and with no adjoint left; permissions and
 * isolation between condominiums. Every row created here is removed at the end.
 */
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("governance-rules: run it against the isolated test base (testdb exec).");
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
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const units = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 10_000);

const created: string[] = [];
const started = new Date();

async function main() {
  // A writable generated condominium with at least 6 owners who have voices.
  const [condo] = await q<{ id: string }>(`
    SELECT s.id FROM syndicates s WHERE s.creation_key LIKE 'seedgen:%' AND s.status = 'active' AND ${writableSubscriptionSql("s")}
      AND (SELECT count(*) FROM users u WHERE u.syndicate_id = s.id AND u.role = 'member' AND u.status = 'active') >= 6
      -- no syndic or adjoint already in office (they would take part in the resignation scenarios)
      AND NOT EXISTS (SELECT 1 FROM conseil_syndical c WHERE c.syndicate_id = s.id AND c.status = 'active' AND c.role IN ('syndic', 'vice_syndic'))
    ORDER BY s.id LIMIT 1`);
  const [other] = await q<{ id: string }>(`SELECT s.id FROM syndicates s WHERE s.creation_key LIKE 'seedgen:%' AND s.status = 'active' AND s.id <> $1 AND ${writableSubscriptionSql("s")} ORDER BY s.id LIMIT 1`, [condo.id]);
  const sid = condo.id;
  const admin: U = { ...(await q<U>(`SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND (u.syndicate_id = $1 OR EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = $1 AND m.status = 'active')) LIMIT 1`, [sid]))[0], syndicate_id: sid };
  const otherAdmin: U = { ...(await q<U>(`SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND (u.syndicate_id = $1 OR EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = $1 AND m.status = 'active')) LIMIT 1`, [other.id]))[0], syndicate_id: other.id };
  // Owners with their voices (same formula as the API: tantièmes × share of the lots owned now).
  const owners = await q<U & { voices: string }>(`
    SELECT u.id, u.email, u.role, u.syndicate_id, u.name, COALESCE(SUM(l.tantiemes * o.share_percent / 100), 0)::numeric(14,4)::text AS voices
    FROM users u JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email)
    LEFT JOIN lot_ownerships o ON o.member_id = m.id AND o.end_date IS NULL
    LEFT JOIN lots l ON l.id = o.lot_id AND l.archived_at IS NULL
    WHERE u.syndicate_id = $1 AND u.role = 'member' AND u.status = 'active'
    GROUP BY u.id ORDER BY u.email`, [sid]);
  const voters = owners.filter((o) => units(o.voices) > 0);
  if (voters.length < 6) throw new Error(`fixture: ${voters.length} owners with voices`);
  console.log(`Copropriété ${sid} : ${voters.length} copropriétaires avec des voix`);
  const [A, B, C, D, E] = voters;

  const createElection = async (body: Record<string, unknown>) => {
    const r = await api(admin, "POST", "/elections", { title: `Test règles ${body.electionType} ${Date.now()}`, candidacyStart: day(-10), candidacyEnd: day(-5), startDate: day(-4), endDate: day(5), ...body });
    if (r.json?.data?.id) created.push(r.json.data.id);
    return r;
  };
  const candidacy = async (eid: string, u: U) => {
    const r = await api(u, "POST", `/elections/${eid}/candidates`, {});
    if (r.json?.data?.id) await api(admin, "PUT", `/elections/${eid}/candidates/${r.json.data.id}/validate`, { decision: "approved" });
    return r;
  };
  const go = (eid: string, action: string, extra: Record<string, unknown> = {}) => api(admin, "POST", `/elections/${eid}/transition`, { action, ...extra });
  /** A syndic / adjoint election: `who` vote for the first candidate. */
  async function weightedElection(type: "syndic" | "vice_syndic", candidates: U[], who: U[]) {
    const e = (await createElection({ electionType: type })).json?.data;
    await go(e.id, "open_candidacy");
    const ids = [];
    for (const c of candidates) ids.push((await candidacy(e.id, c)).json?.data?.id);
    await go(e.id, "start_campaign");
    await go(e.id, "open_voting");
    let ok = 0;
    for (const v of who) if ((await api(v, "POST", `/elections/${e.id}/vote`, { candidateIds: [ids[0]] })).status === 200) ok++;
    return { e, ids, ok };
  }

  // ── 1. Syndic: type rules, voices weighted by quotes-parts, 3/4 of all voices ──
  const refused = await createElection({ electionType: "syndic", weighting: "per_voter" });
  check("syndic election with one voice per voter refused (422 QUOTE_PART_REQUIRED)", refused.status === 422 && refused.json?.errors?.some((x: any) => x.code === "QUOTE_PART_REQUIRED"), `${refused.status}`);
  const s1 = await weightedElection("syndic", [A, B], voters);
  check("syndic election created with the legal settings (quote-part, 3/4, all voices, 1 seat)", s1.e?.weighting === "quote_part" && s1.e?.votingMethod === "three_quarters" && s1.e?.majorityBase === "all_voices" && s1.e?.seatsCount === 1);
  const [cA] = await q(`SELECT votes, voices FROM candidates WHERE id = $1`, [s1.ids[0]]);
  const expected = voters.slice(0, s1.ok).reduce((t, v) => t + units(v.voices), 0);
  check("ballots and voices counted apart (votes = ballots, voices = sum of quotes-parts)", cA.votes === s1.ok && units(cA.voices) === expected && units(cA.voices) !== cA.votes * 10_000, `${cA.votes} bulletins, ${cA.voices} voix`);
  const multiChoice = await api(E, "POST", `/elections/${s1.e.id}/vote`, { candidateIds: s1.ids });
  check("syndic ballot: a second choice is refused", multiChoice.status === 400, `${multiChoice.status} ${multiChoice.json?.code ?? multiChoice.json?.error}`);
  await go(s1.e.id, "close_voting");
  const pub1 = await go(s1.e.id, "publish_results");
  const [mSyndic] = await q(`SELECT id, role, status FROM conseil_syndical WHERE election_id = $1`, [s1.e.id]);
  check("every owner votes for A: designated syndic (mandate « syndic »)", pub1.json?.outcome === "elected" && mSyndic?.role === "syndic", `${pub1.json?.outcome} ${mSyndic?.role}`);

  // ── 2. Adjoint without the majority, then elected ──
  const few = voters.slice(0, Math.max(1, Math.floor(voters.length / 3)));
  const v1 = await weightedElection("vice_syndic", [B, C], few);
  await api(admin, "PUT", `/elections/${v1.e.id}/invalid-votes`, { count: 0 });
  // A third of the owners is below the 50 % quorum: count the case only if the quorum is reached.
  await q(`UPDATE elections SET quorum_percent = 0 WHERE id = $1`, [v1.e.id]);
  await go(v1.e.id, "close_voting");
  const [ev1] = await q(`SELECT eligible_voices FROM elections WHERE id = $1`, [v1.e.id]);
  const share = few.slice(0, v1.ok).reduce((t, v) => t + units(v.voices), 0);
  const pubV1 = await go(v1.e.id, "publish_results");
  const expectOutcome = share * 4 >= units(ev1.eligible_voices) * 3 ? "elected" : "no_majority";
  const [ev1After] = await q(`SELECT status, outcome_details FROM elections WHERE id = $1`, [v1.e.id]);
  check("adjoint voted by a third of the owners: outcome follows 3/4 of all voices", pubV1.json?.outcome === expectOutcome, `${share / 10_000} / ${ev1.eligible_voices} voix → ${pubV1.json?.outcome}`);
  if (expectOutcome === "no_majority") check("not designated: new deliberation, court designation path (art. 19) noted", ev1After.status === "deliberation_required" && ev1After.outcome_details?.legalPath === "court_designation_art19");

  const v2 = (await createElection({ electionType: "vice_syndic" })).json?.data;
  await go(v2.id, "open_candidacy");
  const v2B = (await candidacy(v2.id, B)).json?.data?.id;
  await candidacy(v2.id, C);
  await go(v2.id, "start_campaign");
  await go(v2.id, "open_voting");
  // Proxy limit (art. 16 decies): what a holder represents stays under 10 % of all voices.
  const totalVoices = voters.reduce((t, v) => t + units(v.voices), 0);
  const holder = voters[voters.length - 1];
  const grantors = [...voters.slice(0, -1)].sort((x, y) => units(y.voices) - units(x.voices)).slice(0, 2);
  let represented = 0;
  for (const g of grantors) {
    represented += units(g.voices);
    const r = await api(g, "POST", `/elections/${v2.id}/delegate`, { granteeId: holder.id });
    const over = represented * 100 > totalVoices * 10;
    check(`proxy ${grantors.indexOf(g) + 1}: ${(represented / totalVoices * 100).toFixed(1)} % of the voices → ${over ? "refused (PROXY_VOICES_LIMIT)" : "accepted"}`, over ? r.status === 400 && r.json?.code === "PROXY_VOICES_LIMIT" : r.status === 201 || r.status === 200, `${r.status} ${r.json?.code ?? ""}`);
    if (over) represented -= units(g.voices);
  }
  for (const g of grantors) await api(g, "DELETE", `/elections/${v2.id}/delegate`);
  for (const v of voters) await api(v, "POST", `/elections/${v2.id}/vote`, { candidateIds: [v2B] });
  await go(v2.id, "close_voting");
  await go(v2.id, "publish_results");
  const [mVice] = await q(`SELECT id, role FROM conseil_syndical WHERE election_id = $1`, [v2.id]);
  check("adjoint elected by every owner (mandate « vice_syndic »)", mVice?.role === "vice_syndic");

  // ── 3. The syndic cannot preside the assembly (art. 17) ──
  const ag = (await createElection({ electionType: "ag_president" })).json?.data;
  await go(ag.id, "open_candidacy");
  const agA = await candidacy(ag.id, A);
  check("the syndic cannot stand for president of the assembly (403 SYNDIC_CANNOT_PRESIDE)", agA.status === 403 && agA.json?.code === "SYNDIC_CANNOT_PRESIDE", `${agA.status}`);
  const agD = await candidacy(ag.id, D);
  check("another owner can", agD.status === 201, `${agD.status}`);

  // ── 4. Several seats on one ballot ──
  const mem = (await createElection({ electionType: "members", seatsCount: 2, quorumPercent: 0 })).json?.data;
  check("2-seat election: several choices per ballot", mem?.ballotMode === "multiple");
  await go(mem.id, "open_candidacy");
  const [m1, m2, m3] = [(await candidacy(mem.id, C)).json?.data?.id, (await candidacy(mem.id, D)).json?.data?.id, (await candidacy(mem.id, E)).json?.data?.id];
  await go(mem.id, "start_campaign");
  await go(mem.id, "open_voting");
  const tooMany = await api(A, "POST", `/elections/${mem.id}/vote`, { candidateIds: [m1, m2, m3] });
  check("3 choices for 2 seats refused (TOO_MANY_CHOICES)", tooMany.status === 400 && tooMany.json?.code === "TOO_MANY_CHOICES");
  const twice = await api(A, "POST", `/elections/${mem.id}/vote`, { candidateIds: [m1, m1] });
  check("the same candidate twice refused (DUPLICATE_CHOICE)", twice.status === 400 && twice.json?.code === "DUPLICATE_CHOICE");
  check("one choice for 2 seats accepted", (await api(A, "POST", `/elections/${mem.id}/vote`, { candidateIds: [m1] })).status === 200);
  check("two choices accepted", (await api(B, "POST", `/elections/${mem.id}/vote`, { candidateIds: [m1, m2] })).status === 200);
  const [b] = await q(`SELECT count(DISTINCT ballot_id)::int AS ballots, count(*)::int AS rows FROM votes WHERE election_id = $1`, [mem.id]);
  check("2 ballots, 3 selections (grouped by ballot, no voter on the ballot)", b.ballots === 2 && b.rows === 3);
  await go(mem.id, "close_voting");
  const res = await api(A, "GET", `/elections/${mem.id}/results`);
  const rank = (res.json?.data?.ranking ?? []).map((c: any) => `${c.id === m1 ? "C" : c.id === m2 ? "D" : "E"}:${c.votes}`);
  check("results: C 2 ballots, D 1, E 0", rank.join(",") === "C:2,D:1,E:0", rank.join(","));

  // ── 5. Resignation of the syndic (art. 26 ter, 27) ──
  const notHolder = await api(D, "POST", "/governance/resignations", { mandateId: mSyndic.id });
  check("another owner cannot resign for the syndic (403)", notHolder.status === 403);
  const future = await api(A, "POST", "/governance/resignations", { mandateId: mSyndic.id, notifiedAt: day(3) });
  check("a notification date in the future is refused", future.status === 400 && future.json?.code === "NOTIFICATION_IN_FUTURE");
  const legacy = await api(A, "POST", `/elections/mandates/${mSyndic.id}/resign`, { reason: "x" });
  check("the former one-click resignation is refused for the syndic (OFFICIAL_RESIGNATION_REQUIRED)", legacy.status === 409 && legacy.json?.code === "OFFICIAL_RESIGNATION_REQUIRED");
  const revoke = await api(admin, "POST", `/elections/mandates/${mSyndic.id}/revoke`, { reason: "x" });
  check("the syndic is not revoked by the administrator (art. 27 bis)", revoke.status === 409 && revoke.json?.code === "REVOCATION_BY_GENERAL_ASSEMBLY");
  const rs = await api(A, "POST", "/governance/resignations", { mandateId: mSyndic.id, reason: "Départ de la résidence (test)" });
  const r1 = rs.json?.data;
  check("resignation recorded: 30 days to hold the assembly, the adjoint takes over", rs.status === 201 && r1?.agDeadline === day(30) && r1?.interimMandateId === mVice.id && r1?.escalation === "none", `${rs.status} ${r1?.agDeadline} interim=${r1?.interimMandateId === mVice.id}`);
  const [mAfter] = await q(`SELECT status FROM conseil_syndical WHERE id = $1`, [mSyndic.id]);
  check("the mandate is kept, status resigned (no deletion)", mAfter?.status === "resigned");
  const [alert] = await q(`SELECT count(*)::int AS n FROM alerts WHERE syndicate_id = $1 AND key = 'resignation.syndic' AND target = 'all' AND created_at >= $2`, [sid, started.toISOString()]);
  check("every co-owner is informed (alert to all)", alert.n >= 1);
  const again = await api(A, "POST", "/governance/resignations", { mandateId: mSyndic.id });
  check("a second resignation of the same mandate is refused", again.status === 409);
  const list = await api(E, "GET", "/governance/resignations");
  check("co-owners see the resignation and its deadline", list.status === 200 && list.json?.data?.some((x: any) => x.id === r1.id && typeof x.daysLeft === "number"));
  const otherList = await api(otherAdmin, "GET", "/governance/resignations");
  check("isolation: another condominium does not see it", otherList.status === 200 && !otherList.json?.data?.some((x: any) => x.id === r1.id));
  const foreign = await api(otherAdmin, "PUT", `/governance/resignations/${r1.id}/handover`, { items: { documents: true } });
  check("isolation: another condominium cannot act on it (404)", foreign.status === 404);
  const byOwner = await api(E, "PUT", `/governance/resignations/${r1.id}/handover`, { items: { documents: true } });
  check("an ordinary owner cannot tick the handover (403)", byOwner.status === 403);
  const part = await api(A, "PUT", `/governance/resignations/${r1.id}/handover`, { items: { documents: true, archives: true, registers: true } });
  check("handover partly done: not complete", part.json?.data?.handoverCompletedAt === null);
  const early = await api(admin, "POST", `/governance/resignations/${r1.id}/close`, { noSuccessor: true });
  check("closing without the assembly is refused (ASSEMBLY_REQUIRED)", early.status === 409 && early.json?.code === "ASSEMBLY_REQUIRED");
  const full = await api(B, "PUT", `/governance/resignations/${r1.id}/handover`, { items: { treasury: true, assets: true, cash: true } });
  check("the adjoint completes the handover (documents, archives, registers, treasury, assets, cash)", !!full.json?.data?.handoverCompletedAt, `${full.status}`);
  const meetingId = `test-gov-meeting-${Date.now()}`;
  await q(`INSERT INTO meetings (id, syndicate_id, title, date, type, status) VALUES ($1, $2, 'AG — désignation d''un nouveau syndic (test)', $3, 'ag_extraordinaire', 'scheduled')`, [meetingId, sid, day(40)]);
  const [foreignMeeting] = await q(`SELECT id FROM meetings WHERE syndicate_id = $1 LIMIT 1`, [other.id]);
  if (foreignMeeting) check("an assembly of another condominium is refused", (await api(admin, "PUT", `/governance/resignations/${r1.id}/assembly`, { meetingId: foreignMeeting.id })).status === 404);
  const late = await api(admin, "PUT", `/governance/resignations/${r1.id}/assembly`, { meetingId });
  check("an assembly after the 30 days is recorded with a warning", late.status === 200 && late.json?.warning?.code === "ASSEMBLY_AFTER_DEADLINE");
  const wrong = await api(admin, "POST", `/governance/resignations/${r1.id}/close`, { successorMandateId: mSyndic.id });
  check("the resigning mandate is not a successor", wrong.status === 400 && wrong.json?.code === "SUCCESSOR_INVALID");
  const s2 = await weightedElection("syndic", [D, C], voters);
  await go(s2.e.id, "close_voting");
  await go(s2.e.id, "publish_results");
  const [mNew] = await q(`SELECT id FROM conseil_syndical WHERE election_id = $1 AND role = 'syndic'`, [s2.e.id]);
  check("the assembly designates a new syndic", !!mNew);
  check("an owner cannot close the resignation (403)", (await api(E, "POST", `/governance/resignations/${r1.id}/close`, { successorMandateId: mNew?.id })).status === 403);
  const closed = await api(admin, "POST", `/governance/resignations/${r1.id}/close`, { successorMandateId: mNew?.id });
  check("closed with the successor, history kept", closed.json?.data?.status === "closed" && closed.json?.data?.successorMandateId === mNew?.id);

  // ── 6. Resignation of the adjoint (art. 27 ter), then of the syndic with no adjoint ──
  const rv = await api(B, "POST", "/governance/resignations", { mandateId: mVice.id });
  check("adjoint's resignation: the syndic calls an assembly within 30 days, no interim", rv.status === 201 && rv.json?.data?.agDeadline === day(30) && rv.json?.data?.interimMandateId === null && rv.json?.data?.role === "vice_syndic");
  const [alertV] = await q(`SELECT count(*)::int AS n FROM alerts WHERE syndicate_id = $1 AND key = 'resignation.viceSyndic' AND created_at >= $2`, [sid, started.toISOString()]);
  check("co-owners informed of the adjoint's resignation", alertV.n >= 1);
  const rn = await api(D, "POST", "/governance/resignations", { mandateId: mNew?.id });
  check("syndic resigning with no adjoint in office: escalation no_deputy", rn.status === 201 && rn.json?.data?.escalation === "no_deputy" && rn.json?.data?.interimMandateId === null);
  const [alertN] = await q(`SELECT count(*)::int AS n FROM alerts WHERE syndicate_id = $1 AND key = 'resignation.syndicNoDeputy' AND created_at >= $2`, [sid, started.toISOString()]);
  check("co-owners told that nobody takes over", alertN.n >= 1);
  await api(admin, "PUT", `/governance/resignations/${rn.json?.data?.id}/assembly`, { meetingId });
  const none = await api(admin, "POST", `/governance/resignations/${rn.json?.data?.id}/close`, { noSuccessor: true });
  check("assembly designated nobody: escalation no_successor, stays open", none.json?.data?.escalation === "no_successor" && none.json?.data?.status === "open");

  // Cleanup: only what this test created (isolated base).
  await q(`DELETE FROM mandate_resignations WHERE syndicate_id = $1 AND created_at >= $2`, [sid, started.toISOString()]);
  await q(`DELETE FROM conseil_syndical WHERE election_id = ANY($1)`, [created]);
  await q(`DELETE FROM elections WHERE parent_election_id = ANY($1)`, [created]);
  await q(`DELETE FROM elections WHERE id = ANY($1)`, [created]);
  await q(`DELETE FROM meetings WHERE id = $1`, [meetingId]);
  await q(`DELETE FROM alerts WHERE syndicate_id = $1 AND created_at >= $2 AND (key LIKE 'resignation.%' OR key LIKE 'election.%' OR key LIKE 'mandate.%')`, [sid, started.toISOString()]);
  const [left] = await q(`SELECT count(*)::int AS n FROM elections WHERE id = ANY($1)`, [created]);
  check("test data removed", left.n === 0);

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} governance rule checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
