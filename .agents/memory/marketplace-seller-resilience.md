---
name: Marketplace seller resilience
description: Marketplace data surfaces must distinguish optional enrichment failures from authoritative listing and moderation data failures.
---

The marketplace treats promotion history as optional enrichment, while catalogue, moderation queues, orders, and statistics are authoritative surfaces with independent recovery states. A failed request must not masquerade as an empty result or hide unrelated usable data.

**Why:** A seller still needs to edit, inspect, or archive an announcement during a temporary promotion-service outage, and administrators must not mistake a failed queue or counter request for a genuinely empty marketplace.

**How to apply:** Keep primary listing data authoritative, isolate optional promotion requests, and give each authoritative surface its own visible retry path; never replace an API failure with a zero count or empty list.