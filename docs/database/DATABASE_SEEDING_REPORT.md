# Rapport de génération des données de test

Lancement `seedgen:s20261019` (graine 20261019, échelle 1) — statut **done**, durée 328 s. Domaine des comptes : `s20261019.seedgen.mizan.test`.

Contrôles d'intégrité : **348/350 réussis**.

Utilisateurs générés : **1033** (comptes de test, domaine réservé ; voir docs/database/DATABASE_SEEDING_GUIDE.md).

## Volumes par table

| Table | Avant | Ajoutées | Après | Statut |
|---|---:|---:|---:|---|
| `actes_administratifs` | 5 | 126 | 131 | alimentée |
| `action_participants` | 3 | 0 | 3 | non alimentée : voir union_actions |
| `action_supports` | 3 | 0 | 3 | non alimentée : voir union_actions |
| `ag_proxies` | 2 | 98 | 100 | alimentée |
| `ag_resolutions` | 3 | 307 | 310 | alimentée |
| `alert_reads` | 3 | 5994 | 5997 | alimentée |
| `alerts` | 5 | 10954 | 10959 | alimentée |
| `allocation_key_shares` | 0 | 2527 | 2527 | alimentée |
| `allocation_key_versions` | 0 | 82 | 82 | alimentée |
| `allocation_keys` | 0 | 63 | 63 | alimentée |
| `allocation_lines` | 0 | 21505 | 21505 | alimentée |
| `allocation_sources` | 0 | 680 | 680 | alimentée |
| `allocations` | 0 | 680 | 680 | alimentée |
| `announcement_acknowledgements` | 0 | 1401 | 1401 | alimentée |
| `announcements` | 4 | 459 | 463 | alimentée |
| `appel_adjustments` | 0 | 82 | 82 | alimentée |
| `appel_payments` | 1 | 21227 | 21228 | alimentée |
| `appel_reminders` | 0 | 1711 | 1711 | alimentée |
| `appels_de_fonds` | 10 | 21505 | 21515 | alimentée |
| `audit_logs` | 10 | 4533 | 4543 | alimentée |
| `bank_statement_lines` | 0 | 2651 | 2651 | alimentée |
| `bank_statements` | 0 | 60 | 60 | alimentée |
| `billing_invoices` | 5 | 479 | 484 | alimentée |
| `blocked_users` | 2 | 14 | 16 | alimentée |
| `bon_items` | 2 | 280 | 282 | alimentée |
| `bons_livraison` | 2 | 138 | 140 | alimentée |
| `budget_lines` | 8 | 2176 | 2184 | alimentée |
| `budgets` | 3 | 304 | 307 | alimentée |
| `buildings` | 3 | 136 | 139 | alimentée |
| `caisse_entries` | 8 | 0 | 8 | non alimentée : remplacée par le compte « Caisse » du journal |
| `candidates` | 6 | 111 | 117 | alimentée |
| `cart_items` | 2 | 72 | 74 | alimentée |
| `charge_attachments` | 3 | 0 | 3 | non alimentée : les preuves de paiement passent par appel_payments ; aucune pièce d'appel requise |
| `chat_reports` | 2 | 10 | 12 | alimentée |
| `claim_attachments` | 0 | 234 | 234 | alimentée |
| `claim_events` | 0 | 3804 | 3804 | alimentée |
| `claim_notifications` | 0 | 0 | 0 | non alimentée : file technique de livraison, remplie par l'API |
| `claims` | 0 | 955 | 955 | alimentée |
| `conseil_syndical` | 6 | 289 | 295 | alimentée |
| `contrats_prestataires` | 4 | 341 | 345 | alimentée |
| `conversation_archives` | 2 | 39 | 41 | alimentée |
| `conversations` | 6 | 282 | 288 | alimentée |
| `cotisations` | 7 | 0 | 7 | non alimentée : remplacé par les appels de fonds ; des cotisations parallèles contrediraient les soldes |
| `debt_escalations` | 2 | 0 | 2 | non alimentée : seuils de recouvrement non validés (voir SECURITY_LOG) : aucune étape contentieuse fabriquée |
| `document_comments` | 4 | 131 | 135 | alimentée |
| `document_sequences` | 7 | 656 | 663 | alimentée |
| `document_signatures` | 4 | 0 | 4 | non alimentée : une signature ne se fabrique pas (circuit de signature réel requis) |
| `document_versions` | 3 | 108 | 111 | alimentée |
| `documents` | 8 | 7308 | 7316 | alimentée |
| `election_proxies` | 2 | 43 | 45 | alimentée |
| `election_questions` | 3 | 19 | 22 | alimentée |
| `elections` | 3 | 37 | 40 | alimentée |
| `email_logs` | 7 | 0 | 7 | non alimentée : rempli uniquement par un envoi réel ; aucun e-mail n'est envoyé |
| `expense_justifications` | 3 | 16 | 19 | alimentée |
| `expense_votes` | 5 | 64 | 69 | alimentée |
| `expenses` | 0 | 1367 | 1367 | alimentée |
| `fiches_juridiques` | 6 | 0 | 6 | non alimentée : contenu juridique : jamais inventé |
| `fonds_travaux` | 4 | 136 | 140 | alimentée |
| `governance_delegations` | 0 | 32 | 32 | alimentée |
| `idea_votes` | 5 | 737 | 742 | alimentée |
| `ideas` | 4 | 149 | 153 | alimentée |
| `invoice_attachments` | 3 | 0 | 3 | non alimentée : les justificatifs sont portés par les dépenses (expenses.proof_url) |
| `invoice_items` | 4 | 1751 | 1755 | alimentée |
| `invoices` | 3 | 713 | 716 | alimentée |
| `ledger_entries` | 0 | 21697 | 21697 | alimentée |
| `legal_alerts` | 3 | 0 | 3 | non alimentée : contenu réglementaire : jamais inventé |
| `lot_ownerships` | 8 | 5416 | 5424 | alimentée |
| `lots` | 8 | 4582 | 4590 | alimentée |
| `mandate_resignations` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `marketplace_promotions` | 2 | 0 | 2 | non alimentée : paiement de promotion : aucun paiement fictif présenté comme réel |
| `meeting_attendees` | 5 | 1734 | 1739 | alimentée |
| `meetings` | 4 | 324 | 328 | alimentée |
| `members` | 6 | 3670 | 3676 | alimentée |
| `message_reactions` | 4 | 54 | 58 | alimentée |
| `message_reads` | 4 | 454 | 458 | alimentée |
| `messages` | 14 | 2101 | 2115 | alimentée |
| `national_rankings` | 4 | 720 | 724 | alimentée |
| `notification_preferences` | 6 | 1031 | 1037 | alimentée |
| `orders` | 2 | 23 | 25 | alimentée |
| `org_assignments` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `org_components` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `org_positions` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `org_structure_versions` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `org_structures` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `org_tasks` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `organization_members` | 0 | 48 | 48 | alimentée |
| `organizations` | 0 | 12 | 12 | alimentée |
| `otp_tokens` | 3 | 0 | 3 | non alimentée : codes de sécurité, jamais fabriqués |
| `parking_spots` | 9 | 1031 | 1040 | alimentée |
| `parking_violations` | 2 | 141 | 143 | alimentée |
| `partners` | 3 | 26 | 29 | alimentée |
| `password_reset_tokens` | 2 | 0 | 2 | non alimentée : jetons de sécurité, jamais fabriqués |
| `payment_proofs` | 4 | 0 | 4 | non alimentée : voir cotisations |
| `payslips` | 3 | 0 | 3 | non alimentée : aucun employé n'a de compte utilisateur dans le jeu ; salary_records couvre la paie |
| `prestataire_evaluations` | 4 | 253 | 257 | alimentée |
| `prestataires` | 5 | 203 | 208 | alimentée |
| `product_comments` | 3 | 50 | 53 | alimentée |
| `product_favorites` | 2 | 75 | 77 | alimentée |
| `product_reports` | 2 | 11 | 13 | alimentée |
| `products` | 6 | 167 | 173 | alimentée |
| `publication_comments` | 3 | 453 | 456 | alimentée |
| `publication_likes` | 5 | 1136 | 1141 | alimentée |
| `publications` | 5 | 289 | 294 | alimentée |
| `reclamations` | 6 | 0 | 6 | non alimentée : module retiré (routes 410) ; les incidents sont dans claims |
| `reconciliation_matches` | 0 | 2160 | 2160 | alimentée |
| `refresh_tokens` | 5 | 0 | 5 | non alimentée : jetons de sécurité créés uniquement par une vraie connexion |
| `reviews` | 2 | 14 | 16 | alimentée |
| `salary_records` | 5 | 1133 | 1138 | alimentée |
| `scheduled_job_runs` | 0 | 0 | 0 | non alimentée : table technique tenue par le planificateur |
| `sinistres` | 4 | 81 | 85 | alimentée |
| `storage_objects` | 0 | 11707 | 11707 | alimentée |
| `subscription_payments` | 3 | 479 | 482 | alimentée |
| `subscription_plans` | 3 | 0 | 3 | inchangée |
| `support_tickets` | 4 | 162 | 166 | alimentée |
| `syndicate_memberships` | 0 | 12 | 12 | alimentée |
| `syndicate_subscriptions` | 2 | 60 | 62 | alimentée |
| `syndicates` | 2 | 60 | 62 | alimentée |
| `template_definition_permissions` | 9 | 0 | 9 | non alimentée : configuration |
| `template_definition_versions` | 3 | 0 | 3 | non alimentée : configuration |
| `template_definitions` | 5 | 0 | 5 | non alimentée : configuration de la plateforme, non dupliquée |
| `template_requests` | 3 | 0 | 3 | non alimentée : demandes plateforme ponctuelles ; démo existante conservée |
| `tenants` | 2 | 927 | 929 | alimentée |
| `terms_acceptances` | 0 | 549 | 549 | alimentée |
| `ticket_replies` | 4 | 117 | 121 | alimentée |
| `transactions` | 9 | 0 | 9 | non alimentée : les flux réels passent par le journal (ledger_entries) |
| `travaux` | 5 | 551 | 556 | alimentée |
| `travaux_privatifs` | 4 | 76 | 80 | alimentée |
| `treasury_accounts` | 4 | 120 | 124 | alimentée |
| `union_actions` | 3 | 0 | 3 | non alimentée : fonction sans rapport avec la gestion de copropriété |
| `users` | 14 | 1033 | 1047 | alimentée |
| `vehicles` | 6 | 354 | 360 | alimentée |
| `visitor_parking_reservations` | 2 | 68 | 70 | alimentée |
| `vote_receipts` | 5 | 185 | 190 | alimentée |
| `votes` | 5 | 185 | 190 | alimentée |
| `workflow_steps` | 15 | 0 | 15 | non alimentée : voir workflows |
| `workflows` | 5 | 0 | 5 | non alimentée : table sans rattachement à une copropriété : isolation impossible à garantir |

