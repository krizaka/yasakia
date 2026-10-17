import { type AiProvider, AiUnavailableError, BatchReasons, type Language, parseModel, type Reasons, reasonsPrompt } from "@yasakia/ai";
import { agentSessions, aiCalls, batches, batchItems, db, debriefs, pairsSeen } from "@yasakia/db";
import { type Gender, type Intent, type Person, type RankedPair, selectBatch } from "@yasakia/matching";
import { addHours } from "date-fns";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";

import { ageOn } from "./age";
import { AgentState } from "./agent-rules";
import { AnalyticsKind, recordAnalytics } from "./analytics";
import { allDecided, BatchStatus, type DebriefAnswers, Decision, decisionRefusal } from "./batch-rules";
import { isUniqueViolation, refuse } from "./http";
import { openIntro } from "./intros";
import { PERSONA_DOMAIN } from "./personas";
import { publishToAccount } from "./realtime";
import { matchingRules } from "./rule-sets";

/**
 * The batch: three to five people who fit **both ways**, opened for a limited time. Candidates come from PostgreSQL
 * (the hard filters both ways, then the nearest portraits by cosine, HNSW); `packages/matching` ranks the pairs by the
 * weaker direction and decides whether there is a batch at all; the agent writes **why you two**, in words, both ways.
 * No score ever leaves this module (ADR-001).
 */

/** The statuses of a batch the person has to act on. */
const CURRENT = [BatchStatus.Open, BatchStatus.DebriefDue] as const;

const parseVector = (text: string): number[] => text.slice(1, -1).split(",").map(Number);

type CandidateRow = {
  id: string;
  email: string;
  birth_date: string;
  display_name: string | null;
  gender: Gender;
  seeking_genders: Gender[];
  age_min: number;
  age_max: number;
  intent: Intent;
  radius_km: number;
  lat: number;
  lng: number;
  self_vec: string;
  seeking_vec: string;
  portrait: { self?: string } | null;
};

interface Me {
  person: Person;
  name: string;
  portrait: string;
}

/** Everything the matching needs of the person: their filters, their two vectors, their portrait. */
async function loadMe(accountId: string, now: Date): Promise<Me> {
  const res = await db.execute<Omit<CandidateRow, "email"> & { id: string }>(sql`
    select a.id, a.birth_date::text as birth_date, p.display_name, p.gender, p.seeking_genders::text[] as seeking_genders, p.age_min, p.age_max,
           p.intent, p.radius_km, p.lat, p.lng, sv.vector::text as self_vec, kv.vector::text as seeking_vec, s.portrait
    from accounts a
    join profiles p on p.account_id = a.id
    join agent_sessions s on s.account_id = a.id
    left join facet_embeddings sv on sv.account_id = a.id and sv.kind = 'SELF'
    left join facet_embeddings kv on kv.account_id = a.id and kv.kind = 'SEEKING'
    where a.id = ${accountId}`);
  const row = res.rows[0];
  if (!row || !row.self_vec || !row.seeking_vec) throw refuse(409, "NOT_READY", "The agent has not written your portrait yet");
  if (!row.gender || !row.seeking_genders?.length || !row.intent || row.lat == null || row.lng == null) throw refuse(409, "PROFILE_INCOMPLETE", "The agent still needs the basics");
  return {
    name: row.display_name ?? "",
    portrait: row.portrait?.self ?? "",
    person: {
      id: row.id,
      gender: row.gender,
      seekingGenders: row.seeking_genders,
      age: ageOn(row.birth_date, now),
      ageMin: row.age_min,
      ageMax: row.age_max,
      intent: row.intent,
      radiusKm: row.radius_km,
      lat: row.lat,
      lng: row.lng,
      self: parseVector(row.self_vec),
      seeking: parseVector(row.seeking_vec),
    },
  };
}

