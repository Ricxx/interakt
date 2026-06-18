ALTER TABLE "recognitions" ALTER COLUMN "to_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "kind" text DEFAULT 'BIGUP' NOT NULL;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "recipient_type" text DEFAULT 'USER' NOT NULL;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "recipient_node_id" uuid;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "recipient_group_id" uuid;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "scope_kind" text DEFAULT 'NODE' NOT NULL;--> statement-breakpoint
ALTER TABLE "recognitions" ADD COLUMN "scope_id" uuid;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_recipient_node_id_org_nodes_id_fk" FOREIGN KEY ("recipient_node_id") REFERENCES "public"."org_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_recipient_group_id_groups_id_fk" FOREIGN KEY ("recipient_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;