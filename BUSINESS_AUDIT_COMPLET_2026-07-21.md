# SYNDYCAT — AUDIT COMPLET BUSINESS LOGIC
## Date : 21 juillet 2026 | Auditeur : Agent IA Senior Product Owner

---

## RÉSUMÉ EXÉCUTIF

L'application contient **4 rôles**, **5 tabs**, **~100 écrans** et **12 sections menu**.
Après audit complet de chaque écran, rôle et flux métier, voici les constats majeurs :

| Catégorie | Nb problèmes |
|---|---|
| Écrans présents dans le code mais absents du menu | 8 |
| Doublons de navigation (même route × 2) | 1 |
| Module HR visible par mauvais rôle (tenant) | 1 |
| Écrans de haute valeur jamais accessibles | 5 |
| Écrans de faible valeur pouvant être fusionnés | 3 |

---

## PHASE 1 — INVENTAIRE COMPLET DES ÉCRANS

### Tabs (navigation principale)

| Tab | Rôles qui le voient | Valeur métier |
|---|---|---|
| Dashboard (index) | Tous | CRITIQUE — point d'entrée universel |
| Members/Syndicats | super_admin, syndicate_admin | CRITIQUE — gestion des acteurs |
| Finance | super_admin, syndicate_admin | CRITIQUE — gestion financière |
| Marketplace | super_admin, syndicate_admin, member | IMPORTANT — commerce résidence |
| More | Tous | CRITIQUE — navigation secondaire |

### Écrans présents dans le code — liste exhaustive

| Écran | Route | Dans menu ? | Rôle actuel | Verdict |
|---|---|---|---|---|
| abonnements | /abonnements | ✅ | admin+member | KEEP |
| actes-administratifs | /actes-administratifs | ✅ | admin | KEEP |
| actions | /actions | ❌ | ? | KEEP + IMPROVE (relier au menu admin) |
| activity | /activity | ❌ | accessible via dashboard "Voir tout" | KEEP (lien existant OK) |
| agenda | /agenda | ❌ | ? | OPTIONAL — doublon avec meetings |
| alerts | /alerts | ❌ | ? | REVIEW — possiblement doublon de /notifications |
| annonces | /annonces | ✅ | tous | KEEP |
| assemblee-generale | /assemblee-generale | ✅ | admin+member | KEEP |
| bon-livraison | /bon-livraison | ✅ | admin | KEEP |
| budget-previsionnel | /budget-previsionnel | ✅ | admin | KEEP |
| buildings | /buildings | ✅ | admin | KEEP |
| calendar | /calendar | ❌ | ? | OPTIONAL — doublon avec agenda/meetings |
| cart | /cart | ✅ | member+admin | KEEP |
| cgu | /cgu | ✅ | tous | KEEP |
| charges | /charges | ✅ | admin+member | KEEP |
| chat | /chat | ✅ | tous | KEEP |
| chat-thread | /chat-thread | N/A | navigation interne | KEEP |
| cotisations | /cotisations | ❌ | ? | KEEP + IMPROVE (fusionner avec /charges pour member) |
| documents | /documents | ✅ | tous | KEEP |
| documents-dashboard | N/A | navigation interne | admin | KEEP |
| documents-recycle-bin | N/A | navigation interne | admin | KEEP |
| elected-members | /elected-members | ❌ | ? | KEEP + IMPROVE (relier depuis /elections) |
| elections | /elections | ✅ | admin+member | KEEP |
| equipe-syndic | /equipe-syndic | ❌ | ? | KEEP + IMPROVE (relier depuis dashboard admin) |
| escalation | /escalation | ✅ | admin | KEEP |
| etat-des-lieux | /etat-des-lieux | ✅ | tenant | KEEP |
| favorites | /favorites | ❌ | tous (via dashboard) | KEEP (lien existant OK) |
| fiches-paie | /fiches-paie | ❌ | admin | **MANQUANT — ajouter menu Finance** |
| forgot-password | /forgot-password | N/A | auth | KEEP |
| governance | /governance | ❌ | admin | **MANQUANT — ajouter menu AG** |
| ideas | /ideas | ❌ | tous | **MANQUANT — haute valeur participative** |
| invoices | /invoices | ✅ | admin | KEEP |
| journal-audit | /journal-audit | ✅ | super_admin | KEEP |
| legal | /legal | ✅ | admin | KEEP |
| locataires | /locataires | ✅ | admin | KEEP |
| login | /login | N/A | auth | KEEP |
| lots | /lots | ✅ | admin | KEEP |
| meetings | /meetings | ✅ | admin+member | KEEP |
| member-detail | N/A | navigation interne | admin | KEEP |
| messagerie-interne | /messagerie-interne | ✅ | tous | KEEP |
| mon-bail | /mon-bail | ✅ | tenant | KEEP |
| mon-lot | /mon-lot | ✅ | member+tenant | KEEP |
| my-shop | /my-shop | ✅ | member+admin | KEEP |
| notifications | /notifications | ✅ (×2 !) | tous | FIX — doublon |
| onboarding | /onboarding | N/A | first-run | KEEP |
| orders | /orders | ✅ | member+admin | KEEP |
| paiements | /paiements | ❌ | ? | **MANQUANT — haute valeur pour member+tenant** |
| parking | /parking | ✅ | tous | KEEP |
| partenaires | /partenaires | ❌ | ? | OPTIONAL — peut rester lien profond |
| pdf-viewer | N/A | navigation interne | tous | KEEP |
| prestataire-detail | N/A | navigation interne | admin | KEEP |
| prestataires | /prestataires | ✅ | admin | KEEP |
| product-detail | N/A | navigation interne | membre | KEEP |
| profile | /profile | ✅ | tous | KEEP |
| publications | /publications | ✅ | tous | KEEP |
| pv | /pv | ✅ | admin+member | KEEP |
| reclamations | /reclamations | ✅ | ⚠️ tous DONT tenant | **FIX — module RH pas pour tenant** |
| reglements | /reglements | ✅ | tous | KEEP |
| repertoire-juridique | ❌ | ? | OPTIONAL — fusionner avec /legal |
| reports | /reports | ✅ | admin | KEEP |
| reset-password | N/A | auth | KEEP |
| reviews | /reviews | ❌ | ? | OPTIONAL — avis prestataires |
| search | /search | N/A | tous (via header) | KEEP |
| settings | /settings | ✅ | tous | KEEP |
| simulateur | /simulateur | ❌ | ? | OPTIONAL — outil de simulation charges |
| sinistres | /sinistres | ✅ | tous | KEEP |
| statistiques | /statistiques | ✅ | admin | KEEP |
| support | /support | ✅ | tous | KEEP |
| syndicate-setup | /syndicate-setup | ✅ | super_admin | KEEP |
| tableau-bord-financier | ✅ (Finance tab) | mais absent du menu More | admin | **AJOUTER au menu More** |
| tableau-national | /tableau-national | ✅ | super_admin | KEEP |
| template-editor | N/A | navigation interne | admin | KEEP |
| template-request | /template-request | ✅ | syndicate_admin | KEEP |
| template-studio | N/A | navigation interne | admin | KEEP |
| transparency | /transparency | ❌ | ? | KEEP + IMPROVE (relier section legal) |
| travaux | /travaux | ✅ | tous | KEEP |
| travaux-privatifs | /travaux-privatifs | ✅ | tous | KEEP |
| utilisateurs | /utilisateurs | ✅ | super_admin | KEEP |
| workflow | /workflow | ❌ | ? | TECHNICAL — à garder en interne seulement |

