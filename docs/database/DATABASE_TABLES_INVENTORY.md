# Inventaire des tables de la base

Généré par `seedgen inventory` le 2026-10-20 07:21 UTC, à partir du catalogue PostgreSQL réel (schéma `public`). 127 tables, 243 clés étrangères, aucune dépendance circulaire.

Ordre d'insertion (parents d'abord) : audit_logs → cart_items → document_sequences → email_logs → fiches_juridiques → notification_preferences → orders → organizations → otp_tokens → reclamations → reviews → scheduled_job_runs → subscription_plans → syndicates → travaux_privatifs → users → workflows → actes_administratifs → alerts → announcements → billing_invoices → blocked_users → bons_livraison → buildings → caisse_entries → conversations → cotisations → elections → expense_justifications → expense_votes → fonds_travaux → ideas → invoices → legal_alerts → meetings → members → message_reads → messages → national_rankings → organization_members → partners → password_reset_tokens → payment_proofs → payslips → prestataires → products → publications → refresh_tokens → sinistres → storage_objects → subscription_payments → support_tickets → syndicate_memberships → syndicate_subscriptions → template_definitions → template_requests → ticket_replies → travaux → treasury_accounts → union_actions → vote_receipts → workflow_steps → action_participants → action_supports → ag_proxies → ag_resolutions → alert_reads → allocation_keys → allocations → bank_statements → bon_items → budgets → candidates → chat_reports → conseil_syndical → contrats_prestataires → conversation_archives → election_proxies → election_questions → governance_delegations → idea_votes → invoice_attachments → invoice_items → ledger_entries → lots → marketplace_promotions → meeting_attendees → message_reactions → parking_spots → parking_violations → prestataire_evaluations → product_comments → product_favorites → product_reports → publication_comments → publication_likes → salary_records → template_definition_permissions → template_definition_versions → tenants → transactions → vehicles → visitor_parking_reservations → votes → allocation_key_versions → allocation_sources → appels_de_fonds → bank_statement_lines → budget_lines → charge_attachments → claims → debt_escalations → documents → expenses → lot_ownerships → reconciliation_matches → allocation_key_shares → allocation_lines → appel_adjustments → appel_payments → appel_reminders → claim_attachments → claim_events → claim_notifications → document_comments → document_signatures → document_versions

| Table | Fonction | Lignes actuelles | Prévu (génération) | Clés étrangères |
|---|---|---:|---|---|
| `actes_administratifs` | Actes administratifs | 5 | 1 à 4 par copropriété | syndicate_id→syndicates, created_by_id→users |
| `action_participants` | Participants aux actions | 3 | inchangé | action_id→union_actions, user_id→users |
| `action_supports` | Soutiens aux actions | 3 | inchangé | action_id→union_actions, user_id→users |
| `ag_proxies` | Procurations d'AG | 2 | ≈ 100 | meeting_id→meetings, syndicate_id→syndicates, grantor_id→members, grantee_id→members |
| `ag_resolutions` | Résolutions d'AG | 3 | ≈ 400 | meeting_id→meetings |
| `alert_reads` | Lectures des notifications | 11 | ≈ 55 % | alert_id→alerts, user_id→users |
| `alerts` | Notifications in-app | 471 | ≈ 10 000 | syndicate_id→syndicates, recipient_user_id→users |
| `allocation_key_shares` | Coefficients des clés | 0 | 0 | version_id→allocation_key_versions, lot_id→lots |
| `allocation_key_versions` | Versions de clés | 0 | 0 | key_id→allocation_keys |
| `allocation_keys` | Clés de répartition explicites | 0 | 0 | syndicate_id→syndicates, building_id→buildings |
| `allocation_lines` | Quote-part de chaque lot | 0 | ≈ 15 000 | allocation_id→allocations, source_id→allocation_sources, lot_id→lots |
| `allocation_sources` | Sources réparties | 0 | 1 par répartition | allocation_id→allocations, key_version_id→allocation_key_versions |
| `allocations` | Appels de fonds (en-têtes) émis par le moteur | 0 | 5 trimestres par immeuble (≈ 750) | syndicate_id→syndicates, building_id→buildings, correction_of→allocations |
| `announcements` | Annonces | 4 | ≈ 550 | syndicate_id→syndicates |
| `appel_adjustments` | Ajustements motivés | 0 | 0 | syndicate_id→syndicates, appel_id→appels_de_fonds |
| `appel_payments` | Paiements déclarés / validés / refusés | 2 | ≈ 10 000 | syndicate_id→syndicates, appel_id→appels_de_fonds, account_id→treasury_accounts, ledger_entry_id→ledger_entries |
| `appel_reminders` | Rappels d'échéance | 4 | 1 par obligation en retard (70 %) | syndicate_id→syndicates, appel_id→appels_de_fonds |
| `appels_de_fonds` | Obligations par lot (payées, partielles, en retard, en validation, à venir) | 10 | ≈ 12 000 | building_id→buildings, budget_id→budgets, owner_id→members, lot_id→lots |
| `audit_logs` | Journal d'audit | 218 | ≈ 6 000 | — |
| `bank_statement_lines` | Lignes de relevé | 0 | 1 par écriture bancaire du mois | syndicate_id→syndicates, account_id→treasury_accounts, statement_id→bank_statements |
| `bank_statements` | Relevés bancaires | 0 | 1 par copropriété (mois précédent) | syndicate_id→syndicates, account_id→treasury_accounts |
| `billing_invoices` | Factures SaaS | 5 | 1 par paiement | syndicate_id→syndicates |
| `blocked_users` | Blocages entre utilisateurs (messagerie) | 2 | 0 | blocker_id→users, blocked_id→users |
| `bon_items` | Lignes des bons | 2 | 1 à 3 par bon | bon_id→bons_livraison |
| `bons_livraison` | Bons de livraison | 2 | 1 à 3 par copropriété | syndicate_id→syndicates |
| `budget_lines` | Lignes budgétaires | 10 | 8 par budget approuvé | budget_id→budgets, prestataire_id→prestataires |
| `budgets` | Budgets annuels (approuvés + brouillons) | 3 | 2 à 3 par immeuble (≈ 350) | building_id→buildings |
| `buildings` | Immeubles | 3 | 1 à 4 par copropriété (≈ 150) | syndicate_id→syndicates, admin_id→users |
| `caisse_entries` | Ancienne caisse | 8 | inchangé | syndicate_id→syndicates |
| `candidates` | Candidats | 6 | 2 à 4 par élection | election_id→elections, user_id→users, building_id→buildings |
| `cart_items` | Paniers | 2 | 0 | — |
| `charge_attachments` | Pièces jointes d'appels | 3 | 0 | appel_de_fonds_id→appels_de_fonds, uploaded_by→users |
| `chat_reports` | Signalements de messages | 2 | 0 | reporter_id→users, reported_user_id→users, conversation_id→conversations, message_id→messages |
| `claim_attachments` | Photos des réclamations (fichiers réels) | 0 | ≈ 25 % | claim_id→claims |
| `claim_events` | Historique des réclamations | 0 | ≈ 3 500 | claim_id→claims |
| `claim_notifications` | File d'envoi des notifications de réclamation | 0 | 0 | event_id→claim_events |
| `claims` | Réclamations et incidents (tableau Kanban) | 0 | ≈ 900 | syndicate_id→syndicates, building_id→buildings, lot_id→lots, reporter_user_id→users, assignee_user_id→users, prestataire_id→prestataires, travaux_id→travaux |
| `conseil_syndical` | Membres du conseil syndical | 6 | 3 à 6 par copropriété | syndicate_id→syndicates, user_id→users, member_id→members, election_id→elections, candidate_id→candidates, revoked_by→users |
| `contrats_prestataires` | Contrats de maintenance | 4 | ≈ 400 | prestataire_id→prestataires, building_id→buildings |
| `conversation_archives` | Conversations archivées | 2 | 0 | conversation_id→conversations, user_id→users |
| `conversations` | Conversations résident ↔ syndic | 7 | ≈ 350 | syndicate_id→syndicates, building_id→buildings, participant1_id→users, participant2_id→users, created_by→users |
| `cotisations` | Ancien registre des cotisations | 7 | inchangé | syndicate_id→syndicates |
| `debt_escalations` | Escalade des impayés | 7 | inchangé | syndicate_id→syndicates, member_id→members, lot_id→lots |
| `document_comments` | Commentaires | 4 | ≈ 15 % | document_id→documents, author_id→users |
| `document_sequences` | Numérotation (JRN, REC, DEP, RCL, ALC, FAC…) | 11 | mise à jour au numéro max utilisé | — |
| `document_signatures` | Signatures | 4 | 0 | document_id→documents, signed_by→users, syndicate_id→syndicates |
| `document_versions` | Versions précédentes | 3 | ≈ 12 % | document_id→documents, modified_by→users |
| `documents` | Bibliothèque (fichiers réels, audiences, lots, personnels) | 8 | ≈ 2 500 | syndicate_id→syndicates, created_by→users, signed_by→users, deleted_by→users, rejected_by→users, approved_by→users, lot_id→lots |
| `election_proxies` | Procurations de vote | 2 | 0 | election_id→elections, syndicate_id→syndicates, grantor_id→users, grantee_id→users |
| `election_questions` | Questions aux candidats | 3 | ≈ 18 | election_id→elections, candidate_id→candidates, asked_by→users |
| `elections` | Élections du conseil | 3 | ≈ 36 | syndicate_id→syndicates, building_id→buildings, created_by→users |
| `email_logs` | Journal des e-mails envoyés | 37 | 0 | — |
| `expense_justifications` | Demandes de justification de dépense | 3 | ≈ 30 % des copropriétés | syndicate_id→syndicates |
| `expense_votes` | Votes sur les justifications | 5 | 4 par demande | justification_id→expense_justifications, user_id→users |
| `expenses` | Dépenses avec justificatif (fichier réel) | 0 | ≈ 1 400 | syndicate_id→syndicates, building_id→buildings, prestataire_id→prestataires, budget_line_id→budget_lines, travaux_id→travaux, account_id→treasury_accounts, ledger_entry_id→ledger_entries |
| `fiches_juridiques` | Fiches juridiques (référentiel) | 6 | inchangé | — |
| `fonds_travaux` | Fonds de travaux annuel | 4 | 1 par immeuble | syndicate_id→syndicates, building_id→buildings |
| `governance_delegations` | Délégations au sein du conseil | 0 | ≈ 50 % des copropriétés | syndicate_id→syndicates, delegant_id→conseil_syndical, delegataire_id→conseil_syndical, created_by→users, revoked_by→users |
| `idea_votes` | Votes sur les idées | 5 | ≈ 900 | idea_id→ideas, user_id→users |
| `ideas` | Boîte à idées | 4 | ≈ 180 | syndicate_id→syndicates, user_id→users |
| `invoice_attachments` | Pièces jointes de factures | 3 | 0 | invoice_id→invoices, uploaded_by→users |
| `invoice_items` | Lignes de factures | 4 | ≈ 2 200 | invoice_id→invoices |
| `invoices` | Factures et devis fournisseurs | 3 | ≈ 900 | syndicate_id→syndicates |
| `ledger_entries` | Journal (ouverture, encaissements, dépenses, salaires) | 2 | ≈ 15 000 | account_id→treasury_accounts, syndicate_id→syndicates, reverses_entry_id→ledger_entries |
| `legal_alerts` | Alertes réglementaires | 3 | inchangé | syndicate_id→syndicates |
| `lot_ownerships` | Propriété des lots (actuelle et historique, indivision 50/50) | 8 | ≈ 3 300 | syndicate_id→syndicates, lot_id→lots, member_id→members |
| `lots` | Lots : appartements, duplex, studios, commerces, bureaux, parkings, caves | 8 | ≈ 3 000 | building_id→buildings, owner_id→members |
| `marketplace_promotions` | Mises en avant payantes | 2 | 0 | product_id→products |
| `meeting_attendees` | Présences | 7 | ≈ 2 000 | meeting_id→meetings, user_id→users |
| `meetings` | Assemblées et réunions | 4 | ≈ 330 | syndicate_id→syndicates, created_by→users |
| `members` | Copropriétaires (avec ou sans compte) | 6 | ≈ 2 500 | syndicate_id→syndicates |
| `message_reactions` | Réactions | 4 | ≈ 20 % | message_id→messages, user_id→users |
| `message_reads` | Accusés de lecture | 7 | ≈ 1,6 par conversation | conversation_id→conversations, user_id→users |
| `messages` | Messages | 17 | ≈ 2 500 | conversation_id→conversations, sender_id→users |
| `national_rankings` | Classement mensuel des copropriétés | 4 | 12 par copropriété | syndicate_id→syndicates |
| `notification_preferences` | Préférences de notification | 6 | 1 par utilisateur | — |
| `orders` | Commandes | 2 | ≈ 25 | — |
| `organization_members` | Équipe des sociétés de syndic | 3 | 1 par administrateur | organization_id→organizations, user_id→users |
| `organizations` | Sociétés de syndic (gestionnaires) | 2 | 12 | — |
| `otp_tokens` | Codes à usage unique | 0 | 0 | — |
| `parking_spots` | Places (résidents et visiteurs) | 9 | ≈ 1 100 | building_id→buildings, lot_id→lots |
| `parking_violations` | Infractions de stationnement | 2 | 0 | spot_id→parking_spots, building_id→buildings, reported_by_id→users, resolved_by_id→users |
| `partners` | Partenaires (avantages résidents) | 3 | ≈ 25 | syndicate_id→syndicates |
| `password_reset_tokens` | Jetons de réinitialisation | 2 | 0 | user_id→users |
| `payment_proofs` | Preuves de l'ancien registre | 4 | inchangé | cotisation_id→cotisations |
| `payslips` | Bulletins de paie | 3 | 0 | syndicate_id→syndicates |
| `prestataire_evaluations` | Évaluations des prestataires | 6 | ≈ 300 | prestataire_id→prestataires, syndicate_id→syndicates |
| `prestataires` | Prestataires | 5 | 2 à 5 par copropriété (≈ 200) | building_id→buildings, syndicate_id→syndicates |
| `product_comments` | Commentaires | 3 | ≈ 60 | product_id→products |
| `product_favorites` | Favoris | 2 | ≈ 80 | product_id→products |
| `product_reports` | Signalements d'annonces | 2 | 0 | product_id→products |
| `products` | Annonces entre résidents | 6 | ≈ 200 | syndicate_id→syndicates |
| `publication_comments` | Commentaires | 3 | ≈ 500 | publication_id→publications, user_id→users |
| `publication_likes` | Mentions j'aime | 5 | ≈ 1 400 | publication_id→publications, user_id→users |
| `publications` | Publications des résidents | 5 | ≈ 350 | syndicate_id→syndicates, author_id→users |
| `reclamations` | Ancien module de réclamations RH | 6 | inchangé | — |
| `reconciliation_matches` | Rapprochements relevé ↔ journal | 0 | ≈ 80 % des lignes | syndicate_id→syndicates, statement_line_id→bank_statement_lines, ledger_entry_id→ledger_entries |
| `refresh_tokens` | Jetons de session | 77 | 0 | user_id→users |
| `reviews` | Avis | 2 | ≈ 15 | — |
| `salary_records` | Salaires du personnel (concierge, gardien) | 5 | ≈ 1 000 (payés → journal) | syndicate_id→syndicates, ledger_entry_id→ledger_entries |
| `scheduled_job_runs` | État des tâches planifiées | 9 | inchangé | — |
| `sinistres` | Sinistres | 4 | ≈ 90 | building_id→buildings |
| `storage_objects` | Fichiers stockés (PDF / images réels sur disque) | 2 | ≈ 4 500 | owner_id→users, syndicate_id→syndicates |
| `subscription_payments` | Paiements SaaS (passerelle « test-sandbox ») | 3 | 3 à 12 par copropriété (réussis, échoués, en attente) | syndicate_id→syndicates |
| `subscription_plans` | Offres SaaS (référentiel) | 3 | existantes, non modifiées | — |
| `support_tickets` | Demandes d'assistance | 4 | ≈ 200 | syndicate_id→syndicates, submitted_by_id→users |
| `syndicate_memberships` | Rôles supplémentaires dans d'autres copropriétés | 0 | ≈ 30 % des administrateurs de syndic | syndicate_id→syndicates, user_id→users |
| `syndicate_subscriptions` | Abonnement de chaque copropriété | 2 | 1 par copropriété | syndicate_id→syndicates |
| `syndicates` | Copropriétés (locataires de la plateforme) | 2 | 60 (active, suspended, draft, archived) | organization_id→organizations |
| `template_definition_permissions` | Droits sur les modèles | 9 | existants | template_id→template_definitions |
| `template_definition_versions` | Versions de modèles | 3 | existantes | created_by→users, template_id→template_definitions |
| `template_definitions` | Modèles de documents | 5 | existants | syndicate_id→syndicates, created_by→users |
| `template_requests` | Demandes de modèles | 3 | 0 | requested_by→users, syndicate_id→syndicates, reviewed_by→users |
| `tenants` | Baux (actifs, en attente, expirés) | 2 | ≈ 800 | lot_id→lots, building_id→buildings, syndicate_id→syndicates |
| `ticket_replies` | Réponses aux demandes | 5 | ≈ 150 | ticket_id→support_tickets |
| `transactions` | Ancien registre financier | 11 | inchangé | member_id→users, syndicate_id→syndicates, ledger_entry_id→ledger_entries |
| `travaux` | Travaux (signalés → terminés) | 5 | ≈ 550 | building_id→buildings, prestataire_id→prestataires, reported_by_id→users, assigned_by_id→users |
| `travaux_privatifs` | Demandes de travaux privatifs | 4 | ≈ 60 | syndicate_id→syndicates |
| `treasury_accounts` | Comptes bancaire et caisse | 4 | 2 par copropriété | syndicate_id→syndicates, building_id→buildings |
| `union_actions` | Actions syndicales (hors copropriété) | 3 | inchangé | syndicate_id→syndicates, created_by→users |
| `users` | Comptes utilisateurs (rôle principal) | 15 | ≈ 1 000 (tous rôles) | syndicate_id→syndicates |
| `vehicles` | Véhicules des résidents | 6 | ≈ 380 | lot_id→lots, user_id→users |
| `visitor_parking_reservations` | Réservations visiteurs | 2 | ≈ 90 | spot_id→parking_spots, requested_by_id→users |
| `vote_receipts` | Reçus de vote (qui a voté) | 5 | = bulletins | election_id→elections, voter_id→users, cast_by_proxy_id→users |
| `votes` | Bulletins (secrets) | 5 | ≈ 300 | election_id→elections, candidate_id→candidates |
| `workflow_steps` | Étapes des circuits | 15 | inchangé | workflow_id→workflows |
| `workflows` | Circuits de validation | 5 | inchangé | — |

