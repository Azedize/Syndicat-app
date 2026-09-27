-- Personal documents: the person a document concerns. Residents only see
-- general documents and their own personal ones.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "subject_user_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_subject_user_id_idx" ON "documents" USING btree ("subject_user_id");--> statement-breakpoint
-- Backfill 1: documents generated for a member (generation_params.memberId,
-- a members.id or users.id) → that person's account in the same syndicate.
UPDATE "documents" d
SET "subject_user_id" = u."id"
FROM "users" u
LEFT JOIN "members" m ON m."email" = u."email"
WHERE d."subject_user_id" IS NULL
  AND d."generation_params" ? 'memberId'
  AND u."syndicate_id" = d."syndicate_id"
  AND (u."id" = d."generation_params"->>'memberId' OR m."id" = d."generation_params"->>'memberId');--> statement-breakpoint
-- Backfill 2: documents generated for a lot → the lot owner's account.
UPDATE "documents" d
SET "subject_user_id" = u."id"
FROM "lots" l
JOIN "members" m ON m."id" = l."owner_id"
JOIN "users" u ON u."email" = m."email"
WHERE d."subject_user_id" IS NULL
  AND d."generation_params" ? 'lotId'
  AND l."id" = d."generation_params"->>'lotId'
  AND u."syndicate_id" = d."syndicate_id";--> statement-breakpoint
-- Backfill 3: self-service requests created by a resident concern themselves.
UPDATE "documents" d
SET "subject_user_id" = d."created_by"
FROM "users" u
WHERE d."subject_user_id" IS NULL
  AND u."id" = d."created_by"
  AND u."role" IN ('member', 'tenant');
