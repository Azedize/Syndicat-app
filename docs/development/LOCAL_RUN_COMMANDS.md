# Commandes de lancement local

Toutes les commandes ci-dessous sont prévues pour Windows PowerShell depuis
la racine du projet:

```powershell
cd C:\Users\Dell\OneDrive\Documents\zip-repl
pnpm install
```

## 1. PostgreSQL

Vérifier que PostgreSQL 18 écoute sur le port `5432`:

```powershell
Test-NetConnection localhost -Port 5432 -InformationLevel Quiet
```

Si le résultat est `False`, démarrer l’instance avec `pg_ctl`:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" start `
  -D "C:\Program Files\PostgreSQL\18\data" `
  -l "$env:TEMP\postgresql.log"
```

Créer la base uniquement si elle n’existe pas:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -W -h localhost -p 5432 -U postgres -d postgres -c "SELECT 1 FROM pg_database WHERE datname = 'syndycat_global_cps';"
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -W -h localhost -p 5432 -U postgres syndycat_global_cps
```

La seconde commande doit être exécutée seulement si la première ne retourne
pas `1`. Ne jamais utiliser `DROP DATABASE`, `DROP TABLE` ou `TRUNCATE`.

## 2. Variables d’environnement

Compléter `.env` à la racine. Ne jamais mettre le mot de passe réel dans
`.env.example` ni dans Git:

```dotenv
DATABASE_URL=postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/syndycat_global_cps
PORT=5000
JWT_SECRET=une-cle-locale-d-au-moins-32-caracteres
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-adresse@gmail.com
SMTP_PASS=votre-mot-de-passe-application-gmail
USE_TLS=true
SMTP_SECURE=false
SMTP_FROM=votre-adresse@gmail.com
EXPO_PUBLIC_API_URL=http://10.0.2.2:5000/api
```

Pour une session PowerShell temporaire, sans modifier `.env`:

```powershell
$env:DATABASE_URL = "postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/syndycat_global_cps"
$env:JWT_SECRET = "une-cle-locale-d-au-moins-32-caracteres"
$env:PORT = "5000"
```

### Variables ajoutées le 2026-10-24

| Variable | Où | Effet |
|---|---|---|
| `OUTBOUND_DELIVERY=off` | API | Aucun e-mail, SMS ni notification push ne quitte la machine. Chaque tentative est journalisée « skipped », jamais « envoyée ». **À utiliser pour toute API de test** : `.env` contient de vrais identifiants SMTP. |
| `RATE_LIMIT_PROFILE=test` | API | Seuils anti-abus relevés pour les suites de tests. N'est pris en compte **que** si l'API est branchée sur la base locale `syndycat_test` et hors `NODE_ENV=production` ; sinon, les seuils de production s'appliquent (60 / 10 / 500). |
| `SUPPORT_EMAIL` | API | Adresse de support affichée dans les pages produites par l'API. Absente ⇒ aucune ligne de contact (pas d'adresse inventée). |
| `EXPO_PUBLIC_CONTACT_EMAIL`, `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_EMAIL`, `EXPO_PUBLIC_CONTACT_PHONE`, `EXPO_PUBLIC_LEGAL_ENTITY` | Mobile (au build) | Coordonnées officielles (`constants/contact.ts`). Absentes ⇒ l'écran l'indique (« à compléter ») et ne propose aucun lien. |
| `TEST_EMAIL_ROOT` | Scripts | Domaine des comptes de test (défaut `seedgen.mizan.test`). Doit se terminer par `.test`, `.invalid`, `.example` ou `.localhost`. |
| `LOCAL_UPLOADS_DIR` | API, scripts | Dossier des fichiers. La base de test utilise `artifacts/api-server/uploads-test` (imposé par `testdb`). |

## 3. Schéma et données

Le schéma est versionné dans `lib/db/drizzle/` (migrations SQL).

Base neuve :

```powershell
pnpm db:migrate
pnpm db:seed
pnpm db:status
```

Base existante créée autrefois avec `db:push` (une seule fois) :

```powershell
pnpm --filter @workspace/db run db:mark-baseline
pnpm db:migrate
```

Après une modification de `lib/db/src/schema.ts` :

```powershell
pnpm db:generate   # crée lib/db/drizzle/NNNN_*.sql — à relire puis commiter
pnpm db:migrate
```

`pnpm db:push` reste possible en développement local uniquement, jamais en
production. Le seed est réexécutable et ne doit pas créer de doublons.

## 3 bis. Tests de régression (API lancée)

Les suites parlent à l’API en HTTP et nettoient les données qu’elles créent.
Lancer l’API de test **avec l’envoi d’emails désactivé** (sinon les emails
partent réellement via le SMTP de `.env`) :

```powershell
cd artifactspi-server
pnpm run build
$env:SMTP_HOST = ""; $env:PORT = "5055"
node --env-file=../../.env ./dist/index.mjs
```

Dans un autre terminal :

```powershell
$env:API_BASE_URL = "http://localhost:5055/api"
pnpm --filter @workspace/scripts run rbac-regression:test
pnpm --filter @workspace/scripts run auth-security:test
pnpm --filter @workspace/scripts run finance-integrity:test
pnpm --filter @workspace/scripts run documents-security:test
pnpm --filter @workspace/scripts run scenario-e2e:test
pnpm --filter @workspace/scripts run units:test
pnpm --filter @workspace/scripts run condominiums:test
pnpm --filter @workspace/scripts run finance-workflow:test
pnpm --filter @workspace/scripts run documents-library:test
pnpm --filter @workspace/scripts run claims:test
pnpm --filter @workspace/scripts run allocation:test
pnpm --filter @workspace/scripts run funds-calls:test
pnpm --filter @workspace/scripts run document-library-resident:test
pnpm --filter @workspace/scripts run official-documents:test
```

`allocation:test` crée sa copropriété (lots, budget approuvé, dépenses) et
teste clés, prévisualisation, confirmation, corrections et annulations.

`document-library-resident:test` crée deux copropriétés (résidents à un et
deux lots, locataire) et vérifie ce que chaque résident voit, ouvre et
télécharge. `official-documents:test` n'a pas besoin de l'API : il génère
chaque modèle officiel en PDF (dossier `OUT_DIR`, par défaut le dossier
temporaire) et vérifie qu'aucun contenu inventé n'y figure.

`funds-calls:test` crée sa copropriété (clé, compte bancaire par défaut,
dépenses) et teste brouillons, publication, paiements, rappels, ajustements,
extournes et rapprochement. Les bornes d'échéance utilisent `APP_TIMEZONE`
(défaut Africa/Casablanca) : le même fuseau doit être configuré pour l'API et
pour le test.

L'API limite chaque adresse à 500 requêtes par minute : enchaînées sans pause,
les dernières suites reçoivent des 429. Laisser une minute entre les suites
lourdes (`documents-library`, `claims`, `allocation`) ou les lancer séparément.

`claims:test` crée sa copropriété et passe tout le circuit des réclamations
par l'API. Pour tester une panne de notification, il pose un trigger
PostgreSQL temporaire sur `alerts` (retiré à la fin, même en cas d'échec).

`documents-library:test` crée sa copropriété, teste téléversements, audiences,
liens, versions, archivage et accès aux fichiers, puis supprime lignes et
fichiers. Elle démarre elle-même une seconde API (port 5056) dont le dossier de
stockage est inutilisable, pour tester une panne : le port 5056 doit être libre
et `artifacts/api-server/dist` construit.

`finance-workflow:test` crée sa propre copropriété (en base), puis passe tout
le circuit financier par l'API : paiements déclarés / rejetés / validés /
remboursés, paiements partiels, dépenses, confirmation de paiement reçue en
double, relevé bancaire et clôture du rapprochement, et compare les chiffres
de tous les écrans. Elle supprime tout à la fin.

`condominiums:test` crée une société de syndic réelle (inscription par OTP),
trois copropriétés et deux comptes, vérifie l'isolation, les changements de
copropriété, la révocation immédiate, le cycle de vie et le portefeuille, puis
supprime tout. Elle se connecte plusieurs fois : la lancer sur une API de test
fraîchement redémarrée (comme `journeys:test`).

Parcours réels complets (Ahmed / Résidence Hayat, Ali / Résidence Hadika,
construits de zéro par l’API puis supprimés) :

```powershell
pnpm --filter @workspace/scripts run journeys:test
```

Pour **garder** ces deux résidences et rejouer les parcours à la main sur un
téléphone, ajouter `$env:KEEP_FIXTURES = "1"` avant la commande : les emails et
mots de passe d’Ahmed, Leila, Karim, Samira et Ali sont affichés à la fin.

`/api/auth` est limité (60 requêtes / 15 min / IP sur les endpoints
d’identifiants) et la suite des parcours se connecte de nombreuses fois :
**redémarrer l’API de test entre `journeys:test` et `auth-security:test`**.
Les suites ne modifient plus les appels de fonds de démonstration
(`adf_*`) : elles génèrent leurs propres appels sur des périodes `2099-*`.

## 3 ter. Base de test isolée `syndycat_test` (2026-10-24)

Une base dédiée, sur le même serveur local, sans aucune donnée copiée de la
base de travail : tout y est généré (domaines réservés, fichiers à part).

```powershell
cd scripts
pnpm run testdb -- info        # bases source / cible, état (lecture seule)
pnpm run testdb -- create      # crée syndycat_test si absente
pnpm run testdb -- migrate     # migrations du dépôt
pnpm run testdb -- reference   # données de référence + comptes de démonstration (.test)
pnpm run testdb -- generate    # seedgen run + catalogue du marché + scénarios limites
pnpm run testdb -- exec -- <commande>   # n'importe quelle commande sur la base de test
pnpm run testdb -- drop --yes  # supprime UNIQUEMENT syndycat_test
```

`testdb` change seulement le nom de base de `DATABASE_URL` et refuse toute
autre cible ; il impose `OUTBOUND_DELIVERY=off` et `LOCAL_UPLOADS_DIR=uploads-test`.

Lancer les deux API de test (5055 : base de travail, 5056 : base de test,
envoi sortant coupé sur les deux) :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restart-test-apis.ps1
```

