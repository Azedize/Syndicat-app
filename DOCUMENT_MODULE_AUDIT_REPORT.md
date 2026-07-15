# DOCUMENT MODULE — COMPLETE END-TO-END AUDIT REPORT
**Date:** 15 juillet 2026  
**Scope:** Mobile UI (documents.tsx), API server (routes/documents.ts), PDF engine (documentPdf.ts), Object Storage, Database schema, Notifications, RBAC  
**Auditor:** Senior Enterprise Architect / Security Auditor  
**Verdict:** ⛔ NO-GO FOR PRODUCTION (Score: 41/100)

---

## 1. EXECUTIVE SUMMARY

The Documents module has a working skeleton but contains **6 critical bugs, 8 high-priority bugs, and 7 medium-priority bugs** that make it fundamentally broken in production. The single most damaging issue is that the mobile client forces every document to `status: "published"` on creation, completely bypassing the 7-state workflow. Simultaneously, the mobile UI only handles 3 of the 7 possible statuses, causing guaranteed runtime crashes for documents in states `generated`, `pending_review`, `validated`, `signed`, or `archived`. The PDF pipeline is structurally sound but silently degrades to "no PDF" when object storage is misconfigured. Security issues include IP address leakage to authenticated members and a database constraint that will cause user-deletion failures.

---

## 2. ARCHITECTURE FINDINGS

### A2-1 — Two parallel GCS client paths (Medium)
`documentPdf.ts` implements its own raw GCS upload and signed-URL logic (lines 106–154) using `objectStorageClient` directly, while `objectStorage.ts` provides `ObjectStorageService` with ACL policies, path normalization, and proper `canAccessObject` checks. Documents bypass the ACL system entirely. Any future access-control rule added to `ObjectStorageService` will NOT apply to documents.

**Fix:** Refactor `uploadBufferToGcs` to use `ObjectStorageService.getObjectEntityUploadURL()` flow or at minimum call `setObjectAclPolicy` after upload.

### A2-2 — Templates declared but unreachable (High)
The backend defines 9 `DocumentTemplate` types:
```
attestation | pv | convocation | contrat | rapport | decision | certificat | circulaire | mise_en_demeure
```
`CATEGORY_TO_TEMPLATE` only maps 6 categories → 6 templates. Templates `convocation`, `contrat`, and `decision` are **never reachable** via any API call from the mobile client. The mobile `DOC_TEMPLATES` array also doesn't expose convocation, contrat, or decision as selectable templates.

**Fix:** Either extend `DOC_TEMPLATES` and `CATEGORY_TO_TEMPLATE` to cover all 9 templates, or remove the unreachable ones from the type definition.

### A2-3 — No document_versions table (Medium)
The audit specification and the documents.ts docstring both mention a multi-version history, but the schema only contains a single `version: integer` counter in `documentsTable`. There is no `document_versions` table storing previous content snapshots. Revision history is effectively non-functional.

**Fix:** Add a `document_versions` table with `documentId`, `version`, `content`, `changedBy`, `changedAt`.

---

## 3. FUNCTIONAL FINDINGS

### F3-1 — CRITICAL: Document generation bypasses the entire workflow (Critical)
**File:** `artifacts/mobile/services/api.ts`, line 521  
```typescript
// CURRENT (BROKEN):
generate: (title: string, category: string, content?: string) =>
  request<{ data: unknown }>("/documents", {
    method: "POST",
    body: JSON.stringify({ title, category, content, status: "published" }),  // ← BUG
  }),
```
Every document created from the mobile app is immediately sent to `status: "published"`, completely skipping `draft → generated → pending_review → validated → signed → published`. This means:
- No review process
- No signature required
- No admin validation
- Published status is visible immediately to all members

**Root cause:** Hardcoded `status: "published"` in the API client. The server's `ALLOWED_TRANSITIONS` does permit `draft → published` (it is listed), so no 422 is thrown. The entire workflow is silently bypassed.

**Fix:**
```typescript
generate: (title: string, category: string, content?: string) =>
  request<{ data: unknown }>("/documents", {
    method: "POST",
    body: JSON.stringify({ title, category, content }),  // omit status; server defaults to "draft"
  }),
```

