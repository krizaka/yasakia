import { type MergedPull, type Release,releasesFromPulls } from "@krizaka/ui/changelog-page";

/* The changelog of Yasakia: the product publishes no release yet, so its merged pull requests are the data — one entry
   per week, conventional titles in plain language (@krizaka/ui/changelog-page), read from GitHub and refreshed hourly.
   Nothing is written by hand; when GitHub cannot be read the page says so. */

export const CHANGELOG_SOURCE = "Yasakia";
export const CHANGELOG_REPO = "krizaka/yasakia";
const API = `https://api.github.com/repos/${CHANGELOG_REPO}/pulls?state=closed&base=main&per_page=100&sort=updated&direction=desc`;

/** The weeks of merged work, newest first (empty when GitHub cannot be read). */
export async function loadReleases(): Promise<Release[]> {
  try {
    const res = await fetch(API, { headers: { Accept: "application/vnd.github+json" }, next: { revalidate: 3600 } });
    if (!res.ok) return [];
    return releasesFromPulls((await res.json()) as MergedPull[], CHANGELOG_SOURCE, `https://github.com/${CHANGELOG_REPO}/pulls?q=is%3Apr+is%3Amerged`);
  } catch {
    return [];
  }
}