Suites sur la base de test :

```powershell
pnpm run testdb -- exec env API_BASE_URL=http://localhost:5056/api pnpm run -s journeys:test
pnpm run email-accounts:test; pnpm run expense-governance:test; pnpm run marketplace-moderation:test
pnpm run i18n:test
```

Restauration de la base de test : la recréer (`drop --yes`, `create`, `migrate`,
`reference`, `generate`). Restauration de la base de travail : `pg_restore -c -d
syndycat_global_cps <dossier de sauvegarde>/syndycat_global_cps.dump`, puis
recopier `files/` dans `artifacts/api-server/uploads/`.

## 3 quater. Audits, corrections soumises à validation, restauration éprouvée (2026-10-25)

```powershell
cd scripts
# Audits en lecture seule (transaction READ ONLY) sur la base de travail
node --env-file=../.env --import=tsx src/audits/overdue-partial-audit.ts --plan .seedgen/plans/<date>-overdue-partial.json
node --env-file=../.env --import=tsx src/audits/sensitive-accounts-audit.ts

# Corrections en attente : simulation par défaut, --apply seulement après validation
node --env-file=../.env --import=tsx src/fixes/2026-10-25-pending-decisions.ts overdue-partial --plan <plan.json>
node --env-file=../.env --import=tsx src/fixes/2026-10-25-pending-decisions.ts redact-secrets
node --env-file=../.env --import=tsx src/fixes/2026-10-25-pending-decisions.ts fixture-logs
node --env-file=../.env --import=tsx src/fixes/2026-10-25-pending-decisions.ts rollback <fichier de retour arrière> --apply

# Éprouver une sauvegarde sans toucher la base de travail
node --env-file=../.env --import=tsx src/restore-check.ts restore .seedgen/backups/<date>/syndycat_global_cps.dump
node --env-file=../.env --import=tsx src/restore-check.ts compare
node --env-file=../.env --import=tsx src/restore-check.ts exec -- <commande>   # sur la copie
node --env-file=../.env --import=tsx src/restore-check.ts drop --yes
```

