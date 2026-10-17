---
title: Yasakia API Reference
description: Every HTTP endpoint of the Yasakia API, with the access rule that guards it — extracted from the code.
---

# Yasakia API Reference

> Generated from code by `scripts/generate-docs.mjs` — do not hand-edit. The summary is the first sentence of each
> handler's JSDoc; the access rule is read from what the handler calls.

Base: `https://<host>/api`. Every answer is JSON with `success`; a refusal carries a stable `code` (the app words it).
Sessions: `Authorization: Bearer <token>` from `POST /api/auth/verify` (`client: "native"`).

## Endpoints (50)

| Method | Path | Access | Summary |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/audit` | public | The audit log for the console — sign-ins, password changes, suspensions, restorations, deletions — searched, filtered and paged on the server. |
| `GET` | `/api/admin/health` | public | The instance's health for the console: database, realtime bus, version, environment, uptime, whether sign-up is open. |
| `GET` | `/api/admin/intros` | public | The introductions overview for the console — state, dates, message counts; never who said what — filtered and paged on the server. |
| `GET` | `/api/admin/overview` | public | The console's overview: accounts by status, the moderation queue, introductions by state, open batches — counts only. |
| `GET` | `/api/admin/report-queue` | public | The moderation queue for the console — urgent reasons (UNDERAGE, THREAT) first while open — filtered by status and paged on the server; details open one report at a time. |
| `GET` | `/api/admin/report-queue/{id}` | public | One report with its details opened — operators only. |
| `PATCH` | `/api/admin/report-queue/{id}` | public | Moves a report along (REVIEWED · ACTIONED · DISMISSED, or back to OPEN); the decision is logged with who made it. |
| `GET` | `/api/admin/reports` | operator · service token + IP allow-list | The reports for operators — urgent reasons (UNDERAGE, THREAT) first, details decrypted; service token and IP allow-list. |
| `GET` | `/api/admin/users` | public | Lists accounts for the console — searched by address or name, filtered by status and role, sorted and paged on the server. |
| `DELETE` | `/api/admin/users/{id}` | public | Law 25 erasure of an account, asked of an operator; the e-mail typed confirms. |
| `GET` | `/api/admin/users/{id}` | public | One account for the console: state, role, counts and the audit lines about it — never a date of birth, a message or a photo. |
| `POST` | `/api/admin/users/{id}/restore` | public | Lifts an account's suspension: it is ACTIVE again and can sign in; the restoration is logged. |
| `POST` | `/api/admin/users/{id}/role` | public | Grants or withdraws the administrator role. |
| `POST` | `/api/admin/users/{id}/sessions` | public | Ends every session of an account, on the web and in the app, leaving it active. |
| `POST` | `/api/admin/users/{id}/suspend` | public | Suspends an account: it cannot sign in and every session of the app and the browser ends at once; the reason is logged. |
| `GET` | `/api/agent` | bearer · account | The person's agent: the conversation, what it understood in their own words, the portrait once written, what it still has to learn. |
| `POST` | `/api/agent/messages` | bearer · account | Says something to the agent and gets its answer; what the agent understood of it follows (extraction, then the portrait when it knows enough). |
| `POST` | `/api/auth/logout` | bearer · account | Signs out: forgets this phone's push token, and with `everywhere` invalidates every session token of the account at once (the app also deletes its own token from secure storage). |
| `POST` | `/api/auth/password` | public | Signs a person in to the web console with their e-mail and password: the answer sets an HttpOnly session cookie. |
| `POST` | `/api/auth/password/forgot` | public | "Forgot password": a reset code by e-mail, the same answer whether an account exists or not. |
| `POST` | `/api/auth/password/reset` | public | The code and the new password. |
| `POST` | `/api/auth/request-code` | public | Sends a 6-digit sign-in code to an e-mail address — the same answer whether an account exists or not. |
| `POST` | `/api/auth/sign-out` | public | Signs the web console out: this browser's session ends and its cookie is cleared (an unknown cookie is cleared too). |
| `POST` | `/api/auth/verify` | public | Exchanges an e-mail code for a session token (`client: "native"`, sent back as `Authorization: Bearer`). |
| `GET` | `/api/blocks` | bearer · account | The people the account blocked (the settings list), oldest first. |
| `POST` | `/api/blocks` | bearer · account | Blocks someone — immediate, invisible to them, mutual in effect: their intro closes and each leaves the other's current batch. |
| `DELETE` | `/api/blocks/{id}` | bearer · account | Lifts one of the account's blocks (what it closed stays closed); another account's block is a 404. |
| `GET` | `/api/events` | bearer · account | The account's live events as Server-Sent Events — `batch.ready`, `intro.opened`, `intro.message` (ids only: the app fetches what changed) — with a heartbeat every 15 s, ending every 5 minutes (the app reconnects at once). |
| `GET` | `/api/healthz` | public | Health of this instance: the database answers (503 when it does not) and whether the realtime bus hears the other instances. |
| `DELETE` | `/api/me` | bearer · account | Deletes the account for good, at once — every row that is theirs, in one transaction; the photos are purged from storage right after (retried until done, 30 days at most) and a confirmation e-mail leaves. |
| `GET` | `/api/me` | bearer · account | The signed-in account: e-mail, status, language, age (never the date of birth), profile, rounded position, the agent's state. |
| `PATCH` | `/api/me` | bearer · account | Changes the profile, the language, or pauses the account (nobody is shown it any more; its batches and intros stay open). |
| `GET` | `/api/me/dashboard` | bearer · account | The signed-in account's home: where the agent is, the open batch, the introductions, the phones — counts and dates, never a person's profile or a score. |
| `GET` | `/api/me/export` | bearer · account | Everything the account holds, as JSON — at once when it takes under a second, else 202 with an export id to poll (`?id=`, kept 24 hours); `?mode=async` asks for the background build directly. |
| `PUT` | `/api/me/location` | bearer · account | Sets the position from the phone's coordinates, rounded to about 1 km before it is written — the exact one is never stored; the answer is what was kept. |
| `POST` | `/api/me/password` | bearer · account | Changes the account's password (the current one must be right); every other browser session of the account ends. |
| `GET` | `/api/me/photos` | bearer · account | The account's own photos in their order, with status, size and blurhash — never a URL (GET /api/photos/&#123;id&#125; signs one). |
| `PATCH` | `/api/me/photos` | bearer · account | Reorders the photos: `order` lists each of the account's photos once, the first one first. |
| `POST` | `/api/me/photos` | bearer · account | Starts a photo: declares its type and size and answers a signed upload URL (PUT, 300 seconds, this photo only); then `PUT /api/me/photos/&#123;id&#125;/complete`. |
| `DELETE` | `/api/me/photos/{id}` | bearer · account | Removes one of the account's photos — from storage first, then from the profile (another account's photo is a 404). |
| `PUT` | `/api/me/photos/{id}/complete` | bearer · account | Completes an upload: checks the bytes are the declared picture, re-encodes them (orientation applied, metadata — GPS included — stripped), computes width, height and blurhash, then moderation (V1: approved automatically). |
| `DELETE` | `/api/me/sessions` | bearer · account | Ends every other browser session of the account (the one making the call stays). |
| `GET` | `/api/me/sessions` | bearer · account | The signed-in account's browser sessions — where they are signed in, since when, last used — the current one marked. |
| `DELETE` | `/api/me/sessions/{id}` | bearer · account | Ends one browser session of the account; ending the current one signs this browser out. |
| `GET` | `/api/media/{key…}` | signed media URL (300 s, development storage only) | Development storage only: serves a local photo at a URL `GET /api/photos/&#123;id&#125;` signed (300 seconds, one width) — what Bunny's pull zone and Optimizer do in production. |
| `GET` | `/api/photos/{id}` | bearer · account | A photo for the signed-in viewer — after the access rule (its owner; someone with the owner in a current batch; an open intro), a URL signed for 300 seconds at the asked width (`?w=`, snapped to 160…1280). |
| `DELETE` | `/api/push/tokens` | bearer · account | Forgets this phone's push token (notifications turned off on the device). |
| `POST` | `/api/push/tokens` | bearer · account | Registers this phone's Expo push token for the account (a phone that changed hands moves to the new account). |
| `POST` | `/api/reports` | bearer · account | Reports someone, with a normalised reason — persisted before it is acknowledged, the details encrypted at rest, a report inside an intro freezes it. |
| `PUT` | `/api/uploads/photos/{id}` | signed upload URL (one photo, 300 s) | Receives one photo's bytes at the URL `POST /api/me/photos` signed — the signature is the authorisation (one photo, 300 seconds); the type must be the declared one and the size at most the declared one. |

## Database tables (26)

See the Database Reference: `account_credentials` · `account_deletions` · `account_exports` · `accounts` · `agent_messages` · `agent_sessions` · `ai_calls` · `audit_log` · `auth_codes` · `batch_items` · `batches` · `blocks` · `debriefs` · `facet_embeddings` · `facets` · `intro_messages` · `intros` · `pairs_seen` · `password_reset_codes` · `profile_photos` · `profiles` · `push_tokens` · `rate_limit_buckets` · `reports` · `rule_sets` · `web_sessions`.
