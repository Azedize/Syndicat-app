# Project Architecture Log

## 2026-08-06

- Governance screen continues to consume the shared runtime language context for all visible interaction copy; dynamic names are interpolated into translated messages without changing the existing local/API state model.
- Internal Messaging continues to use the existing announcements API as its source of truth; localized display fallbacks are injected at mapping time so API records remain unchanged while sender, audience, and message-type presentation follow the active language.