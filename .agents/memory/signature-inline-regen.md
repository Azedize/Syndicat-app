---
name: Signature inline regeneration architecture
description: How the sign endpoint regenerates the full PDF with inline SVG signatures using stored generationParams.
---

## Rule
When a user signs a document, the API regenerates the **full PDF** with the SVG trace embedded inline in the document body — not just appended on a separate page.

## How to apply
1. `POST /documents` now saves `generationParams` (entity IDs + form fields) as JSONB to `documentsTable.generationParams`.
2. `POST /documents/:id/sign` loads ALL signatures from DB, then:
   - If `generationParams` present → calls `regenerateDocumentWithSignatures()` (fire-and-forget) → updates `fileUrl`, sets `appendedSignaturePages = 0`.
   - If no params (legacy doc) → calls `appendSignaturesToPdf()` with `stripLastN = prevAppendedCount` to replace previous sig page, sets `appendedSignaturePages = 1`.
3. `appendSignaturesToPdf()` has a new `stripLastN` param (default 0) — removes N trailing pages before appending fresh ones.

## DB schema changes
- `documentsTable.generationParams jsonb` — entity IDs + formFields dict saved at creation.
- `documentsTable.appendedSignaturePages integer not null default 0` — tracks how many sig pages were appended (for replace-on-resign).

**Why:** Original PDFs kept showing "En attente de signature" after signing because signatures were only stored in DB, never regenerated into the PDF body.
