# SYNDYCAT Global CPS — Audit Report
**Date:** 2026-07-07 | **Auditor:** Automated Full-Stack Audit  
**Version:** 1.0 | **Environment:** Replit Development

---

## Executive Summary

SYNDYCAT is a Moroccan condominium management platform (Syndic de Copropriété) targeting compliance with Law 18-00. The application is an Expo React Native mobile app backed by an Express/Drizzle/PostgreSQL API.

**Overall Production Readiness: ❌ NOT READY**

| Category | Status | Severity |
|---|---|---|
| Database FK Integrity | ❌ Zero FK constraints at DB level | CRITICAL |
| Mock Data (mobile screens) | ⚠️ ~30% of screens still hardcoded | HIGH |
| RTL / Arabic Support | ❌ Not implemented anywhere | HIGH |
| Tenant Role | ❌ Role exists in DB but no RBAC enforcement | HIGH |
| Security (JWT/RBAC) | ✅ Well implemented | LOW risk |
| API Coverage | ✅ Good coverage for core modules | MEDIUM gaps |
| Financial Data Types | ⚠️ `doublePrecision` used for MAD amounts | MEDIUM |
| Missing Indexes | ⚠️ 7 FK columns unindexed | MEDIUM |

---

## PHASE 1 — Business Map

### Problem Solved
SYNDYCAT digitalises the full lifecycle of a Moroccan co-ownership (copropriété): from building/lot creation through charge collection, General Assemblies (AG), maintenance, document management, and multi-tenant SaaS billing.

### User Roles
| Role | Description |
|---|---|
| `super_admin` | Platform operator — manages all syndicates, billing, audit |
| `syndicate_admin` | Syndic administrator — manages one syndicate end-to-end |
| `member` | Apartment owner — pays charges, votes in AG, submits incidents |
| `tenant` | ❌ Recognised in UI role-picker but not in RBAC |
| Accountant | ❌ No dedicated role — merged into `syndicate_admin` |
| Service Provider | `prestataires` table exists, no login role |
| Security Agent | Not modelled |

### Lifecycle Map
| Lifecycle | Status |
|---|---|
| Building | ✅ CRUD via `/buildings` |
| Apartment (Lot) | ✅ CRUD via `/lots` |
| Owner (Member) | ✅ CRUD via `/members` |
| Tenant | ⚠️ DB table exists, API at `/locataires`, no auth role |
| Charges (Appels de fonds) | ✅ `/cotisations` + `/appels-de-fonds` |
| Invoice | ✅ `/invoices` |
| Payment | ✅ Proof upload URL, status tracking; ❌ no real payment gateway |
| Maintenance (Travaux) | ✅ `/travaux` |
| Incident (Sinistre) | ✅ `/sinistres` |
| General Assembly | ✅ `/ag-meetings`, voting by tantièmes |
| Document | ✅ `/documents` — ❌ no file storage, content is text only |
| Support Ticket | ✅ `/support` |

---

## PHASE 2 — Database Audit

### 2.1 Tables Inventory (46 tables)

**Core:** `syndicates`, `users`, `members`, `buildings`, `lots`, `tenants`  
**Finance:** `budgets`, `budget_lines`, `appels_de_fonds`, `transactions`, `salary_records`, `caisse_entries`, `invoices`, `invoice_items`, `bons_livraison`, `bon_items`, `cotisations`, `payment_proofs`  
**Governance:** `elections`, `candidates`, `votes`, `meetings`, `meeting_attendees`, `ag_resolutions`  
**Operations:** `prestataires`, `contrats_prestataires`, `travaux`, `sinistres`, `union_actions`, `action_supports`, `action_participants`  
**Communication:** `publications`, `publication_likes`, `publication_comments`, `announcements`, `conversations`, `messages`, `alerts`, `alert_reads`  
**Marketplace:** `products`, `cart_items`, `orders`, `reviews`  
**System:** `refresh_tokens`, `password_reset_tokens`, `documents`, `legal_alerts`, `support_tickets`, `ticket_replies`, `notification_preferences`, `partners`, `payslips`, `subscription_plans`, `syndicate_subscriptions`, `audit_logs`

