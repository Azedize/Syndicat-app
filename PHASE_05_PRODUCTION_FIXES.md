# PHASE 05 — PRODUCTION FIXES

## Status: IN PROGRESS
**Date:** 2026-07-22

---

## Completed Fixes This Session

### FIX-01 ✅ Chat unread count hardcoded to 0
- **File:** `artifacts/mobile/app/(tabs)/more.tsx`
- **Before:** `value: 0` in tenant stats strip
- **After:** `value: totalUnreadChat` = `conversations.reduce((s,c) => s + (c.unread||0), 0)`
- Added `conversations` to `useData()` destructuring
- **Impact:** Tenants now see real unread chat message count

### FIX-02 ✅ _dev-badge-preview.tsx in production bundle
- **File:** `artifacts/mobile/app/_dev-badge-preview.tsx`
- **Action:** File deleted
- **Impact:** Removes dev utility from production build

### FIX-03 ✅ /notifications menu entry routes to inferior screen
- **File:** `artifacts/mobile/app/(tabs)/more.tsx` (Account section)
- **Before:** `route: "/notifications"` → `notifications.tsx` (confusing hybrid)
- **After:** `route: "/alerts"` → `alerts.tsx` (grouped, read/unread, category filter)
- **Impact:** All users land on the correct notification center

### FIX-04 ✅ repertoire-juridique unreachable from any menu
- **File:** `artifacts/mobile/app/(tabs)/more.tsx` (Legal/Documents section)
- **Action:** Added "Répertoire Juridique" item (roles: syndicate_admin, president, secretary)
- **Impact:** Legal reference directory now accessible from menu

### FIX-05 ✅ simulateur.tsx unreachable from any menu
- **File:** `artifacts/mobile/app/(tabs)/more.tsx` (Finance section)
- **Action:** Added "Simulateur Financier" item (roles: syndicate_admin, treasurer)
- **Impact:** Financial simulator now accessible to finance team

### FIX-06 ✅ État des lieux — no backend, confusing dead-end UX
- **File:** `artifacts/mobile/app/etat-des-lieux.tsx`
- **Before:** Vague empty state asking users to call syndic
- **After:** Clear "Module en déploiement" card with primary CTA buttons to Sinistres (incidents) and Chat (contact syndic), plus contextual info about what état des lieux will include
- **Impact:** Users understand it's planned, not broken; offered useful alternatives

### FIX-07 ✅ API middleware: requireFinanceTeam for financial write routes
- **File:** `artifacts/api-server/src/middleware/auth.ts`
- **Action:** Added `requireFinanceTeam` middleware (allows syndicate_admin + treasurer only)
- **Files:** Applied to POST /budget, POST /finance/transactions (writes), GET /caisse, GET /reports, POST /escalation

### FIX-08 ✅ POST /meetings and POST /elections restricted to syndicate team
- **File:** `artifacts/api-server/src/routes/meetings.ts`, `elections.ts`
- **Action:** Added `requireSyndicateTeam` middleware to POST handlers
- **Impact:** Members and tenants can no longer create unauthorized meetings or elections

---

## Remaining High-Priority Fixes (Next Session)

### FIX-09: Push notification integration
- **Files:** New `artifacts/mobile/services/pushNotifications.ts` + api-server push route
- **Action:** Register Expo push tokens on login, store in DB, trigger on key events (appels-de-fonds, AG convocation, debt escalation)
- **Risk:** LOW — missing feature, not a security bug
- **Effort:** ~4 hours

### FIX-10: État des lieux — full DB + API implementation
- **Files:** `lib/db/src/schema.ts` (add `inspectionsTable`), new API route, mobile screen rebuild
- **Action:** Inspection table with tenant/lot FK, room-by-room checklist items, photo attachments, move-in/move-out status workflow, digital signature integration
- **Effort:** ~6 hours

### FIX-11: agenda.tsx / calendar.tsx consolidation
- **Action:** Remove `agenda.tsx` or redirect to `calendar.tsx`; merge any unique agenda views into the calendar screen
- **Effort:** ~30 min

### FIX-12: actions.tsx purpose investigation
- **Action:** Determine what `actions.tsx` was intended for. If redundant, delete it.
- **Effort:** ~20 min

### FIX-13: DELETE /documents creator-or-admin check
- **File:** `artifacts/api-server/src/routes/documents.ts`
- **Action:** Before DELETE, verify `document.createdBy === user.id` OR `user.role in [syndicate_admin, secretary]`
- **Risk:** MEDIUM — co-owner can currently delete official syndicate documents
- **Effort:** ~30 min

### FIX-14: Batch alert on appels-de-fonds creation
- **File:** `artifacts/api-server/src/routes/appels-de-fonds.ts` POST handler
- **Action:** After creating an appel de fonds, insert alert rows for all affected lot owners in the same transaction
- **Risk:** MEDIUM — members currently not notified automatically
- **Effort:** ~1 hour

### FIX-15: Tantième display in /mon-lot
- **File:** `artifacts/mobile/app/mon-lot.tsx`
- **Action:** Surface `lot.tantiemes` percentage so co-owner knows their voting weight
- **Effort:** ~30 min

### FIX-16: AG proxy (pouvoir) mobile UI
- **File:** `artifacts/mobile/app/assemblee-generale.tsx`
- **Action:** Add proxy delegation flow — member can grant/receive AG proxy; stored in `ag_proxies` table (already exists in DB)
- **Effort:** ~3 hours

---

## Business Logic Gaps (Structured Backlog)

| ID | Gap | Affected Role | Priority |
|----|-----|--------------|----------|
| BIZ-01 | No digital état des lieux | tenant | HIGH |
| BIZ-02 | No formal income statement / bilan PDF | treasurer | HIGH |
| BIZ-03 | No automatic charge notification to members | member, tenant | HIGH |
| BIZ-04 | No proxy (pouvoir) delegation on mobile | member | MEDIUM |
| BIZ-05 | No tantième display for co-owners | member | MEDIUM |
| BIZ-06 | No push notification channel | all | MEDIUM |
| BIZ-07 | No batch export of charge statements | treasurer | LOW |
| BIZ-08 | Agenda.tsx duplicates calendar.tsx | all | LOW |
| BIZ-09 | Employee/provider have no JWT identity | employee, provider | FUTURE |

---

## Production Readiness Checklist

| Area | Status | Notes |
|------|--------|-------|
| Authentication (JWT) | ✅ | RS256 signed tokens |
| Role-based UI guards | ✅ | RoleGuard throughout |
| Tenant isolation (DB) | ✅ | syndicateId scoped on all queries |
| Subscription enforcement | ✅ | requireActiveSubscription on mutations |
| Audit logging | ✅ | serverAuditLog() opt-in per route |
| Financial precision | ✅ | numeric(12,2) via money() helper |
| Document signing | ✅ | SVG inline regeneration |
| Chat real-time | ✅ | 5s polling |
| Notification center | ✅ | Read/unread, categories, history |
| API finance team guard | ✅ | requireFinanceTeam added |
| API meeting/election guard | ✅ | requireSyndicateTeam added |
| Push notifications | ❌ | Not implemented |
| État des lieux digital | ❌ | No DB table or API |
| Batch charge notifications | ❌ | Not automated |
| AG proxy (pouvoir) mobile | ❌ | DB exists, UI missing |
| Tantième visible to member | ❌ | Data exists, UI missing |
| Document delete RBAC | ❌ | Needs creator-or-admin check |
