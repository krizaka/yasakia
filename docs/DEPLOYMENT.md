---
title: Deployment
description: Deploying the Yasakia API on DigitalOcean App Platform — the image, the release job, the configuration, the database connection budget, and the manual prerequisites.
---

# Deployment

## The image

`deploy/docker/Dockerfile` builds the Next.js standalone server and a self-contained migrator (`migrate.cjs`, drizzle +
pg bundled) into one image. The App Platform spec (`deploy/digitalocean/app.yaml`) runs:

- the **`migrate` PRE_DEPLOY job** — `node migrate.cjs` applies `packages/db/drizzle` (0000 creates the extensions)
  before every release, through `DATABASE_DIRECT_URL` when set: a release never starts on an older schema;
- the **`api` service** — health check `GET /api/healthz`.

```bash
doctl apps create --spec deploy/digitalocean/app.yaml          # once
doctl apps update <APP_ID> --spec deploy/digitalocean/app.yaml # structure changes only — secrets are set in the app
```

The managed PostgreSQL 16 cluster must allow the extensions `vector`, `cube` and `earthdistance` (DigitalOcean does);
the first migration creates them, so run it with the database owner (`doadmin`) or create them once by hand.

## Configuration

> Generated from `apps/web/lib/env-vars.ts` (`ENV_VARS`) by `scripts/generate-docs.mjs` — do not hand-edit this section.

Every variable is named `<CONTEXT>_<THING>` after the part of Yasakia it configures — never after the product or a
vendor: a vendor is a value (`MEDIA_STORAGE_PROVIDER=bunny`, `MAIL_PROVIDER=mailgun`). **Production** ✓ = the server
refuses to start without it (`assertProductionConfig`, which also checks every value set against its schema);
**Secret** = a `SECRET` on App Platform. Every variable is also in `.env.example`.

### Application — `APP_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` *(build)* | ✓ |  | `http://localhost:3000` | Public origin of the API: signed upload URLs and local media URLs are built on it. |
| `APP_ADMIN_HOST` | — |  |  | The host of the administration console (admin.yasakia.com): the same deployment answers it through host-based ingress; there only the administration exists, elsewhere it does not (404). Unset: both at one address (local development). |
| `NEXT_PUBLIC_APP_BASE_PATH` *(build)* | — |  |  | The path the app is served under (dev.yasakia.com serves it at `/app`, next to the static site at `/`). Empty: the root. |
| `NEXT_PUBLIC_APP_ENV` *(build)* | — |  | `local` | Where the build runs, for the build information. |
| `APP_ACCOUNT_PURGE_INTERVAL_SECONDS` | — |  | `60` | How often accounts past their deletion delay are purged. |
| `APP_SWEEP_INTERVAL_SECONDS` | — |  | `600` | How often expired codes, sessions and uploads are swept. |
| `APP_EXPORT_SYNC_BUDGET_MS` | — |  | `1000` | A data export answers at once when it builds within this budget, else 202 and a background build. |

### Database — `DATABASE_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `DATABASE_URL` | ✓ |  |  | PostgreSQL 16 with pgvector. |
| `DATABASE_DIRECT_URL` | — |  |  | A direct (session) connection for LISTEN and the migrations when DATABASE_URL goes through a transaction pooler. |
| `DATABASE_CA_CERT` | recommended |  |  | CA of a managed PostgreSQL (PEM; App Platform: `${<db>.CA_CERT}`), verified with TLS. |
| `DATABASE_MAX_CONNECTIONS` | — |  | `5` | Connections one process's pool may hold — see *Database connections*. |
| `DATABASE_ENCRYPTION_KEY` | ✓ | ✓ |  | Encrypts the sensitive fields at rest (AES-256-GCM): 32 random bytes in base64. Keep it. |
| `DATABASE_ENCRYPTION_KEYS_PREVIOUS` | — | ✓ |  | Rotation: previous keys, comma separated — what they sealed still opens. |
| `DATABASE_ALLOW_RESET` | — |  |  | Development deployments only: the release job may rebuild a database whose migration history was squashed. |

### Authentication — `AUTH_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `AUTH_SIGNUP_ENABLED` | recommended |  | `false` | May a stranger create an account? **false unless `true`**, decided by the server: the e-mail-code flow then signs existing accounts in and creates none. |
| `AUTH_ALLOWED_IPS` | recommended |  |  | Addresses that may open the administration console (comma separated; empty: any outside production, **none** in production). Elsewhere the console is a 404. |
| `AUTH_SESSION_SECRET` | ✓ | ✓ |  | Signs the session tokens and, derived, the upload and local media URLs (32+ random characters). |

