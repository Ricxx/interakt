ALTER TABLE "lists" ADD COLUMN "scope_kind" text DEFAULT 'ALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "scope_id" uuid;