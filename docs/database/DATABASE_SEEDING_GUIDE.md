# Guide du générateur de données de test (`seedgen`)

Générateur reproductible de données fictives pour la base **locale de
développement**, avec de vrais fichiers PDF et images. Code :
`scripts/src/seedgen/`. Inventaire : `docs/database/DATABASE_TABLES_INVENTORY.md` ;
stratégie : `docs/database/DATABASE_SEEDING_PLAN.md` ; résultats : `docs/database/DATABASE_SEEDING_REPORT.md`.

## Procédure complète (recommandée)

Depuis la racine du dépôt, la base doit contenir les données de référence
(`pnpm db:setup` sur une base neuve) :

```powershell
# 1. Voir ce qui serait fait, sans rien modifier
pnpm --filter @workspace/scripts run seedgen -- run --dry-run

# 2. Exécuter : environnement → migrations → sauvegarde → nettoyage → génération
#    (données + documents) → contrôles → rapport
pnpm --filter @workspace/scripts run seedgen -- run

# 3. Vérifier à travers l'API en marche (rôles, téléchargements, permissions)
$env:API_BASE_URL = "http://localhost:5000/api"; pnpm --filter @workspace/scripts run seedgen:api
```

Étapes de `run` :

1. **Environnement** — base locale identifiée, connexion vérifiée.
2. **Migrations** — migrations en attente (journal de `lib/db/drizzle` comparé à
   `drizzle.__drizzle_migrations`) appliquées par `pnpm db:migrate` ; le schéma
   n'est jamais modifié autrement.
3. **Sauvegarde** — `pg_dump` complet (format personnalisé) et copie des
   fichiers qui vont être supprimés, dans `scripts/.seedgen/backups/<horodatage>/`
   (avec `manifest.json`).
4. **Nettoyage** — suppression de **tous les lancements précédents du
   générateur** (toutes graines) et des résidus prouvés d'anciens lancements,
   en une transaction, enfants d'abord.
5. **Génération** des données (≈ 1 000 utilisateurs, 60 copropriétés).
6. **Documents** produits à partir des données enregistrées (voir plus bas).
7. **Métadonnées** des fichiers (`storage_objects`, `documents`, colonnes de
   pièces jointes des objets métier).
8. **Contrôles** — intégrité de la base (`verify`) et des fichiers (`files-check`).
9. **Rapport** — `docs/database/DATABASE_SEEDING_REPORT.md` et `scripts/.seedgen/pipeline-s<graine>.json`.

Relancer `run` ne crée pas de doublon : le nettoyage retire d'abord l'ancien
jeu, puis la même graine régénère le même jeu.

## Commandes unitaires

| Commande | Effet |
|---|---|
| `seedgen -- inventory` | Découvre toutes les tables du schéma réel → `docs/database/DATABASE_TABLES_INVENTORY.md` |
| `seedgen -- plan` | Stratégie et volumes par table → `docs/database/DATABASE_SEEDING_PLAN.md` |
| `seedgen -- reference` | Vérifie les données de référence utilisées (plans d'abonnement) |
| `seedgen -- backup` | Sauvegarde seule (pg_dump + fichiers générés) |
| `seedgen -- reset [--dry-run]` | Sauvegarde puis suppression de tous les lancements du générateur ; `--dry-run` affiche le détail par table sans rien modifier |
| `seedgen -- generate [--seed N] [--scale X] [--syndicates N]` | Génère un lancement (refusé si la graine existe déjà) |
| `seedgen -- cleanup --seed N` | Supprime uniquement le lancement de la graine N |
| `seedgen -- verify` | Contrôles d'intégrité (code de sortie ≠ 0 en cas d'échec) |
| `seedgen -- files-check` | Chaque fichier généré existe, a sa taille enregistrée et se décode |
| `seedgen -- report` | Rapport complet → `docs/database/DATABASE_SEEDING_REPORT.md` |
| `seedgen:api [-- --seed N]` | Vérifications à travers l'API en marche |

(Préfixe : `pnpm --filter @workspace/scripts run`.) Options : `--seed`
(défaut `20261019`, même graine et même code ⇒ mêmes données), `--scale`
(défaut `1`), `--syndicates`.

## Correspondance avec les opérations demandées (2026-10-23)

