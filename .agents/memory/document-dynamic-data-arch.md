---
name: Document dynamic-data architecture (property + office-holders + numbering)
description: How real residence/office-holder data and sequential numbering get injected into generated PDFs, and which DB tables back it.
---

The documents module generates PDFs from hardcoded template functions (documentPdf.ts), not a
DB-driven template CRUD system. Dynamic data is injected by fetching real rows and passing them
into `DocumentInput` before calling the template builder — not by a generic variable-substitution
engine.

Real tables used:
- `buildingsTable` — residence/property identity (name, address, city, totalFloors, totalLots,
  registrationNumber). No building-level surface or land-registry field.
- `lotsTable` — per-lot `surfaceM2` and `titreFoncier` (land registry ref lives here, not on the
  building). Aggregate across a building's lots to get total surface / a representative land ref.
- `conseilSyndicalTable` — the only real office-holder model (`role`: president | vice_president |
  secretary | treasurer | committee_member | building_representative | member, scoped to
  `syndicateId`, `status: "active"` for current holders). `usersTable.role` is generic RBAC only
  (super_admin/syndicate_admin/member/tenant) and is NOT an office-holder role — "manager" /
  gestionnaire is approximated as the syndicate's `syndicate_admin` user, there's no dedicated
  manager role in schema.
- `documentSequencesTable` (added) — one row per (syndicateId, prefix, year), atomic
  `INSERT ... ON CONFLICT DO UPDATE currentValue = currentValue + 1 RETURNING currentValue` to mint
  sequential refs like `REG-2026-0001` without race conditions. Prefix comes from
  `TEMPLATE_NUMBER_PREFIX` in documentPdf.ts.

**Why:** The previous fallback was `${template}-${Date.now()}`, not a real per-category/year
sequence, and property/office-holder data was never fetched anywhere in the generation path even
though the schema had everything needed.

**How to apply:** When adding a new template that needs residence/office-holder data, fetch via
`getPropertyInfo`/`getOfficeHolders` in `documents.ts` and read `input.property` / `input.officeHolders`
in the template's `buildDocDef` case — don't invent a new data-fetching path per template.
