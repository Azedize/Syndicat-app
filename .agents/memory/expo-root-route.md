---
name: Expo root route redirects
description: Root-entry behavior for the public Expo web preview and native app.
---

The Expo root route should redirect to the canonical public welcome route when unauthenticated and to the authenticated tab group when a session exists. It should not import and mount the welcome screen a second time.

**Why:** Mounting the route component directly at `/` caused Expo web to show a partially initialized landing page with missing copy before the real public route settled.

**How to apply:** Keep `app/index.tsx` focused on auth-aware route selection with `Redirect`; keep the landing UI in `app/welcome.tsx` only.