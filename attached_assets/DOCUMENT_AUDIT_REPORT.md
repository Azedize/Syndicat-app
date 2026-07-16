# SYNDYCAT GLOBAL CPS — Document Template Audit Report
**Date:** Juillet 2026 · **Auditeur:** Agent Architecte Documentaire Senior  
**Périmètre:** 24 templates · 7 catégories · moteur PDF pdfmake · base PostgreSQL/Drizzle

---

## SYNTHÈSE EXÉCUTIVE

| Indicateur | État |
|---|---|
| Templates analysés | 24 |
| Templates prêts production | 8 / 24 (33 %) |
| Templates avec données auto | 14 / 24 |
| **Templates financiers critiques MANQUANTS** | **5** |
| **Template élection MANQUANT** | **1** |
| Templates avec placeholders codés en dur | 11 |
| Champs DB disponibles mais NON chargés | 14+ |

**Verdict :** Le moteur PDF est visuellement premium (post-redesign). Les problèmes sont maintenant d'ordre *fonctionnel* — des données critiques existent en base mais ne sont pas injectées, et 6 templates indispensables à la gestion de copropriété sont entièrement absents.

---

## DONNÉES AUTO-CHARGÉES PAR LE SYSTÈME (état actuel)

Le serveur charge automatiquement avant toute génération :

```
getSyndicateInfo()   → name, address, city, phone, email, website,
                       registrationNumber, iceNumber, rcNumber,
                       logoUrl, logoColor, abbreviation
getPropertyInfo()    → name, address, city, totalBuildings, totalFloors,
                       totalLots, totalSurfaceM2, landRegistryReference, lots[]
getOfficeHolders()   → president, vicePresident, secretary, treasurer, manager
generateDocNumber()  → numéro séquentiel (ex: ATT-2026-0042)
generateQR()         → QR code + URL de vérification unique
```

**Ces données ne doivent JAMAIS être demandées manuellement à l'utilisateur.**

---

## STEP 1–3 · AUDIT COMPLET PAR TEMPLATE

---

### CATÉGORIE 1 — ATTESTATIONS · Thème : `#065f46` (Vert émeraude)

---

#### 1. `attestation` — Attestation Générale

| Champ | Source | État |
|---|---|---|
| Nom du syndicat | `syndicatesTable.name` | ✅ Auto |
| Adresse, contact | `syndicatesTable` | ✅ Auto |
| N° document | Séquence DB | ✅ Auto |
| QR vérification | Généré | ✅ Auto |
| Président / Trésorier / Secrétaire | `conseilSyndicalTable` | ✅ Auto |
| Nom du bénéficiaire | Request body | ⚠️ Manuel |
| Objet de l'attestation | Request body | ⚠️ Manuel |
| Date de validité | Non implémenté | ❌ Manquant |

**Problèmes :**
- Si le bénéficiaire est un membre connu (`membersTable`), son nom/appartement/immeuble devraient être chargés automatiquement par `memberId`.
- Pas de champ "date d'expiration" alors que le système dispose d'`expiresAt` dans `documentsTable`.

**Données DB disponibles mais non utilisées :**
- `membersTable.name`, `membersTable.email`, `lotsTable.number` (appartement du membre)

**Recommandation :** Ajouter un paramètre `memberId` optionnel. Si fourni, charger automatiquement nom + appartement + immeuble.

**Maturité production :** 🟡 70% — Fonctionnel, enrichissement membre requis.

---

#### 2. `attestation_residence` — Attestation de Résidence

| Champ | Source | État |
|---|---|---|
| Nom du syndicat | `syndicatesTable` | ✅ Auto |
| Référence foncière | `buildingsTable.registrationNumber` | ✅ Auto (si buildingId) |
| Nom du résident | Request body | ⚠️ Manuel |
| N° appartement | `lotsTable.number` | ⚠️ Non chargé automatiquement |
| Étage | `lotsTable.floor` | ⚠️ Non chargé automatiquement |
| Surface | `lotsTable.surfaceM2` | ⚠️ Non chargé automatiquement |
| Titre foncier du lot | `lotsTable.titreFoncier` | ⚠️ Non chargé automatiquement |

**Problème critique :** L'attestation de résidence doit certifier les données cadastrales d'un lot précis. Ces données existent dans `lotsTable` mais ne sont pas chargées. L'utilisateur doit les saisir manuellement — risque d'erreur sur document officiel.

