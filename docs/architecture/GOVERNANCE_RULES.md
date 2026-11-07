# Règles électorales, démissions et réinitialisation du mot de passe

Version du 2026-11-07. Ce document décrit ce que le code applique. Il ne vaut pas avis juridique : les points marqués **À valider** doivent être confirmés par un professionnel du droit marocain avant la mise en production.

**Source juridique :** loi 18-00 relative au statut de la copropriété des immeubles bâtis, modifiée et complétée par la loi 106-12, dans le texte consolidé publié par l'ANCFCC ([PDF](https://www.ancfcc.gov.ma/media/8849/dahir-n-1-02-298-du-25-rejeb-1423-3-octobre-2002-portant-promulgation-de-la-loi-n-18-00-relative-au-statut-de-la-copropri%C3%A9t%C3%A9-des-immeubles-b%C3%A2tis-tel-qu-il-a-%C3%A9t%C3%A9-modifi%C3%A9-et-compl%C3%A9t%C3%A9.pdf)). Le texte a été lu le 2026-11-06. Je n'ai pas vérifié s'il a été modifié depuis.

## 1. Ce que dit la loi, et ce que le code en fait

| Article | Contenu (résumé) | Application dans MIZAN |
|---|---|---|
| 16 decies, al. 1 | Chaque copropriétaire dispose d'un nombre de voix égal à sa quote-part. | Pondération `quote_part` : les voix sont la somme des tantièmes des lots détenus aujourd'hui, multipliés par la part de propriété (`voicesOf`). |
| 16 decies, al. 1 (suite) | Les voix d'un copropriétaire qui dépasse la moitié des voix des autres sont réduites. | **Non appliqué. À valider** : la formulation (« réduit à la moitié des voix dont dispose l'ensemble des propriétaires ») admet plusieurs lectures. |
| 16 decies, al. 3 et 4 | Un mandataire représente au plus 3 copropriétaires, totalisant au plus 10 % des voix, par mandat écrit. | Plafond de 10 % des voix appliqué aux scrutins pondérés (`PROXY_VOICES_LIMIT`). La règle interne existante, au plus 2 pouvoirs par mandataire, est plus stricte que la loi : elle est conservée. |
| 17 | L'assemblée générale élit son président parmi ses membres. Le syndic et son adjoint ne peuvent pas la présider. | Type `ag_president` : un siège. Un titulaire d'un mandat de syndic ou d'adjoint, ou un compte `syndicate_admin`, ne peut pas se porter candidat (`SYNDIC_CANNOT_PRESIDE`). |
| 18 | Quorum : la moitié des copropriétaires. À défaut, une seconde réunion sous 30 jours décide sans quorum. | Le quorum existant (en % des électeurs) est conservé. La seconde réunion sans quorum n'est pas modélisée. |
| 19 et 21 | Syndic et adjoint désignés à la majorité des trois quarts des voix des copropriétaires, pour 2 ans renouvelables. À défaut, désignation par le président du tribunal de première instance. | Types `syndic` et `vice_syndic` imposés : 1 siège, 1 choix, pondération par quotes-parts, majorité des 3/4, base « toutes les voix » par défaut. Sans majorité : issue `no_majority`, avec mention de la voie de l'article 19. |
| 26 ter, 27, 27 ter | Démission du syndic, intérim par l'adjoint, passation, démission de l'adjoint. | Procédure `mandate_resignations` (§ 4). |
| 27 bis | Révocation du syndic et de l'adjoint par l'assemblée, à la même majorité. | La révocation « administrative » d'un mandat est refusée pour ces deux fonctions (`REVOCATION_BY_GENERAL_ASSEMBLY`). |
| 29 | Le conseil syndical n'existe de plein droit que pour un ensemble immobilier géré par plusieurs syndicats. | Les élections « conseil » et « comités » existantes restent des **règles internes** configurables. |

La loi ne dit rien des égalités. La règle appliquée est celle du propriétaire du produit (§ 2).

## 2. Égalités

1. Égalité pour le ou les derniers sièges au premier tour : issue `runoff_required`. Les candidats élus sans ambiguïté reçoivent leur mandat. Un **second tour** est créé en brouillon : il ne comprend que les candidats à égalité et les sièges en jeu, et garde les règles du premier tour. L'organisateur fixe sa date de fin puis ouvre le vote.
2. Égalité persistante au second tour : issue `deliberation_required`, statut `deliberation_required`. **Personne n'est désigné.** L'organisateur peut préparer un nouveau scrutin (`schedule_new_ballot`), avec de nouvelles candidatures et un lien vers l'élection précédente.
3. Personne ne départage, pas même le syndic. L'ancien paramètre `tiebreakWinnerIds` est refusé (`TIEBREAK_NOT_ALLOWED`).
4. Conseil (`board`) : les fonctions suivent le classement. Deux élus à égalité de voix ne reçoivent ni la présidence ni la vice-présidence : ils sont membres, et la fonction doit être attribuée par un vote distinct.

