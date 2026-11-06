# Rapport de génération des données de test

Lancement `seedgen:s20261019` (graine 20261019, échelle 1) — statut **done**, durée 340 s. Domaine des comptes : `s20261019.seedgen.mizan.test`.

Contrôles d'intégrité : **317/319 réussis**.

Utilisateurs générés : **1043** (comptes de test, domaine réservé ; voir docs/database/DATABASE_SEEDING_GUIDE.md).

## Volumes par table

| Table | Avant | Ajoutées | Après | Statut |
|---|---:|---:|---:|---|
| `actes_administratifs` | 5 | 131 | 136 | alimentée |
| `action_participants` | 3 | 0 | 3 | non alimentée : voir union_actions |
| `action_supports` | 3 | 0 | 3 | non alimentée : voir union_actions |
| `ag_proxies` | 2 | 106 | 108 | alimentée |
| `ag_resolutions` | 3 | 334 | 337 | alimentée |
| `alert_reads` | 3 | 5726 | 5729 | alimentée |
| `alerts` | 1299 | 10545 | 11844 | alimentée |
| `allocation_key_shares` | 0 | 2469 | 2469 | alimentée |
| `allocation_key_versions` | 0 | 74 | 74 | alimentée |
| `allocation_keys` | 0 | 58 | 58 | alimentée |
| `allocation_lines` | 0 | 22020 | 22020 | alimentée |
| `allocation_sources` | 0 | 720 | 720 | alimentée |
| `allocations` | 0 | 720 | 720 | alimentée |
| `announcement_acknowledgements` | 0 | 1413 | 1413 | alimentée |
| `announcements` | 4 | 463 | 467 | alimentée |
| `appel_adjustments` | 0 | 72 | 72 | alimentée |
| `appel_payments` | 1 | 21782 | 21783 | alimentée |
| `appel_reminders` | 5 | 1942 | 1947 | alimentée |
| `appels_de_fonds` | 10 | 22020 | 22030 | alimentée |
| `audit_logs` | 3057 | 4802 | 7859 | alimentée |
| `bank_statement_lines` | 0 | 2696 | 2696 | alimentée |
| `bank_statements` | 0 | 60 | 60 | alimentée |
| `billing_invoices` | 5 | 473 | 478 | alimentée |
| `blocked_users` | 2 | 11 | 13 | alimentée |
| `bon_items` | 2 | 280 | 282 | alimentée |
| `bons_livraison` | 2 | 133 | 135 | alimentée |
| `budget_lines` | 8 | 2304 | 2312 | alimentée |
| `budgets` | 3 | 326 | 329 | alimentée |
| `buildings` | 4 | 146 | 150 | alimentée |
| `caisse_entries` | 8 | 0 | 8 | non alimentée : remplacée par le compte « Caisse » du journal |
| `candidates` | 306 | 133 | 439 | alimentée |
| `cart_items` | 2 | 75 | 77 | alimentée |
| `charge_attachments` | 3 | 0 | 3 | non alimentée : les preuves de paiement passent par appel_payments ; aucune pièce d'appel requise |
| `chat_reports` | 2 | 7 | 9 | alimentée |
| `claim_attachments` | 0 | 273 | 273 | alimentée |
| `claim_events` | 0 | 4045 | 4045 | alimentée |
| `claim_notifications` | 0 | 0 | 0 | non alimentée : file technique de livraison, remplie par l'API |
| `claims` | 0 | 1027 | 1027 | alimentée |
| `conseil_syndical` | 66 | 298 | 364 | alimentée |
| `contrats_prestataires` | 4 | 413 | 417 | alimentée |
| `conversation_archives` | 2 | 45 | 47 | alimentée |
| `conversations` | 6 | 320 | 326 | alimentée |
| `cotisations` | 7 | 0 | 7 | non alimentée : remplacé par les appels de fonds ; des cotisations parallèles contrediraient les soldes |
| `debt_escalations` | 2 | 0 | 2 | non alimentée : seuils de recouvrement non validés (voir SECURITY_LOG) : aucune étape contentieuse fabriquée |
| `document_comments` | 4 | 119 | 123 | alimentée |
| `document_sequences` | 11 | 657 | 668 | alimentée |
| `document_signatures` | 4 | 0 | 4 | non alimentée : une signature ne se fabrique pas (circuit de signature réel requis) |
| `document_versions` | 3 | 92 | 95 | alimentée |
| `documents` | 8 | 7519 | 7527 | alimentée |
| `election_proxies` | 2 | 58 | 60 | alimentée |
| `election_questions` | 3 | 25 | 28 | alimentée |
| `elections` | 153 | 47 | 200 | alimentée |
| `email_logs` | 502 | 70 | 572 | alimentée |
| `expense_justifications` | 3 | 18 | 21 | alimentée |
| `expense_votes` | 5 | 72 | 77 | alimentée |
| `expenses` | 0 | 1426 | 1426 | alimentée |
| `fiches_juridiques` | 6 | 0 | 6 | non alimentée : contenu juridique : jamais inventé |
| `fonds_travaux` | 4 | 144 | 148 | alimentée |
| `governance_delegations` | 0 | 29 | 29 | alimentée |
| `idea_votes` | 5 | 732 | 737 | alimentée |
| `ideas` | 4 | 152 | 156 | alimentée |
| `invoice_attachments` | 3 | 0 | 3 | non alimentée : les justificatifs sont portés par les dépenses (expenses.proof_url) |
| `invoice_items` | 4 | 1724 | 1728 | alimentée |
| `invoices` | 3 | 687 | 690 | alimentée |
| `ledger_entries` | 0 | 22355 | 22355 | alimentée |
| `legal_alerts` | 3 | 0 | 3 | non alimentée : contenu réglementaire : jamais inventé |
| `lot_ownerships` | 8 | 5550 | 5558 | alimentée |
| `lots` | 28 | 4690 | 4718 | alimentée |
| `marketplace_promotions` | 2 | 0 | 2 | non alimentée : paiement de promotion : aucun paiement fictif présenté comme réel |
| `meeting_attendees` | 5 | 1879 | 1884 | alimentée |
| `meetings` | 4 | 342 | 346 | alimentée |
| `members` | 27 | 3760 | 3787 | alimentée |
| `message_reactions` | 4 | 71 | 75 | alimentée |
| `message_reads` | 4 | 523 | 527 | alimentée |
| `messages` | 14 | 2244 | 2258 | alimentée |
| `national_rankings` | 4 | 720 | 724 | alimentée |
| `notification_preferences` | 6 | 1041 | 1047 | alimentée |
| `orders` | 2 | 29 | 31 | alimentée |
| `organization_members` | 0 | 43 | 43 | alimentée |
| `organizations` | 0 | 12 | 12 | alimentée |
| `otp_tokens` | 2 | 1 | 3 | alimentée |
| `parking_spots` | 9 | 1032 | 1041 | alimentée |
| `parking_violations` | 2 | 130 | 132 | alimentée |
| `partners` | 3 | 28 | 31 | alimentée |
| `password_reset_tokens` | 2 | 2 | 4 | alimentée |
| `payment_proofs` | 4 | 0 | 4 | non alimentée : voir cotisations |
| `payslips` | 3 | 0 | 3 | non alimentée : aucun employé n'a de compte utilisateur dans le jeu ; salary_records couvre la paie |
| `prestataire_evaluations` | 4 | 285 | 289 | alimentée |
| `prestataires` | 5 | 238 | 243 | alimentée |
| `product_comments` | 3 | 68 | 71 | alimentée |
| `product_favorites` | 2 | 85 | 87 | alimentée |
| `product_reports` | 2 | 6 | 8 | alimentée |
| `products` | 6 | 362 | 368 | alimentée |
| `publication_comments` | 3 | 449 | 452 | alimentée |
| `publication_likes` | 5 | 1272 | 1277 | alimentée |
| `publications` | 5 | 311 | 316 | alimentée |
| `reclamations` | 6 | 0 | 6 | non alimentée : module retiré (routes 410) ; les incidents sont dans claims |
| `reconciliation_matches` | 0 | 2176 | 2176 | alimentée |
| `refresh_tokens` | 80 | 154 | 234 | alimentée |
| `reviews` | 2 | 21 | 23 | alimentée |
| `salary_records` | 5 | 1122 | 1127 | alimentée |
| `scheduled_job_runs` | 8 | 0 | 8 | non alimentée : table technique tenue par le planificateur |
| `sinistres` | 4 | 93 | 97 | alimentée |
| `storage_objects` | 0 | 12477 | 12477 | alimentée |
| `subscription_payments` | 3 | 473 | 476 | alimentée |
| `subscription_plans` | 3 | 0 | 3 | inchangée |
| `support_tickets` | 4 | 172 | 176 | alimentée |
| `syndicate_memberships` | 0 | 17 | 17 | alimentée |
| `syndicate_subscriptions` | 4 | 62 | 66 | alimentée |
| `syndicates` | 4 | 62 | 66 | alimentée |
| `template_definition_permissions` | 9 | 0 | 9 | non alimentée : configuration |
| `template_definition_versions` | 3 | 0 | 3 | non alimentée : configuration |
| `template_definitions` | 5 | 0 | 5 | non alimentée : configuration de la plateforme, non dupliquée |
| `template_requests` | 3 | 0 | 3 | non alimentée : demandes plateforme ponctuelles ; démo existante conservée |
| `tenants` | 7 | 901 | 908 | alimentée |
| `terms_acceptances` | 0 | 594 | 594 | alimentée |
| `ticket_replies` | 4 | 118 | 122 | alimentée |
| `transactions` | 9 | 0 | 9 | non alimentée : les flux réels passent par le journal (ledger_entries) |
| `travaux` | 5 | 561 | 566 | alimentée |
| `travaux_privatifs` | 4 | 74 | 78 | alimentée |
| `treasury_accounts` | 4 | 120 | 124 | alimentée |
| `union_actions` | 3 | 0 | 3 | non alimentée : fonction sans rapport avec la gestion de copropriété |
| `users` | 42 | 1050 | 1092 | alimentée |
| `vehicles` | 6 | 381 | 387 | alimentée |
| `visitor_parking_reservations` | 2 | 67 | 69 | alimentée |
| `vote_receipts` | 1205 | 251 | 1456 | alimentée |
| `votes` | 1205 | 251 | 1456 | alimentée |
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
| Clés étrangères | 247 contraintes vérifiées (relations orphelines) | 0 | OK |

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

