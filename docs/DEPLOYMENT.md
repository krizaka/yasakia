---
title: Deployment
description: Deploying the Yazakia API on DigitalOcean App Platform — the image, the release job, the configuration, the database connection budget, and the manual prerequisites.
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

Every variable is in `.env.example`. Production refuses to start without `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`,
`DATABASE_URL`, the Bunny storage (`STORAGE_DRIVER=bunny`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`,
`BUNNY_PULL_ZONE_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY`) and Mailgun (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`). Recommended:
`RATE_LIMIT_STORE=postgres`, `CLIENT_IP_HEADER=do-connecting-ip`, `YAZAKIA_ADMIN_API_TOKEN` + `ADMIN_ALLOWED_IPS`.

## Database connections

Every process opens **one** pool (`packages/db/src/client.ts`, kept on `globalThis`: Next.js loads a module once per
module graph — route handlers, pages, instrumentation — and a module-level pool would be created three times; that is
what exhausted Orochia's dev database on 2026-10-12). Its size is `DATABASE_MAX_CONNECTIONS` (default **5**, capped at
50), idle connections close after 10 s. The realtime bus holds exactly **one** LISTEN connection per process. Every
connection is named (`application_name`), so `pg_stat_activity` says who holds what:

| Name | What | How many |
| :--- | :--- | :--- |
| `yazakia-web` | the pool of an instance | ≤ `DATABASE_MAX_CONNECTIONS` |
| `yazakia-listen` | the realtime bus's LISTEN (direct connection) | 1 per instance |
| `yazakia-migrate` | the release job | 1, during the release |
| `yazakia-seed` | the development seed | local only |

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

Up to ~3 instances: keep `REALTIME_BUS=postgres` and set `RATE_LIMIT_STORE=postgres` (shared counters). Beyond, create
a Managed Caching (Valkey) cluster and set `REALTIME_BUS=redis` + `REDIS_URL` — a variable and a redeploy, nothing
durable lives on the bus.

## Manual prerequisites (not automated)

| What | Where | Then |
| :--- | :--- | :--- |
| Bunny Storage zone **`yazakia`** + a pull zone on it, **Optimizer on**, **token authentication on** | Bunny dashboard | `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY` (zone password), `BUNNY_STORAGE_ENDPOINT` (region host), `BUNNY_PULL_ZONE_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY` (the pull zone's URL token key) |
| A Mailgun sending domain for Yazakia (e.g. `mg.yazakia.com`), DNS verified | Mailgun + the DNS of the domain | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAIL_FROM` (`MAILGUN_API_URL` for the EU region) |
| The domain `yazakia.com` | registrar | `NEXT_PUBLIC_APP_URL` and the spec's `domains` |
| The production secrets | App Platform → Settings → Environment | `SESSION_SECRET` (`openssl rand -hex 32`), `DATA_ENCRYPTION_KEY` (`openssl rand -base64 32` — keep a copy in the secret store), `YAZAKIA_ADMIN_API_TOKEN`, `ADMIN_ALLOWED_IPS` |

The test suites need none of these: CI and `npm run test:e2e` run on the local storage and the mail outbox.
