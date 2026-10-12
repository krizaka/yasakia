import { unblock } from "@/lib/account";
import { requireUser } from "@/lib/auth";
import { handle, ok, uuidParam } from "@/lib/http";

/** Lifts one of the account's blocks (what it closed stays closed); another account's block is a 404. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("blocks/delete", async () => {
    const me = await requireUser(req);
    await unblock(me.id, uuidParam((await ctx.params).id));
    return ok({ unblocked: true });
  });
}