`restore-check` ne restaure que dans une base neuve `syndycat_restore_check` ;
il refuse de restaurer par-dessus une base existante.

Nouveaux tests : `email-delivery-status:test`, `screens-access:test`, `contacts-config:test`.

## 4. Backend Express

Ouvrir un nouveau terminal PowerShell:

```powershell
cd C:\Users\Dell\OneDrive\Documents\zip-repl
Test-NetConnection localhost -Port 5000 -InformationLevel Quiet
```

Si le résultat est `True`, l'API est déjà démarrée: ne pas relancer une
seconde instance. Vérifier directement son état:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5000/api/healthz
```

Si le résultat est `False`, démarrer l'API:

```powershell
pnpm --filter @workspace/api-server run dev
```

Tester l’API:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5000/api/healthz
```

Réponse attendue: HTTP `200` avec `status: ok`.

## 5. Frontend Expo

Ouvrir un autre terminal PowerShell:

```powershell
cd C:\Users\Dell\OneDrive\Documents\zip-repl
$env:EXPO_PUBLIC_API_URL = "http://10.0.2.2:5000/api"
Test-NetConnection localhost -Port 8081 -InformationLevel Quiet
```

Si le résultat est `True`, Expo est déjà démarré. Si le résultat est `False`,
lancer Expo:

```powershell
pnpm --filter @workspace/mobile exec expo start --localhost --clear --port 8081
```

(Téléphone physique : voir « Expo Go sur iPhone » ci-dessous, mode `--lan`.)

