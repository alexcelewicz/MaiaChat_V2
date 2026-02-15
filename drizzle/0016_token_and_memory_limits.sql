ALTER TABLE "admin_settings" ADD COLUMN "memory_max_chars" integer DEFAULT 4000;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "default_max_tokens" integer DEFAULT 4096;