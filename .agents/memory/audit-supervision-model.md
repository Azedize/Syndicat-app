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
