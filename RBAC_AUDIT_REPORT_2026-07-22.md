# RAPPORT D'AUDIT RBAC — SYNDYCAT GLOBAL CPS
**Date :** 22 juillet 2026  
**Périmètre :** Application mobile Expo + API Express  
**Méthodologie :** Analyse statique complète — navigation, menus, écrans, guards API, visibilité des données

---

## RÉSUMÉ EXÉCUTIF

| Catégorie | Problèmes critiques | Problèmes majeurs | Problèmes mineurs |
|-----------|--------------------|--------------------|-------------------|
| Architecture des rôles | **1** | 0 | 0 |
| Navigation / Menus | 0 | **3** | 2 |
| Écrans (UI Guards) | **2** | **5** | 4 |
| API Guards | **1** | **3** | 2 |
| Héritage de rôles | **1** | 0 | 0 |
| **TOTAL** | **5** | **11** | **8** |

---

## 1. ARCHITECTURE DES RÔLES

### ✅ Rôles définis

L'application reconnaît correctement 8 rôles :

| Rôle JWT | Label métier | Statut |
|----------|-------------|--------|
| `super_admin` | Super Admin (propriétaire SaaS) | ✅ Présent |
| `syndicate_admin` | Administrateur syndical | ✅ Présent |
| `president` | Président | ✅ Présent |
| `treasurer` | Trésorier | ✅ Présent |
| `secretary` | Secrétaire | ✅ Présent |
| `committee_member` | Membre du Bureau | ✅ Présent |
| `member` | Copropriétaire | ✅ Présent |
| `tenant` | Locataire | ✅ Présent |

---

## 2. PROBLÈME CRITIQUE N°1 — CUMUL DE RÔLES NON SUPPORTÉ

### Sévérité : 🔴 CRITIQUE

### Description
La spécification métier stipule explicitement :

> *"Un utilisateur peut cumuler plusieurs rôles. Mohamed est copropriétaire ET Trésorier. L'application ne doit jamais supprimer son espace personnel simplement parce qu'il est devenu Trésorier."*

**Or l'architecture actuelle stocke un unique rôle string dans le JWT.**  
Il n'y a aucun mécanisme de rôles multiples. Un Trésorier qui est aussi copropriétaire a le rôle JWT `treasurer` — son rôle `member` est perdu.

### Impact concret

| Utilisateur | Rôle JWT actuel | Ce qu'il perd |
|-------------|-----------------|---------------|
| Trésorier + Copropriétaire | `treasurer` | Mes Cotisations, Mes Paiements, Mes Documents personnels |
| Président + Copropriétaire | `president` | Mes Cotisations, Mes Votes personnels, Mon Lot |
| Secrétaire + Copropriétaire | `secretary` | Mes Cotisations, Mes Assemblées personnelles |
| Syndic Admin + Copropriétaire | `syndicate_admin` | Accès à l'espace personnel (non critique, il a déjà tout) |

### Écrans affectés par l'absence de cumul

- **`cotisations.tsx`** — `RoleGuard allow={["member"]}` → Trésorier/Président/Secrétaire copropriétaires **bloqués**
- **`assemblee-generale.tsx`** — `RoleGuard allow={["super_admin", "syndicate_admin", "member"]}` → Président/Secrétaire/Membre du Bureau **bloqués**
- **`charges.tsx`** — `RoleGuard allow={["super_admin", "syndicate_admin", "member"]}` → Trésorier/Président copropriétaires **bloqués pour leurs charges personnelles**
- **`mon-lot.tsx`** — Pas de RoleGuard (accessible), mais le menu More ne renvoie pas les rôles bureau vers cet écran

### Solution recommandée
```typescript
// JWT payload actuel
{ role: "treasurer" }

// JWT payload corrigé — rôles multiples
{ role: "treasurer", roles: ["treasurer", "member"] }

// Helper à créer
const hasRole = (user, ...roles) => roles.some(r => (user.roles ?? [user.role]).includes(r));
const isMember = hasRole(user, "member", "treasurer", "president", "secretary", "committee_member", "syndicate_admin");
```

