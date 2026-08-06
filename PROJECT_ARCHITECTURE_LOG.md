# Project Architecture Log

## 2026-08-06

- Governance screen continues to consume the shared runtime language context for all visible interaction copy; dynamic names are interpolated into translated messages without changing the existing local/API state model.
- Internal Messaging continues to use the existing announcements API as its source of truth; localized display fallbacks are injected at mapping time so API records remain unchanged while sender, audience, and message-type presentation follow the active language.
- Documents Dashboard continues to derive lifecycle counts from the existing DataContext and retention summary endpoint; translations affect presentation only and do not alter document status filtering or API contracts.
- Administrative Acts continues to use `/actes` as its source of truth; localized labels are derived from stable type/status enums and the retryable state only controls presentation around the existing fetch.