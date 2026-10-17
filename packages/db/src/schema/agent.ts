import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid, varchar, vector } from "drizzle-orm/pg-core";

import { accounts } from "./accounts";
import { agentMessageRoleEnum, agentStateEnum, aiCallPurposeEnum, embeddingKindEnum } from "./enums";

/**
 * The dimension of `facet_embeddings.vector`, fixed by the migration (1024: Orazaka's embedding models — GTE Large today,
 * BGE-M3 planned — answer 1024). A model of another dimension is a new migration and a re-embedding of every portrait;
 * `facet_embeddings.model` records the model of each vector (ADR-001).
 */
// @fixed: a technical fact — the dimension of the vectors the column stores, fixed by the migration.
export const EMBEDDING_DIMENSIONS = 1024;

/** One per account: where it stands in the loop (§1.2) and what its agent may still spend. */
export const agentSessions = pgTable("agent_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id")
    .references(() => accounts.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  state: agentStateEnum("state").default("ONBOARDING").notNull(),
  /** The budget of the session (AI_SESSION_TOKEN_BUDGET): spent, the agent concludes. */
  tokenBudget: integer("token_budget").default(60000).notNull(),
  tokensUsed: integer("tokens_used").default(0).notNull(),
  callsUsed: integer("calls_used").default(0).notNull(),
  /** The portrait the agent wrote ("who you are, who you are looking for"), corrected by the person. */
  portrait: jsonb("portrait").$type<Record<string, unknown>>(),
  stateChangedAt: timestamp("state_changed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** The conversation with the agent. The agent never reads `intro_messages`. */
export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .references(() => agentSessions.id, { onDelete: "cascade" })
      .notNull(),
    role: agentMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    /** Quick replies offered with an agent message. */
    chips: jsonb("chips").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_messages_session_idx").on(t.sessionId, t.createdAt)],
);

/**
 * What the agent understood, one row per facet key. A sensitive facet's value is **sealed** (AES-256-GCM,
 * packages/db/src/crypto.ts, context `facets:<accountId>:<key>`) in `value_sealed`; a non-sensitive one is in `value`.
 * Exactly one of the two is set.
 */
export const facets = pgTable(
  "facets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    key: varchar("key", { length: 60 }).notNull(),
    value: jsonb("value"),
    valueSealed: text("value_sealed"),
    sensitive: boolean("sensitive").default(false).notNull(),
    /** 0..1 — 1 when the person set it themselves (portrait corrections). Never shown as a number. */
    confidence: real("confidence").default(0).notNull(),
    sourceMessageId: uuid("source_message_id").references(() => agentMessages.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("facets_account_key_idx").on(t.accountId, t.key),
    check("facets_one_value", sql`(${t.value} is null) <> (${t.valueSealed} is null)`),
    check("facets_sealed_when_sensitive", sql`not ${t.sensitive} or ${t.value} is null`),
  ],
);

/**
 * Two vectors per person (SELF, SEEKING). HNSW with cosine distance: queried while the pool grows, no training step
 * (IVFFlat needs data to build its lists and degrades as rows are added) — docs/DATABASE.md, "Design notes".
 */
export const facetEmbeddings = pgTable(
  "facet_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .references(() => accounts.id, { onDelete: "cascade" })
      .notNull(),
    kind: embeddingKindEnum("kind").notNull(),
    vector: vector("vector", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("facet_embeddings_account_kind_idx").on(t.accountId, t.kind),
    index("facet_embeddings_vector_idx").using("hnsw", t.vector.op("vector_cosine_ops")),
  ],
);

/** Every call to a model: the cost dashboard (provider, model, tokens, latency, purpose). Kept when the account goes. */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    purpose: aiCallPurposeEnum("purpose").notNull(),
    tokensIn: integer("tokens_in").default(0).notNull(),
    tokensOut: integer("tokens_out").default(0).notNull(),
    latencyMs: integer("latency_ms").default(0).notNull(),
    ok: boolean("ok").default(true).notNull(),
    /** The engine's id of the run (the conversation id of a chat turn, the `runId` of an embedding): the line in Orazaka's logs. */
    runRef: varchar("run_ref", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ai_calls_created_idx").on(t.createdAt), index("ai_calls_account_idx").on(t.accountId)],
);

/**
 * The parameters that steer the agent and the matching, as **versioned rows** (org rule: a parameter a business owner
 * could want to change is data, never a constant). One row per (domain, version); at most one is active per domain.
 * Version 1 is seeded by the migration; a new version is published with a reason, the old rows stay (the audit trail
 * and the way back). Bounds are checked when a row is read (`packages/matching`, `apps/web/lib/rule-sets.ts`).
 */
export const ruleSets = pgTable(
  "rule_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domain: varchar("domain", { length: 20 }).notNull(),
    version: integer("version").notNull(),
    active: boolean("active").default(false).notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("rule_sets_domain_version_idx").on(t.domain, t.version),
    uniqueIndex("rule_sets_one_active_idx").on(t.domain).where(sql`${t.active}`),
  ],
);
