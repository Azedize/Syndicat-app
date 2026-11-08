# MIZAN — État de préparation avant production (mission 3, 8 novembre 2026)

Ce rapport fait suite à `reports/full-user-testing-report.md` (mission 1) et `reports/real-world-acceptance-testing.md` (mission 2, complété en mission 3). Les décisions à prendre sont détaillées dans `reports/business-decisions-pending.md`.

## Verdict : PRÊT POUR UNE BÊTA PRIVÉE, PAS POUR LA PRODUCTION

**Ce qui justifie la bêta privée :**
- les parcours essentiels ont été joués à l'écran sur Android, entre plusieurs comptes réels de la base de test ;
- les parcours qui envoient un e-mail (inscription, mot de passe oublié, invitation) sont validés, messages et effets compris ;
- l'isolation entre copropriétés et les droits des 10 rôles sont vérifiés automatiquement (`acceptance-roles`, `idor-scan`, `rbac-regression`) ;
- les écritures comptables sont cohérentes (un paiement validé = une écriture au grand livre) ;
- aucune erreur sous charge locale jusqu'à 700 utilisateurs simultanés.

**Ce qui empêche une bêta publique ou la production :**

| Blocage | Pourquoi c'est bloquant |
|---|---|
| iOS jamais exécuté | 15 branches propres à iOS et 86 fenêtres « pageSheet » non vues ; aucune machine macOS disponible |
| Aucun téléphone réel, aucun build de production | Seuls l'émulateur et Expo Go ont été utilisés (notifications push, appareil photo, stockage, performances réelles non vérifiés) |
| Paiements réels et abonnements | Aucune transaction réelle ; pas de renouvellement automatique ; annulation, prorata et limites des formules non définis (décisions 3 à 5) |
| 7 décisions métier et 3 points complémentaires ouverts | Droits du président, abonnements, invitations sans expiration, plusieurs présidents possibles |
| Limite de 500 requêtes par minute et par adresse IP | Risque de blocage collectif derrière une IP d'opérateur mobile partagée |
| Capacité d'un seul processus Node | À 300 utilisateurs actifs en continu, p95 au-delà d'une seconde (voir Performance) |

## Chiffres

