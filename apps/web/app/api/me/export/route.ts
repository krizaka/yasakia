import { after, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { readExport, startExport } from "@/lib/export";
import { handle, uuidParam } from "@/lib/http";
import { limitAction } from "@/lib/rate-limit";

/**
 * Everything the account holds, as JSON — at once when it takes under a second, else 202 with an export id to poll
 * (`?id=`, kept 24 hours); `?mode=async` asks for the background build directly.
 */
export async function GET(req: Request) {
  return handle("me/export", async () => {
    const me = await requireUser(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const headers = { "Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="yazakia-export.json"' };
    if (id) {
      const stored = await readExport(me.id, uuidParam(id));
      return stored.ready
        ? NextResponse.json({ success: true, ready: true, export: stored.data }, { headers })
        : NextResponse.json({ success: true, ready: false, id: stored.id }, { status: 202, headers: { "Retry-After": "2" } });
    }
    await limitAction("export", req, me.id, { perSubject: [10, 3600] });
    const result = await startExport(me.id, { async: url.searchParams.get("mode") === "async", schedule: (task) => after(task) });
    return result.ready
      ? NextResponse.json({ success: true, ready: true, export: result.data }, { headers })
      : NextResponse.json({ success: true, ready: false, id: result.id }, { status: 202, headers: { "Retry-After": "2" } });
  });
}
