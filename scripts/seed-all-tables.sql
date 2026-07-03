-- ─── Action Supports & Participants ──────────────────────────────────────────
INSERT INTO action_supports (id, action_id, user_id) VALUES
  ('as_001', 'ua_001', 'user_member_1'),
  ('as_002', 'ua_001', 'user_member_2'),
  ('as_003', 'ua_001', 'user_dir_sne'),
  ('as_004', 'ua_003', 'user_member_1'),
  ('as_005', 'ua_003', 'user_member_2'),
  ('as_006', 'ua_005', 'user_member_1'),
  ('as_007', 'ua_006', 'user_dir_sne')
ON CONFLICT DO NOTHING;

INSERT INTO action_participants (id, action_id, user_id, user_name) VALUES
  ('ap_001', 'ua_001', 'user_member_1', 'Mohammed Alaoui'),
  ('ap_002', 'ua_001', 'user_member_2', 'Khadija Tahiri'),
  ('ap_003', 'ua_002', 'user_member_1', 'Mohammed Alaoui'),
  ('ap_004', 'ua_005', 'user_member_2', 'Khadija Tahiri'),
  ('ap_005', 'ua_005', 'user_dir_sne', 'Fatima Zahra El Alami')
ON CONFLICT DO NOTHING;

-- ─── Announcements ────────────────────────────────────────────────────────────
INSERT INTO announcements (id, title, body, priority, audience, pinned, syndicate_id, author_id, author, created_at) VALUES
  ('ann_001', 'Succès de la grève du 20 Juin — Communiqué officiel',
   'Chers collègues, la grève du 20 juin a été un succès historique avec un taux de participation de 78%. Nous remercions tous les membres pour leur mobilisation exemplaire. Les négociations avec le Ministère reprendront le 10 juillet.',
   'urgent', 'all', true, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami',
   NOW() - '10 days'::interval),
  ('ann_002', 'Renouvellement des cartes adhérents 2026-2027',
   'La campagne de renouvellement des cartes adhérent pour l''année syndicale 2026-2027 est officiellement ouverte. Tous les membres doivent renouveler leur adhésion avant le 31 août 2026. Modalités : virement bancaire ou en personne au bureau syndical.',
   'high', 'member', false, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami',
   NOW() - '7 days'::interval),
  ('ann_003', 'Formation droits syndicaux — Inscriptions ouvertes',
   'Une nouvelle session de formation est programmée pour le 22 juillet 2026 à Casablanca. Places limitées à 50 participants. Inscription obligatoire avant le 10 juillet via le bureau syndical.',
   'normal', 'all', false, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami',
   NOW() - '5 days'::interval),
  ('ann_004', 'Convention collective en cours de négociation',
   'Suite aux réunions avec le Ministère, les négociations sur la convention collective avancent positivement. Un rapport détaillé sera présenté lors de l''AG du 15 juillet. Restez mobilisés !',
   'high', 'all', true, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami',
   NOW() - '3 days'::interval),
  ('ann_005', 'Partenariat médical : Réductions pour les membres SNE',
   'Tous les membres SNE bénéficient de 20% de réduction sur les consultations spécialisées à la Clinique Internationale de Casablanca. Présentez votre carte d''adhérent à l''accueil.',
   'normal', 'member', false, 'syn_sne', 'user_dir_sne', 'Fatima Zahra El Alami',
   NOW() - '1 day'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Messages ─────────────────────────────────────────────────────────────────
INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, created_at) VALUES
  ('msg_001', 'conv_general', 'user_dir_sne', 'Fatima Zahra El Alami',
   'Bonjour à tous ! Je vous rappelle que la réunion de bureau est prévue ce jeudi à 14h. Votre présence est indispensable.',
   NOW() - '3 days'::interval),
  ('msg_002', 'conv_general', 'user_member_1', 'Mohammed Alaoui',
   'Confirmé pour jeudi. Est-ce que l''ordre du jour sera envoyé à l''avance ?',
   NOW() - '3 days'::interval + '30 minutes'::interval),
  ('msg_003', 'conv_general', 'user_dir_sne', 'Fatima Zahra El Alami',
   'Oui Mohammed, l''ordre du jour sera partagé demain matin. Points principaux : bilan grève du 20 juin et préparation des négociations de juillet.',
   NOW() - '3 days'::interval + '45 minutes'::interval),
  ('msg_004', 'conv_general', 'user_member_2', 'Khadija Tahiri',
   'Je préparerai les statistiques de participation à la grève pour jeudi.',
   NOW() - '2 days'::interval),
  ('msg_005', 'conv_general', 'user_member_1', 'Mohammed Alaoui',
   'Excellente idée Khadija. J''apporterai aussi les retours des collègues de la région Marrakech-Safi.',
   NOW() - '2 days'::interval + '20 minutes'::interval),
  ('msg_006', 'conv_general', 'user_dir_sne', 'Fatima Zahra El Alami',
   'RAPPEL : La pétition pour le statut de l''enseignant a atteint 7 842 signatures. Continuez à mobiliser vos contacts ! Objectif : 10 000 avant le 15 juillet.',
   NOW() - '1 day'::interval),
  ('msg_007', 'conv_general', 'user_member_2', 'Khadija Tahiri',
   'Super ! Un beau chiffre. Je partage sur mes réseaux ce soir.',
   NOW() - '1 day'::interval + '1 hour'::interval),
  ('msg_008', 'conv_1', 'user_dir_sne', 'Fatima Zahra El Alami',
   'Mohammed, pouvez-vous me préparer un rapport sur les cotisations en retard avant vendredi ?',
   NOW() - '5 days'::interval),
  ('msg_009', 'conv_1', 'user_member_1', 'Mohammed Alaoui',
   'Bien sûr Directrice. Je vous envoie ça jeudi matin au plus tard.',
   NOW() - '5 days'::interval + '2 hours'::interval),
  ('msg_010', 'conv_1', 'user_member_1', 'Mohammed Alaoui',
   'Rapport envoyé par email. En résumé : 3 membres en retard de plus de 3 mois, 8 membres relancés ce mois-ci.',
   NOW() - '2 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Orders ───────────────────────────────────────────────────────────────────
INSERT INTO orders (id, product_id, product_name, buyer_id, buyer_name, seller_id, seller_name, amount, status, type, date, created_at) VALUES
  ('ord_001', '0ca691c9-3c77-44da-8e11-39b7193eb71b', 'Manuel pédagogique 2026',
   'user_member_1', 'Mohammed Alaoui', 'user_dir_sne', 'SNE',
   85.00, 'delivered', 'physical', '2026-06-05', NOW() - '25 days'::interval),
  ('ord_002', '435a7bcd-7b7c-42bc-8ac5-542e839d6522', 'Agenda scolaire 2026-2027',
   'user_member_2', 'Khadija Tahiri', 'user_dir_sne', 'SNE',
   45.00, 'delivered', 'physical', '2026-06-08', NOW() - '22 days'::interval),
  ('ord_003', '75ef3851-083b-4f6c-b3a9-5af19c71f668', 'Livre Droit du travail marocain',
   'user_member_1', 'Mohammed Alaoui', 'user_dir_sne', 'SNE',
   120.00, 'delivered', 'physical', '2026-06-10', NOW() - '20 days'::interval),
  ('ord_004', '0001bd04-7269-49b5-8a9c-c82db2fa4d61', 'Stylos professionnels (x10)',
   'user_member_2', 'Khadija Tahiri', 'user_dir_sne', 'SNE',
   35.00, 'pending', 'physical', '2026-06-20', NOW() - '10 days'::interval),
  ('ord_005', '35ad45ef-d657-4261-b691-3f385fa6df55', 'Tableau blanc magnétique 60x90',
   'user_member_1', 'Mohammed Alaoui', 'user_dir_sne', 'SNE',
   280.00, 'pending', 'physical', '2026-06-22', NOW() - '8 days'::interval),
  ('ord_006', '0ca691c9-3c77-44da-8e11-39b7193eb71b', 'Manuel pédagogique 2026',
   'user_member_2', 'Khadija Tahiri', 'user_dir_sne', 'SNE',
   85.00, 'shipped', 'physical', '2026-06-25', NOW() - '5 days'::interval),
  ('ord_007', '75ef3851-083b-4f6c-b3a9-5af19c71f668', 'Livre Droit du travail marocain',
   'user_admin', 'Administrateur Syndycat', 'user_dir_sne', 'SNE',
   120.00, 'delivered', 'physical', '2026-05-30', NOW() - '30 days'::interval),
  ('ord_008', '435a7bcd-7b7c-42bc-8ac5-542e839d6522', 'Agenda scolaire 2026-2027',
   'user_member_1', 'Mohammed Alaoui', 'user_dir_sne', 'SNE',
   45.00, 'cancelled', 'physical', '2026-06-15', NOW() - '15 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Reviews ──────────────────────────────────────────────────────────────────
INSERT INTO reviews (id, product_id, product_name, order_id, rating, comment, reviewer_id, reviewer_name, date, created_at) VALUES
  ('rev_001', '0ca691c9-3c77-44da-8e11-39b7193eb71b', 'Manuel pédagogique 2026', 'ord_001',
   5, 'Excellent manuel, très complet et bien structuré. Les exercices pratiques sont très utiles pour les nouveaux enseignants. Je le recommande vivement.',
   'user_member_1', 'Mohammed Alaoui', '2026-06-12', NOW() - '18 days'::interval),
  ('rev_002', '435a7bcd-7b7c-42bc-8ac5-542e839d6522', 'Agenda scolaire 2026-2027', 'ord_002',
   4, 'Bel agenda avec une mise en page claire. Les pages dédiées aux conseils de classe sont très pratiques. Suggestion : ajouter les jours fériés marocains.',
   'user_member_2', 'Khadija Tahiri', '2026-06-15', NOW() - '15 days'::interval),
  ('rev_003', '75ef3851-083b-4f6c-b3a9-5af19c71f668', 'Livre Droit du travail marocain', 'ord_003',
   5, 'Ouvrage de référence indispensable. La mise à jour avec les derniers textes législatifs est appréciable. Le chapitre sur les droits syndicaux est excellent.',
   'user_member_1', 'Mohammed Alaoui', '2026-06-18', NOW() - '12 days'::interval),
  ('rev_004', '75ef3851-083b-4f6c-b3a9-5af19c71f668', 'Livre Droit du travail marocain', 'ord_007',
   5, 'Très bon ouvrage. Complet et accessible. Idéal pour les représentants syndicaux.',
   'user_admin', 'Administrateur Syndycat', '2026-06-05', NOW() - '25 days'::interval),
  ('rev_005', '0ca691c9-3c77-44da-8e11-39b7193eb71b', 'Manuel pédagogique 2026', 'ord_006',
   4, 'Bon manuel, conforme à la description. Livraison rapide. Certaines sections mériteraient plus d''exemples pratiques.',
   'user_member_2', 'Khadija Tahiri', '2026-06-28', NOW() - '2 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Ticket Replies ───────────────────────────────────────────────────────────
INSERT INTO ticket_replies (id, ticket_id, author_id, author_name, text, created_at) VALUES
  ('tr_001', '75f51f3a-4947-4f68-8232-47582aa12e6a', 'user_dir_sne', 'Fatima Zahra El Alami',
   'Bonjour, nous avons pris en compte votre signalement. L''équipe technique est en train d''investiguer le problème d''accès au module finance. Nous vous tiendrons informé dans les 24h.',
   NOW() - '2 days'::interval),
  ('tr_002', '75f51f3a-4947-4f68-8232-47582aa12e6a', 'user_member_1', 'Mohammed Alaoui',
   'Merci pour votre retour. Pour info, le problème se produit uniquement avec le compte administrateur de la section Marrakech. Les autres comptes fonctionnent normalement.',
   NOW() - '1 day'::interval - '12 hours'::interval),
  ('tr_003', '75f51f3a-4947-4f68-8232-47582aa12e6a', 'user_dir_sne', 'Fatima Zahra El Alami',
   'Problème identifié et corrigé. Il s''agissait d''un problème de droits d''accès suite à la mise à jour. Le module finance est maintenant accessible.',
   NOW() - '8 hours'::interval),
  ('tr_004', 'a4d72bed-1677-4b4b-9707-b131728c4ddc', 'user_dir_sne', 'Fatima Zahra El Alami',
   'Le calcul des cotisations est basé sur : 0.5% du salaire brut mensuel, minimum 50 MAD, maximum 200 MAD. Les retraités bénéficient d''un tarif réduit à 30 MAD/mois.',
   NOW() - '3 days'::interval),
  ('tr_005', 'a4d72bed-1677-4b4b-9707-b131728c4ddc', 'user_member_2', 'Khadija Tahiri',
   'Merci pour ces précisions. Est-ce que ce barème sera revu lors des prochaines négociations ?',
   NOW() - '2 days'::interval - '6 hours'::interval),
  ('tr_006', 'a4d72bed-1677-4b4b-9707-b131728c4ddc', 'user_dir_sne', 'Fatima Zahra El Alami',
   'Le barème sera bien à l''ordre du jour de l''AG du 15 juillet. Vos suggestions seront les bienvenues.',
   NOW() - '2 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Invoice Items ────────────────────────────────────────────────────────────
INSERT INTO invoice_items (id, invoice_id, label, quantity, unit_price) VALUES
  ('ii_001', 'inv_sne_001', 'Formation droits syndicaux — Juin 2026', 1, 15000.00),
  ('ii_002', 'inv_sne_001', 'Location salle de conférence', 1, 3500.00),
  ('ii_003', 'inv_sne_001', 'Matériel pédagogique et documentation', 50, 120.00),
  ('ii_004', 'inv_ums_001', 'Consultation juridique — Dossier grève', 3, 2500.00),
  ('ii_005', 'inv_ums_001', 'Frais de déplacement délégués', 5, 800.00),
  ('ii_006', 'inv_sie_001', 'Impression et reliure documents syndicaux', 500, 12.00),
  ('ii_007', 'inv_sie_001', 'Organisation assemblée générale', 1, 8000.00),
  ('ii_008', 'inv_sne_002', 'Abonnement logiciel gestion syndicale — Annuel', 1, 12000.00),
  ('ii_009', 'inv_sne_002', 'Formation administrateurs système', 2, 2000.00)
ON CONFLICT (id) DO NOTHING;

-- ─── Bon Items ────────────────────────────────────────────────────────────────
INSERT INTO bon_items (id, bon_id, label, quantity, unit_price) VALUES
  ('bi_001', 'bl_001', 'Stylos et fournitures de bureau', 10, 25.00),
  ('bi_002', 'bl_001', 'Rames de papier A4 (500 feuilles)', 20, 45.00),
  ('bi_003', 'bl_001', 'Classeurs et pochettes', 30, 15.00),
  ('bi_004', 'bl_002', 'Ordinateur portable Dell Latitude', 1, 8500.00),
  ('bi_005', 'bl_002', 'Imprimante Canon PIXMA', 1, 1200.00),
  ('bi_006', 'bl_003', 'Tables de réunion (6 personnes)', 2, 2800.00),
  ('bi_007', 'bl_003', 'Chaises ergonomiques de bureau', 12, 450.00)
ON CONFLICT (id) DO NOTHING;

-- ─── Meeting Attendees ────────────────────────────────────────────────────────
INSERT INTO meeting_attendees (id, meeting_id, user_id) VALUES
  ('ma_001', 'mtg_1', 'user_dir_sne'),
  ('ma_002', 'mtg_1', 'user_member_1'),
  ('ma_003', 'mtg_1', 'user_member_2'),
  ('ma_004', 'mtg_2', 'user_dir_sne'),
  ('ma_005', 'mtg_2', 'user_member_1'),
  ('ma_006', 'mtg_2', 'user_member_2'),
  ('ma_007', 'mtg_2', 'user_admin'),
  ('ma_008', 'mtg_3', 'user_dir_sne'),
  ('ma_009', 'mtg_3', 'user_member_2'),
  ('ma_010', 'mtg_4', 'user_dir_sne'),
  ('ma_011', 'mtg_4', 'user_member_1')
ON CONFLICT DO NOTHING;

-- ─── Publication Comments ─────────────────────────────────────────────────────
INSERT INTO publication_comments (id, publication_id, author_id, author_name, text, created_at) VALUES
  ('pc_001', '0d0e2611-c7f2-45f3-84ba-63c0d3a43d06', 'user_member_1', 'Mohammed Alaoui',
   'Pleinement solidaire de cette action ! Les enseignants méritent une revalorisation salariale depuis des années. Ensemble nous sommes plus forts !',
   NOW() - '12 days'::interval),
  ('pc_002', '0d0e2611-c7f2-45f3-84ba-63c0d3a43d06', 'user_member_2', 'Khadija Tahiri',
   'Je soutiens totalement cet appel à la grève. Les conditions de travail se dégradent et le gouvernement doit prendre ses responsabilités.',
   NOW() - '12 days'::interval + '2 hours'::interval),
  ('pc_003', '7b291e9c-6b2b-40b1-b531-f5454c4111e1', 'user_member_1', 'Mohammed Alaoui',
   'Bravo à tous les élus ! Un bureau représentatif et compétent pour défendre nos droits. Bon mandat à chacun.',
   NOW() - '20 days'::interval),
  ('pc_004', 'a63f141c-9cb7-4f0b-95b4-a2abfe57595c', 'user_member_2', 'Khadija Tahiri',
   'Formation très enrichissante ! J''ai appris beaucoup sur mes droits en tant que représentante syndicale. Je recommande vivement à tous les délégués.',
   NOW() - '8 days'::interval),
  ('pc_005', '481eb327-5ce0-4f2b-9c4e-0a70bdc9ef0f', 'user_member_1', 'Mohammed Alaoui',
   'Excellent rapport. Les chiffres sur la mobilisation syndicale sont encourageants. Continuons sur cette lancée en 2026 !',
   NOW() - '5 days'::interval),
  ('pc_006', '58010974-dbda-4901-8a18-88dc36df9aa8', 'user_member_2', 'Khadija Tahiri',
   'Super initiative ! La couverture médicale complémentaire était vraiment un besoin exprimé par beaucoup de membres. Merci à la direction syndicale.',
   NOW() - '3 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Publication Likes ────────────────────────────────────────────────────────
INSERT INTO publication_likes (publication_id, user_id) VALUES
  ('0d0e2611-c7f2-45f3-84ba-63c0d3a43d06', 'user_member_1'),
  ('0d0e2611-c7f2-45f3-84ba-63c0d3a43d06', 'user_member_2'),
  ('0d0e2611-c7f2-45f3-84ba-63c0d3a43d06', 'user_dir_sne'),
  ('7b291e9c-6b2b-40b1-b531-f5454c4111e1', 'user_member_1'),
  ('7b291e9c-6b2b-40b1-b531-f5454c4111e1', 'user_member_2'),
  ('a63f141c-9cb7-4f0b-95b4-a2abfe57595c', 'user_member_2'),
  ('481eb327-5ce0-4f2b-9c4e-0a70bdc9ef0f', 'user_member_1'),
  ('481eb327-5ce0-4f2b-9c4e-0a70bdc9ef0f', 'user_dir_sne'),
  ('58010974-dbda-4901-8a18-88dc36df9aa8', 'user_member_1'),
  ('58010974-dbda-4901-8a18-88dc36df9aa8', 'user_member_2')
ON CONFLICT DO NOTHING;

-- ─── Votes ────────────────────────────────────────────────────────────────────
INSERT INTO votes (id, election_id, voter_id, candidate_id) VALUES
  ('vote_001', 'elec_bureau_2026', 'user_member_1', '0b95852b-a3e2-4795-a9e7-a8b26f14f3ae'),
  ('vote_002', 'elec_bureau_2026', 'user_member_2', 'f9ceb3b5-1595-4645-9069-156b1bea33a1'),
  ('vote_003', 'elec_bureau_2024', 'user_member_1', '50a1f11a-b63a-4548-9352-946c9bcf45fd'),
  ('vote_004', 'elec_bureau_2024', 'user_member_2', '64c8f564-0dbd-49c6-8cf3-21167c37331e')
ON CONFLICT DO NOTHING;

-- ─── Payment Proofs ───────────────────────────────────────────────────────────
INSERT INTO payment_proofs (id, cotisation_id, user_id, file_url, amount, notes, status, created_at) VALUES
  ('pp_001', '492ad80b-a9e3-4dea-88ac-aef78986030b', 'user_member_1',
   'https://example.com/proofs/virement_juin_2026.pdf', 150.00,
   'Virement bancaire CIH — Réf: VIR2026001', 'approved',
   NOW() - '20 days'::interval),
  ('pp_002', '0b797240-cbfb-4c37-bd0e-d55eef44e0bf', 'user_member_2',
   'https://example.com/proofs/cheque_mai_2026.jpg', 150.00,
   'Chèque CIH N°12345 — Khadija Tahiri', 'approved',
   NOW() - '35 days'::interval),
  ('pp_003', '63e94acf-47a4-493b-9584-83e7cb9f21ba', 'user_member_1',
   'https://example.com/proofs/especes_avril_2026.pdf', 150.00,
   'Paiement en espèces — Reçu N°2026-042', 'approved',
   NOW() - '65 days'::interval)
ON CONFLICT (id) DO NOTHING;

-- ─── Cart Items ───────────────────────────────────────────────────────────────
INSERT INTO cart_items (id, user_id, product_id, product_name, price, seller_name, quantity) VALUES
  ('ci_001', 'user_member_2', '35ad45ef-d657-4261-b691-3f385fa6df55',
   'Tableau blanc magnétique 60x90', 280.00, 'SNE', 1),
  ('ci_002', 'user_member_2', '0001bd04-7269-49b5-8a9c-c82db2fa4d61',
   'Stylos professionnels (x10)', 35.00, 'SNE', 2)
ON CONFLICT DO NOTHING;

-- ─── Update publication like/comment counts ───────────────────────────────────
UPDATE publications SET
  likes = (SELECT COUNT(*) FROM publication_likes WHERE publication_id = publications.id),
  comments = (SELECT COUNT(*) FROM publication_comments WHERE publication_id = publications.id);

-- ─── Update conversations last_message ───────────────────────────────────────
UPDATE conversations SET
  last_message = (
    SELECT text FROM messages
    WHERE conversation_id = conversations.id
    ORDER BY created_at DESC LIMIT 1
  ),
  last_message_at = (
    SELECT created_at FROM messages
    WHERE conversation_id = conversations.id
    ORDER BY created_at DESC LIMIT 1
  );
