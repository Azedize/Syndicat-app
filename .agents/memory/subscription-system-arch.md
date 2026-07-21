---
name: Subscription system architecture
description: SaaS subscription system — plans, trials, billing, enforcement middleware, mobile UI
---

## State machine
trial → expired (trialEndDate < now), trial → active (paid plan chosen),
active → grace (currentPeriodEnd < now AND gracePeriodEnd > now),
active/grace → expired (gracePeriodEnd < now), active → suspended (super_admin),
suspended → active (reactivation), any → cancelled.

## Key decisions
- computeSubscriptionStatus() in subscriptions.ts derives effective status at read time (not stored).
- enrichSubscription() adds effectiveStatus/isExpired/isReadOnly/isTrial/isGrace/daysRemaining/expiryDate to every API response.
- Middleware requireActiveSubscription returns HTTP 402 + code SUBSCRIPTION_REQUIRED when expired/suspended; super_admin always exempt; fail-open on DB error.
- assignTrial() exported from subscriptions.ts; called in POST /syndicates after creation (non-blocking, logs warning on failure).
- SubscriptionBanner polls /subscriptions/status every 5 min; non-dismissible when isReadOnly.
- billingInvoicesTable created automatically on paid plan activation.

**Why:** Clean separation: DB stores raw dates, API computes derived booleans, mobile/middleware consume derived booleans.

**How to apply:** Any new write route that should be gated → add requireActiveSubscription middleware after requireAuth.

## Plans seeded (2026-07-21)
Essai Gratuit (trial, 0 MAD), Starter (299/mo), Professional (699/mo), Business (1299/mo), Enterprise (2499/mo).
Legacy plans Basique/Pro/Premium still in DB — cleanup pending (DELETE WHERE name IN ('Basique','Pro','Premium')).
