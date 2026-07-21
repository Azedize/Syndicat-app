# AUDIT MÉTIER COMPLET — SYNDYCAT GLOBAL CPS
**Date** : 21 juillet 2026  
**Auditeur** : Senior Product Owner / Enterprise Architect  
**Version** : 3.0 Copropriété  
**Référentiel** : Loi 18-00 (Maroc)

---

## PHASE 1 — ANALYSE DES MODULES & MATRICE RÔLE/MODULE

### MODULE → ROLE OWNERSHIP MATRIX

| Module | Super Admin | Syndic Admin | Membre (Copropriétaire) | Locataire (Tenant) | Fréquence | Criticité |
|---|:---:|:---:|:---:|:---:|---|---|
| **Tableau de bord** | ✅ | ✅ | ✅ | ✅ (limité) | Quotidien | CRITIQUE |
| **Bâtiments / Résidences** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Lots / Unités** | ✅ | ✅ | 🔍 (son lot) | ❌ | Mensuel | CRITIQUE |
| **Membres / Copropriétaires** | ✅ | ✅ | ❌ | ❌ | Hebdo | CRITIQUE |
| **Locataires** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Mon Appartement** | ❌ | ❌ | ✅ | ✅ | Hebdo | IMPORTANT |
| **Mon Bail** | ❌ | ❌ | ❌ | ✅ | Mensuel | IMPORTANT |
| **État des lieux** | ❌ | ❌ | ❌ | ✅ | Rarement | IMPORTANT |
| **Tableau de bord financier** | ✅ | ✅ | ❌ | ❌ | Quotidien | CRITIQUE |
| **Charges & Appels de fonds** | ✅ | ✅ | ✅ | ❌ | Mensuel | CRITIQUE |
| **Cotisations** | ❌ | ❌ | ✅ | ❌ | Mensuel | CRITIQUE |
| **Paiements** | ❌ | ❌ | ✅ | ✅ | Mensuel | CRITIQUE |
| **Budget prévisionnel** | ✅ | ✅ | ❌ | ❌ | Annuel | CRITIQUE |
| **Devis & Factures** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Bon de livraison** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Rapports financiers** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Fiches de paie** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Escalade créances** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Travaux & Interventions** | ✅ | ✅ | ✅ | ✅ | Hebdo | CRITIQUE |
| **Prestataires** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Sinistres** | ✅ | ✅ | ✅ | ✅ | Rarement | CRITIQUE |
| **Travaux privatifs** | ✅ | ✅ | ✅ | ✅ | Rarement | IMPORTANT |
| **Parking & Véhicules** | ✅ | ✅ | ✅ | ✅ | Hebdo | IMPORTANT |
| **Assemblées Générales** | ✅ | ✅ | ✅ | ❌ | Annuel | CRITIQUE |
| **Réunions & Convocations** | ✅ | ✅ | ✅ | ❌ | Mensuel | CRITIQUE |
| **Votes & Résolutions** | ✅ | ✅ | ✅ | ❌ (sauf exception) | Annuel | CRITIQUE |
| **PV de réunion** | ✅ | ✅ | ✅ | ❌ | Mensuel | CRITIQUE |
| **Gouvernance** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Documents copropriété** | ✅ | ✅ | ✅ | ✅ | Mensuel | CRITIQUE |
| **Règlements** | ✅ | ✅ | ✅ | ✅ | Rarement | IMPORTANT |
| **Actes administratifs** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Alertes réglementaires** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Transparence** | ✅ | ✅ | ❌ | ❌ | Mensuel | IMPORTANT |
| **Avis résidents** | ✅ | ✅ | ✅ | ✅ | Hebdo | IMPORTANT |
| **Publications** | ✅ | ✅ | ✅ | ✅ | Hebdo | IMPORTANT |
| **Chat / Messagerie** | ✅ | ✅ | ✅ | ✅ | Quotidien | IMPORTANT |
| **Messagerie interne** | ✅ | ✅ | ✅ | ✅ | Quotidien | OPTIONNEL |
| **Idées / Suggestions** | ✅ | ✅ | ✅ | ✅ | Mensuel | OPTIONNEL |
| **Support tickets** | ✅ | ✅ | ✅ | ✅ | Hebdo | IMPORTANT |
| **Réclamations RH** | ✅ | ✅ | ✅ | ❌ | Mensuel | IMPORTANT |
| **Marketplace** | ✅ | ✅ | ✅ | ❌ | Hebdo | OPTIONNEL |
| **Mon panier** | ❌ | ✅ | ✅ | ❌ | Hebdo | OPTIONNEL |
| **Mes commandes** | ❌ | ✅ | ✅ | ❌ | Mensuel | OPTIONNEL |
| **Ma boutique** | ❌ | ✅ | ✅ | ❌ | Mensuel | OPTIONNEL |
| **Gestion utilisateurs** | ✅ | ❌ | ❌ | ❌ | Hebdo | CRITIQUE |
| **Tableau national** | ✅ | ❌ | ❌ | ❌ | Quotidien | CRITIQUE |
| **Créer syndicat** | ✅ | ❌ | ❌ | ❌ | Rarement | CRITIQUE |
| **Journal d'audit** | ✅ | ❌ | ❌ | ❌ | Quotidien | CRITIQUE |
| **Statistiques globales** | ✅ | ✅ | ❌ | ❌ | Hebdo | IMPORTANT |
| **Abonnements** | ✅ | ✅ | ✅ | ❌ | Mensuel | OPTIONNEL |
| **Profil** | ✅ | ✅ | ✅ | ✅ | Hebdo | IMPORTANT |
| **Notifications** | ✅ | ✅ | ✅ | ✅ | Quotidien | IMPORTANT |
| **Paramètres** | ✅ | ✅ | ✅ | ✅ | Mensuel | IMPORTANT |

