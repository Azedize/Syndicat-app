# ANALYSE MÉTIER COMPLÈTE — MODULE DOCUMENTS
## SYNDYCAT GLOBAL CPS · Juillet 2026

---

## 1. CARTOGRAPHIE DES 32 TEMPLATES EXISTANTS

### Famille A — ATTESTATIONS & CERTIFICATS
| Code | Template | Libellé | Données auto-récupérables | Saisie résiduelle | Signataires |
|------|----------|---------|--------------------------|-------------------|-------------|
| ATT | `attestation` | Attestation d'Adhésion | syndicat, membre, lot, bâtiment, date adhésion, cotisation, numéro membre | — | Président + Secrétaire |
| ATT-RES | `attestation_residence` | Attestation de Résidence | syndicat, bâtiment, lot, locataire/propriétaire | — | Président |
| ATT-PRO | `attestation_propriete` | Attestation de Propriété | syndicat, membre, lot, tantièmes, titre foncier | — | Président + Secrétaire |
| ATT-PAI | `attestation_paiement` | Attestation de Paiement | syndicat, membre, appels de fonds payés, transactions | — | Trésorier + Président |
| CERT | `certificat` | Certificat Officiel | syndicat, objet | objet du certificat | Président |

### Famille B — GOUVERNANCE (AG & RÉUNIONS)
| Code | Template | Libellé | Données auto-récupérables | Saisie résiduelle | Signataires |
|------|----------|---------|--------------------------|-------------------|-------------|
| PV | `pv` | Procès-Verbal de Réunion | réunion (date, lieu, ordre du jour), participants, résolutions, votes, présences | — | Secrétaire + Président |
| CONV | `convocation` | Convocation Officielle | réunion (date, heure, lieu, ordre du jour), liste membres | — | Secrétaire |
| CR | `compte_rendu` | Compte-Rendu de Réunion | réunion, participants, résolutions | — | Secrétaire + Président |
| DEC | `decision` | Décision Syndicale | syndicat, élus (présidents, conseil) | objet de la décision | Président |
| REG | `reglement` | Règlement de Copropriété | syndicat, bâtiment, lots, tantièmes | — | Président + Secrétaire + Trésorier |

### Famille C — FINANCE & COMPTABILITÉ
| Code | Template | Libellé | Données auto-récupérables | Saisie résiduelle | Signataires |
|------|----------|---------|--------------------------|-------------------|-------------|
| ADF | `appel_de_fonds` | Appel de Fonds | appelDeFonds (montant, échéance, ligne budgétaire), membre, lot, syndicat | — | Trésorier + Président |
| REC | `recu_paiement` | Reçu de Paiement | transaction, membre, lot, syndicat | — | Trésorier |
| FAC | `facture` | Facture Syndic | transaction/invoice, prestataire, syndicat | — | Trésorier |
| BUD | `budget_previsionnel` | Budget Prévisionnel | budget, lignes budgétaires, syndicat, exercice | — | Trésorier + Président |
| DEC-CH | `decompte_charges` | Décompte des Charges | appels de fonds émis, paiements reçus, syndicat, lots | — | Trésorier |
| FIN | `rapport_financier` | Rapport Financier | budget, transactions, caisse, impayés, taux recouvrement, fonds travaux | — | Trésorier + Président |
| AUD | `rapport_audit` | Rapport d'Audit | budget, transactions, caisse, syndicat | — | Auditeur + Président |

### Famille D — JURIDIQUE & LÉGAL
| Code | Template | Libellé | Données auto-récupérables | Saisie résiduelle | Signataires |
|------|----------|---------|--------------------------|-------------------|-------------|
| MED | `mise_en_demeure` | Mise en Demeure Officielle | syndicat, membre/locataire débiteur, dette (transactions), lot | motif légal | Président + Secrétaire |
| CTR | `contrat` | Contrat | syndicat, parties | objet, clauses | Président + Secrétaire |
| BAIL | `contrat_bail` | Contrat de Bail | syndicat, lot, locataire (tenantsTable), dates bail | — | Gestionnaire + Locataire |
| CONV-P | `convention_partenariat` | Convention de Partenariat | syndicat, prestataire (prestataireTable) | clauses, objet | Président + Partie B |
| AC | `accord_collectif` | Accord Collectif | syndicat, élus | objet | Président + Délégué |

