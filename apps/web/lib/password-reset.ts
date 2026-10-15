import { accounts, db, passwordResetCodes } from "@yasakia/db";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { audit } from "./audit";
import { sessionSecret } from "./env";
import { refuse } from "./http";
import { sendTemplate } from "./mail";
import { setPassword } from "./password-auth";
import { generateCode, hashCode, normaliseEmail, sameHash } from "./tokens";
import { revokeWebSessions } from "./web-session";

/**
 * "Forgot password": a 6-digit code by e-mail, kept as a keyed hash, valid 10 minutes, 5 attempts, used once. The request
 * answers the same for every address; only an account that exists gets a code. A reset signs nobody in by itself and
 * ends every web session of the account.
 */
export const RESET_CODE_TTL_MINUTES = 10;
export const MAX_RESET_ATTEMPTS = 5;

export async function requestPasswordResetCode(email: string, locale: "en" | "fr"): Promise<void> {
  const address = normaliseEmail(email);
  const [account] = await db.select({ id: accounts.id, locale: accounts.locale, status: accounts.status }).from(accounts).where(eq(accounts.email, address)).limit(1);
  if (!account || account.status !== "ACTIVE") return;
  const code = generateCode();
  // A new code replaces the previous ones: only the last e-mail works.
  await db.transaction(async (tx) => {
    await tx.update(passwordResetCodes).set({ consumedAt: new Date() }).where(and(eq(passwordResetCodes.email, address), isNull(passwordResetCodes.consumedAt)));
    await tx.insert(passwordResetCodes).values({ email: address, codeHash: hashCode(address, code, sessionSecret()), expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000) });
  });
  await sendTemplate("password-reset-code", { to: address, locale: account.locale ?? locale, vars: { code, minutes: RESET_CODE_TTL_MINUTES } });
}

/** The code and the new password. Wrong codes count; the last valid code is used up, every web session ends. */
export async function resetPasswordWithCode(input: { email: string; code: string; password: string }, headers: Headers): Promise<void> {
  const address = normaliseEmail(input.email);
  const [pending] = await db
    .select()
    .from(passwordResetCodes)
    .where(and(eq(passwordResetCodes.email, address), isNull(passwordResetCodes.consumedAt), gt(passwordResetCodes.expiresAt, new Date())))
    .orderBy(desc(passwordResetCodes.createdAt))
    .limit(1);
  if (!pending || pending.attempts >= MAX_RESET_ATTEMPTS) throw refuse(400, "CODE_INVALID", "This code is not valid any more. Ask for a new one.");
  if (!sameHash(pending.codeHash, hashCode(address, input.code, sessionSecret()))) {
    await db.update(passwordResetCodes).set({ attempts: sql`${passwordResetCodes.attempts} + 1` }).where(eq(passwordResetCodes.id, pending.id));
    throw refuse(400, "CODE_INVALID", "Wrong code", { attemptsLeft: Math.max(0, MAX_RESET_ATTEMPTS - pending.attempts - 1) });
  }
  const [account] = await db.select({ id: accounts.id, status: accounts.status }).from(accounts).where(eq(accounts.email, address)).limit(1);
  if (!account) throw refuse(400, "CODE_INVALID", "This code is not valid any more. Ask for a new one.");
  if (account.status !== "ACTIVE") throw refuse(403, "SUSPENDED", "Account suspended");
  await setPassword(account.id, input.password);
  await db.update(passwordResetCodes).set({ consumedAt: new Date() }).where(eq(passwordResetCodes.id, pending.id));
  await revokeWebSessions(account.id);
  await audit({ action: "auth.password_reset", actorId: account.id, actorLabel: address, targetId: account.id, headers });
}
