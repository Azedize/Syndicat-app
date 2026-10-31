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

## ADR-007 — Traductions hors du provider (proposée)
`LanguageContext.tsx` contient 25 874 lignes de traductions. Proposition :
- un fichier par domaine dans `i18n/translations/` ;
- un provider de moins de 150 lignes.

C'est une étape dédiée, car l'outil d'ajout de clés et le test `i18n-test` doivent suivre.

## ADR-008 — Documents existants à la racine (proposée)
Les journaux (`PROJECT_PROGRESS.md`, `SECURITY_LOG.md`…) restent à la racine : ils sont cités par des commentaires du code et utilisés comme suivi. Les nouveaux documents d'architecture sont dans `docs/`. Les déplacer dans `docs/` est possible, après votre accord.

## ADR-009 — `architecture_app.txt` (proposée : supprimer)
Ce fichier suivi par Git est un export `tree /F` de 1,5 million de lignes, qui inclut `.git` et `node_modules`. Il est remplacé par [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md). Il n'est pas supprimé sans votre accord.
