-- Phase Superiority: CRM + Integration credential tables
-- Safe re-runnable migration using IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS "crm_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "company" text,
  "role" text,
  "avatar_url" text,
  "relationship" text DEFAULT 'colleague',
  "importance" text DEFAULT 'normal',
  "tags" jsonb DEFAULT '[]'::jsonb,
  "relationship_score" integer DEFAULT 50,
  "last_contact_at" timestamp,
  "contact_frequency_days" integer,
  "linkedin_url" text,
  "twitter_handle" text,
  "notes" text,
  "enrichment_data" jsonb,
  "merged_into_id" uuid,
  "external_ids" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_contacts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "crm_contacts_user_id_idx" ON "crm_contacts" ("user_id");
CREATE INDEX IF NOT EXISTS "crm_contacts_user_email_idx" ON "crm_contacts" ("user_id", "email");
CREATE INDEX IF NOT EXISTS "crm_contacts_user_name_idx" ON "crm_contacts" ("user_id", "name");
CREATE INDEX IF NOT EXISTS "crm_contacts_user_score_idx" ON "crm_contacts" ("user_id", "relationship_score");

CREATE TABLE IF NOT EXISTS "crm_interactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "channel" text,
  "subject" text,
  "summary" text,
  "sentiment" text,
  "external_id" text,
  "metadata" jsonb,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "crm_interactions_contact_id_crm_contacts_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE cascade,
  CONSTRAINT "crm_interactions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "crm_interactions_contact_id_idx" ON "crm_interactions" ("contact_id");
CREATE INDEX IF NOT EXISTS "crm_interactions_user_id_idx" ON "crm_interactions" ("user_id");
CREATE INDEX IF NOT EXISTS "crm_interactions_type_idx" ON "crm_interactions" ("type");
CREATE INDEX IF NOT EXISTS "crm_interactions_occurred_at_idx" ON "crm_interactions" ("occurred_at");

CREATE TABLE IF NOT EXISTS "hubspot_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "portal_id" text,
  "scope" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "hubspot_credentials_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "hubspot_credentials_user_id_unique" ON "hubspot_credentials" ("user_id");

CREATE TABLE IF NOT EXISTS "asana_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "workspace_id" text,
  "scope" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "asana_credentials_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "asana_credentials_user_id_unique" ON "asana_credentials" ("user_id");
