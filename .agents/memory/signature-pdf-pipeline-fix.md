---
name: Signature PDF Pipeline Fix
description: Synchronous PDF regeneration after signing, SVG validation, regenerationFailed flag, logo pipeline improvements, bank fields, and logo cache busting.
---

## Rule
After signing, PDF regeneration MUST be synchronous (awaited before HTTP response). Fire-and-forget was the root cause of stale PDFs showing "En attente de signature".

**Why:** The previous `.then().catch()` pattern meant the HTTP 200 was returned before GCS upload completed. If GCS was unavailable, the document stayed permanently signed with a stale PDF and no admin visibility.

## How to apply
- `POST /documents/:id/sign` in `routes/documents.ts` now awaits all PDF work before `res.status(201).json(...)`.
- Response includes `pdfReady: boolean` — mobile should check this and warn user if `false`.
- `documentsTable.regenerationFailed` boolean column (added to schema) is set `true` on failure so admins can identify stale documents. Surface this in any admin document list UI.

## SVG Validation
- Sign endpoint validates `signatureData` with `/^\s*(?:<\?xml[^>]*>\s*)?<svg/i` before inserting. Returns 422 on invalid non-empty input.

## Signable Statuses
- `pending_review` added to the signable status list alongside `generated` and `validated`. Previously blocked, caused admin friction.

## Logo Pipeline
- `fetchLogoDataUrl()` in `documentPdf.ts`:
  - WebP detection added (RIFF magic bytes)
  - Failure cache TTL shortened to 1 min (success stays 5 min) — allows retrying sooner after transient GCS failures
  - Structured error logging: format-unsupported (SVG) logged as WARN with buffer head for diagnosis
  - `bustLogoCache(logoUrl)` exported — called by `syndicates.ts` PUT handler whenever `logoUrl` changes

## Bank Fields
- Added `bankName`, `bankIban`, `bankBic` to `syndicatesTable` schema + DB migration applied.
- `SyndicateInfo` interface includes all three fields.
- `getSyndicateInfo()` SELECTs and returns all three.
- Used in PDF templates: `appel_de_fonds` payment instructions, `facture` bank table after totals, `mise_en_demeure` bank coordinates section — all conditional on fields being non-null.
- Exposed in: autofill endpoint (`bank_name`, `bank_iban`, `bank_bic`), preview resolved variables, team PUT `/team/syndicate`, syndicates PUT/POST schemas.
