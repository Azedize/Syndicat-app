---
name: Invoice persistence boundary
description: Financial document identity and lifecycle fields must be decided at the API persistence boundary.
---

Invoice creation must accept only user-entered business inputs from the client. The server owns the invoice ID, reference, issue date, due date, initial status, syndicate scope, and computed total; the client maps the returned canonical row into its cache.

**Why:** Client-generated legal/financial identifiers and dates can collide under concurrent use, show records before persistence succeeds, and allow trusted server-controlled fields to drift from database truth.