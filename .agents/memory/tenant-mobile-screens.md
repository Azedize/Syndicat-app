---
name: Tenant mobile RBAC screens
description: Tenant role routing in mobile app — which quick actions, menu sections, and dashboard widgets are visible vs. hidden.
---

## Rule
The `tenant` role is NOT a copropriétaire. They do NOT have access to:
- Charges & Appels de Fonds (financial data of copropriété)
- Assemblée Générale / Meetings / Elections / Procès-Verbaux
- Budget Prévisionnel, Rapports Financiers, Recouvrement

They DO have access to:
- Mon Appartement / Mon Bail / État des Lieux (their own unit)
- Travaux & Incidents (maintenance affecting their unit)
- Documents (their lease, building rules)
- Chat & Messagerie
- Support & Réclamations

**Why:** Loi 18-00 (Morocco) gives voting and financial rights only to copropriétaires (owners). Tenants are residents, not co-owners.

**How to apply:**
- `QUICK_ACTIONS_TENANT` array in `(tabs)/index.tsx` — Mon Bail, Travaux, Incidents, Documents, Chat only
- `more.tsx` section items filtered via `roles: AllRoles[]` arrays — tenant excluded from Charges, AG, Budget
- "Mon Logement" section in more.tsx is tenant-only (Mon Appart, Mon Bail, État des Lieux)
- Dashboard: meetings strip wrapped with `!isTenant &&`, elections banner wrapped with `!isTenant &&`
- `isTenant` const derived from `user.role === "tenant"` — defined alongside `isSuperAdmin` and `isSyndicateAdmin`

Screens created: `artifacts/mobile/app/mon-bail.tsx`, `artifacts/mobile/app/etat-des-lieux.tsx` (functional placeholders, Phase 9 will wire real API).
