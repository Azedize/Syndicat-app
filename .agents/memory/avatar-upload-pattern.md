---
name: Avatar upload validator & URL resolution
description: How avatar URLs are stored, validated server-side, and resolved for display in the mobile app.
---

## Rule
Server validator for `PUT /profile` avatar field must accept BOTH `/objects/…` relative paths (from the upload pipeline) AND full `https://` URLs. Accepting only https:// breaks uploads from the app's own storage pipeline.

**Why:** The mobile upload pipeline (`POST /storage/uploads`) returns `objectPath` like `/objects/uploads/<uuid>.jpg` — a relative path, not a full URL. The original validator used `.url().startsWith("https://")` which always rejected these, silently preventing avatar uploads from ever working.

**Fix applied in:** `artifacts/api-server/src/routes/auth.ts`, `PUT /profile` — avatar schema now uses `z.string().refine(v => v.startsWith("/objects/") || v.startsWith("https://"))`.

## URL resolution in mobile
Object paths must be converted to absolute URLs for `<Image source={{ uri }}>`. Use this helper pattern (matches chat-thread.tsx):

```ts
function getAvatarBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}/api`;
}
function resolveAvatarUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/objects/")) return `${getAvatarBaseUrl()}/storage${raw}`;
  return null;
}
```

## AuthUser.avatar field
`AuthUser` in `context/AuthContext.tsx` already has `avatar?: string`. `ApiUser` in `services/api.ts` has `avatar?: string | null`. Both exist; no schema work needed.

## Profile avatar edit UX
- Hero avatar is a `<TouchableOpacity>` only when `editing === true`.
- Camera badge overlay shown in editing mode; `ActivityIndicator` during upload.
- Uses `pickAndUploadPhoto()` from `lib/upload.ts`, then calls `authApi.updateProfile({ avatar: result.objectPath })`.
- Calls `updateUser({ avatar: res.data.avatar ?? undefined })` to sync AuthContext.

## How to apply
Any screen that displays an uploaded file path from GCS must resolve it through the same `/api/storage/objects/…` proxy. Never embed raw `/objects/…` paths in `<Image uri>`.
