- 2026-08-19 — User-management mutations now require Super Admin `supervision=true` plus an explicit target `syndicateId` before status, role, or deletion lookups. Updates and deletes reapply the same syndicate predicate, preventing cross-syndicate account mutation while preserving syndicate-admin ownership checks.

- 2026-08-18 — Vérification post-restauration : le schéma de développement contient les relations financières, documentaires et d’abonnement requises ; les endpoints financiers, pièces jointes, recouvrement et documents restent protégés (`401` sans session), sans erreur de relation manquante au démarrage.

# 2026-08-07 — Invoice persistence boundary

- Invoice IDs, references, dates, status, amount, and syndicate ownership are now determined server-side from authenticated request scope rather than trusted client fields.
- Mobile invoice creation no longer submits a fabricated identifier or server-controlled lifecycle fields.
- 2026-08-07 — Resident document request: role-filtered template visibility, real server-side autofill/payment eligibility, and existing pending-review submission boundaries were preserved during the UX pass.
- Ma Boutique changes preserve the existing authenticated marketplace API, seller CRUD permissions, upload authorization, destructive confirmations, and promotion proof-of-payment flow; raw API errors are not exposed.
## 2026-08-12

- General Assembly mutations now enforce the authenticated syndicate at the meeting boundary, not only through the broad operational-role guard.
- Status updates, attendance, resolution creation/voting, PV retrieval, and proxy CRUD fail closed for cross-syndicate IDs; resolution voting also requires the URL meeting ID to match the resolution parent.
- AG creation no longer persists an empty syndicate identifier and validates optional building references against the target syndicate.
- Verification: API typecheck, production build, managed workflow restart, health probe, and unauthenticated AG route probe passed.

## 2026-08-13

- Hardened elections and mandates against unscoped non-platform sessions; election creation now rejects missing syndicate scope.
- Hardened ideas and financial transparency with resource-level syndicate authorization on list, vote, review, challenge, and resolution paths.
- Hardened private-works listing to fail closed instead of querying globally when the JWT lacks syndicate scope.
- Verification passed: API typecheck, production build, `git diff --check`, API workflow restart, `/api/healthz` (`200`), and protected route probes (`401` without authentication).

# Security Log

## 2026-08-11

- Hardened `locataires` and `sinistres` against cross-syndicate ID enumeration and resident cross-building access; related building/lot ownership is checked before create, update, or delete.
- Hardened `travaux` and `prestataires`: all syndicate management roles require JWT syndicate scope, works lists are syndicate-filtered, residents cannot assign providers, and provider/lot relationships are checked against the target building.
- Marketplace listing creation now rejects non-platform users without a JWT syndicate scope; existing seller ownership and Super Admin moderation boundaries remain unchanged.
- Verification: API typecheck, diff check, managed workflow restart, server startup, scheduler startup, and SMTP verification passed.

## 2026-08-06

