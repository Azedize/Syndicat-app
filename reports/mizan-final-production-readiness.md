# MIZAN — Validation finale sur émulateur Android et état de préparation (9 novembre 2026)

Ce rapport fait suite à `reports/pre-production-readiness.md` et `reports/real-world-acceptance-testing.md`.

**Méthode :** l'application a été réellement utilisée sur l'émulateur Android. Chaque écran a été ouvert. Pour chaque action testée, le résultat a été vérifié dans l'API et dans PostgreSQL. Un test n'est marqué réussi que si son exécution a été constatée.

## Verdict

| Domaine | État réel |
|---|---|
| Android (émulateur, Expo Go) | **Utilisable en bêta privée.** 113 écrans inventoriés, tous ouverts sans plantage après corrections. Les parcours critiques sont validés de bout en bout. |
| Android (téléphone réel, build release) | **Non validé.** Le build release local échoue (compilation C++ bloquée par OneDrive, voir E). Aucun téléphone physique utilisé. |
| iOS | **Non testé** (pas de macOS). Rien ne permet de déclarer l'application prête sur iOS. |
| Backend | **Solide.** 55 suites sur 56 réussies ; le seul échec attend une décision métier. |
| Base de données | **Cohérente.** 350 contrôles d'intégrité sur 350, sur les deux bases de test. |
| Sécurité | **Bonne, avec 2 réserves :** la limite de requêtes par IP et la configuration de production (voir plus bas). |
| Paiements | **Circuit déclaration → validation → reçu → écriture : validé.** Aucun paiement réel, aucun prestataire de paiement branché. |
| Notifications | **Notifications dans l'application : validées.** Les notifications push n'ont pas été vérifiées (simulateur, pas de jeton Expo). |
| Documents | **PDF et justificatifs : validés.** Le justificatif s'ouvre encore dans le navigateur externe. |
| Performance | Mesurée le 8 novembre en local : aucune erreur jusqu'à 700 utilisateurs simultanés. Non remesurée. |
| Publication | **Pas prête.** Il manque l'URL de l'API de production, la clé de signature de production et le compte EAS ; HTTPS et les décisions métier sont encore ouverts. |

**Conclusion : candidat à une bêta privée contrôlée sur Android. Ni la production, ni iOS.**

## A. Environnement

| Élément | Valeur |
|---|---|
| Émulateur | Pixel 10 Pro (AVD), Android 17, 1280 × 2856, densité 480 |
| Exécution | Expo Go 58.0.5 (SDK 58.0.0), Metro sur le port 8106 |
| Application | MIZAN 2.0.0 (versionCode 1), Expo 58.0.22, React Native 0.88.1 |
| API | locale, port 5056, sans envoi d'e-mail, SMS ni notification push |
| Base de navigation | `mizan_test_clean`, désignée par `.env` : campagne `s20261109`, 50 sociétés de syndic, 120 copropriétés, 2 151 comptes (1 857 actifs, 171 en attente, 51 suspendus, 72 inactifs) |
| Base de non-régression | `syndycat_test`, recréée le 9 novembre par `testdb` (création, migrations, référence, génération) |
| Outils | adb, UI Automator (outils `ui.mjs`, `login.mjs`, `sweep.mjs`), captures d'écran, logcat, Ghostscript (rendu des PDF), suites `scripts/src/*-test.ts` |

## B. Couverture

| Mesure | Résultat |
|---|---|
| Écrans de l'application | 113, sans route dynamique |
| Écrans ouverts sur l'émulateur | **113** : 66 accessibles par les menus, 28 secondaires, 10 hors connexion, et les fiches de détail ouvertes depuis les listes (partenaire, paiement, justificatif). Les autres fiches (lot, membre, prestataire, produit, conversation, visionneuses PDF) n'ont été ouvertes qu'en mission 2. |
| Ouvertures d'écrans par rôle | 281, sur 9 comptes |
| Rôles testés à l'écran | **10 sur 10** : copropriétaire, locataire, membre du conseil, trésorier, secrétaire, président, syndic, administrateur de société (même compte que le syndic), gestionnaire de société, super admin |
| Parcours complets validés à l'écran | 2 : paiement avec justificatif et validation ; super admin et organigramme national. S'y ajoutent les parcours du 8 novembre, inchangés depuis. |
| Formulaires testés | Paiement : refus sans justificatif, montant, référence, pièce jointe, soumission. Connexion : champs vides. Ajout d'un copropriétaire : adresse déjà utilisée. |
| Langues | Français (balayage complet) ; arabe en mode sombre (10 écrans du copropriétaire) ; anglais et arabe pour les erreurs du serveur (suite automatique) |

