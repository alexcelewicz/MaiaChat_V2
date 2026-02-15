CREATE TABLE "auto_reply_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_account_id" uuid,
	"name" text NOT NULL,
	"priority" integer DEFAULT 0,
	"is_enabled" boolean DEFAULT true,
	"trigger_type" text NOT NULL,
	"trigger_pattern" text,
	"trigger_config" jsonb,
	"action_type" text NOT NULL,
	"action_config" jsonb,
	"max_triggers_per_hour" integer,
	"cooldown_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_type" text NOT NULL,
	"channel_id" text NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true,
	"config" jsonb,
	"display_name" text,
	"avatar_url" text,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_channel_account" UNIQUE("user_id","channel_type","channel_id")
);
--> statement-breakpoint
CREATE TABLE "channel_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"conversation_id" uuid,
	"external_message_id" text NOT NULL,
	"external_thread_id" text,
	"direction" text NOT NULL,
	"content" text NOT NULL,
	"content_type" text DEFAULT 'text',
	"attachments" jsonb,
	"sender_external_id" text,
	"sender_display_name" text,
	"status" text DEFAULT 'pending',
	"error_message" text,
	"was_processed_by_ai" boolean DEFAULT false,
	"ai_response_message_id" uuid,
	"processing_latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "gateway_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token" text NOT NULL,
	"status" text DEFAULT 'active',
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"disconnected_at" timestamp,
	"client_info" jsonb,
	"active_channels" text[],
	"memory_usage_mb" integer,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "gateway_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"version" text NOT NULL,
	"description" text,
	"author" text,
	"icon" text,
	"icon_url" text,
	"category" text,
	"source_type" text DEFAULT 'builtin' NOT NULL,
	"source_url" text,
	"config_schema" jsonb,
	"tool_definitions" jsonb,
	"required_permissions" text[],
	"permissions" text[],
	"is_enabled" boolean DEFAULT true,
	"is_verified" boolean DEFAULT false,
	"is_builtin" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skills_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"config" jsonb,
	"is_enabled" boolean DEFAULT true,
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_skill" UNIQUE("user_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "index" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "start_offset" integer;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "end_offset" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "mime_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "size" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "status" text DEFAULT 'uploaded' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processed_text" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "chunk_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD CONSTRAINT "gateway_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_reply_rules_user_idx" ON "auto_reply_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auto_reply_rules_channel_idx" ON "auto_reply_rules" USING btree ("channel_account_id");--> statement-breakpoint
CREATE INDEX "auto_reply_rules_priority_idx" ON "auto_reply_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "channel_accounts_user_idx" ON "channel_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_accounts_type_idx" ON "channel_accounts" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "channel_messages_account_idx" ON "channel_messages" USING btree ("channel_account_id");--> statement-breakpoint
CREATE INDEX "channel_messages_external_idx" ON "channel_messages" USING btree ("external_message_id");--> statement-breakpoint
CREATE INDEX "channel_messages_conversation_idx" ON "channel_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "gateway_sessions_user_idx" ON "gateway_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gateway_sessions_status_idx" ON "gateway_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_skills_user_idx" ON "user_skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_skills_skill_idx" ON "user_skills" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agents_conversation_id_idx" ON "agents" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agents_template_idx" ON "agents" USING btree ("user_id","is_template");--> statement-breakpoint
CREATE INDEX "chunks_index_idx" ON "chunks" USING btree ("document_id","index");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
ALTER TABLE "chunks" DROP COLUMN "chunk_index";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "file_type";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "file_size";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "uploaded_at";