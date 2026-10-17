import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handle, ok, readJson, uuidParam } from "@/lib/http";
import { startMediaMessage } from "@/lib/intro-media";
import { limitAction } from "@/lib/rate-limit";

const Body = z
  .object({
    kind: z.enum(["PHOTO", "VIDEO", "AUDIO"]),
    contentType: z.string().min(5).max(40),
    bytes: z.number().int().min(1).max(250_000_000),
    durationMs: z.number().int().min(0).max(3_600_000).optional(),
    clientId: z.string().min(8).max(64),
  })
  .strict();

/**
 * Starts a media message — a photo, a short video or a voice message — in an introduction while it is open: declares its kind, type, size
 * and length (the limits are the MEDIA rule set's, 413 beyond), answers a signed upload URL (PUT, 300 seconds, this message only); then
 * `PUT …/complete`. Nothing is edited. The other person sees it only once it passed the safety check. 30 an hour.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("intros/media", async () => {
    const me = await requireUser(req);
    await limitAction("intro-media", req, me.id, { perSubject: [30, 3600], perIp: [90, 3600] });
    const body = await readJson(req, Body);
    return ok(await startMediaMessage(me.id, uuidParam((await ctx.params).id), body, new Date()), { status: 201 });
  });
}