### Media — `MEDIA_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `MEDIA_STORAGE_PROVIDER` | ✓ |  | `local` | Where photos live: `local` (development, `.storage/`) or `bunny` (production: required). `none` only on a dev deployment (`NEXT_PUBLIC_APP_ENV=dev`): photos answer 503. |
| `MEDIA_STORAGE_LOCAL_DIR` | — |  | `.storage/` | The folder of `local` storage. |
| `MEDIA_STORAGE_ZONE` | ✓ |  |  | Storage zone name (`bunny`). |
| `MEDIA_STORAGE_API_KEY` | ✓ | ✓ |  | Storage zone password (`bunny`). |
| `MEDIA_STORAGE_ENDPOINT` | — |  | `storage.bunnycdn.com` | The zone's region host. |
| `MEDIA_CDN_HOSTNAME` | ✓ |  |  | Pull zone serving the photos (Optimizer and token authentication on). |
| `MEDIA_CDN_TOKEN_AUTH_KEY` | ✓ | ✓ |  | Signs the photo URLs (the pull zone's token authentication key). |
| `MEDIA_PHOTO_MODERATION` | — |  | `auto` | Photo moderation: `auto` (V1 — approved at once; a report reopens the review). |

### E-mail — `MAIL_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `MAIL_PROVIDER` | ✓ |  |  | The e-mail service: `mailgun`. Production is fail-closed without it (a sign-in code is never logged there). `none` only on a dev deployment (`NEXT_PUBLIC_APP_ENV=dev`): the code flow answers 503. |
| `MAIL_API_KEY` | ✓ | ✓ |  | The provider's API key. |
| `MAIL_DOMAIN` | ✓ |  |  | Sending domain (e.g. `mg.yasakia.com`). |
| `MAIL_API_URL` | — |  | `https://api.mailgun.net` | API base (EU region: `https://api.eu.mailgun.net`). |
| `MAIL_FROM` | — |  | `Yasakia <no-reply@mg.yasakia.com>` | Sender address. |
| `MAIL_DELIVERY` | — |  | `log` | Outside production: `on` sends, `file` writes to MAIL_OUTBOX_DIR (the e2e scenarios read the codes there), `log` logs. |
| `MAIL_OUTBOX_DIR` | — |  | `.mail-outbox/` | Folder of `file` delivery. |
| `MAIL_TEMPLATES_DIR` | — |  | `apps/web/mail-templates` | Another folder of templates. |

### Mobile push — `PUSH_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `PUSH_DELIVERY` | — |  |  | Pushes (Expo Push Service) leave only in production, or here with `on`. |
| `PUSH_ACCESS_TOKEN` | — | ✓ |  | Expo access token — with enhanced push security only. |

### Realtime — `REALTIME_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `REALTIME_BUS` | — |  | `postgres` | `postgres` (LISTEN/NOTIFY, no broker), `redis` (several instances), `memory` (tests). |
| `REALTIME_REDIS_URL` | — | ✓ |  | Redis / Valkey — required with `REALTIME_BUS=redis`. |
| `REALTIME_PREFIX` | — |  | `yasakia:rt:` | Channel prefix on the bus. |
| `REALTIME_STREAM_MAX_SECONDS` | — |  | `300` | A stream ends after this long and the client resumes. |

### Abuse defences — `ABUSE_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `ABUSE_RATE_LIMIT_STORE` | recommended |  | `memory` | `memory` (one instance) or `postgres` (shared — required before a second instance). |
| `ABUSE_CLIENT_IP_HEADER` | recommended |  |  | The header the edge sets with the client's address (App Platform: `do-connecting-ip`). |
| `ABUSE_TRUSTED_PROXY_HOPS` | — |  | `1` | Else: the entry this far from the right of `X-Forwarded-For`. |

### Operator — `OPERATOR_`

| Variable | Production | Secret | Default | What it does |
| :--- | :---: | :---: | :--- | :--- |
| `OPERATOR_API_TOKEN` | recommended | ✓ |  | The operators' service token for `/api/admin/*` (32+ characters). Unset: no admin route answers. |
| `OPERATOR_ALLOWED_IPS` | recommended |  |  | Addresses allowed to call the admin API (comma separated; empty: any outside production, none in production). |

## Database connections

Every process opens **one** pool (`packages/db/src/client.ts`, kept on `globalThis`: Next.js loads a module once per
module graph — route handlers, pages, instrumentation — and a module-level pool would be created three times; that is
what exhausted Orochia's dev database on 2026-10-12). Its size is `DATABASE_MAX_CONNECTIONS` (default **5**, capped at
50), idle connections close after 10 s. The realtime bus holds exactly **one** LISTEN connection per process. Every
connection is named (`application_name`), so `pg_stat_activity` says who holds what:

| Name | What | How many |
| :--- | :--- | :--- |
| `yasakia-web` | the pool of an instance | ≤ `DATABASE_MAX_CONNECTIONS` |
| `yasakia-listen` | the realtime bus's LISTEN (direct connection) | 1 per instance |
| `yasakia-migrate` | the release job | 1, during the release |
| `yasakia-seed` | the development seed | local only |

`DATABASE_DIRECT_URL` is optional: when `DATABASE_URL` goes through a transaction pooler (PgBouncer, DigitalOcean
connection pools), LISTEN and the migrations use the direct URL — a pooler breaks a LISTEN session and a migration's
transaction. Without it, `DATABASE_URL` serves both and must be direct.

Budget — at most **70 % of the usable slots** (headroom for a console, a stuck deploy, the platform's probes):

```
(instances + 1 rolling-deploy overlap) × (DATABASE_MAX_CONNECTIONS + 1 LISTEN) + migrate (1) + admin (1)  ≤ 70 % × usable slots
```

| Database | `max_connections` (reserved) | Usable | 70 % | With `DATABASE_MAX_CONNECTIONS=5` |
| :--- | :--- | :--- | :--- | :--- |
| App Platform dev database | 25 (3) | 22 | 15 | 1 instance: (1 + 1) × 6 + 2 = **14** ✓ |
| Managed PostgreSQL `db-s-1vcpu-1gb` | 25 (3) | 22 | 15 | 1 instance ✓ — a 2nd needs a bigger plan or a pooler |

When the database refuses connections (53300, restarting, unreachable) the server logs **one line** every 30 s and
answers 503 with `Retry-After`, never a stack per query.

## Scaling out

Up to ~3 instances: keep `REALTIME_BUS=postgres` and set `ABUSE_RATE_LIMIT_STORE=postgres` (shared counters). Beyond, create
a Managed Caching (Valkey) cluster and set `REALTIME_BUS=redis` + `REALTIME_REDIS_URL` — a variable and a redeploy, nothing
durable lives on the bus.

## Manual prerequisites (not automated)

| What | Where | Then |
| :--- | :--- | :--- |
| Bunny Storage zone **`yasakia`** + a pull zone on it, **Optimizer on**, **token authentication on** | Bunny dashboard | `MEDIA_STORAGE_ZONE`, `MEDIA_STORAGE_API_KEY` (zone password), `MEDIA_STORAGE_ENDPOINT` (region host), `MEDIA_CDN_HOSTNAME`, `MEDIA_CDN_TOKEN_AUTH_KEY` (the pull zone's URL token key) |
| A Mailgun sending domain for Yasakia (e.g. `mg.yasakia.com`), DNS verified | Mailgun + the DNS of the domain | `MAIL_API_KEY`, `MAIL_DOMAIN`, `MAIL_FROM` (`MAIL_API_URL` for the EU region) |
| The domain `yasakia.com` | registrar | `NEXT_PUBLIC_APP_URL` and the spec's `domains` |
| The production secrets | App Platform → Settings → Environment | `AUTH_SESSION_SECRET` (`openssl rand -hex 32`), `DATABASE_ENCRYPTION_KEY` (`openssl rand -base64 32` — keep a copy in the secret store), `OPERATOR_API_TOKEN`, `OPERATOR_ALLOWED_IPS` |

The test suites need none of these: CI and `npm run test:e2e` run on the local storage and the mail outbox.

## The public dev site (static)

`dev.yasakia.com` is a DigitalOcean App Platform app: a **static site** at `/` built from `apps/site` and the web app at `/app` (next section) — `deploy/digitalocean/web.app.yaml`
(`npm ci && npm run build -w apps/site`, output `apps/site/out`). No service, no database, no secret; the only build
variable is `APP_COMMIT_SHA` (`${_self.COMMIT_HASH}`), which the footer shows with `package.json`'s version. The app lives in
the DigitalOcean project `yasakia`; the DNS is a CNAME `dev` → the app's default domain.

## Dev deployment of the web app (app.yasakia.com · admin.yasakia.com)

One App Platform app, `deploy/digitalocean/web.app.yaml`, two hosts (the console is `APP_ADMIN_HOST`, same deployment, $0 more).
It is **not** a component of `yasakia-site` (the static site): a deployment of an app with a static site stalls on
`DatabaseTrustedSourcesNotReady` as soon as the app is a trusted source of the shared cluster (observed, even for a static-only
rollback); a service-only app deploys. The account is capped at **10 apps**, so creating it needs a free slot.

- **Cost**: one `basic-xxs` service (**$5/month**); the `migrate` PRE_DEPLOY job is billed only while it runs; the database is
  `yasakia_db` and the role `yasakia_user` on the shared dev cluster `krizaka-dev-pg` (no second cluster).
- **Secrets** (type SECRET, entered once, never printed): `AUTH_SESSION_SECRET`, `DATABASE_ENCRYPTION_KEY`, `DATABASE_URL` and
  `DATABASE_DIRECT_URL` (the role's **private** connection string, `private-<host>`, `sslmode=require`), `DATABASE_CA_CERT`
  (`doctl databases get-ca`). The cluster is not a `databases:` component; add the app to its trusted sources after creation:
  `doctl databases firewalls append <cluster> --rule app:<app-id>`.
- **Closed**: `AUTH_SIGNUP_ENABLED=false`, `AUTH_ALLOWED_IPS` = the one address that may open the console, `MAIL_PROVIDER=none` and
  `MEDIA_STORAGE_PROVIDER=none` (allowed only with `NEXT_PUBLIC_APP_ENV=dev`).
- **DNS** (Porkbun): CNAME `app` and `admin` → the app's default ingress host.
- **Accounts**: only `npm run db:qa-accounts` with `DATABASE_URL` and `QA_USER_PASSWORD` / `QA_ADMIN_PASSWORD` in the environment.
- The extensions `vector`, `cube` and `earthdistance` are created once by the database owner before the first release.
