import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FAQ_IDS, FIGURES, HOME_SECTIONS, JOURNEY_STEPS, NOT_DOING } from "./landing";

const ROOT = path.join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const messages = (locale: string) => JSON.parse(read(`messages/${locale}.json`));
const words = (node: unknown): string[] => (typeof node === "string" ? [node] : node && typeof node === "object" ? Object.values(node).flatMap(words) : []);

describe("the home is the product landing template of @krizaka/ui, at the Yomizaka level", () => {
  const home = read("components/home/HomeView.tsx");

  it("is a LandingPage: split hero with the product in a frame, a band of figures, a bento, our sections, the closing call", () => {
    expect(home).toContain('from "@krizaka/ui/landing-page"');
    for (const prop of ["eyebrow=", "visual={", "visualLabel=", "proofs={[", "features={[", "closing={{"]) expect(home).toContain(prop);
  });

  it("tells its story in this order", () => {
    expect(HOME_SECTIONS).toEqual(["hero", "features", "people", "journey", "not-doing", "comparison", "promise", "faq", "closing"]);
    const marks = ["<LandingPage", "features={[", "<RealPeople", "<PersonaTake", "<NotDoing", "<ComparisonSection", 'id="promise"', "<FaqSection", "closing={{"];
    const at = marks.map((m) => home.indexOf(m));
    expect(at.every((i) => i >= 0)).toBe(true);
    const body = at.slice(0, -1);
    expect([...body].sort((a, b) => a - b)).toEqual(body);
  });

  it("uses the family's blocks: DeviceFrame (the phone take), ComparisonTable, DecisionList, the lovebird's MascotQuote, NumberTicker", () => {
    expect(read("components/home/PersonaShowcase.tsx")).toContain("StepShowcase");
    expect(read("components/home/PersonaShowcase.tsx")).toContain('device="phone"');
    expect(read("components/home/PersonaShowcase.tsx")).toContain('"use client"'); // its « Step n of m » is a function: it cannot cross from a server component
    expect(read("components/home/HeroPhone.tsx")).toContain('kind="phone"');
    expect(read("components/home/ComparisonSection.tsx")).toContain("@krizaka/ui/comparison-table");
    expect(read("components/home/NotDoing.tsx")).toContain("@krizaka/ui/decision-list");
    expect(home).toContain("@krizaka/ui/mascot-quote");
    expect(home).toContain('bird="lovebird"');
    expect(home).toContain("<NumberTicker");
  });

  it("has one primary action in the hero and one in the closing call, and no sign-up (it is closed)", () => {
    expect((home.match(/variant="primary"/g) ?? []).length).toBe(2);
    expect(home).not.toMatch(/sign-?up|waiting list|store/i);
  });

  it("the hero's phone plays the real take (no drawn mock: no empty grey tile, no static tick), its poster painted at once", () => {
    const hero = read("components/home/HeroPhone.tsx");
    expect(home).toContain("visual={<HeroPhone");
    expect(hero).toContain("TakeVideo");
    expect(hero).toContain('take("hero", locale)');
    expect(hero).not.toMatch(/bg-accent\/25|border-dashed|CheckIcon|aspect-\[3\/4\]/);
    const video = read("components/home/TakeVideo.tsx");
    expect(video).toContain("poster={poster}"); // the first frame is the LCP, never the video
    expect(video).toContain("prefers-reduced-motion"); // still under reduced motion
    expect(video).toContain("saveData");
    expect(video).not.toContain("autoPlay");
  });
});

describe("the figures are the product's rules, never typed in a message", () => {
  it("are the photo rule (4 to 6, 2 of the face), the batch (3 to 5) and the introduction's seven days", () => {
    expect(FIGURES).toEqual({ batchMin: 3, batchMax: 5, photosMin: 4, photosMax: 6, facePhotos: 2, introDays: 7 });
  });
  it("the band reads them", () => {
    const home = read("components/home/HomeView.tsx");
    expect(home).toContain("FIGURES.batchMax");
    expect(home).toContain("FIGURES.photosMin");
    expect(home).toContain("FIGURES.introDays");
  });
});

