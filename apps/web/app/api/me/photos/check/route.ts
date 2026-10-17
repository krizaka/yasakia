import { requireUser } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { photoCheckView, requestPhotoCheck } from "@/lib/photo-check";

/**
 * Where the account's photo set stands with Orazaka's check: the rules (min, max, photos with a face), each photo's kind
 * and findings, what still blocks — codes, never a score — and whether the set is `verified` (shown in batches, opens one).
 */
export async function GET(req: Request) {
  return handle("me/photos/check", async () => {
    const me = await requireUser(req);
    return ok({ check: await photoCheckView(me.id) });
  });
}

/**
 * Asks Orazaka to check the photos the account has now (idempotent: the check in progress, or the verdict of this very set,
 * is the answer). Poll `GET` until the state is no longer `CHECKING`. 30 requests an hour.
 */
export async function POST(req: Request) {
  return handle("me/photos/check", async () => {
    const me = await requireUser(req);
    return ok({ check: await requestPhotoCheck(req, me.id) }, { status: 202 });
  });
}
