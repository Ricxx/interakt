CREATE TABLE "fist_votes" (
	"activity_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "fist_votes_activity_id_voter_id_pk" PRIMARY KEY("activity_id","voter_id")
);
--> statement-breakpoint
ALTER TABLE "fist_votes" ADD CONSTRAINT "fist_votes_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fist_votes" ADD CONSTRAINT "fist_votes_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;