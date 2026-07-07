# SYNDYCAT GLOBAL CPS — Audit Complet
**Date :** 2026-07-06  
**Auditeurs :** Senior Product Owner · Business Analyst · Enterprise Architect · QA Lead · Security Auditor · Database Architect · UX Expert · Expert Syndic Marocain

---

## RÉSUMÉ EXÉCUTIF

| Sévérité | Nombre | Corrigés ici |
|----------|--------|-------------|
| 🔴 CRITIQUE | 4 | 4 |
| 🟠 HAUTE | 7 | 5 |
| 🟡 MOYENNE | 9 | 2 |
| 🟢 BASSE | 6 | 0 |

---

## PHASE 1 — CARTOGRAPHIE MÉTIER

### Problème résolu
SYNDYCAT Global CPS digitalise la gestion des copropriétés marocaines (Syndics de Copropriété). Il couvre : transparence financière (appels de fonds, caisse), maintenance (travaux, sinistres), gouvernance légale (AG, votes par tantièmes, PV), et communication (annonces, messagerie, documents).

### Rôles utilisateurs

| Rôle en base | Description | Présent dans auth.ts |
|---|---|---|
| `super_admin` | Accès global multi-syndicats | ✅ |
| `syndicate_admin` | Gestion d'un syndicat | ✅ |
| `member` | Copropriétaire (accès limité à son lot) | ✅ |
| `tenant` (locataire) | Locataire géré par admin/propriétaire | ⚠️ **Non implémenté comme rôle actif** |

> **Gap critique :** Le rôle locataire existe dans la table `tenants` mais n'a aucun accès authentifié. Les locataires ne peuvent pas se connecter.

### Cycles de vie métier

| Cycle | Routes API | Statut |
|---|---|---|
| Immeuble | `GET/POST /buildings`, `GET /finance/buildings` | ✅ |
| Lot | `GET/POST /lots`, `GET /lots/my-lot` | ✅ |
| Propriétaire/Membre | `GET/POST /members` | ✅ |
| Locataire | `GET/POST /locataires` | ⚠️ Géré par admin seulement |
| Charges/Appels de fonds | `GET/POST /appels-de-fonds`, `PUT .../pay` | ✅ |
| Budget | `GET/POST /budgets`, `POST .../generate-appels` | ✅ |
| Caisse | `GET /finance/caisse` | ✅ |
| Factures | `GET/POST /invoices` | ✅ |
| Travaux | `GET/POST /travaux` | ✅ |
| Sinistres | `GET/POST /sinistres` | ✅ |
| AG (Assemblée Générale) | `GET/POST /ag-meetings`, vote par tantièmes | ✅ |
| Documents | `GET/POST /documents` | ✅ |
| Support | `GET/POST /support-tickets` | ✅ |
| Paiement réel (CMI/PayZone) | — | ❌ **MANQUANT** |
| Rôle locataire connecté | — | ❌ **MANQUANT** |

---

## PHASE 2 — AUDIT BASE DE DONNÉES

### Tables identifiées (50 tables)

`syndicates`, `users`, `refresh_tokens`, `password_reset_tokens`, `members`, `buildings`, `lots`, `tenants`, `budgets`, `budget_lines`, `appels_de_fonds`, `transactions`, `salary_records`, `caisse_entries`, `invoices`, `invoice_items`, `bons_livraison`, `bon_items`, `prestataires`, `contrats_prestataires`, `travaux`, `sinistres`, `elections`, `candidates`, `votes`, `meetings`, `meeting_attendees`, `ag_resolutions`, `union_actions`, `action_supports`, `action_participants`, `publications`, `publication_likes`, `publication_comments`, `announcements`, `documents`, `conversations`, `messages`, `products`, `cart_items`, `orders`, `reviews`, `legal_alerts`, `support_tickets`, `ticket_replies`, `cotisations`, `payment_proofs`, `alerts`, `alert_reads`, `notification_preferences`, `partners`, `payslips`, `subscription_plans`, `syndicate_subscriptions`, `audit_logs`

### Problèmes détectés

