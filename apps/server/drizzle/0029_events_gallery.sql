CREATE TABLE "event_photo_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_photo_likes" (
	"photo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "event_photo_likes_photo_id_user_id_pk" PRIMARY KEY("photo_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "event_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"added_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_photos_event_id_number_unique" UNIQUE("event_id","number")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text DEFAULT 'PLAN' NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"scope_kind" text DEFAULT 'NODE' NOT NULL,
	"scope_id" uuid,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"goal_amount" integer,
	"gallery_anon" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_photo_comments" ADD CONSTRAINT "event_photo_comments_photo_id_event_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."event_photos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photo_comments" ADD CONSTRAINT "event_photo_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photo_likes" ADD CONSTRAINT "event_photo_likes_photo_id_event_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."event_photos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photo_likes" ADD CONSTRAINT "event_photo_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;