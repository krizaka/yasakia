import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Cast, PERSONA_DOMAIN, personaEmail, personaSeedRefusal, textsToEmbed } from "./personas";

const cast = Cast.parse(JSON.parse(readFileSync(join(__dirname, "../../../packages/db/personas/montreal.json"), "utf8")));

describe("the fictional Montréal cast", () => {
  it("is valid, adults only, with one address on the persona domain each", () => {
    const year = 2026;
    for (const p of cast.personas) {
      expect(year - p.birthYear, p.slug).toBeGreaterThanOrEqual(18);
      expect(personaEmail(p.slug).endsWith(PERSONA_DOMAIN)).toBe(true);
    }
    expect(new Set(cast.personas.map((p) => p.slug)).size).toBe(cast.personas.length);
  });
  it("shows the filters at work: people who fit and people who must be refused, for each reason", () => {
    const bySlug = Object.fromEntries(cast.personas.map((p) => [p.slug, p]));
    expect(bySlug.olivier.birthYear).toBeLessThan(1980); // too old for a 32-42 range
    expect(bySlug.antoine.intent).toBe("CASUAL"); // not what a long-term wish looks for
    expect(bySlug.julien.seekingGenders).toEqual(["MAN"]); // does not look for women
    expect(bySlug.alexandre.lat).toBeGreaterThan(46); // Québec City, outside a 25 km radius
  });
  it("embeds two texts per person, in English, SELF then SEEKING, within the engine's batch limit", () => {
    const texts = textsToEmbed(cast.personas);
    expect(texts).toHaveLength(cast.personas.length * 2);
    expect(texts.length).toBeLessThanOrEqual(128);
    expect(texts[0]).toBe(cast.personas[0].portrait.selfEn);
    expect(texts[1]).toBe(cast.personas[0].portrait.seekingEn);
  });
});

describe("personaSeedRefusal", () => {
  it("allows local and dev", () => {
    expect(personaSeedRefusal({})).toBeNull();
    expect(personaSeedRefusal({ NODE_ENV: "development" })).toBeNull();
    expect(personaSeedRefusal({ NODE_ENV: "production", NEXT_PUBLIC_APP_ENV: "dev" })).toBeNull();
  });
  it("never seeds production or staging", () => {
    expect(personaSeedRefusal({ NEXT_PUBLIC_APP_ENV: "production" })).toMatch(/refused/);
    expect(personaSeedRefusal({ NEXT_PUBLIC_APP_ENV: "staging" })).toMatch(/refused/);
    expect(personaSeedRefusal({ NODE_ENV: "production" })).toMatch(/refused/);
  });
});
