# Architecture de l'API

## Démarrage et chaîne d'une requête
```text
index.ts ── jobs planifiés (lib/scheduler.ts)
   └── app.ts ── CORS, en-têtes de sécurité, limites de débit, JSON
          └── routes/index.ts ── requireActiveSubscription pour les écritures (sauf /subscriptions, /auth…)
                 ├── modules/<domaine>/<domaine>.routes.ts   (domaines migrés)
                 └── routes/<domaine>.ts                     (domaines à migrer)
                        ├── middleware/auth.ts   requireAuth, requireRole, requireAdmin, requireSuperAdmin
                        ├── <domaine>.access.ts  périmètre (syndicat, supervision)
                        ├── <domaine>.service.ts règles métier, transactions
                        └── @workspace/db        accès aux données (Drizzle)
```

## Module métier
Un module regroupe un domaine dans `src/modules/<domaine>/` :

| Fichier | Contenu | Dépend de |
|---|---|---|
| `<domaine>.routes.ts` | Endpoints : lecture de la requête, appel du service, réponse HTTP | service, access, middleware, lib |
| `<domaine>.service.ts` | Règles métier, calculs, transactions. Aucun `req`/`res` | `@workspace/db`, lib |
| `<domaine>.access.ts` | Contrôles d'accès propres au domaine | middleware |
| `<domaine>.validation.ts` | Schémas Zod, si le domaine en a assez pour un fichier | zod |

Les couches ne sont ajoutées que si le domaine le justifie (pas de dépôt « repository » vide).

### Module migré : `subscriptions`
- `subscriptions.routes.ts` (1 420 lignes) : 21 endpoints, inchangés.
- `subscriptions.service.ts` : `computeSubscriptionStatus`, `enrichSubscription`, moyens de paiement, `finalizeSuccessfulPayment` (transaction avec verrou de ligne), `assignTrial`.
- `subscriptions.access.ts` : `requireSubscriptionScope`, supervision du super admin.
- Avant : `lib/stripeWebhook.ts`, `routes/organizations.ts` et `routes/syndicates.ts` importaient le **fichier de routes** pour réutiliser ces fonctions. Ils importent maintenant le service.

### Modules migrés : `budget` et `document-library`
- `budget.service.ts` : `reconcileBudgetAmounts` (règle des montants au centime) et `resolveOwnerUserId`, utilisé aussi par `routes/allocation.ts`.
- `document-library.service.ts` : `assertDeletable` (une pièce justificative ne se supprime pas), utilisé aussi par `routes/documents.ts`.
- Plus aucun fichier de routes n'importe un autre fichier de routes (hors `routes/index.ts`, qui les enregistre).

### Modules de l'étape 3
| Module | Service : ce qui en est sorti | Validation |
|---|---|---|
| organigramme | `roleColor`, `roleLabel`, `rolePermissions` | — |
| statistics | `flowsIn`, `syndicateCurrency`, `lastNMonths` | — |
| expenses | `loadScopedExpense`, `checkExpenseReferences`, `alertApprovers`, `otherApprovers` | `expenseFields`, `ExpenseRefs` |
| claims | `loadVisible`, `assertFresh`, `addEvent`, `view`, `checkUploads`, `filters`, `OPEN_SQL` | `listSchema` |
| lots | `loadScopedLot`, `outstandingOf`, `insertLot`, contrôles de syndicat et de référence | `LOT_TYPES` et la chaîne des schémas de lot |
| elections | `getEligibleVoterIds`, `isUserEligible`, `enrichElections`, `closeElectionVoting`, `publishElectionResults` | — |
| chat | accès aux conversations, blocages, état de saisie, enrichissement des messages | — |
| marketplace | périmètre du catalogue, `listingOpenTo`, `forViewer` (masquage), `autoScan` | — |

Les fonctions qui lisent `req` ou écrivent dans `res` (périmètre du jeton, erreurs HTTP) restent dans les routes.

