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

## API (109 fichiers)
- **Cycles d'import : 0.**
- **Avant la restructuration :**
  - `lib → routes` : 1 (`stripeWebhook` → `routes/subscriptions`) ;
  - `routes → routes` hors index : 4.
- **Maintenant :**
  - `lib → routes` : 0 ;
  - `routes → routes` hors index : 0. Les 49 imports « routes → routes » sont les enregistrements de `routes/index.ts`.

| Depuis → vers | Imports |
|---|---|
| routes → lib | 169 |
| routes → middleware | 49 |
| lib → lib | 47 |
| jobs → lib | 26 |
| modules → lib | 23 |
| index.ts → jobs | 7 |
| routes → modules | 7 (services partagés : abonnement, budget, bibliothèque) |
| routes → integrations | 3 |
| integrations → modules | 1 (webhook Stripe → service d'abonnement) |

## Mobile, après la migration du Marché, des Notifications et des Documents (224 fichiers)
- 0 cycle ; 0 import d'une fonctionnalité vers une autre (les 15 imports `features → features` sont internes).
- `app → services` : 54 → 43 ; `components → services` : 7 → 1 ; `app → features` : 34.

## API après l'étape 3 (120 fichiers)
- 0 cycle ; 0 import entre modules ; 0 import `lib → routes` ; 0 import `routes → routes` hors `routes/index.ts`.
- 11 modules, 41 fichiers encore dans `routes/`.
- `routes → modules` : 15 (services partagés, ex. `allocation` → `budget.service`).
- `jobs → modules` : 1 (`election-reminders` → `elections.service`).

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
