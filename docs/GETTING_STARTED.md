---
title: Getting Started
description: Run the Yazakia API locally in two commands, sign up the way the app does, upload a photo, and know where to go next.
---

# Getting Started

Yazakia is the dating app where you talk first: an AI agent gets to know you, then opens small batches of profiles
that fit **both ways**. This repository is its API (Next.js route handlers), its packages and its three web pages; the
iOS and Android app is [`yazakia-mobile`](https://github.com/krizaka/yazakia-mobile).

## Prerequisites

- Node.js 20 or later
- Docker (Desktop or the daemon) — PostgreSQL 16 with pgvector runs in a container on port **5435**

## Two commands

```bash
npm run setup     # .env with fresh secrets, PostgreSQL + pgvector, migrations, development data
npm run dev       # the API on http://localhost:3000
```

`npm run setup` is idempotent: run it again after pulling. It writes `.env` from `.env.example` with a generated
`SESSION_SECRET` and `DATA_ENCRYPTION_KEY`, and seeds six **seed** accounts (`*@seed.yazakia.test`, names ending in
"(seed)", generated geometric avatars — never a real photo).

Check it answers:

```bash
curl http://localhost:3000/api/healthz
# {"success":true,"status":"ok","database":true,…}
```

## Sign up like the app does

Codes go to the server log by default (`MAIL_DELIVERY=log`); `MAIL_DELIVERY=file` writes them to `.mail-outbox/`.

```bash
curl -X POST localhost:3000/api/auth/request-code -H 'content-type: application/json' \
  -d '{"email":"you@example.com","locale":"fr"}'
# the code is in the server log: "Ton code de connexion : 123456"

curl -X POST localhost:3000/api/auth/verify -H 'content-type: application/json' \
  -d '{"email":"you@example.com","code":"123456","client":"native","birthDate":"1994-03-12","acceptTerms":true,"locale":"fr"}'
# {"success":true,"token":"yz1.…","created":true,…}

TOKEN=yz1.…
curl localhost:3000/api/me -H "Authorization: Bearer $TOKEN"
curl -X PUT localhost:3000/api/me/location -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"lat":45.508844,"lng":-73.587811}'
# {"location":{"lat":45.508…,"lng":-73.58…,"precisionM":1000}} — the exact point is never stored
```

A photo: declare it, PUT the bytes to the signed URL, complete it, then ask for a signed view.

```bash
curl -X POST localhost:3000/api/me/photos -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"contentType\":\"image/jpeg\",\"bytes\":$(wc -c < me.jpg)}"
# → photo.id and upload.url (valid 300 s)
curl -X PUT "<upload.url>" -H 'content-type: image/jpeg' --data-binary @me.jpg
curl -X PUT localhost:3000/api/me/photos/<id>/complete -H "Authorization: Bearer $TOKEN"
curl "localhost:3000/api/photos/<id>?w=640" -H "Authorization: Bearer $TOKEN"
# → a URL signed for you, for 300 s
```

Every endpoint and its access rule: [API_CONTRACTS.md](API_CONTRACTS.md). The web pages:
[localhost:3000/privacy](http://localhost:3000/privacy), `/terms`, `/delete-account` (English or French).

## Next

- [DEVELOPMENT.md](DEVELOPMENT.md) — the commands, the database lifecycle, the tests.
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit, and why.
- [PRIVACY.md](PRIVACY.md) — what is stored, where, for how long, how it is deleted.
- [DEPLOYMENT.md](DEPLOYMENT.md) — DigitalOcean, the connection budget, the manual prerequisites.
