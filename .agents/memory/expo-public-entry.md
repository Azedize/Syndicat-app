---
name: Expo public entry
description: Public Expo landing routes need an immediate root entry before session redirects.
---

The mobile app should render its public landing screen immediately from an explicit root `index.tsx`; session checks and authenticated redirects should happen after the first render.

**Why:** Expo web preview can appear blank when the root route is implicit and the root layout waits on authentication before selecting a public screen, even though Metro bundles successfully.

**How to apply:** For future public onboarding changes, keep `/` as the stable landing entry, render the welcome screen without waiting for auth loading, and redirect authenticated users to tabs in an effect.