## Détail par table

### `actes_administratifs` — 5 ligne(s)

*Actes administratifs* — génération : 1 à 4 par copropriété

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text |  |  |
| `created_by_id` | text |  |  |
| `type` | text | oui | `'decision'::text` |
| `statut` | text | oui | `'brouillon'::text` |
| `numero` | text | oui |  |
| `titre` | text | oui |  |
| `objet` | text | oui |  |
| `date` | text | oui |  |
| `date_echeance` | text |  |  |
| `auteur` | text | oui |  |
| `signataires` | _text |  | `'{}'::text[]` |
| `destinataires` | _text |  | `'{}'::text[]` |
| `resume_contenu` | text |  |  |
| `important` | boolean |  | `false` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `created_by_id` → `users(id)` (set null)

Index : `actes_administratifs_syndicate_id_idx`, `actes_administratifs_statut_idx`, `actes_administratifs_type_idx`

### `action_participants` — 3 ligne(s)

*Participants aux actions* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `action_id` | text | oui |  |
| `user_id` | text | oui |  |
| `user_name` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `action_id` → `union_actions(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (action_id, user_id)`

Index : `action_participants_action_id_idx`

### `action_supports` — 3 ligne(s)

*Soutiens aux actions* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `action_id` | text | oui |  |
| `user_id` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `action_id` → `union_actions(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (action_id, user_id)`

Index : `action_supports_action_id_idx`

### `ag_proxies` — 2 ligne(s)

*Procurations d'AG* — génération : ≈ 100

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `meeting_id` | text | oui |  |
| `syndicate_id` | text | oui |  |
| `grantor_id` | text |  |  |
| `grantor_name` | text | oui |  |
| `grantee_id` | text |  |  |
| `grantee_name` | text | oui |  |
| `status` | text | oui | `'pending'::text` |
| `document_url` | text |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `meeting_id` → `meetings(id)` (cascade) ; `syndicate_id` → `syndicates(id)` (cascade) ; `grantor_id` → `members(id)` (cascade) ; `grantee_id` → `members(id)` (set null)

Unicité : `UNIQUE (meeting_id, grantor_id)`

Index : `ag_proxies_meeting_id_idx`, `ag_proxies_grantor_id_idx`, `ag_proxies_grantee_id_idx`

### `ag_resolutions` — 3 ligne(s)

*Résolutions d'AG* — génération : ≈ 400

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `meeting_id` | text | oui |  |
| `building_id` | text |  |  |
| `number` | integer | oui |  |
| `title` | text | oui |  |
| `description` | text |  |  |
| `required_majority` | text |  | `'simple'::text` |
| `tantiemes_for` | integer |  | `0` |
| `tantiemes_against` | integer |  | `0` |
| `tantiemes_abstain` | integer |  | `0` |
| `result` | text |  | `'pending'::text` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `meeting_id` → `meetings(id)` (cascade)

Index : `ag_resolutions_meeting_id_idx`

### `alert_reads` — 11 ligne(s)