/**
 * The candidates the database lets through for one person: active, with a portrait, the right genders both ways, inside
 * both radii, no block either way, never shown before — the nearest portraits first, `pool` of them. Ages and intents
 * are checked by the pure matching, which repeats every filter (it is the rule; this query is only the narrowing).
 */
async function candidatesFor(me: Person, pool: number, now: Date): Promise<(Person & { name: string; about: string; fictional: boolean })[]> {
  const seekingVector = `[${me.seeking.join(",")}]`;
  const res = await db.execute<CandidateRow>(sql`
    select a.id, a.email, a.birth_date::text as birth_date, p.display_name, p.gender, p.seeking_genders::text[] as seeking_genders, p.age_min, p.age_max,
           p.intent, p.radius_km, p.lat, p.lng, sv.vector::text as self_vec, kv.vector::text as seeking_vec, s.portrait
    from profiles p
    join accounts a on a.id = p.account_id and a.status = 'ACTIVE'
    join agent_sessions s on s.account_id = p.account_id
    join facet_embeddings sv on sv.account_id = p.account_id and sv.kind = 'SELF'
    join facet_embeddings kv on kv.account_id = p.account_id and kv.kind = 'SEEKING'
    where p.account_id <> ${me.id}
      and p.onboarding_completed_at is not null and p.lat is not null and p.gender is not null
      and p.gender::text in (${sql.join(me.seekingGenders.map((g) => sql`${g}`), sql`, `)})
      and ${me.gender}::gender = any(p.seeking_genders)
      and earth_distance(ll_to_earth(${me.lat}, ${me.lng}), ll_to_earth(p.lat, p.lng)) <= least(${me.radiusKm}, p.radius_km) * 1000
      and not exists (select 1 from blocks b where (b.blocker_id = ${me.id} and b.blocked_id = p.account_id) or (b.blocker_id = p.account_id and b.blocked_id = ${me.id}))
      and not exists (select 1 from pairs_seen ps where (ps.account_id = ${me.id} and ps.seen_account_id = p.account_id) or (ps.account_id = p.account_id and ps.seen_account_id = ${me.id}))
    order by sv.vector <=> ${seekingVector}::vector
    limit ${pool}`);
  return res.rows.map((r) => ({
    id: r.id,
    name: r.display_name ?? "",
    about: r.portrait?.self ?? "",
    fictional: r.email.endsWith(PERSONA_DOMAIN),
    gender: r.gender,
    seekingGenders: r.seeking_genders,
    age: ageOn(r.birth_date, now),
    ageMin: r.age_min,
    ageMax: r.age_max,
    intent: r.intent,
    radiusKm: r.radius_km,
    lat: r.lat,
    lng: r.lng,
    self: parseVector(r.self_vec),
    seeking: parseVector(r.seeking_vec),
  }));
}

/** One call for the whole batch: every person of it, with why you two both ways. The engine's dev instance answers 500 to calls at once, and a batch is one thought. */
async function writeReasons(ai: AiProvider, accountId: string, language: Language, me: Me, them: { name: string; about: string }[]): Promise<{ reasons: Reasons[]; runRef: string }> {
  const prompt = reasonsPrompt({ language, you: { name: me.name || "you", portrait: me.portrait }, them: them.map((t) => ({ name: t.name || "them", portrait: t.about })) });
  let lastError: unknown;
  for (let tries = 1; tries <= 3; tries++) {
    const conversationId = crypto.randomUUID();
    const started = performance.now();
    try {
      const parsed = parseModel((await ai.chat({ conversationId, prompt })).text, BatchReasons);
      const byIndex = new Map(parsed.people.map((p) => [p.index, p]));
      const reasons = them.map((_, i) => byIndex.get(i + 1));
      if (reasons.some((r) => !r)) throw new AiUnavailableError("bad_response", "The model's answer misses someone of the batch");
      const ms = Math.round(performance.now() - started);
      await db.insert(aiCalls).values({ accountId, provider: "orazaka", model: "orazaka-chat", purpose: "REASONS", tokensIn: Math.ceil(prompt.length / 4), tokensOut: Math.ceil(JSON.stringify(parsed).length / 4), latencyMs: ms, ok: true, runRef: conversationId });
      console.log(`[batch] REASONS ok run=${conversationId} people=${them.length} ms=${ms}`);
      return { reasons: reasons.map((r) => ({ forYou: r!.forYou, forThem: r!.forThem })), runRef: conversationId };
    } catch (error) {
      lastError = error;
      await db.insert(aiCalls).values({ accountId, provider: "orazaka", model: "orazaka-chat", purpose: "REASONS", latencyMs: Math.round(performance.now() - started), ok: false, runRef: conversationId });
      // A model sometimes answers a shape that does not fit, or the engine blinks: asked again, up to three times.
      if (!(error instanceof AiUnavailableError)) throw error;
    }
  }
  throw lastError;
}

