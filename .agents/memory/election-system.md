---
name: Election management system
description: Full election lifecycle (creation, candidacy, campaign, voting, quorum, results, elected mandates) built for the condo app.
---

The full election management workflow (12-phase spec: creation → candidacy → campaign → voting → quorum → results → elected mandates → special scenarios) reuses and extends the existing `electionsTable`/`candidatesTable`/`votesTable` rather than new tables, plus a new `electionQuestionsTable` for campaign Q&A. Elected members/mandates reuse the pre-existing `conseilSyndicalTable` (linked via new `electionId`/`candidateId` columns) instead of a new mandates table.

State machine lives server-side as an explicit transition map (`draft → candidacy_open → campaign → open → closed → completed`, plus `quorum_failed`/`contested`/`cancelled`/`reopen_round`) rather than a free-form status setter — keeps illegal transitions rejected centrally.

Eligibility (who can candidate/vote) is computed dynamically per election from `membersTable`/`tenantsTable`/`lotsTable` scoped by `syndicateId` + optional `buildingId`, with `tenantsCanVote` as an explicit per-election opt-in override of the normal Loi 18-00 tenant voting ban. Not stored as a materialized voter list — recomputed at vote time and at close time (for quorum math).

**Why:** avoids a large migration/new-table surface, keeps consistency with existing patterns (serverAuditLog, createAlert/sendPushToUsers, requireOperationalAccess/requireNotTenant), and matches how the rest of the codebase resolves member/tenant identity (by email join, no direct FK from users to members/tenants).

**How to apply:** when extending, keep new election-related mutations behind the transition map for status changes; do not add a generic `PUT status` endpoint that bypasses the state machine. Elected-members UI intentionally does NOT reuse `governance.tsx` (that screen calls non-existent `/governance/*` endpoints and is a dead stub) — use `/elections/mandates` endpoints and the `elected-members.tsx` screen instead.
