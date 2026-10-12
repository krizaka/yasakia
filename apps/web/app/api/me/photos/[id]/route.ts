import { requireUser } from "@/lib/auth";
import { handle, ok, uuidParam } from "@/lib/http";
import { deletePhoto } from "@/lib/photos";

/** Removes one of the account's photos — from storage first, then from the profile (another account's photo is a 404). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("me/photos/delete", async () => {
    const me = await requireUser(req);
    await deletePhoto(me.id, uuidParam((await ctx.params).id));
    return ok({ deleted: true });
  });
}
