CREATE TABLE "wellness_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"node_id" uuid,
	"stress" integer NOT NULL,
	"note" text,
	"created_day" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wellness_checkins" ADD CONSTRAINT "wellness_checkins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;