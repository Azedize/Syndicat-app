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

```powershell
pnpm db:push
pnpm db:seed
pnpm db:status
```

Le seed est réexécutable et ne doit pas créer de doublons.

## 4. Backend Express

Ouvrir un nouveau terminal PowerShell:

```powershell
cd C:\Users\Dell\OneDrive\Documents\zip-repl
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
pnpm --filter @workspace/mobile run dev
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