# MIZAN — Décisions métier en attente (8 novembre 2026)

**Statut :** aucune de ces décisions n'a été appliquée. Chacune attend votre approbation explicite. Les constats viennent du code et des essais des missions 2 et 3 (`reports/real-world-acceptance-testing.md`).

Le cadre juridique cité est la loi 18-00 modifiée par la loi 106-12. Rien n'a été inventé : quand le texte ne tranche pas, c'est indiqué.

---

## Décision 1 — Droits du président en finances

**Situation actuelle (code) :**

| Lecture | Rôles autorisés |
|---|---|
| Trésorerie, dépenses | syndic, trésorier, président, membre du conseil (`TREASURY_READ_ROLES`, `READ_ROLES`) |
| Budget | syndic, trésorier (`requireFinanceAccess`) |
| Appels de fonds | super admin, syndic, trésorier, copropriétaire (`CHARGE_READ_ROLES`) |

**Problème observé :**
- Le président voit les comptes bancaires et les dépenses, mais pas le budget voté en assemblée ni les appels de fonds.
- Le membre du conseil est dans la même situation.
- L'écran du budget, d'abord proposé au président, n'affichait qu'une erreur ; il a été retiré de son menu en mission 2.

**Options :**

| Option | Avantages | Inconvénients |
|---|---|---|
| A. Statu quo | Rien à changer | Incohérent : il voit le compte en banque, pas le budget qui l'explique |
| B. Budget en lecture pour le président (et le conseil) | Cohérent avec la trésorerie ; le conseil syndical contrôle la gestion du syndic | Aucun risque de confidentialité nouveau (même niveau que la trésorerie) |
| C. B + appels de fonds agrégés (totaux, taux de recouvrement, sans détail nominatif) | Contrôle de la gestion sans exposer la dette de chaque voisin | Une vue agrégée à créer côté API |
| D. B + appels de fonds nominatifs | Vue complète | Expose la situation financière individuelle des copropriétaires (loi 09-08) |

**Recommandation :** l'option C. Le budget est un document voté par l'assemblée, sa lecture ne pose pas de difficulté. La dette nominative d'un voisin, elle, n'a pas à être visible par un autre copropriétaire élu, sauf règle contraire du règlement de copropriété.

**Conséquences techniques :**
- ajouter `president` et `committee_member` à la lecture des budgets (sans écriture) ;
- créer une route d'agrégats d'appels ;
- rouvrir l'écran et l'entrée de menu ;
- mettre à jour `acceptance-roles` et `menu-guards`.

**Conséquences pour les utilisateurs :** le président et le conseil peuvent suivre l'exécution du budget.

**Décision en attente :** A / B / C / D.

---

## Décision 2 — Support plateforme, alertes juridiques, demandes de modèles

**Situation actuelle :** le serveur laisse toute l'équipe (président, trésorier, secrétaire, conseil) lire ces trois sources. Les écrans sont réservés au syndic, et leurs entrées ont été retirées du menu des autres rôles en mission 2.

**Matrice proposée :**

| Écran | Syndic | Président | Secrétaire | Trésorier | Conseil |
|---|---|---|---|---|---|
| Support plateforme (tickets envoyés à MIZAN) | lire, créer | lire | — | — | — |
| Alertes juridiques | lire, traiter | lire | lire | — | lire |
| Demandes de modèles de documents | lire, créer | — | lire, créer | — | — |

**Options :**
- **A.** Statu quo : seul le syndic voit ces écrans. Le serveur reste plus ouvert que l'interface, ce qui crée une incohérence sans risque immédiat.
- **B.** Appliquer la matrice : ouvrir les écrans et resserrer le serveur selon cette matrice.
- **C.** Resserrer le serveur au syndic seul, pour l'aligner sur l'interface.

**Recommandation :**
- l'option C si le support plateforme et les modèles sont des outils d'administration ;
- l'option B pour les alertes juridiques, qui intéressent le conseil syndical.

