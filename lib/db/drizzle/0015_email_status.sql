ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_status" text DEFAULT 'unverified' NOT NULL;
--> statement-breakpoint
-- Addresses on reserved domains (RFC 2606 / RFC 6761) can never receive mail.
-- Marked, not changed: the accounts keep working and nothing is deleted.
UPDATE "users" SET "email_status" = 'undeliverable'
WHERE lower(split_part("email", '@', 2)) ~ '(^|\.)(test|invalid|example|localhost|local)$'
   OR lower(split_part("email", '@', 2)) IN ('example.com', 'example.net', 'example.org');
