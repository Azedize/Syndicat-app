# Performance Log

## 2026-08-06

- Added a lightweight, reusable animated loading state using a single looping opacity animation for mobile data screens.
- The animation is stopped on unmount to avoid retaining work after navigation.
- Internal Messaging reuses the shared animated loading and retryable error components, avoiding a screen-specific polling or animation loop while preserving pull-to-refresh behavior.