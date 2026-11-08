# MIZAN — Recette en conditions réelles (mission 2, 8 novembre 2026)

Suite de `reports/full-user-testing-report.md` (mission 1). Les essais déjà réussis n'ont pas été refaits.

**Environnement :**
- émulateur Android Pixel 10 Pro (API 37), application dans Expo Go, et non dans un fichier de production ;
- API de test sur le port 5056, base `syndycat_test`.

**Non testé :** iOS, téléphone réel, build de production.

**Preuves :** captures d'écran dans le dossier temporaire de session, état de la base (requêtes), réponses de l'API et journaux des suites automatiques.

## 1. Rôles réellement présents

| Rôle | Où il est défini | Comptes en base | Testé à l'écran | Testé par l'API |
|---|---|---|---|---|
| super_admin (plateforme) | `users.role` | 3 | oui | oui |
| syndicate_admin (syndic) | `users.role`, `syndicate_memberships` | 51 | oui | oui |
| president | `users.role` | 61 | oui | oui |
| treasurer | `users.role` | 61 | oui | oui |
| secretary | `users.role` | 46 | oui | oui |
| committee_member | `users.role` | 130 | oui | oui |
| member (copropriétaire) | `users.role` | 467 | oui | oui |
| tenant (locataire) | `users.role` | 273 | oui | oui |
| org_admin (société de syndic) | `organization_members` | 29 | oui | oui |
| org_staff (gestionnaire de société) | `organization_members` | 14 | non | oui |

Il n'existe pas de rôle « administrateur de plateforme » distinct du super admin.

Statuts de compte présents : active (953), pending (80), inactive (43), suspended (16).

## 2. Résumé

| Mesure | Valeur |
|---|---|
| Rôles identifiés | 10 |
| Profils testés à l'écran | 9 (org_staff seulement par l'API) |
| Copropriétés de test utilisées | 9, dont 8 réelles de la base (Riad Salam Anfa 22, la copropriété du président, les 5 de « Copro Conseil » dont Dar Essalam Saïss 52, et une copropriété de la suite de rôles) et des copropriétés jetables créées puis supprimées |
| Écrans du menu balayés, rôle par rôle | 235 ouvertures (9 profils) |
| Scénarios exécutés | 66 |
| Réussis du premier coup | 47 |
| Échoués, puis corrigés et revérifiés | 15 |
| Bloqués | 4 |
| Défauts corrigés | 14 |
| Défauts restants (notés) | 11, plus 7 décisions métier à prendre |
| Parcours complets validés entre plusieurs comptes | 4 (paiement, réclamation, annonce avec accusé, société de syndic) |
| Contrôles de sécurité et d'isolation réussis | 49/49 (suite `acceptance-roles`), 23/23 (`acceptance-subscriptions`), et les suites existantes `idor-scan` et `rbac-regression` |
| Régressions détectées | 1 : une hypothèse de `payment-reference` mise en défaut par un paiement en deux fois ; c'est la suite qui a été corrigée, pas le produit |
| Régression finale | 54 suites sur 54 |

## 3. Matrice des droits observés (lectures dans sa propre copropriété)

Statut HTTP mesuré par la suite `acceptance-roles` :

| Lecture | syndic | président | trésorier | secrétaire | conseil | membre | locataire |
|---|---|---|---|---|---|---|---|
| Trésorerie | 200 | 200 | 200 | 403 | 200 | 403 | 403 |
| Dépenses | 200 | 200 | 200 | 403 | 200 | 403 | 403 |
| Budgets | 200 | **403** | 200 | 403 | 403 | 403 | 403 |
| Journal d'audit | 200 | 200 | 403 | 403 | 403 | 403 | 403 |
| Tableau des réclamations | 200 | 200 | 200 | 200 | 200 | 403 | 403 |
| Appels de fonds | 200 | **403** | 200 | 403 | 403 | 200 | 403 |
| Lots | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| Réunions | 200 | 200 | 200 | 200 | 200 | 200 | 403 |
| Assemblées générales | 200 | 200 | 200 | 200 | 200 | 200 | 403 |
| Élections | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| Documents | 200 | 200 | 200 | 200 | 200 | 200 | 200 |

Les valeurs en gras montrent un président qui lit la trésorerie mais pas le budget ni les appels de fonds : c'est une décision à prendre (section 7).

## 4. Matrice des scénarios