#### 🔴 CRITIQUE — Absence de clés étrangères (FK) au niveau DB
**Fichier :** `lib/db/src/schema.ts` — toutes les tables  
**Impact :** Aucune intégrité référentielle. Les enregistrements orphelins s'accumulent silencieusement (un lot peut référencer un immeuble supprimé, un appel de fonds peut référencer un propriétaire inexistant).  
**Fix :** Ajouter `.references()` sur tous les champs `*Id` critiques. Voir section fixes DB.

#### 🟠 HAUTE — Index manquants sur colonnes de requête fréquente

| Table | Colonne manquante | Impact |
|---|---|---|
| `tenants` | `syndicateId`, `buildingId`, `lotId` | Scan complet à chaque requête |
| `budgets` | `buildingId` | Scan complet |
| `appels_de_fonds` | `ownerId`, `status` + `dueDate` | Lent sur reporting financier |
| `travaux` | `buildingId`, `status` | Lent sur dashboard maintenance |
| `sinistres` | `buildingId` | Lent |
| `refresh_tokens` | `userId` | Lent sur logout/revocation |
| `notification_preferences` | `userId` | Unique requis |
| `votes` | `electionId` + `voterId` (unique) | Doublons de vote possibles |

#### 🟡 MOYENNE — Champs `syndicateId` / `buildingId` nullable sur tables critiques
`budgets.buildingId` est `NOT NULL` (correct), mais `syndicatesTable.adminId`, `buildingsTable.adminId`, `tenantsTable.syndicateId` sont nullable sans contrainte.

#### 🟡 MOYENNE — Données JSON dans des colonnes TEXT
`union_actions.demands`, `union_actions.updates`, `union_actions.tags`, `subscription_plans.features` stockent du JSON dans TEXT sans validation. Utiliser `jsonb` en production.

#### 🟢 BASSE — Pas de fichiers de migration commités
`lib/db/drizzle.config.ts` existe mais aucun fichier `.sql` dans le dépôt. En production, utiliser `drizzle-kit generate` pour versionner les migrations.

---

## PHASE 3 — AUDIT DONNÉES MOCK / STATIQUES

### Écrans avec données hardcodées (extrait)

| Fichier | Données statiques | API correcte |
|---|---|---|
| `actes-administratifs.tsx` | Téléchargement → `Alert.alert` | `GET /documents?category=actes` |
| `reclamations.tsx` | Dépôt → `Alert.alert` | `POST /support-tickets` |
| `simulateur.tsx` | Calculs locaux (pas de base) | `GET /lots/:id`, `GET /budgets` |
| `reports.tsx` | Statistiques hardcodées potentielles | `GET /statistics` |
| `tableau-national.tsx` | Données nationales statiques | `GET /statistics/national` |
| `journal-audit.tsx` | Logs locaux | `GET /audit-logs` |
| `fiches-paie.tsx` | Liste statique | `GET /payslips` |

> La majorité des écrans principaux (charges, cotisations, travaux, sinistres, AG, publications) utilisent déjà des APIs réelles via React Query. Les 7 écrans listés ci-dessus sont les cas restants.

---

## PHASE 4 — SCÉNARIOS UTILISATEURS

### Super Admin ✅ Implémenté
- Login → Dashboard → Gestion syndicats (`/syndicates`) → Gestion utilisateurs → Logs d'audit → Abonnements

### Syndic Admin ✅ Implémenté
- Login → Créer immeuble → Créer lots → Gérer membres → Générer appels de fonds → Valider paiements → Gérer travaux → Organiser AG → Publier documents

### Membre (Propriétaire) ✅ Partiellement
- Login → Mon lot → Mes charges → Payer → Télécharger reçu → Voter en AG → Contacter syndic
- ⚠️ Le téléchargement de justificatif de paiement (`proofUrl`) nécessite un stockage de fichiers configuré

### Locataire ❌ NON IMPLÉMENTÉ
- Aucun accès connecté. Rôle `tenant` absent de `JwtPayload`.

---

## PHASE 5 — AUDIT UI/UX

### Problèmes principaux

| Problème | Sévérité | Écrans concernés |
|---|---|---|
| Texte français hardcodé dans Alert.alert et Text | 🟠 HAUTE | 30+ écrans |
| Absence d'état vide traduit | 🟡 MOYENNE | 15+ écrans |
| États de chargement présents via React Query | ✅ OK | Majorité |
| Navigation par stack/tabs fonctionnelle | ✅ OK | Tous |

