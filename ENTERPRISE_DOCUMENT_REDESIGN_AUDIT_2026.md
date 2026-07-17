# SYNDYCAT — Enterprise Document Management System
# Complete Redesign Audit & Transformation Roadmap
## Version 3.0 — July 2026

---

> **Scope:** Full technical audit of the 32-template document engine (`documentPdf.ts`, `routes/documents.ts`, `lib/db/schema.ts`), covering signature architecture, logo pipeline, template design quality, DB-first field mapping, and page optimization.
>
> **Mandate:** Achieve Adobe Sign / DocuSign / SAP / Oracle ERP / Salesforce / Odoo Enterprise quality across every template.
>
> **Instruction:** Audit only. Do not start coding.

---

## TABLE OF CONTENTS

1. [Phase 1 — Root Cause Correction](#phase-1)
   - 1A. Signature Workflow Audit
   - 1B. Logo Pipeline Audit
2. [Phase 2 — Document Design System Assessment](#phase-2)
3. [Phase 3 — Template Family Redesign Roadmap](#phase-3)
4. [Phase 4 — Database-First Field Matrix (All 32 Templates)](#phase-4)
5. [Phase 5 — Page Optimization Analysis](#phase-5)
6. [Phase 6 — Per-Template Audit Cards](#phase-6)

---

<a name="phase-1"></a>
## PHASE 1 — ROOT CAUSE CORRECTION

---

### 1A. SIGNATURE WORKFLOW AUDIT

#### 1A.1 — Current Architecture (As-Built)

The signature lifecycle is implemented across three layers:

```
Mobile SignaturePad → POST /api/documents/:id/sign
  → INSERT documentSignaturesTable (SVG, signerName, signerRole, signatureOrder)
  → UPDATE documentsTable SET status='signed', signedAt=now
  → IF generationParams present:
      → regenerateDocumentWithSignatures() [fire-and-forget]
          → loads ALL entity data fresh from DB
          → calls generateAndUploadDocument() with all signatures
          → UPDATE documentsTable SET fileUrl=newUrl
  → ELSE (legacy fallback):
      → appendSignaturesToPdf() [fire-and-forget]
          → downloads existing PDF from GCS
          → appends a new signature page via pdf-lib
          → re-uploads to GCS
```

#### 1A.2 — Critical Problems Identified

**PROBLEM 1 — Fire-and-Forget Regeneration (CRITICAL)**

The regeneration is wrapped in `.then().catch()` after the HTTP response has already been sent:
```typescript
regenerateDocumentWithSignatures(doc, storedParams, allInlineSigs)
  .then(async (newFileUrl) => { /* update DB */ })
  .catch((err) => req.log.error({ err, docId: id }, "PDF inline signature regeneration failed"));
```

**Consequence:** The HTTP 200 response is returned immediately. If GCS is unavailable, the PDF regeneration silently fails. The document record shows `status: "signed"` but `fileUrl` still points to the old PDF showing "En attente de signature". There is no retry mechanism and no user-facing error.

**PROBLEM 2 — `generationParams` Not Always Populated (HIGH)**

`generationParams` is only saved if the POST /documents creation endpoint receives entity IDs (meetingId, lotId, etc.). Documents created by older code paths, created manually, or created before the `generationParams` column was added have `generationParams = NULL`. These documents fall into the legacy `appendSignaturesToPdf()` branch, which cannot inject SVG traces inline — it only appends a separate page.

**PROBLEM 3 — `_existingDocumentId` Not Auto-Triggered (MEDIUM)**

The `_existingDocumentId` field in the POST /documents creation schema is designed to load existing signatures when a document is regenerated via the creation endpoint (e.g., from the mobile template studio). However, it is NOT automatically triggered by the sign endpoint. It must be passed explicitly by the caller. This means the following scenario breaks:

> User signs → PDF regenerated with SVG → User opens document in app → App re-generates the document (e.g., for preview) WITHOUT passing `_existingDocumentId` → New PDF shows "En attente de signature" again.

**PROBLEM 4 — Signable Status Too Restrictive (MEDIUM)**

```typescript
const signable: DocStatus[] = ["generated", "validated"];
```

A document in `pending_review` status cannot be signed. But in practice, documents are often sent for review and then signed — the review IS the signature approval workflow. This forces admins to manually transition status before signing, adding unnecessary friction.

**PROBLEM 5 — No Status Rollback on Regeneration Failure (MEDIUM)**

If `regenerateDocumentWithSignatures()` fails after `status='signed'` has been committed, the document is permanently in `signed` status with a stale PDF. There is no compensation mechanism.

**PROBLEM 6 — SVG Validation Gap (LOW)**

`isSvgData()` validates the signature data before injection:
```typescript
function isSvgData(data: string | null | undefined): boolean {
  return /^\s*(?:<\?xml[^>]*>\s*)?<svg/i.test(data.trim());
}
```
But if a signer submits a non-SVG string (e.g., an empty string or garbage), it is silently treated as "no signature provided" — no error is returned to the signer. The signature row IS still inserted, but with no visual trace. The audit trail shows "signed" but no handwriting appears.

#### 1A.3 — Required Architecture (Target)

```
POST /api/documents/:id/sign
  ├── VALIDATE: document exists, user authorized, not already signed
  ├── VALIDATE: signatureData is valid SVG (if provided) — return 422 if invalid
  ├── TRANSACTION START:
  │     ├── INSERT documentSignaturesTable
  │     ├── UPDATE documentsTable SET status='pending_regeneration'
  │     └── TRANSACTION COMMIT
  ├── TRIGGER PDF REGENERATION (synchronous, awaited before response):
  │     ├── IF generationParams present → full regeneration
  │     ├── ELSE → appendSignaturesToPdf
  │     ├── ON SUCCESS → UPDATE documentsTable SET status='signed', fileUrl=newUrl
  │     └── ON FAILURE → UPDATE documentsTable SET status='signed', regenerationFailed=true
  │                       → PUSH notification to syndicate_admin: "PDF signature embedding failed"
  └── RETURN 200 with { signed: true, pdfReady: boolean }

Regeneration must be AWAITED before returning.
Status machine: add 'pending_regeneration' as an intermediate state.
`regenerationFailed` boolean flag on documentsTable for admin visibility.

generationParams must be enforced as NOT NULL for all new documents.
For legacy documents without generationParams: auto-reconstruct from
templateId + syndicateId + documentNumber at sign time.
```

#### 1A.4 — `_existingDocumentId` Auto-Propagation Fix

When the mobile app opens a document for preview/re-generation, the `_existingDocumentId` must be automatically passed. The fix:

- Store `documentId` in the document's own metadata so it's always self-referential
- The POST /documents endpoint should automatically pass `_existingDocumentId = doc.id` whenever `?mode=preview` or `?mode=update` is passed
- The mobile DocumentWizard must pass `_existingDocumentId` when opening an existing document

#### 1A.5 — Signature Status Display Fix

The header band already shows a `statusChipMap` with `signed: { label: "SIGNÉ", color: BRAND.primary }`. The PDF stamp also has `VALID` status. The bug is not in the design but in the pipeline: the old PDF is served before the new one is uploaded. The fix is synchronous regeneration (see 1A.3).

---

### 1B. LOGO PIPELINE AUDIT

#### 1B.1 — Current Architecture (As-Built)

```
syndicatesTable.logoUrl (TEXT, nullable)
  → NULL → acronym initials badge (no image)
  → "/objects/uploads/<uuid>" → fetchLogoDataUrl()
       → PRIVATE_OBJECT_DIR not set → throw → catch → return null → initials
       → PRIVATE_OBJECT_DIR = "gs://" → GCS download → buffer → base64 dataUrl
       → PRIVATE_OBJECT_DIR = local path → fs.readFile() → buffer → base64 dataUrl
  → "https://..." → fetch(url, 10s timeout) → buffer → base64 dataUrl

detectImageMime(buffer):
  → PNG magic bytes → "image/png"
  → JPEG magic bytes → "image/jpeg"
  → anything else (SVG, WebP, GIF) → null → silently drop → initials

Cache: in-memory Map, TTL 5 minutes (lost on server restart)
```

#### 1B.2 — Critical Problems Identified

**PROBLEM 1 — GCS Auth Failure → Silent Fallback (CRITICAL)**

When the GCS sidecar token exchange fails (the "no allowed resources" auth issue documented in memory), `fetchLogoDataUrl()` catches the error, caches `null`, and silently returns `null`. The admin has no indication the logo failed to load — they see initials and think their logo wasn't uploaded.

**PROBLEM 2 — PRIVATE_OBJECT_DIR Not Set in Production (HIGH)**

If `PRIVATE_OBJECT_DIR` is not configured in the environment (missing secret), the code throws `"PRIVATE_OBJECT_DIR not set"`. This is caught and returns `null`. No alert is raised. The PDF silently shows initials.

**PROBLEM 3 — SVG Logo Not Supported (HIGH)**

`detectImageMime()` returns `null` for SVG buffers. Many logos are SVG. The current code explicitly cannot embed SVGs because pdfmake uses `PDFKit` which cannot render raw SVG. This is a fundamental constraint but it is not surfaced to the user during upload. Admins uploading SVG logos get initials with no explanation.

**PROBLEM 4 — WebP Not Supported (MEDIUM)**

`detectImageMime()` only handles PNG and JPEG. WebP, GIF, and other modern formats silently fall back to initials. This is undocumented.

**PROBLEM 5 — Cache Not Persisted Across Restarts (MEDIUM)**

The in-memory cache is lost on every server restart. In Replit's environment, the server restarts frequently. This means every restart forces a fresh GCS fetch for every logo — adding latency and increasing GCS request costs.

**PROBLEM 6 — Logo Upload Flow Has No Format Validation (MEDIUM)**

The avatar upload route (`PUT /profile` or similar) does not validate that uploaded images are PNG or JPEG before storing them. An admin can upload an SVG or WebP logo, it gets stored to GCS, and then every PDF generation silently falls back to initials.

**PROBLEM 7 — No Logo Health Check in Syndicate Settings (LOW)**

There is no API endpoint or UI indicator that confirms the logo is rendering correctly in PDFs. Admins only discover the problem when they download a generated PDF.

#### 1B.3 — Required Architecture (Target)

```
UPLOAD PHASE:
  PUT /api/syndicates/:id/logo
    → Accept: PNG, JPEG only (reject SVG/WebP/GIF with 415)
    → Resize/optimize to max 200×200px, max 150KB
    → Convert to PNG if JPEG (single format in storage)
    → Store to GCS
    → UPDATE syndicatesTable SET logoUrl = "/objects/..."
    → Bust logo cache entry for this syndicate
    → Return { logoUrl, previewUrl, warning?: "SVG logos are not supported — converted to PNG" }

RETRIEVAL PHASE:
  fetchLogoDataUrl(logoUrl):
    → Check in-memory cache (5 min TTL)
    → Check Redis cache if available (30 min TTL, survives restarts)
    → GCS/local fetch with retry (3 attempts, exponential backoff)
    → detectImageMime — support PNG, JPEG
    → Return base64 dataUrl OR null with logged structured error
    → Never silently fail: log { syndicateId, logoUrl, error } as WARN

PDF RENDER PHASE:
  buildHeaderBand(..., logoDataUrl):
    → IF logoDataUrl → embed as 42×42 image in accent-bg column
    → IF null AND logoUrl was non-null → log "logo_render_fallback" metric
    → IF null → acronym initials badge (current behavior, correct for no-logo case)

HEALTH CHECK:
  GET /api/syndicates/:id/logo-health
    → Returns { logoUrl, canRender: boolean, format: string, sizePx: [w, h], warning?: string }
    → Used by mobile syndicate settings screen to show logo preview status

LOGO CACHE:
  logoCache: Map → extend to include Redis with TTL 30min
  Bust cache on: logo upload, syndicate update
  Warm cache on: server startup for all syndicates with non-null logoUrl
```

---

<a name="phase-2"></a>
## PHASE 2 — DOCUMENT DESIGN SYSTEM ASSESSMENT

### Current State Assessment

The current system has a sophisticated foundation:
- ✅ Single-source BRAND token system (zero raw hex outside the block)
- ✅ 10 document families with distinct accent colors
- ✅ Document theme system (33 theme entries)
- ✅ 5-level typography hierarchy (display → docTitle → docSubtitle → docRef → subsectionTitle)
- ✅ Enterprise header band (3-column: logo | identity | ref+QR)
- ✅ Official seal (rectangular institutional stamp, double-border)
- ✅ Family-specific visual openers (certificateFrame, governanceBanner, legalAlertBanner, meetingBanner)
- ✅ SAP/Oracle-grade metaTable component (2-column card grid, 4px left accent bar)
- ✅ contentSection with tinted header band
- ✅ Financial KPI dashboard (multi-source DB aggregation)
- ✅ QR verification + footer legal note
- ✅ Multi-language support (FR/AR/EN/ES)
- ✅ Watermark for draft/specimen status

### Design Gap Analysis

| Component | Current Score | Problem | Target Score |
|---|---|---|---|
| Header band | 82/100 | Logo col too narrow (64pt), QR 34×34 is small | 92/100 |
| Official seal | 78/100 | Acronym 24pt is bold but stamp feels lightweight | 88/100 |
| Certificate frame | 70/100 | Double-rule framing is minimal, needs ornate border | 88/100 |
| metaTable cards | 85/100 | Cards look excellent; card height 40pt could be 44pt | 92/100 |
| contentSection | 80/100 | Tinted band width 4px left bar is good; body text 10.5pt at 1.7 lineHeight | 88/100 |
| Financial tables | 75/100 | Column widths not always optimal for MAD amounts | 87/100 |
| Signature block | 72/100 | SVG traces render well; pending box too large | 85/100 |
| Typography | 80/100 | 5-level hierarchy correct; docTitle 19pt could be 20pt | 90/100 |
| Color system | 90/100 | BRAND tokens excellent; families well-differentiated | 95/100 |
| Page margins | 75/100 | 40pt margins may be slightly wide for A4 | 85/100 |

### Design System Targets

#### Typography Scale (Enterprise Grade)
```
displayTitle:    24pt  bold   — certificate hero title (currently 23pt)
docTitle:        20pt  bold   — primary document title (currently 19pt)
docSubtitle:     10pt  italic — subtitle / subject line
sectionTitle:     9pt  bold   — section heading (correct)
metaKey:          7pt  bold   — card label (currently 6.5pt)
metaVal:         11pt  bold   — card value (correct)
body:            10.5pt       — body text (correct)
tableHeader:      9pt  bold   — table header (correct)
tableCell:        9.5pt       — table cell (correct)
footer:           6.5pt       — footer (correct)
```

#### Spacing Philosophy
- Page margins: 36pt (currently implicit from pdfmake default ~40pt)
- Section gap: 16pt after each contentSection
- metaTable bottom margin: 16pt
- Header band bottom margin: 12pt
- Signature area top margin: 28pt minimum
- Between signature columns: 24pt gap

#### Family Visual Identity Differentiation (Required)

Each document family must have a unique visual opener beyond the theme color:

| Family | Current Opener | Target Opener |
|---|---|---|
| Certification (attestation, certificat) | Simple double-rule frame | Ornate official border with embossed seal impression + laurel motif |
| Financial (rapport_financier, budget, facture) | Premium title band + KPI grid | Bloomberg/SAP terminal header — dark accent band, KPI strip, status gauges |
| Meeting (pv, convocation, compte_rendu) | tinted meeting banner | Parliament session banner — quorum indicator, session type badge, gavel icon |
| Legal enforcement (mise_en_demeure) | Red alert band | REGISTERED MAIL header — red border, urgency tier badge, deadline countdown |
| Governance (decision, rapport_election) | Governance banner | Resolution header — vote tally badge, quorum chip, authority seal |
| Operational (travaux, sinistre) | (none currently) | Project Gantt opener — status timeline bar, priority badge, assigned provider |
| Contract (contrat, contrat_bail) | Simple metaTable | Law firm brief opener — parties block, notarial reference, clause numbering |
| Administrative (demande, autorisation, ordre) | Simple metaTable | Ministry-style letterhead opener — reference strip, classification badge |

---

<a name="phase-3"></a>
## PHASE 3 — TEMPLATE FAMILY REDESIGN ROADMAP

### FAMILY 1: ATTESTATIONS / CERTIFICATES

**Templates:** `attestation`, `attestation_residence`, `attestation_propriete`, `attestation_paiement`, `certificat`

**Current Problem:** All 5 use the same `buildCertificateFrame()` opener (double-rule with "DOCUMENT OFFICIEL CERTIFIÉ" label). The only differentiation is the accent color (successDark for all certification family). At a glance, they are visually indistinguishable.

**Target:** Each attestation must feel like a different OFFICIAL DOCUMENT CLASS:

#### `attestation` (Attestation d'Adhésion)
- **Current structure:** Identity strip (4 cells) → Grand title block → Member profile card (2-col: avatar+contact | data grid) → Certification block → Signature area
- **Assessment:** This is the best-designed template in the system. The 2-column member profile card with circular avatar is premium quality.
- **Target refinements:** Add membership card visual (credit-card-style member card embedded below the profile grid) + holographic strip effect at top of certification block. Add "NUMÉRO DE MEMBRE" as a QR-scannable badge.
- **Target score: 87/100**

#### `attestation_residence`
- **Current structure:** Basic certificationFrame → metaTable (member, lot, building) → contentSection → signatureBlock
- **Problem:** Generic layout. Does not distinguish between residence and membership. No property image or map reference.
- **Target:** Property card (building name large, address, titre foncier prominent) + confirmed resident badge + legal residence clause from Loi 18-00 + city administration format.
- **Target score: 84/100**

#### `attestation_propriete`
- **Current structure:** Same as attestation_residence with different field labels.
- **Problem:** Identical visual structure to residence attestation. No property ownership visualization.
- **Target:** Title page format — "TITRE DE PROPRIÉTÉ SYNDICALE" header, full property details (lot number, tantiemes, surface, titre foncier), 3-column ownership strip (owner | lot | syndicate). Notarial-style paragraph format.
- **Target score: 86/100**

#### `attestation_paiement`
- **Current structure:** certificationFrame → metaTable (member, lot, amount, period) → payment breakdown table → signatureBlock
- **Problem:** Looks like a receipt form, not a bank-grade payment certificate. No payment history timeline.
- **Target:** Payment certificate format. Top: confirmation badge ("PAIEMENTS EN RÈGLE"). Middle: period summary (charged vs paid vs outstanding, progress bar). Bottom: payment history table (date, amount, method, receipt#). DocuSign-style completion indicator.
- **Target score: 88/100**

#### `certificat`
- **Current structure:** buildCertificateFrame → large certificate title → metaTable → contentSection → signatureBlock
- **Problem:** Most generic template. Body text is a boilerplate fallback.
- **Target:** Diploma/award format. Large bordered certificate with ornate corners, centered honoree name in display type, certification paragraph centered in italic, official seal centered below text.
- **Target score: 82/100**

---

### FAMILY 2: FINANCIAL DOCUMENTS

**Templates:** `rapport_financier`, `appel_de_fonds`, `recu_paiement`, `facture`, `budget_previsionnel`, `decompte_charges`

**Current Problem:** Good DB integration (KPI aggregation from appelsDeFondsTable, caisseEntriesTable, budgetsTable), but visual presentation is not enterprise ERP grade. Tables are functional but not Bloomberg/SAP terminal quality.

#### `rapport_financier`
- **Current structure:** Premium title band → metaTable (exercice, building, period, dates) → KPI dashboard (4 cards) → collection rate progress bar → revenue/expenses table → budget consumption → outstanding debts → signatures
- **Assessment:** The most sophisticated template. KPI cards and progress bars are enterprise quality.
- **Problem:** KPI card height is small; no executive summary paragraph; no month-by-month breakdown chart (text-based only); signatory block is too simple.
- **Target:** Add executive summary section. Replace text-based breakdown with a pdfmake data table showing month × [budgeted, charged, collected] with column totals. Add "TAUX DE RECOUVREMENT" as a full-width gauge bar. Add CFO approval signature block.
- **Target score: 89/100**

#### `appel_de_fonds`
- **Current structure:** certificationFrame → metaTable → amount display → payment methods list → due date warning box → signatureBlock
- **Problem:** Looks like a form letter. Amount is not prominently displayed. No account details for bank transfer. No payment history showing prior appels.
- **Target:** Invoice-style layout. Top third: issuer (syndicate) + recipient (member/lot) in 2-column. Middle: large amount display with accent background. Bottom: payment instructions table (bank, IBAN, reference). Footer: payment slip / détachable bulletin de versement. DocuSign-style tracking timeline (issued → due → paid).
- **Target score: 87/100**

#### `recu_paiement`
- **Current structure:** certificationFrame → metaTable → amount/date/method → certification block → signatureBlock
- **Problem:** Does not look like a receipt. No receipt number prominently displayed. No carbon copy layout.
- **Target:** Official receipt format. Header: "REÇU DE PAIEMENT N° [receipt#]" in large type with accent background. Body: 2-column payer/receiver blocks. Large amount in box. Payment details. QR code for verification. Tear-off style bottom strip with mini-summary.
- **Target score: 88/100**

#### `facture`
- **Current structure:** metaTable (invoice ref, recipient, amount, dates) → invoice line items table → totals → signatureBlock
- **Problem:** Line items table exists but formatting is basic. No subtotal/tax/total breakdown. No bank payment details. No IBAN. No "FACTURE PROFORMA" vs "FACTURE DÉFINITIVE" distinction.
- **Target:** Full professional invoice format. Issuer block (syndicate letterhead). Recipient block (member details). Item table (qty × unitPrice × subtotal, with column headers in accent). Totals block (HT, TVA if applicable, TTC). Payment terms box. IBAN/bank details. Stamp + signature. Legal notes (late payment penalties).
- **Target score: 91/100**

#### `budget_previsionnel`
- **Current structure:** metaTable → budget summary (total, charges, reserve, fonds travaux) → detailed line items table → completion indicators → signatureBlock
- **Problem:** Good DB integration. But no chart equivalents. No comparison to prior year. No approval workflow reference.
- **Target:** ERP budget report format. Header: fiscal year + status badge (approved/draft). Section 1: Summary KPI strip (4 metrics: total budget, charges amount, fonds réserve, fonds travaux). Section 2: Category breakdown table with % share column + trend arrow. Section 3: Month-by-month distribution table (if available). Footer: Board approval signatures (3-column: treasurer + president + secretary).
- **Target score: 89/100**

#### `decompte_charges`
- **Current structure:** metaTable (lot, exercice, member) → charges breakdown → provisional vs actual comparison → settlement status → signatureBlock
- **Problem:** The calculation (tantièmes ratio applied to building expenses) is sophisticated but the presentation is a wall of numbers. No visual comparison.
- **Target:** Statement of account format. Header: lot number + owner + period. Section 1: Provisions versées table (period × amount × status). Section 2: Charges réelles (estimated, per tantièmes). Section 3: Régularisation (balance/crédit due). Color coding: green for credit, red for debit. Formal "À PAYER" or "À REMBOURSER" box with amount highlighted.
- **Target score: 87/100**

---

### FAMILY 3: MEETINGS / GOVERNANCE

**Templates:** `pv`, `convocation`, `compte_rendu`, `decision`, `rapport_election`, `circulaire`, `note_interne`

#### `pv` (Procès-Verbal)
- **Current structure:** meetingBanner → metaTable (date, syndicate, location, chairperson, secretary) → agenda text → deliberations text → resolutions text → multiSignatoryBlock
- **Assessment:** Strong foundation. DB integration (meetingsTable, attendees, agResolutionsTable) is excellent. Resolutions include vote tallies.
- **Problem:** Resolutions are text blocks, not structured resolution cards. No attendance sheet. No quorum indicator.
- **Target:** Parliamentary format. Header: session identity banner (type + quorum chip: X/Y membres). Attendance: 2-column list with checkboxes (present/absent/proxy). Agenda: numbered list with resolution status badges (ADOPTÉ ✓ / REJETÉ ✗ / AJOURNÉ ⟳). Each resolution: number, title, vote tallies (pour/contre/abstention), result badge. Multi-signatory block with SVG traces.
- **Target score: 90/100**

#### `convocation`
- **Current structure:** meetingBanner → metaTable (recipient, lot, building, sender, dates, location, time) → body text → legal notice box → signatureBlock
- **Problem:** Does not include agenda preview. No map/location details. No RSVP mechanism.
- **Target:** Official summons format. Two-column header: sender (syndicate) + date/ref on right. Recipient block (named, address, lot). Meeting details card (date, time, location, type). Agenda preview table (numbered items). Legal notice box (droit de représentation/proxy). Detachable attendance slip at bottom.
- **Target score: 85/100**

#### `compte_rendu`
- **Current structure:** metaTable → section (déroulement) → section (points abordés) → section (décisions) → signatureBlock
- **Problem:** Generic sections. No visual distinction from a PV. No attendance count.
- **Target:** Meeting minutes format. Session opener strip. Present / absent / excused counts as KPI chips. Structured agenda items with sub-bullets. Decisions section with action items table (action | responsible | deadline). Approval chain.
- **Target score: 83/100**

#### `decision`
- **Current structure:** governanceBanner → metaTable → "Vu et considérant" section → "Décide" section → validity notice → signatureBlock
- **Problem:** Lacks the gravitas of an official decision document. No reference to enabling meeting or resolution.
- **Target:** Official resolution format. Top bar: "RÉSOLUTION N° [docNum] — [date]" in accent band. "VU ET CONSIDÉRANT" in styled legal preamble format. "IL EST DÉCIDÉ" in large display text. Numbered articles. Effectiveness date box. 3-column approval (decision-making body, president signature, notation).
- **Target score: 86/100**

#### `rapport_election`
- **Current structure:** governanceBanner → metaTable → election stats (eligible, participants, quorum) → candidates table → winners section → mandates section → signatureBlock
- **Assessment:** Excellent DB integration (electionsTable, candidatesTable, vote counts, quorum calculation).
- **Problem:** Stats are in metaTable cards, not KPI format. Candidate results are text bullets, not a proper results table with vote bars.
- **Target:** Official election results format. Header: election title + status badge. KPI strip: eligible voters | participants | participation rate | quorum (✓/✗). Candidate results table: rank | name | votes | % | elected status (color-coded). Mandate list (elected candidates + term duration). Certification paragraph + signatures.
- **Target score: 91/100**

#### `circulaire`
- **Current structure:** metaTable (to, from, date, ref, subject, priority) → message section → notice → signatureBlock
- **Problem:** Looks exactly like a note_interne. Circular should feel like a broadcast communication, not an internal memo.
- **Target:** Broadcast memo format. Bold header strip with "CIRCULAIRE N° [num]" and "DIFFUSION GÉNÉRALE". Recipient: "À TOUS LES MEMBRES DU SYNDICAT". Priority badge (NORMALE/URGENT/CRITIQUE). Body. Required action box if applicable. Acknowledgment notice.
- **Target score: 80/100**

#### `note_interne`
- **Current structure:** metaTable (to, from, date, subject, priority) → message → optional action required box → footer notice
- **Problem:** Missing signature. No distinction between administrative notes and management memos.
- **Target:** Internal memo format (Inter-Office Memo style). Clean header. Confidentiality classification badge (INTERNE/CONFIDENTIEL). Message body with clear paragraph breaks. Action items table if required. Response deadline if applicable. Sender signature.
- **Target score: 78/100**

---

### FAMILY 4: LEGAL DOCUMENTS

**Templates:** `contrat`, `contrat_bail`, `mise_en_demeure`, `lettre_officielle`, `reglement`

#### `contrat`
- **Current structure:** metaTable (ref, date, parties, subject) → preamble section → clauses section → signatureBlock
- **Problem:** No clause numbering. No article structure. One generic "clauses" section for everything. No paraph lines.
- **Target:** Law firm brief format. Parties block (2-column: Party 1 | Party 2 with full legal details). Numbered articles with proper legal cross-references. Each article has title + body. Execution page with date/location + witness block + parties signatures.
- **Target score: 84/100**

#### `contrat_bail`
- **Current structure:** metaTable (bailleur, locataire, lot, rent, dates) → bailleur section → locataire section → lease clauses → specific terms → rent section → obligations → signatureBlock
- **Assessment:** Most detailed template. Multiple sections. Good DB integration (tenantsTable, lotsTable).
- **Problem:** Long multi-page document but no table of contents. Section breaks are not visually distinct enough. Rent increase clause and deposit section need dedicated boxes.
- **Target:** Full rental agreement format. Page 1: Cover page (parties, property, key terms summary). Pages 2+: Numbered articles with headers. Rent section: large rent amount box, charges breakdown, deposit receipt. Special conditions box. Paraph space on each page. Execution page with witness.
- **Target score: 88/100**

#### `mise_en_demeure`
- **Current structure:** buildLegalAlertBanner (red) → metaTable (recipient, sender, date, ref, mode d'envoi) → body section → deadline warning box (red) → consequences section → signatureBlock
- **Assessment:** Strong visual design. The red alert banner and deadline box are visually appropriate.
- **Problem:** Missing required legal elements: debt amount, account details for payment, specific law articles referenced, certified mail receipt reference.
- **Target:** Legal enforcement notice format. Add: debt amount in red highlight box. Bank payment instructions. Legal references (articles of loi 18-00 or relevant code). 30-day deadline countdown (calculated from issue date). Certified mail notice. Avocat/huissier contact option.
- **Target score: 87/100**

#### `lettre_officielle`
- **Current structure:** 2-column sender/recipient header → subject line → salutation → body → closing → signatureBlock
- **Problem:** Classic letter format is correct in principle, but the header uses fontSizes (11pt/9pt) without the accent color system. No reference block. No attachments list.
- **Target:** Law firm letterhead format. Left: syndicate header with colored stripe. Right: recipient + date + references. Subject bold and underlined. Formal body. Closing formula. Attachments list at bottom. Signature with full title.
- **Target score: 82/100**

#### `reglement`
- **Current structure:** 4 multilingual sections (objet, description, charges, administration) → signatureBlock
- **Problem:** The most important legal document in the system (Règlement de Copropriété), but body content is all placeholder text. No article numbering. No table of contents. No annexes.
- **Target:** Statutory document format. Cover page: property name + legal description + adoption date. Table of contents. Numbered titles → chapters → articles. Each article: bold title + body text. Annexes: tantièmes table (lots × floors × % share). Adoption page: date + signatures of all founding members.
- **Target score: 86/100**

---

### FAMILY 5: ADMINISTRATIVE DOCUMENTS

**Templates:** `demande_administrative`, `autorisation`, `ordre_de_mission`, `rapport`, `rapport_audit`, `rapport_activite`

#### `demande_administrative`
- **Problem:** Simple form layout. No tracking reference. No status workflow indicator.
- **Target:** Administrative request form. Reference number + tracking QR. Requester identity card. Request body. Required attachments checklist. Response deadline. Administrative decision section (to be filled upon processing). Date received stamp.
- **Target score: 80/100**

#### `autorisation`
- **Problem:** Authorisation is valid but the "✓ AUTORISATION VALIDE" box is too simple.
- **Target:** Official permit format. Authorization number (prominently displayed). Validity dates as prominent calendar block. Conditions table. Photo/ID reference field. Revocation conditions. Official stamp.
- **Target score: 82/100**

#### `ordre_de_mission`
- **Problem:** Missing budget allocation line. No travel schedule. No return confirmation section.
- **Target:** Mission order format. Missionaire identity card. Mission objective. Destination + dates as travel strip. Budget allocation table. Required approvals (hierarchical). Return confirmation section.
- **Target score: 81/100**

#### `rapport` / `rapport_activite`
- **Problem:** Nearly identical templates. Generic section structure (synthèse, activités, indicateurs, perspectives).
- **Target:** Executive report format. Cover section: period + author + approval status. Executive summary box. Activities section with numbered items. KPI table (indicator | target | actual | status). Recommendations section. Next steps table (action | responsible | date).
- **Target score: 80/100**

#### `rapport_audit`
- **Problem:** Same visual structure as rapport_financier but without KPI data.
- **Target:** Audit report format. Audit scope statement. Risk matrix (severity × probability). Findings table (finding | severity | recommendation | deadline). Compliance score indicator. Auditor certification.
- **Target score: 83/100**

---

### FAMILY 6: OPERATIONAL DOCUMENTS

**Templates:** `travaux`, `sinistre`

#### `travaux`
- **Current structure:** metaTable (type, title, priority, status, provider, dates, amounts) → description section → timeline → budget table → status box → signatureBlock
- **Assessment:** Good DB integration (travauxTable, prestatairesTable). Priority and status displayed. Budget with phases.
- **Problem:** No visual status timeline. Priority badge not visually prominent. Provider contact details not displayed. No photo attachment placeholder.
- **Target:** Project management format. Header: work order number + priority badge (URGENT/HAUTE/NORMALE) + status badge. Provider card (name, contact, license number). Work description with scope. Budget table (estimated | approved | invoiced | paid). Phase timeline (4 bars: submitted | approved | in progress | completed). Inspection notes section. Sign-off by resident + provider + manager.
- **Target score: 86/100**

#### `sinistre`
- **Current structure:** metaTable (type, claimNumber, building, date, status, urgency) → description section → insurance details → damage table → timeline → response section → signatureBlock
- **Assessment:** Comprehensive DB integration (sinistresTable, buildingsTable). Damage table with costs.
- **Problem:** No photo documentation section. No insurance company contact. No claim tracking number prominently displayed.
- **Target:** Insurance claim format. Claim number as main identifier (large, prominent). Incident details card (date, type, location, urgency). Damage description. Cost estimate table. Insurance company details + policy number. Witness list. Declaration truth statement. Claimant + syndicate signatures.
- **Target score: 85/100**

---

### FAMILY 7: PARTNERSHIP DOCUMENTS

**Templates:** `convention_partenariat`, `accord_collectif`

#### `convention_partenariat`
- **Problem:** Basic contract format. No governance structure for the partnership.
- **Target:** Partnership agreement format. Parties block. Purpose + scope. Governance (steering committee). Obligations matrix (Party A | Party B). Financial terms. Duration + renewal. Exit clauses. Signatures.
- **Target score: 80/100**

#### `accord_collectif`
- **Problem:** Entry into force date prominent but no employee/member coverage definition.
- **Target:** Collective agreement format (Odoo HR style). Scope of coverage. Key terms table. Benefit schedule. Amendment procedure. Union/representative signatures.
- **Target score: 78/100**

---

<a name="phase-4"></a>
## PHASE 4 — DATABASE-FIRST FIELD MATRIX (ALL 32 TEMPLATES)

### Legend
- **AUTO** = automatically populated from DB (no user input required)
- **SEMI** = pre-filled from DB, user can override
- **MANUAL** = requires user input
- **ENTITY** = requires entity selection (meeting picker, lot picker, etc.)

---

### ATTESTATION D'ADHÉSION (`attestation`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Member name | `membersTable.name` | AUTO via memberId | ✅ |
| Member email | `membersTable.email` | AUTO | ✅ |
| Member phone | `membersTable.phone` | AUTO | — |
| CIN | `usersTable.cin` (by email lookup) | AUTO | — |
| Membership number | `membersTable.id` (formatted as ADH-XXXXXXXX) | AUTO | ✅ |
| Member status | `membersTable.status` | AUTO | ✅ |
| Join date | `membersTable.joinDate` | AUTO | — |
| Cotisation status | `membersTable.cotisationStatus` | AUTO | — |
| Lot number | `lotsTable.number` | AUTO via ownerId | — |
| Lot floor | `lotsTable.floor` | AUTO | — |
| Lot surface | `lotsTable.surfaceM2` | AUTO | — |
| Building name | `buildingsTable.name` | AUTO | — |
| Building address | `buildingsTable.address, city` | AUTO | — |
| Syndicate name | `syndicatesTable.name` | AUTO via syndicateId | ✅ |
| Document title | — | MANUAL | ✅ |
| President name | `conseilSyndicalTable` (role=president) | AUTO via officeHolders | — |
| Secretary name | `conseilSyndicalTable` (role=secretary) | AUTO via officeHolders | — |

**Currently missing from DB auto-fill:** Profession (membersTable lacks profession — add column), nationality (add column).

---

### ATTESTATION DE RÉSIDENCE (`attestation_residence`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Member name | `membersTable.name` | AUTO via memberId | ✅ |
| Lot number | `lotsTable.number` | AUTO | ✅ |
| Building name | `buildingsTable.name` | AUTO | ✅ |
| Building address | `buildingsTable.address + city` | AUTO | ✅ |
| Titre foncier | `lotsTable.titreFoncier` | AUTO | — |
| Tantiemes | `lotsTable.tantiemes` | AUTO | — |
| Residence since | `tenantsTable.leaseStart` OR `membersTable.joinDate` | AUTO | SEMI |
| Document title | — | MANUAL | ✅ |
| Purpose of attestation | — | MANUAL | — |

---

### ATTESTATION DE PROPRIÉTÉ (`attestation_propriete`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Owner name | `membersTable.name` | AUTO via lotId.ownerId | ✅ |
| Lot number | `lotsTable.number` | AUTO | ✅ |
| Lot type | `lotsTable.type` | AUTO | — |
| Surface | `lotsTable.surfaceM2` | AUTO | ✅ |
| Floor | `lotsTable.floor` | AUTO | — |
| Tantiemes | `lotsTable.tantiemes` | AUTO | ✅ |
| Titre foncier | `lotsTable.titreFoncier` | AUTO | ✅ |
| Building name | `buildingsTable.name` | AUTO | ✅ |
| Building address | `buildingsTable.address + city` | AUTO | ✅ |
| Syndicate name | `syndicatesTable.name` | AUTO | ✅ |
| Registration number | `syndicatesTable.registrationNumber` | AUTO | — |
| Acquisition date | — | MANUAL | — |

---

### ATTESTATION DE PAIEMENT (`attestation_paiement`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Member name | `membersTable.name` via lot.ownerId | AUTO | ✅ |
| Lot number | `lotsTable.number` | AUTO | ✅ |
| Period | `appelsDeFondsTable.period` | SEMI | ✅ |
| Total charged | `appelsDeFondsTable.amount` (sum) | AUTO | ✅ |
| Total paid | `appelsDeFondsTable` (status=paid, sum) | AUTO | ✅ |
| Last payment date | `appelsDeFondsTable.paidDate` (latest) | AUTO | — |
| Payment methods | `appelsDeFondsTable.paymentMethod` | AUTO | — |
| Outstanding balance | calculated: charged - paid | AUTO | ✅ |
| Receipt numbers | `appelsDeFondsTable.receiptNumber` | AUTO | — |
| Document title | — | MANUAL | ✅ |

---

### PROCÈS-VERBAL (`pv`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Meeting title | `meetingsTable.title` | AUTO via meetingId | ✅ |
| Meeting date | `meetingsTable.date` | AUTO | ✅ |
| Meeting time | `meetingsTable.time` | AUTO | — |
| Location | `meetingsTable.location` | AUTO | — |
| Meeting type | `meetingsTable.type` | AUTO | ✅ |
| Agenda text | `meetingsTable.agenda` | AUTO | SEMI |
| Deliberations | `meetingsTable.description` | AUTO | SEMI |
| Resolutions | `agResolutionsTable` (all for meetingId) | AUTO | AUTO |
| Attendees | `meetingAttendeesTable + usersTable.name` | AUTO | AUTO |
| Chairperson | `conseilSyndicalTable` (role=president) | AUTO | SEMI |
| Secretary | `conseilSyndicalTable` (role=secretary) | AUTO | SEMI |

**Currently missing:** Attendance count / quorum verification (total members vs present). Add: `membersTable` count for syndicateId as quorum denominator.

---

### CONVOCATION (`convocation`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Meeting date | `meetingsTable.date` | AUTO via meetingId | ✅ |
| Meeting time | `meetingsTable.time` | AUTO | ✅ |
| Location | `meetingsTable.location` | AUTO | ✅ |
| Meeting type | `meetingsTable.type` | AUTO | ✅ |
| Agenda | `meetingsTable.agenda` | AUTO | SEMI |
| Recipient name | `membersTable.name` | AUTO via memberId | SEMI |
| Lot number | `lotsTable.number` | AUTO | — |
| Building name | `buildingsTable.name` | AUTO | — |
| Sender | `syndicatesTable.name` | AUTO | ✅ |
| President name | `conseilSyndicalTable` (president) | AUTO | SEMI |

---

### CONTRAT (`contrat`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Party 1 (syndicate) | `syndicatesTable.name + address` | AUTO | ✅ |
| Party 2 (member/provider) | `membersTable.name` OR `prestatairesTable.name` | AUTO via memberId | SEMI |
| Contract date | — | AUTO (today) | ✅ |
| Contract subject | — | MANUAL | ✅ |
| Contract clauses | — | MANUAL | ✅ |
| President name | `conseilSyndicalTable` (president) | AUTO | SEMI |

---

### RAPPORT FINANCIER (`rapport_financier`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Fiscal year | form input OR `budgetsTable.year` | SEMI | ✅ |
| Building | `buildingsTable.name` | AUTO via buildingId | SEMI |
| Total charged | `appelsDeFondsTable` (sum by building) | AUTO | ✅ |
| Total paid | `appelsDeFondsTable` (paid, sum) | AUTO | ✅ |
| Outstanding | calculated | AUTO | ✅ |
| Collection rate % | calculated | AUTO | ✅ |
| Cash balance | `caisseEntriesTable` (credit - debit) | AUTO | ✅ |
| Total revenue | `caisseEntriesTable` (credit sum) | AUTO | ✅ |
| Total expenses | `caisseEntriesTable` (debit sum) | AUTO | ✅ |
| Budget total | `budgetsTable.totalAmount` | AUTO | — |
| Budget charges | `budgetsTable.chargesAmount` | AUTO | — |
| Budget reserve | `budgetsTable.fondsReserve` | AUTO | — |
| Fonds travaux | `fondsTravauxTable.currentBalance` | AUTO | — |
| Established by | `conseilSyndicalTable` (treasurer) | AUTO | SEMI |
| Approved by | `conseilSyndicalTable` (president) | AUTO | SEMI |

---

### APPEL DE FONDS (`appel_de_fonds`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Period | `appelsDeFondsTable.period` | AUTO via appelId | ✅ |
| Amount | `appelsDeFondsTable.amount` | AUTO | ✅ |
| Due date | `appelsDeFondsTable.dueDate` | AUTO | ✅ |
| Charge type | `appelsDeFondsTable.type` | AUTO | ✅ |
| Member name | `membersTable.name` | AUTO via ownerId | ✅ |
| Lot number | `lotsTable.number` | AUTO | ✅ |
| Building | `buildingsTable.name` | AUTO | ✅ |
| Payment status | `appelsDeFondsTable.status` | AUTO | ✅ |
| Receipt number | `appelsDeFondsTable.receiptNumber` | AUTO | — |
| Bank details | `syndicatesTable.bankName, IBAN` | AUTO | ❌ MISSING |

**Gaps:** `syndicatesTable` lacks `bankName`, `bankIban`, `bankBic` columns. These are critical for payment instructions.

---

### REÇU DE PAIEMENT (`recu_paiement`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Receipt number | `appelsDeFondsTable.receiptNumber` | AUTO via appelId | ✅ |
| Payment date | `appelsDeFondsTable.paidDate` | AUTO | ✅ |
| Amount | `appelsDeFondsTable.amount` | AUTO | ✅ |
| Payment method | `appelsDeFondsTable.paymentMethod` | AUTO | — |
| Period | `appelsDeFondsTable.period` | AUTO | ✅ |
| Payer name | `membersTable.name` | AUTO | ✅ |
| Lot number | `lotsTable.number` | AUTO | ✅ |
| Syndicate | `syndicatesTable.name` | AUTO | ✅ |

---

### FACTURE (`facture`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Invoice reference | `invoicesTable.reference` | AUTO via invoiceId | ✅ |
| Invoice date | `invoicesTable.date` | AUTO | ✅ |
| Due date | `invoicesTable.dueDate` | AUTO | ✅ |
| Recipient | `invoicesTable.recipient` | AUTO | ✅ |
| Amount | `invoicesTable.amount` | AUTO | ✅ |
| Invoice status | `invoicesTable.status` | AUTO | ✅ |
| Line items | `invoiceItemsTable` (all for invoiceId) | AUTO | AUTO |
| Totals | calculated from line items | AUTO | ✅ |
| TVA rate | — | MANUAL (default 20%) | — |
| Syndicate bank | — | ❌ MISSING from schema | — |

---

### BUDGET PRÉVISIONNEL (`budget_previsionnel`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Year | `budgetsTable.year` | AUTO via budgetId | ✅ |
| Building | `buildingsTable.name` | AUTO | ✅ |
| Total amount | `budgetsTable.totalAmount` | AUTO | ✅ |
| Charges amount | `budgetsTable.chargesAmount` | AUTO | ✅ |
| Fonds réserve | `budgetsTable.fondsReserve` | AUTO | ✅ |
| Status | `budgetsTable.status` | AUTO | ✅ |
| Budget lines | `budgetLinesTable` (all for budgetId) | AUTO | AUTO |
| Prior year actuals | ❌ MISSING (no prior year comparison) | — | — |

---

### DÉCOMPTE DES CHARGES (`decompte_charges`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Lot number | `lotsTable.number` | AUTO via lotId | ✅ |
| Tantiemes | `lotsTable.tantiemes` | AUTO | ✅ |
| Owner name | `membersTable.name` | AUTO | ✅ |
| Year | SEMI (default current year) | SEMI | ✅ |
| Total provisioned | `appelsDeFondsTable` (sum for lot+year) | AUTO | ✅ |
| Total paid | `appelsDeFondsTable` (paid, sum) | AUTO | ✅ |
| Total overdue | `appelsDeFondsTable` (overdue, sum) | AUTO | ✅ |
| Breakdown by type | `appelsDeFondsTable.type` (grouped sum) | AUTO | AUTO |
| Estimated real charges | calculated via tantièmes ratio | AUTO | ✅ |
| Building expenses | `caisseEntriesTable` (debit sum) | AUTO | ✅ |

---

### RAPPORT D'ÉLECTION (`rapport_election`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Election title | `electionsTable.title` | AUTO via electionId | ✅ |
| Election type | `electionsTable.electionType` | AUTO | ✅ |
| Start date | `electionsTable.startDate` | AUTO | ✅ |
| End date | `electionsTable.endDate` | AUTO | ✅ |
| Eligible voters | `electionsTable.eligibleCount` | AUTO | ✅ |
| Participants | `electionsTable.participantCount` | AUTO | ✅ |
| Quorum % | `electionsTable.quorumPercent` | AUTO | ✅ |
| Quorum reached | `electionsTable.quorumReached` (calculated) | AUTO | ✅ |
| Participation rate | calculated | AUTO | ✅ |
| Invalid votes | `electionsTable.invalidVotesCount` | AUTO | — |
| Mandate duration | `electionsTable.mandateDurationMonths` | AUTO | — |
| Candidates + votes | `candidatesTable` (all for electionId) | AUTO | AUTO |
| Winners | `candidatesTable.isWinner = true` | AUTO | AUTO |

---

### CONTRAT DE BAIL (`contrat_bail`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Landlord (bailleur) | `syndicatesTable.name` OR `membersTable.name` (lot owner) | AUTO | ✅ |
| Tenant name | `tenantsTable.name` | AUTO via tenantId | ✅ |
| Tenant phone | `tenantsTable.phone` | AUTO | — |
| Tenant email | `tenantsTable.email` | AUTO | — |
| Tenant CIN | `tenantsTable.cin` | AUTO | ✅ |
| Lot number | `lotsTable.number` via tenant.lotId | AUTO | ✅ |
| Floor | `lotsTable.floor` | AUTO | — |
| Surface | `lotsTable.surfaceM2` | AUTO | ✅ |
| Building address | `buildingsTable.address + city` | AUTO | ✅ |
| Titre foncier | `lotsTable.titreFoncier` | AUTO | — |
| Lease start | `tenantsTable.leaseStart` | AUTO | ✅ |
| Lease end | `tenantsTable.leaseEnd` | AUTO | — |
| Monthly rent | `tenantsTable.monthlyRent` | AUTO | ✅ |
| Charges amount | `tenantsTable.charges` | AUTO | — |
| Deposit | `tenantsTable.depositAmount` | AUTO | ✅ |
| Clause body | — | MANUAL (or template default) | SEMI |

---

### DÉCLARATION DE SINISTRE (`sinistre`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Claim number | `sinistresTable.claimNumber` | AUTO via sinistreId | ✅ |
| Sinistre type | `sinistresTable.type` | AUTO | ✅ |
| Date of incident | `sinistresTable.date` | AUTO | ✅ |
| Description | `sinistresTable.description` | AUTO | SEMI |
| Building | `buildingsTable.name + address` | AUTO | ✅ |
| Status | `sinistresTable.status` | AUTO | ✅ |
| Urgency | `sinistresTable.urgency` | AUTO | ✅ |
| Insurance company | `sinistresTable.insuranceCompany` | AUTO | — |
| Policy number | `sinistresTable.policyNumber` | AUTO | — |
| Estimated loss | `sinistresTable.estimatedAmount` | AUTO | — |
| Reporter name | via `syndicateId → conseilSyndical` or member | AUTO | SEMI |

---

### ORDRE DE TRAVAUX (`travaux`)

| Field | Source Table | Fill Mode | Required |
|---|---|---|---|
| Work title | `travauxTable.title` | AUTO via travauxId | ✅ |
| Work type | `travauxTable.type` | AUTO | ✅ |
| Priority | `travauxTable.priority` | AUTO | ✅ |
| Status | `travauxTable.status` | AUTO | ✅ |
| Start date | `travauxTable.startDate` | AUTO | — |
| End date | `travauxTable.endDate` | AUTO | — |
| Estimated amount | `travauxTable.estimatedAmount` | AUTO | — |
| Provider name | `prestatairesTable.name` | AUTO | SEMI |
| Provider phone | `prestatairesTable.phone` | AUTO | — |
| Building | `buildingsTable.name + address` | AUTO | ✅ |
| Description | `travauxTable.description` | AUTO | SEMI |
| Actual cost | `travauxTable.actualCost` | AUTO | — |

---

### TEMPLATES WITH MINIMAL DB AUTO-FILL (REQUIRE MANUAL INPUT)

| Template | Auto Fields | Manual Fields | Gap |
|---|---|---|---|
| `rapport` | syndicate, member, date | synthèse, activités, indicateurs, perspectives | 4 manual sections |
| `decision` | syndicate, date, docNum | organe, preamble, decision text | 3 manual fields |
| `certificat` | syndicate, member, date | certificate body | 1 large manual field |
| `circulaire` | syndicate, date, docNum | message body, priority | 2 manual fields |
| `note_interne` | syndicate, date | to, from, message, action | 4 manual fields |
| `autorisation` | syndicate, member, date, lot | objet, conditions, dates | 3 manual fields |
| `ordre_de_mission` | syndicate, member, date | destination, dates, description, frais | 4 manual fields |
| `demande_administrative` | syndicate, member, lot, date | objet, exposé, pièces | 3 manual fields |
| `lettre_officielle` | syndicate, member, date | objet, corps | 2 manual fields |
| `contrat` | syndicate, member, date | objet, clauses | 2 manual fields (large) |
| `convention_partenariat` | syndicate, date | partner details, terms | 3 manual fields |
| `accord_collectif` | syndicate, date | terms, scope | 3 manual fields |
| `rapport_audit` | syndicate, date | scope, findings, recommendations | 3 large sections |
| `rapport_activite` | syndicate, date | activities, KPIs, perspectives | 3 manual sections |
| `compte_rendu` | syndicate, date (meeting) | déroulement, decisions | 2 manual sections |
| `reglement` | syndicate, buildings, lots, dates | all clause bodies | heavy manual |

---

<a name="phase-5"></a>
## PHASE 5 — PAGE OPTIMIZATION ANALYSIS

### Current Page Count Issues

| Template | Current Pages | Target Pages | Problem |
|---|---|---|---|
| `attestation` | ~1.5 pages | 1 page | Profile card + certification block + signature = just over 1 page |
| `attestation_residence` | ~1.5 pages | 1 page | Excessive header + metaTable cards take too much space |
| `attestation_propriete` | ~1.5 pages | 1 page | Same issue |
| `attestation_paiement` | ~2 pages | 1 page | Payment history table pushes to page 2 |
| `certificat` | ~1 page | 1 page | ✅ Correct |
| `pv` | ~2-3 pages | 2-3 pages | ✅ Correct — dependent on resolution count |
| `convocation` | ~1.5 pages | 1 page | Notice box + signature push to page 2 |
| `rapport_financier` | ~2-3 pages | 2 pages | KPI + tables acceptable, but decorative spacing excessive |
| `appel_de_fonds` | ~1.5 pages | 1 page | Payment instructions + warning box = 1.5 |
| `recu_paiement` | ~1.5 pages | 1 page | Certification block + signature = spills |
| `facture` | ~1-2 pages | 1-2 pages | ✅ Depends on line items |
| `budget_previsionnel` | ~2 pages | 2 pages | ✅ Acceptable |
| `decompte_charges` | ~1.5 pages | 1 page | Breakdown table + sections |
| `rapport_election` | ~2 pages | 1-2 pages | Candidate table can be compact |
| `contrat_bail` | ~3-5 pages | 3-4 pages | ✅ Legal document — length expected |
| `travaux` | ~2 pages | 1-2 pages | ✅ Phase table justifies 2 pages |
| `sinistre` | ~2 pages | 1-2 pages | ✅ Damage table justifies 2 pages |
| `mise_en_demeure` | ~1.5 pages | 1 page | Red boxes + notice |
| `reglement` | ~2+ pages | 2-3 pages | ✅ Statutory document |
| `rapport_audit` | ~2 pages | 2 pages | ✅ Acceptable |

### Root Causes of Page Overflow

**1. Header band too tall (primary offender)**
- Current header band uses approximately 80–90pt vertical space
- Can be reduced to 72pt by reducing margin[1] from 12 to 10 in the center column
- Logo column margin [10,12,10,12] → [8,10,8,10]

**2. metaTable card height 40pt**
- Reduced to 36pt still reads as premium
- 4 rows of 2 cards = 4 × 36pt = 144pt vs current 4 × 40pt = 160pt
- Saving: 16pt per 4-row table

**3. Section dividers (margin: [0, 14, 0, 10])**
- `attDiv()` in attestation has 14pt top margin — can be reduced to 10pt
- contentSection header band margin [0,0,0,12] → [0,0,0,8]

**4. Oversized signature blocks**
- "En attente de signature" box height: currently unbounded
- Set fixed height: 48pt for single signer, 40pt per signer in multi-sig

**5. Family opener banners add height**
- buildMeetingBanner, buildLegalAlertBanner, buildGovernanceBanner all add 40–60pt
- These are appropriate for 2-page documents; remove from 1-page target templates

### Page Reduction Strategy (Without Sacrificing Quality)

```
Tactic 1: Header height -15pt (80pt → 65pt)
  → header table body row heights: [10,12,10,12] → [8,10,8,10] on all columns

Tactic 2: metaTable card height 40pt → 34pt
  → canvas bar [4, 40] → [4, 34]
  → margin [10, 8, 10, 8] → [8, 6, 8, 6]

Tactic 3: Section title band height 20pt → 16pt
  → canvas: h:20 → h:16
  → margin [0, 0, 0, 12] → [0, 0, 0, 8]

Tactic 4: Body font 10.5pt → 10pt, lineHeight 1.7 → 1.6
  → For certification/attestation family only (financial docs keep current size)

Tactic 5: Page margins 40pt → 36pt (via pdfmake pageMargins)
  → Adds ~8pt usable width, allows more content per line

Tactic 6: signature block top margin 28pt → 20pt for 1-page target documents

Estimated savings per A4 page:
  Tactic 1: ~15pt
  Tactic 2: ~24pt (6 rows × 4pt per card)
  Tactic 3: ~16pt (4 sections × 4pt)
  Tactic 4: ~12pt (body text compaction)
  Tactic 5: ~8pt
  Tactic 6: ~8pt
  Total: ~83pt ≈ ⅔ of a text line height — enough to bring 1.1-page docs to 1 page
```

---

<a name="phase-6"></a>
## PHASE 6 — PER-TEMPLATE AUDIT CARDS

---

### T01 — ATTESTATION D'ADHÉSION

| Dimension | Assessment |
|---|---|
| **Current score** | 78/100 |
| **Problems identified** | Profile card is premium quality but signature "En attente" persists after signing (pipeline bug). Identity strip cuts off at 4 cells — missing profession/nationality. 1.5 pages. |
| **Missing DB connections** | `membersTable.profession` (column missing), `membersTable.nationality` (column missing), `usersTable.cin` lookup via email (working, but fragile) |
| **Redundant user inputs** | Name, email, phone, lot number, building — all auto-filled if memberId provided |
| **Signature issues** | Regeneration fire-and-forget → stale PDF with "En attente" |
| **Logo issues** | Logo renders correctly when GCS works; silent fallback to initials when GCS fails |
| **Target design concept** | Premium member credential — credit-card-style member card below profile grid, holographic strip in certification block, QR membership number badge |
| **Target structure** | Header → Identity Strip (4 cells) → Grand Title → Member Profile Card (2-col) → Certification Block (with styled paragraph) → Signature Area (2-col: president + secretary) |
| **Expected page count** | 1 page (compact spacing) |
| **Target score** | 87/100 |

---

### T02 — ATTESTATION DE RÉSIDENCE

| Dimension | Assessment |
|---|---|
| **Current score** | 62/100 |
| **Problems identified** | Generic certificationFrame opener. No property visualization. Same layout as T03. 1.5 pages due to spacing. |
| **Missing DB connections** | `tenantsTable.leaseStart` as residence-since date (only pulls from membersTable.joinDate which is membership, not residence) |
| **Redundant user inputs** | Building, address, lot — auto-filled; purpose of attestation is the only manual field needed |
| **Signature issues** | Same pipeline bug as T01 |
| **Logo issues** | Same as system-wide |
| **Target design concept** | Official residence certificate — property-forward layout: building name large, address prominent, city map reference. Government/mairie format. |
| **Target structure** | Header → Property Identity Banner → Residence Certification Statement (formal paragraph) → Member + Property detail strip → Legal validity section → Signature |
| **Expected page count** | 1 page |
| **Target score** | 84/100 |

---

### T03 — ATTESTATION DE PROPRIÉTÉ

| Dimension | Assessment |
|---|---|
| **Current score** | 62/100 |
| **Problems identified** | Visually identical to T02. Titre foncier not prominently displayed. Tantiemes not shown as fraction (/10,000). |
| **Missing DB connections** | All fields auto-filled correctly. Gap: no acquisition date (would need `lotsTable.purchaseDate` column). |
| **Redundant user inputs** | All property fields auto-filled; only purpose text is manual |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Property title certificate — notarial format. Lot number in large display. Full technical property description with tantièmes ratio highlighted. |
| **Target structure** | Header → Ownership Declaration Panel → Property Technical Details (3-col: lot | surface | tantiemes) → Titre Foncier block → Legal certification → Signature |
| **Expected page count** | 1 page |
| **Target score** | 86/100 |

---

### T04 — ATTESTATION DE PAIEMENT

| Dimension | Assessment |
|---|---|
| **Current score** | 68/100 |
| **Problems identified** | Good DB integration but visual presentation is form-like. Payment history table is text-formatted, not tabular. "Solde à payer" not displayed prominently. |
| **Missing DB connections** | All payment fields calculated correctly from appelsDeFondsTable |
| **Redundant user inputs** | Period (SEMI — default to current year but user should confirm) |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Bank statement certificate — "PAIEMENTS EN RÈGLE" badge if fully paid, progress indicator, tabular payment history, DocuSign-style completion indicator |
| **Target structure** | Header → Payment Status Badge → Period KPI Strip (charged/paid/outstanding) → Payment History Table → Settlement Statement → Signature |
| **Expected page count** | 1 page |
| **Target score** | 88/100 |

---

### T05 — PROCÈS-VERBAL

| Dimension | Assessment |
|---|---|
| **Current score** | 72/100 |
| **Problems identified** | Text-based resolutions lack visual structure. No attendance table. No quorum indicator. Resolutions as preformatted text blocks are hard to read. |
| **Missing DB connections** | Quorum: needs `SELECT COUNT(*) FROM membersTable WHERE syndicateId=?` to compute denominator. Currently absent. |
| **Redundant user inputs** | All meeting fields auto-filled if meetingId provided. Only custom deliberation text may be manual. |
| **Signature issues** | multiSignatoryBlock works correctly. Pipeline bug applies. |
| **Logo issues** | System-wide |
| **Target design concept** | Parliamentary session minutes — quorum chip, attendance 2-column list, resolution cards with vote tallies and result badges |
| **Target structure** | Header → Session Banner (with quorum chip) → Attendance Section → Agenda (numbered) → Resolution Cards → Decisions → Multi-signatory Block |
| **Expected page count** | 2-3 pages |
| **Target score** | 90/100 |

---

### T06 — CONVOCATION

| Dimension | Assessment |
|---|---|
| **Current score** | 68/100 |
| **Problems identified** | Meeting banner present but no agenda preview. 1.5 pages. Legal notice box pushes to page 2. No proxy/attendance slip. |
| **Missing DB connections** | All meeting fields auto-filled. Agenda text from meetingsTable.agenda. |
| **Redundant user inputs** | None when meetingId provided |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Official summons — named recipient, meeting details card, agenda preview numbered list, detachable attendance/proxy slip at bottom |
| **Target structure** | Header → Sender/Recipient Block → Meeting Details Card → Agenda Preview → Legal Notice → Signature + Detachable Slip |
| **Expected page count** | 1 page |
| **Target score** | 85/100 |

---

### T07 — CONTRAT

| Dimension | Assessment |
|---|---|
| **Current score** | 58/100 |
| **Problems identified** | No clause numbering. Generic "Préambule" + "Clauses et conditions" — 2 sections for everything. No execution page. |
| **Missing DB connections** | Party 2 (member or provider) auto-filled. Contract body is manual. |
| **Redundant user inputs** | Syndicate as Party 1 is always auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Law firm brief — parties block with full legal addresses, numbered articles, execution page with witness |
| **Target structure** | Header → Parties Block (2-col) → Numbered Articles → Special Conditions → Execution Page (date/location + signatures) |
| **Expected page count** | 2-3 pages |
| **Target score** | 84/100 |

---

### T08 — RAPPORT

| Dimension | Assessment |
|---|---|
| **Current score** | 58/100 |
| **Problems identified** | 4 generic sections with placeholder text. No KPI data. No distinction from rapport_activite. |
| **Missing DB connections** | Only syndicate and member auto-filled. All content manual. |
| **Redundant user inputs** | Date, author, syndicate are auto-filled. 4 section bodies are manual. |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Executive report — cover section, KPI table (manual or from DB), numbered findings, recommendations |
| **Target structure** | Header → Report Metadata Strip → Executive Summary → Activity Sections → KPI Table → Recommendations → Signature |
| **Expected page count** | 2 pages |
| **Target score** | 80/100 |

---

### T09 — DÉCISION OFFICIELLE

| Dimension | Assessment |
|---|---|
| **Current score** | 65/100 |
| **Problems identified** | Governance banner is correct. But "Vu et considérant" + "Décide" sections look like any other contentSection. Missing resolution number reference. No enabling meeting reference. |
| **Missing DB connections** | Could link to meetingId to reference the enabling resolution |
| **Redundant user inputs** | Organe décisionnel defaults to "Bureau Syndical" — correct |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Official resolution — resolution number in display type, numbered articles, effectiveness date in accent box, 3-column approval |
| **Target structure** | Header → Governance Banner → "RÉSOLUTION N°" Block → Preamble (italic legal) → Articles (numbered) → Effectiveness Box → Signature |
| **Expected page count** | 1 page |
| **Target score** | 86/100 |

---

### T10 — CERTIFICAT

| Dimension | Assessment |
|---|---|
| **Current score** | 60/100 |
| **Problems identified** | Most generic template. buildCertificateFrame + large title + metaTable + body is the bare minimum. |
| **Missing DB connections** | Member auto-filled. Body is generic placeholder. |
| **Redundant user inputs** | All meta fields auto-filled; body is the only true manual field |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Diploma format — ornate border, honoree name centered in display type, certification paragraph centered italic, official seal centered |
| **Target structure** | Header → Certificate Frame (ornate) → Honoree Name (large) → Certification Paragraph (italic, centered) → Official Seal (centered) → Signature |
| **Expected page count** | 1 page |
| **Target score** | 82/100 |

---

### T11 — CIRCULAIRE

| Dimension | Assessment |
|---|---|
| **Current score** | 55/100 |
| **Problems identified** | Visually identical to note_interne. No broadcast format. No "DIFFUSION GÉNÉRALE" header. |
| **Missing DB connections** | Recipient list (all members) is not auto-generated; no bulk recipient expansion |
| **Redundant user inputs** | Sender (syndicate), date, reference are auto-filled |
| **Signature issues** | No signature currently (correct for circulars, but president signature should be optional) |
| **Logo issues** | System-wide |
| **Target design concept** | Broadcast memo — accent header strip with "CIRCULAIRE N°", "DIFFUSION GÉNÉRALE", priority badge, required action box |
| **Target structure** | Header → Broadcast Strip → Recipient + Sender Block → Subject Line → Body → Action Box (if required) → Signature |
| **Expected page count** | 1 page |
| **Target score** | 80/100 |

---

### T12 — MISE EN DEMEURE

| Dimension | Assessment |
|---|---|
| **Current score** | 72/100 |
| **Problems identified** | Good red alert banner and deadline box. Missing debt amount, bank payment details, legal article references. |
| **Missing DB connections** | Debt amount: should link to appelsDeFondsTable outstanding balance for this member |
| **Redundant user inputs** | Recipient (member), sender (syndicate), date, ref are auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Legal enforcement notice — debt amount in red highlight, bank payment instructions, law article references (loi 18-00), 30-day countdown |
| **Target structure** | Header → Red Alert Banner → Recipient Block → Debt Amount Box (red) → Legal Grounds → Deadline Box → Bank Payment Instructions → Consequences → Signature |
| **Expected page count** | 1 page |
| **Target score** | 87/100 |

---

### T13 — DEMANDE ADMINISTRATIVE

| Dimension | Assessment |
|---|---|
| **Current score** | 58/100 |
| **Problems identified** | Generic form layout. No tracking reference. No status. No response deadline field. |
| **Missing DB connections** | Member, lot, building auto-filled |
| **Redundant user inputs** | Requester identity fully auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Administrative request form — tracking QR, requester ID card, request body, attachments checklist, decision section |
| **Target structure** | Header → Request Identity Strip → Requester Card → Request Body → Attachments Checklist → Decision Zone (to be filled) → Signature |
| **Expected page count** | 1 page |
| **Target score** | 80/100 |

---

### T14 — AUTORISATION

| Dimension | Assessment |
|---|---|
| **Current score** | 62/100 |
| **Problems identified** | "✓ AUTORISATION VALIDE" box is good but validity dates not displayed as a visual calendar strip. No revocation conditions box. |
| **Missing DB connections** | Member, lot, building auto-filled. Dates are manual. |
| **Redundant user inputs** | All identity fields auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Official permit — authorization number prominently displayed, validity calendar strip, conditions table, revocation conditions |
| **Target structure** | Header → Authorization Number Banner → Beneficiary Card → Validity Strip (date range) → Authorization Text → Conditions → Revocation Box → Signature |
| **Expected page count** | 1 page |
| **Target score** | 82/100 |

---

### T15 — ORDRE DE MISSION

| Dimension | Assessment |
|---|---|
| **Current score** | 60/100 |
| **Problems identified** | Missing budget allocation. No travel schedule visualization. No return confirmation section. |
| **Missing DB connections** | Missionaire (member) auto-filled. Mission details are manual. |
| **Redundant user inputs** | Identity fields auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Mission order — mission identity strip, destination + dates as travel bar, budget allocation table, hierarchical approvals |
| **Target structure** | Header → Mission Identity Strip → Missionaire Card → Destination Block → Budget Table → Travel Schedule → Approval Chain → Signature |
| **Expected page count** | 1 page |
| **Target score** | 81/100 |

---

### T16 — LETTRE OFFICIELLE

| Dimension | Assessment |
|---|---|
| **Current score** | 62/100 |
| **Problems identified** | Classic 2-column letter format is correct but uses plain fontSizes, not accent color system. No attachments list. No letterhead stripe. |
| **Missing DB connections** | Sender (syndicate) and recipient (member) auto-filled |
| **Redundant user inputs** | Identity fields auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Law firm letterhead — left: colored stripe + syndicate identity; right: recipient + date + references; formal body paragraphs |
| **Target structure** | Header → 2-Col Letter Header (sender|recipient) → Subject Line → Salutation → Body → Closing → Attachments List → Signature |
| **Expected page count** | 1 page |
| **Target score** | 82/100 |

---

### T17 — NOTE INTERNE

| Dimension | Assessment |
|---|---|
| **Current score** | 55/100 |
| **Problems identified** | Almost no design differentiation. Missing signature. Identical to circulaire visually. |
| **Missing DB connections** | Sender/recipient from conseilSyndicalTable could be auto-filled |
| **Redundant user inputs** | Date, reference, syndicate auto-filled |
| **Signature issues** | No signature currently (appropriate for internal memos, but should be optional) |
| **Logo issues** | System-wide |
| **Target design concept** | Internal memo — confidentiality badge (INTERNE), action items table, response deadline, sender signature |
| **Target structure** | Header → Memo Strip (classification badge) → To/From/Date Block → Subject → Body → Action Items Table (if any) → Signature |
| **Expected page count** | 1 page |
| **Target score** | 78/100 |

---

### T18 — RAPPORT FINANCIER

| Dimension | Assessment |
|---|---|
| **Current score** | 78/100 |
| **Problems identified** | Best financial template. KPI cards and progress bars are strong. But executive summary paragraph is placeholder. No month-by-month table. |
| **Missing DB connections** | All KPIs from DB (excellently wired). Gap: month-by-month breakdown requires grouping by period month. |
| **Redundant user inputs** | All KPIs auto-filled. Established by / approved by from officeHolders. Only title/period are manual. |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Bloomberg/SAP terminal — dark accent header, executive summary, KPI gauges, monthly data table, 3-signatory approval |
| **Target structure** | Header → Executive Summary Box → KPI Strip (4 gauges) → Revenue/Expenses Table → Budget Consumption → Outstanding Debts → Fonds Travaux → 3-Signatory Block |
| **Expected page count** | 2 pages |
| **Target score** | 89/100 |

---

### T19 — RAPPORT D'AUDIT

| Dimension | Assessment |
|---|---|
| **Current score** | 58/100 |
| **Problems identified** | Same structure as rapport but without KPI data. No risk matrix. No findings table. |
| **Missing DB connections** | No DB integration for audit findings. Would need `auditFindingsTable` (does not exist). |
| **Redundant user inputs** | Syndicate, date auto-filled. All content manual. |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Audit report — scope statement, risk matrix table, findings table (finding|severity|recommendation|deadline), compliance score, auditor certification |
| **Target structure** | Header → Audit Scope Card → Risk Matrix → Findings Table → Recommendations → Compliance Score → Auditor Certification |
| **Expected page count** | 2 pages |
| **Target score** | 83/100 |

---

### T20 — CONVENTION DE PARTENARIAT

| Dimension | Assessment |
|---|---|
| **Current score** | 55/100 |
| **Problems identified** | Basic contract structure. No governance framework. No obligations matrix. |
| **Missing DB connections** | Partner details are manual (no prestatairesTable link currently) |
| **Redundant user inputs** | Syndicate as Party 1 auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Partnership agreement — parties block, purpose, governance (steering committee), obligations matrix, financial terms, signatures |
| **Target structure** | Header → Parties Block → Purpose Section → Obligations Matrix → Financial Terms → Governance → Duration → Signatures |
| **Expected page count** | 2 pages |
| **Target score** | 80/100 |

---

### T21 — ACCORD COLLECTIF

| Dimension | Assessment |
|---|---|
| **Current score** | 52/100 |
| **Problems identified** | Very thin template. Entry into force date is the main hook. No benefit schedule. No scope definition. |
| **Missing DB connections** | No DB integration. Entirely manual. |
| **Redundant user inputs** | Syndicate auto-filled. All terms manual. |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Collective agreement — scope, key terms table, benefit schedule, amendment procedure, representative signatures |
| **Target structure** | Header → Scope of Coverage → Key Terms Table → Benefit Schedule → Amendment Procedure → Representative Signatures |
| **Expected page count** | 2 pages |
| **Target score** | 78/100 |

---

### T22 — COMPTE-RENDU

| Dimension | Assessment |
|---|---|
| **Current score** | 60/100 |
| **Problems identified** | Visually similar to PV. No quorum/attendance indicator. Decisions section not structured. |
| **Missing DB connections** | meetingId links to meeting data. Attendance from meetingAttendeesTable. |
| **Redundant user inputs** | All meeting fields auto-filled with meetingId |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Meeting minutes — session opener, attendance count chips, agenda items, decisions with action items table |
| **Target structure** | Header → Session Banner → Present/Absent/Excused Chips → Agenda Items → Decisions → Action Items Table → Signature |
| **Expected page count** | 1-2 pages |
| **Target score** | 83/100 |

---

### T23 — RAPPORT D'ACTIVITÉ

| Dimension | Assessment |
|---|---|
| **Current score** | 55/100 |
| **Problems identified** | Identical structure to rapport (T08). No differentiation. Activities section is a text blob. |
| **Missing DB connections** | Could link to travauxTable for completed works, meetingsTable for meetings held |
| **Redundant user inputs** | Author, syndicate, date auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Activity report — period cover, activities list with status badges, metrics table, next period goals |
| **Target structure** | Header → Period Banner → Activities Completed (table) → Metrics (KPI strip) → Issues Encountered → Next Period Goals → Signature |
| **Expected page count** | 2 pages |
| **Target score** | 80/100 |

---

### T24 — RÈGLEMENT DE COPROPRIÉTÉ

| Dimension | Assessment |
|---|---|
| **Current score** | 68/100 |
| **Problems identified** | Most important legal document but body content is entirely placeholder. No article numbering. No table of contents. No tantièmes annex. |
| **Missing DB connections** | Building data (floors, lots, surface) auto-filled from DB. Tantièmes from lotsTable. |
| **Redundant user inputs** | All building/syndicate metadata auto-filled. Clause bodies are the only manual inputs. |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Statutory document — cover page, table of contents, numbered titles→chapters→articles, tantièmes annex table |
| **Target structure** | Cover Page → Table of Contents → Article 1…N (numbered) → Annex (tantièmes table) → Adoption Page (signatures) |
| **Expected page count** | 3-5 pages |
| **Target score** | 86/100 |

---

### T25 — APPEL DE FONDS

| Dimension | Assessment |
|---|---|
| **Current score** | 68/100 |
| **Problems identified** | certificationFrame opener is wrong for a financial demand notice. Amount not prominently displayed. No bank details. No payment slip. |
| **Missing DB connections** | All appel de fonds data from DB via appelId. Gap: bank details (syndicatesTable lacks IBAN/BIC). |
| **Redundant user inputs** | All fields auto-filled with appelId |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Invoice-style demand — large amount box, payment methods, bank details, detachable payment slip |
| **Target structure** | Header → Issuer/Recipient Block → Amount Box (large, accent bg) → Payment Instructions Table → Due Date Warning → Bank Details → Signature + Payment Slip |
| **Expected page count** | 1 page |
| **Target score** | 87/100 |

---

### T26 — REÇU DE PAIEMENT

| Dimension | Assessment |
|---|---|
| **Current score** | 65/100 |
| **Problems identified** | No receipt number displayed prominently. No carbon copy layout. Certification text is generic. |
| **Missing DB connections** | All payment data from DB via appelId |
| **Redundant user inputs** | All fields auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Official receipt — "REÇU N°" in large type with accent bg, payer/receiver blocks, amount box, payment details, QR verification, tear-off strip |
| **Target structure** | Header → Receipt Number Banner → Payer/Receiver Block → Amount Box → Payment Details → QR Code → Legal Note + Tear-Off Strip |
| **Expected page count** | 1 page |
| **Target score** | 88/100 |

---

### T27 — FACTURE

| Dimension | Assessment |
|---|---|
| **Current score** | 70/100 |
| **Problems identified** | Line items table exists but no TVA/subtotal breakdown. No IBAN. No late payment penalty notice. No PROFORMA vs DÉFINITIVE distinction. |
| **Missing DB connections** | All invoice data from DB via invoiceId. Gap: bank details missing from schema. |
| **Redundant user inputs** | All invoice fields auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Professional invoice — full SAP/QuickBooks format with subtotals, TVA, IBAN, payment terms, late penalty |
| **Target structure** | Header → Issuer/Recipient Block → Invoice Details Strip → Line Items Table (qty×price×total) → Subtotal/TVA/Total Block → Payment Terms → IBAN → Legal Note → Signature + Stamp |
| **Expected page count** | 1-2 pages |
| **Target score** | 91/100 |

---

### T28 — BUDGET PRÉVISIONNEL

| Dimension | Assessment |
|---|---|
| **Current score** | 72/100 |
| **Problems identified** | Good DB integration but no prior year comparison. No month-by-month distribution. No approval workflow reference. |
| **Missing DB connections** | Prior year budget: requires `WHERE year = currentYear - 1`. Currently absent. |
| **Redundant user inputs** | All budget data auto-filled via budgetId |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | ERP budget report — fiscal year header, 4-metric KPI strip, category breakdown table (with % and trend), month-by-month distribution, 3-signatory approval |
| **Target structure** | Header → Fiscal Year Banner (approved/draft status) → KPI Strip → Category Breakdown Table → Distribution Table → Approval Signatures (treasurer+president+secretary) |
| **Expected page count** | 2 pages |
| **Target score** | 89/100 |

---

### T29 — DÉCOMPTE DES CHARGES

| Dimension | Assessment |
|---|---|
| **Current score** | 68/100 |
| **Problems identified** | Sophisticated calculation (tantièmes ratio) but wall-of-numbers presentation. No comparison chart equivalent. Settlement amount not highlighted. |
| **Missing DB connections** | All data from DB via lotId + year. Excellent integration. |
| **Redundant user inputs** | All fields auto-filled except year (SEMI, defaults to current) |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Statement of account — provisions table, real charges, régularisation box (green/red), "À PAYER" or "À REMBOURSER" highlighted |
| **Target structure** | Header → Lot + Member Card → Period Summary → Provisions Table → Charges Réelles → Régularisation Box (color-coded) → Settlement Instruction → Signature |
| **Expected page count** | 1 page |
| **Target score** | 87/100 |

---

### T30 — RAPPORT D'ÉLECTION

| Dimension | Assessment |
|---|---|
| **Current score** | 75/100 |
| **Problems identified** | Best governance template. KPI data from DB excellent. Candidate results as text bullets need table format with vote bars. |
| **Missing DB connections** | All election data from DB via electionId. Excellent integration. |
| **Redundant user inputs** | All fields auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Official election results — KPI strip (eligible/participants/participation/quorum), candidate results table (rank|name|votes|%|elected), mandate list, certification |
| **Target structure** | Header → Governance Banner → Election KPI Strip → Candidate Results Table → Winners List → Mandate Assignments → Certification → Signature |
| **Expected page count** | 1-2 pages |
| **Target score** | 91/100 |

---

### T31 — CONTRAT DE BAIL

| Dimension | Assessment |
|---|---|
| **Current score** | 72/100 |
| **Problems identified** | Most complete template. Multiple sections. Good DB integration. Missing: table of contents, page numbering, paraph lines, deposit receipt section. |
| **Missing DB connections** | All tenant/lot/building data from DB via tenantId. Excellent. |
| **Redundant user inputs** | All identity and financial fields auto-filled |
| **Signature issues** | Pipeline bug — especially problematic for multi-page legal document |
| **Logo issues** | System-wide |
| **Target design concept** | Full rental agreement — cover page, table of contents, numbered articles, dedicated deposit receipt, paraph space, execution page |
| **Target structure** | Cover Page → Table of Contents → Numbered Articles (parties, property, rent, charges, deposit, obligations, duration, exit, special conditions) → Execution Page |
| **Expected page count** | 3-4 pages |
| **Target score** | 88/100 |

---

### T32 — DÉCLARATION DE SINISTRE

| Dimension | Assessment |
|---|---|
| **Current score** | 70/100 |
| **Problems identified** | Good DB integration. Claim number not displayed as main identifier. No insurance company block. No witness section. No photo documentation section. |
| **Missing DB connections** | All sinistre data from DB via sinistreId |
| **Redundant user inputs** | All fields auto-filled |
| **Signature issues** | Pipeline bug |
| **Logo issues** | System-wide |
| **Target design concept** | Insurance claim form — claim number as hero identifier, incident details card, damage table, insurance company block, declaration truth statement |
| **Target structure** | Header → Claim Number Banner → Incident Details Card → Damage Description → Cost Estimate Table → Insurance Company Block → Witness Section → Declaration + Signatures |
| **Expected page count** | 1-2 pages |
| **Target score** | 85/100 |

---

## TEMPLATE NOT YET IN PHASE 6 SCOPE

| # | Template | Current Score | Target Score |
|---|---|---|---|
| T33 | `ordre_de_mission` | 60/100 | 81/100 |

*(Covered in Phase 3 Family 5 — Administrative Documents)*

---

## SUMMARY SCORECARD

| Template | Current | Target | Delta |
|---|---|---|---|
| attestation (T01) | 78 | 87 | +9 |
| attestation_residence (T02) | 62 | 84 | +22 |
| attestation_propriete (T03) | 62 | 86 | +24 |
| attestation_paiement (T04) | 68 | 88 | +20 |
| pv (T05) | 72 | 90 | +18 |
| convocation (T06) | 68 | 85 | +17 |
| contrat (T07) | 58 | 84 | +26 |
| rapport (T08) | 58 | 80 | +22 |
| decision (T09) | 65 | 86 | +21 |
| certificat (T10) | 60 | 82 | +22 |
| circulaire (T11) | 55 | 80 | +25 |
| mise_en_demeure (T12) | 72 | 87 | +15 |
| demande_administrative (T13) | 58 | 80 | +22 |
| autorisation (T14) | 62 | 82 | +20 |
| ordre_de_mission (T15) | 60 | 81 | +21 |
| lettre_officielle (T16) | 62 | 82 | +20 |
| note_interne (T17) | 55 | 78 | +23 |
| rapport_financier (T18) | 78 | 89 | +11 |
| rapport_audit (T19) | 58 | 83 | +25 |
| convention_partenariat (T20) | 55 | 80 | +25 |
| accord_collectif (T21) | 52 | 78 | +26 |
| compte_rendu (T22) | 60 | 83 | +23 |
| rapport_activite (T23) | 55 | 80 | +25 |
| reglement (T24) | 68 | 86 | +18 |
| appel_de_fonds (T25) | 68 | 87 | +19 |
| recu_paiement (T26) | 65 | 88 | +23 |
| facture (T27) | 70 | 91 | +21 |
| budget_previsionnel (T28) | 72 | 89 | +17 |
| decompte_charges (T29) | 68 | 87 | +19 |
| rapport_election (T30) | 75 | 91 | +16 |
| contrat_bail (T31) | 72 | 88 | +16 |
| sinistre (T32) | 70 | 85 | +15 |
| **Average** | **64.6** | **84.7** | **+20.1** |

---

## IMPLEMENTATION PRIORITY ORDER

### Priority 1 — Root Cause Fixes (Must do first — blocks all quality gains)
1. **Signature pipeline: make regeneration synchronous** — awaited before HTTP response
2. **Logo pipeline: add format validation on upload, support WebP via sharp conversion**
3. **generationParams enforcement: make NOT NULL for all new documents**
4. **Add `syndicatesTable.bankName`, `bankIban`, `bankBic` columns** (needed by T25, T27, T12)

### Priority 2 — High-Impact Template Redesigns
5. `facture` (T27) — +21 points, widely used
6. `rapport_election` (T30) — +16 points, already strong data
7. `pv` (T05) — +18 points, most used governance document
8. `rapport_financier` (T18) — +11 points, already best template
9. `attestation_paiement` (T04) — +20 points, high frequency

### Priority 3 — Certification Family Unification
10. `attestation_residence`, `attestation_propriete`, `certificat` — give each a unique visual identity

### Priority 4 — Legal Document Upgrade
11. `contrat`, `contrat_bail`, `mise_en_demeure`, `reglement` — law firm quality

### Priority 5 — Administrative / Operational Completion
12. All remaining templates — standard design uplift

---

*End of Audit — SYNDYCAT Enterprise Document Management System*
*Document prepared: July 17, 2026*
*Total templates audited: 32*
*Average design improvement targeted: +20 points*
