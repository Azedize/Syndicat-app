---
name: Marketplace seller resilience
description: Seller listings must remain usable when optional promotion data is unavailable.
---

The seller marketplace treats promotion history as optional enrichment: a promotion request failure or promotion-list failure must not hide otherwise available listings.

**Why:** A seller still needs to edit, inspect, or archive an announcement during a temporary promotion-service outage; showing an empty shop would be misleading.

**How to apply:** Keep the primary listing request authoritative and isolate optional promotion requests with a safe empty result, while preserving visible recovery for primary listing failures.