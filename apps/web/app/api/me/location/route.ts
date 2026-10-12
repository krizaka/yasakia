import { z } from "zod";

import { setLocation } from "@/lib/account";
import { requireUser } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";

const Body = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict();

/**
 * Sets the position from the phone's coordinates, rounded to about 1 km before it is written — the exact one is never
 * stored; the answer is what was kept.
 */
export async function PUT(req: Request) {
  return handle("me/location", async () => {
    const me = await requireUser(req);
    await limitAction("location", req, me.id, { perSubject: [60, 3600] });
    const body = await readJson(req, Body);
    return ok({ location: await setLocation(me.id, body.lat, body.lng) });
  });
}
