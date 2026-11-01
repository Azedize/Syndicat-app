# Vue d'ensemble du système

MIZAN est une application de gestion de copropriété (syndic, copropriétaires, locataires, super admin). Elle se compose de deux applications et de deux bibliothèques partagées, regroupées dans un monorepo pnpm.

```text
 Téléphone / navigateur                         Serveur                         Données
┌──────────────────────┐   HTTPS /api   ┌──────────────────────────┐   SQL   ┌──────────────┐
│ artifacts/mobile     │ ─────────────▶ │ artifacts/api-server     │ ──────▶ │ PostgreSQL   │
│ Expo SDK 58          │                │ Express 5 (esbuild)      │         │ (Drizzle)    │
│ Expo Router          │ ◀── push ───── │ jobs planifiés           │         └──────────────┘
│ React Query, contexts│                │ fichiers : uploads/      │ ──────▶  stockage local
└──────────────────────┘                └──────────────────────────┘          ou objet
            │                                       │
            └──────── lib/db (schéma, migrations) ──┘ (côté serveur et scripts)
```

| Partie | Rôle | Technologies |
|---|---|---|
| `artifacts/mobile` | Application iOS, Android et web | Expo 58, React Native 0.88, Expo Router, Reanimated 4, TypeScript |
| `artifacts/api-server` | API REST `/api`, authentification, droits, PDF, e-mails, notifications, jobs | Node.js, Express 5, Drizzle ORM, pino, esbuild |
| `lib/db` | Schéma Drizzle, migrations SQL versionnées (`drizzle/0000…0018`) | Drizzle, PostgreSQL |
| `lib/api-zod` | Schémas Zod partagés (aujourd'hui : `HealthCheckResponse` seulement) | Zod |
| `lib/shell-quote` | Remplacement local d'une dépendance (override pnpm) | — |
| `scripts` | Tests d'intégration et de bout en bout, seed, outils de base de données | tsx, Node.js |

## Principes qui ne changent pas
- **Isolation des copropriétés :** chaque requête est filtrée par le syndicat du jeton (`lib/scope.ts`, `lib/syndicate-filter.ts`, `lib/access.ts`).
- **Droits vérifiés côté serveur :** `middleware/auth.ts` (`requireAuth`, `requireRole`, `requireAdmin`, `requireSuperAdmin`). L'interface ne fait que masquer.
- **Écriture conditionnée à l'abonnement :** `middleware/subscription.ts`.
- **Fichiers protégés :** tickets de téléchargement et contrôle d'accès (`lib/file-access.ts`, `lib/document-access.ts`).
- **Montants :** calculs exacts côté serveur, transactions SQL pour les paiements.

## Pour aller plus loin
- Arborescence : [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
- Application mobile : [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)
- API : [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)
- Dépendances entre modules : [MODULE_DEPENDENCIES.md](MODULE_DEPENDENCIES.md)
- Décisions : [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)
- Règles de code : [../development/CODING_STANDARDS.md](../development/CODING_STANDARDS.md)
- Lancer le projet : [LOCAL_RUN_COMMANDS.md](../development/LOCAL_RUN_COMMANDS.md)
- Sécurité : [SECURITY_LOG.md](../security/SECURITY_LOG.md) ; base de données : [DATABASE_TABLES_INVENTORY.md](../database/DATABASE_TABLES_INVENTORY.md)
