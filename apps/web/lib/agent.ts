import {
  type AiProvider,
  AiUnavailableError,
  askPrompt,
  Extraction,
  extractPrompt,
  type Language,
  parseModel,
  Portrait,
  portraitPrompt,
  type Turn,
  TurnRole,
  wrapPrompt,
} from "@yasakia/ai";
import { agentMessages, agentSessions, aiCalls, db, facetEmbeddings, profiles, readFacets, writeFacet } from "@yasakia/db";
import { differenceInSeconds } from "date-fns";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { setLocation } from "./account";
import { AgentState, BASIC_WORDS, basicsFrom, estimateTokens, MessageRole, missingBasics, readiness } from "./agent-rules";
import { refuse } from "./http";
import { agentRules } from "./rule-sets";

/**
 * The talk-first agent. A turn is two things: the **reply** (answered at once) and the **understanding** (extraction of
 * the basics and facets, then — when it knows enough — the portrait, its two vectors and a closing message), run after
 * the reply so the person is never kept waiting. Everything goes through Orazaka (`lib/ai.ts`); the transcript lives
 * here (`agent_messages`), the engine keeps nothing of it. Sensitive facets are sealed (`packages/db/src/facets.ts`).
 */

const BASICS_SAID = "basics_said";
/** A turn that never got its answer (a crash) is given up after this long. */
const STALE_TURN_SECONDS = 120; // @fixed: a crash-recovery window, not a business parameter

export interface AgentMessageView {
  id: string;
  role: Exclude<MessageRole, "SYSTEM">;
  content: string;
  createdAt: string;
}

/** The session row of an account, created on first use. */
async function ensureSession(accountId: string) {
  await db.insert(agentSessions).values({ accountId }).onConflictDoNothing({ target: agentSessions.accountId });
  const [session] = await db.select().from(agentSessions).where(eq(agentSessions.accountId, accountId)).limit(1);
  return session;
}

const toView = (m: { id: string; role: string; content: string; createdAt: Date }): AgentMessageView => ({
  id: m.id,
  role: m.role === MessageRole.User ? MessageRole.User : MessageRole.Agent,
  content: m.content,
  createdAt: m.createdAt.toISOString(),
});

/** The engine run ids of an account's calls (the last of each purpose): the owner can show Orazaka's logs a real run was made. */
async function evidenceFor(accountId: string): Promise<Record<string, string>> {
  const rows = await db
    .selectDistinctOn([aiCalls.purpose], { purpose: aiCalls.purpose, runRef: aiCalls.runRef })
    .from(aiCalls)
    .where(and(eq(aiCalls.accountId, accountId), eq(aiCalls.ok, true), sql`${aiCalls.runRef} is not null`))
    .orderBy(aiCalls.purpose, desc(aiCalls.createdAt));
  return Object.fromEntries(rows.map((r) => [r.purpose, r.runRef ?? ""]));
}

/** What the person sees of their agent: the talk, what it understood (their own words), the portrait once written. */
export async function agentView(accountId: string) {
  const session = await ensureSession(accountId);
  const messages = await db.select().from(agentMessages).where(eq(agentMessages.sessionId, session.id)).orderBy(asc(agentMessages.createdAt), asc(agentMessages.id));
  const facets = await readFacets(db, accountId);
  const said = (facets.find((f) => f.key === BASICS_SAID)?.value as string[] | undefined) ?? [];
  const { params } = await agentRules();
  const userTurns = messages.filter((m) => m.role === MessageRole.User).length;
  return {
    state: session.state,
    messages: messages.filter((m) => m.role !== MessageRole.System).map(toView),
    facets: facets.filter((f) => f.key !== BASICS_SAID).map((f) => ({ key: f.key, value: f.value, sensitive: f.sensitive })),
    portrait: session.portrait ? { self: String((session.portrait as { self?: unknown }).self ?? ""), seeking: String((session.portrait as { seeking?: unknown }).seeking ?? "") } : null,
    missingBasics: missingBasics(said),
    progress: { userTurns, minUserTurns: params.minUserTurns },
    // The turn the person is waiting on: the last word is theirs and no answer came yet.
    waiting: messages.at(-1)?.role === MessageRole.User,
    // Where this agent's work can be found in Orazaka's logs: the proof of use, shown to its owner.
    evidence: await evidenceFor(accountId),
  };
}

async function recordCall(accountId: string, call: { model: string; purpose: "CHAT" | "EXTRACT" | "EMBED" | "PORTRAIT"; tokensIn: number; tokensOut: number; ms: number; ok: boolean; runRef: string }) {
  await db.insert(aiCalls).values({ accountId, provider: "orazaka", model: call.model, purpose: call.purpose, tokensIn: call.tokensIn, tokensOut: call.tokensOut, latencyMs: call.ms, ok: call.ok, runRef: call.runRef });
  // The id of the run in Orazaka's logs, kept next to the call: the proof that a reply, a portrait, a batch was made there.
  console.log(`[agent] ${call.purpose} ${call.ok ? "ok" : "failed"} run=${call.runRef} ms=${call.ms}`);
}

