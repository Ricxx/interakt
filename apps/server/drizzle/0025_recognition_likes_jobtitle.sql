CREATE TABLE "recognition_likes" (
	"recognition_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "recognition_likes_recognition_id_user_id_pk" PRIMARY KEY("recognition_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "recognition_likes" ADD CONSTRAINT "recognition_likes_recognition_id_recognitions_id_fk" FOREIGN KEY ("recognition_id") REFERENCES "public"."recognitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_likes" ADD CONSTRAINT "recognition_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;