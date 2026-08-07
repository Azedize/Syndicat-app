# Project Architecture Log

## 2026-08-06

- Elections and mandates continue to use the existing elections API as the source of truth; new localized status and recovery surfaces affect presentation and feedback only.
- Meetings continue to consume the shared DataContext fan-out and existing meeting CRUD APIs; a domain-specific load flag prevents a rejected meetings request from masquerading as a genuine empty list.
- Assemblée Générale continues to use `/ag-meetings` and its existing resolution, vote, attendance, status, and PV endpoints as the source of truth; the pass changes only presentation, safe feedback, and localized input guidance.
- Charges & Fund Calls continue to use the existing `/appels-de-fonds` payment and validation endpoints; the mutation pass changes only user-facing error presentation and keeps payment proof payloads unchanged.
- Invoice creation still uses an optimistic local insert followed by the existing finance API and refresh; failure rolls back the insert, while localized feedback is now owned by the screen instead of the shared data context.

- Governance screen continues to consume the shared runtime language context for all visible interaction copy; dynamic names are interpolated into translated messages without changing the existing local/API state model.
- Internal Messaging continues to use the existing announcements API as its source of truth; localized display fallbacks are injected at mapping time so API records remain unchanged while sender, audience, and message-type presentation follow the active language.
- Documents Dashboard continues to derive lifecycle counts from the existing DataContext and retention summary endpoint; translations affect presentation only and do not alter document status filtering or API contracts.
- Administrative Acts continues to use `/actes` as its source of truth; localized labels are derived from stable type/status enums and the retryable state only controls presentation around the existing fetch.
- Notifications continue to use DataContext and the existing user-scoped preferences/read APIs as the source of truth; stable category/type values are translated only at render time.
- Chat continues to use the existing conversation, message, attachment, reaction, and report APIs as its source of truth; the follow-up changes only render-time translation and keeps message payloads unchanged.
- Level-1 Support continues to use the existing support ticket and reply APIs as its source of truth; stable category, priority, and status enums are translated only at render time and ticket payloads remain unchanged.
- Super Admin National Dashboard continues to use the existing statistics syndicate endpoint, rankings endpoint, DataContext alerts, and syndicate/member detail endpoints as sources of truth; localization and MAD/date formatting remain render-time concerns and do not alter API contracts.
- Assemblée Générale continues to use `/ag-meetings` and its existing attendance, status, resolution, vote, and PV endpoints; Élections continues to use the elections service and server-side transition state machine. The continuation pass changes only render-time localization/date formatting and helper prop wiring.
- The Governance mobile screen now treats `/governance/conseil` and `/governance/mandats` as the source of truth instead of retaining local seed arrays when requests fail or return empty data. Council add/remove actions use the existing persisted endpoints; `/governance/delegations` remains read-only until a persistence API exists.
- API route parameters are normalized at the Express boundary before Drizzle queries, and audit metadata is serialized to the shared string-based audit contract; these are typing boundaries only and do not change endpoint behavior.