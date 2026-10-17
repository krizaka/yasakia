CREATE TABLE "intro_message_signals" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"typed_ms" integer,
	"typed_chars" integer,
	"pasted_chars" integer,
	"paste_events" integer,
	"deletions" integer,
	"detector" varchar(12),
	"signal" varchar(20),
	"rules_version" integer,
	"engine_run_id" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"judged_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "intro_message_signals" ADD CONSTRAINT "intro_message_signals_message_id_intro_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."intro_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Version 1 of the authenticity rules: under 12 words the signal says « too short to judge »; a message counts as pasted when 80 %
-- of its characters arrived in a paste, as typed when 70 % were typed, and as faster than a hand above 12 characters a second.
-- The thresholds of the engine's classifier are the pack's (message-authenticity), calibrated on a small FR/EN set.
INSERT INTO "rule_sets" ("domain", "version", "active", "params", "reason") VALUES
  ('AUTHENTICITY', 1, true, '{"minWords":12,"pasteRatio":0.8,"fastCharsPerSecond":12,"minTypedShare":0.7}'::jsonb, 'Version 1: a signal, never a verdict — too short under 12 words, pasted from 80 % of characters, typed from 70 %, faster than a hand above 12 characters a second.');