**Duplication supprimée :** `jobs/election-reminders.ts` contenait une copie de la règle d'éligibilité au vote. Son commentaire disait qu'elle évitait d'importer la couche routes. Le job importe maintenant `getEligibleVoterIds` du service ; la logique est identique, ce qui a été vérifié ligne à ligne.

**Code probablement mort, conservé :** `createIncidentConversation` et `addResponsibleToIncidentConversation` (`chat.service.ts`) sont exportées mais importées nulle part, ni de façon statique ni de façon dynamique. Elles sont gardées en attendant votre décision.

## `jobs/` et `integrations/`
| Dossier | Fichiers | Démarré par |
|---|---|---|
| `jobs/` | contract-expiry, document-expiry, document-retention, election-reminders, mandate-expiry, otp-retention, subscription-reminders | `src/index.ts` (journal « Scheduled job registered ») |
| `integrations/stripe/` | stripeClient, stripeWebhook | `app.ts` (webhook brut), `routes/stripe.ts` |
| `integrations/` | zimsend.service (SMS) | `index.ts` (contrôle de configuration), `routes/auth.ts`, `routes/syndicates.ts` |

`lib/funds-calls.ts` démarre aussi un job, mais reste dans `lib/` : `routes/allocation.ts` utilise sa logique métier (relances, ajustements, rapprochement).

## `lib/` aujourd'hui
| Catégorie | Fichiers |
|---|---|
| Infrastructure | logger, email/, outbound, objectStorage, objectAcl, file-store, file-signature, scheduler, paginate, route-error, rate-limit-profile, sequences |
| Accès et périmètre | access, scope, syndicate-filter, document-access, file-access |
| Règles métier partagées | allocation, allocation-store, charge-time, claims, finance-metrics, funds-calls, payment-reference, reconciliation, treasury, units, bank-details, contact, retention, debt-escalation |
| Notifications et documents | notify, notification-texts, documentPdf (5 609 lignes), audit |

## Cartographie proposée pour la suite
| Étape | Déplacement | Statut |
|---|---|---|
| 1 | `resolveOwnerUserId` → `modules/budget/budget.service.ts` | Fait |
| 2 | `assertDeletable` → `modules/document-library/document-library.service.ts` | Fait |
| 3 | Jobs de `lib/` → `src/jobs/` | Fait (7 fichiers) |
| 4 | Stripe et ZimSend → `src/integrations/` | Fait |
| 5 | Domaines ayant de la logique métier dans leurs routes | Fait pour 8 domaines (étape 3) |
| 6 | Domaines restants : treasury, prestataires, travaux, parking, governance, auth, content, pdf, template-studio, documents (6 673 lignes)… | À faire : 41 fichiers dans `routes/` |

## Points connus
- `routes/documents.ts` (6 673 lignes) et `lib/documentPdf.ts` (5 609 lignes) sont les plus gros fichiers du dépôt.
- 147 variables ou imports jamais lus (`tsc --noUnusedLocals`).
- **Incohérence de règle (non corrigée, décision métier) :** `computeSubscriptionStatus` (affichage) et `isWritableSubscription` (blocage d'écriture) ne calculent pas le statut de la même façon. Exemples :
  - un abonnement « grace » dont la date de grâce est passée s'affiche « grace » mais les écritures sont refusées ;
  - un essai sans date de fin s'affiche « trial » mais n'est pas inscriptible.
- `lib/api-zod` ne contient qu'un schéma ; les validations Zod sont écrites dans 35 fichiers de routes.

## Tests liés à l'emplacement des fichiers
Certains tests lisent ou importent le code source par son chemin. Après un déplacement, il faut les vérifier :
- `no-server-error-test` parcourt tout `src/` à la recherche des `router.get(…)`. Il échoue s'il trouve moins de 128 routes, pour qu'un déplacement ne fasse plus baisser la couverture en silence.
- `budget-totals-test` importe `modules/budget/budget.service.ts`. Si l'import échoue, c'est un échec (ce n'était qu'un saut avant).
- `election-audit-test` lit `jobs/election-reminders.ts` pour son contrôle statique.
- `email-*-test` et `rate-limit-profile-test` importent des fichiers de `lib/`.