- List-loading error surfaces on workflows and works no longer expose raw API error details to end users; recovery uses localized guidance and an explicit retry action.
- Ideas list and action failures no longer surface raw API messages; users receive localized recovery guidance while authorization and API persistence remain unchanged.
- National dashboard data failures now fail visibly and safely without fabricating zero-valued platform KPIs or exposing raw API details; Super Admin authorization remains enforced by the existing role guard.
- Platform Support now distinguishes unavailable ticket data from a genuine empty queue and does not expose raw API errors; the existing `super_admin`/`syndicate_admin` RoleGuard and scoped support API remain unchanged.
- Marketplace Moderation now distinguishes unavailable moderation data from genuine empty queues and does not expose raw API errors; the existing Super Admin-only RoleGuard remains enforced.
- Document Recycle Bin now distinguishes unavailable deleted-document data from a genuine empty archive and does not expose raw API errors; existing restore and Super Admin-only purge controls remain unchanged.
- Governance localization preserved the existing management-role guard and destructive-action confirmations; member removal and delegation revocation remain explicit user-confirmed actions.
- Internal Messaging now distinguishes an unavailable announcement response from a genuine empty inbox/sent folder and does not expose raw API errors; existing protected access and announcement API authorization remain unchanged.
- Documents Dashboard localization preserved the existing role-scoped administrator quick actions and database/API-derived document counts; no client-side fallback statistics were introduced.
- Administrative Acts retains the existing `RoleGuard` and admin-only mutation controls; its new retry state does not expose raw API errors or alter the `/actes` authorization contract.
- Sinistres & Incidents retains its existing management-role guard and authenticated API scoping; claim load and create failures now use safe localized messages without exposing raw server details.
- Mon Lot retains its existing owner/governance RoleGuard and `/lots/my-lot` personal endpoint; dependency failures use safe localized recovery without exposing raw API details or inventing financial values.
- Mon Bail & Loyer retains its tenant-only RoleGuard and `/locataires/my-lease` personal endpoint; lease failures use safe localized recovery without exposing raw server details.
- Travaux workflow failures now use fixed localized messages rather than returning raw server error text to the mobile UI.
- Notification preference updates remain user-scoped by the existing API contract; the UX pass changes presentation only and does not broaden alert visibility or mutation permissions.
- Chat localization preserves existing conversation access, message mutation permissions, report actions, attachment authorization, and protected-route behavior; no API scope was changed.
- Level-1 Support localization preserves the existing member/tenant/syndicate-admin access boundary, syndicate-scoped ticket APIs, reply permissions, and admin-only resolve/escalate controls.
- Super Admin National Dashboard localization preserves the existing Super Admin-only RoleGuard, platform-wide syndicate/ranking visibility, authenticated detail requests, and chat contact flow; no permission or API scope was broadened.
- AG/Elections presentation fixes preserve the existing Loi 18-00 role guards, member/tenant participation boundary, election transition enforcement, anonymous ballot exposure, proxy delegation authorization, and mandate admin/member action checks.
- SignatureOrderPanel and DocumentWizard preserve the existing document ownership, signer-role, generation, signature, publication, and entity-selection boundaries; no API scope, workflow authorization, or document storage behavior changed.
- Template Studio audit entries now use the shared `entity`/`entityId` contract with serialized details; route-parameter normalization does not broaden access or alter existing Super Admin and syndicate-admin guards.
- Réclamations & Griefs retains its existing role-scoped list/detail/mutation permissions and API contracts; safe localized failures do not expose raw server details or broaden confidential grievance visibility.
- Statistiques retains the existing Super Admin-only platform endpoint and role guard; unavailable responses now fail visibly instead of presenting misleading zero-valued KPIs, and persisted subscription data is read without changing access scope.
- Public Welcome no longer implies database-backed performance or customer outcomes through unverified metrics, synthetic charts, or named testimonials; no authentication, API scope, or personal-data behavior changed.
- Approval Workflow presentation changes preserve existing authenticated access, administrator creation permissions, decision authorization, document navigation, and API contracts; no workflow scope or personal-data exposure changed.
- Level-1 Support recovery changes preserve member/tenant/syndicate-admin access, syndicate-scoped ticket and reply retrieval, escalation authorization, and mutation boundaries; no raw server details or additional ticket data are exposed.
- Financial Reports presentation changes preserve the existing role guard and statistics endpoint scope; only display formatting changed, with no additional financial data exposure.
- Support RTL/localization changes preserve authenticated member/tenant/syndicate-admin access, syndicate-scoped retrieval, escalation authorization, and mutation boundaries; no data scope changed.
- Stripe webhook payment finalization remains transaction-backed and idempotent; the SDK compatibility update changes field mapping only and does not weaken signature verification, payment-state checks, or subscription ownership persistence.
- Buildings detail/list/create/update now fail closed for management users without JWT `syndicateId`, enforce row-level syndicate matching, and restrict resident building visibility to linked buildings.
- Parking spot, violation, reservation, and availability routes enforce building scope; spot lot assignment validates lot/building consistency; reservation listing is scoped by spot building; vehicle management no longer exposes cross-syndicate rows through role fallthrough.
- Member creation now requires a valid target syndicate for Super Admin and a non-empty JWT syndicate scope for other management roles; audit writes and reads fail closed for scope-less non-platform sessions.
- Lot list and personal-lot lookup apply the authenticated syndicate to building/owner resolution; Super Admin team-member role changes require explicit supervision before target lookup and update the row within its resolved syndicate.
- Chat contact discovery, conversation lists/search, conversation reads/writes, typing, archive, message deletion/editing, and reactions now reject non-platform sessions without JWT `syndicateId` instead of substituting an empty scope.
- Chat message and reaction mutations validate access to the parent conversation before changing rows; non-platform marketplace/incident conversation creation persists only the authenticated syndicate scope. Existing Super Admin supervision and marketplace/incident exceptions remain unchanged.
- Support ticket list/detail/reply/resolve/escalate and publication/cotisation retrieval now fail closed for non-platform JWTs without a syndicate scope; support escalation no longer persists an empty scope.
- Email Center syndicate-admin list/stat queries fail closed without scope, and Super Admin administrative-act updates/deletes require explicit supervision before ID lookup.
- Idea vote lookup now uses parameterized `inArray` predicates instead of interpolated SQL identifiers.
- Document-linked storage objects now decode optional bearer tokens and require a valid owner or matching syndicate; document deletion also checks the caller's syndicate before admin/owner authorization.
- User-management list/create/status operations now fail closed for scope-less `syndicate_admin` sessions instead of querying globally or creating null-syndicate users.
- Document preview/autofill no longer substitute an empty syndicate identifier; non-platform autofill requests without JWT scope are rejected before loading syndicate data.
- Actions now reject missing-scope non-platform sessions before route handlers, preserving 403 instead of turning `syndicateWhere()` failures into generic 500 responses.
- Documents list, summary, and entity selectors now reject scope-less non-platform sessions before database queries.
- Subscription self-service, payment history/detail, payment creation/cancel/retry, subscription update, and billing-invoice endpoints now reject scope-less non-platform sessions before any query or mutation.
- Debt escalation history now applies both resident and syndicate predicates for non-platform users; overdue debt queries resolve scoped buildings/lots before loading unpaid calls.
- Escalation detail/override/resolve/list/history/overdue and governance council/mandate/delegation endpoints reject non-platform JWTs without a syndicate scope instead of falling through to empty or global behavior.
- The shared operational middleware now fails closed for every syndicate management role whose JWT lacks `syndicateId`, preventing route-specific global-query fallbacks.
- Invoice attachment listing is restricted to `super_admin`, `syndicate_admin`, and `treasurer`; financial creation and status mutations now emit scoped audit records without changing row-level ownership checks.
- 2026-08-18 — Escalation PDF generation now validates every nullable related lot, building, and member against the authorized escalation syndicate before loading legal-document details or unpaid charges; malformed cross-syndicate relationships fail closed with `409`.
- 2026-08-18 — Email-log retry queries now include the authenticated syndicate predicate before loading the row; Super Admin transparency writes require `?supervision=true`, a real target syndicate, and transaction/syndicate consistency; Super Admin cross-user membership and badge PDFs require supervision. Public badge verification no longer discloses building, lot, or join-date details.
- 2026-08-18 — Financial building summaries now require explicit `?supervision=true` for Super Admin platform access before resolving any building rows. The national rankings leaderboard now requires `super_admin`; the existing personal trend endpoint remains syndicate-scoped.
- 2026-08-18 — Initial syndicate administrator assignment now rejects already-affiliated users and conditionally links only unassigned members inside the creation transaction. Super Admin syndicate updates require explicit supervision. Storage document confirmation now requires same-syndicate access, creator or document-manager authorization, and manager-only publication; missing-scope non-platform sessions fail closed. Generic uploads now persist owner, syndicate, MIME, size, and path metadata for both multipart and presigned flows. Private object serving requires an authenticated owner or same-syndicate caller; Super Admin cross-syndicate access requires explicit supervision. Unknown paths fail closed and document deletion removes the ownership row.
- 2026-08-18 — Election voting now requires a non-platform authenticated syndicate scope and matching election syndicate; delegation revocation checks the parent election before changing a proxy; mandate resignation checks the mandate syndicate before mutation. Anonymous ballot storage and proxy eligibility rules are unchanged.
- 2026-08-18 — Targeted Super Admin AG meeting lists now require `supervision=true`; non-Super-Admin lists remain hard-scoped to the JWT syndicate and unfiltered Super Admin platform views remain available by policy.
- 2026-08-19 — Super Admin invoice, receipt, budget, and AG PDF generation now requires explicit supervision before loading the target record. Super Admin document deletion also requires supervision before lookup; supervised access retains existing document/tenant checks. Unauthenticated requests remain `401`, and seeded Super Admin requests without supervision return `403 SUPERVISION_REQUIRED`.
- 2026-08-19 — Extended the supervision boundary to meeting deletion, fund-call payment/receipt access, administrative-act list/detail/PDF reads, document signing, and permanent document purge. Budget updates now validate referenced meetings against the budget building's syndicate. API build/restart, health, scheduler/SMTP startup, unauthenticated protected probes, and diff validation passed.
- 2026-08-19 — Template Studio syndicate-admin template reads now constrain status and global-or-JWT-syndicate ownership before loading a row. Super Admin template-id detail/version/permission/duplicate/restore/lifecycle operations now require explicit supervision before target lookup; global templates remain available through the existing supervised flow.
 - 2026-08-19 — Tenant detail and CRUD routes now fail closed outside the effective syndicate scope. Lot-to-building resolution and explicit building references are checked in SQL against that scope before tenant persistence or mutation; Super Admin mutations require explicit supervision, and client-provided syndicate ownership is ignored/rejected.
 - 2026-08-19 — Work-order assignment, report submission, validation, update, and deletion now resolve the effective syndicate before lookup; Super Admin access requires explicit supervision, and each target is joined to its owning building with the syndicate predicate. Creation also validates the selected building against that scope.
 - 2026-08-19 — Work-order detail reads now fail closed before target exposure: Super Admin requires explicit supervision and a target syndicate, syndicate-team roles use their JWT syndicate in the building join, and provider/lot relationships are constrained to the validated building.
 - 2026-08-19 — Work-order lists filtered by building now enforce the same Super Admin supervision boundary and validate the requested building's syndicate before applying the query predicate; unfiltered Super Admin platform listings remain intentional.