---

## PHASE 2 — ANALYSE PAR RÔLE RÉEL

### 🏠 Ahmed — Copropriétaire (member)

**Que fait Ahmed chaque mois ?**
1. Consulte son appel de fonds → `/charges` ✅
2. Effectue son paiement → `/paiements` ❌ **MANQUANT DU MENU**
3. Consulte les travaux → `/travaux` ✅
4. Vote aux résolutions → `/elections` ✅
5. Lit les annonces → `/annonces` ✅
6. Consulte son appartement → `/mon-lot` ✅
7. Accède aux documents → `/documents` ✅
8. Ouvre les réunions → `/meetings` ✅

**Ahmed ouvrirait-il vraiment ces pages ?**
- `/tableau-national` → NON. Il ne voit pas. ✅ (admin only)
- `/journal-audit` → NON. Il ne voit pas. ✅ (super_admin only)
- `/budget-previsionnel` → NON. Il ne voit pas. ✅ (admin only)
- `/reclamations` → **Dépend**. Les réclamations RH (salaire, discrimination) ne le concernent pas directement. À conserver pour les membres qui pourraient déposer des réclamations contre des prestataires, mais le type doit être vérifié.

**Pages manquantes pour Ahmed :**
- `/paiements` — Historique de ses paiements (CRITIQUE pour confiance)
- `/ideas` — Boîte à idées participative (IMPORTANT)

---

### 🔑 Fatima — Locataire (tenant)