### Famille E — ADMINISTRATIF & CORRESPONDANCE
| Code | Template | Libellé | Données auto-récupérables | Saisie résiduelle | Signataires |
|------|----------|---------|--------------------------|-------------------|-------------|
| AUT | `autorisation` | Autorisation Officielle | syndicat, membres | objet | Président |
| OM | `ordre_de_mission` | Ordre de Mission | syndicat, agent/membre | mission, dates | Président |
| LO | `lettre_officielle` | Lettre Officielle | syndicat, destinataire | objet, corps | Président |
| CIRC | `circulaire` | Circulaire Interne | syndicat, membres | objet, corps | Secrétaire + Président |
| NI | `note_interne` | Note Interne | syndicat | objet, corps | — |
| DEM | `demande_administrative` | Demande Administrative | syndicat, demandeur | objet, motivations | — |
| RA | `rapport_activite` | Rapport d'Activité | syndicat, période | activités | Président |

### Famille F — OPÉRATIONS & TERRAIN
| Code | Template | Libellé | Données auto-récupérables | Saisie résiduelle | Signataires |
|------|----------|---------|--------------------------|-------------------|-------------|
| SIN | `sinistre` | Déclaration de Sinistre | sinistre (sinistresTable: type, date, lieu, lot), syndicat | description complémentaire | — |
| TRX | `travaux` | Ordre de Travaux | travaux (travauxTable: type, lot, prestataire, devis), syndicat | — | Président |
| ELEC | `rapport_election` | Rapport d'Élection | élection (electionsTable: résultats, candidats, votes, quorum), syndicat | — | Secrétaire + Président |

---

## 2. DONNÉES DISPONIBLES DANS LA BASE (DB TABLES → CHAMPS CLÉS)

### Entités Core
```
syndicatesTable          → id, name, address, city, phone, email, website, registrationNumber, logoUrl, logoColor, abbreviation
usersTable               → id, email, name, role, syndicateId, phone, avatarUrl
membersTable             → id, syndicateId, email, phone, firstName, lastName, memberNumber, joinedAt, cotisationStatus
lotsTable                → id, buildingId, ownerId (→memberId), number, floor, surface, type, description
buildingsTable           → id, syndicateId, name, address, city, totalFloors, totalLots
tenantsTable             → id, lotId, email, firstName, lastName, phone, leaseStart, leaseEnd, rentAmount
```

### Finance (RÉCUPÉRABLE AUTOMATIQUEMENT)
```
budgetsTable             → id, syndicateId, year, totalAmount, status
budgetLinesTable         → budgetId, label, amount, category
appelsDeFondsTable       → id, syndicateId, memberId, lotId, amount, dueDate, status, budgetLineId
transactionsTable        → id, syndicateId, type (cotisation/expense/salary/rent/...), amount, date, description, memberId
caisseEntriesTable       → id, syndicateId, type (entree/sortie), amount, balance, date
invoicesTable            → id, syndicateId, reference, amount, status, dueDate, prestataireId
cotisationsTable         → id, memberId, syndicateId, amount, year, status, paidAt
paymentProofsTable       → id, memberId, syndicateId, amount, date, proofUrl
```

### Gouvernance (RÉCUPÉRABLE AUTOMATIQUEMENT)
```
meetingsTable            → id, syndicateId, type (ordinaire/extraordinaire), date, location, agenda, status
meetingAttendeesTable    → meetingId, userId, role, present, proxy
agResolutionsTable       → meetingId, title, description, voteFor, voteAgainst, voteAbstain, result
electionsTable           → id, syndicateId, title, type, status, quorum, startDate, endDate
candidatesTable          → electionId, userId, bio, votes
votesTable               → electionId, userId, candidateId, timestamp
```

### Opérations (RÉCUPÉRABLE AUTOMATIQUEMENT)
```
travauxTable             → id, syndicateId, lotId, type, description, status, prestataireId, budget, startDate
sinistresTable           → id, syndicateId, lotId, type, description, date, status, insuranceRef
prestatairesTable        → id, syndicateId, name, email, phone, address, specialty, siret
contratsPrestatairesTable → id, prestataireId, syndicateId, type, startDate, endDate, amount
```