*Lectures des notifications* — génération : ≈ 55 %

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `alert_id` (PK) | text | oui |  |
| `user_id` (PK) | text | oui |  |
| `read_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `alert_id` → `alerts(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (alert_id, user_id)`

### `alerts` — 471 ligne(s)

*Notifications in-app* — génération : ≈ 10 000

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `message` | text | oui |  |
| `type` | text |  | `'info'::text` |
| `date` | text |  |  |
| `target` | text |  | `'all'::text` |
| `syndicate_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `recipient_user_id` | text |  |  |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `recipient_user_id` → `users(id)` (cascade)

Index : `alerts_syndicate_id_idx`, `alerts_recipient_user_id_idx`

### `allocation_key_shares` — 0 ligne(s)

*Coefficients des clés* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `version_id` | text | oui |  |
| `lot_id` | text | oui |  |
| `coefficient` | numeric |  |  |
| `excluded` | boolean | oui | `false` |
| `exclusion_reason` | text |  |  |

Clés étrangères : `version_id` → `allocation_key_versions(id)` (restrict) ; `lot_id` → `lots(id)` (restrict)

Unicité : `UNIQUE (version_id, lot_id)`

Contrôles : `CHECK (((coefficient IS NULL) OR (coefficient >= (0)::numeric)))` ; `CHECK (((excluded AND (coefficient IS NULL) AND (exclusion_reason IS NOT NULL)) OR ((NOT excluded) AND (coefficient IS NOT NULL))))`

### `allocation_key_versions` — 0 ligne(s)

*Versions de clés* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `key_id` | text | oui |  |
| `version` | integer | oui |  |
| `method` | text | oui |  |
| `categories` | _text | oui |  |
| `effective_from` | date | oui |  |
| `effective_to` | date |  |  |
| `source_reference` | text | oui |  |
| `change_reason` | text |  |  |
| `created_by` | text | oui |  |
| `created_at` | timestamp without time zone | oui | `now()` |

Clés étrangères : `key_id` → `allocation_keys(id)` (restrict)

Unicité : `UNIQUE (key_id, version)`

Contrôles : `CHECK ((method = ANY (ARRAY['shares'::text, 'equal'::text])))` ; `CHECK (((effective_to IS NULL) OR (effective_to >= effective_from)))`

### `allocation_keys` — 0 ligne(s)

*Clés de répartition explicites* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `building_id` | text | oui |  |
| `code` | text | oui |  |
| `name` | text | oui |  |
| `purpose` | text |  |  |
| `status` | text | oui | `'active'::text` |
| `created_by` | text | oui |  |
| `created_at` | timestamp without time zone | oui | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `building_id` → `buildings(id)` (restrict)

Unicité : `UNIQUE (building_id, lower(code))`

Contrôles : `CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))`

### `allocation_lines` — 0 ligne(s)

*Quote-part de chaque lot* — génération : ≈ 15 000

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `allocation_id` | text | oui |  |
| `source_id` | text | oui |  |
| `lot_id` | text | oui |  |
| `coefficient` | numeric | oui |  |
| `denominator` | numeric | oui |  |
| `amount` | numeric | oui |  |
| `rounding_adjustment` | numeric | oui | `'0'::numeric` |
| `explanation` | text | oui |  |

Clés étrangères : `allocation_id` → `allocations(id)` (restrict) ; `source_id` → `allocation_sources(id)` (restrict) ; `lot_id` → `lots(id)` (restrict)

Index : `allocation_lines_allocation_lot_idx`

### `allocation_sources` — 0 ligne(s)

*Sources réparties* — génération : 1 par répartition

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `allocation_id` | text | oui |  |
| `source_type` | text | oui |  |
| `source_id` | text | oui |  |
| `period` | text | oui |  |
| `charge_type` | text | oui |  |
| `label` | text | oui |  |
| `category` | text |  |  |
| `amount` | numeric | oui |  |
| `key_version_id` | text |  |  |
| `active` | boolean | oui | `true` |

Clés étrangères : `allocation_id` → `allocations(id)` (restrict) ; `key_version_id` → `allocation_key_versions(id)` (restrict)

Unicité : `UNIQUE (source_type, source_id, period, charge_type) WHERE active`

Index : `allocation_sources_allocation_idx`

### `allocations` — 0 ligne(s)

*Appels de fonds (en-têtes) émis par le moteur* — génération : 5 trimestres par immeuble (≈ 750)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `building_id` | text | oui |  |
| `reference` | text | oui |  |
| `period` | text | oui |  |
| `charge_type` | text | oui |  |
| `status` | text | oui | `'finalized'::text` |
| `total_amount` | numeric | oui |  |
| `inputs` | jsonb | oui |  |
| `inputs_hash` | text | oui |  |
| `idempotency_key` | text |  |  |
| `correction_of` | text |  |  |
| `correction_reason` | text |  |  |
| `ended_at` | timestamp without time zone |  |  |
| `ended_by` | text |  |  |
| `end_reason` | text |  |  |
| `created_by` | text | oui |  |
| `created_at` | timestamp without time zone | oui | `now()` |
| `issue_date` | date |  |  |
| `due_date` | date |  |  |
| `published_at` | timestamp without time zone |  |  |
| `published_by` | text |  |  |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `building_id` → `buildings(id)` (restrict) ; `correction_of` → `allocations(id)` (restrict)

Unicité : `UNIQUE (syndicate_id, reference)` ; `UNIQUE (syndicate_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)`

Contrôles : `CHECK (((due_date IS NULL) OR (issue_date IS NULL) OR (due_date >= issue_date)))` ; `CHECK ((status = ANY (ARRAY['draft'::text, 'finalized'::text, 'corrected'::text, 'reversed'::text])))`

Index : `allocations_building_period_idx`

### `announcements` — 4 ligne(s)

*Annonces* — génération : ≈ 550

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `body` | text | oui |  |
| `priority` | text |  | `'info'::text` |
| `audience` | text |  | `'Tous les membres'::text` |
| `pinned` | boolean |  | `false` |
| `syndicate_id` | text |  |  |
| `author_id` | text |  |  |
| `author` | text |  |  |
| `expires_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Index : `announcements_syndicate_id_idx`

### `appel_adjustments` — 0 ligne(s)

*Ajustements motivés* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `appel_id` | text | oui |  |
| `previous_amount` | numeric | oui |  |
| `new_amount` | numeric | oui |  |
| `reason` | text | oui |  |
| `created_by` | text | oui |  |
| `created_at` | timestamp without time zone | oui | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `appel_id` → `appels_de_fonds(id)` (restrict)

Contrôles : `CHECK (((new_amount > (0)::numeric) AND (new_amount <> previous_amount)))`

Index : `appel_adjustments_appel_idx`

### `appel_payments` — 2 ligne(s)

*Paiements déclarés / validés / refusés* — génération : ≈ 10 000

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `appel_id` | text | oui |  |
| `amount` | numeric | oui |  |
| `method` | text | oui |  |
| `reference` | text |  |  |
| `proof_url` | text |  |  |
| `notes` | text |  |  |
| `status` | text | oui | `'pending'::text` |
| `declared_by` | text | oui |  |
| `reviewed_by` | text |  |  |
| `reviewed_at` | timestamp without time zone |  |  |
| `rejection_reason` | text |  |  |
| `account_id` | text |  |  |
| `ledger_entry_id` | text |  |  |
| `receipt_number` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `appel_id` → `appels_de_fonds(id)` (restrict) ; `account_id` → `treasury_accounts(id)` (restrict) ; `ledger_entry_id` → `ledger_entries(id)` (restrict)

Unicité : `UNIQUE (appel_id) WHERE (status = 'pending'::text)` ; `UNIQUE (syndicate_id, receipt_number) WHERE (receipt_number IS NOT NULL)`

Contrôles : `CHECK ((amount > (0)::numeric))` ; `CHECK ((method = ANY (ARRAY['virement'::text, 'cheque'::text, 'especes'::text])))` ; `CHECK ((status = ANY (ARRAY['pending'::text, 'validated'::text, 'rejected'::text, 'reversed'::text])))`

Index : `appel_payments_syndicate_id_idx`, `appel_payments_appel_id_idx`

### `appel_reminders` — 4 ligne(s)

*Rappels d'échéance* — génération : 1 par obligation en retard (70 %)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `appel_id` | text | oui |  |
| `kind` | text | oui |  |
| `remaining` | numeric | oui |  |
| `recipients` | integer | oui | `0` |
| `created_by` | text |  |  |
| `created_at` | timestamp without time zone | oui | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `appel_id` → `appels_de_fonds(id)` (restrict)

Unicité : `UNIQUE (appel_id) WHERE (kind = 'overdue'::text)`

Contrôles : `CHECK ((kind = ANY (ARRAY['overdue'::text, 'manual'::text])))`

Index : `appel_reminders_appel_idx`

### `appels_de_fonds` — 10 ligne(s)

*Obligations par lot (payées, partielles, en retard, en validation, à venir)* — génération : ≈ 12 000

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `building_id` | text | oui |  |
| `budget_id` | text |  |  |
| `lot_id` | text | oui |  |
| `owner_id` | text |  |  |
| `period` | text | oui |  |
| `type` | text |  | `'charges_courantes'::text` |
| `amount` | numeric | oui |  |
| `due_date` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `payment_method` | text |  |  |
| `proof_url` | text |  |  |
| `notes` | text |  |  |
| `paid_date` | text |  |  |
| `receipt_number` | text |  |  |
| `rejection_reason` | text |  |  |
| `validated_by` | text |  |  |
| `validated_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `amount_paid` | numeric | oui | `'0'::numeric` |
| `cancelled_at` | timestamp without time zone |  |  |
| `cancelled_by` | text |  |  |
| `cancellation_reason` | text |  |  |
| `debtor_member_ids` | _text | oui | `'{}'::text[]` |
| `allocation_id` | text |  |  |
| `issue_date` | text |  |  |
| `original_amount` | numeric |  |  |

Clés étrangères : `building_id` → `buildings(id)` (cascade) ; `budget_id` → `budgets(id)` (set null) ; `owner_id` → `members(id)` (set null) ; `lot_id` → `lots(id)` (restrict)

Unicité : `UNIQUE (lot_id, period, type) WHERE (status IS DISTINCT FROM 'cancelled'::text)`

Contrôles : `CHECK (((amount_paid >= (0)::numeric) AND (amount_paid <= amount)))`

Index : `appels_building_id_idx`, `appels_lot_id_idx`, `appels_owner_id_idx`, `appels_status_idx`, `appels_due_date_idx`, `appels_building_period_idx`, `appels_debtor_member_ids_gin`, `appels_allocation_idx`

### `audit_logs` — 218 ligne(s)

*Journal d'audit* — génération : ≈ 6 000

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `user_id` | text |  |  |
| `user_name` | text |  |  |
| `actor_role` | text |  |  |
| `syndicate_id` | text |  |  |
| `is_supervision` | boolean | oui | `false` |
| `action` | text | oui |  |
| `entity` | text | oui |  |
| `entity_id` | text |  |  |
| `details` | text |  |  |
| `ip_address` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `audit_logs_syndicate_created_idx`

### `bank_statement_lines` — 0 ligne(s)

*Lignes de relevé* — génération : 1 par écriture bancaire du mois

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `account_id` | text | oui |  |
| `value_date` | date | oui |  |
| `amount` | numeric | oui |  |
| `label` | text | oui |  |
| `reference` | text |  |  |
| `external_id` | text | oui |  |
| `status` | text | oui | `'unmatched'::text` |
| `matched_amount` | numeric | oui | `'0'::numeric` |
| `note` | text |  |  |
| `import_batch_id` | text |  |  |
| `imported_by` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `statement_id` | text |  |  |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `account_id` → `treasury_accounts(id)` (restrict) ; `statement_id` → `bank_statements(id)` (restrict)

Unicité : `UNIQUE (account_id, external_id)`

Contrôles : `CHECK ((amount <> (0)::numeric))` ; `CHECK ((status = ANY (ARRAY['unmatched'::text, 'partial'::text, 'matched'::text, 'anomaly'::text, 'ignored'::text])))` ; `CHECK (((matched_amount >= (0)::numeric) AND (matched_amount <= abs(amount))))`

Index : `bank_statement_lines_account_status_idx`, `bank_statement_lines_statement_idx`

### `bank_statements` — 0 ligne(s)

*Relevés bancaires* — génération : 1 par copropriété (mois précédent)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `account_id` | text | oui |  |
| `reference` | text |  |  |
| `period_start` | date | oui |  |
| `period_end` | date | oui |  |
| `opening_balance` | numeric | oui |  |
| `closing_balance` | numeric | oui |  |
| `status` | text | oui | `'open'::text` |
| `closing_report` | jsonb |  |  |
| `closed_by` | text |  |  |
| `closed_at` | timestamp without time zone |  |  |
| `reopened_by` | text |  |  |
| `reopened_at` | timestamp without time zone |  |  |
| `reopen_reason` | text |  |  |
| `created_by` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `account_id` → `treasury_accounts(id)` (restrict)

Unicité : `UNIQUE (account_id, period_start)`

Contrôles : `CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))` ; `CHECK ((period_end >= period_start))`

Index : `bank_statements_account_period_idx`

### `billing_invoices` — 5 ligne(s)

*Factures SaaS* — génération : 1 par paiement

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `subscription_id` | text |  |  |
| `amount` | numeric | oui |  |
| `status` | text |  | `'open'::text` |
| `due_date` | timestamp without time zone |  |  |
| `paid_at` | timestamp without time zone |  |  |
| `description` | text |  |  |
| `period_start` | timestamp without time zone |  |  |
| `period_end` | timestamp without time zone |  |  |
| `payment_id` | text |  |  |
| `invoice_number` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict)

Index : `billing_invoices_syndicate_id_idx`

### `blocked_users` — 2 ligne(s)

*Blocages entre utilisateurs (messagerie)* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `blocker_id` | text | oui |  |
| `blocked_id` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `blocker_id` → `users(id)` (cascade) ; `blocked_id` → `users(id)` (cascade)

Unicité : `UNIQUE (blocker_id, blocked_id)`

Index : `blocked_users_blocker_id_idx`, `blocked_users_blocked_id_idx`

### `bon_items` — 2 ligne(s)

*Lignes des bons* — génération : 1 à 3 par bon

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `bon_id` | text | oui |  |
| `label` | text | oui |  |
| `quantity` | numeric | oui |  |
| `unit_price` | numeric | oui |  |

Clés étrangères : `bon_id` → `bons_livraison(id)` (cascade)

Index : `bon_items_bon_id_idx`

### `bons_livraison` — 2 ligne(s)

*Bons de livraison* — génération : 1 à 3 par copropriété

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `reference` | text | oui |  |
| `recipient` | text | oui |  |
| `date` | text | oui |  |
| `type` | text |  | `'sortie'::text` |
| `total` | numeric |  | `'0'::numeric` |
| `status` | text |  | `'draft'::text` |
| `syndicate_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (set null)

Index : `bons_livraison_syndicate_id_idx`

### `budget_lines` — 10 ligne(s)

*Lignes budgétaires* — génération : 8 par budget approuvé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `budget_id` | text | oui |  |
| `category` | text | oui |  |
| `label` | text | oui |  |
| `amount_annual` | numeric |  | `'0'::numeric` |
| `amount_q1` | numeric |  |  |
| `amount_q2` | numeric |  |  |
| `amount_q3` | numeric |  |  |
| `amount_q4` | numeric |  |  |
| `prestataire_id` | text |  |  |

Clés étrangères : `budget_id` → `budgets(id)` (cascade) ; `prestataire_id` → `prestataires(id)` (set null)

Index : `budget_lines_budget_id_idx`, `budget_lines_prestataire_id_idx`

### `budgets` — 3 ligne(s)

*Budgets annuels (approuvés + brouillons)* — génération : 2 à 3 par immeuble (≈ 350)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `year` | integer | oui |  |
| `building_id` | text | oui |  |
| `total_amount` | numeric |  | `'0'::numeric` |
| `charges_amount` | numeric |  | `'0'::numeric` |
| `fonds_reserve` | numeric |  | `'0'::numeric` |
| `status` | text |  | `'draft'::text` |
| `notes` | text |  |  |
| `created_by` | text |  |  |
| `voted_at` | timestamp without time zone |  |  |
| `meeting_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `building_id` → `buildings(id)` (cascade)

Index : `budgets_building_id_idx`, `budgets_status_idx`

### `buildings` — 3 ligne(s)

*Immeubles* — génération : 1 à 4 par copropriété (≈ 150)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `address` | text | oui |  |
| `city` | text |  | `'Casablanca'::text` |
| `type` | text |  | `'residential'::text` |
| `total_floors` | integer |  | `0` |
| `total_lots` | integer |  | `0` |
| `construction_year` | integer |  |  |
| `syndicate_id` | text |  |  |
| `admin_id` | text |  |  |
| `bank_account` | text |  |  |
| `registration_number` | text |  |  |
| `description` | text |  |  |
| `status` | text |  | `'active'::text` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `admin_id` → `users(id)` (set null)

Index : `buildings_syndicate_id_idx`

### `caisse_entries` — 8 ligne(s)

*Ancienne caisse* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `label` | text | oui |  |
| `amount` | numeric | oui |  |
| `type` | text | oui |  |
| `date` | text | oui |  |
| `category` | text |  | `''::text` |
| `syndicate_id` | text |  |  |
| `balance` | numeric |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Index : `caisse_entries_syndicate_id_idx`

### `candidates` — 6 ligne(s)

*Candidats* — génération : 2 à 4 par élection

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `election_id` | text | oui |  |
| `user_id` | text |  |  |
| `name` | text | oui |  |
| `post` | text | oui |  |
| `apartment_number` | text |  |  |
| `building_id` | text |  |  |
| `photo` | text |  |  |
| `bio` | text |  | `''::text` |
| `motivation_letter` | text |  | `''::text` |
| `program` | text |  | `''::text` |
| `status` | text |  | `'approved'::text` |
| `rejection_reason` | text |  |  |
| `withdrawn_at` | timestamp without time zone |  |  |
| `votes` | integer |  | `0` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `election_id` → `elections(id)` (cascade) ; `user_id` → `users(id)` (set null) ; `building_id` → `buildings(id)` (set null)

Index : `candidates_election_id_idx`, `candidates_status_idx`

### `cart_items` — 2 ligne(s)

*Paniers* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `user_id` | text | oui |  |
| `product_id` | text | oui |  |
| `product_name` | text |  |  |
| `price` | numeric |  |  |
| `seller_name` | text |  |  |
| `quantity` | integer |  | `1` |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `cart_items_user_id_idx`, `cart_items_product_id_idx`

### `charge_attachments` — 3 ligne(s)

