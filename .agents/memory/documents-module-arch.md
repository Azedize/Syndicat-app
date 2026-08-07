---
name: Documents module production architecture
description: Full architecture of the Documents module after production-ready implementation — PDF generation, GCS storage, workflow, signatures, notifications.
---

## PDF Generation + Storage pipeline

1. `generateAndUploadDocument(template, input)` in `lib/documentPdf.ts`
2. `buildPdfBuffer(docDef)` — pdfmake, standard fonts (no external assets), returns `Buffer`
3. `uploadBufferToGcs(buffer, filename)` — direct `bucket.file().save()` (not signed PUT URL)
4. Internal path stored: `/objects/documents/{uuid}/{filename}` in `documentsTable.fileUrl`
5. `signDocumentDownloadUrl(internalPath)` — calls Replit sidecar `POST /object-storage/signed-object-url`, GET method, TTL 1h
6. `deleteDocumentFromGcs(internalPath)` — called at DELETE /documents/:id, non-fatal

## GCS path parsing

Private dir can be `gs://bucket/path` or `/bucket/path`. `parseGcsPath()` handles both forms → `{ bucketName, objectName }`.

## Workflow state machine

```
draft → generated → pending_review → validated → signed → published → archived
```

`ALLOWED_TRANSITIONS` map in `routes/documents.ts`. Enforced on every `PUT`. Invalid transitions return 422 with list of allowed next states.

Lifecycle timestamps auto-set:
- `publishedAt` when status → published
- `archivedAt` when status → archived
- `signedAt` when status → signed

`version` incremented via `sql\`COALESCE(version, 1) + 1\`` on content/status change.

## Signatures table

`documentSignaturesTable`: documentId FK cascade, signedBy FK set-null, signedAt, signerRole, syndicateId, ipAddress, signatureData (base64 pad PNG).

POST /documents/:id/sign — only allowed for status ∈ [generated, validated, published].

## Notifications pattern

All notifications are fire-and-forget (`createAlert(...).catch(() => {})`), scoped by syndicateId. Never block HTTP response.
- POST /documents → admin alert "Nouveau document généré"
- PUT status=published → all-members alert "Nouveau document publié"
- POST /sign → admin alert "Document signé"

## Mobile PDF download pattern

```typescript
const res = await docsApi.downloadUrl(doc.id); // GET /documents/:id/download-url
const signedUrl = res.url;
const localPath = `${(FileSystem as any).cacheDirectory ?? ""}${name}.pdf`;
const dl = FileSystem.createDownloadResumable(signedUrl, localPath, {});
const result = await dl.downloadAsync();
await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
```

**Why:** FileSystem.cacheDirectory is not typed in expo-file-system v19 (but exists at runtime). Use `(FileSystem as any).cacheDirectory` to bypass TS error.

## Category routing note

The mobile regulatory library queries the persisted `reglements` category and must not invent client-side records or pretend that a local status change succeeded. Document generation still follows the server's supported template contract; add a dedicated regulatory template before mapping a new regulatory subtype to a PDF template.

**Why:** A category is not the same thing as a PDF template. Treating an unsupported regulatory subtype as an unrelated template produces a document that looks successful but is semantically wrong.

**How to apply:** When extending regulatory creation, update the server template union, numbering map, renderer, and route validation together, then wire the mobile form to that explicit template.