/**
 * Opens the person's next batch — if there is one. The agent must have written the portrait (WAITING_POOL). Fewer than the
 * minimum of people who fit both ways is `NO_FIT_YET` (409): the person waits, nobody is made up.
 */
export async function openBatch(ai: AiProvider, account: { id: string; locale: Language }, now: Date): Promise<{ batchId: string; people: number; runs: string[] }> {
  const [session] = await db.select({ state: agentSessions.state }).from(agentSessions).where(eq(agentSessions.accountId, account.id)).limit(1);
  if (!session || session.state === AgentState.Onboarding || session.state === AgentState.Discovery) throw refuse(409, "NOT_READY", "The agent has not written your portrait yet");
  if (session.state !== AgentState.WaitingPool) throw refuse(409, "BATCH_ALREADY_OPEN", "You already have a batch to answer");

  const { version, params } = await matchingRules();
  const me = await loadMe(account.id, now);
  const pool = await candidatesFor(me.person, params.candidatePool, now);
  const picked = selectBatch(me.person, pool, params);
  console.log(`[batch] rules v${version}: ${pool.length} candidates through the filters, ${picked?.length ?? 0} picked`);
  if (!picked) throw refuse(409, "NO_FIT_YET", "Nobody fits both ways yet — the agent keeps looking");

  const byId = new Map(pool.map((c) => [c.id, c]));
  const written = await writeReasons(ai, account.id, account.locale, me, (picked as RankedPair[]).map((p) => byId.get(p.candidateId)!));

  try {
    const batchId = await db.transaction(async (tx) => {
      const [batch] = await tx.insert(batches).values({ accountId: account.id, status: BatchStatus.Open, openedAt: now, expiresAt: addHours(now, params.batchHours) }).returning({ id: batches.id });
      await tx.insert(batchItems).values(picked.map((p, i) => ({ batchId: batch.id, candidateId: p.candidateId, rank: i + 1, reasons: written.reasons[i] })));
      await tx.insert(pairsSeen).values(picked.map((p) => ({ accountId: account.id, seenAccountId: p.candidateId }))).onConflictDoNothing();
      const moved = await tx
        .update(agentSessions)
        .set({ state: AgentState.BatchOpen, stateChangedAt: now, updatedAt: now })
        .where(and(eq(agentSessions.accountId, account.id), eq(agentSessions.state, AgentState.WaitingPool)))
        .returning({ id: agentSessions.id });
      if (!moved.length) tx.rollback();
      return batch.id;
    });
    await recordAnalytics(account.id, AnalyticsKind.BatchOpen, now);
    await publishToAccount(account.id, { type: "batch.ready", batchId });
    return { batchId, people: picked.length, runs: [written.runRef] };
  } catch (error) {
    // Two clicks at once: the unique index lets one batch be current, the other is told so.
    if (isUniqueViolation(error)) throw refuse(409, "BATCH_ALREADY_OPEN", "You already have a batch to answer");
    throw error;
  }
}

