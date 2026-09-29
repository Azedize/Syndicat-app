-- Tenant isolation for grievances: every reclamation belongs to one syndicate.
ALTER TABLE "reclamations" ADD COLUMN IF NOT EXISTS "syndicate_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reclamations" ADD CONSTRAINT "reclamations_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reclamations_syndicate_id_idx" ON "reclamations" USING btree ("syndicate_id");--> statement-breakpoint
-- Backfill from the author's account. Anonymous legacy rows have no author and
-- stay NULL: only super_admin can see them (the API filters every other role).
UPDATE "reclamations" r
SET "syndicate_id" = u."syndicate_id"
FROM "users" u
WHERE r."syndicate_id" IS NULL
  AND r."member_id" = u."id"
  AND u."syndicate_id" IS NOT NULL;
