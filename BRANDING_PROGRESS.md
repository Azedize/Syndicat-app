# Branding Progress

## Phase 1 — Brand Identity

**Status:** Complete — 2026-08-10

### Decision

MIZAN is the canonical product brand. The public product name is **MIZAN**, with the descriptor **Community Governance & Residence Operations** and the Morocco-market short descriptor **Gouvernance & gestion des résidences**.

The legacy presentation identities **SYNDYCAT GLOBAL CPS** and **VERIDIAN** were removed from customer-facing product surfaces. The registered legal entity name **MIZAN Community OS SARL** remains in legal/privacy text where it identifies the company rather than the product.

### Audited surfaces

- Expo app configuration and public app entry.
- Welcome, intro, get-started, login, onboarding, and subscription entry screens.
- Shared logo component and brand constants.
- Desktop/sidebar brand lockup and authenticated About surface.
- OTP email, transactional email shell/templates, subscription reminders.
- PDF headers, footers, badge text, document template metadata, and verification page.

### Implemented

- Consolidated the visible wordmark and product name on MIZAN.
- Renamed the logo component to `MizanLogo` and kept the vector mark shared across entry and authenticated surfaces.
- Updated the app display name and product descriptors.
- Updated customer-visible email, PDF, verification, and document-catalog branding.
- Removed the old verification-domain and support-email fallbacks from generated badge PDFs.
- Preserved the legal entity wording in legal documents.

### Verification

- Mobile TypeScript check passed with zero errors.
- API TypeScript check passed with zero errors.
- `git diff --check` passed.
- Legacy product-name search is clean in mobile/API customer-facing code; only legal-entity references remain.
- Mobile workflow restarted and Metro bundled successfully.
- API workflow restarted and built/started successfully.
- Public `/welcome` preview checked at 402×874 with no new browser runtime exceptions.

### Next phase

Phase 2 — Logo & App Icon. The existing icon artwork remains intentionally unchanged until that phase begins.