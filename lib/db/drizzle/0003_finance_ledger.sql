CREATE TABLE "appel_payments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"appel_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"proof_url" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"declared_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"account_id" text,
	"ledger_entry_id" text,
	"receipt_number" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "appel_payments_amount_chk" CHECK ("appel_payments"."amount" > 0),
	CONSTRAINT "appel_payments_method_chk" CHECK ("appel_payments"."method" IN ('virement', 'cheque', 'especes')),
	CONSTRAINT "appel_payments_status_chk" CHECK ("appel_payments"."status" IN ('pending', 'validated', 'rejected', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"account_id" text NOT NULL,
	"value_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"label" text NOT NULL,
	"reference" text,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"matched_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"import_batch_id" text,
	"imported_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bank_statement_lines_amount_chk" CHECK ("bank_statement_lines"."amount" <> 0),
	CONSTRAINT "bank_statement_lines_status_chk" CHECK ("bank_statement_lines"."status" IN ('unmatched', 'partial', 'matched', 'anomaly', 'ignored')),
	CONSTRAINT "bank_statement_lines_matched_chk" CHECK ("bank_statement_lines"."matched_amount" >= 0 AND "bank_statement_lines"."matched_amount" <= abs("bank_statement_lines"."amount"))
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"building_id" text,
	"reference" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"supplier_name" text,
	"prestataire_id" text,
	"invoice_number" text,
	"invoice_date" date,
	"proof_url" text NOT NULL,
	"budget_line_id" text,
	"travaux_id" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"rejected_by" text,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"paid_by" text,
	"paid_at" timestamp,
	"payment_method" text,
	"payment_reference" text,
	"account_id" text,
	"ledger_entry_id" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "expenses_amount_chk" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_status_chk" CHECK ("expenses"."status" IN ('submitted', 'approved', 'rejected', 'paid', 'cancelled')),
	CONSTRAINT "expenses_payment_method_chk" CHECK ("expenses"."payment_method" IS NULL OR "expenses"."payment_method" IN ('virement', 'cheque', 'especes', 'prelevement'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"account_id" text NOT NULL,
	"entry_number" text NOT NULL,
	"entry_date" date NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"reference" text,
	"source_type" text NOT NULL,
	"source_id" text,
	"reverses_entry_id" text,
	"building_id" text,
	"proof_url" text,
	"idempotency_key" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "ledger_entries_direction_chk" CHECK ("ledger_entries"."direction" IN ('in', 'out')),
	CONSTRAINT "ledger_entries_amount_chk" CHECK ("ledger_entries"."amount" > 0),
	CONSTRAINT "ledger_entries_source_type_chk" CHECK ("ledger_entries"."source_type" IN ('opening', 'appel_payment', 'expense', 'salary', 'manual', 'transfer', 'reversal'))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_matches" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"statement_line_id" text NOT NULL,
	"ledger_entry_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"matched_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "reconciliation_matches_amount_chk" CHECK ("reconciliation_matches"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "treasury_accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"building_id" text,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"bank_name" text,
	"account_holder" text,
	"rib" text,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"opening_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"opening_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"closed_by" text,
	CONSTRAINT "treasury_accounts_kind_chk" CHECK ("treasury_accounts"."kind" IN ('bank', 'cash')),
	CONSTRAINT "treasury_accounts_status_chk" CHECK ("treasury_accounts"."status" IN ('active', 'closed')),
	CONSTRAINT "treasury_accounts_rib_chk" CHECK ("treasury_accounts"."rib" IS NULL OR "treasury_accounts"."rib" ~ '^[0-9]{24}$'),
	CONSTRAINT "treasury_accounts_currency_chk" CHECK ("treasury_accounts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD COLUMN "amount_paid" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "salary_records" ADD COLUMN "ledger_entry_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "ledger_entry_id" text;--> statement-breakpoint
ALTER TABLE "appel_payments" ADD CONSTRAINT "appel_payments_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appel_payments" ADD CONSTRAINT "appel_payments_appel_id_appels_de_fonds_id_fk" FOREIGN KEY ("appel_id") REFERENCES "public"."appels_de_fonds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appel_payments" ADD CONSTRAINT "appel_payments_account_id_treasury_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appel_payments" ADD CONSTRAINT "appel_payments_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_account_id_treasury_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_prestataire_id_prestataires_id_fk" FOREIGN KEY ("prestataire_id") REFERENCES "public"."prestataires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_travaux_id_travaux_id_fk" FOREIGN KEY ("travaux_id") REFERENCES "public"."travaux"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_treasury_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_treasury_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reverses_entry_id_ledger_entries_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_statement_line_id_bank_statement_lines_id_fk" FOREIGN KEY ("statement_line_id") REFERENCES "public"."bank_statement_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appel_payments_syndicate_id_idx" ON "appel_payments" USING btree ("syndicate_id");--> statement-breakpoint
CREATE INDEX "appel_payments_appel_id_idx" ON "appel_payments" USING btree ("appel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appel_payments_one_pending_uq" ON "appel_payments" USING btree ("appel_id") WHERE "appel_payments"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "appel_payments_receipt_uq" ON "appel_payments" USING btree ("syndicate_id","receipt_number") WHERE "appel_payments"."receipt_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_lines_external_uq" ON "bank_statement_lines" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "bank_statement_lines_account_status_idx" ON "bank_statement_lines" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "expenses_syndicate_status_idx" ON "expenses" USING btree ("syndicate_id","status");--> statement-breakpoint
CREATE INDEX "expenses_budget_line_id_idx" ON "expenses" USING btree ("budget_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_reference_uq" ON "expenses" USING btree ("syndicate_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_travaux_uq" ON "expenses" USING btree ("travaux_id") WHERE "expenses"."travaux_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_idempotency_uq" ON "expenses" USING btree ("syndicate_id","idempotency_key") WHERE "expenses"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_number_uq" ON "ledger_entries" USING btree ("syndicate_id","entry_number");--> statement-breakpoint
CREATE INDEX "ledger_entries_syndicate_date_idx" ON "ledger_entries" USING btree ("syndicate_id","entry_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_date_idx" ON "ledger_entries" USING btree ("account_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_source_uq" ON "ledger_entries" USING btree ("source_type","source_id") WHERE "ledger_entries"."source_type" IN ('opening', 'appel_payment');--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_reverses_uq" ON "ledger_entries" USING btree ("reverses_entry_id") WHERE "ledger_entries"."reverses_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_idempotency_uq" ON "ledger_entries" USING btree ("syndicate_id","idempotency_key") WHERE "ledger_entries"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_matches_pair_uq" ON "reconciliation_matches" USING btree ("statement_line_id","ledger_entry_id");--> statement-breakpoint
CREATE INDEX "reconciliation_matches_ledger_entry_idx" ON "reconciliation_matches" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE INDEX "treasury_accounts_syndicate_id_idx" ON "treasury_accounts" USING btree ("syndicate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "treasury_accounts_syndicate_rib_uq" ON "treasury_accounts" USING btree ("syndicate_id","rib") WHERE "treasury_accounts"."rib" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "treasury_accounts_default_uq" ON "treasury_accounts" USING btree ("syndicate_id","kind") WHERE "treasury_accounts"."is_default";--> statement-breakpoint
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_ledger_entry_id_idx" ON "transactions" USING btree ("ledger_entry_id");--> statement-breakpoint
-- Backfill 1: calls already settled before the journal existed are fully paid.
UPDATE "appels_de_fonds" SET "amount_paid" = "amount" WHERE "status" = 'paid' AND "amount" >= 0;--> statement-breakpoint
-- Backfill 2: a declaration awaiting validation becomes a pending payment row
-- (the payment history now lives in appel_payments).
INSERT INTO "appel_payments" ("syndicate_id", "appel_id", "amount", "method", "proof_url", "notes", "status", "declared_by", "created_at")
SELECT b."syndicate_id", a."id", a."amount" - a."amount_paid",
       CASE WHEN a."payment_method" IN ('virement', 'cheque', 'especes') THEN a."payment_method" ELSE 'virement' END,
       a."proof_url",
       CASE WHEN a."payment_method" IN ('virement', 'cheque', 'especes') THEN a."notes"
            ELSE concat_ws(' ', a."notes", '[migration: mode de paiement non renseigné]') END,
       'pending', 'legacy-migration', COALESCE(a."validated_at", now())
FROM "appels_de_fonds" a
JOIN "buildings" b ON b."id" = a."building_id"
WHERE a."status" = 'pending_validation' AND b."syndicate_id" IS NOT NULL AND a."amount" > a."amount_paid";--> statement-breakpoint
ALTER TABLE "appels_de_fonds" ADD CONSTRAINT "appels_amount_paid_range" CHECK ("appels_de_fonds"."amount_paid" >= 0 AND "appels_de_fonds"."amount_paid" <= "appels_de_fonds"."amount");--> statement-breakpoint
-- The journal is append-only: corrections are reversal entries. Only an
-- explicit maintenance session (SET LOCAL mizan.ledger_maintenance = 'on')
-- may remove rows, e.g. to purge test data.
CREATE OR REPLACE FUNCTION "ledger_entries_append_only"() RETURNS trigger AS $$
BEGIN
  IF current_setting('mizan.ledger_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ledger_entries is append-only: post a reversal entry instead of %', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "ledger_entries_no_update_delete" BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "ledger_entries_append_only"();--> statement-breakpoint
CREATE TRIGGER "ledger_entries_no_truncate" BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "ledger_entries_append_only"();
