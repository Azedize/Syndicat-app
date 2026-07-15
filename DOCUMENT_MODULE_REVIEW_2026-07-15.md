# Document Management Module — Full Re-Review Against Original Spec
**Date:** 2026-07-15
**Method:** Direct source inspection (schema, PDF engine, API routes, mobile screens). Every claim below is backed by a file reference gathered from live code, not from prior audit reports.

**Files reviewed:** `lib/db/src/schema.ts` (documents/signatures/sequences tables), `artifacts/api-server/src/lib/documentPdf.ts`, `artifacts/api-server/src/lib/document-retention-job.ts`, `artifacts/api-server/src/lib/notify.ts`, `artifacts/api-server/src/lib/email/emailService.ts`, `artifacts/api-server/src/routes/documents.ts`, `artifacts/api-server/src/routes/pdf.ts` (badges), `artifacts/mobile/app/documents.tsx`, `documents-dashboard.tsx`, `pdf-viewer.tsx`, `context/LanguageContext.tsx`.

---

## 1. Database Design — ✅ mostly solid

- `documentsTable`: title, category, content, status, syndicateId, fileUrl, documentNumber, templateId, version, signedAt/signedBy, publishedAt/archivedAt, soft-delete (isDeleted/deletedAt/deletedBy), legal `retentionUntil`, `autoArchived`.
- `documentSignaturesTable`: per-signer row (documentId, signedBy, signerRole, signatureData, signatureOrder, ipAddress) — one signature per (document, signer) enforced by a unique index.
- `documentSequencesTable`: atomic per-syndicate/prefix/year counter for real sequential numbering.
- **Gap:** No `documentVersionsTable`. `version` is a bare integer counter — once a document is edited, the previous content/file is gone. The spec explicitly asks for "Versioning required. Keep complete history." This is not met.
- **Gap:** No `badgesTable` — badges are generated on the fly from `usersTable`, with no persisted record, no revocation, no audit trail of who was issued a badge or when.
- **Gap:** No attachments table — the module stores exactly one PDF per document row; there's no way to attach supporting images/receipts to a document as the spec requests.

## 2. Document Workflow — ⚠️ partially met

- Real 7-status machine (`draft → generated → pending_review → validated → signed → published → archived`) enforced server-side via `ALLOWED_TRANSITIONS`, invalid transitions rejected with 422.
- **Gap:** No `rejected` status anywhere in `VALID_STATUSES`/`ALLOWED_TRANSITIONS` — the spec explicitly lists "Document rejected" as a workflow outcome and notification trigger; there is no way to reject a document in this system today.
- **Gap:** No `expired` status on a document itself. The retention job (`document-retention-job.ts`) only sends an aggregate 30-day warning to admins ("N documents approaching retention limit") — it never flips an individual document to an "expired" state or notifies the document's owner, contradicting the spec's per-document "Document expired" notification.

## 3. PDF Architecture — ⚠️ good foundation, several spec items unmet

- Logo: ✅ real embedding — `fetchLogoDataUrl` pulls `syndicatesTable.logoUrl`, base64-encodes it, and `buildHeaderBand` renders it as an actual image.
- **Gap:** No "professional default logo" fallback — if a syndicate has no logo, the header just leaves blank space instead of the spec's required generic default mark.
- QR code: ✅ generated per document, but **hardcoded to `https://syndycat.ma/verify/{docNumber}`** — not derived from the actual deployment domain or an env var, so scanning it will 404 in this environment and in any real deployment that isn't that exact domain.
- Document numbering: ⚠️ real atomic sequence exists (`documentSequencesTable`) but several templates still fall back to `TEMPLATE-Date.now()` if a number isn't explicitly passed in — not every generation path uses the sequence.
- Signature block: ❌ **static "CACHET OFFICIEL" placeholder text**, not a rendering of the actual stored signature. `documentSignaturesTable.signatureData` (captured on the mobile signature pad) is never read back into the PDF. Multi-signature hierarchy (President → Treasurer → Secretary) exists only as hardcoded 2-3 column layouts on a couple of templates, not a dynamic per-document sequence of whoever actually signed.
- Arabic/RTL: ⚠️ Amiri font files *do* exist and are registered, and paragraphs get right-alignment when `isRtl` is set — but this is per-paragraph alignment, not a true RTL-flowed document (no mirrored layout, no `rtl: true` flag), so it's a partial implementation rather than production-grade Arabic typesetting.
- Multilingual (French/English/Spanish): the template functions accept a `t()` translation helper, but there is **no UI path anywhere in the mobile app that lets a user choose a document's language** (see §7) — so in practice every document generated today is French regardless of the spec's 4-language requirement.
- ✅ Watermarks ("BROUILLON"/"EN COURS"), page numbering, and a QR-linked verification footer are implemented.

## 4. Storage Architecture — ✅ core flow solid, retention/versioning incomplete

- Real GCS upload, internal `/objects/documents/{uuid}/{file}` path, signed 1h download URLs via the Replit sidecar, GCS delete on hard-delete.
- Soft-delete + recycle-bin + legally-computed `retentionUntil` + a dry-run-by-default purge scheduler that hard-deletes only past-retention + already-soft-deleted-30+-days documents, logging every decision to the audit log.
- **Gap (repeats §1):** no version history, no attachment storage beyond the single PDF.

