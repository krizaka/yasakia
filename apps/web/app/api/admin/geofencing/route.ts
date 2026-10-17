import { db, geofenceZones } from "@yasakia/db";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { requireConsoleAdmin } from "@/lib/console-access";
import { handle, ok, readJson } from "@/lib/http";

const CreateZoneBody = z
  .object({
    name: z.string().min(2).max(80),
    slug: z.string().min(2).max(50),
    centerLat: z.number().min(-90).max(90),
    centerLng: z.number().min(-180).max(180),
    radiusKm: z.number().int().min(1).max(500).default(50),
    minAge: z.number().int().min(18).max(100).default(18),
  })
  .strict();

/**
 * Lists all administrative geofencing zones.
 */
export async function GET(req: Request) {
  return handle("admin/geofencing", async () => {
    await requireConsoleAdmin(req);
    const zones = await db.select().from(geofenceZones).orderBy(desc(geofenceZones.createdAt));
    return ok({ zones });
  });
}

/**
 * Creates a new geofenced zone.
 */
export async function POST(req: Request) {
  return handle("admin/geofencing", async () => {
    await requireConsoleAdmin(req);
    const body = await readJson(req, CreateZoneBody);
    const [zone] = await db
      .insert(geofenceZones)
      .values({
        name: body.name,
        slug: body.slug,
        centerLat: body.centerLat,
        centerLng: body.centerLng,
        radiusKm: body.radiusKm,
        minAge: body.minAge,
      })
      .returning();
    return ok({ zone });
  });
}
