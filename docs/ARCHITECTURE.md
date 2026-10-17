---
title: Architecture
description: How Yasakia is built — one API for a mobile app, PostgreSQL with pgvector and earthdistance, photos behind signatures, realtime over LISTEN/NOTIFY — and why each choice.
---

# Architecture

```
yasakia/                           npm workspaces — Apache-2.0
├── apps/web/                      Next.js 16: app/api/**/route.ts (the only HTTP surface) + /privacy, /terms, /delete-account
│   ├── lib/                       access · auth · tokens · sign-in · account · photos · media · export · reports · admin ·
│   │                              realtime · push · rate-limit · client-ip · env · http · mail(+templates) · geo · age · jobs
│   ├── mail-templates/            sign-in code, deletion confirmation — en/fr, data not code
│   └── messages/                  the words of the web pages (en, fr)
├── packages/db/                   Drizzle schema (source of truth), migrations (0000 = extensions), migrator, the pool,
│                                  AES-256-GCM sealing, the facets door, seed
├── packages/media/                Bunny Storage / local storage, upload and view signatures, image normalisation, PhotoModeration
├── packages/config/               TypeScript presets (ESLint comes from @krizaka/config)
│   (from npm, krizaka-ui)         @krizaka/realtime (bus + SSE) · @krizaka/push (Expo Push) · @krizaka/ui · @krizaka/tokens ·
│                                  @krizaka/tailwind · @krizaka/i18n · @krizaka/icons · @krizaka/config
├── deploy/                        Dockerfile (bundled migrator), compose (dev), DigitalOcean spec
├── e2e/                           HTTP scenarios on a real PostgreSQL
└── scripts/                       setup, db lifecycle, docs generation, workspace
```

The mobile app ([`yasakia-mobile`](https://github.com/krizaka/yasakia-mobile), Expo) is the product's client. The web serves the
three pages the stores require and the signed-in console (sign-in, home, account, administration) under `/app` — AGENTS.md §6.2.

## Why these choices

- **TypeScript on Orochia's foundations, not the JVM.** One developer, a product to ship: Orochia's proven template —
  native Bearer sessions, SSE, push, Bunny media, migrations, seed, generated docs, e2e on a real PostgreSQL. Yasakia
  will consume Orazaka (the AI, JVM) **over HTTP**, never as a library.
- **PostgreSQL does the matching's heavy lifting.** pgvector holds two vectors per person (who I am, who I seek, HNSW
  cosine), `cube` + `earthdistance` filter by radius over a GiST index — no search engine, no geo service, one
  database to back up. See the design notes of [DATABASE.md](DATABASE.md).
- **One pool per process, named.** `packages/db/src/client.ts` keeps one small pool on `globalThis` (Next.js loads a
  module once per module graph — three pools otherwise), `application_name` says who holds each slot
  (`yasakia-web`, `yasakia-listen`, `yasakia-migrate`); LISTEN and migrations take `DATABASE_DIRECT_URL` when the
  queries go through a pooler. Budget: [DEPLOYMENT.md](DEPLOYMENT.md).

## Sessions

Sign-in and sign-up are one flow by e-mail code — no password exists. `POST /api/auth/request-code` sends 6 digits
(kept as a keyed hash, 10 minutes, 5 attempts, used once); `POST /api/auth/verify` answers a signed, stateless token
(`yz1.…`, 30 days) for `client: "native"` — kept in the phone's secure storage, sent as `Authorization: Bearer`. A new
address must bring a date of birth that the **server** checks (18+) and the accepted terms. The token is not the
authorisation: `requireUser` re-reads the account on every request, so a suspension, a deletion or "sign out
everywhere" (`accounts.session_version`) applies at once.

## Photos

```sequence
participant app: The Yasakia app
participant api: Yasakia API
participant storage: Bunny Storage

app -> api: POST /api/me/photos (type, size)
api --> app: photo UPLOADING + an upload URL signed for this photo, 300 s
app -> api: PUT the bytes to the signed URL (type and size checked)
api -> storage: the original, under a staging key
app -> api: PUT /api/me/photos/[id]/complete
api -> storage: re-encoded JPEG (orientation, no metadata, at most 2048 px), blurhash
api -> api: PENDING, then PhotoModeration: APPROVED
app -> api: GET /api/photos/[id]?w=640
api --> app: after the access rule, a URL signed for this viewer, 300 s (the Optimizer resizes)
```

Bunny Storage has no pre-signed upload (its key opens the whole zone), so the signed URL points at the API, which
streams the bytes to the zone — once, at most 10 MB. Re-encoding at completion strips every metadata block a phone
adds, GPS included. Who may see a photo (`lib/access.ts`): its owner; someone else only when it is APPROVED, the owner
is not suspended, nobody blocked anybody, and the viewer has the owner in a current batch (OPEN or DEBRIEF_DUE) or
shares an OPEN / CONTINUED intro. Anyone else gets a 404. No answer ever carries a raw URL or a storage key (an e2e
scan over every answer enforces it).

### The photo check — « real people »

A profile holds **4 to 6 photos, at least 2 showing the person's face** (`rule_sets` domain `PHOTOS`: `minPhotos`, `maxPhotos`,
`minFacePhotos`, versioned and bounded like the others). The photos are stored as they are added, private to their owner;
they are *used* — shown to others, a batch opened — only once Orazaka has checked the whole set.