/** One chat call, recorded on the cost dashboard whether it worked or not. */
async function chat(ai: AiProvider, accountId: string, purpose: "CHAT" | "EXTRACT" | "PORTRAIT", prompt: string): Promise<string> {
  const conversationId = crypto.randomUUID();
  const started = performance.now();
  try {
    const result = await ai.chat({ conversationId, prompt });
    await recordCall(accountId, { model: "orazaka-chat", purpose, tokensIn: estimateTokens(prompt), tokensOut: estimateTokens(result.text), ms: result.ms, ok: true, runRef: conversationId });
    await db.update(agentSessions).set({ tokensUsed: sql`${agentSessions.tokensUsed} + ${estimateTokens(prompt) + estimateTokens(result.text)}`, callsUsed: sql`${agentSessions.callsUsed} + 1`, updatedAt: sql`now()` }).where(eq(agentSessions.accountId, accountId));
    return result.text;
  } catch (error) {
    await recordCall(accountId, { model: "orazaka-chat", purpose, tokensIn: estimateTokens(prompt), tokensOut: 0, ms: Math.round(performance.now() - started), ok: false, runRef: conversationId });
    throw error;
  }
}

/** The transcript as the prompts want it: the last `limit` messages, oldest first. */
async function transcript(sessionId: string, limit: number): Promise<Turn[]> {
  const rows = await db.select({ role: agentMessages.role, content: agentMessages.content }).from(agentMessages).where(eq(agentMessages.sessionId, sessionId)).orderBy(desc(agentMessages.createdAt), desc(agentMessages.id)).limit(limit);
  return rows
    .filter((r) => r.role !== MessageRole.System)
    .reverse()
    .map((r) => ({ role: r.role === MessageRole.User ? TurnRole.User : TurnRole.Agent, content: r.content }));
}

