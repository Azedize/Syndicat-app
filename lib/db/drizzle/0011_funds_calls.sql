CREATE TABLE "appel_adjustments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"appel_id" text NOT NULL,
	"previous_amount" numeric(12, 2) NOT NULL,
	"new_amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appel_adjustments_amount_chk" CHECK ("appel_adjustments"."new_amount" > 0 AND "appel_adjustments"."new_amount" <> "appel_adjustments"."previous_amount")
);
--> statement-breakpoint
CREATE TABLE "appel_reminders" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"appel_id" text NOT NULL,
	"kind" text NOT NULL,
	"remaining" numeric(12, 2) NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appel_reminders_kind_chk" CHECK ("appel_reminders"."kind" IN ('overdue', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "allocations" DROP CONSTRAINT "allocations_status_chk";--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "issue_date" date;--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD COLUMN "issue_date" text;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD COLUMN "original_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "appel_adjustments" ADD CONSTRAINT "appel_adjustments_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appel_adjustments" ADD CONSTRAINT "appel_adjustments_appel_id_appels_de_fonds_id_fk" FOREIGN KEY ("appel_id") REFERENCES "public"."appels_de_fonds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appel_reminders" ADD CONSTRAINT "appel_reminders_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appel_reminders" ADD CONSTRAINT "appel_reminders_appel_id_appels_de_fonds_id_fk" FOREIGN KEY ("appel_id") REFERENCES "public"."appels_de_fonds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appel_adjustments_appel_idx" ON "appel_adjustments" USING btree ("appel_id");--> statement-breakpoint
CREATE INDEX "appel_reminders_appel_idx" ON "appel_reminders" USING btree ("appel_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appel_reminders_overdue_uq" ON "appel_reminders" USING btree ("appel_id") WHERE "appel_reminders"."kind" = 'overdue';--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_dates_chk" CHECK ("allocations"."due_date" IS NULL OR "allocations"."issue_date" IS NULL OR "allocations"."due_date" >= "allocations"."issue_date");--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_status_chk" CHECK ("allocations"."status" IN ('draft', 'finalized', 'corrected', 'reversed'));--> statement-breakpoint
-- Existing calls: no adjustment ever happened, so the issued amount is the
-- current one; the issue date is the creation date.
UPDATE "appels_de_fonds" SET "original_amount" = "amount" WHERE "original_amount" IS NULL;
--> statement-breakpoint
UPDATE "appels_de_fonds" SET "issue_date" = to_char("created_at", 'YYYY-MM-DD') WHERE "issue_date" IS NULL;
--> statement-breakpoint
UPDATE "allocations" SET "published_at" = "created_at", "published_by" = "created_by" WHERE "status" <> 'draft' AND "published_at" IS NULL;
