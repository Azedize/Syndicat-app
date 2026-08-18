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