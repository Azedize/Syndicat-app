-- Last password change of an account (reset by code, reset link, change from
-- the profile). An access token issued before it is refused by the session
-- check (lib/access.ts), so a reset closes every session at once — the
-- refresh tokens were already revoked, the 15-minute access tokens were not.
-- Additive and nullable: existing accounts keep their sessions until their
-- next password change.
-- Reversal: ALTER TABLE "users" DROP COLUMN IF EXISTS "password_changed_at";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp;