---

## PHASE 2 — ANALYSE PAR RÔLE

### Super Admin
**Mission** : Gestion plateforme SaaS uniquement — jamais d'opérations syndic directes sans mode supervision.

| Catégorie | Détail |
|---|---|
| **Modules visibles** | Tableau national, gestion syndicats, gestion utilisateurs, journal d'audit, statistiques globales, tableau de bord SaaS |
| **Modules cachés** | Aucun (super_admin voit tout en supervision) |
| **Actions permises** | CRUD syndicats, CRUD utilisateurs, consultation audit logs, supervision syndic (avec `?supervision=true`) |
| **Actions interdites** | Opérations directes sans mode supervision (enforced par `requireOperationalAccess`) |

### Syndic Admin
**Mission** : Gestion complète d'un syndicat de copropriété — toutes les opérations quotidiennes.

| Catégorie | Détail |
|---|---|
| **Modules visibles** | Tous sauf modules super_admin et modules personnels member/tenant |
| **Modules cachés** | Journal d'audit, Tableau national, Créer syndicat, Mon bail, État des lieux |
| **Actions permises** | CRUD membres, lots, bâtiments, finances, travaux, prestataires, elections, documents, AG |
| **Actions interdites** | Accès aux données d'autres syndicats (scoping JWT enforced) |

### Membre (Copropriétaire)
**Mission** : Gérer son lot, payer ses charges, participer à la gouvernance.

| Catégorie | Détail |
|---|---|
| **Modules visibles** | Mon appartement, charges, cotisations, paiements, AG, votes, PV, documents, travaux, sinistres, parking, marketplace |
| **Modules cachés** | Finance globale, budget, prestataires, membres (liste autres), locataires, bâtiments, lots (liste), actes, escalade |
| **Actions permises** | Voir son lot, payer ses charges, voter, signaler travaux/sinistres, réserver parking, déposer réclamation RH |
| **Actions interdites** | Voir les données financières d'autres membres, modifier les lots, accéder aux modules d'administration |

### Locataire (Tenant)
**Mission** : Gérer sa location, signaler des problèmes, consulter des documents.

