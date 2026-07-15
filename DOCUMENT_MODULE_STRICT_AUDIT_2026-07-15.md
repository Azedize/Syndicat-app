# Documents Module — Strict Verification Audit
**Date:** 2026-07-15
**Method:** Direct source/schema/route inspection only. No documentation, prior reports, comments, or TODOs were trusted as evidence — every claim below is backed by a file path + line reference, and dead-code/config claims (e.g. Arabic fonts) were confirmed by searching the actual filesystem for the referenced assets.

**Primary files audited:**
- `artifacts/api-server/src/lib/documentPdf.ts` (PDF generation engine)
- `artifacts/api-server/src/routes/documents.ts` (API)
- `lib/db/src/schema.ts` (`documentsTable`, `documentSignaturesTable`, `documentCommentsTable`, `syndicatesTable`)
- `artifacts/mobile/app/pdf-viewer.tsx`, `documents.tsx`, `documents-dashboard.tsx`
- `artifacts/api-server/src/routes/statistics.ts`

---

## 1. Document Template Verification

All 20 requested templates exist as generation functions in `documentPdf.ts` (keys: `attestation`, `convocation`, `pv`, `rapport`, `contrat`, `decision`, `certificat`, `circulaire`, `mise_en_demeure`, `demande_administrative`, `autorisation`, `ordre_de_mission`, `lettre_officielle`, `note_interne`, `rapport_financier`, `rapport_activite`, `rapport_audit`, `convention_partenariat`, `accord_collectif`, `compte_rendu`).

| Checklist item | Status | Evidence |
|---|---|---|
| Template exists (all 20) | ✅ | `documentPdf.ts:496-1200` |
| Generate button/endpoint | ✅ | `POST /documents` accepts `templateId`, calls `generateAndUploadDocument` |
| PDF generated | ✅ | `buildPdfBuffer` via `pdfmake`, uploaded to GCS |
| PDF opens/downloads (mobile) | ✅ | `pdf-viewer.tsx` (WebView), `documents.tsx` download flow |
| PDF contains logo | ❌ | `syndicatesTable.logoUrl` exists but is **never read** in `documentPdf.ts` — header uses a flat color band (`accentColor`), not an image (`documentPdf.ts:152`, confirmed via grep — zero references to `logoUrl` in the PDF engine) |
| Organization identity (name/address/phone/email/website/reg. number) | ✅ | `buildHeaderBand`, `documentPdf.ts:111-203`, populated from `getSyndicateInfo()` in `documents.ts:57-` |
| Header / Footer | ✅ | `buildHeaderBand` (111-203), footer fn (482-488) |
| QR Code | ✅ | Generated per-doc pointing to `https://syndycat.ma/verify/{docNumber}` (95-107, 128-130) — **note: this is a hardcoded external domain that isn't configurable and isn't this project's actual deployment domain**, so scanning it in production will 404 |
| Verification code | ✅ | Embedded in `legalFooterNote` (300-307) |
| Signature section | ✅ | `signatureBlock` (262-298) — static "CACHET OFFICIEL" placeholder, not a rendered signature image (see §7) |
| Arabic rendering | ❌ | Code path exists (`isRtl` flag, `Amiri` font registration, `documentPdf.ts:50-65`) but **no `Amiri-Regular.ttf`/`Amiri-Bold.ttf` files exist anywhere in the repo** (filesystem search returned zero matches). `existsSync()` guard silently fails and `ARABIC_FONT` falls back to the Latin font. Any Arabic content will render as tofu/garbled glyphs, not Arabic script. **This is a claimed-but-non-functional feature.** |
| French rendering | ✅ | Default font path, confirmed working (Roboto via pdfmake defaults) |
| Mixed content | ⚠️ | `contentSection(..., isRtl)` toggles alignment per block, but since Arabic glyphs aren't renderable at all, "mixed" content is moot until fonts are added |

## 2. Branding Verification

| Element | Status | Evidence |
|---|---|---|
| Syndicate logo | ❌ | Stored (`syndicatesTable.logoUrl`, schema.ts:51) but not consumed by the PDF engine |
| Organization name | ✅ | `syndicatesTable.name` → header |
| Acronym | ✅ | `abbreviation` field exists and is used |
| Address | ✅ | `address` + `city` |
| Phone | ✅ | `phone` |
| Email | ✅ | `email` |
| Website | ✅ | `website` |
| Registration number | ✅ | `registrationNumber` |
| Tax identifier | ✅ | `iceNumber` (Moroccan ICE, used as tax id) |

**Missing:** logo image embedding — the single most visible branding element is absent from every generated PDF despite the data existing in the database.

## 3. PDF Preview Verification (mobile)