### F3-2 — CRITICAL: Mobile UI crashes on 5 of 7 valid document statuses (Critical)
**File:** `artifacts/mobile/app/documents.tsx`, lines 100–104  
```typescript
const statusConfig = (status: Document["status"]) => ({
  published: { label: "Publié", color: colors.success },
  draft: { label: "Brouillon", color: colors.mutedForeground },
  pending: { label: "En attente", color: "#f59e0b" },
}[status]);
```
The DataContext `Document` interface declares:
```typescript
status: "published" | "draft" | "pending"
```
But the backend can return any of: `draft | generated | pending_review | validated | signed | published | archived`.

The API mapper in DataContext converts the API row with no status guard, so documents with status `generated`, `pending_review`, `validated`, `signed`, or `archived` will produce `statusConfig(...)` returning `undefined`. The calling code then reads `sc.label` and `sc.color`, throwing a **guaranteed runtime TypeError** that crashes the screen.

**Fix 1** — Extend `statusConfig` to handle all 7 statuses:
```typescript
const statusConfig = (status: string) => ({
  published:     { label: "Publié",         color: colors.success },
  draft:         { label: "Brouillon",       color: colors.mutedForeground },
  pending:       { label: "En attente",      color: "#f59e0b" },
  generated:     { label: "Généré",          color: "#3b82f6" },
  pending_review:{ label: "En révision",     color: "#f59e0b" },
  validated:     { label: "Validé",          color: "#10b981" },
  signed:        { label: "Signé",           color: "#8b5cf6" },
  archived:      { label: "Archivé",         color: colors.mutedForeground },
} as Record<string, { label: string; color: string }>)[status]
  ?? { label: status, color: colors.mutedForeground };
```

**Fix 2** — Update the `Document` interface and DataContext mapper to reflect all 7 statuses.

### F3-3 — No loading/disabled state during document generation (High)
**File:** `artifacts/mobile/app/documents.tsx`, lines 524–531  
The "Générer le document" button has no loading state and no `disabled` prop while `handleGenerate` is running. A user who taps it twice will trigger two parallel `POST /documents` requests and create two duplicate documents with identical content. No spinner, no disabled feedback.

**Fix:** Add `const [generating, setGenerating] = useState(false)` and wrap `handleGenerate` with guard:
```typescript
if (generating) return;
setGenerating(true);
try { ... } finally { setGenerating(false); }
```
Then pass `disabled={generating}` and a loading label to the button.

### F3-4 — PDF preview shows raw text, not PDF (Medium)
**File:** `artifacts/mobile/app/documents.tsx`, lines 205–218  
`handlePreview` fetches `GET /documents/:id` and renders `res.data.content` as a plain `<Text>`. If the document has a PDF file (stored in GCS), the preview shows nothing useful. There is no PDF viewer or WebView rendering the signed URL. Users expect to see the formatted PDF, not raw text.

**Fix:** In `handlePreview`, call `downloadUrl(doc.id)` first. If a signed URL is returned, open it via `Linking.openURL(signedUrl)` instead of rendering text.

### F3-5 — Edit modal opens before current content loads (Low)
**File:** `artifacts/mobile/app/documents.tsx`, lines 221–233  
`openEdit` shows the modal immediately with `setShowEdit(true)` before the `docsApi.get(doc.id)` call completes. The user sees an empty text field for several seconds. If they start typing before the load completes, their edits will be overwritten by `setEditContent(String(res.data.content ?? ""))`.

**Fix:** Show a loading spinner inside the edit modal until the content fetch completes.

---

## 4. SECURITY FINDINGS

