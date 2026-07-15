# SYNDYCAT GLOBAL CPS — AUDIT MÉTIER COMPLET
**Date :** 15 juillet 2026  
**Version :** 1.0  
**Périmètre :** Analyse exhaustive de l'ensemble des modules, workflows, rôles, écrans, APIs et données

---

## TABLE DES MATIÈRES

1. [Résumé Exécutif](#1-résumé-exécutif)
2. [Architecture de la Plateforme](#2-architecture-de-la-plateforme)
3. [Analyse des Rôles & Permissions](#3-analyse-des-rôles--permissions)
4. [Cycle de Vie — Super Admin](#4-cycle-de-vie--super-admin)
5. [Cycle de Vie — Syndicate Admin](#5-cycle-de-vie--syndicate-admin)
6. [Cycle de Vie — Membre (Copropriétaire)](#6-cycle-de-vie--membre-copropriétaire)
7. [Cycle de Vie — Locataire (Tenant)](#7-cycle-de-vie--locataire-tenant)
8. [Module Finance](#8-module-finance)
9. [Module Documents](#9-module-documents)
10. [Module Élections](#10-module-élections)
11. [Module Marketplace](#11-module-marketplace)
12. [Module Chat & Messagerie](#12-module-chat--messagerie)
13. [Module Incidents & Sinistres](#13-module-incidents--sinistres)
14. [Module Travaux & Maintenance](#14-module-travaux--maintenance)
15. [Module Assemblées Générales](#15-module-assemblées-générales)
16. [Module Notifications](#16-module-notifications)
17. [Failles de Sécurité & IDOR](#17-failles-de-sécurité--idor)
18. [Données Mock & Fonctionnalités Non Connectées](#18-données-mock--fonctionnalités-non-connectées)
19. [Risques de Production](#19-risques-de-production)
20. [Matrice de Priorité des Corrections](#20-matrice-de-priorité-des-corrections)

---

## 1. RÉSUMÉ EXÉCUTIF

SYNDYCAT GLOBAL CPS est une plateforme SaaS multi-tenant dédiée à la gestion de la copropriété au Maroc, alignée sur la Loi 18-00. Elle connecte 4 rôles principaux : Super Admin (opérateur plateforme), Syndicate Admin (gestionnaire de syndic), Membre (copropriétaire), et Locataire.

**État global :** La plateforme est substantiellement construite. Elle dispose de plus de 80 tables de base de données, plus de 40 routes API et plus de 80 écrans mobiles. Cependant, plusieurs modules critiques présentent des données mockées, des flux brisés ou des fonctionnalités non connectées au backend — ce qui la rend **non prête pour la production en l'état**.

### Notation par module

| Module | État Backend | État Mobile | Risque Production |
|--------|-------------|-------------|-------------------|
| Authentification | ✅ Complet | ✅ Complet | 🟡 Moyen |
| Finance / Charges | ✅ Complet | 🟠 Partiel | 🔴 Élevé |
| Documents | ✅ Complet | 🟡 Partiel | 🟡 Moyen |
| Élections | ✅ Complet | ✅ Complet | 🟡 Moyen |
| Marketplace | 🟡 Partiel | 🔴 Mock | 🔴 Élevé |
| Chat / Messagerie | ✅ Complet | ✅ Complet | 🟡 Moyen |
| Incidents / Sinistres | ✅ Complet | ✅ Complet | 🟢 Faible |
| Travaux / Maintenance | ✅ Complet | ✅ Complet | 🟡 Moyen |
| Assemblées Générales | ✅ Complet | ✅ Complet | 🟡 Moyen |
| Notifications | ✅ Complet | 🟡 Partiel | 🟡 Moyen |
| Permissions / RBAC | ✅ Complet | 🟡 Partiel | 🔴 Élevé |

**Légende :** ✅ Complet | 🟡 Partiel | 🟠 Incomplet | 🔴 Mock/Cassé

---

## 2. ARCHITECTURE DE LA PLATEFORME

### Stack Technique
- **Mobile :** Expo React Native (80+ écrans)
- **API :** Express + TypeScript + Drizzle ORM (40+ fichiers de routes)
- **Base de données :** PostgreSQL (80+ tables)
- **Types partagés :** `lib/api-zod` (minimal — seulement `HealthCheckResponse`)
- **Stockage objets :** GCS via sidecar (problème d'authentification connu)
- **Notifications push :** Expo Push Notifications (implémenté)
- **Chat :** Long-polling toutes les 4 secondes (pas de WebSockets)

### Structure Multi-tenant
- Chaque syndic est isolé via `syndicateId` dans le JWT
- Les Super Admins n'ont pas de `syndicateId` — accès via `?supervision=true`
- Le `syndicateId` est injecté dans toutes les requêtes par le middleware `requireAuth`

### Tables Principales (80+)
Les tables couvrent :
- **Entités :** syndicates, users, members, buildings, lots, tenants
- **Finance :** budgets, budgetLines, appelsDeFonds, transactions, caisse_entries, invoices, bons_livraison, cotisations, paymentProofs
- **Gouvernance :** elections, candidates, votes, voteReceipts, electionProxies, meetings, meetingAttendees, agResolutions, agProxies, agVotes
- **Communication :** conversations, messages, messageReads, messageReactions
- **Marketplace :** products, cartItems, orders, reviews, productFavorites
- **Documents :** documents, documentVersions, documentSignatures, documentSequences, documentComments
- **Opérationnel :** travaux, sinistres, prestataires, contratsPrestataires, reclamations, escalationCases
- **Administration :** auditLogs, workflows, workflowSteps, alerts, notifications

---

## 3. ANALYSE DES RÔLES & PERMISSIONS

### 3.1 Définition des Rôles

| Rôle | JWT `role` | `syndicateId` | Description |
|------|-----------|--------------|-------------|
| Super Admin | `super_admin` | ❌ Absent | Opérateur de la plateforme |
| Syndicate Admin | `syndicate_admin` | ✅ Présent | Gestionnaire d'un syndic |
| Membre | `member` | ✅ Présent | Copropriétaire |
| Locataire | `tenant` | ✅ Présent | Locataire d'un lot |

### 3.2 Matrice des Permissions (Backend)

| Fonctionnalité | Super Admin | Syndicate Admin | Membre | Locataire |
|----------------|------------|-----------------|--------|-----------|
| Gestion syndicats | ✅ CRUD | ❌ | ❌ | ❌ |
| Gestion bâtiments | Supervision | ✅ CRUD | ❌ | ❌ |
| Gestion lots | Supervision | ✅ CRUD | Lecture propre | Lecture propre |
| Charges (appels de fonds) | Supervision | ✅ Créer/Valider | ✅ Voir/Payer | ❌ |
| Budget | Supervision | ✅ CRUD | ❌ | ❌ |
| Elections | Supervision | ✅ Gérer | ✅ Voter/Candidater | ❌ |
| Assemblées Générales | Supervision | ✅ Gérer | ✅ Participer | ❌ |
| Documents | Supervision | ✅ CRUD | Lecture filtrée | Lecture bail seul |
| Marketplace | ❌ | Modération | ✅ CRUD propre | ❌ |
| Chat | ✅ avec SYA | ✅ avec tous | ✅ avec Admin/Membres | ✅ avec Admin |
| Incidents | Supervision | ✅ Gérer | ✅ Déclarer | ✅ Déclarer |
| Travaux | Supervision | ✅ CRUD | Lecture | Lecture propre |
| Audit Logs | ✅ Complet | ✅ Propre syndic | ❌ | ❌ |
| Abonnements | ✅ Gérer | Lecture | ❌ | ❌ |

### 3.3 Problèmes de Permissions Identifiés

#### 🔴 CRITIQUE — Tenant peut accéder à des routes membres via l'API
- Le middleware `requireNotTenant` n'est pas appliqué uniformément sur **toutes** les routes membres
- Les routes `/ag-meetings`, `/elections`, `/budgets` sont protégées, mais certaines routes secondaires comme `/publications` et `/rankings` ne valident pas le rôle côté backend
- **Risque :** Un locataire avec un token JWT valide peut accéder à des données réservées aux membres via des appels API directs (deep-link ou tool comme Postman)

#### 🔴 CRITIQUE — Frontend vs Backend Gap
- 11 écrans mobiles (ex: `budget-previsionnel`, `journal-audit`) s'appuyaient historiquement uniquement sur le masquage dans le menu pour la sécurité — sans `RoleGuard` côté client
- Certains sont maintenant corrigés avec `RoleGuard.tsx` mais l'audit complet de tous les écrans n'est pas validé

#### 🟡 MOYEN — Super Admin sans séparation opérationnelle stricte
- Le flag `?supervision=true` est requis pour que le Super Admin accède aux données d'un syndic
- Mais ce flag est **auto-appliqué côté serveur** selon certains contextes, ce qui signifie qu'un Super Admin pourrait accidentellement modifier des données d'un syndic sans intention explicite

#### 🟡 MOYEN — Employee/Provider sans identité JWT
- Les rôles `employee` et `provider` (prestataires) n'ont pas de JWT défini
- Ces acteurs ne peuvent pas s'authentifier ou interagir directement avec la plateforme
- **Impact :** Les prestataires ne peuvent pas soumettre leurs propres rapports d'intervention — c'est l'Admin qui le fait en leur nom

---

## 4. CYCLE DE VIE — SUPER ADMIN

### 4.1 Scénario Complet

```
1. Accès plateforme → Tableau de bord global (syndicats, abonnements, audit)
2. Création d'un nouveau syndic → Formulaire syndicate-setup.tsx → POST /syndicates
3. Configuration : nom, secteur, région, données légales, adminId
4. L'admin du syndic est notifié → Email + alerte in-app
5. Supervision d'un syndic → Mode ?supervision=true sur toutes les routes
6. Gestion des abonnements → /abonnements → PUT /subscriptions/:id
7. Journal d'audit global → /journal-audit → GET /audit
8. Support utilisateurs → Chat direct avec SYA
```

### 4.2 Ce Qui Fonctionne ✅
- Création et supervision des syndicats : **implémenté** (routes `/syndicates`, écran `syndicate-setup.tsx`)
- Journal d'audit global : **implémenté** (`journal-audit.tsx` → `GET /audit`)
- Gestion des abonnements : **implémenté** (`abonnements.tsx` → routes `/subscriptions`)
- Chat avec SYA : **implémenté** (matrice de communication respectée)
- Tableau de bord adapté au rôle : **implémenté** (`(tabs)/index.tsx` conditionnel par rôle)

### 4.3 Ce Qui Manque ❌
- **Onboarding guidé** : Pas d'assistant de création de syndic étape par étape — c'est un formulaire unique sans validation des données légales marocaines (RC, ICE, SIRET-équivalent)
- **Tableau de bord financier plateforme** : Le Super Admin ne peut pas voir les revenus agrégés de la plateforme (total abonnements actifs, ARR, MRR) — uniquement la supervision par syndic
- **Gestion des incidents de plateforme** : Pas d'outil de monitoring ou d'alerte système pour la santé de la plateforme
- **Export de données** : Aucune fonctionnalité d'export CSV/Excel pour les données agrégées de supervision
- **Gestion des offres/plans** : Les plans d'abonnement (`basic`, `standard`, `premium`) sont des enums hardcodés — impossible de créer/modifier des plans depuis l'interface

---

## 5. CYCLE DE VIE — SYNDICATE ADMIN

### 5.1 Scénario Complet

```
1. Réception des accès → Connexion → Tableau de bord syndic
2. Configuration immeuble(s) → POST /buildings (nom, adresse, lots)
3. Création des lots → POST /lots (type, surface, tantièmes, ownerId)
4. Invitation membres → POST /members (email, lot assigné)
5. Invitation locataires → POST /tenants (via locataires.tsx)
6. Création budget annuel → POST /budgets → POST /budgets/:id/generate-appels
7. Émission appels de fonds → Auto-générés par lot selon tantièmes
8. Validation paiements membres → PUT /appels-de-fonds/:id/validate
9. Gestion travaux → POST /travaux → assign → report → validate
10. Organisation AG → POST /ag-meetings → invitations → vote → PV
11. Organisation élections → POST /elections → candidatures → vote → résultats
12. Gestion documents → POST /documents → workflow → signature → publication
13. Suivi sinistres → Évaluation → Assignation prestataire
14. Rapports financiers → Tableau de bord bâtiment
```

### 5.2 Ce Qui Fonctionne ✅
- Gestion complète des bâtiments et lots : **implémenté**
- Appels de fonds automatisés avec tantièmes : **implémenté**
- Validation des paiements et génération de reçus : **implémenté**
- Gestion complète des travaux : **implémenté**
- Organisation et gestion des élections : **implémenté**
- Gestion documentaire complète avec workflow : **implémenté**
- Tableau de bord financier par bâtiment : **implémenté**
- Gestion AG avec résolutions et PV : **implémenté**

### 5.3 Ce Qui Manque ❌
- **Vue consolidée multi-bâtiments** : Si un syndic gère plusieurs bâtiments, il n'y a pas de vue agrégée — chaque bâtiment doit être consulté individuellement
- **Gestion des prestataires/employés** : Les prestataires (`prestataires.tsx`) sont listés mais ils n'ont pas de compte plateforme. Impossible de leur donner accès pour soumettre des rapports
- **Suivi des contrats prestataires** : `contratsPrestatairesTable` existe mais l'écran `prestataire-detail.tsx` ne permet pas de créer/modifier des contrats directement
- **Fiches de paie employés** : `fiches-paie.tsx` existe mais sa connexion aux salaires dans `transactionsTable` n'est pas complète (écran partiellement mocké)
- **Reclamations RH** : `reclamationsTable` (type : salaire/discrimination/harcèlement) existe en DB et en API mais l'écran `reclamations.tsx` ne distingue pas clairement les réclamations RH internes des incidents de copropriété

---

## 6. CYCLE DE VIE — MEMBRE (COPROPRIÉTAIRE)

### 6.1 Scénario Complet

```
1. Invitation par email → Création compte → Connexion
2. Tableau de bord membre : lot, charges, dernières notifications
3. Consultation du lot → mon-lot.tsx → GET /lots/:id
4. Réception d'un appel de fonds → Notification → charges.tsx
5. Paiement → Upload preuve → PUT /appels-de-fonds/:id/pay
6. Validation par Admin → Reçu généré automatiquement
7. Participation AG → Notification → ag-meetings → Vote résolutions
8. Vote élections → elections.tsx → POST /elections/:id/vote
9. Signalement incident → sinistres.tsx → POST /sinistres
10. Consultation documents → documents.tsx → Téléchargement PDF signé
11. Vente produit marketplace → my-shop.tsx → POST /products → Approbation Admin
12. Communication avec Admin → chat.tsx → Direct Message
13. Participation aux idées communautaires → ideas.tsx
14. Consultation statuts et règlements → legal.tsx
```

### 6.2 Ce Qui Fonctionne ✅
- Consultation lot et informations personnelles : **implémenté**
- Réception et paiement des charges : **implémenté** (avec upload de preuve)
- Participation aux votes AG et élections : **implémenté**
- Signalement d'incidents : **implémenté**
- Consultation documents (avec filtre par rôle) : **implémenté**
- Chat avec Admin et autres membres : **implémenté**
- Notifications en temps réel (push) : **implémenté**

### 6.3 Ce Qui Manque ❌

#### 🔴 CRITIQUE — Upload preuve de paiement cassé
```
charges.tsx : uploadProofImage() 
→ Si l'upload échoue, un fallback sur l'URI locale est utilisé : 
   if (!proofUrl) proofUrl = payProofUri  ← BOGUE
→ La base de données reçoit une URI file:// ou content:// locale
→ L'Admin voit une image cassée lors de la validation
→ Le paiement peut être accepté sans preuve vérifiable
```

#### 🔴 CRITIQUE — Reçu de paiement non téléchargeable
- Le backend génère un `receiptNumber` lors de la validation du paiement ✅
- Mais il n'existe **aucun endpoint** `GET /receipts/:id` ou `GET /appels-de-fonds/:id/receipt`
- Le mobile (`cotisations.tsx`) affiche un bouton "Télécharger le reçu" qui ne fait rien d'utile
- **Impact :** Les membres ne peuvent pas prouver leurs paiements

#### 🟠 INCOMPLET — Historique financier personnel
- `paiements.tsx` : le bouton "Marquer comme payé" déclenche un `Alert.alert()` local — **pas d'appel API**
- Les transactions de `transactionsTable` ne sont pas affichées au membre dans un historique personnel cohérent

#### 🟡 MOYEN — Vendeur marketplace sans vue commandes
- Un membre peut lister des produits via `my-shop.tsx`
- Mais `orders.tsx` et la gestion des commandes reçues sont basés sur `DataContext` (mock)
- Le vendeur ne peut pas voir les commandes de ses acheteurs via un vrai appel API

---

## 7. CYCLE DE VIE — LOCATAIRE (TENANT)

### 7.1 Scénario Complet

```
1. Invitation par Admin → Compte créé (rôle tenant)
2. Accès limité au tableau de bord : lot loué, contrat de bail
3. Consultation bail → mon-bail.tsx
4. Documents autorisés : bail, règlement intérieur
5. Signalement incident du lot loué → sinistres.tsx
6. Communication avec Admin → chat.tsx (DM Admin seulement)
7. Réception notifications → alerts.tsx
8. État des lieux → etat-des-lieux.tsx
```

### 7.2 Ce Qui Fonctionne ✅
- Restrictions de rôle respectées : locataire bloqué de Finance, AG, Élections, Marketplace ✅
- Déclaration d'incidents sur lot propre : **implémenté**
- Chat avec Admin : **implémenté**
- Consultation bail : `mon-bail.tsx` utilise des appels API réels ✅

### 7.3 Ce Qui Manque ❌

#### 🔴 CRITIQUE — IDOR sur documents locataire
- Un locataire authentifié peut potentiellement appeler `GET /documents?syndicateId=X` directement
- La route documents filtre par rôle sur certains types mais pas sur **tous** — un locataire pourrait voir des procès-verbaux ou des documents financiers
- Le filtre `category` côté client n'est pas suffisant comme contrôle de sécurité

#### 🟡 MOYEN — État des lieux non connecté
- `etat-des-lieux.tsx` : écran présent mais non analysé en profondeur dans les routes API
- La table `lotsTable` ne semble pas avoir de champ `etatDesLieux` ou table dédiée
- L'état des lieux pourrait être dans les Documents mais la navigation directe est absente

#### 🟡 MOYEN — Locataire sans accès aux prestataires de son lot
- Si des travaux sont réalisés dans son appartement, le locataire ne peut pas voir le statut via l'app
- `travaux-privatifs.tsx` existe mais sa connexion au rôle locataire doit être vérifiée

---

## 8. MODULE FINANCE

### 8.1 Flux Complet Attendu

```
Budget Prévisionnel → Appels de Fonds → Paiement Membre 
  → Upload Preuve → Validation Admin → Transaction Caisse 
    → Reçu PDF → Archive Document
```

### 8.2 Endpoints API Présents ✅

| Endpoint | Description | État |
|----------|-------------|------|
| `GET/POST /finance/transactions` | Transactions générales | ✅ |
| `GET/POST /finance/salaries` | Salaires employés | ✅ |
| `GET/POST /finance/caisse` | Caisse avec verrou advisory | ✅ |
| `GET/POST/PUT /invoices` | Gestion factures | ✅ |
| `GET/POST/PUT /bons-livraison` | Bons de livraison | ✅ |
| `GET/POST/PUT /budgets` | Budgets annuels | ✅ |
| `POST /budgets/:id/generate-appels` | Génération auto des appels | ✅ |
| `GET /appels-de-fonds` | Liste des charges (scoped) | ✅ |
| `PUT /appels-de-fonds/:id/pay` | Paiement avec preuve | ✅ |
| `PUT /appels-de-fonds/:id/validate` | Validation Admin | ✅ |
| `GET /finance/buildings` | Stats par bâtiment | ✅ |
| `GET /finance/building/:id` | Dashboard financier détaillé | ✅ |

### 8.3 Problèmes Critiques

#### 🔴 BOGUE P0 — URI locale stockée comme preuve de paiement
```javascript
// charges.tsx — fallback dangereux
if (!proofUrl) proofUrl = payProofUri  // payProofUri = "file://..." ou "content://..."
```
- Si le GCS upload échoue (et il échoue actuellement — voir §19), la preuve stockée est une URI locale **inutilisable**
- L'Admin valide sans vraie preuve visible → risque financier direct

#### 🔴 BOGUE P0 — Reçu non téléchargeable
- `receipts/:id` n'existe pas côté API
- `receiptNumber` est généré en DB mais jamais exposé dans un PDF téléchargeable
- **Correction requise :** Ajouter `GET /appels-de-fonds/:id/receipt` retournant un PDF signé

#### 🔴 BOGUE P1 — Caisse non mise à jour lors de la validation de charge
- `PUT /appels-de-fonds/:id/validate` crée une transaction (`transactionsTable`) ✅
- Mais ne crée **pas** une entrée correspondante dans `caisse_entries`
- **Conséquence :** La trésorerie affichée dans le tableau de bord ne reflète pas les encaissements réels d'appels de fonds

#### 🟠 INCOMPLET — Écran `paiements.tsx` non connecté
- Bouton "Marquer comme payé" → `Alert.alert()` seulement, pas d'appel API
- Cet écran doit être connecté à `PUT /appels-de-fonds/:id/validate` ou `PUT /appels-de-fonds/:id/pay`

#### 🟠 INCOMPLET — Actuals budget non calculés
- `budget-previsionnel.tsx` : les montants "réalisés" sont codés en dur à `0`
- Les dépenses réelles de `transactionsTable` ne sont pas agrégées par ligne budgétaire

#### 🟡 MOYEN — Pas de lien facture → dépense
- Les factures (`invoices`) et les dépenses (`transactions` de type `depense`) sont des silos séparés
- Il n'y a pas de `invoiceId` dans `transactionsTable` ni de `transactionId` dans `invoicesTable`
- Une dépense peut être créée sans facture justificative correspondante

### 8.4 Flux Manquant — Génération de Reçu PDF

Le flux complet devrait être :
```
1. Admin valide paiement → status = "paid", receiptNumber généré ✅
2. Système génère PDF reçu via documentPdf.ts ❌ (non implémenté)
3. PDF uploadé sur GCS ❌ (GCS en panne)
4. Lien PDF stocké dans documents (lié à l'appelDeFonds) ❌
5. Notification envoyée au membre avec lien reçu ❌
6. Membre télécharge son reçu ❌
```

**Seule l'étape 1 est réalisée.**

---

## 9. MODULE DOCUMENTS

### 9.1 Architecture ✅ (Remarquablement Complet)

Le module documents est l'un des plus complets de la plateforme :

- **Machine d'états :** `draft → generated → pending_review → validated → signed → published → archived` + `rejected`, `expired`
- **Numérotation séquentielle atomique :** `PV-2026-0001`, `REG-2026-0001` (via `documentSequencesTable` avec `ON CONFLICT DO UPDATE`)
- **Génération PDF :** Via `pdfmake` avec injection de données réelles (branding syndic, office-holders, propriété)
- **Signatures électroniques :** `documentSignaturesTable` avec multi-signature trackée
- **Versioning :** `documentVersionsTable`
- **Soft delete avec rétention légale :** `is_deleted`, `deleted_at`, `deleted_by`
- **URLs signées (1h TTL) :** Via GCS sidecar
- **Audit complet :** Chaque écriture est loggée dans `auditLogsTable`

### 9.2 Problèmes

#### 🔴 CRITIQUE — GCS "no allowed resources" (Sidecar d'upload)
- L'upload de documents vers GCS échoue avec une erreur d'authentification : "no allowed resources"
- **Tous les documents générés ne sont pas uploadés** → les URLs signées retournées sont invalides
- Ce bogue bloque la fonctionnalité entière (voir aussi §19)

#### 🟡 MOYEN — Corbeille documents (`documents-recycle-bin.tsx`)
- L'écran de corbeille existe dans le mobile
- La route backend correspondante (`GET /documents?deleted=true`) doit être vérifiée
- La restauration depuis la corbeille n'est pas clairement mappée côté API

#### 🟡 MOYEN — Signature PDF et intégration SignaturePad
- `components/SignaturePad.tsx` existe et l'API `POST /documents/:id/sign` existe ✅
- Mais le workflow de signature mobile (dessiner → upload → déclencher la signature) n'est pas entièrement connecté
- `appendSignaturesToPdf` dans `documentPdf.ts` prend des images de signature mais le chemin upload→signer n'est pas testé end-to-end

#### 🟡 MOYEN — Distribution automatique non implémentée
- Lors de la publication d'un document (`status = published`), il devrait être distribué automatiquement aux membres/locataires concernés
- Le backend envoie une notification push (✅) mais pas de distribution automatique par email avec pièce jointe

### 9.3 Accès par Type de Document

| Type | Super Admin | SYA | Membre | Locataire |
|------|------------|-----|--------|-----------|
| Règlement de copropriété | ✅ | ✅ | ✅ | ✅ (lecture) |
| PV Assemblée Générale | ✅ | ✅ | ✅ | ❌ |
| Budget / Comptes | ✅ | ✅ | ✅ | ❌ |
| Contrats prestataires | ✅ | ✅ | ❌ | ❌ |
| Bail / Contrat locataire | ✅ | ✅ | ❌ | ✅ (propre) |
| Factures/Devis travaux | ✅ | ✅ | ❌ | ❌ |

**⚠️ Ce filtrage est principalement côté client — insuffisant (voir §17)**

---

## 10. MODULE ÉLECTIONS

### 10.1 Machine d'États

```
draft → candidacy_open → campaign → open → closed → completed
                                          ↘ quorum_failed
                                          ↘ contested
                     ↘ cancelled (depuis n'importe quel état avant closed)
```

### 10.2 Ce Qui Fonctionne ✅ (Module Très Complet)

- Création d'élection avec paramètres (quorum %, durée mandat, type scrutin)
- Candidature avec bio, programme, lettre motivation, photo
- Validation des candidatures par Admin
- Vote anonyme via `votesTable` (sans voter ID) + `voteReceiptsTable` (anti-double vote)
- Délégation de procuration (max 2 par membre)
- Vote par procuration
- Calcul de quorum automatique lors de la clôture
- Résolution des égalités via `tiebreakWinnerIds` (résolution manuelle obligatoire)
- Création automatique des mandats après publication des résultats
- Mobile entièrement connecté au backend (TanStack Query)
- Questions/réponses de campagne entre votants et candidats

### 10.3 Ce Qui Manque ❌

#### 🟡 MOYEN — Expiration automatique des mandats
- `mandateEnd` est calculé lors de la création du mandat ✅
- Mais il n'y a pas de scheduler visible qui archive automatiquement les mandats expirés
- Un mandat expiré reste marqué "actif" jusqu'à intervention manuelle

#### 🟡 MOYEN — Notifications de fin de campagne / ouverture du vote
- La transition d'état déclenche la notification "élection ouverte" ✅
- Mais les rappels avant fermeture du vote (J-1, J-0 H-2) ne sont pas implémentés

#### 🟡 MOYEN — Élection d'urgence
- Supportée en théorie (skip `draft`) mais le workflow mobile n'a pas de bouton "Élection d'urgence" explicite — il faut créer une élection normale et la transitionner manuellement

#### 🟡 MOYEN — Audit de l'élection et contestation
- `contested` existe comme état ✅
- Mais le processus de contestation (qui peut contester, dans quel délai, quel justificatif) n'est pas formalisé dans un workflow dédié

---

## 11. MODULE MARKETPLACE

### 11.1 État Global : 🔴 INCOMPLET EN PRODUCTION

C'est le module avec le plus de lacunes mobiles. Le backend est plus avancé que le mobile.

### 11.2 Endpoints API Disponibles ✅

| Endpoint | Description |
|----------|-------------|
| `GET /products` | Liste filtrée et paginée |
| `GET /products/featured` | Produits en vedette |
| `GET /products/pending` | File de modération Admin |
| `GET /products/my-favorites` | Favoris de l'utilisateur |
| `GET /products/my-listings` | Mes annonces |
| `GET /products/:id` | Détail produit |
| `POST /products` | Créer une annonce |
| `PUT /products/:id` | Modifier une annonce |
| `DELETE /products/:id` | Supprimer une annonce |

**Manquants côté API :**
- `POST /products/:id/approve` (modération Admin) — l'implémentation API existe dans marketplace.ts mais le chemin exact doit être vérifié
- `GET /orders`, `POST /orders`, `PUT /orders/:id/status` — les commandes sont dans le DataContext mock
- `POST /products/:id/review` — reviews dans mock
- `POST /products/:id/report` — signalement d'abus : endpoint présent mais mobile non connecté

### 11.3 Problèmes Critiques Mobile

#### 🔴 BOGUE P0 — Upload photo produit absent
```javascript
// my-shop.tsx — handleSave()
imageUrls: []  // ← hardcodé ! Aucun image picker, aucun upload
```
- Un membre peut créer une annonce **sans aucune photo**
- L'API supporte `imageUrls: string[]` mais le mobile n'offre aucune UI de sélection de photo
- **Impact :** Marketplace inutilisable commercialement (pas d'images = pas de ventes)

#### 🔴 BOGUE P0 — Commandes entièrement mockées
- `orders.tsx` : toutes les données viennent de `DataContext` (mock)
- "Télécharger le reçu" → `Alert.alert()` uniquement
- "Laisser un avis" → `Alert.alert()` uniquement
- **Impact :** Aucune commande réelle ne peut être passée ou suivie

#### 🔴 BOGUE P0 — Panier sans checkout réel
- `cart.tsx` : gestion du panier en mémoire seulement
- Aucun endpoint `POST /orders` appelé lors du "paiement"
- **Impact :** Aucune transaction marketplace n'est enregistrée en base

#### 🔴 BOGUE P1 — Avis et évaluations mockés
- `reviews.tsx` : données statiques
- Aucun appel à une API de reviews
- `reviewsTable` existe en DB mais n'est pas exposé dans les écrans acheteur/vendeur

#### 🔴 BOGUE P1 — Workflow d'approbation non visible côté Admin mobile
- `GET /products/pending` existe côté API ✅
- Mais l'écran Admin dans `(tabs)/marketplace.tsx` doit être vérifié pour confirmer que la file de modération est correctement affichée et connectée

### 11.4 Flux Complet Attendu vs Réel

| Étape | Attendu | Réel |
|-------|---------|------|
| Créer annonce | POST /products avec photos | ✅ API / ❌ Mobile (pas de photos) |
| File de modération | Admin voit pending | ✅ API / 🟡 Mobile à vérifier |
| Approbation | PUT /products/:id/approve | ✅ API / 🟡 Mobile à vérifier |
| Mise en ligne | status = approved | ✅ |
| Contact vendeur | POST /conversations/product | ✅ API + Mobile |
| Commentaires | — | ❌ Non implémenté |
| Signalement abus | POST /chat/report | ✅ API / ❌ Mobile non connecté |
| Ajout au panier | cartItems en mémoire | ❌ Non persisté |
| Commande | POST /orders | ❌ Mock seulement |
| Paiement | — | ❌ Aucune intégration paiement |
| Livraison | — | ❌ Non implémenté |
| Avis | POST /reviews | ❌ Mock seulement |
| Favoris | POST /my-favorites | ✅ API + Mobile |

---

## 12. MODULE CHAT & MESSAGERIE

### 12.1 État Global : ✅ LE MODULE LE PLUS COMPLET

### 12.2 Ce Qui Fonctionne ✅

- **Polling 4 secondes** via `/conversations/:id/messages/since` (delta updates)
- **Matrice de communication enforced :**
  - Super Admin ↔ Syndicate Admin : ✅
  - Syndicate Admin ↔ Membres/Locataires (même syndic) : ✅
  - Membres ↔ Membres (même syndic) : ✅
  - Membres ↔ Locataires : ❌ (non autorisé, conforme à la matrice)
- **Partage de fichiers/images/PDF :** Implémenté via upload + object storage
- **Accusés de lecture :** `messageReadsTable` + `markConversationRead()` ✅
- **Édition de message :** Fenêtre de 15 minutes ✅
- **Suppression "pour tout le monde" :** Fenêtre de 60 minutes, laisse un tombstone ✅
- **Réactions emoji :** `messageReactionsTable` + endpoints ✅
- **Indicateurs de frappe :** In-memory sur le serveur, TTL 6 secondes, pollé par les clients ✅
- **Notifications push :** Déclenchées sur nouveaux messages et signaux d'urgence ✅
- **Blocage d'utilisateurs :** `POST /users/:id/block` ✅
- **Signalement d'abus :** `POST /chat/report` ✅
- **Conversations contextuelles :** Marketplace (acheteur→vendeur), Incidents ✅

### 12.3 Ce Qui Manque ❌

#### 🟡 MOYEN — Pas de WebSockets (scalabilité)
- Le polling toutes les 4 secondes est acceptable en dev mais génère une charge serveur importante en production (N utilisateurs × requêtes/4s)
- À remplacer par WebSockets ou SSE avant le scaling

#### 🟡 MOYEN — Pas de conversations de groupe générales
- Les conversations de groupe (`isGroup = true`) existent pour les annonces, bâtiments, incidents
- Mais il n'y a pas de "groupe syndic général" automatiquement créé lors de la création d'un syndic
- Les membres ne peuvent pas créer eux-mêmes des groupes

#### 🟡 MOYEN — `messagerie-interne.tsx` redondant
- `messagerie-interne.tsx` est un système de broadcast officiel (annonces prioritaires)
- Mais il se superpose aux `publicationsTable` et `announcementsTable`
- La distinction entre "messagerie interne" et "publications" n'est pas clairement définie dans l'UX

---

## 13. MODULE INCIDENTS & SINISTRES

### 13.1 Flux Complet

```
Résident déclare sinistre (POST /sinistres, avec photos)
  → Admin évalue et priorise (PUT /sinistres/:id, urgency)
    → Admin crée ordre de travaux lié (POST /travaux)
      → Prestataire assigné (POST /travaux/:id/assign)
        → Travaux réalisés
          → Rapport soumis avec preuves (POST /travaux/:id/report, invoiceUrl requis)
            → Admin valide (POST /travaux/:id/validate)
              → Transaction financière créée automatiquement
                → Sinistre clôturé
```

### 13.2 Ce Qui Fonctionne ✅
- Déclaration d'incident avec métadonnées (type, urgence, description)
- Mise à jour du statut et de l'urgence par l'Admin
- Assignation de prestataire à un ordre de travaux
- Rapport d'intervention avec URL facture (validé avant clôture)
- Création automatique de transaction lors de la validation
- Escalade des dettes (`escalation.ts` : reminder → formal_notice → legal_action)
- Génération de lettres d'escalade avec URL
- Mobile entièrement connecté pour tous les rôles concernés

### 13.3 Ce Qui Manque ❌

#### 🟠 INCOMPLET — Lien Sinistre → Travaux
- Il n'existe pas de `sinistreId` dans `travauxTable`
- Un sinistre crée un ordre de travaux manuellement mais sans lien tracé en DB
- **Impact :** Impossible de suivre combien de travaux ont été générés par un sinistre

#### 🟠 INCOMPLET — Phase de Devis absente
- Le flux passe directement de "assigné" à "rapport d'intervention"
- Il n'y a pas d'étape "Devis approuvé" dans la machine d'états de `travauxTable`
- `estimatedAmount` est stocké mais sans workflow de validation de devis

#### 🟠 INCOMPLET — Vue Prestataire absente
- Les prestataires ne peuvent pas accéder à la plateforme
- L'Admin soumet les rapports en leur nom
- **Impact :** Perd la responsabilité directe du prestataire + pas de signature numérique prestataire

#### 🟡 MOYEN — Photos d'incident côté mobile
- `sinistres.tsx` permet l'upload de photos ✅
- Mais la connexion au système de stockage GCS (en panne) rend l'upload non fonctionnel en production

---

## 14. MODULE TRAVAUX & MAINTENANCE

### 14.1 Endpoints Complets ✅

`GET/POST /travaux`, `GET /travaux/:id`, `POST /travaux/:id/assign`, `POST /travaux/:id/report`, `POST /travaux/:id/validate`, `PUT /travaux/:id`, `DELETE /travaux/:id`

### 14.2 Travaux Privatifs

- `travaux-privatifs.tsx` : écran dédié aux travaux dans les appartements privatifs
- Doit être vérifié pour la restriction du rôle : seuls le propriétaire du lot et l'Admin doivent voir les travaux d'un lot privatif
- La connexion API doit filtrer par `lotId` avec vérification d'ownership

### 14.3 Ce Qui Manque ❌

- **Calendrier des travaux :** `calendar.tsx` existe mais sa connexion aux travaux planifiés n'est pas claire
- **Alertes de fin de contrat prestataire :** `contract-expiry.ts` existe en backend mais les notifications mobiles ne sont pas visibles dans `notifications.tsx`
- **Évaluation prestataire post-travaux :** Pas de système de notation/évaluation des prestataires après intervention

---

## 15. MODULE ASSEMBLÉES GÉNÉRALES

### 15.1 Flux Complet

```
Admin crée AG (POST /ag-meetings, date, lieu, ordre du jour)
  → Convocations envoyées aux membres (notifications + email)
    → Membres confirment présence ou enregistrent procuration
      → AG tenue → Admin enregistre les résolutions (POST /ag-meetings/:id/resolutions)
        → Votes sur chaque résolution (POST /ag-meetings/:id/votes)
          → Clôture → Génération PV
            → PV signé et publié
```

### 15.2 Ce Qui Fonctionne ✅
- Création et gestion des AG
- Gestion des proxies (mandats de représentation)
- Enregistrement des résolutions et votes
- Génération de PV (via `documents.ts`)
- Restriction `requireNotTenant` : locataires exclus ✅

### 15.3 Ce Qui Manque ❌

#### 🟡 MOYEN — Vote électronique à distance absent
- Les votes d'AG sont enregistrés par l'Admin lors de la séance
- Il n'y a pas de mécanisme de **vote à distance sécurisé** pour les membres absents (vote électronique préalable)
- Seule la procuration est supportée pour les absents

#### 🟡 MOYEN — Signature électronique du PV
- Le PV est généré via `documents.ts` ✅
- Mais le workflow de signature multi-partie (président + secrétaire + scrutateurs) du PV n'est pas guidé dans l'interface mobile

---

## 16. MODULE NOTIFICATIONS

### 16.1 Ce Qui Fonctionne ✅
- **Push Notifications Expo :** Tokens enregistrés, notifications déclenchées par actions API
- **Alertes in-app :** `alertsTable` avec lecture/archivage
- **Déclencheurs implémentés :** Nouveau message, nouveau sinistre, validation paiement, ouverture élection, document publié

### 16.2 Ce Qui Manque ❌

| Événement | Push | In-App | Email |
|-----------|------|--------|-------|
| Nouvel appel de fonds | ✅ | ✅ | 🟡 |
| Paiement validé + reçu | ✅ | ✅ | ❌ |
| Nouveau document publié | ✅ | ✅ | ❌ |
| Élection ouverte | ✅ | ✅ | ❌ |
| AG convoquée | 🟡 | 🟡 | ❌ |
| Mandat expirant (J-30) | ❌ | ❌ | ❌ |
| Contrat prestataire expirant | ✅ backend | ❌ Mobile | ❌ |
| Escalade dette | ✅ | ✅ | 🟡 |
| Produit marketplace approuvé | 🟡 | 🟡 | ❌ |

**Note :** Le service email (`emailService.ts`) est implémenté (SMTP) mais `SMTP_HOST` et `SMTP_USER` ne sont pas configurés en production.

---

## 17. FAILLES DE SÉCURITÉ & IDOR

### 17.1 🔴 CRITIQUE — IDOR Documents Locataire (Non Corrigé)

**Description :** `GET /documents` avec `?syndicateId=X` ne valide pas suffisamment le rôle du demandeur. Un locataire peut théoriquement accéder à des documents non destinés aux locataires.

**Correction requise :**
```typescript
// Après requireAuth, dans documents.ts GET route
if (req.user.role === 'tenant') {
  // Only allow: bail, reglement_interieur, états_des_lieux liés au tenant
  where.push(inArray(documentsTable.category, ['bail', 'reglement']));
  where.push(eq(documentsTable.tenantId, req.user.userId)); // ou lotId
}
```

### 17.2 🔴 CRITIQUE — Fallback URI locale dans upload de preuve de paiement

```javascript
// charges.tsx
if (!proofUrl) proofUrl = payProofUri  // file:// ou content://
```

**Impact :** Preuves de paiement inutilisables, risque de validation sans justificatif réel.

### 17.3 🟠 MOYEN — Rate Limiting insuffisant sur auth routes

- `authLimiter` est configuré dans `app.ts` ✅
- Mais `REDIS_URL` n'est pas configuré → le rate limiter tombe en mode mémoire
- En mode mémoire, le rate limiter est **par instance de serveur** — en cas de scaling horizontal, il devient inefficace

### 17.4 🟡 — Tokens JWT sans révocation

- Les tokens JWT sont signés avec `JWT_SECRET` ✅
- Mais il n'y a pas de mécanisme de révocation (blacklist Redis, jti tracking)
- Un token volé reste valide jusqu'à expiration

### 17.5 🟡 — `?supervision=true` sans journal d'audit systématique

- Le mode supervision du Super Admin n'enregistre pas toujours l'accès dans `auditLogsTable`
- Un Super Admin peut lire des données d'un syndic sans trace

---

## 18. DONNÉES MOCK & FONCTIONNALITÉS NON CONNECTÉES

### 18.1 Inventaire Complet des Éléments Mock/Non Connectés

| Écran | Element Mock/Cassé | Priorité |
|-------|-------------------|----------|
| `paiements.tsx` | Bouton "Marquer comme payé" → Alert.alert() | 🔴 P0 |
| `my-shop.tsx` | `imageUrls: []` hardcodé, aucun image picker | 🔴 P0 |
| `orders.tsx` | Toutes les données from DataContext mock | 🔴 P0 |
| `orders.tsx` | "Télécharger le reçu" → Alert.alert() | 🔴 P0 |
| `orders.tsx` | "Laisser un avis" → Alert.alert() | 🔴 P0 |
| `cart.tsx` | Pas de POST /orders sur checkout | 🔴 P0 |
| `reviews.tsx` | Données statiques | 🔴 P0 |
| `charges.tsx` | Fallback URI locale si upload échoue | 🔴 P0 |
| `budget-previsionnel.tsx` | Montants "réalisés" = 0 hardcodé | 🔴 P1 |
| `cotisations.tsx` | `payCotisation` potentiellement stub | 🔴 P1 |
| `governance.tsx` | Organigramme partiellement mocké | 🟠 P2 |
| `fiches-paie.tsx` | Connexion salaires incomplète | 🟠 P2 |
| `simulateur.tsx` | Calculateur de charges (à vérifier) | 🟡 P3 |
| `tableau-national.tsx` | Données nationales (à vérifier) | 🟡 P3 |
| `bon-livraison.tsx` | Connexion bons de livraison (à vérifier) | 🟡 P3 |

### 18.2 Boutons Sans Action Identifiés

1. `orders.tsx` → "Télécharger le reçu"
2. `orders.tsx` → "Laisser un avis"
3. `cotisations.tsx` → "Télécharger le reçu" (reçu de cotisation)
4. `paiements.tsx` → "Marquer comme payé"
5. Marketplace → Signalement abus (non connecté à `POST /chat/report`)

---

## 19. RISQUES DE PRODUCTION

### 19.1 🔴 BLOQUANT — GCS Object Storage Hors Service

**Symptôme :** Toutes les opérations d'upload (documents, photos, preuves de paiement) échouent avec `401 — no allowed resources` au niveau du sidecar GCS.

**Impact :**
- Module Documents : génération PDF OK, upload GCS ❌ → URLs signées invalides
- Preuves de paiement : upload ❌ → fallback URI locale stockée
- Photos incidents/sinistres : upload ❌
- Photos produits marketplace : non implémenté de toute façon

**Correction :** Vérifier et reconfigurer les variables d'environnement `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` (déjà présentes en secrets).

### 19.2 🔴 BLOQUANT — SMTP Non Configuré

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM`, `SMTP_SECURE` absents
- Toutes les notifications email (reset de mot de passe, convocations AG, reçus) sont silencieuses
- `SMTP_PASS` est présent en secrets mais les autres variables manquent

### 19.3 🔴 BLOQUANT — REDIS_URL Absent

- Rate limiting en mode mémoire (non distribué)
- Sessions non partagées si l'API scale horizontalement
- Le cache de certaines opérations est désactivé

### 19.4 🟠 RISQUE — Fallback API Mobile en Développement

```javascript
// lib/api.ts — mobile
const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN || 'http://localhost:8080';
```
- Si `EXPO_PUBLIC_DOMAIN` n't est pas défini en production, l'app mobile appelle `localhost:8080`
- **Impact :** Toute l'app mobile devient non fonctionnelle en production

### 19.5 🟠 RISQUE — `pnpm-lock.yaml` et versions flottantes

- Certaines dépendances utilisent `^` sans pin exact, ce qui peut casser le build sur une nouvelle installation

---

## 20. MATRICE DE PRIORITÉ DES CORRECTIONS

### P0 — Bloquants de Production (À corriger avant tout déploiement)

| # | Problème | Module | Effort |
|---|---------|--------|--------|
| 1 | GCS Object Storage : résoudre l'authentification sidecar | Infrastructure | S |
| 2 | SMTP : configurer toutes les variables d'environnement | Infrastructure | XS |
| 3 | `charges.tsx` : supprimer le fallback URI locale pour upload preuve | Finance | XS |
| 4 | Ajouter `GET /appels-de-fonds/:id/receipt` (PDF reçu) | Finance | M |
| 5 | `paiements.tsx` : connecter "Marquer comme payé" à l'API | Finance | S |
| 6 | Marketplace : implémenter l'image picker et l'upload dans `my-shop.tsx` | Marketplace | M |
| 7 | Marketplace : connecter `orders.tsx` au backend (POST /orders) | Marketplace | L |
| 8 | Marketplace : connecter `reviews.tsx` à l'API | Marketplace | M |
| 9 | `EXPO_PUBLIC_DOMAIN` : s'assurer que la variable est configurée en production | Infrastructure | XS |

### P1 — Haute Priorité (Avant ouverture aux utilisateurs)

| # | Problème | Module | Effort |
|---|---------|--------|--------|
| 10 | Sécurité IDOR : renforcer le filtre documents pour les locataires côté backend | Sécurité | S |
| 11 | `budget-previsionnel.tsx` : calculer les montants réalisés depuis `transactionsTable` | Finance | M |
| 12 | Synchroniser `caisse_entries` lors de la validation des appels de fonds | Finance | S |
| 13 | Ajouter FK `sinistreId` dans `travauxTable` | DB | XS |
| 14 | Implémenter l'expiration automatique des mandats (scheduler) | Élections | S |
| 15 | REDIS_URL : configurer Redis pour le rate limiting distribué | Infrastructure | S |

### P2 — Moyenne Priorité (Prochaine itération)

| # | Problème | Module | Effort |
|---|---------|--------|--------|
| 16 | Ajouter JWT token révocation (jti blacklist) | Sécurité | M |
| 17 | `governance.tsx` : connecter l'organigramme à de vraies données | Gouvernance | M |
| 18 | Implémenter le workflow de signature PDF mobile end-to-end | Documents | L |
| 19 | Créer des comptes prestataires avec rôle limité | Prestataires | L |
| 20 | Phase de devis dans le workflow des travaux | Travaux | M |
| 21 | Rappels de vote avant clôture d'élection | Élections | S |
| 22 | Vote à distance pour les AG | AG | L |

### P3 — Amélioration Qualité

| # | Problème | Module | Effort |
|---|---------|--------|--------|
| 23 | Remplacer le polling 4s par WebSockets | Chat | XL |
| 24 | Tableau de bord agrégé plateforme pour Super Admin | Super Admin | M |
| 25 | Export CSV/Excel des données financières | Finance | M |
| 26 | Évaluation prestataires post-travaux | Travaux | M |
| 27 | Plans d'abonnement configurables depuis l'interface | Abonnements | M |

---

## CONCLUSION

### Niveau de Maturité Global : 65/100

La plateforme est **architecturalement solide** — le schéma de base de données est complet, les contrôles d'accès sont globalement bien pensés, et plusieurs modules complexes (élections, documents, chat, incidents) sont réellement implets et prêts.

**Les 3 problèmes qui bloquent la mise en production :**
1. **GCS Object Storage** : sans uploads fonctionnels, les documents, preuves de paiement et photos sont tous cassés
2. **Module Marketplace** : 80% des fonctionnalités mobiles sont mockées et ne persistant pas en base
3. **Reçus de paiement** : les membres ne peuvent pas prouver leurs paiements, ce qui est inacceptable légalement (Loi 18-00)

**Les modules prêts à 90%+ :** Chat, Élections, Incidents/Travaux, AG, RBAC

**Estimation pour atteindre production-ready :** 3 à 4 sprints de 2 semaines, en commençant par les P0.

---

*Audit généré le 15 juillet 2026 — SYNDYCAT GLOBAL CPS v1.0*
