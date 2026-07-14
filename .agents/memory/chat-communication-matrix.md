---
name: Chat communication matrix & role gaps
description: How cross-role/cross-syndicate chat permissions are enforced, and which roles aren't representable yet
---

Direct-conversation creation in `chat.ts` is gated by a `canDirectMessage()` matrix (super_admin↔syndicate_admin any syndicate; syndicate_admin↔member/tenant same syndicate; member↔member same syndicate; everything else blocked by default). Marketplace ("Contact Seller") and incident-linked chats intentionally bypass this matrix via their own dedicated creation endpoints.

**Why:** the original chat API only checked conversation *membership*, not whether the pairing was legitimate — any user could DM any other user across syndicates/roles. This was the core security gap in a chat audit.

**How to apply:** if adding new conversation-creation paths, either route them through `canDirectMessage()` or explicitly document why they bypass it (like marketplace/incident/emergency do).

**Known gap:** JWT roles are only `super_admin | syndicate_admin | member | tenant`. There is no "employee" or "provider" login identity — `prestataires` are data records without their own auth. Any spec requiring Employee/Provider↔Admin chat needs that identity work done first; don't silently approximate it with an existing role.
