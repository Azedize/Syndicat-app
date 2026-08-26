---
name: Expo Web animation driver
description: Expo Web may capture or retain Animated opacity transitions before native-driver animations complete.
---

When a screen must be immediately usable on Expo Web, initialize animated opacity and position values to their final visible state on web and reserve native-driver entrance animations for iOS/Android.

**Why:** React Native Web does not provide the native animated module, so `useNativeDriver` falls back to JavaScript and can leave first-render content visibly washed out during preview capture or early interaction.

**How to apply:** For public or interactive screens, use `Platform.OS === "web"` to start opacity at `1` and translated positions at `0`; keep native-driver animations for native platforms when they add value.