| Catégorie | Détail |
|---|---|
| **Modules visibles** | Mon appartement, mon bail, état des lieux, paiements, travaux, sinistres, parking, documents, règlements, chat, annonces, support |
| **Modules cachés** | TOUT ce qui concerne la copropriété : charges, cotisations, AG, votes, PV, finances, budget, prestataires, membres, lots, réclamations RH |
| **Actions permises** | Voir son bail, signaler travaux/sinistres, enregistrer son véhicule, réserver parking visiteur, télécharger ses documents |
| **Actions interdites** | Accès à tout module financier syndic, gouvernance, marketplace, modules RH |

### Président
> ℹ️ *Modélisé via le rôle `member` avec mandat électif (`conseilSyndicalTable`). Pas de rôle JWT distinct.*

Besoins : validation AG, signature documents, gouvernance, décisions, rapports. Couvert via modules AG + élections + PV.

### Trésorier
> ℹ️ *Modélisé via le rôle `member` avec mandat électif.*

Besoins : charges, paiements, budgets, comptabilité, recouvrement, rapports financiers. Couvert via charges + budget + rapports (admin-gated pour la plupart).

### Secrétaire
> ℹ️ *Modélisé via le rôle `member` avec mandat électif.*

Besoins : réunions, PV, décisions, publications, documents. Couvert via meetings + PV + documents.

---

## PHASE 3 — VALIDATION MÉTIER PAR MODULE

| Module | Valeur Métier | Décision |
|---|---|---|
| Tableau de bord | Clé de voûte UX | **CRITIQUE** |
| Gestion bâtiments/lots | Fondation du syndic | **CRITIQUE** |
| Finance (charges, budget, rapports) | Obligation légale Loi 18-00 | **CRITIQUE** |
| Assemblées Générales + Votes | Obligation légale Loi 18-00 | **CRITIQUE** |
| Documents copropriété | Obligation légale | **CRITIQUE** |
| Travaux & Prestataires | Core opérationnel | **CRITIQUE** |
| Sinistres | Déclaratif obligatoire | **CRITIQUE** |
| Parking & Véhicules | Utile en résidence | **IMPORTANT** |
| Chat / Messagerie | Outil communication | **IMPORTANT** |
| Marketplace | Commerce entre résidents | **OPTIONNEL** |
| Messagerie interne | Doublonnant Chat | **OPTIONNEL** → envisager fusion |
| Idées / Suggestions | Nice-to-have | **OPTIONNEL** |
| Simulateur | Utilitaire pédagogique | **OPTIONNEL** |
| Abonnements | Modèle SaaS | **IMPORTANT** |
| Tableau national | Outil BI Super Admin | **CRITIQUE (super_admin)** |

**Modules à évaluer pour suppression/fusion** :
- `messagerie-interne` : doublon de `chat` — envisager fusion ou suppression
- `simulateur` : faible usage projeté, valeur incertaine

---

## PHASE 4 — SCÉNARIOS RÉELS

### Ahmed = Copropriétaire
| Action | Écran | Accès actuel | ✅/⚠️ |
|---|---|---|---|
| Payer ses charges | `/charges` | RoleGuard ✅ (member, pas tenant) | ✅ |
| Télécharger son attestation | `/documents` | Accessible à tous | ✅ |
| Signaler une panne | `/travaux` | Accessible à tous | ✅ |
| Voter en AG | `/elections` | RoleGuard ✅ (member, pas tenant) | ✅ |
| Lire les PV | `/pv` | RoleGuard ✅ | ✅ |
| Voir son lot | `/mon-lot` | Member uniquement via menu | ✅ |
| Voir les prestataires | `/prestataires` | RoleGuard ✅ (admin only) | ✅ |
| Voir les charges d'autres | Blocked | API scope per-user | ✅ |
| Cotisations | `/cotisations` | **CORRIGÉ** : RoleGuard member uniquement | ✅ |

### Fatima = Locataire
| Action | Écran | Accès actuel | ✅/⚠️ |
|---|---|---|---|
| Voir son bail | `/mon-bail` | Tenant uniquement (menu) | ✅ |
| Signaler un incident | `/sinistres` | Accessible à tous (API scoped) | ✅ |
| Soumettre une plainte RH | `/reclamations` | **CORRIGÉ** : RoleGuard bloque les tenants | ✅ |
| Accéder aux charges AG | `/charges` | Bloqué par RoleGuard ✅ | ✅ |
| Voir le budget | `/budget-previsionnel` | Bloqué par RoleGuard ✅ | ✅ |
| Voir les contrats prestataires | `/prestataires` | Bloqué par RoleGuard ✅ | ✅ |
| Voir l'AG | `/assemblee-generale` | Bloqué par RoleGuard ✅ | ✅ |
| Voter | `/elections` | Bloqué par RoleGuard ✅ (sauf `tenantsCanVote`) | ✅ |