---

## 3. NAVIGATION — ONGLETS (Tab Bar)

### 3.1 ✅ Ce qui fonctionne

| Onglet | Rôles ayant accès | Conforme spec |
|--------|------------------|---------------|
| Dashboard | Tous | ✅ |
| Members | super_admin, syndicate_admin | ✅ |
| Finance | syndicate_admin, treasurer | ✅ |
| More | Tous (contenu filtré) | ✅ |

### 3.2 ⚠️ Marketplace — Locataire exclu de l'onglet

**Sévérité : 🟡 MAJEUR**

```typescript
// Code actuel — finance.tsx tab
showMarketplaceTab = isSyndicateAdmin || role === "member"
// ❌ "tenant" absent
```

La spec dit que le Locataire doit voir la Marketplace (navigation, achat). Il peut accéder via le menu More mais **l'onglet rapide lui est caché sans raison**.

**Correction :**
```typescript
showMarketplaceTab = isSyndicateAdmin || role === "member" || role === "tenant"
```

### 3.3 ⚠️ Finance Tab — Président absent (lecture seule budget)

**Sévérité : 🟡 MAJEUR**

La spec prévoit que le Président consulte le budget. Le Président n'a pas accès à l'onglet Finance et n'a pas de raccourci direct vers `budget-previsionnel`. Il doit passer par le Dashboard → action rapide qui mène à `/charges` mais pas au budget.

**Correction :** Ajouter le Président à l'onglet Finance (vue lecture seule uniquement).

### 3.4 ⚠️ Abonnements — Accès syndicate_admin manque de guard explicite

**Sévérité : 🟠 MINEUR**

`abonnements.tsx` utilise un rendu conditionnel basé sur `user?.role` sans `RoleGuard` formel. Un utilisateur `member` accédant à `/abonnements` via URL directe verrait une page partiellement rendue plutôt qu'un refus clair.

---

## 4. ÉCRANS — GUARDS UI

### 4.1 🔴 CRITIQUE — Assemblée Générale exclut Président, Secrétaire, Membre du Bureau

**Fichier :** `assemblee-generale.tsx`

```typescript
// Code actuel
<RoleGuard allow={["super_admin", "syndicate_admin", "member"]}>
```

**Rôles manquants :** `president`, `secretary`, `committee_member`

**Impact métier :**
- Le **Président** doit légalement signer les procès-verbaux d'AG. Il est bloqué.
- La **Secrétaire** crée les réunions, prépare l'ordre du jour, enregistre les présences. Elle est bloquée.
- Le **Membre du Bureau** participe aux votes d'AG. Il est bloqué.

**Correction :**
```typescript
<RoleGuard allow={["super_admin", "syndicate_admin", "president", "secretary", "committee_member", "member"]}>
```

### 4.2 🔴 CRITIQUE — Budget Prévisionnel exclut le Trésorier

**Fichier :** `budget-previsionnel.tsx`

```typescript
// Code actuel
<RoleGuard allow={["super_admin", "syndicate_admin"]}>
```

**Rôles manquants :** `treasurer`, `president` (lecture)

**Impact métier :** Le Trésorier **est responsable des finances et du budget**. L'écran budgétaire lui est actuellement interdit. C'est une incohérence fonctionnelle majeure.

**Correction :**
```typescript
<RoleGuard allow={["super_admin", "syndicate_admin", "treasurer", "president"]}>
// + En interne, bloquer les actions d'écriture pour "president" (lecture seule)
```

### 4.3 🟡 MAJEUR — Cotisations accessible au membre uniquement

**Fichier :** `cotisations.tsx`

```typescript
// Code actuel
<RoleGuard allow={["member"]}>
```

Le Trésorier, le Président et le Secrétaire qui sont aussi copropriétaires ne peuvent pas accéder à leurs propres cotisations. **Lié au problème critique N°1 du cumul de rôles.**

