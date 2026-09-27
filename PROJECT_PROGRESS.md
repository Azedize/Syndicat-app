# Project Progress

## 2026-09-02

### Completed
- Confirmed PostgreSQL 18 is running on localhost:5432.
- Confirmed database `syndycat_global_cps` is reachable and contains 103 public tables.
- Confirmed API health endpoint returns HTTP 200 on port 5000.
- Confirmed seeded admin login succeeds with HTTP 200 for `syndic@andalous.ma`.
- Fixed mobile authentication error mapping: only HTTP 401 is shown as invalid credentials; server/network failures now use a dedicated localized message.
- Migrated native access and refresh token storage to Expo SecureStore, with legacy AsyncStorage migration and web fallback.
- Replaced email OTP generation with cryptographically secure `crypto.randomInt`.
- Changed subscription verification to fail closed with HTTP 503 on database errors instead of allowing writes.
- Fixed syndicate onboarding logo upload to use the authenticated central API client and configured API URL.
- Centralized mobile API URL resolution for shared requests and uploads, with a consistent local port default of 5000.
- Migrated legacy document, finance, chat, invoice, marketplace, and profile screens to the shared API URL helper.
- Normalized escalation letter URLs, including stored `/api/...` paths and absolute URLs, and removed the final mobile 8080 fallback.
- Improved welcome CTA layout: balanced mobile button widths and prevented awkward wrapping of the platform discovery label.
- Localized the welcome theme toggle label using the existing French, English, Arabic, and Spanish translations.
- Corrected the welcome CTA responsive layout after visual verification: removed aggressive text shrinking and stacked actions below 520px.
- Protected pending registration data, including the password between registration and email OTP verification, with SecureStore on native platforms.
- Normalized login emails case-insensitively and aligned change-password minimum length with registration policy.
- Enabled secure self-onboarding for a new `syndicate_admin` without a syndicate, while preventing client-controlled admin reassignment.
- Replaced in-memory email OTP send limiting with a durable PostgreSQL count over the last hour, preserving multi-instance enforcement.
- Added hourly OTP retention cleanup with a two-hour safety window, preserving verification and rate-limit accounting while preventing indefinite row growth.
- Required a recent verified email OTP before `POST /auth/register`, closing the direct-registration bypass while preserving the mobile OTP flow.
- Normalized emails in password recovery so uppercase or padded input resolves the same account as login and registration.
- Documented port checks before API/Expo startup to prevent duplicate-process `EADDRINUSE` failures.
- Adapted registration phone handling for Moroccan local (`05/06/07...`) and international formats, normalized to E.164 before API submission.
- Aligned registration phone placeholders and validation messages with the supported Moroccan local and international formats.
- Harmonized syndicate setup SMS send/verify with the same Moroccan phone normalization to E.164.
- Aligned invited-user password validation with the 8-character authentication policy and normalized invited-user emails.
- Fixed invited accounts being created as `pending` while the welcome flow instructed them to log in; invitation-created accounts are now active.

### Files changed
- `artifacts/mobile/context/AuthContext.tsx`
- `artifacts/mobile/app/login.tsx`
- `artifacts/mobile/context/LanguageContext.tsx`
- `artifacts/mobile/app/syndicate-setup.tsx`
- `artifacts/mobile/services/api.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `LOCAL_RUN_COMMANDS.md`
- `artifacts/mobile/app/register.tsx`
- `artifacts/mobile/context/LanguageContext.tsx`
- `artifacts/api-server/src/lib/otp-retention.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/routes/users.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/syndicates.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/middleware/subscription.ts`
- `artifacts/mobile/app/syndicate-setup.tsx`
- `artifacts/mobile/lib/api.ts`
- `artifacts/mobile/lib/upload.ts`
- `artifacts/mobile/app/actes-administratifs.tsx`
- `artifacts/mobile/app/budget-previsionnel.tsx`
- `artifacts/mobile/app/charges.tsx`
- `artifacts/mobile/app/chat-thread.tsx`
- `artifacts/mobile/app/invoices.tsx`
- `artifacts/mobile/app/my-shop.tsx`
- `artifacts/mobile/app/profile.tsx`
- `artifacts/mobile/app/escalation.tsx`
- `artifacts/mobile/app/register.tsx`
- `artifacts/mobile/app/email-verify.tsx`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/mobile/app/welcome.tsx`
- `artifacts/mobile/package.json`
- `pnpm-lock.yaml`
- `PROJECT_PROGRESS.md`

