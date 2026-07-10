---
name: Syndicate isolation hard-fail pattern
description: All routes that serve syndicate-scoped data must hard-fail 403 when JWT lacks syndicateId — never fall through to an unscoped global query.
---

## Rule
Any route that is not `super_admin`-only must check `user.syndicateId` and return `403 { error: "Syndicat non défini dans le token" }` immediately if it is absent. Never use `user.syndicateId ?? ""` for INSERT or WHERE clauses — that creates unscoped records or leaks cross-syndicate data.

**Why:** A syndicate_admin JWT without a syndicateId (e.g. misconfigured token, partially migrated user) would otherwise receive all records from all syndicates on GET, or create a record with an empty syndicateId on POST.

**How to apply:**
- At the top of every syndicate-scoped GET/POST/PUT/DELETE handler, before any DB query:
  ```ts
  if (user.role === "syndicate_admin" && !user.syndicateId) {
    return res.status(403).json({ error: "Syndicat non défini dans le token" });
  }
  ```
- For member/tenant roles that also have syndicateId requirements, same pattern.
- Routes already using `requireRole("super_admin")` exclusively are exempt.

Files patched: budget.ts (appels GET), meetings.ts (GET, POST, PUT, DELETE, attend).
