---
title: Yazakia API Reference
description: Every HTTP endpoint of the Yazakia API, with the access rule that guards it — extracted from the code.
---

# Yazakia API Reference

> Generated from code by `scripts/generate-docs.mjs` — do not hand-edit. The summary is the first sentence of each
> handler's JSDoc; the access rule is read from what the handler calls.

Base: `https://<host>/api`. Every answer is JSON with `success`; a refusal carries a stable `code` (the app words it).
Sessions: `Authorization: Bearer <token>` from `POST /api/auth/verify` (`client: "native"`).

## Endpoints (25)

| Method | Path | Access | Summary |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/reports` | operator · service token + IP allow-list | The reports for operators — urgent reasons (UNDERAGE, THREAT) first, details decrypted; service token and IP allow-list. |
| `POST` | `/api/auth/logout` | bearer · account | Signs out: forgets this phone's push token, and with `everywhere` invalidates every session token of the account at once (the app also deletes its own token from secure storage). |
| `POST` | `/api/auth/request-code` | public | Sends a 6-digit sign-in code to an e-mail address — the same answer whether an account exists or not. |
| `POST` | `/api/auth/verify` | public | Exchanges an e-mail code for a session token (`client: "native"`, sent back as `Authorization: Bearer`). |
| `GET` | `/api/blocks` | bearer · account | The people the account blocked (the settings list), oldest first. |
| `POST` | `/api/blocks` | bearer · account | Blocks someone — immediate, invisible to them, mutual in effect: their intro closes and each leaves the other's current batch. |
| `DELETE` | `/api/blocks/{id}` | bearer · account | Lifts one of the account's blocks (what it closed stays closed); another account's block is a 404. |
| `GET` | `/api/events` | bearer · account | The account's live events as Server-Sent Events — `batch.ready`, `intro.opened`, `intro.message` (ids only: the app fetches what changed) — with a heartbeat every 15 s, ending every 5 minutes (the app reconnects at once). |
| `GET` | `/api/healthz` | public | Health of this instance: the database answers (503 when it does not) and whether the realtime bus hears the other instances. |
| `DELETE` | `/api/me` | bearer · account | Deletes the account for good, at once — every row that is theirs, in one transaction; the photos are purged from storage right after (retried until done, 30 days at most) and a confirmation e-mail leaves. |
| `GET` | `/api/me` | bearer · account | The signed-in account: e-mail, status, language, age (never the date of birth), profile, rounded position, the agent's state. |
| `PATCH` | `/api/me` | bearer · account | Changes the profile, the language, or pauses the account (nobody is shown it any more; its batches and intros stay open). |
| `GET` | `/api/me/export` | bearer · account | Everything the account holds, as JSON — at once when it takes under a second, else 202 with an export id to poll (`?id=`, kept 24 hours); `?mode=async` asks for the background build directly. |
| `PUT` | `/api/me/location` | bearer · account | Sets the position from the phone's coordinates, rounded to about 1 km before it is written — the exact one is never stored; the answer is what was kept. |
| `GET` | `/api/me/photos` | bearer · account | The account's own photos in their order, with status, size and blurhash — never a URL (GET /api/photos/&#123;id&#125; signs one). |
| `PATCH` | `/api/me/photos` | bearer · account | Reorders the photos: `order` lists each of the account's photos once, the first one first. |
| `POST` | `/api/me/photos` | bearer · account | Starts a photo: declares its type and size and answers a signed upload URL (PUT, 300 seconds, this photo only); then `PUT /api/me/photos/&#123;id&#125;/complete`. |
| `DELETE` | `/api/me/photos/{id}` | bearer · account | Removes one of the account's photos — from storage first, then from the profile (another account's photo is a 404). |
| `PUT` | `/api/me/photos/{id}/complete` | bearer · account | Completes an upload: checks the bytes are the declared picture, re-encodes them (orientation applied, metadata — GPS included — stripped), computes width, height and blurhash, then moderation (V1: approved automatically). |
| `GET` | `/api/media/{key…}` | signed media URL (300 s, development storage only) | Development storage only: serves a local photo at a URL `GET /api/photos/&#123;id&#125;` signed (300 seconds, one width) — what Bunny's pull zone and Optimizer do in production. |
| `GET` | `/api/photos/{id}` | bearer · account | A photo for the signed-in viewer — after the access rule (its owner; someone with the owner in a current batch; an open intro), a URL signed for 300 seconds at the asked width (`?w=`, snapped to 160…1280). |
| `DELETE` | `/api/push/tokens` | bearer · account | Forgets this phone's push token (notifications turned off on the device). |
| `POST` | `/api/push/tokens` | bearer · account | Registers this phone's Expo push token for the account (a phone that changed hands moves to the new account). |
| `POST` | `/api/reports` | bearer · account | Reports someone, with a normalised reason — persisted before it is acknowledged, the details encrypted at rest, a report inside an intro freezes it. |
| `PUT` | `/api/uploads/photos/{id}` | signed upload URL (one photo, 300 s) | Receives one photo's bytes at the URL `POST /api/me/photos` signed — the signature is the authorisation (one photo, 300 seconds); the type must be the declared one and the size at most the declared one. |

## Database tables (21)

See the Database Reference: `account_deletions` · `account_exports` · `accounts` · `agent_messages` · `agent_sessions` · `ai_calls` · `auth_codes` · `batch_items` · `batches` · `blocks` · `debriefs` · `facet_embeddings` · `facets` · `intro_messages` · `intros` · `pairs_seen` · `profile_photos` · `profiles` · `push_tokens` · `rate_limit_buckets` · `reports`.
