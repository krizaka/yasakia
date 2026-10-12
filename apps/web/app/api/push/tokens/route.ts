import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handle, ok, readJson, refuse } from "@/lib/http";
import { forgetPushToken, registerPushToken } from "@/lib/push";
import { limitAction } from "@/lib/rate-limit";

const Register = z.object({ token: z.string().max(255), platform: z.enum(["ios", "android"]) }).strict();
const Forget = z.object({ token: z.string().max(255) }).strict();

/** Registers this phone's Expo push token for the account (a phone that changed hands moves to the new account). */
export async function POST(req: Request) {
  return handle("push/tokens", async () => {
    const me = await requireUser(req);
    await limitAction("push-token", req, me.id, { perSubject: [30, 3600] });
    const body = await readJson(req, Register);
    if (!(await registerPushToken(me.id, body.token, body.platform))) throw refuse(400, "INVALID_PUSH_TOKEN", "Not an Expo push token");
    return ok({ registered: true });
  });
}

/** Forgets this phone's push token (notifications turned off on the device). */
export async function DELETE(req: Request) {
  return handle("push/tokens", async () => {
    const me = await requireUser(req);
    const body = await readJson(req, Forget);
    await forgetPushToken(me.id, body.token);
    return ok({ forgotten: true });
  });
}
