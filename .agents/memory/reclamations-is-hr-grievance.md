---
name: reclamationsTable is HR grievances, not facility incidents
description: Clarifies what reclamationsTable actually models, to avoid wiring the wrong endpoint for "incident" features
---

`reclamationsTable` (routes/reclamations.ts) models HR-style employee grievances. Its `type` enum is `salaire, condition_travail, discrimination, harcelement, licenciement, conge, avancement, securite, autre` — not facility/maintenance incidents.

**Why:** the generic name "réclamation" suggests a facility complaint/incident, but the schema and required fields are grievance-shaped (titre/description/type from that enum, memberId as the filer).

**How to apply:** when a spec asks for "incident"-triggered behavior (e.g. auto-creating a chat), verify against the actual enum/fields before wiring to this table. Facility incidents likely belong to `sinistres.ts` or `travaux.ts` instead — check those first if the feature is about property damage/maintenance rather than personnel grievances. (One integration was pragmatically wired to reclamationsTable's creation endpoint as an "incident" trigger — revisit if sinistres/travaux turn out to be the better fit.)
