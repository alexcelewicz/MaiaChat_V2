ALTER TABLE "scheduled_tasks" ADD COLUMN "lock_owner" text;
ALTER TABLE "scheduled_tasks" ADD COLUMN "lock_expires_at" timestamp;
ALTER TABLE "scheduled_tasks" ADD COLUMN "running_at" timestamp;
