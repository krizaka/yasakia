CREATE TABLE "photo_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"status" varchar(10) DEFAULT 'QUEUED' NOT NULL,
	"set_hash" varchar(64) NOT NULL,
	"photo_ids" uuid[] NOT NULL,
	"rules_version" integer NOT NULL,
	"passes" boolean,
	"report" jsonb,
	"engine_run_id" varchar(80),
	"error_code" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "photo_checks_status" CHECK ("photo_checks"."status" in ('QUEUED', 'RUNNING', 'DONE', 'ERROR')),
	CONSTRAINT "photo_checks_done_has_verdict" CHECK ("photo_checks"."status" <> 'DONE' or ("photo_checks"."passes" is not null and "photo_checks"."report" is not null))
);
--> statement-breakpoint
ALTER TABLE "photo_checks" ADD CONSTRAINT "photo_checks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_checks_account_idx" ON "photo_checks" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_checks_one_active_idx" ON "photo_checks" USING btree ("account_id") WHERE "photo_checks"."status" in ('QUEUED', 'RUNNING');--> statement-breakpoint
-- The photo set an account has *now*: its APPROVED photos, as a hash. A check is about one set; a changed set makes it stale.
CREATE FUNCTION photo_set_hash(account uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(encode(sha256(convert_to(string_agg(id::text, ',' ORDER BY id), 'UTF8')), 'hex'), '')
  FROM profile_photos WHERE account_id = account AND moderation_status = 'APPROVED'
$$;--> statement-breakpoint
-- Version 1 of the photo rules (Oussama, 2026-10-17): 4 to 6 photos, at least 2 showing the person's face.
INSERT INTO "rule_sets" ("domain", "version", "active", "params", "reason") VALUES
  ('PHOTOS', 1, true, '{"minPhotos":4,"maxPhotos":6,"minFacePhotos":2}'::jsonb, 'Version 1: 4 to 6 photos, at least 2 of them showing the person''s face — Orazaka checks that a face is the subject, that it is the same person, and that nothing is written over the picture.');
