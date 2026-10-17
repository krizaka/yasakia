CREATE TYPE "public"."analytics_outbox_kind" AS ENUM('EVENT', 'ERASURE');--> statement-breakpoint
CREATE TABLE "analytics_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "analytics_outbox_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_outbox_pending_idx" ON "analytics_outbox" USING btree ("next_attempt_at") WHERE "analytics_outbox"."sent_at" is null;