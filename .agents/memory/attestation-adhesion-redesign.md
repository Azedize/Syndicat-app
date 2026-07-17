---
name: Attestation d'Adhésion — enterprise redesign
description: Full enterprise redesign of the attestation template (July 2026). Layout, data sources, and all new component functions documented here.
---

## Design layout (production)

```
[buildHeaderBand]  — standard enterprise header (logo, syndicate name, QR, doc ref)
[identityStrip]    — 4-cell horizontal: Type | Référence | Date | Statut
[titleBlock]       — centered "ATTESTATION D'ADHÉSION" at 22pt with double ornamental rules
[attSectionDiv]    — "PROFIL DU MEMBRE" section header with accent bar + line
[memberProfileCard]— 37% / * two-column table:
                     LEFT: avatar circle (initials), name, ADH-ref badge, status badge,
                           contact (email/phone/profession), cotisation status
                     RIGHT: 4×2 property data pairs (Résidence, Lot, Étage, Surface,
                            Type, Date d'adhésion, Adresse, Syndicat)
[attSectionDiv]    — "CERTIFICATION OFFICIELLE"
[certBlock]        — contentSection() with auto-generated legal paragraph
[signatureArea]    — 3-col: [President sig | Official Seal (center) | Secretary sig]
[legalFooterNote]  — doc fingerprint + QR verify URL
```

## Member avatar circle
Uses the negative-margin overlay trick identical to `buildOfficialSeal`:
- Canvas layer (ellipse) drawn at R=36; margin-bottom = -(2*R) to pull text up
- Text layer with initials at margin-top ≈ R-15 to center vertically
- Inner separation ring at R-3, 1.2px white/30% opacity

## New entity data from getLotMemberData
Fields added (July 2026): `_memberEmail`, `_memberPhone`, `_memberProfession`,
`_memberJoinDate`, `_memberStatus`, `_memberCotisation`, `_memberRef` (= `ADH-{id[-8:].upper()}`).
These are auto-populated from membersTable when memberId or lotId is provided.

Note: membersTable has NO `cin` or `membershipNumber` columns. `_memberRef` uses UUID suffix.

## Signature area
Custom 2-col block (President + Secretary) — NOT the standard `multiSignatoryBlock`
(which shows Treasurer too). Pattern: same `makeAttSigCol()` helper inline in case block.
Seal centered between the two signature columns.

## Key rules
- Case uses `case "attestation": { ... }` block braces — required for const declarations.
- `InlineSignatureInfo` type referenced directly (same file); accessible in case block.
- `propRows` typed as `PropPair[][]` where `type PropPair = [string, string]` to avoid TS widening.
- `attSectionDiv` helper is a local function (const) inside the case block — avoids any clash
  with outer-scope names.