### 4.4 🟡 MAJEUR — paiements.tsx sans RoleGuard — Super Admin voit les finances d'un syndicat

**Fichier :** `paiements.tsx`

La page des paiements est accessible à **tous les rôles** sans guard. Le Super Admin ne devrait jamais voir les données financières individuelles d'un syndicat.

**Correction :**
```typescript
<RoleGuard deny={["super_admin"]}>
```

### 4.5 🟡 MAJEUR — mon-lot.tsx et mon-bail.tsx sans RoleGuard

**Fichiers :** `mon-lot.tsx`, `mon-bail.tsx`

Ces écrans ont **aucun RoleGuard**. Un Super Admin ou un rôle non concerné peut y accéder via URL directe.

- `mon-lot.tsx` → réservé aux `member` (et membres du bureau qui sont copropriétaires)
- `mon-bail.tsx` → réservé au `tenant`

**Correction :**
```typescript
// mon-lot.tsx
<RoleGuard allow={["member", "president", "treasurer", "secretary", "committee_member", "syndicate_admin"]}>
// mon-bail.tsx
<RoleGuard allow={["tenant"]}>
```

### 4.6 🟡 MAJEUR — Réunions — Secrétaire ne peut pas créer de réunion (UI)

**Fichier :** `meetings.tsx`

```typescript
// Code actuel — isAdmin pour la création
isAdmin = ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member"]
```

✅ L'UI semble inclure la Secrétaire dans `isAdmin` pour les réunions — c'est **correct**.  
❌ Mais l'API (voir section 5.2) bloque la Secrétaire au niveau backend.

### 4.7 🟠 MINEUR — support.tsx exclut super_admin (voulu) mais sans guard explicite

**Fichier :** `support.tsx`

Le Super Admin est explicitement exclu du support syndical L1 — c'est **correct métier** (il a `platform-support.tsx`). Mais l'exclusion est faite par rendu conditionnel et non par RoleGuard formel.

### 4.8 🟠 MINEUR — documents.tsx — Super Admin peut agir sur les documents d'un syndicat

**Fichier :** `documents.tsx`

```typescript
// isAdmin inclut super_admin
isAdmin = ["super_admin", "syndicate_admin"]
```

Le Super Admin peut générer des documents, approuver des workflows et accéder aux archives d'un syndicat. La spec dit : *"Ahmed ne doit jamais voir les documents privés d'un résident."*

**Recommandation :** Retirer `super_admin` des actions d'écriture dans `documents.tsx`.

---

## 5. API — GUARDS BACKEND

### 5.1 🔴 CRITIQUE — Meetings API bloque la Secrétaire pour créer/modifier des réunions

**Fichier :** `artifacts/api-server/src/routes/meetings.ts`

```typescript
// Code actuel
POST   /meetings  → requireRole("super_admin", "syndicate_admin")
PUT    /meetings  → requireRole("super_admin", "syndicate_admin")
DELETE /meetings  → requireRole("super_admin", "syndicate_admin")
```

**Rôle manquant :** `secretary`

La spec stipule clairement : *"Fatima (Secrétaire) crée la réunion, prépare l'ordre du jour, génère les convocations, enregistre les présences, rédige le procès-verbal."*

Elle ne peut faire **aucune de ces actions** via l'API. Un bypass UI ne fonctionne pas car le backend bloque.

**Correction :**
```typescript
POST   /meetings  → requireRole("super_admin", "syndicate_admin", "secretary")
PUT    /meetings  → requireRole("super_admin", "syndicate_admin", "secretary")
DELETE /meetings  → requireRole("super_admin", "syndicate_admin")  // Suppression : admins seulement
```

### 5.2 🟡 MAJEUR — Budget API — Trésorier en lecture seule via requireFinanceAccess

**Fichier :** `artifacts/api-server/src/routes/budget.ts`

```typescript
// GET budgets — requireFinanceAccess ✅ (inclut treasurer)
// POST/PUT budgets — requireOperationalAccess ❌ (exclut treasurer)
```

