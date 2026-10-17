---
title: Database Reference
description: Every table, column, index, foreign key, check and enum of the Yasakia PostgreSQL schema — generated from the Drizzle schema.
---

# Database Reference

> Generated from `packages/db/src/schema` by `scripts/generate-docs.mjs` — do not hand-edit.
> To change the schema: edit it, `npm run db:generate -- --name <what_changed>`, read the SQL, `npm run db:migrate` — see the Development guide.

PostgreSQL 16 + pgvector · 31 tables · 18 enums · 12 migrations (`packages/db/drizzle`).

## Design notes

- **Extensions first.** Migration `0000_extensions` creates `vector` (pgvector), `cube` and `earthdistance` before any table; on a managed PostgreSQL it runs as the database owner. The development image is `pgvector/pgvector:pg16` (cube and earthdistance ship with PostgreSQL's contrib).
- **Vectors: HNSW, cosine.** `facet_embeddings.vector` is indexed with HNSW (`vector_cosine_ops`), not IVFFlat. IVFFlat partitions the vectors into lists computed when the index is built: it needs representative data first and its recall degrades as rows arrive, which is exactly Yasakia's life — a pool that starts empty and grows every day. HNSW needs no training, keeps its recall as rows are added, and answers in milliseconds at the pool sizes of a city (thousands to hundreds of thousands of vectors). What it costs: a slower build and more memory per row, both negligible at that scale. The dimension is fixed by the migration (768, `EMBEDDING_DIMENSIONS`); `facet_embeddings.model` records the model of every vector, and changing models is a migration plus a re-index (PY3).
- **Distance: earthdistance over a GiST index.** `profiles_earth_idx` indexes `ll_to_earth(lat, lng)`; a radius query is `earth_box(ll_to_earth(:lat, :lng), :metres) @> ll_to_earth(lat, lng)` (index) refined by `earth_distance(…) <= :metres`. PostGIS is not needed for a radius filter over one city's profiles — it would be adopted only for a query this cannot express (documented then).
- **No exact position.** `lat` / `lng` are rounded to ~1 km by the API **before** they are written (`apps/web/lib/geo.ts`); `geo_precision_m` says how coarse. A check keeps both coordinates set or both empty.
- **Sealed columns.** `facets.value_sealed`, `reports.details_sealed` and `account_exports.payload_sealed` hold AES-256-GCM values (`enc:v1:<key id>:…`, `packages/db/src/crypto.ts`) bound to their row and column; checks keep a sensitive facet out of the clear `value` column.
- **Deletion is a cascade.** Every table that belongs to a person references `accounts` with `ON DELETE CASCADE`; reports and AI call logs outlive the account with the reference set to null; `account_deletions` keeps only an id, a date and the media keys until the purge empties them.
- **One current batch.** A partial unique index (`batches_one_current_idx`) allows at most one batch per account that is OPEN or waiting for its debrief; an intro is stored once per pair (`account_a < account_b`, unique).

## Relationships

Every foreign key, read from the schema: what each table points to (through which columns) and which tables point to it.

| Table | References (columns) | Referenced by |
| :--- | :--- | :--- |
| `account_credentials` | `accounts` (`account_id`) | — |
| `account_exports` | `accounts` (`account_id`) | — |
| `accounts` | — | `account_credentials` · `account_exports` · `agent_sessions` · `ai_calls` · `audit_log` · `batch_items` · `batches` · `biometric_consents` · `blocks` · `debriefs` · `facet_embeddings` · `facets` · `intro_messages` · `intros` · `pairs_seen` · `photo_checks` · `profile_photos` · `profiles` · `push_tokens` · `reports` · `web_sessions` |
| `agent_messages` | `agent_sessions` (`session_id`) | `facets` |
| `agent_sessions` | `accounts` (`account_id`) | `agent_messages` |
| `ai_calls` | `accounts` (`account_id`) | — |
| `audit_log` | `accounts` (`actor_id`) | — |
| `batch_items` | `batches` (`batch_id`) · `accounts` (`candidate_id`) | — |
| `batches` | `accounts` (`account_id`) | `batch_items` · `debriefs` |
| `biometric_consents` | `accounts` (`account_id`) | — |
| `blocks` | `accounts` (`blocker_id`) · `accounts` (`blocked_id`) | — |
| `debriefs` | `batches` (`batch_id`) · `accounts` (`account_id`) | — |
| `facet_embeddings` | `accounts` (`account_id`) | — |
| `facets` | `accounts` (`account_id`) · `agent_messages` (`source_message_id`) | — |
| `intro_media` | `intro_messages` (`message_id`) | — |
| `intro_message_signals` | `intro_messages` (`message_id`) | — |
| `intro_messages` | `intros` (`intro_id`) · `accounts` (`sender_id`) | `intro_media` · `intro_message_signals` |
| `intros` | `accounts` (`account_a`) · `accounts` (`account_b`) | `intro_messages` |
| `pairs_seen` | `accounts` (`account_id`) · `accounts` (`seen_account_id`) | — |
| `photo_checks` | `accounts` (`account_id`) | — |
| `profile_photos` | `accounts` (`account_id`) | — |
| `profiles` | `accounts` (`account_id`) | — |
| `push_tokens` | `accounts` (`account_id`) | — |
| `reports` | `accounts` (`reporter_id`) · `accounts` (`reported_id`) | — |
| `web_sessions` | `accounts` (`account_id`) | — |

## Tables

### `account_credentials`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `account_id` | uuid | no |  | primary key · → `accounts.id` (on delete cascade) |
| `password_hash` | text | no |  |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

### `account_deletions`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  |  |
| `requested_at` | timestamp with time zone | no | `now()` |  |
| `storage_keys` | text[] | no |  |  |
| `purge_after` | timestamp with time zone | no | `now()` |  |
| `purge_last_error` | text | yes |  |  |
| `purged_at` | timestamp with time zone | yes |  |  |

**Indexes:** `account_deletions_pending_idx` (purge_after)

### `account_exports`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `status` | export_status | no | `"PENDING"` |  |
| `payload_sealed` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `ready_at` | timestamp with time zone | yes |  |  |
| `expires_at` | timestamp with time zone | no |  |  |

**Indexes:** `account_exports_account_idx` (account_id) · `account_exports_expiry_idx` (expires_at)

### `accounts`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `email` | varchar(254) | no |  | unique |
| `status` | account_status | no | `"ACTIVE"` |  |
| `role` | account_role | no | `"USER"` |  |
| `locale` | locale | no | `"en"` |  |
| `birth_date` | date | no |  |  |
| `terms_accepted_at` | timestamp with time zone | no |  |  |
| `consent_version` | varchar(20) | no |  |  |
| `session_version` | integer | no | `1` |  |
| `suspended_at` | timestamp with time zone | yes |  |  |
| `suspension_reason` | text | yes |  |  |
| `last_seen_at` | timestamp with time zone | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

**Checks:** `accounts_email_lower` (`email = lower(email)`)

### `agent_messages`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `session_id` | uuid | no |  | → `agent_sessions.id` (on delete cascade) |
| `role` | agent_message_role | no |  |  |
| `content` | text | no |  |  |
| `chips` | jsonb | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `agent_messages_session_idx` (session_id, created_at)

### `agent_sessions`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  | unique · → `accounts.id` (on delete cascade) |
| `state` | agent_state | no | `"ONBOARDING"` |  |
| `token_budget` | integer | no | `60000` |  |
| `tokens_used` | integer | no | `0` |  |
| `calls_used` | integer | no | `0` |  |
| `portrait` | jsonb | yes |  |  |
| `state_changed_at` | timestamp with time zone | no | `now()` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

### `ai_calls`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | yes |  | → `accounts.id` (on delete set null) |
| `provider` | varchar(40) | no |  |  |
| `model` | varchar(100) | no |  |  |
| `purpose` | ai_call_purpose | no |  |  |
| `tokens_in` | integer | no | `0` |  |
| `tokens_out` | integer | no | `0` |  |
| `latency_ms` | integer | no | `0` |  |
| `ok` | boolean | no | `true` |  |
| `run_ref` | varchar(80) | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `ai_calls_created_idx` (created_at) · `ai_calls_account_idx` (account_id)

### `analytics_outbox`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `kind` | analytics_outbox_kind | no |  |  |
| `payload` | jsonb | no |  |  |
| `attempts` | integer | no | `0` |  |
| `next_attempt_at` | timestamp with time zone | no | `now()` |  |
| `sent_at` | timestamp with time zone | yes |  |  |
| `last_error` | varchar(40) | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `analytics_outbox_pending_idx` (next_attempt_at, where sent_at is null)

### `audit_log`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `actor_id` | uuid | yes |  | → `accounts.id` (on delete set null) |
| `actor_label` | varchar(254) | yes |  |  |
| `action` | varchar(40) | no |  |  |
| `target_id` | uuid | yes |  |  |
| `detail` | jsonb | yes |  |  |
| `ip` | varchar(64) | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `audit_log_created_idx` (created_at) · `audit_log_target_idx` (target_id, created_at) · `audit_log_action_idx` (action, created_at)

### `auth_codes`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `email` | varchar(254) | no |  |  |
| `code_hash` | varchar(64) | no |  |  |
| `attempts` | integer | no | `0` |  |
| `expires_at` | timestamp with time zone | no |  |  |
| `consumed_at` | timestamp with time zone | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `auth_codes_email_idx` (email, created_at) · `auth_codes_expires_idx` (expires_at)

### `batch_items`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `batch_id` | uuid | no |  | → `batches.id` (on delete cascade) |
| `candidate_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `rank` | smallint | no |  |  |
| `reasons` | jsonb | yes |  |  |
| `decision` | batch_decision | yes |  |  |
| `decided_at` | timestamp with time zone | yes |  |  |
| `withdrawn_at` | timestamp with time zone | yes |  |  |

**Indexes:** `batch_items_batch_candidate_idx` (unique, batch_id, candidate_id) · `batch_items_candidate_idx` (candidate_id)

### `batches`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `status` | batch_status | no | `"OPEN"` |  |
| `opened_at` | timestamp with time zone | no | `now()` |  |
| `expires_at` | timestamp with time zone | no |  |  |
| `closed_at` | timestamp with time zone | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `batches_account_idx` (account_id, opened_at) · `batches_one_current_idx` (unique, account_id, where status in ('OPEN', 'DEBRIEF_DUE')) · `batches_expiry_idx` (expires_at, where status = 'OPEN')

### `biometric_consents`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `account_id` | uuid | no |  | primary key · → `accounts.id` (on delete cascade) |
| `version` | varchar(20) | no |  |  |
| `accepted_at` | timestamp with time zone | no | `now()` |  |
| `withdrawn_at` | timestamp with time zone | yes |  |  |

### `blocks`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `blocker_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `blocked_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `blocks_pair_idx` (unique, blocker_id, blocked_id) · `blocks_blocked_idx` (blocked_id)

**Checks:** `blocks_not_self` (`blocker_id <> blocked_id`)

### `debriefs`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `batch_id` | uuid | no |  | unique · → `batches.id` (on delete cascade) |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `answers` | jsonb | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

### `facet_embeddings`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `kind` | embedding_kind | no |  |  |
| `vector` | vector(1024) | no |  |  |
| `model` | varchar(100) | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `facet_embeddings_account_kind_idx` (unique, account_id, kind) · `facet_embeddings_vector_idx` (hnsw, vector)

### `facets`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `key` | varchar(60) | no |  |  |
| `value` | jsonb | yes |  |  |
| `value_sealed` | text | yes |  |  |
| `sensitive` | boolean | no | `false` |  |
| `confidence` | real | no | `0` |  |
| `source_message_id` | uuid | yes |  | → `agent_messages.id` (on delete set null) |
| `updated_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `facets_account_key_idx` (unique, account_id, key)

**Checks:** `facets_one_value` (`(value is null) <> (value_sealed is null)`) · `facets_sealed_when_sensitive` (`not sensitive or value is null`)

### `intro_media`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `message_id` | uuid | no |  | primary key · → `intro_messages.id` (on delete cascade) |
| `kind` | varchar(8) | no |  |  |
| `status` | varchar(10) | no | `"UPLOADING"` |  |
| `storage_key` | varchar(200) | no |  | unique |
| `poster_key` | varchar(200) | yes |  |  |
| `mime_type` | varchar(40) | no |  |  |
| `bytes` | integer | no |  |  |
| `duration_ms` | integer | yes |  |  |
| `waveform` | smallint[] | yes |  |  |
| `moderation_codes` | text[] | yes |  |  |
| `engine_run_id` | varchar(80) | yes |  |  |
| `attempts` | smallint | no | `0` |  |
| `upload_expires_at` | timestamp with time zone | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `reviewed_at` | timestamp with time zone | yes |  |  |

**Indexes:** `intro_media_status_idx` (status, created_at)

**Checks:** `intro_media_kind` (`kind in ('PHOTO', 'VIDEO', 'AUDIO')`) · `intro_media_status_known` (`status in ('UPLOADING', 'PENDING', 'APPROVED', 'REJECTED', 'GONE')`)

### `intro_message_signals`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `message_id` | uuid | no |  | primary key · → `intro_messages.id` (on delete cascade) |
| `typed_ms` | integer | yes |  |  |
| `typed_chars` | integer | yes |  |  |
| `pasted_chars` | integer | yes |  |  |
| `paste_events` | integer | yes |  |  |
| `deletions` | integer | yes |  |  |
| `detector` | varchar(12) | yes |  |  |
| `signal` | varchar(20) | yes |  |  |
| `rules_version` | integer | yes |  |  |
| `engine_run_id` | varchar(80) | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `judged_at` | timestamp with time zone | yes |  |  |

### `intro_messages`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `intro_id` | uuid | no |  | → `intros.id` (on delete cascade) |
| `sender_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `body` | text | no |  |  |
| `kind` | varchar(8) | no | `"TEXT"` |  |
| `client_id` | varchar(64) | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `intro_messages_intro_idx` (intro_id, created_at) · `intro_messages_client_idx` (unique, intro_id, sender_id, client_id)

**Checks:** `intro_messages_kind` (`kind in ('TEXT', 'PHOTO', 'VIDEO', 'AUDIO')`)

### `intros`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_a` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `account_b` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `state` | intro_state | no | `"OPEN"` |  |
| `opened_at` | timestamp with time zone | no | `now()` |  |
| `expires_at` | timestamp with time zone | no |  |  |
| `continued_by_a_at` | timestamp with time zone | yes |  |  |
| `continued_by_b_at` | timestamp with time zone | yes |  |  |
| `closed_at` | timestamp with time zone | yes |  |  |
| `closed_reason` | varchar(20) | yes |  |  |
| `frozen_at` | timestamp with time zone | yes |  |  |

**Indexes:** `intros_pair_idx` (unique, account_a, account_b) · `intros_account_b_idx` (account_b) · `intros_expiry_idx` (expires_at, where state = 'OPEN')

**Checks:** `intros_ordered_pair` (`account_a < account_b`)

### `pairs_seen`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `account_id` | uuid | no |  | primary key · → `accounts.id` (on delete cascade) |
| `seen_account_id` | uuid | no |  | primary key · → `accounts.id` (on delete cascade) |
| `first_seen_at` | timestamp with time zone | no | `now()` |  |

**Checks:** `pairs_seen_not_self` (`account_id <> seen_account_id`)

### `password_reset_codes`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `email` | varchar(254) | no |  |  |
| `code_hash` | varchar(64) | no |  |  |
| `attempts` | integer | no | `0` |  |
| `expires_at` | timestamp with time zone | no |  |  |
| `consumed_at` | timestamp with time zone | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `password_reset_codes_email_idx` (email, created_at)

### `photo_checks`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `status` | varchar(10) | no | `"QUEUED"` |  |
| `set_hash` | varchar(64) | no |  |  |
| `photo_ids` | uuid[] | no |  |  |
| `rules_version` | integer | no |  |  |
| `passes` | boolean | yes |  |  |
| `report` | jsonb | yes |  |  |
| `engine_run_id` | varchar(80) | yes |  |  |
| `error_code` | varchar(30) | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `started_at` | timestamp with time zone | yes |  |  |
| `finished_at` | timestamp with time zone | yes |  |  |

**Indexes:** `photo_checks_account_idx` (account_id, created_at) · `photo_checks_one_active_idx` (unique, account_id, where status in ('QUEUED', 'RUNNING'))

**Checks:** `photo_checks_status` (`status in ('QUEUED', 'RUNNING', 'DONE', 'ERROR')`) · `photo_checks_done_has_verdict` (`status <> 'DONE' or (passes is not null and report is not null)`)

### `profile_photos`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `storage_key` | varchar(200) | no |  | unique |
| `mime_type` | varchar(40) | no |  |  |
| `bytes` | integer | no |  |  |
| `width` | integer | yes |  |  |
| `height` | integer | yes |  |  |
| `blurhash` | varchar(100) | yes |  |  |
| `moderation_status` | photo_moderation_status | no | `"UPLOADING"` |  |
| `position` | smallint | no | `0` |  |
| `upload_expires_at` | timestamp with time zone | no |  |  |
| `completed_at` | timestamp with time zone | yes |  |  |
| `reviewed_at` | timestamp with time zone | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `profile_photos_account_idx` (account_id, position)

### `profiles`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `account_id` | uuid | no |  | primary key · → `accounts.id` (on delete cascade) |
| `display_name` | varchar(40) | yes |  |  |
| `gender` | gender | yes |  |  |
| `seeking_genders` | gender[] | no | `'{}'::gender[]` |  |
| `age_min` | smallint | no | `18` |  |
| `age_max` | smallint | no | `99` |  |
| `intent` | relationship_intent | yes |  |  |
| `radius_km` | smallint | no | `25` |  |
| `lat` | double precision | yes |  |  |
| `lng` | double precision | yes |  |  |
| `geo_precision_m` | integer | yes |  |  |
| `location_updated_at` | timestamp with time zone | yes |  |  |
| `onboarding_completed_at` | timestamp with time zone | yes |  |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `profiles_earth_idx` (gist, ll_to_earth(lat, lng))

**Checks:** `profiles_age_range` (`age_min >= 18 and age_max >= age_min and age_max <= 120`) · `profiles_radius` (`radius_km between 1 and 500`) · `profiles_position_pair` (`(lat is null) = (lng is null)`)

### `push_tokens`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `token` | varchar(255) | no |  | primary key |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `platform` | push_platform | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `last_seen_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `push_tokens_account_idx` (account_id)

### `rate_limit_buckets`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `key` | varchar(200) | no |  | primary key |
| `count` | integer | no |  |  |
| `reset_at` | timestamp with time zone | no |  |  |

### `reports`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `reporter_id` | uuid | yes |  | → `accounts.id` (on delete set null) |
| `reported_id` | uuid | yes |  | → `accounts.id` (on delete set null) |
| `reason` | report_reason | no |  |  |
| `details_sealed` | text | yes |  |  |
| `photo_id` | uuid | yes |  |  |
| `intro_id` | uuid | yes |  |  |
| `status` | report_status | no | `"OPEN"` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `reviewed_at` | timestamp with time zone | yes |  |  |

**Indexes:** `reports_status_idx` (status, created_at) · `reports_reported_idx` (reported_id)

### `rule_sets`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `domain` | varchar(20) | no |  |  |
| `version` | integer | no |  |  |
| `active` | boolean | no | `false` |  |
| `params` | jsonb | no |  |  |
| `reason` | text | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

**Indexes:** `rule_sets_domain_version_idx` (unique, domain, version) · `rule_sets_one_active_idx` (unique, domain, where active)

### `web_sessions`

| Column | Type | Null | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | uuid | no | `gen_random_uuid()` | primary key |
| `account_id` | uuid | no |  | → `accounts.id` (on delete cascade) |
| `token_hash` | varchar(64) | no |  | unique |
| `user_agent` | varchar(300) | yes |  |  |
| `ip` | varchar(64) | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `last_seen_at` | timestamp with time zone | no | `now()` |  |
| `expires_at` | timestamp with time zone | no |  |  |
| `revoked_at` | timestamp with time zone | yes |  |  |

**Indexes:** `web_sessions_account_idx` (account_id) · `web_sessions_expiry_idx` (expires_at)

## Enums

| Enum | Values |
| :--- | :--- |
| `account_role` | `USER`, `ADMIN` |
| `account_status` | `ACTIVE`, `PAUSED`, `SUSPENDED` |
| `agent_message_role` | `USER`, `AGENT`, `SYSTEM` |
| `agent_state` | `ONBOARDING`, `DISCOVERY`, `WAITING_POOL`, `BATCH_READY`, `BATCH_OPEN`, `DEBRIEF_DUE` |
| `ai_call_purpose` | `CHAT`, `EXTRACT`, `EMBED`, `PORTRAIT`, `REASONS`, `DEBRIEF`, `OPENER` |
| `analytics_outbox_kind` | `EVENT`, `ERASURE` |
| `batch_decision` | `INTERESTED`, `PASS`, `TELL_ME_MORE` |
| `batch_status` | `OPEN`, `DEBRIEF_DUE`, `DONE`, `EXPIRED` |
| `embedding_kind` | `SELF`, `SEEKING` |
| `export_status` | `PENDING`, `READY`, `FAILED` |
| `gender` | `WOMAN`, `MAN`, `NON_BINARY` |
| `intro_state` | `OPEN`, `CONTINUED`, `FADED`, `CLOSED` |
| `locale` | `en`, `fr` |
| `photo_moderation_status` | `UPLOADING`, `PENDING`, `APPROVED`, `REJECTED` |
| `push_platform` | `ios`, `android` |
| `relationship_intent` | `LONG_TERM`, `OPEN_TO_LONG_TERM`, `CASUAL`, `FRIENDSHIP_FIRST`, `NOT_SURE` |
| `report_reason` | `UNDERAGE`, `THREAT`, `HARASSMENT`, `HATE`, `SCAM`, `FAKE_PROFILE`, `INAPPROPRIATE_PHOTO`, `OFFLINE_BEHAVIOUR`, `OTHER` |
| `report_status` | `OPEN`, `REVIEWED`, `ACTIONED`, `DISMISSED` |

## Migrations

- `0000_extensions.sql`
- `0001_initial_schema.sql`
- `0002_console_accounts.sql`
- `0003_password_reset_codes.sql`
- `0004_rule_sets_and_1024_vectors.sql`
- `0005_intro_days_rule.sql`
- `0006_app_config.sql`
- `0007_analytics_outbox.sql`
- `0008_photo_checks.sql`
- `0009_no_ghostwriting.sql`
- `0010_message_signals.sql`
- `0011_message_media.sql`
