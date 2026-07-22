# AUDIT PHASE 03 — PAGE AUDIT
> Generated: 2026-07-22 | SYNDYCAT GLOBAL CPS

---

## Page-by-Page Analysis

### Dashboard (/(tabs)/index.tsx)
- **Intended Users:** All roles
- **Business Purpose:** Central hub — stats, quick actions, alerts, recent activity
- **Frequency:** Daily
- **Real User Assessment:**
  - Would a president open this? ✅ Yes — sees council actions, pending AG
  - Would a treasurer open this? ✅ Yes — sees financial KPIs
  - Would a member open this? ✅ Yes — sees charges due, upcoming meetings
  - Would a tenant open this? ✅ Yes — sees maintenance requests, notices
- **Issues:** ✅ None — correctly implemented with role-specific content

---

### Finance Tab (/(tabs)/finance.tsx)
- **Intended Users:** syndicate_admin, treasurer
- **Business Purpose:** Quick access hub for all financial modules
- **Frequency:** Daily for treasurer, weekly for admin
- **Real User Assessment:**
  - Would a treasurer open this? ✅ Yes — but SEES WRONG VIEW (member UI)
- **Issues:** 🔴 CRITICAL — `isAdmin` defined as `super_admin || syndicate_admin` only, treasurer sees member view

---

### Marketplace Tab (/(tabs)/marketplace.tsx)
- **Intended Users:** syndicate_admin only
- **Business Purpose:** Product catalog and seller management
- **Frequency:** Weekly
- **Real User Assessment:**
  - Would a member want to buy products? ✅ Yes
  - Would a tenant want to buy? ✅ Possibly
- **Issues:** 🔴 Member cannot access marketplace — critical business gap

---

### Tableau Bord Financier (/tableau-bord-financier.tsx)
- **Intended Users:** syndicate_admin, treasurer (RoleGuard: super_admin, syndicate_admin — BUG)
- **Business Purpose:** Financial overview — recovery rate, budget distribution, works summary
- **Frequency:** Daily for treasurer
- **Real User Assessment:** ✅ Treasurer needs this daily
- **Issues:** 🟠 RoleGuard in the screen itself only allows super_admin and syndicate_admin — treasurer is blocked at screen level too

---

### Charges & Appels (/charges.tsx)
- **Intended Users:** syndicate_admin, treasurer (manage), member (pay)
- **Business Purpose:** Fund calls — creation, validation, payment
- **Frequency:** Monthly
- **Real User Assessment:** ✅ All three roles need this
- **Issues:** ✅ Correct

---

### Budget Prévisionnel (/budget-previsionnel.tsx)
- **Intended Users:** syndicate_admin, treasurer
- **Business Purpose:** Annual budget planning and presentation
- **Frequency:** Yearly (budget cycle)
- **Real User Assessment:**
  - Would a president need this? ✅ Yes — president chairs AG where budget is voted
- **Issues:** 🟡 President should have read-only access

---

### Elections (/elections.tsx)
- **Intended Users:** syndicate_admin (manage), member (participate), committee_member (participate)
- **Business Purpose:** Full election lifecycle — candidacy, campaign, voting, results
- **Frequency:** Yearly
- **Issues:** ✅ Correctly implemented with role-specific actions

---

### Gouvernance (/governance.tsx)
- **Intended Users:** syndicate_admin, president, committee_member
- **Business Purpose:** Organigram, mandates, delegations, statutes
- **Frequency:** Monthly
- **Real User Assessment:**
  - Would secretary need this? ✅ Yes — secretary prepares governance docs
- **Issues:** 🟡 Secretary missing; `isAdmin = user.role !== "member"` accidentally includes tenant

---

### Assemblée Générale (/assemblee-generale.tsx)
- **Intended Users:** syndicate_admin, president, secretary, committee_member, member
- **Business Purpose:** AG lifecycle — planning, resolutions, voting, PV generation
- **Frequency:** 1-2× per year
- **Issues:** ✅ Correctly implemented

---

### Meetings (/meetings.tsx)
- **Intended Users:** syndicate_admin, president, secretary, committee_member
- **Business Purpose:** Council meeting management — agenda, attendance, minutes
- **Frequency:** Monthly
- **Real User Assessment:**
  - `isAdmin = user.role !== "member"` — accidentally includes tenant at UI level
- **Issues:** 🟡 UI-level isAdmin check inconsistent (tenant blocked at API but not in UI)

---

### PV Réunions (/pv.tsx)
- **Intended Users:** syndicate_admin, president, secretary, committee_member, member (view)
- **Business Purpose:** View and publish minutes
- **Frequency:** Monthly
- **Issues:** ✅ Correctly role-gated

---

### Documents (/documents.tsx)
- **Intended Users:** syndicate_admin, secretary, president
- **Business Purpose:** Document management — generate, sign, archive
- **Frequency:** Weekly
- **Real User Assessment:**
  - Would a member need this? ✅ Yes — to download attestations, certificates, and their personal documents
- **Issues:** 🟠 Member excluded from document access entirely

---

### Mon Lot (/mon-lot.tsx)
- **Intended Users:** member
- **Business Purpose:** Apartment details, tantiemes, financial status
- **Frequency:** Monthly
- **Issues:** ✅ Correct

---

### Mon Bail (/mon-bail.tsx)
- **Intended Users:** tenant
- **Business Purpose:** Lease details — dates, rent, deposit, contacts
- **Frequency:** Monthly
- **Issues:** ✅ Correct

---