### S4-1 — CRITICAL: Signature data (including IP addresses) exposed to members (Critical)
**File:** `artifacts/api-server/src/routes/documents.ts`, lines 411–429  
```typescript
router.get("/documents/:id/signatures", requireAuth, async (req, res) => {
  // checks doc exists and syndicateId isolation, but NO role check
  const sigs = await db.select().from(documentSignaturesTable)...
  res.json({ data: sigs });
});
```
Any authenticated user with `requireAuth` can call `GET /documents/:id/signatures` for any document in their syndicate. The response includes:
- `signedBy` (user ID)
- `signerRole`
- `ipAddress` (the signer's IP address at time of signing)
- `signatureData` (base64 PNG or SVG paths of the handwritten signature pad)

An ordinary member or tenant can retrieve another user's handwritten signature image and IP address. This is a **serious PII and security violation**.

**Fix:** Add `requireRole("super_admin", "syndicate_admin")` middleware to the signatures endpoint:
```typescript
router.get("/documents/:id/signatures",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => { ... }
);
```

### S4-2 — Database constraint violation on user deletion (High)
**File:** `lib/db/src/schema.ts`, lines 976–979  
```typescript
documentSignaturesTable = pgTable("document_signatures", {
  signedBy: text("signed_by").notNull().references(() => usersTable.id, { onDelete: "set null" }),
  ...
})
```
`signedBy` is declared `NOT NULL` (`notNull()`) but the FK uses `onDelete: "set null"`. When a user is deleted, PostgreSQL attempts to set `signedBy = NULL` on their signature records, which violates the `NOT NULL` constraint. This will cause a PostgreSQL FK constraint error and **block user deletion entirely** if the user has ever signed a document.

**Fix:** Either change to `onDelete: "restrict"` (prevent user deletion if they have signatures) or remove the `.notNull()` constraint. Business logic should dictate which.

### S4-3 — No status column constraint in database (Medium)
**File:** `lib/db/src/schema.ts`, documentsTable  
The `status` column is `text("status").default("draft")` with no CHECK constraint. Any arbitrary string can be stored as a document status (e.g., from a malformed PUT request that bypasses Zod validation). The state machine logic lives only in application code, not enforced at the DB level.

**Fix:** Add a CHECK constraint:
```sql
ALTER TABLE documents ADD CONSTRAINT documents_status_check 
  CHECK (status IN ('draft','generated','pending_review','validated','signed','published','archived'));
```
Or use a pgEnum in Drizzle.

### S4-4 — No category column constraint in database (Low)
Same as S4-3 — `category: text("category").notNull()` accepts any string without a CHECK constraint.

### S4-5 — Token accepted via query parameter on all document routes (Low)
**File:** `artifacts/api-server/src/middleware/auth.ts`, lines 37–39  
```typescript
const queryToken = typeof req.query.token === "string" ? req.query.token : null;
```
The `?token=` query-parameter authentication was designed for PDF download URLs opened via `Linking.openURL`. However, it applies globally to ALL routes protected by `requireAuth`, not just the download endpoint. A token embedded in a URL (e.g., a GET /documents?token=...) will appear in server logs, browser history, and referrer headers. This is a low-risk information disclosure vector.

**Fix:** Scope the `?token=` override to only the download-url endpoint, not all routes.

---

## 5. PDF GENERATION FINDINGS

### P5-1 — CRITICAL: PDF upload silently fails when PRIVATE_OBJECT_DIR is not set (Critical)
**File:** `artifacts/api-server/src/lib/documentPdf.ts`, lines 107–108, 344–350  
```typescript
async function uploadBufferToGcs(buffer: Buffer, filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set — configure Replit Object Storage");
  ...
}

// In generateAndUploadDocument:
try {
  const fileUrl = await uploadBufferToGcs(buffer, filename);
  return { fileUrl, fileSizeKo, documentNumber: docNumber };
} catch (err) {
  logger.warn({ err }, "generateAndUploadDocument: GCS upload failed — document saved without PDF");
  return { fileUrl: "", fileSizeKo, documentNumber: docNumber };  // ← silent fallback
}
```
If `PRIVATE_OBJECT_DIR` is not set or the GCS sidecar is unreachable, the document is created in the database with `fileUrl = null`. The user sees "Document généré avec succès" but no PDF exists. This is the **primary cause of the "Generate Document produces no document" bug** reported by users.

The document record is created without a PDF, and when the user tries to download, they get HTTP 404 from `/documents/:id/download-url` (because `doc.fileUrl` is null, line 125–127 of documents.ts). The client falls back to showing raw text content.

**Evidence:** `PRIVATE_OBJECT_DIR` IS listed in available secrets, meaning it is configured. However, if the sidecar at `127.0.0.1:1106` is down or the bucket path is wrong, the failure is completely invisible to the user.

**Fix:** 
1. Propagate the error to the HTTP response instead of swallowing it: return HTTP 503 with a meaningful error if PDF generation fails.
2. Add a health-check endpoint that verifies GCS connectivity on startup.
3. Store the generation error in the document record so admins can see why a document has no PDF.

### P5-2 — All 9 templates are text-based Latin only; no Arabic/RTL support (High)
**File:** `artifacts/api-server/src/lib/documentPdf.ts`, lines 17–20  
```typescript
const FONTS = {
  Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", ... },
  Times: { normal: "Times-Roman", ... },
  Courier: { normal: "Courier", ... },
};
```
pdfmake's built-in fonts (Helvetica, Times, Courier) do not support Arabic characters or right-to-left text. Any Arabic content in `memberName`, `content`, or `title` fields will render as boxes or be omitted entirely. The audit specification requires Arabic/French bilingual rendering.

**Fix:** Register an Arabic-capable font (e.g., Amiri, Noto Naskh Arabic) using pdfmake's custom font registration. Add RTL support via pdfmake's `direction: 'rtl'` and appropriate column mirroring.

### P5-3 — No empty-document detection or minimum content validation (Medium)
The `content` field is optional across all templates. If neither `content` nor `memberName` is provided, some templates generate meaningful default text (attestation, certificat), but others generate placeholder text like "Voir clauses contractuelles ci-jointes." (contrat) or "Voir ordre du jour en annexe." (pv) — these are dummy placeholders, not valid document content. A produced PDF with placeholder text is indistinguishable from a valid one.

**Fix:** Mark the `content` field required for templates where it contains the core information (pv, contrat, decision, rapport). Return a 400 if content is missing for these template types.

### P5-4 — Font files embedded in every PDF (Low)
pdfmake embeds the full Helvetica font metrics in each PDF by default, inflating file sizes. For a simple attestation, the PDF should be a few KB but may be larger than expected.

---

## 6. DOWNLOAD FINDINGS

### D6-1 — No progress indicator during download (High)
**File:** `artifacts/mobile/app/documents.tsx`, lines 134–175  
`handleDownload` calls `FileSystem.createDownloadResumable(...).downloadAsync()` with no progress callback and no UI feedback. For a large PDF on a slow connection, the user sees nothing happen after tapping "Télécharger". There is no way to know if the download is in progress, completed, or failed.

**Fix:** Use the progress callback of `createDownloadResumable`:
```typescript
const dl = FileSystem.createDownloadResumable(signedUrl, localPath, {}, (dp) => {
  setDownloadProgress(dp.totalBytesWritten / dp.totalBytesExpectedToWrite);
});
```
Show a progress bar or percentage in the UI.

### D6-2 — Signed URL TTL mismatch between server and client (Low)
The server generates a 3600-second (1h) signed URL. On a slow device, if the download hasn't started within the hour (unlikely but possible in retry scenarios), the URL will be expired by the time the request is made. No expiry indication is shown to the user.

**Fix:** Pass the `expiresIn` returned by the API to the UI, and show a warning if the signed URL is nearing expiry.

### D6-3 — Double download on Share (Low)
`handleDownload` and `handleShare` are nearly identical — both call `downloadUrl(doc.id)` to get a signed URL, then download the PDF to cache, then open the share sheet. If the user taps "Télécharger" then immediately "Partager", two identical download operations run in parallel. They both write to the same local path (`${cacheDir}${safeName}.pdf`), causing a race condition.

**Fix:** Check if the file already exists in cache before downloading. Use a single download helper shared by both actions.

---

## 7. WORKFLOW FINDINGS

### W7-1 — State machine allows signing published documents (Medium)
**File:** `artifacts/api-server/src/routes/documents.ts`, lines 356–358  
```typescript
const signable: DocStatus[] = ["generated", "validated", "published"];
```
The sign endpoint allows signing documents that are already `published`. This creates a logical inconsistency: a document that has already completed its full lifecycle (signed → published) can be signed again after publication. The second signature sets the document back to `signed` status (line 377), removing it from the published state.

**Fix:** Remove `"published"` from the `signable` array. Published documents should not be de-published by signing.

### W7-2 — No way to return a document from pending_review to generated (Medium)
The `ALLOWED_TRANSITIONS` for `pending_review` is `["validated", "draft"]`. If a reviewer wants to send a document back to a state between `generated` and `pending_review`, there is no transition for it. The only option is to send it all the way back to `draft`, losing the generated PDF association.

**Fix:** Add `generated` as an allowed transition from `pending_review`:
```typescript
pending_review: ["generated", "validated", "draft"],
```

### W7-3 — Version counter not atomically safe (Low)
**File:** `artifacts/api-server/src/routes/documents.ts`, line 262  
```typescript
updates.version = sql`COALESCE(${documentsTable.version}, 1) + 1`;
```
This is a SQL expression update — it reads the current value and increments it in a single statement, which is safe. However, since it updates any change to `content` or `status`, a status-only change (e.g., `validated → signed`) also increments the version, polluting the version counter with non-content changes.

**Fix:** Only increment version on `content` changes, not status changes.

---

## 8. PERMISSIONS FINDINGS

### PX8-1 — Role set mismatch between mobile API client and backend (High)
**File:** `artifacts/mobile/services/api.ts`, line 166  
```typescript
role: "super_admin" | "syndicate_admin" | "member"
```
The backend JWT supports 4 roles: `super_admin | syndicate_admin | member | tenant`. The mobile `ApiUser` interface is missing `"tenant"`. A tenant user who logs in will have their role correctly stored in the JWT, but the TypeScript type will be wrong — any `role === "tenant"` check in mobile code will be a type error, and role guards that rely on the TypeScript enum won't cover this case.

**Fix:** Add `"tenant"` to the `ApiUser.role` union type in `services/api.ts`.

### PX8-2 — No archive capability exposed in mobile UI (Low)
The backend supports `published → archived` transitions but the mobile UI has no "Archive" action in the document detail modal. Admins cannot archive documents from the app.

**Fix:** Add an archive action in the admin actions section of the document detail modal.

### PX8-3 — No delete confirmation or undo for document deletion (Low)
The API client has `documents.delete()` but the mobile UI documents.tsx never calls it — there is no delete button. This is an incomplete feature for admins who need to remove documents.

---

## 9. DATABASE FINDINGS

### DB9-1 — NOT NULL + onDelete: "set null" contradiction (Critical)
**File:** `lib/db/src/schema.ts`, documentSignaturesTable  
```typescript
signedBy: text("signed_by").notNull().references(() => usersTable.id, { onDelete: "set null" }),
```
This is a PostgreSQL constraint contradiction. The column is `NOT NULL` but the FK cascade action is `SET NULL`. When a user account is deleted:
1. PostgreSQL tries to execute `SET signed_by = NULL` on related signature rows
2. This violates the `NOT NULL` constraint
3. The transaction fails with a constraint error
4. **The user deletion fails entirely**

This means any user who has ever signed a document CANNOT be deleted from the system.

**Fix:** Choose one:
- `onDelete: "restrict"` — prevents user deletion if they have signatures (safer for audit trail)
- Remove `notNull()` and accept nullable `signedBy` (signature records become orphaned)

### DB9-2 — No `document_versions` table (Medium)
See A2-3. The schema has no version history table, only a counter.

### DB9-3 — No soft delete on documents (Medium)
Documents are hard-deleted via `DELETE FROM documents WHERE id = ?` with `CASCADE` to `document_signatures`. Once deleted, all evidence (including signatures) is gone permanently. For legal/compliance purposes, documents should be archived, not deleted.

**Fix:** Add `deletedAt: timestamp("deleted_at")` and filter `WHERE deleted_at IS NULL` in all queries. Only super_admins should be able to permanently purge.

### DB9-4 — No CHECK constraints on status and category columns (Medium)
See S4-3, S4-4.

### DB9-5 — documentSignaturesTable has no syndicateId FK constraint (Low)
The `syndicateId` column in `documentSignaturesTable` is just `text("syndicate_id")` with no FK reference to `syndicatesTable`. A signature record could reference a non-existent syndicate.

---

## 10. UX FINDINGS

### UX10-1 — Generate button has no loading state (Critical UX)
See F3-3. No spinner, no disabled state. Users are confused whether their tap registered.

### UX10-2 — PDF preview shows raw text, not rendered PDF (High UX)
See F3-4. The "Aperçu" button shows raw content text, not the formatted PDF. Users expect a PDF preview.

### UX10-3 — Document size displayed as "undefined" for new documents (Medium UX)
The `size` field in the DataContext `Document` interface is `string`, but the API returns `fileSizeKo` as a string like "12Ko". The DataContext document mapper reads `row.size` from the API row. If `size` is null (e.g., a document where PDF generation failed silently), the size field shows as `undefined` or blank in the UI next to the download button.

**Fix:** Provide a fallback: `size: String(row.size ?? "—")`.

### UX10-4 — Stats row counts "pending" but server uses "pending_review" (High UX)  
**File:** `artifacts/mobile/app/documents.tsx`, line 315  
```typescript
{ label: "En attente", count: documents.filter((d) => d.status === "pending").length, color: "#f59e0b" },
```
The backend uses `status: "pending_review"` (not `"pending"`). The DataContext `Document` interface declares `status: "pending"` as one valid value. The API mapper would need to translate `pending_review → pending` for this count to work. If this translation doesn't happen (it doesn't appear to in the mapper), the "En attente" counter always shows 0.