*Pièces jointes d'appels* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `appel_de_fonds_id` | text | oui |  |
| `url` | text | oui |  |
| `filename` | text | oui |  |
| `mime_type` | text |  |  |
| `uploaded_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `appel_de_fonds_id` → `appels_de_fonds(id)` (cascade) ; `uploaded_by` → `users(id)` (set null)

Index : `charge_attachments_appel_id_idx`

### `chat_reports` — 2 ligne(s)

*Signalements de messages* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `reporter_id` | text | oui |  |
| `reported_user_id` | text |  |  |
| `conversation_id` | text |  |  |
| `message_id` | text |  |  |
| `reason` | text | oui |  |
| `status` | text |  | `'pending'::text` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `reporter_id` → `users(id)` (cascade) ; `reported_user_id` → `users(id)` (set null) ; `conversation_id` → `conversations(id)` (set null) ; `message_id` → `messages(id)` (set null)

Index : `chat_reports_status_idx`, `chat_reports_reported_user_id_idx`

### `claim_attachments` — 0 ligne(s)

*Photos des réclamations (fichiers réels)* — génération : ≈ 25 %

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `claim_id` | text | oui |  |
| `syndicate_id` | text | oui |  |
| `object_path` | text | oui |  |
| `file_name` | text |  |  |
| `mime_type` | text |  |  |
| `internal` | boolean | oui | `false` |
| `uploaded_by` | text | oui |  |
| `created_at` | timestamp without time zone | oui | `now()` |

Clés étrangères : `claim_id` → `claims(id)` (restrict)

Unicité : `UNIQUE (object_path)`

Index : `claim_attachments_claim_idx`

### `claim_events` — 0 ligne(s)

*Historique des réclamations* — génération : ≈ 3 500

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `claim_id` | text | oui |  |
| `syndicate_id` | text | oui |  |
| `type` | text | oui |  |
| `from_status` | text |  |  |
| `to_status` | text |  |  |
| `body` | text |  |  |
| `internal` | boolean | oui | `false` |
| `data` | jsonb |  |  |
| `author_id` | text |  |  |
| `author_name` | text |  |  |
| `request_key` | text |  |  |
| `created_at` | timestamp without time zone | oui | `now()` |

Clés étrangères : `claim_id` → `claims(id)` (restrict)

Unicité : `UNIQUE (claim_id, request_key) WHERE (request_key IS NOT NULL)`

Index : `claim_events_claim_idx`

### `claim_notifications` — 0 ligne(s)

*File d'envoi des notifications de réclamation* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `event_id` | text | oui |  |
| `claim_id` | text | oui |  |
| `syndicate_id` | text | oui |  |
| `user_id` | text | oui |  |
| `status` | text | oui | `'pending'::text` |
| `attempts` | integer | oui | `0` |
| `error` | text |  |  |
| `alert_id` | text |  |  |
| `created_at` | timestamp without time zone | oui | `now()` |
| `sent_at` | timestamp without time zone |  |  |

Clés étrangères : `event_id` → `claim_events(id)` (restrict)

Unicité : `UNIQUE (event_id, user_id)`

Contrôles : `CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))`

Index : `claim_notifications_status_idx`

### `claims` — 0 ligne(s)

*Réclamations et incidents (tableau Kanban)* — génération : ≈ 900

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `reference` | text | oui |  |
| `title` | text | oui |  |
| `description` | text | oui |  |
| `category` | text | oui |  |
| `scope` | text | oui | `'common'::text` |
| `building_id` | text |  |  |
| `lot_id` | text |  |  |
| `location` | text | oui |  |
| `status` | text | oui | `'received'::text` |
| `status_before_info` | text |  |  |
| `priority` | text | oui | `'normal'::text` |
| `due_at` | timestamp without time zone | oui |  |
| `reporter_user_id` | text |  |  |
| `reporter_name` | text | oui |  |
| `assignee_user_id` | text |  |  |
| `prestataire_id` | text |  |  |
| `assigned_at` | timestamp without time zone |  |  |
| `assigned_by` | text |  |  |
| `scheduled_for` | timestamp without time zone |  |  |
| `travaux_id` | text |  |  |
| `resolution` | text |  |  |
| `resolved_at` | timestamp without time zone |  |  |
| `resolved_by` | text |  |  |
| `closed_at` | timestamp without time zone |  |  |
| `closed_by` | text |  |  |
| `rejection_reason` | text |  |  |
| `reopen_count` | integer | oui | `0` |
| `version` | integer | oui | `1` |
| `idempotency_key` | text |  |  |
| `created_at` | timestamp without time zone | oui | `now()` |
| `updated_at` | timestamp without time zone | oui | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `building_id` → `buildings(id)` (set null) ; `lot_id` → `lots(id)` (set null) ; `reporter_user_id` → `users(id)` (set null) ; `assignee_user_id` → `users(id)` (set null) ; `prestataire_id` → `prestataires(id)` (set null) ; `travaux_id` → `travaux(id)` (set null)

Unicité : `UNIQUE (syndicate_id, reference)` ; `UNIQUE (syndicate_id, reporter_user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)`

Contrôles : `CHECK ((category = ANY (ARRAY['fuite_eau'::text, 'ascenseur'::text, 'eclairage'::text, 'electricite'::text, 'bruit'::text, 'proprete'::text, 'securite'::text, '` ; `CHECK ((status = ANY (ARRAY['received'::text, 'qualified'::text, 'assigned'::text, 'in_progress'::text, 'awaiting_info'::text, 'resolved'::text, 'closed'::text,` ; `CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'normal'::text, 'low'::text])))` ; `CHECK ((scope = ANY (ARRAY['common'::text, 'unit'::text])))` ; `CHECK (((scope = 'common'::text) OR (lot_id IS NOT NULL)))` ; `CHECK (((status <> ALL (ARRAY['resolved'::text, 'closed'::text])) OR ((resolution IS NOT NULL) AND (resolved_at IS NOT NULL))))`

Index : `claims_reporter_idx`, `claims_syndicate_status_idx`, `claims_assignee_idx`

### `conseil_syndical` — 6 ligne(s)

*Membres du conseil syndical* — génération : 3 à 6 par copropriété

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `user_id` | text |  |  |
| `member_id` | text |  |  |
| `role` | text | oui | `'member'::text` |
| `name` | text | oui |  |
| `email` | text |  |  |
| `phone` | text |  |  |
| `mandate_start` | text |  |  |
| `mandate_end` | text |  |  |
| `status` | text | oui | `'active'::text` |
| `notes` | text |  |  |
| `election_id` | text |  |  |
| `candidate_id` | text |  |  |
| `resigned_at` | timestamp without time zone |  |  |
| `resign_reason` | text |  |  |
| `revoked_at` | timestamp without time zone |  |  |
| `revoked_by` | text |  |  |
| `revoke_reason` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `user_id` → `users(id)` (set null) ; `member_id` → `members(id)` (set null) ; `election_id` → `elections(id)` (set null) ; `candidate_id` → `candidates(id)` (set null) ; `revoked_by` → `users(id)` (set null)

Index : `conseil_syndical_syndicate_id_idx`, `conseil_syndical_user_id_idx`, `conseil_syndical_status_idx`, `conseil_syndical_election_id_idx`

### `contrats_prestataires` — 4 ligne(s)

*Contrats de maintenance* — génération : ≈ 400

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `prestataire_id` | text | oui |  |
| `building_id` | text | oui |  |
| `title` | text | oui |  |
| `start_date` | text |  |  |
| `end_date` | text |  |  |
| `monthly_amount` | numeric |  |  |
| `annual_amount` | numeric |  |  |
| `status` | text |  | `'active'::text` |
| `auto_renew` | boolean |  | `false` |
| `document_url` | text |  |  |
| `notified_thresholds` | text |  | `'[]'::text` |
| `renewed_from_contract_id` | text |  |  |
| `terminated_at` | timestamp without time zone |  |  |
| `termination_reason` | text |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `prestataire_id` → `prestataires(id)` (cascade) ; `building_id` → `buildings(id)` (cascade)

Index : `contrats_prestataires_prestataire_id_idx`, `contrats_prestataires_building_id_idx`, `contrats_prestataires_status_idx`, `contrats_prestataires_end_date_idx`

### `conversation_archives` — 2 ligne(s)

*Conversations archivées* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `conversation_id` | text | oui |  |
| `user_id` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `conversation_id` → `conversations(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (conversation_id, user_id)`

Index : `conversation_archives_user_id_idx`

### `conversations` — 7 ligne(s)

*Conversations résident ↔ syndic* — génération : ≈ 350

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text |  |  |
| `building_id` | text |  |  |
| `conv_type` | text | oui | `'direct'::text` |
| `participant1_id` | text |  |  |
| `participant2_id` | text |  |  |
| `participant_ids` | text |  |  |
| `is_group` | boolean |  | `false` |
| `name` | text |  |  |
| `last_message` | text |  |  |
| `last_message_at` | timestamp without time zone |  |  |
| `created_by` | text |  |  |
| `product_id` | text |  |  |
| `incident_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `building_id` → `buildings(id)` (set null) ; `participant1_id` → `users(id)` (cascade) ; `participant2_id` → `users(id)` (cascade) ; `created_by` → `users(id)` (set null)

Index : `conversations_participant1_id_idx`, `conversations_participant2_id_idx`, `conversations_syndicate_id_idx`, `conversations_conv_type_idx`, `conversations_product_id_idx`, `conversations_incident_id_idx`

### `cotisations` — 7 ligne(s)

*Ancien registre des cotisations* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `member_id` | text | oui |  |
| `label` | text | oui |  |
| `period` | text | oui |  |
| `amount` | numeric | oui |  |
| `due_date` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `syndicate_id` | text |  |  |
| `paid_date` | text |  |  |
| `receipt` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict)

Index : `cotisations_member_id_idx`, `cotisations_syndicate_id_idx`, `cotisations_status_idx`

### `debt_escalations` — 7 ligne(s)

*Escalade des impayés* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text |  |  |
| `member_id` | text |  |  |
| `member_name` | text |  |  |
| `lot_id` | text |  |  |
| `resident_type` | text |  | `'member'::text` |
| `total_overdue` | numeric | oui |  |
| `overdue_months` | integer | oui |  |
| `escalation_level` | text | oui |  |
| `level` | text | oui |  |
| `status` | text |  | `'open'::text` |
| `letter_url` | text |  |  |
| `overridden_by` | text |  |  |
| `override_reason` | text |  |  |
| `overridden_at` | timestamp without time zone |  |  |
| `alert_sent_at` | timestamp without time zone |  |  |
| `meeting_id` | text |  |  |
| `resolved_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `member_id` → `members(id)` (set null) ; `lot_id` → `lots(id)` (set null)

Index : `debt_escalations_syndicate_id_idx`, `debt_escalations_member_id_idx`, `debt_escalations_lot_id_idx`, `debt_escalations_status_idx`, `debt_escalations_level_idx`

### `document_comments` — 4 ligne(s)

*Commentaires* — génération : ≈ 15 %

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `document_id` | text | oui |  |
| `author_id` | text | oui |  |
| `content` | text | oui |  |
| `parent_id` | text |  |  |
| `is_deleted` | boolean | oui | `false` |
| `edited_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `document_id` → `documents(id)` (cascade) ; `author_id` → `users(id)` (restrict)

Index : `document_comments_document_id_idx`, `document_comments_author_id_idx`

### `document_sequences` — 11 ligne(s)

*Numérotation (JRN, REC, DEP, RCL, ALC, FAC…)* — génération : mise à jour au numéro max utilisé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `prefix` | text | oui |  |
| `year` | integer | oui |  |
| `current_value` | integer | oui | `0` |

Unicité : `UNIQUE (syndicate_id, prefix, year)`

### `document_signatures` — 4 ligne(s)

*Signatures* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `document_id` | text | oui |  |
| `signed_by` | text | oui |  |
| `signed_at` | timestamp without time zone | oui | `now()` |
| `signer_role` | text | oui |  |
| `syndicate_id` | text |  |  |
| `ip_address` | text |  |  |
| `signature_data` | text |  |  |
| `signature_order` | integer | oui | `1` |
| `signer_name` | text |  |  |
| `is_valid` | boolean | oui | `true` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `document_id` → `documents(id)` (cascade) ; `signed_by` → `users(id)` (restrict) ; `syndicate_id` → `syndicates(id)` (cascade)

Unicité : `UNIQUE (document_id, signed_by)`

Index : `doc_signatures_document_id_idx`, `doc_signatures_signed_by_idx`, `document_signatures_syndicate_id_idx`

### `document_versions` — 3 ligne(s)

*Versions précédentes* — génération : ≈ 12 %

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `document_id` | text | oui |  |
| `version_number` | integer | oui |  |
| `title` | text | oui |  |
| `content` | text |  |  |
| `status` | text |  |  |
| `file_url` | text |  |  |
| `language` | text |  |  |
| `modified_by` | text |  |  |
| `modified_at` | timestamp without time zone | oui | `now()` |
| `change_reason` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `file_name` | text |  |  |
| `mime_type` | text |  |  |
| `size_bytes` | integer |  |  |
| `checksum` | text |  |  |

Clés étrangères : `document_id` → `documents(id)` (cascade) ; `modified_by` → `users(id)` (set null)

Unicité : `UNIQUE (document_id, version_number)`

Index : `document_versions_document_id_idx`

### `documents` — 8 ligne(s)

*Bibliothèque (fichiers réels, audiences, lots, personnels)* — génération : ≈ 2 500

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `category` | text | oui |  |
| `content` | text |  |  |
| `status` | text |  | `'draft'::text` |
| `syndicate_id` | text |  |  |
| `size` | text |  |  |
| `created_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `updated_at` | timestamp without time zone |  | `now()` |
| `file_url` | text |  |  |
| `document_number` | text |  |  |
| `template_id` | text |  |  |
| `version` | integer |  | `1` |
| `signed_at` | timestamp without time zone |  |  |
| `signed_by` | text |  |  |
| `published_at` | timestamp without time zone |  |  |
| `archived_at` | timestamp without time zone |  |  |
| `is_deleted` | boolean | oui | `false` |
| `deleted_at` | timestamp without time zone |  |  |
| `deleted_by` | text |  |  |
| `retention_until` | timestamp without time zone |  |  |
| `auto_archived` | boolean | oui | `false` |
| `language` | text | oui | `'fr'::text` |
| `rejected_at` | timestamp without time zone |  |  |
| `rejected_by` | text |  |  |
| `rejection_reason` | text |  |  |
| `approved_at` | timestamp without time zone |  |  |
| `approved_by` | text |  |  |
| `expires_at` | timestamp without time zone |  |  |
| `expiry_notified_bucket` | integer |  |  |
| `verification_token` | text |  |  |
| `superseded_by_document_id` | text |  |  |
| `generation_params` | jsonb |  |  |
| `appended_signature_pages` | integer | oui | `0` |
| `regeneration_failed` | boolean | oui | `false` |
| `subject_user_id` | text |  |  |
| `source` | text | oui | `'generated'::text` |
| `visibility` | text |  |  |
| `description` | text |  |  |
| `entity_type` | text |  |  |
| `entity_id` | text |  |  |
| `lot_id` | text |  |  |
| `file_name` | text |  |  |
| `mime_type` | text |  |  |
| `size_bytes` | integer |  |  |
| `checksum` | text |  |  |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `created_by` → `users(id)` (set null) ; `signed_by` → `users(id)` (set null) ; `deleted_by` → `users(id)` (set null) ; `rejected_by` → `users(id)` (set null) ; `approved_by` → `users(id)` (set null) ; `lot_id` → `lots(id)` (restrict)

Unicité : `UNIQUE (verification_token)`

Contrôles : `CHECK ((source = ANY (ARRAY['generated'::text, 'upload'::text])))` ; `CHECK (((visibility IS NULL) OR (visibility = ANY (ARRAY['syndic'::text, 'council'::text, 'owners'::text, 'residents'::text, 'unit'::text, 'personal'::text]))))` ; `CHECK (((visibility IS DISTINCT FROM 'unit'::text) OR (lot_id IS NOT NULL)))` ; `CHECK (((visibility IS DISTINCT FROM 'personal'::text) OR (subject_user_id IS NOT NULL)))`

Index : `documents_syndicate_id_idx`, `documents_category_idx`, `documents_status_idx`, `documents_document_number_idx`, `documents_retention_until_idx`, `documents_is_deleted_idx`, `documents_expires_at_idx`, `documents_subject_user_id_idx`, `documents_entity_idx`, `documents_lot_id_idx`, `documents_syndicate_checksum_idx`

### `election_proxies` — 2 ligne(s)

*Procurations de vote* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `election_id` | text | oui |  |
| `syndicate_id` | text |  |  |
| `grantor_id` | text | oui |  |
| `grantor_name` | text | oui |  |
| `grantee_id` | text | oui |  |
| `grantee_name` | text | oui |  |
| `status` | text | oui | `'active'::text` |
| `document_url` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `election_id` → `elections(id)` (cascade) ; `syndicate_id` → `syndicates(id)` (cascade) ; `grantor_id` → `users(id)` (cascade) ; `grantee_id` → `users(id)` (cascade)

Unicité : `UNIQUE (election_id, grantor_id)`

Index : `election_proxies_election_id_idx`, `election_proxies_grantee_id_idx`

### `election_questions` — 3 ligne(s)

*Questions aux candidats* — génération : ≈ 18

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `election_id` | text | oui |  |
| `candidate_id` | text | oui |  |
| `asked_by` | text | oui |  |
| `asked_by_name` | text | oui |  |
| `question` | text | oui |  |
| `answer` | text |  |  |
| `answered_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `election_id` → `elections(id)` (cascade) ; `candidate_id` → `candidates(id)` (cascade) ; `asked_by` → `users(id)` (cascade)

Index : `election_questions_election_id_idx`, `election_questions_candidate_id_idx`

### `elections` — 3 ligne(s)

*Élections du conseil* — génération : ≈ 36

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text |  |  |
| `title` | text | oui |  |
| `description` | text |  | `''::text` |
| `election_type` | text |  | `'special'::text` |
| `building_id` | text |  |  |
| `voting_method` | text |  | `'simple_majority'::text` |
| `quorum_percent` | integer |  | `50` |
| `majority_percent` | integer |  | `50` |
| `seats_count` | integer |  | `1` |
| `tenants_can_vote` | boolean |  | `false` |
| `status` | text |  | `'draft'::text` |
| `start_date` | text |  |  |
| `end_date` | text |  |  |
| `candidacy_start` | text |  |  |
| `candidacy_end` | text |  |  |
| `eligible_count` | integer |  |  |
| `participant_count` | integer |  | `0` |
| `quorum_reached` | boolean |  |  |
| `results_published_at` | timestamp without time zone |  |  |
| `cancel_reason` | text |  |  |
| `contest_reason` | text |  |  |
| `is_emergency` | boolean |  | `false` |
| `created_by` | text |  |  |
| `mandate_duration_months` | integer |  |  |
| `invalid_votes_count` | integer |  | `0` |
| `reminders_sent` | text |  | `'[]'::text` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `building_id` → `buildings(id)` (set null) ; `created_by` → `users(id)` (set null)

Index : `elections_syndicate_id_idx`, `elections_status_idx`

### `email_logs` — 37 ligne(s)

*Journal des e-mails envoyés* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `recipient` | text | oui |  |
| `subject` | text | oui |  |
| `template` | text | oui |  |
| `status` | text | oui | `'pending'::text` |
| `error_message` | text |  |  |
| `retry_count` | integer | oui | `0` |
| `syndicate_id` | text |  |  |
| `body_html` | text |  |  |
| `sent_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `email_logs_status_idx`, `email_logs_recipient_idx`, `email_logs_created_at_idx`, `email_logs_template_idx`

### `expense_justifications` — 3 ligne(s)

*Demandes de justification de dépense* — génération : ≈ 30 % des copropriétés

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text |  |  |
| `transaction_id` | text |  |  |
| `title` | text | oui |  |
| `description` | text | oui |  |
| `amount` | numeric | oui |  |
| `category` | text |  |  |
| `receipt_url` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `submitted_by` | text |  |  |
| `submitter_name` | text |  |  |
| `challenged_by` | text |  |  |
| `challenger_name` | text |  |  |
| `challenge_reason` | text |  |  |
| `vote_count` | integer |  | `0` |
| `votes_for` | integer |  | `0` |
| `votes_against` | integer |  | `0` |
| `resolved_at` | timestamp without time zone |  |  |
| `resolution_note` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Index : `expense_justifications_syndicate_id_idx`, `expense_justifications_status_idx`

### `expense_votes` — 5 ligne(s)

*Votes sur les justifications* — génération : 4 par demande

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `justification_id` | text | oui |  |
| `user_id` | text | oui |  |
| `vote` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `justification_id` → `expense_justifications(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (justification_id, user_id)`

### `expenses` — 0 ligne(s)

*Dépenses avec justificatif (fichier réel)* — génération : ≈ 1 400

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `building_id` | text |  |  |
| `reference` | text | oui |  |
| `label` | text | oui |  |
| `category` | text | oui |  |
| `amount` | numeric | oui |  |
| `currency` | text | oui | `'MAD'::text` |
| `supplier_name` | text |  |  |
| `prestataire_id` | text |  |  |
| `invoice_number` | text |  |  |
| `invoice_date` | date |  |  |
| `proof_url` | text | oui |  |
| `budget_line_id` | text |  |  |
| `travaux_id` | text |  |  |
| `status` | text | oui | `'submitted'::text` |
| `created_by` | text | oui |  |
| `approved_by` | text |  |  |
| `approved_at` | timestamp without time zone |  |  |
| `rejected_by` | text |  |  |
| `rejected_at` | timestamp without time zone |  |  |
| `rejection_reason` | text |  |  |
| `paid_by` | text |  |  |
| `paid_at` | timestamp without time zone |  |  |
| `payment_method` | text |  |  |
| `payment_reference` | text |  |  |
| `account_id` | text |  |  |
| `ledger_entry_id` | text |  |  |
| `idempotency_key` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `building_id` → `buildings(id)` (set null) ; `prestataire_id` → `prestataires(id)` (set null) ; `budget_line_id` → `budget_lines(id)` (set null) ; `travaux_id` → `travaux(id)` (set null) ; `account_id` → `treasury_accounts(id)` (restrict) ; `ledger_entry_id` → `ledger_entries(id)` (restrict)

Unicité : `UNIQUE (syndicate_id, reference)` ; `UNIQUE (travaux_id) WHERE (travaux_id IS NOT NULL)` ; `UNIQUE (syndicate_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)`

Contrôles : `CHECK ((amount > (0)::numeric))` ; `CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['virement'::text, 'cheque'::text, 'especes'::text, 'prelevement'::text]))))` ; `CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'paid'::text, 'cancelled'::text])))`

Index : `expenses_syndicate_status_idx`, `expenses_budget_line_id_idx`

### `fiches_juridiques` — 6 ligne(s)

*Fiches juridiques (référentiel)* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `theme` | text | oui |  |
| `titre` | text | oui |  |
| `resume` | text | oui |  |
| `contenu` | text | oui |  |
| `articles` | text |  | `'[]'::text` |
| `jurisprudence` | text |  | `'[]'::text` |
| `conseils` | text |  | `'[]'::text` |
| `important` | boolean |  | `false` |
| `updated` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `fiches_juridiques_theme_idx`

### `fonds_travaux` — 4 ligne(s)

*Fonds de travaux annuel* — génération : 1 par immeuble

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `building_id` | text |  |  |
| `year` | integer | oui |  |
| `budget_base` | numeric | oui |  |
| `rate_percent` | numeric | oui | `'5'::numeric` |
| `target_amount` | numeric | oui |  |
| `current_balance` | numeric | oui | `'0'::numeric` |
| `status` | text | oui | `'active'::text` |
| `approved_by_resolution_id` | text |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `building_id` → `buildings(id)` (cascade)

Unicité : `UNIQUE (syndicate_id, building_id, year)`

Index : `fonds_travaux_syndicate_id_idx`, `fonds_travaux_building_id_idx`

### `governance_delegations` — 0 ligne(s)

*Délégations au sein du conseil* — génération : ≈ 50 % des copropriétés

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `delegant_id` | text |  |  |
| `delegant_name` | text | oui |  |
| `delegataire_id` | text |  |  |
| `delegataire_name` | text | oui |  |
| `domaine` | text | oui |  |
| `description` | text | oui | `''::text` |
| `start_date` | text | oui |  |
| `end_date` | text | oui |  |
| `status` | text | oui | `'active'::text` |
| `created_by` | text |  |  |
| `revoked_at` | timestamp without time zone |  |  |
| `revoked_by` | text |  |  |
| `revoke_reason` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `delegant_id` → `conseil_syndical(id)` (set null) ; `delegataire_id` → `conseil_syndical(id)` (set null) ; `created_by` → `users(id)` (set null) ; `revoked_by` → `users(id)` (set null)

Index : `governance_delegations_syndicate_id_idx`, `governance_delegations_status_idx`, `governance_delegations_delegant_id_idx`, `governance_delegations_delegataire_id_idx`

### `idea_votes` — 5 ligne(s)

*Votes sur les idées* — génération : ≈ 900

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `idea_id` | text | oui |  |
| `user_id` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `idea_id` → `ideas(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (idea_id, user_id)`

Index : `idea_votes_idea_id_idx`

### `ideas` — 4 ligne(s)

*Boîte à idées* — génération : ≈ 180

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text |  |  |
| `user_id` | text |  |  |
| `user_name` | text | oui |  |
| `title` | text | oui |  |
| `description` | text | oui |  |
| `category` | text |  | `'general'::text` |
| `status` | text |  | `'submitted'::text` |
| `vote_count` | integer |  | `0` |
| `vote_deadline` | text |  |  |
| `implemented_at` | timestamp without time zone |  |  |
| `admin_note` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `user_id` → `users(id)` (set null)

Index : `ideas_syndicate_id_idx`, `ideas_status_idx`, `ideas_user_id_idx`

### `invoice_attachments` — 3 ligne(s)

*Pièces jointes de factures* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `invoice_id` | text | oui |  |
| `url` | text | oui |  |
| `filename` | text | oui |  |
| `mime_type` | text |  |  |
| `uploaded_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `invoice_id` → `invoices(id)` (cascade) ; `uploaded_by` → `users(id)` (set null)

Index : `invoice_attachments_invoice_id_idx`

### `invoice_items` — 4 ligne(s)

*Lignes de factures* — génération : ≈ 2 200

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `invoice_id` | text | oui |  |
| `label` | text | oui |  |
| `quantity` | numeric | oui |  |
| `unit_price` | numeric | oui |  |

Clés étrangères : `invoice_id` → `invoices(id)` (cascade)

Index : `invoice_items_invoice_id_idx`

### `invoices` — 3 ligne(s)

*Factures et devis fournisseurs* — génération : ≈ 900

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `reference` | text | oui |  |
| `type` | text |  | `'facture'::text` |
| `recipient` | text | oui |  |
| `date` | text | oui |  |
| `due_date` | text | oui |  |
| `status` | text |  | `'draft'::text` |
| `amount` | numeric |  | `'0'::numeric` |
| `syndicate_id` | text |  |  |
| `proof_url` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (set null)

Index : `invoices_syndicate_id_idx`

### `ledger_entries` — 2 ligne(s)

*Journal (ouverture, encaissements, dépenses, salaires)* — génération : ≈ 15 000 — table en ajout seul : jamais modifiée

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `account_id` | text | oui |  |
| `entry_number` | text | oui |  |
| `entry_date` | date | oui |  |
| `direction` | text | oui |  |
| `amount` | numeric | oui |  |
| `currency` | text | oui | `'MAD'::text` |
| `category` | text | oui |  |
| `label` | text | oui |  |
| `reference` | text |  |  |
| `source_type` | text | oui |  |
| `source_id` | text |  |  |
| `reverses_entry_id` | text |  |  |
| `building_id` | text |  |  |
| `proof_url` | text |  |  |
| `idempotency_key` | text |  |  |
| `created_by` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `account_id` → `treasury_accounts(id)` (restrict) ; `syndicate_id` → `syndicates(id)` (restrict) ; `reverses_entry_id` → `ledger_entries(id)` (restrict)

Unicité : `UNIQUE (syndicate_id, entry_number)` ; `UNIQUE (reverses_entry_id) WHERE (reverses_entry_id IS NOT NULL)` ; `UNIQUE (syndicate_id, idempotency_key) WHERE (idempotency_key IS NOT NULL)` ; `UNIQUE (source_type, source_id) WHERE (source_type = ANY (ARRAY['opening'::text, 'appel_payment'::text]))`

Contrôles : `CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])))` ; `CHECK ((amount > (0)::numeric))` ; `CHECK ((source_type = ANY (ARRAY['opening'::text, 'appel_payment'::text, 'expense'::text, 'salary'::text, 'manual'::text, 'transfer'::text, 'reversal'::text])))`

Index : `ledger_entries_syndicate_date_idx`, `ledger_entries_account_date_idx`

Déclencheurs : `ledger_entries_no_update_delete`, `ledger_entries_no_truncate`

### `legal_alerts` — 3 ligne(s)

*Alertes réglementaires* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `description` | text |  |  |
| `level` | text | oui |  |
| `category` | text | oui |  |
| `date` | text |  |  |
| `action` | text |  |  |
| `status` | text |  | `'open'::text` |
| `syndicate_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Index : `legal_alerts_syndicate_id_idx`

