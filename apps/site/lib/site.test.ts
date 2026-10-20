import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { auditLlms, auditRobots } from "../../../scripts/check-seo-family.mjs";
import robots from "../app/robots";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { llmsText } from "./llms";
import { take,TAKES } from "./media";
import { ORG_ID, pageMetadata, siteJsonLd } from "./seo";
import { contactHref, pagePath,PAGES, SITE_URL } from "./site";

const keys = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`)) : [prefix.slice(0, -1)];

describe("the public dev site", () => {
  it("serves English at the root and French under /fr, trailing slash", () => {
    expect(pagePath("en", "home")).toBe("/");
    expect(pagePath("fr", "home")).toBe("/fr/");
    expect(pagePath("en", "how-it-works")).toBe("/how-it-works/");
    expect(pagePath("fr", "demo")).toBe("/fr/demo/");
    expect(PAGES).toEqual(["home", "how-it-works", "demo"]);
  });

  it("has the same messages in both languages", () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });

  it("never offers a sign-up, a download or a store button", () => {
    const words = JSON.stringify([en, fr]).toLowerCase();
    for (const banned of ["sign up", "sign-up", "download now", "app store", "google play", "waiting list", "inscrivez", "télécharger maintenant"]) expect(words).not.toContain(banned);
  });

  it("reads the real take from the CDN only: the hero's loop and one clip per step, hashed, under the product's own folder", () => {
    expect(Object.keys(TAKES)).toEqual(["hero", "photos", "talk", "batch", "write", "media", "full"]);
    for (const id of Object.keys(TAKES) as (keyof typeof TAKES)[]) {
      for (const url of Object.values(take(id))) expect(url).toMatch(new RegExp(`^https://krizaka-assets\\.b-cdn\\.net/site/products/yasakia/tour/take-${id}\\.[0-9a-f]{10}\\.(webm|mp4|jpg)$`));
    }
  });

  it("reads its demo from the CDN only, hashed, under the product's own folder — and lazily, with a poster, never autoplaying", () => {
    // One recording of the whole run, uncut; the old loop recording (it showed a suggested first line) is gone from the page.
    for (const url of Object.values(take("full"))) expect(url).toMatch(/^https:\/\/krizaka-assets\.b-cdn\.net\/site\/products\/yasakia\/tour\/take-full\.[0-9a-f]{10}\.(webm|mp4|jpg)$/);
    const player = readFileSync(new URL("../components/CaptionedVideo.tsx", import.meta.url), "utf8");
    expect(player).toContain('preload="none"');
    expect(player).toContain("poster={poster}");
    expect(player).not.toMatch(/autoPlay/);
  });

  it("links to Krizaka's contact form with Yasakia pre-selected", () => {
    expect(contactHref("x y")).toBe("https://www.krizaka.com/contact?topic=yasakia&source=x%20y");
  });
});

describe("search engines and AI assistants (the family contract, scripts/check-seo-family.mjs)", () => {
  it("every page is canonical to itself, names both languages and carries a social image", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const page of PAGES) {
        const m = pageMetadata(locale, page);
        expect(m.alternates?.canonical).toBe(`${SITE_URL}${pagePath(locale, page)}`);
        expect(m.alternates?.languages).toMatchObject({ en: `${SITE_URL}${pagePath("en", page)}`, fr: `${SITE_URL}${pagePath("fr", page)}`, "x-default": `${SITE_URL}${pagePath("en", page)}` });
        expect(JSON.stringify(m.openGraph)).toContain(`${SITE_URL}/og.png`);
      }
    }
  });

  it("robots.txt welcomes the AI crawlers and names the sitemap", () => {
    const text = robotsText(robots());
    expect(auditRobots(text, { host: SITE_URL })).toEqual([]);
  });

  it("llms.txt follows llmstxt.org and names the publisher", () => {
    expect(auditLlms(llmsText(), { host: SITE_URL })).toEqual([]);
  });

  it("every JSON-LD node leads back to the Krizaka Organization; nothing is offered", () => {
    const graph = siteJsonLd("en")["@graph"];
    expect(graph.every((n) => (n as { publisher?: { "@id": string } }).publisher?.["@id"] === ORG_ID)).toBe(true);
    const app = graph.find((n) => n["@type"] === "SoftwareApplication") as Record<string, unknown>;
    expect(app.applicationCategory).toBe("LifestyleApplication");
    expect(app).not.toHaveProperty("offers");
    expect(app).not.toHaveProperty("downloadUrl");
  });
});

/** MetadataRoute.Robots as the text Next serves. */
function robotsText(r: ReturnType<typeof robots>): string {
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  const groups = rules.map((rule) => `User-Agent: ${rule.userAgent}\nAllow: ${rule.allow}`);
  return `${groups.join("\n\n")}\n\nSitemap: ${r.sitemap}\n`;
}

describe("the navigation of an independent product (@krizaka/ui)", () => {
  it("the bar has no family switcher and no version chip; the footer is the product's: family={false}, the DEV badge and the build, « A Krizaka product »", () => {
    const src = readFileSync(new URL("../components/SiteChrome.tsx", import.meta.url), "utf8");
    expect(src).not.toContain("NavBar.Family");
    expect(src).not.toContain("NavBar.Badge");
    expect(src).toMatch(/<FamilyFooter current="yasakia" family=\{false\}.*env="dev"/);
    expect(src).not.toMatch(/KRIZAKA_URL/);
  });
});
