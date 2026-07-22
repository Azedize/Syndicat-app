# PHASE 01 — ROLE & PERMISSION AUDIT

## Status: COMPLETED
**Date:** 2026-07-22

---

## Roles Identified (8 active JWT roles)

| Role | JWT Identity | Platform Scope |
|------|-------------|----------------|
| super_admin | ✅ | Platform-wide (SaaS owner) |
| syndicate_admin | ✅ | Single syndicate, full ops |
| president | ✅ | Governance + AG chair |
| treasurer | ✅ | Finance + debt recovery |
| secretary | ✅ | Documents + meetings minutes |
| committee_member | ✅ | Oversight, votes only |
| member (co-owner) | ✅ | Own lot, cotisations, votes |
| tenant | ✅ | Own unit, documents, payments |
| employee | ❌ No JWT yet | DB record only |
| partner / provider | ❌ No JWT yet | DB record only |

---

## Role Visibility Matrix (key screens)

| Screen | super_admin | syndicate_admin | president | treasurer | secretary | committee | member | tenant |
|--------|:-----------:|:---------------:|:---------:|:---------:|:---------:|:---------:|:------:|:------:|
| Tableau National | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Buildings/Lots | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Members list | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Finance Dashboard | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Budget Prévisionnel | ❌ | ✅ | ✅(RO) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Rapports Financiers | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Fiches de Paie | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Escalation/Debt | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| AG Management | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Meetings | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Elections/Votes | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Documents Copro | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅(RO) | ✅(RO) |
| Maintenance/Travaux | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Sinistres | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Support L1 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Support L2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mon Bail | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Mon Appartement | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Cotisations | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Paiements | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Marketplace | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Chat | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Journal Audit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Issues Found

### PERM-01: No API-level guards for president/treasurer/secretary roles
- **Risk:** A member/tenant who obtains a JWT with elevated role can call treasurer routes.
- **Impact:** Financial data leak.
- **Fix:** Add `requireRole(["treasurer", "syndicate_admin"])` middleware to budget, reports, payroll, and escalation routes.

### PERM-02: employee/partner/provider have no JWT
- **Risk:** These roles appear in DB (prestataires, conseil_syndical) but cannot authenticate.
- **Impact:** Cannot build provider/employee mobile experience.
- **Status:** Deferred — separate auth flow required.

### PERM-03: Secretary must not access accounting
- **Status:** ✅ Correctly enforced in UI. Secretary excluded from Finance, Budget, Reports.

### PERM-04: Super admin excluded from syndicate operations
- **Status:** ✅ Correctly enforced. Finance tab, Marketplace tab, AG hidden for super_admin.

---

## Fixes Applied
- ✅ All role groups correctly defined in `more.tsx` (ALL_TEAM, ALL_USERS, RESIDENTS)
- ✅ RoleGuard component used consistently across screens
- ✅ Super admin scoped to platform-only operations
- ✅ Tenant excluded from governance, maintenance, marketplace

## Remaining Tasks
- [ ] Add API-level `requireRole` guards for treasurer-only routes (see PHASE_05)
- [ ] Build JWT auth for employee/provider roles (future phase)

## Next Phase
→ PHASE_02_MENU_AUDIT.md
