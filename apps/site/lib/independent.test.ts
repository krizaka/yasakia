import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { llmsText } from "./llms";

// NAV-INDEP: once deployed, Yasakia is an independent product — no link to, nor mention of, another product's domain.
// Krizaka is its publisher and appears in the footer ("A Krizaka product" -> www.krizaka.com), nothing else.
const OTHER_PRODUCTS = /(?:[a-z0-9-]+\.)*(?:orazaka|orochia|yororis)\.com/i;
const ROOT = join(__dirname, "..");

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules") continue;
      yield* walk(path);
    } else if (!/\.test\.[tj]sx?$/.test(name) && /\.(tsx?|jsx?|mjs|json|md|mdx|txt|html|css)$/.test(name)) yield path;
  }
}

describe("Yasakia's site is independent of the other products", () => {
  it("no source, message nor built page (out/) names another product's domain", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib", "messages", "out"]) {
      for (const file of walk(join(ROOT, dir))) {
        const m = readFileSync(file, "utf8").match(OTHER_PRODUCTS);
        if (m) offenders.push(`${file.replace(ROOT + "/", "")}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("llms.txt names the publisher only, no other product", () => {
    expect(llmsText()).not.toMatch(OTHER_PRODUCTS);
    expect(llmsText()).toContain("https://www.krizaka.com");
  });
});
