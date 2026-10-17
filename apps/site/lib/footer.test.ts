import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// One footer, one contentinfo: @krizaka/ui's SiteFooter, rendered once per view after <main>; no other footer.
const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? files(rel) : [rel];
  });
}

describe("the site renders exactly one footer per page", () => {
  it("each view ends with <SiteFooter/> once, after its <main>", () => {
    const views = read("components/views.tsx");
    const views_ = views.split(/\nexport (?:async )?function /).slice(1);
    expect(views_.length).toBeGreaterThan(0);
    for (const view of views_) {
      if (!view.includes("<main")) continue;
      expect(view.match(/<SiteFooter locale=\{locale\} \/>/g)).toHaveLength(1);
      expect(view.indexOf("</main>")).toBeLessThan(view.indexOf("<SiteFooter "));
    }
  });

  it("no other component renders a footer; the footer is the family's", () => {
    const offenders = files("components")
      .filter((f) => /\.tsx$/.test(f) && !/SiteChrome\.tsx$/.test(f))
      .filter((f) => /<footer\b|<FamilyFooter\b/.test(read(f)));
    expect(offenders).toEqual([]);
    expect(read("components/SiteChrome.tsx")).not.toMatch(/<footer\b/);
  });
});
