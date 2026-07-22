# AUDIT PHASE 01 — ROLE AUDIT
> Generated: 2026-07-22 | SYNDYCAT GLOBAL CPS

---

## Roles Existing in the Application

The JWT `UserRole` type is defined in `artifacts/api-server/src/middleware/auth.ts` with 8 roles:

| Role | Type | Description |
|---|---|---|
| `super_admin` | Platform | SaaS platform owner — sees all syndicates |
| `syndicate_admin` | Operational | Full manager of a specific syndicate |
| `president` | Elected | Elected president of the syndicate council |
| `treasurer` | Elected | Elected treasurer of the syndicate council |
| `secretary` | Appointed | Secretary (documents, minutes, archives) |
| `committee_member` | Elected | Elected council member (syndic) |
| `member` | Resident | Co-owner / propriétaire d'un lot |
| `tenant` | Resident | Renter / locataire |

---

## Phase 1 — Role-by-Role Analysis

### 1. `super_admin` (Platform Owner)

**Current access:**
- Admin section: Tableau National, Users, Create Syndicate, Audit Journal, Global Stats, Marketplace Moderation, Template Studio
- Full supervision of all syndicates
- Can sign documents, manage subscriptions

**Expected in real Moroccan syndicate SaaS:**
- ✅ Platform-wide analytics dashboard
- ✅ Syndicate creation/management
- ✅ User management
- ✅ Template management
- ✅ Audit logs

**Issues:**
- ❌ Finance tab shows `super_admin` the full financial view but `super_admin` should NOT be a financial operator — this is supervision only
- ❌ `super_admin` can sign syndicate documents (POST /documents/:id/sign) — platform owner should not be a signatory for individual syndicate operations
- ⚠️ Settings screen only visible to `super_admin` and `syndicate_admin` — correct for operational settings

**Verdict: 85/100 — Minor scoping issues**

---

### 2. `syndicate_admin` (Operational Manager)

**Current access:**
- Full access to Buildings, Lots, Members, Finance, Governance, Maintenance, Documents, Marketplace, Chat, Reports

**Expected in real Moroccan syndicate:**
- ✅ Full operational control
- ✅ Financial management
- ✅ Member management
- ✅ Document management
- ✅ Meeting and AG management

**Issues:**
- ✅ Correctly scoped — no issues found

**Verdict: 95/100 — Well implemented**

---

### 3. `president` (Elected President)

**Current access:**
- Governance, Meetings, Elections, AG, PV, Transparency
- Maintenance (Travaux, Sinistres)
- Communication (Annonces, Publications, Chat, Ideas)
- Support, Reclamations
- NO finance access

**Expected in real Moroccan syndicate (Loi 18-00):**
- ✅ Governance and assembly management
- ✅ Decision signatures and PV signing
- ✅ Maintenance oversight
- ❌ MISSING: Finance visibility — President chairs AGs, approves budget, and MUST see financial reports even if not managing day-to-day
- ❌ MISSING: Document signing capability — President must sign PVs, AG minutes, official correspondence
- ❌ MISSING: Members list visibility — President needs to see full owner list for quorum calculations

**Verdict: 62/100 — Missing critical financial and document signing access**

---

### 4. `treasurer` (Elected Treasurer)

**Current access (More menu):**
- Tableau Bord Financier, Charges/Appels, Budget, Devis/Factures, Fiches Paie, Escalation, Bon Livraison
- Meetings, Elections, Governance, AG, PV
- Statistics

**CRITICAL BUG — Finance Tab:**
- `finance.tsx` defines `isAdmin = user.role === "super_admin" || user.role === "syndicate_admin"`
- Treasurer sees the **MEMBER view** on the Finance tab instead of the Admin/Management view
- This means treasurer gets the personal-finance UI instead of the management UI on that tab

**Expected in real Moroccan syndicate:**
- ✅ Full financial management
- ✅ Budget, charges, debt recovery
- ❌ CRITICAL: Finance tab shows wrong view to treasurer