**Données DB disponibles mais non utilisées :**
```
lotsTable.number, lotsTable.floor, lotsTable.surfaceM2, 
lotsTable.titreFoncier, lotsTable.type, lotsTable.tantiemes
```

**Recommandation :** Ajouter `lotId` comme paramètre. Charger toutes les données du lot automatiquement.

**Maturité production :** 🔴 45% — Données cadastrales critiques manquantes.

---

#### 3. `attestation_propriete` — Attestation de Propriété

| Champ | Source | État |
|---|---|---|
| Propriétaire | `membersTable.name` | ⚠️ Manuel |
| Lot(s) possédé(s) | `lotsTable` via `memberId` | ⚠️ Partiellement |
| Titre foncier | `lotsTable.titreFoncier` | ⚠️ Non chargé |
| Tantiemes | `lotsTable.tantiemes` | ❌ Non utilisé |
| Date d'acquisition | Non présent en DB | ❌ Absent |

**Problème :** Document légalement sensible. Les informations foncières (titre foncier, tantiemes) doivent être certifiées exactes. Elles existent en DB mais pas auto-injectées.

**Maturité production :** 🔴 40% — Document légal avec données manuelles = risque juridique.

---

#### 4. `attestation_paiement` — Attestation de Paiement

| Champ | Source | État |
|---|---|---|
| Payeur | Request body | ⚠️ Manuel |
| Montant | Request body | ⚠️ Manuel |
| Période | Request body | ⚠️ Manuel |
| N° appel de fonds | `appelsDeFondsTable.id` | ❌ Non lié |
| N° reçu | `appelsDeFondsTable.receiptNumber` | ❌ Non lié |
| Solde restant | Calculé depuis transactions | ❌ Absent |

**Problème critique :** `appelsDeFondsTable` contient `amount`, `dueDate`, `status`, `receiptNumber`. Ces données devraient être chargées automatiquement via `appelDeFondsId`. Actuellement, l'utilisateur ressaisit à la main des données existantes.

**Maturité production :** 🔴 30% — Toutes les données financières sont manuelles alors que la DB les contient.

---

### CATÉGORIE 2 — RÉUNIONS & PV · Thème : `#1e3a8a` (Bleu marine)

---

#### 5. `pv` — Procès-Verbal d'Assemblée Générale

| Champ | Source | État |
|---|---|---|
| Syndicat, président, secrétaire | Auto | ✅ Auto |
| Date de réunion | `meetingsTable.date` | ⚠️ Non lié à meetingsTable |
| Lieu | `meetingsTable.location` | ⚠️ Manuel |
| Type AG | `meetingsTable.type` | ⚠️ Manuel |
| Ordre du jour | `meetingsTable.agenda` | ⚠️ Manuel |
| Délibérations | Request body | ⚠️ Manuel |
| Résolutions | Request body | ⚠️ Manuel |
| Participants | Pas de table meetings_participants | ❌ Absent |
| Quorum | Non calculé | ❌ Absent |
| Résultats votes | Non relié | ❌ Absent |

**Problème majeur :** La table `meetingsTable` existe avec `date`, `time`, `location`, `type`, `agenda`, `status`. Le PV n'est pas lié à une réunion existante par `meetingId`. Chaque PV devrait être généré à partir d'une réunion créée dans le module réunions.

**Données DB disponibles mais non utilisées :**
```
meetingsTable.date, meetingsTable.time, meetingsTable.location,
meetingsTable.type, meetingsTable.agenda, meetingsTable.status
```

**Recommandation :** Ajouter `meetingId` comme paramètre obligatoire pour ce template. Charger toutes les métadonnées de la réunion automatiquement.

**Maturité production :** 🔴 40% — PV déconnecté du module réunions.

---

#### 6. `convocation` — Convocation à Réunion

| Champ | Source | État |
|---|---|---|
| Syndicat, président | Auto | ✅ Auto |
| Date/heure de réunion | Request body | ⚠️ Manuel |
| Lieu | Request body | ⚠️ Manuel |
| Ordre du jour | Request body | ⚠️ Manuel |
| Destinataire | `membersTable` | ⚠️ Non lié |
| Mode d'envoi | Non géré | ❌ Absent |

