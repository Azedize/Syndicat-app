# Décisions d'architecture

Chaque décision indique son statut : **acceptée** (appliquée), **proposée** (attend votre accord) ou **reportée**.

## ADR-001 — Garder `artifacts/` pour l'instant (proposée : renommer en `apps/`)
- **Contexte :** les applications sont dans `artifacts/mobile` et `artifacts/api-server`. Le nom `apps/` serait plus conventionnel.
- **Constat :** 86 références dans 31 fichiers suivis par Git, réparties ainsi :
  - 24 suites de test et outils de `scripts/src` ;
  - `scripts/restart-test-apis.ps1` ;
  - `documentPdf.ts` ;
  - `pnpm-lock.yaml` ;
  - 6 documents.

  S'y ajoutent les chemins que vous tapez (`npm run dev`, tunnels), le cache Metro et les terminaux ouverts.
- **Décision :** pas de renommage tant que vous ne l'avez pas validé. Si vous l'acceptez :
  1. arrêter Expo et les API ;
  2. renommer les dossiers et mettre à jour les 86 références et `pnpm-workspace.yaml` ;
  3. lancer `pnpm install` ;
  4. lancer la régression complète, `tsc` et l'export natif.

## ADR-002 — Pas de dossier `src/` dans l'app mobile (acceptée)
- **Contexte :** déplacer `components/`, `context/`… dans `src/` imposerait de changer l'alias `@/` dans plus de 200 fichiers et la racine d'Expo Router.
- **Décision :** garder la disposition du modèle Expo (dossiers à la racine de `artifacts/mobile`) et ajouter `features/`. Le gain d'un `src/` ne justifie pas le risque.

## ADR-003 — Organisation par fonctionnalité, migration une fonctionnalité à la fois (acceptée)
- **Décision :** chaque fonctionnalité regroupe dans `features/<f>/` ses appels API, ses composants et ses constantes. Les écrans restent dans `app/` (Expo Router impose cet emplacement) et deviennent des assembleurs.
- **Pilote :** le Marché, choisi parce qu'il est récent, bien testé (navigateur et suites `marketplace-*`) et peu couplé.
- **Pas de fichier `index.ts` d'export global par fonctionnalité :** ces fichiers créent facilement des cycles et masquent l'origine des imports.

## ADR-004 — `services/api.ts` découpé en `client.ts` et `index.ts` (acceptée)
- **Décision :** le transport (jetons, renouvellement, tickets) va dans `services/api/client.ts`. Les endpoints restent dans `services/api/index.ts`, qui ré-exporte le client.
- **Pourquoi :**
  - l'import `@/services/api` utilisé par plus de 60 fichiers ne change pas ;
  - une fonctionnalité peut construire son API sur `request` sans dépendre des 2 900 lignes d'endpoints.

## ADR-005 — Modules métier côté API, couches seulement si utiles (acceptée)
- **Décision :** `src/modules/<domaine>/` avec `routes`, `service` et `access`, sans couche « repository » systématique : Drizzle sert déjà d'accès aux données.
- **Pilote :** les abonnements, parce que leur logique (`finalizeSuccessfulPayment`, `assignTrial`) était importée depuis un fichier de routes par trois autres fichiers.

## ADR-006 — TypeScript conservé (acceptée)
Le code est déjà en TypeScript (mobile et API). La mission parle de JavaScript, mais une conversion dans un sens ou dans l'autre ferait perdre le typage qui détecte les erreurs d'import pendant la migration. Rien n'est converti.

