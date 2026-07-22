# AUDIT PHASE 04 — WORKFLOW AUDIT
> Generated: 2026-07-22 | SYNDYCAT GLOBAL CPS

---

## Scenario 1: Owner Requests a Certificate

**Real-world steps:**
1. Owner opens the app and navigates to Documents
2. Owner selects "Attestation d'Adhésion" or "Certificat de Propriété"
3. System generates the PDF with their data
4. Certificate is signed by syndicate admin/president
5. Owner downloads and uses the certificate

**Current implementation audit:**

| Step | Status | Details |
|---|---|---|
| 1. Navigate to Documents | ❌ BLOCKED | `/documents` is hidden from `member` role — member cannot access the Documents menu at all |
| 2. Request via `/profile` → "Télécharger Attestation" | ✅ Partial | Profile screen has a CTA to download attestation PDF — workaround exists |
| 3. PDF generation | ✅ Implemented | `/pdf/membership/:id` and `/pdf/badge/:id` exist |
| 4. Signature | ❌ NOT APPLICABLE | Member-initiated certificate requests have no signature flow from profile |
| 5. Download | ✅ Works | PDF viewer opens the document |

**Missing steps:**
- Member cannot browse all their available documents in Documents screen
- No formal request → validation → delivery workflow for most certificates
- Only attestation d'adhésion is reachable via profile shortcut

**Fix required:** Add `member` to Documents menu. Member sees only their personal documents (filtered by their memberId/lotId).

---

## Scenario 2: Treasurer Launches Debt Recovery

**Real-world steps:**
1. Treasurer reviews unpaid charges in Finance dashboard
2. Treasurer identifies delinquent owners
3. Issues formal reminder (relance)
4. Issues mise en demeure (formal notice)
5. Generates debt report PDF
6. Escalates to legal file

**Current implementation audit:**

| Step | Status | Details |
|---|---|---|
| 1. Review unpaid charges | ❌ BROKEN | Treasurer sees MEMBER view on Finance tab — wrong dashboard |
| 2. Identify delinquent owners | ✅ Available | Charges screen shows unpaid list to syndicate_admin and treasurer |
| 3. Formal reminder | ✅ Available | Escalation screen (`/escalation`) has reminder workflow |
| 4. Mise en demeure | ✅ Available | Escalation workflow has formal notice step |
| 5. Debt report PDF | ✅ Available | PDF generation for debt documents exists |
| 6. Legal escalation | ✅ Available | Escalation screen handles full workflow |

**Missing steps:**
- Step 1 is broken because `finance.tsx` shows treasurer the member view

**Fix required:** Fix `isAdmin` in `finance.tsx` to include `treasurer`.

---

## Scenario 3: Secretary Organizes an Assembly (AG)

**Real-world steps:**
1. Secretary prepares meeting notice (convocation) with agenda
2. AG is planned in the system with date, location, agenda items
3. Convocation sent to all owners (via Annonces or email)
4. Secretary records attendance on the day
5. AG is opened, resolutions voted
6. Secretary prepares PV (minutes) during/after
7. President signs the PV
8. PV is published and shared with all owners
9. PV is archived in Documents

**Current implementation audit:**

| Step | Status | Details |
|---|---|---|
| 1. Prepare convocation | ✅ Available | Secretary can access meetings and AG |
| 2. Plan AG in system | ✅ Available | AG screen allows creation with agenda |
| 3. Send convocation | ✅ Available | Annonces/Publications for notices; email notifications |
| 4. Record attendance | ✅ Available | AG screen has attendance tracking |
| 5. Vote resolutions | ✅ Available | AG has resolution voting with tantièmes |
| 6. Prepare PV | ✅ Available | PV generation exists |
| 7. President signs PV | ❌ BROKEN | Documents signing API only allows `super_admin` and `syndicate_admin` — president cannot sign |
| 8. Publish PV | ✅ Available | PV publishing exists |
| 9. Archive | ✅ Available | Documents module handles archiving |

**Missing steps:**
- Step 7: President cannot digitally sign the PV — this is a legal requirement in Moroccan syndicate law
- Secretary should be able to countersign administrative documents

**Fix required:** Add `president` and `secretary` to document signing API endpoint.

---

## Scenario 4: President Calls Emergency Meeting

**Real-world steps:**
1. President creates emergency council meeting
2. Notifies committee members and secretary
3. Meeting takes place, attendance recorded
4. Decisions made, action items noted
5. Minutes prepared by secretary
6. Minutes circulated to council members

**Current implementation audit:**

| Step | Status | Details |
|---|---|---|
| 1. Create meeting | ✅ Available | President can create meetings |
| 2. Notify members | ✅ Available | Annonces + push notifications |
| 3. Attendance | ✅ Available | Meetings screen |
| 4-5. Minutes | ✅ Available | PV creation available to president and secretary |
| 6. Circulate | ✅ Available | PV published to all council members |

**Issues:** None — this workflow is complete.

---

## Scenario 5: Tenant Files a Maintenance Request

**Real-world steps:**
1. Tenant reports a maintenance issue (water leak, elevator broken, etc.)
2. Admin reviews the request
3. Provider assigned
4. Work carried out
5. Tenant receives notification

**Current implementation audit:**

| Step | Status | Details |
|---|---|---|
| 1. File request | ✅ Available | Tenant can use `/support` to file intervention requests |
| 2. Admin review | ✅ Available | Admin sees all support tickets |
| 3. Provider assigned | ✅ Available | Travaux module links providers |
| 4. Work tracked | ✅ Available | Travaux has status tracking |
| 5. Notification | ✅ Available | Push notifications on ticket updates |

**Issues:** ✅ This workflow is complete.

---

## Scenario 6: Member Votes in an Election

**Real-world steps:**
1. Admin creates election, opens candidacy period
2. Eligible owners submit candidacies
3. Campaign period
4. Voting opens
5. Member votes for candidates (or delegates vote)
6. Results published
7. Mandates assigned to winners

**Current implementation audit:**

| Step | Status | Details |
|---|---|---|
| 1. Create election | ✅ Available | Admin creates and manages lifecycle |
| 2. Candidacy | ✅ Available | Members can submit candidacy |
| 3. Campaign | ✅ Available | Campaign period with Q&A |
| 4. Voting opens | ✅ Available | Admin transitions state |
| 5. Member votes | ✅ Available | Voting and delegation implemented |
| 6. Results | ✅ Available | Results published with winner display |
| 7. Mandates | ✅ Available | Elected members screen shows mandates |

**Issues:** ✅ This workflow is fully implemented — excellent.

---

## Summary of Workflow Gaps

| # | Gap | Severity |
|---|---|---|
| W1 | Member cannot reach Documents — blocks certificate download | 🔴 Critical |
| W2 | Treasurer sees wrong Finance view — blocks debt recovery step 1 | 🔴 Critical |
| W3 | President cannot sign PV digitally — legal compliance issue | 🔴 Critical |
| W4 | No formal document request → validation → delivery flow for members | 🟡 Medium |
| W5 | Tenant cannot file reclamation (complaint) | 🟠 High |
