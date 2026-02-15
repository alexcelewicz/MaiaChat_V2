CREATE TABLE "admin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auto_start_channels" boolean DEFAULT false,
	"ip_filtering_enabled" boolean DEFAULT false,
	"visitor_retention_days" integer DEFAULT 30,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"label" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"path" text NOT NULL,
	"method" text NOT NULL,
	"ip_address" text,
	"country" text,
	"region" text,
	"city" text,
	"latitude" text,
	"longitude" text,
	"timezone" text,
	"user_agent" text,
	"referer" text,
	"is_bot" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_settings_created_at_idx" ON "admin_settings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ip_blocks_ip_idx" ON "ip_blocks" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "ip_blocks_active_idx" ON "ip_blocks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "page_visits_user_idx" ON "page_visits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "page_visits_ip_idx" ON "page_visits" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "page_visits_created_at_idx" ON "page_visits" USING btree ("created_at");