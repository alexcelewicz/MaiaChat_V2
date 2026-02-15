ALTER TABLE "conversation_tags" DROP CONSTRAINT "conversation_tags_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "folders" DROP CONSTRAINT "folders_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "conversation_tags_pk";--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "color" text DEFAULT '#6366f1';--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_tags_conversation_id_idx" ON "conversation_tags" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_tags_unique_idx" ON "conversation_tags" USING btree ("conversation_id","tag");--> statement-breakpoint
CREATE INDEX "conversations_folder_id_idx" ON "conversations" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "folders_user_id_idx" ON "folders" USING btree ("user_id");