**Conséquences techniques :** le garde de chaque écran, le menu et le contrôle de rôle des routes concernées.

**Décision en attente :** A / B / C (éventuellement par écran).

---

## Décision 3 — Annulation d'un abonnement

**Situation actuelle (vérifiée, `acceptance-subscriptions`) :** l'annulation par le syndic passe le statut à `cancelled`. L'écriture est refusée immédiatement (402), même si la période en cours a été payée.

**Pratiques habituelles des abonnements :**

| Événement | Effet habituel |
|---|---|
| Annulation à la fin de la période | Accès complet jusqu'à `current_period_end`, puis lecture seule ; aucun renouvellement |
| Annulation immédiate | Lecture seule tout de suite ; remboursement au prorata ou non, selon les conditions générales |
| Suspension (impayé, fraude) | Lecture seule, décidée par la plateforme, réversible |
| Expiration (fin de période non renouvelée) | Lecture seule ; les données restent consultables et exportables |

**Recommandation :** par défaut, annulation à la fin de la période. La plateforme garde la possibilité d'annuler immédiatement. Techniquement, cela suppose un champ `cancel_at_period_end` et l'écriture autorisée jusqu'à la fin de la période. Le contrôle d'accès actuel (`isWritableSubscription`) vérifie déjà les dates : il suffit qu'une annulation programmée garde le statut `active` jusqu'à cette date.

**Point lié :** aucun traitement planifié n'exploite le champ `autoRenew`. Il n'y a ni renouvellement automatique, ni passage automatique à `expired` ; l'accès se ferme seulement par la date.

**Conséquences :** une migration additive (une colonne) ; modifier `PUT /subscriptions/:id` ; un texte dans l'écran d'abonnement ; les conditions générales à aligner.

**Décision en attente :** comportement d'annulation, et renouvellement automatique ou manuel.

---

## Décision 4 — Changement de formule

**Situation actuelle :** seule la plateforme peut changer de formule (`PUT /subscriptions/:id`). Le changement s'applique immédiatement, sans paiement ni prorata. Les formules en base : Basique 299, Pro 699, Premium 1 299 (prix sans unité de période en base).

**Scénarios :**

| Scénario | Logique proposée |
|---|---|
| Passage à une formule supérieure | Paiement du prorata (différence × jours restants ÷ jours de la période), puis activation à la confirmation du paiement |
| Passage à une formule inférieure | Pris en compte à la fin de la période (aucun remboursement) |
| Geste commercial (changement gratuit) | Réservé à la plateforme, avec un motif obligatoire inscrit au journal d'audit |
| Demande du syndic | Le syndic choisit ; un paiement est créé si nécessaire (même circuit que la souscription) |

**Recommandation :** cette logique. Elle suppose de savoir si les prix sont mensuels, ce que la base ne dit pas (colonnes `price` et `yearly_price`).

**Conséquences financières :** des factures de prorata et l'intégration au circuit de paiement existant (en attente, confirmé, refusé). Rien n'est à modifier sans votre validation des règles de calcul.

**Décision en attente :** les règles ci-dessus, ou d'autres.

---

## Décision 5 — Limites des formules

**Situation actuelle :** les colonnes `max_buildings`, `max_lots`, `max_members`, `max_users`, `max_documents` et `max_storage_gb` sont vides pour les 3 formules, et aucun code ne les applique.

**Données réelles de la base de test** (61 copropriétés générées) : de 1 à 3 immeubles et de 15 à 86 lots par copropriété ; une société de syndic gère au plus 5 copropriétés.

**Proposition à valider :** ce sont des chiffres de départ à confirmer commercialement, pas des limites appliquées.

| Formule | Immeubles | Lots | Comptes |
|---|---|---|---|
| Basique | 1 | 50 | 75 |
| Pro | 5 | 250 | 400 |
| Premium | illimité | illimité | illimité |