**Que fait Fatima chaque mois ?**
1. Consulte son bail → `/mon-bail` ✅
2. Déclare une panne → `/travaux` ✅
3. Signale un sinistre → `/sinistres` ✅
4. Accède à ses documents → `/documents` ✅
5. Lit les annonces → `/annonces` ✅
6. Contacte le gestionnaire → `/chat` ✅

**Fatima a-t-elle besoin de :**
- Rapports financiers ? → **NON** ✅ (masqué)
- Budgets prévisionnels ? → **NON** ✅ (masqué)
- Journal d'audit ? → **NON** ✅ (masqué)
- Réclamations RH ? → **NON** ⚠️ **BUG ACTUEL** — visible mais module RH interne
- Marketplace ? → **NON** ✅ (masqué)
- Assemblée Générale ? → **NON** ✅ (masqué — locataire n'est pas copropriétaire)
- Votes/élections ? → **NON** ✅ (masqué)

**Verdict Fatima :** Une correction majeure à faire (reclamations), le reste est correct.

---

### 💰 Trésorier / Admin Syndicat financier (syndicate_admin)

**Ce rôle a besoin de :**
- Charges & Appels de fonds → `/charges` ✅
- Tableau de bord financier → `/tableau-bord-financier` ✅ (Finance tab)
- Budget prévisionnel → `/budget-previsionnel` ✅
- Factures → `/invoices` ✅
- Rapports financiers → `/reports` ✅
- Recouvrement/Escalation → `/escalation` ✅
- Fiches de paie → `/fiches-paie` ❌ **MANQUANT DU MENU**
- Bon de livraison → `/bon-livraison` ✅

**Pages inutiles pour ce rôle :** Aucune — le menu finance admin est bien construit.

---

### 📋 Secrétaire / Admin Syndicat (syndicate_admin)

**Ce rôle a besoin de :**
- Réunions → `/meetings` ✅
- PV → `/pv` ✅
- Documents → `/documents` ✅
- Actes administratifs → `/actes-administratifs` ✅
- Publications → `/publications` ✅
- Convocations → via `/meetings` ✅
- Gouvernance → `/governance` ❌ **MANQUANT DU MENU**

---

### 🏛️ Président / Admin Syndicat (syndicate_admin)

**Ce rôle a besoin de :**
- Assemblées générales → `/assemblee-generale` ✅
- Gouvernance → `/governance` ❌ **MANQUANT DU MENU**
- Élections du conseil → `/elections` ✅
- Membres élus → `/elected-members` ❌ accessible depuis /elections seulement
- Approbations de membres → dans `/members` tab ✅
- Statistiques → `/statistiques` ✅

---

### 🛡️ Super Admin

**Pages visitées par un vrai admin SaaS :**
- Gestion des syndicats → tab Members ✅ (CRITIQUE)
- Tableau national → `/tableau-national` ✅ (CRITIQUE)
- Statistiques globales → `/statistiques` ✅ (CRITIQUE)
- Journal d'audit → `/journal-audit` ✅ (CRITIQUE)
- Gestion utilisateurs → `/utilisateurs` ✅ (CRITIQUE)
- Créer syndicat → `/syndicate-setup` ✅ (CRITIQUE)
- Revenus → Finance tab ✅ (CRITIQUE)

**Pages à valeur opérationnelle limitée pour super_admin :**
- `/pv` — Le super_admin ne lit pas les PV de chaque syndicat individuellement. Mais c'est acceptable pour supervision.
- `/marketplace` — Supervision de la plateforme + modération, valeur réelle.
- `/chat` — Communication inter-syndicats, valeur supervisory.

**Pages techniques ou inutiles :**
- `/workflow` — Page technique interne, pas dans le menu (correct ✅)
- `/calendar` — Doublon avec agenda/meetings, pas dans le menu (correct ✅)
- `/agenda` — Doublon avec meetings, pas dans le menu (correct ✅)

---

## PHASE 3 — CLASSIFICATION VALEUR PAR ÉCRAN

### 🔴 CRITIQUE (Daily use)

| Écran | Rôles | Fréquence |
|---|---|---|
| Dashboard | Tous | Daily |
| Charges/Appels de fonds | admin, member | Monthly |
| Paiements | member, tenant | Monthly |
| Notifications | Tous | Daily |
| Chat | Tous | Daily |
| Documents | Tous | Weekly |
| Travaux | Tous | As needed |
| Réunions | admin, member | Monthly |

### 🟡 IMPORTANT (Weekly use)

| Écran | Rôles | Fréquence |
|---|---|---|
| Membres/Copropriétaires | admin | Weekly |
| Budget prévisionnel | admin | Monthly |
| Élections | admin, member | Per event |
| Annonces | Tous | Weekly |
| PV assemblées | admin, member | Per event |
| Prestataires | admin | Monthly |
| Sinistres | tous | As needed |

### 🟢 OPTIONAL (Monthly/Event-based)

| Écran | Rôles | Fréquence |
|---|---|---|
| Marketplace | member, admin | As needed |
| Abonnements | admin, member | Quarterly |
| Governance | admin | Per event |
| Ideas | tous | As needed |
| Fiches de paie | admin | Monthly |
| Tableau national | super_admin | Weekly |
| Statistiques | admin | Monthly |
| Escalation | admin | As needed |

### ❌ USELESS / TECHNICAL (Never or hidden)

| Écran | Verdict |
|---|---|
| /workflow | Technique — ne pas exposer |
| /calendar | Doublon exact de /meetings |
| /agenda | Doublon exact de /meetings |
| /partenaires | Fonctionnellement identique à /prestataires |
| /reviews | Faible utilisation projetée sans implémentation complète |
| /simulateur | Potentiel mais non connecté aux données réelles |
| /repertoire-juridique | Doublon de /legal + /reglements |

---

## PHASE 4 — MATRICE RÔLE × ÉCRAN × ACTION

### super_admin

**Visible :** Dashboard, Syndicats, Finance, Marketplace (modération), More complet
**More sections :** Gestion Immeuble (tous), Finance (tout), Maintenance, AG, Documents Légaux, Communication, Support, Admin Plateforme, Abonnements, Compte

**Actions disponibles :** Créer syndicat, activer/désactiver syndicats, gérer utilisateurs, voir journal d'audit, accéder aux statistiques nationales, modérer marketplace

**Masqué (correct) :** Mon Logement (section tenant), Mon Bail, État des lieux

---

### syndicate_admin

**Visible :** Dashboard, Membres, Finance, Marketplace, More complet
**More sections :** Gestion Immeuble, Finance, Maintenance, AG, Documents Légaux, Communication, Support, Marketplace (admin), Statistiques, Abonnements, Compte

**Actions disponibles :** Gérer membres, créer appels de fonds, budgéter, convoquer AG, gérer prestataires, modérer marketplace local, générer documents

**Masqué (correct) :** Tableau national, Journal audit, Gestion utilisateurs globale, Mon Logement/Mon Bail

**Manquant (à corriger) :** Governance, Fiches de paie dans le menu More

---

### member (Copropriétaire)

**Visible :** Dashboard, Marketplace, More partiel
**More sections :** Mon Appartement (1 item), Finance (charges seulement), Maintenance, AG, Documents Légaux, Communication, Support, Marketplace, Abonnements, Compte

**Actions disponibles :** Payer charges, voter, consulter documents, signaler travaux, utiliser marketplace, voir son appartement, chatter

**Masqué (correct) :** Budgets, rapports, prestataires, liste membres complète, administration

**Manquant (à corriger) :** /paiements, /ideas

---

### tenant (Locataire)

**Visible :** Dashboard, More très limité
**More sections :** Mon Logement (3 items), Maintenance, Documents Légaux, Communication, Support, Compte

**Actions disponibles :** Voir bail, état des lieux, signaler travaux, sinistres, travaux privatifs, parking, chatter, accéder documents, règlements

**Masqué (correct) :** Finance, Budget, Marketplace, Assemblées générales, Votes, Membres

**Bug (à corriger) :** /reclamations visible (module RH interne — hors scope tenant)

---

## PHASE 5 — PARCOURS MÉTIER COMPLETS

### Parcours Copropriétaire — Paiement mensuel (INCOMPLET)

```
1. Dashboard → voir montant dû ✅
2. Quick action "Charges" → voir détail appel de fonds ✅
3. Payer → ??? ❌ MANQUANT (il n'y a pas de bouton de paiement visible)
4. Confirmer paiement → ??? ❌
5. Consulter historique → /paiements ❌ (écran existe mais pas dans le menu)
```
**Verdict :** Le flux de paiement est cassé. L'écran /paiements existe mais est inaccessible depuis le menu.

### Parcours Admin — Recouvrement (OK)

```
1. Dashboard → voir cotisations en retard ✅
2. Finance tab → Charges & Appels ✅
3. Escalation → relance automatique ✅
4. Notification membre → push + email ✅
```
**Verdict :** Flux correct mais /fiches-paie manque d'accès menu.

### Parcours Locataire — Signalement panne (OK)

```
1. Dashboard → Quick action Travaux ✅
2. /travaux → déclarer nouvelle panne ✅
3. Notification admin → système push ✅
4. Suivi statut → via /travaux ✅
```
**Verdict :** Flux complet et fonctionnel.

### Parcours Admin — Convocation AG (OK)

```
1. More → Assemblée Générale → /assemblee-generale ✅
2. Créer réunion → /meetings ✅
3. Rédiger PV → /pv ✅
4. Publier annonce → /annonces ✅
```
**Verdict :** Flux correct. Governance manque d'accès facile depuis le menu.

---

## PHASE 6 — PLAN DE NETTOYAGE

### ✅ KEEP (Garder tel quel)

Tous les écrans de la section Finance admin, Maintenance (tous rôles), AG (admin+member), Documents, Communication, Support, Account, Admin Platform.

### ✅ KEEP + IMPROVE (Garder et améliorer)

| Écran | Action |
|---|---|
| /ideas | **Ajouter au menu Communication (tous rôles)** |
| /governance | **Ajouter au menu AG (admin)** |
| /fiches-paie | **Ajouter au menu Finance (admin)** |
| /paiements | **Ajouter au menu Finance (member + tenant)** |
| /tableau-bord-financier | **Ajouter au menu More Finance section (admin)** |
| /elected-members | Lier depuis /elections (navigation interne OK) |
| /equipe-syndic | Lier depuis dashboard admin ou profil syndicat |
| /transparency | Lier depuis section Legal (admin) |
| /cotisations | Intégrer à /charges pour member (doublon partiel) |

### 🚫 HIDE FOR SOME ROLES (Masquer pour certains rôles)

| Écran | Action |
|---|---|
| /reclamations | **Retirer tenant** — module RH interne (salaire, discrimination, harcèlement) pas destiné aux locataires |
| /notifications | **Retirer doublon** du menu Communication (déjà dans Account) |

### ❌ DELETE / KEEP HIDDEN (Supprimer ou garder caché)

| Écran | Raison |
|---|---|
| /workflow | Page technique, ne jamais exposer dans le menu |
| /calendar | Doublon exact de /meetings |
| /agenda | Doublon exact de /meetings |
| /partenaires | Doublon fonctionnel de /prestataires |
| /simulateur | Non connecté aux données — laisser comme outil interne |
| /repertoire-juridique | Doublon de /legal + /reglements |

---

## IMPLÉMENTATION RÉALISÉE

Les corrections suivantes ont été appliquées directement dans `artifacts/mobile/app/(tabs)/more.tsx` :

### 1. ✅ Suppression du doublon notifications
**Avant :** Section Communication contenait "alerts" → /notifications ET section Account avait "notifications" → /notifications (même route deux fois)  
**Après :** Supprimé de Communication, conservé en Account uniquement

### 2. ✅ Ajout /paiements (member + tenant)
**Section Finance :** Nouvelle entrée "Historique des Paiements" pour member et tenant

### 3. ✅ Ajout /tableau-bord-financier au menu More
**Section Finance :** Tableau de Bord Financier en tête de la section pour admin (déjà dans Finance tab, maintenant aussi accessible via More)

### 4. ✅ Ajout /fiches-paie (admin)
**Section Finance :** Nouvelle entrée "Fiches de Paie" pour super_admin et syndicate_admin

### 5. ✅ Ajout /governance (admin)
**Section AG :** Nouvelle entrée "Gouvernance" pour super_admin et syndicate_admin

### 6. ✅ Ajout /ideas (tous rôles)
**Section Communication :** Nouvelle entrée "Idées & Propositions" pour tous les rôles

### 7. ✅ Correction module RH Réclamations
**Avant :** visible par super_admin, syndicate_admin, member, **tenant**  
**Après :** visible par super_admin, syndicate_admin, member uniquement  
**Raison métier :** Le module /reclamations concerne les réclamations RH (salaire, discrimination, harcèlement) — un locataire n'est pas un employé et ne doit pas voir ce module

---

## RECOMMANDATIONS FUTURES

1. **Flux de paiement** : Ajouter un CTA "Payer maintenant" dans /charges qui navigue vers /paiements
2. **Elected Members** : Ajouter lien "Voir le conseil élu" depuis /elections
3. **Équipe syndic** : Exposer /equipe-syndic depuis le profil ou le dashboard admin
4. **Transparency** : Ajouter dans section Legal pour super_admin (transparence réglementaire)
5. **Simulateur** : Connecter aux vraies données avant d'exposer dans le menu
6. **Cotisations** : Décider si c'est un doublon de /charges ou un écran distinct à exposer
7. **Reviews** : Exposer depuis /prestataire-detail plutôt que le menu global