### Documents
```
documentsTable           → id, syndicateId, title, category, status, fileUrl, templateName, verificationToken, expiresAt, createdBy
documentVersionsTable    → documentId, version, fileUrl, changedAt, changedBy
documentSignaturesTable  → documentId, userId, role, signedAt, signatureData, isValid
documentSequencesTable   → syndicateId, template, lastNumber (compteur auto-incrémenté)
```

---

## 3. DIAGNOSTIC : SAISIES INUTILES À SUPPRIMER

### ✅ Déjà auto-récupéré
- Identité syndicat (nom, adresse, logo, téléphone, email)
- Identité membre (nom, email, téléphone, numéro lot)
- Données financières pour appel_de_fonds, recu_paiement, facture, budget
- Données réunion pour pv, convocation, compte_rendu
- Données élection pour rapport_election

### ❌ Saisies encore demandées alors qu'elles existent en base

| Template | Champ demandé (inutile) | Source DB disponible |
|----------|-------------------------|----------------------|
| `attestation_residence` | Adresse locataire | `tenantsTable.address` (via lotId) |
| `attestation_paiement` | Montant payé | `transactionsTable` + `cotisationsTable` |
| `contrat_bail` | Adresse du bien | `lotsTable` → `buildingsTable` |
| `mise_en_demeure` | Montant de la dette | `transactionsTable` + `appelsDeFondsTable.status='unpaid'` |
| `rapport_financier` | Dates d'exercice | `budgetsTable.year` |
| `sinistre` | Lot concerné | `sinistresTable.lotId` → `lotsTable` |
| `travaux` | Prestataire | `travauxTable.prestataireId` → `prestatairesTable` |
| `contrat` | Identité des parties | `membersTable` / `prestatairesTable` |
| `rapport_election` | Résultats/quorum | `electionsTable` + `votesTable` auto-complet |

