---
name: Express route registration order shadows exact paths
description: An exact-path route (e.g. GET /elections/mandates) registered after a parameterized sibling (GET /elections/:id) is silently unreachable — no error, no warning.
---

Express matches routes in registration order, not by specificity. If `router.get("/x/:id", …)` is registered before `router.get("/x/mandates", …)`, a request to `/x/mandates` matches the `:id` route with `id="mandates"` and the second handler never runs — no 404 from a missing route, no compile error, just wrong behavior from the wrong handler.

**Why this matters:** found in production code — `GET /elections/mandates` was defined ~800 lines after `GET /elections/:id` in the same router file, making the mandates list endpoint permanently unreachable (always hit the wrong handler and 404'd as "election not found"). This broke a real mobile screen (elected members / conseil syndical) for every user.

**How to apply:** when adding a new exact-path route under a prefix that already has a `:param` route (e.g. adding `/things/summary` next to an existing `/things/:id`), always register the exact-path route *before* the parameterized one, regardless of where it fits narratively in the file. When auditing or debugging a route that seems to always return the generic "not found" error from a different route's handler, grep for route registration order under the same prefix before assuming a logic bug.
