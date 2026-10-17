CREATE TABLE "organization_members" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_by" text,
	"revoked_at" timestamp,
	"revoked_by" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "organization_members_role_chk" CHECK ("organization_members"."role" IN ('org_admin', 'org_staff')),
	CONSTRAINT "organization_members_status_chk" CHECK ("organization_members"."status" IN ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"ice_number" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "organizations_status_chk" CHECK ("organizations"."status" IN ('active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "syndicate_memberships" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_by" text,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "syndicate_memberships_role_chk" CHECK ("syndicate_memberships"."role" IN ('syndicate_admin', 'president', 'treasurer', 'secretary', 'committee_member')),
	CONSTRAINT "syndicate_memberships_status_chk" CHECK ("syndicate_memberships"."status" IN ('active', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "context_syndicate_id" text;--> statement-breakpoint
ALTER TABLE "syndicates" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "syndicates" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "syndicates" ADD COLUMN "status_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "syndicates" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "syndicates" ADD COLUMN "currency" text DEFAULT 'MAD' NOT NULL;--> statement-breakpoint
ALTER TABLE "syndicates" ADD COLUMN "default_language" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "syndicates" ADD COLUMN "fiscal_year_start_month" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "syndicates" ADD COLUMN "creation_key" text;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syndicate_memberships" ADD CONSTRAINT "syndicate_memberships_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syndicate_memberships" ADD CONSTRAINT "syndicate_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_active_uq" ON "organization_members" USING btree ("organization_id","user_id") WHERE "organization_members"."status" = 'active';--> statement-breakpoint
CREATE INDEX "syndicate_memberships_user_idx" ON "syndicate_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "syndicate_memberships_syndicate_idx" ON "syndicate_memberships" USING btree ("syndicate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "syndicate_memberships_active_uq" ON "syndicate_memberships" USING btree ("syndicate_id","user_id") WHERE "syndicate_memberships"."status" = 'active';--> statement-breakpoint
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "syndicates_organization_id_idx" ON "syndicates" USING btree ("organization_id");--> statement-breakpoint
-- Backfill 1: legacy statuses (active / inactive) onto the lifecycle.
UPDATE "syndicates" SET "status" = CASE
  WHEN "status" IN ('draft', 'active', 'suspended', 'archived') THEN "status"
  WHEN "status" = 'inactive' THEN 'suspended'
  ELSE 'active' END;--> statement-breakpoint
-- Backfill 2: until now each syndic managed one condominium. Every existing
-- syndicate becomes the first condominium of its own syndic company, whose
-- administrators are that syndicate's current syndic accounts.
INSERT INTO "organizations" ("id", "name", "email", "phone", "address", "city", "created_by")
SELECT 'org_' || s."id", s."name", s."email", s."phone", s."address", s."city", 'migration-0006'
FROM "syndicates" s
WHERE s."organization_id" IS NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "syndicates" SET "organization_id" = 'org_' || "id" WHERE "organization_id" IS NULL;--> statement-breakpoint
INSERT INTO "organization_members" ("organization_id", "user_id", "role", "granted_by")
SELECT 'org_' || u."syndicate_id", u."id", 'org_admin', 'migration-0006'
FROM "users" u
WHERE u."role" = 'syndicate_admin' AND u."syndicate_id" IS NOT NULL AND u."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "syndicates_org_name_uq" ON "syndicates" USING btree ("organization_id",lower("name")) WHERE "syndicates"."status" <> 'archived';--> statement-breakpoint
CREATE UNIQUE INDEX "syndicates_creation_key_uq" ON "syndicates" USING btree ("organization_id","creation_key") WHERE "syndicates"."creation_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_status_chk" CHECK ("syndicates"."status" IN ('draft', 'active', 'suspended', 'archived'));--> statement-breakpoint
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_currency_chk" CHECK ("syndicates"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_language_chk" CHECK ("syndicates"."default_language" IN ('fr', 'ar', 'en', 'es'));--> statement-breakpoint
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_fiscal_month_chk" CHECK ("syndicates"."fiscal_year_start_month" BETWEEN 1 AND 12);