### Validation
- `pnpm db:status` passed.
- `pnpm --filter @workspace/mobile run typecheck` passed.
- `GET http://localhost:5000/api/healthz` returned HTTP 200.
- `POST http://localhost:5000/api/auth/login` returned HTTP 200 with `syndicate_admin` role.
- `pnpm --filter @workspace/mobile run typecheck` passed after SecureStore migration.
- `pnpm --filter @workspace/api-server run typecheck` passed after OTP hardening.
- `pnpm --filter @workspace/api-server run typecheck` passed after subscription enforcement hardening.
- `pnpm --filter @workspace/mobile run typecheck` passed after onboarding logo upload fix.
- `pnpm --filter @workspace/mobile run typecheck` passed after API URL centralization.
- `pnpm --filter @workspace/mobile run typecheck` passed after legacy screen URL migration.
- `pnpm --filter @workspace/mobile run typecheck` passed after escalation URL normalization.
- `pnpm --filter @workspace/mobile run typecheck` passed after welcome CTA styling fix.
- `pnpm --filter @workspace/mobile run typecheck` passed after welcome theme label localization.
- `pnpm --filter @workspace/mobile run typecheck` passed after CTA responsive correction.
- `pnpm --filter @workspace/mobile run typecheck` passed after pending registration storage hardening.
- `pnpm --filter @workspace/api-server run typecheck` passed after login normalization and password policy alignment.
- Runtime login with `SYNDIC@ANDALOUS.MA` returned HTTP 200 and the expected `syndicate_admin` role.
- `pnpm --filter @workspace/api-server run typecheck` passed after self-onboarding authorization change.
- `pnpm --filter @workspace/api-server run typecheck` passed after durable OTP rate-limit change.
- `pnpm --filter @workspace/api-server run typecheck` passed after password-recovery email normalization.
- Confirmed API already listening on port 5000 and Expo already listening on port 8081; documented reuse instead of launching duplicates.
- `pnpm --filter @workspace/mobile run typecheck` passed after Moroccan phone normalization.
- `pnpm --filter @workspace/mobile run typecheck` passed after phone-format UX alignment.
- `pnpm --filter @workspace/mobile run typecheck` passed after setup SMS normalization.
- `pnpm --filter @workspace/api-server run typecheck` passed after OTP retention scheduler integration.
- `pnpm --filter @workspace/api-server run build` passed after OTP retention scheduler integration.
- `pnpm --filter @workspace/api-server run typecheck` passed after invitation policy alignment.
- `pnpm --filter @workspace/api-server run build` passed after invitation policy alignment.
- `pnpm --filter @workspace/api-server run typecheck` passed after invited-account activation fix.
- `pnpm --filter @workspace/api-server run build` passed after invited-account activation fix.

### Remaining
- Review and harden multi-tenant authorization across all API routes.
- Verify SecureStore behavior on Android and iOS builds.
- Verify registration interruption, OTP resend, and pending plan continuation on Android and iOS builds.
- Add automated auth regression coverage for email normalization and password policy.
- Add an integration test for new-admin self-onboarding and duplicate-syndicate rejection.
- Add cleanup/retention for historical OTP rows without weakening rate-limit accounting.
- Add an integration test for concurrent OTP send requests and the five-per-hour boundary.
- Observe the OTP cleanup log after a clean API restart; current port 5000 is occupied by another API process.
- Add an automated integration test for direct registration rejection and OTP-verified registration success.
- Add automated auth regression coverage for password recovery email normalization.
- Keep startup checks aligned with any future development port changes.
- Add automated phone-format tests for local and international Moroccan numbers.
- Verify SMS send/verify with a configured ZimSend sandbox number.
- Test invited-user activation and welcome email delivery with a non-production account.
- Add a `mustChangePassword` field and first-login enforcement for temporary invitation credentials.
- Complete route-by-route tenant isolation review and negative authorization tests.
- Validate onboarding logo upload against local storage and deployed GCS configuration.
- Add versioned Drizzle migrations and reconcile legacy/current seeds.
- Replace local URL construction in remaining legacy screens with the shared API helper.
- Validate document and escalation links on Android, iOS, and web with configured production domains.
- Audit production configuration, jobs, uploads, payments, notifications, localization, accessibility, and responsive behavior.
- Add focused integration and role-journey tests.

### Blocked or not verified
- PostgreSQL credentials and external provider credentials were not exposed or changed.
- Full application production readiness is not claimed; only the listed checks were executed.

## 2026-09-26

