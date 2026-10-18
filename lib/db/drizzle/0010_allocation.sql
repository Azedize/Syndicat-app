CREATE TABLE "allocation_key_shares" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"version_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"coefficient" numeric(18, 6),
	"excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" text,
	CONSTRAINT "allocation_key_shares_coef_chk" CHECK ("allocation_key_shares"."coefficient" IS NULL OR "allocation_key_shares"."coefficient" >= 0),
	CONSTRAINT "allocation_key_shares_excluded_chk" CHECK (("allocation_key_shares"."excluded" AND "allocation_key_shares"."coefficient" IS NULL AND "allocation_key_shares"."exclusion_reason" IS NOT NULL) OR (NOT "allocation_key_shares"."excluded" AND "allocation_key_shares"."coefficient" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "allocation_key_versions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"key_id" text NOT NULL,
	"version" integer NOT NULL,
	"method" text NOT NULL,
	"categories" text[] NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source_reference" text NOT NULL,
	"change_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_key_versions_method_chk" CHECK ("allocation_key_versions"."method" IN ('shares', 'equal')),
	CONSTRAINT "allocation_key_versions_dates_chk" CHECK ("allocation_key_versions"."effective_to" IS NULL OR "allocation_key_versions"."effective_to" >= "allocation_key_versions"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "allocation_keys" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"building_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "allocation_keys_status_chk" CHECK ("allocation_keys"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "allocation_lines" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"allocation_id" text NOT NULL,
	"source_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"coefficient" numeric(18, 6) NOT NULL,
	"denominator" numeric(24, 6) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"rounding_adjustment" numeric(12, 2) DEFAULT '0' NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocation_sources" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"allocation_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"period" text NOT NULL,
	"charge_type" text NOT NULL,
	"label" text NOT NULL,
	"category" text,
	"amount" numeric(12, 2) NOT NULL,
	"key_version_id" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"building_id" text NOT NULL,
	"reference" text NOT NULL,
	"period" text NOT NULL,
	"charge_type" text NOT NULL,
	"status" text DEFAULT 'finalized' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"inputs" jsonb NOT NULL,
	"inputs_hash" text NOT NULL,
	"idempotency_key" text,
	"correction_of" text,
	"correction_reason" text,
	"ended_at" timestamp,
	"ended_by" text,
	"end_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_status_chk" CHECK ("allocations"."status" IN ('finalized', 'corrected', 'reversed'))
);
--> statement-breakpoint
DROP INDEX "appels_lot_period_type_uq";--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD COLUMN "allocation_id" text;--> statement-breakpoint
ALTER TABLE "allocation_key_shares" ADD CONSTRAINT "allocation_key_shares_version_id_allocation_key_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."allocation_key_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_key_shares" ADD CONSTRAINT "allocation_key_shares_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_key_versions" ADD CONSTRAINT "allocation_key_versions_key_id_allocation_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."allocation_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_keys" ADD CONSTRAINT "allocation_keys_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_keys" ADD CONSTRAINT "allocation_keys_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_lines" ADD CONSTRAINT "allocation_lines_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_lines" ADD CONSTRAINT "allocation_lines_source_id_allocation_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."allocation_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_lines" ADD CONSTRAINT "allocation_lines_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_sources" ADD CONSTRAINT "allocation_sources_allocation_id_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_sources" ADD CONSTRAINT "allocation_sources_key_version_id_allocation_key_versions_id_fk" FOREIGN KEY ("key_version_id") REFERENCES "public"."allocation_key_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_correction_of_allocations_id_fk" FOREIGN KEY ("correction_of") REFERENCES "public"."allocations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_key_shares_uq" ON "allocation_key_shares" USING btree ("version_id","lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_key_versions_uq" ON "allocation_key_versions" USING btree ("key_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_keys_code_uq" ON "allocation_keys" USING btree ("building_id",lower("code"));--> statement-breakpoint
CREATE INDEX "allocation_lines_allocation_lot_idx" ON "allocation_lines" USING btree ("allocation_id","lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_sources_active_uq" ON "allocation_sources" USING btree ("source_type","source_id","period","charge_type") WHERE "allocation_sources"."active";--> statement-breakpoint
CREATE INDEX "allocation_sources_allocation_idx" ON "allocation_sources" USING btree ("allocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_reference_uq" ON "allocations" USING btree ("syndicate_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_idempotency_uq" ON "allocations" USING btree ("syndicate_id","idempotency_key") WHERE "allocations"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "allocations_building_period_idx" ON "allocations" USING btree ("building_id","period");--> statement-breakpoint
CREATE INDEX "appels_allocation_idx" ON "appels_de_fonds" USING btree ("allocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appels_lot_period_type_uq" ON "appels_de_fonds" USING btree ("lot_id","period","type") WHERE "appels_de_fonds"."status" IS DISTINCT FROM 'cancelled';