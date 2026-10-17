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