`requireOperationalAccess` exclut le Trésorier des opérations d'écriture sur le budget, alors que **le Trésorier est précisément responsable du budget**.

**Correction :**
```typescript
POST /budgets  → requireFinanceAccess  // inclut treasurer
PUT  /budgets  → requireFinanceAccess
```

### 5.3 🟡 MAJEUR — Elections API — Secrétaire ne peut pas gérer les mandats

**Fichier :** `artifacts/api-server/src/routes/elections.ts`

```typescript
POST/PUT /elections  → requireOperationalAccess  // exclut secretary
```

La Secrétaire archive les documents d'élection et rédige les procès-verbaux d'élection. Elle devrait avoir accès au moins en GET détaillé et pour l'archivage.

### 5.4 🟡 MAJEUR — Finance API — Super Admin peut voir les transactions d'un syndicat

**Fichier :** `artifacts/api-server/src/routes/finance.ts`

```typescript
GET /transactions → requireAuth + requireRole("super_admin", "syndicate_admin")
```

Le Super Admin peut lire les transactions financières d'un syndicat. La spec interdit cela explicitement.

**Correction :**
```typescript
GET /transactions → requireRole("syndicate_admin", "treasurer")
// + Pour supervision : ajouter ?supervision=true check comme dans d'autres routes
```

### 5.5 🟠 MINEUR — Documents GET /verify/:token — route publique non documentée

**Fichier :** `artifacts/api-server/src/routes/documents.ts`

```
GET /documents/verify/:token → Pas de guard (intentionnel pour vérification externe)
```

Cette route est **intentionnellement publique** pour la vérification QR code. C'est correct métier mais elle doit être documentée et limitée strictement à la lecture du statut (pas de données sensibles).

### 5.6 🟠 MINEUR — Statistics API — syndicate_admin peut voir les stats de n'importe quel syndicat

**Fichier :** `artifacts/api-server/src/routes/statistics.ts`

```typescript
GET /statistics/syndicate → requireRole("super_admin", "syndicate_admin")
```

Si le filtrage n'est pas strictement appliqué par `syndicateId` du JWT, un `syndicate_admin` pourrait accéder aux statistiques d'un autre syndicat en manipulant les paramètres. **Vérifier que `syndicateWhere` est systématiquement appliqué.**

---

## 6. MATRICE DE VISIBILITÉ PAR RÔLE

### 6.1 Navigation principale

| Écran / Fonctionnalité | super_admin | syndic_admin | président | trésorier | secrétaire | membre_bureau | membre | locataire |
|------------------------|:-----------:|:------------:|:---------:|:---------:|:----------:|:-------------:|:------:|:---------:|
| **Tableau de bord** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Onglet Membres** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Onglet Finance** | ❌ | ✅ | ❌⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Onglet Marketplace** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌⚠️ |
| **Plus (More)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

⚠️ = Problème identifié

### 6.2 Écrans Gouvernance

| Écran | super_admin | syndic_admin | président | trésorier | secrétaire | membre_bureau | membre | locataire |
|-------|:-----------:|:------------:|:---------:|:---------:|:----------:|:-------------:|:------:|:---------:|
| **Assemblée Générale** | ✅ | ✅ | ❌🔴 | ❌⚠️ | ❌🔴 | ❌🔴 | ✅ | ❌ |
| **Réunions (lecture)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Réunions (création)** | ✅ | ✅ | ✅ | ✅ | ✅UI/❌API🔴 | ❌ | ❌ | ❌ |
| **Élections** | ✅ | ✅ | ❌⚠️ | ❌⚠️ | ❌⚠️ | ❌ | ✅ | ❌ |
| **Gouvernance / Bureau** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ | ❌ |

🔴 = Bloqué alors que requis | ⚠️ = Partiellement | 👁️ = Lecture seule

### 6.3 Écrans Finance

