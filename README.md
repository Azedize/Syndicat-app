# MIZAN

Gestion de copropriété : syndic, copropriétaires, locataires, super admin.
Monorepo pnpm avec une application mobile Expo et une API Express / PostgreSQL.

| Dossier | Contenu |
|---|---|
| `artifacts/mobile` | Application iOS et Android (Expo SDK 58, Expo Router) |
| `artifacts/api-server` | API REST `/api` (Express 5, Drizzle) |
| `lib/db` | Schéma et migrations de la base |
| `scripts` | Tests d'intégration et de bout en bout, outils de base de test |
| `docs` | Documentation |

## Démarrer
- Installation et commandes : [docs/development/LOCAL_RUN_COMMANDS.md](docs/development/LOCAL_RUN_COMMANDS.md)
- Sur un téléphone hors réseau local : `powershell -ExecutionPolicy Bypass -File scripts\dev-phone.ps1`
- Tests sur la base isolée : `bash scripts/run-all-tests-testdb.sh`

## Documentation
- Architecture : [docs/architecture/SYSTEM_OVERVIEW.md](docs/architecture/SYSTEM_OVERVIEW.md), [PROJECT_STRUCTURE.md](docs/architecture/PROJECT_STRUCTURE.md), [ARCHITECTURE_DECISIONS.md](docs/architecture/ARCHITECTURE_DECISIONS.md)
- Règles de code : [docs/development/CODING_STANDARDS.md](docs/development/CODING_STANDARDS.md)
- Suivi des travaux : [docs/PROJECT_PROGRESS.md](docs/PROJECT_PROGRESS.md)
- Sécurité : [docs/security/SECURITY_LOG.md](docs/security/SECURITY_LOG.md)
