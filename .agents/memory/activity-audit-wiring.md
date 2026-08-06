---
name: Activity screen audit API wiring
description: How activity.tsx was wired to the real /audit API with static fallback
---

## Rule
`activity.tsx` uses the real `auditApi.getLogs()` response and exposes an explicit localized retry state when the audit request is unavailable; do not silently present a misleading empty journal.

## Why
The API returns a different shape from the UI's `ActivityLog` interface. A `mapApiLog()` mapper converts `{ userId, action, entity, entityId, details, createdAt }` → `{ category, target, userAvatar, severity, timestamp }`. A failed request must be distinguishable from a genuinely empty audit trail for operational trust.

## How to apply
- Always use `safeDate()` before calling `.toISOString()` on API timestamps — malformed/null values from the DB throw `RangeError`.
- Infer `category` from `entity` field using `ENTITY_TO_CATEGORY` lookup (prefix match on lowercase entity string).
- Infer `severity` from `action` string keywords (fail/error → error, login/success/valid → success, etc.).
- Translate category, severity, statistics, metadata, export copy, and relative dates through `LanguageContext`; relative dates must use the active locale.