## Contrôles d'intégrité

| Groupe | Contrôle | Lignes trouvées | Résultat |
|---|---|---:|---|
| Finance | Payé d'un appel = somme de ses paiements validés | 0 | OK |
| Finance | Statut payé ⇔ payé = montant | 0 | OK |
| Finance | Statut partiellement payé ⇔ 0 < payé < montant | 0 | OK |
| Finance | En retard uniquement si l'échéance est passée et rien n'est payé | 0 | OK |
| Finance | Paiement en validation ⇒ un paiement déclaré en attente | 0 | OK |
| Finance | Paiement validé ⇒ écriture du journal (même montant) et reçu | 0 | OK |
| Finance | Paiement non validé ⇒ ni écriture ni reçu | 0 | OK |
| Finance | Écriture d'un paiement d'appel ⇒ paiement existant | 0 | OK |
| Finance | Dépense payée ⇒ écriture de sortie du même montant | 0 | OK |
| Finance | Dépense non payée ⇒ pas d'écriture | 0 | OK |
| Finance | Numéros de reçu uniques par copropriété | 0 | OK |
| Finance | Séquences de numérotation au-delà des numéros utilisés (JRN) | 0 | OK |
| Finance | Lignes de répartition = total de la répartition | 0 | OK |
| Finance | Montant émis des obligations = total de la répartition | 0 | OK |
| Finance | Lignes budgétaires = montant des charges du budget | 0 | OK |
| Isolation | Paiement et appel dans la même copropriété | 0 | OK |
| Isolation | Lot de l'appel dans l'immeuble de l'appel | 0 | OK |
| Isolation | Propriété : lot et copropriétaire de la même copropriété | 0 | OK |
| Isolation | Locataire : lot, immeuble et copropriété cohérents | 0 | OK |
| Isolation | Document de lot : lot de la même copropriété | 0 | OK |
| Isolation | Réclamation : immeuble de la même copropriété | 0 | OK |
| Isolation | Notification : destinataire rattaché à la copropriété | 0 | OK |
| Isolation | Copropriétaire avec compte : utilisateur de la même copropriété | 0 | OK |
| Isolation | Écriture : compte de trésorerie de la même copropriété | 0 | OK |
| Dates | Fin de propriété après le début | 0 | OK |
| Dates | Échéance d'un appel après son émission | 0 | OK |
| Dates | Aucun paiement validé dans le futur | 0 | OK |
| Dates | Réclamation résolue/clôturée ⇒ résolution et date | 0 | OK |
| Dates | Bail : fin après début | 0 | OK |
| États | Lot loué ⇒ un bail enregistré | 0 | OK |
| États | Une seule propriété ouverte par lot et copropriétaire | 0 | OK |
| États | Quotes-parts ouvertes d'un lot ≤ 100 % | 0 | OK |
| États | Vote : un reçu par électeur et par élection | 0 | OK |
| États | Bulletins = reçus de vote (scrutin secret) | 0 | OK |
| États | Électeurs uniquement de la copropriété de l'élection | 0 | OK |
| États | Fichier d'un document présent dans le stockage | 0 | OK |
| États | Contrat terminé ⇒ fin au plus tard à la résiliation | 0 | OK |
| États | Majorité simple : adoptée ⇔ pour > contre | 0 | OK |
| États | Procuration utilisée ⇒ reçu de vote du mandant porté par le mandataire | 1 | **ÉCHEC** |
| États | Au plus 2 pouvoirs actifs par mandataire et par élection | 0 | OK |
| États | Pouvoir actif ⇒ le mandant n'a pas encore voté | 0 | OK |
| Isolation | Procuration : mandant et mandataire de la copropriété de l'élection | 1 | **ÉCHEC** |
| Isolation | Lu et compris : utilisateur rattaché à la copropriété de l'annonce | 0 | OK |
| Isolation | Clé de répartition : lots de l'immeuble de la clé | 0 | OK |
| Isolation | Infraction : déclarant de la copropriété de l'immeuble | 0 | OK |
| Finance | Ajustement : montant de l'appel = dernier montant ajusté | 0 | OK |
| Dates | Lu et compris après la publication de l'annonce | 0 | OK |
| Dates | Infraction traitée ⇒ traitée après le signalement | 0 | OK |
| Documents | Document « lot » ⇒ lot renseigné, document « personnel » ⇒ personne renseignée | 0 | OK |
| Documents | Travaux terminés ou à valider ⇒ rapport, facture et photos (données générées) | 0 | OK |
| Documents | Facture fournisseur ⇒ justificatif PDF (données générées) | 0 | OK |
| Documents | Contrat ⇒ document du contrat (données générées) | 0 | OK |
| Valeurs | announcements.priority parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | ag_proxies.status parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | elections.election_type parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | elections.voting_method parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | travaux_privatifs.work_type parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | billing_invoices.status parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | bons_livraison.type parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | bons_livraison.status parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | support_tickets.category parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | products.status parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | ideas.status parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | actes_administratifs.type parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | actes_administratifs.statut parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | sinistres.type parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | sinistres.status parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | ag_resolutions.required_majority parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | ag_resolutions.result parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | parking_violations.status parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | election_proxies.status parmi les valeurs de l'application (données générées) | 0 | OK |
| Valeurs | documents.visibility parmi les valeurs de l'application (données générées) | 0 | OK |
| Clés étrangères | 278 contraintes vérifiées (relations orphelines) | 0 | OK |

