CREATE TABLE "background_agent_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_key" text NOT NULL,
	"status" text DEFAULT 'stopped' NOT NULL,
	"last_heartbeat_at" timestamp,
	"heartbeat_interval_ms" integer DEFAULT 30000,
	"process_id" text,
	"host_name" text,
	"started_at" timestamp,
	"stopped_at" timestamp,
	"last_error" text,
	"error_count" integer DEFAULT 0,
	"total_tasks_run" integer DEFAULT 0,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "background_agent_state_agent_key_unique" UNIQUE("agent_key")
);
--> statement-breakpoint
CREATE TABLE "boot_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"run_on_channel_start" boolean DEFAULT false,
	"run_on_server_start" boolean DEFAULT true,
	"run_on_schedule" text,
	"is_enabled" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"last_run_at" timestamp,
	"last_status" text,
	"last_error" text,
	"last_output" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_trigger_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_id" uuid NOT NULL,
	"event_payload" jsonb,
	"status" text NOT NULL,
	"error" text,
	"output" text,
	"duration_ms" integer,
	"triggered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_type" text NOT NULL,
	"source_config" jsonb,
	"action_type" text NOT NULL,
	"action_config" jsonb,
	"is_enabled" boolean DEFAULT true,
	"max_triggers_per_hour" integer DEFAULT 60,
	"cooldown_seconds" integer DEFAULT 0,
	"last_triggered_at" timestamp,
	"trigger_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proactive_message_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"target_id" text NOT NULL,
	"messages_this_hour" integer DEFAULT 0,
	"messages_this_day" integer DEFAULT 0,
	"last_message_at" timestamp,
	"hour_reset_at" timestamp,
	"day_reset_at" timestamp,
	"max_per_hour" integer DEFAULT 10,
	"max_per_day" integer DEFAULT 100,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_rate_limit_target" UNIQUE("user_id","channel_account_id","target_id")
);
--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "background_agent_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "background_agent_auto_start" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "proactive_messaging_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "event_triggers_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "boot_scripts_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "default_proactive_max_per_hour" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "default_proactive_max_per_day" integer DEFAULT 100;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "default_trigger_max_per_hour" integer DEFAULT 60;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "session_target" text DEFAULT 'isolated';--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "wake_mode" text DEFAULT 'now';--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "isolation" jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "include_recent_messages" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "state" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "last_output" text;--> statement-breakpoint
ALTER TABLE "boot_scripts" ADD CONSTRAINT "boot_scripts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_trigger_logs" ADD CONSTRAINT "event_trigger_logs_trigger_id_event_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."event_triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_triggers" ADD CONSTRAINT "event_triggers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_message_rate_limits" ADD CONSTRAINT "proactive_message_rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_message_rate_limits" ADD CONSTRAINT "proactive_message_rate_limits_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "background_agent_key_idx" ON "background_agent_state" USING btree ("agent_key");--> statement-breakpoint
CREATE INDEX "background_agent_status_idx" ON "background_agent_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "boot_scripts_user_idx" ON "boot_scripts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "boot_scripts_enabled_idx" ON "boot_scripts" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "boot_scripts_priority_idx" ON "boot_scripts" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "event_trigger_logs_trigger_idx" ON "event_trigger_logs" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "event_trigger_logs_triggered_at_idx" ON "event_trigger_logs" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "event_triggers_user_idx" ON "event_triggers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_triggers_source_type_idx" ON "event_triggers" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "event_triggers_enabled_idx" ON "event_triggers" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "rate_limit_user_target_idx" ON "proactive_message_rate_limits" USING btree ("user_id","channel_account_id","target_id");