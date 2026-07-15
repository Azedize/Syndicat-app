---
name: GCS sidecar "no allowed resources" auth failure
description: Object storage uploads fail with a 401 "no allowed resources" from the Replit sidecar token exchange, independent of app code.
---

Symptom: `@google-cloud/storage` upload calls throw `Error: no allowed resources` from
`StsCredentials.exchangeToken` → `IdentityPoolClient.refreshAccessTokenAsync`, a 401 from
`http://127.0.0.1:1106/token` (the local sidecar). `PRIVATE_OBJECT_DIR` / bucket env vars are
present and `setupObjectStorage()` reports `alreadySetUp: true` — the failure is in the sidecar's
token exchange, not missing config.

**Why:** Confirmed this is independent of application code — it reproduced identically across
multiple workflow restarts and multiple unrelated document-generation calls, all failing at the
same GCS upload step regardless of which template/data path triggered it.

**How to apply:** Don't spend time debugging app-side GCS client code, ACL policies, or bucket
config for this error — verify `setupObjectStorage()` succeeds and env vars are populated, then if
the token-exchange 401 persists after a workflow restart, treat it as an environment/sidecar issue
to flag to the user rather than a code bug to fix.
