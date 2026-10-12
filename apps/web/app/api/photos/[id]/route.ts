import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { handle, uuidParam } from "@/lib/http";
import { viewPhoto } from "@/lib/photos";
import { limitAction } from "@/lib/rate-limit";

/**
 * A photo for the signed-in viewer — after the access rule (its owner; someone with the owner in a current batch; an
 * open intro), a URL signed for 300 seconds at the asked width (`?w=`, snapped to 160…1280). Anyone else: 404.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("photos", async () => {
    const me = await requireUser(req);
    await limitAction("photo-view", req, me.id, { perSubject: [600, 600] });
    const width = Number(new URL(req.url).searchParams.get("w")) || null;
    const photo = await viewPhoto(me.id, uuidParam((await ctx.params).id), width);
    return NextResponse.json({ success: true, photo }, { headers: { "Cache-Control": "private, no-store" } });
  });
}
