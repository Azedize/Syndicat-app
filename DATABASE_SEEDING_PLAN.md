# Plan de génération des données de test

Stratégie et volumes cibles par table (échelle `--scale 1`). Les volumes réels obtenus figurent dans `DATABASE_SEEDING_REPORT.md`.

## Principes

- **Copropriété par copropriété** : chaque copropriété est un locataire complet et cohérent (utilisateurs, immeubles, lots, propriétaires, finances, activité). Aucune donnée n'est partagée entre copropriétés, sauf les administrateurs de syndic d'une même société (via `syndicate_memberships`).
- **Règles métier du projet** : les appels de fonds sont émis par le moteur de répartition du projet (`loadSources` → `computeAllocation` → `finalizeAllocation`, comme la route `generate-appels`). Les paiements suivent la règle de validation : seuls les paiements validés comptent, avec écriture de journal et reçu ; un paiement déclaré reste « en validation ». Statuts calculés comme `settlementStatus()`.
- **Ordre des dépendances** : déduit du catalogue (clés étrangères), parents d'abord ; aucune contrainte désactivée.
- **Reproductible** : générateur pseudo-aléatoire initialisé par `--seed` (mêmes données pour la même graine). Identifiants UUID v4 comme `gen_random_uuid()`.
- **Traçabilité** : `syndicates.creation_key = seedgen:s<seed>:<n>`, `organizations.created_by = seedgen:s<seed>`, e-mails `@s<seed>.seedgen.mizan.test`. Le nettoyage ne supprime que ce qui dépend de ces marqueurs.
- **Sécurité** : écriture uniquement sur une base locale de développement (hôte local, pas de marqueur « prod », `NODE_ENV` ≠ production). Aucun e-mail, SMS, notification push ni paiement réel n'est déclenché (insertion directe, sans passer par les services d'envoi). Mot de passe de test haché avec bcrypt (coût 10, comme l'API).

## Répartition des utilisateurs (≈ 1 000)

| Rôle | Par copropriété | Total (60 copropriétés) |
|---|---|---:|
| Administrateurs de plateforme | — | 2 (+ existants) |
| Administrateurs de syndic | 1 (30 % partagés entre copropriétés d'une même société) | ≈ 42 |
| Président, trésorier, secrétaire | 2 à 3 | ≈ 170 |
| Membres du conseil | 1 à 3 | ≈ 120 |
| Copropriétaires (comptes) | 5 à 10 | ≈ 420 |
| Locataires (comptes) | 3 à 7 | ≈ 250 |

Statuts : 86 % actifs, 8 % en attente (mot de passe à changer), 4 % inactifs, 2 % suspendus. Profils en français et en arabe.

## Gouvernance

| Table | Stratégie | Volume prévu |
|---|---|---|
| `actes_administratifs` | Actes administratifs | 1 à 4 par copropriété |
| `ag_proxies` | Procurations d'AG | ≈ 100 |
| `ag_resolutions` | Résolutions d'AG | ≈ 400 |
| `candidates` | Candidats | 2 à 4 par élection |
| `conseil_syndical` | Membres du conseil syndical | 3 à 6 par copropriété |
| `election_proxies` | Procurations de vote | 0 |
| `election_questions` | Questions aux candidats | ≈ 18 |
| `elections` | Élections du conseil | ≈ 36 |
| `governance_delegations` | Délégations au sein du conseil | ≈ 50 % des copropriétés |
| `meeting_attendees` | Présences | ≈ 2 000 |
| `meetings` | Assemblées et réunions | ≈ 330 |
| `vote_receipts` | Reçus de vote (qui a voté) | = bulletins |
| `votes` | Bulletins (secrets) — un bulletin par reçu de vote, électeurs de la copropriété uniquement | ≈ 300 |

## Modules hérités

| Table | Stratégie | Volume prévu |
|---|---|---|
| `action_participants` | Participants aux actions | inchangé |
| `action_supports` | Soutiens aux actions | inchangé |
| `caisse_entries` | Ancienne caisse | inchangé |
| `cotisations` | Ancien registre des cotisations | inchangé |
| `debt_escalations` | Escalade des impayés | inchangé |
| `payment_proofs` | Preuves de l'ancien registre | inchangé |
| `reclamations` | Ancien module de réclamations RH | inchangé |
| `transactions` | Ancien registre financier | inchangé |
| `union_actions` | Actions syndicales (hors copropriété) | inchangé |

## Communication et notifications

| Table | Stratégie | Volume prévu |
|---|---|---|
| `alert_reads` | Lectures des notifications | ≈ 55 % |
| `alerts` | Notifications in-app | ≈ 10 000 |
| `announcements` | Annonces | ≈ 550 |
| `chat_reports` | Signalements de messages | 0 |
| `conversation_archives` | Conversations archivées | 0 |
| `conversations` | Conversations résident ↔ syndic | ≈ 350 |
| `email_logs` | Journal des e-mails envoyés | 0 |
| `idea_votes` | Votes sur les idées | ≈ 900 |
| `ideas` | Boîte à idées | ≈ 180 |
| `message_reactions` | Réactions | ≈ 20 % |
| `message_reads` | Accusés de lecture | ≈ 1,6 par conversation |
| `messages` | Messages | ≈ 2 500 |
| `partners` | Partenaires (avantages résidents) | ≈ 25 |
| `publication_comments` | Commentaires | ≈ 500 |
| `publication_likes` | Mentions j'aime | ≈ 1 400 |
| `publications` | Publications des résidents | ≈ 350 |

## Finances

| Table | Stratégie | Volume prévu |
|---|---|---|
| `allocation_key_shares` | Coefficients des clés | 0 |
| `allocation_key_versions` | Versions de clés | 0 |
| `allocation_keys` | Clés de répartition explicites | 0 |
| `allocation_lines` | Quote-part de chaque lot | ≈ 15 000 |
| `allocation_sources` | Sources réparties | 1 par répartition |
| `allocations` | Appels de fonds (en-têtes) émis par le moteur | 5 trimestres par immeuble (≈ 750) |
| `appel_adjustments` | Ajustements motivés | 0 |
| `appel_payments` | Paiements déclarés / validés / refusés | ≈ 10 000 |
| `appel_reminders` | Rappels d'échéance | 1 par obligation en retard (70 %) |
| `appels_de_fonds` | Obligations par lot (payées, partielles, en retard, en validation, à venir) | ≈ 12 000 |
| `bank_statement_lines` | Lignes de relevé | 1 par écriture bancaire du mois |
| `bank_statements` | Relevés bancaires | 1 par copropriété (mois précédent) |
| `bon_items` | Lignes des bons | 1 à 3 par bon |
| `bons_livraison` | Bons de livraison | 1 à 3 par copropriété |
| `budget_lines` | Lignes budgétaires | 8 par budget approuvé |
| `budgets` | Budgets annuels (approuvés + brouillons) | 2 à 3 par immeuble (≈ 350) |
| `charge_attachments` | Pièces jointes d'appels | 0 |
| `expense_justifications` | Demandes de justification de dépense | ≈ 30 % des copropriétés |
| `expense_votes` | Votes sur les justifications | 4 par demande |
| `expenses` | Dépenses avec justificatif (fichier réel) | ≈ 1 400 |
| `fonds_travaux` | Fonds de travaux annuel | 1 par immeuble |
| `invoice_attachments` | Pièces jointes de factures | 0 |
| `invoice_items` | Lignes de factures | ≈ 2 200 |
| `invoices` | Factures et devis fournisseurs | ≈ 900 |
| `ledger_entries` | Journal (ouverture, encaissements, dépenses, salaires) — table en ajout seul : jamais modifiée | ≈ 15 000 |
| `payslips` | Bulletins de paie | 0 |
| `reconciliation_matches` | Rapprochements relevé ↔ journal | ≈ 80 % des lignes |
| `salary_records` | Salaires du personnel (concierge, gardien) | ≈ 1 000 (payés → journal) |
| `treasury_accounts` | Comptes bancaire et caisse | 2 par copropriété |

## Technique et référentiels

| Table | Stratégie | Volume prévu |
|---|---|---|
| `audit_logs` | Journal d'audit | ≈ 6 000 |
| `document_sequences` | Numérotation (JRN, REC, DEP, RCL, ALC, FAC…) | mise à jour au numéro max utilisé |
| `fiches_juridiques` | Fiches juridiques (référentiel) | inchangé |
| `legal_alerts` | Alertes réglementaires | inchangé |
| `scheduled_job_runs` | État des tâches planifiées | inchangé |
| `workflow_steps` | Étapes des circuits | inchangé |
| `workflows` | Circuits de validation | inchangé |

## Plateforme et abonnements

| Table | Stratégie | Volume prévu |
|---|---|---|
| `billing_invoices` | Factures SaaS | 1 par paiement |
| `national_rankings` | Classement mensuel des copropriétés | 12 par copropriété |
| `organizations` | Sociétés de syndic (gestionnaires) | 12 |
| `subscription_payments` | Paiements SaaS (passerelle « test-sandbox ») | 3 à 12 par copropriété (réussis, échoués, en attente) |
| `subscription_plans` | Offres SaaS (référentiel) — référentiel : la génération réutilise les plans actifs | existantes, non modifiées |
| `syndicate_subscriptions` | Abonnement de chaque copropriété | 1 par copropriété |
| `syndicates` | Copropriétés (locataires de la plateforme) | 60 (active, suspended, draft, archived) |

## Comptes, rôles et sécurité

| Table | Stratégie | Volume prévu |
|---|---|---|
| `blocked_users` | Blocages entre utilisateurs (messagerie) | 0 |
| `notification_preferences` | Préférences de notification | 1 par utilisateur |
| `organization_members` | Équipe des sociétés de syndic | 1 par administrateur |
| `otp_tokens` | Codes à usage unique | 0 |
| `password_reset_tokens` | Jetons de réinitialisation | 0 |
| `refresh_tokens` | Jetons de session | 0 |
| `syndicate_memberships` | Rôles supplémentaires dans d'autres copropriétés | ≈ 30 % des administrateurs de syndic |
| `users` | Comptes utilisateurs (rôle principal) | ≈ 1 000 (tous rôles) |

## Copropriétés, immeubles et lots

| Table | Stratégie | Volume prévu |
|---|---|---|
| `buildings` | Immeubles | 1 à 4 par copropriété (≈ 150) |
| `lot_ownerships` | Propriété des lots (actuelle et historique, indivision 50/50) | ≈ 3 300 |
| `lots` | Lots : appartements, duplex, studios, commerces, bureaux, parkings, caves | ≈ 3 000 |
| `members` | Copropriétaires (avec ou sans compte) | ≈ 2 500 |
| `tenants` | Baux (actifs, en attente, expirés) | ≈ 800 |

## Marketplace

| Table | Stratégie | Volume prévu |
|---|---|---|
| `cart_items` | Paniers | 0 |
| `marketplace_promotions` | Mises en avant payantes | 0 |
| `orders` | Commandes | ≈ 25 |
| `product_comments` | Commentaires | ≈ 60 |
| `product_favorites` | Favoris | ≈ 80 |
| `product_reports` | Signalements d'annonces | 0 |
| `products` | Annonces entre résidents | ≈ 200 |
| `reviews` | Avis | ≈ 15 |

## Maintenance et prestataires

| Table | Stratégie | Volume prévu |
|---|---|---|
| `claim_attachments` | Photos des réclamations (fichiers réels) | ≈ 25 % |
| `claim_events` | Historique des réclamations | ≈ 3 500 |
| `claim_notifications` | File d'envoi des notifications de réclamation | 0 |
| `claims` | Réclamations et incidents (tableau Kanban) | ≈ 900 |
| `contrats_prestataires` | Contrats de maintenance | ≈ 400 |
| `prestataire_evaluations` | Évaluations des prestataires | ≈ 300 |
| `prestataires` | Prestataires | 2 à 5 par copropriété (≈ 200) |
| `sinistres` | Sinistres | ≈ 90 |
| `support_tickets` | Demandes d'assistance | ≈ 200 |
| `ticket_replies` | Réponses aux demandes | ≈ 150 |
| `travaux` | Travaux (signalés → terminés) | ≈ 550 |
| `travaux_privatifs` | Demandes de travaux privatifs | ≈ 60 |

## Documents

| Table | Stratégie | Volume prévu |
|---|---|---|
| `document_comments` | Commentaires | ≈ 15 % |
| `document_signatures` | Signatures | 0 |
| `document_versions` | Versions précédentes | ≈ 12 % |
| `documents` | Bibliothèque (fichiers réels, audiences, lots, personnels) | ≈ 2 500 |
| `storage_objects` | Fichiers stockés (PDF / images réels sur disque) | ≈ 4 500 |
| `template_definition_permissions` | Droits sur les modèles | existants |
| `template_definition_versions` | Versions de modèles | existantes |
| `template_definitions` | Modèles de documents | existants |
| `template_requests` | Demandes de modèles | 0 |

## Stationnement

| Table | Stratégie | Volume prévu |
|---|---|---|
| `parking_spots` | Places (résidents et visiteurs) | ≈ 1 100 |
| `parking_violations` | Infractions de stationnement | 0 |
| `vehicles` | Véhicules des résidents | ≈ 380 |
| `visitor_parking_reservations` | Réservations visiteurs | ≈ 90 |