**Fix:** Either translate `pending_review` to `pending` in the DataContext mapper, or update the filter to check both values.

### UX10-5 — No offline / slow network feedback (Low UX)
No offline detection, no retry prompts, no skeleton loaders while documents load.

---

## 11. CRITICAL BUGS (P0)

| ID | File | Issue | Impact |
|---|---|---|---|
| C-01 | services/api.ts:521 | `status: "published"` hardcoded in generate call — entire workflow bypassed | All documents skip review/signing/validation |
| C-02 | documents.tsx:100–104 | statusConfig crashes on 5 of 7 valid statuses — guaranteed TypeError | Screen crash for generated/pending_review/validated/signed/archived docs |
| C-03 | routes/documents.ts:411 | Signatures endpoint exposes IP addresses + signature images to all members | PII leak, handwritten signature exposure |
| C-04 | schema.ts:976 | NOT NULL + onDelete:"set null" on documentSignaturesTable.signedBy | User deletion permanently broken if they signed anything |
| C-05 | documentPdf.ts:344–350 | GCS upload failure silently creates a document with no PDF; user sees "success" | Users believe document was created; download fails with 404 |
| C-06 | documentPdf.ts:17–20 | No Arabic font registered — Arabic content renders as empty boxes in PDF | Documents with Arabic text are invalid |

