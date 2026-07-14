---
name: Expo RTL reload requirement
description: forceRTL toggling requires a full app reload to take visual effect; behaves differently in Expo Go vs production builds.
---

Calling `I18nManager.allowRTL()` / `forceRTL()` changes the RTL flag but React Native does NOT re-layout the current JS bundle — the UI stays LTR until the app actually reloads.

**Why:** Discovered while fixing "Arabic language selected but layout stays LTR" — the flag was being set correctly but nothing consumed it because no reload happened.

**How to apply:**
- After calling `forceRTL()`, attempt `Updates.reloadAsync()` (from `expo-updates`) to reload immediately — this works in EAS/production builds.
- In Expo Go or a dev client, `reloadAsync()` throws (updates aren't supported there). Wrap in try/catch and fall back to a bilingual `Alert` telling the user to manually restart the app.
- Don't assume a single code path covers both dev and prod — test the fallback path explicitly since Expo Go is the common dev-time environment.
- This project is mobile-only (Android/iOS via Expo) — do NOT use `window.location.reload()` or any web/browser API for the RTL restart flow, even though it technically also runs under react-native-web in the dev preview. Restart must go through `Updates.reloadAsync()` (native reload, EAS/dev-client) with an `Alert` fallback for Expo Go where it throws. Always `await` the AsyncStorage persist promise before attempting the reload.