Les résultats et l'historique sont conservés : bulletins, reçus, élection parente et `outcome_details`.

## 3. Plusieurs sièges, voix pondérées

- `ballot_mode` : `single`, un candidat par bulletin, ou `multiple`, jusqu'à `seats_count` candidats distincts. Un bulletin peut en choisir moins. Les doublons sont refusés.
- `weighting` : `per_voter`, une voix par bulletin, ou `quote_part`, les voix du copropriétaire. Les locataires n'ont pas de quote-part : un vote pondéré leur est fermé.
- **Bulletins et voix sont comptés à part.** `candidates.votes` compte les bulletins et `candidates.voices` additionne les voix. Le poids n'est jamais enregistré sur le bulletin : une quote-part rare permettrait d'identifier son auteur.
- Méthodes de majorité : `simple_majority` (majorité relative), `absolute_majority` (plus de `majority_percent` de la base) et `three_quarters` (au moins 75 % de la base). La base (`majority_base`) est soit `votes_cast`, les voix exprimées, abstentions comprises, soit `all_voices`, les voix de tous les électeurs, figées à la clôture.
- Les calculs se font en entiers, avec 4 décimales et sans arrondi flottant (`toUnits`).

| Type | Sièges | Choix | Pondération | Majorité | Nature |
|---|---|---|---|---|---|
| `syndic` | 1 (imposé) | 1 | quotes-parts (imposé) | 3/4 (imposé) | légale |
| `vice_syndic` | 1 (imposé) | 1 | quotes-parts (imposé) | 3/4 (imposé) | légale |
| `ag_president` | 1 (imposé) | 1 | au choix | au choix | légale pour l'exclusion du syndic ; majorité **À valider** |
| `members`, `board`, comités | au choix | jusqu'au nombre de sièges | au choix | au choix | interne |
| `special` (personnalisée) | au choix | au choix | au choix | au choix | interne |

**À valider :**
- La base des « trois quarts des voix des copropriétaires » : toutes les voix (lecture littérale, valeur par défaut) ou celles des présents et représentés (art. 18 al. 3). L'organisateur peut choisir `votes_cast`.
- La validité d'un vote en ligne hors d'une assemblée générale tenue selon les articles 16 à 17, avec convocation, feuille de présence et procès-verbal signé. L'application organise le scrutin, mais la désignation légale relève de l'assemblée.
- La désignation d'un syndic **tiers** (professionnel, art. 19 al. 2) : seuls les copropriétaires peuvent aujourd'hui être candidats dans l'application.

## 4. Démission du syndic ou de son adjoint

`POST /governance/resignations`, par le titulaire du mandat (ou par le syndic gestionnaire, qui consigne une démission reçue par écrit) :

- le mandat passe à `resigned` ; il n'est jamais supprimé ;
- la date de notification est enregistrée et l'**échéance de l'assemblée** fixée à notification + 30 jours ;
- syndic : l'adjoint en fonction assure l'**intérim** (art. 27) ; sans adjoint, l'escalade `no_deputy` est enregistrée ;
- tous les copropriétaires sont informés (alerte traduite, envoyée à tous) ;
- passation à l'adjoint (art. 26 ter) : documents, archives, registres, situation de trésorerie, biens, liquidités, cochés par le démissionnaire, l'adjoint ou le syndic gestionnaire ;
- l'assemblée générale est rattachée, avec un avertissement si elle se tient après les 30 jours ;
- clôture avec le successeur, c'est-à-dire un mandat actif de la même fonction créé après la notification ; ou constat que l'assemblée n'a désigné personne : escalade `no_successor`, qui renvoie à la voie de l'article 19 ;
- une seule démission ouverte par mandat (index unique) ; chaque étape est inscrite au journal d'audit.

L'ancienne démission « en un clic » et la révocation administrative restent disponibles pour les autres fonctions.

**À valider :**
- La procédure exacte en cas d'absence d'adjoint, ou de refus de passation : référé, art. 26 ter al. 4. L'application signale ces situations, mais n'engage aucune démarche.
- L'élection d'urgence automatique après une démission, qui reste non décidée (test `election-audit` S7).

## 5. Réinitialisation du mot de passe