| Opération | Commande | Effet |
|---|---|---|
| `inspect` | `seedgen -- inspect` | Serveur, bases présentes, migrations, comptes et copropriétés générés / non générés, lignes et fichiers rattachés au générateur. **Lecture seule.** |
| `backup` | `seedgen -- backup` | `pg_dump` complet + copie des fichiers générés dans `scripts/.seedgen/backups/<horodatage>/` |
| `reset-test-data` | `seedgen -- reset --dry-run` puis `seedgen -- reset` | Ne retire que les lignes rattachées aux marqueurs du générateur (voir plus bas) ; sauvegarde automatique avant |
| `seed-test-data` | `seedgen -- generate` puis `seedgen -- marketplace` | Jeu principal (≈ 1 000 comptes, 60 copropriétés, documents) puis catalogue du marché |
| `verify-test-data` | `seedgen -- verify` et `seedgen -- files-check` | Intégrité de la base ; existence, taille et décodage de chaque fichier |
| `cleanup-generated-files` | `seedgen -- cleanup --seed N` | Supprime les lignes **et** les fichiers du lancement N (un fichier encore référencé par une ligne hors lancement est conservé) |

### Catalogue du marché (`seedgen -- marketplace [--seed N] [--listings 200]`)

Les annonces sont cloisonnées par résidence ; le jeu principal n'en donne que
1 à 6 par copropriété, ce qui ne permet de tester ni la pagination ni les
filtres combinés. Cette étape ajoute à la copropriété générée qui compte le
plus de résidents actifs :

- 200 annonces dans les 8 catégories, statuts réellement gérés par l'API
  (`approved`, `reserved`, `sold`, `pending_review`, `rejected`), annonces à
  la une, remises, prix négociables, prix limites (5 MAD et 25 000 MAD) ;
- titres en français, arabe et anglais, un titre très long, des descriptions
  longues ;
- 0 à 4 vraies images PNG par annonce (600×600, 480×720, 800×450, 160×120,
  1024×768), certaines avec un nom de fichier très long, enregistrées dans
  `storage_objects` ;
- favoris et questions publiques de voisins.

Identifiants `mkt-s<graine>-NNNN` : un second lancement n'ajoute rien. Tout est
rattaché à des comptes et à une copropriété du lancement, donc retiré par
`cleanup --seed N` ou `reset`, fichiers compris.

### Pourquoi le nettoyage n'a pas été relancé le 2026-10-23

La base `syndycat_global_cps` est l'unique base locale : elle contient le jeu
généré **et** 43 comptes / 4 copropriétés qui n'en viennent pas (jeu de
démonstration, comptes d'audit, une adresse `@gmail.com`). Ce n'est pas une
base de test isolée. Le jeu généré existant passait déjà 306 contrôles sur 307
et ses 12 359 fichiers étaient valides : il a été conservé et complété de façon
additive, après sauvegarde, sans aucune suppression. Pour repartir de zéro,
utilisez une base dédiée (par ex. `syndycat_test`) et `seedgen -- run`.

## Base de test isolée et garde-fous (2026-10-24)

- **Base dédiée.** `syndycat_test` est créée et remplie par `scripts/src/testdb.ts` (voir `docs/development/LOCAL_RUN_COMMANDS.md`, section 3 ter). Rien n'y est copié depuis `syndycat_global_cps`.
- **Un dossier de fichiers par base.** Chaque dossier porte un marqueur `.mizan-database`. Le générateur refuse d'écrire dans le dossier d'une autre base, car la même graine produit les mêmes noms de fichiers : c'est ce qui a écrasé des fichiers le 2026-10-24, avant restauration (voir `docs/security/SECURITY_LOG.md`).
- **Domaine des comptes.** `TEST_EMAIL_ROOT` est défini en un seul endroit, `scripts/src/test-domain.ts`, et doit être un domaine réservé.
- **Nouvelle commande `seedgen -- scenarios`.** Elle ajoute une résidence sans aucun document (au nom très long), avec son syndic et deux copropriétaires, ainsi que deux syndics inscrits sans résidence. Elle est idempotente (identifiants `scn-s<graine>-…`).
- **Catalogue du marché.** Il couvre aussi l'espagnol. Les états d'annonce se limitent à ceux que l'API accepte (`neuf`, `bon`, `acceptable`, `mauvais`).

## Ce qui est supprimé, et ce qui ne l'est jamais

Supprimé (après sauvegarde) :

- les lignes rattachées aux marqueurs du générateur : copropriétés
  `creation_key = seedgen:s<graine>:<n>`, sociétés de syndic
  `created_by = seedgen:s<graine>`, comptes `@s<graine>.seedgen.mizan.test`,
  et tout ce qui en dépend (clés étrangères et références connues sans clé
  étrangère) ;
- les fichiers enregistrés par ces lignes et référencés par aucune autre ;
- les **résidus prouvés** d'anciens lancements : lignes qui pointent vers un
  compte ou une copropriété supprimés et dont l'identifiant est produit par
  une graine connue du générateur (ou qui portent un texte écrit uniquement
  par lui).

