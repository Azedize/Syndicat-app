# AUDIT PHASE 05 — RBAC AUDIT MATRIX
> Generated: 2026-07-22 | SYNDYCAT GLOBAL CPS

---

## Complete ROLE × PAGE × ACTION Matrix

Legend:
- ✅ Correct
- ❌ Wrong (too permissive or too restrictive)  
- ➕ Missing (should be added)
- 🚫 Correctly blocked

| Screen / Action | super_admin | syndicate_admin | president | treasurer | secretary | committee_member | member | tenant |
|---|---|---|---|---|---|---|---|---|
| **DASHBOARD** |
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **FINANCE TAB** |
| Finance Tab visibility | ✅ | ✅ | 🚫 | ✅* | 🚫 | 🚫 | 🚫 | 🚫 |
| Finance Tab — management view | ✅ | ✅ | 🚫 | ❌ Gets member view | 🚫 | 🚫 | 🚫 | 🚫 |
| **TABLEAU BORD FINANCIER** |
| View financial dashboard | ✅ | ✅ | 🚫 | ❌ Blocked by RoleGuard | 🚫 | 🚫 | 🚫 | 🚫 |
| **CHARGES & APPELS** |
| View fund calls | ✅ | ✅ | 🚫 | ✅ | 🚫 | 🚫 | ✅ | 🚫 |
| Pay charge | 🚫 | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | 🚫 |
| Validate payment | ✅ | ✅ | 🚫 | ❌ (should validate) | 🚫 | 🚫 | 🚫 | 🚫 |
| **BUDGET** |
| View budget | ✅ | ✅ | ❌ Missing | ✅ | 🚫 | ❌ Missing | 🚫 | 🚫 |
| Edit budget | ✅ | ✅ | 🚫 | ✅ | 🚫 | 🚫 | 🚫 | 🚫 |
| **MEMBERS LIST** |
| GET /members | ✅ | ✅ | ❌ Missing | ❌ Missing | ❌ Missing | 🚫 | 🚫 | 🚫 |
| Create member | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **DOCUMENTS** |
| View documents list | ✅ | ✅ | ✅ | 🚫 | ✅ | 🚫 | ❌ Missing | 🚫 |
| Generate document | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Sign document (POST /documents/:id/sign) | ✅ | ✅ | ❌ Missing | 🚫 | ❌ Missing | 🚫 | 🚫 | 🚫 |
| Delete document | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **GOVERNANCE** |
| View governance screen | ✅ | ✅ | ✅ | 🚫 | ❌ Missing | ✅ | 🚫 | ❌ Bug: isAdmin allows |
| Manage bureau members | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **ELECTIONS** |
| View elections | ✅ | ✅ | ✅ | 🚫 | 🚫 | ✅ | ✅ | 🚫 |
| Create election | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| Vote | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | ✅ | 🚫 |
| **MEETINGS** |
| View meetings | ✅ | ✅ | ✅ | 🚫 | ✅ | ✅ | 🚫 | 🚫 |
| Create meeting | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **ASSEMBLÉE GÉNÉRALE** |
| View AG | ✅ | ✅ | ✅ | 🚫 | ✅ | ✅ | ✅ | 🚫 |
| Create AG | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **TRAVAUX** |
| View works | ✅ | ✅ | ✅ | 🚫 | 🚫 | ❌ Missing | 🚫 | 🚫 |
| Manage works | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **RECLAMATIONS** |
| View reclamations | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | ✅ | ❌ Missing |
| File reclamation | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | ✅ | ❌ Missing |
| **PUBLICATIONS** |
| View publications | ✅ | ✅ | ✅ | 🚫 | ✅ | 🚫 | ❌ Missing | ❌ Missing |
| Create publication | ✅ | ✅ | ✅ | 🚫 | ✅ | 🚫 | 🚫 | 🚫 |
| **CHAT** |
| Use chat | ✅ | ✅ | ✅ | 🚫 | ✅ | 🚫 | ❌ Missing | ❌ Missing |
| **IDEAS** |
| View ideas | ✅ | ✅ | ✅ | 🚫 | 🚫 | ❌ Missing | ❌ Missing | 🚫 |
| Submit idea | ✅ | ✅ | ✅ | 🚫 | 🚫 | ❌ Missing | ❌ Missing | 🚫 |
| **MARKETPLACE** |
| Browse products (tab) | 🚫 | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | ❌ Missing | 🚫 |
| Cart & orders | 🚫 | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | ❌ Missing | 🚫 |
| Manage shop | 🚫 | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **SETTINGS** |
| Access settings | ✅ | ✅ | ❌ Missing | ❌ Missing | ❌ Missing | ❌ Missing | ❌ Missing | ❌ Missing |
| **SUPPORT** |
| File ticket | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Resolve ticket | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| **ESCALATION** |
| Launch debt recovery | ✅ | ✅ | 🚫 | ✅ | 🚫 | 🚫 | 🚫 | 🚫 |
| **ANNONCES** |
| View announcements | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create announcement | ✅ | ✅ | ✅ | 🚫 | ✅ | 🚫 | 🚫 | 🚫 |

---

## Summary: Permissions by Status

### Too Restrictive (Missing Permissions) — 18 issues

| # | Permission | Missing For | Severity |
|---|---|---|---|
| R1 | Finance tab management view | treasurer | 🔴 Critical |
| R2 | Tableau bord financier | treasurer | 🔴 Critical |
| R3 | Sign documents | president, secretary | 🔴 Critical |
| R4 | Documents list view | member | 🟠 High |
| R5 | Settings access | all non-admin roles | 🔴 Critical |
| R6 | Marketplace browse + cart | member | 🟠 High |
| R7 | Reclamations | tenant | 🟠 High |
| R8 | Publications view | member, tenant | 🟡 Medium |
| R9 | Ideas view + submit | member, committee_member | 🟡 Medium |
| R10 | Chat | member, tenant | 🟡 Medium |
| R11 | Budget view | president, committee_member | 🟡 Medium |
| R12 | GET /members API | president, treasurer, secretary | 🟠 High |
| R13 | Governance screen | secretary | 🟡 Medium |
| R14 | Travaux view | committee_member | 🟡 Medium |
| R15 | Sinistres view | committee_member | 🟡 Medium |
| R16 | Validate payments | treasurer | 🟡 Medium |
| R17 | Lots view | secretary (for convocations) | 🟡 Medium |

### Too Permissive (Wrong Permissions) — 2 issues

| # | Permission | Problem | Severity |
|---|---|---|---|
| P1 | Governance isAdmin | `user.role !== "member"` accidentally allows tenant | 🟡 Medium |
| P2 | Meetings isAdmin | Same bug — tenant UI not blocked | 🟡 Medium |

### Incorrectly Implemented — 2 issues

| # | Permission | Problem | Severity |
|---|---|---|---|
| I1 | Finance tab isAdmin | treasurer excluded from admin view | 🔴 Critical |
| I2 | Tableau bord RoleGuard | treasurer excluded at screen level | 🔴 Critical |
