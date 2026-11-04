# Journal de sécurité

Constats de sécurité et corrections, par date. Chaque entrée indique ce qui
était exposé, ce qui a été changé et le test qui le vérifie. Les suites citées
sont dans `scripts/src/` (commandes dans `docs/development/LOCAL_RUN_COMMANDS.md`).

## 2026-10-18 — Documents et fichiers

### Corrigé

| # | Constat | Gravité | Correction | Vérifié par |
|---|---|---|---|---|
| 1 | Tout fichier téléversé (hors preuves de paiement) était lisible par **n'importe quel compte du même syndicat** connaissant son chemin : bulletins de paie, procurations, mises en demeure, pièces de réclamation, photos de sinistre, pièces jointes de messagerie privée. | Élevée | `lib/file-access.ts` : un fichier est lisible par son auteur, ou selon la fiche qui l'utilise (partagé : logo, avatars, marketplace, candidats, justificatifs de transparence ; conversation : participants ; preuves financières : équipe finance ; bulletin de paie : syndic, trésorier, salarié ; relance : équipe et débiteur ; autres fiches : équipe). Fichier non utilisé : auteur seul. | `documents-library` §9, `documents-security` |
| 2 | `POST /storage/uploads/request-url` + `PATCH /storage/documents/:id/confirm` : n'importe quel compte (résident compris) pouvait créer un document et le **publier à toute la copropriété** (statut « publié » par défaut), sans vérifier que le fichier existait. | Élevée | Création de document refusée (410) ; la confirmation est retirée (410). Les documents passent par `POST /documents/upload`, qui stocke le fichier avant d'enregistrer la fiche. | `documents-library` §10 |
| 3 | `DELETE /storage/documents/:id` supprimait **définitivement** la fiche et le fichier (auteur ou syndic), contournant la conservation légale et les pièces justificatives. | Élevée | Route retirée (410) ; suppression logique uniquement (`DELETE /documents/:id`). | `documents-library` §10 |
| 4 | Purge d'un document (super admin) sans contrôle de la date de conservation, malgré le commentaire du code. | Moyenne | Purge refusée avant `retentionUntil` (409 `RETENTION_ACTIVE`) et pour une pièce justificative. | `documents-library` §6 |
| 5 | Lien de téléchargement GCS signé **1 heure**, transférable et non révocable. | Moyenne | Lien applicatif de 5 minutes lié à une personne, un document et une version ; l'accès actuel est revérifié à chaque usage (compte désactivé, affectation retirée → refus immédiat) ; lien ≠ session. | `documents-library` §4 |
| 6 | Pas de niveau d'accès par document : toute l'équipe voyait tout (attestations personnelles comprises), et un document « résident » n'était défini que par sa catégorie. | Moyenne | Audiences syndic / conseil / copropriétaires / résidents / lot / personnel (`lib/document-access.ts`), appliquées à la liste, au détail, aux fichiers, aux versions, aux commentaires et aux signataires. | `documents-library` §3 |
| 7 | Les résidents recevaient les métadonnées internes des documents (paramètres de génération, auteur, motifs de rejet) et les chemins de stockage. | Faible | Vue résident filtrée ; chemin de stockage jamais renvoyé par l'API. | `documents-library` §2–3 |
| 8 | Routes de commentaires enregistrées sans préfixe (`/:id/comments`) : injoignables à leur adresse et captant n'importe quel `/<x>/comments`. | Faible | Préfixées `/documents/:id/comments`. | `documents-library` §10 |

### Contrôles en place (vérifiés par les tests)
- Contenu vérifié par signature (magic bytes) ; type et extension stockés
  dérivés du contenu, jamais du nom client ; nom de stockage aléatoire (UUID).
  Bibliothèque : PDF, images, Word, Excel, texte ; archives, vidéos, HTML, SVG
  refusés ; 25 Mo maximum ; envoi interrompu → 400 sans trace.
- Chemins : traversée refusée (`/storage/objects`, `local-docs`) ;
  `Content-Disposition` assaini (RFC 6266) ; `nosniff`, `no-store`,
  `no-referrer` ; CSP `sandbox` pour les fichiers texte.
