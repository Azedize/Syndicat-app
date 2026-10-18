CREATE TABLE "claim_attachments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"claim_id" text NOT NULL,
	"syndicate_id" text NOT NULL,
	"object_path" text NOT NULL,
	"file_name" text,
	"mime_type" text,
	"internal" boolean DEFAULT false NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"claim_id" text NOT NULL,
	"syndicate_id" text NOT NULL,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"body" text,
	"internal" boolean DEFAULT false NOT NULL,
	"data" jsonb,
	"author_id" text,
	"author_name" text,
	"request_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_notifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"syndicate_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"alert_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	CONSTRAINT "claim_notifications_status_chk" CHECK ("claim_notifications"."status" IN ('pending', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"scope" text DEFAULT 'common' NOT NULL,
	"building_id" text,
	"lot_id" text,
	"location" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"status_before_info" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_at" timestamp NOT NULL,
	"reporter_user_id" text,
	"reporter_name" text NOT NULL,
	"assignee_user_id" text,
	"prestataire_id" text,
	"assigned_at" timestamp,
	"assigned_by" text,
	"scheduled_for" timestamp,
	"travaux_id" text,
	"resolution" text,
	"resolved_at" timestamp,
	"resolved_by" text,
	"closed_at" timestamp,
	"closed_by" text,
	"rejection_reason" text,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "claims_status_chk" CHECK ("claims"."status" IN ('received', 'qualified', 'assigned', 'in_progress', 'awaiting_info', 'resolved', 'closed', 'rejected')),
	CONSTRAINT "claims_priority_chk" CHECK ("claims"."priority" IN ('urgent', 'high', 'normal', 'low')),
	CONSTRAINT "claims_scope_chk" CHECK ("claims"."scope" IN ('common', 'unit')),
	CONSTRAINT "claims_unit_lot_chk" CHECK ("claims"."scope" = 'common' OR "claims"."lot_id" IS NOT NULL),
	CONSTRAINT "claims_category_chk" CHECK ("claims"."category" IN ('fuite_eau', 'ascenseur', 'eclairage', 'electricite', 'bruit', 'proprete', 'securite', 'parties_communes', 'stationnement', 'autre')),
	CONSTRAINT "claims_resolved_chk" CHECK ("claims"."status" NOT IN ('resolved', 'closed') OR ("claims"."resolution" IS NOT NULL AND "claims"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "claim_attachments" ADD CONSTRAINT "claim_attachments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_notifications" ADD CONSTRAINT "claim_notifications_event_id_claim_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."claim_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_travaux_id_travaux_id_fk" FOREIGN KEY ("travaux_id") REFERENCES "public"."travaux"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_attachments_claim_idx" ON "claim_attachments" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_attachments_object_uq" ON "claim_attachments" USING btree ("object_path");--> statement-breakpoint
CREATE INDEX "claim_events_claim_idx" ON "claim_events" USING btree ("claim_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_events_request_uq" ON "claim_events" USING btree ("claim_id","request_key") WHERE "claim_events"."request_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_notifications_event_user_uq" ON "claim_notifications" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "claim_notifications_status_idx" ON "claim_notifications" USING btree ("syndicate_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_reference_uq" ON "claims" USING btree ("syndicate_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_idempotency_uq" ON "claims" USING btree ("syndicate_id","reporter_user_id","idempotency_key") WHERE "claims"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "claims_syndicate_status_idx" ON "claims" USING btree ("syndicate_id","status");--> statement-breakpoint
CREATE INDEX "claims_reporter_idx" ON "claims" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "claims_assignee_idx" ON "claims" USING btree ("assignee_user_id");