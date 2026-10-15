import type { MetadataRoute } from "next";

import { indexable } from "../lib/indexing";
import { LOCALES } from "../lib/i18n";
import { pagePath, PAGES, SITE_URL } from "../lib/site";

export const dynamic = "force-static";

/* Every page in both languages, each naming the other (hreflang), dated by the build. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexable()) return [];
  const lastModified = new Date();
  return PAGES.flatMap((page) => {
    const languages = { ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${pagePath(l, page)}`])), "x-default": `${SITE_URL}${pagePath("en", page)}` };
    return LOCALES.map((l) => ({ url: `${SITE_URL}${pagePath(l, page)}`, lastModified, alternates: { languages } }));
  });
}
