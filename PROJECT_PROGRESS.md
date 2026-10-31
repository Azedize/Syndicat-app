# Project Progress

## 2026-09-02

### Completed
- Confirmed PostgreSQL 18 is running on localhost:5432.
- Confirmed database `syndycat_global_cps` is reachable and contains 103 public tables.
- Confirmed API health endpoint returns HTTP 200 on port 5000.
- Confirmed seeded admin login succeeds with HTTP 200 for `syndic@andalous.ma`.
- Fixed mobile authentication error mapping: only HTTP 401 is shown as invalid credentials; server/network failures now use a dedicated localized message.
- Migrated native access and refresh token storage to Expo SecureStore, with legacy AsyncStorage migration and web fallback.
- Replaced email OTP generation with cryptographically secure `crypto.randomInt`.
- Changed subscription verification to fail closed with HTTP 503 on database errors instead of allowing writes.
- Fixed syndicate onboarding logo upload to use the authenticated central API client and configured API URL.
- Centralized mobile API URL resolution for shared requests and uploads, with a consistent local port default of 5000.
- Migrated legacy document, finance, chat, invoice, marketplace, and profile screens to the shared API URL helper.
- Normalized escalation letter URLs, including stored `/api/...` paths and absolute URLs, and removed the final mobile 8080 fallback.
- Improved welcome CTA layout: balanced mobile button widths and prevented awkward wrapping of the platform discovery label.
- Localized the welcome theme toggle label using the existing French, English, Arabic, and Spanish translations.
- Corrected the welcome CTA responsive layout after visual verification: removed aggressive text shrinking and stacked actions below 520px.
- Protected pending registration data, including the password between registration and email OTP verification, with SecureStore on native platforms.
- Normalized login emails case-insensitively and aligned change-password minimum length with registration policy.
- Enabled secure self-onboarding for a new `syndicate_admin` without a syndicate, while preventing client-controlled admin reassignment.
- Replaced in-memory email OTP send limiting with a durable PostgreSQL count over the last hour, preserving multi-instance enforcement.
- Added hourly OTP retention cleanup with a two-hour safety window, preserving verification and rate-limit accounting while preventing indefinite row growth.
- Required a recent verified email OTP before `POST /auth/register`, closing the direct-registration bypass while preserving the mobile OTP flow.
- Normalized emails in password recovery so uppercase or padded input resolves the same account as login and registration.
- Documented port checks before API/Expo startup to prevent duplicate-process `EADDRINUSE` failures.
- Adapted registration phone handling for Moroccan local (`05/06/07...`) and international formats, normalized to E.164 before API submission.
- Aligned registration phone placeholders and validation messages with the supported Moroccan local and international formats.
- Harmonized syndicate setup SMS send/verify with the same Moroccan phone normalization to E.164.
- Aligned invited-user password validation with the 8-character authentication policy and normalized invited-user emails.
- Fixed invited accounts being created as `pending` while the welcome flow instructed them to log in; invitation-created accounts are now active.

### Files changed
- `artifacts/mobile/context/AuthContext.tsx`
- `artifacts/mobile/app/login.tsx`
- `artifacts/mobile/context/LanguageContext.tsx`
- `artifacts/mobile/app/syndicate-setup.tsx`
- `artifacts/mobile/services/api.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `LOCAL_RUN_COMMANDS.md`
- `artifacts/mobile/app/register.tsx`
- `artifacts/mobile/context/LanguageContext.tsx`
- `artifacts/api-server/src/lib/otp-retention.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/routes/users.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/syndicates.ts`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/middleware/subscription.ts`
- `artifacts/mobile/app/syndicate-setup.tsx`
- `artifacts/mobile/lib/api.ts`
- `artifacts/mobile/lib/upload.ts`
- `artifacts/mobile/app/actes-administratifs.tsx`
- `artifacts/mobile/app/budget-previsionnel.tsx`
- `artifacts/mobile/app/charges.tsx`
- `artifacts/mobile/app/chat-thread.tsx`
- `artifacts/mobile/app/invoices.tsx`
- `artifacts/mobile/app/my-shop.tsx`
- `artifacts/mobile/app/profile.tsx`
- `artifacts/mobile/app/escalation.tsx`
- `artifacts/mobile/app/register.tsx`
- `artifacts/mobile/app/email-verify.tsx`
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/mobile/app/welcome.tsx`
- `artifacts/mobile/package.json`
- `pnpm-lock.yaml`
- `PROJECT_PROGRESS.md`

### Validation
- `pnpm db:status` passed.
- `pnpm --filter @workspace/mobile run typecheck` passed.
- `GET http://localhost:5000/api/healthz` returned HTTP 200.
- `POST http://localhost:5000/api/auth/login` returned HTTP 200 with `syndicate_admin` role.
- `pnpm --filter @workspace/mobile run typecheck` passed after SecureStore migration.
- `pnpm --filter @workspace/api-server run typecheck` passed after OTP hardening.
- `pnpm --filter @workspace/api-server run typecheck` passed after subscription enforcement hardening.
- `pnpm --filter @workspace/mobile run typecheck` passed after onboarding logo upload fix.
- `pnpm --filter @workspace/mobile run typecheck` passed after API URL centralization.
- `pnpm --filter @workspace/mobile run typecheck` passed after legacy screen URL migration.
- `pnpm --filter @workspace/mobile run typecheck` passed after escalation URL normalization.
- `pnpm --filter @workspace/mobile run typecheck` passed after welcome CTA styling fix.
- `pnpm --filter @workspace/mobile run typecheck` passed after welcome theme label localization.
- `pnpm --filter @workspace/mobile run typecheck` passed after CTA responsive correction.
- `pnpm --filter @workspace/mobile run typecheck` passed after pending registration storage hardening.
- `pnpm --filter @workspace/api-server run typecheck` passed after login normalization and password policy alignment.
- Runtime login with `SYNDIC@ANDALOUS.MA` returned HTTP 200 and the expected `syndicate_admin` role.
- `pnpm --filter @workspace/api-server run typecheck` passed after self-onboarding authorization change.
- `pnpm --filter @workspace/api-server run typecheck` passed after durable OTP rate-limit change.
- `pnpm --filter @workspace/api-server run typecheck` passed after password-recovery email normalization.
- Confirmed API already listening on port 5000 and Expo already listening on port 8081; documented reuse instead of launching duplicates.
- `pnpm --filter @workspace/mobile run typecheck` passed after Moroccan phone normalization.
- `pnpm --filter @workspace/mobile run typecheck` passed after phone-format UX alignment.
- `pnpm --filter @workspace/mobile run typecheck` passed after setup SMS normalization.
- `pnpm --filter @workspace/api-server run typecheck` passed after OTP retention scheduler integration.
- `pnpm --filter @workspace/api-server run build` passed after OTP retention scheduler integration.
- `pnpm --filter @workspace/api-server run typecheck` passed after invitation policy alignment.
- `pnpm --filter @workspace/api-server run build` passed after invitation policy alignment.
- `pnpm --filter @workspace/api-server run typecheck` passed after invited-account activation fix.
- `pnpm --filter @workspace/api-server run build` passed after invited-account activation fix.

### Remaining
- Review and harden multi-tenant authorization across all API routes.
- Verify SecureStore behavior on Android and iOS builds.
- Verify registration interruption, OTP resend, and pending plan continuation on Android and iOS builds.
- Add automated auth regression coverage for email normalization and password policy.
- Add an integration test for new-admin self-onboarding and duplicate-syndicate rejection.
- Add cleanup/retention for historical OTP rows without weakening rate-limit accounting.
- Add an integration test for concurrent OTP send requests and the five-per-hour boundary.
- Observe the OTP cleanup log after a clean API restart; current port 5000 is occupied by another API process.
- Add an automated integration test for direct registration rejection and OTP-verified registration success.
- Add automated auth regression coverage for password recovery email normalization.
- Keep startup checks aligned with any future development port changes.
- Add automated phone-format tests for local and international Moroccan numbers.
- Verify SMS send/verify with a configured ZimSend sandbox number.
- Test invited-user activation and welcome email delivery with a non-production account.
- Add a `mustChangePassword` field and first-login enforcement for temporary invitation credentials.
- Complete route-by-route tenant isolation review and negative authorization tests.
- Validate onboarding logo upload against local storage and deployed GCS configuration.
- Add versioned Drizzle migrations and reconcile legacy/current seeds.
- Replace local URL construction in remaining legacy screens with the shared API helper.
- Validate document and escalation links on Android, iOS, and web with configured production domains.
- Audit production configuration, jobs, uploads, payments, notifications, localization, accessibility, and responsive behavior.
- Add focused integration and role-journey tests.

### Blocked or not verified
- PostgreSQL credentials and external provider credentials were not exposed or changed.
- Full application production readiness is not claimed; only the listed checks were executed.

## 2026-09-26

### Completed
- Billing: syndicate admins can no longer self-activate a subscription (status changes are super_admin-only; admins may only cancel / toggle auto-renew).
- Subscription gate is deny-by-default (no subscription, `pending_payment`, open-ended `grace`, unknown status → read-only) and considers every subscription row, so a pending plan change never locks out a valid subscription. The 30-day trial is created in the syndicate-creation transaction.
- Appels de fonds: payment declaration only from payable states, proof must be the payer's own upload, "online" method removed until a real gateway exists; validation is one atomic transaction (conditional status update, sequential `REC-YYYY-NNNNNN` receipt, ledger transaction, cash entry) — fixes silent loss of ledger entries (FK mismatch) and double validation.
- Charge generation: idempotent (unique `lot × period × type`), divisor derived from the period (month/quarter/year), exact centime split (largest remainder).
- Budgets: created as draft/submitted only; approval requires an AG of the same syndicate (server-dated `votedAt`); approved amounts are locked; creation is transactional.
- Auth: HS256 pinned; refresh/reset tokens stored as SHA-256; refresh rotation is atomic with reuse detection (10 s grace); timing-safe login; bcrypt cost 12; `mustChangePassword` enforced server-side with a mobile change-password screen; team invitations no longer return or weaken temporary passwords.
- Rate limiting: strict limit only on credential endpoints plus a per-account login limit (previously `/auth/me` and `/auth/refresh` shared a 20/15 min per-IP budget).
- Session tokens removed from URLs: 5-minute GET-only download tickets (`POST /auth/file-ticket`) for PDFs/images; all mobile call sites migrated.
- Uploads verified by file signature; stored type/extension derived from content.
- SMS OTP persisted in PostgreSQL, Moroccan mobiles only, 3/hour per number; self-onboarding requires a server-verified phone.
- Scheduled jobs run once per interval platform-wide (`scheduled_job_runs` claim), not once per instance/restart.
- Cross-tenant references blocked (`findForeignReference`) in document generation, recovery/sale files, PV, cotisations, transactions.
- Notifications: alert audience enforced (residents no longer see team-only alerts); personal notifications (`alerts.recipient_user_id`, `notifyUser`) for payment declared/validated/rejected, new charge calls, ticket replies/resolution, personal documents.
- Personal documents (`documents.subject_user_id`): residents only see general documents and their own personal ones (list, detail, download, versions, signers, comments, files); publication of a personal document notifies only that person.
- Document lifecycle fix: second status transition (validated → published) returned 500 (duplicate version snapshot).
- Member onboarding: "add member" can invite the co-owner to the app in one step (member + account, forced password change); `POST /users` for a co-owner also creates the member record; duplicate member POST from the mobile context removed.
- Right of access (Loi 09-08): `GET /me/data-export` + "Exporter mes données" in settings.
- Ballot secrecy: removed client-side audit entry that linked a voter to their candidate; client audit writes restricted to the team and tagged `[client]`.
- DataContext: optimistic writes now surface server errors and resync instead of silently keeping unsaved changes; fake local "payments" (`payOrder`, `payCotisation`) removed.
- Database: 13 missing `syndicate_id` foreign keys (restrict on billing/financial tables), missing tenant indexes, versioned migrations (`lib/db/drizzle`, baseline + 2 idempotent migrations with backfill).
- Removed dead code: `twilioVerify.ts`, `phase1-cleanup.mjs`, `hello.ts`, unused mobile components, unused dependencies (API and mobile).

### Validation
- `pnpm run typecheck` passed (scripts, api-server, mobile); `pnpm --filter @workspace/api-server run build` passed; `expo export --platform web` bundled.
- Regression suites against a running API (SMTP disabled): RBAC 35/35, auth-security 44/44, finance-integrity 35/35, documents-security 28/28, scenario-e2e 48/48.
- Migrations verified on a fresh database and on the existing development database.

### Remaining
- Mobile/native: verify SecureStore, file tickets in `<Image>`, and the change-password redirect on Android/iOS builds.
- Legacy trade-union modules (`payslips` insert is non-functional, `cotisations` member flow requires a proof the UI never sends, union actions, national rankings) should be removed or redesigned.
- Funds are still pooled per syndicate (no per-copropriété bank account, ledger or bank reconciliation); no CMI integration; `members`/`users` identity split remains (linked by email).
- `.env` uses `ZIMSEND_CLES_API` whereas the code reads `ZIMSEND_API_KEY` — SMS is not configured.
- CIN encryption at rest not implemented (no API write path exists yet); CNDP declaration, processing register and hosting/transfer authorization are legal steps.
- Test runs earlier today sent 7 real emails through the configured SMTP (syndicate-created to example.invalid, 2 support-ticket notifications) before SMTP was disabled for tests.

## 2026-10-05 — Finance réelle par syndicat + parcours réels Android/iOS

### Finance (migration `0003_finance_ledger`)
- Nouvelles tables : `treasury_accounts` (banque / caisse, RIB marocain vérifié
  par clé mod 97), `ledger_entries` (journal numéroté JRN-AAAA-NNNNNN,
  **append-only** par trigger PostgreSQL ; corrections par extourne),
  `appel_payments` (historique des déclarations, paiements partiels),
  `expenses` (soumise → approuvée → payée), `bank_statement_lines` et
  `reconciliation_matches` (rapprochement bancaire manuel, sans API bancaire).
- `appels_de_fonds.amount_paid` (+ statuts `partially_paid`, `cancelled`).
- Soldes toujours calculés depuis le journal ; un virement validé crédite le
  compte bancaire (plus la caisse) ; la caisse ne peut pas devenir négative.
- Validation de paiement : verrou de ligne + transaction (reçu, écriture,
  registre) ; budget voté en AG requis pour émettre des appels ; justificatif
  obligatoire dès la déclaration.
