import { createAppConfigHandler } from "@krizaka/app-config/server";

import { appConfigStore } from "@/lib/app-config";

/**
 * `GET /api/v1/app-config?platform=ios|android&version=x.y.z` — public and cacheable (ETag, 304): the minimum and latest
 * versions, the update mode, maintenance, the contract range, texts in the app's language (krizaka/.github#75).
 */
export function GET(req: Request) {
  return createAppConfigHandler({ store: appConfigStore() })(req);
}
