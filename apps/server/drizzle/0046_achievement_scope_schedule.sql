ALTER TABLE "achievements" ADD COLUMN "scope_kind" text DEFAULT 'ALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "scope_id" uuid;--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "active_from" date;--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN "active_until" date;