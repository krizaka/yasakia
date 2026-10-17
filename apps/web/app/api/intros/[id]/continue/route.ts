import { requireUser } from "@/lib/auth";
import { handle, ok, uuidParam } from "@/lib/http";
import { continueIntro } from "@/lib/intros";

/** « Continue »: once both said it, the introduction has no end. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("intros/continue", async () => {
    const me = await requireUser(req);
    return ok(await continueIntro(me.id, uuidParam((await ctx.params).id), new Date()));
  });
}