Expo démarre sur `http://localhost:8081`. Utiliser le terminal Expo pour
ouvrir l’application dans un émulateur, un appareil connecté ou le navigateur.

Téléphone physique : l’adresse `10.0.2.2` n’existe que dans l’émulateur
Android. En développement, l’app la remplace automatiquement par l’IP du PC
vue par Metro, mais le téléphone doit pouvoir joindre le port 5000 : même
Wi-Fi classé « Privé » dans Windows (un réseau « Public » ou un Wi-Fi de café
bloque la connexion), ou en USB :

```powershell
adb reverse tcp:5000 tcp:5000
$env:EXPO_PUBLIC_API_URL = "http://localhost:5000/api"
```

### Expo Go sur iPhone (SDK 58, 2026-10-24)

L’application est passée à Expo SDK 58 (`expo` 58.0.17, React Native 0.88,
React 19.3), la version d’Expo Go disponible sur l’App Store. `--localhost`
n’est accessible qu’au PC : pour un téléphone, lancer en mode réseau local.

```powershell
# Une fois (PowerShell administrateur) : ouvrir Metro et l’API sur le réseau privé
New-NetFirewallRule -DisplayName "Mizan dev" -Direction Inbound -Protocol TCP -LocalPort 8081,5000 -Profile Private -Action Allow

# Après une mise à jour des dépendances : réinstaller puis vider le cache Metro
cd C:\Users\Dell\OneDrive\Documents\zip-repl
pnpm install
cd artifacts\mobile
pnpm exec expo start --lan --port 8081 -c     # ou : pnpm run dev
```

Scanner le QR code avec l’appareil photo de l’iPhone (même Wi-Fi « Privé »).
L’adresse de l’API est déduite de l’IP du PC vue par Metro
(`lib/login-transport.ts`), même si `EXPO_PUBLIC_API_URL` vaut `10.0.2.2` ou
`localhost`.

Mode tunnel (téléphone sur un autre réseau) : le tunnel ne transporte que
Metro, pas l’API. Donner alors une adresse de l’API joignable par le téléphone :

```powershell
$env:EXPO_PUBLIC_API_URL = "http://<IP-du-PC>:5000/api"   # ou une URL publique
pnpm exec expo start --tunnel --port 8081 -c   # ou : pnpm run dev:tunnel
```

`pnpm run dev:localhost` garde l’ancien mode (navigateur, émulateur).

## 6. Lancement rapide

Terminal 1, PostgreSQL:

```powershell
Test-NetConnection localhost -Port 5432 -InformationLevel Quiet
```

Terminal 2, base:

```powershell
pnpm db:setup
```

Terminal 3, backend:

```powershell
pnpm --filter @workspace/api-server run dev
```

Terminal 4, frontend:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://10.0.2.2:5000/api"
pnpm --filter @workspace/mobile run dev
```

## 7. Vérifications utiles

```powershell
pnpm run typecheck
pnpm db:status
Invoke-WebRequest -UseBasicParsing http://localhost:5000/api/healthz
```

Les SMS (ZimSend) sont nécessaires pour l’inscription d’un syndic
(vérification du téléphone) : variables `ZIMSEND_API_KEY`,
`ZIMSEND_CLIENT_ID`, `ZIMSEND_DEVICE_ID`, `ZIMSEND_BASE_URL` (en `https://`).
L’API signale au démarrage les variables manquantes ou mal nommées.

Redis et SMTP sont optionnels en local. Sans `REDIS_URL`, le rate limiting
utilise la mémoire; sans SMTP, les emails ne sont pas envoyés. Pour Gmail,
utiliser un mot de passe d’application avec la validation en deux étapes;
ne jamais utiliser le mot de passe principal du compte.
## 8. Données de test réalistes (base locale uniquement)

Générateur reproductible (≈ 1 000 utilisateurs, 60 copropriétés, PDF et images
réels). Guide complet, comptes de test, sauvegarde et restauration :
`docs/database/DATABASE_SEEDING_GUIDE.md`.

```powershell
pnpm --filter @workspace/scripts run seedgen -- run --dry-run   # plan, aucune écriture
pnpm --filter @workspace/scripts run seedgen -- run             # sauvegarde, nettoyage, génération, contrôles, rapport
pnpm --filter @workspace/scripts run seedgen -- files-check     # fichiers présents et décodables
$env:API_BASE_URL = "http://localhost:5000/api"; pnpm --filter @workspace/scripts run seedgen:api
```

L’écriture est refusée si `DATABASE_URL` ne désigne pas une base locale,
contient « prod », ou si `NODE_ENV=production`. Les sauvegardes sont dans
`scripts/.seedgen/backups/` (ignoré par git).
