---
name: Public Expo presentation rendering
description: Robust rendering pattern for long public Expo presentation routes in the web preview.
---

Public Expo presentation screens should prefer simple native React Native primitives for their first render: ScrollView, View, Text, TouchableOpacity and Feather icons. Avoid making the whole route depend on complex animated/SVG/gradient compositions when the route is a critical public entry.

**Why:** In the Expo web preview, a complex public presentation route rendered blank without a useful runtime error, while the same content rendered reliably after reducing the composition to simple primitives. The route compiled successfully in both cases, so visual verification is essential.

**How to apply:** Keep public presentation content in a vertical ScrollView with safe-area padding, use explicit contrast for primary actions, and validate the route after restarting Metro when the screen appears blank.

In this project, direct appPreview captures of `/intro` were intermittent at narrow widths even after a successful Metro bundle and typecheck; desktop captures and the canonical navigation flow were the reliable visual checks.

**Why:** The route could render correctly at desktop width while a direct narrow preview stayed white without a browser error, suggesting a preview/cache issue rather than a TypeScript failure.

**How to apply:** Do not add complex UI solely to chase a blank narrow screenshot. Keep the route dependency-light, restart Metro after changes, and validate both the actual welcome-to-intro flow and a desktop capture.

Repeated fresh-bundle captures can still remain blank on the direct `/intro` URL while Metro reports a clean bundle. Treat a successful in-app navigation from `/welcome` as the authoritative public-flow check.