# Journal de sécurité

Constats de sécurité et corrections, par date. Chaque entrée indique ce qui
était exposé, ce qui a été changé et le test qui le vérifie. Les suites citées
sont dans `scripts/src/` (commandes dans `LOCAL_RUN_COMMANDS.md`).

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
