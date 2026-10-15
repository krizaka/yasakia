import { accounts,db } from "@yasakia/db";
import { eq } from "drizzle-orm";

import { confirmDeletion, deleteAccount, PURGE_DEADLINE_DAYS } from "./account";
import { adminActionRefusal } from "./admin-users";
import { audit } from "./audit";
import { type AdminActor } from "./console-access";
import { refuse } from "./http";

/**
 * Law 25 erasure asked of an operator (a person writes to us): the same deletion as the person's own
 * (lib/account.ts — one transaction, the media purged within the deadline, a confirmation e-mail in their language),
 * after the operator typed the account's e-mail. Never your own account, never an administrator (withdraw the role first).
 * The audit log keeps the fact and the id, not the person.
 */
export async function eraseAccountForOperator(targetId: string, confirmEmail: string, actor: AdminActor, headers: Headers): Promise<{ purgeAfterDays: number }> {
  const [who] = await db.select({ id: accounts.id, role: accounts.role, email: accounts.email }).from(accounts).where(eq(accounts.id, targetId)).limit(1);
  if (!who) throw refuse(404, "NOT_FOUND", "Not found");
  const refusal = adminActionRefusal("delete", actor.id, who, 0);
  if (refusal) throw refuse(409, refusal, "This account cannot be deleted from the console");
  if (confirmEmail.trim().toLowerCase() !== who.email.toLowerCase()) throw refuse(409, "CONFIRM_MISMATCH", "The e-mail typed does not match the account");
  const { email, locale } = await deleteAccount(targetId);
  await audit({ action: "admin.delete", actorId: actor.id, actorLabel: actor.label, targetId, headers });
  void confirmDeletion(email, locale);
  return { purgeAfterDays: PURGE_DEADLINE_DAYS };
}
