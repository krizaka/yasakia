import { changelogRss } from "@krizaka/ui/changelog-page";

import { loadReleases } from "./changelog";
import { getDictionary, type Locale } from "./i18n";
import { changelogPath, SITE_URL } from "./site";

/** The changelog as RSS 2.0, in a language. */
export async function changelogFeed(locale: Locale): Promise<Response> {
  const c = getDictionary(locale).changelog;
  const page = `${SITE_URL}${changelogPath(locale)}`;
  const xml = changelogRss({
    releases: await loadReleases(),
    title: c.feedTitle,
    description: c.feedDescription,
    siteUrl: SITE_URL,
    pageUrl: page,
    feedUrl: `${page}feed.xml`,
    language: c.langTag,
    tagLabel: c.tags,
  });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
