---
name: RBAC screen/API guard patterns
description: Where role enforcement lives in this app (mobile screens + API routes) and which patterns are canonical, so future RBAC work stays consistent.
---

- Mobile menu/tab visibility (`(tabs)/_layout.tsx`, `(tabs)/more.tsx`, `SidebarNav.tsx`) is NOT access control — it only hides links. Every screen that shows role-restricted data must also self-guard, since Expo Router allows direct/deep-link navigation to any route regardless of menu visibility.
- Two screen-level guard patterns coexist in `artifacts/mobile`:
  - `components/RoleGuard.tsx` (dominant, ~12+ screens) — wraps children, shows a spinner and redirects if unauthorized. Convention: keep `export default function XScreen()` returning `<RoleGuard allow={[...]}><XScreenInner /></RoleGuard>`, move the real body into `XScreenInner`.
  - `hooks/useRequireRole.ts` (used only in `utilisateurs.tsx`) — a hook that redirects but does not block rendering, so restricted content can flash briefly before redirect.
  - **Why it matters:** when adding a guard to a new screen, prefer `RoleGuard` for consistency with the majority pattern; don't invent a third approach.
- API-side role source of truth: `artifacts/api-server/src/middleware/auth.ts` (`requireRole`, `requireAdmin`, `requireOperationalAccess`, `requireNotTenant`, `assertSyndicateAccess`). Role values: `super_admin | syndicate_admin | member | tenant` (`ROLE_VALUES` in `routes/users.ts`).
- Screen guards should mirror the API's read-role matrix, while create/update/delete controls should remain separately gated to the API's mutation roles; otherwise valid secretary/president/treasurer workflows can be hidden or redirected even though their API access is correct.
- Not every table needs `syndicateId` scoping — `reclamationsTable` (labor/HR grievances) is intentionally platform-wide/unscoped by design (whistleblower-style, logged with `platformAction: true`), so an admin seeing all rows there is correct, not an IDOR.
- `serverAuditLog()` (`artifacts/api-server/src/lib/audit.ts`) must be called explicitly at each sensitive route; it is not automatic middleware. When adding a new sensitive mutation (create/delete/role-change), check whether its route file already calls it — user create/status/role/delete in `routes/users.ts` and syndicate creation in `routes/syndicates.ts` were missing it until added.
