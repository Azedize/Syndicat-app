CREATE TABLE IF NOT EXISTS "announcement_acknowledgements" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"announcement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"syndicate_id" text,
	"acknowledged_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_acknowledgements" ADD CONSTRAINT "announcement_acknowledgements_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "announcement_acknowledgements" ADD CONSTRAINT "announcement_acknowledgements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "announcement_acknowledgements" ADD CONSTRAINT "announcement_acknowledgements_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_ack_unique" ON "announcement_acknowledgements" USING btree ("announcement_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_ack_announcement_idx" ON "announcement_acknowledgements" USING btree ("announcement_id");