- Fichiers enregistrés : **12477** — PDF valides **10344** (10344 pages au total), PDF invalides 0 ; PNG valides **2133**, PNG invalides 0.
- Absents du disque : 0 ; taille différente de celle enregistrée : 0.
- Validation : structure PDF complète (en-tête, table xref, objets, arbre des pages, flux décompressés) et PNG décodé (CRC, pixels décompressés).

| Référence | Fichiers référencés | Sans fichier |
|---|---:|---:|
| `documents.file_url` | 7519 | 0 |
| `document_versions.file_url` | 92 | 0 |
| `expenses.proof_url` | 1426 | 0 |
| `invoices.proof_url` | 687 | 0 |
| `contrats_prestataires.document_url` | 413 | 0 |
| `prestataires.document_url` | 238 | 0 |
| `travaux.report_url` | 295 | 0 |
| `travaux.invoice_url` | 295 | 0 |
| `travaux.photo_urls` | 735 | 0 |
| `sinistres.image_urls` | 143 | 0 |
| `sinistres.invoice_url` | 33 | 0 |
| `products.image_urls` | 783 | 0 |
| `appel_payments.proof_url` | 187 | 0 |
| `claim_attachments.object_path` | 273 | 0 |

| Type de document produit | Fichiers |
|---|---:|
| règlement | 60 |
| budget | 326 |
| convocation | 230 |
| procès-verbal | 216 |
| appel de fonds | 4404 |
| reçu | 734 |
| justificatif de paiement | 187 |
| devis prestataire | 238 |
| contrat | 413 |
| devis | 369 |
| facture fournisseur | 646 |
| photo | 1186 |
| rapport d'intervention | 295 |
| Photos d'infractions de stationnement | 66 |
| Documents en arabe | 48 |

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
