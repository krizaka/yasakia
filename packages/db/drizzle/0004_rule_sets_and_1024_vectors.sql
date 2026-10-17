CREATE TABLE "rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" varchar(20) NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"params" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Vectors of another dimension (or of another model) cannot be compared: none exist yet on any deployment, and a portrait
-- is re-embedded when its model changes (ADR-001).
DELETE FROM "facet_embeddings";--> statement-breakpoint
ALTER TABLE "facet_embeddings" ALTER COLUMN "vector" SET DATA TYPE vector(1024);--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN "run_ref" varchar(80);--> statement-breakpoint
CREATE UNIQUE INDEX "rule_sets_domain_version_idx" ON "rule_sets" USING btree ("domain","version");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_sets_one_active_idx" ON "rule_sets" USING btree ("domain") WHERE "rule_sets"."active";
--> statement-breakpoint
-- Version 1 of the two rule sets (ADR-001): the defaults, seeded here; a new version is published with a reason.
INSERT INTO "rule_sets" ("domain", "version", "active", "params", "reason") VALUES
  ('MATCHING', 1, true, '{"batchMin":3,"batchMax":5,"batchHours":72,"candidatePool":200,"minAffinity":0.5}'::jsonb, 'Version 1: a batch of 3 to 5 people for 72 hours, both directions at 0.50 cosine or more (calibrated on the dev personas, ADR-001).'),
  ('AGENT', 1, true, '{"minUserTurns":5,"historyMessages":40,"messageMaxChars":1500,"requiredFacets":["seeking"],"minFacets":4}'::jsonb, 'Version 1: the agent talks for at least 5 of your messages and needs who you look for and three more facets.');
