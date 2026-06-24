CREATE TABLE "checklist_ticks" (
	"activity_id" uuid NOT NULL,
	"item_index" integer NOT NULL,
	"checked_by" uuid NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_ticks_activity_id_item_index_pk" PRIMARY KEY("activity_id","item_index")
);
--> statement-breakpoint
ALTER TABLE "checklist_ticks" ADD CONSTRAINT "checklist_ticks_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_ticks" ADD CONSTRAINT "checklist_ticks_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;