| Exigence | État |
|---|---|
| Validité au plus 15 minutes | Code valable 10 minutes. |
| Usage unique | Mise à jour conditionnelle (`used_at IS NULL`) dans la transaction. Deux utilisations simultanées : une seule réussit. |
| Nouveau code = anciens invalidés | Oui, avec un verrou par adresse : les demandes parallèles laissent un seul code ouvert. |
| Réussite = tous les jetons invalidés | **Ajouté** : les autres codes ouverts et les anciens liens de réinitialisation sont fermés. |
| Stockage haché | Codes en bcrypt, anciens liens en SHA-256. |
| Génération sûre | `crypto.randomInt`. |
| Tentatives répétées | 5 essais par code, 5 codes par heure et par adresse, limiteur de débit sur les routes d'authentification. |
| Pas d'énumération des comptes | Réponse identique et immédiate, que le compte existe ou non. |
| E-mail après modification | Envoyé après la validation de la transaction. |
| Sessions | Les refresh tokens étaient déjà révoqués. **Ajouté** : `users.password_changed_at` (migration 0019). Tout jeton d'accès émis avant la modification est refusé à la requête suivante (`SESSION_PASSWORD_CHANGED`), pour une réinitialisation comme pour un changement depuis le profil. L'application déconnecte alors l'utilisateur. |

## 6. Migrations

- `0019_password_changed_at` : ajoute une colonne nullable.
- `0020_election_rules_resignations` : ajoute des colonnes à `elections`, `votes` et `candidates`, et crée la table `mandate_resignations`. Les élections existantes gardent leur comportement : un choix par bulletin, une voix par électeur, premier tour.

Les deux migrations sont additives. Les instructions pour les annuler figurent en commentaire dans chaque fichier SQL. Elles sont appliquées à `syndycat_test` ; elles ne sont **pas** appliquées à `syndycat_global_cps`.

## 7. Organisation de la copropriété (migration 0021)

La recherche juridique et le comparatif sont dans `docs/research/SYNDICATE_STRUCTURE_BENCHMARK.md`.

### Modèle

`org_structures` (une par copropriété, brouillon puis active) → `org_components` (organes légaux, comités, composantes personnalisées) → `org_positions` (intitulé, responsabilités, droits) → `org_assignments` (personne, titulaire ou suppléant, dates, motif de fin, remplacement, décision d'assemblée).

À côté :
- `org_tasks` : tâches, recommandations au syndic avec sa réponse, rapports ;
- `org_structure_versions` : un instantané à chaque activation, avec la décision d'assemblée qui l'a motivée ;
- le journal d'audit : actions `ORG_*`.

Une affectation **ne modifie jamais** `users.role`.

### Rôles et responsabilités

| Composante | Nature | Titulaires désignés par | Peut être supprimée ou close ici |
|---|---|---|---|
| Assemblée générale | légale | tous les copropriétaires | non |
| Syndic | légale | l'assemblée (élection de type `syndic`) | non |
| Syndic adjoint | légale | l'assemblée (élection de type `vice_syndic`) | non |
| Président et secrétaire de séance | légale, liée à la réunion | l'assemblée, à chaque réunion | — (affichés, pas d'affectation) |
| Conseil syndical | légale pour un ensemble immobilier à plusieurs syndicats seulement | — | oui (comité) |
| Comités financier, technique, sécurité, communication, vie sociale, espaces verts, juridique, audit, stationnement, référents d'immeuble, personnalisés | internes | le syndic gestionnaire (règle **à confirmer**) | close à tout moment ; suppression seulement si jamais utilisée |

### Droits

| Action | Syndic gestionnaire | Responsable de comité (par défaut) | Membre de comité (par défaut) | Résident |
|---|---|---|---|---|
| Créer, modifier, activer l'organisation | ✔ | ✘ | ✘ | ✘ |
| Créer un comité, un poste ; affecter, remplacer, clore | ✔ | ✘ | ✘ | ✘ |
| Voir l'organisation active | ✔ | ✔ | ✔ | ✔ (selon la visibilité de chaque comité) |
| Voir les tâches du comité (`tasks.view`) | ✔ | ✔ | ✔ | ✘ |
| Créer et confier des tâches (`tasks.manage`) | ✔ | ✔ | ✘ | ✘ |
| Recommander au syndic (`recommendations.create`) | ✔ | ✔ | ✔ | ✘ |
| Rapport d'activité (`reports.create`) | ✔ | ✔ | ✘ | ✘ |
| Consulter les finances ou les incidents (`finance.view`, `maintenance.view`) | ✔ | selon le comité | selon le comité | ✘ |
| Décider d'une recommandation | ✔ | ✘ | ✘ | ✘ |
| Approuver une dépense, payer, publier une décision officielle, convoquer l'assemblée | selon son rôle légal (inchangé) | **jamais par le comité** | **jamais par le comité** | ✘ |

Les droits d'un poste sont choisis dans la liste fermée de `org.catalog.ts`. Tout pouvoir réservé est refusé (`RESERVED_POWER`). Un intitulé « syndic » ou « syndic adjoint » est aussi refusé pour un poste de comité (`LEGAL_TITLE`).

Ces droits n'ouvrent que l'espace du comité. Leur usage dans d'autres écrans (par exemple, permettre au comité communication de publier une annonce) n'est **pas** branché : c'est une décision métier.