---

## 12. HIGH PRIORITY BUGS (P1)

| ID | File | Issue |
|---|---|---|
| H-01 | documents.tsx:524 | No loading/disabled state on Generate button — double-tap creates duplicates |
| H-02 | services/api.ts:166 | tenant role missing from ApiUser type — type errors for tenant users |
| H-03 | documentPdf.ts:355–362 | 3 of 9 templates (convocation, contrat, decision) unreachable from mobile UI |
| H-04 | documents.tsx (missing) | No download progress indicator — user sees no feedback during PDF download |
| H-05 | routes/documents.ts:356 | Signing already-published documents de-publishes them (workflow regression) |
| H-06 | DataContext.tsx | Document status interface only has 3 values; backend returns 7 — mapping incomplete |
| H-07 | documents.tsx:315 | "En attente" counter always shows 0 (filters for "pending", backend returns "pending_review") |
| H-08 | schema.ts | No soft delete — deleted documents destroy audit trail and all signatures permanently |

---

## 13. MEDIUM PRIORITY BUGS (P2)

| ID | File | Issue |
|---|---|---|
| M-01 | documentPdf.ts | No minimum content validation — produces PDFs with placeholder dummy text |
| M-02 | routes/documents.ts:37 | pending_review → generated transition missing from state machine |
| M-03 | documentPdf.ts | Bypasses ObjectStorageService ACL system — documents have no access policies |
| M-04 | schema.ts | No CHECK constraints on status or category columns — any string storable |
| M-05 | documents.tsx:205 | Aperçu modal shows raw text; should open signed PDF URL via Linking |
| M-06 | documents.tsx:262 | Version counter increments on status changes, not only content changes |
| M-07 | schema.ts | documentSignaturesTable.syndicateId has no FK reference |

