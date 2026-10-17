import Redis from "ioredis";

import { roundPosition } from "./geo";

const GEO_KEY = "yasakia:geo:active";
const DEFAULT_HEARTBEAT_TTL_S = 300; // 5 minutes

let redisClient: Redis | null = null;
let redisInitialized = false;

function getRedis(): Redis | null {
  if (redisInitialized) return redisClient;
  redisInitialized = true;
  const url = process.env.REALTIME_REDIS_URL || process.env.REDIS_URL;
  if (!url) return null;
  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    redisClient.on("error", (err) => {
      console.warn("[geo-redis] connection error:", err.message);
    });
    void redisClient.connect().catch(() => {
      // Degrades gracefully when Redis is unreachable
    });
    return redisClient;
  } catch {
    return null;
  }
}

export interface NearbyUser {
  accountId: string;
  distanceKm: number;
  lat: number;
  lng: number;
}

/**
 * Adds or updates an active user's location in the high-velocity Redis GEO index.
 * Input coordinates are rounded to ~1 km for privacy preservation.
 */
export async function recordActiveUserLocation(
  accountId: string,
  lat: number,
  lng: number,
  ttlSeconds = DEFAULT_HEARTBEAT_TTL_S,
): Promise<{ lat: number; lng: number }> {
  const rounded = roundPosition(lat, lng);
  const redis = getRedis();
  if (!redis) return { lat: rounded.lat, lng: rounded.lng };

  try {
    const pipeline = redis.pipeline();
    // GEOADD takes (key, longitude, latitude, member)
    pipeline.geoadd(GEO_KEY, rounded.lng, rounded.lat, accountId);
    pipeline.set(`yasakia:geo:hb:${accountId}`, "1", "EX", ttlSeconds);
    await pipeline.exec();
  } catch (error) {
    console.warn("[geo-redis] recordActiveUserLocation failed:", (error as Error).message);
  }
  return { lat: rounded.lat, lng: rounded.lng };
}

/**
 * Searches for nearby active users within radius using Redis GEOSEARCH.
 */
export async function findNearbyActiveUsers(
  lat: number,
  lng: number,
  radiusKm = 25,
  limit = 50,
): Promise<NearbyUser[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    // GEOSEARCH yasakia:geo:active FROMLONLAT lng lat BYRADIUS radiusKm km WITHDIST WITHCOORD COUNT limit ASC
    const raw = (await redis.call(
      "GEOSEARCH",
      GEO_KEY,
      "FROMLONLAT",
      lng,
      lat,
      "BYRADIUS",
      radiusKm,
      "km",
      "WITHDIST",
      "WITHCOORD",
      "COUNT",
      limit,
      "ASC",
    )) as Array<[string, string, [string, string]]>;

    if (!Array.isArray(raw)) return [];

    return raw.map(([id, dist, coords]) => ({
      accountId: id,
      distanceKm: parseFloat(dist),
      lng: parseFloat(coords[0]),
      lat: parseFloat(coords[1]),
    }));
  } catch (error) {
    console.warn("[geo-redis] findNearbyActiveUsers failed:", (error as Error).message);
    return [];
  }
}

/**
 * Removes an account from active proximity lookups upon logout or pause.
 */
export async function removeActiveUserLocation(accountId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.zrem(GEO_KEY, accountId);
    await redis.del(`yasakia:geo:hb:${accountId}`);
  } catch (error) {
    console.warn("[geo-redis] removeActiveUserLocation failed:", (error as Error).message);
  }
}
