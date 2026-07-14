# Election Module — Production Readiness Audit
**Date:** 2026-07-14
**Scope:** `electionsTable` / `candidatesTable` / `votesTable` / `electionQuestionsTable` / `conseilSyndicalTable`, `artifacts/api-server/src/routes/elections.ts`, `artifacts/mobile/app/elections.tsx`, `artifacts/mobile/app/elected-members.tsx`

This is an audit only — no code was changed. Findings are based on direct inspection of the schema, the route handlers, and the mobile screens (not assumptions).

---

## Phase 1 — Election Creation

| Field | Status |
|---|---|
| Title, Description | ✅ Present, `title` required |
| Election Type | ✅ enum: president / board / financial_committee / maintenance_committee / building_representative / special |
| Building scope | ✅ `buildingId` nullable — null = whole syndicate |
| Eligible voters | ✅ Computed dynamically (not stored) from members/tenants/lots — see Phase 4 |
| Start/End date | ✅ `startDate`/`endDate`, plus separate `candidacyStart`/`candidacyEnd` |
| Voting method | ✅ `simple_majority` \| `absolute_majority` |
| Quorum % | ✅ `quorumPercent` |
| Majority % | ✅ `majorityPercent` |
| Seats count | ✅ Bonus field not in spec — supports multi-seat board elections |
| Only Syndicate Admin can create | ✅ `requireOperationalAccess` — syndicate_admin full access; super_admin blocked unless `?supervision=true`; member/tenant blocked |

**Validation:** date ordering (`candidacyStart ≤ candidacyEnd ≤ startDate < endDate`) is checked server-side. Quorum/majority are clamped 0–100.

**Gaps found:**
- `startDate`/`endDate`/`candidacyStart`/`candidacyEnd` are raw `text` columns with no DB-level date type or format constraint beyond the client-side regex — a malformed value inserted outside this route (e.g. future migration) would not be caught by the schema.
- No maximum-duration or minimum-notice validation (e.g. "candidacy period must be ≥ 3 days" or "cannot start voting before candidacy end + N hours") — currently only ordering is checked, not business-realistic spacing.
- No check that `buildingId`, if set, actually belongs to the creator's syndicate.

---

## Phase 2 — Candidate Registration

| Field | Status |
|---|---|
| Full name | ✅ Copied from `req.user.name` at submission time (not editable by candidate) |
| Apartment number | ✅ `apartmentNumber` |
| Building | ✅ `buildingId` |
| Biography | ✅ `bio` |
| Motivation letter | ✅ `motivationLetter` |
| Program | ✅ `program` |
| Photo | 🟡 Column exists (`photo: text`) and is accepted by `POST /candidates`, but the **candidacy submission form in the mobile app has no photo upload UI** — the field is dead on the client side. |

**Workflow:** `submitted/pending_validation → approved / rejected` exists, plus `withdrawn` (not in the original spec, but a real improvement). Status defaults to `pending_validation` for non-admins and auto-`approved` when an admin submits on someone's behalf.

**Only Syndicate Admin can approve:** ✅ `PUT /candidates/:id/validate` is gated by `requireOperationalAccess`.

**Bypass check:** No bypass found — approval requires the operational-access guard, and a member cannot self-approve via any other route. One soft gap: a re-submission after `withdrawn`/`rejected` is allowed and defaults straight to `pending_validation` (or auto-`approved` if resubmitted by an admin), which is correct, but there's no cap on re-submission attempts.

---

## Phase 3 — Campaign Period

| Capability | Status |
|---|---|
| Candidates publish program/motivation/bio | ✅ `PUT /candidates/:id/program`, restricted to the candidate's own **approved** candidacy |
| "Objectives"/"Proposals" as distinct fields | 🟡 Not modeled separately — `program` is a single free-text field expected to hold all of this. Functionally covered, not structurally distinct. |
| Members view/compare candidates | ✅ Candidates tab lists all approved candidates with bio/program/motivation |
| Members ask questions | ✅ `POST /candidates/:id/questions`, blocked for tenants (`requireNotTenant`) |
| Candidates answer questions | ✅ `PUT /questions/:id/answer`, restricted to the candidate who owns it (or admin) |
| Push notification on new question | ✅ sent to the candidate |

