# AUDIT DOCUMENTAIRE ENTERPRISE — TEMPLATE PAR TEMPLATE
## SYNDYCAT GLOBAL CPS · Juillet 2026
### Niveau cible : DocuSign / Odoo Enterprise / SAP

---

## PARTIE 1 — AUDIT DES SIGNATURES (POURQUOI ELLES NE SONT PAS VISIBLES)

### Diagnostic technique complet

**Architecture actuelle (comment ça fonctionne) :**

```
ÉTAPE 1 — Génération initiale (POST /documents)
  → buildDocDef(template, input) — input.signatures = []
  → Le template rend une zone "En attente de signature" (placeholder)
  → PDF uploadé en GCS avec placeholder visible

ÉTAPE 2 — Signature électronique (POST /documents/:id/sign)
  → SignaturePad mobile → SVG capturé → stocké dans documentSignaturesTable.signatureData
  → appendSignaturesToPdf() appelé → AJOUTE UNE PAGE SÉPARÉE au PDF existant
  → La page ajoutée contient : nom, rôle, date, trace SVG, badge validité

RÉSULTAT OBSERVÉ :
  → Le document original (page 1+) : TOUJOURS "En attente de signature"
  → La page appended (dernière page) : signatures réelles visibles
```

**Bug #1 — Le document original ne montre jamais les signatures réelles dans son corps**

