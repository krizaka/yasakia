import { requireUser } from "@/lib/auth";
import { handle, ok, uuidParam } from "@/lib/http";
import { viewMedia } from "@/lib/intro-media";

/**
 * A URL to read a media message's file, signed for this reader for 300 seconds — after the access rule: the sender sees their own, the other
 * person only once it passed the safety check, and only while the conversation lives. Anyone else, or after it ended: 404.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  return handle("intros/media/view", async () => {
    const me = await requireUser(req);
    const { id, messageId } = await ctx.params;
    return ok({ media: await viewMedia(me.id, uuidParam(id), uuidParam(messageId), new Date()) });
  });
}
