CREATE TABLE "scoreboard_entrants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoreboard_id" uuid NOT NULL,
	"name" text NOT NULL,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "scoreboard_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoreboard_id" uuid NOT NULL,
	"entrant_id" uuid NOT NULL,
	"game" text DEFAULT '' NOT NULL,
	"points" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoreboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"mode" text DEFAULT 'SOLO' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scoreboard_entrants" ADD CONSTRAINT "scoreboard_entrants_scoreboard_id_scoreboards_id_fk" FOREIGN KEY ("scoreboard_id") REFERENCES "public"."scoreboards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoreboard_entrants" ADD CONSTRAINT "scoreboard_entrants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoreboard_scores" ADD CONSTRAINT "scoreboard_scores_scoreboard_id_scoreboards_id_fk" FOREIGN KEY ("scoreboard_id") REFERENCES "public"."scoreboards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoreboard_scores" ADD CONSTRAINT "scoreboard_scores_entrant_id_scoreboard_entrants_id_fk" FOREIGN KEY ("entrant_id") REFERENCES "public"."scoreboard_entrants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoreboard_scores" ADD CONSTRAINT "scoreboard_scores_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoreboards" ADD CONSTRAINT "scoreboards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoreboards" ADD CONSTRAINT "scoreboards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;