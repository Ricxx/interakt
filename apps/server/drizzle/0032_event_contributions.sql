CREATE TABLE "event_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_contributions" ADD CONSTRAINT "event_contributions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_contributions" ADD CONSTRAINT "event_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TRIGGER IF EXISTS event_contributions_append_only ON event_contributions;--> statement-breakpoint
CREATE TRIGGER event_contributions_append_only
	BEFORE UPDATE OR DELETE ON event_contributions
	FOR EACH ROW EXECUTE FUNCTION ces_append_only();--> statement-breakpoint
DROP TRIGGER IF EXISTS event_contributions_no_truncate ON event_contributions;--> statement-breakpoint
CREATE TRIGGER event_contributions_no_truncate
	BEFORE TRUNCATE ON event_contributions
	FOR EACH STATEMENT EXECUTE FUNCTION ces_append_only();
