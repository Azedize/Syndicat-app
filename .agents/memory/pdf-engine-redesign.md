---
name: PDF Engine Redesign — visual overhaul
description: All architectural and visual design decisions for documentPdf.ts — typography, stamps, header, footer, tables, section banners, signatures.
---

## buildStyles() — typography hierarchy (current values)

| Style key      | fontSize | Notes                                               |
|---------------|---------|-----------------------------------------------------|
| docTitle      | 17pt bold | Dominant — must be the largest non-cert element     |
| docSubtitle   | 11pt italic | Supporting subtitle key added                       |
| sectionTitle  | 11pt bold | accentColor — section heading                       |
| body          | 10.5pt / lineHeight 1.65 | Up from 10pt/1.55                   |
| bodyArabic    | 12pt / lineHeight 1.70   | Up from 11pt/1.60                   |
| tableHeader   | 10pt bold | Up from 9pt — must be ≥ tableCell size              |
| tableCell     | 9.5pt |                                                         |
| financialTotal| 10.5pt bold | Used for TOTAL rows in rapport_financier            |
| metaKey       | 9pt    |                                                         |
| metaVal       | 9.5pt bold |                                                     |
| footerBrand   | 7pt bold accentColor | Not hardcoded purple — uses accentColor  |
| watermark     | 72pt bold | opacity 0.10 — lighter than before                  |

**Why:** The original flat type scale (docTitle 13pt, body 10pt, tableHeader 9pt) violated the visual dominance principle — enterprise docs need clear hierarchy: title > section > meta > body > notice.

**How to apply:** Any new style key goes in `buildStyles()`. Never override fontSize inline on elements that already have a named style.

## buildPdfBuffer defaultStyle
`{ font: PRIMARY_FONT, fontSize: 10.5, lineHeight: 1.6 }` — matches the body style so fallback rendering is consistent.

## buildHeaderBand signature
Params: `buildingName: string | null`, `version: string | null`, `docStatus: string | null`.
- Identity band (top): logo | syndicate name + building name + contact | QR code — accentColor fill
- Type band (below, darker): doc type label left | Réf / date / version / status badge right

**Why:** Header was missing building identity and version; enterprise PDFs (DocuSign/PandaDoc) show all three.
**How to apply:** Any caller of `buildHeaderBand` must pass the two new optional params (null is safe).

## Premium rectangular stamp
`signatureBlock`, `multiSignatoryBlock`, and `compte_rendu` all use a table-based rectangular stamp:
- `widths: [88–92]`, single cell, `fillColor: accentColor`
- Outer border via layout returning 2pt for edges, border color = `adjustColorBrightness(accentColor, -25)`
- Inner stack: ✦ star + horizontal rules + "CACHET OFFICIEL" + "SYNDICAT DE COPROPRIÉTÉ" + "OFFICIAL STAMP"

**Why:** pdfmake cannot z-index text over canvas shapes. Rectangular colored stamps also match French/Moroccan administrative doc conventions and avoid the canvas overlay problem.
**How to apply:** NEVER use canvas ellipse for a signature stamp in pdfmake — always use filled table cell.

## signatureBlock / multiSignatoryBlock — pre-signature rule
Both blocks now start with a separator canvas before the columns:
- 0.6pt full-width line (#e2e8f0) + 1.5pt accentColor accent 60px wide
- Margin from previous content: 28pt (was 30pt on the columns themselves)

**Why:** Without the separator, the signature zone blends into the last content section.

## metaTable improvements
- Column widths: [152, "*"] (up from [148, "*"])
- Row padding: [12, 8, 8, 8] for key column, [10, 8, 12, 8] for value
- Left accent bar: 4pt solid accentColor (via vLineWidth returning 4 at i===0)
- Outer top/bottom hLine: 1.2pt; inner rows: 0.4pt
- Alternating fill: even rows #f8fafc, odd #ffffff

## contentSection banner
- 4px accent rect (up from 3px) + adjustColorBrightness(accentColor, 80) fill background (not opacity trick)
- Banner height: 28px (up from 18px)
- Title: 10pt bold accentColor uppercase (up from 8.5pt)
- Title margin: [10, 6, 12, 6] internal to the banner cell
- Section top margin: 14pt, bottom gap before text: 8pt; text bottom gap: 18pt

**Why:** The old 18px/8.5pt banner didn't read as a section break at a glance.

## accentColor+"20" is invalid in pdfmake
pdfmake does NOT support 8-digit hex (RGBA) colors. Any `accentColor + "20"` expression silently renders as no fill. Fix: use `adjustColorBrightness(accentColor, 80)` for a light tint.

## Attestation / certificate inline title sizes
- ATTESTATION DE RÉSIDENCE: 20pt (was 16)
- ATTESTATION DE PROPRIÉTÉ: 20pt (was 16)
- ATTESTATION DE PAIEMENT DES CHARGES: 18pt (was 14)
- certificateWord: 26pt (was 22)

## note_interne meta table
Converted from inline table definition to `metaTable()` helper for consistency. Uses the same 5-row pattern: À, De, Date, Objet, Priorité.

## rapport_financier TOTAL row
Uses `adjustColorBrightness(accentColor, 82)` for fill (very light tint) and `style: "financialTotal"` (10.5pt bold). The old `accentColor + "20"` rendered with no fill (invalid hex).

## Enhanced footer in buildDocDef
3 columns: [syndicate name + ref + verifyUrl] | [QR image 30px] | [page/pages + SYNDYCAT GLOBAL CPS]
pageMargins: [40, 40, 40, 62] — wider bottom to accommodate footer height.

## DocumentInput.version
Added `version?: string | null` as an explicit interface field. Generate route passes `version: "v1.0"`. Falls back to `"v1.0"` in buildDocDef if missing.

## TypeScript: page! in appendSignaturesToPdf
`let page!: ReturnType<typeof pdfDoc.addPage>` — definite assignment assertion needed because TypeScript cannot infer closure assignment. TS2454 otherwise.
