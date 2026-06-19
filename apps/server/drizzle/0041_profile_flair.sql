ALTER TABLE "marketplace_items" ADD COLUMN "kind" text DEFAULT 'PERK' NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "augment" text;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "augment" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "flair" text;