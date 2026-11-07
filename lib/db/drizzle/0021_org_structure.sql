-- Configurable organizational structure of a condominium (2026-11-07).
-- A structure holds components (statutory bodies, optional internal
-- committees, custom components), their positions, the members assigned to
-- them (with mandate periods, never deleted) and committee tasks. Versions keep
-- a snapshot of every activated configuration.
-- An assignment never changes users.role: a committee member gets no syndic
-- or treasurer privilege; committee permissions only open the committee's own
-- workspace (tasks, recommendations, reports).
-- Additive only: no existing table is changed.
--
-- Reversal (data in these tables is lost):
--   DROP TABLE IF EXISTS "org_tasks", "org_assignments", "org_positions", "org_components", "org_structure_versions", "org_structures";

CREATE TABLE IF NOT EXISTS "org_structures" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "syndicate_id" text NOT NULL REFERENCES "syndicates"("id") ON DELETE CASCADE,
  -- draft (being configured) | active
  "status" text NOT NULL DEFAULT 'draft',
  "template" text,
  -- answers of the wizard (type of residence, buildings, facilities…)
  "profile" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "version" integer NOT NULL DEFAULT 0,
  "activated_at" timestamp,
  "activated_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "org_structures_status_chk" CHECK ("status" IN ('draft', 'active'))
);--> statement-breakpoint
-- One structure per condominium.
CREATE UNIQUE INDEX IF NOT EXISTS "org_structures_syndicate_idx" ON "org_structures" ("syndicate_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "org_structure_versions" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "structure_id" text NOT NULL REFERENCES "org_structures"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "reason" text,
  -- general assembly that decided the change, when there is one
  "decision_meeting_id" text REFERENCES "meetings"("id") ON DELETE SET NULL,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "org_structure_versions_unique" UNIQUE ("structure_id", "version")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "org_components" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "structure_id" text NOT NULL REFERENCES "org_structures"("id") ON DELETE CASCADE,
  "syndicate_id" text NOT NULL REFERENCES "syndicates"("id") ON DELETE CASCADE,
  -- statutory (general assembly, syndic, deputy: protected) | committee | custom
  "category" text NOT NULL,
  -- general_assembly | syndic | vice_syndic | syndicate_council | financial | maintenance | security
  -- | communication | social | environment | legal | audit | parking | building | custom
  "type" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "objectives" text,
  "responsibilities" text[] NOT NULL DEFAULT '{}',
  -- active | inactive | closed
  "status" text NOT NULL DEFAULT 'active',
  "reporting_frequency" text,
  -- members (every resident of the condominium) | team | component (its members and the syndic)
  "visibility" text NOT NULL DEFAULT 'members',
  "starts_on" date,
  "ends_on" date,
  "close_reason" text,
  "closed_at" timestamp,
  "decision_meeting_id" text REFERENCES "meetings"("id") ON DELETE SET NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "org_components_category_chk" CHECK ("category" IN ('statutory', 'committee', 'custom')),
  CONSTRAINT "org_components_status_chk" CHECK ("status" IN ('active', 'inactive', 'closed')),
  CONSTRAINT "org_components_visibility_chk" CHECK ("visibility" IN ('members', 'team', 'component')),
  CONSTRAINT "org_components_dates_chk" CHECK ("ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_components_structure_idx" ON "org_components" ("structure_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_components_syndicate_idx" ON "org_components" ("syndicate_id");--> statement-breakpoint
-- A statutory body exists once per structure.
CREATE UNIQUE INDEX IF NOT EXISTS "org_components_statutory_idx" ON "org_components" ("structure_id", "type") WHERE "category" = 'statutory';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "org_positions" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "component_id" text NOT NULL REFERENCES "org_components"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "responsibilities" text[] NOT NULL DEFAULT '{}',
  -- capabilities inside the committee workspace (see lib org-permissions); never a legal power
  "permissions" text[] NOT NULL DEFAULT '{}',
  "scope" text,
  "is_leader" boolean NOT NULL DEFAULT false,
  "max_holders" integer,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "org_positions_status_chk" CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "org_positions_max_chk" CHECK ("max_holders" IS NULL OR "max_holders" >= 1)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_positions_component_idx" ON "org_positions" ("component_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "org_assignments" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "syndicate_id" text NOT NULL REFERENCES "syndicates"("id") ON DELETE CASCADE,
  "component_id" text NOT NULL REFERENCES "org_components"("id") ON DELETE CASCADE,
  "position_id" text NOT NULL REFERENCES "org_positions"("id") ON DELETE RESTRICT,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  -- holder | substitute
  "kind" text NOT NULL DEFAULT 'holder',
  "start_date" date NOT NULL,
  "end_date" date,
  -- active | ended
  "status" text NOT NULL DEFAULT 'active',
  "end_reason" text,
  "replaced_by" text REFERENCES "org_assignments"("id") ON DELETE SET NULL,
  "decision_meeting_id" text REFERENCES "meetings"("id") ON DELETE SET NULL,
  "decision_document_id" text REFERENCES "documents"("id") ON DELETE SET NULL,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "org_assignments_kind_chk" CHECK ("kind" IN ('holder', 'substitute')),
  CONSTRAINT "org_assignments_status_chk" CHECK ("status" IN ('active', 'ended')),
  CONSTRAINT "org_assignments_dates_chk" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_assignments_component_idx" ON "org_assignments" ("component_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_assignments_user_idx" ON "org_assignments" ("user_id");--> statement-breakpoint
-- The same person holds a position once at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "org_assignments_active_idx" ON "org_assignments" ("position_id", "user_id") WHERE "status" = 'active';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "org_tasks" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "syndicate_id" text NOT NULL REFERENCES "syndicates"("id") ON DELETE CASCADE,
  "component_id" text NOT NULL REFERENCES "org_components"("id") ON DELETE CASCADE,
  -- task | recommendation (addressed to the syndic, who alone decides) | report
  "kind" text NOT NULL DEFAULT 'task',
  "title" text NOT NULL,
  "description" text,
  -- open | in_progress | done | cancelled
  "status" text NOT NULL DEFAULT 'open',
  "assignee_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "due_date" date,
  -- answer of the syndic to a recommendation: accepted | declined (his decision, recorded)
  "syndic_response" text,
  "syndic_response_note" text,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "org_tasks_kind_chk" CHECK ("kind" IN ('task', 'recommendation', 'report')),
  CONSTRAINT "org_tasks_status_chk" CHECK ("status" IN ('open', 'in_progress', 'done', 'cancelled')),
  CONSTRAINT "org_tasks_response_chk" CHECK ("syndic_response" IS NULL OR "syndic_response" IN ('accepted', 'declined'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_tasks_component_idx" ON "org_tasks" ("component_id");
