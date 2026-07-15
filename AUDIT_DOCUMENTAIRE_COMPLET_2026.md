# AUDIT EXHAUSTIF — MODULE GESTION DOCUMENTAIRE
## SYNDYCAT GLOBAL CPS — Rapport Final 20 Phases
**Date :** 15 juillet 2026 | **Version :** 1.0.0 | **Auditeur :** Senior Architect / Compliance Officer

---

## TABLE DES MATIÈRES

1. [Phase 1 — Analyse Métier & Matrice de Responsabilités](#phase-1)
2. [Phase 2 — Catalogue Documentaire](#phase-2)
3. [Phase 3 — Matrice des Permissions RBAC](#phase-3)
4. [Phase 4 — Cycle de Vie (State Machine)](#phase-4)
5. [Phase 5 — Workflow de Signature](#phase-5)
6. [Phase 6 — Système de Templates](#phase-6)
7. [Phase 7 — Multilingue AR/FR/EN/ES](#phase-7)
8. [Phase 8 — Vérification QR](#phase-8)
9. [Phase 9 — Stockage & Archivage](#phase-9)
10. [Phase 10 — Gestion des Versions](#phase-10)
11. [Phase 11 — Notifications](#phase-11)
12. [Phase 12 — Audit de Sécurité](#phase-12)
13. [Phase 13 — Super Admin](#phase-13)
14. [Phase 14 — Syndic Admin](#phase-14)
15. [Phase 15 — Expérience Membre & Locataire](#phase-15)
16. [Phase 16 — UX Entreprise](#phase-16)
17. [Phase 17 — Audit Base de Données](#phase-17)
18. [Phase 18 — Audit Performance](#phase-18)
19. [Phase 19 — Conformité Marocaine](#phase-19)
20. [Phase 20 — Rapport Final & Score de Production](#phase-20)

---

## PHASE 1 — ANALYSE MÉTIER & MATRICE DE RESPONSABILITÉS {#phase-1}

### 1.1 Fichiers analysés
- `artifacts/api-server/src/routes/documents.ts` (1 340 lignes)
- `artifacts/api-server/src/routes/workflows.ts`
- `artifacts/api-server/src/middleware/auth.ts` (147 lignes)
- `lib/db/src/schema.ts` — tables `usersTable`, `documentsTable`

### 1.2 Rôles identifiés dans le système

| Rôle JWT | Description | Scope |
|---|---|---|
| `super_admin` | Administrateur plateforme global | Toutes les syndics |
| `syndicate_admin` | Administrateur d'un syndic | Syndic seul (via `syndicateId` dans JWT) |
| `member` | Copropriétaire/Membre du conseil | Syndic seul |
| `tenant` | Locataire | Syndic seul |

**Acteurs non modélisés dans le JWT** (lacune critique) :
- Employé du syndic (→ pas de rôle dédié)
- Gestionnaire d'immeuble (→ pas de rôle dédié)
- Prestataire / Fournisseur (→ pas de rôle dédié)

Ces acteurs sont mentionnés dans la scope métier mais **absents de la table `usersTable.role`**. Ils interagissent avec des documents (devis, bons de livraison, contrats) sans RBAC propre.

### 1.3 Matrice de responsabilités documentaires (RACI)

| Action | super_admin | syndicate_admin | member | tenant |
|---|:---:|:---:|:---:|:---:|
| **Créer un document** | ✅ | ✅ | ❌ | ❌ |
| **Voir la liste** | ✅ (tous syndics) | ✅ (son syndic) | ✅ (publiés) | ❌ |
| **Voir le détail** | ✅ | ✅ | ✅ (publiés) | ❌ |
| **Télécharger PDF** | ✅ | ✅ | ✅ (publiés) | ❌ |
| **Modifier contenu** | ✅ | ✅ | ❌ | ❌ |
| **Changer statut** | ✅ | ✅ | ❌ | ❌ |
| **Approuver/Rejeter** | ✅ | ✅ | ❌ | ❌ |
| **Signer** | ✅ | ✅ | ❌ | ❌ |
| **Supprimer (soft)** | ✅ | ✅ | ❌ | ❌ |
| **Restaurer depuis corbeille** | ✅ | ❌ | ❌ | ❌ |
| **Purger (hard delete)** | ✅ | ❌ | ❌ | ❌ |
| **Voir corbeille** | ✅ | ✅ | ❌ | ❌ |
| **Voir historique versions** | ✅ | ✅ | ❌ | ❌ |
| **Restaurer version** | ✅ | ✅ | ❌ | ❌ |
| **Commenter** | ✅ | ✅ | ✅ | ❌ |
| **Supprimer commentaire** | ✅ | ✅ (son syndic) | ✅ (sien) | ❌ |
| **Voir signatures** | ✅ | ✅ | ❌ | ❌ |
| **Créer workflow** | ✅ | ✅ | ❌ | ❌ |
| **Décision workflow** | ✅ | ✅ | ❌ | ❌ |
| **Vérifier QR (public)** | ✅ (public) | ✅ | ✅ | ✅ |

### 1.4 Lacunes métier critiques

| # | Lacune | Impact | Priorité |
|---|---|---|---|
| L1 | Membres ne peuvent pas signer (contrats de co-mandat, AG) | Blocage légal Art. 12 Loi 18-00 | 🔴 CRITIQUE |
| L2 | Locataires exclus du flux documentaire (bail, EDL) | Produit incomplet | 🔴 CRITIQUE |
| L3 | Aucun rôle "Prestataire" — impossible de leur partager un bon de livraison | Perte de cas d'usage | 🟠 MAJEUR |
| L4 | Aucun rôle "Employé syndic" — impossible de déléguer la signature de PV | Blocage opérationnel | 🟠 MAJEUR |
| L5 | Pas de workflow d'approbation obligatoire avant signature | Risque fraude interne | 🟠 MAJEUR |
| L6 | Pas de notion de "modèle requis" par catégorie — un admin peut publier n'importe quel template dans n'importe quelle catégorie | Incohérence catalogue | 🟡 MINEUR |

---

## PHASE 2 — CATALOGUE DOCUMENTAIRE {#phase-2}

### 2.1 Fichiers analysés
- `artifacts/api-server/src/lib/documentPdf.ts` — type `DocumentTemplate` (lignes 875–897)
- `artifacts/mobile/app/documents.tsx` — constante `DOC_TEMPLATES` (lignes 62–85)
- `artifacts/api-server/src/routes/documents.ts` — enum Zod `templateId` (lignes 537–540)

### 2.2 Inventaire des 21 templates existants

| ID | Nom | Catégorie DB | Préfixe Num. | Corps multilingue |
|---|---|---|---|---|
| `attestation` | Attestation d'adhésion | attestation | ATT | ✅ FR/AR/EN/ES |
| `pv` | Procès-verbal | pv | PV | ✅ FR/AR/EN/ES |
| `convocation` | Convocation officielle | pv | CONV | ✅ FR/AR/EN/ES |
| `contrat` | Contrat | juridique | CTR | ⚠️ Chrome seulement |
| `rapport` | Rapport | finances | RAP | ⚠️ Chrome seulement |
| `decision` | Décision syndicale | juridique | DEC | ⚠️ Chrome seulement |
| `certificat` | Certificat officiel | statuts | CERT | ⚠️ Chrome seulement |
| `circulaire` | Circulaire interne | reglements | CIRC | ⚠️ Chrome seulement |
| `mise_en_demeure` | Mise en demeure | juridique | MED | ✅ FR/AR/EN/ES |
| `demande_administrative` | Demande administrative | reglements | DEM | ⚠️ Chrome seulement |
| `autorisation` | Autorisation officielle | juridique | AUT | ⚠️ Chrome seulement |
| `ordre_de_mission` | Ordre de mission | reglements | OM | ⚠️ Chrome seulement |
| `lettre_officielle` | Lettre officielle | juridique | LO | ⚠️ Chrome seulement |
| `note_interne` | Note interne | reglements | NI | ⚠️ Chrome seulement |
| `rapport_financier` | Rapport financier | finances | FIN | ⚠️ Chrome seulement |
| `rapport_audit` | Rapport d'audit | finances | AUD | ⚠️ Chrome seulement |
| `convention_partenariat` | Convention partenariat | juridique | CONV-P | ⚠️ Chrome seulement |
| `accord_collectif` | Accord collectif | juridique | AC | ⚠️ Chrome seulement |
| `compte_rendu` | Compte-rendu de réunion | pv | CR | ⚠️ Chrome seulement |
| `rapport_activite` | Rapport d'activité | finances | RA | ⚠️ Chrome seulement |
| `reglement` | Règlement de copropriété | reglements | REG | ✅ FR/AR/EN/ES (complet) |

### 2.3 Couverture des 10 catégories (standard SaaS documentaire)

| Catégorie | Présent | Templates | Gap |
|---|:---:|---|---|
| **Gouvernance** | ✅ | pv, convocation, compte_rendu, decision | — |
| **Financier** | ✅ | rapport_financier, rapport_audit, rapport_activite | Manque : budget_prévisionnel, relevé_charges |
| **Opérationnel** | ⚠️ | ordre_de_mission | Manque : bon_livraison, planning_travaux, réception_travaux |
| **Juridique** | ✅ | contrat, mise_en_demeure, autorisation, convention, accord | Manque : bail (locataire), état_des_lieux |
| **RH** | ❌ | — | Manque : contrat_employé, fiche_mission, lettre_licenciement |
| **Support** | ❌ | — | Manque : ticket_reclamation (PDF), rapport_sinistre |
| **Réglementaire** | ✅ | reglement, certificat, attestation | — |
| **Assemblée Générale** | ⚠️ | pv, convocation | Manque : pouvoir_de_représentation, feuille_présence_AG |
| **Marketplace** | ❌ | — | Manque : devis, facture, bon_commande |
| **Communication** | ⚠️ | circulaire, note_interne, lettre_officielle | Manque : communiqué_membres |

**Templates manquants critiques (11) :**
1. `bail` — Contrat de bail (locataire) → requis Loi 18-00 + Code des Obligations
2. `etat_des_lieux` — État des lieux entrée/sortie
3. `pouvoir_representant` — Pouvoir pour représentation en AG
4. `feuille_presence_ag` — Feuille de présence / quorum AG
5. `budget_previsionnel` — Budget prévisionnel annuel (Art. 27 Loi 18-00)
6. `releve_charges` — Relevé de charges individuel
7. `devis` — Devis prestataire
8. `facture` — Facture émise/reçue
9. `bon_livraison` — Bon de livraison travaux
10. `contrat_employe` — Contrat d'employé syndic
11. `rapport_sinistre` — Rapport de sinistre pour assurance

---

## PHASE 3 — MATRICE DES PERMISSIONS RBAC {#phase-3}

### 3.1 Fichiers analysés
- `artifacts/api-server/src/middleware/auth.ts` (complet)
- `artifacts/api-server/src/routes/documents.ts` — middlewares par route

### 3.2 Matrice complète Document × Rôle × Action

| Template/Catégorie | Action | super_admin | syndicate_admin | member | tenant |
|---|---|:---:|:---:|:---:|:---:|
| **TOUS** | Créer | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Lister | ✅ | ✅ (syndic) | ✅ (publiés) | ❌ |
| **TOUS** | Voir détail | ✅ | ✅ (syndic) | ✅ (publiés) | ❌ |
| **TOUS** | Télécharger URL signée | ✅ | ✅ | ✅ | ❌ |
| **TOUS** | Modifier | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Approuver (→validated) | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Rejeter (→rejected) | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Signer | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Publier (→published) | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Archiver | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Soft delete | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Restaurer corbeille | ✅ | ❌ | ❌ | ❌ |
| **TOUS** | Purger (hard) | ✅ | ❌ | ❌ | ❌ |
| **TOUS** | Historique versions | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Restaurer version | ✅ | ✅ | ❌ | ❌ |
| **TOUS** | Commenter | ✅ | ✅ | ✅ | ❌ |
| **TOUS** | Voir signatures | ✅ | ✅ | ❌ | ❌ |
| **Workflow** | Créer | ✅ | ✅ | ❌ | ❌ |
| **Workflow** | Décision étape | ✅ | ✅ | ❌ | ❌ |

### 3.3 Failles RBAC identifiées

| # | Faille | Localisation | Gravité |
|---|---|---|---|
| R1 | **Membres ne peuvent pas voir les signatures** — ils ne savent pas si un document publié est valablement signé | `GET /documents/:id/signatures` — `requireRole(super_admin, syndicate_admin)` | 🟠 MAJEUR |
| R2 | **`syndicate_admin` peut signer un document de statut `generated` sans approbation préalable** — court-circuit du workflow | `documents.ts:1076` — signable inclut `generated` | 🟠 MAJEUR |
| R3 | **`syndicate_admin` sans `syndicateId` dans JWT est bloqué à la création mais PAS à la lecture** — `GET /documents` ne vérifie pas `syndicateId` présent | `documents.ts:253` | 🟠 MAJEUR |
| R4 | **Pas de `requireNotTenant` sur `GET /documents/:id/download-url`** — un locataire peut télécharger n'importe quel PDF publié si il connaît l'ID | `documents.ts:495` | 🟡 MINEUR (ID non devinable) |
| R5 | **Membres peuvent commenter des documents en statut `draft`/`generated`** — pas de restriction sur le statut du document pour les commentaires | `documents.ts:1278` | 🟡 MINEUR |
| R6 | **Membres peuvent voir le détail d'un document en statut non-`published`** si ils connaissent l'ID | `documents.ts:475` — pas de filtre statut pour membres | 🟡 MINEUR |

### 3.4 Correctif R2 (critique — contournement workflow)

```typescript
// artifacts/api-server/src/routes/documents.ts:1076
// AVANT (vulnérable) :
const signable: DocStatus[] = ["generated", "validated"];

// APRÈS (sécurisé — signature uniquement après validation) :
const signable: DocStatus[] = ["validated"];
// Ou, si la signature directe est souhaitée pour les documents "generated",
// ajouter une permission explicite dans le JWT :
const signable: DocStatus[] = req.user!.role === "super_admin"
  ? ["generated", "validated"]
  : ["validated"];
```

### 3.5 Correctif R3 (lecture non scopée)

```typescript
// artifacts/api-server/src/routes/documents.ts — GET /documents
// Ajouter après requireAuth :
router.get("/documents", requireAuth, async (req, res) => {
  // AJOUT : bloquer syndicate_admin sans syndicateId
  if (req.user!.role === "syndicate_admin" && !req.user!.syndicateId) {
    res.status(403).json({ error: "syndicateId manquant dans le jeton" });
    return;
  }
  // ... suite du handler
```

---

## PHASE 4 — CYCLE DE VIE (STATE MACHINE) {#phase-4}

### 4.1 États actuels (9 états)

```
draft → generated → pending_review → validated → signed → published → archived
                 ↘ rejected ↗ (depuis generated, pending_review, validated)
                             ↘ expired (depuis signed, published)
                                    ↘ archived
```

### 4.2 Table ALLOWED_TRANSITIONS (analysée ligne par ligne)

```typescript
// documents.ts:62-72
draft:          ["generated", "pending_review", "published"],  // ⚠️ FAILLE : draft → published DIRECT
generated:      ["pending_review", "validated", "rejected"],
pending_review: ["generated", "validated", "draft", "rejected"],
validated:      ["signed", "published", "rejected"],
signed:         ["published", "expired"],
published:      ["archived", "expired"],
archived:       [],                                             // ✅ État terminal
rejected:       ["draft", "pending_review"],
expired:        ["archived"],
```

### 4.3 Failles de la machine d'états

| # | Faille | Transition problématique | Risque |
|---|---|---|---|
| SM1 | **Court-circuit total** : `draft → published` est autorisé sans aucune validation | `draft` → `["generated", "pending_review", "published"]` | 🔴 CRITIQUE |
| SM2 | **`draft → generated → validated`** sans revue possible pour les petits syndicats — pas de workflow obligatoire | `generated` → `["validated"]` | 🟠 MAJEUR |
| SM3 | **Retour arrière illimité depuis `pending_review → draft`** — un admin peut annuler un document en cours de révision sans trace d'audit dédiée | `pending_review` → `["draft"]` | 🟡 MINEUR |
| SM4 | **`validated → rejected`** sans enregistrement de la raison de rejet côté DB si le champ `rejectionReason` n'est pas transmis | Le Zod schema vérifie `rejectionReason` requis si `to === rejected` (ligne 720) — mais uniquement si le `status` change en une seule requête | 🟡 MINEUR |
| SM5 | **Pas d'état `cancelled`** (distinct de `rejected`) pour les documents annulés avant finalisation | Toute annulation passe par `rejected`, ce qui peut créer de la confusion | 🟡 MINEUR |

### 4.4 Correctif SM1 (CRITIQUE)

```typescript
// artifacts/api-server/src/routes/documents.ts:62-72
// SUPPRIMER "published" des transitions autorisées depuis "draft"
const ALLOWED_TRANSITIONS: Record<DocStatus, DocStatus[]> = {
  draft:          ["generated", "pending_review"],  // ❌ Retirer "published"
  generated:      ["pending_review", "validated", "rejected"],
  pending_review: ["generated", "validated", "draft", "rejected"],
  validated:      ["signed", "published", "rejected"],
  signed:         ["published", "expired"],
  published:      ["archived", "expired"],
  archived:       [],
  rejected:       ["draft", "pending_review"],
  expired:        ["archived"],
};
```

### 4.5 Recommandation : Workflow obligatoire par catégorie

```typescript
// Ajouter dans documents.ts — avant la mise à jour du statut
const MANDATORY_REVIEW_CATEGORIES = ["juridique", "finances", "statuts"];
if (
  result.data.status === "validated" &&
  MANDATORY_REVIEW_CATEGORIES.includes(existing.category) &&
  existing.status !== "pending_review"
) {
  res.status(422).json({
    error: "Ce type de document requiert une étape de révision (pending_review) avant validation."
  });
  return;
}
```

---

## PHASE 5 — WORKFLOW DE SIGNATURE {#phase-5}

### 5.1 Fichiers analysés
- `artifacts/api-server/src/routes/documents.ts` — `POST /documents/:id/sign` (lignes 1057–1178)
- `lib/db/src/schema.ts` — `documentSignaturesTable` (lignes 1053–1083)
- `artifacts/api-server/src/lib/documentPdf.ts` — `appendSignaturesToPdf` (lignes ~800–857)
- `artifacts/mobile/components/SignaturePad.tsx`

### 5.2 Ce qui fonctionne ✅

- Prévention de double-signature (vérification applicative + contrainte unique DB `doc_signatures_document_signer_uq`)
- `signatureOrder` calculé atomiquement (count + 1)
- Snapshot `signerName` au moment de la signature (résistant aux suppressions de compte)
- `isValid: false` sur toutes les signatures lors d'un rejet
- `ipAddress` enregistré pour traçabilité
- SVG de la signature manuscrite stocké dans `signatureData`
- Audit log `DOCUMENT_SIGNED` avec signataire et rôle

### 5.3 Lacunes critiques

| # | Lacune | Localisation | Gravité |
|---|---|---|---|
| SIG1 | **Désynchronisation DB/PDF possible** — si `appendSignaturesToPdf` échoue (GCS indisponible), la DB enregistre "signé" mais le PDF ne contient pas la signature | `documents.ts:1127` — `catch((err) => req.log.error(...))` — erreur silencieuse | 🔴 CRITIQUE |
| SIG2 | **Pas de nombre minimum de signatures requis** — un document peut être signé par 1 signataire et publié même si le règlement interne en requiert 2 ou 3 | Aucune colonne `requiredSignatures` sur `documentsTable` | 🟠 MAJEUR |
| SIG3 | **Membres/locataires ne peuvent pas signer** — or les baux, EDL et certains PV requièrent leur signature (Art. 12 Loi 18-00) | `requireRole("super_admin", "syndicate_admin")` — trop restrictif | 🟠 MAJEUR |
| SIG4 | **Pas d'horodatage RFC 3161** — l'horodatage dans la DB est celui du serveur, pas d'une autorité de confiance | Absence de client TSA | 🟠 MAJEUR |
| SIG5 | **`signatureData` (SVG) non validé** — une chaîne SVG malveillante pourrait injecter du contenu dans le PDF | `z.string().optional()` sans sanitisation | 🟠 MAJEUR |
| SIG6 | **Statut forcé à `signed` même pour la 1ère signature dans un multi-sig** — le document passe à `signed` dès la première signature | `documents.ts:1117` — `status: "signed"` | 🟡 MINEUR |
| SIG7 | **Pas de délai d'expiration de la demande de signature** — une demande de signature peut rester ouverte indéfiniment | Aucune colonne `signatureRequestExpiresAt` | 🟡 MINEUR |

### 5.4 Correctif SIG1 (CRITIQUE — désynchronisation)

```typescript
// artifacts/api-server/src/routes/documents.ts:1126-1138
// REMPLACER le "best-effort" par un mécanisme fiable avec rollback

if (doc.fileUrl) {
  try {
    await appendSignaturesToPdf(
      doc.fileUrl,
      [{ signerName, signerRole: req.user!.role, signedAt: now, signatureSvg: result.data.signatureData, isValid: true }],
      (doc.language as DocumentLanguage) ?? "fr",
    );
  } catch (pdfErr) {
    // ROLLBACK : marquer la signature comme "pdfEmbedFailed" pour retry asynchrone
    req.log.error({ err: pdfErr, docId: id }, "Signature PDF embed FAILED — marking for async retry");
    await db.update(documentSignaturesTable)
      .set({ isValid: false } as any)  // Invalider jusqu'au retry réussi
      .where(eq(documentSignaturesTable.id, sig.id));
    // Optionnel : queue Redis pour retry background
    res.status(202).json({ data: sig, message: "Signature enregistrée, intégration PDF en cours (retry asynchrone)" });
    return;
  }
}
```

### 5.5 Correctif SIG2 — Nombre minimum de signatures

```typescript
// lib/db/src/schema.ts — Ajouter sur documentsTable
requiredSignatures: integer("required_signatures").default(1).notNull(),
currentSignatureCount: integer("current_signature_count").default(0).notNull(),

// artifacts/api-server/src/routes/documents.ts — Dans POST /sign
// Après insertion de la signature :
const newCount = nextOrder; // = sig.signatureOrder
const required = doc.requiredSignatures ?? 1;
const newStatus: DocStatus = newCount >= required ? "signed" : "pending_signatures";
await db.update(documentsTable).set({
  status: newStatus,
  currentSignatureCount: newCount,
  ...(newStatus === "signed" ? { signedAt: now, signedBy: req.user!.userId } : {}),
} as any).where(eq(documentsTable.id, id));
```

---

## PHASE 6 — SYSTÈME DE TEMPLATES {#phase-6}

### 6.1 Fichiers analysés
- `artifacts/api-server/src/lib/documentPdf.ts` (1 938 lignes — complet)
- `artifacts/api-server/src/routes/documents.ts` — corps POST (lignes 528–677)

### 6.2 Architecture des templates — Ce qui est présent

**Structure A4 standardisée :**
- `buildHeaderBand` : bande colorée avec logo, nom syndic, registre, contacts
- `metaTable` : paires clé-valeur (résidence, date, référence)
- `contentSection` : corps du document
- `signatureBlock` : bloc signataires avec SVG
- Filigrane pour statuts non-publiés (`DRAFT`, `REJETÉ`, `EXPIRÉ`)
- QR code en bas de page (URL de vérification publique)
- Numérotation de pages automatique
- Branding multi-tenant (couleur accent, logo URL)

**Polices :**
- Helvetica (toujours disponible — fallback)
- DejaVu Sans (si `/usr/share/fonts/truetype/dejavu/` présent)
- Amiri (si `artifacts/api-server/fonts/Amiri-*.ttf` présents — ✅ fichiers présents)

### 6.3 Variables dynamiques par template

| Template | Variables utilisées | Variables manquantes en DB |
|---|---|---|
| `attestation` | `memberName`, `syndicate`, `property`, `date`, `signatures` | `memberSince`, `lotNumber`, `lotType` |
| `pv` | `lieu`, `meetingDate`, `heure`, `agendaText`, `deliberationsText`, `resolutionsText`, `president`, `secretaire` | `quorum`, `votesFor`, `votesAgainst`, `votesAbstain` |
| `convocation` | `lieu`, `meetingDate`, `heure`, `agendaText` | `convocationSentDate`, `methodEnvoi` |
| `contrat` | `title`, `content`, `syndicate`, `memberName`, `objet`, `periode`, `organe` | `contractValue`, `startDate`, `endDate`, `penaltyClause` |
| `rapport_financier` | `title`, `content`, `periode`, `synthese` | `totalRecettes`, `totalDepenses`, `solde`, `budgetLine[]` |
| `reglement` | `buildings`, `floors`, `lots`, `surface`, `landRef` | ✅ Complet |
| `mise_en_demeure` | `recipient`, `objet`, `delai`, `consequences`, `preamble` | `montantDu`, `referenceFacture` |

### 6.4 Lacunes des templates

| # | Lacune | Template concerné | Gravité |
|---|---|---|---|
| T1 | **Données financières non injectées** dans `rapport_financier` — les colonnes `numeric(12,2)` de `chargesTable`, `cotisationsTable` ne sont pas récupérées | `rapport_financier`, `rapport_audit` | 🔴 CRITIQUE |
| T2 | **Quorum AG non calculé** dans `pv`/`convocation` — pourtant requis par Art. 11 Loi 18-00 | `pv`, `convocation` | 🟠 MAJEUR |
| T3 | **Pas de tableau des présences** dans le PV — juste un texte libre | `pv`, `compte_rendu` | 🟠 MAJEUR |
| T4 | **`contentSection` avec texte brut uniquement** — pas de support Markdown/HTML dans le corps | Tous | 🟡 MINEUR |
| T5 | **Pas de numéro de page dans le format "Page X/Y"** sur le header (seulement footer) | Tous | 🟡 MINEUR |
| T6 | **Enum `templateId` dans le Zod schema POST exclut 11 templates** (`rapport_audit`, `convention_partenariat`, etc.) | `documents.ts:537-540` | 🔴 CRITIQUE |

### 6.5 Correctif T6 (CRITIQUE — templates inaccessibles via API)

```typescript
// artifacts/api-server/src/routes/documents.ts:537-540
// AVANT (manque 11 templates) :
templateId: z.enum([
  "attestation", "pv", "convocation", "contrat", "rapport",
  "decision", "certificat", "circulaire", "mise_en_demeure", "reglement",
] as const).optional(),

// APRÈS (tous les 21 templates accessibles) :
templateId: z.enum([
  "attestation", "pv", "convocation", "contrat", "rapport",
  "decision", "certificat", "circulaire", "mise_en_demeure", "reglement",
  "demande_administrative", "autorisation", "ordre_de_mission", "lettre_officielle",
  "note_interne", "rapport_financier", "rapport_audit", "convention_partenariat",
  "accord_collectif", "compte_rendu", "rapport_activite",
] as const).optional(),
```

---

## PHASE 7 — MULTILINGUE AR/FR/EN/ES {#phase-7}

### 7.1 Fichiers analysés
- `artifacts/api-server/src/lib/documentPdf.ts` — objet `I18N` et styles (lignes 98–200)
- `artifacts/mobile/app/workflow.tsx` — objet `STRINGS` (lignes 26–93)
- `artifacts/mobile/app/documents.tsx` — constantes CATS, labels status (lignes 33–181)
- `artifacts/mobile/context/LanguageContext.tsx`

### 7.2 Couverture multilingue par template

| Template | FR corps | AR corps | EN corps | ES corps | RTL layout |
|---|:---:|:---:|:---:|:---:|:---:|
| `reglement` | ✅ | ✅ | ✅ | ✅ | ✅ (alignment:right) |
| `attestation` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pv` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `convocation` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `certificat` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `mise_en_demeure` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `contrat` | ✅ | ⚠️ Chrome | ⚠️ Chrome | ⚠️ Chrome | ⚠️ |
| `rapport_financier` | ✅ | ⚠️ Chrome | ⚠️ Chrome | ⚠️ Chrome | ⚠️ |
| `rapport_audit` | ✅ | ⚠️ Chrome | ⚠️ Chrome | ⚠️ Chrome | ⚠️ |
| `convention_partenariat` | ✅ | ⚠️ Chrome | ⚠️ Chrome | ⚠️ Chrome | ⚠️ |
| `accord_collectif` | ✅ | ⚠️ Chrome | ⚠️ Chrome | ⚠️ Chrome | ⚠️ |
| 10 autres templates | ✅ | ⚠️ Chrome | ⚠️ Chrome | ⚠️ Chrome | ⚠️ |

**Légende :** ✅ = traduction complète corps+chrome | ⚠️ Chrome = header/meta/footer/signature traduits, corps en FR uniquement

### 7.3 Couverture i18n Mobile

| Écran | t() global | Strings locales | Hardcoded FR | RTL layout |
|---|---|---|---|---|
| `documents.tsx` | ❌ | ❌ | 🔴 ~60 strings | ❌ |
| `documents-dashboard.tsx` | ❌ | ❌ | 🔴 ~40 strings | ❌ |
| `documents-recycle-bin.tsx` | ❌ | ❌ | 🔴 ~15 strings | ❌ |
| `workflow.tsx` | ✅ (STRINGS local) | ✅ FR/EN/AR/ES | ⚠️ Quelques | ❌ |
| `pdf-viewer.tsx` | ❌ | ❌ | 🔴 ~10 strings | ❌ |

**Bilan i18n mobile :** 4 écrans documentaires sur 5 sont entièrement en français sans support RTL.

### 7.4 Lacunes RTL

| # | Lacune | Gravité |
|---|---|---|
| RTL1 | **Aucun `I18nManager.forceRTL(true)`** lors du choix de langue AR dans les écrans documents | 🔴 CRITIQUE |
| RTL2 | **PDF viewer (pdf-js) est LTR fixe** — un document arabe affiché dans le viewer n'a pas de layout RTL | 🟠 MAJEUR |
| RTL3 | **`flex-direction` hardcodé** dans les cards et listes des écrans documents — non mirrored en AR | 🟠 MAJEUR |
| RTL4 | **Les chiffres arabes (٠١٢٣٤٥٦٧٨٩) non utilisés** dans les PDFs en langue AR — utilisation des chiffres latins | 🟡 MINEUR |

---

## PHASE 8 — VÉRIFICATION QR {#phase-8}

### 8.1 Fichiers analysés
- `artifacts/api-server/src/routes/documents.ts` — `GET /documents/verify/:token` (lignes 395–474)
- `artifacts/api-server/src/lib/documentPdf.ts` — génération QR (lignes 333–345)
- `documents.ts:593-595` — création du token

### 8.2 Analyse du système QR

**Architecture actuelle :**
```
PDF généré → qrcode(verificationUrl) → QR image dans PDF
verificationUrl = https://{REPLIT_DOMAINS}/api/documents/verify/{randomUUID}
Token stocké dans documentsTable.verificationToken (UNIQUE INDEX)
Endpoint public : GET /api/documents/verify/:token → retourne métadonnées + statut + signatures
```

**Ce qui fonctionne ✅ :**
- Token opaque UUID (non devinable)
- Index unique sur `verificationToken`
- Endpoint public (sans auth) — accessible depuis QR
- Retourne : statut, titre, catégorie, syndicat, date création, signatures (nom, rôle, date, validité)
- Détecte les documents supersédés (`supersededByDocumentId`)
- QR avec error correction level MEDIUM

**Lacunes identifiées :**

| # | Lacune | Gravité |
|---|---|---|
| QR1 | **Pas de révocabilité du token** — impossible d'invalider un QR (ex: document refondu) sans changer le token | 🟠 MAJEUR |
| QR2 | **Token UUID non expirant** — un QR d'un document archivé il y a 10 ans reste vérifiable indéfiniment | 🟡 MINEUR |
| QR3 | **Endpoint `/verify/:token` ne renvoie pas d'erreur structurée si token invalide** — risque de 500 si UUID malformé | `documents.ts:445` — pas de validation UUID avant requête DB | 🟡 MINEUR |
| QR4 | **Pas de rate-limiting sur l'endpoint public** — attaque par énumération de tokens possible | Aucun middleware rate-limit sur `/verify` | 🟠 MAJEUR |
| QR5 | **URL de vérification dépend de `REPLIT_DOMAINS`** — si domaine change, tous les QR existants sont cassés | `documents.ts:86-88` | 🟠 MAJEUR |
| QR6 | **Pas de page HTML de vérification** — le QR pointe vers un endpoint JSON (`/api/documents/verify/`) non lisible par un humain avec un smartphone | UX critique | 🔴 CRITIQUE |

### 8.3 Correctifs QR4 + QR6

```typescript
// QR4 : Rate limiting sur l'endpoint public
// artifacts/api-server/src/app.ts — Ajouter avant les routes
import rateLimit from "express-rate-limit";
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 vérifications/minute par IP
  message: { error: "Trop de requêtes de vérification. Réessayez dans 1 minute." },
});
app.use("/api/documents/verify", verifyLimiter);
```

```typescript
// QR6 : Page HTML lisible par humain
// Modifier buildVerifyUrl pour pointer vers une page web (pas l'API JSON)
function buildVerifyUrl(token: string): string | undefined {
  const base = process.env.PUBLIC_APP_URL || ...;
  // Pointer vers la page mobile/web, pas l'endpoint API brut
  return `${base.replace(/\/$/, "")}/verify/${token}`;
}
// Créer artifacts/mobile/app/verify-document.tsx — page de vérification publique
```

---

## PHASE 9 — STOCKAGE & ARCHIVAGE {#phase-9}

### 9.1 Fichiers analysés
- `artifacts/api-server/src/lib/objectStorage.ts`
- `artifacts/api-server/src/lib/objectAcl.ts`
- `artifacts/api-server/src/lib/document-retention-job.ts`
- `artifacts/api-server/src/lib/document-expiry-job.ts`
- `artifacts/api-server/src/lib/retention.ts` (complet)

### 9.2 Architecture de stockage

```
GCS (Google Cloud Storage via Replit sidecar)
  └── PRIVATE_OBJECT_DIR/
        └── documents/
              └── {uuid}/
                    └── {filename}.pdf
```

**Accès :**
- **Écriture** : uniquement via `objectStorageClient.bucket().file().save()`
- **Lecture** : URL signée TTL 3600s générée via sidecar `POST /object-storage/signed-object-url`
- **ACL** : métadonnée JSON `custom:aclPolicy` sur chaque objet (`owner`, `visibility`, `aclRules`)

### 9.3 Politique de rétention légale

| Catégorie | Rétention | Base légale |
|---|---|---|
| `finances` | 10 ans | Code général de normalisation comptable |
| `juridique` | 10 ans | Code des Obligations et Contrats |
| `pv` | 5 ans | Art. 27 Loi 18-00 |
| `statuts` | 10 ans | Loi 18-00 |
| `reglements` | 3 ans | Circulaires internes |
| `attestation` | 3 ans | Usage interne |
| **Défaut** | **5 ans** | Précaution |

**Overrides par template :** `contrat`, `convention_partenariat`, `accord_collectif`, `rapport_financier`, `rapport_audit`, `mise_en_demeure` → 10 ans.

### 9.4 Lacunes de stockage

| # | Lacune | Gravité |
|---|---|---|
| S1 | **Purge ne vérifie pas `retentionUntil`** — un super_admin peut hard-delete un document avant sa date de rétention légale | `documents.ts:1020-1052` — aucune vérification de `retentionUntil` | 🔴 CRITIQUE |
| S2 | **Sidecar non disponible = uploads silencieusement échoués** — `GCS sidecar "no allowed resources"` est une erreur connue (memory: gcs-sidecar-no-allowed-resources.md) | Architecture | 🔴 CRITIQUE |
| S3 | **Pas de stratégie de backup** — aucun job de sauvegarde des PDFs en dehors de GCS | Disaster recovery absent | 🟠 MAJEUR |
| S4 | **`retention_job` : hard-delete sans confirmation** — suppression silencieuse après `PURGE_GRACE_DAYS` sans email admin | `document-retention-job.ts:088-127` | 🟠 MAJEUR |
| S5 | **Pas de chiffrement applicatif AES-256** des PDFs avant upload — sécurité repose uniquement sur le bucket GCS | Conformité CNDP (Loi 09-08) | 🟠 MAJEUR |
| S6 | **`size` stocké en Ko (text)** non pas en bytes (integer) — calcul de taille approximatif | `documents.ts:750` — `${Math.round(content.length / 1024)}Ko` | 🟡 MINEUR |

### 9.5 Correctif S1 (CRITIQUE — purge sans vérification rétention)

```typescript
// artifacts/api-server/src/routes/documents.ts:1020-1052 — POST /documents/:id/purge
// AJOUTER avant le delete :
const now = new Date();
if (existing.retentionUntil && new Date(existing.retentionUntil) > now) {
  const retentionDate = new Date(existing.retentionUntil).toLocaleDateString("fr-MA");
  res.status(403).json({
    error: `Impossible de purger : la rétention légale de ce document expire le ${retentionDate}.`,
    code: "RETENTION_NOT_EXPIRED",
    retentionUntil: existing.retentionUntil,
  });
  return;
}
```

---

## PHASE 10 — GESTION DES VERSIONS {#phase-10}

### 10.1 Architecture de versioning

**Table `documentVersionsTable` :**
- Snapshot complet avant chaque modification significative (`title`, `content`, `status`)
- `versionNumber` auto-incrémenté
- `modifiedBy`, `modifiedAt`, `changeReason` tracés
- Contrainte unique `(documentId, versionNumber)`
- Restauration sécurisée (snapshot du current avant restauration)

### 10.2 Ce qui fonctionne ✅

- Versioning automatique déclenché par : modification de `content`, `title`, changement de `status`
- Snapshot réversible : restaurer une version crée un nouveau snapshot du current
- Historique consultable par admins
- Join avec `usersTable.name` pour afficher l'auteur de modification

### 10.3 Lacunes versioning

| # | Lacune | Gravité |
|---|---|---|
| V1 | **Le snapshot ne capture pas `fileUrl`** — si un PDF est regénéré, l'URL de l'ancienne version est perdue | `documents.ts:730-741` — `fileUrl: existing.fileUrl` est bien copié dans la version ✅ (fausse alarme) | ✅ OK |
| V2 | **Pas de "diff" visuel** entre deux versions — l'UI n'affiche que les métadonnées | `artifacts/mobile` — aucun écran de comparaison | 🟡 MINEUR |
| V3 | **Version non incrémentée lors d'un changement de `status` seul** — `documents.ts:752-755` conditionne l'incrément à `content !== undefined` | Versions de statut sans incrémentation du compteur | 🟡 MINEUR |
| V4 | **La restauration d'une version remet le statut de l'ancienne version** — un document `published` peut être ramené à `draft` | `documents.ts:909` — `status: version.status ?? existing.status` | 🟠 MAJEUR |
| V5 | **Pas de rétention des versions** — les snapshots s'accumulent indéfiniment sans purge | Pas de job de nettoyage des versions | 🟡 MINEUR |

### 10.4 Correctif V4 (restauration de statut)

```typescript
// artifacts/api-server/src/routes/documents.ts:904-915
// Ne pas restaurer le statut depuis la version archivée :
const [doc] = await db.update(documentsTable).set({
  title: version.title,
  content: version.content,
  // NE PAS restaurer le statut — garder le statut actuel
  // status: version.status ?? existing.status,  ← RETIRER
  language: version.language ?? existing.language,
  version: sql`COALESCE(${documentsTable.version}, 1) + 1`,
  updatedAt: new Date(),
} as any).where(eq(documentsTable.id, id)).returning();
```

---

## PHASE 11 — NOTIFICATIONS {#phase-11}

### 11.1 Fichiers analysés
- `artifacts/api-server/src/lib/notify.ts` (complet, 174 lignes)
- `artifacts/api-server/src/lib/document-expiry-job.ts`
- `artifacts/api-server/src/lib/email/emailService.ts`

### 11.2 Déclencheurs de notification existants

| Événement | Push | Email | In-App | Cible |
|---|:---:|:---:|:---:|---|
| Document créé | ✅ | ✅ | ✅ | admins du syndic |
| Document approuvé (validated) | ✅ | ✅ | ✅ | auteur du doc |
| Document rejeté | ✅ | ✅ | ✅ | auteur du doc |
| Document signé | ✅ | ✅ | ✅ | admins + auteur |
| Document publié | ✅ | ❌ | ✅ | tous membres |
| Expiration à 30j | ✅ | ✅ | ✅ | admins |
| Expiration à 15j | ✅ | ✅ | ✅ | admins |
| Expiration à 7j | ✅ | ✅ | ✅ | admins |
| Expiration à 1j | ✅ | ✅ | ✅ | admins |
| Document expiré | ✅ | ✅ | ✅ | admins |
| Retention expirée (légal) | ✅ | ✅ | ✅ | admins |

### 11.3 Lacunes notifications

| # | Lacune | Gravité |
|---|---|---|
| N1 | **Document publié n'envoie pas d'email** aux membres — seulement un push/in-app | `documents.ts:789-797` — `createAlert` target=`all` mais pas de `sendEmailToMany` | 🟠 MAJEUR |
| N2 | **Pas de notification lors d'une demande de signature** — le signataire désigné ne sait pas qu'il doit signer | Aucun trigger "signature requise" | 🟠 MAJEUR |
| N3 | **Pas de digest quotidien** — résumé des actions documentaires du jour | Aucun job de résumé | 🟡 MINEUR |
| N4 | **Notifications `target: "admin"` uniquement en push** — les membres qui téléchargent un doc publié ne reçoivent pas d'alerte | Cible `all` seulement pour "publié" | 🟡 MINEUR |
| N5 | **Pas de notification lors de l'archivage** automatique par le job | `document-expiry-job.ts` — transition `expired → archived` silencieuse | 🟡 MINEUR |
| N6 | **SMTP non configuré en production** — `SMTP_PASS` présent mais `SMTP_HOST/PORT/FROM` possiblement absents | Risque silencieux — les emails échouent sans erreur visible | 🟠 MAJEUR |

---

## PHASE 12 — AUDIT DE SÉCURITÉ {#phase-12}

### 12.1 Fichiers analysés
- `artifacts/api-server/src/middleware/auth.ts` (complet)
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/lib/objectAcl.ts`
- `artifacts/api-server/src/lib/objectStorage.ts`

### 12.2 Authentification — État

| Contrôle | Statut | Détail |
|---|:---:|---|
| JWT avec secret ≥32 chars | ✅ | Vérifié au démarrage (`validateAuthConfig`) |
| Access token 15 min | ✅ | `signToken` — `expiresIn: "15m"` |
| Refresh token 30 jours | ✅ | UUID + expiry en DB |
| Token dans query param `?token=` | ⚠️ | Nécessaire pour PDF Linking.openURL — risque de log serveur |
| `syndicateId` dans JWT | ✅ | Isolation par syndic enforced |

### 12.3 Isolation des données (Cross-syndicate)

| Contrôle | Statut | Localisation |
|---|:---:|---|
| `assertSyndicateAccess` helper | ✅ | `middleware/auth.ts:126-131` |
| Vérification `syndicateId` sur PUT | ✅ | `documents.ts:706-708` |
| Vérification `syndicateId` sur DELETE | ✅ | `documents.ts:947-949` |
| Vérification `syndicateId` sur signature | ✅ | `documents.ts:1072-1074` |
| Vérification `syndicateId` sur GET /documents | ⚠️ | Filtre appliqué mais non bloquant si absent |
| Vérification `syndicateId` sur GET /summary | ⚠️ | À vérifier |
| Vérification `syndicateId` sur /verify (public) | ✅ | Endpoint public intentionnel |

### 12.4 Failles de sécurité identifiées

| # | Faille | CVSS | Fichier:Ligne | Gravité |
|---|---|---|---|---|
| SEC1 | **Token JWT dans URL `?token=`** — loggué par Nginx/proxy/CDN access logs. Risque de fuite via referrer | 4.3 | `auth.ts:38` | 🟠 MAJEUR |
| SEC2 | **Pas de CORS restrictif documenté** — headers CORS non vérifiés dans `app.ts` | 5.0 | `app.ts` | 🟠 MAJEUR |
| SEC3 | **`signatureData` (SVG) non sanitisé** — injection potentielle dans pdfmake | 6.1 | `documents.ts:1064` | 🟠 MAJEUR |
| SEC4 | **Pas de chiffrement AES-256 des PDFs au repos** — protection uniquement par ACL GCS | 5.5 | `objectStorage.ts` | 🟠 MAJEUR |
| SEC5 | **Purge GCS sans vérification rétention légale** | 7.2 | `documents.ts:1033-1038` | 🔴 CRITIQUE |
| SEC6 | **Pas de rate-limiting sur endpoint de signature** — attaque par replay possible | 5.0 | `documents.ts:1057` | 🟠 MAJEUR |
| SEC7 | **`commentId` IDOR non protégé si commentaire sur document d'un autre syndic** — la vérification de `syndicateId` via le document est correcte, mais coûteuse (2 queries) | 3.1 | `documents.ts:1301-1337` | 🟡 MINEUR |
| SEC8 | **URL signée GCS (TTL 1h) transmise au mobile** — si partagée, valable pendant 1h | Design choice — acceptable | 🟡 INFO |

### 12.5 Correctif SEC3 — Sanitisation SVG

```typescript
// artifacts/api-server/src/routes/documents.ts:1063-1065
import { sanitizeSvg } from "../lib/svgSanitizer.js";  // à créer

const schema = z.object({
  signatureData: z.string()
    .optional()
    .transform((val) => val ? sanitizeSvg(val) : val),
});

// artifacts/api-server/src/lib/svgSanitizer.ts — Nouveau fichier
export function sanitizeSvg(input: string): string {
  // Supprimer tout élément non-path/polyline/line/circle + attributs dangereux
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "")
    .slice(0, 50_000); // Limite taille
}
```

### 12.6 Correctif SEC1 — Token JWT dans URL

```typescript
// artifacts/api-server/src/middleware/auth.ts:37-39
// ALTERNATIVE SÉCURISÉE : utiliser un cookie httpOnly au lieu du query param
// Si ce n'est pas possible (mobile), utiliser un "download token" à usage unique :

// 1. POST /documents/:id/request-download → retourne un token one-time (UUID, TTL 5min, stocké en DB)
// 2. GET /documents/:id/pdf?download_token={one_time_token} → consomme le token, retourne le PDF directement
```

---

## PHASE 13 — SUPER ADMIN {#phase-13}

### 13.1 Analyse des droits Super Admin

**Capacités exclusives (super_admin only) :**
- Restaurer depuis corbeille (`POST /documents/:id/restore`)
- Purger définitivement (`POST /documents/:id/purge`)
- Accéder à tous les syndicats
- Voir l'audit log (`GET /audit`)

**Contrôles :**
- Mode supervision requis (`?supervision=true`) pour accéder aux opérations d'un syndic spécifique (`requireOperationalAccess`)
- Trace d'audit sur toutes les actions DOCUMENT_GENERATED, DOCUMENT_UPDATED, DOCUMENT_DELETED, DOCUMENT_PURGED, DOCUMENT_SIGNED, DOCUMENT_VERSION_RESTORED

### 13.2 Lacunes Super Admin

| # | Lacune | Gravité |
|---|---|---|
| SA1 | **Super Admin peut modifier directement un document opérationnel** sans `?supervision=true` — `PUT /documents/:id` utilise `requireRole` et non `requireOperationalAccess` | 🟠 MAJEUR |
| SA2 | **Pas d'interface admin pour gérer les templates** — les templates sont hardcodés dans le code, non gérables via UI | 🟠 MAJEUR |
| SA3 | **Pas de rapport consolidé cross-syndic** — le super admin ne peut pas voir un rapport global de tous les documents | 🟡 MINEUR |
| SA4 | **Mode supervision non journalisé** — `?supervision=true` n'est pas tracé dans l'audit log | 🟠 MAJEUR |

---

## PHASE 14 — SYNDIC ADMIN {#phase-14}

### 14.1 Droits Syndic Admin — Analyse

**Capacités :**
- Créer, modifier, approuver, rejeter, signer, publier, archiver tous les documents de son syndic
- Voir la corbeille (soft-deleted) de son syndic
- Historique des versions
- Créer et décider les workflows

**Restrictions correctement implémentées ✅ :**
- Ne peut PAS restaurer depuis corbeille (super_admin uniquement)
- Ne peut PAS purger (super_admin uniquement)
- Isolation syndic enforced sur toutes les routes write

### 14.2 Lacunes Syndic Admin

| # | Lacune | Gravité |
|---|---|---|
| ADM1 | **Peut signer un document `generated` sans approbation** (voir R2/SM1) | 🟠 MAJEUR |
| ADM2 | **Peut passer `draft → published` directement** (voir SM1) | 🔴 CRITIQUE |
| ADM3 | **Pas de délégation de signature** — ne peut pas désigner un signataire parmi les membres du conseil | 🟠 MAJEUR |
| ADM4 | **Pas de tableau de bord des actions en attente** — aucune liste "à approuver", "à signer" filtrée | 🟡 MINEUR |

---

## PHASE 15 — EXPÉRIENCE MEMBRE & LOCATAIRE {#phase-15}

### 15.1 Fichiers analysés
- `artifacts/mobile/app/documents.tsx` (complet)
- `artifacts/mobile/app/documents-dashboard.tsx` (complet)

### 15.2 Ce que voit un Membre

**Accessible :**
- Liste des documents publiés du syndic (DataContext)
- Filtrage par catégorie et recherche par titre
- Téléchargement PDF avec progression en temps réel (vitesse Kbps, temps restant)
- Aperçu PDF dans le viewer intégré
- Partage PDF natif (expo-sharing)
- Ajout de commentaires sur les documents publiés
- Dashboard des statuts (mais avec données toutes rôles confondus)

**Manquant :**

| # | Fonctionnalité absente | Impact | Priorité |
|---|---|---|---|
| MBR1 | **Membres ne voient PAS les signatures** d'un document — ne peuvent pas vérifier qui a signé | 🟠 MAJEUR |
| MBR2 | **Pas de notification push** au membre lors publication | 🟠 MAJEUR |
| MBR3 | **Dashboard affiche tous les statuts** (brouillon, généré...) à un membre — devrait filtrer à publiés uniquement | 🟠 MAJEUR |
| MBR4 | **Locataires exclus** — 0 accès documentaire (bail, EDL) | 🔴 CRITIQUE |
| MBR5 | **Pas de section "Mes documents"** — attestations personnelles du membre | 🟡 MINEUR |

### 15.3 Correctif MBR3 — Filtrage dashboard pour membres

```typescript
// artifacts/mobile/app/documents-dashboard.tsx:76-114
// Ajouter filtre rôle dans le calcul des metrics
const metrics = useMemo(() => {
  const visibleDocs = isAdmin
    ? documents
    : documents.filter(d => d.status === "published"); // MEMBRES : publiés seulement

  const byStatus = (st: string | string[]) =>
    visibleDocs.filter(d => Array.isArray(st) ? st.includes(d.status) : d.status === st).length;
  // ...
}, [documents, summary, isAdmin]);
```

---

## PHASE 16 — UX ENTREPRISE {#phase-16}

### 16.1 Documents Screen (`documents.tsx`) — Audit UX

**✅ Points forts :**
- Filtres par catégorie avec FilterChips
- Recherche textuelle en temps réel
- Téléchargement avec progression (vitesse, temps restant, état error/cancel)
- Signature manuscrite avec SignaturePad (SVG)
- Haptic feedback
- Gestion des modales (générer, éditer, signer)
- 20 templates exposés avec icônes et couleurs

**❌ Points faibles :**

| # | Problème | Localisation | Gravité |
|---|---|---|---|
| UX1 | **Pas de pagination** — `FlatList` charge tous les documents en mémoire | `documents.tsx:160-164` — filtre client-side uniquement | 🔴 CRITIQUE (à 10k docs) |
| UX2 | **Pas de tri** (par date, statut, catégorie) | Absence de contrôle tri | 🟠 MAJEUR |
| UX3 | **Pas de filtres multiples simultanés** (ex: catégorie + statut) | Un seul filtre actif à la fois | 🟡 MINEUR |
| UX4 | **Pas d'état vide illustré** pour la recherche sans résultat | Affichage texte brut seulement | 🟡 MINEUR |
| UX5 | **Actions groupées absentes** — impossible de signer/archiver plusieurs docs en même temps | Pas de multi-sélection | 🟡 MINEUR |
| UX6 | **Tous les documents chargés via DataContext** — pas de requête backend filtrée | Performance critique | 🔴 CRITIQUE |
| UX7 | **Absence de RTL** sur tout l'écran Documents | Tous les layouts LTR fixes | 🟠 MAJEUR |
| UX8 | **Generate modal** : champs optionnels peu guidés (genMember, genNote) | `documents.tsx:186-207` | 🟡 MINEUR |

### 16.2 Documents Dashboard (`documents-dashboard.tsx`) — Audit UX

**✅ Points forts :**
- 8 widgets de statut avec compteurs réels
- Données d'expiration depuis l'API `/summary`
- Fallback gracieux si API indisponible
- Responsive (isWide)

**❌ Points faibles :**

| # | Problème | Gravité |
|---|---|---|
| DB1 | **Labels tous en français hardcodés** — aucun support i18n | 🟠 MAJEUR |
| DB2 | **Pas de graphique d'évolution temporelle** | 🟡 MINEUR |
| DB3 | **Widget "À signer" comporte une logique incorrecte** — `count = metrics.pending_sign = byStatus(["generated","validated"])` — inclut des docs non signables | 🟡 MINEUR |

---

## PHASE 17 — AUDIT BASE DE DONNÉES {#phase-17}

### 17.1 Tables documentaires — Inventaire

| Table | Colonnes | Index | FK | Cascade |
|---|:---:|:---:|:---:|:---:|
| `documents` | 32 | 8 | 4 (syndicateId, createdBy, signedBy, deletedBy, rejectedBy, approvedBy) | syndicateId → CASCADE |
| `document_versions` | 10 | 2 | 2 (documentId, modifiedBy) | documentId → CASCADE |
| `document_signatures` | 13 | 3 | 2 (documentId, signedBy) | documentId → CASCADE, signedBy → RESTRICT |
| `document_sequences` | 6 | 1 (UNIQUE) | 0 | — |
| `document_comments` | 9 | 2 | 2 (documentId, authorId) | documentId → CASCADE |

### 17.2 Index existants sur `documents`

```sql
-- Présents (8 index) :
documents_syndicate_id_idx          ON (syndicate_id)
documents_category_idx              ON (category)
documents_status_idx                ON (status)
documents_document_number_idx       ON (document_number)
documents_retention_until_idx       ON (retention_until)
documents_is_deleted_idx            ON (is_deleted)
documents_expires_at_idx            ON (expires_at)
documents_verification_token_uq     ON (verification_token) UNIQUE
```

### 17.3 Index manquants

| Index manquant | Requête impactée | Gravité |
|---|---|---|
| `(syndicate_id, status)` composite | Liste filtrée par statut dans un syndic | 🟠 MAJEUR |
| `(syndicate_id, is_deleted, status)` | Dashboard summary — requête la plus fréquente | 🔴 CRITIQUE |
| `(created_by)` | Historique des docs d'un auteur | 🟡 MINEUR |
| `(language)` | Statistiques par langue | 🟡 MINEUR |
| `(template_id)` | Rapports par template | 🟡 MINEUR |
| `document_versions(document_id, version_number)` | ✅ Déjà présent (UNIQUE) | OK |
| `document_signatures(signed_by)` | ✅ Déjà présent | OK |

### 17.4 Problèmes de schéma

| # | Problème | Table:Colonne | Gravité |
|---|---|---|---|
| DB1 | **`category` et `status` de type `text` sans contrainte CHECK** — valeurs invalides acceptées silencieusement | `documents.category`, `documents.status` | 🟠 MAJEUR |
| DB2 | **`documentSequencesTable` n'a pas de FK vers `syndicates`** — orphelins possibles si syndic supprimé | `document_sequences.syndicate_id` | 🟡 MINEUR |
| DB3 | **`size` stocké en `text` ("123Ko")** plutôt qu'entier — impossible de trier ou filtrer par taille | `documents.size` | 🟡 MINEUR |
| DB4 | **`version` nullable** (`integer.default(1)`) sans `notNull()` — `COALESCE` requis dans chaque requête | `documents.version` | 🟡 MINEUR |
| DB5 | **`supersededByDocumentId` sans FK** vers `documents.id` — risque d'orphelins | `documents.superseded_by_document_id` | 🟡 MINEUR |
| DB6 | **`documentSignaturesTable.syndicateId` sans FK ni index** | `document_signatures.syndicate_id` | 🟡 MINEUR |

### 17.5 Correctifs DB critiques

```typescript
// lib/db/src/schema.ts — Correctifs prioritaires

// DB1 : Contraintes CHECK via pgEnum ou index
// Utiliser pgEnum pour category et status :
import { pgEnum } from "drizzle-orm/pg-core";
export const documentCategoryEnum = pgEnum("document_category",
  ["reglements", "statuts", "pv", "juridique", "finances", "attestation"]);
export const documentStatusEnum = pgEnum("document_status",
  ["draft","generated","pending_review","validated","signed","published","archived","rejected","expired"]);

// DB3 : size en integer (bytes)
size: integer("size_bytes"),  // Remplacer text("size")

// DB5 : FK sur supersededByDocumentId
supersededByDocumentId: text("superseded_by_document_id")
  .references(() => documentsTable.id, { onDelete: "set null" }),

// Index composites manquants :
(t) => [
  // ... existants +
  index("documents_syndicate_status_idx").on(t.syndicateId, t.status),
  index("documents_syndicate_deleted_status_idx").on(t.syndicateId, t.isDeleted, t.status),
  index("documents_created_by_idx").on(t.createdBy),
],
```

---

## PHASE 18 — AUDIT PERFORMANCE {#phase-18}

### 18.1 Goulots d'étranglement identifiés

#### 1. Chargement global dans DataContext (CRITIQUE)

```typescript
// artifacts/mobile/context/DataContext.tsx
// Tous les documents chargés en mémoire → GET /api/documents (sans limite)
// À 10 000 documents/syndic : ~50 Mo de JSON en mémoire mobile
```

**Impact :** crash mobile garanti à partir de ~500 documents en mémoire.

**Correctif :**
```typescript
// artifacts/api-server/src/routes/documents.ts — GET /documents
// AJOUTER pagination obligatoire
const { limit, offset } = getPagination(req, { defaultLimit: 20, maxLimit: 100 });
// ... appliquer .limit(limit).offset(offset) sur la query
```

#### 2. Génération PDF synchrone bloquante (MAJEUR)

```typescript
// artifacts/api-server/src/lib/documentPdf.ts
// generateAndUploadDocument() est synchrone dans le handler POST
// À 100 req/s = 100 threads bloqués en génération PDF
```

**Correctif :** Déléguer la génération à une job queue (Bull/BullMQ + Redis) :
```typescript
// POST /documents → retourne immédiatement { jobId, status: "processing" }
// Worker async → génère PDF → met à jour la DB → notifie via push
```

#### 3. Absence de cache sur les requêtes fréquentes (MAJEUR)

```typescript
// GET /documents/summary → recalculé à chaque requête
// GET /documents → requête DB complète à chaque refresh DataContext
// Recommandation : Redis cache TTL 60s sur /summary, 30s sur /documents
```

#### 4. Requête GET /documents sans pagination (CRITIQUE)

```typescript
// documents.ts:253-289
// orderBy(desc(documentsTable.createdAt)) sans LIMIT
// EXPLAIN ANALYZE sur 10k rows → Seq Scan sans index sur ORDER BY createdAt
// AJOUT REQUIS : index sur created_at
index("documents_created_at_idx").on(t.createdAt),
```

### 18.2 Cibles de performance

| Opération | Cible | Actuel (estimé) | Gap |
|---|---|---|---|
| GET /documents (paginé) | < 50ms | ~200ms (sans pagination) | 🔴 |
| POST /documents (génération PDF) | < 3s | 2-5s (sync) | 🟠 |
| GET /documents/summary | < 100ms | ~300ms (pas de cache) | 🟠 |
| GET /documents/verify/:token | < 30ms | ~50ms | 🟡 |
| Charge 1000 users simultanés | > 500 req/s | ~50 req/s (génération sync) | 🔴 |

---

## PHASE 19 — CONFORMITÉ MAROCAINE (LOI 18-00) {#phase-19}

### 19.1 Analyse de la Loi 18-00 sur la copropriété

| Article | Exigence | Statut | Gap |
|---|---|---|---|
| **Art. 9** | Règlement de copropriété obligatoire, annexé au titre de propriété | ✅ Template `reglement` présent | — |
| **Art. 11** | Assemblée Générale : quorum 2/3 des quotes-parts | ⚠️ Non calculé dans les PV | Manque champ quorum |
| **Art. 12** | PV d'AG signé par le Président et Secrétaire | ⚠️ Signatures libres non contraintes | Manque validation 2 signataires spécifiques |
| **Art. 15** | Convocations AG : délai légal 15 jours avant | ❌ Non contrôlé | Pas de règle de délai dans `convocation` |
| **Art. 17** | Budget prévisionnel annuel soumis à l'AG | ❌ Template absent | Manque template `budget_previsionnel` |
| **Art. 18** | Charges : relevé individuel par copropriétaire | ❌ Template absent | Manque template `releve_charges` |
| **Art. 27** | Conservation des PV : 5 ans minimum | ✅ Rétention PV = 5 ans | — |
| **Art. 30** | Contrats de syndic : 3 ans maximum, renouvelable | ⚠️ Template contrat présent mais pas de contrôle durée | Manque validation date expiry ≤ 3 ans |

### 19.2 Loi 09-08 (Protection des données personnelles — CNDP)

| Exigence | Statut | Gap |
|---|---|---|
| Consentement pour traitement données membres | ❌ Absent | Pas de case à cocher CGU documentaires |
| Chiffrement données personnelles au repos | ❌ Absent | Pas d'AES-256 sur les PDFs contenant données personnelles |
| Droit à l'effacement | ⚠️ Soft-delete + rétention | Conflit avec rétention légale → politique à documenter |
| Journal des accès aux données personnelles | ⚠️ Audit log existe mais pas filtrable par personne | — |

### 19.3 Exigences archivage légal marocain

| Exigence | Statut |
|---|---|
| Documents financiers : 10 ans | ✅ |
| Actes juridiques : 10 ans | ✅ |
| PV/Convocations : 5 ans | ✅ |
| Statuts/Règlements : indéfiniment | ⚠️ 10 ans seulement — manque politique "indéfini" |
| Signature olographique ou électronique qualifiée | ⚠️ Signature manuscrite numérisée non qualifiée (pas d'eID marocain ANRT) |

### 19.4 Signature électronique — Conformité

La signature électronique implémentée (SVG manuscrit + timestamp serveur) est une **signature électronique simple** (non qualifiée). Pour être opposable en justice marocaine, il faut une **signature électronique qualifiée** selon la Loi 53-05 (équivalent eIDAS au Maroc) :

- Intégration avec **ANRT** (Agence Nationale de Réglementation des Télécommunications) requise pour les documents opposables
- À défaut : ajouter un **horodatage TSA RFC 3161** pour les documents critiques (contrats, mises en demeure)

---

## PHASE 20 — RAPPORT FINAL & SCORE DE PRODUCTION {#phase-20}

### 20.1 Synthèse des workflows documentaires

```
FLUX ACTUEL (implémenté) :
draft → generated → pending_review → validated → signed → published → archived
                                                          ↘ expired → archived
                 ↗ (court-circuit SM1 : draft → published DIRECT)

FLUX CIBLE (sécurisé) :
draft → generated → pending_review → validated → signed (N signataires requis) → published → archived
rejected ← (depuis generated, pending_review, validated) → draft/pending_review
expired ← (depuis signed, published) → archived
```

### 20.2 Matrice utilisateur consolidée

| Acteur | Créer | Voir | Télécharger | Signer | Approuver | Archiver | Corbeille | Purger |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **super_admin** | ✅ | ✅ All | ✅ | ✅ | ✅ | ✅ | ✅ Full | ✅ |
| **syndicate_admin** | ✅ | ✅ Syndic | ✅ | ✅ | ✅ | ✅ | ✅ View | ❌ |
| **member** | ❌ | ✅ Published | ✅ Published | ❌ | ❌ | ❌ | ❌ | ❌ |
| **tenant** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **employee** (manquant) | — | — | — | — | — | — | — | — |
| **prestataire** (manquant) | — | — | — | — | — | — | — | — |

### 20.3 Analyse templates

- **21 templates implémentés** sur 32 nécessaires (65% de couverture)
- **11 templates manquants** critiques (bail, état des lieux, budget, devis, facture...)
- **6 templates avec i18n complet** (reglement, attestation, pv, convocation, certificat, mise_en_demeure)
- **15 templates avec i18n partiel** (chrome seulement, corps en français)
- **1 bug critique** : enum Zod exclut 11 des 21 templates (T6)

### 20.4 Analyse base de données

- **5 tables** documentaires bien structurées
- **8 index** sur `documents` — 2 index composites critiques manquants
- **Type `text` sans CHECK** pour `category` et `status` — risque de corruption de données
- **`size` en text** non comparable — à migrer en `integer`
- **Rétention légale correcte** sur 6 catégories

### 20.5 Analyse API

- **21 routes** documentaires complètes et fonctionnelles
- **3 failles RBAC** (R2, R3, R6)
- **1 faille state machine critique** (SM1 : draft → published)
- **1 bug critique** : enum templateId incomplet (T6)
- **1 vulnérabilité** : purge sans vérification rétention légale (SEC5/S1)
- Pagination absente sur `GET /documents`

### 20.6 Analyse mobile

- **5 écrans** documentaires : documents, dashboard, recycle-bin, pdf-viewer, workflow
- **0 écran i18n complet** (sauf workflow)
- **0 support RTL** dans les écrans documents
- **DataContext charge tout en mémoire** — critique à 10k docs
- **Workflow.tsx** est le plus mature (i18n 4 langues, API réelle)

### 20.7 Analyse sécurité

- JWT robuste (15min, secret ≥32 chars, validation au démarrage)
- Isolation syndic correcte sur 90% des routes
- **3 vulnérabilités** de sécurité à corriger (SEC3, SEC5, SEC6)
- Pas de chiffrement AES-256 au repos
- Pas de rate-limiting sur les endpoints publics

### 20.8 Analyse conformité

- Loi 18-00 : **6/8 articles couverts** (manquent quorum AG, budget prévisionnel)
- Loi 09-08 (CNDP) : **non conforme** (pas de consentement, pas de chiffrement)
- Rétention légale : **correcte** sauf statuts (indéfini vs 10 ans)
- Signature électronique : **simple seulement** (non qualifiée ANRT)

---

### 20.9 Fonctionnalités manquantes — Liste priorisée

| # | Fonctionnalité | Priorité | Effort |
|---|---|:---:|:---:|
| F1 | Rôles `employee`, `prestataire`, `manager` dans le JWT | 🔴 CRITIQUE | L |
| F2 | Locataires : accès aux documents les concernant (bail, EDL) | 🔴 CRITIQUE | M |
| F3 | Membres : possibilité de signer les documents les concernant | 🔴 CRITIQUE | M |
| F4 | Templates manquants : bail, EDL, budget_previsionnel, releve_charges, devis, facture, bon_livraison | 🔴 CRITIQUE | L |
| F5 | Pagination API `GET /documents` | 🔴 CRITIQUE | S |
| F6 | Page HTML de vérification QR (lisible par smartphone) | 🔴 CRITIQUE | M |
| F7 | Nombre minimum de signatures configurables par document | 🟠 MAJEUR | M |
| F8 | Horodatage RFC 3161 pour documents juridiques | 🟠 MAJEUR | M |
| F9 | i18n complet (AR/EN/ES) des 15 templates partiels | 🟠 MAJEUR | L |
| F10 | RTL support sur tous les écrans documents mobiles | 🟠 MAJEUR | M |
| F11 | Job queue asynchrone pour génération PDF | 🟠 MAJEUR | L |
| F12 | Rate-limiting endpoint `/verify/:token` | 🟠 MAJEUR | S |
| F13 | Notification email membres lors de publication | 🟠 MAJEUR | S |
| F14 | Interface admin pour gestion des templates | 🟡 MINEUR | L |
| F15 | Diff visuel entre versions | 🟡 MINEUR | M |

---

### 20.10 Bugs critiques — Liste par gravité

| # | Bug | Fichier:Ligne | Gravité | Fix |
|---|---|---|:---:|---|
| BUG1 | `draft → published` autorisé directement | `documents.ts:63` | 🔴 CRITIQUE | Retirer "published" de ALLOWED_TRANSITIONS[draft] |
| BUG2 | Enum Zod `templateId` exclut 11 templates | `documents.ts:537-540` | 🔴 CRITIQUE | Étendre l'enum à tous les 21 templates |
| BUG3 | Purge sans vérification `retentionUntil` | `documents.ts:1020-1052` | 🔴 CRITIQUE | Ajouter check avant delete |
| BUG4 | `appendSignaturesToPdf` silencieusement ignoré | `documents.ts:1127` | 🔴 CRITIQUE | Rollback ou retry async |
| BUG5 | `syndicate_admin` signe `generated` sans validation | `documents.ts:1076` | 🟠 MAJEUR | Limiter signable à `["validated"]` |
| BUG6 | Dashboard membre voit tous statuts | `documents-dashboard.tsx:76` | 🟠 MAJEUR | Filtrer à `published` pour membres |
| BUG7 | Restauration de version remet l'ancien statut | `documents.ts:909` | 🟠 MAJEUR | Ne pas restaurer `status` |
| BUG8 | `signatureData` SVG non sanitisé | `documents.ts:1064` | 🟠 MAJEUR | Sanitiser avant stockage |
| BUG9 | `size` en texte "123Ko" incomparable | `documents.ts:750` | 🟡 MINEUR | Stocker en integer bytes |
| BUG10 | `completionPct` dans dashboard : double-comptage | `documents-dashboard.tsx:193` | 🟡 MINEUR | Revoir formule |

---

### 20.11 Risques de production

| Risque | Probabilité | Impact | Mitigation |
|---|:---:|:---:|---|
| **Crash mobile** à >500 docs (DataContext charge tout) | Haute | Critique | Pagination obligatoire + virtualisation |
| **GCS sidecar indisponible** → uploads silencieux échoués | Moyenne | Critique | Retry queue + monitoring upload |
| **Purge légalement prématurée** par super_admin | Faible | Critique | Guard `retentionUntil` (BUG3) |
| **Fraude documentaire** : draft→published sans validation | Faible | Majeur | Fix SM1 (BUG1) |
| **Désynchronisation PDF/DB** lors d'une signature | Moyenne | Majeur | Fix signature async (BUG4) |
| **Emails SMTP silencieusement en échec** | Haute | Majeur | Health check SMTP au démarrage |

### 20.12 Risques de scalabilité

| Risque | Seuil critique | Solution |
|---|---|---|
| Génération PDF synchrone | > 10 req/s | Job queue asynchrone |
| GET /documents sans pagination | > 500 docs | Pagination + index composites |
| DataContext en mémoire mobile | > 200 docs | Lazy loading + virtualisation FlatList |
| Connexions DB sans pool | > 100 concurrent | Connection pool Drizzle (déjà probable) |

---

### 20.13 Liste exacte des fichiers à modifier

```
PRIORITÉ 🔴 CRITIQUE :
artifacts/api-server/src/routes/documents.ts        — BUG1, BUG2, BUG3, BUG4, BUG5, R2, R3, SEC5, SEC6, UX1
lib/db/src/schema.ts                                — DB1, DB3, DB5, F5 (index composites)
artifacts/mobile/app/documents-dashboard.tsx        — BUG6, MBR3
artifacts/mobile/app/documents.tsx                  — UX1 (pagination), RTL1

PRIORITÉ 🟠 MAJEUR :
artifacts/api-server/src/routes/documents.ts        — BUG7, BUG8, N1, N2
artifacts/api-server/src/lib/documentPdf.ts         — T1 (données financières), T2 (quorum)
artifacts/mobile/app/documents.tsx                  — RTL, i18n (CATS, labels)
artifacts/mobile/app/documents-dashboard.tsx        — i18n (labels hardcodés)
artifacts/mobile/app/documents-recycle-bin.tsx      — i18n
artifacts/mobile/app/pdf-viewer.tsx                 — RTL, i18n

NOUVEAUX FICHIERS À CRÉER :
artifacts/api-server/src/lib/svgSanitizer.ts        — SEC3
artifacts/api-server/src/lib/signatureQueue.ts      — BUG4 (retry async)
artifacts/mobile/app/verify-document.tsx            — QR6 (page HTML vérification)
lib/db/src/schema.ts (migration)                    — F1 (rôles employee/prestataire)
```

---

### 20.14 Score de préparation à la production

| Dimension | Score | Pondération | Score pondéré |
|---|:---:|:---:|:---:|
| Fonctionnalité core (CRUD, workflow) | 72/100 | 25% | 18/25 |
| Sécurité & RBAC | 68/100 | 20% | 13.6/20 |
| Conformité Loi 18-00 | 62/100 | 15% | 9.3/15 |
| Performance & Scalabilité | 45/100 | 15% | 6.75/15 |
| UX & i18n mobile | 38/100 | 15% | 5.7/15 |
| Templates & PDF | 71/100 | 10% | 7.1/10 |

## 🎯 SCORE GLOBAL : **60.45 / 100**

### Verdict : **NON PRÊT POUR PRODUCTION** à grande échelle

**Bloquants production (5 bugs critiques) :**
1. `draft → published` sans validation (fraude documentaire)
2. Enum templateId incomplet (11 templates inaccessibles)
3. Purge sans vérification rétention (violation légale)
4. Pagination absente (crash mobile garanti)
5. DataContext charge tout en mémoire

**Délai estimé pour atteindre production-ready (80/100) :**
- Corrections bugs critiques : **3-5 jours**
- Fonctionnalités manquantes P1 (F1-F8) : **15-20 jours**
- i18n + RTL mobile : **5-7 jours**
- Performance (pagination, job queue) : **7-10 jours**

**Total estimé : 30-42 jours de développement senior.**

---

## ANNEXE — PLAN D'ACTION SPRINT

### Sprint 1 (Semaine 1) — Bugs critiques
- [ ] BUG1 : Corriger state machine (draft → published)
- [ ] BUG2 : Étendre enum templateId Zod
- [ ] BUG3 : Guard retentionUntil sur purge
- [ ] BUG5 : Limiter signature à `validated`
- [ ] F5 : Pagination GET /documents

### Sprint 2 (Semaine 2) — Sécurité & Stabilité
- [ ] BUG4 : Retry async signature PDF
- [ ] BUG7 : Restauration version sans réinitialisation statut
- [ ] BUG8 : Sanitisation SVG
- [ ] SEC5 : Guard purge avant retentionUntil
- [ ] QR4 : Rate-limiting endpoint verify

### Sprint 3 (Semaine 3) — Templates & Conformité
- [ ] BUG6 : Dashboard filtré pour membres
- [ ] T6 : Tous templates accessibles via API
- [ ] F4 : Templates bail, budget, état des lieux
- [ ] F19-2 : Quorum AG dans template PV
- [ ] F7 : Nombre minimum de signatures

### Sprint 4 (Semaine 4-6) — i18n, RTL, Performance
- [ ] RTL1-4 : Support RTL complet documents mobiles
- [ ] i18n : 5 templates → traduits corps complet AR/EN/ES
- [ ] F11 : Job queue génération PDF
- [ ] F6 : Page HTML vérification QR
- [ ] F2-F3 : Accès locataire et signature membre

---

*Rapport généré le 15 juillet 2026 — SYNDYCAT GLOBAL CPS Document Module Audit v1.0.0*
*Basé sur l'analyse directe de l'implémentation réelle — aucune hypothèse émise.*
