-- ─── Syndicates ─────────────────────────────────────────────────────────────
INSERT INTO syndicates (id, name, sector, region, admin_id, status, members_count, created_at) VALUES
  ('syn_sne', 'SNE - Syndicat National de l''Enseignement', 'education', 'Casablanca-Settat', 'user_dir_sne', 'active', 3, NOW() - '365 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Users ──────────────────────────────────────────────────────────────────
-- password hash below corresponds to bcrypt hash of "password123" for all seed accounts
INSERT INTO users (id, name, email, phone, password_hash, role, status, syndicate_id, profession, created_at) VALUES
  ('user_admin', 'Administrateur MIZAN', 'admin@mizan.ma', '+212600000001', '$2b$10$E6fCiXjZOQ9prUb2mtPtrOSITUuc3riG5jX7ijiCHiiz33RvZEzQG', 'super_admin', 'active', NULL, 'Administrateur', NOW() - '400 days'::interval),
  ('user_dir_sne', 'Fatima Zahra El Alami', 'directrice@sne.ma', '+212600000002', '$2b$10$E6fCiXjZOQ9prUb2mtPtrOSITUuc3riG5jX7ijiCHiiz33RvZEzQG', 'syndicate_admin', 'active', 'syn_sne', 'Enseignante - Directrice syndicale', NOW() - '365 days'::interval),
  ('user_member_1', 'Mohammed Alaoui', 'mohammed.alaoui@sne.ma', '+212600000003', '$2b$10$E6fCiXjZOQ9prUb2mtPtrOSITUuc3riG5jX7ijiCHiiz33RvZEzQG', 'member', 'active', 'syn_sne', 'Enseignant primaire', NOW() - '300 days'::interval),
  ('user_member_2', 'Khadija Tahiri', 'khadija.tahiri@sne.ma', '+212600000004', '$2b$10$E6fCiXjZOQ9prUb2mtPtrOSITUuc3riG5jX7ijiCHiiz33RvZEzQG', 'member', 'active', 'syn_sne', 'Enseignante secondaire', NOW() - '280 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Conversations ──────────────────────────────────────────────────────────
INSERT INTO conversations (id, syndicate_id, is_group, name, created_at) VALUES
  ('conv_general', 'syn_sne', true, 'Discussion générale SNE', NOW() - '90 days'::interval)
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversations (id, syndicate_id, is_group, participant1_id, participant2_id, name, created_at) VALUES
  ('conv_1', 'syn_sne', false, 'user_dir_sne', 'user_member_1', NULL, NOW() - '60 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Meetings ───────────────────────────────────────────────────────────────
INSERT INTO meetings (id, syndicate_id, title, date, time, location, type, description, agenda, status, created_by, created_at) VALUES
  ('mtg_1', 'syn_sne', 'Réunion de bureau — Bilan grève', '2026-06-11', '14:00', 'Siège SNE Casablanca', 'bureau', 'Bilan de la grève du 20 juin et préparation des négociations', 'Bilan mobilisation, statistiques participation, prochaines étapes', 'completed', 'user_dir_sne', NOW() - '22 days'::interval),
  ('mtg_2', 'syn_sne', 'Assemblée Générale Ordinaire', '2026-07-15', '10:00', 'Salle des congrès, Casablanca', 'general', 'AG annuelle : bilan financier et convention collective', 'Bilan financier, rapport négociations, questions diverses', 'scheduled', 'user_dir_sne', NOW() - '15 days'::interval),
  ('mtg_3', 'syn_sne', 'Réunion préparatoire formation', '2026-07-20', '09:00', 'Siège SNE Casablanca', 'bureau', 'Préparation de la formation droits syndicaux', 'Logistique, intervenants, supports pédagogiques', 'scheduled', 'user_dir_sne', NOW() - '5 days'::interval),
  ('mtg_4', 'syn_sne', 'Réunion de section Marrakech', '2026-06-28', '15:00', 'Local syndical Marrakech', 'section', 'Point sur la mobilisation régionale', 'Retours terrain, cotisations, questions locales', 'completed', 'user_dir_sne', NOW() - '5 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Elections ──────────────────────────────────────────────────────────────
INSERT INTO elections (id, syndicate_id, title, description, status, start_date, end_date, created_by, created_at) VALUES
  ('elec_bureau_2024', 'syn_sne', 'Élection du bureau syndical 2024', 'Élection des membres du bureau exécutif pour le mandat 2024-2026', 'completed', '2024-06-01', '2024-06-15', 'user_dir_sne', NOW() - '700 days'::interval),
  ('elec_bureau_2026', 'syn_sne', 'Élection du bureau syndical 2026', 'Élection des membres du bureau exécutif pour le mandat 2026-2028', 'active', '2026-06-01', '2026-07-10', 'user_dir_sne', NOW() - '30 days'::interval)
ON CONFLICT (id) DO NOTHING;

INSERT INTO candidates (id, election_id, name, post, bio, votes) VALUES
  ('50a1f11a-b63a-4548-9352-946c9bcf45fd', 'elec_bureau_2024', 'Fatima Zahra El Alami', 'Directrice syndicale', 'Enseignante depuis 15 ans, engagée syndicale de longue date', 1),
  ('64c8f564-0dbd-49c6-8cf3-21167c37331e', 'elec_bureau_2024', 'Youssef Bennani', 'Trésorier', 'Enseignant et gestionnaire financier expérimenté', 1),
  ('0b95852b-a3e2-4795-a9e7-a8b26f14f3ae', 'elec_bureau_2026', 'Fatima Zahra El Alami', 'Directrice syndicale', 'Candidate à sa réélection, bilan positif de mandat', 1),
  ('f9ceb3b5-1595-4645-9069-156b1bea33a1', 'elec_bureau_2026', 'Mohammed Alaoui', 'Secrétaire général', 'Enseignant primaire, membre actif du bureau', 1)
ON CONFLICT (id) DO NOTHING;

-- ─── Union Actions ──────────────────────────────────────────────────────────
INSERT INTO union_actions (id, title, description, type, status, date, location, organizer, participants_target, syndicate_id, created_by, created_at) VALUES
  ('ua_001', 'Grève nationale du 20 Juin', 'Grève nationale pour la revalorisation salariale des enseignants', 'greve', 'completed', '2026-06-20', 'National', 'SNE', 5000, 'syn_sne', 'user_dir_sne', NOW() - '20 days'::interval),
  ('ua_002', 'Sit-in devant le Ministère', 'Sit-in pacifique pour réclamer l''ouverture des négociations', 'sit_in', 'completed', '2026-05-15', 'Rabat', 'SNE', 500, 'syn_sne', 'user_dir_sne', NOW() - '55 days'::interval),
  ('ua_003', 'Pétition statut de l''enseignant', 'Collecte de signatures pour un nouveau statut de l''enseignant', 'petition', 'ongoing', '2026-06-01', 'National', 'SNE', 10000, 'syn_sne', 'user_dir_sne', NOW() - '30 days'::interval),
  ('ua_005', 'Marche de solidarité Marrakech-Safi', 'Marche régionale de soutien aux revendications nationales', 'marche', 'completed', '2026-06-22', 'Marrakech', 'Section Marrakech-Safi', 800, 'syn_sne', 'user_dir_sne', NOW() - '18 days'::interval),
  ('ua_006', 'Formation droits syndicaux', 'Session de formation sur les droits et obligations syndicaux', 'formation', 'planned', '2026-07-22', 'Casablanca', 'SNE', 50, 'syn_sne', 'user_dir_sne', NOW() - '8 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Publications ───────────────────────────────────────────────────────────
INSERT INTO publications (id, title, content, category, pinned, syndicate_id, author_id, author_name, created_at) VALUES
  ('0d0e2611-c7f2-45f3-84ba-63c0d3a43d06', 'Appel à la grève nationale du 20 Juin', 'Le bureau exécutif appelle tous les membres à participer massivement à la grève nationale du 20 juin pour la revalorisation salariale.', 'action', true, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami', NOW() - '25 days'::interval),
  ('7b291e9c-6b2b-40b1-b531-f5454c4111e1', 'Résultats de l''élection du bureau 2024', 'Félicitations aux nouveaux élus du bureau syndical pour le mandat 2024-2026.', 'election', false, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami', NOW() - '650 days'::interval),
  ('a63f141c-9cb7-4f0b-95b4-a2abfe57595c', 'Compte-rendu formation droits syndicaux', 'Retour sur la session de formation qui a réuni 45 délégués syndicaux.', 'formation', false, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami', NOW() - '10 days'::interval),
  ('481eb327-5ce0-4f2b-9c4e-0a70bdc9ef0f', 'Rapport annuel de la mobilisation syndicale 2026', 'Bilan chiffré de toutes les actions syndicales menées cette année.', 'rapport', false, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami', NOW() - '7 days'::interval),
  ('58010974-dbda-4901-8a18-88dc36df9aa8', 'Nouveau partenariat couverture médicale', 'Le SNE signe un partenariat pour une couverture médicale complémentaire pour tous les membres.', 'partenariat', false, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami', NOW() - '4 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Invoices ───────────────────────────────────────────────────────────────
INSERT INTO invoices (id, reference, type, recipient, date, due_date, status, amount, syndicate_id, created_at) VALUES
  ('inv_sne_001', 'FAC-2026-001', 'facture', 'SNE - Section Casablanca', '2026-06-01', '2026-06-30', 'paid', 24500.00, 'syn_sne', NOW() - '32 days'::interval),
  ('inv_ums_001', 'FAC-2026-002', 'facture', 'UMS - Union Marocaine du Syndicat', '2026-06-05', '2026-07-05', 'paid', 11500.00, 'syn_sne', NOW() - '28 days'::interval),
  ('inv_sie_001', 'FAC-2026-003', 'facture', 'SIE - Syndicat Indépendant', '2026-06-10', '2026-07-10', 'sent', 14000.00, 'syn_sne', NOW() - '23 days'::interval),
  ('inv_sne_002', 'FAC-2026-004', 'facture', 'SNE - Section Casablanca', '2026-06-15', '2026-07-15', 'draft', 16000.00, 'syn_sne', NOW() - '18 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Bons de livraison ────────────────────────────────────────────────────────
INSERT INTO bons_livraison (id, reference, recipient, date, type, total, status, syndicate_id, created_at) VALUES
  ('bl_001', 'BL-2026-001', 'Siège SNE Casablanca', '2026-06-02', 'entree', 1550.00, 'received', 'syn_sne', NOW() - '31 days'::interval),
  ('bl_002', 'BL-2026-002', 'Bureau exécutif SNE', '2026-06-10', 'entree', 9700.00, 'received', 'syn_sne', NOW() - '23 days'::interval),
  ('bl_003', 'BL-2026-003', 'Salle de réunion SNE', '2026-06-18', 'entree', 11000.00, 'received', 'syn_sne', NOW() - '15 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Support Tickets ──────────────────────────────────────────────────────────
INSERT INTO support_tickets (id, title, description, priority, category, status, syndicate_id, submitted_by_id, submitted_by_name, created_at) VALUES
  ('75f51f3a-4947-4f68-8232-47582aa12e6a', 'Problème d''accès au module finance', 'Impossible d''accéder au module finance depuis le compte administrateur de la section Marrakech.', 'high', 'technique', 'resolved', 'syn_sne', 'user_member_1', 'Mohammed Alaoui', NOW() - '2 days'::interval),
  ('a4d72bed-1677-4b4b-9707-b131728c4ddc', 'Question sur le calcul des cotisations', 'Demande de précision sur le barème de calcul des cotisations syndicales.', 'medium', 'question', 'resolved', 'syn_sne', 'user_member_2', 'Khadija Tahiri', NOW() - '3 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Cotisations (needed by payment_proofs) ──────────────────────────────────
INSERT INTO cotisations (id, member_id, label, period, amount, due_date, status, syndicate_id, paid_date, created_at) VALUES
  ('492ad80b-a9e3-4dea-88ac-aef78986030b', 'user_member_1', 'Cotisation Juin 2026', '2026-06', 150.00, '2026-06-15', 'paid', 'syn_sne', '2026-06-13', NOW() - '20 days'::interval),
  ('0b797240-cbfb-4c37-bd0e-d55eef44e0bf', 'user_member_2', 'Cotisation Mai 2026', '2026-05', 150.00, '2026-05-15', 'paid', 'syn_sne', '2026-05-28', NOW() - '35 days'::interval),
  ('63e94acf-47a4-493b-9584-83e7cb9f21ba', 'user_member_1', 'Cotisation Avril 2026', '2026-04', 150.00, '2026-04-15', 'paid', 'syn_sne', '2026-04-28', NOW() - '65 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Marketplace Products (needed by orders/reviews/cart_items) ─────────────
INSERT INTO products (id, name, description, price, category, stock, syndicate_id, seller_id, seller_name, status, created_at) VALUES
  ('0ca691c9-3c77-44da-8e11-39b7193eb71b', 'Manuel pédagogique 2026', 'Manuel pédagogique complet pour l''année scolaire 2026-2027', 85.00, 'livres', 40, 'syn_sne', 'user_dir_sne', 'SNE', 'available', NOW() - '60 days'::interval),
  ('435a7bcd-7b7c-42bc-8ac5-542e839d6522', 'Agenda scolaire 2026-2027', 'Agenda scolaire avec pages dédiées aux conseils de classe', 45.00, 'fournitures', 60, 'syn_sne', 'user_dir_sne', 'SNE', 'available', NOW() - '58 days'::interval),
  ('75ef3851-083b-4f6c-b3a9-5af19c71f668', 'Livre Droit du travail marocain', 'Ouvrage de référence sur le droit du travail au Maroc, édition à jour', 120.00, 'livres', 25, 'syn_sne', 'user_dir_sne', 'SNE', 'available', NOW() - '55 days'::interval),
  ('0001bd04-7269-49b5-8a9c-c82db2fa4d61', 'Stylos professionnels (x10)', 'Lot de 10 stylos professionnels de qualité', 35.00, 'fournitures', 100, 'syn_sne', 'user_dir_sne', 'SNE', 'available', NOW() - '40 days'::interval),
  ('35ad45ef-d657-4261-b691-3f385fa6df55', 'Tableau blanc magnétique 60x90', 'Tableau blanc magnétique idéal pour salle de classe ou bureau', 280.00, 'materiel', 15, 'syn_sne', 'user_dir_sne', 'SNE', 'available', NOW() - '20 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- Buildings, lots and members for "Mon Appartement" (co-ownership) feature
INSERT INTO members (id, name, email, phone, profession, syndicate_id, status, cotisation_status, join_date)
VALUES
  ('member_mohammed', 'Mohammed Alaoui', 'mohammed.alaoui@sne.ma', '0661000001', 'Enseignant', 'syn_sne', 'active', 'pending', '2023-09-01'),
  ('member_khadija', 'Khadija Tahiri', 'khadija.tahiri@sne.ma', '0661000002', 'Enseignante', 'syn_sne', 'active', 'pending', '2023-09-01')
ON CONFLICT (email) DO NOTHING;

INSERT INTO buildings (id, name, address, city, type, total_floors, total_lots, construction_year, syndicate_id, status)
VALUES
  ('bldg_andalous', 'Résidence Al Andalous', '12 Rue Ibn Sina, Agdal', 'Rabat', 'residential', 6, 24, 2015, 'syn_sne', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO lots (id, number, type, floor, surface_m2, tantiemes, building_id, owner_id, status, description)
VALUES
  ('lot_mohammed', 'A-304', 'appartement', 3, 85, 42, 'bldg_andalous', 'member_mohammed', 'occupied', 'Appartement 3 pièces avec balcon'),
  ('lot_khadija', 'B-112', 'appartement', 1, 68, 34, 'bldg_andalous', 'member_khadija', 'occupied', 'Appartement 2 pièces rez-jardin')
ON CONFLICT (id) DO NOTHING;
