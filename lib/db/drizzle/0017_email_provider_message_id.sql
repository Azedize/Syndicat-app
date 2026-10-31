-- E-mail log: identifier returned by the provider when it accepts a message
-- (SMTP « 250 … queued as … »). A « sent » row with this id was accepted by
-- the provider; without it (rows written before this column, or fixtures),
-- the acceptance is not proven. Additive, nullable: no existing row changes.
ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "provider_message_id" text;
