---
name: Tenant mobile RBAC screens
description: Status of tenant-role placeholder screens vs real API wiring, and a recurring list-endpoint scoping gap found while auditing them.
---

mon-bail.tsx, documents.tsx, sinistres.tsx, and travaux-privatifs.tsx are now all wired to
real API endpoints (not static placeholders) — this superseded an earlier note that mon-bail
was a functional placeholder pending a later API phase.

**Recurring gap found while auditing these:** list (`GET`) endpoints that scope by
`syndicateId`/`buildingId` for `syndicate_admin` often forget to add a *personal* scope
(`reportedById`, `requestedById`, `status = published`, etc.) for the `member`/`tenant`
branch, so residents can see every other resident's rows in the syndicate (sinistres,
documents in draft/pending state, etc.) — not just their own.

**Why:** the same conditions-array pattern is reused across routes
(`artifacts/api-server/src/routes/*.ts`), and it's easy to add the admin-scope branch without
adding the matching member/tenant branch, since both branches sit in the same `if/else if`
chain and nothing type-checks that every role is covered.

**How to apply:** when reviewing or adding a `GET` list route, check every role in
`JwtPayload["role"]` has an explicit scope branch — not just "falls through to no filter" for
member/tenant. This is the same IDOR class documented in `audit-supervision-model.md`, just
on list endpoints instead of fetch-by-id.
