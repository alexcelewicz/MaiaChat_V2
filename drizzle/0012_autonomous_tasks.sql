-- Create autonomous_tasks table for Claude Code/Gemini CLI-like continuous operation
CREATE TABLE IF NOT EXISTS "autonomous_tasks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL,
    "task_key" text NOT NULL UNIQUE,
    "initial_prompt" text NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "current_step" integer DEFAULT 0,
    "max_steps" integer DEFAULT 50,
    "progress_summary" text,
    "last_tool_call" jsonb,
    "tool_calls_count" integer DEFAULT 0,
    "model_id" text NOT NULL,
    "agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
    "timeout_ms" integer DEFAULT 300000,
    "config" jsonb DEFAULT '{}'::jsonb,
    "queued_messages" jsonb DEFAULT '[]'::jsonb,
    "final_output" text,
    "error_message" text,
    "total_tokens_used" integer DEFAULT 0,
    "channel_account_id" uuid REFERENCES "channel_accounts"("id") ON DELETE SET NULL,
    "channel_id" text,
    "channel_thread_id" text,
    "notify_on_progress" boolean DEFAULT true,
    "progress_interval" integer DEFAULT 3,
    "started_at" timestamp,
    "completed_at" timestamp,
    "last_activity_at" timestamp DEFAULT now(),
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create indexes for autonomous_tasks
CREATE INDEX IF NOT EXISTS "autonomous_tasks_user_idx" ON "autonomous_tasks" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autonomous_tasks_status_idx" ON "autonomous_tasks" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autonomous_tasks_task_key_idx" ON "autonomous_tasks" ("task_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autonomous_tasks_channel_account_idx" ON "autonomous_tasks" ("channel_account_id");
--> statement-breakpoint

-- Add gemini_retrieval_model column to admin_settings for configurable file search model
ALTER TABLE "admin_settings" ADD COLUMN IF NOT EXISTS "gemini_retrieval_model" text DEFAULT 'gemini-3-flash-preview';
--> statement-breakpoint

-- Add user_profile_memory_enabled column for auto-learning user info
ALTER TABLE "admin_settings" ADD COLUMN IF NOT EXISTS "user_profile_memory_enabled" boolean DEFAULT true;
