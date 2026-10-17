CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
ALTER TYPE "public"."account_role" ADD VALUE 'MODERATOR' BEFORE 'ADMIN';--> statement-breakpoint
ALTER TYPE "public"."account_role" ADD VALUE 'SUPER_ADMIN';--> statement-breakpoint
CREATE TABLE "geofence_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"center_lat" double precision NOT NULL,
	"center_lng" double precision NOT NULL,
	"radius_km" smallint DEFAULT 50 NOT NULL,
	"polygon" jsonb,
	"min_age" smallint DEFAULT 18 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geofence_zones_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_trajectories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"geo_precision_m" integer DEFAULT 1000 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id_pseudonym" varchar(64) NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"geohash" varchar(12),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_trajectories" ADD CONSTRAINT "user_trajectories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geofence_zones_active_idx" ON "geofence_zones" USING btree ("active");--> statement-breakpoint
CREATE INDEX "geofence_zones_earth_idx" ON "geofence_zones" USING gist (ll_to_earth("center_lat", "center_lng"));--> statement-breakpoint
CREATE INDEX "user_trajectories_account_idx" ON "user_trajectories" USING btree ("account_id","recorded_at");--> statement-breakpoint
CREATE INDEX "user_trajectories_earth_idx" ON "user_trajectories" USING gist (ll_to_earth("lat", "lng"));--> statement-breakpoint
CREATE INDEX "analytics_events_type_idx" ON "analytics_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_pseudonym_idx" ON "analytics_events" USING btree ("account_id_pseudonym","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_geohash_idx" ON "analytics_events" USING btree ("geohash");