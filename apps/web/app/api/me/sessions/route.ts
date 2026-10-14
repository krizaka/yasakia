import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { describeAgent, listWebSessions, revokeWebSessions } from "@/lib/web-session";

/** The signed-in account's browser sessions — where they are signed in, since when, last used — the current one marked. */
export async function GET(req: Request) {
  return handle("me/sessions", async () => {
    const me = await requireUser(req);
    const rows = await listWebSessions(me.id, me.sessionId ?? null);
    return ok({ sessions: rows.map((s) => ({ id: s.id, ...describeAgent(s.userAgent), createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.current })) });
  });
}

/** Ends every other browser session of the account (the one making the call stays). */
export async function DELETE(req: Request) {
  return handle("me/sessions", async () => {
    const me = await requireUser(req);
    const ended = await revokeWebSessions(me.id, me.sessionId ?? null);
    return ok({ ended });
  });
}
