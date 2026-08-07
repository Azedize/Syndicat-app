---
name: Admin-created account credentials
description: Security boundary for administrator-created user accounts and invitation credentials.
---

Administrator-created accounts must not receive a password chosen or embedded by the mobile client. The server owns temporary credential generation and the credential is delivered only through the existing welcome/invitation channel.

**Why:** A shared client-side default password is predictable and can be reused across accounts, creating an avoidable account-takeover risk.

**How to apply:** Keep password generation and hashing in the API route. Treat the client as a profile/invitation form only; never include a default password in request payloads or UI code.