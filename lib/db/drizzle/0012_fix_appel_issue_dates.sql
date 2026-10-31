-- Migration 0011 backfilled appels_de_fonds.issue_date from created_at.
-- A call entered after its due date thus got an issue date AFTER its due
-- date. The issue date of such calls is brought back to the due date (the
-- latest date at which the call can have been issued); amounts, statuses
-- and payments are untouched.
UPDATE "appels_de_fonds" SET "issue_date" = "due_date"
WHERE "issue_date" IS NOT NULL AND "due_date" IS NOT NULL AND "due_date" ~ '^\d{4}-\d{2}-\d{2}$' AND "issue_date" > "due_date";