---

## 14. LOW PRIORITY BUGS (P3)

| ID | File | Issue |
|---|---|---|
| L-01 | auth.ts:37–39 | ?token= query param allowed on all routes, not just download endpoints |
| L-02 | documents.tsx | handleDownload and handleShare both download the same file — race condition on slow network |
| L-03 | documents.tsx:224 | Edit modal shows before content loads — user edits overwritten by server response |
| L-04 | documents.tsx | No archive action in admin UI |
| L-05 | documents.tsx | No delete action in admin UI |
| L-06 | schema.ts | documentSignaturesTable.syndicateId has no FK to syndicatesTable |
| L-07 | documents.tsx | No offline/slow-network feedback or retry prompt |

---

## 15. PRODUCTION READINESS SCORE

| Category | Score | Max | Notes |
|---|---|---|---|
| Functional Correctness | 4 | 20 | Workflow bypass, crash on 5/7 statuses |
| Security | 5 | 20 | IP/signature leak, DB constraint bug |
| PDF Generation | 5 | 15 | Silent GCS failure, no Arabic support |
| Download Flow | 7 | 10 | Works for happy path; no progress UI |
| Workflow / State Machine | 5 | 10 | Bypassed on creation; sign-published bug |
| Database Integrity | 5 | 10 | NOT NULL + SET NULL contradiction |
| UX / Mobile | 10 | 15 | Good visual design; missing loading states |
| **Total** | **41** | **100** | |