**Gaps found:**
- Questions are only gated to `status === "approved"` candidates and don't check the election is actually in `campaign`/`open` phase at ask-time — a question could theoretically be asked during `closed`/`completed` if the client still shows the tab (defense-in-depth gap, low severity since the mobile UI only exposes it in `campaign`/`open`).
- No moderation/reporting path for abusive questions.

---

## Phase 4 — Voting

**Who can vote — verified in `getEligibleVoterIds()`:**
- Owners/members: ✅ scoped by `syndicateId`, optionally narrowed to a `buildingId` via their lots.
- Tenants: ✅ correctly **excluded by default** (Loi 18-00 compliance) and only included when `election.tenantsCanVote === true`, further scoped to `status === "active"` tenants.
- Representatives (proxy/mandated voting): 🔴 **Missing.** No delegation/proxy mechanism for the election module — this exists elsewhere in the codebase for AG meetings (`voteDelegations`-style pattern per memory notes) but was not reused for elections.

**Security properties:**
| Property | Status |
|---|---|
| One vote per voter | ✅ enforced at the DB level via `uniqueIndex("votes_election_voter_unique_idx").on(electionId, voterId)`, not just app logic — a race condition can't create a duplicate row |
| No duplicate votes | ✅ same as above, plus an app-level pre-check inside the transaction, plus a `23505` Postgres error handler as a second line of defense |
| Anonymous voting (tally) | 🟡 Partial. The API never exposes *other* voters' choices to members — only `req.user`'s own vote is returned. But `votesTable.voterId` is stored in plaintext, linked 1:1 to `candidateId`, so anyone with direct DB access (or a super_admin) can see exactly who voted for whom. This is "anonymous from other members' point of view" but not anonymous in the data layer. |
| Vote encryption | 🔴 **Missing.** Votes are stored as plain `voterId → candidateId` rows with no encryption, blind-signature, or hashing scheme. For a legally binding condominium election this is a real gap if regulatory secrecy is required. |
| Vote integrity | 🟡 Partial. Votes cannot be edited or deleted through any exposed route (no `PUT`/`DELETE /vote` endpoint), which is good, but there is no cryptographic proof (e.g. a signed receipt) a voter can use to later verify their vote was counted. |
| Cross-syndicate voting | ✅ blocked — `election.syndicateId !== req.user.syndicateId` throws 403 inside the transaction. |
| Device/IP captured | ✅ `device` (truncated user-agent) and `ipAddress` stored per vote — useful for later forensic audit, though not surfaced anywhere in the UI. |