**Règles de dépassement proposées :**
- **Création d'un lot, d'un immeuble ou d'un compte au-delà de la limite :** refus côté serveur (`PLAN_LIMIT_REACHED`, 402), avec un message qui propose la formule supérieure.
- **Après passage à une formule inférieure :** rien n'est supprimé. Les créations sont bloquées tant que le nombre dépasse la limite.
- **Contrôle unique côté serveur,** dans les routes de création ; l'application ne fait qu'afficher le message.

**Décision en attente :** les chiffres et les règles.

---

## Décision 6 — Une idée par personne et par an

**Situation actuelle :** `POST /ideas` refuse une deuxième idée active (non rejetée) par personne et par copropriété dans l'année civile (409). Depuis la mission 2, la raison est expliquée à l'utilisateur.

**Impact :** une personne qui a proposé une idée en janvier ne peut plus rien proposer avant l'année suivante, même si sa première idée a été mise en œuvre.

**Options :**
- **A.** Maintenir la règle.
- **B.** Une seule idée en attente à la fois : une nouvelle devient possible dès que la précédente est acceptée, rejetée ou mise en œuvre.
- **C.** Un plafond par période glissante (par exemple 3 par an).

**Recommandation :** l'option B. Elle évite l'avalanche de propositions sans bloquer les résidents actifs pour un an.

**Décision en attente :** A / B / C.

---

## Décision 7 — SMTP de test

**Préparé en mission 3 (sans toucher à la configuration de production) :**
- `scripts/src/mail-sink.ts` : un faux serveur SMTP sur 127.0.0.1:1025. Il range chaque message dans `scripts/.seedgen/mail-sink/*.eml`, ignoré par Git, et ne relaie jamais rien.
- `scripts/start-mail-sink-api.ps1` : une API de test sur le port 5057 dont les variables SMTP pointent vers ce faux serveur, pour ce seul processus. Le fichier `.env` n'est ni lu pour le courrier, ni modifié.
- Le mode `EMAIL_SINK=on` (`lib/email/deliverability.ts`) n'est accepté que si l'hôte SMTP est en boucle locale et que l'environnement n'est pas la production. Les SMS et les notifications push restent coupés.
- Pour y diriger l'émulateur : `adb reverse tcp:5056 tcp:5057`.

**Vérifié avec ce dispositif :**
- inscription (code reçu, code faux refusé) ;
- mot de passe oublié (code reçu, code réutilisé refusé, ancien mot de passe refusé, nouveau accepté) ;
- invitation (identifiants reçus, changement obligatoire du mot de passe, rôle correct).

**Alternative :** Mailpit ou smtp4dev, plus complets (interface web), mais à installer ou à lancer avec Docker, absent de cette machine.

**Précautions :**
- ne jamais définir `EMAIL_SINK` en production (le serveur l'ignore de toute façon hors boucle locale) ;
- les mots de passe provisoires stockés dans les `.eml` ne servent qu'aux comptes de test ;
- vider le dossier quand il n'est plus utile.

**Décision en attente :** valider ce dispositif comme outil de recette, ou demander Mailpit.

---

## Points complémentaires relevés en mission 3 (à décider aussi)

1. **Plusieurs présidents dans une copropriété :** le serveur accepte d'inviter un deuxième président. L'assistant ne le propose plus depuis la mission 3, mais l'API le permet toujours. La loi prévoit un président du conseil syndical : faut-il imposer l'unicité côté serveur ?
2. **Invitations sans expiration :** le mot de passe provisoire n'expire jamais, et l'invité ne peut ni refuser ni ignorer l'invitation (le compte est actif dès sa création). Recommandation : une expiration de 7 jours et un renvoi possible par le syndic.
3. **Limite de requêtes en production :** 500 requêtes par minute et par adresse IP. Des copropriétaires derrière la même adresse IP d'opérateur mobile (CGNAT) pourraient être bloqués ensemble. Une limite par compte serait à étudier avant la mise en production.
