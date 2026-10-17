import { accountCredentials, accounts, db } from "@yasakia/db";
import { eq } from "drizzle-orm";

import { audit } from "./audit";
import { refuse } from "./http";
import { decoyHash, hashPassword, passwordProblem, verifyPassword } from "./password";
import { revokeWebSessions } from "./web-session";

/**
 * Password sign-in for the web console. Accounts and passwords are provisioned by an operator (nobody signs up here);
 * the answer to a wrong address and to a wrong password is the same 401 and costs the same time. A suspended account is
 * refused only once the password is right, so the refusal reveals nothing about strangers.
 */

export interface PasswordSignInResult {
  account: { id: string; email: string; locale: "en" | "fr"; role: "USER" | "ADMIN"; sessionVersion: number };
}

export async function checkPassword(email: string, password: string, headers: Headers): Promise<PasswordSignInResult> {
  const [row] = await db
    .select({ id: accounts.id, email: accounts.email, status: accounts.status, locale: accounts.locale, role: accounts.role, sessionVersion: accounts.sessionVersion, hash: accountCredentials.passwordHash })
    .from(accounts)
    .leftJoin(accountCredentials, eq(accountCredentials.accountId, accounts.id))
    .where(eq(accounts.email, email))
    .limit(1);
  const right = await verifyPassword(password, row?.hash ?? (await decoyHash()));
  if (!row || !row.hash || !right) {
    if (row) await audit({ action: "auth.sign_in_refused", actorId: row.id, actorLabel: row.email, targetId: row.id, detail: { reason: "wrong_password" }, headers });
    throw refuse(401, "INVALID_CREDENTIALS", "Wrong e-mail or password");
  }
  if (row.status === "SUSPENDED") {
    await audit({ action: "auth.sign_in_refused", actorId: row.id, actorLabel: row.email, targetId: row.id, detail: { reason: "suspended" }, headers });
    throw refuse(403, "SUSPENDED", "Account suspended");
  }
  await db.update(accounts).set({ lastSeenAt: new Date() }).where(eq(accounts.id, row.id));
  await audit({ action: "auth.sign_in", actorId: row.id, actorLabel: row.email, targetId: row.id, headers });
  return { account: { id: row.id, email: row.email, locale: row.locale, role: row.role, sessionVersion: row.sessionVersion } };
}

/** Sets or replaces an account's password (an operator's provisioning, or the person's own change). */
export async function setPassword(accountId: string, password: string): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw refuse(400, `PASSWORD_${problem}`, "This password is not acceptable");
  const passwordHash = await hashPassword(password);
  await db
    .insert(accountCredentials)
    .values({ accountId, passwordHash })
    .onConflictDoUpdate({ target: accountCredentials.accountId, set: { passwordHash, updatedAt: new Date() } });
}

/** The person changes their own password: the current one must be right; every other session ends. */
export async function changePassword(accountId: string, email: string, current: string, next: string, keepSessionId: string | null, headers: Headers): Promise<void> {
  const [row] = await db.select({ hash: accountCredentials.passwordHash }).from(accountCredentials).where(eq(accountCredentials.accountId, accountId)).limit(1);
  if (!row) throw refuse(409, "NO_PASSWORD", "This account signs in with an e-mail code");
  if (!(await verifyPassword(current, row.hash))) throw refuse(403, "WRONG_PASSWORD", "The current password is not right");
  await setPassword(accountId, next);
  await revokeWebSessions(accountId, keepSessionId);
  await audit({ action: "auth.password_changed", actorId: accountId, actorLabel: email, targetId: accountId, headers });
}

export async function hasPassword(accountId: string): Promise<boolean> {
  const [row] = await db.select({ id: accountCredentials.accountId }).from(accountCredentials).where(eq(accountCredentials.accountId, accountId)).limit(1);
  return !!row;
}
