import { accounts, agentSessions, authCodes, db, profiles } from "@yazakia/db";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { checkBirthDate } from "./age";
import { sessionSecret } from "./env";
import { refuse } from "./http";
import { sendTemplate } from "./mail";
import { generateCode, hashCode, sameHash, signSessionToken } from "./tokens";

/**
 * Sign-in and sign-up are one flow, by e-mail code (no password exists):
 * 1. `requestCode` — a 6-digit code, kept as a keyed hash, valid 10 minutes, sent by e-mail in the person's language.
 *    The answer is the same whether the address has an account or not (no enumeration).
 * 2. `verifyCode` — the right code for an existing account signs in; for a new address it creates the account, but only
 *    with a date of birth that says 18+ (checked here, by the server) and the terms accepted. A wrong code counts an
 *    attempt (5 at most); a code works once.
 */

export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;
/** The version of the consent screen (what the agent learns, that everything can be changed) an account accepts. */
export const CONSENT_VERSION = "2026-10";

export async function requestCode(email: string, locale: "en" | "fr"): Promise<void> {
  const code = generateCode();
  // A new code replaces the previous ones: only the last e-mail works.
  await db.transaction(async (tx) => {
    await tx.update(authCodes).set({ consumedAt: new Date() }).where(and(eq(authCodes.email, email), isNull(authCodes.consumedAt)));
    await tx.insert(authCodes).values({ email, codeHash: hashCode(email, code, sessionSecret()), expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000) });
  });
  const [account] = await db.select({ locale: accounts.locale }).from(accounts).where(eq(accounts.email, email)).limit(1);
  await sendTemplate("sign-in-code", { to: email, locale: account?.locale ?? locale, vars: { code, minutes: CODE_TTL_MINUTES } });
}

export interface VerifyInput {
  email: string;
  code: string;
  birthDate?: string;
  acceptTerms?: boolean;
  locale: "en" | "fr";
}

export interface VerifyResult {
  token: string;
  created: boolean;
  account: { id: string; email: string; status: string; locale: string };
}

export async function verifyCode(input: VerifyInput): Promise<VerifyResult> {
  const [pending] = await db
    .select()
    .from(authCodes)
    .where(and(eq(authCodes.email, input.email), isNull(authCodes.consumedAt), gt(authCodes.expiresAt, new Date())))
    .orderBy(desc(authCodes.createdAt))
    .limit(1);
  if (!pending || pending.attempts >= MAX_CODE_ATTEMPTS) throw refuse(400, "CODE_INVALID", "This code is not valid any more. Ask for a new one.");
  if (!sameHash(pending.codeHash, hashCode(input.email, input.code, sessionSecret()))) {
    await db.update(authCodes).set({ attempts: sql`${authCodes.attempts} + 1` }).where(eq(authCodes.id, pending.id));
    throw refuse(400, "CODE_INVALID", "Wrong code", { attemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - pending.attempts - 1) });
  }

  const [existing] = await db.select().from(accounts).where(eq(accounts.email, input.email)).limit(1);
  if (existing) {
    if (existing.status === "SUSPENDED") throw refuse(403, "SUSPENDED", "Account suspended");
    await db.update(authCodes).set({ consumedAt: new Date() }).where(eq(authCodes.id, pending.id));
    await db.update(accounts).set({ lastSeenAt: new Date() }).where(eq(accounts.id, existing.id));
    return { token: signSessionToken(existing.id, existing.sessionVersion, sessionSecret()), created: false, account: view(existing) };
  }

  // A new person: the code stays valid while the app asks for the date of birth and the terms.
  if (!input.birthDate) throw refuse(409, "BIRTH_DATE_REQUIRED", "A date of birth is needed to create the account");
  const age = checkBirthDate(input.birthDate);
  if (!age.ok) {
    if (age.code === "UNDERAGE") {
      // Under 18: the code is spent — retrying with another date needs a new code (and a new e-mail).
      await db.update(authCodes).set({ consumedAt: new Date() }).where(eq(authCodes.id, pending.id));
      throw refuse(403, "UNDERAGE", "Yazakia is for adults (18+)");
    }
    throw refuse(400, age.code, "This date of birth is not valid");
  }
  if (input.acceptTerms !== true) throw refuse(409, "TERMS_REQUIRED", "The terms must be accepted to create the account");

  const created = await db.transaction(async (tx) => {
    const consumed = await tx
      .update(authCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(authCodes.id, pending.id), isNull(authCodes.consumedAt)))
      .returning({ id: authCodes.id });
    if (consumed.length === 0) throw refuse(400, "CODE_INVALID", "This code is not valid any more. Ask for a new one.");
    const [account] = await tx
      .insert(accounts)
      .values({ email: input.email, locale: input.locale, birthDate: input.birthDate!, termsAcceptedAt: new Date(), consentVersion: CONSENT_VERSION, lastSeenAt: new Date() })
      .returning();
    await tx.insert(profiles).values({ accountId: account.id });
    await tx.insert(agentSessions).values({ accountId: account.id });
    return account;
  });
  return { token: signSessionToken(created.id, created.sessionVersion, sessionSecret()), created: true, account: view(created) };
}

const view = (a: { id: string; email: string; status: string; locale: string }) => ({ id: a.id, email: a.email, status: a.status, locale: a.locale });

/** "Sign out everywhere": every token signed before stops working on its next request. */
export async function signOutEverywhere(accountId: string): Promise<void> {
  await db
    .update(accounts)
    .set({ sessionVersion: sql`${accounts.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(accounts.id, accountId));
}

/** Removes codes that can no longer be used (the background loop). */
export async function sweepAuthCodes(now = new Date()): Promise<number> {
  const rows = await db
    .delete(authCodes)
    .where(lt(authCodes.expiresAt, now))
    .returning({ id: authCodes.id });
  return rows.length;
}
