CREATE TABLE "straws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"length" integer NOT NULL,
	"picked_by" uuid,
	"picked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "straws" ADD CONSTRAINT "straws_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "straws" ADD CONSTRAINT "straws_picked_by_users_id_fk" FOREIGN KEY ("picked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;