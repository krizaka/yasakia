import { getActiveCustomization } from "@/lib/customization";
import { handle, ok } from "@/lib/http";

/**
 * Public client configuration endpoint: returns active design tokens, branding,
 * matching thresholds, and feature flags dynamically for both Web and Mobile apps.
 */
export async function GET() {
  return handle("config/client", async () => {
    const { version, config } = await getActiveCustomization();
    return ok({
      version,
      theme: config.theme,
      branding: config.branding,
      matching: {
        defaultRadiusKm: config.matching.defaultRadiusKm,
        maxRadiusKm: config.matching.maxRadiusKm,
        batchSize: config.matching.batchSize,
      },
      taxonomy: config.taxonomy,
      featureFlags: config.featureFlags,
    });
  });
}