### `lot_ownerships` — 8 ligne(s)

*Propriété des lots (actuelle et historique, indivision 50/50)* — génération : ≈ 3 300

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `lot_id` | text | oui |  |
| `member_id` | text | oui |  |
| `share_percent` | numeric | oui |  |
| `start_date` | date | oui |  |
| `end_date` | date |  |  |
| `end_reason` | text |  |  |
| `created_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `lot_id` → `lots(id)` (restrict) ; `member_id` → `members(id)` (restrict)

Unicité : `UNIQUE (lot_id, member_id) WHERE (end_date IS NULL)`

Contrôles : `CHECK (((share_percent > (0)::numeric) AND (share_percent <= (100)::numeric)))` ; `CHECK (((end_date IS NULL) OR (end_date >= start_date)))`

Index : `lot_ownerships_lot_id_idx`, `lot_ownerships_member_id_idx`, `lot_ownerships_syndicate_id_idx`

### `lots` — 8 ligne(s)

*Lots : appartements, duplex, studios, commerces, bureaux, parkings, caves* — génération : ≈ 3 000

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `number` | text | oui |  |
| `type` | text |  | `'appartement'::text` |
| `floor` | integer |  | `0` |
| `surface_m2` | numeric |  |  |
| `titre_foncier` | text |  |  |
| `surface_cadastrale` | numeric |  |  |
| `tantiemes` | integer |  | `0` |
| `building_id` | text | oui |  |
| `owner_id` | text |  |  |
| `tenant_id` | text |  |  |
| `status` | text |  | `'occupied'::text` |
| `description` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `archived_at` | timestamp without time zone |  |  |
| `archived_by` | text |  |  |
| `archive_reason` | text |  |  |
| `version` | integer | oui | `0` |
| `updated_at` | timestamp without time zone |  |  |

Clés étrangères : `building_id` → `buildings(id)` (cascade) ; `owner_id` → `members(id)` (set null)

Unicité : `UNIQUE (building_id, lower(number)) WHERE (archived_at IS NULL)`

Contrôles : `CHECK ((tantiemes >= 0))` ; `CHECK ((status = ANY (ARRAY['occupied'::text, 'rented'::text, 'vacant'::text])))`

Index : `lots_building_id_idx`, `lots_owner_id_idx`

### `marketplace_promotions` — 2 ligne(s)

*Mises en avant payantes* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `product_id` | text | oui |  |
| `seller_id` | text | oui |  |
| `type` | text | oui |  |
| `start_date` | timestamp without time zone | oui |  |
| `end_date` | timestamp without time zone | oui |  |
| `amount` | numeric | oui |  |
| `status` | text |  | `'pending_payment'::text` |
| `payment_method` | text |  |  |
| `proof_url` | text |  |  |
| `rejection_reason` | text |  |  |
| `approved_by` | text |  |  |
| `validated_at` | timestamp without time zone |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `product_id` → `products(id)` (cascade)

Index : `marketplace_promotions_product_id_idx`, `marketplace_promotions_seller_id_idx`, `marketplace_promotions_status_idx`, `marketplace_promotions_end_date_idx`

### `meeting_attendees` — 7 ligne(s)

*Présences* — génération : ≈ 2 000

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `meeting_id` | text | oui |  |
| `user_id` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `meeting_id` → `meetings(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Index : `meeting_attendees_meeting_id_idx`

### `meetings` — 4 ligne(s)

*Assemblées et réunions* — génération : ≈ 330

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text |  |  |
| `title` | text | oui |  |
| `date` | text | oui |  |
| `time` | text |  |  |
| `location` | text |  |  |
| `type` | text |  | `'general'::text` |
| `description` | text |  |  |
| `agenda` | text |  |  |
| `status` | text |  | `'scheduled'::text` |
| `created_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `created_by` → `users(id)` (set null)

Index : `meetings_syndicate_id_idx`, `meetings_date_idx`, `meetings_status_idx`

### `members` — 6 ligne(s)

*Copropriétaires (avec ou sans compte)* — génération : ≈ 2 500

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `email` | text | oui |  |
| `phone` | text |  | `''::text` |
| `profession` | text |  | `''::text` |
| `syndicate_id` | text |  |  |
| `status` | text |  | `'active'::text` |
| `cotisation_status` | text |  | `'pending'::text` |
| `join_date` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Unicité : `UNIQUE (syndicate_id, lower(email))`

Index : `members_syndicate_id_idx`, `members_status_idx`

### `message_reactions` — 4 ligne(s)

*Réactions* — génération : ≈ 20 %

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `message_id` | text | oui |  |
| `user_id` | text | oui |  |
| `emoji` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `message_id` → `messages(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (message_id, user_id, emoji)`

Index : `message_reactions_message_id_idx`

### `message_reads` — 7 ligne(s)

*Accusés de lecture* — génération : ≈ 1,6 par conversation

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `conversation_id` | text | oui |  |
| `user_id` | text | oui |  |
| `last_read_at` | timestamp without time zone |  | `now()` |
| `last_delivered_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `conversation_id` → `conversations(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (conversation_id, user_id)`

Index : `message_reads_user_id_idx`

### `messages` — 17 ligne(s)

*Messages* — génération : ≈ 2 500

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `conversation_id` | text | oui |  |
| `sender_id` | text | oui |  |
| `sender_name` | text |  |  |
| `text` | text | oui | `''::text` |
| `message_type` | text | oui | `'text'::text` |
| `attachment_url` | text |  |  |
| `attachment_type` | text |  |  |
| `attachment_name` | text |  |  |
| `attachment_size` | integer |  |  |
| `duration_seconds` | integer |  |  |
| `deleted_at` | timestamp without time zone |  |  |
| `edited_at` | timestamp without time zone |  |  |
| `is_deleted_for_everyone` | boolean |  | `false` |
| `deleted_for_user_ids` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `conversation_id` → `conversations(id)` (cascade) ; `sender_id` → `users(id)` (cascade)

Index : `messages_conversation_id_idx`, `messages_created_at_idx`, `messages_conv_created_at_idx`

### `national_rankings` — 4 ligne(s)

*Classement mensuel des copropriétés* — génération : 12 par copropriété

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `month` | integer | oui |  |
| `year` | integer | oui |  |
| `collection_rate` | numeric |  | `'0'::numeric` |
| `incident_resolution_rate` | numeric |  | `'0'::numeric` |
| `documentation_score` | numeric |  | `'0'::numeric` |
| `meeting_compliance_score` | numeric |  | `'0'::numeric` |
| `member_satisfaction` | numeric |  | `'0'::numeric` |
| `total_score` | numeric |  | `'0'::numeric` |
| `rank` | integer |  | `0` |
| `region_rank` | integer |  | `0` |
| `region` | text |  | `''::text` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Unicité : `UNIQUE (syndicate_id, month, year)`

Index : `national_rankings_year_month_idx`, `national_rankings_score_idx`

### `notification_preferences` — 6 ligne(s)

*Préférences de notification* — génération : 1 par utilisateur

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `user_id` | text | oui |  |
| `push` | boolean |  | `true` |
| `email` | boolean |  | `true` |
| `in_app` | boolean |  | `true` |

### `orders` — 2 ligne(s)

*Commandes* — génération : ≈ 25

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `product_id` | text |  |  |
| `product_name` | text |  |  |
| `buyer_id` | text |  |  |
| `buyer_name` | text |  |  |
| `seller_id` | text |  |  |
| `seller_name` | text |  |  |
| `amount` | numeric |  |  |
| `status` | text |  | `'pending'::text` |
| `type` | text |  | `'purchase'::text` |
| `date` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `orders_buyer_id_idx`, `orders_seller_id_idx`, `orders_status_idx`, `orders_created_at_idx`

### `organization_members` — 3 ligne(s)

*Équipe des sociétés de syndic* — génération : 1 par administrateur

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `organization_id` | text | oui |  |
| `user_id` | text | oui |  |
| `role` | text | oui |  |
| `status` | text | oui | `'active'::text` |
| `granted_by` | text |  |  |
| `revoked_at` | timestamp without time zone |  |  |
| `revoked_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `organization_id` → `organizations(id)` (restrict) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (organization_id, user_id) WHERE (status = 'active'::text)`

Contrôles : `CHECK ((role = ANY (ARRAY['org_admin'::text, 'org_staff'::text])))` ; `CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))`

Index : `organization_members_user_idx`

### `organizations` — 2 ligne(s)

*Sociétés de syndic (gestionnaires)* — génération : 12

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `legal_name` | text |  |  |
| `ice_number` | text |  |  |
| `email` | text |  |  |
| `phone` | text |  |  |
| `address` | text |  |  |
| `city` | text |  |  |
| `status` | text | oui | `'active'::text` |
| `created_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Contrôles : `CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))`

### `otp_tokens` — 0 ligne(s)

*Codes à usage unique* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `email` | text | oui |  |
| `code_hash` | text | oui |  |
| `purpose` | text |  | `'email_verification'::text` |
| `expires_at` | timestamp without time zone | oui |  |
| `used_at` | timestamp without time zone |  |  |
| `attempts` | integer |  | `0` |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `otp_tokens_email_idx`, `otp_tokens_expires_at_idx`

### `parking_spots` — 9 ligne(s)

*Places (résidents et visiteurs)* — génération : ≈ 1 100

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `building_id` | text | oui |  |
| `lot_id` | text |  |  |
| `spot_number` | text | oui |  |
| `type` | text | oui | `'resident'::text` |
| `floor` | text |  |  |
| `status` | text | oui | `'available'::text` |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `building_id` → `buildings(id)` (cascade) ; `lot_id` → `lots(id)` (set null)

Unicité : `UNIQUE (building_id, spot_number)`

Index : `parking_spots_building_id_idx`, `parking_spots_lot_id_idx`, `parking_spots_status_idx`

### `parking_violations` — 2 ligne(s)

*Infractions de stationnement* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `spot_id` | text |  |  |
| `building_id` | text | oui |  |
| `plate_number` | text | oui |  |
| `reported_by_id` | text | oui |  |
| `reported_by_name` | text | oui |  |
| `photo_url` | text |  |  |
| `notes` | text |  |  |
| `status` | text | oui | `'open'::text` |
| `resolved_by_id` | text |  |  |
| `resolved_at` | timestamp without time zone |  |  |
| `reported_at` | timestamp without time zone |  | `now()` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `spot_id` → `parking_spots(id)` (set null) ; `building_id` → `buildings(id)` (cascade) ; `reported_by_id` → `users(id)` (cascade) ; `resolved_by_id` → `users(id)` (set null)

Index : `parking_violations_building_id_idx`, `parking_violations_spot_id_idx`, `parking_violations_status_idx`, `parking_violations_reported_at_idx`

### `partners` — 3 ligne(s)

*Partenaires (avantages résidents)* — génération : ≈ 25

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `type` | text | oui |  |
| `sector` | text |  |  |
| `contact` | text |  |  |
| `phone` | text |  |  |
| `email` | text |  |  |
| `benefit` | text |  |  |
| `discount` | text |  |  |
| `start_date` | text |  |  |
| `end_date` | text |  |  |
| `description` | text |  | `''::text` |
| `syndicate_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Index : `partners_syndicate_id_idx`

