// Executes the production Election Audit test scenarios against the LIVE api-server,
// using the "Résidence Al Andalous" data seeded by election-audit-seed.ts.
//
// Usage: pnpm --filter @workspace/scripts run election-audit:test
//
// Prints a PASS/FAIL line per check plus a JSON results dump at the end. This does NOT
// modify the report — the main agent reads this output and writes ELECTION_AUDIT_REPORT.md.

// NOTE on auth: the login endpoint is rate-limited (20/15min per IP), by design, as a brute-force
// defense — running 28 real logins from one script IP would immediately trip it (and did, on the
// first run — see report Scenario 9 note). To avoid weakening that guard just for the audit, we
// verify the login+password flow ONCE for real (admin), then mint JWTs locally for the rest of the
// fixture users using the same JWT_SECRET the server verifies against — every other endpoint below
// (elections, candidates, votes, transitions, mandates) is still exercised over real HTTP.
import jwt from "jsonwebtoken";
import { db, pool } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PASSWORD = "password123";
const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET not set in this environment");

type Check = { id: string; desc: string; pass: boolean; detail?: string };
const checks: Check[] = [];
function record(id: string, desc: string, pass: boolean, detail?: string) {
  checks.push({ id, desc, pass, detail });
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"} [${id}] ${desc}${detail ? " — " + detail : ""}`);
}

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

/** Real HTTP login — used once to prove the credential+rate-limit flow genuinely works. */
async function loginOverHttp(email: string): Promise<{ status: number; token?: string; error?: string }> {
  const { status, json } = await api("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  return { status, token: json?.data?.token, error: json?.error };
}

/** Mints a token locally (same payload shape as signToken() in auth.ts) to avoid tripping the
 *  auth rate limiter across ~30 fixture logins. See file header note. */
async function mintToken(email: string): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) throw new Error(`no user found for ${email}`);
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, syndicateId: user.syndicateId ?? undefined, name: user.name },
    JWT_SECRET,
    { expiresIn: "15m" },
  );
}

const OWNER_EMAILS = [
  "ahmed.benali", "sara.tazi", "karim.el.mansouri", "fatima.zahra.idrissi", "youssef.bennani",
  "khadija.ouazzani", "omar.fassi", "nadia.chraibi", "hamza.berrada", "leila.alami",
  "mehdi.sekkat", "amina.kettani", "rachid.lahlou", "zineb.tahiri", "adil.cherkaoui",
  "souad.belghiti", "yassine.benjelloun", "malika.squalli", "nabil.guessous", "youssef.alaoui",
].map((slug) => `${slug}@alandalous-audit.test`);

const TENANT_EMAILS = ["rania.sabri", "anas.idrissi", "salma.benaissa", "othmane.rifai", "ikram.toumi"].map((slug) => `${slug}@tenant-audit.test`);

const ADMIN_EMAIL = "admin@alandalous-audit.test";
const OTHER_ADMIN_EMAIL = "admin@zaytoune-audit.test";
const OTHER_MEMBER_EMAIL = "intrus@zaytoune-audit.test";

const AHMED = OWNER_EMAILS[0];
const SARA = OWNER_EMAILS[1];
const KARIM = OWNER_EMAILS[2];

