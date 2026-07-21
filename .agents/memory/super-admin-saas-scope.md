---
name: Super Admin SaaS Scope
description: Super admin is the platform owner, not a syndicate employee — all syndicate operational modules removed from his experience.
---

## Rule
`super_admin` sees ONLY platform-level items. He NEVER sees syndicate operations.

## What super_admin sees (after audit)
- `menuSectionAdmin` (first section in more.tsx): Tableau National, Gestion Utilisateurs, Créer Syndicat, Journal d'Audit, Statistiques Globales, Modèles Plateforme (/template-studio), Éditeur de Modèles (/template-editor)
- Support tickets `/support` (platform helpdesk — all roles)
- Abonnements `/abonnements` (shared with syndic_admin and member)
- Account items: Profile, Notifications, Settings, CGU
- Members tab shows syndicates list (not individual members) — this is intentional

## Tabs (after audit)
- Finance tab: `isSyndicateAdmin` only (was `isAdmin` — super_admin excluded)
- Marketplace tab: `isSyndicateAdmin || role === "member"` (was `!isTenant` — super_admin excluded)

## What super_admin does NOT see
All 33+ syndicate operational modules: buildings, lots, members, locataires, charges, budget, travaux, prestataires, sinistres, parking, AG, votes, PV, governance, documents, règlements, actes, legal alerts, transparency, annonces, publications, chat, messagerie, ideas, réclamations RH, marketplace cart/orders/boutique, statistiques (moved to super_admin only, removed from syndicate_admin).

## Why
Super admin = SaaS platform owner. Adding him to syndicate modules creates confusion, RBAC leaks, and violates multi-tenant isolation principles. The `?supervision=true` escape hatch (requireOperationalAccess middleware) remains for exceptional supervised interventions.

## Files changed
- `artifacts/mobile/app/(tabs)/more.tsx` — MENU_SECTIONS_DEF rewritten
- `artifacts/mobile/app/(tabs)/_layout.tsx` — Finance + Marketplace tab visibility fixed
- `artifacts/mobile/context/LanguageContext.tsx` — added `modelesPlateforme`, `editeurModeles` keys
