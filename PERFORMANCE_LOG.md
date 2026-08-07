- 2026-08-07 — Document request localization kept the existing parallel autofill/payment fetch and makes its loading state explicit without adding network calls or extra rendering loops.
- Ma Boutique keeps the existing parallel listing/promotion fetch and isolates optional promotion failure without adding polling, duplicate listing requests, or client-side fallback data.
# Performance Log

## 2026-08-06

- Added a lightweight, reusable animated loading state using a single looping opacity animation for mobile data screens.
- The animation is stopped on unmount to avoid retaining work after navigation.
- Internal Messaging reuses the shared animated loading and retryable error components, avoiding a screen-specific polling or animation loop while preserving pull-to-refresh behavior.
- Documents Dashboard keeps its existing single retention-summary request and memoized metric derivation; the localization pass adds no extra network calls or polling.
- Administrative Acts reuses shared `LoadingState` and `ErrorState`; the localization pass adds no requests, polling, or duplicate data loading.
- Sinistres & Incidents reuses shared `LoadingState` and `ErrorState`; the pass adds no network requests or polling and keeps the existing pull-to-refresh behavior.
- Mon Lot keeps its existing parallel lot and fund-call requests; the pass adds no requests or polling and reuses shared data-state animations.
- Mon Bail & Loyer keeps its single lease request and adds no polling or duplicate calls; the shared loading/error components provide feedback without extra network work.
- Notification localization adds no requests, polling, or client-side data duplication; alert grouping remains memoized and preference toggles retain the existing optimistic update path.
- Chat localization adds no requests, polling, or message duplication; existing conversation polling, attachment handling, and message-list rendering remain unchanged.
- Support localization adds no requests, polling, or ticket duplication; existing ticket/reply fetches and mutation flows remain unchanged, with date formatting performed locally at render time.
- National Dashboard localization adds no requests, polling, or duplicated data; currency, number, and date formatting are performed locally at render time while existing syndicate/ranking/detail fetches remain unchanged.
- AG/Elections presentation fixes add no requests, polling, or duplicated state; date/role/status localization is computed locally at render time and results-panel helper props do not change query or mutation behavior.
- SignatureOrderPanel and DocumentWizard localization add no requests or duplicated data; dates and labels are formatted locally while the existing document/signature API calls and wizard state transitions remain unchanged.