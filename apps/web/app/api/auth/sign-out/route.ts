import { NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { assertSameOrigin } from "@/lib/auth";
import { handle } from "@/lib/http";
import { resolveWebSession, revokeWebSession, sessionCookie, sessionTokenFrom } from "@/lib/web-session";

/** Signs the web console out: this browser's session ends and its cookie is cleared (an unknown cookie is cleared too). */
export async function POST(req: Request) {
  return handle("auth/sign-out", async () => {
    assertSameOrigin(req);
    const session = await resolveWebSession(sessionTokenFrom(req.headers.get("cookie")));
    if (session) {
      await revokeWebSession(session.account.id, session.sessionId);
      await audit({ action: "auth.sign_out", actorId: session.account.id, actorLabel: session.account.email, targetId: session.account.id, headers: req.headers });
    }
    const res = NextResponse.json({ success: true });
    res.headers.append("Set-Cookie", sessionCookie(null));
    return res;
  });
}
