import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { faceComparisonEnabled, photoCheckConfig } from "@/lib/env";
import { handle, ok, readJson } from "@/lib/http";
import { acceptPhotoConsent, hasPhotoConsent, photoCheckView, withdrawPhotoConsent } from "@/lib/photo-check";
import { processSoon } from "@/lib/photo-check-runner";
import { PHOTO_CONSENT_VERSION } from "@/lib/photo-rules";

const Accept = z.object({ version: z.literal(PHOTO_CONSENT_VERSION) }).strict();

/** Whether the person agreed to the comparison of their photos with each other (Law 25: explicit, separate, withdrawable). */
export async function GET(req: Request) {
  return handle("me/photos/consent", async () => {
    const me = await requireUser(req);
    return ok({ consent: { version: PHOTO_CONSENT_VERSION, given: await hasPhotoConsent(me.id), comparisonAvailable: faceComparisonEnabled() } });
  });
}

/** The person agrees, to this wording (`version`), to the comparison of their photos with each other; the photos are checked again. */
export async function PUT(req: Request) {
  return handle("me/photos/consent", async () => {
    const me = await requireUser(req);
    await readJson(req, Accept);
    await acceptPhotoConsent(me.id);
    processSoon(photoCheckConfig);
    return ok({ check: await photoCheckView(me.id, faceComparisonEnabled()) });
  });
}

/** The person takes the consent back: faces are only counted from now on, and nothing was kept in any case. */
export async function DELETE(req: Request) {
  return handle("me/photos/consent", async () => {
    const me = await requireUser(req);
    await withdrawPhotoConsent(me.id);
    processSoon(photoCheckConfig);
    return ok({ check: await photoCheckView(me.id, faceComparisonEnabled()) });
  });
}
