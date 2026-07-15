# AUDIT COMPLET — MODULE GESTION DES DOCUMENTS
## SYNDYCAT GLOBAL CPS — Rapport d'analyse technique, fonctionnelle et UX

**Date :** 15 juillet 2026  
**Version analysée :** Codebase actuelle (main branch)  
**Auditeur :** Agent Senior PO / Architecte Logiciel / QA Lead  
**Périmètre :** Mobile (Expo), API Server (Express), Base de données (PostgreSQL/Drizzle)

---

## RÉSUMÉ EXÉCUTIF

| Dimension          | Statut         | Score |
|--------------------|----------------|-------|
| Fonctionnel        | ⚠️ Partiel     | 42/100 |
| Technique          | ⚠️ Partiel     | 48/100 |
| Sécurité / RBAC    | ✅ Correct      | 72/100 |
| UX Mobile          | ✅ Correct      | 68/100 |
| Base de données    | ❌ Insuffisant | 35/100 |
| PDF & Stockage     | ❌ Insuffisant | 30/100 |
| Signatures         | ❌ Absent      | 5/100  |
| Notifications      | ❌ Insuffisant | 25/100 |

### **SCORE GLOBAL : 41 / 100**

### **DÉCISION FINALE : 🔴 NOT READY — Ne pas déployer en production**

---

## PARTIE 1 — AUDIT FONCTIONNEL : CYCLE DE VIE COMPLET

### 1.1 Matrice des fonctionnalités

| Étape            | Implémenté ? | Backend ? | Mobile ? | Stockage fichier ? | Notes |
|------------------|:---:|:---:|:---:|:---:|-------|
| Création manuelle | ✅ | `POST /documents` | ✅ Bouton admin | ❌ Texte DB seulement | Pas de binaire PDF |
| Import de fichier | ❌ | ❌ | ❌ | ❌ | Totalement absent |
| Génération auto   | ⚠️ | ✅ (stocke du texte) | ✅ (6 templates) | ❌ | Texte brut, pas PDF |
| Validation/Approbation | ❌ | ❌ | ❌ | — | Workflow manquant |
| Signature         | ❌ | ❌ | ❌ | — | Entièrement absent |
| Publication       | ✅ | Champ `status` | Via édition admin | — | Statique, pas de workflow |
| Consultation      | ✅ | `GET /documents/:id` | Modal aperçu | — | Texte brut uniquement |
| Téléchargement    | ⚠️ | `GET /documents/:id` | Bouton "Télécharger" | ❌ | Partage texte, pas PDF |
| Archivage         | ❌ | ❌ | ❌ | — | Statut "archived" absent |
| Suppression       | ❌ | ❌ | ❌ | — | Pas de route DELETE |

