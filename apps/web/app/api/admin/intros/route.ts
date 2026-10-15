import { z } from "zod";

import { listIntroOverview } from "@/lib/admin-console";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok } from "@/lib/http";

const Query = z.object({
  state: z.string().transform((s) => s.split(",").filter(Boolean).slice(0, 4)).optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(25),
});

/** The introductions overview for the console — state, dates, message counts; never who said what — filtered and paged on the server. */
export async function GET(req: Request) {
  return handle("admin/intros", async () => {
    await requireAdminActor(req);
    const query = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
    return ok({ ...(await listIntroOverview(query)), page: query.page, size: query.size });
  });
}
