/** Addresses of the site — structure, not words (the words are in messages/). */
export const KRIZAKA_URL = "https://www.krizaka.com";
export const REPO_URL = "https://github.com/krizaka/yasakia";
export const SITE_URL = "https://dev.yasakia.com";
/** The version of this build: package.json + the short commit, injected by next.config.mjs. */
export const APP_VERSION = process.env.APP_VERSION ?? "dev";
/** The @krizaka/ui version this build runs on (next.config.mjs). */
export const APP_UI_VERSION = process.env.APP_UI_VERSION ?? "";

export const PAGES = ["home", "how-it-works", "demo"] as const;
export type PageId = (typeof PAGES)[number];

/** The address of a page in a language: English has no prefix, French lives under /fr. */
export function pagePath(locale: "en" | "fr", page: PageId): string {
  const base = locale === "en" ? "" : "/fr";
  if (page === "home") return `${base}/`;
  return `${base}/${page}/`;
}

/** Krizaka's contact form with Yasakia pre-selected. */
export const contactHref = (source: string) => `${KRIZAKA_URL}/contact?topic=yasakia&source=${encodeURIComponent(source)}`;

/** The changelog page of a language (a page of its own, outside PAGES: the bar does not list it). */
export function changelogPath(locale: "en" | "fr"): string {
  return locale === "en" ? "/changelog/" : "/fr/changelog/";
}
