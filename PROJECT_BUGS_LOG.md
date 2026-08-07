# Project Bugs Log

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