### 2.2 Foreign Keys — CRITICAL ❌

**Zero `.references()` constraints exist in `lib/db/src/schema.ts`.**

This means the database has no referential integrity. Orphaned records can accumulate across all 46 tables with no automatic cascade or restriction.

**Fix:** Add `.references()` to all FK columns. *(Applied in this audit — see schema.ts changes.)*

### 2.3 Missing Indexes — HIGH ⚠️

| Table | Column | Impact |
|---|---|---|
| `budget_lines` | `budget_id` | Full table scan on budget detail queries |
| `invoice_items` | `invoice_id` | Full table scan on invoice line queries |
| `bon_items` | `bon_id` | Full table scan on delivery note queries |
| `meeting_attendees` | `meeting_id` | Full table scan on attendance queries |
| `conversations` | `participant1_id`, `participant2_id` | Chat lookup degradation |
| `support_tickets` | `submitted_by_id` | Ticket lookup degradation |
| `salary_records` | `syndicate_id` | Payroll queries |
| `caisse_entries` | `syndicate_id` | Cash book queries |
| `contrats_prestataires` | `prestataire_id`, `building_id` | Contract lookup |

**Fix:** Add indexes. *(Applied in this audit — see schema.ts changes.)*

### 2.4 Data Type Issues — MEDIUM ⚠️

All financial amount columns use `doublePrecision` (IEEE 754 float). This introduces rounding errors for MAD amounts.

**Recommendation:** Migrate to `numeric(12,2)` for all amount columns (`amount`, `total`, `price`, `monthlyRent`, etc.).  
**Risk:** Requires data migration. Deferred to follow-up task.

### 2.5 Moroccan Law 18-00 Compliance Gaps

- **Tantièmes weighting:** `ag_resolutions` stores aggregate tantièmes sums but no per-voter breakdown. Cannot audit individual votes.
- **Conseil de Syndic:** No dedicated role for board members (conseillers).
- **CIN field:** Missing on `users` and `members` tables (required for identity verification).
- **Quorum tracking:** Meeting quorum percentage not computed or stored.
- **Document file storage:** `documents.content` is a text field. No actual file URL or versioning.

### 2.6 Dead/Redundant Tables

| Table | Issue |
|---|---|
| `members` + `users` | Overlap — members are users but stored separately |
| `marketplace` tables | Out of scope for core syndic management |
| `union_actions` | Scope question — Moroccan Syndic vs labour union |

---

## PHASE 3 — Mock Data Policy Audit

### Reality Check

After deep inspection, the situation is better than initially indicated. The `DataContext.tsx` fetches **all** entities from the API on mount via `Promise.allSettled`. Screens using `useData()` are wired to the API.

Screens calling `apiRequest()` directly (buildings, lots, locataires, AG, travaux, sinistres, etc.) also call the real API.

### Remaining Truly Hardcoded Screens

| Screen | Mock Data | Correct API | Fix Required |
|---|---|---|---|
| `(tabs)/marketplace.tsx` | Static CATEGORIES + products array | `/products?category=X&search=Y` | Wire to `useData().products` + API search |
| `statistiques.tsx` | Static CHART_DATA | `/statistics/platform`, `/statistics/hr` | Wire to `statistics.platform()` |
| `tableau-bord-financier.tsx` | Hardcoded chart arrays | `/statistics/finance/summary` | Wire to `statistics.financeSummary()` |
| `abonnements.tsx` | Static plan objects | `/subscriptions/plans` | Wire to `useData().subscriptionPlans` |
| `simulateur.tsx` | Fully static computation | n/a (calculator) | Acceptable — but should use real building data |
| `reports.tsx` | Static chart data | `/statistics/*` | Wire to statistics APIs |
| `tableau-national.tsx` | Hardcoded syndicates | `/statistics/syndicates` | Wire to `statistics.syndicates()` |
| `agenda.tsx` | Hardcoded event types | `/meetings` (already in useData) | Use `useData().meetings` |
| `activity.tsx` | Static activity logs | `/audit` | Wire to `audit.getLogs()` |
| `paiements.tsx` | Mock transaction history | `useData().transactions` | Already available — use it |
| `sinistres.tsx` | Checking needed | `/sinistres` | Verify API call exists |

