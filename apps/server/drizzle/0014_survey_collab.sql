CREATE TABLE "survey_collaborators" (
	"survey_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "survey_collaborators_survey_id_user_id_pk" PRIMARY KEY("survey_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "survey_edits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"survey_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"show_to_takers" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "survey_questions" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "survey_collaborators" ADD CONSTRAINT "survey_collaborators_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_collaborators" ADD CONSTRAINT "survey_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_edits" ADD CONSTRAINT "survey_edits_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_edits" ADD CONSTRAINT "survey_edits_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_sections" ADD CONSTRAINT "survey_sections_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;