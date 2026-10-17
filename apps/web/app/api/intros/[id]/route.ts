import { requireUser } from "@/lib/auth";
import { handle, ok, uuidParam } from "@/lib/http";
import { introDetail } from "@/lib/intros";

/** One of my introductions: who, until when, the first line my agent whispered to me (mine only), and our messages. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("intros/detail", async () => {
    const me = await requireUser(req);
    return ok({ intro: await introDetail(me.id, uuidParam((await ctx.params).id)) });
  });
}