describe.each(["en", "fr"])("the words (%s)", (locale) => {
  const m = messages(locale);
  const l = m.landing;

  it("has every section's words", () => {
    expect(JOURNEY_STEPS).toEqual(["photos", "talk", "batch", "write", "media"]);
    for (const id of JOURNEY_STEPS) expect(l.journey.steps[id].title && l.journey.steps[id].text && l.journey.steps[id].alt, id).toBeTruthy();
    expect(l.journey.play && l.journey.pause).toBeTruthy();
    // Only the words Camille really said are quoted (the run's own script); the other steps describe what the screen did.
    for (const id of ["talk"] as const) expect(l.journey.steps[id].says, id).toBeTruthy();
    for (const id of NOT_DOING) expect(l.notDoing.items[id].chose && l.notDoing.items[id].refused && l.notDoing.items[id].because && l.notDoing.items[id].cost, id).toBeTruthy();
    for (const id of FAQ_IDS) expect(l.faq.items[id].q && l.faq.items[id].a, id).toBeTruthy();
    expect(Object.keys(l.comparison.rows).length).toBeGreaterThanOrEqual(4);
  });

  it("does not name Orazaka in the hero, the features, the journey, the comparison or the promise: it is the engine, named in the proof and one FAQ answer", () => {
    const pitch = [l.eyebrow, l.title, l.lead, l.hero, l.figures, l.features, l.people.title, l.people.lead, l.people.checks, l.journey, l.notDoing, l.comparison, l.promise, m.meta.description];
    expect(words(pitch).filter((w) => /orazaka/i.test(w))).toEqual([]);
    expect(l.people.powered).toMatch(/Orazaka/);
    expect(Object.entries(l.faq.items).filter(([, v]) => /orazaka/i.test(`${(v as { q: string; a: string }).q} ${(v as { q: string; a: string }).a}`)).map(([k]) => k)).toEqual(["engine"]);
  });

  it("never promises what is not open: no sign-up, no store, no score, no ghost-writing", () => {
    const all = words(l).join(" ").toLowerCase();
    for (const banned of ["sign up", "sign-up", "download now", "app store", "google play", "waiting list", "inscrivez", "télécharger maintenant", "liste d'attente"]) expect(all).not.toContain(banned);
    expect(l.status).toBeTruthy();
  });
});

describe("Yasakia speaks to one person: « tu » in French", () => {
  it("has no « vous » in the landing's French", () => {
    // « pourquoi vous deux » speaks of the two people, not to the reader.
    const fr = words(messages("fr").landing).join(" ").replaceAll("vous deux", "");
    expect(fr).not.toMatch(/\b(vous|votre|vos)\b/i);
  });
});

describe("the closing words stay where the other pages read them", () => {
  it("keeps home.closing* for /how-it-works and /demo", () => {
    for (const locale of ["en", "fr"]) {
      const h = messages(locale).home;
      expect(h.closingTitle && h.closingLead && h.closingSource && h.ctaDemo).toBeTruthy();
    }
  });
});

describe("the responsive guard", () => {
  it("is a script that checks 360, 390, 430, 768, 1024 and 1440 px in both themes, and CI runs it on the built site", () => {
    const script = readFileSync(path.join(ROOT, "../../scripts/check-overflow.mjs"), "utf8");
    expect(script).toContain("export const WIDTHS = [360, 390, 430, 768, 1024, 1440]");
    expect(script).toContain('["dark", "light"]');
    expect(JSON.parse(readFileSync(path.join(ROOT, "../../package.json"), "utf8")).scripts["check:overflow"]).toBe("node scripts/check-overflow.mjs");
    expect(readFileSync(path.join(ROOT, "../../.github/workflows/ci.yml"), "utf8")).toContain("check:overflow");
  });
});
