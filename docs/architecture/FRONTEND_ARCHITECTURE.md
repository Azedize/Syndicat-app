# Architecture de l'application mobile

## Couches
```text
app/ (routes)  ──▶  features/<f>/components, hooks  ──▶  features/<f>/api.ts  ──▶  services/api/client.ts
      │                       │                                                         ▲
      └────────▶ components/ui, theme, brand ◀──────┘                                   │
      └────────▶ context/ (Auth, Data, Theme, Language, Toast…) ────────────────────────┘
                 hooks/, constants/, lib/  (utilisables partout, ne dépendent d'aucune fonctionnalité)
```

- **`app/`** : routes Expo Router. Un écran assemble des composants et des hooks ; il ne contient pas de logique réutilisable.
- **`features/<f>/`** : tout ce qui est propre à une fonctionnalité (API, composants, constantes, hooks). Une fonctionnalité n'importe pas les fichiers internes d'une autre.
- **`components/`** : composants partagés sans règle métier d'une fonctionnalité.
- **`services/api/client.ts`** : seul endroit qui connaît l'URL de base, les jetons, le renouvellement de session et les tickets de fichiers. Il n'importe aucun composant.
- **`context/`** : état global (session, thème, langue, données partagées).

## État de la migration
| Fonctionnalité | Statut | Contenu |
|---|---|---|
| Marché (`features/marketplace`) | **Migré** | `api.ts`, `catalog.ts`, `components/ProductCard`, `ResidenceMarket`, `DiscoverDeck` |
| Notifications (`features/notifications`) | **Migré** | `api.ts` (alertes, lecture, préférences, jeton push), `components/NotificationManager`, `hooks/usePushNotifications`, `tasks/backgroundNotifications` |
| Documents (`features/documents`) | **Migré** | `api.ts` (`documents`, `library`, `templateRequests` + types), `documentFiles`, `documentMeta`, `pdfHtml`, 7 composants (assistant, lot, demandes, signature) |
| Finances (`features/finances`) | **Migré** | `api.ts` (`finance`, `transparency`, `debtEscalations`, `reserveFund`), AllocationDetail, ExpenseDetailSheet, ObligationAccount |
| Gouvernance (`features/governance`) | **Migré** (API) | `api.ts` (`elections`, `meetings`) |
| Chat, Réclamations, Parking (`features/chat`, `claims`, `parking`) | **Migré** (API) | `api.ts` + types |
| Prestataires (`features/providers`) | **Migré** (API) | `api.ts` (`prestataires`, `contrats`, `travaux`) |
| Abonnements (`features/subscriptions`) | **Migré** | `api.ts`, SubscriptionBanner |
| Autres (auth, members, syndicates, content, statistics, organizations…) | À migrer | `services/api/index.ts` (781 lignes) |

`hooks/useNotificationBus.ts` reste partagé : les contextes Toast et Data l'utilisent aussi.

Tests qui parcourent le code mobile : `i18n-test`, `routes-resolve-test` et `contacts-config-test` incluent `features/` (et `services/`, `lib/` selon le test).

### Cartographie proposée pour la suite (par ordre de risque croissant)
| Fonctionnalité cible | Écrans (`app/`) | Composants et endpoints à déplacer |
|---|---|---|
| `settings` | settings, profile, change-password, email-change | LanguageSwitcher, `auth.updateProfile`… |
| `finances` | charges, paiements, tresorerie, budget-previsionnel, releves, repartition, tableau-bord-financier, finances-residence, cotisations, invoices, portefeuille | AllocationDetail, ExpenseDetailSheet, ObligationAccount, BalanceLine/Meter (restent dans `ui`), `finance`, `reserveFund`, `debtEscalations` |
| `governance` | elections, meetings, assemblee-generale, pv, elected-members, governance | `elections`, `meetings` |
| `chat` | chat, chat-thread, messagerie-interne | `chat` |
| `subscriptions` | abonnements, plans, payment | SubscriptionBanner, `subscriptions` |

## Points connus à traiter
- **`context/LanguageContext.tsx` (25 874 lignes)** : toutes les traductions sont dans le provider. Cible : `i18n/translations/<domaine>.ts` + un provider court. À faire en une étape dédiée (outil `addkeys` à adapter).
- **`context/DataContext.tsx` (2 043 lignes)** : charge au démarrage des données de plusieurs domaines (marché, finances, chat). Cible : React Query par fonctionnalité.
- **Deux clients HTTP** : `services/api/client.ts` (`request`) et `lib/api.ts` (`apiRequest`, utilisé par 66 fichiers) dupliquent l'envoi du jeton et le renouvellement. Ils ne sont pas fusionnés, car leurs erreurs n'ont pas la même forme :
  - `apiRequest` donne la priorité au champ `error` et expose `httpStatus`, `detail`, `action`, `phone` ;
  - `request` donne la priorité au champ `message` et expose `status`, `body`.

  Une fusion changerait des messages et des tests de statut dans 66 fichiers. Elle doit être faite écran par écran.
- **Écrans volumineux** : documents (4 330 lignes), elections (3 114), tableau-national (2 722), syndicate-setup (2 146), assemblee-generale (2 072).
- **296 variables ou imports jamais lus** (`tsc --noUnusedLocals`), surtout des `import React` devenus inutiles.

## Langage
Le code mobile est en **TypeScript** (déjà le cas avant cette restructuration). Il n'est ni converti en JavaScript ni l'inverse.
