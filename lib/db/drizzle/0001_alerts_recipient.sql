-- Personal notifications: an alert addressed to a single user.
-- Idempotent so it also applies to databases already synced with `db:push`.
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "recipient_user_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_recipient_user_id_idx" ON "alerts" USING btree ("recipient_user_id");
