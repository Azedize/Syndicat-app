# Architecture de l'API

## Démarrage et chaîne d'une requête
```text
index.ts ── jobs planifiés (lib/scheduler.ts)
   └── app.ts ── CORS, en-têtes de sécurité, limites de débit, JSON
          └── routes/index.ts ── requireActiveSubscription pour les écritures (sauf /subscriptions, /auth…)
                 └── modules/<domaine>/<domaine>.routes.ts   (52 modules)
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

**Code probablement mort, conservé en attendant votre décision.** Ces fonctions ne sont appelées nulle part, ni de façon statique ni de façon dynamique :
- `chat.service.ts` : `createIncidentConversation`, `addResponsibleToIncidentConversation` ;
- `documents.service.ts` : `getElectionData`, `getDecompteChargesData`, `getTenantData`, `getSinistreData`, `getTravauxData` ;
- `template-studio.routes.ts` : `getTemplateOrFail`.

### Étape 4 : les autres domaines
- **Avec service :** treasury, travaux, parking, governance, travaux-privatifs, organizations, actions, sinistres, attachments, rankings, workflows, fiches-juridiques, allocation (+ validation), auth, pdf, template-studio, stripe, storage, documents.
- **`documents`** (6 673 lignes) est découpé en trois fichiers :
  - `documents.routes.ts` (5 062 lignes) ;
  - `documents.service.ts` : chargeurs de données des modèles, numérotation, régénération avec signatures ;
  - `documents.html.ts` : la page publique de vérification.
- **`storage`** importe `LOCAL_UPLOADS_DIR` de `lib/file-store.ts` au lieu d'en avoir une copie. L'expression était identique et dépend de l'environnement, pas de l'emplacement du fichier.
- **Routes seules**, car toutes leurs fonctions lisent `req`/`res` : actes, ag, audit, buildings, content, email, escalation, finance, finance-building, health, ideas, locataires, me, meetings, members, prestataires, publications, reclamations, syndicates, team, transparency, users.

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
| 6 | Domaines restants, dont `documents` (6 673 lignes) | Fait : `routes/` ne contient plus que `index.ts` |
| 7 | Découper les gros fichiers de routes par sous-domaine | Fait pour `documents` : 6 sous-routeurs de 127 à 1 457 lignes, montés dans l'ordre d'origine. À faire : `budget.routes.ts`, `elections.routes.ts`, `marketplace.routes.ts`, `chat.routes.ts` |

**Découpage d'un routeur :** chaque sous-routeur est un bloc contigu du fichier d'origine. `documents.routes.ts` les monte dans le même ordre, car Express choisit la première route qui correspond. Par exemple, `/documents/summary` doit rester avant `/documents/:id`. Le nombre de routes est vérifié avant et après (30 = 30).

**Commentaires de section :** lors des extractions, les en-têtes « // ─── … » séparés de leur fonction par une ligne vide étaient restés dans les routes. Ils ont été recopiés au-dessus des fonctions concernées dans les services (21 cas). Ils ne sont retirés des routes que lorsqu'ils n'y titrent plus rien.

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
