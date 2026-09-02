# Configuration PostgreSQL locale

## Prerequis

- PostgreSQL 18.6 installé dans `C:\Program Files\PostgreSQL\18`
- Instance accessible sur `localhost:5432`
- Node.js 24 ou plus récent et pnpm

Le projet utilise Drizzle ORM avec PostgreSQL. Les anciens fichiers
`scripts/seed-base-data.sql` et `scripts/seed-all-tables.sql` sont historiques et
ne doivent pas être exécutés: le schéma actuel est défini dans
`lib/db/src/schema.ts` et le seed compatible est `scripts/src/seed.ts`.

## Configuration `.env`

Créer ou compléter le fichier `.env` à la racine:

```dotenv
DATABASE_URL=postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/syndycat_global_cps
PORT=5000
JWT_SECRET=changez-cette-valeur-en-local
```

`.env` est ignoré par Git. Ne committez jamais le mot de passe réel.

## Création de la base

Depuis PowerShell, saisir le mot de passe directement lorsque PostgreSQL le
demande:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -W -h localhost -p 5432 -U postgres syndycat_global_cps
```

Si la base existe déjà, conserver-la et passer à l’étape suivante. Ne jamais
utiliser `DROP DATABASE` automatiquement.

## Schéma et seed

```powershell
pnpm db:push
pnpm db:seed
```

`db:push` applique le schéma Drizzle. `db:seed` est réexécutable: les lignes
de démonstration utilisent des identifiants fixes et `onConflictDoNothing()`.

Pour exécuter les deux étapes:

```powershell
pnpm db:setup
```

## Vérification

```powershell
pnpm db:status
```

Cette commande affiche la base courante et le nombre de tables publiques.
Pour inspecter les contraintes et index:

```powershell
psql -W -h localhost -p 5432 -U postgres -d syndycat_global_cps
```

Puis:

```sql
SELECT current_database();
\dt
\d+ users
\d+ buildings
\d+ lots
```

## Démarrage du backend

```powershell
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

Le backend utilise `DATABASE_URL` et charge automatiquement le `.env` racine
au démarrage. Redis reste optionnel; sans `REDIS_URL`, le rate limiting utilise
le stockage mémoire.

## Dépannage

- `DATABASE_URL environment variable is required`: vérifier le `.env` racine.
- `password authentication failed`: vérifier le mot de passe du rôle `postgres`.
- `database does not exist`: créer `syndycat_global_cps` avec `createdb`.
- `ECONNREFUSED`: vérifier que PostgreSQL écoute sur le port `5432`.
- `relation does not exist`: exécuter `pnpm db:push` avant le seed.