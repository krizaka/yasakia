import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { WHAT_WORKS } from "./what-works";

const messages = (locale: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "messages", `${locale}.json`), "utf8"));

describe("what works today (the home page)", () => {
  it("has unique ids and a known status for every item", () => {
    const ids = WHAT_WORKS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WHAT_WORKS) expect(["working", "development"]).toContain(w.status);
  });

  it("has a title and a sentence for every item, in English and French", () => {
    for (const locale of ["en", "fr"]) {
      const works = messages(locale).home.works;
      expect(works.label).toBeTruthy();
      for (const w of WHAT_WORKS) {
        expect(works.items[w.id].title, `${locale} ${w.id} title`).toBeTruthy();
        expect(works.items[w.id].text, `${locale} ${w.id} text`).toBeTruthy();
      }
    }
  });

  it("names only what the code runs: the location is rounded, the radius filters, sign-in exists", () => {
    const working = WHAT_WORKS.filter((w) => w.status === "working").map((w) => w.id);
    expect(working).toEqual(expect.arrayContaining(["talk", "portrait", "batch", "location", "radius", "signin"]));
    // What is not built says so: the answer to a batch, the debrief and the introductions.
    expect(WHAT_WORKS.filter((w) => w.status === "development").map((w) => w.id)).toEqual(["debrief", "intros"]);
    const en = messages("en").home.works.items;
    expect(en.location.text).toMatch(/1 km/);
  });
});