```sequence
participant api: Yasakia API
participant job: The check loop
participant oz: Orazaka (Studio profile-photo-check)

api -> api: a photo completes or is removed: photo_checks row QUEUED (one active per account)
job -> job: claims it (FOR UPDATE SKIP LOCKED), reads the set from storage, 512 px thumbnails
job -> oz: POST /api/v1/media/upload (each thumbnail), POST /api/v1/studios/profile-photo-check/runs
oz --> job: faces (worker), a vision question per photo, the verdict as codes
job -> oz: DELETE /api/v1/media/assets/[id] (every thumbnail, whatever the answer)
job -> api: photo_checks DONE: passes, report (codes only), the engine's run id
```

**Comparing faces with each other is biometric processing** (Québec Law 25): the engine is told `compareFaces` only when the deployment's flag `APP_PHOTO_FACE_COMPARISON` is `on` (off until reviewed) **and** the person gave their explicit, separate consent (`biometric_consents`, withdrawable at once); otherwise faces are only counted and no vector is computed (`identity: NOT_COMPARED`).

The verdict belongs to **one set**: `photo_checks.set_hash` is `photo_set_hash(account)` (the SQL function over the APPROVED
photos); any other set is unchecked, and the screen asks again by itself. The report is **codes** — `TOO_FEW_PHOTOS`,
`TOO_FEW_FACE_PHOTOS`, `FACE_MISMATCH`, `TEXT_OR_CONTACT`, `SCREENSHOT`, `MINOR_LIKELY`, `UNVERIFIED`, `GROUP_PHOTO` — never a
score or a vector (the face vectors live for one job in the engine's worker, in memory). A model answer that cannot be read is
`UNVERIFIED` and blocks nothing. `GET /api/me/photos/check` is the view (`lib/photo-rules.ts`: state `EMPTY · UNCHECKED ·
CHECKING · PASSED · FAILED · UNAVAILABLE`, each photo's kind and findings, the blockers by photo id); `POST` asks for a check.
`POST /api/batches` answers 409 `PHOTOS_REQUIRED` until the set has passed, and the candidates of a batch are people whose
set passed (the fictional dev cast excepted — it says so). The engine out of reach is `UNAVAILABLE`: the photos are kept, nothing
is decided, asking again works. What it cannot do is written where the person reads it: it identifies no one, recognises no
celebrity, and can be wrong (a lookalike, strong light) — a refused photo is replaced, never punished.

## Safety and privacy

- **Blocks** are immediate, invisible and mutual in effect: the intro closes, each leaves the other's current batch.
- **Reports** are persisted before they are acknowledged, their details sealed (AES-256-GCM); a report in an intro
  freezes it; operators read them through `GET /api/admin/reports` — service token **and** IP allow-list.
- **Encryption at rest** (`packages/db/src/crypto.ts`): sensitive facets, report details, stored exports; the key
  (`DATABASE_ENCRYPTION_KEY`) is mandatory in production — the server refuses to start without it; rotation keeps the old
  keys readable (`DATABASE_ENCRYPTION_KEYS_PREVIOUS`).
- **Export** (`GET /api/me/export`) and **deletion** (`DELETE /api/me`) are in the API from day one — see
  [PRIVACY.md](PRIVACY.md).

## Realtime and push

`lib/realtime.ts` is the only door, and it knows typed events only: `batch.ready`, `intro.opened`, `intro.message`
(ids, never documents — the app fetches what changed). Transport: `@krizaka/realtime` — PostgreSQL LISTEN/NOTIFY on
channel `yasakia_events` by default, Redis / Valkey with `REALTIME_BUS=redis` (prefix `yasakia:rt:`). `GET /api/events`
streams an account's events as Server-Sent Events (heartbeat 15 s, ends every 5 minutes, the app reconnects). Pushes go
through `@krizaka/push` (Expo → FCM / APNs), only in production or with `PUSH_DELIVERY=on`.

## Fail-closed

Secrets are read lazily through `apps/web/lib/env.ts`: development has defaults, production has none. A production
server refuses to start without the session secret, the encryption key, the database, the media storage and Mailgun
(`instrumentation.ts`); a request that needs a missing value answers 503. There is no demo mode: the demo (a fictional
cast) will live in its own database, never in the real one.

## What comes next

PY3 adds the brain on these foundations: the AI port (`packages/ai`, Orazaka as the target), the bilateral matching
(`packages/matching`), batches, debriefs and intros — and their endpoints, events and scenarios.
