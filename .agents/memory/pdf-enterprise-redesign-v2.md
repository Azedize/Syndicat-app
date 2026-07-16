---
name: PDF Enterprise Redesign v2
description: Major redesign of documentPdf.ts — official seal, header, signature SVG, family-specific visual openers, and route fix. Covers what changed and why.
---

## Changes made

### buildOfficialSeal() — new function (~line 697)
Replaces all three `premiumStamp`/`premiumStampBlock`/`premiumStampFinal` rectangle blocks with a proper circular seal built using pdfmake canvas ellipses + the **negative-margin overlay trick**: canvas draws concentric ellipses, then a negative bottom margin equal to the canvas height pulls text elements up so they visually sit inside the circle. Two ellipse rings (outer filled, inner white-stroke ring) give the classic stamp double-border look. Stars flank "CACHET OFFICIEL". Called from both `multiSignatoryBlock` and `signatureBlock`.

**Why:** The rectangle stamp looked generic and unprofessional; circular seals are the standard administrative visual.

### buildHeaderBand() — enhanced (~line 487)
- Logo column: 36px → 46px; logo/monogram tile: 26px → 36px
- Syndicate name font: 9.5pt → 11pt with stronger characterSpacing
- Building name: now bold + uppercase (7.5pt), treated as a subtitle line
- Column widths: [36, "*", 72] → [46, "*", 80]
- **Category identity strip**: new 4th element returned. Shows the document family icon + category label in accent-tinted band below the main header. Makes document type immediately obvious before reading the title.

**Why:** Syndicate identity was weak; spec demanded the syndicate logo and name dominate.

### InlineSignatureInfo — signatureData field added (~line 1128)
Added `signatureData?: string` field (maps to `documentSignaturesTable.signatureData` column which stores the SVG from the mobile signature pad).

### makeSignerCol — SVG trace rendering (~line 1208)
When `sig.signatureData` starts with `<svg`, renders `{ svg: sig.signatureData, width: 120, height: 50 }` inline in the signature column instead of a blank line. This makes the handwritten mark visible directly in the main PDF body.

### signatureBlock signerRows — SVG trace rendering
Same pattern: when `sig.signatureData` is an SVG string, renders it as `{ svg, width: 160, height: 55 }`. Falls back to a horizontal line if not available.

### Route fix — documents.ts (~line 2469)
When loading existing signatures for a regenerated document, now includes `signatureData: s.signatureData ?? undefined` in the mapped object so the SVG is available to the PDF engine.

**Why:** Signatures existed in DB but the handwritten trace never appeared in the main PDF — only on the appended signature page.

### Family-specific visual openers — 4 new functions
All inserted before `metaTable()`:

- **`buildCertificateFrame(accentColor, lang)`** — ornate double-border with corner ticks and "DOCUMENT OFFICIEL CERTIFIÉ" strip. Applied to `attestation` (top only) and `certificat` (top + bottom sandwich).
- **`buildGovernanceBanner(accentColor, categoryLabel, entityRef?)`** — dark accent band with ★ emblems flanking the category label. Applied to `decision` and `rapport_election`.
- **`buildLegalAlertBanner(accentColor, lang)`** — red/dark band with ⚠ and "ACTE JURIDIQUE OFFICIEL — RÉPONSE OBLIGATOIRE". Applied to `mise_en_demeure`.
- **`buildMeetingBanner(accentColor, meetingType?, location?, date?, lang)`** — light-tinted panel with ◆ emblems, meeting type, location, and date. Applied to `pv` and `convocation`.

**Why:** Templates previously shared identical layout; only colors changed. Now each document family has a distinct visual opener that signals its purpose before the reader looks at the content.

## Pending / not done
- `attestation_residence`, `attestation_propriete`, `attestation_paiement`, `recu_paiement` — not yet upgraded with `buildCertificateFrame` (similar treatment as `attestation`)
- `lettre_officielle` — could get `buildLegalAlertBanner` when used for enforcement
- `compte_rendu` — could get `buildMeetingBanner`
- Full financial template DB audit (spec item 6) — already partially done in prior sessions; additional manual fields remain
- Signature page (appendSignaturesToPdf) — already working; now main PDF body also shows SVG traces inline
