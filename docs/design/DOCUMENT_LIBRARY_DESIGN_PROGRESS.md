# Bibliothèque documentaire — conception, sécurité et documents officiels

Date : 2026-10-19. Ce journal décrit l'audit, ce qui a été implémenté, les
tests réellement exécutés et ce qui reste à faire.

## 1. Audit de l'existant

| Domaine | Constat |
|---|---|
| Mobile | Expo 54 / expo-router, TypeScript ; design system MIZAN (`components/ui`, `constants/colors|typography|spacing`) ; FR / EN / AR / ES, RTL natif. |
| Données | Table `documents` unique (fichiers téléversés + documents générés), `document_versions`, `storage_objects`. Catégories du téléversement : administratif, procès-verbal, financier, contrat, maintenance, règlement, avis, assurance, juridique, technique, autre. Les documents générés utilisent d'autres catégories (`pv`, `compte-rendu`, `attestation`, `bail`, `légal`, `finance`, `entretien`…), non traduites jusqu'ici. |
| Droits | `lib/document-access.ts` : audiences `syndic`, `council`, `owners`, `residents`, `unit`, `personal` ; résidents = documents **publiés** de leur audience, lots possédés ou loués aujourd'hui, documents personnels à leur nom. Filtrage en SQL (liste) et à chaque fichier. |
| Téléchargement | Lien personnel de 5 minutes (`/documents/:id/download-url`), lié à la personne et à la version ; droits revérifiés au moment de l'envoi ; lien périmé après remplacement (409) ; accès retiré → refus immédiat. Pas d'URL de stockage exposée. |
| Ancien écran | `bibliotheque.tsx` : liste fonctionnelle mais sommaire (pas de lecteur dédié, catégories brutes, pas d'état d'erreur distinct). |
| Lecteur PDF | `pdf-viewer.tsx` : pdf.js depuis un CDN qui **télécharge l'URL lui-même** (exposé au CORS en production), rend **toutes** les pages avant d'afficher, URL injectée sans échappement, bouton Partager cassé (API `expo-file-system` dépréciée qui lève une exception à l'exécution), lien de 5 min jamais renouvelé. |
| Documents officiels | `lib/documentPdf.ts` (pdfmake) : 10 modèles sur 13 affichaient une page « Ce template est en cours de reconstruction — Phase 3 ». Pied de page « Document certifié — MIZAN.ma » sur tout document. Facture avec TVA 20 % inventée ; attestation de propriété avec faits par défaut inventés (nationalité « Marocaine », « Pleine propriété », acquisition « Achat »…). Police arabe (Amiri) jamais trouvée (chemin invalide sous Windows et dans le bundle). |

## 2. Mobile — bibliothèque résident

- **`app/bibliotheque.tsx`** (refait) : en-tête « Documents » + copropriété,
  champ de recherche, filtres par catégorie (uniquement celles que le serveur
  renvoie pour cette personne, avec leurs comptes), section « Récemment
  publiés » (documents réellement publiés depuis moins de 14 jours), liste
  paginée au défilement, tri récent / A→Z, rafraîchissement. États distincts :
  chargement (squelettes), bibliothèque vide, recherche sans résultat,
  catégorie vide, hors ligne, session expirée, accès refusé. L'équipe garde
  ses outils (ajout, remplacement, archivage, versions) via un bouton séparé.
- **`components/DocumentRow.tsx`** : vignette de type (icône de catégorie +
  étiquette de format PDF/JPG/WORD… — jamais la couleur seule), titre sur deux
  lignes, catégorie traduite, date de publication, format, taille, lot
  concerné, badges réels (Nouveau < 14 j, Mis à jour · vN, Fichier
  indisponible ; Archivé / Brouillon pour l'équipe). Toute la ligne ouvre ; la
  gestion a sa propre zone de 44 pt.
- **`app/document-viewer.tsx`** (nouveau) : métadonnées chargées du serveur
  (accès vérifié), téléchargement sécurisé avec progression, puis aperçu :
  - PDF : WebKit natif sur iOS ; pdf.js sur Android avec rendu **paresseux**
    des pages (IntersectionObserver, pages libérées hors écran), zoom, numéro
    de page ; PDF protégé par mot de passe et PDF endommagé distingués ;
  - images : zoom jusqu'à 6× ; texte / CSV : lecture sélectionnable ;
  - autres formats (Word, Excel, HEIC sur Android) : « Aperçu non disponible »
    + « Ouvrir avec… » (feuille système), jamais d'aperçu fabriqué.
  Actions : enregistrer / partager (avec avertissement : une copie exportée
  n'est plus contrôlée), informations, réessayer. Aucune action
  d'administration pour un résident.
- **`lib/documentFiles.ts`** : lien neuf à chaque ouverture, fichier dans le
  cache **privé** de l'app (`cacheDirectory/mizan-docs/`), espace disque
  vérifié avant téléchargement, téléchargements simultanés du même document
  fusionnés, erreurs serveur traduites (lien expiré, document remplacé — la
  visionneuse recharge alors une fois —, accès retiré, fichier manquant,
  stockage insuffisant, interruption), fichier supprimé à la fermeture.
  Le cache est purgé à chaque changement de copropriété / rôle / compte et à
  la déconnexion (`ContextScope`). **Pas de lecture hors ligne** : chaque
  ouverture est revalidée en ligne.
- **`lib/documentMeta.ts`** : libellés de catégorie traduits (y compris les
  catégories des documents générés ; une catégorie inconnue est humanisée,
  jamais affichée brute), familles d'icônes, format, taille localisée.
- **`lib/pdfHtml.ts`** : gabarits HTML du lecteur (données en base64, aucune
  URL de document dans la WebView, texte alternatif échappé).
- `pdf-viewer.tsx` (encore utilisé pour les anciennes versions et d'autres
  écrans) : partage réparé (`expo-file-system/legacy`, fichier supprimé après
  partage), URL échappée.
- Accueil : le raccourci « Documents » des copropriétaires et locataires
  ouvre désormais la bibliothèque (les demandes de documents restent dans
  « Plus »).
- 79 clés de traduction FR / EN / AR / ES (`dl*`).

## 3. Backend

- `GET /documents/:id` : document d'une autre copropriété ou hors audience →
  **404** comme un identifiant inexistant (avant : 403, qui révélait
  l'existence) ; renvoie le numéro du lot concerné.
- `GET /documents` : numéro du lot des documents de lot.
- Téléversements (`document-library`, `storage`) : noms de fichiers UTF-8
  (`defParamCharset: "utf8"`) — les accents et l'arabe étaient enregistrés
  corrompus (« RÃ¨glement »). Les noms déjà enregistrés ne sont pas corrigés.

## 4. Documents officiels générés

- Mise en page commune `officialBody` (en-tête et pied de page existants,
  numérotation des pages) : tableau de faits (valeurs vides omises), sections
  de texte, tableaux paginés (en-tête répété, lignes jamais coupées, total en
  fin). Remplace la page « en reconstruction » des 10 modèles : convocation,
  décision, mise en demeure, rapport financier, attestation de résidence,
  attestation de propriété, appel de fonds, facture, déclaration de sinistre,
  ordre de travaux.
- Uniquement des données réelles : pas de TVA ajoutée, pas de nationalité ni
  de statut juridique par défaut, pas de signature, cachet, approbation ou
  formule juridique ajoutés (la mise en demeure ne contient que le texte du
  syndic).
- Pied de page factuel « Document généré par MIZAN » (au lieu de « Document
  certifié ») ; facture sans « Aucune signature manuscrite n'est requise ».
- Arabe : police Amiri trouvée (chemin corrigé pour Windows et le bundle),
  appliquée à tout le document arabe, libellés de la mise en page traduits,
  colonne des libellés à droite.
- Reçu de paiement (`/appels-de-fonds/:id/receipt`) : payeur, référence du
  paiement, montant de l'appel, reste dû à l'émission, dates en toutes
  lettres, pied de page avec référence et pagination ; l'identifiant interne
  du lot n'apparaît plus.

## 5. Tests exécutés (2026-10-19, API de test 5055)

| Suite | Résultat | Type |
|---|---|---|
| `document-library-resident:test` (nouvelle) | 27/27 | intégration API + base + stockage réels |
| `official-documents:test` (nouvelle) | 13/13 | génération réelle (pdfmake + polices) |
| `documents-library:test` | 75/75 (avant et après les corrections) | intégration |
| `documents-security:test` | 29/29 | intégration |
| `finance-workflow:test` | 89/89 (télécharge le nouveau reçu) | intégration |
| Typecheck mobile + export Android / iOS | OK | statique / bundle |

`document-library-resident:test` couvre : copropriétaire à deux lots,
copropriétaire à un lot, locataire, documents conseil / syndic / brouillon
invisibles, autre copropriété invisible, comptes de catégories limités aux
documents visibles, numéro de lot, 404 identique pour « interdit » et
« inexistant », reçu personnel d'un autre résident, falsification d'identifiant,
aperçu PDF en ligne (inline, `private, no-store`), image, document de 8 Mo,
téléchargements simultanés, remplacement (ancien lien → 409, version 2, nouveau
fichier), archivage, lot vendu (document retiré et lien refusé), objet de
stockage manquant (code explicite), noms de fichiers accentués et arabes,
recherche limitée aux documents autorisés.

**Non vérifié sur appareil** : aucun test manuel sur téléphone ou émulateur
(rendu, mode sombre, arabe RTL, VoiceOver / TalkBack, rotation, petits écrans,
coupure réseau réelle, stockage plein). Les PDF générés ont été contrôlés
visuellement page par page (FR, AR, facture de 45 lignes sur 2 pages).

## 6. Limites connues

- **Arabe dans les PDF** : pdfmake n'applique pas l'algorithme bidi complet ;
  certains espaces disparaissent entre deux mots ou entre un mot arabe et un
  nombre. Correctif propre : prétraitement bidi (dépendance à ajouter) ou
  autre moteur de rendu — à décider.
- **Miniatures** : aucune génération côté serveur ; les lignes utilisent une
  icône de type. Générer un lien signé par image pour chaque ligne aurait
  multiplié les requêtes ; à revoir avec une route de miniatures protégée.
- **pdf.js** est chargé depuis cdnjs sur Android (connexion requise, comme le
  document lui-même).
- **Révocation** : une copie que la personne a explicitement enregistrée ou
  partagée hors de l'app ne peut plus être retirée.
- Reprise d'un téléchargement interrompu : il recommence avec un lien neuf
  (le lien précédent peut avoir expiré).
- Politique de partage : le backend n'en définit pas ; le partage reste
  autorisé pour un document que la personne peut voir.
- Les écrans d'équipe (`documents.tsx`, génération) n'ont pas été refondus.

## 7. Prochaines tâches

1. Prétraitement bidi pour les PDF arabes.
2. Route de miniatures protégée (images, première page des PDF) avec cache
   soumis aux mêmes droits.
3. Vérification sur appareils (iOS / Android, FR / AR, mode sombre, lecteur
   d'écran).
4. Conceptions dédiées par modèle officiel (à partir de références validées).