export interface BatchPersonView {
  id: string;
  rank: number;
  name: string;
  /** Their portrait, in their words — what they chose to say about themselves. */
  about: string;
  /** Why you two, in words, both ways. Never a number. */
  reasons: { forYou: string[]; forThem: string[] };
  /** A fictional dev/QA persona: said on the card. */
  fictional: boolean;
  decision: Decision | null;
  /** Who they hope to meet, in their words — opened once the person has answered (« tell me more » first). */
  lookingFor: string | null;
}

export interface BatchView {
  id: string;
  status: "OPEN" | "DEBRIEF_DUE";
  openedAt: string;
  expiresAt: string;
  people: BatchPersonView[];
}

/** The batch the person has to act on, or null. Withdrawn people (a block, a deletion) are gone from it. */
export async function currentBatch(accountId: string): Promise<BatchView | null> {
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.accountId, accountId), inArray(batches.status, [...CURRENT])))
    .orderBy(desc(batches.openedAt))
    .limit(1);
  if (!batch || !(CURRENT as readonly string[]).includes(batch.status)) return null;
  const res = await db.execute<{ id: string; rank: number; reasons: BatchPersonView["reasons"] | null; decision: BatchPersonView["decision"]; name: string | null; email: string; portrait: { self?: string; seeking?: string } | null }>(sql`
    select bi.id, bi.rank, bi.reasons, bi.decision, p.display_name as name, a.email, s.portrait
    from batch_items bi
    join accounts a on a.id = bi.candidate_id
    join profiles p on p.account_id = bi.candidate_id
    left join agent_sessions s on s.account_id = bi.candidate_id
    where bi.batch_id = ${batch.id} and bi.withdrawn_at is null
    order by bi.rank`);
  return {
    id: batch.id,
    status: batch.status as BatchView["status"],
    openedAt: batch.openedAt.toISOString(),
    expiresAt: batch.expiresAt.toISOString(),
    people: res.rows.map((r) => ({
      id: r.id,
      rank: r.rank,
      name: r.name ?? "",
      about: r.portrait?.self ?? "",
      reasons: r.reasons ?? { forYou: [], forThem: [] },
      fictional: r.email.endsWith(PERSONA_DOMAIN),
      decision: r.decision,
      lookingFor: r.decision ? (r.portrait?.seeking ?? null) : null,
    })),
  };
}

export interface DecisionResult {
  decision: Decision;
  /** Who they hope to meet, in their words (every answer opens it; « tell me more » is the way to ask first). */
  lookingFor: string | null;
  /** Both said yes: the introduction that opened. */
  introId: string | null;
  /** Everyone is answered: the debrief is due before the next batch. */
  debriefDue: boolean;
}

/**
 * Answers one person of the batch. Yes from both sides opens an introduction. A fictional persona of the dev cast says
 * yes back — its batch would hold the person, since the fit is both ways by construction; a real person must say yes in
 * their own batch. When everyone still in the batch is answered, the batch waits for its debrief.
 */