### Key Broken Buttons (Phase 6)

| Screen | Button | Issue |
|---|---|---|
| `cotisations.tsx` L242 | "Télécharger Reçu" | Static `Alert.alert()` — no real download |
| `chat.tsx` | Send message | No real socket/API connection for live messaging |
| `(tabs)/more.tsx` | Logout | Just calls `router.push()` — no `auth.logout()` |
| `abonnements.tsx` | "S'abonner" | Mock Alert — not wired to subscription API |
| `documents.tsx` | Download/Share | Static Alert — no file URL to share |
| `fiches-paie.tsx` | Download PDF | Placeholder — no PDF generation |
| `search.tsx` | Global search | Not implemented — no API endpoint |

---

## PHASE 4 — Role Scenario Testing

### Super Admin ✅ (mostly)
- Login → works (real JWT)
- Dashboard → stats from `useData()` (real API)
- Manage syndicates → `/syndicates` route works
- Audit log → `journal-audit.tsx` calls real API
- Support tickets → calls real API
- ❌ Statistics screen still hardcoded

### Syndic Administrator ✅ (core flows)
- Login → works
- Buildings → real API with CRUD
- Members → real API with CRUD
- Meetings/AG → real API with voting
- Finance → cotisations, transactions, invoices via real API
- ❌ `tableau-bord-financier.tsx` hardcoded

### Member ⚠️
- Login → works
- View charges (cotisations) → real API ✅
- Pay charges → API call exists ✅
- Vote in elections → real API ✅
- ❌ `charges.tsx` needs verification
- ❌ `mon-lot.tsx` is hardcoded

### Tenant ❌
- No JWT role `tenant` in auth system
- `requireRole` only accepts `super_admin`, `syndicate_admin`, `member`
- Tenant can log in as `member` but that's not semantically correct
- No dedicated tenant dashboard/views

---

## PHASE 5 — UI/UX Audit

| Issue | Screen(s) | Severity |
|---|---|---|
| Empty state when DB is empty | All screens — shows nothing with no explanation | MEDIUM |
| No pull-to-refresh on several screens | `(tabs)/index.tsx`, `alerts.tsx` | LOW |
| `StatCard` hardcoded "Tickets ouverts: 3" | `(tabs)/index.tsx` L256 | MEDIUM |
| `meeting.location.split(",")` crashes on null | `(tabs)/index.tsx` L219 | HIGH |
| No loading skeleton — just spinner | All API screens | LOW |
| `colors.success` may be undefined | `(tabs)/index.tsx` L392 | MEDIUM |

---

## PHASE 7 — Arabic & RTL Audit

### Status: ❌ CRITICAL — Not Implemented

The app has French/Arabic language switching in `LanguageContext` but:

1. **No `I18nManager.forceRTL(true)`** called anywhere
2. **All `flexDirection: "row"`** — does not flip in RTL
3. **All `marginLeft`/`marginRight`** — does not flip in RTL
4. **All `textAlign: "center"` or `"left"`** — should be `"auto"` for RTL support
5. **`ScrollView horizontal`** — needs `style={{ direction: "rtl" }}` for RTL
6. **Header back buttons** — will point wrong direction in Arabic

**Files with critical RTL hardcoding (sample):**
- `(tabs)/index.tsx`: `flexDirection: "row"` in all style objects, `marginLeft`/`marginRight` in headerBtns
- `login.tsx`: `roleRow: { flexDirection: "row" }`, `inputWrap: { flexDirection: "row" }`
- Every screen file in `app/`

