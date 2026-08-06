---
name: Language audit — translation key collisions
description: Pitfalls found while converting screens to the global t()/useLanguage() system during a language audit.
---

- `LanguageContext.tsx` had accumulated duplicate keys because two overlapping "waves" of translation entries were merged into one file over time (same key added twice, sometimes with different translations). `tsc` catches these as TS1117 duplicate-property errors — run a full-package `tsc --noEmit`, not just a grep, since duplicates can hide keys that are never flagged when read in isolation.
- When adding new translation keys for a screen, always grep the existing key name across the whole file first (`grep -n "^  <key>:" context/LanguageContext.tsx`) before inserting — short/generic names (e.g. `pvDownloadedMsg`) can silently collide with an unrelated existing key used elsewhere (e.g. documents screen), which only surfaces as a duplicate-property tsc error, not a lint warning.
- When converting a `.map((t) => ...)` loop to use `useLanguage()`'s `t()` function, rename the loop variable (e.g. to `tv`) first — reusing `t` as both the array element and the translation function silently shadows `t()` inside the callback with no type error until you try to call `t("key")` there.
- Screens with local per-file `STRINGS[lang]` objects instead of global `t()` (seen in `tableau-bord-financier.tsx`, `travaux.tsx`, `sinistres.tsx`) are an architectural inconsistency still pending migration as of 2026-07-13 — check whether a screen already imports `useLanguage` vs. defines its own local strings object before assuming the `t()` conversion pattern applies uniformly.
- When a screen keeps a local translation dictionary, include `lang` in callbacks that produce localized errors or success feedback; otherwise changing language leaves async notifications in the previous language until the screen remounts.