### `password_reset_tokens` — 2 ligne(s)

*Jetons de réinitialisation* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `user_id` | text | oui |  |
| `token` | text | oui |  |
| `expires_at` | timestamp without time zone | oui |  |
| `used_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (token)` ; `UNIQUE (token)`

Index : `password_reset_tokens_user_id_idx`

### `payment_proofs` — 4 ligne(s)

*Preuves de l'ancien registre* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `cotisation_id` | text | oui |  |
| `user_id` | text |  |  |
| `file_url` | text |  |  |
| `proof_url` | text |  |  |
| `amount` | numeric |  |  |
| `notes` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `uploaded_by_id` | text |  |  |
| `reviewed_by_id` | text |  |  |
| `review_note` | text |  |  |
| `reviewed_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `cotisation_id` → `cotisations(id)` (cascade)

Index : `payment_proofs_cotisation_id_idx`, `payment_proofs_status_idx`

### `payslips` — 3 ligne(s)

*Bulletins de paie* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `user_id` | text |  |  |
| `month` | text |  |  |
| `amount` | numeric |  |  |
| `file_url` | text |  |  |
| `syndicate_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Index : `payslips_syndicate_id_idx`

### `prestataire_evaluations` — 6 ligne(s)

*Évaluations des prestataires* — génération : ≈ 300

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `prestataire_id` | text | oui |  |
| `travaux_id` | text |  |  |
| `syndicate_id` | text |  |  |
| `quality` | integer | oui |  |
| `speed` | integer | oui |  |
| `communication` | integer | oui |  |
| `price` | integer | oui |  |
| `average` | numeric | oui |  |
| `comment` | text |  |  |
| `rated_by_id` | text |  |  |
| `rated_by_name` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `prestataire_id` → `prestataires(id)` (cascade) ; `syndicate_id` → `syndicates(id)` (cascade)

Index : `prestataire_evaluations_prestataire_id_idx`, `prestataire_evaluations_syndicate_id_idx`

### `prestataires` — 5 ligne(s)

*Prestataires* — génération : 2 à 5 par copropriété (≈ 200)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `type` | text | oui |  |
| `contact_name` | text |  |  |
| `phone` | text |  |  |
| `email` | text |  |  |
| `address` | text |  |  |
| `ice` | text |  |  |
| `rc` | text |  |  |
| `building_id` | text |  |  |
| `syndicate_id` | text |  |  |
| `status` | text |  | `'active'::text` |
| `rating` | numeric |  |  |
| `evaluations_count` | integer |  | `0` |
| `notes` | text |  |  |
| `document_url` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `building_id` → `buildings(id)` (set null) ; `syndicate_id` → `syndicates(id)` (cascade)

Index : `prestataires_syndicate_id_idx`, `prestataires_building_id_idx`, `prestataires_status_idx`

### `product_comments` — 3 ligne(s)

*Commentaires* — génération : ≈ 60

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `product_id` | text | oui |  |
| `user_id` | text | oui |  |
| `user_name` | text |  |  |
| `user_role` | text |  |  |
| `content` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `product_id` → `products(id)` (cascade)

Index : `product_comments_product_id_idx`, `product_comments_created_at_idx`

### `product_favorites` — 2 ligne(s)

*Favoris* — génération : ≈ 80

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `product_id` | text | oui |  |
| `user_id` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `product_id` → `products(id)` (cascade)

Unicité : `UNIQUE (product_id, user_id)`

Index : `product_favorites_product_id_idx`, `product_favorites_user_id_idx`

### `product_reports` — 2 ligne(s)

