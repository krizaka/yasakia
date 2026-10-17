CREATE TABLE "intro_media" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(8) NOT NULL,
	"status" varchar(10) DEFAULT 'UPLOADING' NOT NULL,
	"storage_key" varchar(200) NOT NULL,
	"poster_key" varchar(200),
	"mime_type" varchar(40) NOT NULL,
	"bytes" integer NOT NULL,
	"duration_ms" integer,
	"waveform" smallint[],
	"moderation_codes" text[],
	"engine_run_id" varchar(80),
	"attempts" smallint DEFAULT 0 NOT NULL,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "intro_media_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "intro_media_kind" CHECK ("intro_media"."kind" in ('PHOTO', 'VIDEO', 'AUDIO')),
	CONSTRAINT "intro_media_status_known" CHECK ("intro_media"."status" in ('UPLOADING', 'PENDING', 'APPROVED', 'REJECTED', 'GONE'))
);
--> statement-breakpoint
ALTER TABLE "intro_messages" ADD COLUMN "kind" varchar(8) DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE "intro_media" ADD CONSTRAINT "intro_media_message_id_intro_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."intro_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intro_media_status_idx" ON "intro_media" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "intro_messages" ADD CONSTRAINT "intro_messages_kind" CHECK ("intro_messages"."kind" in ('TEXT', 'PHOTO', 'VIDEO', 'AUDIO'));--> statement-breakpoint
-- Version 1 of the media rules (Oussama, 2026-10-17): a photo ≤ 10 MB, a video ≤ 60 s and 50 MB, a voice message ≤ 2 min and 10 MB.
INSERT INTO "rule_sets" ("domain", "version", "active", "params", "reason") VALUES
  ('MEDIA', 1, true, '{"photoMaxBytes":10485760,"videoMaxSeconds":60,"videoMaxBytes":52428800,"audioMaxSeconds":120,"audioMaxBytes":10485760}'::jsonb, 'Version 1: a photo up to 10 MB, a video up to 60 seconds and 50 MB, a voice message up to 2 minutes and 10 MB.');
