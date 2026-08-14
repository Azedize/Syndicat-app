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

For nested governance resources, validate the parent row before mutating the child: a role guard alone does not establish that `:id` belongs to the caller's syndicate. Also require the URL parent ID to match the child's stored foreign key before updating.

**Why:** AG status, resolution, attendance, PV, and proxy handlers initially had valid role middleware but ID-only queries; a caller with a guessed meeting or resolution ID could cross syndicate boundaries.

**How to apply:** Fetch the parent meeting, call `assertSyndicateAccess(req, parent.syndicateId)`, and constrain child updates by both the child ID and parent ID.

For nullable-scope tables, a scoped list query is not enough: every ID-based read or mutation must independently verify the resource syndicate, and every non-platform list must reject a missing JWT scope before querying.

**Why:** Adjacent modules can otherwise expose cross-syndicate rows through a missing-scope fallback or let an authenticated role vote, review, challenge, or delete a resource belonging to another syndicate.

**How to apply:** Use a small `canAccessResource` helper for the row-level check and keep `super_admin` as the only unrestricted role; never treat `syndicateId ?? ""` as a valid operational scope.
