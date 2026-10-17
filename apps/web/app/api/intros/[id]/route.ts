import { requireUser } from "@/lib/auth";
import { handle, ok, uuidParam } from "@/lib/http";
import { introDetail } from "@/lib/intros";

/** One of my introductions: who, until when, and our messages (typed by us two — the AI writes none). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("intros/detail", async () => {
    const me = await requireUser(req);
    return ok({ intro: await introDetail(me.id, uuidParam((await ctx.params).id)) });
  });
}
