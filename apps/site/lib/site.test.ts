import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { clip } from "./media";
import { contactHref, pagePath,PAGES } from "./site";

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

  it("reads its demo from the CDN only, hashed", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const url of Object.values(clip(theme))) expect(url).toMatch(/^https:\/\/krizaka-assets\.b-cdn\.net\/site\/home\/kit-native\/yasakia-(dark|light)\.[0-9a-f]{10}\.(webm|mp4|jpg)$/);
    }
  });

  it("links to Krizaka's contact form with Yasakia pre-selected", () => {
    expect(contactHref("x y")).toBe("https://www.krizaka.com/contact?topic=yasakia&source=x%20y");
  });
});
