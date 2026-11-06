-- Election rules (2026-11-06): several seats per ballot, voices weighted by
-- the co-owners' quotes-parts (Loi 18-00, art. 16 decies), second round on a
-- tie, no automatic winner after a persisting tie (no casting vote for the
-- syndic), and the official resignation of the syndic / syndic adjoint
-- (art. 26 ter, 27, 27 ter).
-- Additive only: existing elections keep their behaviour (one choice per
-- ballot, one voice per voter, round 1). Nothing is rewritten or deleted.
--
-- Reversal (data added by these columns/tables is lost):
--   DROP TABLE IF EXISTS "mandate_resignations";
--   ALTER TABLE "candidates" DROP COLUMN IF EXISTS "voices";
--   ALTER TABLE "votes" DROP COLUMN IF EXISTS "ballot_id";
--   ALTER TABLE "elections" DROP COLUMN IF EXISTS "ballot_mode", DROP COLUMN IF EXISTS "weighting",
--     DROP COLUMN IF EXISTS "majority_base", DROP COLUMN IF EXISTS "round", DROP COLUMN IF EXISTS "parent_election_id",
--     DROP COLUMN IF EXISTS "outcome", DROP COLUMN IF EXISTS "outcome_details", DROP COLUMN IF EXISTS "voices_cast",
--     DROP COLUMN IF EXISTS "eligible_voices";

-- single: one candidate per ballot; multiple: up to seats_count distinct candidates.
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "ballot_mode" text NOT NULL DEFAULT 'single';--> statement-breakpoint
-- per_voter: one voice per ballot; quote_part: the voter's voices (tantièmes of the lots owned).
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "weighting" text NOT NULL DEFAULT 'per_voter';--> statement-breakpoint
-- What a percentage majority is measured against: the voices cast (present or
-- represented) or the voices of all eligible co-owners.
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "majority_base" text NOT NULL DEFAULT 'votes_cast';--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "round" integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "parent_election_id" text REFERENCES "elections"("id") ON DELETE SET NULL;--> statement-breakpoint
-- elected | runoff_required | deliberation_required | no_majority (null until results are published)
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "outcome" text;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "outcome_details" jsonb;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "voices_cast" numeric(14,4) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "elections" ADD COLUMN IF NOT EXISTS "eligible_voices" numeric(14,4);--> statement-breakpoint
ALTER TABLE "elections" DROP CONSTRAINT IF EXISTS "elections_ballot_mode_chk";--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_ballot_mode_chk" CHECK ("ballot_mode" IN ('single', 'multiple'));--> statement-breakpoint
ALTER TABLE "elections" DROP CONSTRAINT IF EXISTS "elections_weighting_chk";--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_weighting_chk" CHECK ("weighting" IN ('per_voter', 'quote_part'));--> statement-breakpoint
ALTER TABLE "elections" DROP CONSTRAINT IF EXISTS "elections_majority_base_chk";--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_majority_base_chk" CHECK ("majority_base" IN ('votes_cast', 'all_voices'));--> statement-breakpoint
ALTER TABLE "elections" DROP CONSTRAINT IF EXISTS "elections_round_chk";--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_round_chk" CHECK ("round" >= 1);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "elections_parent_election_id_idx" ON "elections" ("parent_election_id");--> statement-breakpoint

-- The selections of one ballot share a ballot_id (still no voter on a ballot).
-- Null on ballots cast before this migration: each row was one ballot.
ALTER TABLE "votes" ADD COLUMN IF NOT EXISTS "ballot_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "votes_ballot_id_idx" ON "votes" ("ballot_id");--> statement-breakpoint
-- Weighted total next to the ballot count (candidates.votes). The weight is
-- never stored on the ballot itself: a rare quote-part would identify its voter.
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "voices" numeric(14,4) NOT NULL DEFAULT 0;--> statement-breakpoint

-- Official resignation of the syndic or the syndic adjoint. The mandate row
-- stays (status resigned): nobody and no history is removed.
CREATE TABLE IF NOT EXISTS "mandate_resignations" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "syndicate_id" text NOT NULL REFERENCES "syndicates"("id") ON DELETE CASCADE,
  "mandate_id" text NOT NULL REFERENCES "conseil_syndical"("id") ON DELETE RESTRICT,
  -- syndic | vice_syndic
  "role" text NOT NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" text,
  -- Date the co-owners were notified: start of the 30-day period (art. 26 ter, 27 ter).
  "notified_at" date NOT NULL,
  "ag_deadline" date NOT NULL,
  "ag_meeting_id" text REFERENCES "meetings"("id") ON DELETE SET NULL,
  -- Syndic adjoint exercising the syndic's attributions meanwhile (art. 27).
  "interim_mandate_id" text REFERENCES "conseil_syndical"("id") ON DELETE SET NULL,
  -- Handover to the adjoint (art. 26 ter): {"documents": true, "archives": false, ...}
  "handover" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "handover_completed_at" timestamp,
  -- none | no_deputy (no adjoint to take over) | no_successor (no new syndic designated)
  "escalation" text NOT NULL DEFAULT 'none',
  -- open | closed
  "status" text NOT NULL DEFAULT 'open',
  "successor_mandate_id" text REFERENCES "conseil_syndical"("id") ON DELETE SET NULL,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "closed_at" timestamp,
  CONSTRAINT "mandate_resignations_role_chk" CHECK ("role" IN ('syndic', 'vice_syndic')),
  CONSTRAINT "mandate_resignations_status_chk" CHECK ("status" IN ('open', 'closed')),
  CONSTRAINT "mandate_resignations_escalation_chk" CHECK ("escalation" IN ('none', 'no_deputy', 'no_successor')),
  CONSTRAINT "mandate_resignations_deadline_chk" CHECK ("ag_deadline" >= "notified_at")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mandate_resignations_syndicate_id_idx" ON "mandate_resignations" ("syndicate_id");--> statement-breakpoint
-- One open resignation per mandate (a second request cannot duplicate it).
CREATE UNIQUE INDEX IF NOT EXISTS "mandate_resignations_open_mandate_idx" ON "mandate_resignations" ("mandate_id") WHERE "status" = 'open';
