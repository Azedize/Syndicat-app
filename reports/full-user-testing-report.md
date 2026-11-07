# MIZAN — Registre des essais utilisateur

Environnement : émulateur Android (Pixel 10 Pro, API 37), application dans Expo Go 58.0.5, API de test sur le port 5056, base `syndycat_test`. Aucun essai sur téléphone réel ni sur iOS.

Comptes : comptes générés de la « Résidence Riad Salam Anfa 22 » (domaine réservé `.test` : aucun e-mail ne peut partir). Mot de passe commun des comptes générés, non reproduit ici.

Statuts : `TESTED_PASS`, `TESTED_FAIL` (corrigé ensuite, voir colonne Retest), `NEEDS_RETEST`, `NOT_TESTED`, `BLOCKED`.

## 1. Déjà validé avant cette mission (non refait)

Source : `docs/PROJECT_PROGRESS.md`.

| Module | Parcours déjà vérifié sur émulateur |
|---|---|
| Premier lancement | Choix de la langue, présentation, connexion |
| Réclamations | Création avec photo, jusqu'en base |
| Paiements | Déclaration partielle avec preuve, validation, reçu, écriture ; rejet avec motif |
| Élections | Vote, second vote refusé, résultats masqués, clôture, publication, mandats |
| Organisation | Assistant, tableau de bord, comités, tâches, recommandations |
| Démission du syndic | Fenêtre officielle, écran des démissions, notification |
| Formulaires | 12 formulaires clavier ouvert (dernier champ visible) |

## 2. Essais de cette mission

| Module | Écran | Scénario | Résultat | Problème | Correction | Retest |
|---|---|---|---|---|---|---|
| Tous | 107 écrans (membre, syndic) | Ouverture de chaque écran, lecture du texte affiché | TESTED_FAIL | Dates ISO brutes sur 8 écrans ; identifiant technique dans le journal d'audit ; écran Workflow en erreur réseau pour les rôles non autorisés | Dates localisées ; libellé d'audit ; état « accès réservé » | PASS |
| Annonces | Annonces | Filtres par priorité | TESTED_PASS | — | — | — |
| Annonces | Création | Formulaire vide | TESTED_PASS | Bouton désactivé | — | — |
| Annonces | Création | Double appui sur « Publier » | TESTED_FAIL | 2 annonces identiques créées | Garde dans `Button` + requête d'écriture identique ignorée tant que la première est en cours (`lib/singleFlight.ts`) | PASS (1 annonce) |
| Annonces | Détail | Suppression : annuler puis confirmer | TESTED_PASS | Ponctuation française « ? » dans la question arabe (mineur) | — | — |
| Réunions | Création | Date inexistante `2026-13-45` | TESTED_FAIL | Enregistrée telle quelle, affichée « 14 février 2027 » | Validation de date côté API (27 champs de date) et côté écran | PASS |
| Réunions | Création | Message d'erreur dans le formulaire | TESTED_FAIL | Toast invisible derrière la fenêtre modale | `AppModal` affiche ses propres toasts ; titres par défaut traduits | PASS |
| Réunions | Création | Double appui sur « Enregistrer » | TESTED_FAIL | 2 réunions créées | `lib/singleFlight.ts` | PASS |
| Réunions | Modification | Date invalide puis valide, titre modifié | TESTED_PASS (après correction) | — | — | PASS |
| Réunions | Détail | Confirmer ma présence | TESTED_FAIL | Enregistrée en base, compteur resté à 0 | La fiche suit la liste | PASS |
| Réunions | Détail | « Télécharger le PV » | TESTED_FAIL | Ouvrait la liste générale des documents | Ouvre le PV de la réunion | PASS |
| PV | Liste | Types de réunion | TESTED_FAIL | Réunions du conseil, commissions et urgences étiquetées « Assemblée générale » ou absentes | Correspondance des types ; `?scope=minutes` | PASS |
| PV | Détail | « Télécharger PDF » | TESTED_FAIL | Message « téléchargé » sans aucun fichier | Ouvre le PV généré pour la réunion, ou le génère (syndic) | PASS |
| PV | PDF | Contenu du procès-verbal | TESTED_FAIL — CRITIQUE | Participants, ordre du jour, horaires, quorum et votes inventés (modèle d'entreprise en anglais) | Modèle refait avec les seules données de la réunion | PASS |
| Documents | Liste et fiche | Dates | TESTED_FAIL | Horodatage brut `2026-11-07T17:31:27.634Z` | Date localisée | PASS |
| Documents | Fiche | Suppression | TESTED_PASS | Bouton « SUPPRIMER » en français dans l'interface arabe | Traduit (+ « Restaurer », « Approuver », suggestions des favoris) | NEEDS_RETEST |
| Portefeuille | Détail d'une copropriété | Codes affichés | TESTED_FAIL (lecture du code) | Statuts, types et dates bruts | Libellés traduits | NOT_TESTED à l'écran (compte de société de syndic requis) |

## 3. Problèmes restants

| Problème | Gravité | Conséquence | Cause | Action recommandée |
|---|---|---|---|---|
| Ordre des mots arabes parfois inversé dans les PDF générés par le moteur pdfmake | MOYENNE | PDF arabe difficile à lire | Pas de mise en forme bidirectionnelle dans ce moteur | Appliquer la même mise en forme que `PdfSpec.rtl` |
| Titres d'annonces, de réunions, de documents saisis en français | — | Normal : ce sont des données | — | — |

## 4. Non testé / bloqué

À compléter en fin de mission.
