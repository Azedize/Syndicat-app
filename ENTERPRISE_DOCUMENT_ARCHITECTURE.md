# ENTERPRISE DOCUMENT MANAGEMENT SYSTEM
## Architecture Specification — SYNDYCAT Platform
**Version:** 2.0 | **Date:** 15 juillet 2026 | **Scope:** National-Level Union Federation

---

## TABLE OF CONTENTS

1. [Complete Document Architecture](#1-complete-document-architecture)
2. [Database Schema Recommendations](#2-database-schema-recommendations)
3. [Mobile UX Recommendations](#3-mobile-ux-recommendations)
4. [PDF Design System](#4-pdf-design-system)
5. [Workflow Diagrams](#5-workflow-diagrams)
6. [Security Model](#6-security-model)
7. [Permission Matrix](#7-permission-matrix)
8. [Notification Matrix](#8-notification-matrix)
9. [Archive Strategy](#9-archive-strategy)
10. [Production Roadmap](#10-production-roadmap)

---

## 1. COMPLETE DOCUMENT ARCHITECTURE

### 1.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SYNDYCAT DOCUMENT MANAGEMENT SYSTEM                  │
├──────────────┬──────────────────────────┬───────────────────────────────┤
│  MOBILE APP  │      API SERVER           │    STORAGE LAYER              │
│  Expo/RN     │      Express + Drizzle    │    GCS Object Storage         │
│              │                           │                               │
│  documents   │  /api/documents           │  /objects/documents/<id>/     │
│  dashboard   │  /api/documents/:id       │    *.pdf                      │
│  pdf-viewer  │  /api/documents/:id/sign  │                               │
│  generator   │  /api/documents/:id/      │  Signed URLs (1h TTL)         │
│              │    comments               │  via sidecar proxy            │
└──────────────┴──────────────────────────┴───────────────────────────────┘
```

### 1.2 Document Types — All 20 Templates

| # | Template ID | Document Type | Category | Legal Weight |
|---|---|---|---|---|
| 1 | `attestation` | Attestation d'adhésion | attestation | Officiel |
| 2 | `pv` | Procès-Verbal de réunion | pv | Officiel — valeur délibérative |
| 3 | `convocation` | Convocation officielle | pv | Officiel |
| 4 | `contrat` | Contrat | juridique | Contractuel |
| 5 | `rapport` | Rapport général | finances | Administratif |
| 6 | `decision` | Décision syndicale | juridique | Officiel — exécutoire |
| 7 | `certificat` | Certificat officiel | statuts | Officiel |
| 8 | `circulaire` | Circulaire interne | reglements | Informatif |
| 9 | `mise_en_demeure` | Mise en demeure | juridique | Légal — pré-judiciaire |
| 10 | `demande_administrative` | Demande administrative | reglements | Administratif |
| 11 | `autorisation` | Autorisation officielle | juridique | Officiel |
| 12 | `ordre_de_mission` | Ordre de mission | reglements | Officiel |
| 13 | `lettre_officielle` | Lettre officielle | juridique | Officiel |
| 14 | `note_interne` | Note interne | reglements | Interne |
| 15 | `rapport_financier` | Rapport financier | finances | Officiel — comptable |
| 16 | `rapport_audit` | Rapport d'audit | finances | Officiel — audit |
| 17 | `convention_partenariat` | Convention de partenariat | juridique | Contractuel |
| 18 | `accord_collectif` | Accord collectif | juridique | Légal — négocié |
| 19 | `compte_rendu` | Compte-rendu de réunion | pv | Officiel |
| 20 | `rapport_activite` | Rapport d'activité | finances | Officiel |

### 1.3 Document Lifecycle States

```
         DRAFT ──→ GENERATED ──→ PENDING_REVIEW ──→ VALIDATED ──→ SIGNED ──→ PUBLISHED
           ↑            ↑               ↓                 ↑            ↓
           └────────────┘        (rejected)               └────────────┘       ↓
                                      ↓                                     ARCHIVED
                                    DRAFT
```

**State definitions:**

| State | Description | Who can advance |
|---|---|---|
| `draft` | Initial state — content being composed | Creator |
| `generated` | PDF generated, watermark applied | System (auto on generation) |
| `pending_review` | Submitted for editorial review | Creator |
| `validated` | Reviewed and approved | Reviewer (syndicate_admin) |
| `signed` | Electronic signatures collected | Signatories (president, etc.) |
| `published` | Visible to all authorized members | President / super_admin |
| `archived` | Legal retention, read-only | Archivist / super_admin |

### 1.4 Signature Matrix per Document Type

| Document Type | Président | Secrétaire | Trésorier | Manager | Directeur |
|---|---|---|---|---|---|
| Attestation | ✓ required | — | — | — | — |
| PV | ✓ required | ✓ required | — | — | — |
| Convocation | ✓ required | — | — | — | — |
| Contrat | ✓ required | — | — | ✓ optional | — |
| Rapport financier | ✓ required | — | ✓ required | — | — |
| Rapport d'audit | — | — | — | — | ✓ required |
| Convention | ✓ required | ✓ optional | — | — | — |
| Accord collectif | ✓ required | — | — | — | — |
| Décision | ✓ required | ✓ required | — | — | — |
| Ordre de mission | ✓ required | — | — | — | — |
| Mise en demeure | ✓ required | — | — | — | — |

---

## 2. DATABASE SCHEMA RECOMMENDATIONS

### 2.1 Current Schema (Implemented)

```sql
-- Core documents table
CREATE TABLE documents (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  category         TEXT NOT NULL,  -- attestation|pv|juridique|reglements|finances|statuts
  content          TEXT,
  status           TEXT DEFAULT 'draft',
  syndicate_id     TEXT REFERENCES syndicates(id),
  size             TEXT,
  file_url         TEXT,           -- internal GCS path /objects/documents/<uuid>/<file>
  version          INTEGER DEFAULT 1,
  document_number  TEXT,
  created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP,
  archived_at      TIMESTAMP,
  -- Soft delete (legal retention)
  is_deleted       BOOLEAN NOT NULL DEFAULT false,
  deleted_at       TIMESTAMP,
  deleted_by       TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Signatures table
CREATE TABLE document_signatures (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  signed_by        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signer_role      TEXT NOT NULL,
  signed_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address       TEXT,
  signature_data   TEXT            -- base64 SVG handwritten signature
);
```

### 2.2 Recommended Additional Tables

#### 2.2.1 Document Comments (Implemented)

```sql
CREATE TABLE document_comments (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  author_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content      TEXT NOT NULL,
  parent_id    TEXT,               -- for threaded replies
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  edited_at    TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX document_comments_document_id_idx ON document_comments(document_id);
CREATE INDEX document_comments_author_id_idx ON document_comments(author_id);
```

#### 2.2.2 Document Versions (Recommended)

```sql
CREATE TABLE document_versions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  title           TEXT NOT NULL,
  content         TEXT,
  file_url        TEXT,
  changed_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  change_summary  TEXT,           -- "Updated title", "Content revised", etc.
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX document_versions_doc_id_idx ON document_versions(document_id);
CREATE UNIQUE INDEX document_versions_unique ON document_versions(document_id, version_number);
```

#### 2.2.3 Document Reviews (Recommended)

```sql
CREATE TABLE document_reviews (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  reviewer_id  TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action       TEXT NOT NULL,     -- 'approved' | 'rejected' | 'requested_changes'
  comment      TEXT,
  created_at   TIMESTAMP DEFAULT NOW()
);
```

#### 2.2.4 Document Mentions (Recommended)

```sql
CREATE TABLE document_mentions (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  comment_id   TEXT REFERENCES document_comments(id) ON DELETE CASCADE,
  mentioned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMP DEFAULT NOW()
);
```

#### 2.2.5 Document Expiry (Recommended)

```sql
-- Add to documents table:
ALTER TABLE documents ADD COLUMN expires_at TIMESTAMP;
ALTER TABLE documents ADD COLUMN retention_period_years INTEGER DEFAULT 10;
ALTER TABLE documents ADD COLUMN retention_basis TEXT; -- 'legal' | 'contractual' | 'operational'

-- Index for expiry scans:
CREATE INDEX documents_expires_at_idx ON documents(expires_at) WHERE is_deleted = false;
```

### 2.3 Recommended CHECK Constraints

```sql
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('draft','generated','pending_review','validated','signed','published','archived'));

ALTER TABLE documents ADD CONSTRAINT documents_category_check
  CHECK (category IN ('reglements','statuts','pv','juridique','finances','attestation'));
```

### 2.4 Performance Indices

```sql
CREATE INDEX documents_syndicate_status_idx ON documents(syndicate_id, status) WHERE is_deleted = false;
CREATE INDEX documents_created_by_idx ON documents(created_by) WHERE is_deleted = false;
CREATE INDEX documents_category_idx ON documents(category) WHERE is_deleted = false;
CREATE INDEX documents_document_number_idx ON documents(document_number);
```

---

## 3. MOBILE UX RECOMMENDATIONS

### 3.1 Navigation Architecture

```
Tab: Documents
├── /documents              — Main list (filter chips + search)
├── /documents-dashboard    — 8-widget status dashboard
├── /pdf-viewer             — In-app WebView PDF viewer (iOS native + pdf.js)
└── /documents?status=X     — Filtered views (linked from dashboard)
```

### 3.2 PDF Viewer UX (Implemented)

**Technology:** `react-native-webview` 13.x
- **iOS:** WebKit native PDF rendering (`source={{ uri: signedUrl }}`) — zoom, scroll, tap to seek
- **Android:** pdf.js CDN embedded in HTML string — page-by-page canvas rendering with scroll-based page tracking
- **Message bridge:** `postMessage` from pdf.js → React Native for page count, progress, error states
- **Custom toolbar:** Back button | Title + page counter | Share button
- **Progress bar:** Animated fill tied to `loadingTask.onProgress` events
- **Error state:** Retry button + Download fallback button
- **Share/Download:** `FileSystem.downloadAsync` → `Sharing.shareAsync` (PDF MIME, iOS UTI)

### 3.3 Download Experience UX (Implemented)

**Architecture:** `FileSystem.createDownloadResumable` with progress callback
- Progress %, KB/s, seconds remaining — all computed from callback `totalBytesWritten` / elapsed time
- `Animated.Value` interpolated progress bar (smooth fill)
- Cancel via `dl.pauseAsync()` — clears state
- Retry re-calls `startDownload(doc)`
- Done state: "Open / Partager" calls `Sharing.shareAsync`
- Overlay slides up from bottom of screen — non-modal, non-blocking

### 3.4 Document List UX

| Feature | Implementation |
|---|---|
| Filter chips | Category tabs (Tous / Statuts / Règlements / PV / Juridique / Finances / Attestations) |
| Search | Debounced text filter on title |
| Stats row | 4 counters: Publiés / Brouillons / En attente / Signés |
| Card design | Colored left border per category, category icon, status badge |
| Quick download | Download icon on each card — direct, no modal |
| Detail modal | Preview PDF / Download / Share / Modifier + metadata table |

### 3.5 Generate Modal UX

**20-template grid** with per-template:
- Color-coded icon
- Template name + one-line description
- Selection ring highlight
- Optional fields: Destinataire name + objet/notes textarea
- Generate button with `ActivityIndicator` during generation

### 3.6 Dashboard UX (Implemented)

**8 widgets in 2-column grid** — tappable, link to filtered document list:
1. Brouillons (draft + generated)
2. En révision (pending_review)
3. En approbation (validated)
4. À signer (generated + validated)
5. Signés (signed)
6. Publiés (published)
7. Expirent bientôt (30-day window)
8. Archivés (archived)

**Summary card:** Total count + animated progress bar (% published or archived) + active vs. published badges

**Pipeline visualizer:** Draft → Généré → En révision → Validé → Signé → Publié with per-step dot + count

---

## 4. PDF DESIGN SYSTEM

### 4.1 Layout Specification (A4)

```
Page: 595.28 × 841.89pt (A4)
Margins: top 10, bottom 60, left 40, right 40

┌─────────────────────────────────────────────┐  ← Syndicate header band (accentColor, ~55pt)
│  ORG NAME (white bold 15pt)  [QR CODE]      │     Name | Registration | Address | Contact
├─────────────────────────────────────────────┤  ← Document type band (accentColor -18, ~30pt)
│  DOCUMENT TYPE LABEL    Réf: XXX  Date      │
├─────────────────────────────────────────────┤
│  Document Title (13pt bold)                  │  margin-top: 18pt
│                                              │
│  ┌──────────┬───────────────────────────┐   │
│  │ Meta key │ Meta value (bold)          │   │  metaTable: 2-col, row-striped
│  └──────────┴───────────────────────────┘   │
│                                              │
│  ▍ SECTION TITLE                            │  ← Colored 3pt left bar + uppercase label
│  Body paragraph (10pt, 1.55 line-height)     │
│                                              │
│  ┌─────────────────────────────────────┐    │  ← For mise en demeure: red warning box
│  │  ⚠ DÉLAI / ✓ AUTORISATION          │    │    accentColor tinted table
│  └─────────────────────────────────────┘    │
│                                              │
│  Signature ________________    ○ ─ ─ ─ ─ ○  │  ← Signatory line + dashed stamp ellipse
│  Le Président du Syndicat     CACHET        │
│                                              │
│  Ce document porte la référence...           │  ← Legal footer notice (8pt centered)
├─────────────────────────────────────────────┤
│  Org Name · Réf: XXX              Page 1/N  │  ← Page footer (7.5pt muted)
└─────────────────────────────────────────────┘
```

### 4.2 Typography Scale

| Style | Font | Size | Weight | Color | Usage |
|---|---|---|---|---|---|
| `headerOrgName` | DejaVu / Helvetica | 15pt | Bold | #ffffff | Org name in header band |
| `headerMeta` | DejaVu | 7.5pt | Regular | #ffffffcc | Reg number, address in header |
| `headerContact` | DejaVu | 7.5pt | Regular | #ffffffaa | Phone, email, website |
| `docTypeLabel` | DejaVu | 14pt | Bold | #ffffff | Document type band |
| `docTitle` | DejaVu | 13pt | Bold | #1e293b | Main document title |
| `docRef` | DejaVu | 9pt | Regular | #64748b | Ref number, date in type band |
| `sectionTitle` | DejaVu | 9pt | Bold | accentColor | Section labels (uppercase) |
| `metaKey` | DejaVu | 9pt | Regular | #64748b | Left column of meta table |
| `metaVal` | DejaVu | 9.5pt | Bold | #1e293b | Right column of meta table |
| `body` | DejaVu | 10pt | Regular | #334155 | Main body text (1.55 leading) |
| `bodyArabic` | Amiri | 11pt | Regular | #334155 | Arabic RTL text (1.6 leading) |
| `signLabel` | DejaVu | 9pt | Italic | #64748b | "Signature et cachet :" |
| `signName` | DejaVu | 9pt | Bold | #1e293b | Signatory name below line |
| `notice` | DejaVu | 8pt | Italic | #94a3b8 | Legal verification footer notice |
| `footer` | DejaVu | 7.5pt | Regular | #94a3b8 | Page footer |
| `watermark` | DejaVu | 72pt | Bold | #e2e8f0 | BROUILLON / EN COURS diagonal |

### 4.3 Color System

| Variable | Default | Source | Usage |
|---|---|---|---|
| `accentColor` | `#6366f1` | `syndicatesTable.logoColor` | Header bands, section bars, stamp circles |
| `accentColor -18` | darker | computed | Document type label band |
| `accentColor + "15"` | 8% opacity | computed | Section tinted background boxes |

### 4.4 QR Code Specification

```
URL format:   https://syndycat.ma/verify/<documentNumber>
Size:         160 × 160px (rendered at 58pt in PDF)
Error level:  M (15% recovery)
Colors:       dark #1e293b / light #ffffff
Position:     Top-right of header band
```

### 4.5 Watermarks

| Document Status | Watermark Text | Color |
|---|---|---|
| `draft` | BROUILLON | #e2e8f0 (very light) |
| `generated` | EN COURS | #e2e8f0 |
| `pending_review` | EN RÉVISION | #e2e8f0 |
| `validated`, `signed`, `published`, `archived` | None | — |

### 4.6 Arabic/RTL Support

**Font:** Amiri (OFL-licensed, by the Khaled Hosny / Alif Type foundry)
**Activation:** Place `Amiri-Regular.ttf` (+ optionally `Amiri-Bold.ttf`) in `artifacts/api-server/fonts/`
**Style:** `bodyArabic` — font: Amiri, 11pt, alignment: right, lineHeight: 1.6
**Usage:** Pass RTL text to `contentSection(title, text, color, isRtl=true)`

```bash
# One-time setup:
mkdir -p artifacts/api-server/fonts
curl -L "https://github.com/aliftype/amiri/releases/download/1.000/Amiri-1.000.zip" -o /tmp/amiri.zip
unzip -j /tmp/amiri.zip "Amiri-Regular.ttf" "Amiri-Bold.ttf" -d artifacts/api-server/fonts/
# Restart API server — font auto-registers at boot
```

---

## 5. WORKFLOW DIAGRAMS

### 5.1 Document Generation Workflow

```
USER (admin)                API SERVER              PDF ENGINE              GCS STORAGE
    │                           │                       │                       │
    │── POST /documents ────────►│                       │                       │
    │   {title, category,        │                       │                       │
    │    templateId, memberName} │                       │                       │
    │                           │── getSyndicateInfo()  │                       │
    │                           │◄── {name,addr,phone…} │                       │
    │                           │── generateQrDataUrl() │                       │
    │                           │── buildDocDef() ──────►│                       │
    │                           │                       │ buildPdfBuffer()       │
    │                           │◄────────────── PDF Buffer ────────────────────│
    │                           │── uploadBufferToGcs() ─────────────────────────►
    │                           │◄──────────────── /objects/documents/<id>/*.pdf │
    │                           │── INSERT documents                            │
    │◄── 201 {data: doc} ───────│                       │                       │
```

### 5.2 Document Approval Workflow

```
CREATOR          REVIEWER           PRESIDENT          SYSTEM
   │                │                   │                 │
   │ DRAFT          │                   │                 │
   │ generatePDF()  │                   │                 │
   │── PUT status: pending_review ──────────────────────►│
   │                │                   │                 │── notify reviewer
   │                │ review()          │                 │
   │                │── PUT status: validated ──────────►│
   │                │                   │                 │── notify president
   │                │                   │ sign()          │
   │                │                   │── POST /sign ──►│
   │                │                   │                 │── PUT status: signed
   │                │                   │── PUT status: published ─────────────►│
   │                │                   │                 │── notify all members
```

### 5.3 Soft Delete → Restore → Purge Workflow

```
ADMIN                         API                        DB                  GCS
  │                            │                          │                    │
  │── DELETE /documents/:id ──►│                          │                    │
  │                            │── UPDATE is_deleted=true │                    │
  │                            │   deleted_at, deleted_by │                    │
  │◄── 200 {soft-deleted} ────│                          │                    │
  │                            │   [file preserved]       │     [preserved]    │
  │                            │                          │                    │
  │── POST /documents/:id/restore ────────────────────────►                    │
  │                            │── UPDATE is_deleted=false│                    │
  │◄── 200 {restored} ────────│                          │                    │
  │                            │                          │                    │
  │── POST /documents/:id/purge ──────────────────────────►                    │
  │                            │── DELETE FROM documents  │                    │
  │                            │─────────────────────────────────── GCS.delete()
  │◄── 200 {purged} ──────────│                          │                    │
```

### 5.4 Electronic Signature Flow

```
SIGNATORY                    API                         DB
    │                         │                           │
    │── POST /documents/:id/sign                          │
    │   { signatureData: "data:image/svg+xml;base64,…" } │
    │                         │── Validate status ∈ {generated, validated}
    │                         │── INSERT document_signatures
    │                         │   { signed_by, signer_role, ip_address, signature_data }
    │                         │── Count signatures
    │                         │   IF all required signatories signed:
    │                         │── UPDATE status = 'signed'
    │◄── 201 {signature, doc} │                           │
```

---

## 6. SECURITY MODEL

### 6.1 Authentication & Authorization

**JWT Claims:**
```typescript
interface JwtPayload {
  userId: string;
  syndicateId: string;   // must be present for syndicate_admin
  role: "super_admin" | "syndicate_admin" | "member" | "tenant";
}
```

**Syndicate Isolation:** Every query filters `WHERE syndicate_id = jwt.syndicateId` for non-super_admins. Absent `syndicateId` on admin JWT → hard 403 (never falls through to global scope).

### 6.2 Document Access Control

| Operation | super_admin | syndicate_admin | member | tenant |
|---|---|---|---|---|
| List documents | All syndicates | Own syndicate only | Published only | Published only |
| Read document | Any | Own syndicate | Published | Published |
| Generate (POST) | ✓ | ✓ | ✗ | ✗ |
| Update (PUT) | ✓ | ✓ (own) | ✗ | ✗ |
| Soft delete | ✓ | ✓ (own) | ✗ | ✗ |
| Restore | ✓ only | ✗ | ✗ | ✗ |
| Purge | ✓ only | ✗ | ✗ | ✗ |
| Sign | ✓ | ✓ | ✗ | ✗ |
| List signatures | ✓ | ✓ | ✗ | ✗ |
| Download URL | ✓ | ✓ (own) | Published | Published |
| Add comment | ✓ | ✓ | ✓ | ✗ |
| Delete comment | ✓ | Own only | Own only | ✗ |

### 6.3 Signed URL Security

- TTL: 1 hour (3600 seconds)
- Generated by GCS sidecar proxy (mTLS)
- URL never exposed in the mobile app's UI — viewer receives it via `downloadUrl()` API call
- GCS bucket has `Requester Pays: false`, `Public Access: none`

### 6.4 Signature Data Security

- Handwritten SVG stored as base64 in `documentSignaturesTable.signatureData`
- IP address logged at signing time
- `GET /documents/:id/signatures` restricted to `super_admin` + `syndicate_admin` (IDOR guard)
- `onDelete: "restrict"` on `signedBy → users.id` — user deletion blocked if they have signatures

### 6.5 Vulnerability Classes Addressed

| Class | Mitigation |
|---|---|
| IDOR on document reads | `WHERE syndicate_id = ?` on all queries + 404 on cross-tenant access |
| Signature exposure | Role guard on signatures endpoint |
| Silent GCS failure | `generateAndUploadDocument` now throws on upload failure (HTTP 503) |
| Workflow bypass | Mobile client no longer sends `status: "published"` on creation |
| Sign published docs | `"published"` removed from signable states list |
| Hard delete of legal records | All deletions are soft — purge is super_admin only |
| DB orphan on user delete | `signedBy` has `onDelete: "restrict"` |

---

## 7. PERMISSION MATRIX

### 7.1 Full Role × Action Matrix

```
Action                        SA    SyA   Mem   Ten
─────────────────────────────────────────────────────
Generate document             ✓     ✓     ✗     ✗
List own-syndicate docs       ✓     ✓     ✓pub  ✓pub
Read document detail          ✓     ✓own  ✓pub  ✓pub
Download signed URL           ✓     ✓own  ✓pub  ✓pub
Update title/content          ✓     ✓own  ✗     ✗
Change workflow status        ✓     ✓own  ✗     ✗
Sign document                 ✓     ✓own  ✗     ✗
View signatures               ✓     ✓own  ✗     ✗
Add comment                   ✓     ✓     ✓     ✗
Edit own comment              ✓     ✓own  ✓own  ✗
Delete any comment            ✓     ✓own  ✗     ✗
Soft-delete document          ✓     ✓own  ✗     ✗
Restore soft-deleted          ✓     ✗     ✗     ✗
Purge (permanent delete)      ✓     ✗     ✗     ✗
View audit trail              ✓     ✓own  ✗     ✗
Export all documents          ✓     ✓own  ✗     ✗
─────────────────────────────────────────────────────
SA=super_admin  SyA=syndicate_admin  Mem=member  Ten=tenant
pub=published only  own=own syndicate only
```

### 7.2 Signatory Role Assignment

| Signatory Title | JWT Role Required | Notes |
|---|---|---|
| Président du Syndicat | `syndicate_admin` with `presidentRole` | Default for most docs |
| Secrétaire Général | `syndicate_admin` with `secretaireRole` | PV, Compte-rendu |
| Trésorier | `syndicate_admin` with `tresorierRole` | Financial reports |
| Manager / Directeur | `syndicate_admin` | Contrats, Conventions |

*Note: Bureau role sub-types (`presidentRole`, `secretaireRole`, `tresorierRole`) require a `bureauRoleTable` — not yet implemented. Currently any `syndicate_admin` can sign any document.*

---

## 8. NOTIFICATION MATRIX

### 8.1 In-App Notification Triggers

| Event | Recipient | Channel | Message |
|---|---|---|---|
| Document generated | Creator | In-app | "Votre document X a été généré" |
| Status → pending_review | All admins of syndicate | Push + In-app | "Document X soumis à révision" |
| Status → validated | Creator | In-app | "Votre document X a été validé" |
| Status → rejected (returned to draft) | Creator | Push + In-app | "Document X renvoyé en rédaction" |
| Signature requested | Designated signatory | Push + In-app | "Signature requise : X" |
| Status → signed | Creator + admins | In-app | "Document X a été signé" |
| Status → published | All syndicate members | In-app | "Nouveau document publié : X" |
| Document expiring in 30 days | Admins | Push + In-app | "X expire dans 30 jours — renouvellement recommandé" |
| Comment added | Document creator + mentioned users | In-app | "Nouveau commentaire sur X" |
| Mention in comment | Mentioned user | Push + In-app | "Vous êtes mentionné dans X" |
| Soft delete | Admins | Audit log only | Logged: "Document X supprimé par Y" |
| Restore | Admins | Audit log + In-app | "Document X restauré par Y" |

### 8.2 Email Notification Triggers (via SMTP)

| Event | Recipients | Template |
|---|---|---|
| Published document | All active members | `doc_published.html` |
| Signature request | Signatory | `doc_sign_request.html` |
| Expiry warning (30d) | President + Secretary | `doc_expiry_warning.html` |

*Note: SMTP is configured but disabled in development (SMTP_HOST/SMTP_PASS not set). Emails are console-logged in dev mode.*

---

## 9. ARCHIVE STRATEGY

### 9.1 Retention Periods by Document Type

| Category | Legal Retention | Basis |
|---|---|---|
| Statuts / Certificats | Permanent | Constitutif |
| PV d'Assemblée Générale | 30 ans | Légal (droit syndical marocain) |
| Contrats | 10 ans après expiration | Code des Obligations |
| Rapports financiers | 10 ans | Code Général de Normalisation Comptable |
| Décisions syndicales | 20 ans | Jurisprudence |
| Attestations | 5 ans | Usage |
| Circulaires / Notes internes | 3 ans | Opérationnel |
| Mises en demeure | 10 ans | Procédural |
| Accords collectifs | Durée + 10 ans | Code du Travail |

### 9.2 Soft Delete → Archive → Purge Lifecycle

```
ACTIVE ──→ SOFT_DELETED ──→ [retain for retention_period_years] ──→ PURGE
  │                │
  │                └──→ RESTORE (super_admin, within 90 days)
  └──→ ARCHIVED (status=archived, is_deleted=false, legal hold)
```

**Rules:**
- `DELETE /documents/:id` → soft delete only (is_deleted = true, file preserved)
- `POST /documents/:id/restore` → only while `is_deleted = true` (super_admin only)
- `POST /documents/:id/purge` → requires `is_deleted = true` (two-step safety)
- Documents with `status = archived` are never soft-deleted without explicit override
- Retention period scanned daily — purge eligibility calculated from `deleted_at + retention_period_years`
- GCS deletion logs written to `audit_logs` table before purge

### 9.3 Legal Hold

A document on legal hold cannot be purged even after retention period expires:
```sql
ALTER TABLE documents ADD COLUMN legal_hold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN legal_hold_reason TEXT;
ALTER TABLE documents ADD COLUMN legal_hold_set_by TEXT REFERENCES users(id);
```

### 9.4 Recycle Bin

Admin interface showing all `is_deleted = true` documents with:
- Deleted by, deleted at
- Days remaining until purge eligibility
- Restore / Purge actions (super_admin only)

*Not yet implemented in mobile UI — recommended for Sprint 3.*

---

## 10. PRODUCTION ROADMAP

### Sprint 1 — Critical Fixes (✅ COMPLETED)

| # | Task | Status |
|---|---|---|
| 1.1 | Remove hardcoded `status:"published"` from mobile generate | ✅ Done |
| 1.2 | Fix `statusConfig()` crash on unknown statuses | ✅ Done |
| 1.3 | Secure signatures endpoint (add RBAC guard) | ✅ Done |
| 1.4 | Fix `documentSignaturesTable.signedBy` FK (set null → restrict) | ✅ Done |
| 1.5 | Remove GCS silent failure swallow | ✅ Done |
| 1.6 | Add loading state to generate button | ✅ Done |
| 1.7 | Implement soft delete with restore + purge | ✅ Done |
| 1.8 | Push schema migration to production DB | ✅ Done |

### Sprint 2 — Document Engine Redesign (✅ COMPLETED)

| # | Task | Status |
|---|---|---|
| 2.1 | Full PDF engine rewrite — professional A4 layout | ✅ Done |
| 2.2 | Full syndicate branding (8 fields from DB) | ✅ Done |
| 2.3 | QR code verification embedded in every PDF | ✅ Done |
| 2.4 | Watermarks for non-final documents | ✅ Done |
| 2.5 | Expand from 9 to 20 document templates | ✅ Done |
| 2.6 | In-app WebView PDF viewer (iOS native + pdf.js) | ✅ Done |
| 2.7 | Real-time download progress (%, KB/s, time, cancel, retry) | ✅ Done |
| 2.8 | Document dashboard — 8 widgets + pipeline visualizer | ✅ Done |
| 2.9 | Document comments (schema + API + mobile UI) | 🔄 In progress |
| 2.10 | `templateId` direct override in POST body | ✅ Done |
| 2.11 | All 20 templates in mobile generate modal | ✅ Done |
| 2.12 | Architecture document | ✅ Done |

### Sprint 3 — Collaboration & Signatures (Next)

| # | Task | Priority |
|---|---|---|
| 3.1 | Handwritten signature canvas in mobile (SVG capture) | High |
| 3.2 | Signature order enforcement (President must sign last) | High |
| 3.3 | Bureau role sub-types (President / Secretary / Treasurer) | High |
| 3.4 | Document version history table + API | Medium |
| 3.5 | Document review approval/rejection with comments | Medium |
| 3.6 | @mention support in comments + push notification | Medium |
| 3.7 | Recycle bin screen (soft-deleted documents list) | Medium |
| 3.8 | Retention period + expiry fields in schema | Medium |
| 3.9 | Daily expiry scan + push notifications | Low |
| 3.10 | Legal hold flag + UI | Low |

### Sprint 4 — Advanced Features (Roadmap)

| # | Task | Priority |
|---|---|---|
| 4.1 | Document version diff viewer (change tracking) | High |
| 4.2 | Bulk generate (template + member list) | Medium |
| 4.3 | Document export package (ZIP with all signed PDFs) | Medium |
| 4.4 | Offline draft mode with sync | Medium |
| 4.5 | Print support (iOS AirPrint, Android Print Manager) | Medium |
| 4.6 | Arabic/RTL template variants (Amiri font activation) | High |
| 4.7 | Template customization UI (admin branding editor) | Low |
| 4.8 | DocuSign / SignNow integration (external eSign) | Low |
| 4.9 | GDPR/CNDP data export for document metadata | Low |
| 4.10 | Automated retention period purge cron job | Medium |

### Recommended Tech Choices for Sprint 3

| Feature | Recommended Package | Expo Go Compatible |
|---|---|---|
| Handwritten signature | `react-native-signature-canvas` (WebView-based) | ✅ Yes |
| Advanced PDF viewer | `expo-web-browser` (SFSafariViewController) | ✅ Yes |
| In-app print | `expo-print` | ✅ Yes |
| Offline drafts | `@react-native-async-storage/async-storage` (already installed) | ✅ Yes |
| Real-time collaboration | WebSocket (already have chat infrastructure) | ✅ Yes |

---

## APPENDIX A — API Endpoint Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/documents` | any | List documents (filtered by role) |
| GET | `/api/documents/:id` | any | Get document + metadata |
| POST | `/api/documents` | admin | Generate PDF + create record |
| PUT | `/api/documents/:id` | admin | Update title/content/status |
| DELETE | `/api/documents/:id` | admin | Soft delete |
| POST | `/api/documents/:id/restore` | super_admin | Restore soft-deleted |
| POST | `/api/documents/:id/purge` | super_admin | Permanent delete (post-soft-delete) |
| GET | `/api/documents/:id/download-url` | admin+member | Get 1h signed download URL |
| POST | `/api/documents/:id/sign` | admin | Record electronic signature |
| GET | `/api/documents/:id/signatures` | admin | List signatures |
| GET | `/api/documents/:id/comments` | admin+member | List comments |
| POST | `/api/documents/:id/comments` | admin+member | Add comment |
| DELETE | `/api/documents/:id/comments/:cid` | admin+author | Soft-delete comment |

## APPENDIX B — Environment Variables Required

| Variable | Purpose | Set in |
|---|---|---|
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | GCS bucket for PDFs | Replit Secrets |
| `PRIVATE_OBJECT_DIR` | GCS object directory path | Replit Secrets |
| `PUBLIC_OBJECT_SEARCH_PATHS` | GCS read search paths | Replit Secrets |
| `SESSION_SECRET` | JWT signing secret | Replit Secrets |
| `SMTP_PASS` | Email delivery | Replit Secrets |

## APPENDIX C — Font Assets Required

| Font | File | Purpose | Required |
|---|---|---|---|
| DejaVu Sans | `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` | Latin / Extended body text | Auto (system) |
| DejaVu Sans Bold | `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` | Bold headings | Auto (system) |
| Amiri Regular | `artifacts/api-server/fonts/Amiri-Regular.ttf` | Arabic RTL text | Manual install |
| Amiri Bold | `artifacts/api-server/fonts/Amiri-Bold.ttf` | Arabic bold | Optional |