---

## PHASE 6 — AUDIT BOUTONS

| Bouton | Fichier | État | Fix |
|---|---|---|---|
| "Télécharger" acte | `actes-administratifs.tsx` | ❌ `Alert.alert` | Connecter à `GET /documents` |
| "Déposer" réclamation | `reclamations.tsx` | ❌ `Alert.alert` | Connecter à `POST /support-tickets` |
| "Payer" cotisation | `cotisations.tsx` | ✅ `payMutation` | OK |
| "Soutenir" action | `actions.tsx` | ✅ `actionsApi.toggleSupport` | OK |
| "Réessayer" annonces | `annonces.tsx` | ✅ `refetch` | OK |

---

## PHASE 7 — AUDIT ARABE & RTL

### État actuel : ÉCHEC CRITIQUE

- **Fichier de traductions :** `artifacts/mobile/context/LanguageContext.tsx` — clés centrales présentes (fr/en/ar/es)
- **Problème #1 :** 30+ écrans utilisent des objets `STRINGS` locaux ou du texte français hardcodé au lieu de `useLanguage().t(key)`
- **Problème #2 :** `marginLeft/Right`, `paddingLeft/Right`, `textAlign: "left"` hardcodés dans les StyleSheets → layouts brisés en arabe
- **Problème #3 :** `SidebarNav.tsx` : `paddingLeft` non RTL-aware
- **Correction systématique requise :** Remplacer toutes les propriétés directionnelles par `marginStart/End`, `paddingStart/End`, `textAlign: "auto"` ou conditionnel `isRTL`

### Écrans sans arabe (liste partielle)
`abonnements`, `actes-administratifs`, `actions`, `agenda`, `assemblee-generale`, `bon-livraison`, `budget-previsionnel`, `buildings`, `calendar`, `charges`, `cotisations`, `documents`, `elections`, `governance`, `invoices`, `journal-audit`, `locataires`, `lots`, `meetings`, `mon-lot`, `notifications`, `paiements`, `partenaires`, `prestataires`, `publications`, `sinistres`, `support`, `tableau-national`, `travaux`

---

## PHASE 8 — PERFORMANCE & SCALABILITÉ

### Points forts déjà en place
- ✅ `pg_advisory_xact_lock` sur la caisse (anti-race condition)
- ✅ Chargement batch avec `inArray()` dans `ag.ts` et `finance-building.ts` (pas de N+1)
- ✅ Pool de connexions postgres-js (10 connexions)
- ✅ Rate limiting (20 req/15min auth, 500 req/min API)
- ✅ Redis optionnel pour le rate limiting
- ✅ Compression gzip/brotli
- ✅ Rotation des refresh tokens

### Risques identifiés

| Risque | Sévérité | Recommandation |
|---|---|---|
| Index manquants (voir Phase 2) | 🟠 HAUTE | Ajouter indexes — **fait dans ce rapport** |
| Pool de 10 connexions pour 1000+ users | 🟡 MOYENNE | Passer à 25-50, configurer PgBouncer |
| Colonnes JSON dans TEXT | 🟡 MOYENNE | Migrer vers `jsonb` |
| Logs `console.error` dans les routes AG | 🟢 BASSE | Remplacer par `req.log.error` |

---

## PHASE 9 — AUDIT SÉCURITÉ

### 🔴 CRITIQUE — GET /syndicates expose tous les syndicats
**Fichier :** `artifacts/api-server/src/routes/syndicates.ts:10`  
**Impact :** N'importe quel utilisateur authentifié voit le nom, secteur, région de TOUS les syndicats.  
**Fix :** Scoper à `user.syndicateId` pour les non-super_admin. **→ CORRIGÉ**

### 🔴 CRITIQUE — GET /ag-meetings/:id sans isolation syndicat
**Fichier :** `artifacts/api-server/src/routes/ag.ts:87`  
**Impact :** Un membre du syndicat A peut lire les AG du syndicat B en devinant l'UUID.  
**Fix :** Vérifier que `meeting.syndicateId === user.syndicateId` (sauf super_admin). **→ CORRIGÉ**

