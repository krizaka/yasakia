import { db, introMessages, intros } from "@yasakia/db";
import { addDays } from "date-fns";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";

import { AnalyticsKind, recordAnalytics } from "./analytics";
import { refuse } from "./http";
import { afterContinue, continueRefusal, IntroState, orderedPair, type Side, sideOf, writeRefusal } from "./intro-rules";
import { PERSONA_DOMAIN } from "./personas";
import { publishToAccount } from "./realtime";
import { matchingRules } from "./rule-sets";

/**
 * Introductions: two people said yes to each other, they get a private room for the MATCHING rule set's `introDays`.
 * Humans talk, and every message is typed by the person who sends it: the AI writes nothing for anyone (no suggested line, no
 * « reply for me ») and never reads `intro_messages`. Continued when both say so, faded when time runs out.
 */

interface PersonCard {
  id: string;
  name: string;
  about: string;
  locale: "en" | "fr";
  fictional: boolean;
}

async function card(accountId: string): Promise<PersonCard> {
  const res = await db.execute<{ id: string; email: string; locale: "en" | "fr"; name: string | null; portrait: { self?: string } | null }>(sql`
    select a.id, a.email, a.locale, p.display_name as name, s.portrait
    from accounts a left join profiles p on p.account_id = a.id left join agent_sessions s on s.account_id = a.id
    where a.id = ${accountId}`);
  const r = res.rows[0];
  if (!r) throw refuse(404, "NOT_FOUND", "Not found");
  return { id: r.id, name: r.name ?? "", about: r.portrait?.self ?? "", locale: r.locale, fictional: r.email.endsWith(PERSONA_DOMAIN) };
}

/** Opens the intro of two people who said yes to each other (once per pair: a second yes finds it). */
export async function openIntro(x: string, y: string, now: Date): Promise<{ introId: string }> {
  const [accountA, accountB] = orderedPair(x, y);
  const { params } = await matchingRules();
  const [created] = await db
    .insert(intros)
    .values({ accountA, accountB, state: IntroState.Open, openedAt: now, expiresAt: addDays(now, params.introDays) })
    .onConflictDoNothing()
    .returning({ id: intros.id });
  if (!created) {
    const [existing] = await db.select({ id: intros.id }).from(intros).where(and(eq(intros.accountA, accountA), eq(intros.accountB, accountB))).limit(1);
    return { introId: existing.id };
  }
  await recordAnalytics([accountA, accountB], AnalyticsKind.IntroStart, now);
  await Promise.all([publishToAccount(accountA, { type: "intro.opened", introId: created.id }), publishToAccount(accountB, { type: "intro.opened", introId: created.id })]);
  return { introId: created.id };
}

export interface IntroSummary {
  id: string;
  state: string;
  name: string;
  fictional: boolean;
  openedAt: string;
  expiresAt: string;
  messages: number;
  lastMessageAt: string | null;
}

