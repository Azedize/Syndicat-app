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
- Aligned invited-user password validation with the 8-character authentication policy and normalized invited-user emails.

### Files changed
- `artifacts/mobile/context/AuthContext.tsx`
- `artifacts/mobile/app/login.tsx`
- `artifacts/mobile/context/LanguageContext.tsx`
- `artifacts/mobile/services/api.ts`
- `artifacts/api-server/src/routes/auth.ts`
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
- `pnpm --filter @workspace/api-server run typecheck` passed after OTP retention scheduler integration.
- `pnpm --filter @workspace/api-server run build` passed after OTP retention scheduler integration.
- `pnpm --filter @workspace/api-server run typecheck` passed after invitation policy alignment.
- `pnpm --filter @workspace/api-server run build` passed after invitation policy alignment.

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
- Test invited-user activation and welcome email delivery with a non-production account.
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
