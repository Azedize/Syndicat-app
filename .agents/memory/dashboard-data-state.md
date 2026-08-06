---
name: Dashboard data state
description: Loading and partial-failure behavior for the role-aware home dashboard.
---

The home dashboard consumes many independent API resources through one fan-out. Treat the dashboard as loading until the initial fan-out settles, but classify failure as fatal only when every dependency rejects; retain successful partial data and offer retry for a complete fan-out failure.

**Why:** A single failed secondary endpoint should not erase useful operational data, while rendering role metrics as zero before the first response is misleading.

**How to apply:** Keep dashboard UI states driven by the shared data context, use localized status/retry copy, and preserve role-specific metric and quick-action guards when adding new home sections.