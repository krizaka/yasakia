import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Product first, Orazaka as the engine (krizaka-com AGENTS.md section 2.1): on Yasakia's site the product is the
// subject of the hero, the steps and the cards. Orazaka is named only as the engine, in the stack and proof sections.
const messages = (locale: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "messages", `${locale}.json`), "utf8"));

const texts = (node: unknown): string[] => (typeof node === "string" ? [node] : node && typeof node === "object" ? Object.values(node).flatMap(texts) : []);

describe.each(["en", "fr"])("product first (%s)", (locale) => {
  const m = messages(locale);
  it("does not name Orazaka in the hero, the principles, the steps or the demo journey", () => {
    const front = [m.landing.title, m.landing.eyebrow, m.landing.lead, m.landing.features, m.landing.journey, m.landing.comparison, m.how.title, m.how.lead, m.how.steps, m.demo.journey, m.demo.journeyLead];
    for (const t of texts(front)) expect(t, t).not.toMatch(/orazaka/i);
  });
  it("keeps the engine named where it is the proof: the stack", () => {
    expect(m.how.stack.ai).toMatch(/Orazaka/);
  });
});