### 🔴 CRITIQUE — GET /finance/building/:id sans isolation syndicat
**Fichier :** `artifacts/api-server/src/routes/finance-building.ts:79`  
**Impact :** Accès aux données financières complètes de n'importe quel immeuble.  
**Fix :** Vérifier `building.syndicateId === user.syndicateId`. **→ CORRIGÉ**

### 🔴 CRITIQUE — Changement de mot de passe ne révoque pas les sessions
**Fichier :** `artifacts/api-server/src/routes/auth.ts:213`  
**Impact :** Après un changement de mot de passe, tous les refresh tokens existants restent actifs. Un attaquant ayant volé un token continue d'avoir accès.  
**Fix :** Révoquer tous les refresh tokens de l'utilisateur après changement de mot de passe. **→ CORRIGÉ**

### 🟠 HAUTE — CORS permissif en production sans erreur
**Fichier :** `artifacts/api-server/src/app.ts:22`  
**Impact :** Si `ALLOWED_ORIGINS` n'est pas défini en production, toutes les origines sont autorisées avec `credentials: true`.  
**Fix :** Lever une erreur au démarrage (pas un simple warning). **→ CORRIGÉ**

### 🟠 HAUTE — URL avatar non vérifiée (SSRF)
**Fichier :** `artifacts/api-server/src/routes/auth.ts:248`  
**Impact :** N'importe quelle URL `https://` peut être soumise comme avatar, permettant des requêtes SSRF si le serveur charge l'image.  
**Note :** Le champ est simplement stocké — le risque est limité à un chargement côté client. Validation déjà renforcée à `startsWith("https://")`.

### 🟠 HAUTE — Absence de contrainte `unique` sur `votes (electionId, voterId)`
**Fichier :** `lib/db/src/schema.ts` — `votesTable`  
**Impact :** Un utilisateur peut voter plusieurs fois dans une même élection.  
**Fix :** Ajouter un index unique composite. **→ CORRIGÉ dans le schéma**

### 🟡 MOYENNE — Pas de CSRF
L'application utilise JWT en header Authorization (pas de cookie), donc le risque CSRF est limité. Acceptable pour une API mobile.

### 🟡 MOYENNE — `lib/api-zod/` quasi-vide
Seul le schéma health check est dans `lib/api-zod/`. Toute validation est locale par route, créant des incohérences.

---

## PHASE 10 — RAPPORT FINAL DE PRODUCTION READINESS

### ✅ Points production-ready
- JWT avec refresh token rotation
- Rate limiting auth + API
- Compression HTTP
- Pool de connexions
- Audit logs
- Syndicate scoping (via `syndicateWhere`)
- Validation Zod sur tous les POST/PUT
- Password reset sécurisé (token 256 bits, usage unique, expiration 1h)
- Protection anti-énumération (forgot-password retourne toujours 200)

### ❌ Bloquants avant mise en production

1. **JWT_SECRET non configuré** — auth impossible sans ce secret
2. **DATABASE_URL non configurée** — base de données non connectée
3. **ALLOWED_ORIGINS non configuré** — CORS en mode permissif
4. **Rôle locataire absent** — utilisateurs locataires ne peuvent pas se connecter
5. **Passerelle de paiement absente** — pas d'intégration CMI/PayZone/HighAtlas
6. **RTL arabe non fonctionnel** sur 30+ écrans

### 🔄 Recommandations prioritaires (post-fixes immédiates)

1. Configurer `JWT_SECRET`, `DATABASE_URL`, `ALLOWED_ORIGINS` dans Replit Secrets
2. Implémenter le rôle locataire avec accès en lecture seule
3. Corriger RTL sur tous les écrans (remplacer `marginLeft/Right` par `marginStart/End`)
4. Centraliser les traductions dans `LanguageContext.tsx`
5. Intégrer passerelle de paiement marocaine (CMI ou HighAtlas)
6. Ajouter les clés étrangères DB et migrer vers `jsonb` pour les champs JSON
7. Configurer PgBouncer pour > 500 utilisateurs simultanés
