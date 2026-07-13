# SYNDYCAT GLOBAL CPS — Permission Matrix

> Generated: Phase 1 — RBAC & Role Separation  
> Roles: **SA** = Super Admin · **SYA** = Syndic Admin · **MBR** = Member (Owner) · **TNT** = Tenant
> Last re-audited: 2026-07-13 (role-by-role review + backend/mobile enforcement pass)

---

## Role Definitions (Loi 18-00 aligned)

### Super Admin (SA) — Platform operator
- **Responsibilities:** Onboard/suspend syndicates, manage subscriptions & billing, platform-wide support, cross-syndicate audit oversight.
- **Has no home syndicate.** Any operational action they take on a specific syndicate is "supervision" (must pass `?supervision=true`, logged with `isSupervision=true`).
- **Accessible screens:** Platform dashboard, syndicate list/creation, subscriptions, platform statistics, platform-wide audit log, support ticket triage — plus read access to any syndicate's operational screens under supervision mode.
- **Forbidden:** Cannot vote in elections, cannot attend/vote at a syndicate's AG, cannot submit a payment (not a co-owner).

### Syndic Admin (SYA) — Property manager
- **Responsibilities:** Day-to-day management of their own syndicate: budgets, appels de fonds, invoices, meetings, elections administration, members/tenants roster, maintenance (travaux), providers (prestataires), debt recovery.
- **Scope:** Hard-scoped to `JWT.syndicateId`. Never sees another syndicate's data.
- **Accessible screens:** Finance suite, budget, governance (AG/elections as organizer, not voter), members/tenants management, travaux, prestataires, documents, syndicate audit log.
- **Forbidden:** Cannot vote in elections or AG resolutions (not a co-owner), cannot manage other syndicates, cannot change user roles or platform subscriptions.

### Member (MBR) — Copropriétaire (owner)
- **Responsibilities:** Pay their own charges, vote at AG and in elections, run for office, report incidents on common areas, participate in community features.
- **Scope:** Own records only (`ownerId`/`memberId`/`userId` match); syndicate-wide read for governance content (meetings, elections) they're entitled to vote in.
- **Accessible screens:** Mes charges, AG, élections, mon lot, travaux/sinistres (report), documents, chat, marketplace.
- **Forbidden:** Cannot manage other members, cannot see the finance/admin back office (budgets, invoices, caisse, salary records), cannot validate payments.

### Tenant (TNT) — Locataire (non co-owner resident)
- **Responsibilities:** Live in a rented lot; report maintenance issues affecting their unit; communicate with the syndic.
- **Legal basis for exclusion:** Loi 18-00 grants voting and financial (charge) rights only to copropriétaires. A tenant has no ownership share (tantièmes) and therefore no standing in the AG, elections, or the charge/budget system.
- **Accessible screens:** Mon bail, état des lieux, travaux/incidents (their unit), documents (lease, house rules), chat, support.
- **Forbidden:** Appels de fonds / charges, budget, AG, elections, financial reports, recouvrement, member directory.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Allowed |
| ❌ | Blocked (403) |
| 🔭 | Super Admin only with `?supervision=true` flag |
| 👤 | Own records only |

---

## Platform Management (Super Admin only)

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Syndicates | Create | ✅ | ❌ | ❌ | ❌ |
| Syndicates | Read (all) | ✅ | 👤 | ❌ | ❌ |
| Syndicates | Update | ✅ | 👤 | ❌ | ❌ |
| Syndicates | Suspend/Activate | ✅ | ❌ | ❌ | ❌ |
| Subscriptions | Read (all) | ✅ | ❌ | ❌ | ❌ |
| Subscriptions | Read (own) | ❌ | ✅ | ❌ | ❌ |
| Subscriptions | Create/Update | ✅ | ✅ | ❌ | ❌ |
| Users | Read (all) | ✅ | 👤 | ❌ | ❌ |
| Users | Update status | ✅ | 👤 | ❌ | ❌ |
| Users | Change role | ✅ | ❌ | ❌ | ❌ |
| Users | Delete | ✅ | ❌ | ❌ | ❌ |
| Platform Statistics | Read | ✅ | ❌ | ❌ | ❌ |
| Audit Logs (all syndicates) | Read | ✅ | ❌ | ❌ | ❌ |
| Support Tickets (platform) | Read | ✅ | 👤 | ❌ | ❌ |