### Locataires (/locataires.tsx)
- **Intended Users:** syndicate_admin
- **Business Purpose:** Tenant registry — lease management
- **Frequency:** Monthly
- **Issues:** ✅ Correct for management; ⚠️ president may need to view (eviction procedures)

---

### Travaux (/travaux.tsx)
- **Intended Users:** syndicate_admin, president
- **Business Purpose:** Works management — planning, provider assignment, progress
- **Frequency:** Monthly
- **Real User Assessment:**
  - Would committee_member need this? ✅ Yes — council votes on works budgets
- **Issues:** 🟡 committee_member missing

---

### Sinistres (/sinistres.tsx)
- **Intended Users:** syndicate_admin, president
- **Business Purpose:** Insurance claims — incident reporting, damage assessment
- **Frequency:** Rarely/when needed
- **Issues:** 🟡 committee_member should view (oversight role)

---

### Réclamations (/reclamations.tsx)
- **Intended Users:** syndicate_admin, president, member
- **Business Purpose:** HR grievances and resident complaints
- **Frequency:** Monthly
- **Real User Assessment:**
  - Would a tenant file a complaint? ✅ Yes — noise, damage, neighbor issues
- **Issues:** 🟠 Tenant excluded from filing complaints

---

### Chat (/chat.tsx)
- **Intended Users:** syndicate_admin, president, secretary
- **Business Purpose:** Internal messaging between management team
- **Frequency:** Daily
- **Real User Assessment:**
  - Would a member want to message? ✅ Yes — direct questions to management
- **Issues:** 🟡 Members and tenants have no communication channel with management

---

### Publications (/publications.tsx)
- **Intended Users:** syndicate_admin, secretary, president (create)
- **Business Purpose:** Syndicate news and announcements
- **Frequency:** Weekly
- **Real User Assessment:**
  - Would a member want to read news? ✅ Yes
  - Would a tenant want to read? ✅ Yes
- **Issues:** 🟠 Member/tenant cannot see Publications — only Annonces (noticeboard)

---

### Support (/support.tsx)
- **Intended Users:** syndicate_admin, president, treasurer, secretary, committee_member, member, tenant
- **Business Purpose:** Syndicate-level support tickets
- **Frequency:** Weekly
- **Issues:** ✅ Correct

---

### Platform Support (/platform-support.tsx)
- **Intended Users:** super_admin (resolve), syndicate_admin and mgmt team (create)
- **Business Purpose:** Platform-level support (bugs, billing, features)
- **Frequency:** Monthly
- **Issues:** ✅ Correct

---

### Journal Audit (/journal-audit.tsx)
- **Intended Users:** super_admin only
- **Business Purpose:** Platform-wide security and change audit log
- **Frequency:** Weekly
- **Real User Assessment:**
  - Should syndicate_admin see their own syndicate's audit log? ✅ Yes — for compliance
- **Issues:** 🟡 syndicate_admin should see syndicate-scoped audit (not platform-wide)

---

### Statistiques (/statistiques.tsx)
- **Intended Users:** super_admin (global), syndicate_admin, treasurer (syndicate)
- **Business Purpose:** Analytics dashboard
- **Frequency:** Monthly
- **Issues:** ✅ Correct

---

### Escalation (/escalation.tsx)
- **Intended Users:** syndicate_admin, treasurer
- **Business Purpose:** Debt recovery workflow — reminders, formal notices, legal filing
- **Frequency:** Monthly
- **Issues:** ✅ Correct

---

### Settings (/settings.tsx)
- **Intended Users:** super_admin, syndicate_admin ONLY
- **Business Purpose:** App appearance, language, security (biometrics, 2FA)
- **Frequency:** Weekly
- **Real User Assessment:**
  - Would a member want to change language? ✅ Yes
  - Would a tenant want dark mode? ✅ Yes
- **Issues:** 🔴 Settings is a universal user need — ALL users should access it

---

### Profile (/profile.tsx)
- **Intended Users:** All roles
- **Business Purpose:** Personal info, avatar, member ID card, attestation download
- **Frequency:** Monthly
- **Issues:** ✅ Correct

---

### Notifications (/notifications.tsx)
- **Intended Users:** All roles
- **Business Purpose:** Notification preferences and alert history
- **Frequency:** Weekly
- **Issues:** ✅ Correct

---

## Pages to Hide
None — all pages have a legitimate purpose.

## Pages to Delete
None.

## Pages to Add (Missing)
| # | Page | Role | Purpose |
|---|---|---|---|
| P1 | Documents (read-only view for members) | member | Download personal certificates, attestations |
| P2 | Marketplace browse for residents | member, tenant | Browse and purchase from syndicate marketplace |
| P3 | Syndicate audit log (scoped) | syndicate_admin | View their own syndicate's operations log |

## Summary Table

| Page | Verdict | Priority Fix |
|---|---|---|
| finance.tsx tab | 🔴 Treasurer sees wrong view | M1 |
| tableau-bord-financier.tsx | 🔴 RoleGuard excludes treasurer | P-FIX |
| settings.tsx | 🔴 ALL users need settings | M3 |
| documents.tsx | 🟠 Member excluded | M4 |
| reclamations.tsx | 🟠 Tenant excluded | M5 |
| publications.tsx | 🟠 Residents can't read | M6 |
| marketplace access | 🔴 Members can't shop | M2 |
| chat.tsx | 🟡 No resident access | M7 |
| governance.tsx | 🟡 isAdmin bug includes tenant | Code fix |
| meetings.tsx | 🟡 isAdmin bug | Code fix |