### Completed
- Billing: syndicate admins can no longer self-activate a subscription (status changes are super_admin-only; admins may only cancel / toggle auto-renew).
- Subscription gate is deny-by-default (no subscription, `pending_payment`, open-ended `grace`, unknown status → read-only) and considers every subscription row, so a pending plan change never locks out a valid subscription. The 30-day trial is created in the syndicate-creation transaction.
- Appels de fonds: payment declaration only from payable states, proof must be the payer's own upload, "online" method removed until a real gateway exists; validation is one atomic transaction (conditional status update, sequential `REC-YYYY-NNNNNN` receipt, ledger transaction, cash entry) — fixes silent loss of ledger entries (FK mismatch) and double validation.
- Charge generation: idempotent (unique `lot × period × type`), divisor derived from the period (month/quarter/year), exact centime split (largest remainder).
- Budgets: created as draft/submitted only; approval requires an AG of the same syndicate (server-dated `votedAt`); approved amounts are locked; creation is transactional.
- Auth: HS256 pinned; refresh/reset tokens stored as SHA-256; refresh rotation is atomic with reuse detection (10 s grace); timing-safe login; bcrypt cost 12; `mustChangePassword` enforced server-side with a mobile change-password screen; team invitations no longer return or weaken temporary passwords.
- Rate limiting: strict limit only on credential endpoints plus a per-account login limit (previously `/auth/me` and `/auth/refresh` shared a 20/15 min per-IP budget).
- Session tokens removed from URLs: 5-minute GET-only download tickets (`POST /auth/file-ticket`) for PDFs/images; all mobile call sites migrated.
- Uploads verified by file signature; stored type/extension derived from content.
- SMS OTP persisted in PostgreSQL, Moroccan mobiles only, 3/hour per number; self-onboarding requires a server-verified phone.
- Scheduled jobs run once per interval platform-wide (`scheduled_job_runs` claim), not once per instance/restart.
- Cross-tenant references blocked (`findForeignReference`) in document generation, recovery/sale files, PV, cotisations, transactions.
- Notifications: alert audience enforced (residents no longer see team-only alerts); personal notifications (`alerts.recipient_user_id`, `notifyUser`) for payment declared/validated/rejected, new charge calls, ticket replies/resolution, personal documents.
- Personal documents (`documents.subject_user_id`): residents only see general documents and their own personal ones (list, detail, download, versions, signers, comments, files); publication of a personal document notifies only that person.
- Document lifecycle fix: second status transition (validated → published) returned 500 (duplicate version snapshot).
- Member onboarding: "add member" can invite the co-owner to the app in one step (member + account, forced password change); `POST /users` for a co-owner also creates the member record; duplicate member POST from the mobile context removed.
- Right of access (Loi 09-08): `GET /me/data-export` + "Exporter mes données" in settings.
- Ballot secrecy: removed client-side audit entry that linked a voter to their candidate; client audit writes restricted to the team and tagged `[client]`.
- DataContext: optimistic writes now surface server errors and resync instead of silently keeping unsaved changes; fake local "payments" (`payOrder`, `payCotisation`) removed.
- Database: 13 missing `syndicate_id` foreign keys (restrict on billing/financial tables), missing tenant indexes, versioned migrations (`lib/db/drizzle`, baseline + 2 idempotent migrations with backfill).
- Removed dead code: `twilioVerify.ts`, `phase1-cleanup.mjs`, `hello.ts`, unused mobile components, unused dependencies (API and mobile).

### Validation
- `pnpm run typecheck` passed (scripts, api-server, mobile); `pnpm --filter @workspace/api-server run build` passed; `expo export --platform web` bundled.
- Regression suites against a running API (SMTP disabled): RBAC 35/35, auth-security 44/44, finance-integrity 35/35, documents-security 28/28, scenario-e2e 48/48.
- Migrations verified on a fresh database and on the existing development database.

### Remaining
- Mobile/native: verify SecureStore, file tickets in `<Image>`, and the change-password redirect on Android/iOS builds.
- Legacy trade-union modules (`payslips` insert is non-functional, `cotisations` member flow requires a proof the UI never sends, union actions, national rankings) should be removed or redesigned.
- Funds are still pooled per syndicate (no per-copropriété bank account, ledger or bank reconciliation); no CMI integration; `members`/`users` identity split remains (linked by email).
- `.env` uses `ZIMSEND_CLES_API` whereas the code reads `ZIMSEND_API_KEY` — SMS is not configured.
- CIN encryption at rest not implemented (no API write path exists yet); CNDP declaration, processing register and hosting/transfer authorization are legal steps.
- Test runs earlier today sent 7 real emails through the configured SMTP (syndicate-created to example.invalid, 2 support-ticket notifications) before SMTP was disabled for tests.
