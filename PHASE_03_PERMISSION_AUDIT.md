# PHASE 03 — API PERMISSION AUDIT

## Status: IN PROGRESS
**Date:** 2026-07-22

---

## Middleware Stack (api-server)

| Middleware | Applied To | Purpose |
|-----------|-----------|---------|
| softAuth | All routes | Populates req.user, non-blocking |
| requireAuth | Protected routes | Blocks unauthenticated requests |
| requireSyndicateAdmin | Admin routes | Blocks non-admin roles |
| requireSuperAdmin | Platform routes | Blocks non-super_admin |
| requireNotTenant | Budget/Elections writes | Prevents tenant write access |
| requireActiveSubscription | All non-GET mutations | Blocks expired syndicates |

---

## Finance Routes Permission Map

| Endpoint | Current Guard | Required Guard | Gap |
|----------|--------------|----------------|-----|
| GET /finance/transactions | requireAuth | requireAuth + syndicateId | ✅ OK |
| POST /finance/transactions | requireAuth | requireSyndicateAdmin OR treasurer | ⚠️ Missing treasurer guard |
| GET /budget | requireAuth | requireAuth (all team) | ✅ OK |
| POST /budget | requireAuth | requireSyndicateAdmin | ⚠️ Any auth user can POST |
| GET /reports | requireAuth | requireSyndicateAdmin OR treasurer | ⚠️ Members can access |
| GET /caisse | requireAuth | requireSyndicateAdmin OR treasurer | ⚠️ Members can access |
| GET /fiches-paie | requireSyndicateAdmin | ✅ Correct | ✅ OK |
| GET/POST /escalation | requireAuth | requireSyndicateAdmin OR treasurer | ⚠️ Members can access |
| GET /appels-de-fonds | requireAuth | requireAuth (member sees own) | ✅ OK (row-scoped) |

---

## Governance Routes Permission Map

| Endpoint | Current Guard | Required Guard | Gap |
|----------|--------------|----------------|-----|
| GET /meetings | requireAuth | requireAuth (scoped) | ✅ OK |
| POST /meetings | requireAuth | requireSyndicateAdmin/president/secretary | ⚠️ Any member can create |
| GET /elections | requireAuth | requireAuth | ✅ OK |
| POST /elections | requireAuth | requireSyndicateAdmin/president | ⚠️ Any auth can create |
| POST /elections/:id/vote | requireAuth + eligibility | ✅ Correct | ✅ OK |

---

## Document Routes Permission Map

| Endpoint | Current Guard | Required Guard | Gap |
|----------|--------------|----------------|-----|
| GET /documents | requireAuth | requireAuth (scoped by syndicate) | ✅ OK |
| POST /documents | requireAuth | requireSyndicateAdmin/secretary | ⚠️ Any member can upload |
| DELETE /documents/:id | requireAuth | creator OR syndicate_admin/secretary | ⚠️ Any member can delete |

---

## Tenant Isolation Audit

| Module | syndicateId Check | Status |
|--------|-----------------|--------|
| Members | WHERE syndicateId = user.syndicateId | ✅ OK |
| Finance | WHERE syndicateId = user.syndicateId | ✅ OK |
| Meetings | WHERE syndicateId = user.syndicateId | ✅ OK |
| Documents | WHERE syndicateId = user.syndicateId | ✅ OK |
| Chat | WHERE syndicateId = user.syndicateId | ✅ OK |
| Audit Logs | Scoped per actorRole/syndicateId | ✅ OK |
| Marketplace | Platform-wide (by design) | OK by spec |
| Support L1 | WHERE syndicateId = user.syndicateId | ✅ OK |
| Support L2 | Super admin sees all | ✅ OK by spec |

---

## Issues Found

| ID | Issue | Risk | Fix |
|----|-------|------|-----|
| PERM-05 | Missing treasurer-specific route guards on financial endpoints | HIGH | Add requireRole middleware (see PHASE_05) |
| PERM-06 | POST /meetings allows any authenticated user | MEDIUM | Restrict to syndicate team roles |
| PERM-07 | POST /elections allows any authenticated user | MEDIUM | Restrict to syndicate_admin/president |
| PERM-08 | DELETE /documents scoped only by auth | MEDIUM | Add creator-or-admin check |
| PERM-09 | POST /documents allows any member to upload | LOW | Restrict to syndicate_admin/secretary |

---

## Fixes Applied
- ✅ requireNotTenant applied to budget and elections write routes
- ✅ syndicateId isolation confirmed across all financial modules
- ✅ Subscription enforcement on all mutation routes

## Remaining Tasks
- [ ] Add `requireFinanceTeam` middleware (treasurer + syndicate_admin) — PHASE_05 FIX-06
- [ ] Restrict meeting/election creation to syndicate team — PHASE_05 FIX-07
- [ ] Add creator-or-admin check on document delete — PHASE_05 FIX-08

## Next Phase
→ PHASE_04_DASHBOARD_AUDIT.md
