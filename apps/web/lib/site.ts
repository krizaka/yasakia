/** Addresses and dates of the web pages — structure, not words (the words are in messages/). */

export const PRODUCT_URL = "https://www.yasakia.com";
export const REPO_URL = "https://github.com/krizaka/yasakia";

/** The date and version of the legal pages; the version is the one an account accepts (lib/sign-in.ts CONSENT_VERSION). */
export const LEGAL_UPDATED = "2026-10-11";
export const LEGAL_VERSION = "2026-10";

export const LEGAL_PAGES = ["privacy", "terms", "deleteAccount"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export const LEGAL_PATHS: Record<LegalPage, string> = {
  privacy: "privacy",
  terms: "terms",
  deleteAccount: "delete-account",
};

/** Krizaka's contact form, Yasakia pre-selected, the page that sent the person named (`source`, a slug). */
export function contactHref(source: string): string {
  return `https://krizaka.com/contact?topic=yasakia&source=${encodeURIComponent(source)}`;
}
