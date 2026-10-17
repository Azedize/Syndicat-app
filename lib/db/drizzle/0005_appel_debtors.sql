ALTER TABLE "appels_de_fonds" ADD COLUMN "debtor_member_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- Backfill: existing calls were addressed to their single owner.
UPDATE "appels_de_fonds" SET "debtor_member_ids" = ARRAY["owner_id"] WHERE "owner_id" IS NOT NULL AND cardinality("debtor_member_ids") = 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appels_debtor_member_ids_gin" ON "appels_de_fonds" USING gin ("debtor_member_ids");