- Document invisible → 404 (l'existence n'est pas confirmée).
- Stockage indisponible → 503, rien n'est enregistré ; fichier perdu → 404
  `STORAGE_OBJECT_MISSING` avec un message clair.

### Limites connues
- Pas d'analyse antivirus des fichiers (aucun moteur configuré) : la défense
  repose sur la liste blanche de formats et la vérification du contenu.
- Les fichiers Office (docx/xlsx) peuvent contenir des macros : ils sont servis
  en téléchargement, jamais exécutés par le serveur.
- Les anciens appels mobiles vers `/storage/objects/...` restent servis (avec
  le nouveau contrôle d'accès) ; les tickets de fichier de 5 minutes restent
  liés à l'utilisateur, pas au fichier.
- Stockage en production (GCS) non configuré dans cet environnement : seul le
  stockage disque local a été testé.

## 2026-10-18 — Réclamations et incidents

| # | Constat | Gravité | Correction | Vérifié par |
|---|---|---|---|---|
| 1 | L'ancien module « réclamations » (gabarit RH : salaire, harcèlement…) n'était pas rattaché à une copropriété : un syndic listait et modifiait les réclamations **de tous les syndicats**. Référence tirée au hasard sur 3 chiffres (collisions). | Élevée | Routes retirées (410) ; nouveau module `claims` cloisonné par copropriété, référence séquentielle unique. Table conservée pour l'historique (export des données personnelles). | `claims` §H |
| 2 | `POST /conversations/incident` : un syndic de n'importe quel syndicat pouvait ouvrir une conversation sur n'importe quelle réclamation. | Moyenne | Route retirée (410) ; le suivi se fait dans la réclamation. | `claims` §H |

Contrôles du nouveau module : réclamation visible par son auteur et l'équipe
uniquement (404 sinon) ; lot vérifié (propriétaire / locataire) ; pièces
jointes = fichiers envoyés par la personne dans la copropriété, une seule
réclamation par fichier ; notes, consignes, matériel et coûts internes jamais
renvoyés aux résidents ; responsable = membre de l'équipe ou prestataire de la
copropriété ; transitions contrôlées par rôle ; version attendue sur chaque
écriture (carte périmée → 409 avec l'état enregistré) ; clés d'idempotence.

## 2026-10-19 — Appels de fonds

| # | Constat | Gravité | Correction | Vérifié par |
|---|---|---|---|---|
| 1 | L'escalade automatique des impayés (tâche quotidienne) créait des étapes « mise en demeure » / « action juridique » selon des seuils de mois inventés, et ciblait le propriétaire actuel du lot au lieu des débiteurs à l'émission. | Moyenne (risque juridique et d'erreur de destinataire) | Tâche retirée du planificateur ; remplacée par un rappel factuel unique par obligation échue (montant restant, échéance), sans pénalité. L'outil manuel reste ; ses seuils sont signalés à revoir. | `funds-calls` §D |
| 2 | Définitions du retard différentes selon les écrans (heure UTC du serveur). | Faible | Règle unique : jour local `APP_TIMEZONE`, en retard le lendemain de l'échéance. | `funds-calls` §D |

Contrôles : le compte d'une obligation n'est visible que par ses débiteurs et
l'équipe de la copropriété (404 sinon, y compris pour un syndic d'une autre
copropriété) ; rappels réservés au syndic et au trésorier ; ajustements au
syndic, avec motif, jamais sous le montant payé ; publication et
rapprochement réservés à l'équipe finance.

## 2026-10-19 — Bibliothèque documentaire et documents officiels

| # | Constat | Gravité | Correction | Vérifié par |
|---|---|---|---|---|
| 1 | `GET /documents/:id` répondait 403 pour un document d'une autre copropriété ou hors audience et 404 pour un identifiant inexistant : la différence révélait l'existence d'un document. | Faible | Même réponse 404 dans les trois cas. | `document-library-resident` |
| 2 | Lecteur PDF Android : pdf.js téléchargeait lui-même l'URL signée depuis une page `mizan.ma` (URL injectée sans échappement). | Faible | Nouveau lecteur : fichier téléchargé nativement dans le cache privé, transmis à la WebView en base64 ; aucune URL de document dans la page ; URL échappée dans l'ancien lecteur. | revue de code |
| 3 | Fichiers partagés depuis l'ancien lecteur laissés dans le cache. | Faible | Fichiers supprimés après partage / à la fermeture du lecteur ; cache purgé à chaque changement de copropriété, de rôle ou de compte. | revue de code |
| 4 | PDF générés : « Document certifié — MIZAN.ma » sur tout document (brouillons compris) et « Aucune signature manuscrite n'est requise » sur les factures, sans mécanisme de certification ni règle vérifiée. | Moyenne (allégation trompeuse) | Mention factuelle « Document généré par MIZAN ». | `official-documents` |
| 5 | Facture : TVA 20 % calculée d'office ; attestation de propriété : nationalité, statut juridique, mode d'acquisition inventés par défaut. | Moyenne (données fausses dans un document officiel) | Seules les données réelles sont affichées. | `official-documents` |

## 2026-10-20 — Générateur de données de test

| # | Constat | Gravité | Correction | Vérifié par |
|---|---|---|---|---|
| 1 | Un générateur de données massives peut écrire dans une mauvaise base. | Moyenne (préventif) | `assertDevDatabase()` refuse tout hôte non local, tout nom contenant « prod » et `NODE_ENV=production`, sans option de contournement. | `seedgen` (refus testé) |
| 2 | Comptes de test : mot de passe partagé. | Faible | Haché avec bcrypt (coût 10, comme l’API), jamais écrit en clair en base ; e-mails sur un domaine `.test` réservé ; aucun envoi d’e-mail / SMS / notification / paiement (insertion directe). | `seedgen verify`, revue de code |
| 3 | Nettoyage d’un lancement. | Faible | `cleanup` ne supprime que les lignes rattachées aux marqueurs du lancement (clés étrangères suivies) ; données existantes jamais touchées ; testé sur une graine dédiée sans résidu. | `seedgen cleanup` |

Isolation vérifiée à travers l’API avec les données générées : un syndic, un
trésorier, un copropriétaire et un locataire ne voient que leur copropriété
(25/25 contrôles, `seedgen:api`).

## 2026-10-20 — Refonte des écrans (lot 1)

Pas de faille découverte ; corrections d’alignement entre l’interface et les
droits réels de l’API (le serveur restait l’autorité) :

- Annonces : bouton de création et suppression affiché au président et au
  secrétaire alors que l’API ne l’accepte que du syndic et du super admin
  (403) — aligné.
- Travaux : affectation / rapport / validation affichés au président et au
  membre du conseil alors que l’API exige `requireAdmin` — alignés.
- Mon lot : pour un rôle d’équipe, l’onglet « charges » listait les appels de
  toute la copropriété comme s’ils étaient les siens (données autorisées pour
  ce rôle, mais présentées à tort) — limité aux lots de la personne.

## 2026-10-20 — Réinitialisation des données de test

| # | Constat | Gravité | Correction | Vérifié par |
|---|---|---|---|---|
| 1 | Le nettoyage d'un lancement pouvait laisser des lignes rattachées par une colonne sans clé étrangère (ex. commandes, préférences, journal d'audit) : condition évaluée après la suppression du parent. | Faible (données de test résiduelles) | Ensemble à supprimer figé avant la première suppression ; résidus supprimés uniquement sur preuve d'origine, les autres signalés. | comptage avant / après, `seedgen reset` |
| 2 | Une réinitialisation supprime massivement. | Moyenne (préventif) | Refus hors base locale ; `--dry-run` ; sauvegarde `pg_dump` complète + fichiers avant toute suppression ; transaction unique ; données de démonstration et comptes non générés jamais visés. | `seedgen run --dry-run`, `seedgen run` |
| 3 | Les sauvegardes contiennent une copie complète de la base. | Moyenne | `scripts/.seedgen/` ignoré par git ; la chaîne de connexion n'est ni affichée ni enregistrée (mot de passe transmis à pg_dump par l'environnement). | revue de code, `git check-ignore` |