| Écran | super_admin | syndic_admin | président | trésorier | secrétaire | membre_bureau | membre | locataire |
|-------|:-----------:|:------------:|:---------:|:---------:|:----------:|:-------------:|:------:|:---------:|
| **Budget Prévisionnel** | ✅ | ✅ | ❌⚠️ | ❌🔴 | ❌ | ❌ | ❌ | ❌ |
| **Charges (globales)** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Mes Cotisations** | ❌ | ❌ | ❌⚠️ | ❌⚠️ | ❌⚠️ | ❌⚠️ | ✅ | ❌ |
| **Mes Paiements** | ❌ | ❌ | ❌⚠️ | ❌⚠️ | ❌⚠️ | ❌⚠️ | ✅ | ❌ |
| **Tableau Financier** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 6.4 Écrans Personnels

| Écran | super_admin | syndic_admin | président | trésorier | secrétaire | membre_bureau | membre | locataire |
|-------|:-----------:|:------------:|:---------:|:---------:|:----------:|:-------------:|:------:|:---------:|
| **Mon Lot** | ❌ | ✅ | ✅⚠️ | ✅⚠️ | ✅⚠️ | ✅⚠️ | ✅ | ❌ |
| **Mon Bail** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Mes Documents** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Mes Réclamations** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Profil** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

⚠️ = Accessible mais sans mécanisme de cumul de rôle (données personnelles absentes si rôle bureau)

### 6.5 Écrans Super Admin (plateforme uniquement)

| Écran | Accès actuel | Conforme spec |
|-------|-------------|---------------|
| Tableau National | super_admin ✅ | ✅ |
| Gestion Utilisateurs | super_admin + syndic_admin ⚠️ | ⚠️ Syndic_admin devrait voir uniquement ses utilisateurs |
| Créer Syndicat | super_admin ✅ | ✅ |
| Journal d'Audit | super_admin + syndic_admin ⚠️ | ✅ (portée différente selon rôle) |
| Statistiques Globales | super_admin ✅ | ✅ |
| Modération Marketplace | super_admin ✅ | ✅ |
| Abonnements | super_admin + syndic_admin ✅ | ✅ |
| Support Plateforme | super_admin + syndic_admin ✅ | ✅ |
| **Finance syndicate** | super_admin ❌ **doit être bloqué** | ❌ NON CONFORME |

---

## 7. PROTECTION PAR URL DIRECTE (DEEP LINKS)

### Écrans vulnérables à l'accès direct

| URL | Guard actuel | Vulnérabilité |
|-----|-------------|---------------|
| `/paiements` | Aucun RoleGuard | Super Admin voit données syndicat |
| `/mon-lot` | Aucun RoleGuard | N'importe quel rôle accède |
| `/mon-bail` | Aucun RoleGuard | N'importe quel rôle accède |
| `/abonnements` | Rendu conditionnel seulement | Member peut charger la page |
| `/budget-previsionnel` | RoleGuard bloque trésorier | Trésorier bloqué incorrectement |

### Écrans correctement protégés par URL directe

| URL | Guard | Verdict |
|-----|-------|---------|
| `/tableau-national` | `RoleGuard allow=["super_admin"]` | ✅ |
| `/journal-audit` | `RoleGuard allow=["super_admin", "syndicate_admin"]` | ✅ |
| `/utilisateurs` | `useRequireRole` | ✅ |
| `/lots` | `RoleGuard allow=["super_admin", "syndicate_admin"]` | ✅ |
| `/locataires` | `RoleGuard allow=["super_admin", "syndicate_admin"]` | ✅ |
| `/escalation` | `RoleGuard allow=["super_admin", "syndicate_admin"]` | ✅ |
| `/cotisations` | `RoleGuard allow=["member"]` | ✅ (trop restrictif, voir §4.3) |

---

## 8. CONFORMITÉ PAR RÔLE — BILAN