| Profil | Module | Scénario | Résultat | Défaut | Correction | Retest |
|---|---|---|---|---|---|---|
| 9 profils | Menu | Chaque écran proposé par le menu s'ouvre pour ce rôle | FAIL | 5 écrans renvoyaient à l'accueil : support plateforme (président, trésorier, secrétaire, conseil), escalade (trésorier), statistiques (trésorier), alertes juridiques (président, secrétaire), demandes de modèles (secrétaire) ; budget « indisponible » pour le président (refus 403 présenté comme une erreur de connexion) | Menu et raccourcis alignés sur les gardes des écrans et sur le serveur ; nouveau test `menu-guards` (112/112) | PASS |
| Super admin | Plateforme | 15 écrans du menu | FAIL — **plantage** | « Property 'crypto' doesn't exist » à l'ouverture de l'éditeur de modèles, puis l'écran d'erreur restait affiché partout | Identifiant construit sans `crypto` ; règle ajoutée à `native-rules` | PASS (15/15) |
| Tous | Notifications | Notification de sinistre | FAIL | « Claim declared: degat_eau » (code brut) ; catégorie « Error » | Code traduit dans le rendu des notifications ; catégorie « Urgent » | PASS |
| Syndic, membre | Notifications | Notifications de réclamation | FAIL | Texte français figé, quelle que soit la langue | Les 9 notifications de réclamation passent par des modèles traduits (clé et paramètres) ; envoi push dans la langue du lecteur | PASS (API, 19/19 ; à l'écran sur les nouvelles notifications) |
| Membre → trésorier | Charges | Déclarer un acompte avec preuve, puis validation | PASS | 0 et 100 MAD (plus que le reste dû) refusés ; « 20,50 » accepté ; double appui : un seul paiement ; preuve visible par le trésorier ; reçu REC-2026-000191, écriture comptable, notifications aux deux comptes ; solde 47,54 / 23,61 vérifié en base | Ligne de reçu « — · » vide sur un paiement partiel | PASS après correction |
| Membre → syndic → membre | Réclamations | Création avec photo, qualification, affectation, en cours, résolution, confirmation | PASS | Historique complet ; double appui : une seule réclamation | — | — |
| Syndic → membre → syndic | Annonces | Annonce urgente, accusé « lu et compris », compteur | FAIL | Le serveur comptait les accusés mais aucun écran ne les montrait au syndic | Compteur affiché dans le détail de l'annonce (équipe) | PASS (compteur passé à 1) |
| Société de syndic | Portefeuille | Indicateurs, détail impayés et incidents, changement de copropriété, isolation | PASS | Chiffres identiques à la base (5 copropriétés, 203 lots, 116 697,85 MAD) ; 86 lots après le changement | Montants au format français dans l'interface anglaise (mineur) | — |
| Gestionnaire de société | Portefeuille | Ne voit que la copropriété confiée | PASS (API) | — | — | — |
| Sociétés A et B | Isolation | Portefeuille, membres et impayés de l'autre société refusés | PASS (API) | — | — | — |
| Syndic | Session | Rétrogradé en membre pendant la session | PASS (API) | Refusé dès la requête suivante | — | — |
| Membre | Session | Compte suspendu pendant la session | PASS (API et écran) | L'application revient à la connexion, mais sans expliquer pourquoi | — | Noté |
| Membre | Session | Retiré de la copropriété, puis jeton forgé sur l'ancienne | PASS (API) | — | — | — |
| Administrateur de société | Session | Retiré de la société | PASS (API) | — | — | — |
| Super admin | Session | Rétrogradé | PASS (API) | — | — | — |
| Comptes suspendu, inactif, en attente | Connexion | Se connecter | FAIL | « Compte désactivé » en français dans l'interface anglaise, et faux pour un compte en attente | Codes `ACCOUNT_PENDING` / `ACCOUNT_DISABLED` et messages traduits | PASS |
| Membre | Hors ligne | Écran ouvert sans réseau, envoi, retour du réseau | PASS | Données affichées depuis la mémoire ; erreur affichée ; saisie conservée | — | — |
| Membre | Idées | Deuxième idée dans l'année | FAIL | « Impossible de soumettre » sans raison | Code `IDEA_YEARLY_LIMIT` et message explicite | PASS |
| Syndic (jetable) | Abonnement | Souscription → en attente → refus → nouvel essai → confirmation → formule → annulation | PASS (API, 23/23) | Paiement en attente ou refusé : aucune écriture permise ; double confirmation : période inchangée ; le syndic ne peut ni confirmer son propre paiement ni changer de formule | — | — |
| Nouvel utilisateur | Inscription | Validation du formulaire | PASS | Adresse, mot de passe et confirmation refusés avec un message clair | — | — |
| Nouvel utilisateur | Inscription | Création complète | BLOCKED | L'envoi du code exige une vraie boîte mail | — | — |

## 5. Corrections (fichiers)

| Module | Fichier | Cause | Correction |
|---|---|---|---|
| Menu | `artifacts/mobile/constants/menu.ts`, `app/(tabs)/index.tsx`, `app/budget-previsionnel.tsx` | Le menu proposait des écrans que leur garde ou le serveur refusait | Alignement ; test `scripts/src/menu-guards-test.ts` |
| Éditeur de modèles | `artifacts/mobile/app/template-editor.tsx` | `crypto` n'existe pas sous Hermes | Identifiant local ; règle dans `native-rules-test.ts` |
| Notifications | `artifacts/api-server/src/lib/notification-texts.ts` | Code de type de sinistre affiché brut | Libellés des paramètres codés |
| Notifications | `artifacts/mobile/app/notifications.tsx` | Le type `error` affichait « Erreur » pour une urgence | « Urgent » |
| Réclamations | `artifacts/api-server/src/lib/claims.ts`, `modules/claims/claims.routes.ts` | Notifications enregistrées en texte français figé | Modèles traduits ; push dans la langue du lecteur |
| Annonces | `artifacts/mobile/app/annonces.tsx` | Accusés de lecture invisibles | Compteur pour l'équipe |
| Connexion | `modules/auth/auth.routes.ts`, `app/login.tsx` | Refus sans code, message français | Codes et messages traduits |
| Idées | `modules/ideas/ideas.routes.ts`, `app/ideas.tsx` | Limite annuelle non expliquée | Code et message explicite |
| Charges | `artifacts/mobile/app/charges.tsx` | Segment vide sur la ligne de reçu | Segments absents retirés |
| Tests | `scripts/src/payment-reference-test.ts` | Hypothèse « une écriture par référence » | Choix d'une charge payée en une fois |

Nouvelles suites :
- `acceptance-roles` (49 contrôles) ;
- `acceptance-subscriptions` (23 contrôles) ;
- `menu-guards` (112 entrées).

## 6. Défauts restants (non corrigés)

| Défaut | Gravité | Conséquence | Action recommandée |
|---|---|---|---|
| Déconnexion forcée (suspension, rôle retiré) sans message | BASSE | L'utilisateur ne comprend pas | Afficher la raison renvoyée par le serveur |
| Messages d'erreur génériques hors ligne (« Unable to submit ») | BASSE | La cause « pas de réseau » n'est pas dite | Message réseau commun |
| Portefeuille : montants au format français et « 717.79 MAD » brut | BASSE | Incohérence | Mise en forme commune |
| Journal d'audit : textes du serveur en français avec dates brutes | BASSE | Lecture | Clés traduites |
| Messages d'erreur du serveur en français (de nombreux modules) | MOYENNE | Interfaces anglaise et arabe | Codes et traduction côté application, module par module |
| Ordre des mots arabes dans les PDF générés par pdfmake | MOYENNE | Lecture | Mise en forme bidirectionnelle |
| La preuve de paiement s'ouvre dans le navigateur externe (lien temporaire) | BASSE | Sortie de l'application | Visionneuse intégrée |
| Les corrections de fin de mission 1 (libellés des élections et de la messagerie, « h » des réclamations, libellé du rôle de syndic, accessibilité du bouton d'envoi) ont été retirées de la branche le 7 novembre à 22 h 43 | — | Défauts de nouveau présents | Rien n'a été réappliqué : à confirmer |

## 7. Décisions métier à prendre (rien n'a été changé)

1. **Président :** il lit la trésorerie et les dépenses, mais pas le budget ni les appels de fonds. L'écran du budget lui a été retiré du menu pour ne plus afficher une erreur ; faut-il lui ouvrir le budget côté serveur ?
2. **Équipe :** support plateforme, alertes juridiques et demandes de modèles sont lisibles par toute l'équipe côté serveur, mais leurs écrans sont réservés au syndic. Faut-il les ouvrir ?
3. **Annulation d'un abonnement :** l'accès en écriture est coupé immédiatement (402), même si la période en cours a été payée.
4. **Changement de formule par la plateforme :** il est appliqué immédiatement, sans paiement ni prorata.
5. **Limites des formules :** les colonnes (lots, immeubles, membres) sont vides pour les 3 formules et aucun code ne les applique.
6. **Idées :** une seule idée active par personne et par an. La règle est-elle voulue ?
7. **Inscription :** faut-il un serveur SMTP de test (bac à sable) pour terminer ce parcours en recette ?

## 8. Non testé / bloqué

| Fonctionnalité | Statut | Raison |
|---|---|---|
| Inscription complète, mot de passe oublié, invitation, changement d'e-mail | BLOCKED | Codes envoyés par e-mail ; pas de boîte de test ; SMTP Gmail réel non utilisé |
| Paiement d'abonnement par un vrai prestataire | BLOCKED | Aucun paiement réel ; seule la simulation par virement a été jouée |
| iOS, téléphone réel | BLOCKED | Uniquement émulateur Android et Expo Go |
| Gestionnaire de société (org_staff) à l'écran | NOT_TESTED | Vérifié par l'API seulement |
| Rotation de l'écran, reprise après fermeture forcée | NOT_TESTED | — |
| Espagnol à l'écran | NOT_TESTED | Anglais (cette mission), français et arabe (mission 1) |

## 9. Données laissées dans `syndycat_test`

Créées par les essais, Résidence Riad Salam Anfa 22 :
- le paiement de 20,50 MAD validé (reçu REC-2026-000191) ;
- la réclamation RCL-2026-000015, clôturée.

Tout le reste a été supprimé : comptes et copropriétés jetables, annonce urgente, compte de session.

## 10. État de préparation

**Nécessite encore des corrections et des essais.** L'application n'est pas prête pour une publication en production :
- les parcours qui envoient un e-mail, les paiements réels, iOS et le téléphone réel n'ont pas été vérifiés ;
- sept décisions métier restent ouvertes, dont deux sur les droits et trois sur les abonnements.

---

# Mission 3 — Suite et finalisation (8 novembre 2026)

Synthèse et verdict : `reports/pre-production-readiness.md`. Décisions à prendre : `reports/business-decisions-pending.md`.

## 11. Défauts de la mission 2 : état

| Défaut | État | Vérification |
|---|---|---|
| Déconnexion forcée sans message | CORRIGÉ | La raison renvoyée par le serveur (compte désactivé, mot de passe changé ailleurs, accès modifié) s'affiche sur l'écran de connexion |
| Messages génériques hors ligne | CORRIGÉ | Message réseau traduit commun (`lib/fetchTimeout.ts`, `lib/errorText.ts`) |
| Portefeuille : montants au format français | CORRIGÉ | « 5,258.73 MAD » en anglais |
| Journal d'audit : dates brutes | CORRIGÉ | Dates mises en forme selon la langue |
| Réclamations : format de date | CORRIGÉ | « Dec 11, 2025 » |
| Annonces : audience « Tous » traduite et enregistrée telle quelle | CORRIGÉ | La valeur `all` est enregistrée et les anciennes valeurs traduites sont reconnues |
| Réunions : lieu « À définir » enregistré traduit | CORRIGÉ | « TBD » en anglais |
| Procès-verbaux : erreur de chargement silencieuse | CORRIGÉ | État d'erreur affiché |
| Messages d'erreur du serveur en français | RESTANT | Chantier module par module |
| Arabe dans les PDF (pdfmake) | RESTANT | Mise en forme bidirectionnelle à prévoir |
| Preuve de paiement ouverte dans le navigateur externe | RESTANT | Visionneuse intégrée à prévoir |

## 12. Parcours e-mail, avec le faux SMTP local

Le faux serveur (`scripts/src/mail-sink.ts`) range les messages dans des fichiers et ne relaie rien ; l'API de test 5057 est lancée par `scripts/start-mail-sink-api.ps1`. Le SMTP de production n'a été ni utilisé ni modifié.

| Parcours | Résultat |
|---|---|
| Inscription | Validation du formulaire, code faux refusé, code juste accepté, compte actif et vérifié. L'étape SMS a été simulée en injectant le code en base. La copropriété n'est créée qu'une fois malgré un double appui |
| Mot de passe oublié | Réponse neutre, code reçu en anglais, mot de passe changé, e-mail de confirmation reçu, ancien mot de passe 401, nouveau 200, code réutilisé refusé (`RESET_CODE_INVALID`) |
| Invitation | E-mail dans la langue de l'invitant (il était toujours en français), rôle et copropriété justes, mot de passe provisoire, changement obligatoire |

## 13. Nouveaux défauts trouvés en mission 3

| Défaut | État |
|---|---|
| Invitation toujours rédigée en français | CORRIGÉ (fr, en, ar, es) |
| Assistant d'équipe : propose de nouveau un rôle déjà pourvu, d'où un deuxième président | CORRIGÉ dans l'application ; le serveur l'accepte encore (décision) |
| Assistant de création : secteurs et textes d'aide en français | CORRIGÉ |
| Mention « Twilio Verify » dans le texte de l'étape SMS | CORRIGÉ (texte neutre) |
| Le refus de rafraîchir la session ne disait pas pourquoi | CORRIGÉ (`ACCOUNT_DISABLED`) |
| Code à 6 chiffres : la touche d'effacement ne revient pas à la case précédente | NON REPRODUIT : avec la vraie touche du clavier à l'écran, chaque appui efface le dernier chiffre et revient à la case précédente. Le premier constat venait de la touche simulée par adb |
| Écran de connexion : le même message d'erreur s'affiche trois fois | CORRIGÉ : un message de saisie s'affiche sous son champ, les autres dans le bandeau, chacun une seule fois. Un e-mail mal formé (400) affichait aussi le texte français du serveur ; il donne maintenant « Incorrect email or password. » |
| E-mail de bienvenue des copropriétaires en français seulement | CORRIGÉ : fr, en, ar, es, selon la langue de l'émetteur ; vérifié en arabe avec le faux SMTP |
| Invitations sans expiration, mot de passe provisoire permanent ; plusieurs présidents possibles ; `autoRenew` sans traitement | DÉCISIONS (points complémentaires) |

**Régression introduite puis corrigée pendant la mission :** la première version du faux SMTP empêchait de marquer « non joignables » les adresses réservées créées à travers lui (3 comptes QA). Le passe-droit ne s'applique plus qu'à l'envoi (`deliveryRefused`). Les 3 comptes ont été remis au bon statut. `email-accounts-test` reconnaît les messages reçus par le faux SMTP et vérifie qu'ils ne visent que des adresses de test.

## 14. Rôles, finances, performance, sécurité

- **org_staff à l'écran :**
  - le portefeuille montre 4 copropriétés sur 5, conformément à la règle du serveur ;
  - les actions sont réduites (pas de création de copropriété ni de gestion d'équipe) ;
  - le changement de copropriété fonctionne et l'isolation est respectée.
- **Finances (lecture seule) :** une écriture au grand livre par paiement validé ; aucun reçu en double dans une même copropriété ; aucun trop-perçu. Les 4 écarts restants sont d'anciennes lignes de démonstration (adf_1, adf_6, adf_7, adf_10).
- **Charge (locale) :** aucune erreur jusqu'à 700 utilisateurs simultanés. p95 : 467 ms à 100 utilisateurs, 1,2 s à 300, 3 s à 700. Le débit plafonne vers 360 requêtes par seconde (un seul processus, pool de 10 connexions).
- **Sécurité :** aucun secret suivi par Git ; les clés Firebase sont à restreindre dans la console Google ; la limite de 500 requêtes par minute et par IP est à revoir.

## 15. Non-régression

54 suites sur 54 après correction. La première passe complète donnait 52 sur 54 : `email-step-test` et `email-accounts-test` échouaient, à cause de la régression du faux SMTP décrite à la section 13.

## 16. Données de test ajoutées (base `syndycat_test`, rien de supprimé)

- **Copropriété « Residence QA Acceptance » :**
  - qa.salma.0811@example.test, syndic ;
  - qa.karim.0811@example.test, président ;
  - qa.nadia.0811@example.test, deuxième présidente créée avant la correction de l'assistant.
- **Copropriétaire « Youssef QA »** (qa.youssef.0811@example.test), avec son compte, dans la même copropriété : créé pour vérifier l'e-mail de bienvenue en arabe.
- **Journal des e-mails :** 10 messages reçus par le faux SMTP. Leurs copies sont dans `scripts/.seedgen/mail-sink/`, ignoré par Git.