| Item | Status | Evidence |
|---|---|---|
| In-app PDF viewer (no raw URL exposure) | ✅ | `pdf-viewer.tsx` — WebView, native WebKit on iOS, pdf.js on Android |
| Zoom | ✅ | Viewport meta config (line ~46) |
| Search-in-PDF | ❌ | Not implemented in the custom toolbar/JS shell |
| Page navigation | ✅ | Page counter (line ~242) |
| Share | ✅ | Share action (line ~251) |
| Print | ❌ | No print action found in viewer or download flow |
| Download | ✅ | `FileSystem.createDownloadResumable` |

## 4. Download Experience Verification

| Item | Status | Evidence |
|---|---|---|
| Progress bar | ✅ | `documents.tsx:262-294`, animated progress value |
| File size displayed | ✅ | MB downloaded / total (lines ~515-521) |
| Remaining time displayed | ✅ | ETA computed from speed |
| Retry button | ✅ | "Réessayer" on error state |
| Error state | ✅ | Dedicated error phase |
| Success state | ✅ | Completion phase before share |
| Offline support | ❌ | Files land in `FileSystem.cacheDirectory` but there is no persisted index of downloaded docs, no offline document list/browser — cache can be evicted by the OS at any time with no re-download prompt |
| Expired signed URL handling | ⚠️ | Not explicitly handled as an error case; mitigated only because a fresh signed URL is fetched immediately before every download attempt (not a true "handle expiry mid-download" flow) |

## 5. Soft Delete Verification

| Item | Status | Evidence |
|---|---|---|
| `deleted_at` | ✅ | `documentsTable.deletedAt`, schema.ts:965 |
| `deleted_by` | ✅ | `documentsTable.deletedBy`, schema.ts:966 |
| Recycle bin (list deleted docs) | ❌ | No `GET` route filters `isDeleted: true` anywhere in `documents.ts` — deleted documents are simply invisible; there is no endpoint or mobile screen to browse/find them |
| Restore | ✅ | `POST /documents/:id/restore`, super_admin only (418-453) |
| Purge (hard delete) | ✅ | `POST /documents/:id/purge` — deletes DB row + GCS object, super_admin only (458-491) |
| Retention policy | ❌ | No scheduled job auto-purges after a retention window; purge is manual-only, so "legal retention" claimed in the file header comment is not actually enforced by any policy/cron |
| Audit history preserved | ✅ | `serverAuditLog` fires on delete/restore/purge; audit table is independent of `documentsTable` |
| No hard delete used inappropriately | ✅ | `DELETE /documents/:id` is soft (sets flags); true hard delete only exists behind the explicit `/purge` endpoint |

## 6. Document Workflow Verification