---

## Buildings & Lots

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Buildings | Create | 🔭 | ✅ | ❌ | ❌ |
| Buildings | Read (list) | ✅ | 👤 | 👤 | 👤 |
| Buildings | Read (detail) | ✅ | 👤 | 👤 | 👤 |
| Buildings | Update | 🔭 | ✅ | ❌ | ❌ |
| Buildings | Delete | 🔭 | ✅ | ❌ | ❌ |
| Lots | Create | 🔭 | ✅ | ❌ | ❌ |
| Lots | Read (list) | ✅ | 👤 | 👤 | ❌ |
| Lots | Read (my lot) | ❌ | ❌ | ✅ | ✅ |
| Lots | Update | 🔭 | ✅ | ❌ | ❌ |
| Lots | Delete | 🔭 | ✅ | ❌ | ❌ |
| Finance (building dashboard) | Read | ✅ | 👤 | ❌ | ❌ |

---

## Members & Tenants

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Members | Create | 🔭 | ✅ | ❌ | ❌ |
| Members | Read (list) | ✅ | 👤 | ❌ | ❌ |
| Members | Read (detail) | ✅ | 👤 | ❌ | ❌ |
| Members | Update | 🔭 | ✅ | ❌ | ❌ |
| Members | Delete | 🔭 | ✅ | ❌ | ❌ |
| Members | Export | ✅ | ✅ | ❌ | ❌ |
| Tenants | Create | 🔭 | ✅ | ❌ | ❌ |
| Tenants | Read (list) | ✅ | 👤 | ❌ | ❌ |
| Tenants | Read (detail) | ✅ | 👤 | ❌ | 👤 |
| Tenants | Update | 🔭 | ✅ | ❌ | ❌ |
| Tenants | Delete | 🔭 | ✅ | ❌ | ❌ |

---

## Finance

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Budget | Create | 🔭 | ✅ | ❌ | ❌ |
| Budget | Read | ✅ | 👤 | ❌ | ❌ |
| Budget | Update | 🔭 | ✅ | ❌ | ❌ |
| Budget | Approve | 🔭 | ✅ | ❌ | ❌ |
| Budget | Export | ✅ | ✅ | ❌ | ❌ |
| Appels de Fonds | Generate | 🔭 | ✅ | ❌ | ❌ |
| Appels de Fonds | Read (own) | ❌ | ❌ | ✅ | ❌ |
| Appels de Fonds | Submit payment | ❌ | ❌ | ✅ | ❌ |
| Appels de Fonds | Validate payment | 🔭 | ✅ | ❌ | ❌ |
| Transactions | Create | 🔭 | ✅ | ❌ | ❌ |
| Transactions | Read | ✅ | 👤 | ❌ | ❌ |
| Invoices | Create | 🔭 | ✅ | ❌ | ❌ |
| Invoices | Read | ✅ | 👤 | ❌ | ❌ |
| Invoices | Update status | 🔭 | ✅ | ❌ | ❌ |
| Bons de livraison | Create | 🔭 | ✅ | ❌ | ❌ |
| Bons de livraison | Read | ✅ | 👤 | ❌ | ❌ |
| Caisse | Create entry | 🔭 | ✅ | ❌ | ❌ |
| Caisse | Read | ✅ | 👤 | ❌ | ❌ |
| Salary Records | Create | 🔭 | ✅ | ❌ | ❌ |
| Salary Records | Read | ✅ | 👤 | ❌ | ❌ |
| Debt Escalations | Trigger scan | 🔭 | ✅ | ❌ | ❌ |
| Debt Escalations | Read | ✅ | 👤 | ❌ | ❌ |

---

