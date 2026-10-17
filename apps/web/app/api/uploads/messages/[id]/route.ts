import { handle, ok, uuidParam } from "@/lib/http";
import { receiveMediaUpload } from "@/lib/intro-media";

/**
 * Receives one media message's bytes at the URL `POST /api/intros/{id}/media` signed — the signature is the authorisation (one message,
 * 300 seconds); the type must be the declared one and the size at most the declared one.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("uploads/messages", async () => {
    const url = new URL(req.url);
    await receiveMediaUpload(uuidParam((await ctx.params).id), { expires: url.searchParams.get("expires"), signature: url.searchParams.get("signature") }, req);
    return ok({ received: true });
  });
}
