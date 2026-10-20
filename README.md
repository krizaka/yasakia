# Yasakia

**The dating app where you talk first.** An AI agent gets to know you — one question at a time, with humour, in your
language — then opens a **small batch** of three to five people who fit you **both ways**, each with *why you two* in
words, never a score. The next batch waits until you **debrief** the last one, so every batch fits better than the one
before. No swipe, no catalogue, no fake match.

[![CI](https://github.com/krizaka/yasakia/actions/workflows/ci.yml/badge.svg)](https://github.com/krizaka/yasakia/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/krizaka/yasakia/badge)](https://scorecard.dev/viewer/?uri=github.com/krizaka/yasakia)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![krizaka.com](https://img.shields.io/badge/dev.yasakia.com-Yasakia-14b8a6)](https://dev.yasakia.com)

This repository is Yasakia's **API** (Next.js route handlers), its **packages** (data, agent, matching, media), its **docs**, the
**web console** (`/app/{en|fr}`: the person's space, the operator's on the admin host), the three **legal pages** (privacy, terms,
account deletion) and the public **landing** of [dev.yasakia.com](https://dev.yasakia.com) (`apps/site`: home, how it works, a demo
that plays a real run, the changelog). Registration is closed: Yasakia is in Dev preview, QA accounts only. The app for iOS and Android is
[`krizaka/yasakia-mobile`](https://github.com/krizaka/yasakia-mobile). Yasakia is the third open-source product of
[Krizaka](https://krizaka.com), built on the same foundations as Orochia and on the shared `@krizaka/*` bricks; its AI
runs on Orazaka, and nowhere else.

## Start

```bash
npm run setup   # Node ≥ 22 and Docker: .env with fresh secrets, PostgreSQL 16 + pgvector, migrations, seed
npm run dev     # http://localhost:3000/api/healthz
```

Then [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md): sign up the way the app does, upload a photo, read the API.

## What is inside

- **The agent you talk to first** — one question at a time, in your language, through Orazaka; what it understood is shown in your own words (the sensitive part sealed), then a portrait written in words and embedded in two vectors (who you are, who you look for). [ADR-001](docs/adr/ADR-001-talk-first-agent-and-bilateral-matching.md). The matching it will feed is pure and tested (`packages/matching`): hard filters both ways, then the weaker of the two directions.
- **Accounts** — sign-in with a code by e-mail or a password, "forgot password" with a 6-digit code by e-mail (the same answer for every address), a password change that ends the other web sessions, a profile with Krizaka's default picture; registration is closed by configuration (`AUTH_SIGNUP_ENABLED`).
- **Native sessions** by e-mail code — no password; 18+ checked by the server; stateless tokens re-checked against the
  account on every request.
- **Private photos**: a signed upload, re-encoding that strips every metadata block (GPS included), blurhash, then a
  URL signed for one viewer for 300 seconds — only for someone in your batch or your intro.
- **Real people** — a profile holds 4 to 6 photos, at least 2 with the face (rules as data), checked by Orazaka (faces counted, nothing written over a photo, no screenshot, nobody who looks under 18; **no identification**; the face comparison is off until reviewed and needs the person's explicit consent, nothing kept) before they are shown or a batch opens. **The AI never writes for you**: every message of an introduction is typed by a person; a small mark (*written by hand · uncertain · probably generated · too short to judge*) is a signal, never a verdict, never a number, never a block. Photos, videos and voice messages can be sent — as they are, privately, after a safety check that fails closed, limits as data, gone with the conversation. See [AGENTS.md](AGENTS.md) §3.
- **Privacy by design**: the position rounded to ~1 km before it is stored, sensitive answers encrypted at rest
  (AES-256-GCM), export and deletion in the API from day one, blocks and reports that work at once.
- **PostgreSQL does the heavy lifting**: pgvector (HNSW) for who you are and who you seek, `earthdistance` for the
  radius, LISTEN/NOTIFY for live events — one database, no broker.
- **Introductions where nobody writes for you** — seven days, every message typed by the two people; a small **signal** says how a
  message was written (a signal, never a verdict), and photos, videos and voice messages are sent as they are (limits as data, no
  editing) and shown once Orazaka's safety check approves them.
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