async function main() {
  const today = new Date();
  const iso = (daysOffset: number) => new Date(today.getTime() + daysOffset * 86400000).toISOString().slice(0, 10);

  console.log("Verifying real login (admin, over HTTP, subject to the rate limiter)…");
  const realLogin = await loginOverHttp(ADMIN_EMAIL);
  record("AUTH.real_login_works", "POST /auth/login succeeds with correct credentials", realLogin.status === 200, `status=${realLogin.status}`);
  const badLogin = await loginOverHttp(ADMIN_EMAIL.replace("admin", "admin.wrong"));
  record("AUTH.bad_login_rejected", "POST /auth/login rejects unknown email", badLogin.status === 401, `status=${badLogin.status}`);

  console.log("Minting remaining fixture tokens locally (avoids tripping the 20/15min login rate limit — see file header)…");
  const adminToken = realLogin.token ?? (await mintToken(ADMIN_EMAIL));
  const ownerTokens: Record<string, string> = {};
  for (const email of OWNER_EMAILS) ownerTokens[email] = await mintToken(email);
  const tenantTokens: Record<string, string> = {};
  for (const email of TENANT_EMAILS) tenantTokens[email] = await mintToken(email);
  const otherAdminToken = await mintToken(OTHER_ADMIN_EMAIL);
  const otherMemberToken = await mintToken(OTHER_MEMBER_EMAIL);
  console.log("All tokens ready.\n");

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: full create → candidacy → campaign → open pipeline for an election
  // ─────────────────────────────────────────────────────────────────────────
  async function createElection(title: string, opts: Partial<{ tenantsCanVote: boolean }> = {}) {
    const { json } = await api("/elections", {
      method: "POST",
      token: adminToken,
      body: {
        title,
        description: "Élection présidentielle — audit de production",
        electionType: "president",
        votingMethod: "simple_majority",
        quorumPercent: 50,
        majorityPercent: 50,
        seatsCount: 1,
        tenantsCanVote: opts.tenantsCanVote ?? false,
        candidacyStart: iso(-10),
        candidacyEnd: iso(-5),
        startDate: iso(-4),
        endDate: iso(3),
      },
    });
    if (!json?.data) console.log("createElection: réponse inattendue", JSON.stringify(json)?.slice(0, 300));
    return json?.data;
  }

  const failedTransitions: string[] = [];
  async function transition(electionId: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await api(`/elections/${electionId}/transition`, { method: "POST", token: adminToken, body: { action, ...extra } });
    if (res.status >= 500) failedTransitions.push(`${action}=${res.status}`);
    return res;
  }
  const resultAlerts = async (syndicateId: string) =>
    Number((await pool`SELECT count(*) AS n FROM alerts WHERE key = 'election.results' AND syndicate_id = ${syndicateId}`)[0].n);

  async function submitAndApprove(electionId: string, candidateEmail: string, candidateToken: string) {
    const { json: submitJson } = await api(`/elections/${electionId}/candidates`, { method: "POST", token: candidateToken, body: {} });
    const candidateId = submitJson?.data?.id;
    if (candidateId) {
      await api(`/elections/${electionId}/candidates/${candidateId}/validate`, { method: "PUT", token: adminToken, body: { decision: "approved" } });
    }
    return candidateId;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — Normal election (+ Scenario 2/3 embedded during open voting)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 1 — Normal election ===");
  const e1 = await createElection("Élection du Président — Résidence Al Andalous");
  const resultAlertsBefore = await resultAlerts(e1.syndicateId);
  record("S1.create", "Election created in draft status", e1?.status === "draft", `status=${e1?.status}`);

  const t1 = await transition(e1.id, "open_candidacy");
  record("S1.open_candidacy", "draft → candidacy_open", t1.json?.data?.status === "candidacy_open", `status=${t1.json?.data?.status}`);

  const cAhmed = await submitAndApprove(e1.id, AHMED, ownerTokens[AHMED]);
  const cSara = await submitAndApprove(e1.id, SARA, ownerTokens[SARA]);
  const cKarim = await submitAndApprove(e1.id, KARIM, ownerTokens[KARIM]);
  record("S1.candidacy", "3 candidates submitted & approved", !!(cAhmed && cSara && cKarim), `ids=${cAhmed},${cSara},${cKarim}`);

  const tCampaign = await transition(e1.id, "start_campaign");
  record("S1.campaign", "candidacy_open → campaign", tCampaign.json?.data?.status === "campaign");

  const tOpen = await transition(e1.id, "open_voting");
  record("S1.open_voting", "campaign → open", tOpen.json?.data?.status === "open", `status=${tOpen.json?.data?.status}`);

  // Votes: Ahmed=8, Sara=6, Karim=3 → 17 participants out of 20
  const voteMap = [
    ...Array(8).fill(cAhmed),
    ...Array(6).fill(cSara),
    ...Array(3).fill(cKarim),
  ];
  let voteFailures = 0;
  for (let i = 0; i < voteMap.length; i++) {
    const voterEmail = OWNER_EMAILS[i];
    const { status } = await api(`/elections/${e1.id}/vote`, { method: "POST", token: ownerTokens[voterEmail], body: { candidateId: voteMap[i] } });
    if (status !== 200) voteFailures++;
  }
  record("S1.voting", "17 votes cast successfully (8/6/3 split)", voteFailures === 0, `failures=${voteFailures}`);

  const closeRes = await transition(e1.id, "close_voting");
  const closedElection = closeRes.json?.data;
  record("S1.quorum_calc", "Quorum computed: 17/20=85% ≥ 50% → closed", closedElection?.status === "closed" && closedElection?.quorumReached === true, `status=${closedElection?.status} quorumReached=${closedElection?.quorumReached} participantCount=${closedElection?.participantCount}`);

  const publishRes = await transition(e1.id, "publish_results");
  record("S1.publish", "Results published, status=completed", publishRes.json?.data?.status === "completed", `status=${publishRes.json?.data?.status}`);

  const { json: resultsJson } = await api(`/elections/${e1.id}/results`, { token: adminToken });
  const winner = resultsJson?.data?.winners?.[0];
  record("S1.winner", "Ahmed Benali wins with 8 votes", winner?.id === cAhmed && winner?.votes === 8, `winner=${winner?.name} votes=${winner?.votes}`);

  const { json: mandatesJson } = await api(`/elections/mandates`, { token: adminToken });
  const ahmedMandate = mandatesJson?.data?.find((m: any) => m.candidateId === cAhmed);
  record("S1.mandate", "Elected mandate created for Ahmed as president", ahmedMandate?.role === "president" && ahmedMandate?.status === "active", `role=${ahmedMandate?.role} status=${ahmedMandate?.status}`);

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 2 — Double vote attempt (re-create a fresh open election, since e1 is closed)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 2 — Double vote attempt ===");
  const e2 = await createElection("Élection Test Double-Vote");
  await transition(e2.id, "open_candidacy");
  const c2Ahmed = await submitAndApprove(e2.id, AHMED, ownerTokens[AHMED]);
  await transition(e2.id, "start_campaign");
  await transition(e2.id, "open_voting");

  const firstVote = await api(`/elections/${e2.id}/vote`, { method: "POST", token: ownerTokens[AHMED], body: { candidateId: c2Ahmed } });
  record("S2.first_vote", "Ahmed's first vote accepted", firstVote.status === 200, `status=${firstVote.status}`);

  const secondVote = await api(`/elections/${e2.id}/vote`, { method: "POST", token: ownerTokens[AHMED], body: { candidateId: c2Ahmed } });
  record("S2.reject_duplicate", "Second vote attempt rejected (400, ALREADY_VOTED)", secondVote.status === 400, `status=${secondVote.status} error=${secondVote.json?.error}`);

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 3 — Tenant attempts to vote (tenantsCanVote=false)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 3 — Tenant attempts to vote ===");
  const tenantVote = await api(`/elections/${e2.id}/vote`, { method: "POST", token: tenantTokens[TENANT_EMAILS[0]], body: { candidateId: c2Ahmed } });
  record("S3.tenant_denied", "Tenant vote denied (403, not eligible)", tenantVote.status === 403, `status=${tenantVote.status} error=${tenantVote.json?.error}`);

  const { json: e2AfterView } = await api(`/elections/${e2.id}`, { token: tenantTokens[TENANT_EMAILS[0]] });
  record("S3.tenant_not_eligible_flag", "Election detail correctly reports isEligible=false for tenant", e2AfterView?.isEligible === false, `isEligible=${e2AfterView?.isEligible}`);

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 4 — Quorum not reached (5/20 = 25% < 50%)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 4 — Quorum not reached ===");
  const e4 = await createElection("Élection Test Quorum");
  await transition(e4.id, "open_candidacy");
  const c4Ahmed = await submitAndApprove(e4.id, AHMED, ownerTokens[AHMED]);
  await transition(e4.id, "start_campaign");
  await transition(e4.id, "open_voting");
  for (let i = 0; i < 5; i++) {
    await api(`/elections/${e4.id}/vote`, { method: "POST", token: ownerTokens[OWNER_EMAILS[i]], body: { candidateId: c4Ahmed } });
  }
  const e4Close = await transition(e4.id, "close_voting");
  record("S4.quorum_failed", "5/20=25% < 50% quorum → status=quorum_failed", e4Close.json?.data?.status === "quorum_failed", `status=${e4Close.json?.data?.status} participantCount=${e4Close.json?.data?.participantCount}`);

  const e4Reopen = await transition(e4.id, "reopen_round", { reason: "Quorum non atteint — second tour" });
  record("S4.second_round", "quorum_failed → reopen_round transition available (2nd round)", e4Reopen.json?.data?.status === "candidacy_open", `status=${e4Reopen.json?.data?.status}`);

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 5 — Tie (Ahmed=8, Sara=8, Karim=1)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 5 — Tie ===");
  const e5 = await createElection("Élection Test Égalité");
  await transition(e5.id, "open_candidacy");
  const c5Ahmed = await submitAndApprove(e5.id, AHMED, ownerTokens[AHMED]);
  const c5Sara = await submitAndApprove(e5.id, SARA, ownerTokens[SARA]);
  const c5Karim = await submitAndApprove(e5.id, KARIM, ownerTokens[KARIM]);
  await transition(e5.id, "start_campaign");
  await transition(e5.id, "open_voting");
  const tieVoteMap = [...Array(8).fill(c5Ahmed), ...Array(8).fill(c5Sara), ...Array(1).fill(c5Karim)];
  for (let i = 0; i < tieVoteMap.length; i++) {
    await api(`/elections/${e5.id}/vote`, { method: "POST", token: ownerTokens[OWNER_EMAILS[i]], body: { candidateId: tieVoteMap[i] } });
  }
  await transition(e5.id, "close_voting");
  // Nobody breaks a tie (2026-11-06 rule): the former manual pick is refused…
  const manualPick = await transition(e5.id, "publish_results", { tiebreakWinnerIds: [c5Ahmed] });
  record("S5.manual_resolution", "A manual tiebreak by the administrator is refused (TIEBREAK_NOT_ALLOWED)", manualPick.status === 400 && manualPick.json?.code === "TIEBREAK_NOT_ALLOWED", `status=${manualPick.status} code=${manualPick.json?.code}`);
  // …and the count prepares a second round between the tied candidates.
  const tiePublish = await transition(e5.id, "publish_results");
  const runoffId = tiePublish.json?.runoffElectionId as string | undefined;
  const e5Mandates = (await pool`SELECT count(*)::int AS n FROM conseil_syndical WHERE election_id = ${e5.id}`)[0].n;
  record("S5.tie_detected", "Tie → second round prepared, no winner designated", tiePublish.status === 200 && tiePublish.json?.outcome === "runoff_required" && !!runoffId && e5Mandates === 0, `status=${tiePublish.status} outcome=${tiePublish.json?.outcome} mandates=${e5Mandates}`);
  if (runoffId) {
    const { json: r2 } = await api(`/elections/${runoffId}`, { token: adminToken });
    const names = (r2?.candidates ?? []).map((c: any) => c.name).sort();
    record("S5.runoff_candidates", "Second round: round 2, the two tied candidates only, one seat", r2?.data?.round === 2 && names.length === 2 && r2?.data?.seatsCount === 1, `round=${r2?.data?.round} candidates=${names.join(" / ")}`);
    await api(`/elections/${runoffId}`, { method: "PUT", token: adminToken, body: { startDate: iso(0), endDate: iso(7) } });
    await transition(runoffId, "open_voting");
    const r2Ids = (r2?.candidates ?? []).map((c: any) => c.id);
    for (let i = 0; i < 16; i++) {
      await api(`/elections/${runoffId}/vote`, { method: "POST", token: ownerTokens[OWNER_EMAILS[i]], body: { candidateIds: [r2Ids[i % 2]] } });
    }
    await transition(runoffId, "close_voting");
    const second = await transition(runoffId, "publish_results");
    const r2Mandates = (await pool`SELECT count(*)::int AS n FROM conseil_syndical WHERE election_id = ${runoffId}`)[0].n;
    record("S5.second_round_tie", "Tie again in the second round → new deliberation, nobody designated", second.json?.outcome === "deliberation_required" && second.json?.data?.status === "deliberation_required" && r2Mandates === 0, `outcome=${second.json?.outcome} status=${second.json?.data?.status} mandates=${r2Mandates}`);
    const next = await transition(runoffId, "schedule_new_ballot");
    record("S5.new_ballot", "The organizer plans a new ballot (draft, linked), the results are kept", next.status === 201 && next.json?.data?.status === "draft" && next.json?.data?.parentElectionId === runoffId, `status=${next.status} draft=${next.json?.data?.status}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 6 — Candidate withdrawal (Sara withdraws before voting opens)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 6 — Candidate withdrawal ===");
  const e6 = await createElection("Élection Test Retrait Candidat");
  await transition(e6.id, "open_candidacy");
  const c6Ahmed = await submitAndApprove(e6.id, AHMED, ownerTokens[AHMED]);
  const c6Sara = await submitAndApprove(e6.id, SARA, ownerTokens[SARA]);

  const withdrawRes = await api(`/elections/${e6.id}/candidates/${c6Sara}/withdraw`, { method: "POST", token: ownerTokens[SARA] });
  record("S6.status_updated", "Sara's candidate status → withdrawn", withdrawRes.json?.data?.status === "withdrawn", `status=${withdrawRes.json?.data?.status}`);

  await transition(e6.id, "start_campaign");
  await transition(e6.id, "open_voting");
  const voteForWithdrawn = await api(`/elections/${e6.id}/vote`, { method: "POST", token: ownerTokens[OWNER_EMAILS[4]], body: { candidateId: c6Sara } });
  record("S6.votes_blocked", "Voting for withdrawn candidate is rejected (candidate no longer 'approved')", voteForWithdrawn.status === 400, `status=${voteForWithdrawn.status} error=${voteForWithdrawn.json?.error}`);

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 7 — President resigns after mandate → emergency election workflow?
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 7 — President resigns ===");
  const resignRes = await api(`/elections/mandates/${ahmedMandate?.id}/resign`, { method: "POST", token: ownerTokens[AHMED], body: { reason: "Déménagement — départ de la résidence" } });
  record("S7.mandate_closed", "Mandate status → resigned", resignRes.json?.data?.status === "resigned", `status=${resignRes.json?.data?.status}`);

  const { json: electionsAfterResign } = await api(`/elections`, { token: adminToken });
  const anyEmergencyAutoCreated = electionsAfterResign?.data?.some((el: any) => el.isEmergency && el.status !== "completed" && el.title?.includes("Al Andalous") && new Date(el.createdAt) > new Date(Date.now() - 60000));
  record("S7.emergency_workflow_auto_triggered", "An emergency replacement election is AUTOMATICALLY created on resignation", !!anyEmergencyAutoCreated, "no automatic emergency-election trigger exists in the resign handler (manual admin action required) — see report");

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 8 — Cross-syndicate access
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 8 — Cross-syndicate access ===");
  const viewAttempt = await api(`/elections/${e1.id}`, { token: otherMemberToken });
  record("S8.view_denied", "Outside member cannot view election (403)", viewAttempt.status === 403, `status=${viewAttempt.status}`);

  const otherOpenElection = e2; // e2 is currently in "open" status
  const voteAttempt = await api(`/elections/${otherOpenElection.id}/vote`, { method: "POST", token: otherMemberToken, body: { candidateId: c2Ahmed } });
  record("S8.vote_denied", "Outside member cannot vote (403/not eligible)", voteAttempt.status === 403 || voteAttempt.status === 400, `status=${voteAttempt.status} error=${voteAttempt.json?.error}`);

  const modifyAttempt = await api(`/elections/${e1.id}/transition`, { method: "POST", token: otherAdminToken, body: { action: "cancel", reason: "hostile takeover attempt" } });
  record("S8.modify_denied", "Outside syndicate_admin cannot transition another syndicate's election (403)", modifyAttempt.status === 403, `status=${modifyAttempt.status}`);

  const listLeak = await api(`/elections`, { token: otherAdminToken });
  const leaked = listLeak.json?.data?.some((el: any) => el.syndicateId === e1.syndicateId);
  record("S8.no_list_leakage", "Election list for another syndicate_admin does not include Al Andalous elections", !leaked, `leaked=${leaked}`);

  // ═══════════════════════════════════════════════════════════════════════
  // SCENARIO 9 — Notifications (alerts table + push/email call sites, best-effort)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n=== SCENARIO 9 — Notifications ===");
  record("S9.transitions_no_error", "Every election transition of this run answered without a server error", failedTransitions.length === 0, failedTransitions.join(", ") || "no 5xx");
  const resultAlertsAdded = (await resultAlerts(e1.syndicateId)) - resultAlertsBefore;
  record("S9.results_alert", "Publishing the results stored an alert for the residents", resultAlertsAdded >= 1, `${resultAlertsAdded} alert(s) added`);
  // Static check of the scheduler source (not exercised live: it needs a real-time date proximity and a scheduler tick).
  const reminderSrc = await import("node:fs").then((fs) => fs.readFileSync(new URL("../../artifacts/api-server/src/jobs/election-reminders.ts", import.meta.url), "utf8")).catch(() => "");
  const reminderOk = /const THRESHOLDS = \[3, 1\]/.test(reminderSrc) && /remindersSent/.test(reminderSrc) && /export function startElectionReminderScheduler/.test(reminderSrc);
  record("S9.closing_soon_reminder_code", "Closing-soon reminder scheduler exists (3/1 day thresholds, dedup via remindersSent)", reminderOk, reminderSrc ? "static: artifacts/api-server/src/jobs/election-reminders.ts — not exercised live" : "jobs/election-reminders.ts not found");

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════
  console.log("\n\n=== RESULTS JSON ===");
  console.log(JSON.stringify({ total: checks.length, passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length, checks }, null, 2));
}

// The database pool would keep the process alive: close it, and exit non-zero
// when a check failed so a runner sees the result.
main()
  .then(async () => {
    const failed = checks.filter((c) => !c.pass).length;
    console.log(`
${checks.length - failed}/${checks.length} election audit checks passed`);
    await pool.end().catch(() => {});
    process.exit(failed ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("FATAL:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
