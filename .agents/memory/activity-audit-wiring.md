---
name: Activity screen audit API wiring
description: How activity.tsx was wired to the real /audit API with static fallback
---

## Rule
`activity.tsx` initializes `activities` state from the static `ALL_ACTIVITIES` seed array, then overrides with real API data from `auditApi.getLogs()` on mount if the response is non-empty.

## Why
The API returns a different shape from the UI's `ActivityLog` interface. A `mapApiLog()` mapper converts `{ userId, action, entity, entityId, details, createdAt }` → `{ category, target, userAvatar, severity, timestamp, relativeTime }`.

## How to apply
- Always use `safeDate()` before calling `.toISOString()` on API timestamps — malformed/null values from the DB throw `RangeError`.
- Infer `category` from `entity` field using `ENTITY_TO_CATEGORY` lookup (prefix match on lowercase entity string).
- Infer `severity` from `action` string keywords (fail/error → error, login/success/valid → success, etc.).
- Fall back to static data silently on API error — do not show an error banner.
