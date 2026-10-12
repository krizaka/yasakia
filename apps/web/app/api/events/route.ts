import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { accountEventStream } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * The account's live events as Server-Sent Events — `batch.ready`, `intro.opened`, `intro.message` (ids only: the app
 * fetches what changed) — with a heartbeat every 15 s, ending every 5 minutes (the app reconnects at once).
 */
export async function GET(req: Request) {
  return handle("events", async () => {
    const me = await requireUser(req);
    return accountEventStream(me.id);
  });
}