*Signalements d'annonces* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `product_id` | text | oui |  |
| `reporter_id` | text | oui |  |
| `reporter_name` | text |  |  |
| `reason` | text | oui |  |
| `details` | text |  | `''::text` |
| `status` | text |  | `'pending'::text` |
| `reviewed_by` | text |  |  |
| `reviewed_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `product_id` → `products(id)` (cascade)

Index : `product_reports_product_id_idx`, `product_reports_reporter_id_idx`, `product_reports_status_idx`

### `products` — 6 ligne(s)

*Annonces entre résidents* — génération : ≈ 200

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `description` | text |  | `''::text` |
| `price` | numeric | oui |  |
| `original_price` | numeric |  |  |
| `category` | text | oui |  |
| `condition` | text |  | `'bon'::text` |
| `brand` | text |  |  |
| `model` | text |  |  |
| `purchase_year` | text |  |  |
| `selling_reason` | text |  |  |
| `negotiable` | boolean |  | `false` |
| `contact_preferences` | text |  | `'["chat"]'::text` |
| `location` | text |  | `''::text` |
| `building` | text |  |  |
| `block` | text |  |  |
| `floor` | text |  |  |
| `image_urls` | text |  | `'[]'::text` |
| `video_url` | text |  |  |
| `stock` | integer |  | `1` |
| `syndicate_id` | text |  |  |
| `seller_id` | text |  |  |
| `seller_name` | text |  |  |
| `seller_phone` | text |  |  |
| `seller_email` | text |  |  |
| `status` | text |  | `'pending_review'::text` |
| `rejection_reason` | text |  |  |
| `moderation_note` | text |  |  |
| `moderated_by` | text |  |  |
| `moderated_at` | timestamp without time zone |  |  |
| `featured` | boolean |  | `false` |
| `boosted` | boolean |  | `false` |
| `boost_type` | text |  |  |
| `boost_expires_at` | timestamp without time zone |  |  |
| `view_count` | integer |  | `0` |
| `reserved_by` | text |  |  |
| `reserved_by_name` | text |  |  |
| `reserved_at` | timestamp without time zone |  |  |
| `sold_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Index : `products_status_idx`, `products_seller_id_idx`, `products_syndicate_id_idx`, `products_category_idx`, `products_featured_idx`, `products_created_at_idx`

### `publication_comments` — 3 ligne(s)

*Commentaires* — génération : ≈ 500

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `publication_id` | text | oui |  |
| `author_id` | text |  |  |
| `author_name` | text |  |  |
| `user_id` | text |  |  |
| `user_name` | text |  |  |
| `text` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `publication_id` → `publications(id)` (cascade) ; `user_id` → `users(id)` (set null)

### `publication_likes` — 5 ligne(s)

*Mentions j'aime* — génération : ≈ 1 400

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `publication_id` (PK) | text | oui |  |
| `user_id` (PK) | text | oui |  |

Clés étrangères : `publication_id` → `publications(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (publication_id, user_id)`

### `publications` — 5 ligne(s)

*Publications des résidents* — génération : ≈ 350

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `content` | text | oui |  |
| `category` | text |  | `''::text` |
| `pinned` | boolean |  | `false` |
| `syndicate_id` | text |  |  |
| `author_id` | text |  |  |
| `author_name` | text |  |  |
| `likes` | integer |  | `0` |
| `comments` | integer |  | `0` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `author_id` → `users(id)` (set null)

Index : `publications_syndicate_id_idx`

### `reclamations` — 6 ligne(s)

*Ancien module de réclamations RH* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `reference` | text | oui |  |
| `type` | text | oui |  |
| `statut` | text |  | `'deposee'::text` |
| `priorite` | text |  | `'normale'::text` |
| `titre` | text | oui |  |
| `description` | text | oui |  |
| `member_id` | text |  |  |
| `member_name` | text |  |  |
| `service` | text |  | `''::text` |
| `date_depot` | text | oui |  |
| `date_echeance` | text |  |  |
| `date_cloture` | text |  |  |
| `traite_par` | text |  |  |
| `commentaire_admin` | text |  |  |
| `documents_joints` | text |  | `'[]'::text` |
| `etapes` | text |  | `'[]'::text` |
| `anonymous` | boolean |  | `false` |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `reclamations_member_id_idx`, `reclamations_statut_idx`, `reclamations_priorite_idx`

### `reconciliation_matches` — 0 ligne(s)

*Rapprochements relevé ↔ journal* — génération : ≈ 80 % des lignes

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `statement_line_id` | text | oui |  |
| `ledger_entry_id` | text | oui |  |
| `amount` | numeric | oui |  |
| `matched_by` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `statement_line_id` → `bank_statement_lines(id)` (restrict) ; `ledger_entry_id` → `ledger_entries(id)` (restrict)

Unicité : `UNIQUE (statement_line_id, ledger_entry_id)`

Contrôles : `CHECK ((amount > (0)::numeric))`

Index : `reconciliation_matches_ledger_entry_idx`

### `refresh_tokens` — 77 ligne(s)

*Jetons de session* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `user_id` | text | oui |  |
| `token` | text | oui |  |
| `expires_at` | timestamp without time zone | oui |  |
| `revoked_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `context_syndicate_id` | text |  |  |

Clés étrangères : `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (token)` ; `UNIQUE (token)`

Index : `refresh_tokens_user_id_idx`

### `reviews` — 2 ligne(s)

*Avis* — génération : ≈ 15

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `product_id` | text |  |  |
| `product_name` | text |  |  |
| `order_id` | text |  |  |
| `rating` | integer | oui |  |
| `comment` | text |  | `''::text` |
| `reviewer_id` | text |  |  |
| `reviewer_name` | text |  |  |
| `date` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `reviews_product_id_idx`, `reviews_reviewer_id_idx`

### `salary_records` — 5 ligne(s)

*Salaires du personnel (concierge, gardien)* — génération : ≈ 1 000 (payés → journal)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `employee` | text | oui |  |
| `role` | text | oui |  |
| `amount` | numeric | oui |  |
| `month` | text | oui |  |
| `status` | text |  | `'pending'::text` |
| `paid_date` | text |  |  |
| `syndicate_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `ledger_entry_id` | text |  |  |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `ledger_entry_id` → `ledger_entries(id)` (no action)

Index : `salary_records_syndicate_id_idx`

### `scheduled_job_runs` — 9 ligne(s)

*État des tâches planifiées* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `name` (PK) | text | oui |  |
| `last_run_at` | timestamp without time zone | oui |  |
| `last_status` | text |  |  |
| `last_error` | text |  |  |
| `last_duration_ms` | integer |  |  |

### `sinistres` — 4 ligne(s)

*Sinistres* — génération : ≈ 90

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `building_id` | text | oui |  |
| `lot_id` | text |  |  |
| `type` | text | oui |  |
| `description` | text | oui |  |
| `date` | text | oui |  |
| `estimated_amount` | numeric |  |  |
| `indemnised_amount` | numeric |  |  |
| `claim_number` | text |  |  |
| `status` | text |  | `'declared'::text` |
| `urgency` | text |  | `'normal'::text` |
| `image_urls` | text |  | `'[]'::text` |
| `contractor_id` | text |  |  |
| `resolved_at` | timestamp without time zone |  |  |
| `resolution_note` | text |  |  |
| `invoice_url` | text |  |  |
| `reported_by_id` | text |  |  |
| `reported_by_name` | text |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `building_id` → `buildings(id)` (cascade)

Index : `sinistres_building_id_idx`, `sinistres_status_idx`, `sinistres_urgency_idx`

### `storage_objects` — 2 ligne(s)

*Fichiers stockés (PDF / images réels sur disque)* — génération : ≈ 4 500

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `object_path` | text | oui |  |
| `owner_id` | text |  |  |
| `syndicate_id` | text |  |  |
| `original_name` | text |  |  |
| `content_type` | text | oui |  |
| `size` | integer |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `owner_id` → `users(id)` (set null) ; `syndicate_id` → `syndicates(id)` (cascade)

Unicité : `UNIQUE (object_path)`

Index : `storage_objects_owner_id_idx`, `storage_objects_syndicate_id_idx`

### `subscription_payments` — 3 ligne(s)

*Paiements SaaS (passerelle « test-sandbox »)* — génération : 3 à 12 par copropriété (réussis, échoués, en attente)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `subscription_id` | text |  |  |
| `plan_id` | text | oui |  |
| `invoice_id` | text |  |  |
| `idempotency_key` | text | oui |  |
| `amount` | numeric | oui |  |
| `currency` | text | oui | `'MAD'::text` |
| `billing_interval` | text | oui | `'monthly'::text` |
| `payment_method` | text | oui |  |
| `provider` | text |  |  |
| `provider_reference` | text |  |  |
| `status` | text | oui | `'pending'::text` |
| `failure_code` | text |  |  |
| `failure_message` | text |  |  |
| `metadata` | jsonb |  |  |
| `processed_at` | timestamp without time zone |  |  |
| `cancelled_at` | timestamp without time zone |  |  |
| `refunded_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `updated_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict)

Unicité : `UNIQUE (idempotency_key)`

Index : `subscription_payments_syndicate_id_idx`, `subscription_payments_status_idx`, `subscription_payments_subscription_id_idx`

### `subscription_plans` — 3 ligne(s)

*Offres SaaS (référentiel)* — génération : existantes, non modifiées — référentiel : la génération réutilise les plans actifs

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `description` | text |  |  |
| `price` | numeric |  |  |
| `yearly_price` | numeric |  |  |
| `interval` | text |  | `'monthly'::text` |
| `features` | text |  | `'[]'::text` |
| `max_buildings` | integer |  |  |
| `max_lots` | integer |  |  |
| `max_members` | integer |  |  |
| `max_storage_gb` | integer |  |  |
| `max_documents` | integer |  |  |
| `max_signatures` | integer |  |  |
| `max_apartments` | integer |  |  |
| `max_users` | integer |  |  |
| `support_level` | text |  |  |
| `is_active` | boolean |  | `true` |
| `is_trial` | boolean |  | `false` |
| `sort_order` | integer |  | `0` |
| `color` | text |  | `'#7c3aed'::text` |
| `created_at` | timestamp without time zone |  | `now()` |

### `support_tickets` — 4 ligne(s)

*Demandes d'assistance* — génération : ≈ 200

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `description` | text | oui |  |
| `priority` | text |  | `'medium'::text` |
| `category` | text |  | `'general'::text` |
| `status` | text |  | `'open'::text` |
| `syndicate_id` | text |  |  |
| `submitted_by_id` | text |  |  |
| `submitted_by_name` | text |  |  |
| `scope` | text |  | `'syndicate'::text` |
| `escalated_from` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `submitted_by_id` → `users(id)` (set null)

Index : `support_tickets_submitted_by_id_idx`, `support_tickets_syndicate_id_idx`, `support_tickets_status_idx`, `support_tickets_scope_idx`

### `syndicate_memberships` — 0 ligne(s)

*Rôles supplémentaires dans d'autres copropriétés* — génération : ≈ 30 % des administrateurs de syndic

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `user_id` | text | oui |  |
| `role` | text | oui |  |
| `status` | text | oui | `'active'::text` |
| `granted_by` | text |  |  |
| `revoked_at` | timestamp without time zone |  |  |
| `revoked_by` | text |  |  |
| `revoke_reason` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (syndicate_id, user_id) WHERE (status = 'active'::text)`

Contrôles : `CHECK ((role = ANY (ARRAY['syndicate_admin'::text, 'president'::text, 'treasurer'::text, 'secretary'::text, 'committee_member'::text])))` ; `CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))`

Index : `syndicate_memberships_user_idx`, `syndicate_memberships_syndicate_idx`

### `syndicate_subscriptions` — 2 ligne(s)

*Abonnement de chaque copropriété* — génération : 1 par copropriété

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `plan_id` | text |  |  |
| `status` | text |  | `'trial'::text` |
| `auto_renew` | boolean |  | `true` |
| `trial_start_date` | timestamp without time zone |  |  |
| `trial_end_date` | timestamp without time zone |  |  |
| `current_period_start` | timestamp without time zone |  |  |
| `current_period_end` | timestamp without time zone |  |  |
| `canceled_at` | timestamp without time zone |  |  |
| `grace_period_end` | timestamp without time zone |  |  |
| `notes` | text |  |  |
| `activated_at` | timestamp without time zone |  |  |
| `renewal_date` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict)

Index : `syndicate_subscriptions_syndicate_created_idx`

### `syndicates` — 2 ligne(s)

*Copropriétés (locataires de la plateforme)* — génération : 60 (active, suspended, draft, archived)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `abbreviation` | text |  |  |
| `sector` | text |  |  |
| `region` | text |  |  |
| `admin_id` | text |  |  |
| `status` | text |  | `'active'::text` |
| `members_count` | integer |  | `0` |
| `email` | text |  |  |
| `phone` | text |  |  |
| `website` | text |  |  |
| `address` | text |  |  |
| `city` | text |  |  |
| `country` | text |  | `'Maroc'::text` |
| `legal_form` | text |  |  |
| `registration_number` | text |  |  |
| `ice_number` | text |  |  |
| `rc_number` | text |  |  |
| `founding_date` | text |  |  |
| `mission` | text |  |  |
| `logo_color` | text |  | `'#7c3aed'::text` |
| `logo_url` | text |  |  |
| `bank_name` | text |  |  |
| `bank_iban` | text |  |  |
| `bank_bic` | text |  |  |
| `cotisation_amount` | numeric |  |  |
| `cotisation_cycle` | text |  | `'monthly'::text` |
| `legal_threshold_months` | integer |  | `18` |
| `created_at` | timestamp without time zone |  | `now()` |
| `organization_id` | text |  |  |
| `status_reason` | text |  |  |
| `status_changed_at` | timestamp without time zone |  |  |
| `archived_at` | timestamp without time zone |  |  |
| `currency` | text | oui | `'MAD'::text` |
| `default_language` | text | oui | `'fr'::text` |
| `fiscal_year_start_month` | integer | oui | `1` |
| `creation_key` | text |  |  |

Clés étrangères : `organization_id` → `organizations(id)` (restrict)

Unicité : `UNIQUE (organization_id, lower(name)) WHERE (status <> 'archived'::text)` ; `UNIQUE (organization_id, creation_key) WHERE (creation_key IS NOT NULL)`

Contrôles : `CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'archived'::text])))` ; `CHECK ((currency ~ '^[A-Z]{3}$'::text))` ; `CHECK ((default_language = ANY (ARRAY['fr'::text, 'ar'::text, 'en'::text, 'es'::text])))` ; `CHECK (((fiscal_year_start_month >= 1) AND (fiscal_year_start_month <= 12)))`

Index : `syndicates_organization_id_idx`

### `template_definition_permissions` — 9 ligne(s)

*Droits sur les modèles* — génération : existants

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `template_id` | text | oui |  |
| `role` | text | oui |  |
| `can_use` | boolean |  | `true` |
| `can_edit` | boolean |  | `false` |
| `can_publish` | boolean |  | `false` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `template_id` → `template_definitions(id)` (cascade)

Index : `template_def_perms_template_id_idx`

### `template_definition_versions` — 3 ligne(s)

*Versions de modèles* — génération : existantes

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `template_id` | text | oui |  |
| `version` | integer | oui |  |
| `snapshot` | text | oui |  |
| `change_description` | text |  |  |
| `created_by` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `created_by` → `users(id)` (restrict) ; `template_id` → `template_definitions(id)` (cascade)

Index : `template_def_versions_template_id_idx`

### `template_definitions` — 5 ligne(s)

*Modèles de documents* — génération : existants

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `slug` | text | oui |  |
| `category` | text | oui |  |
| `name` | text | oui |  |
| `description` | text |  |  |
| `variables` | text |  | `'[]'::text` |
| `sections` | text |  | `'[]'::text` |
| `layout_config` | text |  | `'{}'::text` |
| `status` | text | oui | `'draft'::text` |
| `syndicate_id` | text |  |  |
| `languages` | text |  | `'["fr"]'::text` |
| `current_version` | integer |  | `1` |
| `usage_count` | integer |  | `0` |
| `created_by` | text | oui |  |
| `updated_by` | text |  |  |
| `published_at` | timestamp without time zone |  |  |
| `archived_at` | timestamp without time zone |  |  |
| `disabled_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `updated_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `created_by` → `users(id)` (restrict)

Index : `template_definitions_category_idx`, `template_definitions_status_idx`, `template_definitions_syndicate_id_idx`

### `template_requests` — 3 ligne(s)

*Demandes de modèles* — génération : 0

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `requested_by` | text | oui |  |
| `syndicate_id` | text |  |  |
| `title` | text | oui |  |
| `category` | text | oui |  |
| `description` | text |  |  |
| `business_purpose` | text |  |  |
| `required_fields` | text |  | `'[]'::text` |
| `legal_notes` | text |  |  |
| `status` | text | oui | `'pending'::text` |
| `reviewed_by` | text |  |  |
| `reviewed_at` | timestamp without time zone |  |  |
| `review_notes` | text |  |  |
| `rejection_reason` | text |  |  |
| `publish_scope` | text |  | `'private'::text` |
| `priority` | text |  | `'normal'::text` |
| `created_at` | timestamp without time zone |  | `now()` |
| `updated_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `requested_by` → `users(id)` (cascade) ; `syndicate_id` → `syndicates(id)` (cascade) ; `reviewed_by` → `users(id)` (set null)

