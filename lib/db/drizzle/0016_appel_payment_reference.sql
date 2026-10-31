ALTER TABLE "appels_de_fonds" ADD COLUMN IF NOT EXISTS "payment_reference" text;
--> statement-breakpoint
-- Reference the co-owner writes in the transfer: <LOT>-<PERIOD>-<TYPE>-<CHECK>,
-- e.g. A203-2026Q4-CC-7F3A9B. The 6-character check code comes from the call's
-- id, so two buildings with the same lot number never share a reference.
UPDATE "appels_de_fonds" a
SET "payment_reference" =
  left(upper(regexp_replace(l."number", '[^A-Za-z0-9]', '', 'g')), 8) || '-' ||
  replace(a."period", '-', '') || '-' ||
  CASE a."type" WHEN 'charges_courantes' THEN 'CC' WHEN 'fonds_travaux' THEN 'FT'
       ELSE upper(left(regexp_replace(coalesce(a."type", 'XX'), '[^A-Za-z]', '', 'g'), 2)) END || '-' ||
  upper(left(encode(sha256(convert_to(a."id", 'UTF8')), 'hex'), 6))
FROM "lots" l
WHERE l."id" = a."lot_id" AND a."payment_reference" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appels_payment_reference_uq" ON "appels_de_fonds" USING btree ("payment_reference") WHERE "payment_reference" IS NOT NULL;
