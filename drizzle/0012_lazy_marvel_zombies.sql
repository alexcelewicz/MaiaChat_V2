CREATE TABLE "autonomous_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"task_key" text NOT NULL,
	"initial_prompt" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_step" integer DEFAULT 0,
	"max_steps" integer DEFAULT 50,
	"progress_summary" text,
	"last_tool_call" jsonb,
	"tool_calls_count" integer DEFAULT 0,
	"model_id" text NOT NULL,
	"agent_id" uuid,
	"timeout_ms" integer DEFAULT 300000,
	"config" jsonb DEFAULT '{}'::jsonb,
	"queued_messages" jsonb DEFAULT '[]'::jsonb,
	"final_output" text,
	"error_message" text,
	"total_tokens_used" integer DEFAULT 0,
	"channel_account_id" uuid,
	"channel_id" text,
	"channel_thread_id" text,
	"notify_on_progress" boolean DEFAULT true,
	"progress_interval" integer DEFAULT 3,
	"parent_task_id" uuid,
	"session_state" jsonb DEFAULT '{}'::jsonb,
	"spawn_depth" integer DEFAULT 0,
	"started_at" timestamp,
	"completed_at" timestamp,
	"last_activity_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "autonomous_tasks_task_key_unique" UNIQUE("task_key")
);
--> statement-breakpoint
CREATE TABLE "google_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"email" text,
	"scope" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "google_credentials_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "model_failover_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"primary_model" text NOT NULL,
	"fallback_models" jsonb DEFAULT '[]'::jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"max_retries" integer DEFAULT 2,
	"retry_delay_ms" integer DEFAULT 1000,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"icon" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proactive_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"icon" text,
	"default_prompt" text NOT NULL,
	"default_cron" text NOT NULL,
	"default_timezone" text DEFAULT 'UTC',
	"required_tools" jsonb DEFAULT '[]'::jsonb,
	"required_integrations" jsonb DEFAULT '[]'::jsonb,
	"config_schema" jsonb,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_task_key" text NOT NULL,
	"to_task_key" text NOT NULL,
	"message_type" text DEFAULT 'message' NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_execution_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"tool_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"action" text,
	"params" jsonb,
	"result" text NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tool_id" text NOT NULL,
	"is_allowed" boolean DEFAULT true NOT NULL,
	"max_calls_per_hour" integer,
	"max_calls_per_day" integer,
	"granted_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_tool_perm" UNIQUE("user_id","tool_id")
);
--> statement-breakpoint
CREATE TABLE "user_onboarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb,
	"current_step" text DEFAULT 'welcome',
	"is_complete" boolean DEFAULT false NOT NULL,
	"skipped_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_onboarding_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"prompt" text NOT NULL,
	"items" jsonb,
	"approved" boolean,
	"approved_by" uuid,
	"approved_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_step_id" text,
	"step_results" jsonb DEFAULT '{}'::jsonb,
	"pending_approval_step_id" text,
	"pending_approval_prompt" text,
	"pending_approval_items" jsonb,
	"resume_token" text,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp,
	"paused_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_runs_resume_token_unique" UNIQUE("resume_token")
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "gemini_retrieval_model" text DEFAULT 'gemini-3-flash-preview';--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "user_profile_memory_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "memory_max_chars" integer DEFAULT 4000;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "default_max_tokens" integer DEFAULT 4096;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "lock_owner" text;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "lock_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "running_at" timestamp;--> statement-breakpoint
ALTER TABLE "autonomous_tasks" ADD CONSTRAINT "autonomous_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_tasks" ADD CONSTRAINT "autonomous_tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_tasks" ADD CONSTRAINT "autonomous_tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomous_tasks" ADD CONSTRAINT "autonomous_tasks_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_credentials" ADD CONSTRAINT "google_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_failover_config" ADD CONSTRAINT "model_failover_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_execution_logs" ADD CONSTRAINT "tool_execution_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_execution_logs" ADD CONSTRAINT "tool_execution_logs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_permissions" ADD CONSTRAINT "tool_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_permissions" ADD CONSTRAINT "tool_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autonomous_tasks_user_idx" ON "autonomous_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "autonomous_tasks_status_idx" ON "autonomous_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "autonomous_tasks_task_key_idx" ON "autonomous_tasks" USING btree ("task_key");--> statement-breakpoint
CREATE INDEX "autonomous_tasks_channel_account_idx" ON "autonomous_tasks" USING btree ("channel_account_id");--> statement-breakpoint
CREATE INDEX "autonomous_tasks_parent_idx" ON "autonomous_tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "task_messages_to_task_idx" ON "task_messages" USING btree ("to_task_key","status");--> statement-breakpoint
CREATE INDEX "task_messages_from_task_idx" ON "task_messages" USING btree ("from_task_key");--> statement-breakpoint
CREATE INDEX "tool_exec_logs_user_idx" ON "tool_execution_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_exec_logs_tool_idx" ON "tool_execution_logs" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "tool_exec_logs_created_idx" ON "tool_execution_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_approvals_run_idx" ON "workflow_approvals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_user_idx" ON "workflow_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_runs_resume_token_idx" ON "workflow_runs" USING btree ("resume_token");--> statement-breakpoint
CREATE INDEX "workflows_user_idx" ON "workflows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflows_status_idx" ON "workflows" USING btree ("status");