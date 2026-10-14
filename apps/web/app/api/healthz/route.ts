import { checkDbHealth } from "@yasakia/db";
import { NextResponse } from "next/server";

import { realtimeConnected } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Health of this instance: the database answers (503 when it does not) and whether the realtime bus hears the other
 * instances. The platform's health check and the load balancer call it.
 */
export async function GET() {
  const database = await checkDbHealth();
  return NextResponse.json(
    { success: database, status: database ? "ok" : "degraded", database, realtime: realtimeConnected() ? "connected" : "idle", version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
