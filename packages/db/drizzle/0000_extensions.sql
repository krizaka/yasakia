-- The extensions Yasakia's schema stands on, created before any table (idempotent):
--   vector         pgvector — facet_embeddings.vector (SELF / SEEKING), searched with an HNSW index (cosine)
--   cube           the n-dimensional cube type earthdistance is built on
--   earthdistance  ll_to_earth / earth_box / earth_distance — the radius filter over profiles (GiST index)
-- On a managed PostgreSQL these need the database owner (doadmin on DigitalOcean): run the first migration with it.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS cube;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS earthdistance;
