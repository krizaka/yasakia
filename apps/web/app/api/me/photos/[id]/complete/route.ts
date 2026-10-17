import { requireUser } from "@/lib/auth";
import { photoCheckConfig } from "@/lib/env";
import { handle, ok, uuidParam } from "@/lib/http";
import { processSoon } from "@/lib/photo-check-runner";
import { completePhoto } from "@/lib/photos";

/**
 * Completes an upload: checks the bytes are the declared picture, re-encodes them (orientation applied, metadata — GPS
 * included — stripped), computes width, height and blurhash, then moderation (V1: approved automatically).
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("me/photos/complete", async () => {
    const me = await requireUser(req);
    const photo = await completePhoto(me.id, uuidParam((await ctx.params).id));
    processSoon(photoCheckConfig); // the set changed: Orazaka checks it (the screen asks until it is done)
    return ok({ photo });
  });
}
