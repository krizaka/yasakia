# Contributing to Yasakia

Thank you for helping. Yasakia is open source (Apache-2.0) and built in the open by [Krizaka](https://krizaka.com).

## Before you start

- Read [AGENTS.md](AGENTS.md) — the contract every change keeps (invariants, boundaries, definition of done) — and
  [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- For anything larger than a fix, open an issue first so we agree on the shape.
- A security problem goes to [SECURITY.md](SECURITY.md), never to an issue.

## The loop

```bash
npm run setup            # once (Node ≥ 20, Docker)
git switch -c feat/<topic>
npm run dev
npm run check            # lint, i18n, ratchet, types, unit tests, docs freshness
npm run test:e2e         # the feature scenarios, on their own database
```

- Conventional Commits (`feat(photos): …`, `fix(auth): …`); one topic per pull request; `main` is protected (CI must be
  green, squash merge).
- A schema change ships with its migration and the regenerated docs (`npm run docs:generate`).
- New behaviour comes with its scenarios in `e2e/scenarios.mjs`.
- Every word a person reads is in `apps/web/messages/{en,fr}.json` — in both languages; French is a language of design.
- Screenshots and recordings of a pull request are linked, never committed.

## What we will not merge

A score shown to a person, a fake profile in the real database, an exact position stored, a raw media URL in an
answer, a secret with a production default, a payment that skips the debrief or enlarges a batch.