### Super Admin
| Critère | Statut |
|---------|--------|
| Voit tous les syndicats clients | ✅ |
| Abonnements actifs | ✅ |
| Revenus mensuels | ✅ |
| Tickets de support | ✅ |
| Suspendre/réactiver client | ✅ |
| **Ne voit PAS les cotisations personnelles** | ❌ (peut accéder via `/paiements`) |
| **Ne voit PAS les documents privés** | ❌ (peut agir sur documents.tsx) |
| **Ne voit PAS les votes d'AG** | ❌ (non bloqué sur /assemblee-generale) |
| **Ne voit PAS les réclamations internes** | ✅ (bloqué sur reclamations.tsx) |

### Syndicate Admin
| Critère | Statut |
|---------|--------|
| Configure immeuble, lots, copropriétaires | ✅ |
| Gère locataires | ✅ |
| Accès finances | ✅ |
| Accès documents | ✅ |
| Crée utilisateurs | ✅ |

### Président
| Critère | Statut |
|---------|--------|
| Consulte assemblées, résolutions, votes | ❌ Bloqué par RoleGuard AG |
| Signe électroniquement les PV | ✅ (documents.tsx) |
| Voit budget (lecture) | ❌ Bloqué par RoleGuard budget |
| **Ne gère PAS** les paramètres techniques | ✅ |
| **Ne gère PAS** les comptes utilisateurs | ✅ |
| Accès espace personnel (copropriétaire) | ❌ Cumul non supporté |

### Trésorier
| Critère | Statut |
|---------|--------|
| Tableau financier | ✅ |
| Charges globales | ✅ |
| Debteurs / impayés | ✅ |
| Budget (lecture et saisie) | ❌ Bloqué UI+API |
| Rapports financiers | ✅ |
| **Espace personnel** (copropriétaire) | ❌ Cumul non supporté |

### Secrétaire
| Critère | Statut |
|---------|--------|
| Crée réunions (UI) | ✅ |
| Crée réunions (API) | ❌ 403 Forbidden |
| Prépare ordre du jour | ❌ Bloquée par API meetings |
| Assemblée générale | ❌ Bloquée par RoleGuard |
| Gestion documents | ✅ |
| Publications | ✅ |
| **Espace personnel** (copropriétaire) | ❌ Cumul non supporté |
| **Ne gère PAS** les budgets | ✅ |

### Membre du Bureau
| Critère | Statut |
|---------|--------|
| Consulte réunions | ✅ |
| Consulte décisions | ✅ |
| Participe aux votes | ❌ Bloqué par RoleGuard AG |
| Peut donner son avis | ✅ (idées) |
| **Ne modifie PAS** les finances | ✅ |
| **Ne crée PAS** d'utilisateurs | ✅ |

### Copropriétaire (Member)
| Critère | Statut |
|---------|--------|
| Tableau de bord | ✅ |
| Mes Cotisations | ✅ |
| Mes Paiements | ✅ |
| Mes Documents | ✅ |
| Mes Réclamations | ✅ |
| Assemblées / Votes | ✅ |
| Notifications | ✅ |
| Mon Profil | ✅ |
| Marketplace (achat) | ✅ |

### Locataire (Tenant)
| Critère | Statut |
|---------|--------|
| Tableau de bord | ✅ |
| Documents | ✅ |
| Réclamations | ✅ |
| Demandes de maintenance | ✅ |
| Notifications | ✅ |
| Profil | ✅ |
| Mon Bail | ✅ |
| Marketplace (navigation) | ✅ menu, ❌ onglet |
| **Ne voit PAS** votes de copropriété | ✅ (bloqué elections.tsx) |
| **Ne voit PAS** budgets | ✅ |
| **Ne voit PAS** cotisations propriétaires | ✅ (bloqué cotisations.tsx, charges.tsx) |

---

## 9. PLAN DE CORRECTION — ROADMAP

### Phase 1 — CRITIQUES (Bloquer en production) — Estimé : 1-2 jours

