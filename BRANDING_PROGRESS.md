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

## Phase 2 — Logo & App Icon

**Status:** Complete — 2026-08-10

### Implemented

- Replaced the retired purple/gold shield artwork in the Expo app icon with the MIZAN balance mark.
- Built the production icon from the existing MIZAN vector: deep-navy gradient field, white governance form, gold balance line, and blue/teal center signal.
- Kept the vector source at `artifacts/mobile/assets/images/mizan-mark.svg` and generated a 1024×1024 8-bit RGBA PNG for Expo.
- Aligned the same icon asset across the app icon, splash image, Android adaptive foreground, notification icon, and web favicon.
- Updated Expo splash, adaptive icon, and notification colors to the MIZAN deep-navy token.
- Corrected the public welcome lockup to use the light/dark wordmark variant based on the page theme.

### Verification

- Mobile TypeScript check passed with zero errors.
- `git diff --check` passed.
- Icon validated as a 1024×1024 sRGB 8-bit RGBA PNG.
- Expo workflow restarted and Metro bundled successfully.
- Public `/welcome` preview checked at 402×874 with no new browser runtime exceptions; existing Expo web compatibility warnings remain non-blocking.

### Next phase

Phase 3 — Design System. The MIZAN identity and icon system are now stable inputs for the broader welcome experience and product UI refinement.