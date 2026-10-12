CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'PAUSED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."agent_message_role" AS ENUM('USER', 'AGENT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."agent_state" AS ENUM('ONBOARDING', 'DISCOVERY', 'WAITING_POOL', 'BATCH_READY', 'BATCH_OPEN', 'DEBRIEF_DUE');--> statement-breakpoint
CREATE TYPE "public"."ai_call_purpose" AS ENUM('CHAT', 'EXTRACT', 'EMBED', 'PORTRAIT', 'REASONS', 'DEBRIEF', 'OPENER');--> statement-breakpoint
CREATE TYPE "public"."batch_decision" AS ENUM('INTERESTED', 'PASS', 'TELL_ME_MORE');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('OPEN', 'DEBRIEF_DUE', 'DONE', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."embedding_kind" AS ENUM('SELF', 'SEEKING');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('PENDING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('WOMAN', 'MAN', 'NON_BINARY');--> statement-breakpoint
CREATE TYPE "public"."intro_state" AS ENUM('OPEN', 'CONTINUED', 'FADED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'fr');--> statement-breakpoint
CREATE TYPE "public"."photo_moderation_status" AS ENUM('UPLOADING', 'PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."push_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."relationship_intent" AS ENUM('LONG_TERM', 'OPEN_TO_LONG_TERM', 'CASUAL', 'FRIENDSHIP_FIRST', 'NOT_SURE');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('UNDERAGE', 'THREAT', 'HARASSMENT', 'HATE', 'SCAM', 'FAKE_PROFILE', 'INAPPROPRIATE_PHOTO', 'OFFLINE_BEHAVIOUR', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'REVIEWED', 'ACTIONED', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"birth_date" date NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"consent_version" varchar(20) NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "accounts_email_lower" CHECK ("accounts"."email" = lower("accounts"."email"))
);
--> statement-breakpoint
CREATE TABLE "auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"token" varchar(255) PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"platform" "push_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"storage_key" varchar(200) NOT NULL,
	"mime_type" varchar(40) NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"blurhash" varchar(100),
	"moderation_status" "photo_moderation_status" DEFAULT 'UPLOADING' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_photos_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(40),
	"gender" "gender",
	"seeking_genders" "gender"[] DEFAULT '{}'::gender[] NOT NULL,
	"age_min" smallint DEFAULT 18 NOT NULL,
	"age_max" smallint DEFAULT 99 NOT NULL,
	"intent" "relationship_intent",
	"radius_km" smallint DEFAULT 25 NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"geo_precision_m" integer,
	"location_updated_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_age_range" CHECK ("profiles"."age_min" >= 18 and "profiles"."age_max" >= "profiles"."age_min" and "profiles"."age_max" <= 120),
	CONSTRAINT "profiles_radius" CHECK ("profiles"."radius_km" between 1 and 500),
	CONSTRAINT "profiles_position_pair" CHECK (("profiles"."lat" is null) = ("profiles"."lng" is null))
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "agent_message_role" NOT NULL,
	"content" text NOT NULL,
	"chips" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"state" "agent_state" DEFAULT 'ONBOARDING' NOT NULL,
	"token_budget" integer DEFAULT 60000 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"calls_used" integer DEFAULT 0 NOT NULL,
	"portrait" jsonb,
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"provider" varchar(40) NOT NULL,
	"model" varchar(100) NOT NULL,
	"purpose" "ai_call_purpose" NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facet_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "embedding_kind" NOT NULL,
	"vector" vector(768) NOT NULL,
	"model" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"key" varchar(60) NOT NULL,
	"value" jsonb,
	"value_sealed" text,
	"sensitive" boolean DEFAULT false NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"source_message_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facets_one_value" CHECK (("facets"."value" is null) <> ("facets"."value_sealed" is null)),
	CONSTRAINT "facets_sealed_when_sensitive" CHECK (not "facets"."sensitive" or "facets"."value" is null)
);
--> statement-breakpoint
CREATE TABLE "batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"rank" smallint NOT NULL,
	"reasons" jsonb,
	"decision" "batch_decision",
	"decided_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "batch_status" DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debriefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debriefs_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "pairs_seen" (
	"account_id" uuid NOT NULL,
	"seen_account_id" uuid NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairs_seen_account_id_seen_account_id_pk" PRIMARY KEY("account_id","seen_account_id"),
	CONSTRAINT "pairs_seen_not_self" CHECK ("pairs_seen"."account_id" <> "pairs_seen"."seen_account_id")
);
--> statement-breakpoint
CREATE TABLE "intro_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intro_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_a" uuid NOT NULL,
	"account_b" uuid NOT NULL,
	"state" "intro_state" DEFAULT 'OPEN' NOT NULL,
	"opener_a" text,
	"opener_b" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"continued_by_a_at" timestamp with time zone,
	"continued_by_b_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_reason" varchar(20),
	"frozen_at" timestamp with time zone,
	CONSTRAINT "intros_ordered_pair" CHECK ("intros"."account_a" < "intros"."account_b")
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_not_self" CHECK ("blocks"."blocker_id" <> "blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"reported_id" uuid,
	"reason" "report_reason" NOT NULL,
	"details_sealed" text,
	"photo_id" uuid,
	"intro_id" uuid,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "account_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"storage_keys" text[] NOT NULL,
	"purge_after" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_last_error" text,
	"purged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "account_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "export_status" DEFAULT 'PENDING' NOT NULL,
	"payload_sealed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facet_embeddings" ADD CONSTRAINT "facet_embeddings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facets" ADD CONSTRAINT "facets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facets" ADD CONSTRAINT "facets_source_message_id_agent_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_items" ADD CONSTRAINT "batch_items_candidate_id_accounts_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debriefs" ADD CONSTRAINT "debriefs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debriefs" ADD CONSTRAINT "debriefs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs_seen" ADD CONSTRAINT "pairs_seen_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs_seen" ADD CONSTRAINT "pairs_seen_seen_account_id_accounts_id_fk" FOREIGN KEY ("seen_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro_messages" ADD CONSTRAINT "intro_messages_intro_id_intros_id_fk" FOREIGN KEY ("intro_id") REFERENCES "public"."intros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro_messages" ADD CONSTRAINT "intro_messages_sender_id_accounts_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intros" ADD CONSTRAINT "intros_account_a_accounts_id_fk" FOREIGN KEY ("account_a") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intros" ADD CONSTRAINT "intros_account_b_accounts_id_fk" FOREIGN KEY ("account_b") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_accounts_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_accounts_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_accounts_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_id_accounts_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_exports" ADD CONSTRAINT "account_exports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_codes_email_idx" ON "auth_codes" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "auth_codes_expires_idx" ON "auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "push_tokens_account_idx" ON "push_tokens" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "profile_photos_account_idx" ON "profile_photos" USING btree ("account_id","position");--> statement-breakpoint
CREATE INDEX "profiles_earth_idx" ON "profiles" USING gist (ll_to_earth("lat", "lng"));--> statement-breakpoint
CREATE INDEX "agent_messages_session_idx" ON "agent_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_created_idx" ON "ai_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_account_idx" ON "ai_calls" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facet_embeddings_account_kind_idx" ON "facet_embeddings" USING btree ("account_id","kind");--> statement-breakpoint
CREATE INDEX "facet_embeddings_vector_idx" ON "facet_embeddings" USING hnsw ("vector" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "facets_account_key_idx" ON "facets" USING btree ("account_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_items_batch_candidate_idx" ON "batch_items" USING btree ("batch_id","candidate_id");--> statement-breakpoint
CREATE INDEX "batch_items_candidate_idx" ON "batch_items" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "batches_account_idx" ON "batches" USING btree ("account_id","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_one_current_idx" ON "batches" USING btree ("account_id") WHERE "batches"."status" in ('OPEN', 'DEBRIEF_DUE');--> statement-breakpoint
CREATE INDEX "batches_expiry_idx" ON "batches" USING btree ("expires_at") WHERE "batches"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "intro_messages_intro_idx" ON "intro_messages" USING btree ("intro_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "intro_messages_client_idx" ON "intro_messages" USING btree ("intro_id","sender_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intros_pair_idx" ON "intros" USING btree ("account_a","account_b");--> statement-breakpoint
CREATE INDEX "intros_account_b_idx" ON "intros" USING btree ("account_b");--> statement-breakpoint
CREATE INDEX "intros_expiry_idx" ON "intros" USING btree ("expires_at") WHERE "intros"."state" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_pair_idx" ON "blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_reported_idx" ON "reports" USING btree ("reported_id");--> statement-breakpoint
CREATE INDEX "account_deletions_pending_idx" ON "account_deletions" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "account_exports_account_idx" ON "account_exports" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_exports_expiry_idx" ON "account_exports" USING btree ("expires_at");