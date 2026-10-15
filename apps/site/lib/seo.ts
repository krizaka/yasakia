/* Search engines and AI assistants (the Krizaka family contract, scripts/check-seo-family.mjs): canonical, hreflang, social
   cards and the JSON-LD of the site. Structure only; the words are messages. */
import type { Metadata } from "next";

import { getDictionary, type Locale } from "./i18n";
import { indexable } from "./indexing";
import { KRIZAKA_URL, type PageId, pagePath, REPO_URL, SITE_URL } from "./site";

/** The Krizaka Organization, defined by www.krizaka.com: every JSON-LD node of the family points back to it. */
export const ORG_ID = `${KRIZAKA_URL}/#organization`;
const ORG = { "@type": "Organization", "@id": ORG_ID, name: "Krizaka", url: KRIZAKA_URL };

/** One social image for every page (app/og.png/route.tsx, a static file at build). */
export const OG_IMAGE = `${SITE_URL}/og.png`;

/** The search bots and AI crawlers the whole family welcomes — the same list on every site. */
export const CRAWLERS = [
  "Googlebot", "Google-Extended", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User",
  "Claude-SearchBot", "Claude-User", "ClaudeBot", "anthropic-ai", "Applebot", "Applebot-Extended", "CCBot",
] as const;

const url = (locale: Locale, page: PageId) => `${SITE_URL}${pagePath(locale, page)}`;

/** The metadata of one page in one language: its own canonical, both languages (hreflang, English is x-default), the cards. */
export function pageMetadata(locale: Locale, page: PageId): Metadata {
  const t = getDictionary(locale);
  const title = page === "home" ? t.meta.siteName : `${page === "how-it-works" ? t.how.title : t.demo.title} — ${t.meta.siteName}`;
  const description = t.meta.description;
  return {
    ...(indexable() ? {} : { robots: { index: false, follow: false, noarchive: true } }),
    metadataBase: new URL(SITE_URL),
    title: { absolute: title },
    description,
    alternates: { canonical: url(locale, page), languages: { en: url("en", page), fr: url("fr", page), "x-default": url("en", page) } },
    openGraph: {
      type: "website",
      siteName: t.meta.siteName,
      title,
      description,
      url: url(locale, page),
      locale: locale === "en" ? "en_CA" : "fr_CA",
      alternateLocale: locale === "en" ? "fr_CA" : "en_CA",
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: t.meta.siteName }],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
  };
}

/** The site and the application it presents, both published by the Krizaka Organization. Nothing is offered: no `offers`,
    no download, no store. */
export function siteJsonLd(locale: Locale) {
  const t = getDictionary(locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: t.meta.siteName, inLanguage: ["en", "fr"], publisher: ORG },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: t.meta.siteName,
        url: `${SITE_URL}/`,
        description: t.meta.description,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "iOS, Android",
        isAccessibleForFree: true,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        codeRepository: REPO_URL,
        publisher: ORG,
        isPartOf: { "@id": `${SITE_URL}/#website` },
      },
    ],
  };
}