**Overall:** the anti-fraud fundamentals (uniqueness constraint, transaction, eligibility check, syndicate isolation) are solid. The two real gaps are **proxy voting** (a legally expected feature per Loi 18-00 for owners who can't attend) and **vote secrecy at the data layer** (encryption/anonymization at rest).

---

## Phase 5 — Quorum

| Capability | Status |
|---|---|
| Eligible voters computed | ✅ `getEligibleVoterIds()` at close time |
| Participants computed | ✅ `votes.length` |
| Participation rate | ✅ `(participants / eligible) * 100` |
| Quorum check | ✅ compared against `election.quorumPercent`, defaults to 50% |
| Quorum not reached → invalidation | ✅ status flips to `quorum_failed` instead of `closed` |
| Second round workflow | 🟡 Partial. A `reopen_round` transition exists (`quorum_failed/contested/cancelled → candidacy_open`), which effectively restarts the *same* election record rather than creating a distinct "round 2" record. This works but means there's no historical trace of "round 1 failed, round 2 succeeded" as separate entities — only sequential status/audit-log entries on one row. |

**Gap:** quorum is computed once at `close_voting` and cached (`eligibleCount`/`participantCount`/`quorumReached`). If eligibility changes between candidacy and voting close (e.g. a member unit is sold), the snapshot won't retroactively reflect it — this is intentional/acceptable per the design note in memory, but worth flagging since the spec asks for "automatic calculation," which is satisfied only at close time, not live throughout voting.

---

## Phase 6 — Results

| Metric | Status |
|---|---|
| Total votes | ✅ |
| Participation rate | ✅ |
| Abstentions | ✅ counted separately via `isAbstention` |
| Invalid votes | 🔴 **Missing concept entirely.** There is no "invalid/spoiled vote" state — a vote is either for a candidate or an abstention. If a legal requirement exists for rejecting malformed ballots, it isn't modeled. |
| Winner(s) | ✅ ranked by vote count, sliced to `seatsCount` |
| Rankings | ✅ `rank` + `pct` per candidate |
| Statistics | ✅ participation rate, quorum status, tie flag |
| Charts | 🟡 Partial — the mobile results panel renders a progress-bar per candidate (visual %, not a real chart component) — adequate but minimal. |

**Tie detection:** ✅ implemented (`ranked[seats]?.votes === cutoffVotes`) and surfaced in the UI with a warning banner, but **no resolution workflow** — a tie is flagged, not resolved (no runoff, no tiebreaker rule, no admin override path). `publish_results` will still promote whichever candidates the array-slice happens to land on, silently picking a winner despite the tie flag being true. This is a real correctness bug risk: the UI shows "tie detected" while the backend proceeds to mint mandates for one side anyway.

---

## Phase 7 — Elected Members

| Capability | Status |
|---|---|
| Mandates auto-created on `publish_results` | ✅ inserts into `conseilSyndicalTable` for each winner |
| Role mapping | ✅ `MANDATE_ROLE_BY_TYPE` maps election type → ordered role list (president / board seats get president, VP, secretary, treasurer, committee_member in that seat order) |
| President / VP / Treasurer / Secretary / Committee / Building rep | ✅ all five roles present in the schema/role map |
| Start/End date | 🟡 Partial — `mandateStart` is set to `election.endDate`; `mandateEnd` is always `null` (open-ended mandate, no fixed term length). There's no configurable mandate duration (e.g. "3-year term") — a legal requirement in most syndicate bylaws. |
| Status lifecycle | ✅ `active → resigned` via `POST /mandates/:id/resign`; `expired`/`revoked` values exist in the schema comment but **no route ever sets them** — expiry and revocation are unreachable dead states. |

**Gap:** no automatic mandate-expiry job (e.g. a scheduler like the existing `debt-escalation`/`contract-expiry` schedulers) to flip `active → expired` when `mandateEnd` passes — consistent with `mandateEnd` never being populated in the first place.

---

## Phase 8 — Notifications

| Event | In-app alert | Push | Email |
|---|---|---|---|
| Election announced (`open_candidacy`) | ✅ | 🔴 no (only alert, no `sendPushToUsers`) | 🔴 |
| Candidate approved/rejected | 🔴 no alert row | ✅ targeted push | 🔴 |
| Voting opened | ✅ | ✅ targeted to eligible voters | 🔴 |
| Voting closing soon | 🔴 **Missing entirely** — no scheduler checks for elections nearing `endDate`, unlike the pattern already used for debt escalation and contract expiry. | | |
| Results published | ✅ | 🔴 no (only `createAlert`, no push) | 🔴 |
| New question to candidate | 🔴 no alert row | ✅ | 🔴 |

**Findings:**
- Email is **not wired at all** for elections — `notify.ts` has no email path for any event, and `SMTP_*` is only used elsewhere (password reset). If email notifications are a hard requirement, this is a full gap, not a partial one.
- Coverage is inconsistent: some events get both alert+push, others get only one. "Voting closing soon" — an explicitly requested reminder — has no implementation at all (no cron/scheduler references it).

---

## Phase 9 — Security

| Threat | Status |
|---|---|
| Double voting | ✅ DB unique constraint + transaction + pre-check |
| Vote modification | ✅ no update route exists for votes |
| Vote deletion | ✅ no delete route exists for votes |
| Unauthorized voting | ✅ `isUserEligible()` checked inside the transaction before insert |
| Cross-syndicate voting | ✅ explicit check, 403 |
| Audit logs — User/Role/Election/Timestamp | ✅ `serverAuditLog()` records `userId`, `userName`, `actorRole`, `entityId` (election id), `createdAt` for create/update/transition/vote/candidacy actions |
| Audit logs — Device | 🔴 **Not captured in `auditLogsTable`** — device/user-agent is only stored on the `votesTable` row itself, not in the general audit log. So a vote's device is traceable, but a candidacy submission, approval, or election-creation action has no device fingerprint in the audit trail. |
| Audit logs — IP Address | ✅ captured in `auditLogsTable.ipAddress` for every audited action (independent of the per-vote IP) |

**Additional observations:**
- `serverAuditLog` silently swallows its own failures ("must never break the main operation") — correct defensive design, but means an audit-log outage is invisible; no alerting on audit-write failure.
- Super-admin supervision is correctly distinguished (`isSupervision` flag) so a platform admin acting inside a syndicate's election is traceable as supervision, not a normal admin action.

---

## Phase 10 — Mobile App

| Screen | Status |
|---|---|
| Elections List | ✅ `elections.tsx` — card list with status badge, candidate/vote counts, end date |
| Election Details | ✅ tabbed modal (info / candidates / vote-or-results) |
| Candidate Profile | 🟡 Partial — candidates are shown as expandable cards inline in the Candidates tab, not as a dedicated profile screen/route. No photo is rendered even though the API returns a `photo` field. |
| Voting Screen | ✅ dedicated "vote" tab with per-candidate vote button + abstain option, "already voted"/"not eligible" states |
| Results Screen | ✅ dedicated "results" tab — quorum status, participation rate, ranked list, tie warning, mandates list |
| Elected Members Screen | ✅ separate `elected-members.tsx` route, reachable from the elections list header |

**Loading / error / empty states:** ✅ present — `ActivityIndicator` on load, dedicated error view with retry on `isError`, `ListEmptyComponent` for empty election/mandate lists.

**RTL support:** 🔴 **Not implemented in either screen.** `grep` for `marginLeft/marginRight/paddingLeft/paddingRight/marginStart/marginEnd` returns zero hits in both files — meaning all layout is done with plain `flexDirection: "row"` and no start/end-aware spacing overrides. In practice this mostly self-corrects because RN's `flexDirection: "row"` does flip under `I18nManager.isRTL`, but any manually-added left/right visual asymmetry (e.g. icon-then-text ordering assumptions) hasn't been verified for Arabic. Given the app-wide RTL issue already logged in `AUDIT_REPORT.md` for ~14 other screens, elections/elected-members were not called out there but share the same unverified status.

**Language coverage:** ✅ all election-specific strings go through `t(key)`, and the app supports `fr/en/ar/es` — but this only confirms translations *exist* for these keys, not that every key has non-fallback content in all four languages (the audit prompt asked to verify Arabic/French/English/Spanish specifically; a full string-by-string coverage check would require enumerating each key across all four language maps, which is a `language-audit` class of work already tracked in project memory as a source of key-collision bugs).

---

## Phase 11 — Special Cases

| Scenario | Status |
|---|---|
| A. President resignation | ✅ `POST /mandates/:id/resign` — any mandate holder (not just president) can resign; self-serve or admin-initiated, sends an admin-targeted alert |
| B. Candidate withdrawal | ✅ `POST /candidates/:id/withdraw` — self-serve or admin-initiated |
| C. Election tie | 🟡 Detected and flagged in the UI, but **not resolved** — see Phase 6. `publish_results` proceeds to mint mandates despite `tie === true`. No runoff/tiebreak mechanism. |
| D. Quorum not reached | ✅ `quorum_failed` status + `reopen_round` transition to restart candidacy |
| E. Election challenge (contestation) | ✅ `contest` transition (`closed`/`completed → contested`) with a `contestReason`, plus `reopen_round` from `contested` |
| F. Emergency election | ✅ `isEmergency` flag on creation skips `draft` and starts directly at `candidacy_open` |

**Gap not covered by any scenario above:** no handling for a mandate holder being **removed for cause** (revoked) — the `revoked` status exists in the schema comment but has no route; only voluntary resignation is reachable.

---

## Phase 12 — Final Gap Analysis

| Requirement | Exists | Partial | Missing | Risk |
|---|:-:|:-:|:-:|---|
| Election creation fields (title/desc/type/scope/dates/method/quorum/majority) | ✅ | | | — |
| Syndicate-admin-only election creation | ✅ | | | — |
| Election schedule validation | | 🟡 | | Low — ordering checked, spacing/notice rules not |
| Candidate fields (name/apt/building/bio/motivation/program) | ✅ | | | — |
| Candidate photo | | 🟡 | | Medium — stored, not usable (no upload/render UI) |
| Candidacy approval workflow + admin-only gate | ✅ | | | — |
| Campaign publishing (program/Q&A) | ✅ | | | — |
| Objectives/Proposals as distinct structured fields | | 🟡 | | Low — folded into `program` |
| Member candidate comparison/questions | ✅ | | | — |
| Voter eligibility (owners/members) | ✅ | | | — |
| Voter eligibility (tenants, opt-in) | ✅ | | | — |
| Proxy/representative voting | | | 🔴 | **High** — legally expected for absentee owners |
| One vote per voter / no duplicates | ✅ | | | — |
| Anonymous voting (UI-level) | ✅ | | | — |
| Vote encryption / secrecy at rest | | | 🔴 | **High** for a legally binding vote |
| Vote integrity (immutable, no edit/delete) | ✅ | | | — |
| Automatic quorum calculation | ✅ | | | — |
| Quorum-failure invalidation | ✅ | | | — |
| Second-round / reopen workflow | | 🟡 | | Medium — reuses same record, no round history |
| Results: totals/participation/abstentions/winners | ✅ | | | — |
| Invalid/spoiled vote tracking | | | 🔴 | Low–Medium, depends on legal requirement |
| Rankings/statistics | ✅ | | | — |
| Charts | | 🟡 | | Low — progress bars only |
| Tie detection | ✅ | | | — |
| Tie resolution | | | 🔴 | **High** — ties are flagged but silently resolved by array order anyway |
| Elected mandates auto-created | ✅ | | | — |
| Mandate roles (president/VP/secretary/treasurer/committee/rep) | ✅ | | | — |
| Mandate term length (start/end) | | 🟡 | | Medium — `mandateEnd` never set, no fixed terms |
| Mandate expiry/revocation lifecycle | | | 🔴 | Medium — `expired`/`revoked` states unreachable |
| Notifications: announced/opened/results | ✅ | | | — |
| Notifications: candidate approved/rejected | ✅ | | | — |
| Notifications: voting closing soon | | | 🔴 | Medium — no reminder scheduler exists |
| Email notifications | | | 🔴 | Medium — push/in-app only, no email path anywhere |
| Security: double-vote/edit/delete/cross-syndicate protection | ✅ | | | — |
| Audit log: user/role/entity/timestamp/IP | ✅ | | | — |
| Audit log: device fingerprint | | 🟡 | | Low — captured on votes only, not general audit log |
| Mobile screens (list/detail/vote/results/mandates) | ✅ | | | — |
| Dedicated candidate profile screen | | 🟡 | | Low — inline card instead of a route |
| Loading/error/empty states | ✅ | | | — |
| RTL layout verification | | 🟡 | | Medium — untested for these two screens specifically |
| President resignation / candidate withdrawal | ✅ | | | — |
| Quorum-not-reached / contested / emergency election handling | ✅ | | | — |
| Mandate revocation-for-cause | | | 🔴 | Low–Medium |

### 1. Election Workflow Analysis
The state machine (`draft → candidacy_open → campaign → open → closed → completed`, with `quorum_failed`/`contested`/`cancelled`/`reopen_round` side-branches) is centrally enforced via an explicit transition map — this is a genuinely solid piece of engineering; illegal transitions are rejected server-side, not just hidden in the UI. The one workflow bug worth calling out: **a detected tie does not block `publish_results`**, so the state machine happily moves a tied election to `completed` and mints mandates anyway.

### 2. Database Analysis
Schema is well-normalized, has the right indexes (`syndicateId`, `status`, `electionId`, `candidateId`) and the one constraint that actually matters most — the unique `(electionId, voterId)` index preventing double votes at the DB layer, not just in application code. Weak points: dates as unconstrained `text`, no `invalid_vote` concept, no mandate term-length columns being populated, `expired`/`revoked` mandate statuses that no code path ever reaches.

### 3. API Analysis
Route coverage matches essentially every phase of the requested spec (creation, candidacy, campaign Q&A, voting, results, mandates, resignation, contest). Access control is consistently applied via the existing `requireAuth`/`requireOperationalAccess`/`requireNotTenant` middleware family — no ad-hoc role checks that could be bypassed. Missing endpoints: no proxy-vote registration, no reminder/scheduler trigger, no mandate expiry/revocation route, no email dispatch.

### 4. Mobile Screen Analysis
All core screens exist and are functional with real API wiring (no mock data — a positive contrast to other screens flagged in the general `AUDIT_REPORT.md`). Weakest points: no candidate profile route, no photo upload/display, and RTL correctness for these two screens is unverified.

### 5. Security Analysis
Strong on anti-fraud (uniqueness, transactions, eligibility, syndicate isolation, audit trail with IP). Weak on ballot secrecy (plaintext voter↔candidate link at rest, no cryptographic proof) and on general-purpose audit-log completeness (device not captured outside the votes table). No SQL injection risk (Drizzle parameterized queries throughout, consistent with the rest of the codebase).

### 6. Missing Features
- Proxy/representative voting
- Vote encryption/anonymization at the data layer
- Tie-resolution workflow (runoff or explicit tiebreaker rule)
- "Voting closing soon" reminder scheduler
- Email notifications for any election event
- Mandate term length + expiry automation
- Mandate revocation-for-cause
- Invalid/spoiled vote tracking
- Candidate photo upload/display in the mobile UI
- Dedicated candidate profile screen

### 7. Critical Bugs
- **Tie detected but silently overridden:** `publishElectionResults()` always promotes `ranked.slice(0, seats)` regardless of the `tie` flag computed in `/results`. An election flagged as tied in the UI will still produce mandates from an arbitrary array-order cutoff — this is the one finding I'd call an actual bug rather than a missing feature, since it contradicts the UI's own "tie detected" message.
- No other functional bugs found; the rest of the gaps are absent features, not broken existing ones.

### 8. Production Readiness Score
**≈70%** for a general condominium election feature; **≈55–60%** if strict Moroccan legal compliance requires ballot secrecy-at-rest and proxy voting for absentee owners (both currently absent). The core lifecycle, anti-fraud voting mechanics, and mobile UX are production-quality; the gaps are concentrated in legal-compliance edge cases (proxy voting, ballot encryption), notification completeness (email, reminders), and mandate lifecycle completeness (term length, expiry, revocation) — not in broken functionality.

---

**Per the audit brief's instruction:** no redesign or implementation was attempted. This report only inspects and compares the existing system against the requested production spec.
