ALTER TABLE "marketplace_items" ADD COLUMN "augment_kind" text;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "augment_kind" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name_color" text;--> statement-breakpoint
UPDATE "marketplace_items" SET "augment_kind" = 'FLAIR' WHERE "kind" = 'PROFILE' AND "augment" IS NOT NULL AND "augment_kind" IS NULL;--> statement-breakpoint
UPDATE "redemptions" SET "augment_kind" = 'FLAIR' WHERE "augment" IS NOT NULL AND "augment_kind" IS NULL;