Permissions des fichiers générés vérifiées à travers l'API : un copropriétaire
télécharge l'avis de son lot et son reçu ; l'avis d'un autre lot, le reçu d'une
autre personne et les factures fournisseurs lui sont refusés ; le syndic d'une
autre copropriété n'accède à aucun document ni fichier.

## 2026-10-21 — Audit technique

| # | Constat | Gravité | Correction | Vérifié par |
|---|---|---|---|---|
| 1 | Marketplace : téléphone, e-mail du vendeur, note de modération, modérateur et réservataire renvoyés à tout utilisateur de la plateforme. | Élevée (données personnelles, loi 09-08) | Filtre par lecteur selon les préférences de contact du vendeur ; données internes réservées au vendeur et au modérateur. | `audit-fixes`, `idor` |
| 2 | Stripe Checkout : idempotence inopérante, abonnements en attente en double, lignes orphelines, blocage après expiration. | Moyenne | Verrou par copropriété, clé stable transmise à Stripe, échec / expiration / abandon traités. | revue de code (pas de clés de test) |
| 3 | Moyens de paiement non intégrés (PayPal, passerelle marocaine) proposés dès que des clés existaient. | Moyenne (paiement impossible à finaliser) | Désactivés tant qu'aucune intégration n'existe. | revue de code |
| 4 | Textes juridiques affirmant des garanties inexistantes (SOC 2, AES-256 au repos, 2FA, tests d'intrusion, horodatage qualifié, suppression de compte). | Moyenne (allégation trompeuse) | Remplacés par les mesures réellement en place ; mention « à valider par un juriste ». | revue de code |

Scan IDOR : 51 routes à identifiant appelées avec l'identifiant d'une
ressource d'une autre copropriété (syndic, copropriétaire) et d'un autre
copropriétaire pour les ressources personnelles : 113 / 113 refus.

## 2026-10-21 — Scripts de données de test limités aux bases locales

`scripts/src/election-audit-seed.ts` et `scripts/src/seed.ts` créent des comptes au mot de passe commun `password123` ; le premier supprime aussi le lancement précédent. Rien ne les empêchait de viser une base distante. Les deux appellent désormais `assertDevDatabase()` avant toute écriture : hôte local, aucun marqueur « prod », pas de `NODE_ENV=production`, et pas d'option de contournement.

Testé : la base locale `syndycat_global_cps` est acceptée, un hôte distant est refusé.

Constat sans correction : `seed.ts` contient une adresse `@gmail.com` (`sara.bouzid@gmail.com`, ligne OTP de démonstration) qui pourrait appartenir à une personne réelle ; aucun envoi ne lui est adressé par le script, mais elle devrait être remplacée par un domaine réservé (`.test`).

## 2026-10-24 — Fichiers de la base de travail écrasés par une génération de test (corrigé)

- **Cause :** la nouvelle base `syndycat_test` utilisait le même dossier de fichiers que `syndycat_global_cps` (`artifacts/api-server/uploads`). Avec la même graine (20261019), le générateur produit les mêmes noms de fichiers. Sous Windows, l'arrêt de la tâche n'a pas arrêté le processus enfant, qui a continué d'écrire.
- **Effet :** 5 707 fichiers écrits, dont 740 portant le nom d'un fichier référencé par la base de travail. 743 ont été détectés à taille différente ; 114 autres avaient la même taille mais un contenu différent. Aucune ligne de la base de travail n'a été modifiée.
- **Restauration :**
  - depuis la sauvegarde `scripts/.seedgen/backups/2026-10-23T20-40-19-452Z/files`, contrôlée octet par octet : les 12 359 fichiers sauvegardés sont identiques ;
  - `seedgen files-check` : 12 834 fichiers, 0 absent, 0 taille différente ;
  - les 475 images du marché, créées après cette sauvegarde, n'avaient pas été touchées (dates vérifiées).
- **Fichiers étrangers :** les 4 967 fichiers écrits par la génération interrompue, référencés par aucune colonne de la base de travail, ont été **déplacés** (pas supprimés) vers `scripts/.seedgen/quarantine-2026-10-24-test-run/`.
- **Prévention :**
  - la base de test a son propre dossier (`uploads-test`, imposé par `testdb`) ;
  - chaque dossier porte un marqueur `.mizan-database`, et le générateur refuse d'écrire dans le dossier d'une autre base (`assertUploadsDirFor`). Testé : écriture refusée pour `syndycat_test` dans `uploads` ;
  - les processus orphelins ont été arrêtés explicitement.

## 2026-10-24 — Envois réels possibles depuis les API de test (corrigé)

- **Constat :**
  - `.env` contient de vrais identifiants SMTP (Gmail) et une configuration SMS (ZimSend) ;
  - en PowerShell, une variable vide est supprimée : une API de test lancée avec `SMTP_HOST=""` rechargeait donc le vrai SMTP depuis `.env`. L'API 5055 a tourné quelques minutes avec le SMTP actif ;
  - **aucun e-mail n'est parti pendant cette fenêtre** (journal `email_logs` et logs de l'API vérifiés) ;
  - aucun SMS n'est jamais parti : la configuration ZimSend est invalide (`ZIMSEND_BASE_URL` sans `https://`).
