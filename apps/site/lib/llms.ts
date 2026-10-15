/* llms.txt (llmstxt.org): the site as plain text for assistants — what it is (the page's own description), its pages, the
   source, and its publisher. Rendered at build. */
import { getDictionary } from "./i18n";
import { KRIZAKA_URL, pagePath, PAGES, REPO_URL, SITE_URL } from "./site";

export function llmsText(): string {
  const t = getDictionary("en");
  const pages = PAGES.map((p) => `- [${t.chrome.nav[p]}](${SITE_URL}${pagePath("en", p)}) · [${getDictionary("fr").chrome.nav[p]} (fr)](${SITE_URL}${pagePath("fr", p)})`);
  return `# ${t.meta.siteName}

> ${t.meta.description}
> A product of Krizaka (Montréal). ${t.status.text}

## Key pages

${pages.join("\n")}
- [Talk to us about Yasakia](${KRIZAKA_URL}/contact?topic=yasakia): the one way to reach the team

## Source

- [Yasakia repository](${REPO_URL}): the app, the API and the docs (Apache-2.0)

## Publisher

- [Krizaka](${KRIZAKA_URL}): the company that publishes Yasakia, an open-source software studio in Montréal

Languages: English and French. Sitemap: ${SITE_URL}/sitemap.xml
`;
}
