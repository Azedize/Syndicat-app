# PHASE 02 — MENU & NAVIGATION AUDIT

## Status: COMPLETED
**Date:** 2026-07-22

---

## Navigation Structure

### Tab Bar (bottom, mobile)
| Tab | Icon | Roles | Status |
|-----|------|-------|--------|
| Accueil | home | All | ✅ LIVE |
| Membres | users | Admin only | ✅ LIVE (hidden for others) |
| Finance | dollar-sign | Admin/Treasurer | ✅ LIVE (hidden for others) |
| Marketplace | shopping-bag | All | ✅ LIVE |
| Plus | menu | All | ✅ LIVE |

### Sidebar (wide/desktop)
All 5 primary + quick links via SidebarNav.tsx.
Sidebar correctly uses `/alerts` for Notifications.

### More Screen (primary router for ~70% of app)
12 sections, ~50 menu items — all items verified LIVE (all routes exist on disk).

---

## Dead / Unreachable Screens

| Screen | File | Issue | Resolution |
|--------|------|-------|------------|
| Dev Badge Preview | _dev-badge-preview.tsx | Dev utility, no menu entry | ✅ DELETED |
| Legal Directory | repertoire-juridique.tsx | Reachable content, missing menu | ✅ FIXED: Added to Legal section |
| Financial Simulator | simulateur.tsx | No menu entry found | Added to Finance section (admin/treasurer) |
| Agenda | agenda.tsx | Overlaps calendar.tsx | DEFERRED: Needs consolidation pass |
| Reviews | reviews.tsx | Only reachable from orders.tsx | Acceptable — contextual navigation |
| Actions | actions.tsx | No incoming routes found | INVESTIGATE: Purpose unclear |

---

## Duplicate Screens

| Pair | Issue | Resolution |
|------|-------|------------|
| notifications.tsx / alerts.tsx | Same data source (`/alerts` API), duplicate UX | ✅ FIXED: menu entry redirected to /alerts |
| calendar.tsx / agenda.tsx | Overlapping purpose | DEFERRED: calendar.tsx is richer |
| template-studio / template-editor / template-request | 3 fragmented flows | Acceptable — distinct workflows (create/edit/request) |

---

## Missing Menu Entries Added

### Legal/Documents section in more.tsx
- **Added:** Répertoire Juridique → `/repertoire-juridique` (roles: syndicate_admin, president, secretary)

### Finance section in more.tsx
- **Added:** Simulateur Financier → `/simulateur` (roles: syndicate_admin, treasurer)

### Account section in more.tsx
- **Fixed:** Notifications entry → now routes to `/alerts` (was `/notifications`)

---

## Route Reachability Summary

| Category | Count |
|----------|-------|
| Total screens found | ~88 |
| Reachable via menu | ~82 |
| Reachable contextually | ~4 |
| Deleted (dev utility) | 1 |
| Remaining dead pages | 1 (actions.tsx — investigate) |

---

## Issues Found & Status

| ID | Issue | Status |
|----|-------|--------|
| NAV-01 | /notifications routes to inferior screen | ✅ FIXED |
| NAV-02 | _dev-badge-preview.tsx in production | ✅ DELETED |
| NAV-03 | repertoire-juridique unreachable | ✅ FIXED |
| NAV-04 | simulateur.tsx unreachable | ✅ FIXED |
| NAV-05 | agenda.tsx duplicates calendar.tsx | DEFERRED |
| NAV-06 | actions.tsx no incoming routes | INVESTIGATE |

---

## Next Phase
→ PHASE_03_PERMISSION_AUDIT.md
