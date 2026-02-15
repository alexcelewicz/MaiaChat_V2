-- Agent Continuation: Session Persistence & Cross-Task Messaging
-- Phase 5 of UNIFIED_ROADMAP.md

-- Add parent_task_id for sub-task spawning (self-referential foreign key)
ALTER TABLE "autonomous_tasks" ADD COLUMN IF NOT EXISTS "parent_task_id" uuid REFERENCES "autonomous_tasks"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Add session_state for persisting run state (survives restarts)
-- Contains: isRunning, queuedMessages (backup), lastStep, checkpoint data
ALTER TABLE "autonomous_tasks" ADD COLUMN IF NOT EXISTS "session_state" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint

-- Add spawn_depth to limit nested sub-task spawning
ALTER TABLE "autonomous_tasks" ADD COLUMN IF NOT EXISTS "spawn_depth" integer DEFAULT 0;
--> statement-breakpoint

-- Create index for parent task lookups
CREATE INDEX IF NOT EXISTS "autonomous_tasks_parent_idx" ON "autonomous_tasks" ("parent_task_id");
--> statement-breakpoint

-- Cross-Task Message Queue Table
-- Allows agents to send messages to each other
CREATE TABLE IF NOT EXISTS "task_messages" (
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

-- Indexes for efficient message retrieval
CREATE INDEX IF NOT EXISTS "task_messages_to_task_idx" ON "task_messages" ("to_task_key", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_messages_from_task_idx" ON "task_messages" ("from_task_key");
--> statement-breakpoint

