CREATE TABLE "checkin_rewards" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "checkin_rewards_tenant_id_day_pk" PRIMARY KEY("tenant_id","day")
);
--> statement-breakpoint
ALTER TABLE "checkin_rewards" ADD CONSTRAINT "checkin_rewards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;