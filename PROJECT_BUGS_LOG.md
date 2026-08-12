- 2026-08-10 — Corrigé : la corbeille documentaire affichait encore « Corbeille », les catégories, les confirmations et les dates en français dans toutes les langues. Les libellés et dates suivent maintenant le contexte de langue.
- 2026-08-10 — Corrigé : l’historique des versions et les commentaires de la bibliothèque documentaire imposaient `fr-FR` même lorsque l’utilisateur avait choisi l’anglais, l’arabe ou l’espagnol.
- 2026-08-10 — Corrigé : Mon Bail & Loyer imposait `fr-FR` aux dates et montants, ce qui produisait une présentation incohérente pour les locataires ayant choisi une autre langue.
# Project Bugs Log

## 2026-08-11

- Corrected a server-side isolation gap where non-`syndicate_admin` management roles could reach unscoped works data when no building filter was supplied.
- Corrected mutation gaps allowing client-selected lots/providers to be attached to an unrelated building, and prevented marketplace listings from being created without an authenticated syndicate scope.
- Remaining production audit work is intentionally open for adjacent API routes; no claim of full platform-wide authorization coverage is made here.

## 2026-08-06

- Internal Messaging no longer silently presents stale or empty content when the announcements request fails; the screen now provides localized retryable recovery.
- Documents Dashboard no longer exposes a mixed-language lifecycle view; status, expiry, recent-document, and quick-action copy now changes with the active language.
- Administrative Acts no longer silently falls back to an alert-only fetch failure; unavailable data now has a dedicated localized retry path.
- Sinistres no longer presents a blank spinner or toast-only load failure when claims are unavailable; users now receive contextual loading and retryable recovery states.
- The mobile package had two unrelated legal-directory type errors that prevented verification; both are now cleared.
- The API build still reports a non-blocking duplicate `preamble` schema key warning in `artifacts/api-server/src/routes/documents.ts` and should be cleaned up in a later maintenance pass.
- Mon Lot no longer silently treats a failed personal lot or fund-call request as an empty/zero-valued state; each unavailable dependency now has an explicit retry path.
- Mon Bail & Loyer no longer exposes raw lease API errors or conflates network failure with a genuinely unlinked tenant account; recovery and no-data states are now distinct.
- Travaux workflow mutations and silent refreshes no longer expose raw API messages or fail without user feedback.
- Profile updates no longer expose raw server error text or remain partially French-only after a language change; mutation failures now use safe localized recovery copy.
- Template Studio no longer displays hardcoded French metadata when the active language is English, Arabic, or Spanish.
- Document generation validation no longer emits a duplicate-key build warning for `preamble`.
- Home Dashboard no longer presents provisional empty/zero metrics without context during initial API synchronization; full dependency failure now exposes a localized retry action.
- Home Dashboard financial amounts and dates no longer remain French-only or use an unformatted raw amount presentation.
- Template Studio and template requests no longer fall back to hardcoded French metadata, form copy, status/priority labels, or recovery messages when the active language changes.
- Template request list failures no longer masquerade as an empty list; users now receive a localized retryable unavailable-data state.
- Activity Journal no longer mixes French-only category, severity, statistic, export, alert, and detail labels into English, Arabic, or Spanish sessions; audit-load failures now expose a localized retry action instead of a hardcoded message.
- Team invitation no longer exposes French-only role, action, or validation copy after a language change; optional phone input now rejects malformed Moroccan numbers and invitation failures no longer expose raw API error text.
- Resident Marketplace no longer mixes French-only catalogue, moderation, order, and statistics labels into other language sessions; failed marketplace requests no longer masquerade as empty data, and the expected unauthenticated API 401 is not treated as a client runtime error.
- Super Admin National Dashboard no longer mixes French-only platform supervision labels or compact non-localized balance output into other language sessions; ranking, detail, and export surfaces now recover and present through the active language.
- Assemblée Générale and Élections no longer expose raw ISO dates, raw mandate roles/statuses, or an unrelated team-member translation on the resolution action; the underlying governance state and API behavior were unchanged.
- Search no longer mixes French-only headings, shortcuts, suggestions, and no-result guidance into non-French sessions.
- Subscription payment onboarding no longer exposes raw API error text, hardcoded French copy, or embedded bank coordinates; payment amounts now use the active locale.
- Marketplace Reviews & Ratings no longer mixes French-only labels or raw publication errors into other language sessions; failed review/order loads no longer masquerade as an empty list, and localized product filtering remains stable when the language changes.
- Lots no longer silently renders an empty result after a failed retrieval, and lot types/charge amounts no longer fall back to fixed French formatting.
- Tenant administration no longer hides list failures or exposes raw save/status API errors; lease dates and rent/deposit amounts now follow the active locale.
- Delivery Notes no longer mix French-only labels, fixed-locale dates, or raw non-localized MAD amounts into non-French sessions; confirmations and PDF feedback now follow the active language.
- My Orders no longer displays French-only marketplace copy, compact `k` totals, or fixed French-Morocco formatting in non-French sessions; an initial order API failure now has visible retry guidance instead of a blank/false empty result.
- User Management no longer silently renders an empty list after an API failure, exposes raw mutation errors, uses fixed French membership dates, or sends every new account the same predictable client-side password.
- The API standalone typecheck no longer fails in document PDF generation, budget receipt rendering, support ticket creation, or Template Studio routes; all previously recorded blockers are resolved.
- Règlements & Statuts no longer presents fabricated sample documents after an API failure, reports local-only publish/create success, or falls back to sharing metadata when a real PDF cannot be retrieved; failures now remain visible and retryable.
- Invoice creation no longer fabricates legal/financial identifiers and dates on the client, so concurrent users cannot derive duplicate local references or present a record before persistence succeeds.
- Invoice retrieval no longer retains stale records when the authoritative API returns an empty list, and initial invoice failures no longer masquerade as an empty screen; localized retry recovery is now visible.
- Réclamations & Griefs no longer exposes raw API errors, a fixed French retry label, or a hardcoded anonymous fallback; loading and failure states are now localized and recoverable.
- Statistiques no longer ignores `statistics.platform()` failures or presents incomplete platform KPIs as real zero values; the screen now shows an explicit retry state and no longer calculates SaaS revenue from hardcoded plan tariffs.
- Profile onboarding no longer mixes fixed French labels, validation alerts, legal-consent copy, or Moroccan city/sector metadata into non-French sessions.
- Marketplace cart no longer exposes fixed French checkout copy, raw order errors, or fixed `fr-MA` amount formatting when the active language changes.
- Favorites no longer remains French-only or clears the entire list without a destructive confirmation; Arabic navigation direction is now reflected in its controls.
- Syndicate Setup no longer exposes mixed French-only wizard, validation, financial, success, or SMS verification copy after a language change; protected unauthenticated deep links still redirect safely.
- The public welcome page no longer presents unverified KPI values, synthetic charts, or a fabricated named testimonial as evidence of platform performance; public proof is now descriptive until backed by a real API source.
- Approval Workflows no longer display raw workflow dates, LTR-only card/modal rows, or cramped compact statistics spacing in Arabic and small-screen layouts; decision, creation, document, and role behavior remain unchanged.
- Level-1 Support no longer turns a failed ticket-list request into a misleading empty state or a failed conversation request into an empty thread; both surfaces now explain the unavailable data and offer retry.
- Financial Reports no longer abbreviate revenue and expense values as compact `k` strings; user-facing report values now use complete active-locale MAD formatting.
- Level-1 Support no longer leaves Arabic ticket cards, modals, fields, priority accents, or navigation/action arrows in an LTR presentation; the remaining hard-coded description label is localized.
- Settings and Notifications no longer lose global notification changes when the app is closed, silently swallow preference-save failures, or display local-only security/audio switches as if they were server-backed capabilities.
- API startup no longer fails because the Stripe webhook imported a private payment finalizer or referenced removed Stripe SDK fields; current subscription item periods and invoice parent subscription details are now used.
- Operational invitation and meeting forms no longer drift from the shared MIZAN field language; resident lot balances/receipts and announcement detail dates no longer force French-Morocco formatting; document bundle generation no longer exposes French-only labels or raw French fallback copy in other locales.
- Building detail/update no longer accepts a missing or mismatched management syndicate scope, and resident building responses no longer expose buildings outside linked lots or tenancies.
- Parking no longer permits cross-building lot assignment, broad reservation enumeration, or global vehicle listing through non-admin management roles; management JWTs without `syndicateId` now fail closed.