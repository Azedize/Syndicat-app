# Rapport de génération des données de test

Lancement `seedgen:s20261019` (graine 20261019, échelle 1) — statut **done**, durée 309 s. Domaine des comptes : `s20261019.seedgen.mizan.test`.

Contrôles d'intégrité : **305/307 réussis**.

Utilisateurs générés : **1057** (comptes de test, domaine réservé ; voir DATABASE_SEEDING_GUIDE.md).

## Volumes par table

| Table | Avant | Ajoutées | Après | Statut |
|---|---:|---:|---:|---|
| `actes_administratifs` | 5 | 130 | 135 | alimentée |
| `action_participants` | 3 | 0 | 3 | non alimentée : voir union_actions |
| `action_supports` | 3 | 0 | 3 | non alimentée : voir union_actions |
| `ag_proxies` | 2 | 96 | 98 | alimentée |
| `ag_resolutions` | 3 | 331 | 334 | alimentée |
| `alert_reads` | 3 | 5878 | 5881 | alimentée |
| `alerts` | 5 | 10631 | 10636 | alimentée |
| `allocation_key_shares` | 0 | 0 | 0 | non alimentée : voir allocation_keys |
| `allocation_key_versions` | 0 | 0 | 0 | non alimentée : voir allocation_keys |
| `allocation_keys` | 0 | 0 | 0 | non alimentée : les appels utilisent la clé implicite des tantièmes (comme la route generate-appels) ; clés explicites couvertes par allocation:test |
| `allocation_lines` | 0 | 23455 | 23455 | alimentée |
| `allocation_sources` | 0 | 700 | 700 | alimentée |
| `allocations` | 0 | 700 | 700 | alimentée |
| `announcement_acknowledgements` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `announcements` | 4 | 456 | 460 | alimentée |
| `appel_adjustments` | 0 | 0 | 0 | non alimentée : action ponctuelle du syndic ; couverte par funds-calls:test |
| `appel_payments` | 0 | 20347 | 20347 | alimentée |
| `appel_reminders` | 0 | 1522 | 1522 | alimentée |
| `appels_de_fonds` | 10 | 23455 | 23465 | alimentée |
| `audit_logs` | 10 | 4571 | 4581 | alimentée |
| `bank_statement_lines` | 0 | 486 | 486 | alimentée |
| `bank_statements` | 0 | 60 | 60 | alimentée |
| `billing_invoices` | 5 | 451 | 456 | alimentée |
| `blocked_users` | 2 | 0 | 2 | non alimentée : action personnelle sans intérêt de volume ; démo existante conservée |
| `bon_items` | 2 | 281 | 283 | alimentée |
| `bons_livraison` | 2 | 145 | 147 | alimentée |
| `budget_lines` | 8 | 2240 | 2248 | alimentée |
| `budgets` | 3 | 325 | 328 | alimentée |
| `buildings` | 3 | 140 | 143 | alimentée |
| `caisse_entries` | 8 | 0 | 8 | non alimentée : remplacée par le compte « Caisse » du journal |
| `candidates` | 6 | 112 | 118 | alimentée |
| `cart_items` | 2 | 0 | 2 | non alimentée : état temporaire de navigation |
| `charge_attachments` | 3 | 0 | 3 | non alimentée : les preuves de paiement passent par appel_payments ; aucune pièce d'appel requise |
| `chat_reports` | 2 | 0 | 2 | non alimentée : modération : aucun contenu abusif fabriqué |
| `claim_attachments` | 0 | 237 | 237 | alimentée |
| `claim_events` | 0 | 3937 | 3937 | alimentée |
| `claim_notifications` | 0 | 0 | 0 | non alimentée : file technique de livraison, remplie par l'API |
| `claims` | 0 | 1001 | 1001 | alimentée |
| `conseil_syndical` | 6 | 292 | 298 | alimentée |
| `contrats_prestataires` | 4 | 376 | 380 | alimentée |
| `conversation_archives` | 2 | 0 | 2 | non alimentée : action personnelle ; démo existante conservée |
| `conversations` | 6 | 292 | 298 | alimentée |
| `cotisations` | 7 | 0 | 7 | non alimentée : remplacé par les appels de fonds ; des cotisations parallèles contrediraient les soldes |
| `debt_escalations` | 2 | 0 | 2 | non alimentée : seuils de recouvrement non validés (voir SECURITY_LOG) : aucune étape contentieuse fabriquée |
| `document_comments` | 4 | 133 | 137 | alimentée |
| `document_sequences` | 7 | 657 | 664 | alimentée |
| `document_signatures` | 4 | 0 | 4 | non alimentée : une signature ne se fabrique pas (circuit de signature réel requis) |
| `document_versions` | 3 | 109 | 112 | alimentée |
| `documents` | 8 | 7721 | 7729 | alimentée |
| `election_proxies` | 2 | 0 | 2 | non alimentée : volume marginal ; règles de procuration couvertes par election-audit:test |
| `election_questions` | 3 | 24 | 27 | alimentée |
| `elections` | 3 | 38 | 41 | alimentée |
| `email_logs` | 7 | 0 | 7 | non alimentée : rempli uniquement par un envoi réel ; aucun e-mail n'est envoyé |
| `expense_justifications` | 3 | 22 | 25 | alimentée |
| `expense_votes` | 5 | 88 | 93 | alimentée |
| `expenses` | 0 | 1301 | 1301 | alimentée |
| `fiches_juridiques` | 6 | 0 | 6 | non alimentée : contenu juridique : jamais inventé |
| `fonds_travaux` | 4 | 140 | 144 | alimentée |
| `governance_delegations` | 0 | 35 | 35 | alimentée |
| `idea_votes` | 5 | 793 | 798 | alimentée |
| `ideas` | 4 | 146 | 150 | alimentée |
| `invoice_attachments` | 3 | 0 | 3 | non alimentée : les justificatifs sont portés par les dépenses (expenses.proof_url) |
| `invoice_items` | 4 | 1743 | 1747 | alimentée |
| `invoices` | 3 | 680 | 683 | alimentée |
| `ledger_entries` | 0 | 20585 | 20585 | alimentée |
| `legal_alerts` | 3 | 0 | 3 | non alimentée : contenu réglementaire : jamais inventé |
| `lot_ownerships` | 0 | 5944 | 5944 | alimentée |
| `lots` | 8 | 5048 | 5056 | alimentée |
| `marketplace_promotions` | 2 | 0 | 2 | non alimentée : paiement de promotion : aucun paiement fictif présenté comme réel |
| `meeting_attendees` | 5 | 1754 | 1759 | alimentée |
| `meetings` | 4 | 328 | 332 | alimentée |
| `members` | 6 | 3900 | 3906 | alimentée |
| `message_reactions` | 4 | 47 | 51 | alimentée |
| `message_reads` | 4 | 475 | 479 | alimentée |
| `messages` | 14 | 2080 | 2094 | alimentée |
| `national_rankings` | 4 | 720 | 724 | alimentée |
| `notification_preferences` | 6 | 1055 | 1061 | alimentée |
| `orders` | 2 | 22 | 24 | alimentée |
| `organization_members` | 0 | 43 | 43 | alimentée |
| `organizations` | 0 | 12 | 12 | alimentée |
| `otp_tokens` | 3 | 0 | 3 | non alimentée : codes de sécurité, jamais fabriqués |
| `parking_spots` | 9 | 1250 | 1259 | alimentée |
| `parking_violations` | 2 | 0 | 2 | non alimentée : volume marginal ; démo existante conservée |
| `partners` | 3 | 28 | 31 | alimentée |
| `password_reset_tokens` | 2 | 0 | 2 | non alimentée : jetons de sécurité, jamais fabriqués |
| `payment_proofs` | 4 | 0 | 4 | non alimentée : voir cotisations |
| `payslips` | 3 | 0 | 3 | non alimentée : aucun employé n'a de compte utilisateur dans le jeu ; salary_records couvre la paie |
| `prestataire_evaluations` | 4 | 287 | 291 | alimentée |
| `prestataires` | 5 | 226 | 231 | alimentée |
| `product_comments` | 3 | 54 | 57 | alimentée |
| `product_favorites` | 2 | 52 | 54 | alimentée |
| `product_reports` | 2 | 0 | 2 | non alimentée : modération : aucun contenu abusif fabriqué |
| `products` | 6 | 156 | 162 | alimentée |
| `publication_comments` | 3 | 440 | 443 | alimentée |
| `publication_likes` | 5 | 1267 | 1272 | alimentée |
| `publications` | 5 | 307 | 312 | alimentée |
| `reclamations` | 6 | 0 | 6 | non alimentée : module retiré (routes 410) ; les incidents sont dans claims |
| `reconciliation_matches` | 0 | 396 | 396 | alimentée |
| `refresh_tokens` | 5 | 0 | 5 | non alimentée : jetons de sécurité créés uniquement par une vraie connexion |
| `reviews` | 2 | 17 | 19 | alimentée |
| `salary_records` | 5 | 1020 | 1025 | alimentée |
| `scheduled_job_runs` | 0 | 0 | 0 | non alimentée : table technique tenue par le planificateur |
| `sinistres` | 4 | 105 | 109 | alimentée |
| `storage_objects` | 0 | 12208 | 12208 | alimentée |
| `subscription_payments` | 3 | 451 | 454 | alimentée |
| `subscription_plans` | 3 | 0 | 3 | inchangée |
| `support_tickets` | 4 | 169 | 173 | alimentée |
| `syndicate_memberships` | 0 | 17 | 17 | alimentée |
| `syndicate_subscriptions` | 2 | 60 | 62 | alimentée |
| `syndicates` | 2 | 60 | 62 | alimentée |
| `template_definition_permissions` | 9 | 0 | 9 | non alimentée : configuration |
| `template_definition_versions` | 3 | 0 | 3 | non alimentée : configuration |
| `template_definitions` | 5 | 0 | 5 | non alimentée : configuration de la plateforme, non dupliquée |
| `template_requests` | 3 | 0 | 3 | non alimentée : demandes plateforme ponctuelles ; démo existante conservée |
| `tenants` | 2 | 970 | 972 | alimentée |
| `terms_acceptances` | 0 | 0 | 0 | non alimentée : non documentée : à classer avant génération |
| `ticket_replies` | 4 | 131 | 135 | alimentée |
| `transactions` | 9 | 0 | 9 | non alimentée : les flux réels passent par le journal (ledger_entries) |
| `travaux` | 5 | 528 | 533 | alimentée |
| `travaux_privatifs` | 4 | 73 | 77 | alimentée |
| `treasury_accounts` | 4 | 120 | 124 | alimentée |
| `union_actions` | 3 | 0 | 3 | non alimentée : fonction sans rapport avec la gestion de copropriété |
| `users` | 14 | 1057 | 1071 | alimentée |
| `vehicles` | 6 | 386 | 392 | alimentée |
| `visitor_parking_reservations` | 2 | 64 | 66 | alimentée |
| `vote_receipts` | 5 | 192 | 197 | alimentée |
| `votes` | 5 | 192 | 197 | alimentée |
| `workflow_steps` | 15 | 0 | 15 | non alimentée : voir workflows |
| `workflows` | 5 | 0 | 5 | non alimentée : table sans rattachement à une copropriété : isolation impossible à garantir |

