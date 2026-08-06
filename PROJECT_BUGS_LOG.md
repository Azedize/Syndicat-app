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