---
name: Stripe SDK webhook compatibility
description: Stripe Node v22 webhook objects moved subscription period and invoice subscription data to nested/current structures.
---

## Rule

Keep Stripe webhook field access aligned with the installed SDK types: subscription billing periods come from `subscription.items.data[*].current_period_start/current_period_end`, while invoice subscription identity comes from `invoice.parent.subscription_details.subscription`.

**Why:** The Stripe Node v22 types no longer expose the legacy top-level subscription period fields or `invoice.subscription`; using the old shape can prevent the API from building or starting.

**How to apply:** When changing Stripe webhook handlers, inspect the installed `stripe` declarations first and preserve signature verification, idempotent state transitions, and transaction boundaries while adapting only the provider-object mapping.