Index : `template_requests_syndicate_id_idx`, `template_requests_status_idx`, `template_requests_requested_by_idx`

### `tenants` — 2 ligne(s)

*Baux (actifs, en attente, expirés)* — génération : ≈ 800

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `email` | text |  |  |
| `phone` | text |  |  |
| `lot_id` | text |  |  |
| `building_id` | text |  |  |
| `syndicate_id` | text |  |  |
| `lease_start` | text |  |  |
| `lease_end` | text |  |  |
| `monthly_rent` | numeric |  |  |
| `deposit_amount` | numeric |  |  |
| `status` | text |  | `'active'::text` |
| `emergency_contact` | text |  |  |
| `emergency_phone` | text |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `lot_id` → `lots(id)` (set null) ; `building_id` → `buildings(id)` (cascade) ; `syndicate_id` → `syndicates(id)` (cascade)

Index : `tenants_syndicate_id_idx`, `tenants_building_id_idx`, `tenants_lot_id_idx`, `tenants_status_idx`

### `ticket_replies` — 5 ligne(s)

*Réponses aux demandes* — génération : ≈ 150

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `ticket_id` | text | oui |  |
| `author_id` | text |  |  |
| `author_name` | text |  |  |
| `text` | text | oui |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `ticket_id` → `support_tickets(id)` (cascade)

### `transactions` — 11 ligne(s)

*Ancien registre financier* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `type` | text | oui |  |
| `amount` | numeric | oui |  |
| `label` | text | oui |  |
| `date` | text | oui |  |
| `status` | text |  | `'paid'::text` |
| `member_id` | text |  |  |
| `syndicate_id` | text |  |  |
| `proof_url` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `ledger_entry_id` | text |  |  |

Clés étrangères : `member_id` → `users(id)` (set null) ; `syndicate_id` → `syndicates(id)` (cascade) ; `ledger_entry_id` → `ledger_entries(id)` (no action)

Index : `transactions_syndicate_id_idx`, `transactions_member_id_idx`, `transactions_status_idx`, `transactions_syndicate_type_date_idx`, `transactions_ledger_entry_id_idx`

### `travaux` — 5 ligne(s)

*Travaux (signalés → terminés)* — génération : ≈ 550

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `description` | text |  |  |
| `type` | text |  | `'entretien'::text` |
| `priority` | text |  | `'normal'::text` |
| `status` | text |  | `'reported'::text` |
| `building_id` | text | oui |  |
| `lot_id` | text |  |  |
| `prestataire_id` | text |  |  |
| `reported_by_id` | text |  |  |
| `reported_by_name` | text |  |  |
| `assigned_by_id` | text |  |  |
| `assigned_at` | timestamp without time zone |  |  |
| `estimated_amount` | numeric |  |  |
| `actual_amount` | numeric |  |  |
| `start_date` | text |  |  |
| `end_date` | text |  |  |
| `completed_at` | timestamp without time zone |  |  |
| `report_url` | text |  |  |
| `photo_urls` | text |  | `'[]'::text` |
| `invoice_url` | text |  |  |
| `invoice_amount` | numeric |  |  |
| `validated_by_id` | text |  |  |
| `validated_by_name` | text |  |  |
| `validated_at` | timestamp without time zone |  |  |
| `transaction_id` | text |  |  |
| `response_time_minutes` | integer |  |  |
| `resolution_time_minutes` | integer |  |  |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `building_id` → `buildings(id)` (cascade) ; `prestataire_id` → `prestataires(id)` (set null) ; `reported_by_id` → `users(id)` (set null) ; `assigned_by_id` → `users(id)` (set null)

Index : `travaux_building_id_idx`, `travaux_status_idx`, `travaux_priority_idx`, `travaux_prestataire_id_idx`

### `travaux_privatifs` — 4 ligne(s)

*Demandes de travaux privatifs* — génération : ≈ 60

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `building_id` | text | oui |  |
| `lot_id` | text |  |  |
| `syndicate_id` | text |  |  |
| `requested_by_id` | text |  |  |
| `requested_by_name` | text | oui |  |
| `title` | text | oui |  |
| `description` | text | oui |  |
| `work_type` | text | oui |  |
| `current_photo_urls` | text |  | `'[]'::text` |
| `proposed_photo_urls` | text |  | `'[]'::text` |
| `plan_urls` | text |  | `'[]'::text` |
| `status` | text |  | `'submitted'::text` |
| `requires_committee_review` | boolean |  |  |
| `requires_ga_vote` | boolean |  |  |
| `bylaw_reference` | text |  |  |
| `syndic_review_note` | text |  |  |
| `syndic_reviewed_by_id` | text |  |  |
| `syndic_reviewed_by_name` | text |  |  |
| `syndic_reviewed_at` | timestamp without time zone |  |  |
| `committee_note` | text |  |  |
| `committee_recommendation` | text |  |  |
| `committee_reviewed_by_id` | text |  |  |
| `committee_reviewed_by_name` | text |  |  |
| `committee_reviewed_at` | timestamp without time zone |  |  |
| `vote_item_id` | text |  |  |
| `vote_outcome` | text |  |  |
| `vote_date` | text |  |  |
| `vote_summary` | text |  |  |
| `final_decision` | text |  |  |
| `final_decision_note` | text |  |  |
| `final_decision_by_id` | text |  |  |
| `final_decision_by_name` | text |  |  |
| `final_decision_at` | timestamp without time zone |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade)

Index : `travaux_privatifs_building_id_idx`, `travaux_privatifs_status_idx`, `travaux_privatifs_requested_by_id_idx`, `travaux_privatifs_syndicate_id_idx`

### `treasury_accounts` — 4 ligne(s)

*Comptes bancaire et caisse* — génération : 2 par copropriété

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `syndicate_id` | text | oui |  |
| `building_id` | text |  |  |
| `kind` | text | oui |  |
| `label` | text | oui |  |
| `bank_name` | text |  |  |
| `account_holder` | text |  |  |
| `rib` | text |  |  |
| `currency` | text | oui | `'MAD'::text` |
| `opening_balance` | numeric | oui | `'0'::numeric` |
| `opening_date` | date | oui |  |
| `status` | text | oui | `'active'::text` |
| `is_default` | boolean | oui | `false` |
| `created_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `closed_at` | timestamp without time zone |  |  |
| `closed_by` | text |  |  |

Clés étrangères : `syndicate_id` → `syndicates(id)` (restrict) ; `building_id` → `buildings(id)` (set null)

Unicité : `UNIQUE (syndicate_id, rib) WHERE (rib IS NOT NULL)` ; `UNIQUE (syndicate_id, kind) WHERE is_default`

Contrôles : `CHECK ((kind = ANY (ARRAY['bank'::text, 'cash'::text])))` ; `CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])))` ; `CHECK (((rib IS NULL) OR (rib ~ '^[0-9]{24}$'::text)))` ; `CHECK ((currency ~ '^[A-Z]{3}$'::text))`

Index : `treasury_accounts_syndicate_id_idx`

### `union_actions` — 3 ligne(s)

*Actions syndicales (hors copropriété)* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `description` | text |  | `''::text` |
| `type` | text | oui |  |
| `status` | text |  | `'planned'::text` |
| `date` | text | oui |  |
| `location` | text |  |  |
| `organizer` | text | oui |  |
| `participants_target` | integer |  | `0` |
| `demands` | text |  | `'[]'::text` |
| `updates` | text |  | `'[]'::text` |
| `tags` | text |  | `'[]'::text` |
| `syndicate_id` | text |  |  |
| `created_by` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (cascade) ; `created_by` → `users(id)` (set null)

Index : `union_actions_syndicate_id_idx`, `union_actions_status_idx`, `union_actions_type_idx`

### `users` — 15 ligne(s)

*Comptes utilisateurs (rôle principal)* — génération : ≈ 1 000 (tous rôles)

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `name` | text | oui |  |
| `email` | text | oui |  |
| `phone` | text |  |  |
| `cin` | text |  |  |
| `password_hash` | text | oui |  |
| `role` | text | oui | `'member'::text` |
| `status` | text | oui | `'active'::text` |
| `syndicate_id` | text |  |  |
| `push_token` | text |  |  |
| `profession` | text |  |  |
| `avatar` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |
| `updated_at` | timestamp without time zone |  | `now()` |
| `must_change_password` | boolean | oui | `false` |

Clés étrangères : `syndicate_id` → `syndicates(id)` (set null)

Unicité : `UNIQUE (email)` ; `UNIQUE (email)`

Index : `users_syndicate_id_idx`

### `vehicles` — 6 ligne(s)

*Véhicules des résidents* — génération : ≈ 380

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `lot_id` | text |  |  |
| `user_id` | text | oui |  |
| `plate_number` | text | oui |  |
| `brand` | text |  |  |
| `model` | text |  |  |
| `color` | text |  |  |
| `status` | text | oui | `'active'::text` |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `lot_id` → `lots(id)` (cascade) ; `user_id` → `users(id)` (cascade)

Unicité : `UNIQUE (plate_number)`

Index : `vehicles_lot_id_idx`, `vehicles_user_id_idx`

### `visitor_parking_reservations` — 2 ligne(s)

*Réservations visiteurs* — génération : ≈ 90

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `spot_id` | text | oui |  |
| `requested_by_id` | text | oui |  |
| `visitor_name` | text | oui |  |
| `visitor_plate` | text |  |  |
| `start_time` | timestamp without time zone | oui |  |
| `end_time` | timestamp without time zone | oui |  |
| `status` | text | oui | `'confirmed'::text` |
| `notes` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `spot_id` → `parking_spots(id)` (cascade) ; `requested_by_id` → `users(id)` (cascade)

Index : `visitor_reservations_spot_id_idx`, `visitor_reservations_requested_by_idx`, `visitor_reservations_times_idx`, `visitor_reservations_status_idx`

### `vote_receipts` — 5 ligne(s)

*Reçus de vote (qui a voté)* — génération : = bulletins

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `election_id` | text | oui |  |
| `voter_id` | text | oui |  |
| `cast_by_proxy_id` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `election_id` → `elections(id)` (cascade) ; `voter_id` → `users(id)` (cascade) ; `cast_by_proxy_id` → `users(id)` (set null)

Unicité : `UNIQUE (election_id, voter_id)`

Index : `vote_receipts_election_id_idx`

### `votes` — 5 ligne(s)

*Bulletins (secrets)* — génération : ≈ 300 — un bulletin par reçu de vote, électeurs de la copropriété uniquement

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `election_id` | text | oui |  |
| `candidate_id` | text |  |  |
| `is_abstention` | boolean |  | `false` |
| `device` | text |  |  |
| `ip_address` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Clés étrangères : `election_id` → `elections(id)` (cascade) ; `candidate_id` → `candidates(id)` (cascade)

Index : `votes_election_id_idx`

### `workflow_steps` — 15 ligne(s)

*Étapes des circuits* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `workflow_id` | text | oui |  |
| `step_order` | integer | oui |  |
| `title` | text | oui |  |
| `assignee` | text | oui |  |
| `role` | text |  | `''::text` |
| `status` | text |  | `'waiting'::text` |
| `comment` | text |  |  |
| `date` | text |  |  |

Clés étrangères : `workflow_id` → `workflows(id)` (cascade)

Index : `workflow_steps_workflow_id_idx`

### `workflows` — 5 ligne(s)

*Circuits de validation* — génération : inchangé

| Colonne | Type | Obligatoire | Défaut |
|---|---|---|---|
| `id` (PK) | text | oui | `(gen_random_uuid())::text` |
| `title` | text | oui |  |
| `category` | text | oui |  |
| `description` | text |  | `''::text` |
| `status` | text |  | `'pending'::text` |
| `priority` | text |  | `'medium'::text` |
| `initiator_id` | text |  |  |
| `initiator_name` | text | oui |  |
| `start_date` | text | oui |  |
| `deadline` | text |  |  |
| `current_step` | integer |  | `0` |
| `document` | text |  |  |
| `created_at` | timestamp without time zone |  | `now()` |

Index : `workflows_status_idx`, `workflows_category_idx`
