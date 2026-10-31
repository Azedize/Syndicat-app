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

## `lib/` aujourd'hui
| Catégorie | Fichiers |
|---|---|
| Infrastructure | logger, email/, outbound, objectStorage, objectAcl, file-store, file-signature, scheduler, paginate, route-error, rate-limit-profile, sequences |
| Accès et périmètre | access, scope, syndicate-filter, document-access, file-access |
| Règles métier partagées | allocation, allocation-store, charge-time, claims, finance-metrics, funds-calls, payment-reference, reconciliation, treasury, units, bank-details, contact |
| Jobs planifiés | contract-expiry, document-expiry-job, document-retention-job, election-reminders, mandate-expiry, otp-retention, subscription-reminders, retention, debt-escalation |
| Notifications et documents | notify, notification-texts, documentPdf (5 609 lignes), audit |
| Intégrations | stripeClient, stripeWebhook, zimsend.service |

## Cartographie proposée pour la suite
| Étape | Déplacement | Pourquoi |
|---|---|---|
| 1 | `routes/budget.ts` `resolveOwnerUserId` → `modules/budget/budget.service.ts` | importé par `routes/allocation.ts` |
| 2 | `routes/document-library.ts` `assertDeletable` → `modules/documents/…service.ts` | importé par `routes/documents.ts` |
| 3 | Jobs de `lib/` → `src/jobs/` | séparer les tâches planifiées de l'infrastructure |
| 4 | `stripeClient`, `stripeWebhook`, `zimsend.service` → `src/integrations/` | fournisseurs externes au même endroit |
| 5 | Domaines par taille croissante : parking, ideas, publications… puis finance, treasury, documents | 50 fichiers de routes sur 53 accèdent directement à la base |

## Points connus
- `routes/documents.ts` (6 673 lignes) et `lib/documentPdf.ts` (5 609 lignes) sont les plus gros fichiers du dépôt.
- 147 variables ou imports jamais lus (`tsc --noUnusedLocals`).
- **Incohérence de règle (non corrigée, décision métier) :** `computeSubscriptionStatus` (affichage) et `isWritableSubscription` (blocage d'écriture) ne calculent pas le statut de la même façon. Exemples :
  - un abonnement « grace » dont la date de grâce est passée s'affiche « grace » mais les écritures sont refusées ;
  - un essai sans date de fin s'affiche « trial » mais n'est pas inscriptible.
- `lib/api-zod` ne contient qu'un schéma ; les validations Zod sont écrites dans 35 fichiers de routes.
