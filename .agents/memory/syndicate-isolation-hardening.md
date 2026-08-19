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

For resident-submitted work requests, building membership is not enough to authorize a row read or lot association: members and tenants must be limited to their own request IDs and, when a lot is supplied, to a lot they own or occupy.

**Why:** A resident can legitimately belong to the same building as many other occupants. Building-level scope alone would expose private descriptions/attachments or allow a request to be filed against another occupant's lot.

**How to apply:** Keep building validation for every work request, then add the requester identity check on resident list/detail routes and validate `ownerId`/`tenantId` (including the email-linked legacy IDs) before inserting a lot-bound request.

For tenant-scoped inserts with an optional parent resource, validate the parent resource's syndicate against the effective insert scope before persistence; list filtering alone cannot repair an inconsistent relationship created at insert time.

**Why:** A provider could otherwise be stored under one syndicate while pointing at a building from another syndicate, making later building-based reads and workflows inconsistent.

**How to apply:** Resolve the effective syndicate first, load the referenced parent, reject missing parents, and return `403` when the parent belongs to a different syndicate before inserting the child row.

For sensitive generated documents, validating the authorized root row is not enough when legacy foreign keys are nullable: verify every related lot, building, member, and charge used in the document against the root syndicate before rendering.

**Why:** A malformed or historically inconsistent relationship can bypass a later query's apparent scope and mix another syndicate's property or resident data into a legal document.

**How to apply:** Fail closed with a safe data-integrity response when a required relation is missing or cross-syndicate; do not render a partial legal document.

For platform-owner supervision of governance/elections, require both an explicit supervision flag and a single target syndicate; never let a Super Admin list or inspect these modules globally by default.

**Why:** governance and election rows contain syndicate-specific resident and mandate data, so an unrestricted platform role is still a cross-syndicate disclosure risk.

**How to apply:** scope Super Admin list queries to the target syndicate and make row-level access require the same target match; apply relationship checks again when enriching work orders, lots, and providers.
