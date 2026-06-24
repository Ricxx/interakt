CREATE TABLE "scoreboard_watchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoreboard_id" uuid NOT NULL,
	"name" text NOT NULL,
	"entrant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scoreboard_watchers" ADD CONSTRAINT "scoreboard_watchers_scoreboard_id_scoreboards_id_fk" FOREIGN KEY ("scoreboard_id") REFERENCES "public"."scoreboards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoreboard_watchers" ADD CONSTRAINT "scoreboard_watchers_entrant_id_scoreboard_entrants_id_fk" FOREIGN KEY ("entrant_id") REFERENCES "public"."scoreboard_entrants"("id") ON DELETE no action ON UPDATE no action;