---

## 16. GO / NO-GO RECOMMENDATION

### ⛔ NO-GO

The module is **not production-ready**. Three of the six critical bugs (C-01, C-02, C-03) affect every user session:
- C-01 means the workflow your organization invested in building is completely bypassed
- C-02 means any document in a non-trivial state crashes the screen for all users
- C-03 means any member can steal another person's handwritten signature image and IP address

The database bug (C-04) means the system will refuse to delete any user who has ever signed a document — this will be discovered the first time an admin tries to remove a departed member.

**Minimum required before any production deployment:**
Fix C-01, C-02, C-03, C-04, C-05, H-01, H-06, H-07.

---

## 17. EXACT CODE FIXES REQUIRED

### Fix C-01: Remove hardcoded status from generate call
**File:** `artifacts/mobile/services/api.ts`, line 521
```typescript
// BEFORE:
body: JSON.stringify({ title, category, content, status: "published" }),
// AFTER:
body: JSON.stringify({ title, category, content }),
```

### Fix C-02: Extend statusConfig to handle all 7 statuses
**File:** `artifacts/mobile/app/documents.tsx`, lines 100–104
```typescript
const statusConfig = (status: string): { label: string; color: string } =>
  ({
    published:      { label: "Publié",      color: colors.success },
    draft:          { label: "Brouillon",    color: colors.mutedForeground },
    pending:        { label: "En attente",   color: "#f59e0b" },
    generated:      { label: "Généré",       color: "#3b82f6" },
    pending_review: { label: "En révision",  color: "#f59e0b" },
    validated:      { label: "Validé",       color: "#10b981" },
    signed:         { label: "Signé",        color: "#8b5cf6" },
    archived:       { label: "Archivé",      color: colors.mutedForeground },
  } as Record<string, { label: string; color: string }>)[status]
  ?? { label: status, color: colors.mutedForeground };
```
Also update the Document interface and DataContext mapper to use `string` for status (or declare all 7 values).

### Fix C-03: Restrict signatures endpoint to admins
**File:** `artifacts/api-server/src/routes/documents.ts`, line 411
```typescript
// BEFORE:
router.get("/documents/:id/signatures", requireAuth, async (req, res) => {
// AFTER:
router.get("/documents/:id/signatures", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
```

### Fix C-04: Resolve NOT NULL / SET NULL contradiction
**File:** `lib/db/src/schema.ts`, documentSignaturesTable
```typescript
// BEFORE:
signedBy: text("signed_by").notNull().references(() => usersTable.id, { onDelete: "set null" }),
// AFTER (option A — restrict deletion):
signedBy: text("signed_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
// AFTER (option B — allow null after user deletion):
signedBy: text("signed_by").references(() => usersTable.id, { onDelete: "set null" }),
```
Then run `pnpm --filter @workspace/db run db:push` to apply the schema change.

### Fix C-05: Surface PDF generation failures to the API caller
**File:** `artifacts/api-server/src/lib/documentPdf.ts`, lines 332–351
```typescript
// Change the catch block to re-throw:
export async function generateAndUploadDocument(...): Promise<GeneratedDocument> {
  ...
  const fileUrl = await uploadBufferToGcs(buffer, filename);  // let it throw
  return { fileUrl, fileSizeKo, documentNumber: docNumber };
}
```
**File:** `artifacts/api-server/src/routes/documents.ts`, catch block in POST handler — already returns 500 on error; the fix is to not swallow the error in `generateAndUploadDocument`.

### Fix H-01: Add loading state to Generate button
**File:** `artifacts/mobile/app/documents.tsx`
```typescript
const [generating, setGenerating] = useState(false);

const handleGenerate = async () => {
  if (!selectedTemplate || generating) return;
  setGenerating(true);
  try {
    // ...existing logic...
  } finally {
    setGenerating(false);
  }
};

// In JSX:
<TouchableOpacity
  style={[styles.primaryAction, { backgroundColor: selectedTemplate.color, opacity: generating ? 0.6 : 1 }]}
  onPress={handleGenerate}
  disabled={generating}
>
  <Feather name={generating ? "loader" : "file-plus"} size={18} color="#fff" />
  <Text style={styles.primaryActionText}>{generating ? "Génération…" : "Générer le document"}</Text>
</TouchableOpacity>
```