- Routes : `/treasury/*`, `/expenses/*`, `/appels-de-fonds/:id/payments`,
  `/appels-de-fonds/:id/cancel`, `/budgets/:id/execution`, `/me/payments`,
  `PUT /finance/salaries/:id` (paiement réel d'un salaire).
- Modules hérités fermés en écriture (410) : `cotisations` (paiement membre
  impossible, reçus hors journal), `payment-proofs`, `POST /payslips`,
  `POST /finance/caisse`. Lecture conservée pour l'historique.
- Validation de travaux : crée une dépense approuvée (une seule), le
  paiement passe par le trésorier.
- Fuite corrigée : les justificatifs financiers ne sont plus lisibles par les
  autres résidents du même syndicat.

### Mobile (Android / iOS)
- Envoi de fichiers natif réparé (`FormData` `{uri,name,type}`) : justificatifs,
  factures, photos, logo — tous les uploads échouaient sur téléphone.
- SecureStore : clés invalides (`@…`) corrigées — la connexion échouait sur
  Android/iOS ; renouvellement automatique du jeton (15 min) dans `apiRequest`
  et retour à la connexion si la session est révoquée.
- Charges : paiement partiel, justificatif obligatoire (photo / galerie / PDF),
  vrai n° de lot, totaux serveur, justificatif consultable par le trésorier.
- Nouvel écran Trésorerie (comptes, journal, extourne, dépenses, rapprochement).
- Paiements : vue « Mes paiements » avec vrais reçus pour les copropriétaires ;
  registre avec totaux serveur ; faux QR « PAID », faux reçu texte et faux
  « rappel envoyé » supprimés.
- Accueil / profil : statut de charges réel (plus l'ancien module cotisations).
- Retirés : faux assistant « IA » (réponses figées, délai simulé, modules
  inexistants), badges « ISO 27001 / RGPD-CNDP / Cloud Maroc / 99.9% SLA ».

### Tests
- Référence 190/190 (rbac 35, finance 35, documents 28, scénarios 48, auth 44).
- Nouveaux parcours `journeys:test` : 135/135 (Hayat / Hadika de bout en bout).
- Migrations vérifiées sur base vierge (4 migrations, 110 tables, 2 triggers).
- Bundles natifs exportés (Android et iOS, Hermes).

### Incident de test (corrigé)
La suite finance modifiait l'appel de démo `adf_4` ; elle a validé une vraie
déclaration faite depuis l'app (compte de Mohammed) puis « restauré » l'appel.
Données remises dans leur état réel (déclaration en attente) ; la suite utilise
désormais ses propres appels sur `2099-05`.

## 2026-10-17 — Lots : propriété, copropriété, occupation, cycle de vie

Hiérarchie de l'application : syndicat (la copropriété, client de la
plateforme) → immeuble → étage → lot. Pas de niveau « organisation de syndic »
au-dessus : un compte syndic gère un syndicat.

### Base (migrations `0004_lot_ownership`, `0005_appel_debtors`)
- `lot_ownerships` : une ligne par propriétaire et par période (quote-part %,
  date de début / fin, motif). Une vente ou une donation ferme des périodes,
  n'en réécrit aucune. Reprise : 8 périodes créées depuis `lots.owner_id`.
- `lots` : `archived_at/by/reason`, `version` (modifications concurrentes),
  `updated_at` ; référence unique par immeuble parmi les lots actifs
  (insensible à la casse) ; `status` limité à occupied / rented / vacant ;
  `tenant_id` resynchronisé depuis les baux actifs.
- `appels_de_fonds.lot_id` passe en `ON DELETE RESTRICT` (un lot avec des
  appels ne peut plus être supprimé en effaçant l'historique financier).
- `appels_de_fonds.debtor_member_ids` : débiteurs figés à l'émission (les
  copropriétaires du moment). Une vente ne transfère jamais une dette.
- `members` : email unique **par syndicat** (une personne peut être
  copropriétaire dans plusieurs syndicats).

### API (`routes/lots.ts`, `lib/units.ts`)
- Liste : recherche (référence, propriétaire, locataire, titre foncier),
  filtres (immeuble, étage, type, occupation, propriétaire, archivés), tri,
  pagination, compteurs serveur.
- Fiche selon le rôle : équipe (tout), copropriétaire (ses lots, ses appels,
  ses périodes), locataire (lot + son bail, aucune donnée financière).
- Création validée et transactionnelle (types, étage obligatoire selon le
  type, propriétaires du syndicat, quotes-parts = 100 %), édition avec
  contrôle de version, changement de propriétaires avec date d'effet et
  confirmation obligatoire en cas d'impayés, entrée / sortie de locataire,
  archivage / restauration, suppression seulement sans historique, import
  avec rapport ligne par ligne (dry-run).
- Accès des résidents recalculés depuis le registre : un vendeur ou un
  locataire parti perd l'accès au lot ; contrôles centralisés dans travaux,
  travaux privatifs, sinistres, parking ; `/locataires` resynchronise le lot.
- Génération d'appels : lots archivés et lots à 0 tantième exclus.
- Rôles : registre (secrétaire, syndic) ; propriété, archivage, suppression
  (syndic) ; trésorier et conseil en lecture.

### Mobile
- Liste des lots : recherche et filtres serveur, création avec validation.
- Nouvel écran « Fiche du lot » (`app/lot-detail.tsx`) : identité, propriétaires
  et historique, occupation, situation financière par débiteur, documents,
  journal ; actions selon les permissions renvoyées par l'API.
- `components/FormSheet.tsx` : composants de formulaire partagés.

### Tests
- Nouvelle suite `units:test` : 65/65.
- Référence 190/190, parcours 135/135 (suites adaptées : étage fourni à la
  création, nettoyage des périodes de propriété).
- Migrations 0000→0005 sur base vierge (111 tables) ; bundles Android / iOS.

## 2026-10-17 — Sociétés de syndic, multi-copropriétés, contexte, portefeuille

Remplace la note « pas de niveau organisation » ci-dessus. Hiérarchie :
société de syndic (`organizations`) → copropriété (`syndicates`) → immeuble →
étage → lot. Une personne a un seul compte ; elle agit dans une copropriété à
la fois (le « contexte » de la session).

### Base (migration `0006_organizations`)
- `organizations`, `organization_members` (`org_admin` : syndic de toutes les
  copropriétés de la société ; `org_staff` : seulement celles où il est
  affecté), `syndicate_memberships` (un rôle d'équipe par copropriété, révocable,
  historisé : qui, quand, motif).
- `syndicates` : `organization_id`, cycle de vie `draft / active / suspended /
  archived` (motif, date, `archived_at`), devise ISO, langue, mois de début
  d'exercice, `creation_key` (idempotence) ; nom unique par société parmi les
  copropriétés non archivées.
- `refresh_tokens.context_syndicate_id` : un jeton de rafraîchissement reste
  attaché à la copropriété choisie.
- Reprise : chaque syndicat existant devient une société (`org_<id>`) dont ses
  syndics actifs sont administrateurs ; statut `inactive` → `suspended`.

### Contrôle d'accès (`lib/access.ts`, appliqué à chaque requête)
- Le rôle dans une copropriété est recalculé en base à chaque requête :
  administrateur de société → affectation active → rattachement du compte.
  Un jeton dont le droit a disparu (affectation retirée, rôle changé, compte
  désactivé, copropriété archivée) est refusé immédiatement (401
  `SESSION_CONTEXT_REVOKED`), y compris pour les tickets de fichiers ; les
  jetons de rafraîchissement du contexte retiré sont révoqués.
- Cycle de vie : brouillon (équipe seulement, pas d'appels de fonds), suspendue
  (lecture seule, 423), archivée (lecture seule, visible des seuls
  administrateurs de la société). Relances d'impayés limitées aux copropriétés
  actives. Société suspendue ⇒ ses copropriétés en lecture seule.
- `POST /auth/context` : changement de copropriété ; le serveur décide du rôle,
  l'ancien jeton de rafraîchissement est révoqué, l'action est journalisée.
  Un identifiant modifié dans l'URL, le corps ou un jeton forgé ne donne
  aucun accès.

### API (`routes/organizations.ts`)
- Sociétés : mes sociétés, création (plateforme), membres (dernier
  administrateur non retirable).
- Copropriétés : création en brouillon (validation, `Idempotency-Key`, nom
  unique), paramètres (devise verrouillée dès qu'il existe des écritures ou
  des appels), transitions de statut contrôlées (activation ⇒ au moins un
  immeuble ; archivage ⇒ motif et aucun paiement en attente de validation ;
  rien n'est supprimé ni transféré).
- Affectations par copropriété : affecter par email, changer le rôle, retirer.
- Portefeuille : chiffres calculés par PostgreSQL par copropriété, définitions
  renvoyées avec les chiffres, montants par devise, copropriétaires distincts
  (une personne présente dans deux copropriétés comptée une fois), détail des
  impayés et des incidents d'une copropriété autorisée.
- L'inscription d'un syndic (`POST /syndicates`) crée aussi sa société.

### Mobile (Android / iOS)
- « Mes copropriétés » (`app/coproprietes.tsx`) : copropriétés accessibles,
  rôle dans chacune, changement de contexte.
- « Portefeuille » (`app/portefeuille.tsx`) : totaux et définitions, liste par
  copropriété, détail impayés / incidents, création, statut, équipe.
- Au changement de copropriété, toutes les données en mémoire sont
  reconstruites (`ContextScope` dans `_layout.tsx` : `DataProvider` remonté,
  cache de requêtes vidé) et la navigation repart des onglets.

### Tests (exécutés le 2026-10-17, API de test sur 5055)
- Nouvelle suite `condominiums:test` : 62/62.
- auth 44/44, rbac 35/35, finance 35/35, documents 28/28, scénario 48/48,
  lots 65/65, parcours 135/135.
- Migrations 0000→0006 sur base vierge (114 tables) ; typecheck API et mobile ;
  bundles Android / iOS exportés.
- Corrections de suites : purge des sociétés créées par l'inscription
  (`auth-security`, `journeys`) ; les 5 contrôles « jeton non rattaché » de
  `rbac` acceptent 401 (le jeton forgé est désormais refusé dès l'authentification).

### Non fait / limites
- Pas de test sur appareil physique (seulement bundles exportés).
- Une personne garde un seul compte : les contextes se changent, ils ne se
  cumulent pas dans un même écran.
- Seules les relances d'impayés sont filtrées par statut ; les autres tâches
  planifiées ne le sont pas encore.
- Pas d'écran mobile pour créer une société (réservé à la plateforme, API seule)
  ni pour modifier les paramètres d'une copropriété (API `PATCH
  /condominiums/:id/settings` seule).

## 2026-10-17 — Finance : circuit opérationnel complet, indicateurs, rapprochement

Pas de second journal ni de second système de paiement : tout passe par
`ledger_entries` (journal unique, append-only) et les circuits existants.

### Modèle des opérations (inventaire)
| Opération | Où elle vit | Effet comptable |
|---|---|---|
| Paiement d'un copropriétaire | `appel_payments` (déclaré `pending` → `validated` / `rejected` / `reversed`) | écriture `appel_payment` à la validation seulement ; reçu REC-… par paiement validé |
| Autre recette | `/treasury/entries` (in) ou registre type `recette` | écriture `manual` immédiate |
| Dépense fournisseur | `expenses` : `draft` → `submitted` → `approved` → `paid` (ou `rejected` / `cancelled`) | écriture `expense` au paiement seulement ; « approuvée » = engagement |
| Salaire | `salary_records` | écriture `salary` au paiement |
| Frais / agios / intérêts | `/treasury/entries` ou depuis une ligne de relevé | écriture `manual` |
| Virement interne | `/treasury/transfers` | deux écritures `transfer`, hors recettes/dépenses |
| Extourne / remboursement | `/treasury/entries/:id/reverse` (`kind` = reversal / refund) | écriture `reversal` opposée ; paiement → `reversed`, appel rouvert, reçu retiré |
| Ajustement | catégorie `regularisation` (écriture manuelle justifiée) | écriture `manual` |

Un paiement en attente n'est ni un encaissement ni une déduction du reste dû ;
un paiement rejeté ne change rien ; une extourne compte dans la période où elle
est passée, contre le flux qu'elle annule.

### Voies parallèles fermées
- `POST /finance/transactions` : seule une recette encaissée est acceptée (et
  comptabilisée). Cotisation → `USE_CALL_FOR_FUNDS`, dépense → `USE_EXPENSES`,
  salaire → `USE_PAYROLL`, « pending » → `NOT_A_MOVEMENT`.
- Sortie manuelle du journal limitée à frais bancaires, agios, régularisation,
  remboursement : un fournisseur se paie par les dépenses.
- Défaut corrigé : une ligne héritée `revenue` « marquée payée » passait une
  **sortie** au journal.
- Déclaration de paiement : corps strict (payeur, montant payé, statut ne
  peuvent pas être envoyés).

### Corrections
- Après extourne d'un paiement partiel, l'appel garde le reçu du dernier
  paiement encore valide (il gardait le reçu annulé).
- Confirmation de paiement d'abonnement : ligne verrouillée (`FOR UPDATE`) ;
  deux confirmations simultanées ne peuvent plus traiter deux fois le même
  paiement.
- Dépenses : brouillon, modification avant approbation (chaque champ journalisé
  ancien → nouveau), dépense approuvée figée, séparation des tâches : celui qui
  soumet n'approuve pas s'il existe un autre approbateur (sinon approbation
  tracée « auto-approbation »).

### Indicateurs (`lib/finance-metrics.ts`, définitions renvoyées par l'API)
Trésorerie, statistiques, rapports, registre, tableau de bord d'immeuble et
portefeuille lisent les mêmes définitions : trésorerie = somme du journal à la
date de fin ; encaissements / décaissements = journal par date d'écriture, nets
des extournes, hors virements internes et reprises de solde ; reste dû = appels
non soldés non annulés ; paiements en attente, dépenses à approuver et
engagements affichés à part ; montants par devise. Les statistiques lisaient
auparavant le registre par date de création et l'ancien module cotisations.
Taux de recouvrement `null` (affiché « — ») quand aucun appel n'échoit dans la
période. Lignes de registre jamais comptabilisées (données héritées) marquées
« hors journal » et exclues des totaux.

### Rapprochement bancaire (migration `0007_bank_statements`)
- Aucune API bancaire n'est connectée : relevés saisis / importés (CSV collé).
- `bank_statements` : période et soldes imprimés par la banque ; lignes
  rattachées au relevé ; ajout de lignes oubliées.
- Rapport (méthode des soldes) : banque + opérations en transit = journal +
  lignes non comptabilisées ; contrôles : relevé complet (ouverture + lignes =
  clôture), continuité avec le relevé précédent, références en double, montants
  différents, extournes compensées, opérations en transit de plus de 60 jours,
  écart inexpliqué.
- Clôture refusée tant qu'un point bloque ; rapport figé à la clôture ; lignes
  d'un relevé clôturé gelées ; réouverture par le syndic avec motif. Le compte
  n'est dit rapproché que jusqu'à la fin du dernier relevé clôturé.
- Ligne bancaire sans écriture (frais, intérêts) comptabilisée et rapprochée en
  une opération ; ignorer une ligne exige un motif.

### Mobile
- Trésorerie : brouillons et soumission, choix extourne / remboursement, accès
  aux relevés.
- Nouvel écran « Relevés bancaires » (`app/releves.tsx`) : création, rapport,
  comptabilisation des frais, clôture, réouverture.
- Rapports : taux de recouvrement « — » sans appel échu.

### Tests (exécutés le 2026-10-17, API de test 5055)
- Nouvelle suite `finance-workflow:test` : 89/89.
- auth 44/44, rbac 35/35, finance 35/35, documents 28/28, scénario 48/48,
  lots 65/65, parcours 135/135, copropriétés 62/62.
- Migrations 0000→0007 sur base vierge (115 tables) ; `drizzle-kit check` OK ;
  typecheck API et mobile ; bundles Android / iOS exportés.

### Non fait / limites
- Aucune intégration bancaire ni passerelle de paiement des charges : les
  relevés sont saisis ou collés. Stripe (abonnements) n'est pas configuré dans
  cet environnement : la double confirmation est testée par la route de
  confirmation, pas par un vrai webhook signé.
- Remboursement partiel d'un paiement non géré (extourne totale puis nouvelle
  déclaration).
- Pas de seuil d'approbation configurable : toute dépense passe par
  l'approbation.
- Les chiffres arrondis à l'unité du tableau de bord d'immeuble (héritage) sont
  conservés.
- Pas de test sur appareil.

## 2026-10-18 — Documents : bibliothèque, audiences, téléchargement sécurisé

Constats et corrections de sécurité détaillés dans `SECURITY_LOG.md`.

### Base (migration `0008_document_library`)
- `documents` : `source` (generated / upload), `visibility`, `description`,
  fiche liée (`entity_type`, `entity_id`), `lot_id`, métadonnées vérifiées du
  fichier (`file_name`, `mime_type`, `size_bytes`, `checksum` SHA-256).
- `document_versions` : métadonnées du fichier de chaque version.
- Les documents générés existants gardent exactement leur audience (règle
  dérivée : personnel s'ils concernent quelqu'un, résidents pour bail /
  règlement, copropriétaires sinon).

### Audiences (`lib/document-access.ts`)
syndic · conseil · copropriétaires · résidents (avec locataires) · lot
(propriétaires et locataires du lot) · personnel. Un document lié à une fiche
garde sa propre audience : deux pièces d'une même fiche peuvent avoir des
audiences différentes. Résidents : documents publiés uniquement.

### API (`routes/document-library.ts`)
- `POST /documents/upload` : titre, catégorie (administratif, procès-verbal,
  financier, contrat, maintenance, règlement, avis, assurance, juridique,
  technique, autre), description, audience, fiche liée, lot. Fichier stocké
  puis fiche enregistrée en une transaction : le document n'apparaît qu'une
  fois les deux réussis ; doublon (même contenu) signalé.
- `GET /documents` : recherche, filtres (catégorie, statut, audience, source,
  fiche liée, lot, dates), tris, pagination, compteurs par catégorie.
- `GET /documents/:id/download-url` + `GET /documents/:id/file` : lien de
  5 minutes par personne et par version, accès revérifié à l'usage.
- `POST /documents/:id/file` : remplacement avec motif ; l'ancienne version
  et son fichier sont conservés ; historique réservé à l'équipe.
- Archivage / désarchivage ; suppression refusée pour une pièce justificative
  (appel de fonds, écriture, dépense, sinistre, réclamation) ; purge refusée
  avant la fin de conservation.
- Accès aux autres fichiers selon la fiche qui les utilise
  (`lib/file-access.ts`).

### Mobile (Android / iOS)
- Nouvel écran « Bibliothèque » (`app/bibliotheque.tsx`) : recherche,
  catégories, tri, pagination, ouverture par lien personnel ; équipe : ajout,
  remplacement, versions, archivage. Entrée dans le menu « Plus ».
- L'écran Documents existant liste les documents générés.

### Tests (exécutés le 2026-10-18, API de test 5055)
- Nouvelle suite `documents-library:test` : 75/75 (dont panne de stockage
  réelle sur une seconde instance).
- auth 44/44, rbac 35/35, finance 35/35, documents 29/29 (règle « même
  syndicat » remplacée : vérifie désormais le refus puis l'accès via avatar),
  scénario 48/48 (historique de versions : 404 au lieu de 403 accepté),
  lots 65/65, finance-workflow 89/89, parcours 135/135, copropriétés 62/62.
- Migrations 0000→0008 sur base vierge (115 tables) ; `drizzle-kit check` OK ;
  typecheck API et mobile ; bundles Android / iOS exportés.

### Non fait / limites
- Pas d'antivirus ; pas de stockage GCS testé ; pas de test sur appareil.
- L'écran mobile ne propose pas l'audience « personnel » (API seulement) ni le
  rattachement à une fiche depuis les autres écrans (filtre disponible).
- Les liens de téléchargement des documents générés passent aussi par le
  nouveau lien (plus d'URL GCS signée d'une heure).

## 2026-10-18 — Réclamations et incidents (résidents + équipe)

Il n'y a pas d'application web séparée dans le dépôt : l'espace syndic et
l'espace résident sont la même application Expo (Android / iOS), sur la même
API. L'ancien module « réclamations » (RH, non cloisonné) est remplacé
(voir `SECURITY_LOG.md`).

### Base (migration `0009_claims`)
- `claims` : référence RCL-AAAA-NNNNNN par copropriété, catégorie, lieu,
  parties communes ou lot, statut, priorité, échéance, auteur, responsable
  (membre de l'équipe) et / ou prestataire, intervention planifiée, bon de
  travaux lié, résolution (qui, quand, quoi), clôture, nombre de réouvertures,
  version (concurrence), clé d'idempotence.
- `claim_events` : historique en ajout seul (statuts, messages, notes
  internes, affectations, questions / réponses, interventions, résolutions,
  réouvertures) ; clé de requête unique par réclamation.
- `claim_attachments` (public / interne) et `claim_notifications` (une ligne
  par événement et destinataire, statut d'envoi).

### Circuit (`lib/claims.ts`, `routes/claims.ts`)
reçue → qualifiée → assignée → en cours ⇄ en attente d'information →
résolue → clôturée ; non retenue (motif) depuis reçue / qualifiée.
« Assignée » et « en cours » exigent un responsable ; « en attente » une
question au résident (sa réponse ramène la réclamation à l'état précédent) ;
« résolue » l'explication. Réouverture par l'auteur (résolue, ou clôturée
depuis moins de 30 jours, 3 fois au plus) ou par un gestionnaire : retour en
cours, rien n'est effacé, l'ancienne résolution reste dans l'historique.
Gestionnaires : syndic, président, secrétaire ; responsable assigné : en
cours / question / résolution ; trésorier et conseil : lecture et notes.
Planification : date (visible du résident), consignes internes, création
facultative du bon de travaux du prestataire (circuit travaux existant :
rapport, validation, dépense).

### Tableau, indicateurs, notifications
- `GET /claims/board` : une colonne par état, total en base avec les mêmes
  filtres, cartes (référence, titre, catégorie, lieu, priorité, date,
  responsable, retard). Déplacer une carte = `POST /claims/:id/transition`
  avec la version vue ; la carte n'est déplacée qu'après succès.
- Retard : réclamation ouverte au-delà de l'échéance (urgente 24 h, haute
  72 h, normale 7 j, basse 14 j depuis la création ; l'attente d'information
  ne suspend pas le délai). Indicateurs : ouvertes, en retard, sans
  responsable, résolution moyenne, charge par responsable (définitions
  renvoyées par l'API).
- Notifications : dépôt (gestionnaires), affectation (responsable, résident),
  question, planification, résolution, refus (résident), réponse et
  réouverture (responsable, gestionnaires). Une seule par événement et
  destinataire ; un échec est enregistré, n'annule pas l'opération et se
  relance (`POST /claims/notifications/retry`).

### Mobile (`app/reclamations.tsx`)
- Résident : signaler (catégorie, parties communes / lot, lieu, photos
  appareil ou galerie), voir la réclamation enregistrée, suivre l'historique,
  répondre, confirmer la résolution ou signaler que le problème persiste.
- Équipe : tableau par colonnes avec compteurs, recherche, fiche complète
  (messages et notes internes, affectation, priorité, planification,
  intervention réalisée). Glisser-déposer : appui long sur une carte, puis
  glisser vers une colonne (colonnes autorisées en surbrillance, défilement
  automatique au bord de l'écran) ; « Déplacer vers… » reste disponible. La
  carte reste grisée pendant l'enregistrement ; en cas d'échec elle reste en
  place avec le motif ; une colonne qui demande une question, une résolution
  ou un motif ouvre la fiche avec l'état présélectionné.

### Tests (exécutés le 2026-10-18, API de test 5055)
- Nouvelle suite `claims:test` : 65/65.
- auth 44/44, rbac 35/35, finance 35/35, documents 29/29, scénario 48/48,
  lots 65/65, finance-workflow 89/89, bibliothèque 75/75, parcours 135/135,
  copropriétés 62/62.
- Migrations 0000→0009 sur base vierge (119 tables) ; `drizzle-kit check` OK ;
  typecheck API et mobile ; bundles Android / iOS exportés.
- Défauts trouvés par la suite et corrigés : requête de rôle ambiguë
  (affectation impossible) ; bon de travaux impossible pour une réclamation
  des parties communes (immeuble unique désormais retenu, immeuble précisable
  à la planification).

### Non fait / limites
- Glisser-déposer vérifié par typecheck et export des bundles uniquement :
  pas de test sur appareil.
- Les prestataires n'ont pas de compte : l'équipe consigne leur intervention.
- Pas de délai suspendu pendant l'attente d'information ; pas d'escalade
  automatique des retards (indicateur seulement).
- Push : envoyé seulement aux comptes ayant un jeton Expo ; la notification
  in-app est la référence.

## 2026-10-18 — Répartition des charges (clés, calcul, corrections)

### Audit de l'existant
- Une seule règle : `POST /budgets/:id/generate-appels` répartissait le budget
  de l'immeuble au prorata de `lots.tantiemes` (méthode du plus fort reste,
  correcte), sans clé par catégorie ni enregistrement du calcul.
- Les lots à 0 tantième étaient écartés sans être signalés.
- Aucune répartition de dépense réelle vers les copropriétaires.

### Base (migration `0010_allocation`)
- `allocation_keys` + `allocation_key_versions` (méthode `shares` ou `equal`,
  catégories couvertes, période d'effet, source de la règle, raison du
  changement) + `allocation_key_shares` (un coefficient à 6 décimales, ou une
  exclusion motivée, par lot de l'immeuble). Une version n'est jamais modifiée.
- `allocations` (données complètes du calcul + empreinte, auteur, date,
  statut finalisée / corrigée / annulée, lien vers la répartition corrigée),
  `allocation_sources` (une source ne peut être répartie qu'une fois tant que
  sa répartition est en vigueur), `allocation_lines` (coefficient, total des
  coefficients, montant, ajustement d'arrondi, explication).
- `appels_de_fonds.allocation_id` ; l'unicité (lot, période, type) ignore
  désormais les appels annulés (une correction peut les remplacer).

### Moteur (`lib/allocation.ts`, `lib/allocation-store.ts`)
- Validation avant calcul :
  - lot sans coefficient ni exclusion ;
  - lot en double ;
  - coefficient négatif ou mal formé ;
  - lot d'un autre immeuble ou archivé ;
  - exclusion sans motif ;
  - parts égales avec un coefficient différent de 1 ;
  - total des coefficients nul ;
  - dates d'effet invalides ou hors période ;
  - catégorie non couverte ;
  - aucune clé ou plusieurs clés pour une catégorie ;
  - dépense non approuvée ;
  - ligne hors exercice ;
  - source en double ou déjà répartie.

  Les erreurs nomment le lot et la clé ; rien n'est omis ni remplacé par une
  valeur par défaut.
- Calcul exact (centimes et millionièmes en BigInt). Règle d'arrondi :
  partie entière pour chaque lot, puis centimes restants aux plus grands
  restes, à reste égal par numéro de lot. Chaque source se réconcilie au
  centime ; la règle est enregistrée avec le calcul.
- Prévisualisation → confirmation avec l'empreinte de la prévisualisation
  (données changées entre-temps → 409 et nouveau calcul à revoir) et clé
  d'idempotence. La confirmation enregistre tout et émet les appels par le
  circuit existant (débiteurs figés, notifications) dans une seule
  transaction : aucun appel en double sur une nouvelle tentative.
- Nouvelle version d'une clé couvrant une période déjà finalisée : refusée
  sans confirmation explicite ; rien n'est recalculé, les répartitions
  concernées sont listées. Correction : l'originale reste (statut corrigée,
  motif), ses appels non payés sont annulés, une nouvelle répartition avec
  la version en vigueur les remplace. Annulation : appels annulés, rien n'est
  supprimé. Les deux sont refusées dès qu'un paiement est déclaré ou validé.
- `generate-appels` passe par le même moteur (clé implicite « tantièmes des
  lots ») : calcul enregistré, lots à 0 tantième listés comme exclus.

### API (`routes/allocation.ts`)
`/allocation-keys` (liste, détail avec validation sur les lots actuels,
création, nouvelle version, archivage — syndic), `/allocations/preview`,
`/allocations` (confirmation — syndic et trésorier), `/allocations/:id`,
`/allocations/:id/correct`, `/allocations/:id/reverse` (syndic),
`/appels-de-fonds/:id/allocation` (détail du calcul pour les débiteurs de
l'appel et l'équipe).

### Mobile
- « Répartition des charges » (`app/repartition.tsx`) : clés (un coefficient
  ou une exclusion par lot, aucune valeur pré-remplie pour un nouveau lot),
  nouvelle version, calcul (dépenses et lignes budgétaires), prévisualisation
  ligne par ligne, confirmation, historique avec correction / annulation
  (motif saisi).
- Charges : « Détail du calcul » de chaque appel (`components/AllocationDetail.tsx`).

### Tests (exécutés le 2026-10-18, API de test 5055)
- Nouvelle suite `allocation:test` : 59/59.
- auth 44/44, rbac 35/35, finance 35/35, documents 29/29, scénario 48/48,
  lots 65/65, finance-workflow 89/89, bibliothèque 75/75, réclamations 65/65,
  parcours 135/135, copropriétés 62/62.
- Nettoyage des répartitions ajouté aux purges des suites (`test-cleanup.ts`).
  Un premier passage de `units` avait laissé des lots et un compte de test
  (purge interrompue par les nouvelles clés étrangères) : résidu supprimé,
  base vérifiée.
- Migrations 0000→0010 sur base vierge (125 tables) ; `drizzle-kit check` OK ;
  typecheck API et mobile ; bundles Android / iOS exportés.

### À faire valider contre le règlement de copropriété et la réglementation
Aucune règle légale marocaine n'est codée ; ces choix techniques sont à
confirmer par le syndic ou un juriste :
1. Lots à 0 tantième : exclus des appels du budget global. La base ne
   distingue pas « 0 voulu » de « non renseigné » (valeur par défaut 0).
2. Montant d'une période : montant annuel ÷ 12 ou ÷ 4, arrondi au centime le
   plus proche (montant du trimestre s'il est saisi). La somme des périodes
   peut différer de l'annuel de quelques centimes.
3. Règle d'arrondi (plus forts restes, départage par numéro de lot).
4. Clé qui change en cours de période : la version en vigueur au premier jour
   de la période s'applique à toute la période.
5. Débiteurs : copropriétaires du lot le jour de l'émission.
6. Après un paiement, aucune correction automatique : régularisation à
   décider (non automatisée).
7. Charges spéciales (ascenseur, chauffage…), lots concernés et
   coefficients : à saisir d'après le règlement ; chaque clé en garde la
   source (`sourceReference`).

### Non fait / limites
- Pas de régularisation automatique (appel complémentaire ou avoir) après un
  paiement.
- Pas d'import des tantièmes depuis un tableau ; saisie lot par lot.
- Pas de test sur appareil.

## 2026-10-19 — Appels de fonds (émission, compte résident, retards, corrections, rapprochement)

### Modèle
- Un **appel de fonds** = l'en-tête de répartition (`allocations`, réf. ALC-…),
  statuts `draft | finalized | corrected | reversed`, avec date d'émission,
  échéance, date et auteur de publication (migration `0011_funds_calls`).
- Une **obligation** = une ligne `appels_de_fonds` par lot, liée à l'appel
  (`allocation_id`) : montant émis (`original_amount`), montant dû, payé,
  date d'émission, échéance, statut.
- `appel_adjustments` (ajustement motivé, ancien et nouveau montant) et
  `appel_reminders` (rappels ; un seul rappel automatique par obligation,
  index unique partiel) — références `restrict` : rien n'est supprimé.

### Circuit
- **A. Création** : prévisualisation (montant total, par lot, base de calcul,
  clé et version), dates d'émission / d'échéance. Erreurs : clé manquante,
  quote-part invalide, échéance déjà passée (`DUE_DATE_PASSED`), échéance
  avant émission (`INVALID_DATES`), source déjà répartie. Avertissement
  `INACTIVE_UNIT` pour un lot archivé (aucune obligation).
- **B. Brouillon et publication** : un brouillon n'émet rien et ne réserve
  pas ses sources ; il se modifie (`PUT /allocations/:id`) ou se supprime
  (`DELETE`). La publication (`POST /allocations/:id/publish`) recalcule le
  brouillon sur les données du jour, le renvoie pour revue (`changed` si les
  données ont bougé), puis publie la version revue dans une transaction.
  Doublons empêchés par : clé d'idempotence, verrou sur le brouillon, index
  uniques (source active, lot + période + type).
- **C. Compte résident** (`GET /appels-de-fonds/:id/account`, débiteurs et
  équipe seulement) : montants émis / dû / payé / reste, dates, retard,
  paiements de tous statuts (déclaré, validé, refusé, extourné) avec reçus,
  ajustements, rappels, moyens de paiement (virement avec RIB du compte par
  défaut, chèque, espèces ; pas de paiement en ligne). Un paiement déclaré
  reste « en validation » et ne réduit pas le reste dû.
- **D. Retards et rappels** : échéance = jour local (`APP_TIMEZONE`, défaut
  Africa/Casablanca), en retard à partir du lendemain. Tâche horaire
  `funds-calls` : passage en `overdue`, puis un rappel automatique par
  obligation échue. Rappel manuel (`POST …/remind`, syndic / trésorier) au
  plus une fois par 24 h. Jamais de rappel après règlement, annulation, ou
  pendant la validation d'un paiement. **Aucune pénalité, intérêt ni étape
  contentieuse n'est appliquée automatiquement.**
- **E. Corrections** : brouillon → modifier / supprimer ; appel publié
  erroné → corriger ou annuler la répartition (obligations annulées et
  conservées, impossible s'il y a des paiements : `ALLOCATION_HAS_PAYMENTS`) ;
  obligation partiellement payée → ajustement motivé par le syndic, jamais
  sous le payé (`BELOW_PAID`), ou extourne du paiement d'abord ; lot devenu
  inactif → ses obligations restent dues, les nouveaux appels l'excluent ;
  annulation d'un paiement → extourne de trésorerie (reçu et écriture
  conservés).
- **F. Rapprochement** (`GET /allocations/:id/reconciliation`) : lignes =
  total, obligations émises = total, montant courant + annulé = émis +
  ajustements, payé = paiements validés, journal net = paiements validés, un
  reçu par paiement.

### Mobile
- `app/repartition.tsx` : dates d'émission / d'échéance, « Brouillon » ou
  « Publier les obligations », historique avec « Vérifier et publier »,
  « Supprimer » (brouillon) et « Rapprochement ».
- `components/ObligationAccount.tsx` (depuis « Compte » sur chaque appel de
  `app/charges.tsx`) : compte de l'obligation, comment payer, rappels ;
  « Relancer » (syndic, trésorier) et « Ajuster le montant » (syndic).

### Tests (exécutés le 2026-10-19, API de test 5055)
- `funds-calls:test` : **48/48**. Paiement partiel, règlement complet,
  paiement refusé, publication en double (concurrente et avec la même clé),
  appel annulé, extourne, bornes d'échéance (jour même / veille, fuseau
  local), lot inactif, requêtes concurrentes, accès entre résidents et entre
  copropriétés, rappels, ajustements, brouillons, rapprochement.
- Non-régression : `allocation:test` 59/59, `finance-workflow:test` 89/89,
  `finance-integrity:test` 35/35, `units:test` 65/65,
  `scenario-e2e:test` 48/48. Typecheck mobile sans erreur, export Android et
  iOS réussi.
- Aucune donnée de test restante (vérifié en base).

### À faire valider
1. Délai par défaut de l'échéance : 30 jours après l'émission (choix
   technique, à confirmer selon le règlement / les décisions d'AG).
2. Délai entre deux rappels manuels : 24 h.
3. L'outil d'escalade manuelle (`/escalation`, `escalate-debts`) garde des
   seuils inventés (3 / 6 / 12 mois, mise en demeure, action juridique) et
   vise le propriétaire actuel du lot plutôt que les débiteurs à l'émission.
   Il n'est plus planifié ; ses seuils et sa cible sont à revoir avant usage.

### Non fait / limites
- Pas de paiement en ligne (aucun prestataire configuré) : déclaration avec
  justificatif, puis validation.
- Écran `repartition.tsx` encore en français uniquement (le compte de
  l'obligation est traduit FR / EN / AR / ES).
- Pas de test sur appareil.

## 2026-10-19 — Bibliothèque documentaire résident et documents officiels

Détail complet : `DOCUMENT_LIBRARY_DESIGN_PROGRESS.md`.

- Mobile : bibliothèque refaite (`app/bibliotheque.tsx`, `components/DocumentRow.tsx`),
  lecteur dédié `app/document-viewer.tsx` (PDF natif iOS, pdf.js paresseux
  Android, images, texte, formats non prévisualisables), fichiers en cache
  privé supprimés à la fermeture et purgés à chaque changement de contexte
  (`lib/documentFiles.ts`). Partage de `pdf-viewer.tsx` réparé.
- Backend : 404 indistinct sur `GET /documents/:id`, numéro de lot dans les
  réponses, noms de fichiers UTF-8 corrigés.
- Documents officiels : 10 modèles « en reconstruction » remplacés par une mise
  en page commune n'utilisant que des données réelles ; TVA et faits par
  défaut inventés retirés ; « Document certifié » remplacé ; police arabe
  trouvée en production ; reçu de paiement complété.
- Tests : `document-library-resident:test` 27/27, `official-documents:test`
  13/13, `documents-library:test` 75/75, `documents-security:test` 29/29,
  `finance-workflow:test` 89/89 ; export Android / iOS OK. Pas de test sur
  appareil.
- À décider : prétraitement bidi pour l'arabe dans les PDF ; miniatures
  protégées.

## 2026-10-20 — Générateur de données de test (`seedgen`)

Détail : `DATABASE_TABLES_INVENTORY.md`, `DATABASE_SEEDING_PLAN.md`,
`DATABASE_SEEDING_GUIDE.md`, `DATABASE_SEEDING_REPORT.md`.

- Inventaire des 127 tables lu dans le schéma réel (colonnes, clés, index,
  déclencheurs, volumes) ; ordre d’insertion par dépendances.
- Génération reproductible (graine, échelle) : 60 copropriétés, ≈ 1 050
  utilisateurs de tous les rôles, 4 676 lots, 22 055 appels de fonds émis par
  le moteur de répartition réel, paiements validés / rejetés / en attente
  avec écritures au journal et reçus, ≈ 4 500 fichiers PDF / PNG réels.
  32 s. Tout le lancement est annulé en cas d’erreur ; graine déjà générée
  refusée ; nettoyage limité au lancement.
- Contrôles : 278 / 279 contrôles d’intégrité (le seul échec vient des budgets
  de démonstration `budget_atlas_2026` / `budget_agdal_2026`, dont les lignes
  dépassent le total ; laissés tels quels) ; 25 / 25 contrôles à travers
  l’API (rôles, isolation, pagination, temps max 58 ms).
- Migration `0012_fix_appel_issue_dates.sql` : corrige les dates d’émission
  postérieures à l’échéance introduites par le rattrapage de la migration 0011.
- `finance-integrity-test` : recherche de l’écriture par numéro de reçu
  limitée à la copropriété du test (les numéros sont propres à chaque
  copropriété) — 35 / 35. `scenario-e2e` : attend désormais 404 (et non 403)
  pour un document caché, comportement voulu depuis la bibliothèque — 48 / 48.

## 2026-10-20 — Refonte des écrans, lot 1

Écrans passés au kit UI (`components/ui`), traduits FR / EN / AR / ES, RTL :
`settings`, `profile`, `mon-lot`, `annonces`, `sinistres`, `travaux`,
`support`, `reclamations` (retouches ciblées, logique du tableau inchangée).

Corrections trouvées pendant la refonte :
- Réglages : statut serveur « opérationnel » fixe remplacé par un vrai appel
  `/healthz` ; version lue dans la configuration Expo ; choix clair / sombre /
  système.
- Profil : « Dernière modification il y a 30 jours » (inventé) retiré ;
  actions en double supprimées ; compteurs d’appels affichés seulement aux
  copropriétaires (0 trompeur sinon).
- Mon lot : libellés affichés en clés brutes (« lotNumber », « floor »…) ;
  « /1000 » ajouté aux tantièmes sans connaître la base ; totaux sans les
  paiements partiels (désormais `amountPaid` / `remaining` du serveur) ;
  onglet documents vide → bibliothèque.
- Sinistres et travaux : la création envoyait `buildingId: ""` et échouait
  toujours (400) → choix de l’immeuble (pré-rempli depuis le lot du résident).
  Écrans ouverts aux résidents, que l’API sert déjà (ils ne voient que leurs
  propres déclarations) et que « Mon lot » leur proposait. Travaux :
  prestataire choisi dans la liste réelle au lieu d’un identifiant à saisir ;
  annulation d’un sélecteur de fichier n’affiche plus d’erreur.
- Sinistres : statistiques affichées en clés brutes ; montants en « k » et
  locale `fr-MA` fixe.
- Annonces : public par défaut « Tous les membres » en français dans toutes
  les langues ; boutons alignés sur les droits de l’API.
- Support : promesse « réponse sous 24 à 48 h » retirée (aucun engagement
  vérifié) ; auteur « équipe » déduit du demandeur et non d’un nom contenant
  « admin ».
- Réclamations : dates en `fr-FR` fixe et mots français restants traduits.

Vérifications : `tsc` mobile OK ; `expo export` Android et iOS OK ; données
vérifiées contre l’API locale avec des comptes générés (lot, appels, immeubles,
prestataires). Pas de test sur appareil.

## 2026-10-20 — Refonte des écrans, lot 2

Écrans passés au kit UI : `parking`, `prestataires`, `ideas`, `publications`.

Corrections trouvées pendant la refonte :
- Parking : réservation envoyée sans fuseau (« 2026-10-20T09:00:00 », lue
  dans le fuseau du serveur) → instant absolu calculé sur le téléphone ;
  date, format des heures et fin > début vérifiés avant l’envoi.
- Prestataires : total mensuel calculé en concaténant des chaînes
  (« 001250.004800.00… MAD/mois ») et incluant les contrats expirés → somme
  numérique des seuls contrats actifs ; types `securite` / `menuiserie`
  reconnus.
- Idées : l’API renvoie `hasVoted`, l’écran lisait `userVoted` (toujours
  « Voter », un second appui retirait le vote sans le dire) ; examen affiché
  au président alors que l’API exige le syndic ; les idées créées par l’API
  (`submitted`) n’étaient jamais examinables depuis l’app.
- Publications : modifier, supprimer et épingler affichaient un succès sans
  rien enregistrer (aucune route API) → retirés ; commentaires gardés en
  mémoire seulement → commentaires réels de l’API ; publication réservée aux
  rôles acceptés par l’API ; « j’aime » et compteur lus depuis l’API
  (`userLiked`, `likes`) au lieu d’un état local.

Générateur de données :
- Valeurs inconnues de l’application corrigées dans le générateur et dans les
  lignes déjà générées (périmètre `creation_key LIKE 'seedgen:%'` uniquement) :
  statuts et catégories d’idées, contrats terminés avec une fin future,
  procurations `validated`, type / mode d’élection, travaux privatifs, bons de
  livraison, factures SaaS, catégories de support, de publications et de
  produits, produits `active` (invisibles sur la marketplace), sinistres,
  actes, public des annonces.
- `verify` : 16 contrôles de valeurs autorisées ajoutés (données générées) →
  294 / 295 (seul échec : budgets de démonstration, inchangé).
- Constat sans correction : les données de démonstration contiennent aussi
  des valeurs hors de l’application (ex. priorités d’annonce
  `high` / `low` / `normal`) ; non modifiées.

Vérifications lot 2 : `tsc` mobile et scripts OK ; `expo export` Android et
iOS OK ; données vérifiées contre l’API locale (prestataires et contrats,
idées et `hasVoted`, places de parking, « j’aime » aller-retour remis à
l’état initial). Pas de test sur appareil.

## 2026-10-20 — Réinitialisation et jeu de données de test avec vrais documents

Détail : `DATABASE_SEEDING_GUIDE.md` (procédure), `DATABASE_SEEDING_REPORT.md`
(résultats).

- Procédure complète `seedgen run` (+ `--dry-run`) : environnement →
  migrations en attente → sauvegarde (`pg_dump` + copie des fichiers) →
  suppression de tous les lancements du générateur → génération → documents →
  contrôles → rapport. Nouvelles commandes : `backup`, `reset [--dry-run]`,
  `files-check`.
- Exécution réelle : 171 646 lignes et 4 381 fichiers supprimés (sauvegarde
  10,9 Mo dans `scripts/.seedgen/backups/`), 0 ligne du générateur restante ;
  1 049 utilisateurs générés, 60 copropriétés, 89 tables alimentées sur 127
  (raisons des 38 autres dans le rapport) ; 292 s.
- Documents réels produits à partir des données (pdfmake, comme les documents
  officiels de l'API ; Amiri pour les noms arabes) : règlements, budgets,
  convocations, procès-verbaux, avis d'appel de fonds par lot, reçus, ordres
  de virement, factures et devis, contrats, rapports d'intervention ; photos
  PNG des travaux, sinistres, réclamations et annonces. 12 359 fichiers
  (10 782 PDF, 1 577 PNG) reliés à leurs objets métier, « DOCUMENT FICTIF —
  TEST » sur chaque PDF.
- Contrôles : `verify` 302 / 303 (seul échec : budgets de démonstration,
  inchangés) ; `files-check` OK (0 absent, 0 taille différente, toutes les
  références résolues) ; relecture indépendante pypdf (mode strict) et Pillow
  de tous les fichiers : 0 invalide ; `seedgen:api` 37 / 37 (téléchargements
  identiques au fichier, refus pour un autre lot / une autre personne / une
  autre copropriété, recherche, filtres, page 2, max 108 ms) ;
  `finance-integrity` 35/35, `scenario-e2e` 48/48,
  `document-library-resident` 27/27, `official-documents` 13/13.
- Données hors générateur : comptées table par table avant / après ; seules
  ont changé les tables des résidus prouvés (et +1 connexion / +1 message
  d'un utilisateur de l'application pendant l'exécution).

Corrections faites en route :
- L'ancienne image 1×1 du générateur était un PNG corrompu (illisible par
  Pillow) : 576 images concernées, remplacées par de vraies images.
- Nettoyage : les références sans clé étrangère (commandes, préférences de
  notification, journal d'audit…) pouvaient être évaluées après la
  suppression de leur parent → résidus. Ensemble figé avant la première
  suppression ; résidus des anciens lancements supprimés uniquement sur
  preuve (identifiant produit par une graine connue, ou texte propre au
  générateur) : 6 711 lignes ; les lignes orphelines d'origine non prouvée
  (journal d'audit, journaux d'e-mails, propriétés, comptes de trésorerie,
  organisations créés par les suites de tests) sont conservées et listées.
- Identifiants : deux graines pouvaient produire les mêmes UUID (flux 32 bits
  partagé) → UUID = SHA-256(graine, compteur).
- Résolutions d'AG : majorités `absolue` / `double` inconnues de l'API et
  votes sans rapport avec les tantièmes → votes calculés sur les tantièmes
  réels, résultat selon la règle de l'API.
- PDF : rendu arabe contrôlé visuellement (lettres liées, ordre des mots,
  texte mixte français / arabe).

## 2026-10-21 — Audit technique complet

Rapport : `AUDIT_2026-10-21.md` ; paiements : `PAYMENT_PROVIDERS.md`.
État initial sauvegardé dans `../zip-repl-snapshots/` (code et base).

- Sécurité / isolation : scan IDOR dynamique ajouté (`idor:test`, 113 / 113
  refus) ; fuite des coordonnées des vendeurs et des données de modération
  de la marketplace corrigée.
- Interfaces : écritures du `DataContext` attendues avant tout message de
  succès ; double création de copropriété supprimée ; nomination à un mandat
  vacant, accusé « lu et compris » (migration 0013) et numérotation serveur
  des bons de livraison ajoutés ; droits des écrans alignés sur l'API.
- Finance : sommes en centimes (24 calculs), date locale Africa/Casablanca
  (20 endroits API, 16 mobile), année des séquences au fuseau local.
- Paiements : Stripe Checkout fiabilisé (idempotence, concurrence, échec,
  expiration) et enfin appelé par l'application ; PayPal et passerelle
  marocaine désactivés faute d'intégration ; comparaison CMI / acquéreurs /
  Stripe documentée (Stripe indisponible pour une entité marocaine).
- Textes juridiques : allégations de conformité non vérifiées retirées
  (SOC 2, AES-256, 2FA, horodatage qualifié, suppression de compte…).
- Tests : 18 suites exécutées, toutes réussies sauf une vérification
  `election-audit` qui signale une fonction absente (voir rapport).

## 2026-10-21 — Identité « Riad au crépuscule » et refonte transversale

Détail et justifications : `DESIGN_SYSTEM.md`.

- **Marque :** MIZAN conservé après évaluation de 5 autres noms (Jiran et Sakina sont pris, Wasti, Riadly et Darna écartés). Nouveau symbole : une arche de riad et un fléau en laiton, généré depuis une source unique (`assets/brand/_build.mjs`). Icône iOS, icône adaptative Android, splash, icône de notification et favicon branchés dans `app.json` ; ils ne prennent effet qu'après une compilation native.
- **Tokens :**
  - **Palette :** Majorelle, Nuit, Tadelakt, Laiton, Zellige, Safran, Grenade et Cèdre.
  - **Titres :** Fraunces, et Noto Kufi Arabic en arabe.
  - **Mouvement :** tokens `constants/motion.ts`, et `hooks/useMotion` qui gère la réduction des animations et les appareils de moins de 3 Go de RAM.
- **Remplacements en masse :**
  - 1 849 couleurs de l'ancienne palette remappées dans 87 fichiers ;
  - 90 grands titres passés en Fraunces ;
  - 139 textes colorés passés sur `tint`, lisible en sombre.
- **Signature :** `components/signature/ResidenceScene` est une résidence isométrique en SVG et Reanimated, construite depuis `/buildings` et `/lots/my-lot`. L'étage du résident s'allume ; le syndic voit ses immeubles, ses lots et ses chantiers en cours. Elle est placée dans l'en-tête de l'accueil.
- **Écrans refaits :** l'accueil public (`welcome`) et la connexion (formulaire visible sans défilement). La barre d'onglets a une pastille animée, et l'onglet « Accueil » remplace « Tableau de bord », qui était tronqué.
- **25 écrans secondaires** sont passés de leur en-tête clair maison à `ScreenHeader`, avec retour avec repli et flèche RTL. Dans `documents`, les outils d'administration ont été déplacés sous l'en-tête.

Corrections trouvées pendant la refonte :
- **Traductions :**
  - 20 clés affichaient littéralement « fr », « en », « ar », « es ». L'une d'elles, le public par défaut d'une annonce, était envoyée au serveur ; la base ne contient aucune annonce touchée.
  - 66 clés utilisées n'étaient définies nulle part et s'affichaient brutes, notamment dans le répertoire juridique, les élections et les procurations.
- **Écrans qui plantaient :**
  - `equipe-syndic` attendait une liste alors que `/team` renvoie `{ syndicate, admins, committee }` ;
  - `invoices` plantait sur un statut inconnu : 176 factures `pending` des données générées, un statut que l'API ne connaît pas. L'écran gère maintenant tous les statuts de l'API, avec un repli neutre ;
  - `utilisateurs` ne connaissait pas les rôles président, trésorier, secrétaire et membre du conseil.
- **Faux contenus retirés :**
  - un témoignage client inventé et nominatif (`get-started`) ;
  - la case « Se souvenir de moi », jamais transmise à la connexion ;
  - les badges « Données chiffrées » et apparentés de la connexion, non vérifiés.
- **Requêtes et logique :**
  - `/subscriptions`, réservé au super-administrateur, était appelé au démarrage pour tous les rôles : un 403 à chaque ouverture ;
  - le mode sombre de `alerts` était détecté par comparaison de couleur ; il passe désormais par le thème.
- **Contraste et mise en page :**
  - le bouton destructif en sombre n'atteignait que 3,65:1, corrigé ;
  - les boutons des cartes d'appel de fonds se chevauchaient, corrigé.

Vérifications :
- `tsc` mobile et scripts OK.
- `expo export` Android et iOS OK (9,7 Mo de bytecode Hermes par plateforme).
- Nouveau test `design-tokens:test` : 44/44.
- Captures de 106 routes (syndic, en clair) et de 16 routes (copropriétaire, en sombre), plus l'arabe en RTL, sur la version web, contre l'API locale et des comptes générés.
- Fluidité mesurée sur la version web uniquement (voir `DESIGN_SYSTEM.md`, § 5).

Non fait :
- tests sur appareil ;
- vidéo ;
- `assets/brand/_render.mjs` n'a pas été exécuté depuis le dépôt (les PNG ont été produits par le même code dans un répertoire temporaire) ;
- le script `test:login-transport` pointe vers un fichier absent (défaut antérieur).

## 2026-10-21 (suite) — Parcours d'entrée et garde-fous des jeux de test

- **Composant :** nouveau `components/brand/AuthHero`, une bande « Nuit » commune aux écrans d'entrée (retour, marque, icône de l'étape, titre en Fraunces ou en coufique). Il est appliqué à :
  - `forgot-password` et `reset-password`, où le formulaire chevauche la bande ;
  - `sms-verify` et `email-verify` ;
  - `register`.
- **Corrections sur ces écrans :**
  - le bouton « Réinitialiser » était vert ; il passe en Majorelle, la seule couleur d'action ;
  - `sms-verify` gardait des accents de l'ancien violet et une couleur codée en dur.
- **`get-started` réécrit :**
  - il était entièrement en français codé en dur ; il est maintenant traduit en FR, EN, AR et ES ;
  - le doublon « Créer une organisation », qui menait vers la même page, est retiré ;
  - « Conditions d'utilisation » et « Politique de confidentialité » deviennent de vrais liens (texte non cliquable auparavant) ;
  - les contacts ventes et démo pointaient vers `sales@mizan.ma` et `demo@mizan.ma` (domaine sans DNS public). Ils ne s'affichent plus que si `EXPO_PUBLIC_CONTACT_EMAIL` est configurée ;
  - l'essai de 30 jours affiché est vérifié dans `assignTrial` (API).
- **`intro` réécrit :**
  - il était en français codé en dur ; son contenu est maintenant dans les 4 langues ;
  - les mini tableaux de bord factices, remplis du mot « Aperçu » sans donnée, sont remplacés par les trois fonctions réelles de chaque module ;
  - il reçoit la bande « Nuit » de l'accueil public.
- **`IconButton`** accepte un `testID`, ce qui préserve `intro-theme-toggle`.
- **Sécurité des jeux de test :** `election-audit-seed.ts` et `seed.ts` créent des comptes au mot de passe `password123`, et le premier supprime le lancement précédent. Les deux appellent désormais `assertDevDatabase()` (`seedgen/guard.ts`) avant toute écriture : hôte local obligatoire, aucune base marquée « prod », pas de `NODE_ENV=production`.
  - Vérifié : la base locale est acceptée, un hôte distant est refusé.
  - Les deux scripts n'ont pas été relancés.

Vérifications :
- `tsc` mobile et scripts OK ;
- `expo export` Android et iOS OK ;
- `design-tokens:test` 44/44 ;
- captures web en FR, EN et AR, en clair et en sombre, des écrans modifiés.

## 2026-10-21 (suite) — Analyse complète, puis étapes 1 à 5 validées

L'analyse a été présentée puis validée (« d'accord, commence étape par étape »). Pour les questions restées sans réponse, l'option la plus prudente a été retenue ; elle est indiquée à chaque fois.

### Étape 1 — Juridique : documents et textes du produit syndical
- **Certificat d'adhésion et badge retirés :**
  - **Certificat** (`/pdf/membership`) : il affirmait que le copropriétaire était « membre en règle du syndicat… conformément au Dahir 1-57-119 relatif aux syndicats professionnels », c'est-à-dire la loi sur les syndicats de salariés et non la loi 18-00.
  - **Badge à QR** (`/pdf/badge`, `/badge/me`) : son QR pointait vers une page qui n'existe pas.
  - **Vérification publique** (`/verify/badge/:id`) : accessible sans authentification, elle révélait le nom, le rôle et la résidence de n'importe quel compte.

  Ces routes répondent maintenant 410 `DOCUMENT_RETIRED`, et le code devenu inutile est supprimé.
- **Profil :** « Demander une attestation » ouvre le circuit officiel existant (résidence, propriété, situation des paiements). Le serveur calcule l'attestation, le syndic la signe, et elle se vérifie via `/documents/verify/:token`. L'attestation d'adhésion est retirée du catalogue de demande, mais le modèle reste pour les documents déjà émis. Le compteur « Cotisations » devient « Appels réglés », alimenté par des données réelles.
- **CGU :**
  - **Réécriture :** les sections 1 à 3 (syndicats professionnels, Dahir 1-57-119, Code du travail) s'appuient désormais sur la loi 18-00 modifiée par la loi 106-12, et les finalités prévues par la loi 09-08 sont corrigées. Le texte reste une version de travail, à faire valider par un juriste.
  - **Acceptation enregistrée :** l'écran affichait « Acceptation enregistrée » sans rien conserver. Elle est maintenant stockée (migration 0014 `terms_acceptances`, avec version, date, adresse IP et navigateur ; routes `GET/POST /me/terms-acceptances`).
- **Création d'un syndicat :** seules les formes juridiques marocaines sont proposées (loi 18-00, coopérative au sens de la loi 112-12, association au sens du dahir de 1958) ; l'ASL et l'ASA, qui relèvent du droit français, sont retirées. Les références au Dahir de 1957 et les exemples syndicaux disparaissent.
- **Données personnelles :** l'acceptation des CGU, l'export de ses données et le changement d'e-mail restent possibles quel que soit le statut de la copropriété, car ce sont des droits personnels au titre de la loi 09-08.

### Étape 2 — « Compléter mon profil »
- **Avant :** l'écran demandait l'employeur, le secteur et l'ancienneté, n'enregistrait rien et annonçait « Profil complété ».
- **Maintenant :** trois étapes, chacune enregistrée sur le serveur (`PUT /profile`, puis `/me/terms-acceptances`). Le parcours a été vérifié de bout en bout dans le navigateur et en base, puis les données de test restaurées.
- **Navigation :** l'écran n'est relié à aucun menu. Il n'a pas été supprimé, en attente d'une décision.
- **Libellés :** `TextField` affichait « * * » lorsque le libellé contenait déjà un astérisque ; c'est corrigé.

### Étape 3 — Adresses e-mail non distribuables
- **Constat :**
  - aucune adresse n'est mal formée ;
  - les 1 049 comptes générés utilisent `*.seedgen.mizan.test`, un domaine réservé qui ne reçoit jamais de courrier ;
  - `andalous.ma` est un vrai domaine, et deux e-mails de test y ont réellement été envoyés.
- **Migration 0015 :** ajout de la colonne `users.email_status` (`unverified`, `verified`, `undeliverable`). Les domaines réservés sont marqués non distribuables, sans suppression et sans effet sur la connexion. 41 comptes de démonstration sur des domaines réels ou enregistrables ont aussi été marqués à la main ; c'est réversible. La table `users` a été sauvegardée avant l'opération.
- **Envoi :** aucun envoi n'est tenté vers une adresse non distribuable ; il est journalisé « skipped ». Aucun code n'est envoyé à un domaine réservé : la réponse est une erreur 400 `EMAIL_UNDELIVERABLE`.
- **Changement d'adresse :** l'utilisateur confirme sa nouvelle adresse par un code envoyé à celle-ci (`/me/email-change/request` puis `/me/email-change/confirm`). Dans la même transaction, les fiches de copropriétaire, de locataire et du conseil suivent, puis la session est renouvelée.
  - **Écran :** `email-change`.
  - **Accueil :** une priorité invite l'utilisateur à confirmer son adresse.
  - **Profil :** la ligne e-mail est cliquable.
- **Cause corrigée :** chaque création de compte enregistre le bon statut d'e-mail, et la production refuse les domaines réservés. Le générateur marque ses comptes, et `seed.ts` n'utilise plus que des domaines en `.test`.

### Étape 4 — Virement guidé
- **Référence de paiement :** migration 0016, nouvelle colonne `appels_de_fonds.payment_reference`, unique, au format LOT-PÉRIODE-TYPE-CONTRÔLE (par exemple `A203-2026Q4-CC-07A9E5`).
  - Elle est remplie pour les 23 285 appels existants et générée à la création de chaque nouvel appel, avec la même formule en SQL et dans le code.
  - La table a été sauvegardée avant la migration.
- **Côté copropriétaire :** la fenêtre de paiement affiche le RIB du syndicat, le motif à indiquer et le montant restant, avec un bouton de partage.
- **Côté trésorier :** au rapprochement, le paiement dont la référence figure dans le motif du relevé arrive en tête, même si le montant ou la date diffèrent.
- **Libellé :** « Justificatif de paiement (optionnel) * » est corrigé, car le justificatif est obligatoire.

### Étape 5 — Finances de la copropriété en lecture seule
- **Nouvelle route `GET /transparency/finances`,** ouverte aux copropriétaires actifs et à l'équipe, mais pas aux locataires. Elle renvoie :
  - les budgets votés ;
  - le solde des comptes, sans RIB ;
  - le recouvrement global ;
  - les 40 dernières dépenses ;
  - les salaires, en total uniquement.

  Aucune donnée de paiement nominative n'est exposée.
- **Exécution budgétaire :** `GET /budgets/:id/execution` est lisible par un copropriétaire pour un budget voté ; un brouillon répond 404.
- **Écrans :** nouvel écran « Finances de la copropriété ». L'écran des justificatifs (`/transparency`) est désormais visible des copropriétaires dans le menu.
- **Choix par défaut :** le copropriétaire **voit** chaque dépense ; il ne **vote** pas chaque dépense. La question reste posée.

### Bogue transverse — écrans bloqués en chargement
`ContextScope` vidait le cache des requêtes après que les écrans remontés avaient lancé leurs propres requêtes. Un écran rechargé, ou affiché juste après un changement de copropriété, restait donc en chargement indéfiniment. Désormais, chaque contexte dispose de son propre cache de requêtes.

### Tests
- **Nouveaux :** `legal-step` 12/12, `email-step` 14/14, `payment-reference` 9/9, `finance-transparency` 9/9.
- **Non-régression :**
  - **Sécurité et accès :** IDOR 113/113 ; RBAC 35/35 ; sécurité des documents 29/29 ; auth 44/44.
  - **Parcours :** parcours 135/135 ; scénario 48/48.
  - **Données de base :** documents officiels 13/13 ; copropriétés 62/62 ; lots 65/65.
  - **Finances :** allocation 59/59 ; appels de fonds 48/48 ; flux financiers 89/89 ; intégrité 35/35 ; réclamations 65/65.
- **Échecs passagers :** ceux observés en cours de route venaient de la limite de connexions (429). Ils ont disparu après redémarrage de l'API.
- **Test IDOR :** il prend désormais une annonce approuvée, au lieu d'un produit au hasard.

### Non fait
- Tests sur appareil.
- Étape 6 : multilingue et RTL partout.
- Étape 7 : règles légales (délai de convocation, procurations, conciliation, tantièmes réels en AG).
- Étape 8 : marketplace.
- `DataContext` déclenche 6 requêtes refusées (403) à chaque ouverture pour un copropriétaire.

## 2026-10-22 — Étape 8 : marché de la résidence (scénario + design)

### Scénario (API `routes/marketplace.ts`)
- **Cloisonnement par résidence :**
  - un copropriétaire ne voit que les annonces de sa copropriété (liste, à la une, favoris, panier, avis) ;
  - l'annonce d'une autre résidence répond 404 en consultation, réservation, favori et signalement ;
  - le super-admin garde la vue globale pour la modération.
- **Vie privée :** l'étage du vendeur n'est jamais envoyé aux autres ; le nom de la personne qui a réservé n'est visible que du vendeur.
- **« Voisin vérifié » :** affiché quand le vendeur a un compte actif rattaché à la copropriété. C'est un fait, pas une note : le « trustScore » calculé est supprimé de la réputation.
- **Parcours :** réserver → l'acheteur garde accès à l'annonce (avant : 403) → le vendeur marque « remis » → l'acheteur, et lui seul, laisse un avis, une seule fois.
- **Paiement :** aucun paiement ne passe par MIZAN, et l'écran le dit (« paiement à la remise, jamais à l'avance »).
- **Favoris :** une annonce réservée reste dans « Enregistrés ».
- **Images :** `Cross-Origin-Resource-Policy: cross-origin` sur `/storage/*-objects/*`, car Helmet bloquait les photos sur le web.

### Design (mobile)
- **Marché (`components/marketplace/ResidenceMarket.tsx`) :**
  - en-tête nuit avec recherche ;
  - segments « Entre voisins / Prestataires » ;
  - bandeau de confiance ;
  - catégories traduites, carrousel « À la une », grille de 2 à 4 colonnes ;
  - filtre « Enregistrés » : le cœur ouvrait auparavant les favoris de navigation, qui n'affichaient aucun produit ;
  - bouton « Vendre ».
- **Prestataires :** ceux de la résidence (note, « sous contrat », appeler, écrire).
- **Fiche produit :**
  - galerie paginée et carte vendeur ;
  - section « Comment se passe l'échange » ;
  - barre d'actions selon le rôle (contacter, réserver, annuler, remis, libérer, évaluer) ;
  - fenêtre d'avis.
- **Ma boutique :** en-tête nuit, photo de chaque annonce, prix en Fraunces, flèche retour inversée en arabe.
- **Carte produit :** un prix long n'est plus tronqué par « à débattre ».

### Tests
- **Nouveau :** `marketplace-scenario` 19/19.
- **Non-régression :** IDOR 113/113 (le contrôle « catalogue partagé » accepte désormais le 404 d'une autre résidence) ; RBAC 35/35 ; parcours 135/135 ; scénario 48/48.
- **Mobile :** `tsc` OK ; export Android/iOS OK.
- **Captures (web) :** FR clair et AR sombre (marché, fiche, boutique, enregistrés).

### Non fait
- Tests sur appareil.
- Le formulaire de création d'annonce garde son ancien style.
- La modération par le syndic n'est pas faite : seul le super-admin modère.

## 2026-10-23 — Base de test, catalogue du marché, défauts de logique

### Environnement et sécurité
- **Base :** PostgreSQL 18.6 local (`localhost`), base `syndycat_global_cps`, la seule base du serveur avec `postgres` ; 17 migrations appliquées.
- **Ce n'est pas une base de test isolée.** Elle contient 1 049 comptes et 60 copropriétés générés (`s20261019`), plus 43 comptes et 4 copropriétés hors générateur (démonstration, audit, une adresse `@gmail.com`). Le nettoyage n'a donc **pas** été relancé.
- **Jeu existant conservé et complété de façon additive**, après sauvegarde : `scripts/.seedgen/backups/2026-10-23T20-40-19-452Z/` (dump 12,9 Mo, 130 tables lisibles par `pg_restore --list`, 12 359 fichiers copiés).
- **Nouvelles commandes `seedgen` :**
  - `inspect` : lecture seule ;
  - `marketplace` : ajout additif et idempotent.

  Correspondance avec les opérations demandées : voir `DATABASE_SEEDING_GUIDE.md`.

### Catalogue du marché
- **Défaut de départ :** aucune résidence n'avait plus de 4 annonces visibles. La pagination et les filtres étaient donc impossibles à tester.
- **Ajout** à « Résidence Bab Al Bahr Bir Rami 48 » :
  - 200 annonces (150 visibles, 14 réservées, les autres vendues, en attente ou refusées) ;
  - 475 images PNG valides, en 5 formats ;
  - 30 favoris et 16 questions publiques.
- **Idempotence :** un second lancement n'ajoute rien.

### Défauts corrigés
1. **Budgets — `POST /budgets` :**
   - un budget créé sans total était enregistré avec un **total à 0 MAD** (cas du test `journeys`) ;
   - un montant non numérique provoquait une erreur 500 ;
   - les lignes pouvaient contredire les charges.

   **Règle appliquée :** celle déjà utilisée par l'exécution budgétaire, les appels de fonds et la répartition, à savoir *lignes = charges, total = charges + fonds de réserve*. Le calcul se fait en centimes. Un montant absent est déduit ; des montants contradictoires sont refusés (`BUDGET_TOTALS_MISMATCH`). Même contrôle sur `PUT` d'un brouillon.
2. **Budgets de démonstration :** dans `seed.ts`, le fonds de réserve était compté deux fois, en ligne « réserve » et en `fonds_reserve`. La source est corrigée ; les lignes déjà en base n'ont pas été modifiées (hors générateur). Elles restent la seule anomalie de `seedgen verify`, à 306/307.
3. **Marché — API :**
   - le filtre de catégorie ignorait les anciennes graphies (« mobilier », « literie », « loisirs »…) ;
   - `%` et `_` saisis dans la recherche agissaient comme jokers ;
   - l'ordre des pages n'était pas stable (pas de clé de départage) ;
   - il manquait le tri par prix, les tranches de prix et l'option « inclure les réservés » ;
   - la recherche porte maintenant aussi sur la marque.
4. **Marché — mobile :**
   - l'écran demandait 60 annonces, le serveur en renvoyait au plus 50, sans aucune page suivante. Il y a maintenant une vraie pagination serveur (24 par page) : chargement au défilement, bouton de secours, dédoublonnage, retour à la page 1 à chaque changement de filtre ;
   - la recherche part 350 ms après la frappe, au lieu d'une requête par touche ;
   - un échec de chargement de la page suivante remplaçait toutes les annonces déjà chargées par un écran d'erreur (comportement de TanStack v5). L'erreur est désormais affichée dans le pied de liste.

### Multilingue / RTL
- **Icônes directionnelles :** `components/ui/Feather.tsx` inverse les flèches et chevrons en arabe. 46 écrans l'utilisent. Les deux listes déroulantes de `syndicate-setup` qui pointaient à gauche en arabe sont corrigées.
- **Écrans traduits :**
  - répartition des charges, support plateforme, règlements ;
  - assistant de documents (affichage), gouvernance, alertes réglementaires ;
  - création de copropriété, écran d'erreur, bandeau d'abonnement, page introuvable ;
  - visionneuse PDF, PV, abonnements.
- **Dictionnaire arabe :** les 3 valeurs restées en espagnol sont corrigées.
- **Textes juridiques :** ils restent en français. Un avertissement le dit dans les autres langues, sans traduction automatique d'un contrat. Les liens « Conditions » de l'inscription mènent désormais aux CGU à jour (`/cgu`, rendue publique).
- **Gouvernance :** la liste « Statuts » affichait 5 documents inventés ; elle affiche maintenant les vrais documents « règlements » de la copropriété.

### Non fait / à décider
- **`documents.tsx` :** le chemin de génération par modèle est du code mort (`handleGenerate` n'est jamais appelé) ; non supprimé.
- **Budgets de démonstration :** `budget_atlas_2026` et `budget_agdal_2026` restent incohérents en base.
- **Tests :** aucun test sur appareil réel.

### Tests du 2026-10-23 (API de test reconstruite, port 5055)
- **Nouveaux :** `budget-totals` 12/12, `marketplace-catalogue` 20/20.
- **Non-régression :**
  - **Marché et sécurité :** scénario marché 19/19 ; IDOR 113/113 ; RBAC 35/35 ; documents-security 29/29 ; auth-security 44/44.
  - **Parcours :** parcours 135/135 ; scénario 48/48.
  - **Finances :** flux financiers 89/89 ; allocation 59/59 ; appels de fonds 48/48 ; intégrité 35/35 ; transparence 9/9 ; référence de paiement 9/9.
  - **Étapes et données :** légal 12/12 ; e-mails 14/14 ; documents officiels 13/13 ; réclamations 65/65 ; lots 65/65 ; copropriétés 62/62.
- **Échecs passagers :** lancées d'affilée dans un même processus, `auth-security`, `claims` et `condominiums` ont échoué sur des réponses 429 (limites de connexion en mémoire). Après redémarrage de l'API, elles passent : 44/44, 65/65, 62/62.
- **`seedgen` :**
  - `verify` 306/307 (seul échec : les 2 budgets de démonstration) ;
  - `files-check` : 12 834 fichiers, 10 782 PDF et 2 052 PNG, tous valides, aucun absent.
- **Mobile :** `tsc` OK ; export Android et iOS OK.
- **Navigateur :** marché en FR clair et AR sombre, défilement jusqu'à la fin. Les pages 1 à 7 se chargent l'une après l'autre ; 150 annonces affichées et « toutes les annonces sont affichées » ; aucune erreur JS.
- **Correction de carte :** le nom d'immeuble ne répète plus le nom de la résidence (il était tronqué en arabe).


## 2026-10-24 — Base de test isolée, e-mails, budgets, dépenses, modération, 403, code mort

### 1. Base de test isolée `syndycat_test`
- **Outil :** `scripts/src/testdb.ts` (`info`, `create`, `migrate`, `reference`, `generate`, `exec`, `drop --yes`). La cible est imposée : `syndycat_test` en local ; seul le nom de base de `DATABASE_URL` change. Rien n'est copié depuis la base de travail : tout est généré.
- **Volumes :**
  - 1 071 comptes, dont 1 057 générés ;
  - 61 copropriétés générées, plus 2 de démonstration ;
  - 12 683 fichiers valides (10 714 PDF, 1 969 PNG), rangés dans `uploads-test` ;
  - catalogue du marché et scénarios limites.
- **Contrôles :** `seedgen verify` 307/307 ; `files-check` : 0 fichier absent ou invalide.
- **Incident pendant la création :**
  - la première génération écrivait dans le dossier de fichiers de la base de travail (même graine, donc mêmes noms) ; 740 fichiers référencés ont été écrasés ;
  - restauration : 12 359 fichiers contrôlés octet par octet contre la sauvegarde ; 4 967 fichiers étrangers mis en quarantaine, pas supprimés ;
  - garde-fou ajouté : un marqueur `.mizan-database` par dossier, et le générateur refuse d'écrire dans le dossier d'une autre base. Voir `SECURITY_LOG.md`.
- **Défauts de `seed.ts` sur une base neuve :**
  - appels payés avec un montant payé à 0, et un appel « en validation » sans paiement déclaré ;
  - journaux d'e-mails « envoyés » vers des adresses `.test` ;
  - propriétés de lots, références de paiement et dates d'émission corrigées absentes, car calculées par les migrations sur une base existante.

  Tout est désormais rejoué de façon idempotente à la fin du seed.
- **Scénarios ajoutés (`seedgen -- scenarios`) :** une résidence sans aucun document, et deux syndics sans résidence.
- **Annonces générées :**
  - l'espagnol est ajouté ;
  - l'état fictif `tres_bon` est retiré ; 41 annonces générées corrigées dans chaque base.

### 2. E-mails des comptes de test
- **Configuration :** le domaine `TEST_EMAIL_ROOT` est centralisé dans `scripts/src/test-domain.ts` ; un domaine non réservé est refusé.
- **Interrupteur `OUTBOUND_DELIVERY=off` :** il coupe les e-mails, les SMS et les notifications push, et s'applique aussi au renvoi.
- **Journal des e-mails :** les messages qui contiennent un secret n'y sont plus conservés et ne peuvent plus être renvoyés.
- **Rapport sur la base de test :** 1 071 comptes, dont 1 070 en domaine réservé, tous non délivrables ; 0 syntaxe invalide ; 0 doublon ; un seul compte non vérifié, `superadmin@mizan.ma`.
- **Rapport sur la base de travail (lecture seule) :** 1 092 comptes ; 0 syntaxe invalide ; 0 doublon. À signaler, **non modifiés** :
  - 3 comptes `@gmail.com` et `superadmin@mizan.ma` en domaine réel ;
  - 5 journaux « envoyés » vers des adresses `.test`.

### 3. Budgets
- **Budgets de démonstration `budget_atlas_2026` et `budget_agdal_2026` :**
  - provenance vérifiée, montants recalculés au centime ;
  - retrait des lignes `bl_4` et `bl_7`, qui comptaient le fonds de réserve en double ; aucune référence ne pointait vers elles ;
  - sauvegarde `scripts/.seedgen/backups/2026-10-24T00-33-00-219Z/`, avec une copie des deux lignes ;
  - script `scripts/src/fixes/2026-10-24-demo-budget-reserve-lines.ts` : transactionnel, en simulation par défaut ;
  - résultat : `seedgen verify` sur la base de travail passe à 307/307.
- **Tests :** `budget-totals` 19/19, avec de nouveaux cas : valeur nulle, valeur négative, plus de 2 décimales, ligne négative, budget approuvé verrouillé.

### 4. Dépenses et gouvernance
- **Consultation par les copropriétaires :**
  - `GET /transparency/expenses/:id` : libellé, montant, devise, catégorie, fournisseur, facture, immeuble, ligne de budget, étapes ;
  - jamais d'informations bancaires, ni les noms des personnes qui ont traité la dépense ;
  - `…/proof` ouvre la facture.
- **Accès :** seules les dépenses approuvées ou payées de la copropriété du lecteur. Les autres répondent 404 ; un locataire reçoit 403.
- **Mobile :** fiche dépense (`ExpenseDetailSheet`), ouverte depuis « Finances de la copropriété ».
- **Vote existant sur les justificatifs :**
  - c'est un **avis consultatif** (une voix par compte, sans tantièmes ni quorum), désormais présenté comme tel ; aucun vote formel ni quorum n'a été inventé ;
  - corrigé : pas de doublon en cas de double clic, chaque avis et chaque changement tracés dans l'audit, clôture définitive (409), montant validé ;
  - sens de « pour » aligné sur ce que l'application affichait : « dépense justifiée ».
- **Tests :** `expense-governance` 22/22.

### 5. Modération du marché par le syndic
- **Qui modère :** le syndic, pour les annonces de sa résidence ; la plateforme garde toutes les résidences et la mise en avant.
- **Transitions réelles :**
  - approuver ou demander des modifications depuis « en attente » ;
  - retirer une annonce publiée ;
  - jamais toucher une annonce réservée ou vendue (409) ;
  - motif obligatoire pour un refus ou une demande de modification.
- **Historique :** chaque décision est tracée, lisible par le vendeur et le modérateur.
- **API :** `GET /products/moderation-queue` (paginée, cloisonnée) et `GET /products/:id/moderation-history`.
- **Mobile :** écran `moderation-annonces`, bannière « N annonces à valider » dans le marché, entrée dans le menu « Plus ».
- **Tests :** `marketplace-moderation` 22/22.

### 6. Requêtes refusées au démarrage
- **Copropriétaire :** 6 refus passent à 0 (`/members`, `/finance/transactions`, `/finance/salaries`, `/finance/caisse`, `/invoices`, `/bons-livraison`). Le client ne les demande plus qu'aux rôles que le serveur autorise.
- **Autres rôles :** `/payslips` (président, secrétaire, conseil, locataire) et `/meetings` (locataire) ne sont plus demandés. Désormais 0 refus pour chaque rôle de copropriété (mesure faite dans le navigateur).
- **Super-administrateur :** `/publications` répondait 500 au lieu d'un refus ; corrigé (voir `SECURITY_LOG.md`).

### 7. Statut des appels de fonds
- **Contradiction :** `settlementStatus` (paiements) classait un appel échu et partiellement payé « partially_paid », mais la tâche horaire `markOverdueCalls` et `/budgets/…/refresh` le passaient « overdue ».
- **Correction :** la tâche suit désormais la règle des paiements, et les relances couvrent aussi les appels partiellement payés et échus.
- **Données :** 1 629 lignes normalisées dans la base de test. Dans la base de travail, **1 489 lignes sont concernées et n'ont pas été modifiées : validation nécessaire.** Le contrôle `seedgen verify` est renforcé et les signale.

### 8. Langues
- **Langues conservées :** français, arabe, espagnol (et anglais).
- **`i18n` 9/9 :**
  - 4 745 clés complètes ;
  - arabe réellement en arabe ;
  - espagnol jamais resté en français ;
  - 4 413 usages de `t()` tous définis ;
  - variables cohérentes ;
  - icônes directionnelles inversées en arabe.
- **Textes juridiques :** restés en français, avec un avertissement dans les autres langues.

### 9. Coordonnées
- **Centralisées :** `constants/contact.ts` (mobile, variables `EXPO_PUBLIC_*`) et `lib/contact.ts` (API, `SUPPORT_EMAIL`).
- **Retirées du code :** `privacy@mizan.ma`, `support@mizan.ma` et la raison sociale « MIZAN Community OS SARL », jamais vérifiées.
- **Sans configuration :** l'écran indique « à compléter » et ne crée aucun lien.

### 10. Code mort
- **Supprimé :** `simulateur.tsx`, `terms.tsx` (anciennes CGU), `sms-verify.tsx`, `marketplace-moderation.tsx`, `components/BadgeCard.tsx`, et le générateur mort de `documents.tsx`.
- **Relié :** « Compléter mon profil » (`/onboarding`), depuis l'accueil et le profil.
- **Conservés mais inaccessibles (décision produit nécessaire) :** `agenda`, `documents-dashboard`, `repertoire-juridique`, `workflow`. Le panier n'est atteignable que depuis l'écran de la plateforme.

### 11. Limites de connexion pendant les tests
- **Profil `RATE_LIMIT_PROFILE=test` :** pris en compte uniquement sur la base locale `syndycat_test` et hors production. La production garde ses seuils : 60 / 10 / 500.
- **Tests :** `rate-limit-profile` 9/9, y compris les seuils annoncés par les deux API en marche.

### Tests exécutés le 2026-10-24
- **Base de test (API 5056, profil test) :**
  - **Accès et sécurité :** authentification 44/44, droits d'accès 35/35, IDOR 108/108, sécurité des documents 29/29, e-mails des comptes 24/24.
  - **Parcours :** parcours 135/135, scénario 48/48.
  - **Données et documents :** lots 65/65, copropriétés 62/62, réclamations 65/65, documents officiels 13/13, étape légale 12/12, étape e-mails 14/14.
  - **Finances :** allocation 59/59, appels de fonds 48/48, flux financiers 89/89, intégrité 35/35, transparence 9/9, référence de paiement 9/9, budgets 19/19, gouvernance des dépenses 22/22.
  - **Marché :** scénario 19/19, catalogue 20/20, modération 22/22.
  - **Transversal :** i18n 9/9, aucune erreur 500 (1 143/1 143 lectures), profil de limites 9/9.
- **Premier passage sur la base de test :** quatre suites (droits d'accès, lots, référence de paiement, scénario du marché) ont échoué à cause des données de cette base neuve :
  - copropriété suspendue ou abonnement expiré ;
  - ancienne adresse `.ma` ;
  - données dérivées absentes de `seed.ts`.

  Après correction des fixtures et du seed, elles passent à 35/35, 65/65, 9/9 et 19/19 sur les **deux** bases.
- **Base de travail (API 5055) :**
  - droits d'accès, lots, référence de paiement et scénario du marché : tous verts ;
  - `seedgen verify` 306/307 : le seul échec est la règle renforcée sur les 1 489 appels, qui attend votre décision ;
  - `files-check` : 12 834 fichiers intacts.
- **Mobile :** `tsc` OK ; export Android et iOS OK ; captures web (français clair, arabe sombre) de l'écran de modération et de la bannière du syndic.
- **Non vérifié :** appareils réels, fournisseurs externes (SMTP, SMS, push, paiement), stockage distant.

### Validations attendues
1. Repasser en « partially_paid » les 1 489 appels de la base de travail.
2. Effacer les 14 secrets anciens du journal des e-mails de la base de travail.
3. Décider du sort des 3 comptes `@gmail.com` et de `superadmin@mizan.ma`.
4. Corriger les 5 journaux « envoyés » fictifs de la base de travail.
5. Raccorder ou supprimer les écrans inaccessibles et le panier.
6. Fournir les coordonnées officielles (`EXPO_PUBLIC_*`, `SUPPORT_EMAIL`).

### Prochaine tâche
Appliquer les validations ci-dessus, puis tester sur un appareil réel.


## 2026-10-25 — Audit final des six points restants

### Inspection
- **Bases :**
  - `syndycat_global_cps` : base de travail, jamais nettoyée ni régénérée ;
  - `syndycat_test` : base isolée ;
  - `syndycat_restore_check` : base jetable, créée puis supprimée pour éprouver la sauvegarde.
- **Garde-fous vérifiés :**
  - marqueurs `.mizan-database` sur `uploads/` et `uploads-test/` ;
  - les deux API de test démarrent avec `OUTBOUND_DELIVERY=off` ;
  - seule l'API 5056 (base de test) a le profil de limites de test.
- **Journaux :** `PROJECT_BUGS_LOG.md` et `PROJECT_TEST_LOG.md` n'existent pas. Le suivi reste dans ce fichier, `SECURITY_LOG.md` et `LOCAL_RUN_COMMANDS.md`.

### Point 1 — Appels « en retard » partiellement payés : analysés, en attente de validation
- **Audit en lecture seule** (`scripts/src/audits/overdue-partial-audit.ts`, transaction `READ ONLY`) : **1 489 cas confirmés**.
- **Origine :** tous issus du générateur de données de test.
- **Contrôles, vrais pour chacun :**
  - montant payé = somme des paiements **validés** ;
  - écritures comptables conformes et non contrepassées ;
  - aucun ajustement contradictoire ;
  - échéance passée ;
  - aucun paiement en attente.
- **Paiements refusés :** 91 appels en ont aussi, sans effet sur le calcul.
- **Statut cible :** `partially_paid`, selon la règle de `settlementStatus`.
- **Plan :** `scripts/.seedgen/plans/2026-10-25-overdue-partial.json` (identifiants, avant/après, montants en centimes, empreinte `5834f59c…`, aucune donnée personnelle).

### Point 2 — 14 secrets anciens du journal des e-mails : analysés, en attente de validation
- **Contenu :** 3 codes de vérification (2 vers une adresse `@gmail.com`, réellement envoyés le 2026-09-02), 10 invitations d'équipe (mot de passe temporaire) et 1 e-mail de bienvenue, adressés à `example.invalid`.
- **Validité, vérifiée sans afficher aucun secret :**
  - codes expirés ou consommés : aucune ligne restante dans `otp_tokens` ;
  - comptes des invitations et du bienvenue supprimés : mot de passe temporaire inutilisable ;
  - **aucune révocation nécessaire.**
- **Copies :**
  - aucune dans `audit_logs`, qui ne garde que l'objet des e-mails ;
  - présentes dans les sauvegardes locales `scripts/.seedgen/backups/*/syndycat_global_cps.dump`, hors Git.
- **Prévention :** déjà en place (corps non conservé pour ces modèles) et testée (`email-accounts`, `email-delivery-status`).

### Point 3 — Quatre comptes sensibles : analysés, aucune modification
- **`superadmin@mizan.ma` :** compte de démonstration du `seed.ts`, réellement utilisé pour l'administration en développement (24 jetons de session). À conserver.
- **`user_tenant_1` et `user_tenant_2` (`@gmail.com`) :** démonstration confirmée ; ces adresses figuraient dans `seed.ts` (Git HEAD), qui utilise aujourd'hui `sara.bouzid@demo.test` et `omar.zaki@demo.test`. Comptes marqués non délivrables.
- **`9598787d-…` (`@gmail.com`, syndic) :** inscription par l'application le 2026-09-02, absent de tous les scripts. **Origine inconnue : aucune modification.**

### Point 4 — Journaux d'envoi : corrigé dans le code, données en attente de validation
- **Correction de mon rapport du 24 :** les 5 lignes « envoyées » vers `@example.invalid` (modèle `syndicate_created`, 26 septembre) ont été **réellement acceptées par le serveur SMTP** (1,2 s d'échange) : le statut est exact.
- **Les vrais journaux fictifs :** `email_1` à `email_7`, écrits par l'ancien seed :
  - `sent_at` strictement égal à `created_at` ;
  - domaines réels (`residence-atlas.ma`, `gmail.com`, `andalous.ma`) ;
  - `email_6` en « échec » et `email_7` en « en attente » permanent.
- **Code :**
  - migration additive 0017 `email_logs.provider_message_id` ;
  - la réponse du fournisseur (« 250 … queued as … ») y est enregistrée comme preuve d'acceptation ;
  - sens de chaque statut documenté dans `emailService.ts` ;
  - test `email-delivery-status` 7/7 avec un faux serveur SMTP local (simulation, adresse réservée, mise en attente, acceptation, refus, secret non conservé).
- **Migration 0017 :** appliquée à la base de test, puis à la base de travail après sauvegarde. Additive : 59 journaux avant comme après, aucune ligne modifiée.

### Point 5 — Écrans inaccessibles
- **Agenda : raccordé.**
  - les échéances viennent désormais des vrais appels de fonds du copropriétaire, avec le reste dû, et non plus des « cotisations » de l'ancien module syndical ;
  - bouton « Voir mes charges » ;
  - titre « Agenda de la copropriété » ;
  - entrée dans le menu « Plus » pour tous les rôles de copropriétaire.
- **Tableau de bord des documents : raccordé** (« Suivi des documents », syndic).
  - compteurs calculés par le serveur (`/documents/summary?source=generated|upload`, sans plafond de 200 lignes) ;
  - fichiers de la bibliothèque comptés à part, avec un lien ;
  - le filtre de statut des tuiles est réellement appliqué dans « Documents » (il était ignoré).
- **Workflows : faille de cloisonnement corrigée.**
  - la table n'a pas de colonne de copropriété, mais ses lignes décrivent les affaires d'une copropriété, et tout utilisateur connecté pouvait les lire ;
  - lecture réservée à la plateforme ;
  - écran conservé hors navigation, décision attendue.
- **Répertoire juridique :** contient du **droit du travail et syndical** (licenciement, représentants syndicaux…), hors sujet pour la copropriété. Rien n'a été modifié ; décision attendue.
- **Panier :** module hérité, sans paiement, redondant avec la réservation entre voisins. Données : 2 lignes de panier, 30 commandes, 19 avis rattachés aux commandes (à conserver). Suppression préparée, non effectuée.
- **Tests :** `screens-access` 14/14. Captures de l'agenda (arabe sombre, français clair) et du tableau de bord (français), sans erreur JavaScript.

### Point 6 — Coordonnées : laissées incomplètes, vérifiées
- Aucune valeur inventée ne subsiste.
- Un exemple de numéro réaliste a été remplacé par `+212 6XX XX XX XX`.
- L'identifiant d'événement de l'agenda passe sur un domaine réservé (`@mizan.invalid`).
- **Test :** `contacts-config` 6/6.

### Sauvegarde et retour arrière éprouvés
- **Sauvegarde :** `scripts/.seedgen/backups/2026-10-24T10-20-05-545Z/` (12,9 Mo, 130 tables).
- **Restauration :** dans `syndycat_restore_check` (`scripts/src/restore-check.ts`) ; contenu identique table par table, sauf 8 jetons de session créés depuis.
- **Corrections éprouvées sur cette copie :**
  - les trois opérations (`scripts/src/fixes/2026-10-25-pending-decisions.ts`) ont été exécutées réellement : 1 489, 14 et 7 lignes, exactement le plan ;
  - intégrité ensuite à 307/307 ;
  - retours arrière : 1 489 et 7 lignes restaurées ;
  - l'expurgation refuse tout retour arrière depuis son fichier, qui ne contient aucun secret ; seule la sauvegarde permet de la défaire.
- **Base copie :** supprimée.
- **Base de travail :** simulations seulement, état vérifié inchangé.

### Dépendances
Une installation automatique de `pnpm` a mis à jour `pnpm-lock.yaml` (notamment `expo` 54.0.37 → 54.0.38). Compilation et export Android/iOS vérifiés avec cette version.

### Tests du 2026-10-25 (base de test, API 5056)
- **Accès et sécurité :** auth 44/44 · RBAC 35/35 · IDOR 108/108 · sécurité des documents 29/29 · e-mails des comptes 24/24 · statuts d'envoi 7/7.
- **Parcours :** parcours 135/135 · scénario 48/48 · écrans 14/14.
- **Données de base :** lots 65/65 · copropriétés 62/62 · réclamations 65/65 · documents officiels 13/13 · étape légale 12/12 · étape e-mails 14/14.
- **Finances :** allocation 59/59 · appels de fonds 48/48 · flux financiers 89/89 · intégrité 35/35 · transparence 9/9 · référence de paiement 9/9 · budgets 19/19 · gouvernance des dépenses 22/22.
- **Marché :** scénario 19/19 · catalogue 20/20 · modération 22/22.
- **Transversal :** i18n 9/9 · coordonnées 6/6 · aucune erreur 500 (1 143/1 143) · profil de limites 9/9 · `seedgen verify` 307/307.
- **Base de travail (lecture seule) :** `verify` 306/307 (les 1 489 appels en attente de décision) ; `files-check` : 12 834 fichiers intacts.
- **Mobile :** `tsc` OK ; export Android et iOS OK.
- **Non vérifié :** appareils réels, fournisseurs externes réels, stockage distant.

### Décisions attendues
Voir le rapport du 2026-10-25.

### Prochaine tâche
Exécuter les opérations autorisées sur la base de travail, puis lancer `verify` et `files-check`.

## 2026-10-25 — Audit des pages : profil, coordonnées bancaires, abonnements, navigation, langue, mode sombre

Tous les tests ont tourné sur la base isolée `syndycat_test` (API :5056, envois externes coupés). La base de travail n'a reçu aucune écriture.

### Profil (`PUT /profile`, `app/profile.tsx`)
- **Serveur :**
  - nom nettoyé (espaces) et contrôlé : 2 à 100 caractères, aucun caractère de contrôle ;
  - téléphone validé et normalisé en E.164 (`06…` ou `07…` devient `+212…`) ; un champ vide l'efface ;
  - erreur précise renvoyée (`PHONE_INVALID`, champ fautif) ;
  - le rôle, la copropriété, le statut et l'e-mail ne sont jamais modifiables par cette route.
- **App :**
  - le formulaire est relu depuis le profil serveur à l'ouverture ;
  - il reste ouvert jusqu'à la confirmation du serveur ; double envoi bloqué ;
  - erreurs affichées sous le champ concerné ; confirmation demandée avant d'abandonner des modifications ;
  - profession modifiable ;
  - téléphone qui s'affichait en double supprimé ; les lignes « Téléphone » et « Profession » ouvrent le formulaire, plus l'onboarding.
- **Test `profile-update` :** 15/15.
- **Navigateur (arabe, mode sombre) :**
  - un numéro invalide est arrêté avant l'envoi ;
  - un numéro valide est enregistré en base (`+212611223344`) puis réaffiché ; la valeur d'origine a été restaurée.

### Coordonnées bancaires
- **Deux sources pour une même copropriété :**
  - les champs libres `syndicates.bank_*`, imprimés sur les PDF ;
  - les comptes de trésorerie (`treasury_accounts`), au RIB contrôlé, affichés pour le virement guidé.
- **Saisie (`lib/bank-details.ts`) :**
  - RIB marocain : 24 chiffres et clé modulo 97 ;
  - IBAN : modulo 97 ; un IBAN `MA` doit contenir un RIB valide ;
  - BIC : 8 ou 11 caractères.
  - Validation appliquée à `PUT /team/syndicate` (désormais typé et borné), `PUT /syndicates/:id` et `POST /syndicates`.
- **Audit :** chaque changement crée une entrée `BANK_DETAILS_UPDATED` (auteur, date, champs), RIB masqué aux 4 derniers chiffres.
- **PDF :**
  - ils impriment le compte bancaire de trésorerie par défaut, le même que l'app ; les champs de la copropriété ne servent qu'à défaut ;
  - le libellé indique « RIB » ou « IBAN » selon le cas.
- **Trésorerie (app) :** actions « Compte par défaut » et « Clôturer », avec confirmation. L'API les prévoyait, mais sans elles un changement de RIB restait invisible pour les copropriétaires.
- **Test `bank-details` :** 22/22. Il couvre la validation, la normalisation, l'audit masqué, les refus (copropriétaire, trésorier, autre copropriété, sans session) et l'absence de RIB complet dans les listes de trésorerie.

### Abonnements
- **Factures :** `GET /subscriptions/invoices` était lisible par tout résident ; il est désormais réservé au syndic, comme les paiements.
- **App :** l'écran `abonnements` est protégé par un `RoleGuard` (syndic, super-admin).
- **Test `subscriptions-access` :** 31/31.
  - Lecture du statut par tous ; paiements et factures réservés au syndic.
  - Écritures : refusées au résident et au trésorier ; opérations de plateforme refusées au syndic.
  - Isolation entre copropriétés ; supervision explicite pour le super-admin.
  - Abonnement expiré : écritures refusées (402), lectures et régularisation possibles.
  - Aucune écriture pendant le test.

### Navigation
- **Test `routes-resolve` :** 371/371 destinations mènent à un écran.
- **Liens morts supprimés :**
  - barre latérale : `/negociations`, `/ressources-humaines` ;
  - recherche : `/formations`, `/sondages`, `/annuaire`.
  Ces écrans n'ont jamais existé dans ce dépôt.
- **Recherche :** les entrées viennent du menu partagé (`constants/menu.ts`), traduites et filtrées par rôle, au lieu de 32 entrées figées en français.

### Langue avant connexion
- Sélecteur `LanguageSwitcher` sur l'accueil, la connexion et tous les écrans `AuthHero` ; il passe par le `setLang` existant (enregistré, redémarrage pour l'arabe).
- **Web :** `lang`, `dir` et le titre de page suivent la langue.
- Message de redémarrage dans la langue choisie ; slogan du logo traduit.
- Numéros (loi `18-00`, dates, références) isolés en arabe : ils ne s'inversent plus.
- **Navigateur :** accueil → langue → connexion → tableau de bord vérifié en anglais et en arabe (droite à gauche).

### Mode sombre
- **Thème de navigation :** il suit le thème de l'app ; avant, un fond `#F2F2F2` apparaissait sous chaque écran en mode sombre.
- **Fonds et textes fixes remplacés par les jetons :** organigramme, escalades, documents, fiches de paie, transparence, réunions, partenaires, statistiques, réclamations, utilisateurs, alertes.
- **Contraste :** texte rendu lisible sur l'éditeur, le studio et la demande de modèles.
- **Scan automatique :** 69 écrans en mode sombre, aucune erreur de page ; les signalements restants sont voulus.

### Autres corrections
- **Finance :** les montants de la carte de trésorerie passent à la ligne au lieu d'être tronqués.
- **Expo Go en mode tunnel :** l'hôte du tunnel n'est plus pris pour l'adresse de l'API, avec un avertissement explicatif. Le test `test:login-transport` passe à 7/7 ; son fichier manquait.
- **Tests préexistants corrigés :**
  - `audit-fixes` : voisin de la même résidence ;
  - `documents-library` : port de l'instance « stockage en panne » ;
  - `rate-limit-profile` : API de la base de travail ;
  - fixtures `election-audit` passées sur des domaines `.test`.

### Non fait / à décider
- Tests sur appareil réel.
- Éditeur, studio et demande de modèles : fond sombre fixe, ils ne suivent pas le thème clair.
- Textes juridiques : en français seulement ; une traduction validée par un juriste est nécessaire.
- Organisation suspendue : `/subscriptions` reste bloqué en 423, donc le syndic ne peut pas renouveler depuis l'app.
- Élection de remplacement automatique en cas de démission : règle métier absente.
- `syndicates.bank_*` et le compte de trésorerie par défaut restent deux champs distincts : faut-il les fusionner ?

## 2026-10-31 — Notifications multilingues avec lien, marché toutes résidences

### Notifications
- **Migration `0018_alert_i18n_links` (additive) :**
  - `alerts.key`, `alerts.params`, `alerts.link` ;
  - `users.language`, avec un contrôle `fr | ar | en | es`.
  - Appliquée à la base de travail et à `syndycat_test` ; aucune ligne existante modifiée.
- **Modèles (`lib/notification-texts.ts`) :**
  - 38 modèles en fr, en, ar et es : appels de fonds, paiements, dépenses, tickets, documents, élections, mandats, membres, parking, sinistres, travaux, contrats, recouvrement, abonnement ;
  - chacun avec sa page de destination et les rôles autorisés à l'ouvrir ;
  - en arabe, les valeurs (montants, périodes) sont isolées.
- **Création :** les 36 points de création utilisent les modèles. La copie française reste stockée pour les anciens clients. Seule l'expiration de document garde un texte libre, avec un lien vers Documents.
- **`GET /alerts` :**
  - rendu dans la langue demandée (`?lang`, sinon `Accept-Language`) ;
  - lien fourni seulement si le rôle peut ouvrir l'écran ;
  - les anciennes notifications restent inchangées.
- **Push :** chaque destinataire reçoit le texte dans sa langue (`users.language`, enregistrée par l'app), avec un lien adapté à son rôle.
- **App :**
  - le clic sur une notification la marque comme lue et ouvre l'écran concerné (centre de notifications, alertes, push) ;
  - les notifications sont rechargées quand la langue change ;
  - `tresorerie?tab=expenses` ouvre l'onglet des dépenses.
- **Sécurité :** l'alerte d'expiration de contrat était créée sans copropriété. Son push partait vers les gestionnaires de toutes les copropriétés (titre du contrat, nom du prestataire). Elle est maintenant rattachée à la copropriété de l'immeuble du contrat.
- **Test `notifications-i18n` :** 16/16 (vrai ticket, 4 langues, `Accept-Language`, liens par rôle, anciennes alertes, langue du push).
- **Navigateur :** un ticket est créé, la notification s'affiche en anglais, le clic ouvre `/support`.

### Marché : toutes les résidences
- **API :**
  - `?scope=all` (option `city` / `region`) liste les copropriétés ouvertes ; par défaut, toujours « ma résidence » ;
  - `GET /products/zones` donne les villes et le nombre d'annonces ;
  - fiche, réservation, favoris, signalement et panier sont ouverts aux annonces des copropriétés ouvertes ; une copropriété fermée ou suspendue reste en 404.
- **Masquage pour une autre résidence :**
  - immeuble, bloc et étage cachés ;
  - emplacement remplacé par la ville ;
  - prénom et initiale seulement ;
  - pas de téléphone ni d'e-mail (questions sur l'annonce).
- **Fichiers :** les photos et la vidéo d'une annonce publique d'une copropriété ouverte sont lisibles par tout utilisateur connecté ; les autres fichiers restent limités à leur copropriété.
- **App :**
  - sélecteur « Ma résidence / Toutes les résidences » ;
  - villes avec compteurs, titre et recherche adaptés au mode ;
  - pastille de ville sur les cartes ;
  - note dans la fiche ;
  - tri, prix et disponibilité regroupés derrière « Filtres », avec compteur et bouton « Effacer ».
- **Tests :**
  - `marketplace-scenario` 24/24 ;
  - `audit-fixes` 21/21, `idor` 108/108 et `documents-security` 29/29, mis à jour pour la nouvelle règle.

### Vérifications
- Régression sur `syndycat_test` : 39/40 suites vertes ; `election-audit` 29/30 (règle métier non décidée).
- Mobile : `tsc` 0 erreur, export Android/iOS OK. Captures du marché (FR clair, AR sombre).

### Non fait / à décider
- Réservation entre résidences : autorisée comme dans sa propre résidence (remise en main propre). À confirmer.
- Chat direct entre résidences : non ouvert ; les questions passent par l'annonce.
- Tests sur appareil réel, dont les notifications push.
