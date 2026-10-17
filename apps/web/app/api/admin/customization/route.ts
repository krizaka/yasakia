import { z } from "zod";

import { requireConsoleAdmin } from "@/lib/console-access";
import { CustomizationConfig, getActiveCustomization, updateCustomization } from "@/lib/customization";
import { handle, ok, readJson } from "@/lib/http";

const PutBody = z
  .object({
    config: CustomizationConfig.partial(),
    reason: z.string().min(1).max(300).default("Updated via Admin Studio"),
  })
  .strict();

/**
 * Reads the active dynamic configuration for the Admin Customization Studio.
 */
export async function GET(req: Request) {
  return handle("admin/customization", async () => {
    await requireConsoleAdmin(req);
    const active = await getActiveCustomization();
    return ok(active);
  });
}

/**
 * Updates the dynamic customization without redeploying code.
 * Propagates invalidation immediately via Redis cache & broadcast SSE.
 */
export async function PUT(req: Request) {
  return handle("admin/customization", async () => {
    await requireConsoleAdmin(req);
    const body = await readJson(req, PutBody);
    const updated = await updateCustomization(body.config, body.reason);
    return ok(updated);
  });
}
