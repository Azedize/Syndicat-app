CREATE TABLE "lot_ownerships" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"member_id" text NOT NULL,
	"share_percent" numeric(5, 2) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"end_reason" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "lot_ownerships_share_chk" CHECK ("lot_ownerships"."share_percent" > 0 AND "lot_ownerships"."share_percent" <= 100),
	CONSTRAINT "lot_ownerships_dates_chk" CHECK ("lot_ownerships"."end_date" IS NULL OR "lot_ownerships"."end_date" >= "lot_ownerships"."start_date")
);
--> statement-breakpoint
ALTER TABLE "appels_de_fonds" DROP CONSTRAINT "appels_de_fonds_lot_id_lots_id_fk";
--> statement-breakpoint
DROP INDEX "members_email_unique_idx";--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "archived_by" text;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "archive_reason" text;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "lot_ownerships" ADD CONSTRAINT "lot_ownerships_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_ownerships" ADD CONSTRAINT "lot_ownerships_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_ownerships" ADD CONSTRAINT "lot_ownerships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_ownerships_lot_id_idx" ON "lot_ownerships" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "lot_ownerships_member_id_idx" ON "lot_ownerships" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "lot_ownerships_syndicate_id_idx" ON "lot_ownerships" USING btree ("syndicate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lot_ownerships_current_uq" ON "lot_ownerships" USING btree ("lot_id","member_id") WHERE "lot_ownerships"."end_date" IS NULL;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD CONSTRAINT "appels_de_fonds_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lots_building_number_active_uq" ON "lots" USING btree ("building_id",lower("number")) WHERE "lots"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "members_syndicate_email_uq" ON "members" USING btree ("syndicate_id",lower("email"));--> statement-breakpoint
-- Backfill 1: occupancy values outside the supported set (legacy UI values).
UPDATE "lots" SET "status" = CASE
  WHEN "status" IN ('occupied', 'rented', 'vacant') THEN "status"
  WHEN "status" IN ('for_rent', 'for_sale') THEN 'vacant'
  ELSE 'occupied' END
WHERE "status" IS NULL OR "status" NOT IN ('occupied', 'rented', 'vacant');--> statement-breakpoint
UPDATE "lots" SET "tantiemes" = 0 WHERE "tantiemes" < 0;--> statement-breakpoint
-- Backfill 2: the lot points to its current tenancy (tenants.lot_id was the
-- only link so far).
UPDATE "lots" l SET "tenant_id" = t."id", "status" = 'rented'
FROM (
  SELECT DISTINCT ON ("lot_id") "id", "lot_id" FROM "tenants"
  WHERE "status" = 'active' AND "lot_id" IS NOT NULL
    AND ("lease_end" IS NULL OR "lease_end" = '' OR "lease_end" >= to_char(now(), 'YYYY-MM-DD'))
  ORDER BY "lot_id", "created_at" DESC
) t
WHERE l."id" = t."lot_id" AND l."tenant_id" IS NULL;--> statement-breakpoint
-- Backfill 3: the current owner becomes the first ownership period (100 %).
INSERT INTO "lot_ownerships" ("syndicate_id", "lot_id", "member_id", "share_percent", "start_date", "created_by")
SELECT b."syndicate_id", l."id", l."owner_id", 100, COALESCE(l."created_at"::date, now()::date), 'migration-0004'
FROM "lots" l
JOIN "buildings" b ON b."id" = l."building_id"
JOIN "members" m ON m."id" = l."owner_id" AND m."syndicate_id" = b."syndicate_id"
WHERE l."owner_id" IS NOT NULL AND b."syndicate_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_tantiemes_chk" CHECK ("lots"."tantiemes" >= 0);--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_status_chk" CHECK ("lots"."status" IN ('occupied', 'rented', 'vacant'));