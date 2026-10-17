import { requireUser } from "@/lib/auth";
import { mediaReviewConfig } from "@/lib/env";
import { handle, ok, uuidParam } from "@/lib/http";
import { completeMediaMessage } from "@/lib/intro-media";
import { reviewSoon } from "@/lib/media-review-runner";

/**
 * Completes a media upload: the bytes are the declared kind of media within the limits (its measured length decides), made clean of every
 * metadata block and stored as they are — nothing is trimmed or edited —, then the safety check is queued. `status` is PENDING until it
 * passes; a refusal (422, 413) leaves nothing behind.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  return handle("intros/media/complete", async () => {
    const me = await requireUser(req);
    const { id, messageId } = await ctx.params;
    const media = await completeMediaMessage(me.id, uuidParam(id), uuidParam(messageId), new Date());
    reviewSoon(mediaReviewConfig);
    return ok({ messageId, media });
  });
}