- 2026-08-19 — National ranking satisfaction no longer uses a synthetic 50/100 value. Approved marketplace reviews are joined through syndicate-owned products, and absent review data is excluded from the aggregate rather than represented as a fabricated customer outcome.
- 2026-08-20 — Incident creation now requires Super Admin supervision and a target syndicate matching the selected building. Incident updates resolve the target through an inner join to the syndicate-owned building before mutation, preventing cross-tenant IDOR and unsupervised platform writes.
- 2026-08-20 — Meeting update supervision now has one consistent mutation guard instead of a duplicated delete message; attendance confirmation records the authenticated actor and meeting syndicate in the audit trail. No data-access scope was broadened.
- 2026-08-21 — Provider and provider-contract ID routes now fail closed for Super Admins without `?supervision=true&syndicateId=...`; loaded provider/building ownership must match the requested syndicate before detail reads or mutations proceed. Team roles continue to use their JWT/building scope.
- 2026-08-24 — Parking ID operations now resolve the owning building or vehicle owner's syndicate before Super Admin access; `supervision=true` without a matching `syndicateId` is rejected for spot updates, vehicle deletion, violation status, reservation cancellation, and availability reads.
- 2026-08-24 — Lot detail and CRUD operations now resolve the lot's owning building before access or mutation. Super Admin access requires `supervision=true` and a matching target syndicate; non-platform access fails closed when JWT scope is missing or mismatched.
- 2026-08-24 — Building detail and CRUD routes now require Super Admin `supervision=true` with a matching `syndicateId`; building creation uses only the supervised query target rather than a client-provided body scope. Team and resident building scopes remain enforced.
- 2026-08-24 — Member detail and CRUD routes now require Super Admin `supervision=true` with a matching `syndicateId`; member creation uses only the supervised query target, and status changes fail closed through the operational access guard.