### Fix H-07: Fix "En attente" counter to match actual status value
**File:** `artifacts/mobile/app/documents.tsx`, line 315
```typescript
// BEFORE:
{ label: "En attente", count: documents.filter((d) => d.status === "pending").length, ... },
// AFTER:
{ label: "En attente", count: documents.filter((d) => d.status === "pending" || d.status === "pending_review").length, ... },
```

---

## 18. PRIORITIZED ACTION PLAN

### Sprint 1 — Critical Fixes (Do before any user testing)
1. **Fix C-01** — Remove `status: "published"` from generate API call (5 min)
2. **Fix C-02** — Extend `statusConfig` to cover all 7 statuses + update DataContext interface (30 min)
3. **Fix C-03** — Add role guard to `/documents/:id/signatures` endpoint (5 min)
4. **Fix C-04** — Fix NOT NULL + SET NULL contradiction in schema + push migration (20 min)
5. **Fix C-05** — Stop swallowing GCS upload errors; surface to API response (15 min)
6. **Fix H-01** — Add loading state to generate button (15 min)
7. **Fix H-07** — Fix "En attente" counter (5 min)

### Sprint 2 — High Priority (Before beta launch)
8. **Fix H-06** — Update DataContext document mapper to handle all 7 statuses
9. **Fix H-02** — Add `"tenant"` to `ApiUser.role` type
10. **Fix H-04** — Add download progress indicator with `FileSystem.createDownloadResumable` progress callback
11. **Fix H-05** — Remove `"published"` from the `signable` array
12. **Fix H-08** — Implement soft delete (`deletedAt` column + filter)

### Sprint 3 — Medium Priority (Before GA)
13. **C-06** — Register an Arabic-capable font in pdfmake (requires sourcing a TTF font file)
14. **Fix M-02** — Add `generated` to pending_review transitions
15. **Fix M-01** — Add content required validation for templates that need it
16. **Fix M-03** — Route document uploads through `ObjectStorageService` ACL
17. **Fix M-05** — Aperçu: open signed PDF URL via `Linking.openURL` instead of raw text

### Sprint 4 — Polish (Post-GA)
18. Add `document_versions` table for full revision history
19. Add CHECK constraints on status and category columns
20. Add delete action in admin UI with soft delete
21. Add archive action in admin UI
22. Implement offline detection and retry prompts

---

## 19. MISSING FEATURES

The following features are specified or implied by the architecture but are completely absent:

1. **Arabic/RTL PDF rendering** — No font support, no RTL layout in any template
2. **Document version history** — No `document_versions` table; only a counter
3. **Assigned reviewers / approval chain** — No multi-user review workflow
4. **Document comments** — No comment endpoint or UI
5. **Soft delete / archive** — Documents are permanently destroyed on delete
6. **PDF preview** — Aperçu shows raw text instead of rendered PDF
7. **Download progress** — No progress indicator for slow connections
8. **Convocation, Contrat, Décision templates** — Defined in backend but unreachable from mobile
9. **Delete action in admin UI** — API exists but UI has no delete button
10. **Archive action in admin UI** — Backend state machine allows it but UI doesn't expose it
11. **N-of-M signature requirement** — Multi-signature workflow exists (documentSignaturesTable) but no mechanism to require minimum signatures before transitioning to `validated` or `published`
12. **Notification when document is ready for review** — No notification sent when status changes to `pending_review`

---

## 20. FINAL VERDICT

The Documents Module is **structurally sound but critically broken** in its current state. The underlying architecture — a 7-state workflow, GCS-backed PDF storage, pdfmake templates, signed URLs, multi-signature tracking, and RBAC — is well-designed. The implementations of each component are individually reasonable.

However, the **integration between the mobile client and the backend is severely broken**: the client bypasses the entire workflow, crashes on most document states, leaks sensitive security data to unauthorized users, and provides no feedback during slow operations.

**The module cannot be used by end users in its current form.** With the Sprint 1 fixes (roughly 90 minutes of work), the critical crashes and security issues are resolved and the module becomes minimally functional. The full Sprint 2 completes the production-readiness baseline. Arabic font support (Sprint 3) is required for any deployment in Arabic-speaking markets.

**Estimated remediation effort to reach production readiness:**
- Sprint 1 (Critical fixes): ~2 hours
- Sprint 2 (High priority): ~1 day  
- Sprint 3 (Medium priority): ~2–3 days
- Sprint 4 (Polish): ~1 week
