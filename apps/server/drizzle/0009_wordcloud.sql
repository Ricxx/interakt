CREATE TABLE "wordcloud_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"word" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wordcloud_entries_activity_id_user_id_word_unique" UNIQUE("activity_id","user_id","word")
);
--> statement-breakpoint
ALTER TABLE "wordcloud_entries" ADD CONSTRAINT "wordcloud_entries_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wordcloud_entries" ADD CONSTRAINT "wordcloud_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;