### Trésorier = Syndic Admin
| Action | Écran | Accès actuel | ✅/⚠️ |
|---|---|---|---|
| Générer des appels de fonds | `/charges` | Admin + member, scoped | ✅ |
| Valider des paiements | `/charges` | isAdmin check + API | ✅ |
| Voir le budget | `/budget-previsionnel` | RoleGuard admin | ✅ |
| Rapport financier | `/reports` | RoleGuard admin | ✅ |
| Fiches de paie | `/fiches-paie` | **CORRIGÉ** : RoleGuard admin | ✅ |
| Escalade créances | `/escalation` | RoleGuard admin | ✅ |

### Secrétaire = Syndic Admin
| Action | Écran | Accès actuel | ✅/⚠️ |
|---|---|---|---|
| Convoquer une AG | `/assemblee-generale` | Admin via requireOperationalAccess | ✅ |
| Rédiger un PV | `/pv` | Membre interne uniquement | ✅ |
| Publier des annonces | `/annonces` | Tous rôles | ✅ |
| Gérer les documents | `/documents` | Tous rôles (scoped par syndicate) | ✅ |

### Super Admin
| Action | Écran | Accès actuel | ✅/⚠️ |
|---|---|---|---|
| Créer un syndicat | `/syndicate-setup` | RoleGuard super_admin | ✅ |
| Voir l'audit | `/journal-audit` | RoleGuard super_admin | ✅ |
| Superviser un syndic | `?supervision=true` | requireOperationalAccess enforced | ✅ |
| Opérer directement sans supervision | Bloqué | requireOperationalAccess 403 | ✅ |

---

## PHASE 5 — REVUE DÉTAILLÉE DES MODULES CLÉS

### 1. TRAVAUX & INTERVENTIONS
| Critère | État |
|---|---|
| Rôle propriétaire | Syndic Admin (gestion), tous (signalement) |
| Rôles incorrects actuellement | Aucun — scoping correct côté API |
| Permissions requises | Signalement : tous. Assignation prestataire : admin. Validation avec paiement : admin |
| Permissions manquantes | Néant — bien implémenté |
| Risques métier | Aucun — workflow complet (signalement → assignation → rapport+photos+facture → validation) |
| **Verdict** | ✅ CONFORME |

