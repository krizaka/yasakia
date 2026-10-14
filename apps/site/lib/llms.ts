/* llms.txt (llmstxt.org): the site as plain text for assistants — what it is (the page's own description), its pages, the
   source, and the Krizaka family. Rendered at build. */
import { getDictionary } from "./i18n";
import { KRIZAKA_URL, pagePath, PAGES, REPO_URL, SITE_URL } from "./site";

const FAMILY = [
  ["Krizaka", KRIZAKA_URL, "the company, an open-source software studio in Montréal"],
  ["Orazaka", "https://dev.orazaka.com", "sovereign, on-premise AI orchestration"],
  ["Orochia", "https://dev.orochia.com", "an open-source video platform"],
  ["Yororis", "https://dev.yororis.com", "a listening space with a face and a voice"],
  ["Krizaka UI", "https://ui.krizaka.com", "the design system, web and native"],
  ["Krizaka Java", "https://java.krizaka.com", "the Spring Boot building blocks"],
] as const;

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

## The Krizaka family

${FAMILY.map(([name, url, line]) => `- [${name}](${url}): ${line}`).join("\n")}
- [GitHub](https://github.com/krizaka): every repository, public

Languages: English and French. Sitemap: ${SITE_URL}/sitemap.xml
`;
}