## Nettoyage préalable (anciennes données du générateur)

Exécuté le 2026-11-06 14:33 UTC ; sauvegarde complète (pg_dump + fichiers) dans `scripts/.seedgen/backups/2026-11-06T14-32-03-417Z`. Seules les données rattachées aux marqueurs du générateur ont été supprimées ; données de démonstration et comptes non générés conservés.

| Table | Lignes supprimées |
|---|---:|
| `document_versions` | 87 |
| `document_comments` | 132 |
| `claim_events` | 3993 |
| `claim_attachments` | 285 |
| `appel_reminders` | 1957 |
| `appel_payments` | 22060 |
| `appel_adjustments` | 93 |
| `allocation_lines` | 22585 |
| `allocation_key_shares` | 3201 |
| `reconciliation_matches` | 2163 |
| `lot_ownerships` | 5663 |
| `expenses` | 1374 |
| `documents` | 7588 |
| `claims` | 1018 |
| `budget_lines` | 2336 |
| `bank_statement_lines` | 2702 |
| `appels_de_fonds` | 22585 |
| `allocation_sources` | 730 |
| `allocation_key_versions` | 93 |
| `votes` | 188 |
| `visitor_parking_reservations` | 88 |
| `vehicles` | 373 |
| `tenants` | 979 |
| `salary_records` | 1089 |
| `publication_likes` | 1164 |
| `publication_comments` | 469 |
| `product_reports` | 4 |
| `product_favorites` | 97 |
| `product_comments` | 64 |
| `prestataire_evaluations` | 261 |
| `parking_violations` | 154 |
| `parking_spots` | 995 |
| `message_reactions` | 49 |
| `meeting_attendees` | 1677 |
| `lots` | 4764 |
| `ledger_entries` | 22505 |
| `invoice_items` | 1779 |
| `idea_votes` | 754 |
| `governance_delegations` | 34 |
| `election_questions` | 19 |
| `election_proxies` | 46 |
| `conversation_archives` | 38 |
| `contrats_prestataires` | 352 |
| `conseil_syndical` | 297 |
| `chat_reports` | 11 |
| `candidates` | 100 |
| `budgets` | 332 |
| `bon_items` | 277 |
| `bank_statements` | 60 |
| `announcement_acknowledgements` | 1565 |
| `allocations` | 730 |
| `allocation_keys` | 73 |
| `alert_reads` | 5453 |
| `ag_resolutions` | 332 |
| `ag_proxies` | 105 |
| `vote_receipts` | 188 |
| `treasury_accounts` | 120 |
| `travaux` | 584 |
| `ticket_replies` | 121 |
| `terms_acceptances` | 676 |
| `syndicate_subscriptions` | 61 |
| `syndicate_memberships` | 14 |
| `support_tickets` | 167 |
| `subscription_payments` | 471 |
| `storage_objects` | 12530 |
| `sinistres` | 83 |
| `refresh_tokens` | 60 |
| `publications` | 305 |
| `products` | 348 |
| `prestataires` | 207 |
| `password_reset_tokens` | 1 |
| `partners` | 22 |
| `organization_members` | 46 |
| `national_rankings` | 720 |
| `messages` | 2079 |
| `message_reads` | 477 |
| `members` | 3887 |
| `meetings` | 314 |
| `invoices` | 701 |
| `ideas` | 148 |
| `fonds_travaux` | 146 |
| `expense_votes` | 68 |
| `expense_justifications` | 17 |
| `elections` | 33 |
| `conversations` | 296 |
| `buildings` | 147 |
| `bons_livraison` | 141 |
| `blocked_users` | 17 |
| `billing_invoices` | 471 |
| `announcements` | 445 |
| `alerts` | 10000 |
| `actes_administratifs` | 133 |
| `users` | 1044 |
| `travaux_privatifs` | 74 |
| `syndicates` | 61 |
| `reviews` | 16 |
| `organizations` | 12 |
| `orders` | 21 |
| `notification_preferences` | 1037 |
| `email_logs` | 19 |
| `document_sequences` | 657 |
| `cart_items` | 85 |
| `audit_logs` | 4536 |
| `(fichiers)` | 12530 |

