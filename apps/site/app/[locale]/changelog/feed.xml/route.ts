import { changelogFeed } from "@/lib/changelog-feed";

// RSS 2.0 of the changelog, built once with the static export from the same pull requests as the page.
export const dynamic = "force-static";
export const dynamicParams = false;

/** French lives under /fr (English is the root of the site). */
export function generateStaticParams() {
  return [{ locale: "fr" }];
}

export const GET = () => changelogFeed("fr");
