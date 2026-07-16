---
name: PDF Engine Redesign — header/stamp/footer
description: Documents the architectural changes to buildHeaderBand, signatureBlock, multiSignatoryBlock, footer, metaTable, contentSection in documentPdf.ts.
---

## buildHeaderBand signature change
Added params: `buildingName: string | null`, `version: string | null`, `docStatus: string | null`.
- Center column now shows syndicate name + building name + contact
- Right column of second band shows Réf / date / version / status badge
- These are passed from `buildDocDef` using `input.property?.name` and `input.version`

**Why:** Header was missing building identity and version; enterprise PDFs (DocuSign/PandaDoc) show all three.

**How to apply:** Any caller of `buildHeaderBand` must pass the two new optional params (null is safe).

## Premium stamp design
`signatureBlock` and `multiSignatoryBlock` now use a table-based rectangular stamp instead of dashed-circle canvas:
- Table with `widths: [88-92]`, single cell, `fillColor: accentColor`
- Border via layout hLineWidth/vLineWidth returning 2 for outer edges, darker color via `adjustColorBrightness(accentColor, -25)`
- Inner stack: ✦ star + horizontal rules + "CACHET OFFICIEL" + "SYNDICAT DE COPROPRIÉTÉ"

**Why:** pdfmake cannot z-index text over canvas; rectangular colored stamps are standard in French/Moroccan administrative docs and avoid the overlay positioning problem entirely.

**How to apply:** Do NOT try to overlay text on canvas in pdfmake — use a filled table cell instead.

## Enhanced footer in buildDocDef
Footer now has 3 columns: [syndicate name + ref + verifyUrl] | [QR image (30px)] | [page/pages + SYNDYCAT GLOBAL CPS].
- pageMargins changed from `[40,40,40,55]` to `[40,40,40,62]` to accommodate taller footer
- `qrDataUrl` is already available at footer build time (passed by closure)

## metaTable improvements
- Alternating row fill (even: #f8fafc, odd: #ffffff)
- Left border of first column colored with accentColor (3px vertical bar via vLineWidth returning 3 at i===0)
- Column widths: [148, "*"]

## contentSection redesign
Now uses a full-width accent-colored banner with a 3px rect strip on the left, section title in accentColor uppercase, and 0d (5%) opacity background fill. Replaces the simple columns-with-rect approach.

## DocumentInput.version
Added `version?: string | null` as an explicit field. Generate route passes `version: "v1.0"` in the PDF input. Falls back to `"v1.0"` in buildDocDef if missing.

## duplicate contentSection removal
The old `contentSection` (line ~595) and unused `sectionHeader` function were removed. Only the new version (enhanced, with full accent banner) remains.

## TypeScript: page! in appendSignaturesToPdf
`let page: ReturnType<typeof pdfDoc.addPage>` causes TS2454 because TypeScript can't infer closure assignment. Fix: `let page!: ReturnType<typeof pdfDoc.addPage>` (definite assignment assertion).
