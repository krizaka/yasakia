/**
 * `npm run db:qa-reset` — gives the QA person's agent a blank page again, so the journey can be shown from its start
 * (a recording, a demo): the conversation, what the agent understood, the portrait and its vectors, the batches and their debriefs, the introductions, the
 * profile's basics and position. It touches **one** account, and only a QA address (`qa+…@`) — it can never reset a real
 * person — and never a production database. The account, its password and its sessions stay.
 */
import { eq, or, sql } from "drizzle-orm";

import { closeDb, db } from "./client";
import { loadRootEnv } from "./load-env";
import { accounts, agentSessions, batches, facetEmbeddings, facets, intros, pairsSeen, profiles } from "./schema";

loadRootEnv(__dirname);

/** Why this reset is refused, or null when it may run. */
export function qaResetRefusal(email: string, env: Record<string, string | undefined>): string | null {
  if (!/^qa\+[a-z0-9._-]+@/.test(email.trim().toLowerCase())) return `${email} is not a QA address (qa+…@): only a test account can be reset`;
  if (env.NODE_ENV === "production" && env.NEXT_PUBLIC_APP_ENV !== "dev") return "refused: this is a production database";
  return null;
}

export async function resetQaAgent(email: string): Promise<boolean> {
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account) return false;
  await db.transaction(async (tx) => {
    // The batches go first: their items point at other accounts, and the agent's session at none.
    await tx.delete(batches).where(eq(batches.accountId, account.id)); // their debriefs with them
    await tx.delete(intros).where(or(eq(intros.accountA, account.id), eq(intros.accountB, account.id))); // and the introductions, messages included
    await tx.delete(pairsSeen).where(eq(pairsSeen.accountId, account.id)); // nobody is "already seen" on a blank page
    await tx.delete(facetEmbeddings).where(eq(facetEmbeddings.accountId, account.id));
    await tx.delete(facets).where(eq(facets.accountId, account.id));
    await tx.execute(sql`delete from agent_messages where session_id in (select id from agent_sessions where account_id = ${account.id})`);
    await tx
      .update(agentSessions)
      .set({ state: "ONBOARDING", portrait: null, tokensUsed: 0, callsUsed: 0, stateChangedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(agentSessions.accountId, account.id));
    await tx
      .update(profiles)
      .set({ gender: null, seekingGenders: [], ageMin: 18, ageMax: 99, intent: null, radiusKm: 25, lat: null, lng: null, geoPrecisionM: null, locationUpdatedAt: null, onboardingCompletedAt: null, updatedAt: sql`now()` })
      .where(eq(profiles.accountId, account.id));
  });
  return true;
}

if (require.main === module) {
  const email = (process.env.AUTH_QA_USER_EMAIL ?? "qa+user@yasakia.com").trim().toLowerCase();
  const refusal = qaResetRefusal(email, process.env);
  if (refusal) {
    console.error(`QA reset ${refusal}`);
    process.exit(1);
  }
  resetQaAgent(email)
    .then(async (done) => {
      console.log(done ? `QA agent reset: ${email} starts from a blank page.` : `QA reset: no account ${email}.`);
      await closeDb();
    })
    .catch(async (error) => {
      console.error("QA reset failed:", (error as Error).message);
      await closeDb();
      process.exit(1);
    });
}