**Recommandation :** Lier à `meetingId` si la réunion est déjà planifiée. Permettre génération en masse par immeuble (tous les propriétaires d'un `buildingId`).

**Maturité production :** 🟡 60% — Fonctionnel, mais la convocation de masse manque.

---

#### 7. `compte_rendu` — Compte Rendu de Réunion

| Champ | Source | État |
|---|---|---|
| Métadonnées réunion | `meetingsTable` | ⚠️ Non lié |
| Participants | Manual | ⚠️ Manuel |
| Points abordés | Request body | ⚠️ Manuel |
| Décisions | Request body | ⚠️ Manuel |

**Maturité production :** 🟡 55% — Même problème que PV : déconnecté de meetingsTable.

---

### CATÉGORIE 3 — DOCUMENTS FINANCIERS · Thème : `#064e3b` (Vert foncé)

---

#### 8. `rapport_financier` — Rapport Financier

| Champ | Source | État |
|---|---|---|
| Syndicat, exercice | Auto / body | ⚠️ Exercice manuel |
| Lignes budgétaires | `budgetsTable` | ❌ Non chargé |
| Charges totales | `appelsDeFondsTable` | ❌ Non calculé |
| Recettes | `invoicesTable` | ❌ Non calculé |
| Soldes | Calculé | ❌ Absent |
| Taux de recouvrement | Calculé | ❌ Absent |

**Problème critique :** `budgetsTable` contient `year`, `totalAmount`, `chargesAmount`, `fondsReserve`. `appelsDeFondsTable` contient les charges par lot. Le rapport financier ne charge rien de tout cela — toutes les données sont saisies manuellement dans le corps du texte.

**Données DB disponibles mais non utilisées :**
```
budgetsTable.year, budgetsTable.totalAmount, budgetsTable.chargesAmount,
budgetsTable.fondsReserve, appelsDeFondsTable (montants agrégés par statut),
invoicesTable (recettes)
```

**Maturité production :** 🔴 25% — Le rapport financier le plus important de la copropriété est rempli manuellement.

---

#### 9. `rapport_audit` — Rapport d'Audit

| Champ | Source | État |
|---|---|---|
| Auditeur | Request body | ⚠️ Manuel |
| Constats | Request body | ⚠️ Manuel |
| Données auditées | Non chargées | ❌ Absent |

**Maturité production :** 🟡 50% — Document narratif acceptable mais sans données DB.

---

### CATÉGORIE 4 — CONTRATS · Thème : `#0f2d52` (Bleu nuit)

---

#### 10. `contrat` — Contrat de Prestation

| Champ | Source | État |
|---|---|---|
| Syndicat (maître d'ouvrage) | Auto | ✅ Auto |
| Prestataire | Request body | ⚠️ Manuel |
| Immeuble concerné | `buildingsTable` | ⚠️ Partiel |
| Montant | Request body | ⚠️ Manuel |
| Durée | Request body | ⚠️ Manuel |
| Référence travaux | `travauxTable.id` | ❌ Non lié |
| N° contrat | Séquence | ✅ Auto |

**Données DB disponibles mais non utilisées :**
```
travauxTable.title, travauxTable.description, travauxTable.estimatedAmount,
travauxTable.startDate, travauxTable.endDate, prestatairesTable.name
```

**Recommandation :** Lier optionnellement à `travauxId`. Charger prestataire et montant estimé depuis `travauxTable`.

**Maturité production :** 🟡 65% — Fonctionnel, mais enrichissement travaux manquant.

---

#### 11. `convention_partenariat` — Convention de Partenariat

| Champ | Source | État |
|---|---|---|
| Syndicat | Auto | ✅ Auto |
| Partenaires | Request body | ⚠️ Manuel |
| Objectifs / Engagements | Request body | ⚠️ Manuel |

**Maturité production :** 🟢 75% — Document narratif, saisie manuelle acceptable.

---

#### 12. `accord_collectif` — Accord Collectif

**Maturité production :** 🟢 75% — Idem convention, document narratif.

---

### CATÉGORIE 5 — RÉGLEMENTAIRE · Thème : `#312e81` (Indigo)

---

#### 13. `reglement` — Règlement de Copropriété

| Champ | Source | État |
|---|---|---|
| Syndicat | Auto | ✅ Auto |
| Immeuble (nom, adresse, étages, lots) | `buildingsTable` + `lotsTable` | ✅ Auto si buildingId |
| Référence foncière | `buildingsTable.registrationNumber` | ✅ Auto |
| Bureau syndical (Président, etc.) | `conseilSyndicalTable` | ✅ Auto |
| Répartition des charges par lot | `lotsTable.tantiemes` | ⚠️ Non généré en tableau |
| Liste des lots avec descriptions | `lotsTable` | ⚠️ Partiel |

**Recommandation :** Générer automatiquement le tableau de répartition des charges depuis `lotsTable.tantiemes`.

**Maturité production :** 🟢 80% — Le mieux connecté à la DB. Tableau tantiemes à ajouter.

---

#### 14. `decision` — Décision Officielle

| Champ | Source | État |
|---|---|---|
| Syndicat | Auto | ✅ Auto |
| Organe décisionnel | Request body | ⚠️ Manuel |
| Considérants | Request body | ⚠️ Manuel |
| Décision | Request body | ⚠️ Manuel |

**Maturité production :** 🟢 75% — Document narratif, acceptable.

---

### CATÉGORIE 6 — CORRESPONDANCE OFFICIELLE · Thème : `#475569` (Ardoise)

---

#### 15. `circulaire` — Circulaire

| Champ | Source | État |
|---|---|---|
| Syndicat, Président | Auto | ✅ Auto |
| Destinataires | `membersTable` | ⚠️ Manuel (pas de liste auto) |
| Priorité, Corps | Request body | ⚠️ Manuel |

**Maturité production :** 🟢 70% — Fonctionnel. Envoi groupé non géré.

---

#### 16. `mise_en_demeure` — Mise en Demeure

| Champ | Source | État |
|---|---|---|
| Syndicat | Auto | ✅ Auto |
| Débiteur | Request body | ⚠️ Manuel |
| Montant dû | `appelsDeFondsTable` / solde membre | ❌ Non chargé |
| Délai | Request body | ⚠️ Manuel |
| Mode d'envoi | Request body | ⚠️ Manuel |

**Problème :** La mise en demeure devrait auto-remplir le montant impayé depuis le solde du membre dans `appelsDeFondsTable`. L'escalade de dette est déjà gérée par le backend — ces données existent.

**Maturité production :** 🟡 55% — Le montant dû devrait être automatique.

---

#### 17. `lettre_officielle` — Lettre Officielle

**Maturité production :** 🟢 75% — Document narratif libre.

---

#### 18. `note_interne` — Note Interne

**Maturité production :** 🟢 75% — Document narratif interne.

---

#### 19. `demande_administrative` — Demande Administrative

**Maturité production :** 🟡 60% — Nom demandeur devrait venir de l'utilisateur connecté.

---

#### 20. `autorisation` — Autorisation

**Maturité production :** 🟡 60% — Bénéficiaire devrait venir de `membersTable` si membre.

---

#### 21. `ordre_de_mission` — Ordre de Mission

**Maturité production :** 🟢 70% — Document interne acceptable.

---

### CATÉGORIE 7 — RAPPORTS GÉNÉRAUX

---

#### 22. `rapport` — Rapport d'Activité Général

**Maturité production :** 🟡 60% — Narratif mais sans données DB.

---

#### 23. `rapport_activite` — Rapport d'Activité Détaillé

**Maturité production :** 🟡 60% — Idem.

---

#### 24. `certificat` — Certificat

**Maturité production :** 🟢 75% — Fonctionnel.

---

## STEP 4 · AUDIT FINANCIER — TEMPLATES CRITIQUES MANQUANTS 🔴

**C'est le gap le plus critique.** Un système de gestion de copropriété DOIT avoir ces 5 templates — aucun n'existe aujourd'hui :

---

### TEMPLATE MANQUANT A — `appel_de_fonds` (Appel de Fonds)

**Usage :** Notification officielle envoyée aux copropriétaires pour le paiement de leur quote-part des charges.  
**Fréquence :** Trimestrielle ou semestrielle. Document le plus généré du système.

**Données disponibles en DB :**
```sql
appelsDeFondsTable:
  period, type, amount, dueDate, status, receiptNumber
  → lotId → lotsTable (number, floor, surfaceM2, tantiemes)
  → ownerId → membersTable (name, email, phone)
  → buildingId → buildingsTable (name, address)
```

**Structure de document requise :**
- En-tête syndicat premium
- Encart identité copropriétaire (nom, lot, immeuble, tantiemes)
- Tableau des charges (type, montant, période, échéance)
- Détail de calcul (tantiemes × budget total)
- Solde courant et historique
- Section paiement (RIB, virement, chèque)
- QR vérification
- Cachet officiel

---

### TEMPLATE MANQUANT B — `facture` (Facture)

**Usage :** Facturation de services, travaux, charges exceptionnelles.

**Données disponibles en DB :**
```sql
invoicesTable: reference, type, recipient, date, dueDate, status, amount
travauxTable: title, estimatedAmount, actualAmount
```

**Structure requise :** N° facture · ICE syndicat · Tableau lignes · TVA · Total · Échéance · Coordonnées paiement.

---

### TEMPLATE MANQUANT C — `recu_paiement` (Reçu de Paiement)

**Usage :** Preuve de paiement émise au copropriétaire après règlement.  
**Base légale :** Document comptable obligatoire.

**Données disponibles en DB :**
```sql
appelsDeFondsTable.receiptNumber, .amount, .status (paid)
membersTable (payeur)
```

**Structure requise :** N° reçu · Date paiement · Montant · Mode paiement · Période couverte · Cachet + signature.

---

### TEMPLATE MANQUANT D — `budget_previsionnel` (Budget Prévisionnel)

**Usage :** Présentation du budget annuel voté en AG.

**Données disponibles en DB :**
```sql
budgetsTable: year, totalAmount, chargesAmount, fondsReserve, status
buildingsTable: name
```

**Structure requise :** Tableau postes budgétaires · Répartition par lot (tantiemes) · Fonds de réserve · Comparatif N-1 · Signatures AG.

---

### TEMPLATE MANQUANT E — `decompte_charges` (Décompte de Charges)

**Usage :** Décompte annuel des charges réelles vs. provisions versées par copropriétaire.

**Structure requise :** Provisions versées · Charges réelles · Différentiel (rappel ou avoir) · Tableau détaillé.

---

## STEP 6 · AUDIT ÉLECTIONS — TEMPLATE MANQUANT 🔴

---

### TEMPLATE MANQUANT F — `rapport_election` (Rapport d'Élection)

**Usage :** PV officiel des élections du conseil syndical. Document légalement requis.

**Données disponibles en DB :**
```sql
electionsTable:
  title, electionType, votingMethod, quorumPercent, status,
  startDate, endDate, eligibleCount, participantCount
  → (candidats, résultats, mandats — tables à vérifier)
```

**Structure requise :**
- Titre élection + type + date
- Quorum atteint/non atteint (participantCount / eligibleCount)
- Tableau candidats avec scores
- Résultats par poste (Président, Trésorier, Secrétaire)
- Mandats (durée, date entrée en fonction)
- Signatures : scrutateurs + président de séance
- Cachet officiel

---

## STEP 9 · DOCUMENT INTELLIGENCE — ÉVALUATION DU SYSTÈME ACTUEL

### Ce qui fonctionne ✅
- Auto-chargement syndicat, immeuble, bureau syndical
- Numérotation séquentielle par type (ATT-2026-0042)
- QR de vérification unique par document
- `/documents/preview` endpoint — résout les variables sans générer le PDF

### Ce qui doit être implémenté ❌

**1. Liaison par entité (`entityId`)**

Chaque template doit accepter un identifiant d'entité source :

| Template | Paramètre à ajouter | Table source |
|---|---|---|
| pv, compte_rendu | `meetingId` | `meetingsTable` |
| attestation_paiement | `appelDeFondsId` | `appelsDeFondsTable` |
| appel_de_fonds *(manquant)* | `appelDeFondsId` | `appelsDeFondsTable` |
| attestation_residence/propriete | `lotId` + `memberId` | `lotsTable + membersTable` |
| contrat | `travauxId` | `travauxTable` |
| rapport_financier | `budgetId` | `budgetsTable` |
| rapport_election *(manquant)* | `electionId` | `electionsTable` |
| mise_en_demeure | `memberId` | `appelsDeFondsTable` (solde) |

**2. Chargement du solde membre**

Pour `attestation_paiement` et `mise_en_demeure`, calculer :
```sql
SELECT SUM(amount) FILTER (WHERE status != 'paid') AS solde_impaye
FROM appels_de_fonds WHERE owner_id = $memberId
```

**3. Génération en masse**

`convocation` et `circulaire` devraient supporter la génération d'un PDF par membre d'un immeuble en une seule requête.

**4. Auto-détection des champs manquants**

Étendre le `/documents/preview` endpoint pour retourner :
```json
{
  "autoResolved": { "syndicateName": "...", "presidentName": "..." },
  "requiresUserInput": ["deliberationsText", "resolutionsText"],
  "canAutoLoadIfProvided": { "meetingId": ["date", "location", "agenda"] }
}
```

---

## STEP 10 · RAPPORT FINAL PAR TEMPLATE

| # | Template | Maturité | Gap Principal | Priorité Fix |
|---|---|---|---|---|
| 1 | attestation | 🟡 70% | memberId non lié | P3 |
| 2 | attestation_residence | 🔴 45% | lotId non chargé | **P1** |
| 3 | attestation_propriete | 🔴 40% | lotId + memberId non chargés | **P1** |
| 4 | attestation_paiement | 🔴 30% | appelDeFondsId non lié, tout est manuel | **P1** |
| 5 | pv | 🔴 40% | meetingId non lié | **P1** |
| 6 | convocation | 🟡 60% | meetingId non lié, pas de masse | P2 |
| 7 | compte_rendu | 🟡 55% | meetingId non lié | P2 |
| 8 | rapport_financier | 🔴 25% | budgetId non lié, tout est manuel | **P1** |
| 9 | rapport_audit | 🟡 50% | Narratif acceptable | P3 |
| 10 | contrat | 🟡 65% | travauxId non lié | P2 |
| 11 | convention_partenariat | 🟢 75% | Narratif acceptable | P4 |
| 12 | accord_collectif | 🟢 75% | Narratif acceptable | P4 |
| 13 | reglement | 🟢 80% | Tableau tantiemes à générer | P3 |
| 14 | decision | 🟢 75% | Acceptable | P4 |
| 15 | circulaire | 🟢 70% | Destinataires non auto | P3 |
| 16 | mise_en_demeure | 🟡 55% | Solde impayé non auto | P2 |
| 17 | lettre_officielle | 🟢 75% | Acceptable | P4 |
| 18 | note_interne | 🟢 75% | Acceptable | P4 |
| 19 | demande_administrative | 🟡 60% | Demandeur non auto | P3 |
| 20 | autorisation | 🟡 60% | Bénéficiaire non auto | P3 |
| 21 | ordre_de_mission | 🟢 70% | Acceptable | P4 |
| 22 | rapport | 🟡 60% | Narratif sans DB | P3 |
| 23 | rapport_activite | 🟡 60% | Narratif sans DB | P3 |
| 24 | certificat | 🟢 75% | Acceptable | P4 |
| A | **appel_de_fonds** | ❌ ABSENT | Template inexistant | **P0** |
| B | **facture** | ❌ ABSENT | Template inexistant | **P0** |
| C | **recu_paiement** | ❌ ABSENT | Template inexistant | **P0** |
| D | **budget_previsionnel** | ❌ ABSENT | Template inexistant | **P0** |
| E | **decompte_charges** | ❌ ABSENT | Template inexistant | **P1** |
| F | **rapport_election** | ❌ ABSENT | Template inexistant | **P1** |

---

## PLAN D'ACTION RECOMMANDÉ

### Sprint 1 — P0 : Templates financiers manquants (semaine 1–2)
1. Créer `appel_de_fonds` avec chargement auto depuis `appelsDeFondsTable + lotsTable + membersTable`
2. Créer `recu_paiement` avec liaison `appelDeFondsId`
3. Créer `facture` avec liaison `invoiceId`
4. Créer `budget_previsionnel` avec liaison `budgetId + buildingId`

### Sprint 2 — P1 : Liaison entité manquante (semaine 3–4)
5. Ajouter `meetingId` dans pv, convocation, compte_rendu — charger meetingsTable
6. Ajouter `lotId + memberId` dans attestation_residence, attestation_propriete
7. Ajouter `appelDeFondsId` dans attestation_paiement
8. Ajouter `budgetId` dans rapport_financier — charger budgetsTable
9. Créer `rapport_election` avec liaison `electionId`

### Sprint 3 — P2 : Enrichissement (semaine 5)
10. Solde impayé auto dans mise_en_demeure via `memberId`
11. Liaison `travauxId` dans contrat
12. Tableau tantiemes auto dans règlement

### Sprint 4 — P3 : Intelligence documentaire (semaine 6)
13. Étendre `/documents/preview` avec `requiresUserInput` vs `canAutoLoadIfProvided`
14. Génération convocation en masse par `buildingId`
15. Auto-fill demandeur depuis utilisateur connecté

---

*Rapport généré par analyse statique du moteur PDF (`documentPdf.ts`, 2800+ lignes), du schéma Drizzle (`lib/db/src/schema.ts`), et des routes API (`documents.ts`). Aucune donnée ne doit être codée en dur dans un document officiel qui possède une source de vérité en base.*
