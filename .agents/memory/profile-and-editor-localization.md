---
name: Profile and template editor localization
description: Durable localization boundary for authenticated profile feedback and metadata-driven Super Admin template editing.
---

Profile and template-editor metadata must use the runtime language system, while API errors shown to users must be replaced by safe localized recovery messages rather than raw server text.

**Why:** These screens are authenticated trust surfaces; mixed-language labels and technical error payloads undermine confidence and expose implementation details.

**How to apply:** When extending profile or Template Studio, add four-language keys before wiring UI copy, keep role/category/source/type labels as stable internal keys, and preserve existing API/role contracts.