Cause racine : Le PDF est généré UNE SEULE FOIS à la création, sans signatures (car elles n'existent pas encore). Quand les signatures arrivent, seule une page annexe est ajoutée via `appendSignaturesToPdf()` — le corps du document n'est jamais régénéré.

**Mécanisme de correction existant mais non utilisé :** Le champ `_existingDocumentId` existe dans le schéma Zod (ligne 2969 de documents.ts). Il permet de rappeler `POST /documents` pour regénérer le PDF avec les signatures déjà enregistrées en base. Mais la route de signature (`POST /documents/:id/sign`) ne déclenche pas cette regénération automatiquement.

**Bug #2 — La fonction `signatureBlock()` cherche le SVG avec `.startsWith("<svg")`**

Si le SignaturePad produit un SVG avec une déclaration XML en tête (`<?xml ...><svg ...>`), le test échoue et la trace n'est pas rendue. Seul le case `attestation` utilise `makeAttCol()` qui a le même test mais dans un bloc plus récent.

**Bug #3 — `appendSignaturesToPdf()` : page ajoutée mais pas numérotée dans le footer**

La page appended utilise `pdf-lib` (non pdfmake) donc elle n'hérite pas du footer paginé du document original. Elle a son propre header/footer, ce qui crée une discontinuité visuelle.

**Solution recommandée :**

Option A (Rapide) : Après que tous les signataires requis ont signé, déclencher automatiquement une REGÉNÉRATION du PDF avec `_existingDocumentId` → signatures chargées depuis DB → PDF refait avec signatures inline dans le corps.

Option B (Architecture propre, plus long) : Supprimer `appendSignaturesToPdf()` et remplacer par la regénération systématique. Plus cohérent visuellement.

**Correction immédiate (Option A) :**

Dans le handler `POST /documents/:id/sign`, après avoir sauvegardé la signature en DB :
1. Charger toutes les signatures existantes pour ce document
2. Vérifier si tous les signataires requis ont signé
3. Si OUI → appeler `generateAndUploadDocument(template, {...input, signatures, _existingDocumentId: id})`
4. Mettre à jour `documentsTable.fileUrl` avec le nouveau PDF

---

## PARTIE 2 — AUDIT DES LOGOS (POURQUOI ILS NE S'AFFICHENT PAS)

### Diagnostic technique complet

**Pipeline du logo (ce qui est dans le code) :**

```
1. syndicatesTable.logoUrl       → stocké comme "/objects/uploads/<uuid>"
2. getSyndicateInfo(syndicateId) → retourne syndInfo.logoUrl (CORRECT)
3. buildDocDef() ligne 2568-2571 :
   const [qrDataUrl, logoDataUrl] = await Promise.all([
     generateQrDataUrl(...),
     fetchLogoDataUrl(syndInfo.logoUrl),  ← APPELÉ CORRECTEMENT
   ]);
4. buildHeaderBand(..., logoDataUrl, ...) → si logoDataUrl != null → affiche logo
                                          → si null → affiche acronyme
```

**Le code est CORRECT.** La raison pour laquelle les logos ne s'affichent pas est un **problème d'environnement**, pas un bug de code.

**Cause racine :**

`fetchLogoDataUrl()` (ligne 2036) gère deux cas :
- URL http(s) : fetch direct
- Chemin interne `/objects/...` : lecture via `objectStorageClient` (GCS sidecar)

Pour les chemins internes, elle nécessite :
- `PRIVATE_OBJECT_DIR` env var → **non configuré en dev** (voir replit.md : secret non défini)
- GCS sidecar auth → **"no allowed resources" auth failure** (problème connu, noté en mémoire)

Quand `fetchLogoDataUrl` échoue, elle log un warning et retourne `null` silencieusement → header affiche initiales.

**3 niveaux de correction :**

**Niveau 1 (Dev immédiat) :** Configurer `PRIVATE_OBJECT_DIR` en dev (pointer vers un dossier local)

**Niveau 2 (Robustesse) :** Si `logoUrl` commence par `https://`, tenter le fetch direct. Stocker le logo en public URL plutôt qu'en GCS interne quand c'est possible.

**Niveau 3 (Production) :** Résoudre l'auth GCS sidecar. Vérifier les variables `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` (présents dans les secrets disponibles mais peut-être mal configurés).

---

## PARTIE 3 — AUDIT TEMPLATE PAR TEMPLATE

### Méthodologie de scoring /100

| Dimension | Poids |
|-----------|-------|
| Identité visuelle distincte | 25 pts |
| Données auto-chargées (0 saisie inutile) | 20 pts |
| Signatures visibles et correctes | 20 pts |
| Hiérarchie visuelle et lisibilité | 15 pts |
| Compacité (tient en 1 page si possible) | 10 pts |
| Cohérence avec l'app mobile | 10 pts |

---

## FAMILLE A — ATTESTATIONS & CERTIFICATS

---

### TEMPLATE 01 — `attestation` (Attestation d'Adhésion)

**Score actuel : 78/100**

#### Analyse du design actuel

Le template est de loin le plus abouti du système. Il utilise la fonction `makeAttCol()` dédiée avec :
- Identité strip 4 colonnes (type / n° doc / date / statut)
- Profile card 2 colonnes (avatar initiales + grille données)
- Bloc "ATTESTE ET CERTIFIE" avec lignes d'encadrement
- Zone signature 2 colonnes (Président / Secrétaire) avec SVG trace et cachet
- QR code 34px dans le header

#### Défauts identifiés

| # | Défaut | Impact |
|---|--------|--------|
| D1 | Header 3 colonnes correct MAIS logo non chargé (bug GCS) → acronyme affiché | Visuel fort |
| D2 | Signatures réelles non visibles dans le corps au moment de la génération | Critique |
| D3 | `accentColor` = `BRAND.successDark` (emeraude) — trop proche des templates financiers | Identité |
| D4 | La couleur de la famille Attestation partage le même vert que Finance (même famille BRAND.successDark) | Confusion |
| D5 | Watermark "BROUILLON" à 4% opacity — utile mais presque invisible | Mineur |
| D6 | Titre "ATTESTATION D'ADHÉSION" en 20pt bold — bien, mais pas de fond coloré derrière | Hiérarchie |
| D7 | CIN répété deux fois : dans la colonne gauche ET dans la grille droite | Données dupliquées |

#### Données disponibles vs utilisées

| Donnée | Disponible en DB | Utilisée | Champ |
|--------|-----------------|----------|-------|
| Nom membre | ✅ | ✅ | `_memberRef` lookup |
| Email | ✅ | ✅ | `_memberEmail` |
| Téléphone | ✅ | ✅ | `_memberPhone` |
| CIN | ✅ | ✅ | `_memberCIN` |
| Date adhésion | ✅ | ✅ | `_memberJoinDate` |
| Statut cotisation | ✅ | ✅ | `_memberStatus` |
| Numéro lot | ✅ | ✅ | `_lotNumber` |
| Surface lot | ✅ | ✅ | `_lotSurface` |
| Étage | ✅ | ✅ | `_lotFloor` |
| Bâtiment | ✅ | ✅ | `_buildingName` |
| Tantièmes | ✅ | ❌ | `_lotTantiemes` — non utilisé |
| Avatar réel | ✅ (avatarUrl) | ❌ | Initiales seulement |
| Titre foncier | ✅ | ❌ | Non pertinent ici |

#### Redesign cible — Attestation d'Adhésion

**Concept : Certificat Premium — "Le document qu'on encadre"**

Structure cible :
```
┌─────────────────────────────────────────────────────────┐
│  [TOP STRIPE 4px — Or #B8860B]                          │
│  ┌────────┬──────────────────────┬────────────────────┐ │
│  │ LOGO   │  NOM SYNDICAT (11pt) │ N° ATT-2026-0001   │ │
│  │ 42px   │  Adresse · Tel       │ Date · QR 34px     │ │
│  │ fond   │  badge "✓ ATTEST"    │ Statut chip        │ │
│  │ violet │  (fond violet sombre)│                    │ │
│  └────────┴──────────────────────┴────────────────────┘ │
│                                                         │
│  ══════════════════════════════════════════════════════  │
│          ATTESTATION D'ADHÉSION [24pt centered]         │
│  ──────── Syndicat de Copropriété · Membre Officiel ──  │
│  ══════════════════════════════════════════════════════  │
│                                                         │
│  ┌─────────────────┬───────────────────────────────────┐│
│  │  AVATAR [60px]  │  N° LOT: B-204    │ ÉTAGE: 2      ││
│  │  Initiales bold │  ─────────────────┼───────────────││
│  │  [nom 12.5pt]   │  RÉSIDENCE: Atlas                 ││
│  │  [n° membre]    │  ─────────────────────────────────││
│  │  BADGE STATUT   │  SURFACE: 87 m²   │ DATE ADH.     ││
│  │  ● ACTIF vert   │  TANTIEMES: 1250  │ 01/03/2023    ││
│  │  ✉ email        │                   │               ││
│  │  ☎ téléphone    │                   │               ││
│  └─────────────────┴───────────────────────────────────┘│
│                                                         │
│  ▌ CERTIFICATION OFFICIELLE                             │
│  Le syndicat ... ATTESTE ET CERTIFIE que ...            │
│                                                         │
│  ═════════════════════════════════════════════════════  │
│              ATTESTE  ET  CERTIFIE                      │
│  ═════════════════════════════════════════════════════  │
│                                                         │
│  SIGNATURES OFFICIELLES        [CACHET OFFICIEL]        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ LE PRÉSIDENT │  │ LE SECRÉTAIRE│  │              │  │
│  │ [SVG trace]  │  │ [SVG trace]  │  │  sceau rect  │  │
│  │ ✓ SIGNÉ      │  │ ✓ SIGNÉ      │  │   officiel   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  NOTE LÉGALE · Réf. ATT-2026-0001 · syndycat.ma/verify  │
└─────────────────────────────────────────────────────────┘
```

**Changements de design :**
- Couleur famille Attestation → **Violet pur (#7C3AED)** au lieu de vert emeraude (différencier de Finance)
- Supprimer le doublon CIN (garder uniquement dans la grille droite)
- Ajouter tantièmes dans la grille droite
- Si `avatarUrl` disponible → afficher l'avatar réel (via `fetchLogoDataUrl` réutilisé)
- Titre en 24pt avec fond violet léger derrière (comme badge de certification)
- Zone signature avec 3 colonnes (Président / Secrétaire / Sceau) au lieu de 2+sceau superposés

**Score cible après redesign : 92/100**

---

### TEMPLATE 02 — `attestation_residence` (Attestation de Résidence)

**Score actuel : 52/100**

#### Analyse du design actuel

Utilise `buildCertificateFrame()` (double ligne + label) + titre 20pt centré + `metaTable()` (cartes 2 colonnes) + `contentSection()` (corps texte) + `signatureBlock()` simple (1 signataire).

Problème principal : Design **identique** à `attestation_propriete` et `attestation_paiement`. Les 3 templates utilisent exactement la même structure. Impossible de les distinguer au premier coup d'œil.

#### Défauts identifiés

| # | Défaut | Impact |
|---|--------|--------|
| D1 | Design identique aux autres attestations — aucune identité propre | Critique |
| D2 | `buildCertificateFrame()` : double ligne + label centré — trop générique | Visuel |
| D3 | `metaTable()` : cartes 2 colonnes — OK pour infos mais manque de personnalité | Identité |
| D4 | `contentSection("Attestation de Résidence", body)` : corps texte générique | Contenu |
| D5 | Signature simple 1 colonne centré — manque d'autorité institutionnelle | Signature |
| D6 | Aucune référence visuelle à la notion de "résidence" / "adresse" / "domicile" | Thème |
| D7 | Pas de carte d'adresse mise en valeur (élément clé du document) | Données |
| D8 | Logo non chargé (même problème GCS) | Visuel |
| D9 | Risque de débordement sur 2 pages si le corps texte est long | Format |

#### Données disponibles vs utilisées

| Donnée | Disponible en DB | Utilisée | Manque |
|--------|-----------------|----------|--------|
| Nom habitant | ✅ | ✅ | — |
| N° lot | ✅ | ✅ | — |
| Étage | ✅ | ✅ | — |
| Bâtiment/Résidence | ✅ | ✅ | — |
| Adresse bâtiment | ✅ | ✅ | — |
| Ville | ✅ | ✅ | — |
| **Adresse locataire** | ✅ (tenantsTable) | ❌ | Ajouter |
| **Durée d'occupation** | ✅ (tenantsTable.leaseStart) | ❌ | Ajouter |
| **Type d'occupation** | ✅ (propriétaire/locataire via role) | ❌ | Ajouter |
| Titre foncier | ✅ | ❌ | Non pertinent ici |

#### Redesign cible — Attestation de Résidence

**Concept : "Localisation officielle" — Icône adresse + carte d'identité d'adresse**

Différenciateur visuel : **Barre d'accentuation bleue (#1D4ED8 — bleu locatif)** au lieu du violet/vert. Thème "localisation" : icône maison, mise en valeur de l'adresse complète.

Structure cible :
```
┌─────────────────────────────────────────────────────────┐
│  [HEADER standard avec logo syndicat]                   │
│  [Stripe bleue #1D4ED8]                                 │
├─────────────────────────────────────────────────────────┤
│  ⌂  ATTESTATION DE RÉSIDENCE      [24pt — bleu]         │
│  Syndicat de Copropriété — Délivrance officielle        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐    │
│  │  ADRESSE OFFICIELLE DE RÉSIDENCE                │    │
│  │  ─────────────────────────────────────────────  │    │
│  │  [Résidence Atlas, 42 rue des Lilas, Casablanca]│    │
│  │  Appartement N° B-204 · Étage 2 · Surface 87m² │    │
│  │  Type : Propriétaire / Locataire                │    │
│  │  Depuis le : 01/03/2023                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  INFORMATIONS DU BÉNÉFICIAIRE                           │
│  Nom: Ahmed TAHIRI  ·  CIN: BE123456                    │
│                                                         │
│  ▌ CERTIFICATION OFFICIELLE                             │
│  Le syndicat ... certifie que M. Ahmed TAHIRI réside ...│
│                                                         │
│  NOTE: Cette attestation est délivrée pour valoir       │
│  ce que de droit. Durée de validité: 3 mois.           │
│                                                         │
│  SIGNATURE OFFICIELLE                [CACHET]           │
│  [Le Président — SVG — Date]                            │
└─────────────────────────────────────────────────────────┘
```

**Changements de design :**
- Couleur famille → **Bleu locatif #1D4ED8** (distinct du violet Attestation d'Adhésion)
- Bloc "ADRESSE OFFICIELLE DE RÉSIDENCE" encadré avec fond bleu léger — élément central du document
- Ajouter durée d'occupation (leaseStart ou joinDate)
- Ajouter type d'occupation (propriétaire/locataire)
- Icône ⌂ devant le titre
- Durée de validité affichée (3 mois recommandé pour ce type de document)

**Score cible après redesign : 89/100**

---

### TEMPLATE 03 — `attestation_propriete` (Attestation de Propriété)

**Score actuel : 48/100**

#### Analyse du design actuel

Même structure générique que `attestation_residence`. Utilise `metaTable()` avec : Délivré à, Date d'émission, Émetteur, Titre Foncier, N° Lot, Tantièmes, Résidence, N° Enregistrement. Bloc avertissement "Ce document ne constitue pas un titre de propriété".

**Problème critique :** C'est le document à plus haute valeur juridique de la plateforme (équivalent d'une attestation notariale) mais il est visuellement le MOINS différencié. Il ressemble à une simple fiche info.

#### Défauts identifiés

| # | Défaut | Impact |
|---|--------|--------|
| D1 | Design identique aux autres attestations — inadmissible pour un doc à valeur juridique | Critique |
| D2 | Titre Foncier et Tantièmes — données cruciales — affichées comme des cartes ordinaires | Hiérarchie |
| D3 | L'avertissement "⚠ Ce document ne constitue pas un titre de propriété" est bien placé mais visuellement faible | Légal |
| D4 | Pas de "sceau de propriété" distinct — un acte de propriété doit inspirer confiance maximale | Institutionnel |
| D5 | Tantièmes : si "—" (donnée manquante), le document perd toute valeur légale | Données |
| D6 | Surface privative non affichée | Données |
| D7 | Signature simple 1 colonne — devrait avoir au minimum Président + Secrétaire | Signature |

#### Données disponibles vs utilisées

| Donnée | Disponible en DB | Utilisée | Action |
|--------|-----------------|----------|--------|
| Titre foncier | ✅ lotsTable.titreFoncier | ✅ | OK |
| Tantièmes | ✅ lotsTable.tantiemes | ✅ | OK |
| N° lot | ✅ | ✅ | OK |
| Résidence | ✅ | ✅ | OK |
| **Surface privative** | ✅ lotsTable.surfaceM2 | ❌ | Ajouter |
| **Type de lot** | ✅ lotsTable.type (appartement/bureau/commerce) | ❌ | Ajouter |
| **Date acquisition** | ✅ members.joinedAt (approximation) | ❌ | Ajouter |
| **N° d'enregistrement syndicat** | ✅ | ✅ | OK |
| **Coordonnées du lot** (bâtiment + étage) | ✅ | ✅ (partiel) | Améliorer |

#### Redesign cible — Attestation de Propriété

**Concept : "Titre de propriété synthétique" — Dignité juridique maximale**

Différenciateur visuel : **Fond crème (#FEFCE8) + filet doré double (#92400E bordeaux-doré)** — style acte notarial.

Structure cible :
```
┌═══════════════════════════════════════════════════════════╗
║  [DOUBLE FILET — bordeaux-doré]                           ║
║  ┌────────┬────────────────────────────┬────────────────┐ ║
║  │ LOGO   │  NOM SYNDICAT              │ ATT-PRO-0001   │ ║
║  │        │  [fond bordeaux sombre]    │ Date · QR      │ ║
║  └────────┴────────────────────────────┴────────────────┘ ║
║                                                           ║
║  ⚖  ATTESTATION DE PROPRIÉTÉ IMMOBILIÈRE  [22pt centré]  ║
║     Syndicat de Copropriété · Acte de reconnaissance      ║
║                                                           ║
║  ┌─────────────────────────────────────────────────────┐  ║
║  │  PROPRIÉTAIRE                                        │  ║
║  │  [NOM EN GRAS 14pt]   CIN: BE123456                 │  ║
║  └─────────────────────────────────────────────────────┘  ║
║                                                           ║
║  ┌──────────────┬─────────────────────────────────────┐  ║
║  │  TITRE       │  DÉSIGNATION DU BIEN                  │  ║
║  │  FONCIER     │  Lot N° B-204 · Appartement · Étage 2│  ║
║  │  [n° TF      │  Résidence Atlas, Casablanca          │  ║
║  │  en 18pt     │  Surface: 87 m² · Tantiemes: 1250/100000  │  ║
║  │  violet]     │  Type: Appartement résidentiel        │  ║
║  └──────────────┴─────────────────────────────────────┘  ║
║                                                           ║
║  CERTIFIE QUE [NOM] est propriétaire du lot ci-dessus... ║
║                                                           ║
║  ⚠ AVERTISSEMENT LÉGAL [encadré ambre]                   ║
║  Ce document ne constitue pas un titre de propriété...    ║
║                                                           ║
║  ══════════════════════════════════════════════════════  ║
║  PRÉSIDENT          SECRÉTAIRE         CACHET OFFICIEL   ║
║  [Nom+SVG]          [Nom+SVG]          [Sceau rectangle] ║
║  ══════════════════════════════════════════════════════  ║
╚═══════════════════════════════════════════════════════════╝
```

**Changements de design :**
- Couleur famille → **Bordeaux-doré #92400E** (autorité juridique, acte notarial)
- Fond crème (#FEFCE8) sur toute la page
- Double filet en-tête et pied de page (style acte officiel)
- Titre Foncier en très grand (18pt) dans une cellule dédiée — c'est l'élément central
- Section "Propriétaire" avec nom en 14pt bold
- Bloc bien avec toutes les données (surface, type, étage, tantièmes)
- **2 signataires** (Président + Secrétaire) au lieu de 1
- Avertissement légal plus proéminent (ambre, encadré)

**Score cible après redesign : 91/100**

---

### TEMPLATE 04 — `attestation_paiement` (Attestation de Paiement)

**Score actuel : 55/100**

#### Analyse du design actuel

Utilise `metaTable()` avec : Délivré à, Date d'émission, Émetteur, Période, N° Lot, Montant, N° Enregistrement. Un bloc statut vert/ambre (soldé / en cours). `signatureBlock()` simple.

Point positif : Le bloc statut coloré (vert = EN RÈGLE, ambre = EN COURS) est une bonne idée. La logique de `_paiementStatus` et `_lastPaidDate` est correcte.

Problème principal : Le montant payé affiché comme une simple carte dans la metaTable — pas de mise en valeur du montant. Un reçu/attestation de paiement DOIT mettre le montant en évidence (comme sur une facture ou un reçu de banque).

#### Défauts identifiés

| # | Défaut | Impact |
|---|--------|--------|
| D1 | Montant affiché comme carte ordinaire — devrait être l'élément dominant | Critique |
| D2 | Pas de tableau des paiements détaillé — impossible de vérifier | Données |
| D3 | Design identique aux autres attestations | Identité |
| D4 | `_lastPaidDate` utilisé mais pas l'historique des paiements | Données |
| D5 | Le statut EN RÈGLE / EN COURS bien implémenté mais le bloc est petit | Visuel |
| D6 | La période est affichée mais pas l'exercice fiscal complet | Contexte |
| D7 | Signature simple 1 colonne — devrait être Trésorier (responsable comptable) | Signature |

#### Données disponibles vs utilisées

| Donnée | Disponible en DB | Utilisée | Action |
|--------|-----------------|----------|--------|
| Montant total payé | ✅ calculé depuis transactions | ✅ | Mettre en valeur |
| Statut paiement | ✅ calculé | ✅ | OK |
| Date dernier paiement | ✅ | ✅ | OK |
| N° lot | ✅ | ✅ | OK |
| Période | ✅ | ✅ | OK |
| **Détail des paiements** | ✅ transactionsTable | ❌ | Ajouter tableau |
| **Nombre d'appels émis** | ✅ appelsDeFondsTable | ❌ | Ajouter |
| **Montant d'impayés** | ✅ calculé | ❌ | Ajouter si > 0 |
| **Mode de paiement** | ✅ transactionsTable.type | ❌ | Ajouter |

#### Redesign cible — Attestation de Paiement

**Concept : "Reçu de bonne foi comptable" — Montant dominant + historique transparent**

Différenciateur visuel : **Vert émeraude profond (#065F46)** pour SOLDÉ, **Ambre (#92400E)** pour EN COURS. Le montant en très grand.

Structure cible :
```
┌─────────────────────────────────────────────────────────┐
│  [HEADER avec logo]                                     │
│  [Stripe verte #065F46 si soldé / ambre si en cours]    │
├─────────────────────────────────────────────────────────┤
│  ◈  ATTESTATION DE PAIEMENT DES CHARGES  [20pt]         │
│  Exercice 2026 · Syndicat de Copropriété                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  MONTANT TOTAL RÉGLÉ                            │   │
│  │  ████████████████████████  12 450,00 MAD        │   │
│  │  [EN RÈGLE ✓] ou [EN COURS ⚠]                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  MEMBRE: Ahmed TAHIRI · LOT: B-204 · PÉRIODE: 2026      │
│                                                         │
│  ▌ DÉTAIL DES PAIEMENTS                                 │
│  ┌──────────────┬────────────┬────────────┬───────┐    │
│  │ DATE         │ RÉFÉRENCE  │ MONTANT    │ MODE  │    │
│  ├──────────────┼────────────┼────────────┼───────┤    │
│  │ 15/01/2026   │ ADF-0001   │ 4 150 MAD  │ Vir.  │    │
│  │ 15/04/2026   │ ADF-0002   │ 4 150 MAD  │ Vir.  │    │
│  │ 15/07/2026   │ ADF-0003   │ 4 150 MAD  │ Chèq. │    │
│  ├──────────────┴────────────┼────────────┼───────┤    │
│  │ TOTAL RÉGLÉ               │ 12 450 MAD │       │    │
│  └───────────────────────────┴────────────┴───────┘    │
│                                                         │
│  Situation comptable vérifiée à la date du 17/07/2026.  │
│  Aucune charge impayée pour la période mentionnée.      │
│                                                         │
│  SIGNATURE (TRÉSORIER)                  [CACHET]        │
│  [Nom + SVG trace + Date]                               │
└─────────────────────────────────────────────────────────┘
```

**Changements de design :**
- Couleur famille → **Vert comptable #065F46** (distinct du vert finance #059669)
- Montant en très grand (28-32pt) dans un bloc dédié pleine largeur
- Badge statut EN RÈGLE / EN COURS très proéminent (pleine largeur, fond coloré)
- Tableau des paiements avec 4 colonnes (Date / Référence / Montant / Mode)
- Changer le signataire en **Trésorier** (pas Président) — c'est un document comptable
- Stripe couleur dans le header correspond au statut (vert si soldé, ambre si en cours)

**Score cible après redesign : 93/100**

---

## FAMILLE B — GOUVERNANCE (Scores + Priorités)

### TEMPLATE 05 — `pv` (Procès-Verbal)
**Score actuel : 68/100**

Utilise `buildMeetingBanner()` (bon), `metaTable()`, `contentSection()`, `multiSignatoryBlock()` (3 signataires — excellent). Le multi-signataire avec cartes individuelles SVG est bien implémenté.

**Défauts principaux :**
- Corps du PV = texte libre (resolutionsText, deliberationsText) — pas structuré en tableau résolutions/votes
- Pas de tableau de présence distinct
- Si meetingId fourni, les données de réunion sont auto-chargées (getMeetingData) — mais `agResolutionsTable` n'est pas injecté dans le template

**Score cible : 85/100**

**Priorité redesign :** Quand meetingId est fourni, charger les résolutions depuis `agResolutionsTable` et les rendre en tableau numéroté avec colonnes Pour/Contre/Abstention/Résultat.

---

### TEMPLATE 06 — `convocation` (Convocation Officielle)
**Score actuel : 63/100**

Utilise `buildMeetingBanner()` + `metaTable()` + `contentSection()`. Bon usage des données réunion. Problème : L'ordre du jour est affiché comme texte brut, pas en liste numérotée structurée. Signature simple.

**Score cible : 82/100**

---

### TEMPLATE 07 — `compte_rendu` (Compte-Rendu)
**Score actuel : 55/100**

Même structure que PV mais avec moins de données auto-chargées. Les participants et décisions sont saisis manuellement.

**Score cible : 80/100**

---

### TEMPLATE 08 — `decision` (Décision Syndicale)
**Score actuel : 58/100**

Utilise `buildGovernanceBanner()` (bien). Signature simple 1 colonne. Le corps est entièrement manuel.

**Score cible : 78/100**

---

### TEMPLATE 09 — `reglement` (Règlement de Copropriété)
**Score actuel : 72/100**

Multi-pages justifié. Corps auto-généré depuis DB (bâtiments, lots, tantièmes). 3 signataires (Président + Secrétaire + Trésorier). Traduit en 4 langues. Bien conçu mais header toujours trop lourd par rapport au contenu dense.

**Score cible : 86/100**

---

## FAMILLE C — FINANCE (Scores + Priorités)

### TEMPLATE 10 — `appel_de_fonds` (Appel de Fonds)
**Score actuel : 74/100**

Bien conçu : KPI strip (taux recouvrement, impayés, trésorerie), bloc montant dû avec fond coloré. Données entièrement auto-chargées depuis `appelsDeFondsTable`.

**Défaut principal :** Le montant dû (18pt) n'est pas assez proéminent. Pour un avis de paiement, le montant devrait être en 32pt comme une facture bancaire.

**Score cible : 88/100**

---

### TEMPLATE 11 — `recu_paiement` (Reçu de Paiement)
**Score actuel : 65/100**

Données auto-chargées. Manque : pas de badge "PAYÉ" proéminent en filigrane ou en sceau sur le document.

**Score cible : 85/100**

---

### TEMPLATE 12 — `facture` (Facture)
**Score actuel : 62/100**

Structure de facture standard. Manque : numérotation des lignes, TVA affichée, total HT/TTC.

**Score cible : 83/100**

---

### TEMPLATE 13 — `budget_previsionnel` (Budget Prévisionnel)
**Score actuel : 70/100**

Utilise `budgetLinesTable()` avec groupage par catégorie et totaux. Bien pour les données. Manque de visuels ERP (graphiques, comparaison n-1).

**Score cible : 84/100**

---

### TEMPLATE 14 — `decompte_charges` (Décompte des Charges)
**Score actuel : 60/100**

Données auto-chargées. Tableau OK mais manque d'un solde final clair (trop payé / reste à payer).

**Score cible : 82/100**

---

### TEMPLATE 15 — `rapport_financier` (Rapport Financier)
**Score actuel : 78/100**

Le mieux conçu de la famille Finance : KPI strip 3 lignes × 3 colonnes + progress bars + tableau budgétaire. Utilise `financialDashboard()` et `budgetLinesTable()`. 

**Défauts :** KPI parfois à 0 quand la DB n'a pas encore de données (afficher "N/D" plutôt que "0 MAD"). Multi-pages souvent nécessaire — correct.

**Score cible : 90/100**

---

### TEMPLATE 16 — `rapport_audit` (Rapport d'Audit)
**Score actuel : 55/100**

Corps largement manuel. Données financières disponibles mais peu auto-injectées dans la structure d'audit.

**Score cible : 76/100**

---

## FAMILLE D — JURIDIQUE

### TEMPLATE 17 — `mise_en_demeure` (Mise en Demeure)
**Score actuel : 67/100**

Utilise `buildLegalAlertBanner()` (rouge, bien). Corps partiellement auto-chargé (montant dette depuis transactions). Signature Président + Secrétaire.

**Défaut principal :** Le montant de la dette n'est pas calculé automatiquement depuis `appelsDeFondsTable` (statut "overdue"). Il devrait être auto-injecté.

**Score cible : 83/100**

---

### TEMPLATE 18 — `contrat` (Contrat)
**Score actuel : 48/100**

Corps entièrement manuel. Pas de structure articles. Design trop proche des autres templates.

**Score cible : 78/100**

---

### TEMPLATE 19 — `contrat_bail` (Contrat de Bail)
**Score actuel : 65/100**

Données locataire auto-chargées depuis `tenantsTable` (getTenantData). Lot auto-chargé. Bonne couverture données. Manque : articles numérotés, clauses standards.

**Score cible : 82/100**

---

### TEMPLATE 20 — `convention_partenariat` (Convention de Partenariat)
**Score actuel : 52/100**

Corps principalement manuel. Données prestataire partiellement auto-chargées.

**Score cible : 75/100**

---

### TEMPLATE 21 — `accord_collectif` (Accord Collectif)
**Score actuel : 48/100**

Corps entièrement manuel. Design générique.

**Score cible : 72/100**

---

## FAMILLE E — ADMINISTRATIF

### TEMPLATE 22 — `autorisation` (Autorisation Officielle)
**Score actuel : 55/100**

Corps partiellement manuel. Signature simple.

**Score cible : 75/100**

---

### TEMPLATE 23 — `ordre_de_mission` (Ordre de Mission)
**Score actuel : 58/100**

Corps partiellement manuel. Données de mission saisies.

**Score cible : 77/100**

---

### TEMPLATE 24 — `lettre_officielle` (Lettre Officielle)
**Score actuel : 60/100**

Corps entièrement manuel. Design lettre d'entreprise correct mais générique.

**Score cible : 78/100**

---

### TEMPLATE 25 — `circulaire` (Circulaire Interne)
**Score actuel : 55/100**

Corps manuel. Liste destinataires non auto-chargée.

**Score cible : 76/100**

---

### TEMPLATE 26 — `note_interne` (Note Interne)
**Score actuel : 52/100**

Format mémo. Corps manuel. Le plus simple de tous.

**Score cible : 72/100**

---

### TEMPLATE 27 — `demande_administrative` (Demande Administrative)
**Score actuel : 55/100**

Corps partiellement manuel. Données demandeur auto-chargées.

**Score cible : 75/100**

---

### TEMPLATE 28 — `rapport_activite` (Rapport d'Activité)
**Score actuel : 50/100**

Corps entièrement manuel. Données statistiques disponibles en DB mais non injectées.

**Score cible : 74/100**

---

### TEMPLATE 29 — `certificat` (Certificat Officiel)
**Score actuel : 58/100**

Utilise `buildCertificateFrame()`. Corps court et générique. Design similaire aux attestations.

**Score cible : 80/100**

---

## FAMILLE F — OPÉRATIONS

### TEMPLATE 30 — `sinistre` (Déclaration de Sinistre)
**Score actuel : 62/100**

Données auto-chargées depuis `sinistresTable` (getSinistreData). Type, date, lieu, lot. Bon sur les données. Manque : zone photos/pièces jointes visible sur le PDF.

**Score cible : 80/100**

---

### TEMPLATE 31 — `travaux` (Ordre de Travaux)
**Score actuel : 64/100**

Données auto-chargées depuis `travauxTable` (getTravauxData). Prestataire, budget, dates. Bon. Manque : tableau devis vs réalisé, statut visuel proéminent.

**Score cible : 82/100**

---

### TEMPLATE 32 — `rapport_election` (Rapport d'Élection)
**Score actuel : 70/100**

Données auto-chargées depuis `electionsTable` + `candidatesTable` + `votesTable`. Tableau candidats avec résultats. Quorum calculé. Multi-signataires (Secrétaire + Président).

**Défaut principal :** Le podium des élus n'est pas visuellement mis en valeur (1er, 2ème, 3ème).

**Score cible : 85/100**

---

## RÉCAPITULATIF DES SCORES

| Rang | Template | Score actuel | Score cible | Delta |
|------|----------|:---:|:---:|:---:|
| 1 | `attestation` | 78 | 92 | +14 |
| 2 | `rapport_financier` | 78 | 90 | +12 |
| 3 | `appel_de_fonds` | 74 | 88 | +14 |
| 4 | `reglement` | 72 | 86 | +14 |
| 5 | `rapport_election` | 70 | 85 | +15 |
| 6 | `budget_previsionnel` | 70 | 84 | +14 |
| 7 | `pv` | 68 | 85 | +17 |
| 8 | `mise_en_demeure` | 67 | 83 | +16 |
| 9 | `contrat_bail` | 65 | 82 | +17 |
| 10 | `recu_paiement` | 65 | 85 | +20 |
| 11 | `sinistre` | 62 | 80 | +18 |
| 12 | `facture` | 62 | 83 | +21 |
| 13 | `convocation` | 63 | 82 | +19 |
| 14 | `travaux` | 64 | 82 | +18 |
| 15 | `decompte_charges` | 60 | 82 | +22 |
| 16 | `lettre_officielle` | 60 | 78 | +18 |
| 17 | `decision` | 58 | 78 | +20 |
| 18 | `ordre_de_mission` | 58 | 77 | +19 |
| 19 | `certificat` | 58 | 80 | +22 |
| 20 | `rapport_audit` | 55 | 76 | +21 |
| 21 | `attestation_paiement` | 55 | 93 | +38 |
| 22 | `circulaire` | 55 | 76 | +21 |
| 23 | `autorisation` | 55 | 75 | +20 |
| 24 | `demande_administrative` | 55 | 75 | +20 |
| 25 | `compte_rendu` | 55 | 80 | +25 |
| 26 | `attestation_residence` | 52 | 89 | +37 |
| 27 | `convention_partenariat` | 52 | 75 | +23 |
| 28 | `note_interne` | 52 | 72 | +20 |
| 29 | `rapport_activite` | 50 | 74 | +24 |
| 30 | `attestation_propriete` | 48 | 91 | +43 |
| 31 | `contrat` | 48 | 78 | +30 |
| 32 | `accord_collectif` | 48 | 72 | +24 |

**Score moyen actuel : 61.7/100**
**Score moyen cible : 82.2/100**
**Gain moyen par template : +20.5 points**

---

## PARTIE 4 — PLAN D'IMPLÉMENTATION PRIORISÉ

### Sprint 1 — Corrections bloquantes (1-2 jours)

**Objectif : Éliminer les bugs qui bloquent la valeur perçue**

1. **Fix signatures inline** :
   - Dans `POST /documents/:id/sign` : après la dernière signature requise, déclencher la regénération du PDF avec `_existingDocumentId`
   - Charger les signatures depuis DB et les passer dans `input.signatures`
   - Mettre à jour `documentsTable.fileUrl`

2. **Fix logos** :
   - Configurer `PRIVATE_OBJECT_DIR` en dev (pointer vers dossier local de l'object storage)
   - Tester `fetchLogoDataUrl` avec le path `/objects/...` d'un logo uploadé
   - Ajouter un log explicite quand la résolution échoue (actuellement silencieux)

3. **Fix SVG startsWith** :
   - Remplacer `.startsWith("<svg")` par `/^\s*<\?xml|^\s*<svg/i.test(sig.signatureData)`
   - Appliquer dans `signatureBlock()` et `makeAttCol()` et `appendSignaturesToPdf()`

### Sprint 2 — Famille Attestations (2-3 jours)

**Objectif : Différencier visuellement les 4 attestations**

4. **Redesign `attestation`** :
   - Changer accentColor → violet #7C3AED (cohérence app mobile)
   - Supprimer doublon CIN
   - Ajouter tantièmes dans grille droite
   - Passage 3 colonnes sig (Pres / Sec / Sceau)

5. **Redesign `attestation_residence`** :
   - Nouvelle couleur famille → bleu locatif #1D4ED8
   - Bloc "ADRESSE OFFICIELLE" encadré et centré
   - Ajouter durée d'occupation, type (propriétaire/locataire)

6. **Redesign `attestation_propriete`** :
   - Nouvelle couleur famille → bordeaux-doré #92400E
   - Fond crème, double filet
   - Titre Foncier en 18pt dans cellule dédiée
   - Surface privative + type de lot
   - Passer à 2 signataires (Pres + Sec)

7. **Redesign `attestation_paiement`** :
   - Nouvelle couleur famille → vert comptable #065F46
   - Montant en 32pt
   - Tableau des paiements (charger depuis `transactionsTable`)
   - Signataire → Trésorier

### Sprint 3 — Famille Finance (2-3 jours)

8. Redesign `appel_de_fonds` : montant en 36pt, instructions paiement améliorées
9. Redesign `recu_paiement` : badge "PAYÉ" sceau en filigrane
10. Redesign `facture` : structure HT/TVA/TTC
11. Améliorer `rapport_financier` : afficher "N/D" au lieu de "0 MAD"

### Sprint 4 — Famille Gouvernance (2 jours)

12. PV : Charger résolutions depuis `agResolutionsTable`, tableau Pour/Contre/Abstention
13. Convocation : Ordre du jour en liste numérotée
14. Règlement : Réduire header, densifier le contenu

### Sprint 5 — Famille Juridique + Opérations (2 jours)

15. Mise en demeure : Auto-calculer dette depuis `appelsDeFondsTable` (status=overdue)
16. Contrat bail : Ajouter articles numérotés
17. Rapport élection : Podium des élus mis en valeur

### Sprint 6 — Administratif + Polishing global (1-2 jours)

18. Templates administratifs : améliorer structure et compacité
19. Pass global : vérifier cohérence couleurs avec `constants/colors.ts` du mobile
20. Tests : générer 1 PDF de chaque famille et valider rendu

---

## DÉCISION IMMÉDIATE

**Je peux commencer maintenant par le Sprint 1 (corrections bloquantes) qui aura le plus d'impact immédiat :**
- Fix de la régénération avec signatures inline → les PDF refléteront enfin les vraies signatures
- Fix du test SVG → les traces manuscrites s'afficheront

**Ou par le Sprint 2 (redesign Attestations) qui aura le plus d'impact visuel.**

Votre instruction ?
