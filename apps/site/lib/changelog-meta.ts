import type { Metadata } from "next";

import type { Locale } from "./i18n";
import { pageMetadata } from "./seo";
import { changelogPath } from "./site";

/** The metadata of /changelog in a language: the site's canonical, hreflang and cards, plus the feed. */
export function changelogMetadata(locale: Locale): Metadata {
  const meta = pageMetadata(locale, "changelog");
  return { ...meta, alternates: { ...meta.alternates, types: { "application/rss+xml": `${changelogPath(locale)}feed.xml` } } };
}
