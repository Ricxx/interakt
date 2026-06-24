CREATE TABLE "marketplace_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"code" text NOT NULL,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "marketplace_items" ADD COLUMN "redemption_info" text;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "marketplace_codes" ADD CONSTRAINT "marketplace_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_codes" ADD CONSTRAINT "marketplace_codes_item_id_marketplace_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."marketplace_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_codes" ADD CONSTRAINT "marketplace_codes_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;