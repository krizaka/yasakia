import type { MetadataRoute } from "next";

import { indexable } from "../lib/indexing";
import { CRAWLERS } from "../lib/seo";
import { SITE_URL } from "../lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  // Not indexed (dev, preview): closed, and no sitemap to advertise.
  if (!indexable()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/" }, ...CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" }))],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