- **Correction :** l'interrupteur `OUTBOUND_DELIVERY=off` (`lib/outbound.ts`) coupe les e-mails, les SMS et les notifications push Expo. Il s'applique aussi au renvoi depuis le journal. Chaque tentative est journalisée « skipped ». Il est imposé par `testdb` et par `scripts/restart-test-apis.ps1`. Vérifié au démarrage des deux API (« Outbound delivery disabled »).

## 2026-10-24 — Secrets conservés dans le journal des e-mails (corrigé pour l'avenir)

- **Constat :**
  - `email_logs.body_html` gardait le corps complet des messages : lien de réinitialisation avec jeton, codes à usage unique, mot de passe temporaire de bienvenue, lien d'invitation ;
  - un syndic peut lire les journaux de sa copropriété ;
  - le renvoi depuis le journal ignorait les adresses non délivrables.
- **Correction :** pour les modèles `password_reset`, `otp`, `email_change`, `welcome` et `team_invitation`, le corps n'est plus conservé, et ces messages ne peuvent plus être renvoyés depuis le journal (il faut en demander un nouveau). Testé (`email-accounts:test`).
- **Non corrigé :** 14 lignes anciennes de la base de travail contiennent encore un secret (3 codes de vérification expirés, 10 invitations, 1 e-mail de bienvenue). Leur effacement (`body_html = NULL`) attend une validation.

