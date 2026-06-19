CREATE TABLE "points_leave_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	CONSTRAINT "points_leave_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"created_day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "points_leave_days" ADD CONSTRAINT "points_leave_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TRIGGER IF EXISTS points_ledger_append_only ON points_ledger;--> statement-breakpoint
CREATE TRIGGER points_ledger_append_only
	BEFORE UPDATE OR DELETE ON points_ledger
	FOR EACH ROW EXECUTE FUNCTION ces_append_only();--> statement-breakpoint
DROP TRIGGER IF EXISTS points_ledger_no_truncate ON points_ledger;--> statement-breakpoint
CREATE TRIGGER points_ledger_no_truncate
	BEFORE TRUNCATE ON points_ledger
	FOR EACH STATEMENT EXECUTE FUNCTION ces_append_only();
