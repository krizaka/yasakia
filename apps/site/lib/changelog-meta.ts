import type { Metadata } from "next";

import { getDictionary, type Locale, LOCALES } from "./i18n";
import { changelogPath, SITE_URL } from "./site";

/** The metadata of /changelog in a language: its own canonical, both languages (English is x-default), the feed. */
export function changelogMetadata(locale: Locale): Metadata {
  const c = getDictionary(locale).changelog;
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    alternates: {
      canonical: `${SITE_URL}${changelogPath(locale)}`,
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${changelogPath(l)}`])), "x-default": `${SITE_URL}${changelogPath("en")}` },
      types: { "application/rss+xml": `${changelogPath(locale)}feed.xml` },
    },
  };
}