## ADR-007 — Traductions hors du provider (acceptée, appliquée le 01/11/2026)
- `i18n/languages.ts` : codes, libellés, sens de lecture (`LangCode`, `LangOption`, `LANG_OPTIONS`).
- `i18n/translations.ts` : le dictionnaire (environ 4 787 clés, 4 langues).
- `context/LanguageContext.tsx` : le provider seul (135 lignes au lieu de 25 874). Il ré-exporte `LANG_OPTIONS`, `LangCode` et `LangOption`, donc les importeurs ne changent pas.
- `i18n-test` lit `i18n/translations.ts` ; `contacts-config-test` inspecte aussi `i18n/`.
- Découpage du dictionnaire par domaine : non fait. Les clés n'ont pas de préfixe fiable par domaine.

## ADR-008 — Documents dans `docs/` (acceptée, appliquée le 01/11/2026)
| Avant (racine) | Après |
|---|---|
| PROJECT_PROGRESS.md | `docs/PROJECT_PROGRESS.md` |
| DATABASE_SEEDING_GUIDE / PLAN / REPORT, DATABASE_TABLES_INVENTORY | `docs/database/` |
| SECURITY_LOG, AUDIT_2026-10-21 | `docs/security/` |
| LOCAL_RUN_COMMANDS, TEST_ACCOUNTS | `docs/development/` |
| DESIGN_SYSTEM, DOCUMENT_LIBRARY_DESIGN_PROGRESS | `docs/design/` |
| PAYMENT_PROVIDERS | `docs/integrations/` |

Chemins mis à jour dans :
- le générateur de données (`seedgen/cli.ts`, qui écrit l'inventaire, le plan et le rapport) ;
- `contacts-config-test` (qui lit `LOCAL_RUN_COMMANDS.md`) ;
- les commentaires du code et les liens Markdown (11 liens relatifs vérifiés).

## ADR-009 — `architecture_app.txt` (acceptée : supprimé le 01/11/2026)
Export `tree /F` de 1,5 million de lignes, remplacé par [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md). Il n'était référencé nulle part et reste disponible dans l'historique Git.

## ADR-010 — Le blocage des écritures fait foi pour le statut d'abonnement (acceptée, 01/11/2026)
`computeSubscriptionStatus` (affichage) est dérivé de `isWritableSubscription` (`middleware/subscription.ts`) :
- un abonnement inscriptible garde son statut (`trial`, `active`, `grace`) ;
- un abonnement non inscriptible affiche son statut explicite (`suspended`, `cancelled`, `pending_payment`), sinon `expired` ;
- `isReadOnly` est l'inverse exact de la règle de blocage.

`GET /subscriptions/status` lit les mêmes lignes que le blocage (les 20 plus récentes, et non la seule plus récente). « Aucun abonnement » y est en lecture seule, comme côté serveur. Vérifié sur 216 combinaisons de statut et de dates : 0 écart.

**Changements visibles :**
- un abonnement `active` échu mais dans sa période de grâce s'affichait « grace » alors que les écritures étaient refusées. Il s'affiche maintenant « expired » ;
- un essai sans date de fin s'affichait « trial » alors qu'il n'était pas inscriptible.

## ADR-011 — Code mort supprimé (acceptée, 01/11/2026)
Huit fonctions jamais appelées (vérifié dans l'API, le mobile et les scripts, y compris en recherche textuelle) ont été supprimées, 452 lignes au total. Elles restent disponibles au commit `5a1e78c` :
- chat : `createIncidentConversation`, `addResponsibleToIncidentConversation` ;
- documents : `getElectionData`, `getDecompteChargesData`, `getTenantData`, `getSinistreData`, `getTravauxData` ;
- template-studio : `getTemplateOrFail`.

## ADR-012 — Route `GET /products/reported` rendue accessible (acceptée, 01/11/2026)
Elle était déclarée après `GET /products/:id`, qui l'interceptait (404 « Produit introuvable », déjà le cas au commit `5cd189f`). Elle est maintenant montée juste avant `/products/:id`, dans `marketplace.catalog.routes.ts`. Le contrôle des routes masquées donne 533 routes et 0 masquée.

Vérifié en direct : le super admin reçoit la liste des annonces signalées (200), un membre est refusé (403).