## 2026-10-24 — Erreurs 500 à la place de refus (corrigé)

- **Constat :** des routes qui refusent la supervision (`/publications`, `/parking/vehicles`…) levaient une erreur porteuse d'un statut 403, que le `catch` transformait en 500.
- **Correction :** `lib/route-error.ts` (`sendRouteError`) est appliqué à 10 fichiers de routes ; un refus garde son statut et son code.
- **Contrôle :** la sonde `no-server-error-test` (127 routes × 9 profils) ne trouve plus aucune erreur 500.

## 2026-10-25 — Workflows lisibles par toutes les copropriétés (corrigé)

- **Constat :** la table `workflows` n'a pas de colonne de copropriété, alors que ses lignes décrivent les affaires d'une copropriété (« Validation budget prévisionnel 2027 », « Mise en demeure contentieux impayés »). `GET /workflows` et `GET /workflows/:id` les renvoyaient à tout utilisateur connecté, de n'importe quelle copropriété. Aucun écran n'y menait, mais l'API était ouverte.
- **Correction :** la lecture est réservée à la plateforme (`requireSuperAdmin`), qui était déjà seule à pouvoir créer et décider. Testé : 403 pour un copropriétaire, un syndic et un locataire ; 200 pour la plateforme (`screens-access:test`).

## 2026-10-25 — Preuve d'envoi des e-mails

- **Constat :** un journal « sent » ne prouvait rien. Des lignes de démonstration avaient été écrites directement à l'état « envoyé ».
- **Correction :**
  - migration additive 0017 : colonne `email_logs.provider_message_id` ;
  - la réponse du fournisseur (« 250 … queued as … ») y est enregistrée lors de l'envoi ;
  - l'identifiant interne de nodemailer, généré localement, n'est pas utilisé.
