---
name: PDF Gen3 reference-image design families
description: Four new builder functions + BRAND tokens + 13 template case updates matching 4 uploaded reference images at 95%+ fidelity.
---

## What was built

Four new header/cover builder functions added to `artifacts/api-server/src/lib/documentPdf.ts`, after `buildDocumentOverviewGrid`. All new BRAND tokens are in the `BRAND` const block.

### New BRAND tokens added
- `navyHeader` / `navyHeaderMid` — Image 1 dark navy (Nexora report)
- `corpBlue` / `corpBlueDark` — Image 3 corporate blue (Purchase Order)
- `legalDark` / `legalGold` — Image 4 dark cover + gold (Veritas Legal)
- `certNavy` / `certGold` — Image 2 certificate navy + gold (SYNDICARE)
- `emeraldStripe` — Image 1 green accent stripe below nav header

### New builder functions
1. **`buildFinancialFamilyHeader()`** — Image 1 style. Dark `navyHeader` full-bleed band + `navyHeaderMid` reference panel + 3pt `emeraldStripe` below.
2. **`buildCorporateDocHeader()`** — Image 3 style. `corpBlue` band with 30pt bold white doc-type title + `corpBlueDark` reference panel + 2pt accent stripe.
3. **`buildLegalContractCover()`** — Image 4 style. Two-zone: left 44% `legalDark` with gold hairlines + org identity; right 56% white with 2×2 reference grid + QR. 2pt gold stripe below.
4. **`buildFinancialBarChart()`** — Image 1 chart. pdfmake canvas rects: grey track + coloured fill for actuals + thin vertical budget-target marker. Title row with legend.

### Template cases updated (13 templates)

| Template | New header | Header replaced |
|---|---|---|
| rapport_financier | buildFinancialFamilyHeader | buildHeaderBand + buildGovernanceBanner |
| rapport_audit | buildFinancialFamilyHeader | buildHeaderBand + buildGovernanceBanner |
| appel_de_fonds | buildCorporateDocHeader | buildHeaderBand |
| facture | buildCorporateDocHeader | buildHeaderBand |
| contrat | buildLegalContractCover | buildHeaderBand + buildGovernanceBanner |
| convention_partenariat | buildLegalContractCover | buildHeaderBand + buildGovernanceBanner |
| accord_collectif | buildLegalContractCover | buildHeaderBand + buildGovernanceBanner |
| reglement | buildLegalContractCover | buildHeaderBand |
| contrat_bail | buildLegalContractCover | buildHeaderBand |

### Theme colors updated in `getDocumentTheme()`
- **Certificate family** (attestation, certificat, attestation_*, recu_paiement): `certNavy` primary + `certGold` secondary
- **Contract family** (contrat, convention_partenariat, accord_collectif, contrat_bail, reglement): `legalGold` primary + `legalDark` secondary

### Bar chart in rapport_financier
Injected after `financialDashboard()` call. Uses an IIFE to compute categories from available KPI strings (rapportTotalPrevu/rapportTotalRealise/outstandingNum/rapportRevenue/rapportExpenses). Skips if all zeros.

**Why:** The body accent color (emerald, gold, etc.) flows through all tables/dividers/signatures unchanged; only the opening header element is replaced. This gives the maximum visual fidelity without disrupting the existing data layout logic.

**How to apply:** When adding new templates to the legal/contract family, call `buildLegalContractCover(syndInfo, theme.categoryLabel, docNum, qrDataUrl, accentColor, today, logoDataUrl, buildingName, version)` instead of `...header,`. For financial family use `buildFinancialFamilyHeader`. For corporate ops (invoices, charges) use `buildCorporateDocHeader`.