/** My introductions, the live ones first. */
export async function listIntros(me: string): Promise<IntroSummary[]> {
  const res = await db.execute<{ id: string; state: string; opened_at: Date; expires_at: Date; name: string | null; email: string; messages: number; last_at: Date | null }>(sql`
    select i.id, i.state, i.opened_at, i.expires_at, p.display_name as name, a.email,
           (select count(*)::int from intro_messages m where m.intro_id = i.id) as messages,
           (select max(m.created_at) from intro_messages m where m.intro_id = i.id) as last_at
    from intros i
    join accounts a on a.id = case when i.account_a = ${me} then i.account_b else i.account_a end
    left join profiles p on p.account_id = a.id
    where i.account_a = ${me} or i.account_b = ${me}
    order by (i.state in ('OPEN', 'CONTINUED')) desc, coalesce((select max(m.created_at) from intro_messages m where m.intro_id = i.id), i.opened_at) desc`);
  return res.rows.map((r) => ({ id: r.id, state: r.state, name: r.name ?? "", fictional: r.email.endsWith(PERSONA_DOMAIN), openedAt: new Date(r.opened_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(), messages: r.messages, lastMessageAt: r.last_at ? new Date(r.last_at).toISOString() : null }));
}

async function mine(me: string, introId: string) {
  const [intro] = await db.select().from(intros).where(and(eq(intros.id, introId), or(eq(intros.accountA, me), eq(intros.accountB, me)))).limit(1);
  if (!intro) throw refuse(404, "NOT_FOUND", "Not found");
  return { intro, side: sideOf(intro, me) as Side };
}

export interface IntroMessageView {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface IntroDetail {
  id: string;
  state: string;
  openedAt: string;
  expiresAt: string;
  frozen: boolean;
  continuedByMe: boolean;
  continuedByThem: boolean;
  them: { name: string; about: string; fictional: boolean };
  messages: IntroMessageView[];
}

export async function introDetail(me: string, introId: string): Promise<IntroDetail> {
  const { intro, side } = await mine(me, introId);
  const other = await card(side === "A" ? intro.accountB : intro.accountA);
  const rows = await db.select().from(introMessages).where(eq(introMessages.introId, intro.id)).orderBy(asc(introMessages.createdAt)).limit(500);
  return {
    id: intro.id,
    state: intro.state,
    openedAt: intro.openedAt.toISOString(),
    expiresAt: intro.expiresAt.toISOString(),
    frozen: intro.frozenAt !== null,
    continuedByMe: (side === "A" ? intro.continuedByAAt : intro.continuedByBAt) !== null,
    continuedByThem: (side === "A" ? intro.continuedByBAt : intro.continuedByAAt) !== null,
    them: { name: other.name, about: other.about, fictional: other.fictional },
    messages: rows.map((m) => ({ id: m.id, mine: m.senderId === me, body: m.body, createdAt: m.createdAt.toISOString() })),
  };
}

/** Writes in an intro — idempotent per `clientId` (a retry never doubles a message); the other is told at once. */
export async function sendIntroMessage(me: string, introId: string, body: string, clientId: string, now: Date): Promise<IntroMessageView> {
  const { intro, side } = await mine(me, introId);
  const refused = writeRefusal(intro, now);
  if (refused) throw refuse(409, refused, "This introduction is not open for messages");
  const [created] = await db.insert(introMessages).values({ introId: intro.id, senderId: me, body, clientId, createdAt: now }).onConflictDoNothing().returning();
  const row = created ?? (await db.select().from(introMessages).where(and(eq(introMessages.introId, intro.id), eq(introMessages.senderId, me), eq(introMessages.clientId, clientId))).limit(1))[0];
  if (created) await publishToAccount(side === "A" ? intro.accountB : intro.accountA, { type: "intro.message", introId: intro.id, messageId: created.id });
  return { id: row.id, mine: true, body: row.body, createdAt: row.createdAt.toISOString() };
}

/** « Continue »: the intro has no end once both said it. */
export async function continueIntro(me: string, introId: string, now: Date): Promise<{ state: string }> {
  return db.transaction(async (tx) => {
    const [intro] = await tx.select().from(intros).where(and(eq(intros.id, introId), or(eq(intros.accountA, me), eq(intros.accountB, me)))).for("update").limit(1);
    if (!intro) throw refuse(404, "NOT_FOUND", "Not found");
    const side = sideOf(intro, me) as Side;
    const refused = continueRefusal(intro, side, now);
    if (refused) throw refuse(409, refused, "This introduction cannot be continued");
    const next = afterContinue(intro, side, now);
    await tx.update(intros).set(next).where(eq(intros.id, intro.id));
    return { state: next.state };
  });
}

/** Time ran out: an open intro nobody continued fades (the sweep, every instance, idempotent). */
export async function sweepIntros(): Promise<number> {
  const faded = await db.update(intros).set({ state: IntroState.Faded, closedAt: sql`now()` }).where(and(eq(intros.state, IntroState.Open), lte(intros.expiresAt, sql`now()`))).returning({ id: intros.id });
  return faded.length;
}
