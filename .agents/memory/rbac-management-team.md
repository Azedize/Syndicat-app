---
name: RBAC 4-role management team expansion
description: president, treasurer, secretary, committee_member added as JWT roles; all UI and API guards updated.
---

## Rule
The platform has 8 roles: super_admin, syndicate_admin, president, treasurer, secretary, committee_member, member, tenant.

**New roles added (syndicate management team):**
- `president` — governance, assemblies, document signing; NOT finance/settings
- `treasurer` — finance, budgets, charges, debt recovery; NOT governance/settings
- `secretary` — documents, meetings, minutes, publications; NOT accounting
- `committee_member` — read-only: meetings + votes + governance

**Why:** Business spec requires fine-grained roles within a syndicate rather than a single syndicate_admin handling everything.

**How to apply:**
- API guards in `artifacts/api-server/src/middleware/auth.ts`:
  - `requireOperationalAccess` — all 5 syndicate team roles
  - `requireFinanceAccess` — syndicate_admin + treasurer
  - `requireGovernanceAccess` — admin + president + secretary + committee_member
  - `requireDocumentAccess` — admin + secretary + president
  - `isSyndicateTeamRole(role)` helper exported — use for budget scoping inside handlers
- Budget routes use `requireFinanceAccess` + `isSyndicateScoped(user.role)` local helper for row-level scoping
- Finance tab in mobile (`_layout.tsx`): visible to `syndicate_admin` OR `treasurer` only
- Settings menu item (`more.tsx`): visible to `super_admin` + `syndicate_admin` only
- Login screen has demo cards for all 6 new syndicate team roles; demo accounts seeded for Résidence Atlas:
  president@andalous.ma, tresorier@andalous.ma, secretaire@andalous.ma, conseil@andalous.ma
- Translation keys added to LanguageContext: rolePresident, roleTresorier, roleSecrétaire, roleMembreConseil, presidentDesc, treasurerDesc, secretaryDesc, committeeMemberDesc
- Elections/AG routes already used `requireOperationalAccess` — now automatically accept all team roles
