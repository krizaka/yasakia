import { agentView } from "@/lib/agent";
import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

/** The person's agent: the conversation, what it understood in their own words, the portrait once written, what it still has to learn. */
export async function GET(req: Request) {
  return handle("agent", async () => {
    const me = await requireUser(req);
    return ok({ agent: await agentView(me.id) });
  });
}
