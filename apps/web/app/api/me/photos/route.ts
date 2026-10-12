import { MAX_PHOTO_BYTES } from "@yazakia/media";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { createPhotoUpload, listOwnPhotos, reorderPhotos } from "@/lib/photos";
import { limitAction } from "@/lib/rate-limit";

const Create = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  bytes: z.number().int().min(1).max(MAX_PHOTO_BYTES),
});

const Order = z.object({ order: z.array(z.string().uuid()).min(1).max(20) });

/** The account's own photos in their order, with status, size and blurhash — never a URL (GET /api/photos/{id} signs one). */
export async function GET(req: Request) {
  return handle("me/photos", async () => {
    const me = await requireUser(req);
    return ok({ photos: await listOwnPhotos(me.id) });
  });
}

/**
 * Starts a photo: declares its type and size and answers a signed upload URL (PUT, 300 seconds, this photo only); then
 * `PUT /api/me/photos/{id}/complete`. Six photos at most; 30 uploads an hour.
 */
export async function POST(req: Request) {
  return handle("me/photos", async () => {
    const me = await requireUser(req);
    await limitAction("photo-upload", req, me.id, { perSubject: [30, 3600], perIp: [60, 3600] });
    const body = await readJson(req, Create);
    return ok(await createPhotoUpload(me.id, body), { status: 201 });
  });
}

/** Reorders the photos: `order` lists each of the account's photos once, the first one first. */
export async function PATCH(req: Request) {
  return handle("me/photos", async () => {
    const me = await requireUser(req);
    const body = await readJson(req, Order);
    return ok({ photos: await reorderPhotos(me.id, body.order.map((id) => id.toLowerCase())) });
  });
}
