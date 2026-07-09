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

## Unmounted routers = silent 404s
- `artifacts/api-server/src/routes/index.ts` manually imports+mounts each router file; a router file existing in `routes/` does NOT mean it's live — check it's actually imported and `router.use()`'d.
- Found `storage.ts` (upload/object-serving) unmounted, causing every mobile photo/document upload to 404 silently (button looked broken, no error shown). Fixed by mounting it + provisioning the object storage bucket via `setupObjectStorage()`.
- Also found `pdf.ts` and `actions.ts` unmounted — do NOT mount them as-is: they reference DB columns removed/renamed since being written (invoices.notes, transactions.reference/description/category/paymentMethod, budgets.syndicateId, meetings.attendees). Mounting would turn 404s into 500s. Needs schema-alignment pass + clean typecheck first.
- **Why:** a router file compiling cleanly gives false confidence; only `routes/index.ts` wiring determines what's actually reachable.

## Mobile "Une erreur s'est produite" crash triage
- The generic ErrorFallback screen gives no stack trace. Check two layers, in order: (1) API response shape vs what the screen destructures (missing `items` array, string vs number amounts, status values not in the screen's STATUS_CONFIG/LEVEL_CONFIG map); (2) prop names passed to shared components (FilterChips wants `options/value/onChange` not `chips/selected/onSelect`; ScreenHeader wants `rightContent` not `right`) and color tokens (`useColors()` has `mutedForeground`, not `textSecondary`) — always verify against the actual component source, don't assume prop names.
- **Why:** fixed the API layer first (real bug, but not the crash's cause) before finding the actual crash was mistyped props/color keys in the screen itself — cross-check both layers before declaring victory.