export async function decide(ai: AiProvider, me: string, batchId: string, itemId: string, decision: Decision, now: Date): Promise<DecisionResult> {
  const outcome = await db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(and(eq(batches.id, batchId), eq(batches.accountId, me))).for("update").limit(1);
    if (!batch) throw refuse(404, "NOT_FOUND", "Not found");
    const items = await tx.select({ id: batchItems.id, candidateId: batchItems.candidateId, decision: batchItems.decision, withdrawnAt: batchItems.withdrawnAt }).from(batchItems).where(eq(batchItems.batchId, batch.id));
    const item = items.find((i) => i.id === itemId);
    if (!item) throw refuse(404, "NOT_FOUND", "Not found");
    const refused = decisionRefusal({ status: batch.status, expiresAt: batch.expiresAt, decision: item.decision, withdrawn: item.withdrawnAt !== null }, decision, now);
    if (refused) throw refuse(refused.status, refused.code, "This answer is not possible");
    await tx.update(batchItems).set({ decision, decidedAt: now }).where(eq(batchItems.id, item.id));
    const after = items.map((i) => ({ decision: i.id === item.id ? decision : i.decision, withdrawn: i.withdrawnAt !== null }));
    const debriefDue = allDecided(after);
    if (debriefDue) {
      await tx.update(batches).set({ status: BatchStatus.DebriefDue }).where(eq(batches.id, batch.id));
      await tx.update(agentSessions).set({ state: AgentState.DebriefDue, stateChangedAt: now, updatedAt: now }).where(and(eq(agentSessions.accountId, me), eq(agentSessions.state, AgentState.BatchOpen)));
    }
    const them = await tx.execute<{ email: string; seeking: string | null; yes: boolean }>(sql`
      select a.email, s.portrait->>'seeking' as seeking,
             exists (select 1 from batch_items bi join batches b on b.id = bi.batch_id
                     where b.account_id = ${item.candidateId} and bi.candidate_id = ${me} and bi.decision = 'INTERESTED' and bi.withdrawn_at is null) as yes
      from accounts a left join agent_sessions s on s.account_id = a.id where a.id = ${item.candidateId}`);
    const other = them.rows[0];
    const mutual = decision === Decision.Interested && !!other && (other.email.endsWith(PERSONA_DOMAIN) || other.yes);
    return { candidateId: item.candidateId, lookingFor: other?.seeking ?? null, mutual, debriefDue };
  });
  await recordAnalytics(me, AnalyticsKind.BatchAnswer, now);
  const intro = outcome.mutual ? await openIntro(ai, me, outcome.candidateId, now) : null;
  return { decision, lookingFor: outcome.lookingFor, introId: intro?.introId ?? null, debriefDue: outcome.debriefDue };
}

/** The debrief of an answered batch: three answers, kept; the batch is done and the agent may look for the next one. */
export async function submitDebrief(me: string, batchId: string, answers: DebriefAnswers, now: Date): Promise<{ next: "WAITING_POOL" }> {
  try {
    await db.transaction(async (tx) => {
      const [batch] = await tx.select({ id: batches.id, status: batches.status }).from(batches).where(and(eq(batches.id, batchId), eq(batches.accountId, me))).for("update").limit(1);
      if (!batch) throw refuse(404, "NOT_FOUND", "Not found");
      if (batch.status !== BatchStatus.DebriefDue) throw refuse(409, "DEBRIEF_NOT_DUE", "This batch is not waiting for its debrief");
      await tx.insert(debriefs).values({ batchId: batch.id, accountId: me, answers, createdAt: now });
      await tx.update(batches).set({ status: BatchStatus.Done, closedAt: now }).where(eq(batches.id, batch.id));
      await tx.update(agentSessions).set({ state: AgentState.WaitingPool, stateChangedAt: now, updatedAt: now }).where(and(eq(agentSessions.accountId, me), eq(agentSessions.state, AgentState.DebriefDue)));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw refuse(409, "DEBRIEF_NOT_DUE", "This batch already has its debrief");
    throw error;
  }
  return { next: AgentState.WaitingPool };
}

/** Time ran out: an open batch waits for its debrief (what was not answered stays unanswered). Every instance, idempotent. */
export async function sweepBatches(): Promise<number> {
  const due = await db.update(batches).set({ status: BatchStatus.DebriefDue }).where(and(eq(batches.status, BatchStatus.Open), lte(batches.expiresAt, sql`now()`))).returning({ accountId: batches.accountId });
  if (due.length) {
    await db
      .update(agentSessions)
      .set({ state: AgentState.DebriefDue, stateChangedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(inArray(agentSessions.accountId, due.map((d) => d.accountId)), eq(agentSessions.state, AgentState.BatchOpen)));
  }
  return due.length;
}
