import { handle, ok, uuidParam } from "@/lib/http";
import { receiveUpload } from "@/lib/photos";

/**
 * Receives one photo's bytes at the URL `POST /api/me/photos` signed — the signature is the authorisation (one photo,
 * 300 seconds); the type must be the declared one and the size at most the declared one.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("uploads/photos", async () => {
    const url = new URL(req.url);
    await receiveUpload(uuidParam((await ctx.params).id), { expires: url.searchParams.get("expires"), signature: url.searchParams.get("signature") }, req);
    return ok({ received: true });
  });
}