## Governance

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Meetings (AG) | Create | 🔭 | ✅ | ❌ | ❌ |
| Meetings (AG) | Read | ✅ | 👤 | ✅ | ❌ |
| Meetings (AG) | Attend | 🔭 | ✅ | ✅ | ❌ |
| Meetings (AG) | Update status | 🔭 | ✅ | ❌ | ❌ |
| Meetings (AG) | Export PV | ✅ | 👤 | ❌ | ❌ |
| Elections | Create | 🔭 | ✅ | ❌ | ❌ |
| Elections | Read | ✅ | 👤 | ✅ | ❌ |
| Elections | Vote | ❌ | ❌ | ✅ | ❌ |
| Elections | Update | 🔭 | ✅ | ❌ | ❌ |

---

## Operations

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Travaux | Create | 🔭 | ✅ | ❌ | ❌ |
| Travaux | Read | ✅ | 👤 | ✅ | ✅ |
| Travaux | Update | 🔭 | ✅ | ❌ | ❌ |
| Travaux | Assign | 🔭 | ✅ | ❌ | ❌ |
| Sinistres | Create (report) | ❌ | ❌ | ✅ | ✅ |
| Sinistres | Create (admin) | 🔭 | ✅ | ❌ | ❌ |
| Sinistres | Read | ✅ | 👤 | 👤 | ❌ |
| Sinistres | Update | 🔭 | ✅ | ❌ | ❌ |
| Prestataires | Create | 🔭 | ✅ | ❌ | ❌ |
| Prestataires | Read | ✅ | 👤 | ❌ | ❌ |
| Prestataires | Update | 🔭 | ✅ | ❌ | ❌ |
| Contracts | Create | 🔭 | ✅ | ❌ | ❌ |
| Contracts | Read | ✅ | 👤 | ❌ | ❌ |
| Parking | Read | ✅ | 👤 | 👤 | ❌ |
| Parking | Manage | 🔭 | ✅ | ❌ | ❌ |

---

## Documents & Communication

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Documents | Upload | 🔭 | ✅ | ❌ | ❌ |
| Documents | Read (published) | ✅ | 👤 | ✅ | ✅ |
| Documents | Update | 🔭 | ✅ | ❌ | ❌ |
| Documents | Delete | ✅ | 👤 | ❌ | ❌ |
| Documents | Export | ✅ | ✅ | ❌ | ❌ |
| Chat | Read/Send | ✅ | ✅ | ✅ | ✅ |
| Publications | Read | ✅ | ✅ | ✅ | ✅ |
| Publications | Create | 🔭 | ✅ | ❌ | ❌ |
| Announcements | Read | ✅ | ✅ | ✅ | ✅ |
| Announcements | Create | 🔭 | ✅ | ❌ | ❌ |
| Support Tickets | Create | ✅ | ✅ | ✅ | ✅ |
| Support Tickets | Read (own) | ✅ | ✅ | ✅ | ✅ |
| Support Tickets | Manage | ✅ | 👤 | ❌ | ❌ |

---

## Marketplace

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Products | Read (approved) | ✅ | ✅ | ✅ | ❌ |
| Products | Create | 🔭 | ✅ | ✅ | ❌ |
| Products | Update (own) | 🔭 | ✅ | ✅ | ❌ |
| Products | Moderate | ✅ | ✅ | ❌ | ❌ |
| Orders | Create | ❌ | ❌ | ✅ | ❌ |
| Orders | Read (own) | ❌ | ❌ | ✅ | ❌ |

---

## Audit & Security

| Module | Action | SA | SYA | MBR | TNT |
|--------|--------|----|-----|-----|-----|
| Audit Logs | Read (platform) | ✅ | ❌ | ❌ | ❌ |
| Audit Logs | Read (own syndicate) | ❌ | ✅ | ❌ | ❌ |
| Storage | Upload | ✅ | ✅ | ❌ | ❌ |
| Storage | Read (own syndicate) | ✅ | 👤 | ❌ | ❌ |
| Storage | Delete | ✅ | 👤 | ❌ | ❌ |
| Statistics (HR/Finance) | Read | ✅ | 👤 | ❌ | ❌ |
| Statistics (platform) | Read | ✅ | ❌ | ❌ | ❌ |
| Statistics (buildings) | Read | ✅ | ❌ | ❌ | ❌ |

