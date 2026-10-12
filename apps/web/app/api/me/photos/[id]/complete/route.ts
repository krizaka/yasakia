import { requireUser } from "@/lib/auth";
import { handle, ok, uuidParam } from "@/lib/http";
import { completePhoto } from "@/lib/photos";

/**
 * Completes an upload: checks the bytes are the declared picture, re-encodes them (orientation applied, metadata — GPS
 * included — stripped), computes width, height and blurhash, then moderation (V1: approved automatically).
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("me/photos/complete", async () => {
    const me = await requireUser(req);
    return ok({ photo: await completePhoto(me.id, uuidParam((await ctx.params).id)) });
  });
}