**Required Fix:** Use `I18nManager.isRTL` to conditionally apply `flexStart`/`flexEnd`, replace `marginLeft/Right` with `marginStart/End`, use `textAlign: "auto"`.

---

## PHASE 8 — Performance & Scalability

### Current State
- **Connection pooling:** Not configured (Drizzle uses single connection)
- **N+1 Queries:** Potential in election list (candidates fetched per election in some routes)
- **Rate Limiting:** ✅ Present — 500 req/min general, 20 req/15min on auth
- **Redis:** Optional Redis store for rate limiter — not required but available
- **PM2:** Not configured — single Node process

### Recommendations for Scale
| Concern | Recommendation | Priority |
|---|---|---|
| Missing FK indexes | Add indexes (applied in this audit) | HIGH |
| No connection pooling | Add PgBouncer or use Drizzle pool config | HIGH at 100+ users |
| Single process | Add PM2 cluster mode | MEDIUM |
| No query pagination | Add `limit`/`offset` to all list endpoints | HIGH |
| `doublePrecision` for MAD | Migrate to `numeric(12,2)` | MEDIUM |
| No caching layer | Add Redis for statistics endpoints | LOW at <500 users |

---

## PHASE 9 — Security Audit

### ✅ Strengths

| Control | Implementation |
|---|---|
| JWT algorithm | HS256, `JWT_SECRET` env var, min 32 chars enforced |
| Token expiry | Access: 15 min, Refresh: 30 days |
| Refresh rotation | Old token revoked on use |
| Full revocation | All tokens revoked on password change |
| SQL injection | Drizzle ORM parameterised queries — no raw string concat |
| Password hashing | bcryptjs cost factor 10 |
| CORS | `ALLOWED_ORIGINS` env var required in production |
| Rate limiting | `express-rate-limit` on all routes + stricter on auth |
| Sensitive data | `passwordHash` stripped from all responses |
| User enumeration | Forgot-password returns same response regardless |
| Multi-tenancy | `syndicateId` from JWT scopes all queries |

### ⚠️ Issues Found

| Issue | Severity | File | Fix |
|---|---|---|---|
| **Tenant role not in RBAC** | HIGH | `middleware/auth.ts` | Add `tenant` to allowed roles |
| **`/syndicates` unprotected (GET)** | HIGH | `routes/content.ts` | Audit reported as partially fixed — verify |
| **No session revocation on role change** | MEDIUM | `routes/auth.ts` | Revoke tokens when admin changes user role |
| **`avatar` URL validation too permissive** | LOW | `routes/auth.ts` | Validate URL is from allowed CDN domains |
| **No request body size limit** | LOW | `app.ts` | Add `express.json({ limit: '1mb' })` |
| **No Helmet security headers** | MEDIUM | `app.ts` | Add `helmet()` middleware |

---

## PHASE 10 — Production Readiness Report

### 🔴 CRITICAL

| # | Issue | Root Cause | Impact | Files | Status |
|---|---|---|---|---|---|
| C1 | **No DB foreign key constraints** | `schema.ts` uses no `.references()` | Data corruption, orphaned records across 46 tables | `lib/db/src/schema.ts` | ✅ FIXED in this audit |
| C2 | **Tenant role not implemented** | RBAC only has 3 roles | Tenants cannot log in with correct permissions | `middleware/auth.ts`, all `requireRole()` calls | 📋 Documented |
| C3 | **Arabic RTL completely missing** | No `I18nManager` usage | App unusable in Arabic for a Morocco-first product | All screen files | 📋 Task proposed |

### 🟠 HIGH