| Mesure | Mission 2 | Mission 3 |
|---|---|---|
| Rôles vérifiés à l'écran | 9 sur 10 | 10 sur 10 (org_staff ajouté) |
| Défauts mineurs de la mission 2 | 11 restants | 8 corrigés et revérifiés, 3 documentés (traduction des erreurs serveur, arabe dans les PDF, preuve ouverte dans le navigateur) |
| Nouveaux défauts trouvés en mission 3 | — | 11 : 7 corrigés, 1 non reproduit (artefact de l'outil de test), 3 renvoyés aux décisions métier |
| Parcours e-mail validés | 0 (bloqués) | 3 (inscription, mot de passe oublié, invitation) |
| Suites automatiques | 54 sur 54 | 54 sur 54 (après correction d’une régression du faux SMTP introduite pendant la mission) |
| Corrections de mission 1 retirées le 7 novembre | non réappliquées | toujours non réappliquées, en attente de votre décision |

## État des parcours

| Parcours | État | Preuve |
|---|---|---|
| Connexion, déconnexion, raison de la déconnexion forcée | VALIDÉ | Compte désactivé : « Your account is disabled. Contact your syndic. » à l'écran |
| Inscription avec code e-mail | VALIDÉ (faux SMTP) | Code faux refusé, code juste accepté, compte vérifié, copropriété créée une seule fois malgré un double appui |
| Code SMS de l'inscription | PARTIEL | Code injecté en base : l'envoi par SMS n'a pas été essayé, il reste coupé en test |
| Mot de passe oublié | VALIDÉ (faux SMTP) | Réponse neutre, code reçu, ancien mot de passe 401, nouveau 200, code réutilisé refusé, e-mail « mot de passe modifié » reçu |
| Invitation de l'équipe | VALIDÉ (faux SMTP) | E-mail dans la langue de l'invitant, rôle et copropriété justes, changement obligatoire du mot de passe |
| Assistant de création de copropriété | VALIDÉ | Secteurs et textes d'aide traduits ; l'assistant d'équipe saute les rôles déjà pourvus |
| Paiement résident et validation par le trésorier | VALIDÉ (mission 2) | Reçu émis, écriture au grand livre |
| Réclamation de bout en bout | VALIDÉ (mission 2) | — |
| Annonce urgente et accusé de lecture | VALIDÉ (mission 2) | — |
| Société de syndic, portefeuille et changement de copropriété | VALIDÉ | Missions 2 et 3, y compris org_staff (4 copropriétés sur 5, conformément à la règle du serveur) |
| Abonnement : souscription par virement simulé | VALIDÉ (simulation) | `acceptance-subscriptions` |
| Abonnement : paiement réel, renouvellement, prorata | NON TESTÉ | Aucune transaction réelle ; règles non définies |
| iOS | NON TESTÉ | Pas de macOS |
| Téléphone réel, build de production | NON TESTÉ | — |

## Finances (base de test, lecture seule)

- Chaque paiement validé a exactement une écriture au grand livre. Le paiement en deux fois (P1-04, 2026-T1) a deux écritures, pour 47,54 au total, ce qui est correct.
- Aucun numéro de reçu en double dans une même copropriété. Les 686 doublons apparents sont entre copropriétés, qui numérotent chacune de leur côté.
- Aucun appel de fonds payé au-delà de son montant.
- Il reste 4 écarts, tous sur d'anciennes lignes de démonstration (adf_1, adf_6, adf_7, adf_10). Ils sont à nettoyer avec votre accord ; rien n'a été modifié.

## Performance (local uniquement, jamais la production)

Script : `scripts/src/load-test.ts`. Il refuse de s'exécuter hors de l'API locale et de `syndycat_test`.

Conditions :
- 416 comptes réels de 54 copropriétés ;
- 6 lectures par boucle, sans pause ;
- 30 secondes par palier.

| Utilisateurs simultanés | Débit | p50 | p95 | Erreurs |
|---|---|---|---|---|
| 100 | 343 req/s | 268 ms | 467 ms | 0 |
| 300 | 373 req/s | 763 ms | 1 195 ms | 0 |
| 700 | 358 req/s | 1 840 ms | 2 990 ms | 0 |

**Lecture :**
- le débit plafonne autour de 360 requêtes par seconde, limité par un seul processus Node et un pool de 10 connexions PostgreSQL (au plus environ 20 connexions observées) ;
- un usage réel (une action toutes les 10 à 20 secondes par personne) représente 35 à 70 requêtes par seconde pour 700 personnes, ce qui reste dans la capacité mesurée.

**Recommandations, non appliquées :** plusieurs processus (PM2 en mode cluster), réglage du pool, journaux moins verbeux. Ces changements de configuration du serveur attendent votre validation.

## Sécurité

- Aucun fichier `.env` ni aucun secret suivi par Git.
- Les clés Firebase de `google-services.json` et `GoogleService-Info.plist` sont publiques par conception, mais elles doivent être restreintes dans la console Google.
- La session est contrôlée côté serveur à chaque requête : compte désactivé, rôle retiré, mot de passe changé ailleurs. Le message correspondant s'affiche maintenant dans l'application.
- Le faux SMTP de test (`EMAIL_SINK=on`) ne s'active que si l'environnement n'est pas la production et que l'hôte SMTP est en boucle locale. Les adresses réservées restent marquées « non joignables » en base, même sous le faux SMTP.

## iOS : liste d'essais à faire sur un Mac ou un iPhone

- Les 15 branches `Platform.OS === "ios"` :
  - assemblée générale ;
  - visionneuses de documents et de PDF ;
  - recherche ;
  - éditeur et studio de modèles ;
  - barre d'onglets avec flou (BlurView).
- Les 86 fenêtres modales `pageSheet` (glisser pour fermer, clavier).
- Les notifications push (APNs), l'appareil photo et la galerie pour les preuves de paiement, l'ouverture et le partage de PDF.
- L'arabe de droite à gauche, la taille de police dynamique et les zones de sécurité (encoche, Dynamic Island).

## Ce qui reste à faire avant une bêta publique

1. Trancher les décisions de `business-decisions-pending.md`.
2. Exécuter la liste iOS et tester sur au moins un téléphone Android réel, avec un build de production.
3. Brancher un prestataire de paiement en mode bac à sable et définir le renouvellement des abonnements.
4. Revoir la limite de requêtes par IP et le déploiement en plusieurs processus.
5. Traduire les messages d'erreur du serveur et corriger l'arabe dans les PDF.
6. Décider du sort des corrections de mission 1 retirées.
