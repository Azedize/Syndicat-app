-- Notifications in the reader's language, with a link to what they are about.
--   alerts.key    : template of the notification (lib/notification-texts.ts);
--   alerts.params : the values it is filled with (amount, period, title…);
--   alerts.link   : the app screen it opens (shown only to roles allowed there).
--   users.language: language of push notifications (the app sets it).
-- Additive and nullable: existing alerts keep their stored French text and
-- are shown as before; nothing is rewritten.
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "key" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "params" jsonb;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "link" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" text;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_language_chk";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_language_chk" CHECK ("language" IS NULL OR "language" IN ('fr', 'ar', 'en', 'es'));
