import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { changePassword } from "@/lib/password-auth";
import { limitAction } from "@/lib/rate-limit";

const Body = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }).strict();

/** Changes the account's password (the current one must be right); every other browser session of the account ends. */
export async function POST(req: Request) {
  return handle("me/password", async () => {
    const me = await requireUser(req);
    await limitAction("change-password", req, me.id, { perSubject: [10, 3600], perIp: [30, 3600] });
    const body = await readJson(req, Body);
    await changePassword(me.id, me.email, body.current, body.next, me.sessionId ?? null, req.headers);
    return ok({ changed: true });
  });
}