/** A person speaks, the agent answers. The understanding of the turn is {@link understand}, run by the caller after the response. */
export async function sendMessage(ai: AiProvider, account: { id: string; locale: Language }, rawContent: string, now: Date): Promise<{ message: AgentMessageView; userMessageId: string }> {
  const { params } = await agentRules();
  const content = rawContent.trim();
  if (!content || content.length > params.messageMaxChars) throw refuse(400, "MESSAGE_LENGTH", "A message is 1 to a few lines long");
  const session = await ensureSession(account.id);
  if (session.state !== AgentState.Onboarding) throw refuse(409, "CONVERSATION_CLOSED", "The agent has already written your portrait");
  if (session.tokensUsed >= session.tokenBudget) throw refuse(409, "BUDGET_SPENT", "The agent has said all it can for now");

  // One turn at a time: the check and the insert are one step under a lock per person (two clicks at once cannot both pass).
  // A turn that never got its answer (a crash) is given up after two minutes.
  const userMessage = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`agent:${account.id}`}))`);
    const [last] = await tx.select({ role: agentMessages.role, createdAt: agentMessages.createdAt }).from(agentMessages).where(eq(agentMessages.sessionId, session.id)).orderBy(desc(agentMessages.createdAt)).limit(1);
    if (last?.role === MessageRole.User && differenceInSeconds(now, last.createdAt) < STALE_TURN_SECONDS) throw refuse(409, "TURN_IN_PROGRESS", "The agent is still answering");
    const [inserted] = await tx.insert(agentMessages).values({ sessionId: session.id, role: MessageRole.User, content }).returning({ id: agentMessages.id });
    return inserted;
  });
  try {
    const turns = await transcript(session.id, params.historyMessages);
    const facets = await readFacets(db, account.id);
    const said = (facets.find((f) => f.key === BASICS_SAID)?.value as string[] | undefined) ?? [];
    const reply = await chat(ai, account.id, "CHAT", askPrompt({ language: account.locale, turns, known: facets.map((f) => f.key).filter((k) => k !== BASICS_SAID), missingBasics: missingBasics(said).map((b) => BASIC_WORDS[b]) }));
    const [agentMessage] = await db.insert(agentMessages).values({ sessionId: session.id, role: MessageRole.Agent, content: reply }).returning();
    return { message: toView(agentMessage), userMessageId: userMessage.id };
  } catch (error) {
    // The agent could not answer: the person's message is taken back so they can send it again.
    await db.delete(agentMessages).where(eq(agentMessages.id, userMessage.id));
    throw error;
  }
}

const running = new Set<string>();
const again = new Set<string>();

/**
 * What the agent understood so far, and — when it knows enough — the portrait. Never throws (it runs after the response):
 * a failure is logged and the next turn tries again. One run per account at a time in this process; a message that
 * arrives while one runs makes it run once more when it ends.
 */
export async function understand(ai: AiProvider, account: { id: string; locale: Language }, sourceMessageId: string, now: Date): Promise<void> {
  if (running.has(account.id)) {
    again.add(account.id);
    return;
  }
  running.add(account.id);
  try {
    do {
      again.delete(account.id);
      await understandOnce(ai, account, sourceMessageId, now);
    } while (again.has(account.id));
  } catch (error) {
    console.error(`[agent] understanding failed: ${error instanceof AiUnavailableError ? `${error.code} — ${error.message}` : (error as Error).name}`);
  } finally {
    running.delete(account.id);
    again.delete(account.id);
  }
}

async function understandOnce(ai: AiProvider, account: { id: string; locale: Language }, sourceMessageId: string, now: Date): Promise<void> {
  const { params } = await agentRules();
  const session = await ensureSession(account.id);
  if (session.state !== AgentState.Onboarding) return;
  const turns = await transcript(session.id, params.historyMessages);
  const extraction = await withRetries(async () => parseModel(await chat(ai, account.id, "EXTRACT", extractPrompt({ turns })), Extraction));

  const update = basicsFrom(extraction);
  if (Object.keys(update.profile).length) await db.update(profiles).set({ ...update.profile, intent: update.profile.intent as never, updatedAt: now }).where(eq(profiles.accountId, account.id));
  if (update.place) await setLocation(account.id, update.place.lat, update.place.lng, now, CITY_PRECISION_M);
  for (const facet of extraction.facets ?? []) {
    await writeFacet(db, account.id, { key: facet.key, value: facet.value, sensitive: SENSITIVE.has(facet.key), confidence: 0.7, sourceMessageId });
  }
  const before = ((await readFacets(db, account.id)).find((f) => f.key === BASICS_SAID)?.value as string[] | undefined) ?? [];
  const said = [...new Set([...before, ...update.said])];
  await writeFacet(db, account.id, { key: BASICS_SAID, value: said, sensitive: false, confidence: 1 });

  const facetKeys = (await readFacets(db, account.id)).map((f) => f.key);
  const userTurns = turns.filter((t) => t.role === TurnRole.User).length;
  if (readiness({ userTurns, said, facetKeys }, params).ready) await finalize(ai, account, session.id, turns, now);
}

const SENSITIVE = new Set(["dealbreakers", "beliefs"]);
/** An agent-derived position is a city's centre: it says so in its precision. */
const CITY_PRECISION_M = 10_000; // @fixed: a city-level position is coarser than the 1 km grid of a phone's

/** A model sometimes answers a shape that does not fit: ask again, up to {@link ATTEMPTS} times, then give up (the next message tries again). */
const ATTEMPTS = 3; // @fixed: how many times a model is asked again before giving up — a robustness setting of the adapter, not a business parameter

async function withRetries<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof AiUnavailableError && error.code === "bad_response") || attempt >= ATTEMPTS) throw error;
    }
  }
}

/** The portrait in two languages-of-use, its two vectors, the state move, and the agent's closing words. */
async function finalize(ai: AiProvider, account: { id: string; locale: Language }, sessionId: string, turns: Turn[], now: Date): Promise<void> {
  const facets = await readFacets(db, account.id);
  const understood = Object.fromEntries(facets.filter((f) => f.key !== BASICS_SAID && !f.sensitive).map((f) => [f.key, f.value]));
  const portrait = await withRetries(async () => parseModel(await chat(ai, account.id, "PORTRAIT", portraitPrompt({ language: account.locale, turns, facets: understood })), Portrait));

  const embedded = await ai.embed([portrait.selfEn, portrait.seekingEn]);
  await recordCall(account.id, { model: embedded.model, purpose: "EMBED", tokensIn: embedded.promptTokens, tokensOut: 0, ms: embedded.ms, ok: true, runRef: embedded.runId });

  await db.transaction(async (tx) => {
    for (const [kind, vector] of [["SELF", embedded.vectors[0]], ["SEEKING", embedded.vectors[1]]] as const) {
      await tx
        .insert(facetEmbeddings)
        .values({ accountId: account.id, kind, vector, model: embedded.model })
        .onConflictDoUpdate({ target: [facetEmbeddings.accountId, facetEmbeddings.kind], set: { vector, model: embedded.model, createdAt: now } });
    }
    await tx.update(profiles).set({ onboardingCompletedAt: now, updatedAt: now }).where(eq(profiles.accountId, account.id));
    const moved = await tx
      .update(agentSessions)
      .set({ portrait: { self: portrait.self, seeking: portrait.seeking, selfEn: portrait.selfEn, seekingEn: portrait.seekingEn, embeddingRunId: embedded.runId }, state: AgentState.WaitingPool, stateChangedAt: now, updatedAt: now })
      .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.state, AgentState.Onboarding)))
      .returning({ id: agentSessions.id });
    if (!moved.length) tx.rollback();
  });

  try {
    const closing = await chat(ai, account.id, "CHAT", wrapPrompt({ language: account.locale, turns, portrait }));
    await db.insert(agentMessages).values({ sessionId, role: MessageRole.Agent, content: closing });
  } catch (error) {
    // The portrait is written; only the closing words are missing — the page shows the portrait and the next step anyway.
    console.error(`[agent] closing message failed: ${error instanceof AiUnavailableError ? error.code : (error as Error).name}`);
  }
}
