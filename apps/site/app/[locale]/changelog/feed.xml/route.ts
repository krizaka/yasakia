import { changelogFeed } from "@/lib/changelog-feed";

// RSS 2.0 of the changelog, built once with the static export from the same pull requests as the page.
export const dynamic = "force-static";

export const GET = () => changelogFeed("fr");
