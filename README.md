# Yasakia

**The dating app where you talk first.** An AI agent gets to know you — one question at a time, with humour, in your
language — then opens a **small batch** of three to five people who fit you **both ways**, each with *why you two* in
words, never a score. The next batch waits until you **debrief** the last one, so every batch fits better than the one
before. No swipe, no catalogue, no fake match.

[![CI](https://github.com/krizaka/yasakia/actions/workflows/ci.yml/badge.svg)](https://github.com/krizaka/yasakia/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![krizaka.com](https://img.shields.io/badge/dev.yasakia.com-Yasakia-14b8a6)](https://dev.yasakia.com)

This repository is Yasakia's **API** (Next.js route handlers), its **packages** (data, photos), its **docs** and its
three **web pages** (privacy, terms, account deletion). The app for iOS and Android is
[`krizaka/yasakia-mobile`](https://github.com/krizaka/yasakia-mobile). Yasakia is the third open-source product of
[Krizaka](https://krizaka.com), built on the same foundations as Orochia and on the shared `@krizaka/*` bricks; its AI
will run on Orazaka.

## Start

```bash
npm run setup   # Node ≥ 22 and Docker: .env with fresh secrets, PostgreSQL 16 + pgvector, migrations, seed
npm run dev     # http://localhost:3000/api/healthz
```

Then [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md): sign up the way the app does, upload a photo, read the API.

## What is inside

- **Native sessions** by e-mail code — no password; 18+ checked by the server; stateless tokens re-checked against the
  account on every request.
- **Private photos**: a signed upload, re-encoding that strips every metadata block (GPS included), blurhash, then a
  URL signed for one viewer for 300 seconds — only for someone in your batch or your intro.
- **Privacy by design**: the position rounded to ~1 km before it is stored, sensitive answers encrypted at rest
  (AES-256-GCM), export and deletion in the API from day one, blocks and reports that work at once.
- **PostgreSQL does the heavy lifting**: pgvector (HNSW) for who you are and who you seek, `earthdistance` for the
  radius, LISTEN/NOTIFY for live events — one database, no broker.
- **Fail-closed**: a production server refuses to start without its secrets; no demo mode, no fake profile.

| Doc | |
| :--- | :--- |
| [GETTING_STARTED](docs/GETTING_STARTED.md) | Run it, call it |
| [DEVELOPMENT](docs/DEVELOPMENT.md) | Commands, schema changes, tests |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | The pieces and why |
| [PRIVACY](docs/PRIVACY.md) | What is stored, where, how long, how it is deleted |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | DigitalOcean, the connection budget, the manual prerequisites |
| [API_CONTRACTS](docs/API_CONTRACTS.md) · [DATABASE](docs/DATABASE.md) | Generated from the code |

The rules every change keeps: [AGENTS.md](AGENTS.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Security:
[SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE) © Krizaka

---

<sub>A Krizaka product · [krizaka.com](https://www.krizaka.com) · Apache-2.0</sub>
