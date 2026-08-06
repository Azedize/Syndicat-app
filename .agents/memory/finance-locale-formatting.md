---
name: Finance locale formatting
description: Locale and loading-state rules for financial mobile dashboards and payment screens.
---

Financial amounts must be formatted through the active language locale with currency MAD; do not use compact `k`/`M` formatting for user-facing totals, KPI values, tables, or contract amounts. Financial dates should use the same active locale.

**Why:** Compact or fixed-French formatting makes Moroccan financial values inconsistent across French, English, Arabic, and Spanish, and can hide the actual amount in an enterprise finance workflow.

**How to apply:** Reuse the screen's locale-aware MAD helper for every displayed financial amount, localize contract/payment dates, and keep loading, recoverable error, and empty states distinct from one another.