Jamais supprimé :

- les données de démonstration (`pnpm db:seed`, copropriétés « Résidence
  Atlas » et « Jardins d'Agdal ») utilisées par les tests de non-régression ;
- les comptes et données non générés (ex. comptes créés à la main) ;
- les lignes orphelines dont l'origine n'est pas prouvée (laissées par les
  suites de tests ou des actions manuelles) : elles sont listées dans le
  rapport ;
- le schéma, les migrations, la configuration.

Les identifiants sont des UUID : aucune séquence n'est réinitialisée ; la
numérotation des documents (`document_sequences`) est propre à chaque
copropriété et disparaît avec elle.

### Restaurer une sauvegarde

```powershell
pg_restore --clean --if-exists --no-owner --dbname <base locale> scripts\.seedgen\backups\<horodatage>\<base>.dump
Copy-Item scripts\.seedgen\backups\<horodatage>\files\* artifacts\api-server\uploads\
```

`scripts/.seedgen/` est ignoré par git (il contient des sauvegardes de base).

## Sécurité

- **Base locale uniquement** : écriture refusée si l'hôte de `DATABASE_URL`
  n'est pas local, si le nom de la base ou de l'hôte contient « prod », ou si
  `NODE_ENV=production`, sans option de contournement. La chaîne de connexion
  n'est jamais affichée ni écrite dans les sauvegardes.
- **Aucun envoi réel** : insertion directe, aucun e-mail, SMS, notification
  push ni paiement. Les paiements SaaS portent le fournisseur `test-sandbox`.
- **Annulation** : un échec pendant `generate` retire tout le lancement.
- **Données fictives** : noms combinés au hasard (latins et arabes), e-mails
  sur un domaine `.test` réservé, RIB de test, sociétés inventées.

## Fichiers générés

Emplacement : `artifacts/api-server/uploads/` (stockage local de l'API,
chemins `/objects/uploads/<id>.pdf|png`). Chaque fichier est enregistré dans
`storage_objects` et relié à son objet métier ; le téléchargement passe par
les routes existantes (`/documents/:id/download-url`, `/storage/objects/...`)
et leurs contrôles d'accès.

PDF (bibliothèque pdfmake de l'API, police Amiri pour le texte arabe), avec
« DOCUMENT FICTIF — TEST » en filigrane et en pied de page :

| Document | Contenu tiré de la base | Rattachement |
|---|---|---|
| Règlement de copropriété | immeubles, lots, tantièmes | `documents` (résidents) |
| Budget prévisionnel | postes T1–T4, charges, réserve | `documents` (copropriétaires) |
| Convocation | date, heure, lieu, ordre du jour | `documents`, réunion |
| Procès-verbal | présents, procurations, résolutions et votes en tantièmes | `documents`, réunion |
| Avis d'appel de fonds | lot, tantièmes, période, montant, réglé, reste, échéance | `documents` (lot) |
| Reçu de paiement | n° de reçu, montant, mode, écriture comptable | `documents` (personnel) |
| Ordre de virement | paiement déclaré en attente de validation | `appel_payments.proof_url` |
| Facture / devis fournisseur | lignes de facture, total | `invoices.proof_url`, `expenses.proof_url` |
| Contrat de maintenance | dates, montants, reconduction, statut | `contrats_prestataires.document_url`, `documents` (conseil) |
| Rapport d'intervention + facture | travaux terminés ou à valider | `travaux.report_url`, `invoice_url` |
| Devis de réparation | sinistres réparés | `sinistres.invoice_url` |
| Autres documents de la bibliothèque | avis, assurance, diagnostic, courrier, note, carnet | `documents` |

Images PNG réelles (480×320, décodables) : photos de travaux, de sinistres,
de réclamations, d'annonces de la marketplace.

Aucune mention légale ou fiscale n'est inventée (pas de TVA, de pénalité,
d'article de loi ni de mention « certifié »).

## Comptes de test (environnement de développement uniquement)

Tous les comptes générés partagent le même mot de passe de test, haché avec
bcrypt (coût 10, comme l'API) : **`MizanTest#2026`**.

Trouver des comptes par rôle (graine par défaut) :

```sql
SELECT role, status, email, syndicate_id FROM users
WHERE email LIKE '%@s20261019.seedgen.mizan.test' AND status = 'active'
ORDER BY role, email;
```

Les comptes « pending » doivent changer leur mot de passe à la connexion ; les
comptes « inactive » et « suspended » sont refusés par l'API (comportement
voulu, pour tester ces cas).