## Contrôles d'intégrité

| Groupe | Contrôle | Lignes trouvées | Résultat |
|---|---|---:|---|
| Finance | Payé d'un appel = somme de ses paiements validés | 0 | OK |
| Finance | Statut payé ⇔ payé = montant | 4 | **ÉCHEC** |
| Finance | Statut partiellement payé ⇔ 0 < payé < montant | 0 | OK |
| Finance | En retard uniquement si l'échéance est passée et rien n'est payé | 0 | OK |
| Finance | Paiement en validation ⇒ un paiement déclaré en attente | 1 | **ÉCHEC** |
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
| Valeurs | documents.visibility parmi les valeurs de l'application (données générées) | 0 | OK |
| Clés étrangères | 247 contraintes vérifiées (relations orphelines) | 0 | OK |

## Nettoyage préalable (anciennes données du générateur)

Exécuté le 2026-10-20 22:04 UTC ; sauvegarde complète (pg_dump + fichiers) dans `scripts/.seedgen/backups/2026-10-20T22-03-21-545Z`. Seules les données rattachées aux marqueurs du générateur ont été supprimées ; données de démonstration et comptes non générés conservés.

| Table | Lignes supprimées |
|---|---:|
| `document_versions` | 313 |
| `document_comments` | 365 |
| `claim_events` | 3727 |
| `claim_attachments` | 205 |
| `appel_reminders` | 2877 |
| `appel_payments` | 19254 |
| `allocation_lines` | 22055 |
| `reconciliation_matches` | 407 |
| `lot_ownerships` | 5556 |
| `expenses` | 1365 |
| `documents` | 2498 |
| `debt_escalations` | 1253 |
| `claims` | 940 |
| `budget_lines` | 2208 |
| `bank_statement_lines` | 506 |
| `appels_de_fonds` | 22055 |
| `allocation_sources` | 690 |
| `votes` | 177 |
| `visitor_parking_reservations` | 80 |
| `vehicles` | 397 |
| `tenants` | 974 |
| `salary_records` | 1000 |
| `publication_likes` | 1237 |
| `publication_comments` | 471 |
| `product_favorites` | 52 |
| `product_comments` | 45 |
| `prestataire_evaluations` | 259 |
| `parking_spots` | 1020 |
| `message_reactions` | 56 |
| `meeting_attendees` | 1857 |
| `lots` | 4676 |
| `ledger_entries` | 19660 |
| `invoice_items` | 1715 |
| `idea_votes` | 709 |
| `governance_delegations` | 31 |
| `election_questions` | 14 |
| `contrats_prestataires` | 360 |
| `conseil_syndical` | 282 |
| `candidates` | 95 |
| `budgets` | 319 |
| `bon_items` | 276 |
| `bank_statements` | 60 |
| `allocations` | 690 |
| `alert_reads` | 5479 |
| `ag_resolutions` | 319 |
| `ag_proxies` | 102 |
| `vote_receipts` | 177 |
| `treasury_accounts` | 120 |
| `travaux` | 558 |
| `ticket_replies` | 130 |
| `syndicate_subscriptions` | 60 |
| `syndicate_memberships` | 15 |
| `support_tickets` | 183 |
| `subscription_payments` | 446 |
| `storage_objects` | 4381 |
| `sinistres` | 92 |
| `refresh_tokens` | 10 |
| `publications` | 312 |
| `products` | 167 |
| `prestataires` | 208 |
| `partners` | 16 |
| `organization_members` | 45 |
| `national_rankings` | 720 |
| `messages` | 2073 |
| `message_reads` | 461 |
| `members` | 3782 |
| `meetings` | 340 |
| `invoices` | 687 |
| `ideas` | 149 |
| `fonds_travaux` | 138 |
| `expense_votes` | 60 |
| `expense_justifications` | 15 |
| `elections` | 32 |
| `conversations` | 298 |
| `buildings` | 138 |
| `bons_livraison` | 136 |
| `billing_invoices` | 446 |
| `announcements` | 456 |
| `alerts` | 11707 |
| `actes_administratifs` | 135 |
| `users` | 1054 |
| `travaux_privatifs` | 62 |
| `syndicates` | 60 |
| `reviews` | 23 |
| `organizations` | 12 |
| `orders` | 29 |
| `notification_preferences` | 1072 |
| `document_sequences` | 655 |
| `audit_logs` | 4589 |
| `(fichiers)` | 4381 |
| `audit_logs (résidus)` | 4813 |
| `document_sequences (résidus)` | 712 |
| `notification_preferences (résidus)` | 1132 |
| `orders (résidus)` | 33 |
| `reviews (résidus)` | 21 |

