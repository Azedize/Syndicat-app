CREATE TABLE "actes_administratifs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text,
	"created_by_id" text,
	"type" text DEFAULT 'decision' NOT NULL,
	"statut" text DEFAULT 'brouillon' NOT NULL,
	"numero" text NOT NULL,
	"titre" text NOT NULL,
	"objet" text NOT NULL,
	"date" text NOT NULL,
	"date_echeance" text,
	"auteur" text NOT NULL,
	"signataires" text[] DEFAULT '{}',
	"destinataires" text[] DEFAULT '{}',
	"resume_contenu" text,
	"important" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "action_participants" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"action_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "action_supports" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"action_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ag_proxies" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"meeting_id" text NOT NULL,
	"syndicate_id" text NOT NULL,
	"grantor_id" text,
	"grantor_name" text NOT NULL,
	"grantee_id" text,
	"grantee_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"document_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ag_resolutions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"meeting_id" text NOT NULL,
	"building_id" text,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"required_majority" text DEFAULT 'simple',
	"tantiemes_for" integer DEFAULT 0,
	"tantiemes_against" integer DEFAULT 0,
	"tantiemes_abstain" integer DEFAULT 0,
	"result" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alert_reads" (
	"alert_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp DEFAULT now(),
	CONSTRAINT "alert_reads_alert_id_user_id_pk" PRIMARY KEY("alert_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info',
	"date" text,
	"target" text DEFAULT 'all',
	"syndicate_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"priority" text DEFAULT 'info',
	"audience" text DEFAULT 'Tous les membres',
	"pinned" boolean DEFAULT false,
	"syndicate_id" text,
	"author_id" text,
	"author" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "appels_de_fonds" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"building_id" text NOT NULL,
	"budget_id" text,
	"lot_id" text NOT NULL,
	"owner_id" text,
	"period" text NOT NULL,
	"type" text DEFAULT 'charges_courantes',
	"amount" numeric(12, 2) NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'pending',
	"payment_method" text,
	"proof_url" text,
	"notes" text,
	"paid_date" text,
	"receipt_number" text,
	"rejection_reason" text,
	"validated_by" text,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text,
	"user_name" text,
	"actor_role" text,
	"syndicate_id" text,
	"is_supervision" boolean DEFAULT false NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"subscription_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'open',
	"due_date" timestamp,
	"paid_at" timestamp,
	"description" text,
	"period_start" timestamp,
	"period_end" timestamp,
	"payment_id" text,
	"invoice_number" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "blocked_users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bon_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"bon_id" text NOT NULL,
	"label" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bons_livraison" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"reference" text NOT NULL,
	"recipient" text NOT NULL,
	"date" text NOT NULL,
	"type" text DEFAULT 'sortie',
	"total" numeric(12, 2) DEFAULT '0',
	"status" text DEFAULT 'draft',
	"syndicate_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"budget_id" text NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"amount_annual" numeric(12, 2) DEFAULT '0',
	"amount_q1" numeric(12, 2),
	"amount_q2" numeric(12, 2),
	"amount_q3" numeric(12, 2),
	"amount_q4" numeric(12, 2),
	"prestataire_id" text
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"year" integer NOT NULL,
	"building_id" text NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0',
	"charges_amount" numeric(12, 2) DEFAULT '0',
	"fonds_reserve" numeric(12, 2) DEFAULT '0',
	"status" text DEFAULT 'draft',
	"notes" text,
	"created_by" text,
	"voted_at" timestamp,
	"meeting_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text DEFAULT 'Casablanca',
	"type" text DEFAULT 'residential',
	"total_floors" integer DEFAULT 0,
	"total_lots" integer DEFAULT 0,
	"construction_year" integer,
	"syndicate_id" text,
	"admin_id" text,
	"bank_account" text,
	"registration_number" text,
	"description" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "caisse_entries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"type" text NOT NULL,
	"date" text NOT NULL,
	"category" text DEFAULT '',
	"syndicate_id" text,
	"balance" numeric(12, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"election_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"post" text NOT NULL,
	"apartment_number" text,
	"building_id" text,
	"photo" text,
	"bio" text DEFAULT '',
	"motivation_letter" text DEFAULT '',
	"program" text DEFAULT '',
	"status" text DEFAULT 'approved',
	"rejection_reason" text,
	"withdrawn_at" timestamp,
	"votes" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text,
	"price" numeric(12, 2),
	"seller_name" text,
	"quantity" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "charge_attachments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"appel_de_fonds_id" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_reports" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"reporter_id" text NOT NULL,
	"reported_user_id" text,
	"conversation_id" text,
	"message_id" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conseil_syndical" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"user_id" text,
	"member_id" text,
	"role" text DEFAULT 'member' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"mandate_start" text,
	"mandate_end" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"election_id" text,
	"candidate_id" text,
	"resigned_at" timestamp,
	"resign_reason" text,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contrats_prestataires" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"prestataire_id" text NOT NULL,
	"building_id" text NOT NULL,
	"title" text NOT NULL,
	"start_date" text,
	"end_date" text,
	"monthly_amount" numeric(12, 2),
	"annual_amount" numeric(12, 2),
	"status" text DEFAULT 'active',
	"auto_renew" boolean DEFAULT false,
	"document_url" text,
	"notified_thresholds" text DEFAULT '[]',
	"renewed_from_contract_id" text,
	"terminated_at" timestamp,
	"termination_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_archives" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text,
	"building_id" text,
	"conv_type" text DEFAULT 'direct' NOT NULL,
	"participant1_id" text,
	"participant2_id" text,
	"participant_ids" text,
	"is_group" boolean DEFAULT false,
	"name" text,
	"last_message" text,
	"last_message_at" timestamp,
	"created_by" text,
	"product_id" text,
	"incident_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cotisations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"member_id" text NOT NULL,
	"label" text NOT NULL,
	"period" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'pending',
	"syndicate_id" text,
	"paid_date" text,
	"receipt" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "debt_escalations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text,
	"member_id" text,
	"member_name" text,
	"lot_id" text,
	"resident_type" text DEFAULT 'member',
	"total_overdue" numeric(12, 2) NOT NULL,
	"overdue_months" integer NOT NULL,
	"escalation_level" text NOT NULL,
	"level" text NOT NULL,
	"status" text DEFAULT 'open',
	"letter_url" text,
	"overridden_by" text,
	"override_reason" text,
	"overridden_at" timestamp,
	"alert_sent_at" timestamp,
	"meeting_id" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_comments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"document_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"parent_id" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"prefix" text NOT NULL,
	"year" integer NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_signatures" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"document_id" text NOT NULL,
	"signed_by" text NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"signer_role" text NOT NULL,
	"syndicate_id" text,
	"ip_address" text,
	"signature_data" text,
	"signature_order" integer DEFAULT 1 NOT NULL,
	"signer_name" text,
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"document_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"status" text,
	"file_url" text,
	"language" text,
	"modified_by" text,
	"modified_at" timestamp DEFAULT now() NOT NULL,
	"change_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"content" text,
	"status" text DEFAULT 'draft',
	"syndicate_id" text,
	"size" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"file_url" text,
	"document_number" text,
	"template_id" text,
	"version" integer DEFAULT 1,
	"signed_at" timestamp,
	"signed_by" text,
	"published_at" timestamp,
	"archived_at" timestamp,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" text,
	"retention_until" timestamp,
	"auto_archived" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'fr' NOT NULL,
	"rejected_at" timestamp,
	"rejected_by" text,
	"rejection_reason" text,
	"approved_at" timestamp,
	"approved_by" text,
	"expires_at" timestamp,
	"expiry_notified_bucket" integer,
	"verification_token" text,
	"superseded_by_document_id" text,
	"generation_params" jsonb,
	"appended_signature_pages" integer DEFAULT 0 NOT NULL,
	"regeneration_failed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_proxies" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"election_id" text NOT NULL,
	"syndicate_id" text,
	"grantor_id" text NOT NULL,
	"grantor_name" text NOT NULL,
	"grantee_id" text NOT NULL,
	"grantee_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"document_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "election_questions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"election_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"asked_by" text NOT NULL,
	"asked_by_name" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"answered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '',
	"election_type" text DEFAULT 'special',
	"building_id" text,
	"voting_method" text DEFAULT 'simple_majority',
	"quorum_percent" integer DEFAULT 50,
	"majority_percent" integer DEFAULT 50,
	"seats_count" integer DEFAULT 1,
	"tenants_can_vote" boolean DEFAULT false,
	"status" text DEFAULT 'draft',
	"start_date" text,
	"end_date" text,
	"candidacy_start" text,
	"candidacy_end" text,
	"eligible_count" integer,
	"participant_count" integer DEFAULT 0,
	"quorum_reached" boolean,
	"results_published_at" timestamp,
	"cancel_reason" text,
	"contest_reason" text,
	"is_emergency" boolean DEFAULT false,
	"created_by" text,
	"mandate_duration_months" integer,
	"invalid_votes_count" integer DEFAULT 0,
	"reminders_sent" text DEFAULT '[]',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"template" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"syndicate_id" text,
	"body_html" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_justifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text,
	"transaction_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"category" text,
	"receipt_url" text,
	"status" text DEFAULT 'pending',
	"submitted_by" text,
	"submitter_name" text,
	"challenged_by" text,
	"challenger_name" text,
	"challenge_reason" text,
	"vote_count" integer DEFAULT 0,
	"votes_for" integer DEFAULT 0,
	"votes_against" integer DEFAULT 0,
	"resolved_at" timestamp,
	"resolution_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_votes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"justification_id" text NOT NULL,
	"user_id" text NOT NULL,
	"vote" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fiches_juridiques" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"theme" text NOT NULL,
	"titre" text NOT NULL,
	"resume" text NOT NULL,
	"contenu" text NOT NULL,
	"articles" text DEFAULT '[]',
	"jurisprudence" text DEFAULT '[]',
	"conseils" text DEFAULT '[]',
	"important" boolean DEFAULT false,
	"updated" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fonds_travaux" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"building_id" text,
	"year" integer NOT NULL,
	"budget_base" numeric(12, 2) NOT NULL,
	"rate_percent" numeric(12, 2) DEFAULT '5' NOT NULL,
	"target_amount" numeric(12, 2) NOT NULL,
	"current_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"approved_by_resolution_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "governance_delegations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"delegant_id" text,
	"delegant_name" text NOT NULL,
	"delegataire_id" text,
	"delegataire_name" text NOT NULL,
	"domaine" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "idea_votes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"idea_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text,
	"user_id" text,
	"user_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general',
	"status" text DEFAULT 'submitted',
	"vote_count" integer DEFAULT 0,
	"vote_deadline" text,
	"implemented_at" timestamp,
	"admin_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_attachments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"invoice_id" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"invoice_id" text NOT NULL,
	"label" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"reference" text NOT NULL,
	"type" text DEFAULT 'facture',
	"recipient" text NOT NULL,
	"date" text NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'draft',
	"amount" numeric(12, 2) DEFAULT '0',
	"syndicate_id" text,
	"proof_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "legal_alerts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"level" text NOT NULL,
	"category" text NOT NULL,
	"date" text,
	"action" text,
	"status" text DEFAULT 'open',
	"syndicate_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"number" text NOT NULL,
	"type" text DEFAULT 'appartement',
	"floor" integer DEFAULT 0,
	"surface_m2" numeric(12, 2),
	"titre_foncier" text,
	"surface_cadastrale" numeric(12, 2),
	"tantiemes" integer DEFAULT 0,
	"building_id" text NOT NULL,
	"owner_id" text,
	"tenant_id" text,
	"status" text DEFAULT 'occupied',
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketplace_promotions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"product_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"type" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'pending_payment',
	"payment_method" text,
	"proof_url" text,
	"rejection_reason" text,
	"approved_by" text,
	"validated_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meeting_attendees" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"meeting_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"time" text,
	"location" text,
	"type" text DEFAULT 'general',
	"description" text,
	"agenda" text,
	"status" text DEFAULT 'scheduled',
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '',
	"profession" text DEFAULT '',
	"syndicate_id" text,
	"status" text DEFAULT 'active',
	"cotisation_status" text DEFAULT 'pending',
	"join_date" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_reads" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp DEFAULT now(),
	"last_delivered_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text,
	"text" text DEFAULT '' NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"attachment_url" text,
	"attachment_type" text,
	"attachment_name" text,
	"attachment_size" integer,
	"duration_seconds" integer,
	"deleted_at" timestamp,
	"edited_at" timestamp,
	"is_deleted_for_everyone" boolean DEFAULT false,
	"deleted_for_user_ids" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "national_rankings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"collection_rate" numeric(12, 2) DEFAULT '0',
	"incident_resolution_rate" numeric(12, 2) DEFAULT '0',
	"documentation_score" numeric(12, 2) DEFAULT '0',
	"meeting_compliance_score" numeric(12, 2) DEFAULT '0',
	"member_satisfaction" numeric(12, 2) DEFAULT '0',
	"total_score" numeric(12, 2) DEFAULT '0',
	"rank" integer DEFAULT 0,
	"region_rank" integer DEFAULT 0,
	"region" text DEFAULT '',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"push" boolean DEFAULT true,
	"email" boolean DEFAULT true,
	"in_app" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"product_id" text,
	"product_name" text,
	"buyer_id" text,
	"buyer_name" text,
	"seller_id" text,
	"seller_name" text,
	"amount" numeric(12, 2),
	"status" text DEFAULT 'pending',
	"type" text DEFAULT 'purchase',
	"date" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "otp_tokens" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" text DEFAULT 'email_verification',
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"attempts" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_spots" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"building_id" text NOT NULL,
	"lot_id" text,
	"spot_number" text NOT NULL,
	"type" text DEFAULT 'resident' NOT NULL,
	"floor" text,
	"status" text DEFAULT 'available' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parking_violations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"spot_id" text,
	"building_id" text NOT NULL,
	"plate_number" text NOT NULL,
	"reported_by_id" text NOT NULL,
	"reported_by_name" text NOT NULL,
	"photo_url" text,
	"notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by_id" text,
	"resolved_at" timestamp,
	"reported_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"sector" text,
	"contact" text,
	"phone" text,
	"email" text,
	"benefit" text,
	"discount" text,
	"start_date" text,
	"end_date" text,
	"description" text DEFAULT '',
	"syndicate_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"cotisation_id" text NOT NULL,
	"user_id" text,
	"file_url" text,
	"proof_url" text,
	"amount" numeric(12, 2),
	"notes" text,
	"status" text DEFAULT 'pending',
	"uploaded_by_id" text,
	"reviewed_by_id" text,
	"review_note" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text,
	"month" text,
	"amount" numeric(12, 2),
	"file_url" text,
	"syndicate_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prestataire_evaluations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"prestataire_id" text NOT NULL,
	"travaux_id" text,
	"syndicate_id" text,
	"quality" integer NOT NULL,
	"speed" integer NOT NULL,
	"communication" integer NOT NULL,
	"price" integer NOT NULL,
	"average" numeric(12, 2) NOT NULL,
	"comment" text,
	"rated_by_id" text,
	"rated_by_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prestataires" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"ice" text,
	"rc" text,
	"building_id" text,
	"syndicate_id" text,
	"status" text DEFAULT 'active',
	"rating" numeric(12, 2),
	"evaluations_count" integer DEFAULT 0,
	"notes" text,
	"document_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_comments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"product_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"user_role" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_favorites" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"product_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_reports" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"product_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reporter_name" text,
	"reason" text NOT NULL,
	"details" text DEFAULT '',
	"status" text DEFAULT 'pending',
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"price" numeric(12, 2) NOT NULL,
	"original_price" numeric(12, 2),
	"category" text NOT NULL,
	"condition" text DEFAULT 'bon',
	"brand" text,
	"model" text,
	"purchase_year" text,
	"selling_reason" text,
	"negotiable" boolean DEFAULT false,
	"contact_preferences" text DEFAULT '["chat"]',
	"location" text DEFAULT '',
	"building" text,
	"block" text,
	"floor" text,
	"image_urls" text DEFAULT '[]',
	"video_url" text,
	"stock" integer DEFAULT 1,
	"syndicate_id" text,
	"seller_id" text,
	"seller_name" text,
	"seller_phone" text,
	"seller_email" text,
	"status" text DEFAULT 'pending_review',
	"rejection_reason" text,
	"moderation_note" text,
	"moderated_by" text,
	"moderated_at" timestamp,
	"featured" boolean DEFAULT false,
	"boosted" boolean DEFAULT false,
	"boost_type" text,
	"boost_expires_at" timestamp,
	"view_count" integer DEFAULT 0,
	"reserved_by" text,
	"reserved_by_name" text,
	"reserved_at" timestamp,
	"sold_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "publication_comments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"publication_id" text NOT NULL,
	"author_id" text,
	"author_name" text,
	"user_id" text,
	"user_name" text,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "publication_likes" (
	"publication_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "publication_likes_publication_id_user_id_pk" PRIMARY KEY("publication_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT '',
	"pinned" boolean DEFAULT false,
	"syndicate_id" text,
	"author_id" text,
	"author_name" text,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reclamations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"reference" text NOT NULL,
	"type" text NOT NULL,
	"statut" text DEFAULT 'deposee',
	"priorite" text DEFAULT 'normale',
	"titre" text NOT NULL,
	"description" text NOT NULL,
	"member_id" text,
	"member_name" text,
	"service" text DEFAULT '',
	"date_depot" text NOT NULL,
	"date_echeance" text,
	"date_cloture" text,
	"traite_par" text,
	"commentaire_admin" text,
	"documents_joints" text DEFAULT '[]',
	"etapes" text DEFAULT '[]',
	"anonymous" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"product_id" text,
	"product_name" text,
	"order_id" text,
	"rating" integer NOT NULL,
	"comment" text DEFAULT '',
	"reviewer_id" text,
	"reviewer_name" text,
	"date" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "salary_records" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"employee" text NOT NULL,
	"role" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"month" text NOT NULL,
	"status" text DEFAULT 'pending',
	"paid_date" text,
	"syndicate_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_job_runs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp NOT NULL,
	"last_status" text,
	"last_error" text,
	"last_duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "sinistres" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"building_id" text NOT NULL,
	"lot_id" text,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"date" text NOT NULL,
	"estimated_amount" numeric(12, 2),
	"indemnised_amount" numeric(12, 2),
	"claim_number" text,
	"status" text DEFAULT 'declared',
	"urgency" text DEFAULT 'normal',
	"image_urls" text DEFAULT '[]',
	"contractor_id" text,
	"resolved_at" timestamp,
	"resolution_note" text,
	"invoice_url" text,
	"reported_by_id" text,
	"reported_by_name" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"object_path" text NOT NULL,
	"owner_id" text,
	"syndicate_id" text,
	"original_name" text,
	"content_type" text NOT NULL,
	"size" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"subscription_id" text,
	"plan_id" text NOT NULL,
	"invoice_id" text,
	"idempotency_key" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"billing_interval" text DEFAULT 'monthly' NOT NULL,
	"payment_method" text NOT NULL,
	"provider" text,
	"provider_reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"metadata" jsonb,
	"processed_at" timestamp,
	"cancelled_at" timestamp,
	"refunded_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(12, 2),
	"yearly_price" numeric(12, 2),
	"interval" text DEFAULT 'monthly',
	"features" text DEFAULT '[]',
	"max_buildings" integer,
	"max_lots" integer,
	"max_members" integer,
	"max_storage_gb" integer,
	"max_documents" integer,
	"max_signatures" integer,
	"max_apartments" integer,
	"max_users" integer,
	"support_level" text,
	"is_active" boolean DEFAULT true,
	"is_trial" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"color" text DEFAULT '#7c3aed',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium',
	"category" text DEFAULT 'general',
	"status" text DEFAULT 'open',
	"syndicate_id" text,
	"submitted_by_id" text,
	"submitted_by_name" text,
	"scope" text DEFAULT 'syndicate',
	"escalated_from" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "syndicate_subscriptions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"plan_id" text,
	"status" text DEFAULT 'trial',
	"auto_renew" boolean DEFAULT true,
	"trial_start_date" timestamp,
	"trial_end_date" timestamp,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"canceled_at" timestamp,
	"grace_period_end" timestamp,
	"notes" text,
	"activated_at" timestamp,
	"renewal_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "syndicates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"sector" text,
	"region" text,
	"admin_id" text,
	"status" text DEFAULT 'active',
	"members_count" integer DEFAULT 0,
	"email" text,
	"phone" text,
	"website" text,
	"address" text,
	"city" text,
	"country" text DEFAULT 'Maroc',
	"legal_form" text,
	"registration_number" text,
	"ice_number" text,
	"rc_number" text,
	"founding_date" text,
	"mission" text,
	"logo_color" text DEFAULT '#7c3aed',
	"logo_url" text,
	"bank_name" text,
	"bank_iban" text,
	"bank_bic" text,
	"cotisation_amount" numeric(12, 2),
	"cotisation_cycle" text DEFAULT 'monthly',
	"legal_threshold_months" integer DEFAULT 18,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_definition_permissions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"template_id" text NOT NULL,
	"role" text NOT NULL,
	"can_use" boolean DEFAULT true,
	"can_edit" boolean DEFAULT false,
	"can_publish" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_definition_versions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" text NOT NULL,
	"change_description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_definitions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"variables" text DEFAULT '[]',
	"sections" text DEFAULT '[]',
	"layout_config" text DEFAULT '{}',
	"status" text DEFAULT 'draft' NOT NULL,
	"syndicate_id" text,
	"languages" text DEFAULT '["fr"]',
	"current_version" integer DEFAULT 1,
	"usage_count" integer DEFAULT 0,
	"created_by" text NOT NULL,
	"updated_by" text,
	"published_at" timestamp,
	"archived_at" timestamp,
	"disabled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"requested_by" text NOT NULL,
	"syndicate_id" text,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"business_purpose" text,
	"required_fields" text DEFAULT '[]',
	"legal_notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"rejection_reason" text,
	"publish_scope" text DEFAULT 'private',
	"priority" text DEFAULT 'normal',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"lot_id" text,
	"building_id" text,
	"syndicate_id" text,
	"lease_start" text,
	"lease_end" text,
	"monthly_rent" numeric(12, 2),
	"deposit_amount" numeric(12, 2),
	"status" text DEFAULT 'active',
	"emergency_contact" text,
	"emergency_phone" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ticket_replies" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"ticket_id" text NOT NULL,
	"author_id" text,
	"author_name" text,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"label" text NOT NULL,
	"date" text NOT NULL,
	"status" text DEFAULT 'paid',
	"member_id" text,
	"syndicate_id" text,
	"proof_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travaux_privatifs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"building_id" text NOT NULL,
	"lot_id" text,
	"syndicate_id" text,
	"requested_by_id" text,
	"requested_by_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"work_type" text NOT NULL,
	"current_photo_urls" text DEFAULT '[]',
	"proposed_photo_urls" text DEFAULT '[]',
	"plan_urls" text DEFAULT '[]',
	"status" text DEFAULT 'submitted',
	"requires_committee_review" boolean,
	"requires_ga_vote" boolean,
	"bylaw_reference" text,
	"syndic_review_note" text,
	"syndic_reviewed_by_id" text,
	"syndic_reviewed_by_name" text,
	"syndic_reviewed_at" timestamp,
	"committee_note" text,
	"committee_recommendation" text,
	"committee_reviewed_by_id" text,
	"committee_reviewed_by_name" text,
	"committee_reviewed_at" timestamp,
	"vote_item_id" text,
	"vote_outcome" text,
	"vote_date" text,
	"vote_summary" text,
	"final_decision" text,
	"final_decision_note" text,
	"final_decision_by_id" text,
	"final_decision_by_name" text,
	"final_decision_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "travaux" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'entretien',
	"priority" text DEFAULT 'normal',
	"status" text DEFAULT 'reported',
	"building_id" text NOT NULL,
	"lot_id" text,
	"prestataire_id" text,
	"reported_by_id" text,
	"reported_by_name" text,
	"assigned_by_id" text,
	"assigned_at" timestamp,
	"estimated_amount" numeric(12, 2),
	"actual_amount" numeric(12, 2),
	"start_date" text,
	"end_date" text,
	"completed_at" timestamp,
	"report_url" text,
	"photo_urls" text DEFAULT '[]',
	"invoice_url" text,
	"invoice_amount" numeric(12, 2),
	"validated_by_id" text,
	"validated_by_name" text,
	"validated_at" timestamp,
	"transaction_id" text,
	"response_time_minutes" integer,
	"resolution_time_minutes" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "union_actions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '',
	"type" text NOT NULL,
	"status" text DEFAULT 'planned',
	"date" text NOT NULL,
	"location" text,
	"organizer" text NOT NULL,
	"participants_target" integer DEFAULT 0,
	"demands" text DEFAULT '[]',
	"updates" text DEFAULT '[]',
	"tags" text DEFAULT '[]',
	"syndicate_id" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"cin" text,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"syndicate_id" text,
	"push_token" text,
	"profession" text,
	"avatar" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"lot_id" text,
	"user_id" text NOT NULL,
	"plate_number" text NOT NULL,
	"brand" text,
	"model" text,
	"color" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "visitor_parking_reservations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"spot_id" text NOT NULL,
	"requested_by_id" text NOT NULL,
	"visitor_name" text NOT NULL,
	"visitor_plate" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vote_receipts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"election_id" text NOT NULL,
	"voter_id" text NOT NULL,
	"cast_by_proxy_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"election_id" text NOT NULL,
	"candidate_id" text,
	"is_abstention" boolean DEFAULT false,
	"device" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"workflow_id" text NOT NULL,
	"step_order" integer NOT NULL,
	"title" text NOT NULL,
	"assignee" text NOT NULL,
	"role" text DEFAULT '',
	"status" text DEFAULT 'waiting',
	"comment" text,
	"date" text
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '',
	"status" text DEFAULT 'pending',
	"priority" text DEFAULT 'medium',
	"initiator_id" text,
	"initiator_name" text NOT NULL,
	"start_date" text NOT NULL,
	"deadline" text,
	"current_step" integer DEFAULT 0,
	"document" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "actes_administratifs" ADD CONSTRAINT "actes_administratifs_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actes_administratifs" ADD CONSTRAINT "actes_administratifs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_participants" ADD CONSTRAINT "action_participants_action_id_union_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."union_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_participants" ADD CONSTRAINT "action_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_supports" ADD CONSTRAINT "action_supports_action_id_union_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."union_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_supports" ADD CONSTRAINT "action_supports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ag_proxies" ADD CONSTRAINT "ag_proxies_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ag_proxies" ADD CONSTRAINT "ag_proxies_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ag_proxies" ADD CONSTRAINT "ag_proxies_grantor_id_members_id_fk" FOREIGN KEY ("grantor_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ag_proxies" ADD CONSTRAINT "ag_proxies_grantee_id_members_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ag_resolutions" ADD CONSTRAINT "ag_resolutions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_reads" ADD CONSTRAINT "alert_reads_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_reads" ADD CONSTRAINT "alert_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD CONSTRAINT "appels_de_fonds_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD CONSTRAINT "appels_de_fonds_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD CONSTRAINT "appels_de_fonds_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD CONSTRAINT "appels_de_fonds_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bon_items" ADD CONSTRAINT "bon_items_bon_id_bons_livraison_id_fk" FOREIGN KEY ("bon_id") REFERENCES "public"."bons_livraison"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bons_livraison" ADD CONSTRAINT "bons_livraison_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caisse_entries" ADD CONSTRAINT "caisse_entries_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_attachments" ADD CONSTRAINT "charge_attachments_appel_de_fonds_id_appels_de_fonds_id_fk" FOREIGN KEY ("appel_de_fonds_id") REFERENCES "public"."appels_de_fonds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_attachments" ADD CONSTRAINT "charge_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseil_syndical" ADD CONSTRAINT "conseil_syndical_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseil_syndical" ADD CONSTRAINT "conseil_syndical_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseil_syndical" ADD CONSTRAINT "conseil_syndical_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseil_syndical" ADD CONSTRAINT "conseil_syndical_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseil_syndical" ADD CONSTRAINT "conseil_syndical_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conseil_syndical" ADD CONSTRAINT "conseil_syndical_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_prestataires" ADD CONSTRAINT "contrats_prestataires_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrats_prestataires" ADD CONSTRAINT "contrats_prestataires_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_archives" ADD CONSTRAINT "conversation_archives_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_archives" ADD CONSTRAINT "conversation_archives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant1_id_users_id_fk" FOREIGN KEY ("participant1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant2_id_users_id_fk" FOREIGN KEY ("participant2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotisations" ADD CONSTRAINT "cotisations_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_escalations" ADD CONSTRAINT "debt_escalations_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_escalations" ADD CONSTRAINT "debt_escalations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_escalations" ADD CONSTRAINT "debt_escalations_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_grantor_id_users_id_fk" FOREIGN KEY ("grantor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_proxies" ADD CONSTRAINT "election_proxies_grantee_id_users_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_questions" ADD CONSTRAINT "election_questions_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_questions" ADD CONSTRAINT "election_questions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_questions" ADD CONSTRAINT "election_questions_asked_by_users_id_fk" FOREIGN KEY ("asked_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_justifications" ADD CONSTRAINT "expense_justifications_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_votes" ADD CONSTRAINT "expense_votes_justification_id_expense_justifications_id_fk" FOREIGN KEY ("justification_id") REFERENCES "public"."expense_justifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_votes" ADD CONSTRAINT "expense_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fonds_travaux" ADD CONSTRAINT "fonds_travaux_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fonds_travaux" ADD CONSTRAINT "fonds_travaux_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_delegations" ADD CONSTRAINT "governance_delegations_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_delegations" ADD CONSTRAINT "governance_delegations_delegant_id_conseil_syndical_id_fk" FOREIGN KEY ("delegant_id") REFERENCES "public"."conseil_syndical"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_delegations" ADD CONSTRAINT "governance_delegations_delegataire_id_conseil_syndical_id_fk" FOREIGN KEY ("delegataire_id") REFERENCES "public"."conseil_syndical"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_delegations" ADD CONSTRAINT "governance_delegations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_delegations" ADD CONSTRAINT "governance_delegations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_votes" ADD CONSTRAINT "idea_votes_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_votes" ADD CONSTRAINT "idea_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_attachments" ADD CONSTRAINT "invoice_attachments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_attachments" ADD CONSTRAINT "invoice_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_alerts" ADD CONSTRAINT "legal_alerts_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_promotions" ADD CONSTRAINT "marketplace_promotions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "national_rankings" ADD CONSTRAINT "national_rankings_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_spots" ADD CONSTRAINT "parking_spots_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_spots" ADD CONSTRAINT "parking_spots_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_violations" ADD CONSTRAINT "parking_violations_spot_id_parking_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."parking_spots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_violations" ADD CONSTRAINT "parking_violations_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_violations" ADD CONSTRAINT "parking_violations_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parking_violations" ADD CONSTRAINT "parking_violations_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_cotisation_id_cotisations_id_fk" FOREIGN KEY ("cotisation_id") REFERENCES "public"."cotisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestataire_evaluations" ADD CONSTRAINT "prestataire_evaluations_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestataire_evaluations" ADD CONSTRAINT "prestataire_evaluations_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestataires" ADD CONSTRAINT "prestataires_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestataires" ADD CONSTRAINT "prestataires_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_comments" ADD CONSTRAINT "product_comments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_favorites" ADD CONSTRAINT "product_favorites_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reports" ADD CONSTRAINT "product_reports_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_comments" ADD CONSTRAINT "publication_comments_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_comments" ADD CONSTRAINT "publication_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_likes" ADD CONSTRAINT "publication_likes_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_likes" ADD CONSTRAINT "publication_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sinistres" ADD CONSTRAINT "sinistres_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syndicate_subscriptions" ADD CONSTRAINT "syndicate_subscriptions_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_definition_permissions" ADD CONSTRAINT "template_definition_permissions_template_id_template_definitions_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_definition_versions" ADD CONSTRAINT "template_definition_versions_template_id_template_definitions_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_definition_versions" ADD CONSTRAINT "template_definition_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_definitions" ADD CONSTRAINT "template_definitions_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_definitions" ADD CONSTRAINT "template_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_requests" ADD CONSTRAINT "template_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_requests" ADD CONSTRAINT "template_requests_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_requests" ADD CONSTRAINT "template_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travaux_privatifs" ADD CONSTRAINT "travaux_privatifs_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travaux" ADD CONSTRAINT "travaux_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travaux" ADD CONSTRAINT "travaux_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travaux" ADD CONSTRAINT "travaux_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travaux" ADD CONSTRAINT "travaux_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "union_actions" ADD CONSTRAINT "union_actions_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "union_actions" ADD CONSTRAINT "union_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_parking_reservations" ADD CONSTRAINT "visitor_parking_reservations_spot_id_parking_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."parking_spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_parking_reservations" ADD CONSTRAINT "visitor_parking_reservations_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_receipts" ADD CONSTRAINT "vote_receipts_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_receipts" ADD CONSTRAINT "vote_receipts_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_receipts" ADD CONSTRAINT "vote_receipts_cast_by_proxy_id_users_id_fk" FOREIGN KEY ("cast_by_proxy_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actes_administratifs_syndicate_id_idx" ON "actes_administratifs" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "actes_administratifs_statut_idx" ON "actes_administratifs" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "actes_administratifs_type_idx" ON "actes_administratifs" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "action_participants_unique_idx" ON "action_participants" USING btree ("action_id","user_id");--> statement-breakpoint
CREATE INDEX "action_participants_action_id_idx" ON "action_participants" USING btree ("action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "action_supports_unique_idx" ON "action_supports" USING btree ("action_id","user_id");--> statement-breakpoint
CREATE INDEX "action_supports_action_id_idx" ON "action_supports" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "ag_proxies_meeting_id_idx" ON "ag_proxies" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "ag_proxies_grantor_id_idx" ON "ag_proxies" USING btree ("grantor_id");--> statement-breakpoint
CREATE INDEX "ag_proxies_grantee_id_idx" ON "ag_proxies" USING btree ("grantee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ag_proxies_meeting_grantor_idx" ON "ag_proxies" USING btree ("meeting_id","grantor_id");--> statement-breakpoint
CREATE INDEX "ag_resolutions_meeting_id_idx" ON "ag_resolutions" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "alerts_syndicate_id_idx" ON "alerts" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "announcements_syndicate_id_idx" ON "announcements" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "appels_building_id_idx" ON "appels_de_fonds" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "appels_lot_id_idx" ON "appels_de_fonds" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "appels_owner_id_idx" ON "appels_de_fonds" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "appels_status_idx" ON "appels_de_fonds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appels_due_date_idx" ON "appels_de_fonds" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "appels_building_period_idx" ON "appels_de_fonds" USING btree ("building_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "appels_lot_period_type_uq" ON "appels_de_fonds" USING btree ("lot_id","period","type");--> statement-breakpoint
CREATE INDEX "audit_logs_syndicate_created_idx" ON "audit_logs" USING btree ("syndicate_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_invoices_syndicate_id_idx" ON "billing_invoices" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "blocked_users_blocker_id_idx" ON "blocked_users" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX "blocked_users_blocked_id_idx" ON "blocked_users" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_users_pair_uq" ON "blocked_users" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "bon_items_bon_id_idx" ON "bon_items" USING btree ("bon_id");--> statement-breakpoint
CREATE INDEX "bons_livraison_syndicate_id_idx" ON "bons_livraison" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "budget_lines_budget_id_idx" ON "budget_lines" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "budget_lines_prestataire_id_idx" ON "budget_lines" USING btree ("prestataire_id");--> statement-breakpoint
CREATE INDEX "budgets_building_id_idx" ON "budgets" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "budgets_status_idx" ON "budgets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "buildings_syndicate_id_idx" ON "buildings" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "caisse_entries_syndicate_id_idx" ON "caisse_entries" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "candidates_election_id_idx" ON "candidates" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "candidates_status_idx" ON "candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cart_items_user_id_idx" ON "cart_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cart_items_product_id_idx" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "charge_attachments_appel_id_idx" ON "charge_attachments" USING btree ("appel_de_fonds_id");--> statement-breakpoint
CREATE INDEX "chat_reports_status_idx" ON "chat_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_reports_reported_user_id_idx" ON "chat_reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "conseil_syndical_syndicate_id_idx" ON "conseil_syndical" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "conseil_syndical_user_id_idx" ON "conseil_syndical" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conseil_syndical_status_idx" ON "conseil_syndical" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conseil_syndical_election_id_idx" ON "conseil_syndical" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "contrats_prestataires_prestataire_id_idx" ON "contrats_prestataires" USING btree ("prestataire_id");--> statement-breakpoint
CREATE INDEX "contrats_prestataires_building_id_idx" ON "contrats_prestataires" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "contrats_prestataires_status_idx" ON "contrats_prestataires" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contrats_prestataires_end_date_idx" ON "contrats_prestataires" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "conversation_archives_user_id_idx" ON "conversation_archives" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_archives_conv_user_uq" ON "conversation_archives" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversations_participant1_id_idx" ON "conversations" USING btree ("participant1_id");--> statement-breakpoint
CREATE INDEX "conversations_participant2_id_idx" ON "conversations" USING btree ("participant2_id");--> statement-breakpoint
CREATE INDEX "conversations_syndicate_id_idx" ON "conversations" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "conversations_conv_type_idx" ON "conversations" USING btree ("conv_type");--> statement-breakpoint
CREATE INDEX "conversations_product_id_idx" ON "conversations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "conversations_incident_id_idx" ON "conversations" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "cotisations_member_id_idx" ON "cotisations" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "cotisations_syndicate_id_idx" ON "cotisations" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "cotisations_status_idx" ON "cotisations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "debt_escalations_syndicate_id_idx" ON "debt_escalations" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "debt_escalations_member_id_idx" ON "debt_escalations" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "debt_escalations_lot_id_idx" ON "debt_escalations" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "debt_escalations_status_idx" ON "debt_escalations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "debt_escalations_level_idx" ON "debt_escalations" USING btree ("escalation_level");--> statement-breakpoint
CREATE INDEX "document_comments_document_id_idx" ON "document_comments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_comments_author_id_idx" ON "document_comments" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_sequences_syndicate_prefix_year_uq" ON "document_sequences" USING btree ("syndicate_id","prefix","year");--> statement-breakpoint
CREATE INDEX "doc_signatures_document_id_idx" ON "document_signatures" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_signatures_signed_by_idx" ON "document_signatures" USING btree ("signed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_signatures_document_signer_uq" ON "document_signatures" USING btree ("document_id","signed_by");--> statement-breakpoint
CREATE INDEX "document_signatures_syndicate_id_idx" ON "document_signatures" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_document_version_uq" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "documents_syndicate_id_idx" ON "documents" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "documents_document_number_idx" ON "documents" USING btree ("document_number");--> statement-breakpoint
CREATE INDEX "documents_retention_until_idx" ON "documents" USING btree ("retention_until");--> statement-breakpoint
CREATE INDEX "documents_is_deleted_idx" ON "documents" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX "documents_expires_at_idx" ON "documents" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_verification_token_uq" ON "documents" USING btree ("verification_token");--> statement-breakpoint
CREATE INDEX "election_proxies_election_id_idx" ON "election_proxies" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "election_proxies_grantee_id_idx" ON "election_proxies" USING btree ("grantee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "election_proxies_election_grantor_idx" ON "election_proxies" USING btree ("election_id","grantor_id");--> statement-breakpoint
CREATE INDEX "election_questions_election_id_idx" ON "election_questions" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "election_questions_candidate_id_idx" ON "election_questions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "elections_syndicate_id_idx" ON "elections" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "elections_status_idx" ON "elections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_logs_status_idx" ON "email_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_logs_recipient_idx" ON "email_logs" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "email_logs_created_at_idx" ON "email_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_logs_template_idx" ON "email_logs" USING btree ("template");--> statement-breakpoint
CREATE INDEX "expense_justifications_syndicate_id_idx" ON "expense_justifications" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "expense_justifications_status_idx" ON "expense_justifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_votes_unique_idx" ON "expense_votes" USING btree ("justification_id","user_id");--> statement-breakpoint
CREATE INDEX "fiches_juridiques_theme_idx" ON "fiches_juridiques" USING btree ("theme");--> statement-breakpoint
CREATE UNIQUE INDEX "fonds_travaux_unique_idx" ON "fonds_travaux" USING btree ("syndicate_id","building_id","year");--> statement-breakpoint
CREATE INDEX "fonds_travaux_syndicate_id_idx" ON "fonds_travaux" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "fonds_travaux_building_id_idx" ON "fonds_travaux" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "governance_delegations_syndicate_id_idx" ON "governance_delegations" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "governance_delegations_status_idx" ON "governance_delegations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "governance_delegations_delegant_id_idx" ON "governance_delegations" USING btree ("delegant_id");--> statement-breakpoint
CREATE INDEX "governance_delegations_delegataire_id_idx" ON "governance_delegations" USING btree ("delegataire_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_votes_unique_idx" ON "idea_votes" USING btree ("idea_id","user_id");--> statement-breakpoint
CREATE INDEX "idea_votes_idea_id_idx" ON "idea_votes" USING btree ("idea_id");--> statement-breakpoint
CREATE INDEX "ideas_syndicate_id_idx" ON "ideas" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "ideas_status_idx" ON "ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ideas_user_id_idx" ON "ideas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoice_attachments_invoice_id_idx" ON "invoice_attachments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_syndicate_id_idx" ON "invoices" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "legal_alerts_syndicate_id_idx" ON "legal_alerts" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "lots_building_id_idx" ON "lots" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "lots_owner_id_idx" ON "lots" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "marketplace_promotions_product_id_idx" ON "marketplace_promotions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "marketplace_promotions_seller_id_idx" ON "marketplace_promotions" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "marketplace_promotions_status_idx" ON "marketplace_promotions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_promotions_end_date_idx" ON "marketplace_promotions" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "meeting_attendees_meeting_id_idx" ON "meeting_attendees" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_syndicate_id_idx" ON "meetings" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "meetings_date_idx" ON "meetings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_unique_idx" ON "members" USING btree ("email");--> statement-breakpoint
CREATE INDEX "members_syndicate_id_idx" ON "members" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_reactions_message_id_idx" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reactions_message_user_emoji_uq" ON "message_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reads_conv_user_idx" ON "message_reads" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "message_reads_user_id_idx" ON "message_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_conv_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "national_rankings_unique_idx" ON "national_rankings" USING btree ("syndicate_id","month","year");--> statement-breakpoint
CREATE INDEX "national_rankings_year_month_idx" ON "national_rankings" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "national_rankings_score_idx" ON "national_rankings" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "orders_buyer_id_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "orders_seller_id_idx" ON "orders" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "otp_tokens_email_idx" ON "otp_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "otp_tokens_expires_at_idx" ON "otp_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "parking_spots_building_id_idx" ON "parking_spots" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "parking_spots_lot_id_idx" ON "parking_spots" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "parking_spots_status_idx" ON "parking_spots" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "parking_spots_building_number_idx" ON "parking_spots" USING btree ("building_id","spot_number");--> statement-breakpoint
CREATE INDEX "parking_violations_building_id_idx" ON "parking_violations" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "parking_violations_spot_id_idx" ON "parking_violations" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "parking_violations_status_idx" ON "parking_violations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "parking_violations_reported_at_idx" ON "parking_violations" USING btree ("reported_at");--> statement-breakpoint
CREATE INDEX "partners_syndicate_id_idx" ON "partners" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_proofs_cotisation_id_idx" ON "payment_proofs" USING btree ("cotisation_id");--> statement-breakpoint
CREATE INDEX "payment_proofs_status_idx" ON "payment_proofs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payslips_syndicate_id_idx" ON "payslips" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "prestataire_evaluations_prestataire_id_idx" ON "prestataire_evaluations" USING btree ("prestataire_id");--> statement-breakpoint
CREATE INDEX "prestataire_evaluations_syndicate_id_idx" ON "prestataire_evaluations" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "prestataires_syndicate_id_idx" ON "prestataires" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "prestataires_building_id_idx" ON "prestataires" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "prestataires_status_idx" ON "prestataires" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_comments_product_id_idx" ON "product_comments" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_comments_created_at_idx" ON "product_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_favorites_product_id_idx" ON "product_favorites" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_favorites_user_id_idx" ON "product_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_favorites_unique_idx" ON "product_favorites" USING btree ("product_id","user_id");--> statement-breakpoint
CREATE INDEX "product_reports_product_id_idx" ON "product_reports" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_reports_reporter_id_idx" ON "product_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "product_reports_status_idx" ON "product_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_seller_id_idx" ON "products" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "products_syndicate_id_idx" ON "products" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "products_featured_idx" ON "products" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "publications_syndicate_id_idx" ON "publications" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "reclamations_member_id_idx" ON "reclamations" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "reclamations_statut_idx" ON "reclamations" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "reclamations_priorite_idx" ON "reclamations" USING btree ("priorite");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reviews_product_id_idx" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewer_id_idx" ON "reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "salary_records_syndicate_id_idx" ON "salary_records" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "sinistres_building_id_idx" ON "sinistres" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "sinistres_status_idx" ON "sinistres" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sinistres_urgency_idx" ON "sinistres" USING btree ("urgency");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_object_path_uq" ON "storage_objects" USING btree ("object_path");--> statement-breakpoint
CREATE INDEX "storage_objects_owner_id_idx" ON "storage_objects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "storage_objects_syndicate_id_idx" ON "storage_objects" USING btree ("syndicate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_idempotency_key_uq" ON "subscription_payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "subscription_payments_syndicate_id_idx" ON "subscription_payments" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "support_tickets_submitted_by_id_idx" ON "support_tickets" USING btree ("submitted_by_id");--> statement-breakpoint
CREATE INDEX "support_tickets_syndicate_id_idx" ON "support_tickets" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_tickets_scope_idx" ON "support_tickets" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "syndicate_subscriptions_syndicate_created_idx" ON "syndicate_subscriptions" USING btree ("syndicate_id","created_at");--> statement-breakpoint
CREATE INDEX "template_def_perms_template_id_idx" ON "template_definition_permissions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_def_versions_template_id_idx" ON "template_definition_versions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_definitions_category_idx" ON "template_definitions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "template_definitions_status_idx" ON "template_definitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "template_definitions_syndicate_id_idx" ON "template_definitions" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "template_requests_syndicate_id_idx" ON "template_requests" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "template_requests_status_idx" ON "template_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "template_requests_requested_by_idx" ON "template_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "tenants_syndicate_id_idx" ON "tenants" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "tenants_building_id_idx" ON "tenants" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "tenants_lot_id_idx" ON "tenants" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_syndicate_id_idx" ON "transactions" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "transactions_member_id_idx" ON "transactions" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_syndicate_type_date_idx" ON "transactions" USING btree ("syndicate_id","type","created_at");--> statement-breakpoint
CREATE INDEX "travaux_privatifs_building_id_idx" ON "travaux_privatifs" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "travaux_privatifs_status_idx" ON "travaux_privatifs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "travaux_privatifs_requested_by_id_idx" ON "travaux_privatifs" USING btree ("requested_by_id");--> statement-breakpoint
CREATE INDEX "travaux_privatifs_syndicate_id_idx" ON "travaux_privatifs" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "travaux_building_id_idx" ON "travaux" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "travaux_status_idx" ON "travaux" USING btree ("status");--> statement-breakpoint
CREATE INDEX "travaux_priority_idx" ON "travaux" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "travaux_prestataire_id_idx" ON "travaux" USING btree ("prestataire_id");--> statement-breakpoint
CREATE INDEX "union_actions_syndicate_id_idx" ON "union_actions" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "union_actions_status_idx" ON "union_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "union_actions_type_idx" ON "union_actions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "users_syndicate_id_idx" ON "users" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "vehicles_lot_id_idx" ON "vehicles" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "vehicles_user_id_idx" ON "vehicles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_plate_unique_idx" ON "vehicles" USING btree ("plate_number");--> statement-breakpoint
CREATE INDEX "visitor_reservations_spot_id_idx" ON "visitor_parking_reservations" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "visitor_reservations_requested_by_idx" ON "visitor_parking_reservations" USING btree ("requested_by_id");--> statement-breakpoint
CREATE INDEX "visitor_reservations_times_idx" ON "visitor_parking_reservations" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX "visitor_reservations_status_idx" ON "visitor_parking_reservations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_receipts_election_voter_unique_idx" ON "vote_receipts" USING btree ("election_id","voter_id");--> statement-breakpoint
CREATE INDEX "vote_receipts_election_id_idx" ON "vote_receipts" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "votes_election_id_idx" ON "votes" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "workflow_steps_workflow_id_idx" ON "workflow_steps" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflows_status_idx" ON "workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflows_category_idx" ON "workflows" USING btree ("category");