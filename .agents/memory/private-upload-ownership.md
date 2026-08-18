---
name: Private upload ownership
description: Durable authorization rules for generic uploaded objects and clients that cannot send request headers
---

Generic uploaded object paths must never be treated as bearer capabilities. Persist the authenticated uploader, optional syndicate scope, object path, content type, and size before returning the path; serve only to the owner or a matching syndicate caller, with explicit supervision for Super Admin cross-syndicate access. Unknown private paths fail closed.

**Why:** Random UUIDs prevent guessing but do not prevent disclosure through copied URLs, logs, chat history, or referrers. Mobile image/link components often cannot attach an Authorization header, so the API's existing short-lived query-token convention is required for those render/download URLs.

**How to apply:** Keep document-specific authorization stricter than the generic owner/syndicate rule. Register both multipart and presigned uploads, remove ownership metadata when the underlying document is deleted, and update mobile URL resolvers whenever private object serving changes.