CREATE TABLE "gemini_store_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"gemini_document_name" text,
	"gemini_state" text DEFAULT 'pending',
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"last_sync_at" timestamp,
	CONSTRAINT "unique_store_document" UNIQUE("store_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "gemini_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"gemini_store_name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6366f1',
	"document_count" integer DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_gemini_store" UNIQUE("user_id","gemini_store_name")
);
--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "local_file_access_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "command_execution_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "admin_settings" ADD COLUMN "file_access_base_dir" text;--> statement-breakpoint
ALTER TABLE "gemini_store_documents" ADD CONSTRAINT "gemini_store_documents_store_id_gemini_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."gemini_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gemini_store_documents" ADD CONSTRAINT "gemini_store_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gemini_stores" ADD CONSTRAINT "gemini_stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gemini_store_docs_store_id_idx" ON "gemini_store_documents" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "gemini_store_docs_document_id_idx" ON "gemini_store_documents" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "gemini_stores_user_id_idx" ON "gemini_stores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gemini_stores_name_idx" ON "gemini_stores" USING btree ("gemini_store_name");