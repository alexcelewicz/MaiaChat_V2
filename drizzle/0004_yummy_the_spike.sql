CREATE TABLE "channel_runtime_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"running" boolean DEFAULT false,
	"connected" boolean DEFAULT false,
	"last_start_at" timestamp,
	"last_stop_at" timestamp,
	"last_heartbeat_at" timestamp,
	"last_message_at" timestamp,
	"last_error" text,
	"error_count" integer DEFAULT 0,
	"consecutive_errors" integer DEFAULT 0,
	"message_count" integer DEFAULT 0,
	"total_tokens_used" integer DEFAULT 0,
	"total_cost_usd_cents_e6" integer DEFAULT 0,
	"process_id" text,
	"host_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_runtime_state_channel_account_id_unique" UNIQUE("channel_account_id")
);
--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD COLUMN "session_key" text;--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD COLUMN "channel_account_id" uuid;--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "channel_runtime_state" ADD CONSTRAINT "channel_runtime_state_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runtime_running_idx" ON "channel_runtime_state" USING btree ("running");--> statement-breakpoint
CREATE INDEX "runtime_channel_account_idx" ON "channel_runtime_state" USING btree ("channel_account_id");--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD CONSTRAINT "gateway_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD CONSTRAINT "gateway_sessions_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_sessions" ADD CONSTRAINT "gateway_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gateway_sessions_key_idx" ON "gateway_sessions" USING btree ("session_key");