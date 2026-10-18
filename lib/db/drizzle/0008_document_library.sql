ALTER TABLE "document_versions" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "visibility" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "entity_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "lot_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "checksum" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_entity_idx" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "documents_lot_id_idx" ON "documents" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "documents_syndicate_checksum_idx" ON "documents" USING btree ("syndicate_id","checksum");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_chk" CHECK ("documents"."source" IN ('generated', 'upload'));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_visibility_chk" CHECK ("documents"."visibility" IS NULL OR "documents"."visibility" IN ('syndic', 'council', 'owners', 'residents', 'unit', 'personal'));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_unit_lot_chk" CHECK ("documents"."visibility" IS DISTINCT FROM 'unit' OR "documents"."lot_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_personal_subject_chk" CHECK ("documents"."visibility" IS DISTINCT FROM 'personal' OR "documents"."subject_user_id" IS NOT NULL);--> statement-breakpoint
-- Files attached through the former two-step upload kept their path in
-- "content": they are uploads, not generated documents.
UPDATE "documents" SET "source" = 'upload' WHERE "file_url" IS NULL AND "content" LIKE '/objects/%';
