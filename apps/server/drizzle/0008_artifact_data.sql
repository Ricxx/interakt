ALTER TABLE "session_artifacts" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_artifacts" ADD COLUMN "data" text;--> statement-breakpoint
ALTER TABLE "session_artifacts" ADD COLUMN "chart_type" text;