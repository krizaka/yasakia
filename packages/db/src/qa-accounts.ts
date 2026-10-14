/**
 * `npm run db:qa-accounts` — the test accounts of a dev deployment (company QA sheet): one person and one administrator
 * that can sign in to the web console with a password. Sign-up is closed there, so this is the only way an account exists.
 * Passwords come from the environment (QA_USER_PASSWORD, QA_ADMIN_PASSWORD, 12+ characters), are hashed here and are never
 * printed; the output names the accounts only. Idempotent: it creates the account if missing and always sets the password
 * and the role. It refuses to touch an address that is not a QA address (`qa+…@`), so it can never rewrite a real person.
 */
import { eq } from "drizzle-orm";

import { closeDb, db } from "./client";
import { loadRootEnv } from "./load-env";
import { hashPassword, passwordProblem } from "./password";
import { accountCredentials, accounts, agentSessions, profiles } from "./schema";

loadRootEnv(__dirname);

interface QaAccount {
  label: "user" | "admin";
  email: string;
  password: string;
  role: "USER" | "ADMIN";
  name: string;
}

export function qaAccounts(env: Record<string, string | undefined>): QaAccount[] {
  const make = (label: "user" | "admin", role: "USER" | "ADMIN", name: string): QaAccount => {
    const email = (env[`QA_${label.toUpperCase()}_EMAIL`] ?? `qa+${label}@yasakia.com`).trim().toLowerCase();
    const password = env[`QA_${label.toUpperCase()}_PASSWORD`] ?? "";
    if (!/^qa\+[a-z0-9._-]+@/.test(email)) throw new Error(`QA ${label}: the address must be a qa+…@ address`);
    const problem = passwordProblem(password);
    if (problem) throw new Error(`QA ${label}: QA_${label.toUpperCase()}_PASSWORD is not acceptable (${problem})`);
    return { label, email, password, role, name };
  };
  return [make("user", "USER", "QA user (test)"), make("admin", "ADMIN", "QA admin (test)")];
}

export async function runQaAccounts(env: Record<string, string | undefined> = process.env): Promise<string[]> {
  const done: string[] = [];
  for (const qa of qaAccounts(env)) {
    const passwordHash = await hashPassword(qa.password);
    await db.transaction(async (tx) => {
      let [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, qa.email)).limit(1);
      if (!account) {
        [account] = await tx
          .insert(accounts)
          .values({ email: qa.email, locale: "en", birthDate: "1990-01-01", termsAcceptedAt: new Date(), consentVersion: "2026-10", role: qa.role })
          .returning({ id: accounts.id });
        await tx.insert(profiles).values({ accountId: account.id, displayName: qa.name });
        await tx.insert(agentSessions).values({ accountId: account.id });
      } else {
        await tx.update(accounts).set({ role: qa.role, status: "ACTIVE", suspendedAt: null, suspensionReason: null, sessionVersion: 1, updatedAt: new Date() }).where(eq(accounts.id, account.id));
      }
      await tx
        .insert(accountCredentials)
        .values({ accountId: account.id, passwordHash })
        .onConflictDoUpdate({ target: accountCredentials.accountId, set: { passwordHash, updatedAt: new Date() } });
    });
    done.push(`${qa.label} (${qa.email})`);
  }
  return done;
}

if (require.main === module) {
  runQaAccounts()
    .then(async (done) => {
      console.log(`QA accounts ready: ${done.join(", ")}. Passwords set from the environment (not printed).`);
      await closeDb();
    })
    .catch(async (error) => {
      console.error("QA accounts failed:", (error as Error).message);
      await closeDb();
      process.exit(1);
    });
}
