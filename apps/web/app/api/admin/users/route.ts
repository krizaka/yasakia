import { z } from "zod";

import { listUsers, USER_SORTS } from "@/lib/admin-users";
import { requireAdminActor } from "@/lib/console-access";
import { handle, ok } from "@/lib/http";

const list = z.string().transform((s) => s.split(",").filter(Boolean).slice(0, 10));
const Query = z.object({
  search: z.string().trim().max(100).optional(),
  status: list.optional(),
  role: list.optional(),
  sort: z.enum(USER_SORTS).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(25),
});

/** Lists accounts for the console — searched by address or name, filtered by status and role, sorted and paged on the server. */
export async function GET(req: Request) {
  return handle("admin/users", async () => {
    await requireAdminActor(req);
    const query = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
    const { rows, total } = await listUsers(query);
    return ok({ rows, total, page: query.page, size: query.size });
  });
}
