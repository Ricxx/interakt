CREATE TABLE "team_assignments" (
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"team_index" integer NOT NULL,
	CONSTRAINT "team_assignments_activity_id_user_id_pk" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "team_assignments" ADD CONSTRAINT "team_assignments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_assignments" ADD CONSTRAINT "team_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;