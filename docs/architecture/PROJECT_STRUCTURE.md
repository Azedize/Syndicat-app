# Structure du projet

État au 01/11/2026, après la quatrième étape de restructuration :
- **API :** tous les domaines sont dans `src/modules/` (53 modules). `src/routes/` ne contient plus que `index.ts`.
- **Mobile :** 14 fonctionnalités dans `features/`. `services/api/index.ts` ne garde que l'authentification, l'audit et le contenu transverse.
Les dossiers générés (`node_modules`, `dist`, `.expo`, `uploads*`, `scripts/.seedgen`) ne sont pas du code source et ne sont pas réorganisés.

```text
zip-repl/
├── artifacts/                     Applications déployables (nom historique, voir ADR-001)
│   ├── mobile/                    Application Expo
│   │   ├── app/                   Routes Expo Router (un fichier = un écran)
│   │   │   ├── (tabs)/            Onglets : accueil, finances, marché, membres, menu
│   │   │   ├── admin/             Écrans super admin
│   │   │   └── *.tsx              Autres écrans (≈110)
│   │   ├── features/              Fonctionnalités autonomes (cible de la migration)
│   │   │   ├── chat/              api.ts (conversations, messages, réactions + types)
│   │   │   ├── community/         api.ts (publications, annonces, actions, idées + types)
│   │   │   ├── directory/         api.ts (membres, locataires, équipe du syndic + types)
│   │   │   ├── organizations/     api.ts (syndicats, sociétés de syndic, copropriétés, portefeuille)
│   │   │   ├── statistics/
│   │   │   │   ├── api.ts         statistiques, classements (+ types)
│   │   │   │   └── components/    SyndicateCard (tableau national)
│   │   │   ├── claims/            api.ts (réclamations et incidents + types)
│   │   │   ├── finances/
│   │   │   │   ├── api.ts         finance, transparency, debtEscalations, reserveFund
│   │   │   │   └── components/    AllocationDetail, ExpenseDetailSheet, ObligationAccount
│   │   │   ├── governance/        api.ts (élections, assemblées)
│   │   │   ├── parking/           api.ts (places, véhicules, infractions, visiteurs + types)
│   │   │   ├── providers/         api.ts (prestataires, contrats, travaux + types)
│   │   │   ├── subscriptions/
│   │   │   │   ├── api.ts         Formules et abonnement du syndicat
│   │   │   │   └── components/    SubscriptionBanner
│   │   │   ├── marketplace/
│   │   │   │   ├── api.ts         Endpoints du marché
│   │   │   │   ├── catalog.ts     Catégories, états, libellés
│   │   │   │   └── components/    ProductCard, ResidenceMarket, DiscoverDeck
│   │   │   ├── documents/
│   │   │   │   ├── api.ts         Documents générés, bibliothèque, demandes de modèles (+ types)
│   │   │   │   ├── documentFiles.ts, documentMeta.ts, pdfHtml.ts   Ouverture, libellés, lecteur PDF
│   │   │   │   └── components/    DocumentRow, DocumentWizard, DocumentBundleModal,
│   │   │   │                      MemberDocumentRequest, TemplateRequestModal,
│   │   │   │                      SignatureOrderPanel, SignaturePad
│   │   │   └── notifications/
│   │   │       ├── api.ts         Alertes, lecture, préférences, jeton push
│   │   │       ├── components/    NotificationManager (pont bus → toasts)
│   │   │       ├── hooks/         usePushNotifications (inscription, ouverture d'une notification)
│   │   │       └── tasks/         Tâche de fond (notification reçue app fermée)
│   │   ├── components/            Composants partagés
│   │   │   ├── ui/                Design system (Button, Card, Skeleton, TextField…)
│   │   │   ├── theme/             ThemeSwitcher, ThemeSwitchingArea
│   │   │   ├── brand/             Logo, marque, en-tête d'authentification
│   │   │   ├── signature/         Illustration de résidence
│   │   │   └── *.tsx              Composants transverses (DataState, EmptyState, FormSheet, RoleGuard,
│   │   │                          StatCard, LanguageSwitcher…)
│   │   ├── services/api/          Client HTTP
│   │   │   ├── client.ts          URL de base, jetons, session, request(), tickets de fichiers
│   │   │   └── index.ts           Endpoints transverses (226 lignes) : auth, audit, content
│   │   ├── context/               Providers : Auth, Data, Theme, Language, Toast…
│   │   ├── i18n/                  languages.ts (langues, RTL), translations.ts (dictionnaire, 4 langues)
│   │   ├── hooks/                 Hooks transverses (couleurs, format, permissions, bus de notifications…)
│   │   ├── constants/             Jetons de design (couleurs, espacements, typo, motion), menu
│   │   ├── lib/                   Utilitaires sans UI (dates, médias, upload, transport de connexion)
│   │   ├── assets/                Ressources statiques : brand/, images/, intro/
│   │   ├── server/                Serveur statique du build web
│   │   ├── scripts/build.js       Build web
│   │   └── app.json, eas.json, metro.config.js, babel.config.js, tsconfig.json
│   │
│   └── api-server/                API Express
│       ├── src/
│       │   ├── index.ts           Démarrage : port, jobs planifiés
│       │   ├── app.ts             Express : CORS, sécurité, limites, routes
│       │   ├── modules/           53 modules métier : <domaine>/<domaine>.routes.ts (+ .service.ts,
│       │   │                      .validation.ts, .access.ts, .html.ts selon le besoin)
│       │   │   ├── subscriptions/ routes + service (statut, paiements, essai) + access (supervision)
│       │   │   ├── documents/     documents.routes.ts monte 6 sous-routeurs, dans l'ordre :
│       │   │   │                  catalog, verify (public), requests, bundles, crud, signing
│       │   │   │                  + service (chargeurs de données, numérotation, ordre de signature,
│       │   │   │                  régénération signée) + html (page de vérification publique)
│       │   │   ├── budget/        budget.routes.ts monte budgets, appels, debts
│       │   │   │                  + service + validation + access
│       │   │   ├── elections/     5 sous-routeurs (read, setup, candidates, voting, results) + service + access
│       │   │   ├── marketplace/   4 sous-routeurs (catalog, listings, sellers, shop) + service
│       │   │   ├── chat/          3 sous-routeurs (conversations, messages, safety) + service + access
│       │   │   ├── allocation/, claims/, expenses/, lots/   routes + service + validation (Zod)
│       │   │   ├── auth/, budget/, chat/, elections/, marketplace/, pdf/, treasury/,
│       │   │   │   template-studio/, stripe/, storage/, parking/, travaux/, …   routes + service
│       │   │   └── actes/, ag/, audit/, buildings/, content/, finance/, members/, users/, …
│       │   │                      routes seules (leurs fonctions lisent req/res)
│       │   ├── routes/index.ts    Enregistre les 52 routeurs ; contrôle d'abonnement des écritures
│       │   ├── jobs/              Tâches planifiées : échéances (contrats, mandats, documents),
│       │   │                      rappels (élections, abonnements), rétention (documents, OTP)
│       │   ├── integrations/      Fournisseurs externes : stripe/ (client, webhook), zimsend (SMS)
│       │   ├── middleware/        auth.ts (rôles), subscription.ts (écriture)
│       │   ├── lib/               Infrastructure et règles partagées (≈35 fichiers)
│       │   ├── scripts/           seed-plans.ts
│       │   └── types/             Déclarations de types externes
│       ├── fonts/                 Polices des PDF
│       ├── uploads/, uploads-test/  Fichiers des utilisateurs (jamais déplacés)
│       └── build.mjs              Build esbuild → dist/
│
├── lib/
│   ├── db/                        Schéma Drizzle (src/schema.ts) et migrations (drizzle/)
│   ├── api-zod/                   Schémas Zod partagés
│   └── shell-quote/               Dépendance locale (override)
│
├── scripts/                       Tests d'intégration et E2E, seed, outils base de test
│   ├── src/*-test.ts              40 suites (lancées par run-all-tests-testdb.sh)
│   ├── src/seedgen/               Générateur de données de test
│   ├── run-all-tests-testdb.sh    Toutes les suites sur la base isolée syndycat_test
│   ├── restart-test-apis.ps1      API de test 5055 / 5056
│   └── dev-phone.ps1              API + tunnels Cloudflare + Expo pour un téléphone
│
├── docs/                          Toute la documentation
│   ├── PROJECT_PROGRESS.md        Journal de suivi des travaux
│   ├── architecture/              Vue d'ensemble, structure, front, back, dépendances, décisions (ADR)
│   ├── development/               Commandes locales, comptes de test, règles de code
│   ├── database/                  Inventaire des tables, données de test (guide, plan, rapport)
│   ├── security/                  Journal de sécurité, audit du 21/10/2026
│   ├── design/                    Design system, bibliothèque de documents
│   └── integrations/              Fournisseurs de paiement
│
├── .env, .env.example             Configuration (secrets : .env seulement, jamais commité)
├── pnpm-workspace.yaml            Paquets : artifacts/*, lib/*, scripts
├── tsconfig.base.json, tsconfig.json
└── package.json                   Scripts racine : build, typecheck, db:*
```

## Où mettre un nouveau fichier
| Je crée… | Je le mets dans… |
|---|---|
| Un écran | `artifacts/mobile/app/` (route) ; sa logique et ses composants dans `features/<fonctionnalité>/` |
| Un composant réutilisé par plusieurs fonctionnalités | `components/ui/` (générique) ou `components/<thème>/` |
| Un appel API d'une fonctionnalité | `features/<fonctionnalité>/api.ts` |
| Un endpoint | `api-server/src/modules/<domaine>/<domaine>.routes.ts` |
| Une règle métier serveur | `modules/<domaine>/<domaine>.service.ts` |
| Un contrôle d'accès propre à un domaine | `modules/<domaine>/<domaine>.access.ts` |
| Une brique d'infrastructure (e-mail, stockage, logs) | `api-server/src/lib/` |
| Une tâche planifiée | `api-server/src/jobs/` + son démarrage dans `src/index.ts` |
| Un fournisseur externe (paiement, SMS) | `api-server/src/integrations/` |
| Une table ou une colonne | `lib/db/src/schema.ts` + une migration SQL numérotée dans `lib/db/drizzle/` |
| Un test d'intégration | `scripts/src/<sujet>-test.ts` + une entrée `*:test` dans `scripts/package.json` |