### Résidus d'anciens lancements

Lignes pointant vers un utilisateur ou une copropriété supprimés par une colonne sans clé étrangère. Supprimées uniquement si leur appartenance au générateur est prouvée (identifiant produit par une graine connue, ou texte écrit seulement par le générateur) ; les autres sont conservées.

| Table.colonne | Orphelines | Prouvées générateur (supprimées) | Conservées |
|---|---:|---:|---:|
| `audit_logs.user_id` | 86 | 0 | 86 |
| `email_logs.syndicate_id` | 29 | 0 | 29 |
| `lot_ownerships.created_by` | 8 | 0 | 8 |
| `treasury_accounts.created_by` | 4 | 0 | 4 |

## Fichiers réels

Emplacement : `artifacts/api-server/uploads/` (stockage local de l'API, chemins `/objects/uploads/<id>.pdf|png`). Chaque fichier est enregistré dans `storage_objects` et relié à son objet métier.

- Fichiers enregistrés : **11707** — PDF valides **10105** (10105 pages au total), PDF invalides 0 ; PNG valides **1602**, PNG invalides 0.
- Absents du disque : 0 ; taille différente de celle enregistrée : 0.
- Validation : structure PDF complète (en-tête, table xref, objets, arbre des pages, flux décompressés) et PNG décodé (CRC, pixels décompressés).

| Référence | Fichiers référencés | Sans fichier |
|---|---:|---:|
| `documents.file_url` | 7308 | 0 |
| `document_versions.file_url` | 108 | 0 |
| `expenses.proof_url` | 1367 | 0 |
| `invoices.proof_url` | 713 | 0 |
| `contrats_prestataires.document_url` | 341 | 0 |
| `prestataires.document_url` | 203 | 0 |
| `travaux.report_url` | 295 | 0 |
| `travaux.invoice_url` | 295 | 0 |
| `travaux.photo_urls` | 733 | 0 |
| `sinistres.image_urls` | 118 | 0 |
| `sinistres.invoice_url` | 35 | 0 |
| `products.image_urls` | 337 | 0 |
| `appel_payments.proof_url` | 193 | 0 |
| `claim_attachments.object_path` | 234 | 0 |

| Type de document produit | Fichiers |
|---|---:|
| règlement | 60 |
| budget | 304 |
| convocation | 219 |
| procès-verbal | 199 |
| appel de fonds | 4301 |
| reçu | 701 |
| justificatif de paiement | 193 |
| devis prestataire | 203 |
| contrat | 341 |
| devis | 399 |
| facture fournisseur | 644 |
| photo | 1188 |
| rapport d'intervention | 295 |
| Photos d'infractions de stationnement | 63 |
| Documents en arabe | 47 |

## Procédure exécutée (`seedgen run`)

- **1. Environnement** — syndycat_test (base locale de développement), PostgreSQL 18.6 on x86_64-windows
- **2. Migrations** — aucune migration en attente
- **3–4. Sauvegarde et nettoyage** — 0 lignes et 0 fichiers supprimés (sauvegarde dans .seedgen/backups)
- **5–7. Génération** — données + 9418 fichiers produits par la phase documents
- **8. Contrôles** — 317/319 contrôles d'intégrité ; fichiers OK

## Vérification à travers l'API

Exécutée le 2026-11-06 14:40 UTC sur « Résidence Les Hauts de la Corniche Boubana 19 » avec des comptes générés de chaque rôle (`seedgen:api`) : **46/46 réussies**.

| Vérification | Détail | Temps | Résultat |
|---|---|---:|---|
| super admin : liste des copropriétés de la plateforme | 65 / 65 en base | 81 | OK |
| super admin : utilisateurs paginés (≈ 1 000) | total 1090 / 1090 en base, page de 50 | 43 | OK |
| syndic : copropriétaires de SA copropriété uniquement (paginé) | 138 / 138 | 29 | OK |
| syndic : lots de la copropriété | 171 / 171 | 87 | OK |
| syndic : immeubles | 4 / 4 | 41 | OK |
| syndic : appels de fonds (paginés) | 810 / 810 | 82 | OK |
| trésorier : reste dû du tableau de bord = base | 94605.30 / 94605.30 | 82 | OK |
| trésorier : trésorerie du tableau de bord = journal | [{"currency":"MAD","amount":"609297.20"}] / 609297.20 |  | OK |
| trésorier : paiements à valider = déclarations en attente | 8 |  | OK |
| syndic : réclamations (tableau Kanban) | 17 / 17 | 104 | OK |
| syndic : dépenses | 30 | 30 | OK |
| syndic : bibliothèque (tous les documents non archivés) | 228 / 228 | 26 | OK |
| syndic : assemblées et réunions | 6 | 54 | OK |
| syndic : annonces | 8 | 29 | OK |
| syndic : prestataires | 5 | 30 | OK |
| syndic : travaux | 12 | 50 | OK |
| copropriétaire : uniquement SES appels de fonds | 10 (siens : 10, copropriété : 810) | 44 | OK |
| copropriétaire : pas d'accès à la liste des copropriétaires | 403 |  | OK |
| copropriétaire : bibliothèque filtrée (ni conseil, ni syndic, ni brouillon) | 22 visibles / 228 | 35 | OK |
| copropriétaire : notifications qui lui sont destinées uniquement | 13 notifications | 40 | OK |
| locataire : aucun appel de fonds de copropriétaire | 403 NaN |  | OK |
| copropriétaire : télécharge l'avis d'appel de fonds de SON lot (PDF identique au fichier) | 200, 4917 o, 1 page(s) |  | OK |
| copropriétaire : avis d'un autre lot refusé | 404 attendu |  | OK |
| copropriétaire : télécharge SON reçu de paiement | 200, 1 page(s) |  | OK |
| copropriétaire : reçu d'une autre personne refusé | 404 attendu |  | OK |
| isolation : document de A refusé au syndic de B | 404 attendu |  | OK |
| trésorier : facture fournisseur téléchargeable (PDF valide) | 200, 1 page(s) |  | OK |
| copropriétaire : facture fournisseur non accessible | 403 |  | OK |
| isolation : facture de A refusée au syndic de B | 403 |  | OK |
| syndic : rapport d'intervention téléchargeable (PDF valide) | 200, 1 page(s) |  | OK |
| syndic : photo d'intervention téléchargeable (PNG décodable) | 200, 480×320 |  | OK |
| syndic : recherche « Reçu » dans la bibliothèque | 16 / 16 | 20 | OK |
| syndic : filtre catégorie + audience, page 2 | 162 / 162, page de 20 | 46 | OK |
| syndic : clés de répartition de la copropriété | 2 / 2 | 34 | OK |
| syndic : clé valide pour le moteur (lots de l'immeuble, exclusions motivées) | ASC v1, 0 erreur(s) | 46 | OK |
| copropriétaire : clés de répartition réservées à l'équipe | 403 |  | OK |
| copropriétaire : SES acceptations des CGU | 1 / 1 | 23 | OK |
| syndic : « lu et compris » comptés par annonce = base | 48 / 48 sur 8 annonces | 32 | OK |
| copropriétaire : SES « lu et compris », sans le compte de l'équipe | 4 / 4 | 25 | OK |
| syndic : infractions de stationnement des immeubles | 4 / 4 | 25 | OK |
| copropriétaire : uniquement les infractions qu'il a signalées | 0 visibles | 40 | OK |
| résident : SON panier | 1 / 1 | 18 | OK |
| isolation : le syndic de A ne lit pas un lot de B | 404 |  | OK |
| isolation : la liste du syndic de B ne contient aucun membre de A | 133 membres |  | OK |
| isolation : un document de A est introuvable depuis B | 404 |  | OK |
| performance : réponses des listes principales < 1 s | max 104 ms |  | OK |

## Échecs constatés

- États — Procuration utilisée ⇒ reçu de vote du mandant porté par le mandataire : 1 ligne(s). Procuration de démonstration eproxy_2 du seed initial : statut « used » sans bulletin du mandant. Aucune procuration générée n'est concernée. À corriger dans scripts/src/seed.ts (non modifié ici).
- Isolation — Procuration : mandant et mandataire de la copropriété de l'élection : 1 ligne(s). Procuration de démonstration eproxy_2 du seed initial : mandant et mandataire (user_member_4, user_member_3) rattachés à une autre copropriété que l'élection election_2. Aucune procuration générée n'est concernée. À corriger dans scripts/src/seed.ts (non modifié ici).
