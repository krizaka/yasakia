import { checkKey, verifyLocalMediaToken } from "@yazakia/media";
import sharp from "sharp";

import { mediaConfig } from "@/lib/env";
import { handle, HttpError } from "@/lib/http";
import { mediaSecret, mediaStorage } from "@/lib/media";

/**
 * Development storage only: serves a local photo at a URL `GET /api/photos/{id}` signed (300 seconds, one width) —
 * what Bunny's pull zone and Optimizer do in production. With STORAGE_DRIVER=bunny it does not exist (404).
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  return handle("media", async () => {
    const config = mediaConfig();
    if (config.driver !== "local") throw new HttpError(404, "Not found", { code: "NOT_FOUND" });
    let key: string;
    try {
      key = checkKey((await ctx.params).key.join("/"));
    } catch {
      throw new HttpError(404, "Not found", { code: "NOT_FOUND" });
    }
    const url = new URL(req.url);
    const width = Number(url.searchParams.get("width"));
    const ok = verifyLocalMediaToken({ key, width, expires: Number(url.searchParams.get("expires")), token: url.searchParams.get("token") ?? "", secret: mediaSecret() });
    if (!ok) throw new HttpError(403, "This media URL is not valid (expired or altered)", { code: "MEDIA_SIGNATURE" });
    const bytes = await mediaStorage(config).get(key);
    if (!bytes) throw new HttpError(404, "Not found", { code: "NOT_FOUND" });
    const body = await sharp(bytes).resize({ width, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" } });
  });
}
