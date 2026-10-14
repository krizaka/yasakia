import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { handle, ok, refuse, uuidParam } from "@/lib/http";
import { revokeWebSession, sessionCookie } from "@/lib/web-session";

/** Ends one browser session of the account; ending the current one signs this browser out. Another account's id is a 404. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("me/sessions/id", async () => {
    const me = await requireUser(req);
    const id = uuidParam((await ctx.params).id);
    if (!(await revokeWebSession(me.id, id))) throw refuse(404, "NOT_FOUND", "Not found");
    if (id === me.sessionId) {
      const res = NextResponse.json({ success: true, ended: id, signedOut: true });
      res.headers.append("Set-Cookie", sessionCookie(null));
      return res;
    }
    return ok({ ended: id, signedOut: false });
  });
}