Actual state machine (simpler than the audit's assumed 8-stage flow):
```
draft → generated → pending_review → validated → signed → published → archived
```
(`documents.ts:36-47`). There is no distinct "Review" vs "Validation" vs "Approval" as separate actor-gated stages — `pending_review` and `validated` are the only two intermediate states, collapsing "review/validation/approval" into one step each.

| Transition control | Status | Evidence |
|---|---|---|
| UI | ✅ | Mobile status-change actions call `PUT /documents/:id` |
| API enforcement | ✅ | `isTransitionAllowed()` checked in `PUT` handler (314-323); invalid transitions return 422 |
| Validation | ✅ | Zod schema on body |
| Permission check | ✅ | `requireRole("super_admin","syndicate_admin")` on `PUT` |
| Audit log | ✅ | `DOCUMENT_UPDATED` action logged |
| Notification | ⚠️ | Only fires on transition **to `published`** (352-360) — no notification on review/validation/signed transitions |
| Invalid-transition bypass | ❌ (bug) | `POST /documents/:id/sign` sets `status: "signed"` directly (line 533) **without calling `isTransitionAllowed()`** — it only checks the current status is `generated` or `validated` inline, bypassing the central state-machine guard. This is an inconsistent enforcement path, not a hard security hole, but it means the workflow guard is not uniformly applied. |

## 7. Signature Verification

| Item | Status | Evidence |
|---|---|---|
| Handwritten mobile signature pad | ❌ | No signature-pad/canvas library found in `artifacts/mobile/package.json` or components; `signatureData` field exists in the API contract but nothing in the mobile app actually captures a hand-drawn signature image to send |
| Signature image storage | ⚠️ | `documentSignaturesTable.signatureData` column exists and is stored blindly if sent, but since no client captures real signature ink, this path is effectively unused in practice |
| Multiple signatures | ✅ (storage only) | Table allows N rows per document |
| Signature order/sequencing | ❌ | No `order`/`sequence` column or enforcement — signatures are just timestamp-ordered, not sequenced by required role order (e.g. Secretary must sign before President) |
| Signature validation (dup prevention) | ❌ | `sign` route blindly inserts a new row every call — a user can sign the same document twice; no unique constraint or duplicate check |
| Signature audit trail | ✅ | `ipAddress`, `signedAt`, `signerRole`, `syndicateId` captured per signature; `serverAuditLog` also fires |
| Role-specific signature (President/Secretary/Treasurer/Manager/Director) | ❌ | `signerRole` is just whatever `req.user.role` is (from the general RBAC roles: `super_admin`/`syndicate_admin`/`member`/`tenant`) — there is no concept of syndicate office-holder roles (President, Secretary, Treasurer) tied to signatures anywhere in the schema |

**Verdict: Signatures are a database-only feature.** The PDF's "signature section" is a static "CACHET OFFICIEL" placeholder graphic, not a rendered image of an actual captured signature, and the mobile app has no UI to draw/capture one.

## 8. Collaboration Verification

| Item | Status | Evidence |
|---|---|---|
| Comments | ✅ | `documentCommentsTable`; `GET/POST/DELETE /documents/:id/comments` (593-713) |
| @Mentions | ❌ | No mention parsing/table found |
| Review requests | ❌ | No dedicated request/assignment table — only the generic status field |
| Approval requests | ❌ | Same — `validated` is a status flip, not an assignable approval task with an approver list |
| Version history | ❌ | Only a single `version` integer counter on `documentsTable` (incremented on update) — no stored snapshots of prior content/PDF, so "history" cannot actually be viewed or diffed |
| Change tracking | ⚠️ | Only via generic audit log entries (action name + actor), not field-level diffs |

**IDOR note (see §10):** the comments routes fetch the document by `id` alone (not scoped by `syndicateId` at the DB level) and rely entirely on an in-code role/tenant check afterward. Functionally it currently blocks cross-tenant access correctly, but it's a fragile pattern (one missed `if` away from a leak) rather than defense-in-depth query scoping used elsewhere in the same file.

## 9. Dashboard Verification

| Widget | Status | Evidence |
|---|---|---|
| Drafts / Pending Review / Pending Approval / Pending Signature / Published / Archived / Expiring / Recently Modified | ⚠️ | All 8 widgets render in `documents-dashboard.tsx:94-166`, **but none come from a backend summary endpoint** — they're computed client-side via `Array.filter` over the full documents list already in memory (`byStatus()`, lines 55-56) |
| "Expiring Documents" count | ❌ (fake) | Not a real expiry field on documents at all — it's approximated as `age > 345 days since d.date`, i.e. a guessed staleness heuristic, not an actual expiration/renewal date tracked anywhere in the schema |
| Counts correct | ⚠️ | Correct relative to the data the client already has, but this doesn't scale (no server-side aggregation) and diverges from the pattern used elsewhere (e.g. `statistics.ts` does have a real grouped-count query, just not exposed to this screen) |

## 10. Security Verification

| Item | Status | Evidence |
|---|---|---|
| RBAC | ✅ | `requireRole` guards write/admin endpoints (create, update, delete, sign, restore, purge) |
| Multi-tenant isolation — list | ✅ | `GET /documents` scopes by `req.user.syndicateId` unless `super_admin` |
| Multi-tenant isolation — get/update/delete/sign | ✅ | Manual `syndicateId` comparison per route |
| Multi-tenant isolation — comments | ⚠️ | Query fetches by `id` only, then checks tenant match in JS (not at the query level) — works today but is an inconsistent, riskier pattern vs. the rest of the file |
| Signed URLs | ✅ | GCS signed URL, 1h TTL, no public/raw URLs returned to clients |
| Audit logs | ✅ | Present on generate/update/delete/restore/purge/sign/download/comment |
| Recycle-bin access control | N/A | Can't evaluate — the recycle-bin listing feature doesn't exist (§5) |
| Privilege escalation attempt | ✅ blocked | `restore`/`purge` are `super_admin`-only at the middleware level; a `syndicate_admin` cannot reach them regardless of tenant |

---

## Summary

### ✅ Fully Implemented
- All 20 templates generate real PDFs with header/footer, org identity fields, QR code, verification code
- Soft delete (`deleted_at`/`deleted_by`) + restore + purge, with audit trail preserved
- Workflow state machine with server-side transition enforcement (mostly) and a 422 rejection path
- Comments (CRUD) on documents
- Signed, time-limited download URLs; no raw public URLs
- RBAC + syndicate scoping on the core document CRUD routes
- Mobile download UX: progress bar, size, ETA, retry, error/success states

### ⚠️ Partially Implemented
- Notifications only cover the `published` transition, not the others
- Version history is a counter, not real diffable/snapshot history
- Documents dashboard widgets exist but compute client-side from the full list instead of a real backend aggregate
- Comments routes rely on in-code tenant checks rather than query-level scoping
- Signature storage exists but nothing captures a real signature client-side

### ❌ Not Implemented / Fake
- **Logo is never embedded in generated PDFs**, despite `logoUrl` existing in the schema
- **Arabic rendering is non-functional** — the font-loading code exists but the actual Amiri TTF font files are missing from the repo, so Arabic text cannot render correctly. This is a genuinely "claimed but not working" feature.
- No recycle bin / list of soft-deleted documents anywhere (endpoint or UI)
- No retention policy / scheduled purge job — "legal retention" is asserted in a code comment but not enforced
- No handwritten signature capture UI on mobile
- No signature ordering/sequencing or duplicate-signature prevention
- No office-holder-specific signature roles (President/Secretary/Treasurer/etc.) — only generic account roles
- No @mentions, review-request, or approval-request objects — only a status field
- No search-in-PDF or print action in the viewer
- No true offline document access (no persisted downloaded-docs index)
- QR verification code points to a hardcoded `syndycat.ma` domain not tied to this deployment, so scanning it won't resolve anything real in this environment

### Security Issues
1. Comments endpoints scope by application logic, not by database query — lower defense-in-depth than the rest of the module.
2. `POST /documents/:id/sign` bypasses the central `isTransitionAllowed()` guard, applying its own inline status check instead — workflow enforcement isn't uniform across the file.
3. No duplicate-signature guard: the same user can sign a document repeatedly.

### Production Risks
- Arabic-language documents (a stated requirement) will render corrupted text in production today.
- Missing logo will be visible to every end user on every generated official document.
- No retention/purge automation means "soft-deleted" documents accumulate indefinitely unless a super_admin manually purges each one.
- Dashboard "Expiring Documents" is a fabricated heuristic, not real data — could mislead syndicate admins on compliance-sensitive documents.

### Production Readiness Score: **58/100**

The backbone (generation, storage, RBAC, workflow, soft delete, signed URLs, audit logging) is real and functioning. The score is capped by three categories of failure: (1) branding is materially incomplete (no logo) on a module whose entire purpose is producing official-looking documents, (2) a stated core requirement (Arabic rendering) is present in code but inert due to a missing asset, and (3) three modules described in the audit brief as full features (recycle bin/retention, signature capture, review/approval/mention workflows) exist only as partial scaffolding or not at all.

---

## Verification Matrix (selected high-impact items)

| Requirement | Expected | Actual | Status | Evidence | Fix Required |
|---|---|---|---|---|---|
| Logo in PDF | Syndicate logo image in header | `logoUrl` stored but never read by PDF engine | ❌ | `documentPdf.ts` (no `logoUrl` reference) | Fetch `logoUrl`, download/cache image, embed via pdfmake `image` node in `buildHeaderBand` |
| Arabic rendering | Amiri font renders Arabic text | Font files absent from repo; silent fallback to Latin font | ❌ | No `.ttf` files found; `documentPdf.ts:51` guard fails | Add `Amiri-Regular.ttf`/`Amiri-Bold.ttf` to `artifacts/api-server/fonts/` |
| Recycle bin | List/browse soft-deleted docs | No such endpoint/screen exists | ❌ | grep of `documents.ts` — no `isDeleted: true` filter route | Add `GET /documents/deleted` (super_admin/syndicate_admin scoped) + mobile screen |
| Retention policy | Auto-purge after policy window | Manual purge only, no cron | ❌ | No scheduler file references document purge | Add scheduled job (cron pattern already used elsewhere, e.g. `debt-escalation.ts`) |
| Signature capture | Handwritten signature pad on mobile | No pad component; field unused in practice | ❌ | No signature-pad lib in `mobile/package.json` | Add a signature-pad component, wire to existing `POST /sign` API |
| Signature dedup | One signature per signer per document | Unrestricted repeat inserts | ❌ | `documents.ts:519-529` | Add unique constraint / pre-check before insert |
| Dashboard counts | Server-aggregated, real-time | Client-side array filtering of full list | ⚠️ | `documents-dashboard.tsx:55-56` | Add `GET /documents/summary` grouped-count endpoint |
| Sign transition guard | Uses shared `isTransitionAllowed` | Inline bespoke check, bypasses shared guard | ⚠️ | `documents.ts:514-517,533` | Route the `sign` status change through `isTransitionAllowed()` |
| Comment tenant scoping | DB-level `syndicateId` filter | JS-level check after unscoped fetch | ⚠️ | `documents.ts:599-607,653-661` | Add `syndicateId` to the `WHERE` clause |
