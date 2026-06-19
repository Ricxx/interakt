CREATE TABLE "dot_votes" (
	"activity_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"option_index" integer NOT NULL,
	"dots" integer NOT NULL,
	CONSTRAINT "dot_votes_activity_id_voter_id_option_index_pk" PRIMARY KEY("activity_id","voter_id","option_index")
);
--> statement-breakpoint
ALTER TABLE "dot_votes" ADD CONSTRAINT "dot_votes_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dot_votes" ADD CONSTRAINT "dot_votes_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;