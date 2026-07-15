---
name: Document download URL vs Share fallback
description: How reglements.tsx (and any doc list screen) should open real PDFs vs gracefully degrade for seed/demo documents without generated files.
---

## Rule
PDF "download" buttons must attempt a real signed URL first; only fall back to Share.share metadata when the endpoint returns an error (404/500 — typically seed documents with no generated fileUrl).

**Why:** The original reglements.tsx "download" button called `Share.share` directly with text metadata — never opening an actual PDF. This was the functional gap, not an intentional placeholder; real API-backed documents do have generated PDF files accessible via `/documents/:id/download-url`.

## Implementation pattern

```ts
const handleDownload = async (d: DocType) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  try {
    const { url } = await apiRequest<{ url: string }>(`/documents/${d.id}/download-url`);
    await Linking.openURL(url);  // opens signed GCS URL (1h TTL) in browser/PDF viewer
  } catch {
    // seed/demo doc has no real PDF yet — share metadata text instead
    Share.share({ title: d.title, message: `${d.title}\n...` });
  }
};
```

## Server endpoint
`GET /documents/:id/download-url` — requireAuth; returns `{ url: string, expiresIn: 3600, filename: string }`. Signed 1h GCS URL. Returns 404 if doc has no `fileUrl` (seed docs).

RBAC enforced: member/tenant can only download published docs; syndicateId checked; super_admin unrestricted.

## How to apply
Any other document-list screen (e.g. actes-administratifs, contracts) that shows a "Télécharger" button should use the same pattern: apiRequest to download-url → Linking.openURL → Share fallback on error.
