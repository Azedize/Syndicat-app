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