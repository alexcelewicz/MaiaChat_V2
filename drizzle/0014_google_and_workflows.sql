-- Migration: 0014_google_and_workflows
-- Description: Create tables for Google OAuth credentials and Workflow system
-- Date: 2026-02-01

-- ============================================================================
-- Google OAuth Credentials Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "google_credentials" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "access_token" text NOT NULL,
    "refresh_token" text NOT NULL,
    "expires_at" timestamp NOT NULL,
    "email" text,
    "scope" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "google_credentials_user_id_unique" UNIQUE("user_id")
);

-- ============================================================================
-- Workflows Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "workflows" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "description" text,
    "definition" jsonb NOT NULL,
    "status" text DEFAULT 'draft' NOT NULL,
    "is_template" boolean DEFAULT false NOT NULL,
    "tags" jsonb DEFAULT '[]'::jsonb,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "workflows_user_idx" ON "workflows" ("user_id");
CREATE INDEX IF NOT EXISTS "workflows_status_idx" ON "workflows" ("status");

-- ============================================================================
-- Workflow Runs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "workflow_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "status" text DEFAULT 'pending' NOT NULL,
    "current_step_id" text,
    "step_results" jsonb DEFAULT '{}'::jsonb,
    "pending_approval_step_id" text,
    "pending_approval_prompt" text,
    "pending_approval_items" jsonb,
    "resume_token" text UNIQUE,
    "input" jsonb,
    "output" jsonb,
    "error" text,
    "started_at" timestamp,
    "paused_at" timestamp,
    "completed_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_idx" ON "workflow_runs" ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_user_idx" ON "workflow_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_status_idx" ON "workflow_runs" ("status");
CREATE INDEX IF NOT EXISTS "workflow_runs_resume_token_idx" ON "workflow_runs" ("resume_token");

-- ============================================================================
-- Workflow Approvals Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "workflow_approvals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
    "step_id" text NOT NULL,
    "prompt" text NOT NULL,
    "items" jsonb,
    "approved" boolean,
    "approved_by" uuid REFERENCES "users"("id"),
    "approved_at" timestamp,
    "expires_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "workflow_approvals_run_idx" ON "workflow_approvals" ("run_id");