- **Tests :** sans aucun envoi réel, à l'aide d'un faux serveur SMTP local (`email-delivery-status:test`).

## 2026-10-25 — Secrets anciens du journal des e-mails : état

- **Analyse :** les 14 entrées ne contiennent plus aucun secret utilisable. Les codes sont expirés ou consommés, et les comptes destinataires des invitations ont été supprimés.
- **Copies :** des copies existent dans les sauvegardes locales `scripts/.seedgen/backups/` (hors Git), qu'il faut protéger ou purger selon la politique de conservation.
- **Expurgation :** préparée et éprouvée sur une copie restaurée. **Non exécutée sur la base de travail sans validation.**

## 2026-11-01 — Réinitialisation du mot de passe par code
- Code à 6 chiffres (`crypto.randomInt`), chiffré en bcrypt, 10 minutes, usage unique.
- Protection contre les essais en série : 5 essais par code, compteur incrémenté en base avant la comparaison.
- Limites : 5 codes par heure et par adresse, plus la limite par IP des routes d'identification.
- Pas d'énumération : réponse identique pour une adresse inconnue (durée identique seulement depuis le correctif du 02/11/2026) ; même refus pour un mauvais code ou une adresse inconnue.
- Les jetons de renouvellement sont révoqués après une réinitialisation. Un jeton d'accès déjà émis reste utilisable jusqu'à 15 minutes si le compte reste actif (voir l'entrée du 02/11/2026). L'avis « mot de passe modifié » est envoyé après la validation en base.
- Le code n'est jamais journalisé : le corps des e-mails `password_reset` n'est pas conservé, et l'erreur d'envoi est journalisée sans le code.

## 2026-11-02 — Suppression de compte, durée de réponse, dépendances

- **Correction d'une affirmation fausse du 01/11 :** `/auth/forgot-password` attendait l'envoi SMTP. La durée de réponse révélait donc si l'adresse existait. La route répond maintenant avant toute recherche et traite la demande ensuite (test de durée dans `password-reset-test`).
- **Correction d'une affirmation fausse du 01/11 :** « toutes les sessions sont fermées » était inexact. Seuls les jetons de renouvellement sont révoqués.
- **Risque ouvert :** un jeton d'accès déjà émis reste valable jusqu'à 15 minutes après une réinitialisation si le compte reste actif. Le fermer demande une colonne en base, à valider.
- **Suppression de compte :** mot de passe exigé, sessions révoquées, données personnelles anonymisées, compte refusé ensuite sur toutes les routes (`ACCOUNT_DISABLED`). Les écritures comptables sont conservées.
- **Faux succès corrigé :** en cas d'erreur réseau, « Mot de passe oublié » affichait une réussite.
- **Android :** `RECORD_AUDIO` et `SYSTEM_ALERT_WINDOW` bloquées, sauvegarde automatique coupée (`allowBackup: false`).
- **Dépendances :** faille critique `proxy-addr` corrigée (elle concernait le calcul de l'IP derrière le proxy, donc les limites de débit). Mises à jour de `body-parser`, `multer`, `compression`, `axios`, `follow-redirects`, `ip-address`, `fast-xml-parser`, `nodemailer` 10.
- **Risque ouvert :** `zod` 3 a une faille haute de consommation mémoire, corrigée seulement en version 4 (56 fichiers à migrer). Le corps des requêtes reste limité à 2 Mo.
- **Notifications d'un autre compte :** après une déconnexion, le téléphone continuait à recevoir les notifications du compte. Un autre compte connecté sur le même téléphone les recevait aussi. Le jeton est maintenant retiré à la déconnexion, et il ne peut appartenir qu'à un seul compte (`push-token-test`).
- **Journaux :** le jeton de notification, le titre et le texte des notifications ne sont plus écrits dans les journaux du téléphone.
- **Mention juridique :** « conforme à la loi 18-00 » et l'engagement de conformité à la loi 09-08 et au RGPD ont été retirés des écrans publics : personne ne les a vérifiés.