| # | Fichier | Correction |
|---|---------|------------|
| C1 | `assemblee-generale.tsx` | Ajouter `president`, `secretary`, `committee_member` au RoleGuard |
| C2 | `budget-previsionnel.tsx` | Ajouter `treasurer` (écriture) et `president` (lecture) au RoleGuard |
| C3 | `api-server/src/routes/meetings.ts` | Ajouter `secretary` aux routes POST/PUT |
| C4 | `api-server/src/routes/finance.ts` | Retirer `super_admin` de GET /transactions |
| C5 | Architecture JWT | Planifier et implémenter le support multi-rôles (`roles[]` dans le JWT) |

### Phase 2 — MAJEURS (Sprint suivant) — Estimé : 3-5 jours

| # | Fichier | Correction |
|---|---------|------------|
| M1 | `(tabs)/_layout.tsx` | Ajouter `tenant` à `showMarketplaceTab` |
| M2 | `paiements.tsx` | Ajouter `RoleGuard deny={["super_admin"]}` |
| M3 | `mon-lot.tsx` | Ajouter RoleGuard (member + rôles bureau) |
| M4 | `mon-bail.tsx` | Ajouter `RoleGuard allow={["tenant"]}` |
| M5 | `api-server/src/routes/budget.ts` | Migrer POST/PUT vers `requireFinanceAccess` pour inclure treasurer |
| M6 | `cotisations.tsx` | Lié à C5 — élargir guard après implémentation multi-rôles |
| M7 | `documents.tsx` | Retirer `super_admin` des actions d'écriture |
| M8 | `(tabs)/_layout.tsx` | Ajouter accès Finance (lecture) pour `president` |

### Phase 3 — MINEURS (Hygiene) — Estimé : 1-2 jours

| # | Fichier | Correction |
|---|---------|------------|
| m1 | `abonnements.tsx` | Ajouter RoleGuard formel |
| m2 | `support.tsx` | Ajouter RoleGuard formel avec deny super_admin |
| m3 | `api-server/src/routes/statistics.ts` | Vérifier que syndicateWhere est appliqué systématiquement |
| m4 | `api-server/src/routes/elections.ts` | Ajouter secretary pour archivage mandats |

---

## 10. RECOMMANDATIONS ARCHITECTURALES

### 10.1 Implémenter un RoleGuard systématique sur tous les écrans

Chaque écran devrait commencer par un guard explicite plutôt que s'appuyer uniquement sur le menu. La règle : **le menu cache, le RoleGuard protège.**

```typescript
// Pattern recommandé pour tous les écrans
export default function MyScreen() {
  return (
    <RoleGuard allow={["member", "president", "treasurer"]}>
      {/* contenu */}
    </RoleGuard>
  );
}
```

### 10.2 Créer un helper `hasAnyRole` pour le cumul

```typescript
// context/AuthContext.tsx — à ajouter
const hasAnyRole = (...roles: AllRoles[]) => {
  const userRoles = user?.roles ?? (user?.role ? [user.role] : []);
  return roles.some(r => userRoles.includes(r));
};

// Usage
const canSeeBudget = hasAnyRole("syndicate_admin", "treasurer", "president");
const isPersonalMember = hasAnyRole("member", "president", "treasurer", "secretary", "committee_member");
```

### 10.3 Supervision du Super Admin

Le pattern `?supervision=true` déjà implémenté dans certaines routes est la bonne approche. L'étendre à toutes les routes sensibles finance/documents pour que le Super Admin n'accède aux données syndicat que via ce canal explicitement tracé.

---

## ANNEXE — Légende

| Symbole | Signification |
|---------|---------------|
| ✅ | Conforme à la spécification |
| ❌ | Non conforme — correction requise |
| ⚠️ | Partiellement conforme |
| 🔴 | Sévérité critique |
| 🟡 | Sévérité majeure |
| 🟠 | Sévérité mineure |
| 👁️ | Lecture seule |
| UI | Problème côté interface uniquement |
| API | Problème côté backend uniquement |

---

*Rapport généré le 22 juillet 2026 — SYNDYCAT GLOBAL CPS — Audit RBAC v1.0*