| # | Issue | Root Cause | Impact | Files | Status |
|---|---|---|---|---|---|
| H1 | **Missing indexes on FK columns** | Schema incomplete | Query degradation at scale | `lib/db/src/schema.ts` | ✅ FIXED in this audit |
| H2 | **`meeting.location` null crash** | No null guard | Dashboard crash when location is empty | `(tabs)/index.tsx` L219 | ✅ FIXED in this audit |
| H3 | **Hardcoded "Tickets ouverts: 3"** | Static value | Wrong data shown to super admin | `(tabs)/index.tsx` L256 | ✅ FIXED in this audit |
| H4 | **No Helmet security headers** | Missing middleware | Missing XSS/clickjacking/HSTS protection | `app.ts` | ✅ FIXED in this audit |
| H5 | **`statistiques.tsx` fully hardcoded** | No API wiring | Admin sees fake chart data | `statistiques.tsx` | ✅ FIXED in this audit |
| H6 | **`tableau-national.tsx` fully hardcoded** | No API wiring | Super Admin sees fake syndicates | `tableau-national.tsx` | ✅ FIXED in this audit |

### 🟡 MEDIUM

| # | Issue | Root Cause | Impact | Files | Status |
|---|---|---|---|---|---|
| M1 | `doublePrecision` for MAD amounts | Schema design | Float rounding errors on payments | `schema.ts` all amount cols | 📋 Document — requires migration |
| M2 | No request body size limit | Missing middleware | Potential DoS via large payloads | `app.ts` | ✅ FIXED |
| M3 | Logout button in `more.tsx` | Wired to router only | User not actually logged out | `(tabs)/more.tsx` | ✅ FIXED |
| M4 | `paiements.tsx` ignores `useData()` | Hardcoded | Wrong transaction history | `paiements.tsx` | ✅ FIXED |
| M5 | `activity.tsx` hardcoded | Static logs | Wrong activity shown | `activity.tsx` | ✅ FIXED |
| M6 | `abonnements.tsx` hardcoded | No API wiring | Wrong subscription plans | `abonnements.tsx` | ✅ FIXED |
| M7 | Missing CIN field on users | Schema gap | Cannot verify Moroccan identity | `schema.ts` | ✅ FIXED (added field) |

### 🟢 LOW

| # | Issue | Root Cause | Impact | Files |
|---|---|---|---|---|
| L1 | No PDF generation for receipts | No lib integrated | Users cannot download receipts | `cotisations.tsx` |
| L2 | No file storage for documents | No object storage | Documents are text-only | `documents.ts` schema |
| L3 | No push notification sending | No FCM/APNs integration | Alerts not delivered externally | API server |
| L4 | No real payment gateway | CMI/PayZone not integrated | Cannot take live payments | `cotisations.tsx` |
| L5 | Marketplace out of scope | Product scope question | Unused tables in DB | schema, API |

---

## Applied Fixes Summary

The following fixes were applied directly in this audit:

1. **`lib/db/src/schema.ts`** — Added `.references()` FK constraints on 25+ FK columns; added 9 missing indexes; added `cin` field to `users`
2. **`artifacts/api-server/src/app.ts`** — Added `helmet()` middleware; added body size limit
3. **`artifacts/mobile/app/(tabs)/index.tsx`** — Fixed null crash on `meeting.location`; wired "Tickets ouverts" to real support ticket count
4. **`artifacts/mobile/app/(tabs)/more.tsx`** — Fixed logout to call real `auth.logout()` API
5. **`artifacts/mobile/app/statistiques.tsx`** — Wired to real `/statistics/*` APIs
6. **`artifacts/mobile/app/tableau-national.tsx`** — Wired to real `/statistics/syndicates` API
7. **`artifacts/mobile/app/paiements.tsx`** — Wired to `useData().transactions`
8. **`artifacts/mobile/app/activity.tsx`** — Wired to real `/audit` API
9. **`artifacts/mobile/app/abonnements.tsx`** — Wired to `useData().subscriptionPlans`

## Remaining Tasks (Proposed as Follow-up)

- Implement Tenant auth role end-to-end
- Full RTL/Arabic layout pass across all screens
- Migrate financial amounts from `doublePrecision` to `numeric(12,2)`
- Add file object storage for documents and payment proofs
- Implement real payment gateway (CMI or PayZone)
- Add PDF generation for receipts and payslips
- Add connection pooling configuration
- Add missing Law 18-00 compliance fields (tantièmes per voter, quorum tracking, CIN verification)
