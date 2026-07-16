---
name: Financial & election PDF templates
description: 6 entity-driven templates added; entity loader pattern; Zod entity ID fields; dynamic stamp fix
---

## Templates added (DocumentTemplate union + all maps updated)
- `appel_de_fonds` — ADF prefix, green financial theme; shows copropriétaire card, charge details, amount box, payment instructions; needs `appelDeFondsId` in POST body
- `recu_paiement` — REC prefix, green cert theme; receipt card with amount, period, payment method; needs `appelDeFondsId`
- `facture` — FAC prefix; line items + HT/TVA/TTC totals; `_invoiceLines` field accepted
- `budget_previsionnel` — BUD prefix; summary cards (charges/reserve/total) + line items; needs `budgetId`
- `decompte_charges` — DEC-CH prefix; provisions vs actuals with surplus/deficit color-coded; needs `budgetId` + `memberId`
- `rapport_election` — ELEC prefix, red electoral theme; quorum status block + candidate results; needs `electionId`

## Entity loader functions (documents.ts, before generateSequentialDocumentNumber)
- `getMeetingData(meetingId)` — loads meetingsTable + meetingAttendeesTable + agResolutionsTable; returns extraFields keys (meetingDate, heure, lieu, agendaText, resolutionsText, participants, etc.)
- `getLotMemberData(lotId?, memberId?)` — loads lotsTable+buildingsTable+membersTable; falls back to lot.ownerId if no memberId
- `getAppelDeFondsData(appelId)` — joins appelsDeFonds+lots+buildings+members; returns member/lot/charge fields
- `getBudgetData(budgetId)` — joins budgets+buildings+budgetLines; returns exercice, amounts, lines text
- `getElectionData(electionId)` — loads electionsTable+candidatesTable; returns quorum, participation, candidate list

**Why:** Entity IDs avoid manual data entry in the mobile UI; loaders populate all template fields automatically.

## Zod schema entity ID fields (documents.ts POST body)
`meetingId`, `lotId`, `memberId`, `appelDeFondsId`, `budgetId`, `electionId`, `invoiceId` — all optional strings.
templateId enum now includes all 30 templates (9 original + 11 enterprise + 3 attestations + 6 new).

## Dynamic stamp fix
`multiSignatoryBlock` now accepts `syndName: string = "SYNDICAT DE COPROPRIÉTÉ"` as 5th param.
Both `multiSignatoryBlock` and `signatureBlock` stamps use `syndName.toUpperCase()` instead of the hardcoded label.
Call site at template switch: `multiSignatoryBlock(..., syndInfo.name)`.

## Signature loading on regeneration
Route pattern: if `extraFields._existingDocumentId` is present, queries `documentSignaturesTable` and passes results as `loadedSignatures` to generateAndUploadDocument. Normal first-generation still gets `[]`.

## Internal field naming convention
Fields loaded by entity loaders that aren't standard template fields use `_` prefix (e.g. `_lotNumber`, `_buildingName`, `_quorumReached`) to distinguish them from user-provided Zod fields.
