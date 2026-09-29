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
pnpm --filter @workspace/scripts run journeys:test
pnpm --filter @workspace/scripts run audit-regression:test
```

`/api/auth` est limité (60 requêtes / 15 min / IP sur les endpoints
d’identifiants) : redémarrer l’API de test si la suite auth est relancée
plusieurs fois de suite.

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

Expo démarre sur `http://localhost:8081`. Utiliser le terminal Expo pour
ouvrir l’application dans un émulateur, un appareil connecté ou le navigateur.

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

Redis et SMTP sont optionnels en local. Sans `REDIS_URL`, le rate limiting
utilise la mémoire; sans SMTP, les emails ne sont pas envoyés. Pour Gmail,
utiliser un mot de passe d’application avec la validation en deux étapes;
ne jamais utiliser le mot de passe principal du compte.