### 2. PRESTATAIRES
| Critère | État |
|---|---|
| Rôle propriétaire | Syndic Admin (gestion complète) |
| Rôles incorrects | **CORRIGÉ** : `GET /prestataires/:id` avait une faille IDOR (tout utilisateur authentifié pouvait accéder aux détails de n'importe quel prestataire) |
| Fix appliqué | Vérification syndicate pour syndic_admin ; vérification contrat lié au bâtiment pour member/tenant |
| **Verdict** | ✅ CORRIGÉ |

### 3. SINISTRES
| Critère | État |
|---|---|
| Rôle propriétaire | Tous (déclaration), Admin (gestion/clôture) |
| Rôles incorrects | Aucun — scoping correct (members/tenants voient uniquement leurs propres sinistres via `reportedById`) |
| Fix appliqué | **CORRIGÉ** : Ajout validation `buildingId` → syndicate pour éviter l'énumération cross-syndicat |
| **Verdict** | ✅ CORRIGÉ |

### 4. PARKING & VÉHICULES
| Critère | État |
|---|---|
| Rôle propriétaire | Tous (propres véhicules), Admin (gestion places) |
| Violations des droits | Aucune — API scope correct (`vehiclesTable.userId = user.userId` pour member/tenant) |
| Gestion propre uniquement | ✅ — DELETE vérifie `vehicle.userId !== user.userId` + cross-syndicate check |
| **Verdict** | ✅ CONFORME |

### 5. ASSEMBLÉES GÉNÉRALES
| Critère | État |
|---|---|
| Rôle propriétaire | Syndic Admin (création), Members (participation/vote) |
| Tenants | Bloqués côté API (`requireNotTenant`) et côté screen (RoleGuard) |
| Création AG | Requiert `requireOperationalAccess` — bloque tenants et members |
| **Verdict** | ✅ CONFORME |

### 6. VOTES & RÉSOLUTIONS
| Critère | État |
|---|---|
| Éligibilité voters | Calculée via `getEligibleVoterIds()` — membres actifs du syndicat, lotisseurs |
| Vote tenant | Conditionné par `election.tenantsCanVote` — option explicite admin |
| Doublon votes | `voteReceiptsTable` bloque les doubles votes |
| Anonymat | Implémenté (pas de voterId dans `votesTable`) |
| **Verdict** | ✅ CONFORME |

### 7. RÉCLAMATIONS RH
| Critère | État |
|---|---|
| Nature du module | Griefs RH (salaire, discrimination, harcèlement) — PAS incidents techniques |
| Rôle propriétaire | Syndic Admin (traitement), Membres (dépôt) |
| Tenants | **CORRIGÉ** : RoleGuard bloque maintenant les tenants via deep link |
| Isolation IDOR | ✅ — Non-admins ne voient QUE leurs propres réclamations (`eq(reclamationsTable.memberId, userId)`) |
| **Verdict** | ✅ CORRIGÉ |

### 8. COTISATIONS
| Critère | État |
|---|---|
| Rôle propriétaire | Membre uniquement (copropriétaire) |
| Accès autres | **CORRIGÉ** : RoleGuard bloque admins et tenants via deep link |
| Isolation financière | ✅ — API scoped via memberId |
| **Verdict** | ✅ CORRIGÉ |

### 9. CHARGES & APPELS DE FONDS
| Critère | État |
|---|---|
| Rôle propriétaire | Syndic Admin (émission), Membre (paiement) |
| Tenants | ✅ Bloqués — RoleGuard existant |
| Cross-member isolation | ✅ — API scope per-user pour members |
| **Verdict** | ✅ CONFORME |

### 10. LOTS
| Critère | État |
|---|---|
| Rôle propriétaire | Syndic Admin (CRUD) |
| Tenants | ✅ Bloqués côté API (`403 pour role === "tenant"`) |
| Members | ❌ Ne peuvent pas modifier les lots — `requireOperationalAccess` bloque |
| **Verdict** | ✅ CONFORME |

### 11. RÉSIDENTS (MEMBRES)
| Critère | État |
|---|---|
| Rôle propriétaire | Syndic Admin uniquement |
| Fuite PII inter-résidents | ✅ Bloquée — `requireRole("super_admin", "syndicate_admin")` sur LIST et GET |
| Members self-exposure | Limité à `/lots/my-lot`, `/parking/vehicles` propres |
| **Verdict** | ✅ CONFORME |

### 12. FICHES DE PAIE
| Critère | État |
|---|---|
| Rôle propriétaire | Syndic Admin (gestion paie) |
| Members/Tenants | **CORRIGÉ** : RoleGuard bloque member/tenant via deep link |
| **Verdict** | ✅ CORRIGÉ |

---

## PHASE 6 — PROBLÈMES DÉTECTÉS & CORRECTIONS APPLIQUÉES

### Problèmes Identifiés et Corrigés

| # | Sévérité | Module | Problème | Correction Appliquée |
|---|---|---|---|---|
| 1 | 🔴 CRITIQUE | Prestataires API | IDOR sur `GET /prestataires/:id` — tout utilisateur authentifié pouvait accéder aux détails (contrats, travaux, évaluations) de n'importe quel prestataire | Ajout vérification syndicate (syndic_admin) et contrat lié au bâtiment (member/tenant) |
| 2 | 🟠 ÉLEVÉ | Réclamations mobile | Absence de RoleGuard — les tenants pouvaient accéder au module RH via deep link | Ajout `RoleGuard allow={["super_admin","syndicate_admin","member"]}` |
| 3 | 🟠 ÉLEVÉ | Cotisations mobile | Absence de RoleGuard — admins et tenants pouvaient accéder aux cotisations des membres via deep link | Ajout `RoleGuard allow={["member"]}` |
| 4 | 🟠 ÉLEVÉ | Fiches de paie mobile | Absence de RoleGuard — membres et tenants pouvaient accéder aux fiches de paie via deep link | Ajout `RoleGuard allow={["super_admin","syndicate_admin"]}` |
| 5 | 🟡 MOYEN | Sinistres API | `GET /sinistres?buildingId=X` — pas de validation que le buildingId appartient au syndicat de l'appelant — risque d'énumération cross-syndicat | Ajout vérification `building.syndicateId === user.syndicateId` avant application du filtre |

### Problèmes Non-Bloquants (À Surveiller)

| # | Sévérité | Module | Observation |
|---|---|---|---|
| 6 | 🟡 INFO | Elections | `GET /elections` pour super_admin sans syndicateId retourne toutes les élections — comportement correct mais à documenter |
| 7 | 🟡 INFO | Messagerie interne | Module doublon de Chat — envisager fusion dans une itération future |
| 8 | 🟢 INFO | Parking spots list | Members/tenants voient les places de leur bâtiment (pas uniquement la leur) — acceptable pour signaler des violations |
| 9 | 🟢 INFO | Prestataires list pour member/tenant | Members voient uniquement les prestataires liés à leur bâtiment via les contrats — scoping correct |

---

## PHASE 7 — RAPPORT FINAL

### 1. MATRICE DES RÔLES (après corrections)

| Rôle | Portée JWT | Isolation syndicate | Mode supervision |
|---|---|---|---|
| super_admin | Globale | Via `?supervision=true` | Requis pour opérations directes |
| syndicate_admin | `syndicateId` du JWT | Auto (WHERE syndicateId = ?) | Non applicable |
| member | `syndicateId` + buildings via lots | Propre syndicate uniquement | Non applicable |
| tenant | `syndicateId` + lot/building | Propre syndicate + bâtiment | Non applicable |

### 2. MATRICE DES PERMISSIONS (résumé)

| Action | super_admin | syndicate_admin | member | tenant |
|---|:---:|:---:|:---:|:---:|
| Créer/modifier syndicat | ✅ | ❌ | ❌ | ❌ |
| Gérer membres/lots/bâtiments | ✅ (supervision) | ✅ | ❌ | ❌ |
| Émettre charges/budgets | ✅ (supervision) | ✅ | ❌ | ❌ |
| Payer charges | ❌ | ✅ | ✅ | ❌ |
| Payer cotisations | ❌ | ❌ | ✅ | ❌ |
| Créer AG / convoquer | ✅ (supervision) | ✅ | ❌ | ❌ |
| Participer AG / voter | ❌ | ✅ | ✅ | ❌ (sauf tenantsCanVote) |
| Signaler travaux | ✅ | ✅ | ✅ | ✅ |
| Gérer prestataires | ✅ (supervision) | ✅ | ❌ | ❌ |
| Déclarer sinistre | ✅ | ✅ | ✅ | ✅ |
| Déposer réclamation RH | ✅ | ✅ | ✅ | ❌ |
| Enregistrer véhicule | ✅ | ✅ | ✅ | ✅ |
| Voir fiches de paie | ✅ | ✅ | ❌ | ❌ |
| Journal d'audit | ✅ | ❌ | ❌ | ❌ |
| Marketplace | ✅ | ✅ | ✅ | ❌ |

### 3. PROBLÈMES DE LOGIQUE MÉTIER CORRIGÉS

5 problèmes identifiés et corrigés — voir Phase 6 ci-dessus.

### 4. PROBLÈMES DE VISIBILITÉ INCORRECTE CORRIGÉS

| Module | Problème | Statut |
|---|---|---|
| Réclamations | Tenants pouvaient accéder via deep link | ✅ CORRIGÉ |
| Cotisations | Admins et tenants pouvaient accéder via deep link | ✅ CORRIGÉ |
| Fiches de paie | Members et tenants pouvaient accéder via deep link | ✅ CORRIGÉ |

### 5. RISQUES D'EXPOSITION DES DONNÉES CORRIGÉS

| Risque | Module | Statut |
|---|---|---|
| IDOR prestataire (accès détail cross-syndicat) | `GET /prestataires/:id` | ✅ CORRIGÉ |
| Énumération sinistres cross-syndicat via buildingId | `GET /sinistres?buildingId=` | ✅ CORRIGÉ |

### 6. MODULES À SUPPRIMER

| Module | Raison |
|---|---|
| Aucun | Tous les modules ont une valeur métier identifiée |

### 7. MODULES À MASQUER

| Module | Cible | Action recommandée |
|---|---|---|
| `/messagerie-interne` | Tous | Fusion avec `/chat` dans une itération future |
| `/simulateur` | Tous | Évaluer l'usage réel — masquer si < 5% utilisation |

### 8. MODULES À REFACTORISER

| Module | Recommandation |
|---|---|
| Réclamations | Renommer en "Réclamations RH" dans l'UI pour clarifier que ce n'est pas un module d'incidents |
| Fiches de paie | Ajouter un message clair "Module réservé au syndic" si accès refusé |
| Messagerie interne | Fusionner avec Chat ou différencier clairement les usages |

### 9. MODULES MANQUANTS

| Module | Priorité | Justification |
|---|---|---|
| **Tableau de bord locataire** | HAUTE | Fatima voit le même dashboard qu'un propriétaire — expérience trop générique |
| **Historique des charges par lot** | MOYENNE | Les copropriétaires souhaitent voir l'historique multi-année de leur lot |
| **Certificat de non-contentieux** | MOYENNE | Document souvent demandé pour les transactions immobilières |
| **Assurance bâtiment** | BASSE | Gestion des polices d'assurance syndicale |

### 10. SCORE DE PRODUCTION READINESS

| Dimension | Score | Commentaire |
|---|:---:|---|
| **Authentification** | 9/10 | JWT + refresh tokens + validation config |
| **Isolation multi-tenant** | 8.5/10 | syndicateId enforced partout, 2 failles mineures corrigées |
| **RBAC mobile** | 7.5/10 → **9/10** | 3 RoleGuards manquants corrigés (reclamations, cotisations, fiches-paie) |
| **RBAC API** | 8.5/10 → **9/10** | IDOR prestataire + sinistres buildingId corrigés |
| **Isolation des données** | 8/10 | Patterns solides (sinistres par reportedById, reclamations par memberId) |
| **Audit & Traçabilité** | 8/10 | serverAuditLog sur actions critiques |
| **Workflow financier** | 9/10 | Validation à 3 étapes (rapport + photos + facture) avant paiement |
| **Gouvernance (AG/Votes)** | 9/10 | Quorum, mandats, proxies, anonymat ballot |
| **Performance (N+1)** | 9/10 | Batch joins partout, pas de N+1 identifié |
| **Conformité Loi 18-00** | 8/10 | Modules AG, votes, charges, PV conformes |

### **SCORE GLOBAL : 8.5/10 → 9/10 (après corrections)**

---

## RÉCAPITULATIF DES CORRECTIONS IMPLÉMENTÉES

```
FICHIERS MODIFIÉS :

1. artifacts/mobile/app/reclamations.tsx
   → RoleGuard ajouté : block tenants (HR module)

2. artifacts/mobile/app/cotisations.tsx
   → RoleGuard ajouté : member uniquement

3. artifacts/mobile/app/fiches-paie.tsx
   → RoleGuard ajouté : admin uniquement

4. artifacts/api-server/src/routes/prestataires.ts
   → GET /prestataires/:id : IDOR fix
     • syndicate_admin : vérif syndicateId
     • member/tenant : vérif contrat lié au bâtiment

5. artifacts/api-server/src/routes/sinistres.ts
   → GET /sinistres?buildingId= : validation building→syndicate
     pour prévenir l'énumération cross-syndicat
```

---

*Audit réalisé le 21 juillet 2026 — SYNDYCAT GLOBAL CPS v3.0*