---

## Notes

- **👤 (own records)**: Syndic Admin is scoped to their JWT `syndicateId`. Member/Tenant are scoped to their own records only.
- **🔭 (supervision)**: Super Admin must pass `?supervision=true` on operational write routes. Every such access is logged to the audit log.
- All checks are enforced at **three layers**: middleware (role), handler (syndicate isolation), and query (Drizzle WHERE clause).
- Frontend role checks mirror this matrix via the `usePermission()` hook but are never the sole enforcement layer.

---

## Phase 1 Re-Audit — Findings & Fixes (2026-07-13)

A fresh pass (backend route-by-route + mobile screen-by-screen) against this matrix found and fixed the following drift. Items not listed were checked and already conformed to the matrix.

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | `GET /members` and `GET /members/:id` had no role guard — any authenticated member/tenant could browse the full owner directory (name, email, phone, profession) of their syndicate. | High — PII exposure to unauthorized roles | Added `requireRole("super_admin","syndicate_admin")`. Matches matrix: Members Read = SA/SYA only. |
| 2 | `GET /ag-meetings`, `GET /ag-meetings/:id`, `GET /ag-meetings/:id/pv`, `GET /ag-meetings/:id/proxies` had no `requireNotTenant` — tenants could read AG content they have no legal standing in. | Medium — governance data leak to non-co-owners | Added `requireNotTenant` to all four. |
| 3 | `GET /ag-meetings/:id/pv` had **no syndicate isolation check at all** — any authenticated non-tenant user (member/syndic_admin of *any* syndicate) could fetch another syndicate's procès-verbal by ID. | High — cross-tenant IDOR on a legal document | Added the same `meeting.syndicateId !== user.syndicateId` check already present on the sibling `:id` and `proxies` routes. |
| 4 | `GET /verify/badge/:userId` (intentionally public, for QR badge scanning) returned the user's **email address** to anyone, unauthenticated. | Medium — PII harvesting via ID enumeration | Removed `email` from the public response; kept name/status/syndicate/lot which is sufficient to verify badge legitimacy. |
| 5 | 11 mobile screens with financial/governance actions (`charges`, `budget-previsionnel`, `assemblee-generale`, `elections`, `tableau-bord-financier`, `reports`, `escalation`, `journal-audit`, `syndicate-setup`, `invoices`, `pv`) relied **only on menu-hiding** for access control — reachable and renderable via direct deep-link/`router.push` by an unauthorized role, even though the backend would reject the underlying API calls (blank/error screens, and in one or two spots, no isolation check to fall back on). | Medium — broken UX at minimum, real access if a backend check was ever missed | Added a shared `RoleGuard` component (`artifacts/mobile/components/RoleGuard.tsx`) and wrapped each screen's default export with it. Unauthorized roles are redirected to the dashboard instead of rendering the screen at all. |

### Verified, no change needed
- `finance.ts` (transactions/salaries/caisse) — already `requireRole("super_admin","syndicate_admin")` on every route.
- `budget.ts` appels-de-fonds (`GET`, `/pay`, `/validate`) — tenant already hard-blocked inline; syndicate isolation already verified via building join.
- `elections.ts` — already uses `requireNotTenant` throughout.
- `syndicates.ts` `GET /:id` — already checks `user.syndicateId === id` for non-super_admin.
- `pdf.ts` `/pdf/escalation/:id` — token accepted via query param for mobile `Linking.openURL`, but role + syndicate ownership are validated manually inside the handler; this is intentional and correctly scoped.

### Remaining, tracked separately (not RBAC — out of scope for this pass)
- Orphan mobile screens with no reachable nav entry for any role: `simulateur.tsx`, `fiches-paie.tsx`, `repertoire-juridique.tsx`, `workflow.tsx`, `bon-livraison.tsx`. These aren't security issues (unreachable ≠ exposed) but should be wired into navigation or removed.
- RTL and translation completeness were not part of this RBAC pass — see `AUDIT_REPORT.md` §1.3 for the known list of RTL-incomplete screens.
