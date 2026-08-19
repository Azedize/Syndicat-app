---
name: Audit log supervision model
description: How super_admin vs syndicate_admin actions are distinguished in audit_logs, and the IDOR class this fixed.
---

`audit_logs` has `actorRole` + `isSupervision` (boolean). Policy lives centrally in
`serverAuditLog()` (artifacts/api-server/src/lib/audit.ts) — all writers must go through
it, not raw `db.insert(auditLogsTable)`, or classification drifts.

Rule: `isSupervision = actorRole === "super_admin" && targetSyndicateId is set && !platformAction`.
A super_admin has no home syndicate, so any syndicate-scoped action they take is
supervision/support by default; pass `platformAction: true` for their own platform-level
duties (e.g. editing syndicate records/settings) so those aren't mislabeled as supervision.

**Why:** the original code logged `syndicateId: req.user.syndicateId`, which is empty for
super_admin, silently losing which syndicate a supervised action actually touched.

**How to apply:** when a table has no direct syndicateId (e.g. `appels_de_fonds`), derive it
by joining through the owning entity (e.g. `buildings.syndicateId`) before calling
serverAuditLog — and reuse that same derived value for the ownership check (see below),
don't only use it for logging.

Related access-control class bug found in this pass: routes gated only by `requireAdmin`
(super_admin OR syndicate_admin) without an explicit `derivedSyndicateId === req.user.syndicateId`
check for the syndicate_admin branch are IDOR-vulnerable to cross-syndicate access. Grep for
`requireAdmin`/`requireRole("super_admin", "syndicate_admin")` handlers that fetch-by-id and
verify each has this check before assuming the RBAC/syndicate-isolation work is complete.

Additional rule: a Super Admin mutation that targets a syndicate-owned row must require an
explicit supervision signal before looking up the target, then constrain the update to the
resolved target syndicate. This avoids both unscoped platform mutations and ID-existence
disclosure through different precondition responses.

**Why:** team-member role changes were reachable through the broad `requireAdmin` guard and
could mutate an arbitrary member ID without the supervision boundary used by operational routes.

**How to apply:** for Super Admin ID-based syndicate mutations, check `?supervision=true` before
the target query, resolve the target's syndicate, and include that syndicate in the final update
predicate; non-platform roles must require a non-empty JWT `syndicateId`.

Template Studio follows the same rule: template-id reads for syndicate admins must constrain
status and `(syndicateId IS NULL OR syndicateId = JWT syndicateId)` in the SQL predicate, not
fetch the row first and reject it afterward. Super Admin id-based template operations use the
explicit supervision target before loading the template.

**Why:** Template definitions are either global or syndicate-owned; post-fetch checks leave an
unscoped identifier lookup and make the route family inconsistent with the platform supervision
boundary.

**How to apply:** reuse the scoped reader/supervision helper for template details, versions,
permissions, duplication, restoration, and lifecycle mutations.
