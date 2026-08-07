---
name: Statistics data state
description: Reliability and source-of-truth rules for platform statistics and SaaS plan totals.
---

Platform statistics must distinguish initial synchronization, unavailable data, and a genuine empty result. A failed platform statistics request must not be converted into zero-valued KPIs or a misleading empty dashboard.

**Why:** Platform KPIs are operational and financial data; treating an ignored request failure as zero can mislead a Super Admin and hide an outage.

**How to apply:** Keep the existing role/API scope, show a localized retryable unavailable state until a successful response exists, format MAD with the active locale, and derive subscription totals from persisted subscription/plan records rather than hardcoded UI prices.