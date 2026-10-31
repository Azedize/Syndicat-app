# Dépendances entre modules

Mesures faites le 31/10/2026 avec un analyseur d'imports (imports statiques, `require`, `import()` ; imports de type exclus des cycles).

## Règles
1. Un composant d'interface n'accède jamais à la base de données ; seul l'API le fait.
2. `services/api/client.ts` n'importe ni composant, ni contexte, ni fonctionnalité.
3. Une fonctionnalité (`features/<f>`) n'importe pas les fichiers internes d'une autre fonctionnalité.
4. `components/ui` ne contient pas de règle métier d'une fonctionnalité.
5. Côté API, `lib/` n'importe jamais un fichier de `routes/` ni de `modules/*/…routes.ts`.
6. Un fichier de routes n'importe pas un autre fichier de routes : la logique partagée va dans un service.
7. Les jetons de design viennent de `constants/` ; aucune couleur codée en dur hors des jetons.

## Mobile (220 fichiers)
- **Cycles d'import à l'exécution : 0.**
- **Fichiers jamais importés : 0 hors points d'entrée.** Les 118 fichiers « non importés » sont des routes Expo Router, des configurations (`babel`, `metro`), des scripts de build et un test.

| Depuis → vers | Imports |
|---|---|
| app → components | 359 |
| app → context | 300 |
| app → hooks | 208 |
| app → lib | 106 |
| app → constants | 70 |
| components → hooks | 63 |
| components → constants | 60 |
| app → services | 54 |
| components → context | 44 |
| components → services | 7 |
| context → services | 2 |
| lib → services | 5 (`lib/api.ts` et utilitaires de fichiers) |

À surveiller : `components → services` (7) et `app → services` (54) mélangent l'interface et les appels API. La migration par fonctionnalité les déplace vers `features/<f>/api.ts`.

## API (105 fichiers)
- **Cycles d'import : 0.**
- **Avant le pilote :**
  - `lib → routes` : 1 (`stripeWebhook` → `routes/subscriptions`) ;
  - `routes → routes` hors index : 4.
- **Après le pilote :**
  - `lib → routes` : 0 ;
  - `routes → routes` hors index : 2 (`allocation → budget`, `documents → document-library`), prévus aux étapes 1 et 2.

| Depuis → vers | Imports |
|---|---|
| routes → lib | 192 |
| lib → lib | 77 |
| routes → middleware | 52 |
| index.ts → lib | 11 |

## Graphe simplifié
```text
mobile:  app ─▶ features ─▶ services/api/client ─▶ lib/login-transport
          │        │
          ├──▶ components/ui ─▶ constants, hooks
          └──▶ context ─▶ services/api

api:     routes/index ─▶ modules/*.routes ─▶ *.service ─▶ @workspace/db
                     └─▶ routes/*  ─▶ lib/* ─▶ @workspace/db
         middleware/auth ◀── modules, routes
```

## Refaire la mesure
L'analyseur n'est pas dans le dépôt (outil ponctuel). Pour une vérification continue, ajouter `madge --circular` ou `dependency-cruiser` en dépendance de développement (décision à prendre ; aucune dépendance ajoutée pour l'instant).
