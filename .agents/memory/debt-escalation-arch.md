---
name: Debt escalation architecture
description: Key design decisions and gotchas in the debt escalation workflow (scanner, PDF letters, mobile access)
---

## Daily scanner idempotency
- Deduplication excludes `status = "resolved"` but INCLUDES `status = "overridden"` records.
- A new escalation is only created when required level strictly exceeds the highest level ever recorded (including overridden).
- Syndicate derivation: primary = member.syndicateId, fallback = lot→buildingId→building.syndicateId.

**Why:** Overridden escalations were excluded from dedup, causing the same level to be recreated daily if debt was unchanged.

## PDF letter access from mobile
- Endpoint `GET /pdf/escalation/:id` accepts Bearer token via Authorization header OR `?token=` query param.
- Mobile uses `Linking.openURL(url + "?token=" + encodeURIComponent(token))` because Linking cannot attach headers.
- Access is restricted to `syndicate_admin` and `super_admin` roles only.

**Why:** `Linking.openURL` has no mechanism to attach HTTP headers, so a query param fallback is the only way to authenticate browser-opened URLs from mobile.

## Push notification scope
- `createAlert()` in notify.ts broadcasts to ALL users with push tokens — syndicateId/target filtering only applies to the DB row, not the push delivery.
- Workaround: use generic alert messages from `createAlert()`; send debtor-specific details via `sendPushToUsers([targetUserId])` instead.
- Root bug (sendExpoPush ignores syndicateId) tracked as a follow-up task.

## Letter templates
- `formatMoney()` already appends "MAD" — do NOT append "MAD" again in letter body template strings.
