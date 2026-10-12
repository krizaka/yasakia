import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { forgetPushToken } from "@/lib/push";
import { signOutEverywhere } from "@/lib/sign-in";

const Body = z.object({
  /** The phone's push token, forgotten so it stops receiving this account's notifications. */
  pushToken: z.string().max(255).optional(),
  /** Every token of the account stops working, on every phone. */
  everywhere: z.boolean().default(false),
});

/**
 * Signs out: forgets this phone's push token, and with `everywhere` invalidates every session token of the account at
 * once (the app also deletes its own token from secure storage).
 */
export async function POST(req: Request) {
  return handle("auth/logout", async () => {
    const me = await requireUser(req);
    const body = await readJson(req, Body);
    if (body.pushToken) await forgetPushToken(me.id, body.pushToken);
    if (body.everywhere) await signOutEverywhere(me.id);
    return ok({ signedOut: true, everywhere: body.everywhere });
  });
}
