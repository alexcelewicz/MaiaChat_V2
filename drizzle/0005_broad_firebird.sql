CREATE TABLE "scheduled_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_account_id" uuid,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text,
	"is_enabled" boolean DEFAULT true,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"last_error" text,
	"run_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_tasks_user_idx" ON "scheduled_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_channel_idx" ON "scheduled_tasks" USING btree ("channel_account_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_next_run_idx" ON "scheduled_tasks" USING btree ("next_run_at");