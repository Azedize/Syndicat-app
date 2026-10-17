CREATE TABLE "bank_statements" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"syndicate_id" text NOT NULL,
	"account_id" text NOT NULL,
	"reference" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"opening_balance" numeric(12, 2) NOT NULL,
	"closing_balance" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closing_report" jsonb,
	"closed_by" text,
	"closed_at" timestamp,
	"reopened_by" text,
	"reopened_at" timestamp,
	"reopen_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bank_statements_status_chk" CHECK ("bank_statements"."status" IN ('open', 'closed')),
	CONSTRAINT "bank_statements_period_chk" CHECK ("bank_statements"."period_end" >= "bank_statements"."period_start")
);
--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_status_chk";--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD COLUMN "statement_id" text;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_syndicate_id_syndicates_id_fk" FOREIGN KEY ("syndicate_id") REFERENCES "public"."syndicates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_account_id_treasury_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."treasury_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_statements_account_period_idx" ON "bank_statements" USING btree ("account_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statements_account_start_uq" ON "bank_statements" USING btree ("account_id","period_start");--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_statement_id_bank_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_statement_lines_statement_idx" ON "bank_statement_lines" USING btree ("statement_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_status_chk" CHECK ("expenses"."status" IN ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled'));