### 🔶 Saisies légitimes (information manquante en base)
- Objet/corps de : `lettre_officielle`, `circulaire`, `note_interne`, `demande_administrative`
- Clauses contractuelles : `contrat`, `convention_partenariat`, `accord_collectif`
- Motif légal : `mise_en_demeure` (corps argumentatif)
- Description complémentaire : `sinistre` (récit de l'incident)

---

## 4. FLUX UTILISATEURS PAR RÔLE

### 4.1 Flux MEMBRE (Ahmed demande une attestation)
```
[Écran principal]
     │
     ▼
[Documents] ──→ [Mes Documents]  [Nouvelle Demande]  [Corbeille]
                                        │
                                        ▼
                          ┌─────────────────────────────┐
                          │  CATALOGUE DE TEMPLATES      │
                          │  filtré par rôle=membre      │
                          │  ─────────────────────────── │
                          │  ✦ Attestation d'adhésion    │
                          │  ✦ Attestation de résidence  │
                          │  ✦ Attestation de paiement   │
                          └─────────────────────────────┘
                                        │ sélection
                                        ▼
                          ┌─────────────────────────────┐
                          │  PRÉVISUALISATION INTELLIGENTE│
                          │  ─────────────────────────── │
                          │  ✓ Votre nom: Ahmed Tahiri   │
                          │  ✓ Lot: B-204                │
                          │  ✓ Syndicat: Résidence Atlas │
                          │  ✓ Cotisation: À jour        │
                          │  ─────────────────────────── │
                          │  Champs manquants: aucun     │
                          └─────────────────────────────┘
                                        │
                                        ▼
                             [Soumettre la demande]
                                        │
                                        ▼
                    ┌───────────────────────────────────┐
                    │  STATUT: En attente de validation  │
                    │  → Notif admin: nouvelle demande   │
                    └───────────────────────────────────┘
                                        │
                           Admin valide + signe
                                        │
                                        ▼
                    ┌───────────────────────────────────┐
                    │  STATUT: Publié                    │
                    │  → Notif membre: doc disponible    │
                    │  → PDF téléchargeable              │
                    └───────────────────────────────────┘
```

### 4.2 Flux ADMINISTRATEUR DU SYNDICAT (génération directe)
```
[Documents]
     │
     ├──→ [Générer un document]
     │           │
     │           ▼
     │    [Famille de document]
     │    ├── Attestations & Certificats
     │    ├── Gouvernance (PV, Convocations, Décisions)
     │    ├── Finance (Appels, Budgets, Rapports)
     │    ├── Juridique (Contrats, MED, Règlements)
     │    ├── Administratif (Lettres, Circulaires)
     │    └── Opérations (Sinistres, Travaux, Elections)
     │           │
     │           ▼
     │    [Sélection entité] (membre / réunion / appel / etc.)
     │           │
     │           ▼
     │    [Données auto-chargées depuis la DB]
     │           │
     │           ▼
     │    [Champs complémentaires si nécessaire]
     │           │
     │           ▼
     │    [Génération PDF] → [Prévisualisation]
     │           │
     │           ▼
     │    [Workflow de signature]
     │    ├── Signataire 1: Trésorier ─→ [Signature électronique]
     │    └── Signataire 2: Président ─→ [Signature électronique]
     │           │
     │           ▼
     │    [Publication] → [Notification destinataires]
     │
     └──→ [Demandes reçues]
               │
               ▼
          [Liste demandes membres]
          ├── Approuver → génère doc + signe + notifie
          └── Rejeter → message au membre
```

### 4.3 Flux TRÉSORIER (rapport financier)
```
[Documents → Finance]
     │
     ▼
[Rapport Financier] → système charge automatiquement :
     ├── budgetsTable (exercice courant)
     ├── budgetLinesTable (toutes lignes)
     ├── appelsDeFondsTable (émis / encaissés)
     ├── transactionsTable (recettes + dépenses)
     ├── caisseEntriesTable (solde trésorerie)
     ├── cotisationsTable (impayés)
     └── taux de recouvrement (calculé)
     │
     ▼
[Sélectionner période] (pré-rempli: exercice en cours)
     │
     ▼
[Prévisualisation rapport ERP-style]
     │
     ▼
[Signer comme Trésorier] → [Transmis Président pour cosignature]
     │
     ▼
[Publié + partagé au Conseil Syndical]
```

### 4.4 Flux SECRÉTAIRE (PV après réunion)
```
[Réunion terminée → Documents → PV]
     │
     ▼
[Sélectionner la réunion] (liste des réunions du syndicat)
     │
     ▼
Chargement automatique :
     ├── meetingsTable: date, heure, lieu, type
     ├── meetingAttendeesTable: présents / absents / procurations
     ├── agResolutionsTable: toutes les résolutions
     └── votes: pour / contre / abstention par résolution
     │
     ▼
[PV pré-construit] → [Révision secrétaire]
     │
     ▼
[Signer comme Secrétaire] → [Cosignature Président]
     │
     ▼
[Distribué à tous les membres]
```

### 4.5 Flux SUPER ADMIN (gestion catalogue)
```
[Platform Admin Panel]
     │
     ├── [Catalogue Templates]
     │        ├── Tous les templates (32)
     │        ├── Versions publiées
     │        ├── Brouillons
     │        └── Archivés
     │
     ├── [Demandes de nouveaux templates]
     │        ├── Syndicat demandeur
     │        ├── Titre + description + objectif
     │        ├── Champs nécessaires (spec)
     │        ├── Fichiers joints (captures + PDF exemples)
     │        └── Statut: En attente / En cours / Publié / Rejeté
     │
     ├── [Éditeur de Template]
     │        ├── Définir les champs (auto-fill vs saisie)
     │        ├── Workflow de signature (qui signe, dans quel ordre)
     │        ├── Accès par rôle (qui peut générer ce doc)
     │        └── Publier la version
     │
     └── [Workflows de signature]
              ├── Définir les ordres de signature par template
              └── Configurer les délais et rappels
```

---

## 5. ARCHITECTURE DOCUMENTAIRE CIBLE

### 5.1 Design System — 6 FAMILLES VISUELLES DISTINCTES

```
┌─────────────────────────────────────────────────────────────────────┐
│  FAMILLE A : ATTESTATIONS & CERTIFICATS                             │
│  ─────────────────────────────────────────────────────────────────  │
│  Style : Certificat officiel — double filet, fond crème, sceau,    │
│          cachet central, texture papier, dorure                     │
│  Couleur : Or (#B8860B) + Bleu marine (#0D1B6A)                    │
│  Typographie : Serif (Amiri) pour le titre, Sans pour les données  │
│  Format : Portrait A4, tient sur 1 page                            │
│  Signature : Zone dédiée avec sceau et signature manuscrite scannée │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FAMILLE B : GOUVERNANCE (PV, CONVOCATIONS, DÉCISIONS)             │
│  ─────────────────────────────────────────────────────────────────  │
│  Style : Document de gouvernance — bandeau latéral, numérotation    │
│          des résolutions, table des présences structurée            │
│  Couleur : Violet syndycat (#7C3AED) + Gris anthracite (#1F2937)   │
│  Typographie : Sans moderne, hierarchy forte                       │
│  Format : Portrait A4, peut déborder sur 2 pages pour PV longs     │
│  Signature : Multi-signataires avec horodatage blockchain-style     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FAMILLE C : FINANCE & COMPTABILITÉ                                 │
│  ─────────────────────────────────────────────────────────────────  │
│  Style : Rapport ERP — tableaux denses, KPI, graphiques, totaux     │
│          en évidence, code couleur vert/rouge pour soldes           │
│  Couleur : Emeraude (#059669) + Slate (#1E293B)                    │
│  Typographie : Mono pour les chiffres, Sans pour les labels        │
│  Format : Portrait A4, pagination gérée si multi-pages             │
│  Signature : Bloc approbation avec cachet comptable                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FAMILLE D : JURIDIQUE & LÉGAL                                      │
│  ─────────────────────────────────────────────────────────────────  │
│  Style : Document juridique — sobriété, numérotation articles,      │
│          mentions légales en évidence, référence légale footer      │
│  Couleur : Bordeaux (#7F1D1D) + Beige (#F5F0E8)                   │
│  Typographie : Serif élégant, interligne généreux                  │
│  Format : Portrait A4, articles numérotés                           │
│  Signature : Zone signature bilatérale avec "Lu et approuvé"        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FAMILLE E : ADMINISTRATIF & CORRESPONDANCE                         │
│  ─────────────────────────────────────────────────────────────────  │
│  Style : Lettre d'entreprise — en-tête compact, corps structuré,   │
│          références en-tête droite                                  │
│  Couleur : Couleur accent du syndicat (logoColor dynamique)         │
│  Typographie : Sans moderne, compact                               │
│  Format : Portrait A4, tient sur 1 page                            │
│  Signature : Signature simple avec titre et tampon                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FAMILLE F : OPÉRATIONS & TERRAIN                                   │
│  ─────────────────────────────────────────────────────────────────  │
│  Style : Fiche opérationnelle — en-tête compact, tableau de bord   │
│          terrain, statut visuel, photos si disponibles              │
│  Couleur : Orange (#EA580C) + Gris foncé (#374151)                 │
│  Typographie : Sans condensed, lisible sur terrain                 │
│  Format : Portrait A4 compact                                       │
│  Signature : Accusé de réception et visa terrain                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Anatomy d'un Document Cible

```
┌─────────────────────────────────────────────────────────────────────┐
│  ZONE HEADER (compact, max 60px hauteur)                            │
│  ┌──────┬──────────────────────────┬────────────────┐              │
│  │ LOGO │  NOM SYNDICAT            │ N° DOC: ATT-   │              │
│  │ 40px │  Adresse · Tél · Email   │ 2026-0042      │              │
│  │      │  N° RCS · Website        │ Date: 17/07/26 │              │
│  └──────┴──────────────────────────┴────────────────┘              │
│  ═══ BANDE COULEUR FAMILLE (4px) ════════════════════════════════   │
├─────────────────────────────────────────────────────────────────────┤
│  TITRE DOCUMENT (centré, typographie famille, 18-22pt)             │
│  Sous-titre (objet/référence)                                       │
├─────────────────────────────────────────────────────────────────────┤
│  CORPS DU DOCUMENT                                                  │
│  · Données identitaires (2 colonnes compactes)                     │
│  · Contenu principal (tableaux, texte, KPI)                        │
│  · Données entité associée                                         │
├─────────────────────────────────────────────────────────────────────┤
│  ZONE SIGNATURE                                                     │
│  ┌─────────────┬─────────────┬─────────────┐                       │
│  │  Signataire 1│  Signataire 2│  QR Code   │                       │
│  │  Nom + Rôle │  Nom + Rôle │  Vérif.    │                       │
│  │  [Signature]│  [Signature]│  URL       │                       │
│  │  Date       │  Date       │            │                       │
│  └─────────────┴─────────────┴────────────┘                        │
├─────────────────────────────────────────────────────────────────────┤
│  FOOTER (mentions légales · page X/N · token vérification)         │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Workflow Complet de Génération → Signature → Publication

```
                      WORKFLOW DOCUMENTAIRE
                      
PHASE 1 : INITIATION
──────────────────────────────────────────────────────
  [Acteur] → Sélectionne template → Système charge données DB
  ↓
  Données complètes ?
  ├── OUI → Génération directe (0 saisie)
  └── NON → Formulaire minimal (champs manquants uniquement)
  ↓
  Prévisualisation PDF (preview live avant génération)
  ↓
  [Confirmer la génération]

PHASE 2 : GÉNÉRATION
──────────────────────────────────────────────────────
  API → buildDocDef() → pdfmake → Buffer
  ↓
  Upload GCS → Enregistrement documentsTable (status: draft)
  ↓
  Numéro séquentiel minted (REG-2026-0042)
  ↓
  QR Code vérification embarqué

PHASE 3 : VALIDATION INTERNE
──────────────────────────────────────────────────────
  status: draft → pending_review
  ↓
  Notification → Responsable validation
  ↓
  Révision → Approuver / Demander correction
  ├── Correction → Régénération + nouvelle version (documentVersionsTable)
  └── Approbation → PHASE 4

PHASE 4 : SIGNATURE ÉLECTRONIQUE
──────────────────────────────────────────────────────
  Selon TEMPLATE_SIGNING_ORDER :
  
  [Signataire 1] (ex: Trésorier)
  ↓ Notification push + email
  ↓ Ouvre document mobile
  ↓ SignaturePad → signature SVG capturée
  ↓ documentSignaturesTable ← {signedAt, signatureData, role, isValid}
  ↓ PDF mis à jour (appendSignaturesToPdf)
  ↓ Statut: signed_partial
  
  [Signataire 2] (ex: Président)
  ↓ Même flux
  ↓ Tous signataires complétés → status: signed
  
  Hash blockchain-style du PDF final + token vérification

PHASE 5 : PUBLICATION & DISTRIBUTION
──────────────────────────────────────────────────────
  status: signed → published
  ↓
  Notification → Destinataires (membres / locataires / conseil)
  ↓
  Document disponible dans "Mes Documents" (destinataires)
  ↓
  URL de téléchargement signée (1h TTL) via GET /download-url
  ↓
  Archivage automatique selon politique de rétention (documentsTable.expiresAt)

PHASE 6 : VÉRIFICATION & AUDIT
──────────────────────────────────────────────────────
  QR Code sur PDF → GET /documents/verify/:token
  ├── Document authentique → affiche métadonnées + signataires
  └── Document invalide / expiré → alerte
  
  auditLogsTable ← toutes les actions (génération, signature, publication, téléchargement)
```

---

## 6. MATRICE RÔLES × TEMPLATES

| Template | Super Admin | Admin Syndicat | Président | Trésorier | Secrétaire | Membre | Propriétaire | Locataire |
|----------|:-----------:|:--------------:|:---------:|:---------:|:----------:|:------:|:------------:|:---------:|
| attestation | — | GEN | — | — | — | REQ | REQ | — |
| attestation_residence | — | GEN | — | — | — | — | REQ | REQ |
| attestation_propriete | — | GEN | — | — | — | — | REQ | — |
| attestation_paiement | — | GEN | — | GEN | — | REQ | REQ | — |
| pv | — | GEN | — | — | GEN | — | — | — |
| convocation | — | GEN | — | — | GEN | — | — | — |
| compte_rendu | — | GEN | — | — | GEN | — | — | — |
| decision | — | GEN | GEN | — | — | — | — | — |
| reglement | — | GEN | GEN | — | GEN | — | — | — |
| appel_de_fonds | — | GEN | — | GEN | — | — | — | — |
| recu_paiement | — | GEN | — | GEN | — | — | — | — |
| facture | — | GEN | — | GEN | — | — | — | — |
| budget_previsionnel | — | GEN | — | GEN | — | — | — | — |
| decompte_charges | — | GEN | — | GEN | — | — | — | — |
| rapport_financier | — | GEN | — | GEN | — | — | — | — |
| rapport_audit | — | GEN | — | GEN | — | — | — | — |
| mise_en_demeure | — | GEN | GEN | — | — | — | — | — |
| contrat | — | GEN | GEN | — | — | — | — | — |
| contrat_bail | — | GEN | — | — | — | — | GEN | — |
| convention_partenariat | — | GEN | GEN | — | — | — | — | — |
| accord_collectif | — | GEN | GEN | — | — | — | — | — |
| autorisation | — | GEN | GEN | — | — | — | — | — |
| ordre_de_mission | — | GEN | — | — | — | — | — | — |
| lettre_officielle | — | GEN | GEN | — | — | — | — | — |
| circulaire | — | GEN | — | — | GEN | — | — | — |
| note_interne | — | GEN | GEN | GEN | GEN | — | — | — |
| demande_administrative | — | GEN | — | — | — | REQ | — | — |
| rapport_activite | — | GEN | GEN | — | — | — | — | — |
| sinistre | — | GEN | — | — | — | REQ | REQ | REQ |
| travaux | — | GEN | GEN | — | — | — | — | — |
| rapport_election | — | GEN | — | — | GEN | — | — | — |
| certificat | — | GEN | GEN | — | — | — | — | — |

> **GEN** = peut générer directement | **REQ** = peut soumettre une demande | **—** = pas accès

*Super Admin gère le catalogue mais ne génère aucun document.*

---

## 7. PLAN DE REDESIGN TEMPLATE PAR TEMPLATE

### Priorité 1 — Attestations (fréquence max, perception qualité)

#### `attestation` — Attestation d'Adhésion
- **Problèmes actuels** : header trop grand, espace vide, pas de distinction visuelle certifiée
- **Design cible** : Format certificat officiel. Fond crème texturé, double filet dorure (#B8860B). Logo syndicat 64px centré. Titre en Amiri 22pt centré. Corps : tableau 2 colonnes avec toutes les infos membre. Bloc "ATTESTE ET CERTIFIE" encadré. Zone signature 3 colonnes (Trésorier / Président / Sceau). QR 32px.
- **Données auto** : 100% (zéro saisie pour membre authentifié)
- **Tient sur 1 page** : oui

#### `attestation_residence` — Attestation de Résidence
- **Problèmes actuels** : identique à attestation d'adhésion visuellement
- **Design cible** : Variante avec accent "Résidence" — insigne de localisation, données bâtiment/lot en évidence, référence cadastrale si disponible. Format lettre officielle + filet.

#### `attestation_propriete` — Attestation de Propriété
- **Design cible** : Aspect titre de propriété. Référence titre foncier en évidence. Tantièmes affichés. Double filet légal.

#### `attestation_paiement` — Attestation de Paiement  
- **Design cible** : Reçu officiel avec barre verte "SOLDÉ" si applicable. Tableau des paiements chronologique. Cachet "Acquitté".

### Priorité 2 — Finance (valeur perçue ERP)

#### `rapport_financier`
- **Design cible** : 3 sections : (1) KPI strip (4 indicateurs clés : budget, encaissé, impayés, taux recouvrement), (2) Tableau recettes/dépenses, (3) Analyse caisse + graphique sparkline. Style SAP/Odoo.

#### `appel_de_fonds`
- **Design cible** : Avis de paiement bancaire. Montant en très grand (32pt). Échéance en rouge si dépassée. IBAN/instructions paiement. Talons détachables.

#### `budget_previsionnel`
- **Design cible** : Tableau budgétaire catégorisé avec totaux par section. Colonnes : Budget / Réel / Écart / %.

#### `recu_paiement` / `facture`
- **Design cible** : Facture professionnelle standard. Numéro en évidence. Tableau ligne items. Totaux HT/TVA/TTC. Cachet "PAYÉ" si soldé.

### Priorité 3 — Gouvernance

#### `pv`
- **Design cible** : Structure officielle. Bandeau violet latéral. Liste numérotée résolutions. Tableau présences/absences. Colonne votes par résolution. Blocs signature Secrétaire + Président côte à côte.

#### `convocation`
- **Design cible** : Lettre formelle avec ordre du jour numéroté. Encadré date/heure/lieu en évidence. Mention légale délai de convocation. Liste destinataires.

### Priorité 4 — Juridique

#### `mise_en_demeure`
- **Design cible** : Document juridique sobre. Bordeaux + Beige. Références légales en footer. Montant de la dette en encadré rouge. "LETTRE RECOMMANDÉE" tampon. Délai de régularisation.

#### `contrat_bail`
- **Design cible** : Contrat en colonnes articles numérotés. Données propriété et locataire en en-tête. Tableau clauses. Double signature avec "Lu et approuvé".

### Priorité 5 — Opérationnel

#### `sinistre`
- **Design cible** : Fiche d'incident. Orange + Gris. Champs : date, lieu, type, description, photos (si dispo). Référence assurance. Accusé de réception.

#### `travaux`
- **Design cible** : Bon de commande terrain. Tableau devis vs réalisé. Prestataire en évidence. Statut coloré.

---

## 8. PROBLÈMES ACTUELS → SOLUTIONS ARCHITECTURE

| Problème | Solution |
|---------|---------|
| Couleurs incohérentes avec l'app mobile | Utiliser les constantes `constants/colors.ts` du mobile → violet (#7C3AED) comme primaire |
| Signatures non visibles | `appendSignaturesToPdf()` existe mais zone trop petite. Agrandir à min 80px hauteur par signataire, afficher nom + rôle + date + trace SVG |
| Logos des syndicats non affichés | `fetchLogoDataUrl()` existe mais pas toujours appelé. Forcer l'appel systématique avant `buildDocDef` |
| Header trop grand | Réduire à max 60px (logo 40px + 2 lignes texte) — actuel ~80-100px |
| Documents 2 pages inutilement | Réduire marges (28px → 20px), compacter tableaux, utiliser layout 2 colonnes |
| Informations répétées | Supprimer le double affichage syndicat/header + corps |
| Espace vide | Remplir avec données DB actuellement ignorées (property, officeHolders) |
| Hiérarchie visuelle faible | Titres plus contrastés, bandes couleur famille, filets séparateurs |
| Templates identiques | 6 familles visuelles distinctes (voir §5.1) |
| Données demandées inutilement | Étendre autofill endpoint + entity loaders (voir §3) |

---

## 9. PLAN D'IMPLÉMENTATION (séquencé)

### Sprint 1 — Fondations Design System (sans régression)
1. Définir les 6 Design Tokens de familles dans `documentPdf.ts` (couleurs, typo, borders)
2. Refactoriser le header compact universel (60px max, logo systématique, couleur famille)
3. Refactoriser la zone signature (SVG trace, nom+rôle+date, QR 32px)
4. Corriger les marges et densité (réduire espace vide, 2 colonnes pour données identité)

### Sprint 2 — Famille Attestations (priorité business max)
5. Redesign complet `attestation` → style certificat officiel
6. Redesign `attestation_residence`, `attestation_propriete`, `attestation_paiement`
7. Étendre autofill → zéro saisie pour rôle membre/propriétaire/locataire

### Sprint 3 — Famille Finance (valeur ERP)
8. Redesign `rapport_financier` → KPI strip + tableaux ERP
9. Redesign `appel_de_fonds` → format avis de paiement bancaire
10. Redesign `budget_previsionnel`, `recu_paiement`, `facture`, `decompte_charges`

### Sprint 4 — Famille Gouvernance
11. Redesign `pv`, `convocation`, `compte_rendu`, `decision`
12. Complétion auto-fill réunion → 0 saisie secrétaire

### Sprint 5 — Famille Juridique + Opérations
13. Redesign `mise_en_demeure`, `contrat_bail`, `reglement`
14. Redesign `sinistre`, `travaux`, `rapport_election`

### Sprint 6 — UX Mobile Module Documents
15. Refonte UX écran principal (catalogue par famille + filtres rôle)
16. Écran "Demande membre" avec prévisualisation données auto
17. Pipeline de signature repensé (stepper visuel)

---

## 10. RÉSUMÉ EXÉCUTIF

**État actuel** : 32 templates fonctionnels mais visuellement homogènes, partiellement auto-alimentés, avec des signatures peu visibles, des headers surdimensionnés et des saisies évitables.

**Cible** : Module documentaire de niveau DocuSign/Odoo Enterprise avec :
- 6 familles visuelles distinctes et mémorables
- Zéro saisie pour toute information disponible en base
- Workflow signature électronique visible et traçable
- Logo syndicat systématique dans chaque document
- Documents tenant sur 1 page (sauf PV et Règlement qui sont multi-pages par nature)
- Numérotation séquentielle et vérification QR sur chaque PDF
- Palette cohérente avec l'application mobile (violet primaire #7C3AED)

**Effort estimé** : 6 sprints de 2-3 jours chacun pour atteindre le niveau enterprise complet.
