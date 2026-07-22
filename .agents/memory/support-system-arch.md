---
name: Two-tier support system architecture
description: Level-1 (syndicate) and Level-2 (platform) support hierarchy — schema, API, and mobile screens.
---

## The Two Tiers

| Tier | Who submits | Who handles | Screen | API scope param |
|------|-------------|-------------|--------|-----------------|
| Level 1 | member / tenant / syndicate_admin | syndicate_admin | `/support` | `scope=syndicate` (default) |
| Level 2 | syndicate_admin | super_admin | `/platform-support` | `scope=platform` |

## Schema (`support_tickets` table)
Two new columns added (via `drizzle-kit push`):
- `scope TEXT DEFAULT 'syndicate'` — "syndicate" or "platform"
- `escalated_from TEXT` — nullable FK to parent Level-1 ticket id

## API Logic (`content.ts` GET /support)
- `super_admin` → always returns `scope=platform` tickets only (no syndicate filter)
- `syndicate_admin` with `?scope=platform` → returns their own platform tickets
- `syndicate_admin` without scope param → returns syndicate tickets they manage
- `member/tenant` → returns only their own syndicate tickets (filtered by submittedById)

## POST /support
- `scope=syndicate` (any role): notifies syndicate_admin, requires syndicateId
- `scope=platform` (syndicate_admin/super_admin only): notifies super_admin, no syndicateId required
- Members/tenants get 403 if they try scope=platform

## POST /support/:id/escalate
- Only `syndicate_admin`
- Creates a Level-2 platform ticket with `escalatedFrom = originalTicket.id`
- Marks original ticket as `in_progress`
- Notifies super_admin via alert

## PUT /support/:id/resolve
- `syndicate_admin` can resolve Level-1 tickets (own syndicate)
- `super_admin` can resolve Level-2 tickets

## Navigation (`more.tsx`)
- "Demandes d'Intervention" → `/support` — roles: `syndicate_admin, member, tenant` (NOT super_admin)
- "Support Plateforme" → `/platform-support` — roles: `super_admin, syndicate_admin`

## Mobile Screens
- `support.tsx` — Level 1. Categories: paiement/maintenance/juridique/administratif/general. Reply thread visible. Escalation button for syndicate_admin.
- `platform-support.tsx` — Level 2. RoleGuard allows super_admin + syndicate_admin. Categories: bug/feature/acces/formation/autre. super_admin manages all; syndicate_admin only sees their own.

**Why:** Residents must never contact the platform directly (SaaS multi-tenant model). The syndicate admin acts as first-line support and escalates technical bugs upward.