## C. Résultats

### Balayage par rôle

Les signalements automatiques ont tous été examinés un par un.

| Rôle | Écrans | Signalements | Vrais défauts |
|---|---|---|---|
| Copropriétaire | 23 | 1 | 0 (message de la messagerie qui commence par « Bonjour ») |
| Locataire | 16 | 0 | 0 |
| Membre du conseil | 27 | 1 | 1 (date brute dans la répartition) |
| Trésorier | 27 | 0 | 0 (l'icône de la caisse a été harmonisée après examen visuel) |
| Secrétaire | 28 | 1 | 0 (date brute dans un titre de document généré : défaut du générateur, corrigé) |
| Président | 33 | 1 | même défaut que la répartition |
| Syndic (abonnement expiré) | 56 | 4 | 0 (filtres « Refusées », états vides, messages) |
| Gestionnaire de société | 56 | 5 | même défaut que la répartition |
| Super admin | 15 | 2 | 2 (organigramme, rappels non traduits) |
| Écrans secondaires (syndic actif) | 28 | 11 | 1 plantage (partenaires) ; les 10 autres signalements en étaient la suite |
| Écrans hors connexion | 10 | 1 | 0 (artefact de l'outil de test) |

### Suites automatiques

| Série | Résultat |
|---|---|
| Régression complète sur `syndycat_test` recréée | 52 sur 56 au premier passage |
| Après correction | **55 sur 56** |
| `election-audit` S7 | Échec connu : élection de remplacement automatique après démission, en attente d'une décision métier depuis le 7 novembre |
| Nouvelles suites | `final-fixes` 12/12, `server-errors-i18n` 14/14, `pdf-arabic` 12/12 |
| Vérification des types | Application et serveur : 0 erreur. Scripts de test : 14 fichiers avec des erreurs de types anciennes, sans effet à l'exécution (tsx). |
| Intégrité des données | 350/350 sur `mizan_test_clean` et sur `syndycat_test` |
| Factures PDF contre base | 40 tirées au hasard : 40/40 affichent la référence et le montant enregistrés |

Détail des 4 échecs du premier passage :
- **`journeys` :** effet voulu du formatage des montants. La notification affiche « 300,00 » en français ; l'assertion accepte maintenant les deux séparateurs décimaux.
- **`mobile-actions` :** la copropriété était choisie au hasard de l'ordre des identifiants. La suite préfère maintenant une copropriété qui contient l'état à vérifier.
- **`org-structure` :** la suite crée maintenant sa propre dépense soumise si la base n'en contient pas, puis la supprime.
- **`election-audit` :** son étape préalable (`election-audit:seed`) n'avait pas été relancée sur la base recréée.

**Point de transparence :** le lanceur ne comptait pas les lignes « ❌ FAIL ». L'échec S7 apparaissait donc comme réussi dans les « 54/54 » des missions précédentes. Le compteur est corrigé.

## D. Corrections

| # | Défaut constaté | Cause | Fichiers | Vérification |
|---|---|---|---|---|
| 1 | **Plantage de l'écran Partenaires** (« Cannot read property 'color' of undefined ») | Le type de partenaire est un texte libre côté serveur ; un type inconnu (« commerce ») faisait planter l'écran | `app/partenaires.tsx` (repli sur « autre »), `scripts/src/seedgen/generate.ts` (type `commercial`) | Écran et fiche ouverts sans erreur sur l'émulateur ; `final-fixes` |
| 2 | Fiche partenaire sans statut | La table `partners` n'a pas de colonne `status` ; l'écran la lisait | `app/partenaires.tsx` (statut déduit de la date de fin) | Fiche ouverte : « Actif » |
| 3 | **Organigramme en erreur pour le super admin** | Le refus attendu de la vue de copropriété (403 sans supervision) faisait échouer `Promise.all`, donc tout l'écran | `app/organigramme.tsx` (`Promise.allSettled`) | Vue nationale affichée : 120 copropriétés ; `final-fixes` |
| 4 | Rappel d'appel échu en français figé, montant « 700.05 » et date « 2026-07-31 » bruts, notification poussée en français | Texte construit à la main au lieu d'un modèle | `lib/notification-texts.ts` (modèle `fundsCall.overdue` en 4 langues, montants selon la langue), `lib/funds-calls.ts` (envoi par `notifyUser`) | Rendu fr, en et ar dans `final-fixes` ; à l'écran, « 32,10 درهم » |
| 5 | Date brute dans la répartition (« dès 2026-01-01 ») | Date non mise en forme | `app/repartition.tsx` | `final-fixes` |
| 6 | « Payés » sur un seul paiement ; « 1 partenariats actifs » | Libellé pluriel unique | `i18n/translations.ts` (`paidOne`, `partnerActiveCountOne`), charges, paiements, accueil, membres, partenaires | `final-fixes`, `i18n` 9/9 |
| 7 | Icône « $ » pour la caisse dans la trésorerie | Différente de l'écran « Finances » | `app/tresorerie.tsx` | Visuel |
| 8 | Deux routes SMS renvoyaient le message brut d'une exception (500) | `err?.message` renvoyé au client | `modules/auth/auth.routes.ts` | `final-fixes` |
| 9 | Procuration de démonstration incohérente (élection d'Atlas, mandant et mandataire d'Agdal) | Erreur dans `seed.ts` | `scripts/src/seed.ts` | 350/350 sur `syndycat_test` |
| 10 | Date brute dans les titres de procès-verbaux générés | Générateur de données | `scripts/src/seedgen/documents.ts` | Revue du code |
| 11 | Échecs `❌ FAIL` non comptés | Motif du lanceur | `scripts/run-all-tests-testdb.sh` | Recompté : 1 |

**Corrections réalisées les 8 et 9 novembre, juste avant cette campagne :**
- erreurs du serveur traduites en français, anglais et arabe (705 messages couverts, `server-errors-i18n`) ;
- PDF arabes : ordre des lignes, noms latins et montants, parenthèses, colonnes et pied de page ;
- reçus avec des noms en arabe (Amiri) ;
- actualisations suspendues quand l'application est en arrière-plan ;
- garde-fou contre l'exécution du script de démonstration en production.

## E. Production : points vérifiés

**Configuration :**
- `eas.json` : les profils `preview` et `production` ne définissent aucune URL d'API. L'application compilée ne joindrait aucun serveur. C'est **bloquant**.
- Paquet `com.syndycatglobalcps.app`, version 2.0.0, versionCode 1 : à incrémenter à chaque publication.
- Permissions : Internet, notifications, vibreur, démarrage. Micro, alarmes exactes et superposition sont retirés.
- L'appareil photo est utilisé (preuves, logo) : vérifier la permission `CAMERA` dans l'APK compilé et prévoir les textes d'usage iOS.
- Le build release est signé avec la **clé de débogage**. Une clé d'envoi Google Play est nécessaire ; c'est votre secret, je ne l'ai pas créée.
- Le trafic en clair (HTTP) est refusé par défaut en release : l'API de production doit être en HTTPS.
- `expo-doctor` : 17 vérifications sur 20 (champ `newArchEnabled` obsolète, un doublon de dépendance, 10 paquets avec un léger retard de version).

**Sécurité :**
- Aucun secret dans l'application (seulement les variables `EXPO_PUBLIC_*` : URL, contacts).
- Jetons de 15 minutes, renouvellement à chaque usage avec détection de réutilisation, sessions fermées après réinitialisation du mot de passe.
- Isolation entre copropriétés vérifiée par `acceptance-roles`, `idor-scan` et `rbac-regression`.
- RIB masqué dans la trésorerie ; justificatifs servis par des liens à jeton temporaire.
- **Risque ouvert :** limite de 500 requêtes par minute et par adresse IP. Mesuré le 8 novembre : 40 téléphones derrière une même IP d'opérateur sont bloqués en 53 secondes. Proposition en attente de votre décision.

**Build Android release (Gradle local, JDK d'Android Studio) — ÉCHEC, cause identifiée :**
- **Projet natif :** généré avec `expo prebuild`. Le dossier `android/` est ignoré par Git. La modification de `package.json` faite par `prebuild` (doublons de dépendances) a été annulée.
- **Bundle JavaScript, 1er échec, corrigé :** « Cannot find module 'babel-preset-expo' ». `babel.config.js` utilise ce module sans qu'il soit déclaré ; Metro le trouve en développement, le bundling release non. Il est ajouté en dépendance de développement (58.0.23, version du SDK). Au 2e essai, le bundle est produit (« Done writing bundle output »).
- **Compilation C++, 2e échec, non résolu :** « ninja: manifest 'build.ninja' still dirty after 100 tries » (react-native-screens, expo-updates). Aucun fichier n'est daté dans le futur ; la cause la plus probable est le dépôt situé dans **OneDrive**, dont la synchronisation modifie en permanence les fichiers vus par ninja.
- **Solutions :**
  - compiler depuis une copie du dépôt hors OneDrive (par exemple `C:\dev\zip-repl`) ;
  - ou utiliser EAS Build dans le cloud, ce qui demande un compte Expo connecté : `eas whoami` attend ici une connexion interactive.
- **Conséquence :** aucun APK release n'a été produit ni installé. L'installation, la mise à jour et le démarrage après installation ne sont **pas** vérifiés.

## F. Éléments bloquants

**Pour la bêta privée :**
1. Produire un APK : compiler hors OneDrive ou avec EAS ; disposer d'une API de recette en HTTPS et renseigner son URL dans `eas.json` (profil `preview`).
2. Faire installer un APK sur au moins un téléphone Android réel et y rejouer les parcours de connexion, de paiement et de document.

**Pour la bêta publique :**
1. Les décisions de `reports/business-decisions-pending.md`, auxquelles s'ajoute S7 (élection de remplacement automatique).
2. La limite de requêtes par IP.
3. La colonne `status` des partenaires (migration additive) : sans elle, la validation d'un partenaire renvoie une erreur 500 (constaté).
4. La visionneuse intégrée pour les justificatifs, qui s'ouvrent aujourd'hui dans le navigateur externe.
5. Les notifications push vérifiées sur un vrai téléphone.

**Pour la production :**
1. iOS (macOS et Xcode, puis un iPhone).
2. La clé de signature Google Play, l'incrémentation des versions et la fiche Play Store.
3. Un prestataire de paiement réel et le renouvellement des abonnements.
4. Les images réalistes des données de démonstration : le quota Canva est épuisé après 4 images sur 44.

**Améliorations non bloquantes :**
- montant prérempli « 32.1 » au lieu de « 32,10 » dans la déclaration de paiement ;
- écran `workflow` orphelin (aucun lien n'y mène) ;
- rappels anciens enregistrés en français, qui restent tels quels ;
- données générées : des paiements validés sans justificatif, alors que le serveur en exige un pour valider ;
- erreurs de types anciennes dans 14 scripts de test.

## G. Décision attendue de votre part

1. **Ajouter la colonne `status` à la table `partners`.** Migration additive : valeur par défaut `active`, aucune donnée supprimée. Elle corrigerait la validation des partenaires (500 aujourd'hui).
2. Les décisions métier de `reports/business-decisions-pending.md`, auxquelles s'ajoute S7.
3. La limite de requêtes par IP.
4. Les images : recharger les crédits Canva, utiliser Figma (payant) ou fournir vos propres photos.

## H. Prochaine étape proposée

1. Mettre en place une API de recette en HTTPS, renseigner son URL dans `eas.json`, puis produire l'APK `preview`.
2. Installer cet APK sur un téléphone Android réel et rejouer connexion, paiement, réclamation et documents, notifications push comprises.
3. Appliquer la migration des partenaires si vous la validez.
4. Trancher les décisions métier, puis traiter la visionneuse intégrée des justificatifs.
5. Préparer iOS sur un Mac.