## 5. Signature Workflow — ❌ largest gap in the module

- Backend correctly restricts signing to `generated`/`validated` status and records signer identity, role, timestamp, IP, and raw signature-pad data, one row per signer.
- **But the generated PDF never reflects any of this** — it always shows the same static stamp graphic regardless of who actually signed, in what order, or whether all required signers have signed yet. This defeats the purpose of a "signature workflow" from the end user's perspective: the document you download never visibly proves it was signed by the people the system says signed it.
- No enforced sequential hierarchy (e.g. Treasurer cannot sign before President) — `signatureOrder` exists on the schema but nothing in `routes/documents.ts` reads/enforces it.

## 6. QR Verification Workflow — ⚠️ present but non-functional in this environment

- Every document gets a unique QR pointing at a verify URL; a public verify endpoint exists for badges (`GET /verify/badge/:userId`), but the equivalent **document** verification endpoint behind the QR URL (`https://syndycat.ma/verify/{docNumber}`) does not exist in this codebase and the domain isn't this project's real domain — scanning any generated document's QR code today leads nowhere.

## 7. Multilingual Workflow — ❌ not reachable by users today

- 4 languages exist in the mobile app's `LanguageContext` (fr/en/ar/es) and RTL is force-applied app-wide on switch (with a documented restart requirement).
- **Gap:** this is only the *app UI* language. Nothing threads a language choice into document generation — `handleGenerate` in `documents.tsx` never sends a `lang` parameter, so every generated PDF is French regardless of the requester's app language or role. The spec's requirement that *documents* (not just the UI) be multilingual is unmet in practice.

## 8. Badge Workflow — ⚠️ functional but shallow

- Badges render for 4 role tiers (super_admin/syndicate_admin/member/tenant) with distinct color themes, a QR code, badge ID, CIN, join date, and status (ACTIF/SUSPENDU) — generated live from `usersTable`.
- **Gap:** the spec's full role list (President, Treasurer, Secretary, Board Member, Owner, Employee, Security Agent, Contractor) collapses into the same 4 RBAC tiers — there's no visual/data distinction for a Treasurer vs. a generic member, for example, even though `conseilSyndicalTable` holds that role data elsewhere in the app.
- **Gap:** no real member photo — likely initials/placeholder avatar (not confirmed as present).
- **Gap:** no validity/expiry date on the badge, and no persisted badge record (§1) — so a revoked or suspended badge still has no audit trail beyond the user's live `status` field.
- ICE/RC numbers exist in the schema but are not rendered on badges or the membership certificate.

## 9. Security Design — ✅ meets the spec's stated RBAC model

- Super admin: unrestricted (including restore/purge).
- Syndicate admin: hard-scoped to `doc.syndicateId === req.user.syndicateId` on every read/write route.
- Member/tenant: restricted to `published` documents within their own syndicate — matches "own personal / lease-related documents only" in spirit, though members and tenants are not yet differentiated (no lease-specific document scoping distinct from generic member scoping).
- This is the one area of the original spec that is essentially production-ready as built.

## 10. Notifications — ⚠️ partially met

- "Document generated / signed / published" fire real in-app alerts + push (via `createAlert` → `alertsTable` + Expo push token lookup, correctly scoped by syndicate).
- **Gap:** Email is never used for document events — `createAlert` only writes an in-app row and sends push; the SMTP-backed `sendEmail`/`sendEmailToMany` helpers exist elsewhere in the codebase but are not called from any document lifecycle event, so the spec's "Email" channel is unimplemented for documents specifically.
- **Gap:** "Document rejected" and "Document updated" notifications don't exist (no rejected status; PUT updates don't notify anyone). "Document expired" is only an aggregate admin-facing warning, not a per-document, per-owner notification.

---

## Production Readiness Score: **54 / 100**

| Area | Score | Why |
|---|---|---|
| Database design | 7/10 | Solid core; missing version history, badge, and attachment tables |
| Document workflow | 6/10 | Real state machine, but no reject/expire states |
| PDF architecture | 6/10 | Real logo/QR/numbering pipeline, but signatures are cosmetic and language is unreachable |
| Storage architecture | 7/10 | Real GCS + retention + recycle bin; no version retrieval |
| Signature workflow | 2/10 | Data is captured correctly but never rendered — the visible "proof" of signing doesn't exist |
| QR verification | 3/10 | Codes generate but point to a dead/hardcoded domain with no backing verify route for documents |
| Multilingual workflow | 2/10 | Infrastructure exists (fonts, translation helper, app-level language) but is not wired to document generation |
| Badge workflow | 5/10 | Works for 4 tiers, missing the extended role set, photo, validity, and persistence |
| Security design | 9/10 | RBAC matches spec closely |
| Notifications | 5/10 | In-app + push work; email, rejection, and per-document expiry are missing |

**Overall assessment:** the module has a genuinely production-grade *storage and security* backbone (real GCS pipeline, retention/purge job, tight RBAC), but the features that make a document *trustworthy* to a Moroccan condominium's actual legal/administrative use — visible multi-signature proof, working QR verification, and real multilingual output — are either cosmetic or unreachable from the UI today. The single highest-impact fix would be making the signature block render actual captured signatures; the QR domain and rejection/expiry states are close seconds.
