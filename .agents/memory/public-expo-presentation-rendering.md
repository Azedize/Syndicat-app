---
name: Public Expo presentation rendering
description: Robust rendering pattern for long public Expo presentation routes in the web preview.
---

Public Expo presentation screens should prefer simple native React Native primitives for their first render: ScrollView, View, Text, TouchableOpacity and Feather icons. Avoid making the whole route depend on complex animated/SVG/gradient compositions when the route is a critical public entry.

**Why:** In the Expo web preview, a complex public presentation route rendered blank without a useful runtime error, while the same content rendered reliably after reducing the composition to simple primitives. The route compiled successfully in both cases, so visual verification is essential.

**How to apply:** Keep public presentation content in a vertical ScrollView with safe-area padding, use explicit contrast for primary actions, and validate the route after restarting Metro when the screen appears blank.