### Résidus d'anciens lancements

Lignes pointant vers un utilisateur ou une copropriété supprimés par une colonne sans clé étrangère. Supprimées uniquement si leur appartenance au générateur est prouvée (identifiant produit par une graine connue, ou texte écrit seulement par le générateur) ; les autres sont conservées.

| Table.colonne | Orphelines | Prouvées générateur (supprimées) | Conservées |
|---|---:|---:|---:|
| `audit_logs.syndicate_id` | 4841 | 4824 | 17 |
| `audit_logs.user_id` | 4869 | 4813 | 56 |
| `document_sequences.syndicate_id` | 712 | 712 | 0 |
| `email_logs.syndicate_id` | 17 | 0 | 17 |
| `lot_ownerships.created_by` | 8 | 0 | 8 |
| `notification_preferences.user_id` | 1132 | 1132 | 0 |
| `orders.buyer_id` | 33 | 33 | 0 |
| `orders.seller_id` | 33 | 33 | 0 |
| `orders.product_id` | 33 | 33 | 0 |
| `organizations.created_by` | 2 | 0 | 2 |
| `reviews.reviewer_id` | 21 | 21 | 0 |
| `reviews.product_id` | 21 | 21 | 0 |
| `treasury_accounts.created_by` | 4 | 0 | 4 |

