---
name: Development database schema readiness
description: Environment-specific validation note for scheduled API jobs and the local development database.
---

The development database currently used by the API workflow can be missing core relations such as `appels_de_fonds`, `documents`, and `syndicate_subscriptions`. The API can still start and return a healthy `/api/healthz`, while escalation, retention/expiry, and subscription reminder jobs log query failures.

**Why:** Health/startup checks do not prove that the attached development database has been migrated to the current Drizzle schema.

**How to apply:** When validating server readiness, check both HTTP startup and scheduled-job logs; restore/apply the current database schema before treating scheduler errors as application regressions.