---
name: PDF engine overhaul — header, seal, signatures
description: Covers the July 2026 enterprise redesign of buildHeaderBand, buildOfficialSeal, signatureBlock wiring, and the QR verify portal upgrade.
---

## buildHeaderBand redesign
- Category strip (old separate row ~26px) removed; now an **inline badge** inside COL2.
- Logo column: 46px → 66px; logo image: 36px → 52px.
- QR code in header: 20px → 28px.
- Top accent stripe: 2px → 4px.
- Returns `[topStripe, band]` (2 elements); old version returned 3 (`categoryStrip` gone).

**Why:** Brief demanded compact header, prominent logo, strong brand identity.

**How to apply:** Any future header changes must NOT re-add a separate categoryStrip row.

## buildOfficialSeal enhancement
- Added a 2.2px dark outer border ring around the accent circle.
- Added a center highlight dot (7px ellipse, 15% white opacity).
- Added center emblem star `✦` text element between syndicate name and signer.

**Why:** Seals looked flat; institutional seals always have a border ring and center emblem.

## signatureBlock wiring — all templates must pass `signatures`
Every `signatureBlock()` call in `buildDocDef` must receive the `signatures` variable as the 6th argument. As of this overhaul, ALL templates pass it. If a new template is added, include: `signatureBlock("...", ..., accentColor, true, lang, signatures)`.

Templates fixed in this session:
- rapport, decision, circulaire, demande_administrative
- autorisation, ordre_de_mission, lettre_officielle
- rapport_activite, rapport_audit, default case
- contrat (replaced custom 2-col layout with proper signatureBlock)
- convention_partenariat (both cols), accord_collectif (both cols)

**Why:** Without signatures, ALL documents showed "En attente" even after signing. The `signatures` array is only non-empty when `_existingDocumentId` is passed on regeneration.

## QR Verification Portal — dynamic syndicate branding
`buildVerificationHtml` now accepts `accentColor` and `docVersion`.
- Header gradient computed from syndicate `logoColor` via `_dk()` hex darkening helper.
- Version row added to metadata table.
- Document timeline section added (shows creation + each signature event with dates).
- `syndicatesTable.logoColor` now fetched in the verify route.
- `documentsTable.version` now fetched in the verify route's doc query.

**Why:** Brief demanded syndicate-branded portal, version history, signature timeline.