## Fichiers réels

Emplacement : `artifacts/api-server/uploads/` (stockage local de l'API, chemins `/objects/uploads/<id>.pdf|png`). Chaque fichier est enregistré dans `storage_objects` et relié à son objet métier.

- Fichiers enregistrés : **12208** — PDF valides **10714** (10714 pages au total), PDF invalides 0 ; PNG valides **1494**, PNG invalides 0.
- Absents du disque : 0 ; taille différente de celle enregistrée : 0.
- Validation : structure PDF complète (en-tête, table xref, objets, arbre des pages, flux décompressés) et PNG décodé (CRC, pixels décompressés).

| Référence | Fichiers référencés | Sans fichier |
|---|---:|---:|
| `documents.file_url` | 7721 | 0 |
| `document_versions.file_url` | 109 | 0 |
| `expenses.proof_url` | 1301 | 0 |
| `invoices.proof_url` | 680 | 0 |
| `contrats_prestataires.document_url` | 376 | 0 |
| `prestataires.document_url` | 226 | 0 |
| `travaux.report_url` | 271 | 0 |
| `travaux.invoice_url` | 271 | 0 |
| `travaux.photo_urls` | 688 | 0 |
| `sinistres.image_urls` | 165 | 0 |
| `sinistres.invoice_url` | 48 | 0 |
| `products.image_urls` | 283 | 0 |
| `appel_payments.proof_url` | 479 | 0 |
| `claim_attachments.object_path` | 237 | 0 |

| Type de document produit | Fichiers |
|---|---:|
| règlement | 60 |
| budget | 325 |
| convocation | 221 |
| procès-verbal | 203 |
| appel de fonds | 4691 |
| reçu | 723 |
| justificatif de paiement | 479 |
| devis prestataire | 226 |
| contrat | 376 |
| devis | 384 |
| facture fournisseur | 615 |
| photo | 1136 |
| rapport d'intervention | 271 |

## Procédure exécutée (`seedgen run`)

- **1. Environnement** — syndycat_global_cps (base locale de développement), PostgreSQL 18.6 on x86_64-windows
- **2. Migrations** — aucune migration en attente
- **3–4. Sauvegarde et nettoyage** — 171646 lignes et 4381 fichiers supprimés (sauvegarde dans .seedgen/backups)
- **5–7. Génération** — données + 9806 fichiers produits par la phase documents
- **8. Contrôles** — 302/303 contrôles d'intégrité ; fichiers OK

## Vérification à travers l'API

Exécutée le 2026-10-20 22:11 UTC sur « Résidence Al Boustane Belvédère 49 » avec des comptes générés de chaque rôle (`seedgen:api`) : **37/37 réussies**.

| Vérification | Détail | Temps | Résultat |
|---|---|---:|---|
| super admin : liste des copropriétés de la plateforme | 62 / 62 en base | 81 | OK |
| super admin : utilisateurs paginés (≈ 1 000) | total 1064 / 1064 en base, page de 50 | 27 | OK |
| syndic : copropriétaires de SA copropriété uniquement (paginé) | 177 / 177 | 16 | OK |
| syndic : lots de la copropriété | 206 / 206 | 69 | OK |
| syndic : immeubles | 4 / 4 | 30 | OK |
| syndic : appels de fonds (paginés) | 995 / 995 | 74 | OK |
| trésorier : reste dû du tableau de bord = base | 251271.04 / 251271.04 | 108 | OK |
| trésorier : trésorerie du tableau de bord = journal | [{"currency":"MAD","amount":"619213.96"}] / 619213.96 |  | OK |
| trésorier : paiements à valider = déclarations en attente | 23 |  | OK |
| syndic : réclamations (tableau Kanban) | 14 / 14 | 78 | OK |
| syndic : dépenses | 19 | 45 | OK |
| syndic : bibliothèque (tous les documents non archivés) | 256 / 256 | 40 | OK |
| syndic : assemblées et réunions | 5 | 29 | OK |
| syndic : annonces | 5 | 32 | OK |
| syndic : prestataires | 4 | 33 | OK |
| syndic : travaux | 8 | 31 | OK |
| copropriétaire : uniquement SES appels de fonds | 5 (siens : 5, copropriété : 995) | 37 | OK |
| copropriétaire : pas d'accès à la liste des copropriétaires | 403 |  | OK |
| copropriétaire : bibliothèque filtrée (ni conseil, ni syndic, ni brouillon) | 26 visibles / 256 | 29 | OK |
| copropriétaire : notifications qui lui sont destinées uniquement | 12 notifications | 22 | OK |
| locataire : aucun appel de fonds de copropriétaire | 403 NaN |  | OK |
| copropriétaire : télécharge l'avis d'appel de fonds de SON lot (PDF identique au fichier) | 200, 4845 o, 1 page(s) |  | OK |
| copropriétaire : avis d'un autre lot refusé | 404 attendu |  | OK |
| copropriétaire : télécharge SON reçu de paiement | 200, 1 page(s) |  | OK |
| copropriétaire : reçu d'une autre personne refusé | 404 attendu |  | OK |
| isolation : document de A refusé au syndic de B | 404 attendu |  | OK |
| trésorier : facture fournisseur téléchargeable (PDF valide) | 200, 1 page(s) |  | OK |
| copropriétaire : facture fournisseur non accessible | 403 |  | OK |
| isolation : facture de A refusée au syndic de B | 403 |  | OK |
| syndic : rapport d'intervention téléchargeable (PDF valide) | 200, 1 page(s) |  | OK |
| syndic : photo d'intervention téléchargeable (PNG décodable) | 200, 480×320 |  | OK |
| syndic : recherche « Reçu » dans la bibliothèque | 9 / 9 | 15 | OK |
| syndic : filtre catégorie + audience, page 2 | 199 / 199, page de 20 | 25 | OK |
| isolation : le syndic de A ne lit pas un lot de B | 404 |  | OK |
| isolation : la liste du syndic de B ne contient aucun membre de A | 108 membres |  | OK |
| isolation : un document de A est introuvable depuis B | 404 |  | OK |
| performance : réponses des listes principales < 1 s | max 108 ms |  | OK |

## Échecs constatés

- Finance — Statut payé ⇔ payé = montant : 4 ligne(s). À analyser.
- Finance — Paiement en validation ⇒ un paiement déclaré en attente : 1 ligne(s). À analyser.
