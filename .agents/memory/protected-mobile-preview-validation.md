---
name: Protected mobile preview validation
description: How to interpret unauthenticated Expo preview captures for role-protected screens.
---

Protected mobile routes intentionally redirect to the public welcome screen when no session is restored. A blank or welcome-route capture for an admin screen does not validate the protected UI itself; validate the redirect separately and rely on typecheck plus clean Metro bundling unless an authenticated preview session is available.

**Why:** The app's AuthGate prevents unauthenticated deep links from exposing role-specific data, so preview screenshots without stored credentials cannot reach Super Admin screens.

**How to apply:** When validating a protected route, check the fresh workflow bundle, confirm the protected path redirects safely to `/welcome`, and avoid treating the redirect as a protected-screen rendering failure.