**Verdict: 58/100 — Critical Finance tab bug breaks entire treasurer workflow**

---

### 5. `secretary` (Secretary)

**Current access:**
- Documents, Reglements, Actes Administratifs, Legal, Template Requests
- Meetings, AG, PV, Elections, Governance
- Communication: Publications, Chat, Messagerie Interne, Annonces
- Support

**Expected in real Moroccan syndicate:**
- ✅ Document management and archiving
- ✅ Minutes (PV) preparation
- ✅ Meeting logistics
- ✅ Communications
- ❌ MISSING: Secretary should also see Members list to prepare convocation letters with correct owner details

**Verdict: 78/100 — Good but missing member directory access**

---

### 6. `committee_member` (Council Member / Syndic)

**Current access:**
- Meetings, Elections, Governance, AG, PV
- Annonces (view)
- Support
- Profile, Notifications, CGU
- **NO Finance, NO Documents, NO Maintenance visibility**

**Expected in real Moroccan syndicate:**
- ✅ Meeting and election participation
- ✅ AG and governance visibility
- ❌ MISSING: Council members receive financial reports at AG — should see budget/charges
- ❌ MISSING: Committee members should see Documents section for official documents
- ❌ MISSING: No access to Publications (news/announcements)
- ❌ MISSING: Cannot access member directory despite needing it for council work

**Verdict: 40/100 — Severely under-served role**

---

### 7. `member` (Co-owner / Propriétaire)

**Current access:**
- Dashboard
- Finance: Charges/Appels, Cotisations, Payment History
- Governance: Meetings, Elections, AG, PV, Governance overview, Elected Members
- My Home: Mon Lot
- Support, Reclamations, Annonces
- Marketplace: browse (via product-detail route only — NOT via cart/orders/boutique)

**Expected in real Moroccan syndicate:**
- ✅ Vote in elections and AGs
- ✅ Pay charges and view payment history
- ✅ View documents relevant to them
- ✅ File complaints and maintenance requests
- ❌ MISSING: Cannot browse marketplace or add to cart — only admins can access cart/orders
- ❌ MISSING: Cannot see Publications/news — members should see syndicate news
- ❌ MISSING: Cannot use Chat — only management team can chat
- ❌ MISSING: Cannot submit Ideas — only admin and president can
- ❌ MISSING: Cannot view Documents section — major gap for a co-owner

**Verdict: 55/100 — Major gaps in document access, marketplace, and communication**

---

### 8. `tenant` (Renter / Locataire)

**Current access:**
- Dashboard
- My Home: Mon Bail, Etat des Lieux
- Maintenance: Travaux Privatifs, Parking
- Support, Annonces
- Payment History (paiements)
- Profile, Notifications

**Expected in real Moroccan syndicate:**
- ✅ Lease and apartment info
- ✅ File maintenance requests
- ✅ View community announcements
- ❌ MISSING: Cannot file complaints (Reclamations) — tenants file noise, damage, neighbor complaints
- ❌ MISSING: Cannot see Publications/news — residents should see building news
- ❌ MISSING: Cannot submit Ideas — tenants can suggest improvements in most syndicates
- ✅ Correctly blocked from Voting, Treasury, Governance administration

**Verdict: 68/100 — Missing complaints and communication access**

---

## Summary Table

| Role | Score | Critical Gaps |
|---|---|---|
| super_admin | 85 | Minor document signing scope issue |
| syndicate_admin | 95 | None |
| president | 62 | Finance visibility, document signing |
| **treasurer** | **58** | **CRITICAL: Finance tab shows wrong view** |
| secretary | 78 | Members list access |
| **committee_member** | **40** | **Documents, finance reports, publications** |
| member | 55 | Marketplace, documents, chat, publications, ideas |
| tenant | 68 | Reclamations, publications, ideas |
