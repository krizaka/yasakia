# ADR-001 — The talk-first agent and bilateral matching

- **Status**: Accepted (2026-10-16)
- **Scope**: `packages/ai`, `packages/matching`, `apps/web/lib/agent*.ts`, `rule_sets`, `facet_embeddings`
- **Builds on**: Orazaka's embeddings endpoint and chat stream; RFC "Universal Data Analytics & Recommendation Pack" (orazaka#174); ADR-078 (recommendations, live for Orochia)

## Context

Yasakia is the dating app where you talk first. An agent must get to know a person in their own words, write what it
understood, and later open a small batch (3 to 5) of people who fit them **and for whom they fit too**. Three questions
were open: how the agent talks (and where the words live), what is stored, and where the matching runs.

## Decisions

### 1. The agent is Orazaka's chat, one self-contained turn at a time

`POST /api/v1/chat/stream/{conversationId}` with Yasakia's service key (`svc_yasakia`, `AI_ENGINE_API_KEY`). The
**transcript lives in Yasakia** (`agent_messages`); every turn sends the persona, what is already understood, what is
missing and the last 40 messages, under a **fresh conversation id** — and the session is deleted right after
(`DELETE /api/v1/chat/sessions/{id}`), so the engine keeps no memory of a person's words. The conversation id is the proof
of the run in Orazaka's logs. Nothing calls a model provider, and there is no stand-in in production: unconfigured, the
agent answers 503 (`AI_UNAVAILABLE`), and a turn that could not be answered is taken back (no half-turn).

### 2. Understanding = extraction, then a portrait

After each reply (out of the person's wait) a second call extracts **only what was said**: the basics that are
non-negotiable filters (gender, who they want to meet, an age range, what they look for, a city) and soft facets
(`story`, `passions`, `values`, `humour`, `weekend`, `seeking`, `dealbreakers`, `beliefs`). Basics write the profile;
facets go through the sealed `facets` door (`dealbreakers` and `beliefs` are AES-256-GCM). The city is the centre of the
city, stored with `geo_precision_m = 10000` — honest about its coarseness. When the agent knows enough (turns, every
basic, the required facet — who they look for — and a minimum number of facets: a **rule set**), a third call writes the **portrait** — `self` and `seeking`, in words, in
the person's language, plus the same two texts in English — and the two are embedded (`facet_embeddings` SELF/SEEKING).

The embedding model today (GTE Large) is English; the portrait is therefore embedded from its English text. BGE-M3
(multilingual, also 1024-d) is planned at Orazaka and needs no migration: `facet_embeddings.model` records the model, and a
change of model is a re-embedding of every portrait.

### 3. Matching runs in Yasakia's own database, not in Orazaka's recommender

Orazaka serves a recommender (`/api/v1/recommendations/*`, ADR-078) for Orochia's videos. For Yasakia it is not ready
(the `data-analytics` pack category exists, no pack stands on it; the scopes for bilateral matching are not decided in
RFC #174). More importantly, a portrait is the most intimate text the product holds: it should reach Orazaka only as
**vectors**, never as a profile to store. So:

- Orazaka produces the embeddings (`ai:embed`, a real run per portrait, `runId` logged);
- Yasakia keeps them in `facet_embeddings` (pgvector, HNSW, cosine) and does the matching with `earthdistance` and
  `packages/matching` — pure, tested.

When Orazaka's bilateral pack lands with pseudonymous items (Loi 25), this ADR is revisited: the interface
(`selectBatch`) does not change.

### 4. A pair fits only if it fits both ways

1. **Hard filters, both ways**: gender ⇄ seeking, age ⇄ age range, intent ⇄ intent (a table of compatible intents),
   distance inside **both** radii. No vector is looked at before they pass.
2. **Affinity = the weaker direction**: `min(cos(A.seeking, B.self), cos(B.seeking, A.self))`.
3. **Batch**: the best 3 to 5 above `minAffinity`; fewer than 3 means **no batch** — the product never fills a batch with
   people who do not fit.
4. The affinity is internal. It orders; it is never sent to a client. The reasons are **words**, both ways (written by
   the agent from the two portraits).

### 5. Parameters are versioned rows

`rule_sets` (domain `MATCHING`, `AGENT`; version 1 seeded by the migration; one active per domain; a reason per
version): batch size, hours, candidate pool, minimum affinity, minimum turns, history length, required facets. Bounds are
checked on read (zod); a row outside them is a 503, not a silent default. An admin page (draft → preview → publish with a
reason → rollback) is follow-up work; until then a version is published by SQL with its reason.

### 6. Dimension 1024

`facet_embeddings.vector` goes from 768 (a local model never used) to **1024**, Orazaka's models' dimension. No row
existed on any deployment; the migration clears the table first.

### 7. Calibration on the dev cast (real embeddings, 2026-10-16)

With GTE Large (English) the cosines between a *seeking* text and a *self* text sit between 0.50 and 0.80, whatever the
fit: the model compresses. On the Montréal cast (10 fictional adults, `packages/db/personas/montreal.json`) the weaker
direction for the QA persona Camille ranged from 0.73 (Mathieu, Hugo) to 0.50 (Samuel) and 0.495 (Jérémie, who fits
the filters and nothing she looks for): `minAffinity` 0.50 keeps the five who fit and drops the one who does not. It is a
**rule-set value**, not a constant: BGE-M3 will spread the scores and the value is republished (a new version, with its reason).

## Consequences

- A person sees the agent's reply at once; what it understood appears a few seconds later (the page looks again for 45 s).
- The understanding runs in the web process after the response, one run per person at a time. A crash leaves the turn
  to be understood on the next message — acceptable on dev; a durable job (outbox) comes with the batch endpoints if the
  load asks for it.
- Token cost is estimated (4 characters a token): the engine does not report usage on a stream. The cost dashboard
  (`ai_calls`) says so by being an estimate.
- Dev key: `svc_yasakia`'s key is unscoped (its account has no Studio grant, so no paid capability). The edge has no
  `ai:chat` scope yet; adding one (a path pattern for `/api/v1/chat/stream/*`) lets the key be scoped to `ai:chat ai:embed`.

## Rejected

- **Orazaka's chat memory as the transcript** — the engine would hold the most intimate words; Yasakia could not export or
  erase them in one transaction (Loi 25).
- **A single score and a ranked list** — a catalogue by another name; the product is a small batch with reasons.
- **A form for the basics** — the basics are the agent's first questions; the person can still correct them in the account.
- **Matching in Orazaka now** — see 3.
