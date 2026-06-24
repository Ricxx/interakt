ALTER TABLE "tenants" ADD COLUMN "brand_logo_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "welcome_message" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "terms" jsonb DEFAULT '{}'::jsonb NOT NULL;