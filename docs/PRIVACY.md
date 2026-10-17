---
title: Privacy by design
description: What Yasakia stores, where, for how long, and how it is deleted — the engineering behind the privacy policy, table by table.
---

# Privacy by design

The public policy is the web page `/privacy` (English and French, `apps/web/messages/*.json`); this document is the
engineering side of it — what the code does, so the two can be checked against each other. Yasakia is a Québec app
(Law 25) also used in Europe (GDPR): minimisation, consent, access, portability and deletion are features, not
paperwork.

## What is stored, where, for how long

| Data | Table / place | Protection | Kept |
| :--- | :--- | :--- | :--- |
| E-mail, language, consent version | `accounts` | — | while the account exists |
| Date of birth | `accounts.birth_date` | never in any answer but the owner's export (`GET /api/me` shows the age) | while the account exists |
| Sign-in codes | `auth_codes` | keyed hash only (HMAC-SHA256), 5 attempts | 10 minutes, swept |
| Session tokens | the phone (secure storage) | signed; re-checked against the account on every request | 30 days or "sign out everywhere" |
| Web sessions (the console) | `web_sessions` | one random token in an HttpOnly cookie, kept only as its SHA-256; the browser's name and the address it came from, to show you where you are signed in | 14 days, or until you end it; gone with the account |
| Passwords (the console, if one was set for you) | `account_credentials` | salted scrypt hash only | while the account exists |
| What the console did (sign-ins, password changes, suspensions, deletions) | `audit_log` | ids and a few words, never a secret or a message; your address is blanked from it when you delete your account | for safety reviews |
| Profile (name, gender, seeking, age range, intent, radius) | `profiles` | — | while the account exists |
| Position | `profiles.lat/lng` | **rounded to ~1 km before it is written**; `geo_precision_m` | while the account exists |
| Photos | Bunny Storage (`photos/<account>/<photo>.jpg`) + `profile_photos` | re-encoded (EXIF/GPS stripped); private; viewed only through 300-second signed URLs after the access rule | until removed or the account is deleted; storage purge ≤ 30 days |
| Photo checks | `photo_checks` | **codes only** (« face detected », « text on the photo »…), the date, the engine's run id; never a score, a face print or a vector — Orazaka's worker compares faces in memory for the length of one job. The 512 px thumbnails sent to Orazaka are deleted from its file store when the check ends; its run record, which still holds them, is purged within 30 days (the pack is `SENSITIVE`) | while the account exists |
| Conversation with the agent | `agent_messages` (PY3) | never used to train a model | while the account exists |
| Facets (the portrait) | `facets` | sensitive facets **sealed** (AES-256-GCM, bound to account + key) | while the account exists; editable |
| Embeddings | `facet_embeddings` | derived from facets; never shown | while the account exists |
| Batches, decisions, debriefs | `batches`, `batch_items`, `debriefs`, `pairs_seen` | reasons in words, never a score | while the account exists |
| Intro messages | `intro_messages` | the agent never reads them | while the intro exists; gone for both when either account is deleted |
| Blocks | `blocks` | invisible to the blocked person | while the blocker's account exists |
| Reports | `reports` | details **sealed**; operators only | for safety reviews; the account references become null on deletion |
| Push tokens | `push_tokens` | — | until sign-out, dead token or deletion |
| AI cost log | `ai_calls` | size and latency, **never content**; account reference null on deletion | for cost analysis |
| Exports | `account_exports` | sealed | 24 hours |
| Deletion record | `account_deletions` | an id, a date, the media keys until purged | the record of the deletion |

Servers and database: DigitalOcean, Toronto region (Canada). Photos: Bunny.net. E-mail: Mailgun (address + message).
Push: Expo → Apple / Google (token + notification text). AI (PY3): Orazaka, or a hosted model under a contract that
forbids retention and training.

## Rights, in the API

- **Access and portability** — `GET /api/me/export`: everything of the account as JSON (the facets opened, the report
  details the person wrote, their own messages; never another person's words). Built at once under a second, else in
  the background (`202` + id, kept 24 hours, sealed).
- **Rectification** — `PATCH /api/me`, `PUT /api/me/location`, the photos endpoints; the portrait's corrections (PY3)
  win over what the agent inferred (confidence 1).
- **Erasure** — `DELETE /api/me`: one transaction deletes the account and, by cascade, every row that is theirs; the
  media keys go to `account_deletions` and the purge (`lib/jobs.ts`, `FOR UPDATE SKIP LOCKED`) removes them from
  storage right after the answer, retried every minute until done — 30 days at most by policy, minutes in practice. A
  confirmation e-mail leaves in the person's language. The page `/delete-account` explains it for the stores, with the
  way to ask without the app.
- **Consent** — at sign-up the app shows what the agent learns and that everything can be changed; the accepted version
  is recorded (`accounts.consent_version`). Pausing (`PATCH /api/me {paused: true}`) stops the account being shown.

## Minimisation

No contacts, no exact position, no photo metadata, no score shown, no password. Codes are hashed. The API logs no
message content. The development seed has no real photo; the demo will live in its own database (`yasakia_demo`).

## Keys

`DATABASE_ENCRYPTION_KEY` (32 random bytes, base64) is per environment and mandatory in production — the server refuses
to start without it. Rotate by moving the old key to `DATABASE_ENCRYPTION_KEYS_PREVIOUS` and setting a new one: old
values still open, new ones use the new key. Losing a key loses what it sealed: keep it in the secret store.