### 1.2 Scénarios manquants (critiques)
- **Import de fichier** : aucun endpoint ni UI pour uploader un PDF/Word/image existant
- **Workflow de validation** : pas de système d'approbation avant publication
- **Signature électronique** : absente à tous les niveaux (DB, API, mobile)
- **Archivage** : le statut "archived" n'existe pas dans l'enum de validation Zod
- **Suppression** : pas de route `DELETE /documents/:id`
- **Versioning** : pas d'historique des modifications
- **Génération PDF réelle** : le bouton génère du texte stocké en DB, pas un vrai PDF binaire
- **Connexion /pdf/* ↔ /documents** : les routes PDF (invoice, PV, budget, badge) existent mais sont totalement déconnectées du module Documents

---

## PARTIE 2 — DIAGNOSTIC PRÉCIS : BOUTON "GÉNÉRER UN DOCUMENT"

### Analyse étape par étape

| # | Question | Résultat | Détail |
|---|----------|:--------:|--------|
| 1 | Le bouton est-il visible ? | ✅ OUI | Visible si `isAdmin = user?.role !== "member"` |
| 2 | Le bouton déclenche-t-il un `onPress` ? | ✅ OUI | Ouvre modal `showGenerate` + Haptics |
| 3 | Le `onPress` appelle-t-il une API ? | ✅ OUI | `docsApi.generate(name, "statuts", content)` → `POST /documents` |
| 4 | L'API existe-t-elle réellement ? | ✅ OUI | Route enregistrée dans `routes/index.ts` ligne 58 |
| 5 | L'API retourne-t-elle un document ? | ✅ OUI | `{ data: doc, message: "Document généré avec succès" }` |
| 6 | Le document est-il enregistré ? | ✅ OUI | Inséré dans `documentsTable` en DB |
| 7 | Le document apparaît-il dans la liste ? | ❌ **NON** | **BUG CRITIQUE** — Liste non rafraîchie |
| 8 | Une notification est-elle affichée ? | ⚠️ Partiel | `Alert.alert` client-side seulement, pas de push/email |
| 9 | Les erreurs sont-elles gérées ? | ✅ OUI | try/catch avec `Alert.alert` et messages explicites |
| 10 | Les permissions sont-elles correctes ? | ⚠️ Partiel | **BUG RBAC** — tenant voit le bouton mais API rejette en 403 |

---

### BUG #1 — CRITIQUE P0 : Liste non rafraîchie après génération

**Fichier :** `artifacts/mobile/app/documents.tsx` — `handleGenerate()` (lignes 103–126)  
**Cause racine :** Après `await docsApi.generate(...)`, le code ferme le modal et affiche une alerte, mais ne rafraîchit jamais la liste `documents` provenant de `DataContext`. Ce contexte est chargé une seule fois au démarrage de l'app via `Promise.allSettled` dans `DataContext.tsx` (ligne 507). Il n'existe aucun appel à `setDocuments` ni à `api.documents.list()` dans `handleGenerate`.

**Impact utilisateur :** L'utilisateur clique sur "Générer", voit "Succès", ferme le modal — et le nouveau document n'apparaît PAS dans la liste. Il doit redémarrer l'application pour le voir.  
**Criticité :** 🔴 P0 — Bug bloquant, confiance utilisateur détruite  
**Correctif :** Après la ligne `setShowGenerate(false)`, appeler `api.documents.list()` et mettre à jour le contexte via une fonction `addDocument` ou `refreshDocuments` dans DataContext.

---

### BUG #2 — CRITIQUE P0 : Catégorie codée en dur "statuts"

**Fichier :** `artifacts/mobile/app/documents.tsx` — ligne 108  
```js
await docsApi.generate(selectedTemplate.name, "statuts", content || undefined);
//                                              ^^^^^^^^ HARDCODED
```
**Cause racine :** Le deuxième argument de `docsApi.generate` est toujours `"statuts"`, quelle que soit la template sélectionnée (Mise en demeure → `"juridique"`, PV de réunion → `"pv"`, Rapport → `"finances"`, etc.).

**Impact utilisateur :** Tous les documents générés apparaissent sous la catégorie "Statuts", peu importe le modèle choisi. Les filtres par catégorie ne fonctionnent pas pour les documents générés.  
**Criticité :** 🔴 P0 — Corruption silencieuse des données  
**Correctif :** Mapper chaque template sur sa catégorie correcte :
```js
const TEMPLATE_TO_CATEGORY: Record<string, string> = {
  "t1": "attestation", "t2": "juridique", "t3": "pv",
  "t4": "pv", "t5": "reglements", "t6": "finances",
};
await docsApi.generate(selectedTemplate.name, TEMPLATE_TO_CATEGORY[selectedTemplate.id] ?? "statuts", content);
```

---

### BUG #3 — MAJEUR P1 : RBAC — Tenant voit le bouton mais l'API rejette

**Fichier (mobile) :** `artifacts/mobile/app/documents.tsx` — ligne 89  
```js
const isAdmin = user?.role !== "member";
// tenant !== "member" → isAdmin = true → bouton visible !
```
**Fichier (API) :** `artifacts/api-server/src/routes/documents.ts` — ligne 51  
```js
requireRole("super_admin", "syndicate_admin")
// tenant → rejeté en 403
```
**Cause racine :** La garde `isAdmin` côté mobile exclut uniquement `"member"` mais pas `"tenant"`. Le rôle `tenant` voit donc le bouton "Générer", peut remplir le formulaire, mais reçoit une erreur 403.  
**Impact utilisateur :** Un locataire tente de générer un document → message d'erreur inexpliqué "Impossible de générer le document".  
**Criticité :** 🟠 P1 — Expérience utilisateur dégradée + confusion RBAC  
**Correctif :**
```js
const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";
```

---

### BUG #4 — MAJEUR P1 : "Télécharger" ne télécharge pas — partage du texte brut

**Fichier :** `artifacts/mobile/app/documents.tsx` — `handleDownload()` (lignes 128–147)  
**Cause racine :** `handleDownload` appelle `shareContent(body, doc.title)` avec le champ `content` textuel de la DB. Il n'y a aucun vrai fichier PDF binaire à télécharger. Le bouton "Télécharger (XXKo)" ouvre la feuille de partage du système (WhatsApp, Mail, etc.) avec du texte brut.  
**Impact utilisateur :** L'utilisateur s'attend à télécharger un PDF, reçoit à la place un texte brut dans son application de partage.  
**Criticité :** 🟠 P1 — Fonctionnalité trompeuse, confiance utilisateur brisée  
**Correctif :** Intégrer les routes `/pdf/*` existantes : générer un PDF binaire via `GET /api/pdf/documents/:id` (à créer) et utiliser `expo-file-system` + `expo-sharing` pour un vrai téléchargement.

---

### BUG #5 — MAJEUR P1 : Aucune génération PDF réelle dans le flux "Générer"

**Cause racine :** Le module `routes/pdf.ts` (1172 lignes) implémente une génération PDF pdfmake pour les factures, reçus, budgets, PV de réunion et badges, **mais ces routes sont totalement déconnectées** du module `routes/documents.ts`. Quand l'utilisateur clique "Générer un document" → "Attestation d'adhésion", le système crée un enregistrement texte en base, sans appeler la route `/pdf/membership/:userId` qui, elle, produit un vrai PDF avec QR code.  
**Impact utilisateur :** Les documents générés sont des entrées texte en base de données, pas des PDF exploitables.  
**Criticité :** 🟠 P1 — Fonctionnalité centrale non livrée  
**Correctif :** Connecter la génération à `/pdf/*` : après `POST /documents`, déclencher la route PDF appropriée selon le template, stocker le binaire en object storage, enregistrer l'URL dans `fileUrl` (colonne à créer).

---

### BUG #6 — MODÉRÉ P2 : Aperçu affiche du texte brut, pas un vrai PDF

**Fichier :** `artifacts/mobile/app/documents.tsx` — `handlePreview()` (lignes 149–163)  
**Cause racine :** `handlePreview` appelle `GET /documents/:id` et affiche le champ `content` (texte) dans un `<Text>` React Native. Aucun rendu PDF.  
**Impact utilisateur :** L'aperçu ressemble à un bloc de notes, pas à un document officiel.  
**Criticité :** 🟡 P2 — Expérience utilisateur dégradée  
**Correctif :** Utiliser `expo-web-browser` ou un composant WebView avec `react-native-pdf` pour afficher un vrai PDF depuis l'URL signée.

---

### BUG #7 — MODÉRÉ P2 : Pas de route DELETE

**Fichier :** `artifacts/api-server/src/routes/documents.ts`  
**Cause racine :** Seules 4 routes existent (`GET /documents`, `GET /documents/:id`, `POST /documents`, `PUT /documents/:id`). Aucune route `DELETE /documents/:id`.  
**Impact utilisateur :** Impossible de supprimer un document depuis l'app. L'admin ne peut que le modifier ou changer son statut.  
**Criticité :** 🟡 P2 — Fonctionnalité manquante  

---

## PARTIE 3 — TYPES DE DOCUMENTS : COUVERTURE ACTUELLE

| Type de document | Template UI | API génération | PDF dédié | DB stockage |
|-----------------|:-----------:|:--------------:|:---------:|:-----------:|
| Procès-verbal (PV) | ✅ t4 | ✅ Texte DB | ✅ `GET /pdf/ag/:id` | ⚠️ Déconnecté |
| Convocation réunion | ✅ t3 | ✅ Texte DB | ❌ | — |
| Rapport financier | ✅ t6 | ✅ Texte DB | ✅ `GET /pdf/budget/:id` | ⚠️ Déconnecté |
| Rapport d'activité | ✅ t6 | ✅ Texte DB | ❌ | — |
| Facture | ❌ | ❌ | ✅ `GET /pdf/invoice/:id` | ⚠️ Autre table |
| Reçu de paiement | ❌ | ❌ | ✅ `GET /pdf/receipt/:id` | ⚠️ Autre table |
| Attestation d'adhésion | ✅ t1 | ✅ Texte DB | ✅ `GET /pdf/membership/:userId` | ⚠️ Déconnecté |
| Mise en demeure | ✅ t2 | ✅ Texte DB | ❌ | — |
| Circulaire interne | ✅ t5 | ✅ Texte DB | ❌ | — |
| Badge / Carte ID | ❌ | ❌ | ✅ `GET /pdf/badge/:userId` | — |
| Règlement intérieur | ❌ (catégorie) | ❌ | ❌ | — |
| Décision du bureau | ❌ | ❌ | ❌ | — |
| Résolution d'assemblée | ❌ | ❌ | ❌ | — |
| Rapport d'intervention | ❌ | ❌ | ❌ | — |
| Rapport d'élection | ❌ | ❌ | ❌ | — |
| Certificat | ✅ t1 (partiel) | ✅ Texte DB | ✅ `GET /pdf/membership/:userId` | ⚠️ Déconnecté |
| Documents personnalisés | ❌ | ❌ | ❌ | — |
| Contrat | ❌ | ❌ | ❌ | — |

---

## PARTIE 4 — SCÉNARIO COMPLET DE GÉNÉRATION (ÉTAT ACTUEL vs CIBLE)

### État actuel (réel)

```
Admin
  ↓ onPress bouton "file-plus"
Ouvre modal showGenerate
  ↓ Sélectionne template (6 templates hardcodés UI)
  ↓ Renseigne destinataire + notes
  ↓ onPress "Générer le document"
handleGenerate() : docsApi.generate(name, "statuts", content)   ← BUG: catégorie "statuts" codée en dur
  ↓ POST /api/documents { title, category:"statuts", content, status:"published" }
  ↓ requireAuth + requireRole("super_admin", "syndicate_admin")
  ↓ INSERT INTO documents (id, title, category, content, status, syndicate_id, size, created_by, created_at)
  ↓ size = Math.round(content.length / 1024) + "Ko"  ← Taille calculée sur le texte, pas un vrai fichier
  ↓ { data: doc }
Alert.alert("Succès")
Modal fermé
Liste NON RAFRAÎCHIE   ← BUG CRITIQUE
```

### Cible attendue (scénario métier complet)

```
Admin
  ↓ Clique "Générer un document"
Choix du modèle (templates dynamiques depuis /api/templates)
  ↓ Saisie des variables dynamiques (destinataire, date, syndicate, etc.)
  ↓ Prévisualisation PDF côté mobile (WebView ou expo-web-browser)
  ↓ Validation par l'admin
API: POST /documents/generate { templateId, variables }
  ↓ Merge des données dynamiques (syndicate, member, lot, date)
  ↓ Génération PDF binaire (pdfmake) côté serveur
  ↓ Upload PDF vers Object Storage (GCS via sidecar)
  ↓ INSERT INTO documents avec fileUrl = URL signée GCS
  ↓ Numérotation automatique du document
  ↓ Workflow de signature si requis
  ↓ Notification push + email aux destinataires
  ↓ Document visible dans la liste (rafraîchissement)
  ↓ Téléchargement/partage via URL signée
  ↓ Archivage automatique selon politique
```

---

## PARTIE 5 — MODÈLES DE DOCUMENTS

| Fonctionnalité | État | Détail |
|---|:---:|---|
| Templates disponibles | ⚠️ | 6 templates hardcodés côté mobile uniquement, pas de CRUD server-side |
| Variables dynamiques | ❌ | Seuls `genMember` (texte libre) et `genNote` (texte libre) sont passés. Pas de merge depuis la DB (syndicate, lot, dates) |
| Logo | ❌ | Absent des documents générés. Présent dans les PDFs dédiés via marque "SYNDYCAT" texte |
| Signature électronique | ❌ | Absente |
| Signature manuscrite (zone) | ⚠️ | Bloc "_____" dans PDFs `pdf.ts`, absent dans documents générés |
| QR Code | ⚠️ | Présent dans `/pdf/membership` et `/pdf/badge`, absent du module Documents |
| Numéro de document | ❌ | Pas de numérotation automatique dans `documentsTable` |
| Numérotation automatique | ❌ | Aucune séquence ou compteur |
| Multi-langue (FR/AR/EN) | ❌ | Uniquement français |
| RTL arabe | ❌ | pdfmake utilise Helvetica qui ne supporte pas les caractères arabes. Commentaire dans `pdf.ts` : "Arabic PDF support requires additional font setup." |

---

## PARTIE 6 — STOCKAGE DES FICHIERS

| Critère | État | Détail |
|---|:---:|---|
| Où le PDF est stocké | ❌ | Nulle part — le module Documents stocke du **texte** dans la colonne `content` (PostgreSQL). Pas de binaire PDF |
| Object Storage disponible | ✅ | GCS via Replit sidecar (`http://127.0.0.1:1106`) — utilisé pour charges/factures, pas pour documents |
| URL de téléchargement | ❌ | Pas de colonne `fileUrl` dans `documentsTable` |
| Permissions d'accès (ACL) | ⚠️ | Le système ACL (`objectAcl.ts`) existe mais n'est pas connecté aux documents |
| Taille maximale | ✅ | `content` limité à 500 000 caractères par Zod (`z.string().max(500000)`) |
| Versioning | ❌ | Aucun — pas de colonne `version`, pas de table `document_versions` |
| Sauvegarde / Archivage | ❌ | Aucune politique d'archivage |

**Schéma actuel de `documentsTable` :**
```sql
id          TEXT PRIMARY KEY
title       TEXT NOT NULL
category    TEXT NOT NULL    -- enum côté Zod seulement
content     TEXT             -- texte brut, pas un PDF binaire
status      TEXT DEFAULT 'published'
syndicate_id TEXT FK → syndicates(id) ON DELETE CASCADE
size        TEXT             -- calculé comme length/1024, non fiable
created_by  TEXT FK → users(id) ON DELETE SET NULL
created_at  TIMESTAMP
```

**Colonnes manquantes (P0/P1) :**
- `file_url TEXT` — URL GCS du binaire PDF
- `template_id TEXT` — lien vers le template utilisé
- `updated_at TIMESTAMP` — dernière modification
- `published_at TIMESTAMP` — date de publication
- `archived_at TIMESTAMP` — archivage
- `version INTEGER DEFAULT 1` — versioning
- `signed_by TEXT FK users(id)` — signature
- `signed_at TIMESTAMP`
- `document_number TEXT UNIQUE` — numérotation officielle

---

## PARTIE 7 — SIGNATURES

| Fonctionnalité | État | Détail |
|---|:---:|---|
| Signature électronique | ❌ | Absente à tous les niveaux |
| Signature manuscrite (zone PDF) | ⚠️ | Blocs `_____` dans `/pdf/ag` et `/pdf/receipt`, pas dans les documents générés |
| Signature multiple | ❌ | Absent |
| Validation hiérarchique | ❌ | Pas de workflow de validation |
| Horodatage | ❌ | Absent du module Documents (présent ailleurs via `createdAt`) |
| Audit trail documents | ❌ | Aucun `serverAuditLog()` dans `routes/documents.ts` |

---

## PARTIE 8 — NOTIFICATIONS

| Canal | Après génération | Après modification | Après suppression |
|-------|:---:|:---:|:---:|
| Push notification | ❌ | ❌ | — |
| Email | ❌ | ❌ | — |
| SMS | ❌ | ❌ | — |
| Alert mobile (local) | ✅ | ✅ | — |
| Historique des notifications | ❌ | ❌ | — |

**Analyse :** Le module `notify.ts` permet l'envoi de notifications push Expo et d'emails transactionnels, mais les routes `documents.ts` n'appellent jamais ces fonctions. L'utilisateur qui génère un document ne notifie pas les membres concernés.

---

## PARTIE 9 — SÉCURITÉ

### 9.1 RBAC

| Opération | super_admin | syndicate_admin | member | tenant |
|-----------|:-----------:|:---------------:|:------:|:------:|
| Lister documents | ✅ (tous statuts) | ✅ (son syndicate) | ✅ (published) | ✅ (published) |
| Voir document | ✅ | ✅ (son syndicate) | ✅ | ✅ |
| Générer (POST) | ✅ | ✅ | ❌ | ❌ (403, mais UI laisse passer) |
| Modifier (PUT) | ✅ | ✅ (son syndicate) | ❌ | ❌ |
| Supprimer | ❌ Route absente | ❌ | ❌ | ❌ |

### 9.2 Multi-tenant isolation
- ✅ `GET /documents` : filtre sur `syndicateId` du JWT
- ✅ `GET /documents/:id` : vérifie `doc.syndicateId === user.syndicateId` (sauf super_admin)
- ✅ `PUT /documents/:id` : même vérification
- ✅ `POST /documents` : `syndicateId` pris du JWT, pas de l'input utilisateur

### 9.3 Téléchargement non autorisé
- ⚠️ Les documents sont des textes en DB, pas des fichiers. Pas d'URL publique exposée.
- ❌ Futur risque : quand des URLs GCS seront ajoutées, il faudra valider les URLs signées

### 9.4 Documents privés
- ⚠️ Le champ `status` permet "draft/pending/published" mais pas "private"
- ❌ Pas de visibilité par rôle granulaire au niveau de chaque document

### 9.5 Audit logs
- ❌ **Aucun** `serverAuditLog()` dans `routes/documents.ts`
- La table `auditLogsTable` existe, les routes finance, meetings, élections l'utilisent — mais Documents ne l'appelle pas

---

## PARTIE 10 — APPLICATION MOBILE

| Fonctionnalité | État | Notes |
|---|:---:|---|
| Liste documents | ✅ | FlatList avec catégories + recherche |
| Recherche | ✅ | Filtre côté client sur `title` |
| Filtres par catégorie | ✅ | FilterChips (7 catégories) |
| Prévisualisation PDF | ❌ | Affiche texte brut dans `<Text>`, pas un PDF |
| Téléchargement | ❌ | Appelle shareContent() avec texte, pas un vrai download |
| Partage | ✅ | shareContent() avec titre + texte |
| Génération document | ⚠️ | Fonctionne mais 3 bugs P0 (voir Partie 2) |
| Upload document | ❌ | Absent |
| Mode hors ligne | ❌ | Aucun cache local, aucune persistance offline |
| Stats (Publiés/Brouillons/En attente) | ✅ | Calculé depuis la liste en mémoire |
| Modifier document (admin) | ✅ | PUT /documents/:id |

---

## PARTIE 11 — BASE DE DONNÉES

### 11.1 Table documents (état actuel)

```sql
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,       -- pas d'enum DB, seulement Zod
  content     TEXT,                -- texte brut
  status      TEXT DEFAULT 'published',
  syndicate_id TEXT REFERENCES syndicates(id) ON DELETE CASCADE,
  size        TEXT,                -- approximatif, basé sur len(content)
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP
);
CREATE INDEX documents_syndicate_id_idx ON documents(syndicate_id);
CREATE INDEX documents_category_idx ON documents(category);
```

### 11.2 Relations manquantes
- ❌ Pas de FK vers une table `document_templates`
- ❌ Pas de FK vers `members` pour le destinataire
- ❌ Pas de table `document_signatures`
- ❌ Pas de table `document_versions`

### 11.3 Métadonnées manquantes
- `updated_at`, `published_at`, `archived_at`, `file_url`, `template_id`, `document_number`, `version`, `language`

### 11.4 Statuts (enum actuel)
Les statuts `published`, `draft`, `pending` sont définis côté Zod uniquement (pas de CHECK constraint DB). Le statut `archived` est absent.

---

## PARTIE 12 — TESTS QA

### 12.1 Tests fonctionnels (50 tests)

**Module : Liste des documents**
- [ ] T01 : L'admin voit tous les statuts (published, draft, pending)
- [ ] T02 : Le membre ne voit que les documents "published"
- [ ] T03 : Le locataire ne voit que les documents "published"
- [ ] T04 : La recherche par titre fonctionne (casse insensible)
- [ ] T05 : Le filtre "Statuts" retourne les bons documents
- [ ] T06 : Le filtre "PV" retourne uniquement les docs catégorie "pv"
- [ ] T07 : Le filtre "Finances" retourne les bons docs
- [ ] T08 : Le filtre "Juridique" retourne les bons docs
- [ ] T09 : Le filtre "Attestations" retourne les bons docs
- [ ] T10 : La liste affiche le bon nombre de Publiés/Brouillons/En attente

**Module : Génération**
- [ ] T11 : L'admin peut ouvrir le modal de génération
- [ ] T12 : Le membre NE peut PAS voir le bouton de génération
- [ ] T13 : Le locataire NE peut PAS voir le bouton de génération (**FAIL actuel — BUG #3**)
- [ ] T14 : Cliquer "Générer" sans template sélectionné ne fait rien
- [ ] T15 : Sélectionner template t1 (Attestation) génère catégorie "attestation" (**FAIL — BUG #2**)
- [ ] T16 : Sélectionner template t2 (Mise en demeure) génère catégorie "juridique" (**FAIL — BUG #2**)
- [ ] T17 : Sélectionner template t3 (Convocation) génère catégorie "pv" (**FAIL — BUG #2**)
- [ ] T18 : Sélectionner template t4 (PV) génère catégorie "pv" (**FAIL — BUG #2**)
- [ ] T19 : Sélectionner template t5 (Circulaire) génère catégorie "reglements" (**FAIL — BUG #2**)
- [ ] T20 : Sélectionner template t6 (Rapport) génère catégorie "finances" (**FAIL — BUG #2**)
- [ ] T21 : Après génération, le document apparaît dans la liste (**FAIL — BUG #1**)
- [ ] T22 : Le titre du document généré correspond au nom du template
- [ ] T23 : Le champ "Destinataire" est inclus dans le contenu généré
- [ ] T24 : Le champ "Notes" est inclus dans le contenu généré
- [ ] T25 : Message de succès s'affiche après génération

**Module : Détail / Aperçu**
- [ ] T26 : Cliquer sur un document ouvre le modal de détail
- [ ] T27 : Les métadonnées (date, taille, catégorie, statut) s'affichent correctement
- [ ] T28 : Le bouton "Aperçu" charge le contenu depuis l'API
- [ ] T29 : L'aperçu affiche un message si le contenu est vide
- [ ] T30 : Le bouton "Modifier" est visible pour l'admin uniquement

**Module : Modification**
- [ ] T31 : L'admin peut modifier le titre d'un document
- [ ] T32 : L'admin peut modifier le contenu d'un document
- [ ] T33 : La modification sans titre affiche une alerte "Titre requis"
- [ ] T34 : La modification est persistée en DB après rechargement de l'app
- [ ] T35 : La liste locale reflète le nouveau titre après modification

**Module : Téléchargement / Partage**
- [ ] T36 : Le bouton "Télécharger" déclenche le partage système
- [ ] T37 : Le contenu partagé contient le titre et le contenu du document
- [ ] T38 : Le partage fonctionne si le contenu est vide (message de remplacement)
- [ ] T39 : Le bouton "Partager" dans le détail fonctionne
- [ ] T40 : L'icône de téléchargement dans la liste fonctionne

**Module : Favoris**
- [ ] T41 : L'écran Documents peut être mis en favori
- [ ] T42 : L'étoile change de couleur après mise en favori
- [ ] T43 : Le favori persiste après navigation

**Module : API**
- [ ] T44 : GET /api/documents retourne 200 avec JWT valide
- [ ] T45 : GET /api/documents retourne 401 sans JWT
- [ ] T46 : POST /api/documents avec données valides retourne 201
- [ ] T47 : POST /api/documents avec catégorie invalide retourne 400
- [ ] T48 : GET /api/documents/:id retourne 404 pour ID inexistant
- [ ] T49 : PUT /api/documents/:id met à jour correctement
- [ ] T50 : PUT /api/documents/:id retourne 403 si syndicateId ne correspond pas

### 12.2 Tests sécurité (20 tests)

- [ ] S01 : GET /documents sans token → 401
- [ ] S02 : POST /documents avec rôle "member" → 403
- [ ] S03 : POST /documents avec rôle "tenant" → 403
- [ ] S04 : PUT /documents/:id d'un autre syndicat → 403
- [ ] S05 : GET /documents/:id d'un autre syndicat → 403
- [ ] S06 : POST /documents sans syndicateId dans JWT → document créé avec syndicateId vide (risque P1)
- [ ] S07 : Content > 500 000 chars → 400
- [ ] S08 : Injection SQL dans title → input sanitisé par paramètre Drizzle
- [ ] S09 : XSS dans content → stocké tel quel (risque si rendu HTML)
- [ ] S10 : Token expiré → 401 puis rafraîchissement auto
- [ ] S11 : Super_admin peut lire les documents de tout syndicat
- [ ] S12 : syndicate_admin ne peut PAS lire les documents d'un autre syndicat
- [ ] S13 : Super_admin avec supervision=false peut-il accéder aux documents ? (vérifier le middleware)
- [ ] S14 : Tenant avec token valide voit uniquement "published"
- [ ] S15 : Rate limiting : 500 req/min sur /api/documents
- [ ] S16 : CORS : origine non autorisée rejetée en production
- [ ] S17 : Header Content-Type manquant → 400
- [ ] S18 : Payload JSON malformé → 400
- [ ] S19 : Pas d'audit log créé pour les actions documents (test de la lacune)
- [ ] S20 : URL signée GCS expirée correctement refusée (à implémenter)

### 12.3 Tests mobile (20 tests)

- [ ] M01 : Écran Documents se charge sur iOS
- [ ] M02 : Écran Documents se charge sur Android
- [ ] M03 : Écran Documents se charge en mode Web
- [ ] M04 : RTL (langue arabe) : layout s'inverse correctement
- [ ] M05 : Mode sombre : couleurs correctes sur tous les composants
- [ ] M06 : Mode clair : couleurs correctes sur tous les composants
- [ ] M07 : Rotation écran (paysage/portrait) : pas de débordement
- [ ] M08 : Grande police (accessibilité) : textes ne se chevauchent pas
- [ ] M09 : Connexion lente : spinner affiché pendant chargement
- [ ] M10 : Perte de connexion : message d'erreur explicite
- [ ] M11 : Liste vide : empty state s'affiche correctement
- [ ] M12 : Modal génération : scroll fonctionne sur petits écrans
- [ ] M13 : Modal édition : clavier ne masque pas le champ de contenu
- [ ] M14 : Haptics : vibration sur génération réussie
- [ ] M15 : Back button : navigation vers l'écran précédent
- [ ] M16 : FlatList : défilement fluide avec 100+ documents
- [ ] M17 : Recherche : pas de lag avec frappe rapide
- [ ] M18 : Filtre + Recherche combinés : résultats corrects
- [ ] M19 : Offline : l'app ne crash pas si l'API est inaccessible
- [ ] M20 : Tablette (isWide) : padding et layout corrects

### 12.4 Tests multi-tenant (20 tests)

- [ ] MT01 : Syndicat A ne voit pas les documents du Syndicat B
- [ ] MT02 : Syndicat A ne peut pas modifier les documents du Syndicat B
- [ ] MT03 : Super_admin voit les documents des deux syndicats
- [ ] MT04 : Génération d'un document assigne correctement le syndicateId du JWT
- [ ] MT05 : Un admin de Syndicat A ne peut pas générer de documents pour Syndicat B
- [ ] MT06 : Les stats (publiés/brouillons) sont correctement scoped par syndicat
- [ ] MT07 : La recherche ne retourne pas des docs d'autres syndicats
- [ ] MT08 : Les filtres par catégorie sont scoped par syndicat
- [ ] MT09 : syndicateId "" (vide) : les documents sont-ils exposés ? (risque P0)
- [ ] MT10 : Deux admins du même syndicat peuvent modifier le même document
- [ ] MT11 : Un admin qui change de syndicat voit les bons documents
- [ ] MT12 : Création de document avec syndicateId forgé dans le body → ignoré (JWT prioritaire ?)
- [ ] MT13 : Isolation après suspension d'un syndicat
- [ ] MT14 : Super_admin avec ?supervision=true accède aux docs du syndicat cible
- [ ] MT15 : Documents créés par un utilisateur supprimé : createdBy = null, document reste
- [ ] MT16 : Syndicat supprimé : documents supprimés en cascade (ON DELETE CASCADE)
- [ ] MT17 : Deux syndicats avec même nom de document : pas de collision
- [ ] MT18 : Export des documents par syndicat (fonctionnalité à implémenter)
- [ ] MT19 : Backup par syndicat : isolation des données
- [ ] MT20 : Logs d'audit par syndicat : séparation correcte

---

## PARTIE 13 — LIVRABLE FINAL

### 13.1 Cartographie complète du module Documents

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MODULE DOCUMENTS — ÉTAT ACTUEL                        │
├─────────────────┬──────────────────────────────────────────────────────-┤
│ COUCHE MOBILE   │ documents.tsx (614 lignes)                             │
│                 │   ├── FlatList (liste, recherche, filtres)             │
│                 │   ├── Modal Détail (métadonnées, download, share, edit)│
│                 │   ├── Modal Génération (6 templates hardcodés)         │
│                 │   ├── Modal Aperçu (texte brut depuis API)             │
│                 │   └── Modal Édition (PUT /documents/:id)               │
├─────────────────┼──────────────────────────────────────────────────────-┤
│ COUCHE SERVICE  │ services/api.ts → documents{}                          │
│                 │   ├── list() → GET /api/documents                      │
│                 │   ├── generate() → POST /api/documents                 │
│                 │   ├── get(id) → GET /api/documents/:id                 │
│                 │   └── update() → PUT /api/documents/:id                │
├─────────────────┼──────────────────────────────────────────────────────-┤
│ COUCHE API      │ routes/documents.ts (119 lignes)                       │
│                 │   ├── GET /documents (auth, scope syndicat+statut)     │
│                 │   ├── GET /documents/:id (auth, isolation syndicat)    │
│                 │   ├── POST /documents (admin only, Zod validation)     │
│                 │   └── PUT /documents/:id (admin + ownership check)     │
│                 │                                                         │
│                 │ routes/pdf.ts (1172 lignes) — DÉCONNECTÉ              │
│                 │   ├── GET /pdf/invoice/:id                             │
│                 │   ├── GET /pdf/receipt/:id                             │
│                 │   ├── GET /pdf/budget/:id                              │
│                 │   ├── GET /pdf/ag/:id                                  │
│                 │   ├── GET /pdf/membership/:userId                      │
│                 │   └── GET /pdf/badge/:userId                           │
├─────────────────┼──────────────────────────────────────────────────────-┤
│ COUCHE DB       │ documentsTable                                          │
│                 │   id, title, category, content, status,                │
│                 │   syndicate_id, size, created_by, created_at           │
│                 │   ❌ MANQUE: file_url, updated_at, version, signed_by  │
├─────────────────┼──────────────────────────────────────────────────────-┤
│ STOCKAGE        │ GCS via objectStorage.ts — NON CONNECTÉ AU MODULE     │
│                 │   Utilisé pour: pièces justificatives de charges       │
│                 │   Pas utilisé pour: les documents du module Documents  │
└─────────────────┴──────────────────────────────────────────────────────-┘
```

### 13.2 Liste des bugs — Priorités P0/P1/P2/P3

| ID | Titre | Priorité | Criticité |
|----|-------|:--------:|-----------|
| BUG-01 | Liste non rafraîchie après génération | 🔴 P0 | Bloquant — Fonctionnalité invisible |
| BUG-02 | Catégorie "statuts" hardcodée pour tous les templates | 🔴 P0 | Corruption de données silencieuse |
| BUG-03 | Tenant voit bouton mais API rejette en 403 | 🟠 P1 | RBAC incohérent UX |
| BUG-04 | "Télécharger" partage du texte, pas un PDF | 🟠 P1 | Fonctionnalité trompeuse |
| BUG-05 | Génération crée texte DB, pas un vrai PDF binaire | 🟠 P1 | Fonctionnalité centrale non livrée |
| BUG-06 | Routes /pdf/* déconnectées du module Documents | 🟠 P1 | Infrastructure PDF non exploitée |
| BUG-07 | Pas de route DELETE /documents/:id | 🟡 P2 | Fonctionnalité CRUD incomplète |
| BUG-08 | Aperçu affiche texte brut, pas un PDF rendu | 🟡 P2 | UX dégradée |
| BUG-09 | Aucun audit log dans routes/documents.ts | 🟡 P2 | Traçabilité absente |
| BUG-10 | Pas de notification push/email après génération | 🟡 P2 | Fonctionnalité attendue manquante |
| BUG-11 | syndicateId vide "" : documents créés sans isolation | 🟠 P1 | Risque sécurité multi-tenant |
| BUG-12 | Schema DB : colonnes critiques manquantes | 🟠 P1 | Fonctionnalités futures bloquées |
| BUG-13 | Pas de numérotation automatique des documents | 🟡 P2 | Non-conformité métier |
| BUG-14 | Arabic/RTL : pdfmake sans police arabe | 🟡 P2 | Internationalisation bloquée |
| BUG-15 | Pas de mode hors ligne | 🟡 P2 | UX dégradée sur connexion instable |
| BUG-16 | Pas de système d'import de fichier | 🟠 P1 | Fonctionnalité DMS de base absente |
| BUG-17 | Pas de suppression de document côté mobile | 🟡 P2 | CRUD incomplet |
| BUG-18 | Pas de workflow de validation/approbation | 🟡 P2 | Processus métier incomplet |
| BUG-19 | Variables dynamiques de template non fusionnées | 🟠 P1 | Templates sans données réelles |
| BUG-20 | Stockage objet GCS non connecté au module | 🟠 P1 | Pas de vrai stockage fichier |

### 13.3 Fonctionnalités manquantes

**P0 — Bloquant production :**
1. Rafraîchissement de la liste après génération
2. Mapping catégorie ↔ template correct
3. Cohérence RBAC tenant sur le bouton Générer

**P1 — Requis avant production :**
4. Génération PDF binaire réelle (connecter /pdf/* au module Documents)
5. Stockage GCS du PDF généré (colonne `fileUrl` + objectStorage)
6. Vrai téléchargement PDF (expo-file-system + expo-sharing)
7. Import de fichier PDF/Word
8. Colonnes DB manquantes (fileUrl, updatedAt, version, signedBy, documentNumber)
9. Guard isAdmin côté mobile excluant le rôle tenant
10. Audit logs dans toutes les routes documents
11. Notifications push/email après génération/publication

**P2 — Important mais différable :**
12. Route DELETE /documents/:id
13. Workflow de validation (draft → pending → published)
14. Signature électronique
15. Versioning des documents
16. Numérotation automatique
17. Aperçu PDF rendu (WebView/expo-web-browser)
18. Mode hors ligne (cache AsyncStorage)
19. Support arabe/RTL dans les PDFs (police Amiri ou Cairo)
20. Templates dynamiques server-side (CRUD)

**P3 — Améliorations futures :**
21. Archivage automatique par politique
22. Recherche full-text côté serveur
23. Signature multiple et validation hiérarchique
24. Export bulk (ZIP de plusieurs PDFs)
25. Historique des versions
26. Documents personnalisés (éditeur riche)
27. Intégration e-signature tier (DocuSign, Yousign)
28. Filigrane (watermark) sur les PDFs
29. QR code de vérification sur tous les types de documents
30. Multi-langue (FR/AR/EN)

### 13.4 Risques de production

| Risque | Probabilité | Impact | Mitigation |
|--------|:-----------:|:------:|-----------|
| Utilisateur génère doc, ne le voit pas, génère 10 fois → DB spammée | 🔴 Élevée | 🔴 Fort | Corriger BUG-01 immédiatement |
| Tous les docs générés catégorisés "statuts" → filtres cassés | 🔴 Élevée | 🟠 Moyen | Corriger BUG-02 immédiatement |
| Tenant génère doc → 403 répété → signalement support | 🟠 Moyenne | 🟡 Faible | Corriger BUG-03 |
| syndicateId vide → documents visibles inter-syndicats | 🟡 Faible | 🔴 Fort | Valider syndicateId dans middleware |
| Aucun audit trail → non-conformité légale | 🔴 Élevée | 🟠 Moyen | Ajouter serverAuditLog() |
| Données texte perdues si colonne content tronquée | 🟡 Faible | 🟠 Moyen | Ajouter text size monitoring |

### 13.5 Recommandations UX

1. **Feedback immédiat** : après génération réussie, le nouveau document doit apparaître en haut de la liste avec une animation de slide-in
2. **Loading state** : afficher un indicateur de chargement (ActivityIndicator) pendant la génération, pas seulement une désactivation du bouton
3. **Prévisualisation avant génération** : afficher un aperçu du document rempli AVANT de cliquer "Générer"
4. **Badge "Nouveau"** : afficher un badge sur les documents générés récemment (< 24h)
5. **Actions contextuelles** : swipe-to-delete sur les cartes de la liste (iOS standard)
6. **Téléchargement progressif** : afficher une barre de progression pour les gros PDF
7. **Partage direct vers WhatsApp** : bouton dédié (usage massif dans le contexte maghrébin)
8. **Confirmation de suppression** : modal de confirmation avec nom du document avant suppression
9. **Filtre "Mes documents"** : permettre de filtrer les docs créés par soi-même
10. **Tri** : options de tri par date, titre, statut (actuellement trié par date DESC seulement)

### 13.6 Score Final

| Dimension | Score |
|-----------|-------|
| Fonctionnel | 42/100 |
| Technique | 48/100 |
| Sécurité | 72/100 |
| UX Mobile | 68/100 |
| Base de données | 35/100 |
| PDF & Stockage | 30/100 |
| Signatures | 5/100 |
| Notifications | 25/100 |
| **TOTAL** | **41/100** |

### 13.7 Décision finale

## 🔴 NOT READY — Ne pas déployer en production

**Motif principal :** 2 bugs P0 bloquants dans le flux core "Générer un document" (liste non rafraîchie + catégorie corrompue), fonctionnalité centrale (vrai PDF binaire) non livrée, et aucun audit trail pour la conformité légale.

**Chemin vers production (minimum viable) :**
1. ✅ Corriger BUG-01 : rafraîchir la liste après génération (~30 min)
2. ✅ Corriger BUG-02 : mapper les catégories correctement (~15 min)  
3. ✅ Corriger BUG-03 : isAdmin = role === "super_admin" || role === "syndicate_admin" (~5 min)
4. 🔧 Corriger BUG-11 : valider syndicateId non vide (~30 min)
5. 🔧 Ajouter audit logs dans routes/documents.ts (~1h)
6. 🔧 Connecter génération au PDF binaire réel (~/4h)
7. 🔧 Ajouter fileUrl + stockage GCS (~4h)
8. 🔧 Vrai téléchargement PDF sur mobile (~2h)

**Estimation correction bugs P0/P1 : ~12 heures de développement**
