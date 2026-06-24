CREATE TABLE "complaint_routes" (
	"tenant_id" uuid NOT NULL,
	"category" text NOT NULL,
	"target_node_id" uuid NOT NULL,
	CONSTRAINT "complaint_routes_tenant_id_category_pk" PRIMARY KEY("tenant_id","category")
);
--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "complaint_routes" ADD CONSTRAINT "complaint_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_routes" ADD CONSTRAINT "complaint_routes_target_node_id_org_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."org_nodes"("id") ON DELETE no action ON UPDATE no action;