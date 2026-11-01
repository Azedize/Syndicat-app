# Règles de code

## Imports
- Mobile : alias `@/` depuis la racine de `artifacts/mobile` (ex. `@/features/marketplace/api`). Dans une fonctionnalité, imports relatifs pour ses propres fichiers (`../api`, `../catalog`).
- API : imports relatifs avec l'extension `.js` (ESM compilé par esbuild), ex. `../../lib/logger.js`.
- Pas de fichier `index.ts` qui ré-exporte toute une fonctionnalité. Seule exception existante : `components/ui/index.ts`.
- Respecter les règles de [MODULE_DEPENDENCIES.md](../architecture/MODULE_DEPENDENCIES.md).

## Migrer une fonctionnalité mobile
1. Créer `features/<f>/api.ts` avec l'objet d'endpoints, construit sur `request` (`@/services/api/client`), et le retirer de `services/api/index.ts`.
2. Déplacer les composants propres à la fonctionnalité dans `features/<f>/components/`.
3. Mettre à jour les importeurs, y compris les espaces de noms comme `api.<f>.` dans `DataContext`.
4. Vérifier :
   - `npx tsc --noEmit -p .` (0 erreur) ;
   - `npx tsc --noEmit -p . --noUnusedLocals` (aucun nouvel avertissement dans les fichiers déplacés) ;
   - `npx expo export --platform android --platform ios` ;
   - les écrans dans le navigateur.
5. Noter le changement dans `docs/PROJECT_PROGRESS.md`.

## Migrer un domaine de l'API
1. Créer `src/modules/<d>/` et y déplacer le fichier de routes **sans modifier le code des endpoints**.
2. Sortir les fonctions sans `req`/`res` dans `<d>.service.ts`, et les contrôles d'accès propres au domaine dans `<d>.access.ts`.
3. Mettre à jour `routes/index.ts` et les autres importeurs.
4. Vérifier :
   - `npx tsc -p tsconfig.json --noEmit` ;
   - `npm run build` ;
   - `powershell -File scripts/restart-test-apis.ps1` ;
   - `bash scripts/run-all-tests-testdb.sh`, qui doit donner le même résultat qu'avant.

## Interdits
- Logique métier ou accès à la base dans un composant.
- Contrats d'API modifiés pendant une restructuration.
- Migrations SQL, données ou fichiers des utilisateurs (`uploads/`) touchés pendant une restructuration.
- Secrets dans le code ou la documentation.
- Fichier supprimé sans avoir vérifié ses références : imports, routes, scripts, tests, usages natifs et chaînes dynamiques.
