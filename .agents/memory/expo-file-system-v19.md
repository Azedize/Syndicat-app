---
name: expo-file-system v19 cacheDirectory type
description: cacheDirectory constant is not typed in expo-file-system@19 types but exists at runtime — requires type cast.
---

## Problem

`expo-file-system@19.0.23` does not export `cacheDirectory` in its TypeScript types.

```
error TS2339: Property 'cacheDirectory' does not exist on type 'typeof import("expo-file-system/build/index")'
```

## Fix

```typescript
import * as FileSystem from "expo-file-system";
const cacheDir: string = (FileSystem as any).cacheDirectory ?? "";
const localPath = `${cacheDir}${filename}`;
```

**Why:** The constant exists at runtime (it's in the legacy API layer), but the v19 type declarations for the new "next" API don't include it. The cast bypasses the type error without breaking runtime behavior.

## Alternative

Downgrade to `expo-file-system@~17.x` (legacy API, fully typed) or migrate to `expo-file-system/next` (new API, different method names).
