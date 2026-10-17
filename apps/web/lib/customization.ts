import { db, ruleSets } from "@yasakia/db";
import { and, eq } from "drizzle-orm";
import Redis from "ioredis";
import { z } from "zod";

import { publishBroadcast } from "./realtime";

export const CustomizationConfig = z
  .object({
    theme: z
      .object({
        brandHue: z.enum(["emerald", "turquoise", "violet", "indigo", "slate", "amber"]).default("emerald"),
        accentColor: z.string().default("#10b981"),
        borderRadius: z.enum(["rounded", "cut", "pill"]).default("rounded"),
        fontDensity: z.enum(["compact", "default", "relaxed"]).default("default"),
      })
      .default({
        brandHue: "emerald",
        accentColor: "#10b981",
        borderRadius: "rounded",
        fontDensity: "default",
      }),
    branding: z
      .object({
        appName: z.string().default("Yasakia"),
        tagline: z.string().default("The dating app where you talk first"),
        logoMark: z.string().default("yasakia"),
      })
      .default({
        appName: "Yasakia",
        tagline: "The dating app where you talk first",
        logoMark: "yasakia",
      }),
    matching: z
      .object({
        defaultRadiusKm: z.number().int().min(1).max(200).default(25),
        maxRadiusKm: z.number().int().min(5).max(500).default(100),
        minAffinity: z.number().min(0).max(1).default(0.4),
        bilateralStrictness: z.number().min(0).max(1).default(0.8),
        cooldownHours: z.number().int().min(1).max(168).default(72),
        batchSize: z.number().int().min(1).max(10).default(4),
      })
      .default({
        defaultRadiusKm: 25,
        maxRadiusKm: 100,
        minAffinity: 0.4,
        bilateralStrictness: 0.8,
        cooldownHours: 72,
        batchSize: 4,
      }),
    taxonomy: z
      .object({
        interests: z.array(z.string()).default([
          "Coffee & Roasteries",
          "Vinyl & Analog Sound",
          "Bouldering & Outdoors",
          "Cinema & Independent Films",
          "Literature & Philosophy",
          "Culinary Arts",
          "Sovereign Open Source",
          "Electronic Music",
        ]),
        facets: z
          .array(
            z.object({
              key: z.string(),
              label: z.string(),
              category: z.string(),
              options: z.array(z.string()),
              multiSelect: z.boolean().default(false),
            }),
          )
          .default([
            {
              key: "social_rhythm",
              label: "Social Rhythm",
              category: "Lifestyle",
              options: ["Early Bird", "Night Owl", "Quiet Weekend", "Dynamic Explorer"],
              multiSelect: false,
            },
            {
              key: "conversation_style",
              label: "Conversation Style",
              category: "Communication",
              options: ["Deep Discussions", "Playful Banter", "Action-Oriented", "Reflective"],
              multiSelect: false,
            },
          ]),
      })
      .default({
        interests: [
          "Coffee & Roasteries",
          "Vinyl & Analog Sound",
          "Bouldering & Outdoors",
          "Cinema & Independent Films",
          "Literature & Philosophy",
          "Culinary Arts",
          "Sovereign Open Source",
          "Electronic Music",
        ],
        facets: [
          {
            key: "social_rhythm",
            label: "Social Rhythm",
            category: "Lifestyle",
            options: ["Early Bird", "Night Owl", "Quiet Weekend", "Dynamic Explorer"],
            multiSelect: false,
          },
          {
            key: "conversation_style",
            label: "Conversation Style",
            category: "Communication",
            options: ["Deep Discussions", "Playful Banter", "Action-Oriented", "Reflective"],
            multiSelect: false,
          },
        ],
      }),
    featureFlags: z
      .object({
        voiceNotesEnabled: z.boolean().default(true),
        instantMatchesEnabled: z.boolean().default(false),
        proximityAlertsEnabled: z.boolean().default(true),
        debriefRequired: z.boolean().default(true),
      })
      .default({
        voiceNotesEnabled: true,
        instantMatchesEnabled: false,
        proximityAlertsEnabled: true,
        debriefRequired: true,
      }),
  })
  .strict();

export type CustomizationConfig = z.infer<typeof CustomizationConfig>;

export const CUSTOMIZATION_DOMAIN = "CUSTOMIZATION";
const REDIS_CONFIG_KEY = "yasakia:config:customization";

let redisClient: Redis | null = null;
function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const url = process.env.REALTIME_REDIS_URL || process.env.REDIS_URL;
  if (!url) return null;
  try {
    redisClient = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false });
    void redisClient.connect().catch(() => undefined);
    return redisClient;
  } catch {
    return null;
  }
}

/**
 * Returns the active customization configuration, with Redis caching and failover to defaults.
 */
export async function getActiveCustomization(): Promise<{ version: number; config: CustomizationConfig }> {
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(REDIS_CONFIG_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as { version: number; config: CustomizationConfig };
        const valid = CustomizationConfig.safeParse(parsed.config);
        if (valid.success) return { version: parsed.version, config: valid.data };
      }
    } catch {
      // Degrade to DB
    }
  }

  const [row] = await db
    .select({ version: ruleSets.version, params: ruleSets.params })
    .from(ruleSets)
    .where(and(eq(ruleSets.domain, CUSTOMIZATION_DOMAIN), eq(ruleSets.active, true)))
    .limit(1);

  if (!row) {
    // Default version 1
    const defaultConfig = CustomizationConfig.parse({});
    return { version: 1, config: defaultConfig };
  }

  const parsed = CustomizationConfig.safeParse(row.params);
  const config = parsed.success ? parsed.data : CustomizationConfig.parse({});

  if (redis) {
    void redis.set(REDIS_CONFIG_KEY, JSON.stringify({ version: row.version, config }), "EX", 3600).catch(() => undefined);
  }

  return { version: row.version, config };
}

/**
 * Updates dynamic customization: stores a new version in `rule_sets`, caches in Redis,
 * and emits a broadcast SSE event so clients invalidate and adapt immediately.
 */
export async function updateCustomization(
  newConfig: Partial<CustomizationConfig>,
  reason: string,
): Promise<{ version: number; config: CustomizationConfig }> {
  const current = await getActiveCustomization();
  const merged = CustomizationConfig.parse({ ...current.config, ...newConfig });
  const nextVersion = current.version + 1;

  await db.transaction(async (tx) => {
    // Deactivate previous active versions
    await tx
      .update(ruleSets)
      .set({ active: false })
      .where(and(eq(ruleSets.domain, CUSTOMIZATION_DOMAIN), eq(ruleSets.active, true)));

    // Insert new active version
    await tx.insert(ruleSets).values({
      domain: CUSTOMIZATION_DOMAIN,
      version: nextVersion,
      active: true,
      params: merged as Record<string, unknown>,
      reason: reason || `Updated via Admin Studio v${nextVersion}`,
    });
  });

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(REDIS_CONFIG_KEY, JSON.stringify({ version: nextVersion, config: merged }), "EX", 3600);
    } catch (e) {
      console.warn("[customization] redis cache update failed:", (e as Error).message);
    }
  }

  // Real-time broadcast SSE invalidation to all instances and clients
  void publishBroadcast({ type: "config.updated", domain: CUSTOMIZATION_DOMAIN, version: nextVersion });

  return { version: nextVersion, config: merged };
}
