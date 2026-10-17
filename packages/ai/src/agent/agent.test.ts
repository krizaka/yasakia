import { describe, expect, it } from "vitest";

import { AiFailure } from "../provider/provider.types";
import { BatchReasons, Extraction, isSensitiveFacet, Openers, Portrait, Reasons, TurnRole } from "./agent.types";
import { firstJsonObject, parseModel } from "./parse";
import { askPrompt, extractPrompt, openerPrompt, portraitPrompt, reasonsPrompt, wrapPrompt } from "./prompts";

describe("firstJsonObject", () => {
  it("finds an object in a code fence or after a sentence, with braces inside strings", () => {
    expect(firstJsonObject('Voici:\n```json\n{"a": {"b": "}{"}, "c": [1]}\n```')).toEqual({ a: { b: "}{" }, c: [1] });
    expect(firstJsonObject("no json")).toBeNull();
    expect(firstJsonObject('{"broken": ')).toBeNull();
  });
});

describe("parseModel", () => {
  it("accepts an extraction that fits and drops what it does not say", () => {
    const ok = parseModel('{"basics":{"gender":"WOMAN","ageMin":30,"place":{"city":"Montréal","lat":45.5,"lng":-73.57}},"facets":[{"key":"story","value":"Je suis infirmière."}]}', Extraction);
    expect(ok.basics?.gender).toBe("WOMAN");
    expect(ok.facets?.[0].key).toBe("story");
  });
  it("refuses an unknown facet key, a minor's age and a value out of range — as bad_response", () => {
    for (const bad of ['{"facets":[{"key":"salary","value":"x"}]}', '{"basics":{"ageMin":16}}', '{"basics":{"place":{"city":"X","lat":200,"lng":0}}}', "not json"]) {
      expect(() => parseModel(bad, Extraction)).toThrowError(expect.objectContaining({ code: AiFailure.BadResponse }));
    }
  });
  it("requires the four portrait texts and at least one reason each way", () => {
    expect(() => parseModel('{"self":"a person who hikes a lot","seeking":"someone who listens well"}', Portrait)).toThrow();
    expect(() => parseModel('{"forYou":[],"forThem":["x is calm and curious"]}', Reasons)).toThrow();
  });
});

describe("facets", () => {
  it("seals what is sensitive: dealbreakers and beliefs, nothing else", () => {
    expect(["story", "passions", "dealbreakers", "beliefs", "seeking"].filter(isSensitiveFacet)).toEqual(["dealbreakers", "beliefs"]);
  });
});

describe("prompts", () => {
  const turns = [{ role: TurnRole.User, content: "Salut, moi c'est Camille" }];
  it("ask: speaks the person's language, carries the transcript, and says what is still missing", () => {
    const fr = askPrompt({ language: "fr", turns, known: ["story"], missingBasics: ["the city"] });
    expect(fr).toContain("French");
    expect(fr).toContain("PERSON: Salut, moi c'est Camille");
    expect(fr).toContain("Already understood: story");
    expect(fr).toContain("the city");
    expect(askPrompt({ language: "en", turns: [], known: [], missingBasics: [] })).toContain("greet the person");
  });
  it("every prompt forbids inventing, and none asks for a score", () => {
    const all = [
      askPrompt({ language: "en", turns, known: [], missingBasics: [] }),
      extractPrompt({ turns }),
      portraitPrompt({ language: "en", turns, facets: {} }),
      wrapPrompt({ language: "en", turns, portrait: { self: "s", seeking: "t" } }),
      reasonsPrompt({ language: "en", you: { name: "A", portrait: "x" }, them: [{ name: "B", portrait: "y" }] }),
    ];
    for (const p of all) expect(p).not.toMatch(/score (them|from|out of)|rate (them|from)|percent(age)? match/i);
    expect(extractPrompt({ turns })).toMatch(/never infer/i);
    expect(all[4]).toMatch(/never mention a score/i);
  });
  it("the persona never asks for contact details or anything sexual and is honest about being an AI", () => {
    const p = askPrompt({ language: "en", turns: [], known: [], missingBasics: [] });
    expect(p).toMatch(/never ask for a last name, a phone number/i);
    expect(p).toMatch(/You are an AI/);
  });
});

describe("parseModel failures", () => {
  it("say where the answer does not fit — paths and rules, never the person's words", () => {
    try {
      parseModel('{"self":"short","seeking":"someone who listens carefully","selfEn":"x","seekingEn":"y"}', Portrait);
      throw new Error("should not parse");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("self: too_small");
      expect(message).not.toContain("someone who listens carefully");
    }
    expect(() => parseModel("no braces here", Portrait)).toThrow(/no JSON object/);
  });
});

describe("the batch's reasons, one call", () => {
  it("numbers every person in the prompt and parses one entry per number", () => {
    const prompt = reasonsPrompt({ language: "fr", you: { name: "Camille", portrait: "x" }, them: [{ name: "Hugo", portrait: "a" }, { name: "Karim", portrait: "b" }] });
    expect(prompt).toContain("1. Hugo — a");
    expect(prompt).toContain("2. Karim — b");
    const ok = parseModel('{"people":[{"index":1,"forYou":["Il aime les marchés."],"forThem":["Elle aime cuisiner."]},{"index":2,"forYou":["Il cuisine bien."],"forThem":["Elle est curieuse."]}]}', BatchReasons);
    expect(ok.people.map((p) => p.index)).toEqual([1, 2]);
    expect(() => parseModel('{"people":[{"index":1,"forYou":[],"forThem":["Elle aime cuisiner."]}]}', BatchReasons)).toThrow();
  });
});

describe("the openers of an introduction, one call, each private to its person", () => {
  it("names both people, each line in its reader's language, and parses two short lines", () => {
    const prompt = openerPrompt({ first: { name: "Camille", portrait: "Elle aime les marchés.", language: "fr" }, second: { name: "Hugo", portrait: "He cooks.", language: "en" } });
    expect(prompt).toContain("FIRST is Camille");
    expect(prompt).toContain("SECOND is Hugo");
    expect(prompt).toContain('"forFirst"');
    expect(prompt).toMatch(/forFirst[^\n]*French/);
    expect(prompt).toMatch(/forSecond[^\n]*English/);
    expect(parseModel('{"forFirst":"Demande-lui sa recette préférée.","forSecond":"Ask her about Jean-Talon market."}', Openers).forFirst).toContain("recette");
    expect(() => parseModel('{"forFirst":"","forSecond":"x"}', Openers)).toThrow();
  });
});
