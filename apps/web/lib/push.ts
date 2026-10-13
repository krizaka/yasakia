import { isExpoPushToken, sendExpoPush } from "@krizaka/push";
import { db, pushTokens } from "@yazakia/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Push to the account's phones (the Yazakia app, krizaka/yazakia-mobile) through `@krizaka/push` (Expo Push → FCM /
 * APNs). Best-effort: never throws, and forgets the tokens the push service reports as dead.
 *
 * Pushes leave only in production, or elsewhere with PUSH_DELIVERY=on (local runs and CI never call the push service).
 * PUSH_ACCESS_TOKEN (optional): with "enhanced push security" on in the Expo project, only this server may push.
 */
export function pushDeliveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PUSH_DELIVERY === "on" || (env.NODE_ENV === "production" && env.PUSH_DELIVERY !== "off");
}

export async function pushToAccount(accountId: string, message: { title: string; body: string; path: string }): Promise<void> {
  if (!pushDeliveryEnabled()) return;
  try {
    const devices = await db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.accountId, accountId));
    if (devices.length === 0) return;
    const outcome = await sendExpoPush(
      devices.map((d) => ({ to: d.token, title: message.title, body: message.body, data: { path: message.path } })),
      { fetch: (url, init) => fetch(url, init), accessToken: process.env.PUSH_ACCESS_TOKEN || undefined },
    );
    if (outcome.deadTokens.length > 0) await db.delete(pushTokens).where(inArray(pushTokens.token, outcome.deadTokens));
    if (outcome.errors.length > 0) console.warn(`push: ${outcome.errors.length} failed for ${accountId}: ${outcome.errors[0]}`);
  } catch (error) {
    console.error("push failed", error);
  }
}

/** Registers a phone for the account (moving the token from another account if the phone changed hands). */
export async function registerPushToken(accountId: string, token: string, platform: "ios" | "android"): Promise<boolean> {
  if (!isExpoPushToken(token)) return false;
  await db
    .insert(pushTokens)
    .values({ accountId, token, platform })
    .onConflictDoUpdate({ target: pushTokens.token, set: { accountId, platform, lastSeenAt: new Date() } });
  return true;
}

/** Forgets a phone (sign-out, or notifications turned off on the device). */
export async function forgetPushToken(accountId: string, token: string): Promise<void> {
  await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.accountId, accountId)));
}
