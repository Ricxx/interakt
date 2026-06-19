CREATE TABLE "poker_votes" (
	"activity_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"card" text NOT NULL,
	CONSTRAINT "poker_votes_activity_id_voter_id_pk" PRIMARY KEY("activity_id","voter_id")
);
--> statement-breakpoint
ALTER TABLE "poker_votes" ADD CONSTRAINT "poker_votes_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poker_votes" ADD CONSTRAINT "poker_votes_voter_id_users_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;