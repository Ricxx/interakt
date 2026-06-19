CREATE TABLE "qna_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"answered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qna_upvotes" (
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "qna_upvotes_question_id_user_id_pk" PRIMARY KEY("question_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "qna_questions" ADD CONSTRAINT "qna_questions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qna_questions" ADD CONSTRAINT "qna_questions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qna_upvotes" ADD CONSTRAINT "qna_upvotes_question_id_qna_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."qna_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qna_upvotes" ADD CONSTRAINT "qna_upvotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;